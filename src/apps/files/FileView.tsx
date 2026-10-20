// The Files content area in grid or list mode. Click/Ctrl/Shift selection goes through nextSelection();
// dragging on empty space draws a selection box (hit-testing item rects); items are HTML5-draggable
// and folders accept drops.
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { fileIcon } from "../../os/icons";
import { RenameField } from "../../shell/RenameField";
import { acceptsPaths, dragPaths, dropPaths } from "./dnd";
import { formatSize, nextSelection, type Entry, type SortKey } from "./entries";

type Props = {
  entries: Entry[];
  view: "grid" | "list";
  selected: string[];
  renaming: string | null;
  cut: string[];
  onSelect: (paths: string[]) => void;
  onOpen: (entry: Entry) => void;
  onItemMenu: (event: React.MouseEvent, entry: Entry) => void;
  onBackgroundMenu: (event: React.MouseEvent) => void;
  onRenameDone: () => void;
  trashView: boolean;
  sort: { key: SortKey; descending: boolean };
  onSort: (key: SortKey) => void;
};

type Box = { x: number; y: number; w: number; h: number };

export function FileView(props: Props) {
  const { entries, view, selected, onSelect } = props;
  const anchor = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const ordered = entries.map((entry) => entry.path);

  function clickItem(event: React.MouseEvent, entry: Entry) {
    const modifiers = { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey };
    onSelect(nextSelection(selected, ordered, entry.path, modifiers, anchor.current));
    if (!modifiers.shift) anchor.current = entry.path;
  }

  /** Rubber-band selection: every item whose rect intersects the dragged box gets selected. */
  function startBox(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.button !== 0) return;
    const el = event.currentTarget;
    const origin = el.getBoundingClientRect();
    const start = { x: event.clientX - origin.x + el.scrollLeft, y: event.clientY - origin.y + el.scrollTop };
    const additive = event.ctrlKey ? selected : [];
    onSelect(additive);
    el.setPointerCapture(event.pointerId);
    el.onpointermove = (e) => {
      const point = { x: e.clientX - origin.x + el.scrollLeft, y: e.clientY - origin.y + el.scrollTop };
      const next = {
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        w: Math.abs(point.x - start.x),
        h: Math.abs(point.y - start.y),
      };
      setBox(next);
      const hits = [...el.querySelectorAll<HTMLElement>("[data-path]")].filter((item) => {
        const r = item.getBoundingClientRect();
        const left = r.left - origin.x + el.scrollLeft;
        const top = r.top - origin.y + el.scrollTop;
        return left < next.x + next.w && left + r.width > next.x && top < next.y + next.h && top + r.height > next.y;
      });
      onSelect([...new Set([...additive, ...hits.map((item) => item.dataset.path!)])]);
    };
    el.onpointerup = () => {
      el.onpointermove = el.onpointerup = null;
      setBox(null);
    };
  }

  const itemProps = (entry: Entry) => ({
    "data-path": entry.path,
    "aria-selected": selected.includes(entry.path),
    role: "option",
    draggable: props.renaming !== entry.path,
    onClick: (e: React.MouseEvent) => clickItem(e, entry),
    onDoubleClick: () => props.onOpen(entry),
    onContextMenu: (e: React.MouseEvent) => {
      if (!selected.includes(entry.path)) onSelect([entry.path]);
      props.onItemMenu(e, entry);
    },
    onDragStart: (e: React.DragEvent) => dragPaths(e, selected.includes(entry.path) ? selected : [entry.path]),
    onDragOver: (e: React.DragEvent) => entry.node.type === "dir" && acceptsPaths(e) && e.preventDefault(),
    onDrop: (e: React.DragEvent) => entry.node.type === "dir" && dropPaths(e, entry.path),
  });

  const label = (entry: Entry, className = "") =>
    props.renaming === entry.path ? (
      <RenameField path={entry.path} onDone={props.onRenameDone} />
    ) : (
      <span className={className}>{entry.name}</span>
    );
  const dim = (entry: Entry) => (props.cut.includes(entry.path) ? "opacity-50" : "");
  const active = (entry: Entry) => (selected.includes(entry.path) ? "bg-accent/20" : "hover:bg-hover");

  return (
    <div
      ref={root}
      role="listbox"
      aria-multiselectable
      tabIndex={-1}
      className={`relative min-h-0 flex-1 overflow-auto bg-view p-2 outline-none ${view === "grid" ? "grid content-start gap-1 [grid-template-columns:repeat(auto-fill,minmax(104px,1fr))]" : ""}`}
      onPointerDown={startBox}
      onContextMenu={(e) => e.target === e.currentTarget && props.onBackgroundMenu(e)}
      onDragOver={(e) => acceptsPaths(e) && e.preventDefault()}
    >
      {view === "list" && (
        <div className="sticky top-0 z-10 grid grid-cols-[1fr_120px_160px] border-b border-line bg-view px-2 py-1 text-xs font-bold text-fg-dim">
          {(
            [
              ["name", "Name"],
              ["size", "Size"],
              ["mtime", props.trashView ? "Original Location" : "Modified"],
            ] as const
          ).map(([key, title]) => (
            <button
              key={key}
              className="rounded px-1 py-0.5 text-left hover:bg-hover"
              onClick={() => props.onSort(key)}
            >
              {title}
              {props.sort.key === key ? (props.sort.descending ? " ▾" : " ▴") : ""}
            </button>
          ))}
        </div>
      )}
      {entries.length === 0 && (
        <p className="pointer-events-none col-span-full mt-24 text-center text-fg-dim">
          {props.trashView ? "Trash is Empty" : "Folder is Empty"}
        </p>
      )}
      {entries.map((entry) =>
        view === "grid" ? (
          <div
            key={entry.path}
            {...itemProps(entry)}
            className={`flex flex-col items-center gap-1 rounded-lg p-2 text-center text-sm ${active(entry)} ${dim(entry)}`}
          >
            <img
              src={fileIcon(entry.path, entry.node)}
              alt=""
              draggable={false}
              className="pointer-events-none size-16 object-contain"
            />
            {label(entry, "line-clamp-2 break-all")}
          </div>
        ) : (
          <div
            key={entry.path}
            {...itemProps(entry)}
            className={`grid grid-cols-[1fr_120px_160px] items-center rounded-md px-2 py-1 text-sm ${active(entry)} ${dim(entry)}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <img
                src={fileIcon(entry.path, entry.node)}
                alt=""
                draggable={false}
                className="pointer-events-none size-6 object-contain"
              />
              {label(entry, "truncate")}
            </span>
            <span className="text-fg-dim">{formatSize(entry.node)}</span>
            <span className="truncate text-fg-dim">
              {entry.origin ??
                new Date(entry.node.mtime).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </div>
        ),
      )}
      {box && (
        <div
          className="pointer-events-none absolute border border-accent bg-accent/15"
          style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        />
      )}
    </div>
  );
}
