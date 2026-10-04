// Keyboard-driven popups. Alt+Tab: an icon strip of this workspace's windows in most-recently-used order;
// keyboard.ts moves the selection and releasing Alt focuses it. OSD: the volume/brightness level pill.
import { Sun, Volume2, VolumeX } from "lucide-react";
import { appById } from "../apps/registry";
import { switcherWindows } from "../os/keyboard";
import { useOS } from "../os/store";

/** GNOME OSD: a pill near the bottom with an icon and a level bar, shown by the volume/brightness keys. */
export function Osd() {
  const osd = useOS((state) => state.osd);
  if (!osd) return null;
  const icon = osd.kind === "brightness" ? <Sun /> : osd.value ? <Volume2 /> : <VolumeX />;
  return (
    <div role="status" aria-label={`${osd.kind} ${osd.value}%`} className="anim-pop pointer-events-none fixed bottom-24 left-1/2 z-[7000] flex w-72 -translate-x-1/2 items-center gap-4 rounded-full bg-[#2b2b2b]/95 px-5 py-4 text-white shadow-2xl [&>svg]:size-5">
      {icon}
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20"><span className="block h-full rounded-full bg-white" style={{ width: `${osd.value}%` }} /></span>
    </div>
  );
}

export function AltTab() {
  const selected = useOS((state) => state.switcher);
  useOS((state) => state.windows); // re-render when windows change
  if (selected === null) return null;
  const windows = switcherWindows();
  const current = windows[selected];
  return (
    <div className="pointer-events-none fixed inset-0 z-[7000] grid place-items-center">
      <div role="listbox" aria-label="Switch windows" className="anim-pop pointer-events-auto flex max-w-[90vw] flex-col items-center gap-3 rounded-3xl bg-[#2b2b2b]/95 p-4 text-white shadow-2xl">
        <div className="flex gap-2 overflow-x-auto">
          {windows.map((win, index) => (
            <button key={win.id} role="option" aria-selected={index === selected} aria-label={win.title}
              onClick={() => { useOS.getState().setSwitcher(null); useOS.getState().focusWindow(win.id); }}
              className={`grid size-24 place-items-center rounded-2xl ${index === selected ? "bg-white/20" : "hover:bg-white/10"}`}>
              <img src={appById(win.appId)?.icon} alt="" className="size-16" />
            </button>
          ))}
        </div>
        <span className="max-w-96 truncate text-sm">{current?.title ?? "No windows"}</span>
      </div>
    </div>
  );
}
