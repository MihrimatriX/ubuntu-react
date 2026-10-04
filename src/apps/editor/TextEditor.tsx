// Text Editor (gnome-text-editor): one CodeMirror view per tab, all kept mounted so undo history survives.
// A tab is dirty while its doc differs from the last saved Text; the window title shows "•" and closing
// asks first (saveHandlers). Clean tabs reload when their file changes on disk (e.g. from Terminal).
import { useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import type { Text } from "@codemirror/state";
import { FilePlus, FolderOpen, Save } from "lucide-react";
import { basename, dirname, read, write, HOME } from "../../os/fs";
import { tryFs, useOS } from "../../os/store";
import { FilePicker } from "../../shell/FilePicker";
import { Dialog, HeaderSlot, saveHandlers, TabStrip } from "../../shell/chrome";
import type { AppProps } from "../registry";
import { createEditor, languageName, themeFor, themeSlot } from "./cm";

type Tab = { id: number; path: string | null; dirty: boolean };
type Doc = { view: EditorView; saved: Text };
let tabCounter = 0;

export default function TextEditor({ windowId, filePath }: AppProps) {
  const dark = useOS((state) => state.settings.theme === "dark");
  const fs = useOS((state) => state.fs);
  const [tabs, setTabs] = useState<Tab[]>(() => [{ id: ++tabCounter, path: filePath ?? null, dirty: false }]);
  const [active, setActive] = useState(tabs[0]!.id);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [picker, setPicker] = useState<null | { mode: "open" | "save"; tab?: number }>(null);
  const [closing, setClosing] = useState<Tab | null>(null);
  const docs = useRef(new Map<number, Doc>());
  const hosts = useRef(new Map<number, HTMLDivElement>());
  const commands = useRef<Record<string, () => boolean>>({});
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0]!;

  const patchTab = (id: number, patch: Partial<Tab>) => setTabs((all) => all.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)));
  const openTab = (path: string | null) => {
    const existing = tabs.find((tab) => tab.path && tab.path === path);
    if (existing) return setActive(existing.id);
    const id = ++tabCounter;
    setTabs((all) => [...all, { id, path, dirty: false }]);
    setActive(id);
  };
  const closeTab = (id: number, force = false) => {
    const tab = tabs.find((candidate) => candidate.id === id);
    if (tab?.dirty && !force) return setClosing(tab);
    docs.current.get(id)?.view.destroy();
    docs.current.delete(id);
    const rest = tabs.filter((candidate) => candidate.id !== id);
    if (!rest.length) return useOS.getState().closeWindow(windowId);
    setTabs(rest);
    if (id === active) setActive(rest.at(-1)!.id);
  };

  /** Saves a tab to `path` (or its own path); untitled tabs open the Save As picker and report false. */
  function save(id: number, path = tabs.find((tab) => tab.id === id)?.path): boolean {
    const doc = docs.current.get(id);
    if (!doc) return false;
    if (!path) {
      setPicker({ mode: "save", tab: id });
      return false;
    }
    if (!tryFs((next) => write(next, path, doc.view.state.doc.toString()), "Save")) return false;
    doc.saved = doc.view.state.doc;
    patchTab(id, { path, dirty: false });
    return true;
  }

  const handled = (action: () => void) => () => {
    action();
    return true;
  };
  commands.current = {
    "Mod-s": () => save(active),
    "Mod-Shift-s": handled(() => setPicker({ mode: "save", tab: active })),
    "Mod-o": handled(() => setPicker({ mode: "open" })),
    "Mod-t": handled(() => openTab(null)),
    "Mod-w": handled(() => closeTab(active)),
  };

  // Mount a CodeMirror view for each new tab.
  useEffect(() => {
    for (const tab of tabs) {
      const host = hosts.current.get(tab.id);
      if (!host || docs.current.has(tab.id)) continue;
      const text = tab.path && useOS.getState().fs[tab.path] ? read(useOS.getState().fs, tab.path) : "";
      const view = createEditor(host, text, tab.path, dark, {
        commands: Object.fromEntries(Object.keys(commands.current).map((key) => [key, () => commands.current[key]!()])),
        onUpdate: (updated) => {
          const doc = docs.current.get(tab.id);
          const head = updated.state.selection.main.head;
          const line = updated.state.doc.lineAt(head);
          setCursor({ line: line.number, col: head - line.from + 1 });
          if (doc) patchTab(tab.id, { dirty: !updated.state.doc.eq(doc.saved) });
        },
      });
      docs.current.set(tab.id, { view, saved: view.state.doc });
    }
  });

  useEffect(() => {
    docs.current.forEach(({ view }) => view.dispatch({ effects: themeSlot.reconfigure(themeFor(dark)) }));
  }, [dark]);
  useEffect(() => {
    docs.current.get(active)?.view.focus();
  }, [active]);
  useEffect(() => () => docs.current.forEach(({ view }) => view.destroy()), []);
  useEffect(() => { if (filePath) openTab(filePath); }, [filePath]);

  // Reload clean tabs whose file changed elsewhere.
  useEffect(() => {
    for (const tab of tabs) {
      const doc = docs.current.get(tab.id);
      const node = tab.path ? fs[tab.path] : undefined;
      if (!doc || tab.dirty || node?.type !== "file" || node.content === doc.view.state.doc.toString()) continue;
      doc.view.dispatch({ changes: { from: 0, to: doc.view.state.doc.length, insert: node.content ?? "" } });
      doc.saved = doc.view.state.doc;
      patchTab(tab.id, { dirty: false });
    }
  }, [fs]);

  const anyDirty = tabs.some((tab) => tab.dirty);
  useEffect(() => {
    useOS.getState().patchWindow(windowId, { title: current.path ? basename(current.path) : "Untitled Document", dirty: anyDirty });
    saveHandlers.set(windowId, () => tabs.every((tab) => !tab.dirty || save(tab.id)));
    return () => void saveHandlers.delete(windowId);
  }, [current.path, anyDirty, windowId, tabs]);

  const pickerDir = current.path ? dirname(current.path) : `${HOME}/Documents`;
  return (
    <div className="flex h-full flex-col bg-view">
      <HeaderSlot windowId={windowId}>
        <button className="btn" onClick={() => setPicker({ mode: "open" })}><FolderOpen className="size-4" />Open</button>
        <button aria-label="New Tab" title="New Tab (Ctrl+T)" className="btn btn-flat" onClick={() => openTab(null)}><FilePlus className="size-4" /></button>
      </HeaderSlot>
      <HeaderSlot windowId={windowId} side="end">
        <button aria-label="Save" title="Save (Ctrl+S)" className="btn btn-flat" onClick={() => save(active)}><Save className="size-4" /></button>
        <button className="btn btn-flat text-sm" onClick={() => setPicker({ mode: "save", tab: active })}>Save As…</button>
      </HeaderSlot>
      {tabs.length > 1 && (
        <TabStrip tabs={tabs} active={active} onSelect={setActive} onClose={closeTab} className="border-b border-line bg-header p-1 [&>[role=tab]]:max-w-none"
          title={(tab) => `${tab.dirty ? "• " : ""}${tab.path ? basename(tab.path) : "Untitled Document"}`} />
      )}
      <div className="relative min-h-0 flex-1">
        {tabs.map((tab) => (
          <div key={tab.id} ref={(el) => { if (el) hosts.current.set(tab.id, el); }} className="absolute inset-0" style={{ display: tab.id === active ? "block" : "none" }} />
        ))}
      </div>
      <footer className="flex justify-end gap-6 border-t border-line bg-window px-3 py-1 text-xs text-fg-dim">
        <span>{languageName(current.path)}</span><span>Ln {cursor.line}, Col {cursor.col}</span>
      </footer>
      {closing && (
        <Dialog title="Save Changes?" body={`“${closing.path ? basename(closing.path) : "Untitled Document"}” has unsaved changes.`} onCancel={() => setClosing(null)}
          actions={[
            { label: "Discard", style: "danger", run: () => { setClosing(null); closeTab(closing.id, true); } },
            { label: "Save", style: "accent", run: () => { setClosing(null); if (save(closing.id)) closeTab(closing.id, true); } },
          ]} />
      )}
      {picker && (
        <FilePicker mode={picker.mode} title={picker.mode === "open" ? "Open File" : "Save As"} initialDir={pickerDir}
          initialName={current.path ? basename(current.path) : "Untitled Document.txt"}
          accept={(mime) => mime.startsWith("text/") || mime === "application/json"} onCancel={() => setPicker(null)}
          onPick={(path) => { setPicker(null); if (picker.mode === "open") openTab(path); else save(picker.tab ?? active, path); }} />
      )}
    </div>
  );
}
