// Window manager state. Z-order is a per-window counter (focus = highest z among visible windows on the
// active workspace) so the DOM order never changes and iframes/terminals are never remounted.
// `rect` is always the "normal" geometry; snapped/maximized rects are derived from `state` at render time.
import type { StateCreator } from "zustand";
import { appById } from "../apps/registry";
import { cascade, workArea, type Rect, type SnapState } from "../lib/snap";
import type { OSState } from "./store";

export type Win = {
  id: string; appId: string; title: string; rect: Rect; state: SnapState;
  minimized: boolean; workspace: number; z: number; filePath?: string; args?: string[]; dirty?: boolean; confirmClose?: boolean; above?: boolean;
};

type OpenOptions = { filePath?: string; args?: string[]; newWindow?: boolean };

export type WindowSlice = {
  windows: Win[];
  workspace: number;
  openApp: (appId: string, options?: OpenOptions) => string | undefined;
  closeWindow: (id: string) => void;
  /** Closes, unless the window has unsaved changes — then it asks first (Window renders the dialog). */
  requestClose: (id: string) => void;
  closeApp: (appId: string) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  toggleMaximize: (id: string) => void;
  snapWindow: (id: string, state: SnapState) => void;
  moveWindow: (id: string, rect: Rect) => void;
  patchWindow: (id: string, patch: Partial<Pick<Win, "title" | "dirty" | "filePath" | "confirmClose" | "above">>) => void;
  activateApp: (appId: string) => void;
  switchWorkspace: (index: number) => void;
  moveToWorkspace: (id: string, index: number) => void;
  showDesktop: () => void;
};

const topZ = (windows: Win[]) => windows.reduce((max, win) => Math.max(max, win.z), 0);

export const focusedWindow = (state: Pick<OSState, "windows" | "workspace">): Win | undefined =>
  state.windows
    .filter((win) => !win.minimized && win.workspace === state.workspace)
    .reduce<Win | undefined>((top, win) => (!top || win.z > top.z ? win : top), undefined);

export const workspaceCount = (state: Pick<OSState, "windows" | "workspace">) =>
  Math.max(...state.windows.map((win) => win.workspace + 2), state.workspace + 1, 1);

/** Drops empty workspaces (except the active one) so there is exactly one trailing empty workspace. */
export function compactWorkspaces(windows: Win[], active: number): { windows: Win[]; workspace: number } {
  const used = [...new Set([...windows.map((win) => win.workspace), active])].sort((a, b) => a - b);
  const remap = (index: number) => used.indexOf(index);
  return { windows: windows.map((win) => ({ ...win, workspace: remap(win.workspace) })), workspace: remap(active) };
}

const currentArea = (state: OSState) =>
  workArea({ w: globalThis.innerWidth || 1280, h: globalThis.innerHeight || 800 }, {
    position: state.settings.dockPosition, iconSize: state.settings.dockIconSize, autohide: state.settings.dockAutohide,
  });

let windowCounter = 0;

export const createWindowSlice: StateCreator<OSState, [], [], WindowSlice> = (set, get) => {
  const update = (id: string, patch: (win: Win) => Partial<Win>) =>
    set((state) => ({ windows: state.windows.map((win) => (win.id === id ? { ...win, ...patch(win) } : win)) }));
  const raise = (id: string) => update(id, () => ({ z: topZ(get().windows) + 1, minimized: false }));
  const remove = (keep: (win: Win) => boolean) =>
    set((state) => compactWorkspaces(state.windows.filter(keep), state.workspace));

  return {
    windows: [],
    workspace: 0,

    openApp(appId, options = {}) {
      const app = appById(appId);
      if (!app) return undefined;
      const state = get();
      const existing = state.windows.find((win) => win.appId === appId);
      if (existing && app.singleInstance) {
        if (options.args || options.filePath) update(existing.id, () => ({ args: options.args, filePath: options.filePath }));
        get().focusWindow(existing.id);
        return existing.id;
      }
      const id = `${appId}-${++windowCounter}`;
      const onWorkspace = state.windows.filter((win) => win.workspace === state.workspace).length;
      const win: Win = {
        id, appId, title: app.name, rect: cascade(onWorkspace, app.defaultSize, currentArea(state)), state: "normal",
        minimized: false, workspace: state.workspace, z: topZ(state.windows) + 1, filePath: options.filePath, args: options.args,
      };
      set({ windows: [...state.windows, win] });
      return id;
    },

    closeWindow: (id) => remove((win) => win.id !== id),
    requestClose(id) {
      const win = get().windows.find((candidate) => candidate.id === id);
      if (!win?.dirty) return get().closeWindow(id);
      get().focusWindow(id);
      update(id, () => ({ confirmClose: true }));
    },
    closeApp: (appId) => remove((win) => win.appId !== appId),

    focusWindow(id) {
      const win = get().windows.find((candidate) => candidate.id === id);
      if (!win) return;
      set({ workspace: win.workspace });
      raise(id);
    },

    minimizeWindow: (id) => update(id, () => ({ minimized: true })),
    toggleMaximize: (id) => update(id, (win) => ({ state: win.state === "max" ? "normal" : "max" })),
    snapWindow: (id, snap) => update(id, () => ({ state: snap })),
    moveWindow: (id, rect) => update(id, () => ({ rect, state: "normal" })),
    patchWindow: (id, patch) => update(id, () => patch),

    activateApp(appId) {
      const state = get();
      const mine = state.windows.filter((win) => win.appId === appId);
      if (mine.length === 0) return void get().openApp(appId);
      if (focusedWindow(state)?.appId === appId) {
        return set({ windows: state.windows.map((win) => (win.appId === appId ? { ...win, minimized: true } : win)) });
      }
      const top = mine.reduce((best, win) => (win.z > best.z ? win : best));
      mine.forEach((win) => win.id !== top.id && win.workspace === top.workspace && raise(win.id));
      get().focusWindow(top.id);
    },

    switchWorkspace(index) {
      const state = get();
      const target = Math.min(Math.max(index, 0), workspaceCount(state) - 1);
      set(compactWorkspaces(state.windows, target));
    },

    moveToWorkspace(id, index) {
      const windows = get().windows.map((win) => (win.id === id ? { ...win, workspace: index } : win));
      set(compactWorkspaces(windows, get().workspace));
    },

    showDesktop() {
      const { windows, workspace } = get();
      set({ windows: windows.map((win) => (win.workspace === workspace ? { ...win, minimized: true } : win)) });
    },
  };
};
