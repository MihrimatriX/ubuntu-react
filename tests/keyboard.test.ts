import { expect, test } from "bun:test";
import { APPS } from "../src/apps/registry";
import { HOME } from "../src/os/fs";
import { SHORTCUTS, comboOf } from "../src/os/keyboard";
import { seedFs } from "../src/os/seed";
import { searchAll } from "../src/shell/Overview";

const key = (code: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {}, value = "") =>
  comboOf({ code, key: value, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

test("comboOf normalizes physical keys in a fixed modifier order", () => {
  expect(key("KeyT", { ctrlKey: true, altKey: true })).toBe("Ctrl+Alt+T");
  expect(key("Tab", { altKey: true, shiftKey: true })).toBe("Alt+Shift+Tab");
  expect(key("ArrowUp", { metaKey: true })).toBe("Super+ArrowUp");
  expect(key("Backquote", { altKey: true })).toBe("Alt+`");
  expect(key("MetaLeft", { metaKey: true }, "Meta")).toBe("Super");
});

test("every shortcut has a distinct GNOME combo and alternative", () => {
  const combos = SHORTCUTS.flatMap((shortcut) => [shortcut.keys, shortcut.alt]);
  expect(new Set(combos).size).toBe(combos.length);
});

test("searchAll matches app names, keywords and VFS file names", () => {
  const fs = seedFs();
  expect(searchAll("term", APPS, fs).apps.map((app) => app.id)).toEqual(["terminal"]);
  expect(searchAll("wallpaper", APPS, fs).apps.map((app) => app.id)).toContain("settings");
  expect(searchAll("notes", APPS, fs).files).toEqual([`${HOME}/Documents/notes.md`]);
  expect(searchAll("  ", APPS, fs)).toEqual({ apps: [], files: [] });
});
