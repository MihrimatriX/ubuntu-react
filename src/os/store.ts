// The single global store (zustand). Window management lives in windows.ts; this file adds the VFS,
// settings, notifications, session/overlay state and clipboard. Only fs, settings, terminal history and
// one-time flags are persisted — versioned, with `migrate` and a defaults-merge for new settings keys.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { APPS } from "../apps/registry";
import type { DockPosition } from "../lib/snap";
import { FsError, type Fs } from "./fs";
import { WALLPAPERS, seedFs } from "./seed";
import { createStorage } from "./storage";
import { createWindowSlice, type WindowSlice } from "./windows";

export const ACCENTS: Record<string, string> = {
  Orange: "#E95420", Bark: "#787859", Sage: "#657B69", Olive: "#4B8501", Viridian: "#03875B",
  Prussian: "#308280", Blue: "#0073E5", Purple: "#7764D8", Magenta: "#B34CB3", Red: "#DA3450",
};

/** Simulated radios: Wi-Fi networks (name, signal 0-3, secured) and paired Bluetooth devices. */
export const NETWORKS: [string, number, boolean][] = [["Ubuntu-Home", 3, true], ["Noble-5G", 2, true], ["Cafe Free WiFi", 1, false]];
export const WORLD_CITIES = [["Istanbul", "Europe/Istanbul"], ["London", "Europe/London"], ["New York", "America/New_York"], ["Tokyo", "Asia/Tokyo"], ["Sydney", "Australia/Sydney"]] as const;
export const BT_DEVICES = ["WH-1000XM4 Headphones", "MX Keys Keyboard", "Pixel 8"];

export type Settings = {
  theme: "light" | "dark"; accent: string; wallpaper: string;
  dockPosition: DockPosition; dockIconSize: number; dockAutohide: boolean; dockPanel: boolean; dockTrash: boolean; pinned: string[];
  desktopIconSize: number; showHome: boolean; showTrash: boolean; hotCorner: boolean; powerMode: "performance" | "balanced" | "power-saver";
  wifiNetwork: string; btConnected: string[]; blankMinutes: number; lockNotifications: boolean;
  clock24: boolean; volume: number; brightness: number;
  wifi: boolean; bluetooth: boolean; nightLight: boolean; dnd: boolean; deviceName: string; starred: string[];
};

const defaultSettings = (): Settings => ({
  theme: "light", accent: ACCENTS.Orange!, wallpaper: WALLPAPERS[0]!.url,
  dockPosition: "left", dockIconSize: 48, dockAutohide: false, dockPanel: true, dockTrash: false,
  desktopIconSize: 48, showHome: true, showTrash: true, hotCorner: true, powerMode: "balanced",
  wifiNetwork: "Ubuntu-Home", btConnected: [], blankMinutes: 5, lockNotifications: true, pinned: APPS.filter((app) => app.pinned).map((app) => app.id),
  clock24: true, volume: 60, brightness: 100, wifi: true, bluetooth: false, nightLight: false, dnd: false, deviceName: "ubuntu", starred: [],
});

export type Note = { id: number; title: string; body?: string; icon?: string; time: number; action?: { label: string; run: () => void } };
export type Session = "boot" | "login" | "desktop" | "off";
type Overlay = "none" | "overview" | "grid";
type Clipboard = { paths: string[]; cut: boolean } | null;
export type MenuItem = { label: string; action?: () => void; disabled?: boolean; checked?: boolean; shortcut?: string } | "separator";
export type Menu = { x: number; y: number; items: MenuItem[] } | null;

type CoreSlice = {
  fs: Fs;
  updateFs: (change: (fs: Fs) => Fs) => void;
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  notes: Note[];
  toasts: number[];
  notify: (note: Omit<Note, "id" | "time">) => void;
  dismissToast: (id: number) => void;
  clearNotes: () => void;
  session: Session;
  locked: boolean;
  setSession: (session: Session) => void;
  setLocked: (locked: boolean) => void;
  overlay: Overlay;
  setOverlay: (overlay: Overlay) => void;
  clipboard: Clipboard;
  setClipboard: (clipboard: Clipboard) => void;
  termHistory: string[];
  pushHistory: (command: string) => void;
  hintShown: boolean;
  /** Alt+Tab selection index into switcherWindows(), null when the switcher is closed. */
  switcher: number | null;
  /** On-screen display for volume/brightness keys; hides itself after a moment. */
  osd: { kind: "volume" | "brightness"; value: number } | null;
  showOsd: (kind: "volume" | "brightness", delta: number) => void;
  setSwitcher: (index: number | null) => void;
  menu: Menu;
  openMenu: (event: { clientX: number; clientY: number; preventDefault: () => void }, items: MenuItem[]) => void;
  closeMenu: () => void;
  openWith: string | null;
  setOpenWith: (path: string | null) => void;
  iconPositions: Record<string, { x: number; y: number }>;
  setIconPosition: (path: string, position: { x: number; y: number }) => void;
  resetSystem: () => void;
};

