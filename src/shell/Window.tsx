// A libadwaita-style window frame. Position is applied imperatively in a layout effect (so the drag hook's
// transform and the committed rect switch in the same frame); minimizing only hides + scales toward the
// dock icon, the app stays mounted. Apps put widgets into the header bar through <HeaderSlot>.
// memo + narrow selectors: a window re-renders only when its own Win object, focus or Overview slot changes.
import { memo, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { appById } from "../apps/registry";
import { overviewLayout, snapRect, type Edge, type Rect } from "../lib/snap";
import { useOS, type MenuItem } from "../os/store";
import { applyRect, CONTROLS, useDragResize, useViewport, useWorkArea, type Zone } from "../os/useDragResize";
import { focusedWindow, workspaceCount, type Win } from "../os/windows";
import { AppErrorBoundary, Dialog, saveHandlers } from "./chrome";
import { overviewCard } from "./Overview";

const ABOVE = 1_000_000; // "Always on Top" windows sit above every normal window
const EDGES: [Edge, string][] = [
  ["n", "top-0 inset-x-3 h-1.5 cursor-n-resize"],
  ["s", "bottom-0 inset-x-3 h-1.5 cursor-s-resize"],
  ["w", "left-0 inset-y-3 w-1.5 cursor-w-resize"],
  ["e", "right-0 inset-y-3 w-1.5 cursor-e-resize"],
  ["nw", "top-0 left-0 size-3 cursor-nw-resize"],
  ["ne", "top-0 right-0 size-3 cursor-ne-resize"],
  ["sw", "bottom-0 left-0 size-3 cursor-sw-resize"],
  ["se", "bottom-0 right-0 size-3 cursor-se-resize"],
];

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-6 place-items-center rounded-full bg-hover text-fg hover:bg-fg/20 [&>svg]:size-3.5"
    >
      {children}
    </button>
  );
}

/** Mutter's title-bar menu. */
function windowMenu(win: Win): MenuItem[] {
  const os = useOS.getState();
  const last = workspaceCount(os) - 1;
  const move = (target: number) => () => {
    os.moveToWorkspace(win.id, target);
    os.switchWorkspace(target);
  };
  return [
    { label: "Minimize", action: () => os.minimizeWindow(win.id) },
    { label: win.state === "max" ? "Unmaximize" : "Maximize", action: () => os.toggleMaximize(win.id) },
    "separator",
    { label: "Always on Top", checked: !!win.above, action: () => os.patchWindow(win.id, { above: !win.above }) },
    { label: "Move to Workspace Left", disabled: win.workspace === 0, action: move(win.workspace - 1) },
    { label: "Move to Workspace Right", disabled: win.workspace >= last, action: move(win.workspace + 1) },
    "separator",
    { label: "Close", shortcut: "Alt+F4", action: () => os.requestClose(win.id) },
  ];
}

