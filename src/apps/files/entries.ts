// Pure Files logic: which entries a location shows (folder, Trash, Recent, Starred), Nautilus sorting
// (folders first) and click-selection rules (plain / Ctrl toggles / Shift selects a range from the anchor).
import { HOME, TRASH, basename, list, trashed, walk, type Fs, type FsNode } from "../../os/fs";

export const RECENT = "recent://";
export const STARRED = "starred://";
export type Entry = { path: string; name: string; node: FsNode; origin?: string };
export type SortKey = "name" | "size" | "mtime";

const RECENT_LIMIT = 30;

export function entriesFor(fs: Fs, location: string, options: { hidden: boolean; starred: string[] }): Entry[] {
  const entry = (path: string, name = basename(path), origin?: string): Entry | null => {
    const node = fs[path];
    return node ? { path, name, node, origin } : null;
  };
  let entries: (Entry | null)[];
  if (location === TRASH) {
    entries = trashed(fs).map((item) => entry(`${TRASH}/files/${item.name}`, item.name, item.originalPath));
  } else if (location === RECENT) {
    entries = Object.keys(fs)
      .filter((path) => fs[path]!.type === "file" && path.startsWith(`${HOME}/`) && !path.includes("/."))
      .sort((a, b) => fs[b]!.mtime - fs[a]!.mtime)
      .slice(0, RECENT_LIMIT)
      .map((path) => entry(path));
  } else if (location === STARRED) {
    entries = options.starred.map((path) => entry(path));
  } else {
    entries =
      fs[location]?.type === "dir"
        ? list(fs, location).map((name) => entry(`${location === "/" ? "" : location}/${name}`))
        : [];
  }
  return entries.filter((item): item is Entry => item !== null && (options.hidden || !item.name.startsWith(".")));
}

const SEARCH_LIMIT = 200;

/** Nautilus search: recursive name match below a folder; virtual locations (Recent, Trash…) filter their own list. */
export function searchEntries(
  fs: Fs,
  location: string,
  query: string,
  options: { hidden: boolean; starred: string[] },
): Entry[] {
  const needle = query.trim().toLowerCase();
  const pool =
    location.includes("://") || location === TRASH
      ? entriesFor(fs, location, options)
      : walk(fs, location)
          .filter((path) => options.hidden || !path.slice(location.length).includes("/."))
          .map((path) => ({ path, name: basename(path), node: fs[path]! }));
  return pool.filter((entry) => entry.name.toLowerCase().includes(needle)).slice(0, SEARCH_LIMIT);
}

export function sortEntries(entries: Entry[], key: SortKey, descending: boolean): Entry[] {
  const compare = (a: Entry, b: Entry) =>
    key === "name"
      ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
      : key === "size"
        ? a.node.size - b.node.size
        : a.node.mtime - b.node.mtime;
  return [...entries].sort((a, b) => {
    if (a.node.type !== b.node.type) return a.node.type === "dir" ? -1 : 1;
    return descending ? compare(b, a) : compare(a, b);
  });
}

/** New selection after clicking `path` in `ordered` (the visible order), given modifier keys and the anchor. */
export function nextSelection(
  selected: string[],
  ordered: string[],
  path: string,
  modifiers: { ctrl: boolean; shift: boolean },
  anchor: string | null,
): string[] {
  if (modifiers.shift && anchor && ordered.includes(anchor)) {
    const [from, to] = [ordered.indexOf(anchor), ordered.indexOf(path)].sort((a, b) => a - b);
    const range = ordered.slice(from, to! + 1);
    return modifiers.ctrl ? [...new Set([...selected, ...range])] : range;
  }
  if (modifiers.ctrl) return selected.includes(path) ? selected.filter((item) => item !== path) : [...selected, path];
  return [path];
}

export const formatSize = (node: FsNode) => {
  if (node.type === "dir") return "—";
  if (node.size < 1000) return `${node.size} bytes`;
  return node.size < 1e6 ? `${(node.size / 1e3).toFixed(1)} kB` : `${(node.size / 1e6).toFixed(1)} MB`;
};