export type OSState = CoreSlice & WindowSlice;
type Persisted = Pick<OSState, "fs" | "settings" | "termHistory" | "hintShown" | "iconPositions">;

const TOAST_MS = 5000;
const OSD_MS = 1500;
let osdTimer: ReturnType<typeof setTimeout> | undefined;
let noteCounter = 0;

export const useOS = create<OSState>()(
  persist(
    (set, get, api) => ({
      ...createWindowSlice(set, get, api),
      fs: seedFs(),
      updateFs: (change) => set((state) => ({ fs: change(state.fs) })),
      settings: defaultSettings(),
      setSetting: (key, value) => set((state) => ({ settings: { ...state.settings, [key]: value } })),
      notes: [],
      toasts: [],
      notify(note) {
        const id = ++noteCounter;
        set((state) => ({ notes: [{ ...note, id, time: Date.now() }, ...state.notes] }));
        if (get().settings.dnd) return;
        set((state) => ({ toasts: [...state.toasts, id] }));
        setTimeout(() => get().dismissToast(id), TOAST_MS);
      },
      dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast !== id) })),
      clearNotes: () => set({ notes: [], toasts: [] }),
      session: "boot",
      locked: false,
      setSession: (session) => set({ session, overlay: "none", ...(session === "desktop" ? {} : { windows: [], workspace: 0 }) }),
      setLocked: (locked) => set({ locked, overlay: "none" }),
      overlay: "none",
      setOverlay: (overlay) => set({ overlay }),
      clipboard: null,
      setClipboard: (clipboard) => set({ clipboard }),
      termHistory: [],
      pushHistory: (command) => set((state) => ({ termHistory: [...state.termHistory, command].slice(-500) })),
      hintShown: false,
      switcher: null,
      osd: null,
      showOsd(kind, delta) {
        const value = Math.min(100, Math.max(kind === "brightness" ? 10 : 0, get().settings[kind] + delta));
        get().setSetting(kind, value);
        set({ osd: { kind, value } });
        clearTimeout(osdTimer);
        osdTimer = setTimeout(() => set({ osd: null }), OSD_MS);
      },
      setSwitcher: (switcher) => set({ switcher }),
      menu: null,
      openMenu(event, items) {
        event.preventDefault();
        set({ menu: { x: event.clientX, y: event.clientY, items } });
      },
      closeMenu: () => set({ menu: null }),
      openWith: null,
      setOpenWith: (openWith) => set({ openWith }),
      iconPositions: {},
      setIconPosition: (path, position) => set((state) => ({ iconPositions: { ...state.iconPositions, [path]: position } })),
      resetSystem: () =>
        set({ fs: seedFs(), settings: defaultSettings(), termHistory: [], hintShown: false, iconPositions: {}, notes: [], toasts: [] }),
    }),
    {
      name: "ubuntu-react",
      version: 1,
      storage: createStorage<Persisted>((chars) =>
        notify({ title: "Storage almost full", body: `Using ${(chars / 1048576).toFixed(1)} MB of ~5 MB. Delete large files or empty the Trash.` }),
      ),
      partialize: (state): Persisted => ({
        fs: state.fs, settings: state.settings, termHistory: state.termHistory, hintShown: state.hintShown, iconPositions: state.iconPositions,
      }),
      // ponytail: no older schema exists yet; unknown versions fall back to a fresh install.
      migrate: (persisted, version) => (version === 1 ? (persisted as Persisted) : ({} as Persisted)),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<Persisted>;
        return { ...current, ...saved, settings: { ...current.settings, ...saved.settings } };
      },
    },
  ),
);

export const notify: CoreSlice["notify"] = (note) => useOS.getState().notify(note);

/** Applies a VFS change; on failure shows the Linux error as a notification and returns false. */
export function tryFs(change: (fs: Fs) => Fs, action = "Operation"): boolean {
  try {
    useOS.getState().updateFs(change);
    return true;
  } catch (error) {
    if (!(error instanceof FsError)) throw error;
    notify({ title: `${action} failed`, body: error.message });
    return false;
  }
}