export const Window = memo(function Window({ win }: { win: Win }) {
  const app = appById(win.appId)!;
  const os = useOS.getState();
  const focused = useOS((state) => focusedWindow(state)?.id === win.id);
  const area = useWorkArea();
  const view = useViewport();
  const ref = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<Zone>(null);
  const displayed = snapRect(win.state, area, win.rect);

  const { startDrag, startResize } = useDragResize(ref, {
    displayed,
    normal: win.rect,
    state: win.state,
    area,
    min: app.minSize ?? { w: 300, h: 200 },
    onMove: (rect) => os.moveWindow(win.id, rect),
    onSnap: (zone) => os.snapWindow(win.id, zone),
    onPreview: setPreview,
  });

  const offsetX = win.workspace * view.w; // windows layer is translated by -activeWorkspace * view.w
  const target = useOverviewTarget(win, area);
  const scale = target ? target.w / displayed.w : 1;
  const zIndex = (win.above ? ABOVE : 0) + win.z * 2;

  useLayoutEffect(() => {
    const el = ref.current;
    const gesture = el?.dataset.gesture;
    if (!el || gesture === "drag" || gesture === "resize") return;
    applyRect(el, displayed, offsetX);
    if (target)
      el.style.transform = `translate(${target.x - displayed.x}px, ${target.y - displayed.y}px) scale(${scale})`;
  });

  // Raising a window (dock, Alt+Tab, Overview) also moves keyboard focus into it, like a real compositor.
  useEffect(() => {
    const el = ref.current;
    if (!focused || !el || el.contains(document.activeElement)) return;
    el.querySelector<HTMLElement>("main textarea, main [contenteditable=true], main [tabindex='0'], main input")?.focus(
      { preventScroll: true },
    );
  }, [focused]);

  const origin = minimizeOrigin(win.appId, displayed.x, displayed.y);
  return (
    <>
      <div
        ref={ref}
        role="dialog"
        aria-label={win.title}
        data-window={win.id}
        className="absolute flex origin-top-left [&:not([data-gesture])]:transition-[left,top,width,height,transform] [&:not([data-gesture])]:duration-250"
        style={{ zIndex, pointerEvents: win.minimized ? "none" : "auto" }}
        onPointerDownCapture={() => !focused && os.focusWindow(win.id)}
      >
        <div
          className={`anim-open flex min-w-0 flex-1 flex-col overflow-hidden bg-window text-fg ${win.state === "normal" ? "rounded-xl" : ""} ${
            focused
              ? "shadow-[0_8px_32px_rgb(0_0_0/0.45),0_0_0_1px_rgb(0_0_0/0.25)]"
              : "shadow-[0_2px_12px_rgb(0_0_0/0.3),0_0_0_1px_rgb(0_0_0/0.2)]"
          }`}
          style={{
            transformOrigin: `${origin.x}px ${origin.y}px`,
            transform: win.minimized ? "scale(0.05)" : undefined,
            opacity: win.minimized ? 0 : 1,
            visibility: win.minimized ? "hidden" : "visible",
            transition: `transform 250ms ease-out, opacity 250ms ease-out, visibility 0s ${win.minimized ? "250ms" : "0s"}`,
          }}
        >
          <header
            onPointerDown={startDrag}
            onContextMenu={(e) => !(e.target as HTMLElement).closest(CONTROLS) && os.openMenu(e, windowMenu(win))}
            onDoubleClick={(e) => !(e.target as HTMLElement).closest(CONTROLS) && os.toggleMaximize(win.id)}
            className="relative flex h-[46px] shrink-0 touch-none items-center gap-1 border-b border-line bg-header px-1.5"
          >
            <div
              id={`hdr-start-${win.id}`}
              className={`z-10 flex items-center gap-1 ${app.hideTitle ? "min-w-0 flex-1" : ""}`}
            />
            {!app.hideTitle && (
              <>
                <div
                  id={`hdr-center-${win.id}`}
                  className="hdr-center absolute inset-x-0 mx-auto flex w-fit max-w-[55%] justify-center"
                />
                <h2
                  className={`pointer-events-none absolute inset-x-28 truncate text-center text-sm font-bold ${focused ? "" : "opacity-60"}`}
                >
                  {win.dirty ? "• " : ""}
                  {win.title}
                </h2>
                <div className="flex-1" />
              </>
            )}
            <div id={`hdr-end-${win.id}`} className="z-10 flex items-center gap-1" />
            <div className="z-10 ml-2 flex gap-3 pr-1.5">
              <ControlButton label="Minimize" onClick={() => os.minimizeWindow(win.id)}>
                <Minus />
              </ControlButton>
              <ControlButton
                label={win.state === "max" ? "Restore" : "Maximize"}
                onClick={() => os.toggleMaximize(win.id)}
              >
                {win.state === "max" ? <Copy /> : <Square />}
              </ControlButton>
              <ControlButton label="Close" onClick={() => os.requestClose(win.id)}>
                <X />
              </ControlButton>
            </div>
          </header>
          <main className="relative min-h-0 flex-1 overflow-hidden">
            <AppErrorBoundary name={app.name} onClose={() => os.closeWindow(win.id)}>
              <Suspense fallback={null}>
                <app.component windowId={win.id} filePath={win.filePath} args={win.args} />
              </Suspense>
            </AppErrorBoundary>
            {win.confirmClose && <ConfirmClose win={win} />}
          </main>
        </div>
        {target && (
          <div
            role="button"
            aria-label={`Activate ${win.title}`}
            draggable
            className="group absolute inset-0 z-50 cursor-pointer rounded-xl hover:ring-[6px] hover:ring-white/50"
            onDragStart={(e) => e.dataTransfer.setData("application/x-window", win.id)}
            onClick={() => {
              os.focusWindow(win.id);
              os.setOverlay("none");
            }}
          >
            <button
              aria-label="Close"
              className="absolute right-0 top-0 hidden size-8 place-items-center rounded-full bg-[#3a3a3a] text-white group-hover:grid"
              style={{ transform: `translate(40%, -40%) scale(${1 / scale})` }}
              onClick={(e) => {
                e.stopPropagation();
                os.requestClose(win.id);
              }}
            >
              <X className="size-4" />
            </button>
            <img
              src={app.icon}
              alt=""
              className="absolute bottom-0 left-1/2 size-12"
              style={{ transform: `translate(-50%, 50%) scale(${1 / scale})` }}
            />
          </div>
        )}
        {win.state === "normal" &&
          !target &&
          EDGES.map(([edge, className]) => (
            <div key={edge} className={`absolute ${className}`} onPointerDown={(e) => startResize(edge, e)} />
          ))}
      </div>
      {preview && (
        <div
          className="anim-pop pointer-events-none absolute rounded-xl border border-white/30 bg-white/15 backdrop-blur-sm"
          style={{ ...toStyle(snapRect(preview, area, win.rect), offsetX), zIndex: zIndex - 1 }}
        />
      )}
    </>
  );
});

