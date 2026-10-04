// Desktop icons (DING-style): Home, Trash and ~/Desktop entries on a column-major grid. Click/Ctrl+click and
// a rubber band on empty space select; the selection drags as a group (snapped to free cells, or dropped on
// Trash/a folder) and opens by double-click/Enter. The first drag freezes the whole layout into iconPositions
// so other icons don't reflow; new files take the first free cell.
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { HOME, TRASH, basename, emptyTrash, list, mv, trash, trashed } from "../os/fs";
import { ICONS, fileIcon } from "../os/icons";
import { createIn, openPath, pasteInto } from "../os/launch";
import { tryFs, useOS, type MenuItem } from "../os/store";
import { track, useWorkArea } from "../os/useDragResize";
import { RenameField } from "./RenameField";
import { acceptsPaths, dropPaths } from "../apps/files/dnd";

const DESKTOP = `${HOME}/Desktop`;

type Point = { x: number; y: number };
type Box = Point & { w: number; h: number };

const fixed = (path: string) => path === HOME || path === TRASH;
const key = (point: Point) => `${point.x},${point.y}`;
const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);

const trashAll = (paths: string[]) => tryFs((fs) => paths.reduce(trash, fs), "Move to Trash");

function iconMenu(paths: string[], startRename: () => void): MenuItem[] {
  const os = useOS.getState();
  if (paths.length === 1 && paths[0] === TRASH) return [
    { label: "Open", action: () => openPath(TRASH) },
    { label: "Empty Trash", disabled: !trashed(os.fs).length, action: () => tryFs(emptyTrash) },
  ];
  const movable = paths.filter((path) => !fixed(path));
  const single = paths.length === 1 ? paths[0]! : null;
  return [
    { label: "Open", action: () => paths.forEach((path) => openPath(path)) },
    ...(single && os.fs[single]?.type === "file" ? [{ label: "Open With Other Application", action: () => os.setOpenWith(single) }] : []),
    "separator",
    { label: "Cut", disabled: !movable.length, action: () => os.setClipboard({ paths: movable, cut: true }) },
    { label: "Copy", action: () => os.setClipboard({ paths: paths.filter((path) => path !== TRASH), cut: false }) },
    { label: "Rename…", disabled: !single || fixed(single), action: startRename },
    "separator",
    { label: "Move to Trash", disabled: !movable.length, action: () => trashAll(movable) },
  ];
}

function desktopMenu(startRename: (path: string) => void): MenuItem[] {
  const os = useOS.getState();
  const create = (kind: "dir" | "file") => () => {
    const path = createIn(DESKTOP, kind);
    if (path) startRename(path);
  };
  return [
    { label: "New Folder", action: create("dir") },
    { label: "New Document", action: create("file") },
    "separator",
    { label: "Paste", disabled: !os.clipboard, action: () => pasteInto(DESKTOP) },
    "separator",
    { label: "Open in Terminal", action: () => os.openApp("terminal", { args: [DESKTOP] }) },
    "separator",
    { label: "Change Background…", action: () => os.openApp("settings", { args: ["background"] }) },
    { label: "Display Settings", action: () => os.openApp("settings", { args: ["displays"] }) },
  ];
}

