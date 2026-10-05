// Global shortcuts: one table, each entry with the GNOME combo and a browser-safe alternative (browsers or
// the host OS often swallow Super / Alt+Tab / Ctrl+Alt+T). Combos are normalized from event.code so they
// work on any layout. Super alone toggles the Overview on key-up if no other key was pressed meanwhile.
import { useEffect } from "react";
import { takeScreenshot } from "./launch";
import { useOS } from "./store";
import { focusedWindow, workspaceCount } from "./windows";

export type Shortcut = { keys: string; alt: string; label: string; run: () => void };

const os = () => useOS.getState();
const withFocused = (action: (id: string, state: ReturnType<typeof os>) => void) => () => {
  const win = focusedWindow(os());
  if (win) action(win.id, os());
};
const toggleOverlay = (overlay: "overview" | "grid") => () =>
  os().setOverlay(os().overlay === overlay ? "none" : overlay);
const cycle = (step: number) => () => {
  const count = switcherWindows().length;
  if (count) os().setSwitcher(((os().switcher ?? 0) + step + count) % count);
};
const moveWorkspace = (step: number) => () => os().switchWorkspace(os().workspace + step);
const sendToWorkspace = (step: number) =>
  withFocused((id, state) => {
    const target = Math.min(Math.max(state.workspace + step, 0), workspaceCount(state) - 1);
    state.moveToWorkspace(id, target);
    state.switchWorkspace(target);
  });

export const SHORTCUTS: Shortcut[] = [
  { keys: "Super", alt: "Ctrl+Shift+Space", label: "Activities Overview", run: toggleOverlay("overview") },
  { keys: "Super+A", alt: "Ctrl+Shift+A", label: "Show Applications", run: toggleOverlay("grid") },
  { keys: "Alt+Tab", alt: "Alt+`", label: "Switch windows", run: cycle(1) },
  { keys: "Alt+Shift+Tab", alt: "Alt+Shift+`", label: "Switch windows backwards", run: cycle(-1) },
  { keys: "Alt+F4", alt: "Ctrl+Alt+Q", label: "Close window", run: withFocused((id, state) => state.requestClose(id)) },
  {
    keys: "Super+ArrowUp",
    alt: "Alt+Shift+ArrowUp",
    label: "Maximize window",
    run: withFocused((id, state) => state.snapWindow(id, "max")),
  },
  {
    keys: "Super+ArrowDown",
    alt: "Alt+Shift+ArrowDown",
    label: "Restore / minimize window",
    run: withFocused((id, state) =>
      state.windows.find((win) => win.id === id)?.state === "normal"
        ? state.minimizeWindow(id)
        : state.snapWindow(id, "normal"),
    ),
  },
  {
    keys: "Super+ArrowLeft",
    alt: "Alt+Shift+ArrowLeft",
    label: "View split on left",
    run: withFocused((id, state) => state.snapWindow(id, "left")),
  },
  {
    keys: "Super+ArrowRight",
    alt: "Alt+Shift+ArrowRight",
    label: "View split on right",
    run: withFocused((id, state) => state.snapWindow(id, "right")),
  },
  { keys: "Super+D", alt: "Ctrl+Alt+D", label: "Show desktop", run: () => os().showDesktop() },
  {
    keys: "Ctrl+Alt+T",
    alt: "Ctrl+Alt+Enter",
    label: "Launch Terminal",
    run: () => os().openApp("terminal", { newWindow: true }),
  },
  { keys: "Super+L", alt: "Ctrl+Alt+L", label: "Lock screen", run: () => os().setLocked(true) },
  { keys: "PrintScreen", alt: "Ctrl+Alt+S", label: "Take a screenshot", run: takeScreenshot },
  { keys: "AudioVolumeUp", alt: "Ctrl+Alt+Equal", label: "Volume up", run: () => os().showOsd("volume", 10) },
  { keys: "AudioVolumeDown", alt: "Ctrl+Alt+Minus", label: "Volume down", run: () => os().showOsd("volume", -10) },
  {
    keys: "AudioVolumeMute",
    alt: "Ctrl+Alt+0",
    label: "Mute / unmute",
    run: () => os().showOsd("volume", os().settings.volume ? -100 : 50),
  },
  {
    keys: "BrightnessUp",
    alt: "Ctrl+Alt+BracketRight",
    label: "Brightness up",
    run: () => os().showOsd("brightness", 10),
  },
  {
    keys: "BrightnessDown",
    alt: "Ctrl+Alt+BracketLeft",
    label: "Brightness down",
    run: () => os().showOsd("brightness", -10),
  },
  {
    keys: "Ctrl+Alt+ArrowLeft",
    alt: "Ctrl+Alt+PageUp",
    label: "Switch to workspace on the left",
    run: moveWorkspace(-1),
  },
  {
    keys: "Ctrl+Alt+ArrowRight",
    alt: "Ctrl+Alt+PageDown",
    label: "Switch to workspace on the right",
    run: moveWorkspace(1),
  },
  {
    keys: "Ctrl+Alt+Shift+ArrowLeft",
    alt: "Ctrl+Alt+Shift+PageUp",
    label: "Move window one workspace left",
    run: sendToWorkspace(-1),
  },
  {
    keys: "Ctrl+Alt+Shift+ArrowRight",
    alt: "Ctrl+Alt+Shift+PageDown",
    label: "Move window one workspace right",
    run: sendToWorkspace(1),
  },
];

