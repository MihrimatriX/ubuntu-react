// Files (Nautilus): back/forward history, breadcrumb path bar (Ctrl+L to type a path), grid/list views,
// sorting, recursive search (Ctrl+F or just start typing), arrow-key selection, clipboard (Ctrl+X/C/V), F2 rename,
// Delete → Trash, Properties, and a Trash view with Restore / Empty Trash.
// Opening a file goes through openPath(), i.e. its MIME type picks the app.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, EllipsisVertical, Grid2x2, List, Search } from "lucide-react";
import { HOME, TRASH, basename, dirname, emptyTrash, resolve, restore, rm, trash } from "../../os/fs";
import { createIn, openPath, pasteInto } from "../../os/launch";
import { tryFs, useOS, type MenuItem } from "../../os/store";
import { Dialog, HeaderSlot } from "../../shell/chrome";
import type { AppProps } from "../registry";
import { entriesFor, formatSize, RECENT, searchEntries, sortEntries, STARRED, type Entry, type SortKey } from "./entries";
import { PathBar } from "./PathBar";
import { Sidebar } from "./Sidebar";
import { FileView } from "./FileView";

export default function Files({ windowId, filePath }: AppProps) {
  const fs = useOS((state) => state.fs);
  const starred = useOS((state) => state.settings.starred);
  const clipboard = useOS((state) => state.clipboard);
  const [history, setHistory] = useState({ stack: [filePath ?? HOME], index: 0 });
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: "name", descending: false });
  const [hidden, setHidden] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [properties, setProperties] = useState<Entry | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.focus();
  }, []);
  const location = history.stack[history.index]!;
  const trashView = location === TRASH;
  const listed = query ? searchEntries(fs, location, query, { hidden, starred }) : entriesFor(fs, location, { hidden, starred });
  const entries = sortEntries(listed, sort.key, sort.descending);
  const os = useOS.getState();

  const navigate = (path: string) => {
    setHistory(({ stack, index }) => ({ stack: [...stack.slice(0, index + 1), path], index: index + 1 }));
    setSelected([]);
    setQuery(null);
  };
  const go = (step: number) => setHistory(({ stack, index }) => ({ stack, index: Math.min(Math.max(index + step, 0), stack.length - 1) }));

  useEffect(() => { if (filePath && filePath !== location) navigate(filePath); }, [filePath]);
  useEffect(() => {
    const title = { [RECENT]: "Recent", [STARRED]: "Starred", [TRASH]: "Trash", [HOME]: "Home" }[location] ?? basename(location);
    useOS.getState().patchWindow(windowId, { title });
  }, [location, windowId]);
  // A folder that disappears (deleted from Terminal, say) sends the window back to its nearest existing parent.
  useEffect(() => {
    if (location.includes("://") || fs[location]) return;
    let parent = location;
    while (!fs[parent]) parent = dirname(parent);
    navigate(parent);
  }, [fs, location]);

  const open = (entry: Entry) => (entry.node.type === "dir" && !trashView ? navigate(entry.path) : openPath(entry.path));
  const trashSelected = () => tryFs((next) => selected.reduce((acc, path) => (trashView ? rm(acc, path, true) : trash(acc, path)), next), "Move to Trash") && setSelected([]);
  const toggleStar = (paths: string[]) => os.setSetting("starred", paths.every((path) => starred.includes(path)) ? starred.filter((path) => !paths.includes(path)) : [...new Set([...starred, ...paths])]);
  const writable = !location.includes("://") && !trashView;
  const create = (kind: "dir" | "file") => { const path = createIn(location, kind); if (path) { setSelected([path]); setRenaming(path); } };

  function itemMenu(entry: Entry): MenuItem[] {
    const paths = selected.includes(entry.path) ? selected : [entry.path];
    if (trashView) return [
      { label: "Restore From Trash", action: () => tryFs((next) => paths.reduce((acc, path) => restore(acc, basename(path)), next), "Restore") },
      { label: "Delete Permanently", action: trashSelected },
    ];
    return [
      { label: entry.node.type === "dir" ? "Open" : "Open With Default Application", action: () => openPath(entry.path) },
      ...(entry.node.type === "file" ? [{ label: "Open With…", action: () => os.setOpenWith(entry.path) }] : []),
      "separator",
      { label: "Cut", shortcut: "Ctrl+X", action: () => os.setClipboard({ paths, cut: true }) },
      { label: "Copy", shortcut: "Ctrl+C", action: () => os.setClipboard({ paths, cut: false }) },
      { label: "Rename…", shortcut: "F2", disabled: paths.length > 1, action: () => setRenaming(entry.path) },
      { label: starred.includes(entry.path) ? "Unstar" : "Star", action: () => toggleStar(paths) },
      "separator",
      { label: "Move to Trash", shortcut: "Delete", action: trashSelected },
      "separator",
      { label: "Properties", shortcut: "Ctrl+I", action: () => setProperties(entry) },
    ];
  }

  const backgroundMenu = (): MenuItem[] => [
    { label: "New Folder…", disabled: !writable, action: () => create("dir") },
    { label: "New Document", disabled: !writable, action: () => create("file") },
    { label: "Paste", shortcut: "Ctrl+V", disabled: !clipboard || !writable, action: () => pasteInto(location) },
    { label: "Select All", shortcut: "Ctrl+A", action: () => setSelected(entries.map((entry) => entry.path)) },
    "separator",
    ...(trashView ? [{ label: "Empty Trash", disabled: !entries.length, action: () => tryFs(emptyTrash) }] : []),
    { label: "Open in Terminal", disabled: !writable, action: () => os.openApp("terminal", { args: [location] }) },
    { label: "Show Hidden Files", shortcut: "Ctrl+H", checked: hidden, action: () => setHidden(!hidden) },
    "separator",
    ...(["name", "mtime", "size"] as const).map((key) => ({
      label: { name: "Sort by Name", mtime: "Sort by Modification Date", size: "Sort by Size" }[key],
      checked: sort.key === key, action: () => setSort({ key, descending: sort.key === key ? !sort.descending : false }),
    })),
  ];

  /** Arrow keys move the selection; up/down jump a whole row in grid view. */
  function moveSelection(event: KeyboardEvent, key: string) {
    const listbox = (event.currentTarget as HTMLElement).querySelector<HTMLElement>("[role=listbox]");
    const columns = view === "grid" && listbox ? getComputedStyle(listbox).gridTemplateColumns.split(" ").length : 1;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[key] ?? 0;
    const current = entries.findIndex((entry) => entry.path === selected.at(-1));
    const next = entries[Math.min(Math.max(current === -1 ? 0 : current + step, 0), entries.length - 1)];
    if (!next) return;
    setSelected([next.path]);
    listbox?.querySelector(`[data-path="${CSS.escape(next.path)}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(event: KeyboardEvent) {
    if (renaming || (event.target as HTMLElement).tagName === "INPUT") return;
    const ctrl = event.ctrlKey || event.metaKey;
    if (!ctrl && !event.altKey && event.key.length === 1 && event.key !== " ") {
      setQuery(event.key); // type-ahead starts a search, like Nautilus
      return event.preventDefault();
    }
    const shortcuts: Record<string, () => void> = {
      Delete: trashSelected, F2: () => selected.length === 1 && !trashView && setRenaming(selected[0]!),
      Enter: () => entries.filter((entry) => selected.includes(entry.path)).forEach(open),
      Backspace: () => location.startsWith("/") && location !== "/" && navigate(resolve(location, "..")),
      Escape: () => (query !== null ? setQuery(null) : setSelected([])),
      ...(!event.altKey && Object.fromEntries(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].map((key) => [key, () => moveSelection(event, key)]))),
      ...(ctrl && { a: () => setSelected(entries.map((entry) => entry.path)), c: () => selected.length && os.setClipboard({ paths: selected, cut: false }),
        x: () => selected.length && os.setClipboard({ paths: selected, cut: true }), v: () => writable && pasteInto(location), h: () => setHidden(!hidden), l: () => setEditingPath(true),
        f: () => setQuery(query === null ? "" : null), i: () => { const entry = entries.find((item) => item.path === selected[0]); if (entry) setProperties(entry); } }),
      ...(event.altKey && { ArrowLeft: () => go(-1), ArrowRight: () => go(1) }),
    };
    const action = shortcuts[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  return (
    <div ref={root} className="flex h-full outline-none" tabIndex={0} onKeyDown={onKeyDown}>
      <HeaderSlot windowId={windowId}>
        <button aria-label="Back" className="btn btn-flat" disabled={history.index === 0} onClick={() => go(-1)}><ChevronLeft className="size-4" /></button>
        <button aria-label="Forward" className="btn btn-flat" disabled={history.index === history.stack.length - 1} onClick={() => go(1)}><ChevronRight className="size-4" /></button>
      </HeaderSlot>
      <HeaderSlot windowId={windowId} side="center">
        {query === null ? <PathBar location={location} editing={editingPath} setEditing={setEditingPath} onNavigate={navigate} /> : (
          <input autoFocus aria-label="Search files" placeholder={`Search ${basename(location) || "everywhere"}`} value={query} className="field w-[380px] max-w-full"
            onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setQuery(null); }} />
        )}
      </HeaderSlot>
      <HeaderSlot windowId={windowId} side="end">
        <button aria-label="Search" aria-pressed={query !== null} className="btn btn-flat aria-pressed:bg-hover" onClick={() => setQuery(query === null ? "" : null)}><Search className="size-4" /></button>
        <button aria-label={view === "grid" ? "List View" : "Grid View"} className="btn btn-flat" onClick={() => setView(view === "grid" ? "list" : "grid")}>
          {view === "grid" ? <List className="size-4" /> : <Grid2x2 className="size-4" />}
        </button>
        <button aria-label="Folder Menu" className="btn btn-flat" onClick={(e) => os.openMenu(e, backgroundMenu())}><EllipsisVertical className="size-4" /></button>
      </HeaderSlot>
      <Sidebar current={location} onNavigate={navigate} />
      <div className="flex min-w-0 flex-1 flex-col">
        {trashView && (
          <div className="flex items-center gap-2 border-b border-line bg-header px-3 py-2 text-sm">
            <span className="flex-1">Trash items are kept until you empty the Trash.</span>
            <button className="btn" disabled={!selected.length} onClick={() => tryFs((next) => selected.reduce((acc, path) => restore(acc, basename(path)), next), "Restore")}>Restore</button>
            <button className="btn btn-danger" disabled={!entries.length} onClick={() => tryFs(emptyTrash)}>Empty…</button>
          </div>
        )}
        <FileView entries={entries} view={view} selected={selected} renaming={renaming} trashView={trashView}
          sort={sort} onSort={(key) => setSort({ key, descending: sort.key === key && !sort.descending })}
          cut={clipboard?.cut ? clipboard.paths : []} onSelect={setSelected} onOpen={open} onRenameDone={() => setRenaming(null)}
          onItemMenu={(e, entry) => os.openMenu(e, itemMenu(entry))} onBackgroundMenu={(e) => os.openMenu(e, backgroundMenu())} />
        <footer className="border-t border-line bg-window px-3 py-1 text-xs text-fg-dim">
          {query ? `${entries.length} results · ` : ""}{selected.length ? `${selected.length} of ${entries.length} items selected` : `${entries.length} items`}
        </footer>
      </div>
      {properties && (
        <Dialog title={properties.name} onCancel={() => setProperties(null)} actions={[]} body={
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-left">
            <dt>Type</dt><dd className="truncate text-fg">{properties.node.type === "dir" ? "Folder" : properties.node.mime}</dd>
            <dt>Size</dt><dd className="text-fg">{properties.node.type === "dir" ? `${entriesFor(fs, properties.path, { hidden: true, starred }).length} items` : formatSize(properties.node)}</dd>
            <dt>Location</dt><dd className="truncate text-fg">{(properties.origin ? dirname(properties.origin) : dirname(properties.path)).replace(HOME, "~")}</dd>
            <dt>Modified</dt><dd className="text-fg">{new Date(properties.node.mtime).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</dd>
          </dl>
        } />
      )}
    </div>
  );
}
