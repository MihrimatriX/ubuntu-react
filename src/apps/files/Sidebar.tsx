// Nautilus sidebar: Recent / Starred / Home / XDG folders / Trash. Entries are drop targets for dragged files.
import { Clock, Download, FileText, Home, Image, Monitor, Music, Star, Trash2, Video } from "lucide-react";
import type { ReactNode } from "react";
import { HOME, TRASH } from "../../os/fs";
import { useOS } from "../../os/store";
import { dropPaths } from "./dnd";
import { RECENT, STARRED } from "./entries";

const PLACES: [string, string, ReactNode][] = [
  [RECENT, "Recent", <Clock />],
  [STARRED, "Starred", <Star />],
  [HOME, "Home", <Home />],
  [`${HOME}/Desktop`, "Desktop", <Monitor />],
  [`${HOME}/Documents`, "Documents", <FileText />],
  [`${HOME}/Downloads`, "Downloads", <Download />],
  [`${HOME}/Music`, "Music", <Music />],
  [`${HOME}/Pictures`, "Pictures", <Image />],
  [`${HOME}/Videos`, "Videos", <Video />],
  [TRASH, "Trash", <Trash2 />],
];

export function Sidebar({ current, onNavigate }: { current: string; onNavigate: (path: string) => void }) {
  const fs = useOS((state) => state.fs);
  return (
    <nav aria-label="Places" className="flex w-52 shrink-0 flex-col gap-0.5 overflow-y-auto bg-sidebar p-2 text-sm">
      {PLACES.map(([path, label, icon]) => {
        const exists = path.includes("://") || fs[path];
        return (
          <button
            key={path}
            disabled={!exists}
            aria-current={current === path}
            onClick={() => onNavigate(path)}
            onDragOver={(e) => !path.includes("://") && e.preventDefault()}
            onDrop={(e) => dropPaths(e, path)}
            className={`flex h-9 items-center gap-3 rounded-md px-3 text-left [&>svg]:size-4 disabled:opacity-40 ${current === path ? "bg-accent/15 font-bold text-accent" : "hover:bg-hover"}`}
          >
            {icon}
            {label}
          </button>
        );
      })}
    </nav>
  );
}