const CODE_NAMES: Record<string, string> = { Backquote: "`", IntlBackslash: "`", Space: "Space" };

/** "Ctrl+Super+Alt+Shift+<key>" in a fixed modifier order, using the physical key (layout independent). */
export function comboOf(
  event: Pick<KeyboardEvent, "code" | "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
): string {
  const key = CODE_NAMES[event.code] ?? (event.code.replace(/^(Key|Digit)/, "") || event.key);
  const isModifier = /^(Control|Meta|Alt|Shift|OS)/.test(event.code);
  const mods = [
    event.ctrlKey && "Ctrl",
    event.metaKey && "Super",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
  ].filter(Boolean);
  return [...mods, ...(isModifier ? [] : [key])].join("+");
}

const BY_COMBO = new Map(
  SHORTCUTS.flatMap(
    (shortcut) =>
      [
        [shortcut.keys, shortcut],
        [shortcut.alt, shortcut],
      ] as const,
  ),
);

/** Windows shown by Alt+Tab on the current workspace, most recently used first. */
export const switcherWindows = () => {
  const { windows, workspace } = os();
  return windows.filter((win) => win.workspace === workspace).sort((a, b) => b.z - a.z);
};

export function useGlobalKeyboard(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let superAlone = false;
    const onKeyDown = (event: KeyboardEvent) => {
      superAlone = event.key === "Meta" && !event.repeat;
      // On Windows Ctrl+Alt is AltGr: if it produced a character (Turkish AltGr+Q = "@"), it is typing.
      if (event.ctrlKey && event.altKey && event.key.length === 1 && !/^[a-z0-9`]$/i.test(event.key)) return;
      const combo = comboOf(event);
      const shortcut = BY_COMBO.get(combo);
      if (!shortcut || combo === "Super") return; // bare Super acts on key-up
      event.preventDefault();
      event.stopPropagation();
      shortcut.run();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Meta" && superAlone) BY_COMBO.get("Super")!.run();
      if (event.key === "Alt" && os().switcher !== null) {
        const target = switcherWindows()[os().switcher!];
        os().setSwitcher(null);
        if (target) os().focusWindow(target.id);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [enabled]);
}

/** In fullscreen, ask Chromium to deliver Super/Alt+Tab/Escape to the page (Keyboard Lock API). */
export async function enterFullscreen() {
  await document.documentElement.requestFullscreen?.().catch(() => undefined);
  const keyboard = (navigator as Navigator & { keyboard?: { lock?: () => Promise<void> } }).keyboard;
  await keyboard?.lock?.().catch(() => undefined);
}

export const keyboardLockSupported = () =>
  "keyboard" in navigator && "lock" in ((navigator as Navigator & { keyboard: object }).keyboard ?? {});
