// HTML5 drag-and-drop of VFS paths between Files windows, the sidebar and the desktop. Dropping moves
// (Ctrl copies); dropping onto Trash trashes. Moves into the same folder or into themselves are skipped.
import type { DragEvent } from "react";
import { TRASH, cp, dirname, mv, trash } from "../../os/fs";
import { tryFs } from "../../os/store";

const TYPE = "application/x-vfs-paths";

export function dragPaths(event: DragEvent, paths: string[]) {
  event.dataTransfer.setData(TYPE, JSON.stringify(paths));
  event.dataTransfer.effectAllowed = "copyMove";
}

export const acceptsPaths = (event: DragEvent) => event.dataTransfer.types.includes(TYPE);

export function dropPaths(event: DragEvent, dir: string) {
  const raw = event.dataTransfer.getData(TYPE);
  if (!raw) return;
  event.preventDefault();
  event.stopPropagation();
  const paths = (JSON.parse(raw) as string[]).filter((path) => dirname(path) !== dir && !`${dir}/`.startsWith(`${path}/`));
  if (!paths.length) return;
  tryFs((fs) => paths.reduce((next, path) => (dir === TRASH ? trash(next, path) : event.ctrlKey ? cp(next, path, dir, true) : mv(next, path, dir)), fs), "Move");
}
