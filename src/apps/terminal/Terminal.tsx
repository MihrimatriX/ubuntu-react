// GNOME Terminal: one TermSession per tab (Ctrl+Shift+T / +, Ctrl+Shift+W closes). Sessions live in a ref,
// so minimizing or switching tabs never loses scrollback; a ResizeObserver refits the active tab.
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { HOME } from "../../os/fs";
import { useOS, type MenuItem } from "../../os/store";
import { HeaderSlot, TabStrip } from "../../shell/chrome";
import type { AppProps } from "../registry";
import { TermSession } from "./session";

let tabCounter = 0;
const FONT = '15px "Ubuntu Mono"';

export default function TerminalApp({ windowId, args }: AppProps) {
  const [tabs, setTabs] = useState(() => [{ id: ++tabCounter, title: "ubuntu@ubuntu: ~" }]);
  const [active, setActive] = useState(tabs[0]!.id);
  // xterm measures the cell size once; opening it before Ubuntu Mono has loaded misaligns every column.
  const [fontReady, setFontReady] = useState(() => document.fonts.check(FONT));
  useEffect(() => {
    if (!fontReady)
      Promise.all([document.fonts.load(FONT), document.fonts.load(`bold ${FONT}`)]).finally(() => setFontReady(true));
  }, [fontReady]);
  const sessions = useRef(new Map<number, TermSession>());
  const hosts = useRef(new Map<number, HTMLDivElement>());
  const container = useRef<HTMLDivElement>(null);

  const addTab = () => {
    const id = ++tabCounter;
    setTabs((current) => [...current, { id, title: "ubuntu@ubuntu: ~" }]);
    setActive(id);
  };
  const closeTab = (id: number) => {
    sessions.current.get(id)?.dispose();
    sessions.current.delete(id);
    setTabs((current) => {
      const rest = current.filter((tab) => tab.id !== id);
      if (!rest.length) useOS.getState().closeWindow(windowId);
      else setActive((current) => (current === id ? rest.at(-1)!.id : current));
      return rest;
    });
  };

  // Create a session for every tab host that does not have one yet.
  useEffect(() => {
    if (!fontReady) return;
    for (const tab of tabs) {
      const host = hosts.current.get(tab.id);
      if (!host || sessions.current.has(tab.id)) continue;
      const session = new TermSession(host, args?.[0] ?? HOME, {
        onTitle: (title) => setTabs((current) => current.map((t) => (t.id === tab.id ? { ...t, title } : t))),
        onExit: () => closeTab(tab.id),
      });
      session.term.attachCustomKeyEventHandler((event) => {
        if (event.type !== "keydown" || !event.ctrlKey || !event.shiftKey) return true;
        if (event.code === "KeyT") addTab();
        else if (event.code === "KeyW") closeTab(tab.id);
        else if (event.code === "KeyN") useOS.getState().openApp("terminal", { newWindow: true });
        else if (event.code === "KeyC") navigator.clipboard?.writeText(session.term.getSelection());
        else return true;
        return false;
      });
      sessions.current.set(tab.id, session);
    }
  });

  useEffect(() => {
    const session = sessions.current.get(active);
    session?.resize();
    session?.term.focus();
    useOS.getState().patchWindow(windowId, { title: tabs.find((tab) => tab.id === active)?.title ?? "Terminal" });
  }, [active, tabs, windowId]);

  useEffect(() => {
    const observer = new ResizeObserver(() => sessions.current.get(active)?.resize());
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [active]);

  useEffect(() => () => sessions.current.forEach((session) => session.dispose()), []);

  function terminalMenu(): MenuItem[] {
    const term = sessions.current.get(active)?.term;
    const selection = term?.getSelection() ?? "";
    return [
      {
        label: "Copy",
        shortcut: "Shift+Ctrl+C",
        disabled: !selection,
        action: () => navigator.clipboard?.writeText(selection),
      },
      {
        label: "Paste",
        shortcut: "Shift+Ctrl+V",
        action: () =>
          navigator.clipboard
            ?.readText()
            .then((text) => term?.paste(text))
            .catch(() => undefined),
      },
      { label: "Select All", action: () => term?.selectAll() },
      "separator",
      { label: "New Tab", shortcut: "Shift+Ctrl+T", action: addTab },
      {
        label: "New Window",
        shortcut: "Shift+Ctrl+N",
        action: () => useOS.getState().openApp("terminal", { newWindow: true }),
      },
      "separator",
      { label: "Clear", action: () => term?.clear() },
    ];
  }

  return (
    <div
      className="flex h-full flex-col bg-[#300a24]"
      onPointerDown={() => setTimeout(() => sessions.current.get(active)?.term.focus())}
    >
      <HeaderSlot windowId={windowId}>
        <button aria-label="New Tab" title="New Tab (Ctrl+Shift+T)" className="btn btn-flat" onClick={addTab}>
          <Plus className="size-4" />
        </button>
      </HeaderSlot>
      {tabs.length > 1 && (
        <TabStrip
          tabs={tabs}
          active={active}
          title={(tab) => tab.title}
          onSelect={setActive}
          onClose={closeTab}
          className="bg-header p-1 [&>[role=tab]]:max-w-none"
        />
      )}
      <div
        ref={container}
        className="relative min-h-0 flex-1"
        onContextMenu={(e) => useOS.getState().openMenu(e, terminalMenu())}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            ref={(el) => {
              if (el) hosts.current.set(tab.id, el);
            }}
            className="absolute inset-0 py-1 pl-2"
            style={{ visibility: tab.id === active ? "visible" : "hidden" }}
          />
        ))}
      </div>
    </div>
  );
}
