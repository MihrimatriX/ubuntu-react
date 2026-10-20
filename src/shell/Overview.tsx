// Activities Overview. The live windows themselves are scaled into a grid (see Window + overviewLayout);
// this file draws what surrounds them: the dimmed backdrop with the workspace card, the workspace strip
// (click to switch, drop a window to move it) and the search, which matches app names/keywords and VFS
// file names. Typing anywhere in the Overview starts a search; Enter opens the first result.
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { APPS, type AppDef } from "../apps/registry";
import type { Rect } from "../lib/snap";
import { HOME, basename, type Fs } from "../os/fs";
import { fileIcon } from "../os/icons";
import { openPath } from "../os/launch";
import { useOS } from "../os/store";
import { useWorkArea } from "../os/useDragResize";
import { workspaceCount } from "../os/windows";

const RESULT_LIMIT = 8;

/** The rect inside which Overview lays out the current workspace's windows. */
export const overviewCard = (area: Rect): Rect => ({
  x: area.x + 48,
  y: area.y + 160,
  w: area.w - 96,
  h: area.h - 200,
});

export function searchAll(query: string, apps: AppDef[], fs: Fs): { apps: AppDef[]; files: string[] } {
  const needle = query.trim().toLowerCase();
  if (!needle) return { apps: [], files: [] };
  return {
    apps: apps.filter((app) => `${app.name} ${app.description} ${app.keywords ?? ""}`.toLowerCase().includes(needle)),
    files: Object.keys(fs)
      .filter(
        (path) => path.startsWith(`${HOME}/`) && !path.includes("/.") && basename(path).toLowerCase().includes(needle),
      )
      .sort((a, b) => a.length - b.length)
      .slice(0, RESULT_LIMIT),
  };
}

/** Arrow keys move focus between the result buttons (Enter then activates the focused one natively). */
function walkResults(event: React.KeyboardEvent<HTMLElement>) {
  const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
  if (!step) return;
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  buttons[Math.min(Math.max(index + step, 0), buttons.length - 1)]?.focus();
  event.preventDefault();
}

