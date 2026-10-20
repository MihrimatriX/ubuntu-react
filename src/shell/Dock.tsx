// Ubuntu Dock: pinned apps, then running unpinned ones, optional Trash, then "Show Applications".
// Click = open / focus / minimize (activateApp); one dot per open window; autohide reveals on edge hover.
// Panel mode spans the whole edge; with it off the dock floats, centered, with rounded corners.
import { useState, type MouseEvent } from "react";
import { appById, type AppDef } from "../apps/registry";
import { acceptsPaths, dropPaths } from "../apps/files/dnd";
import { dockThickness } from "../lib/snap";
import { TRASH, emptyTrash, trashed } from "../os/fs";
import { ICONS } from "../os/icons";
import { openPath } from "../os/launch";
import { toggle, tryFs, useOS, type MenuItem } from "../os/store";
import { focusedWindow } from "../os/windows";

const SIDE = {
  left: {
    panel: "left-0 inset-y-0 flex-col border-r",
    float: "left-1.5 inset-y-0 my-auto h-fit max-h-full flex-col rounded-2xl border",
    hidden: "-translate-x-[110%]",
    dots: "left-0.5 top-1/2 -translate-y-1/2 flex-col",
    tip: "left-full ml-3",
  },
  right: {
    panel: "right-0 inset-y-0 flex-col border-l",
    float: "right-1.5 inset-y-0 my-auto h-fit max-h-full flex-col rounded-2xl border",
    hidden: "translate-x-[110%]",
    dots: "right-0.5 top-1/2 -translate-y-1/2 flex-col",
    tip: "right-full mr-3",
  },
  bottom: {
    panel: "bottom-0 inset-x-0 flex-row border-t",
    float: "bottom-1.5 inset-x-0 mx-auto w-fit max-w-full flex-row rounded-2xl border",
    hidden: "translate-y-[110%]",
    dots: "bottom-0.5 left-1/2 -translate-x-1/2 flex-row",
    tip: "bottom-full mb-3",
  },
};

/** Opens a menu beside the clicked dock icon (the ContextMenu flips it back on screen if needed). */
function openBeside(event: MouseEvent<HTMLElement>, items: MenuItem[]) {
  const rect = event.currentTarget.getBoundingClientRect();
  const position = useOS.getState().settings.dockPosition;
  const point =
    position === "left"
      ? { clientX: rect.right + 8, clientY: rect.top }
      : position === "right"
        ? { clientX: rect.left - 8, clientY: rect.top }
        : { clientX: rect.left, clientY: rect.top - 8 };
  useOS.getState().openMenu({ ...point, preventDefault: () => event.preventDefault() }, items);
}

const togglePin = (id: string) => useOS.getState().setSetting("pinned", toggle(useOS.getState().settings.pinned, id));

function appMenu(app: AppDef, showDetails: () => void): MenuItem[] {
  const os = useOS.getState();
  const pinned = os.settings.pinned.includes(app.id);
  const windows = os.windows.filter((win) => win.appId === app.id);
  return [
    ...windows.map((win) => ({ label: win.title, action: () => os.focusWindow(win.id) })),
    ...(windows.length ? ["separator" as const] : []),
    {
      label: "New Window",
      disabled: app.singleInstance && windows.length > 0,
      action: () => os.openApp(app.id, { newWindow: true }),
    },
    "separator",
    { label: pinned ? "Unpin" : "Pin to Dash", action: () => togglePin(app.id) },
    { label: "App Details", action: showDetails },
    ...(windows.length
      ? [
          "separator" as const,
          { label: windows.length > 1 ? `Quit ${windows.length} Windows` : "Quit", action: () => os.closeApp(app.id) },
        ]
      : []),
  ];
}

