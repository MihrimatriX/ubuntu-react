// xdg-open for the VFS: directories open in Files, files in the first app whose `opens` matches their
// MIME type, anything else raises the shared "Open With" dialog. Used by Desktop, Files, Overview and the shell.
import { appForMime } from "../apps/registry";
import { HOME, basename, cp, dirname, mkdir, mv, uniqueName, write } from "./fs";
import { ICONS } from "./icons";
import { notify, tryFs, useOS } from "./store";

export function openPath(path: string, appId?: string): void {
  const os = useOS.getState();
  const node = os.fs[path];
  if (!node) return notify({ title: "Could not open", body: `${path}: No such file or directory` });
  if (appId) return void os.openApp(appId, { filePath: path });
  if (node.type === "dir") return void os.openApp("files", { filePath: path });
  const app = appForMime(node.mime ?? "");
  if (app) os.openApp(app.id, { filePath: path });
  else os.setOpenWith(path);
}

/** Fake screenshot: saves the current wallpaper as ~/Pictures/Screenshots/Screenshot from <date>.png. */
export function takeScreenshot(): void {
  const os = useOS.getState();
  const stamp = new Date().toISOString().slice(0, 19).replace("T", " ").replace(/:/g, "-");
  const path = `${HOME}/Pictures/Screenshots/Screenshot from ${stamp}.png`;
  const saved = tryFs((fs) => write(mkdir(fs, dirname(path), true), path, os.settings.wallpaper), "Screenshot");
  if (saved) notify({ title: "Screenshot captured", body: path.slice(HOME.length + 1), icon: ICONS["image-viewer"], action: { label: "Show in Files", run: () => openPath(dirname(path)) } });
}

/** Pastes the clipboard into `dir`: copies get a unique name, cuts are moved and clear the clipboard. */
export function pasteInto(dir: string): void {
  const { clipboard, setClipboard } = useOS.getState();
  if (!clipboard) return;
  const ok = tryFs((fs) =>
    clipboard.paths.reduce((next, src) => {
      if (clipboard.cut) return dirname(src) === dir ? next : mv(next, src, `${dir}/${uniqueName(next, dir, basename(src))}`);
      return cp(next, src, `${dir}/${uniqueName(next, dir, basename(src))}`, true);
    }, fs), "Paste");
  if (ok && clipboard.cut) setClipboard(null);
}

/** Creates "New Folder" / "Untitled Document" (uniquely named) in `dir` and returns its path. */
export function createIn(dir: string, kind: "dir" | "file"): string | undefined {
  const name = uniqueName(useOS.getState().fs, dir, kind === "dir" ? "New Folder" : "Untitled Document");
  const path = `${dir}/${name}`;
  return tryFs((fs) => (kind === "dir" ? mkdir(fs, path) : write(fs, path, "")), "Create") ? path : undefined;
}

/** Renames in place; empty names, "/" and clashes are rejected with a notification. */
export function renamePath(path: string, name: string): boolean {
  const trimmed = name.trim();
  const target = `${dirname(path) === "/" ? "" : dirname(path)}/${trimmed}`;
  const problem = trimmed.includes("/") ? "File names cannot contain “/”." : useOS.getState().fs[target] ? `“${trimmed}” already exists.` : "";
  if (!trimmed || trimmed === basename(path)) return false;
  if (problem) {
    notify({ title: "Rename failed", body: problem });
    return false;
  }
  return tryFs((fs) => mv(fs, path, target), "Rename");
}
