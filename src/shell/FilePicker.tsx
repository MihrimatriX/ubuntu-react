// GTK-style file chooser over the VFS, shown as a sheet inside the calling window. "open" picks an
// existing file (optionally filtered by MIME), "save" picks a folder + typed name. Reuses Files' entry logic.
import { useState } from "react";
import { ArrowUp } from "lucide-react";
import { entriesFor, sortEntries } from "../apps/files/entries";
import { HOME, dirname, resolve } from "../os/fs";
import { fileIcon } from "../os/icons";
import { useOS } from "../os/store";

type Props = {
  mode: "open" | "save"; title: string; initialDir?: string; initialName?: string;
  accept?: (mime: string) => boolean; onPick: (path: string) => void; onCancel: () => void;
};

export function FilePicker({ mode, title, initialDir = HOME, initialName = "", accept, onPick, onCancel }: Props) {
  const fs = useOS((state) => state.fs);
  const [dir, setDir] = useState(fs[initialDir]?.type === "dir" ? initialDir : HOME);
  const [name, setName] = useState(initialName);
  const [selected, setSelected] = useState<string | null>(null);
  const entries = sortEntries(entriesFor(fs, dir, { hidden: false, starred: [] }), "name", false)
    .filter((entry) => entry.node.type === "dir" || !accept || accept(entry.node.mime ?? ""));
  const target = mode === "save" ? (name.trim() ? resolve(dir, name.trim()) : null) : selected;
  const confirm = () => target && onPick(target);

  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/40 p-4" onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") onCancel(); }}>
      <div role="dialog" aria-label={title} className="anim-pop flex h-full max-h-[460px] w-full max-w-[560px] flex-col overflow-hidden rounded-xl bg-window shadow-2xl">
        <header className="flex items-center gap-2 border-b border-line bg-header p-2">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <h3 className="flex-1 text-center text-sm font-bold">{title}</h3>
          <button className="btn btn-accent" disabled={!target} onClick={confirm}>{mode === "save" ? "Save" : "Open"}</button>
        </header>
        <div className="flex items-center gap-2 p-2">
          <button aria-label="Parent folder" className="btn" disabled={dir === "/"} onClick={() => setDir(dirname(dir))}><ArrowUp className="size-4" /></button>
          <span className="field flex flex-1 items-center truncate">{dir.replace(HOME, "~")}</span>
        </div>
        {mode === "save" && (
          <label className="flex items-center gap-2 px-2 pb-2 text-sm">
            Name
            <input autoFocus className="field flex-1" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirm()} />
          </label>
        )}
        <div role="listbox" className="min-h-0 flex-1 overflow-y-auto bg-view p-1">
          {entries.map((entry) => (
            <button key={entry.path} role="option" aria-selected={selected === entry.path}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${selected === entry.path ? "bg-accent/20" : "hover:bg-hover"}`}
              onClick={() => (entry.node.type === "dir" ? setDir(entry.path) : mode === "save" ? setName(entry.name) : setSelected(entry.path))}
              onDoubleClick={() => entry.node.type === "file" && onPick(entry.path)}>
              <img src={fileIcon(entry.path, entry.node)} alt="" className="size-6 object-contain" />{entry.name}
            </button>
          ))}
          {!entries.length && <p className="mt-10 text-center text-sm text-fg-dim">No matching files</p>}
        </div>
      </div>
    </div>
  );
}
