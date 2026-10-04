// Virtual file system: a flat Record keyed by absolute path. Every op is pure — it returns a new
// Fs or throws FsError with the Linux errno text. Trash follows the freedesktop layout:
// Trash/files/<name> holds the item, Trash/info/<name>.trashinfo stores "Path=<original>".

export type FsNode = { type: "file" | "dir"; content?: string; mime?: string; mtime: number; size: number };
export type Fs = Record<string, FsNode>;

export const HOME = "/home/ubuntu";
export const TRASH = `${HOME}/.local/share/Trash`;
const TRASH_FILES = `${TRASH}/files`;
const TRASH_INFO = `${TRASH}/info`;

export class FsError extends Error {}

const MIME: Record<string, string> = {
  txt: "text/plain", md: "text/markdown", js: "text/javascript", ts: "text/typescript",
  json: "application/json", html: "text/html", css: "text/css", py: "text/x-python", sh: "text/x-shellscript",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp",
};

export const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1) || "/";
export const dirname = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";
export const extension = (path: string) => (basename(path).match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase();
export const mimeOf = (path: string) => MIME[extension(path)] ?? "application/octet-stream";
const join = (dir: string, name: string) => (dir === "/" ? `/${name}` : `${dir}/${name}`);
const isInside = (path: string, dir: string) => path === dir || path.startsWith(dir === "/" ? "/" : `${dir}/`);

/** Resolves `path` against `cwd`, expanding `~` and collapsing `.` / `..`. */
export function resolve(cwd: string, path: string): string {
  const expanded = path === "~" || path.startsWith("~/") ? HOME + path.slice(1) : path;
  const absolute = expanded.startsWith("/") ? expanded : `${cwd}/${expanded}`;
  const parts: string[] = [];
  for (const part of absolute.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return `/${parts.join("/")}`;
}

export function stat(fs: Fs, path: string): FsNode {
  const node = fs[path];
  if (!node) throw new FsError("No such file or directory");
  return node;
}

/** Child names of a directory, sorted. ponytail: O(total nodes) scan, add a child index if the VFS grows huge. */
export function list(fs: Fs, dir: string): string[] {
  if (stat(fs, dir).type !== "dir") throw new FsError("Not a directory");
  const prefix = dir === "/" ? "/" : `${dir}/`;
  return Object.keys(fs)
    .filter((key) => key !== dir && key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
    .map((key) => key.slice(prefix.length))
    .sort((a, b) => a.localeCompare(b));
}

export function read(fs: Fs, path: string): string {
  const node = stat(fs, path);
  if (node.type === "dir") throw new FsError("Is a directory");
  return node.content ?? "";
}

function requireParentDir(fs: Fs, path: string) {
  if (stat(fs, dirname(path)).type !== "dir") throw new FsError("Not a directory");
}

export function write(fs: Fs, path: string, content: string, append = false): Fs {
  const existing = fs[path];
  if (existing?.type === "dir") throw new FsError("Is a directory");
  if (!existing) requireParentDir(fs, path);
  const text = append && existing ? (existing.content ?? "") + content : content;
  return { ...fs, [path]: { type: "file", content: text, mime: mimeOf(path), mtime: Date.now(), size: text.length } };
}

export function mkdir(fs: Fs, path: string, parents = false): Fs {
  if (fs[path]) {
    if (parents && fs[path].type === "dir") return fs;
    throw new FsError("File exists");
  }
  if (parents && dirname(path) !== path && !fs[dirname(path)]) fs = mkdir(fs, dirname(path), true);
  requireParentDir(fs, path);
  return { ...fs, [path]: { type: "dir", mtime: Date.now(), size: 4096 } };
}

export function rm(fs: Fs, path: string, recursive = false): Fs {
  if (stat(fs, path).type === "dir" && !recursive) throw new FsError("Is a directory");
  if (path === "/" || path === HOME) throw new FsError("Permission denied");
  return Object.fromEntries(Object.entries(fs).filter(([key]) => !isInside(key, path)));
}

/** Copies (or moves) `src` and its whole subtree to `dst`; a `dst` directory receives `src` inside it. */
function transfer(fs: Fs, src: string, dst: string, keepSource: boolean): Fs {
  stat(fs, src);
  const target = fs[dst]?.type === "dir" ? join(dst, basename(src)) : dst;
  if (target === src) return fs;
  if (isInside(target, src)) throw new FsError(`cannot move '${src}' to a subdirectory of itself`);
  if (fs[target]?.type === "dir") throw new FsError("Directory not empty");
  requireParentDir(fs, target);
  const kept: Fs = {};
  const moved: Fs = {};
  for (const [key, node] of Object.entries(fs)) {
    if (isInside(key, src)) moved[target + key.slice(src.length)] = { ...node, mtime: Date.now() };
    if (keepSource || !isInside(key, src)) kept[key] = node;
  }
  return { ...kept, ...moved };
}

export const mv = (fs: Fs, src: string, dst: string) => transfer(fs, src, dst, false);

export function cp(fs: Fs, src: string, dst: string, recursive = false): Fs {
  if (stat(fs, src).type === "dir" && !recursive) throw new FsError(`-r not specified; omitting directory '${src}'`);
  return transfer(fs, src, dst, true);
}

/** Returns `name` or "name (2)", "name (3)"... whichever does not yet exist in `dir`. */
export function uniqueName(fs: Fs, dir: string, name: string): string {
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  let candidate = name;
  for (let copy = 2; fs[join(dir, candidate)]; copy++) candidate = `${stem} (${copy})${ext}`;
  return candidate;
}

export function trash(fs: Fs, path: string): Fs {
  stat(fs, path);
  if (isInside(path, TRASH)) return rm(fs, path, true);
  fs = mkdir(mkdir(fs, TRASH_FILES, true), TRASH_INFO, true);
  const name = uniqueName(fs, TRASH_FILES, basename(path));
  fs = mv(fs, path, join(TRASH_FILES, name));
  return write(fs, join(TRASH_INFO, `${name}.trashinfo`), `[Trash Info]\nPath=${path}\nDeletionDate=${new Date().toISOString()}\n`);
}

/** Trashed items as { name, originalPath } pairs. */
export function trashed(fs: Fs): { name: string; originalPath: string }[] {
  if (!fs[TRASH_FILES]) return [];
  return list(fs, TRASH_FILES).map((name) => {
    const info = fs[join(TRASH_INFO, `${name}.trashinfo`)]?.content ?? "";
    return { name, originalPath: info.match(/^Path=(.*)$/m)?.[1] ?? join(HOME, name) };
  });
}

export function restore(fs: Fs, name: string): Fs {
  const item = trashed(fs).find((entry) => entry.name === name);
  if (!item) throw new FsError("No such file or directory");
  const dir = dirname(item.originalPath);
  if (!fs[dir]) fs = mkdir(fs, dir, true);
  fs = mv(fs, join(TRASH_FILES, name), join(dir, uniqueName(fs, dir, basename(item.originalPath))));
  return rm(fs, join(TRASH_INFO, `${name}.trashinfo`));
}

export function emptyTrash(fs: Fs): Fs {
  return Object.fromEntries(Object.entries(fs).filter(([key]) => !key.startsWith(`${TRASH_FILES}/`) && !key.startsWith(`${TRASH_INFO}/`)));
}

/** Every path under `dir` (recursive, excluding `dir` itself). */
export const walk = (fs: Fs, dir: string) => Object.keys(fs).filter((key) => key !== dir && isInside(key, dir)).sort();

/** Total bytes of file content. */
export const usage = (fs: Fs) => Object.values(fs).reduce((sum, node) => sum + node.size, 0);
