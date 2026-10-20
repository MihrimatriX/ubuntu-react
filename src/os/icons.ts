// Icon URLs, bundled from public/yaru-icons. fileIcon() picks the icon for a VFS node by type, path and MIME.
import calculator from "../../public/yaru-icons/calculator.svg";
import clocks from "../../public/yaru-icons/clocks.svg";
import codeFile from "../../public/yaru-icons/code-file.svg";
import files from "../../public/yaru-icons/files.svg";
import firefox from "../../public/yaru-icons/firefox.svg";
import folder from "../../public/yaru-icons/folder.svg";
import genericFile from "../../public/yaru-icons/generic-file.svg";
import imageFile from "../../public/yaru-icons/image-file.svg";
import imageViewer from "../../public/yaru-icons/image-viewer.svg";
import mines from "../../public/yaru-icons/mines.svg";
import settings from "../../public/yaru-icons/settings.svg";
import systemMonitor from "../../public/yaru-icons/system-monitor.svg";
import terminal from "../../public/yaru-icons/terminal.svg";
import textEditor from "../../public/yaru-icons/text-editor.svg";
import textFile from "../../public/yaru-icons/text-file.svg";
import trashFull from "../../public/yaru-icons/trash-full.svg";
import trash from "../../public/yaru-icons/trash.svg";
import userDesktop from "../../public/yaru-icons/user-desktop.svg";
import userHome from "../../public/yaru-icons/user-home.svg";
import { HOME, TRASH, type FsNode } from "./fs";

export const ICONS = {
  calculator: calculator,
  clocks: clocks,
  "code-file": codeFile,
  files: files,
  firefox: firefox,
  folder: folder,
  "generic-file": genericFile,
  "image-file": imageFile,
  "image-viewer": imageViewer,
  mines: mines,
  settings: settings,
  "system-monitor": systemMonitor,
  terminal: terminal,
  "text-editor": textEditor,
  "text-file": textFile,
  "trash-full": trashFull,
  trash: trash,
  "user-desktop": userDesktop,
  "user-home": userHome,
};

const CODE = /^(text\/(javascript|typescript|html|css|x-python|x-shellscript)|application\/json)$/;

export function fileIcon(path: string, node: FsNode): string {
  if (node.type === "dir") {
    if (path === HOME) return ICONS["user-home"];
    if (path === `${HOME}/Desktop`) return ICONS["user-desktop"];
    if (path === TRASH) return ICONS.trash;
    return ICONS.folder;
  }
  const mime = node.mime ?? "";
  if (mime.startsWith("image/")) return node.content || ICONS["image-file"];
  if (CODE.test(mime)) return ICONS["code-file"];
  if (mime.startsWith("text/")) return ICONS["text-file"];
  return ICONS["generic-file"];
}
