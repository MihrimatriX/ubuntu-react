// The logged-in session: wallpaper + desktop icons, the window layer (translated per workspace so switching
// slides), top bar, dock and global overlays. Brightness and Night Light are pointer-transparent overlays.
import { useEffect } from "react";
import { APPS } from "../apps/registry";
import { basename } from "../os/fs";
import { openPath } from "../os/launch";
import { useOS } from "../os/store";
import { useGlobalKeyboard } from "../os/keyboard";
import { AltTab, Osd } from "./AltTab";
import { AppGrid } from "./AppGrid";
import { ContextMenu } from "./ContextMenu";
import { DesktopIcons } from "./DesktopIcons";
import { Dock } from "./Dock";
import { Notifications } from "./Notifications";
import { Overview, OverviewBackdrop } from "./Overview";
import { TopBar } from "./TopBar";
import { Window } from "./Window";

function OpenWith() {
  const path = useOS((state) => state.openWith);
  const close = () => useOS.getState().setOpenWith(null);
  if (!path) return null;
  return (
    <div
      className="fixed inset-0 z-[8500] grid place-items-center bg-black/40"
      onPointerDown={close}
      onKeyDown={(e) => e.key === "Escape" && close()}
    >
      <div
        role="dialog"
        aria-label="Open With"
        className="anim-pop w-96 rounded-2xl bg-popover p-4 text-fg shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <h3 className="text-center font-bold">Open “{basename(path)}”</h3>
        <p className="mb-3 text-center text-sm text-fg-dim">Choose an application</p>
        <div className="flex max-h-80 flex-col overflow-y-auto">
          {APPS.map((app, index) => (
            <button
              key={app.id}
              autoFocus={index === 0}
              className="flex items-center gap-3 rounded-lg p-2 text-left hover:bg-hover focus:bg-hover"
              onClick={() => {
                close();
                openPath(path, app.id);
              }}
            >
              <img src={app.icon} alt="" className="size-8" />
              {app.name}
            </button>
          ))}
        </div>
        <button className="btn mt-3 w-full" onClick={close}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Locks the screen after Settings › Power › Screen Blank minutes without pointer or keyboard input. */
function useIdleLock(enabled: boolean) {
  const minutes = useOS((state) => state.settings.blankMinutes);
  useEffect(() => {
    if (!enabled || !minutes) return;
    let timer = setTimeout(lock, minutes * 60_000);
    function lock() {
      useOS.getState().setLocked(true);
    }
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(lock, minutes * 60_000);
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel"];
    events.forEach((type) => window.addEventListener(type, reset, true));
    return () => {
      clearTimeout(timer);
      events.forEach((type) => window.removeEventListener(type, reset, true));
    };
  }, [enabled, minutes]);
}

export function Desktop() {
  const wallpaper = useOS((state) => state.settings.wallpaper);
  const brightness = useOS((state) => state.settings.brightness);
  const nightLight = useOS((state) => state.settings.nightLight);
  const windows = useOS((state) => state.windows);
  const workspace = useOS((state) => state.workspace);
  const locked = useOS((state) => state.locked);
  useGlobalKeyboard(!locked);
  useIdleLock(!locked);

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black bg-cover bg-center"
      style={{ backgroundImage: `url("${wallpaper}")` }}
    >
      <DesktopIcons />
      <OverviewBackdrop />
      <div
        className="pointer-events-none absolute inset-0 transition-transform duration-250 ease-out"
        style={{ transform: `translateX(${-workspace * 100}vw)` }}
      >
        {windows.map((win) => (
          <Window key={win.id} win={win} />
        ))}
      </div>
      <Overview />
      <AppGrid />
      <TopBar />
      <Dock />
      <AltTab />
      <Osd />
      <Notifications />
      <OpenWith />
      <ContextMenu />
      {nightLight && (
        <div className="pointer-events-none fixed inset-0 z-[9500] bg-[#ff9329] opacity-20 mix-blend-multiply" />
      )}
      <div
        className="pointer-events-none fixed inset-0 z-[9500] bg-black"
        style={{ opacity: (1 - brightness / 100) * 0.8 }}
      />
    </div>
  );
}