export function DesktopIcons() {
  const fs = useOS((state) => state.fs);
  const positions = useOS((state) => state.iconPositions);
  const area = useWorkArea();
  const root = useRef<HTMLDivElement>(null);
  const dragged = useRef(false); // swallows the click that follows a drag, so the group selection survives
  const [selected, setSelected] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const { desktopIconSize: iconSize, showHome, showTrash } = useOS((state) => state.settings);
  const CELL = { w: iconSize + 48, h: iconSize + 60 };
  const origin = { x: area.x + 8, y: area.y + 8 };
  const rows = Math.max(1, Math.floor((area.h - 16) / CELL.h));
  const columns = Math.max(1, Math.floor((area.w - 16) / CELL.w));
  const paths = [...(showHome ? [HOME] : []), ...(showTrash ? [TRASH] : []), ...(fs[DESKTOP] ? list(fs, DESKTOP).filter((name) => !name.startsWith(".")).map((name) => `${DESKTOP}/${name}`) : [])]
    .filter((path) => fs[path]);

  /** Nearest grid cell to `point`, kept inside the work area (also re-snaps positions after icon size/dock changes). */
  const cellAt = (point: Point) => ({
    x: origin.x + clamp(Math.round((point.x - origin.x) / CELL.w), columns - 1) * CELL.w,
    y: origin.y + clamp(Math.round((point.y - origin.y) / CELL.h), rows - 1) * CELL.h,
  });
  // Placed icons keep their cell; the rest fill the free cells column by column.
  const layout = new Map<string, Point>();
  const taken = new Set<string>();
  for (const path of paths) {
    const stored = positions[path];
    if (!stored) continue;
    const cell = cellAt(stored);
    layout.set(path, cell);
    taken.add(key(cell));
  }
  let slot = 0;
  for (const path of paths) {
    if (layout.has(path)) continue;
    let cell: Point;
    do cell = { x: origin.x + Math.floor(slot / rows) * CELL.w, y: origin.y + (slot++ % rows) * CELL.h }; while (taken.has(key(cell)));
    layout.set(path, cell);
  }

  const iconElements = () => [...root.current!.querySelectorAll<HTMLElement>("[data-desktop-path]")];

  function pressIcon(event: ReactPointerEvent<HTMLElement>, path: string) {
    if (event.button !== 0 || renaming) return;
    if (event.ctrlKey || event.metaKey) {
      setSelected(selected.includes(path) ? selected.filter((other) => other !== path) : [...selected, path]);
      return;
    }
    const group = selected.includes(path) ? selected : [path];
    setSelected(group);
    const elements = iconElements().filter((el) => group.includes(el.dataset.desktopPath!));
    let end = { x: event.clientX, y: event.clientY, dx: 0, dy: 0 };
    track(event, 4, (dx, dy, e) => {
      end = { x: e.clientX, y: e.clientY, dx, dy };
      elements.forEach((el) => (el.style.transform = `translate(${dx}px, ${dy}px)`));
    }, () => {
      dragged.current = true;
      elements.forEach((el) => Object.assign(el.style, { transform: "", visibility: "hidden" }));
      const target = document.elementFromPoint(end.x, end.y)?.closest<HTMLElement>("[data-desktop-path]")?.dataset.desktopPath;
      elements.forEach((el) => (el.style.visibility = ""));
      const movable = group.filter((other) => !fixed(other));
      if (target && fs[target]?.type === "dir" && movable.length) {
        tryFs((next) => movable.reduce((acc, other) => (target === TRASH ? trash(acc, other) : mv(acc, other, target)), next), target === TRASH ? "Move to Trash" : "Move");
        return;
      }
      const occupied = new Set(paths.filter((other) => !group.includes(other)).map((other) => key(layout.get(other)!)));
      const next = new Map(layout);
      for (const other of group) {
        const from = layout.get(other)!;
        const cell = cellAt({ x: from.x + end.dx, y: from.y + end.dy });
        if (occupied.has(key(cell))) continue; // ponytail: a blocked icon stays put; DING would push it to the next free cell
        occupied.add(key(cell));
        next.set(other, cell);
      }
      const os = useOS.getState();
      next.forEach((cell, other) => os.setIconPosition(other, cell));
    });
  }

  /** Rubber-band selection on empty desktop; Ctrl adds to the current selection. */
  function startBox(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.button !== 0) return;
    const additive = event.ctrlKey || event.metaKey ? selected : [];
    setSelected(additive);
    const start = { x: event.clientX, y: event.clientY };
    const icons = iconElements().map((el) => [el.dataset.desktopPath!, el.getBoundingClientRect()] as const);
    track(event, 4, (dx, dy) => {
      const next = { x: Math.min(start.x, start.x + dx), y: Math.min(start.y, start.y + dy), w: Math.abs(dx), h: Math.abs(dy) };
      setBox(next);
      const hits = icons.filter(([, r]) => r.left < next.x + next.w && r.right > next.x && r.top < next.y + next.h && r.bottom > next.y);
      setSelected([...new Set([...additive, ...hits.map(([path]) => path)])]);
    }, () => setBox(null));
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const own = selected.filter((path) => path.startsWith(`${DESKTOP}/`));
    if (event.key === "Enter") selected.forEach((path) => openPath(path));
    if (event.key === "F2" && selected.length === 1 && own.length === 1) setRenaming(own[0]!);
    if (event.key === "Delete" && own.length) trashAll(own);
    if (event.key === "Escape") setSelected([]);
    if ((event.ctrlKey || event.metaKey) && event.key === "a") {
      event.preventDefault();
      setSelected(paths);
    }
  }

  return (
    <div ref={root} tabIndex={-1} className="absolute inset-0 outline-none" onPointerDown={startBox} onKeyDown={onKeyDown}
      onContextMenu={(e) => e.target === e.currentTarget && useOS.getState().openMenu(e, desktopMenu(setRenaming))}
      onDragOver={(e) => acceptsPaths(e) && e.preventDefault()} onDrop={(e) => dropPaths(e, DESKTOP)}>
      {paths.map((path) => {
        const node = fs[path]!;
        const position = layout.get(path)!;
        const icon = path === TRASH ? (trashed(fs).length ? ICONS["trash-full"] : ICONS.trash) : fileIcon(path, node);
        const label = path === HOME ? "Home" : path === TRASH ? "Trash" : basename(path);
        const active = selected.includes(path);
        return (
          <button key={path} data-desktop-path={path} aria-label={label} aria-pressed={active}
            className={`absolute flex flex-col items-center gap-1 rounded-lg p-1.5 text-white ${active ? "bg-accent/40 ring-1 ring-accent" : "hover:bg-white/10"}`}
            style={{ left: position.x, top: position.y, width: CELL.w - 6 }}
            onPointerDown={(e) => pressIcon(e, path)}
            onClick={(e) => {
              if (dragged.current) dragged.current = false;
              else if (!e.ctrlKey && !e.metaKey) setSelected([path]);
            }}
            onDoubleClick={() => openPath(path)}
            onDragOver={(e) => node.type === "dir" && acceptsPaths(e) && e.preventDefault()}
            onDrop={(e) => node.type === "dir" && dropPaths(e, path)}
            onContextMenu={(e) => {
              const group = selected.includes(path) ? selected : [path];
              setSelected(group);
              useOS.getState().openMenu(e, iconMenu(group, () => setRenaming(path)));
            }}>
            <img src={icon} alt="" draggable={false} className="object-contain drop-shadow" style={{ width: iconSize, height: iconSize }} />
            {renaming === path ? (
              <RenameField path={path} onDone={() => setRenaming(null)} />
            ) : (
              <span className={`text-xs leading-tight [text-shadow:0_1px_2px_rgb(0_0_0/0.9)] ${active ? "" : "line-clamp-2"} break-all`}>{label}</span>
            )}
          </button>
        );
      })}
      {box && <div className="pointer-events-none absolute rounded-sm border border-accent bg-accent/20" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
    </div>
  );
}