/** This window's slot in the Overview grid, or null. useShallow compares the {x,y,w,h} fields, not the reference. */
const useOverviewTarget = (win: Win, area: Rect): Rect | null =>
  useOS(
    useShallow(({ overlay, windows, workspace }) => {
      if (overlay !== "overview" || win.minimized || win.workspace !== workspace) return null;
      const shown = windows.filter((other) => !other.minimized && other.workspace === workspace);
      const rects = overviewLayout(
        shown.map((other) => snapRect(other.state, area, other.rect)),
        overviewCard(area),
      );
      return rects[shown.findIndex((other) => other.id === win.id)] ?? null;
    }),
  );

const toStyle = (rect: Rect, offsetX: number) => ({
  left: rect.x + offsetX,
  top: rect.y,
  width: rect.w,
  height: rect.h,
});

/** Point (relative to the window) of this app's dock icon, so minimizing shrinks toward it. */
function minimizeOrigin(appId: string, x: number, y: number) {
  const icon = document.querySelector(`[data-dock-app="${appId}"]`)?.getBoundingClientRect();
  return icon ? { x: icon.x + icon.width / 2 - x, y: icon.y + icon.height / 2 - y } : { x: 0, y: 0 };
}

function ConfirmClose({ win }: { win: Win }) {
  const os = useOS.getState();
  return (
    <Dialog
      title="Save Changes?"
      body="Open documents contain unsaved changes. Changes which are not saved will be permanently lost."
      onCancel={() => os.patchWindow(win.id, { confirmClose: false })}
      actions={[
        { label: "Discard", style: "danger", run: () => os.closeWindow(win.id) },
        { label: "Save", style: "accent", run: () => saveHandlers.get(win.id)?.() && os.closeWindow(win.id) },
      ]}
    />
  );
}
