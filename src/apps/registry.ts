// App registry: one entry per app. Dock, App Grid, search, "Open With" and MIME → app routing all read
// this list, so adding an app = one entry here + one component file. Components are code-split via lazy().
import { lazy, type FC, type LazyExoticComponent } from "react";
import { ICONS } from "../os/icons";

export type AppProps = { windowId: string; filePath?: string; args?: string[] };

export type AppDef = {
  id: string;
  name: string;
  description: string;
  icon: string;
  component: LazyExoticComponent<FC<AppProps>>;
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  singleInstance?: boolean;
  pinned?: boolean;
  /** MIME types this app can open; "type/*" matches a whole family. */
  opens?: string[];
  keywords?: string;
  /** The app draws its own title-bar content (e.g. Firefox tabs) instead of a centered title. */
  hideTitle?: boolean;
};

export const APPS: AppDef[] = [
  { id: "firefox", name: "Firefox", description: "Browse the World Wide Web", icon: ICONS.firefox, component: lazy(() => import("./firefox/Firefox")),
    defaultSize: { w: 1000, h: 680 }, minSize: { w: 420, h: 300 }, pinned: true, hideTitle: true, opens: ["text/html"], keywords: "web browser internet" },
  { id: "files", name: "Files", description: "Access and organize files", icon: ICONS.files, component: lazy(() => import("./files/Files")),
    defaultSize: { w: 880, h: 560 }, minSize: { w: 480, h: 320 }, pinned: true, opens: ["inode/directory"], keywords: "nautilus folder explorer" },
  { id: "terminal", name: "Terminal", description: "Use the command line", icon: ICONS.terminal, component: lazy(() => import("./terminal/Terminal")),
    defaultSize: { w: 760, h: 480 }, minSize: { w: 360, h: 220 }, pinned: true, keywords: "shell console command bash" },
  { id: "text-editor", name: "Text Editor", description: "Edit text files", icon: ICONS["text-editor"], component: lazy(() => import("./editor/TextEditor")),
    defaultSize: { w: 780, h: 560 }, minSize: { w: 360, h: 240 }, pinned: true,
    opens: ["text/*", "application/json"], keywords: "gedit gnome-text-editor notepad code" },
  { id: "calculator", name: "Calculator", description: "Perform arithmetic, scientific or financial calculations", icon: ICONS.calculator, component: lazy(() => import("./calculator/Calculator")),
    defaultSize: { w: 360, h: 560 }, minSize: { w: 320, h: 480 }, singleInstance: true, hideTitle: true, keywords: "math" },
  { id: "image-viewer", name: "Image Viewer", description: "View images", icon: ICONS["image-viewer"], component: lazy(() => import("./imageviewer/ImageViewer")),
    defaultSize: { w: 820, h: 600 }, minSize: { w: 360, h: 260 }, opens: ["image/*"], keywords: "photo picture loupe eog" },
  { id: "system-monitor", name: "System Monitor", description: "View current processes and monitor system state", icon: ICONS["system-monitor"], component: lazy(() => import("./monitor/SystemMonitor")),
    defaultSize: { w: 820, h: 560 }, minSize: { w: 480, h: 320 }, singleInstance: true, keywords: "task manager process cpu memory" },
  { id: "settings", name: "Settings", description: "Utility to configure the GNOME desktop", icon: ICONS.settings, component: lazy(() => import("./settings/Settings")),
    defaultSize: { w: 900, h: 620 }, minSize: { w: 560, h: 400 }, singleInstance: true, pinned: true,
    keywords: "preferences control wallpaper background appearance dock" },
  { id: "clocks", name: "Clocks", description: "Clocks for world times, plus alarms, stopwatch and a timer", icon: ICONS.clocks, component: lazy(() => import("./clocks/Clocks")),
    defaultSize: { w: 620, h: 520 }, minSize: { w: 420, h: 380 }, singleInstance: true, keywords: "time stopwatch timer world alarm" },
  { id: "mines", name: "Mines", description: "Clear hidden mines from a minefield", icon: ICONS.mines, component: lazy(() => import("./mines/Mines")),
    defaultSize: { w: 560, h: 600 }, minSize: { w: 340, h: 400 }, keywords: "game minesweeper" },
];

export const appById = (id: string) => APPS.find((app) => app.id === id);

const matches = (pattern: string, mime: string) =>
  pattern === mime || (pattern.endsWith("/*") && mime.startsWith(pattern.slice(0, -1)));

/** First app able to open `mime`, or undefined (→ "Open With" dialog). */
export const appForMime = (mime: string) => APPS.find((app) => app.opens?.some((pattern) => matches(pattern, mime)));