export function SearchResults({ query, onDone }: { query: string; onDone: () => void }) {
  const fs = useOS((state) => state.fs);
  const results = searchAll(query, APPS, fs);
  const launch = (run: () => void) => () => {
    onDone();
    run();
  };
  if (!results.apps.length && !results.files.length)
    return <p className="mt-16 text-center text-lg text-white/60">No Results</p>;
  return (
    <div data-results className="mx-auto mt-6 flex w-[min(720px,90%)] flex-col gap-4" onKeyDown={walkResults}>
      {results.apps.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-2xl bg-white/10 p-3">
          {results.apps.map((app) => (
            <button
              key={app.id}
              onClick={launch(() => useOS.getState().openApp(app.id))}
              className="flex w-24 flex-col items-center gap-1 rounded-xl p-2 text-sm hover:bg-white/15"
            >
              <img src={app.icon} alt="" className="size-14" />
              {app.name}
            </button>
          ))}
        </div>
      )}
      {results.files.length > 0 && (
        <div className="flex flex-col rounded-2xl bg-white/10 p-2">
          <span className="px-2 pb-1 text-xs font-bold text-white/60">Files</span>
          {results.files.map((path) => (
            <button
              key={path}
              onClick={launch(() => openPath(path))}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/15"
            >
              <img src={fileIcon(path, fs[path]!)} alt="" className="size-8 object-contain" />
              <span className="flex-1 truncate">{basename(path)}</span>
              <span className="truncate text-xs text-white/50">{path.replace(HOME, "~")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Enter in a search field opens the first result of the same search. */
function openFirstResult(query: string) {
  const results = searchAll(query, APPS, useOS.getState().fs);
  if (results.apps[0]) useOS.getState().openApp(results.apps[0].id);
  else if (results.files[0]) openPath(results.files[0]);
  else return false;
  return true;
}

export function SearchField({
  query,
  setQuery,
  onDone,
}: {
  query: string;
  setQuery: (query: string) => void;
  onDone: () => void;
}) {
  return (
    <label className="mx-auto flex h-10 w-80 items-center gap-2 rounded-full bg-white/15 px-4 text-white focus-within:bg-white/25">
      <Search className="size-4 opacity-70" />
      <input
        autoFocus
        value={query}
        placeholder="Type to search"
        aria-label="Search"
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/60"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && openFirstResult(query)) onDone();
          if (e.key === "ArrowDown") document.querySelector<HTMLButtonElement>("[data-results] button")?.focus();
        }}
      />
    </label>
  );
}

export function OverviewBackdrop() {
  const overlay = useOS((state) => state.overlay);
  const wallpaper = useOS((state) => state.settings.wallpaper);
  const area = useWorkArea();
  const card = overviewCard(area);
  return (
    <div
      className={`absolute inset-0 bg-[#1d1d1d] transition-opacity duration-250 ${overlay === "overview" ? "opacity-100" : "pointer-events-none opacity-0"}`}
      onClick={() => useOS.getState().setOverlay("none")}
    >
      <div
        className="absolute rounded-2xl bg-cover bg-center shadow-2xl"
        style={{
          left: card.x - 24,
          top: card.y - 24,
          width: card.w + 48,
          height: card.h + 48,
          backgroundImage: `url("${wallpaper}")`,
        }}
      />
    </div>
  );
}

function WorkspaceStrip() {
  const windows = useOS((state) => state.windows);
  const active = useOS((state) => state.workspace);
  const count = useOS(workspaceCount);
  const wallpaper = useOS((state) => state.settings.wallpaper);
  const os = useOS.getState();
  return (
    <div className="flex justify-center gap-3" role="listbox" aria-label="Workspaces">
      {Array.from({ length: count }, (_, index) => (
        <button
          key={index}
          role="option"
          aria-selected={index === active}
          aria-label={`Workspace ${index + 1}`}
          onClick={() => os.switchWorkspace(index)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const id = e.dataTransfer.getData("application/x-window");
            if (id) os.moveToWorkspace(id, index);
          }}
          className={`relative h-20 w-36 overflow-hidden rounded-lg bg-cover bg-center ${index === active ? "ring-2 ring-white" : "opacity-70 hover:opacity-100"}`}
          style={{ backgroundImage: `url("${wallpaper}")` }}
        >
          {windows
            .filter((win) => win.workspace === index && !win.minimized)
            .map((win) => (
              <span
                key={win.id}
                className="absolute rounded-sm border border-white/50 bg-white/40"
                style={{
                  left: `${(win.rect.x / innerWidth) * 100}%`,
                  top: `${(win.rect.y / innerHeight) * 100}%`,
                  width: `${(win.rect.w / innerWidth) * 100}%`,
                  height: `${(win.rect.h / innerHeight) * 100}%`,
                }}
              />
            ))}
        </button>
      ))}
    </div>
  );
}

export function Overview() {
  const overlay = useOS((state) => state.overlay);
  const [query, setQuery] = useState("");
  const close = () => useOS.getState().setOverlay("none");

  useEffect(() => {
    setQuery("");
  }, [overlay]);
  useEffect(() => {
    if (overlay !== "overview") return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && (query ? setQuery("") : close());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, query]);

  if (overlay !== "overview") return null;
  return (
    <div
      className={`anim-pop pointer-events-none absolute inset-x-0 bottom-0 top-8 z-[4000] text-white ${query ? "pointer-events-auto bg-[#1d1d1d]/95" : ""}`}
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="pointer-events-auto mt-4 flex flex-col gap-4">
        <SearchField query={query} setQuery={setQuery} onDone={close} />
        {!query && <WorkspaceStrip />}
      </div>
      {query && <SearchResults query={query} onDone={close} />}
    </div>
  );
}