function AppDetails({ app, onClose }: { app: AppDef; onClose: () => void }) {
  const pinned = useOS((state) => state.settings.pinned.includes(app.id));
  const os = useOS.getState();
  return (
    <div
      className="fixed inset-0 z-[8500] grid place-items-center bg-black/40"
      onPointerDown={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        role="dialog"
        aria-label={`${app.name} details`}
        className="anim-pop flex w-96 flex-col items-center gap-2 rounded-2xl bg-popover p-6 text-fg shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <img src={app.icon} alt="" className="size-24" />
        <h2 className="text-xl font-bold">{app.name}</h2>
        <p className="text-center text-sm text-fg-dim">{app.description}</p>
        <dl className="mt-2 grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-hover p-3 text-sm">
          <dt className="text-fg-dim">Desktop file</dt>
          <dd>{app.id}.desktop</dd>
          <dt className="text-fg-dim">Opens</dt>
          <dd className="truncate">{app.opens?.join(", ") ?? "—"}</dd>
          <dt className="text-fg-dim">Source</dt>
          <dd>Ubuntu 24.04 (built-in)</dd>
        </dl>
        <div className="mt-3 flex w-full gap-2 [&>*]:flex-1">
          <button className="btn" onClick={() => togglePin(app.id)}>
            {pinned ? "Unpin" : "Pin to Dash"}
          </button>
          <button
            autoFocus
            className="btn btn-accent"
            onClick={() => {
              onClose();
              os.openApp(app.id);
            }}
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
}

export function Dock() {
  const { dockPosition, dockIconSize, dockAutohide, dockPanel, dockTrash, pinned } = useOS((state) => state.settings);
  const windows = useOS((state) => state.windows);
  const trashFull = trashed(useOS((state) => state.fs)).length > 0; // in render, not a selector: selectors rerun on every store change
  const focusedApp = useOS((state) => focusedWindow(state)?.appId);
  const overlay = useOS((state) => state.overlay);
  const [details, setDetails] = useState<AppDef | null>(null);
  const os = useOS.getState();
  const running = [...new Set(windows.map((win) => win.appId))];
  const apps = [...pinned, ...running.filter((id) => !pinned.includes(id))]
    .map(appById)
    .filter((app) => app !== undefined);
  const side = SIDE[dockPosition];
  const thickness = dockThickness(dockIconSize);
  const vertical = dockPosition !== "bottom";
  const hidden = dockAutohide && overlay === "none";
  const cell = { width: dockIconSize + 4, height: dockIconSize + 4 };
  const tooltip = (label: string) => (
    <span
      className={`pointer-events-none absolute whitespace-nowrap rounded-lg bg-[#2b2b2b] px-3 py-1.5 text-sm text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 ${side.tip}`}
    >
      {label}
    </span>
  );

  return (
    <nav
      aria-label="Dock"
      className="group/dock fixed z-[5000]"
      style={
        vertical
          ? { [dockPosition]: 0, top: 32, bottom: 0, width: hidden ? 6 : thickness }
          : { left: 0, right: 0, bottom: 0, height: hidden ? 6 : thickness }
      }
    >
      <div
        className={`absolute flex items-center gap-1.5 border-white/10 bg-[#1d1d1d]/80 p-2.5 backdrop-blur-xl transition-transform duration-200 ${dockPanel ? side.panel : side.float} ${
          hidden ? `${side.hidden} group-hover/dock:translate-x-0 group-hover/dock:translate-y-0` : ""
        }`}
        style={
          vertical
            ? { width: dockPanel ? thickness : thickness - 6 }
            : { height: dockPanel ? thickness : thickness - 6 }
        }
      >
        {apps.map((app) => {
          const count = windows.filter((win) => win.appId === app.id).length;
          return (
            <button
              key={app.id}
              data-dock-app={app.id}
              aria-label={app.name}
              style={cell}
              className={`group relative grid shrink-0 place-items-center rounded-xl hover:bg-white/10 ${focusedApp === app.id ? "bg-white/15" : ""}`}
              onClick={() => os.activateApp(app.id)}
              onContextMenu={(e) =>
                openBeside(
                  e,
                  appMenu(app, () => setDetails(app)),
                )
              }
            >
              <img src={app.icon} alt="" draggable={false} style={{ width: dockIconSize - 4 }} />
              <span className={`absolute flex gap-0.5 ${side.dots}`}>
                {Array.from({ length: Math.min(count, 4) }, (_, index) => (
                  <i
                    key={index}
                    className={`block size-1 rounded-full ${focusedApp === app.id ? "bg-accent" : "bg-white/70"}`}
                  />
                ))}
              </span>
              {tooltip(app.name)}
            </button>
          );
        })}
        {dockPanel && <div className="flex-1" />}
        {dockTrash && (
          <button
            aria-label="Trash"
            style={cell}
            className={`group relative grid shrink-0 place-items-center rounded-xl hover:bg-white/10 ${vertical ? "border-t" : "border-l"} border-white/10`}
            onClick={() => openPath(TRASH)}
            onDragOver={(e) => acceptsPaths(e) && e.preventDefault()}
            onDrop={(e) => dropPaths(e, TRASH)}
            onContextMenu={(e) =>
              openBeside(e, [
                { label: "Open", action: () => openPath(TRASH) },
                { label: "Empty Trash", disabled: !trashFull, action: () => tryFs(emptyTrash) },
              ])
            }
          >
            <img
              src={trashFull ? ICONS["trash-full"] : ICONS.trash}
              alt=""
              draggable={false}
              style={{ width: dockIconSize - 4 }}
            />
            {tooltip("Trash")}
          </button>
        )}
        <button
          aria-label="Show Applications"
          title="Show Applications"
          style={cell}
          className={`grid shrink-0 place-items-center rounded-xl hover:bg-white/10 ${overlay === "grid" ? "bg-white/15" : ""}`}
          onClick={() => os.setOverlay(overlay === "grid" ? "none" : "grid")}
        >
          <span className="grid grid-cols-3 gap-1">
            {Array.from({ length: 9 }, (_, index) => (
              <i key={index} className="block size-1.5 rounded-full bg-white" />
            ))}
          </span>
        </button>
      </div>
      {details && <AppDetails app={details} onClose={() => setDetails(null)} />}
    </nav>
  );
}
