// Nautilus path bar: clickable breadcrumbs (Home-relative), or a text entry (Ctrl+L / click) that accepts
// absolute, ~ or relative paths and reports "No such folder" errors.
import { useState } from "react";
import { Home } from "lucide-react";
import { HOME, TRASH, resolve } from "../../os/fs";
import { notify, useOS } from "../../os/store";
import { RECENT, STARRED } from "./entries";

const SPECIAL: Record<string, string> = { [RECENT]: "Recent", [STARRED]: "Starred", [TRASH]: "Trash" };

type Props = { location: string; editing: boolean; setEditing: (editing: boolean) => void; onNavigate: (path: string) => void };

export function PathBar({ location, editing, setEditing, onNavigate }: Props) {
  const [text, setText] = useState("");
  const inHome = location === HOME || location.startsWith(`${HOME}/`);
  const parts = inHome ? location.slice(HOME.length).split("/").filter(Boolean) : location.split("/").filter(Boolean);
  const crumbs = [{ label: inHome ? "Home" : "/", path: inHome ? HOME : "/" }];
  parts.forEach((part, index) => crumbs.push({ label: part, path: `${crumbs[0]!.path === "/" ? "" : crumbs[0]!.path}/${parts.slice(0, index + 1).join("/")}` }));

  if (editing) {
    const submit = () => {
      const target = resolve(location.includes("://") ? HOME : location, text.trim() || ".");
      if (useOS.getState().fs[target]?.type === "dir") onNavigate(target);
      else notify({ title: "Unable to find the requested location", body: `${text}: No such folder` });
      setEditing(false);
    };
    return (
      <input autoFocus aria-label="Location" defaultValue={location.includes("://") ? "" : location} onChange={(e) => setText(e.target.value)}
        onFocus={(e) => { setText(e.target.value); e.target.select(); }} onBlur={() => setEditing(false)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") submit(); if (e.key === "Escape") setEditing(false); }}
        className="field w-[420px] max-w-full" />
    );
  }

  return (
    <div className="flex h-[34px] min-w-0 items-center gap-0.5 rounded-md bg-hover px-1 text-sm" onClick={(e) => e.target === e.currentTarget && setEditing(true)}>
      {SPECIAL[location] ? (
        <span className="px-2 font-bold">{SPECIAL[location]}</span>
      ) : (
        crumbs.map((crumb, index) => (
          <span key={crumb.path} className="flex min-w-0 items-center">
            {index > 0 && <span className="px-0.5 text-fg-dim">/</span>}
            <button className={`flex items-center gap-1.5 truncate rounded px-2 py-1 hover:bg-hover ${index === crumbs.length - 1 ? "font-bold" : ""}`} onClick={() => onNavigate(crumb.path)}>
              {crumb.label === "Home" && <Home className="size-3.5" />}{crumb.label}
            </button>
          </span>
        ))
      )}
    </div>
  );
}
