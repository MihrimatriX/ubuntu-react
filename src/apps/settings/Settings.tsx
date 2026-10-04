// GNOME Settings: a searchable sidebar generated from the PAGES array; args[0] (e.g. "background") picks
// the page, so desktop menu items like "Change Background…" deep-link into it.
import { useEffect, useState, type FC, type ReactNode } from "react";
import { Bell, Bluetooth as BluetoothIcon, Clock, Info, Keyboard as KeyboardIcon, LayoutGrid, Monitor, Palette, PanelLeft, Search, Volume2, Wifi as WifiIcon, Zap } from "lucide-react";
import { useOS } from "../../os/store";
import type { AppProps } from "../registry";
import { About, Appearance, Keyboard, Sound, UbuntuDesktop } from "./pages";
import { Bluetooth, DateTime, Displays, Multitasking, Notifications, Power, Wifi } from "./system-pages";

const PAGES: { id: string; label: string; icon: ReactNode; page: FC; aliases?: string }[] = [
  { id: "wifi", label: "Wi-Fi", icon: <WifiIcon />, page: Wifi, aliases: "network wireless" },
  { id: "bluetooth", label: "Bluetooth", icon: <BluetoothIcon />, page: Bluetooth },
  { id: "displays", label: "Displays", icon: <Monitor />, page: Displays, aliases: "resolution scale night light" },
  { id: "sound", label: "Sound", icon: <Volume2 />, page: Sound, aliases: "volume audio" },
  { id: "power", label: "Power", icon: <Zap />, page: Power, aliases: "battery blank lock" },
  { id: "multitasking", label: "Multitasking", icon: <LayoutGrid />, page: Multitasking, aliases: "hot corner workspaces" },
  { id: "appearance", label: "Appearance", icon: <Palette />, page: Appearance, aliases: "dark style accent background wallpaper" },
  { id: "ubuntu-desktop", label: "Ubuntu Desktop", icon: <PanelLeft />, page: UbuntuDesktop, aliases: "dock icons" },
  { id: "notifications", label: "Notifications", icon: <Bell />, page: Notifications, aliases: "do not disturb" },
  { id: "keyboard", label: "Keyboard", icon: <KeyboardIcon />, page: Keyboard, aliases: "shortcuts" },
  { id: "datetime", label: "Date & Time", icon: <Clock />, page: DateTime, aliases: "clock" },
  { id: "about", label: "About", icon: <Info />, page: About, aliases: "system reset device" },
];
const ALIASES: Record<string, string> = { background: "appearance" };

export default function Settings({ windowId, args }: AppProps) {
  const [pageId, setPageId] = useState(args?.[0] ?? "wifi");
  const [query, setQuery] = useState("");
  const current = PAGES.find((page) => page.id === (ALIASES[pageId] ?? pageId)) ?? PAGES[0]!;
  const Page = current.page;
  const visible = PAGES.filter((page) => `${page.label} ${page.aliases ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (args?.[0]) setPageId(args[0]);
  }, [args]);
  useEffect(() => {
    useOS.getState().patchWindow(windowId, { title: current.label });
  }, [current.label, windowId]);

  return (
    <div className="flex h-full">
      <nav aria-label="Settings" className="flex w-60 shrink-0 flex-col gap-0.5 overflow-y-auto bg-sidebar p-2">
        <label className="mb-2 flex shrink-0 items-center gap-2 rounded-md bg-hover px-2">
          <Search className="size-4 text-fg-dim" />
          <input aria-label="Search settings" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        {visible.map((page) => (
          <button key={page.id} aria-current={page.id === current.id} onClick={() => setPageId(page.id)}
            className={`flex h-10 shrink-0 items-center gap-3 rounded-md px-3 text-left text-sm [&>svg]:size-4 ${page.id === current.id ? "bg-hover font-bold" : "hover:bg-hover"}`}>
            {page.icon}{page.label}
          </button>
        ))}
      </nav>
      <main className="relative min-w-0 flex-1 overflow-y-auto bg-window">
        <div className="mx-auto max-w-2xl p-6"><Page /></div>
      </main>
    </div>
  );
}
