// Initial VFS contents for a fresh install (and "Reset system"). Image files store a URL or data URL
// in `content`; the Image Viewer and wallpaper picker use it directly as an <img> src.
import { HOME, mkdir, write, type Fs } from "./fs";
import noble from "../../public/wallpapers/noble.svg";
import aubergine from "../../public/wallpapers/aubergine.svg";
import dawn from "../../public/wallpapers/dawn.svg";
import graphite from "../../public/wallpapers/graphite.svg";

export const WALLPAPERS = [
  { name: "Noble Numbat", url: noble },
  { name: "Aubergine", url: aubergine },
  { name: "Dawn", url: dawn },
  { name: "Graphite", url: graphite },
];

export const UBUNTU_LOGO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#E95420"/>' +
    '<circle cx="50" cy="50" r="22" fill="none" stroke="#fff" stroke-width="9"/>' +
    '<g fill="#fff"><circle cx="24" cy="50" r="9"/><circle cx="63" cy="27" r="9"/><circle cx="63" cy="73" r="9"/></g></svg>',
)}`;

const README = `Welcome to Ubuntu 24.04 LTS (Noble Numbat) — in your browser!

Everything here runs on a shared virtual file system:
  * Create a file in Terminal:   echo hello > ~/Desktop/hi.txt
  * It shows up in Files and on the Desktop instantly.
  * Double-click it to open it in Text Editor.

Shortcuts: Super (or Ctrl+Shift+Space) opens Activities, Ctrl+Alt+T opens Terminal.
`;

const NOTES = `# Notes

- [x] Boot Ubuntu
- [ ] Try \`neofetch\` in Terminal
- [ ] Change the wallpaper (right-click the desktop)
`;

const HELLO_PY = `def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("Ubuntu"))
`;

export function seedFs(): Fs {
  let fs: Fs = { "/": { type: "dir", mtime: Date.now(), size: 4096 } };
  for (const dir of ["Desktop", "Documents", "Downloads", "Music", "Pictures/Wallpapers", "Videos", ".local/share/Trash/files", ".local/share/Trash/info"]) {
    fs = mkdir(fs, `${HOME}/${dir}`, true);
  }
  fs = mkdir(fs, "/etc", true);
  fs = write(fs, "/etc/hostname", "ubuntu\n");
  fs = write(fs, "/etc/os-release", 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION_CODENAME=noble\n');
  fs = write(fs, `${HOME}/README.txt`, README);
  fs = write(fs, `${HOME}/Documents/notes.md`, NOTES);
  fs = write(fs, `${HOME}/Documents/hello.py`, HELLO_PY);
  fs = write(fs, `${HOME}/Desktop/Welcome.txt`, README);
  fs = write(fs, `${HOME}/Pictures/ubuntu-logo.svg`, UBUNTU_LOGO);
  for (const wallpaper of WALLPAPERS) {
    fs = write(fs, `${HOME}/Pictures/Wallpapers/${wallpaper.name.toLowerCase().replace(/ /g, "-")}.svg`, wallpaper.url);
  }
  return fs;
}
