import { beforeEach, describe, expect, test } from "bun:test";
import { HOME, read, write } from "../src/os/fs";
import { tryFs, useOS } from "../src/os/store";
import { compactWorkspaces, focusedWindow, workspaceCount } from "../src/os/windows";

const os = () => useOS.getState();

beforeEach(() => {
  useOS.setState({ windows: [], workspace: 0, notes: [], toasts: [] });
  os().resetSystem();
});

describe("windows", () => {
  test("open focuses the new window; closing refocuses the next one", () => {
    const first = os().openApp("terminal")!;
    const second = os().openApp("terminal")!;
    expect(focusedWindow(os())?.id).toBe(second);
    os().focusWindow(first);
    expect(focusedWindow(os())?.id).toBe(first);
    os().closeWindow(first);
    expect(focusedWindow(os())?.id).toBe(second);
  });

  test("singleInstance apps are reused", () => {
    const first = os().openApp("settings");
    expect(os().openApp("settings")).toBe(first);
    expect(os().windows).toHaveLength(1);
  });

  test("dock click cycle: open → minimize when focused → restore", () => {
    os().activateApp("files");
    const [win] = os().windows;
    expect(focusedWindow(os())?.id).toBe(win!.id);
    os().activateApp("files");
    expect(os().windows[0]!.minimized).toBe(true);
    expect(focusedWindow(os())).toBeUndefined();
    os().activateApp("files");
    expect(focusedWindow(os())?.id).toBe(win!.id);
    expect(os().windows).toHaveLength(1);
  });

  test("dock click on an unfocused app focuses instead of minimizing", () => {
    os().openApp("files");
    os().openApp("terminal");
    os().activateApp("files");
    expect(focusedWindow(os())?.appId).toBe("files");
  });

  test("maximize toggles and moving resets snap state", () => {
    const id = os().openApp("terminal")!;
    os().toggleMaximize(id);
    expect(os().windows[0]!.state).toBe("max");
    os().moveWindow(id, { x: 1, y: 40, w: 300, h: 300 });
    expect(os().windows[0]!.state).toBe("normal");
  });
});

describe("workspaces", () => {
  test("there is always exactly one trailing empty workspace", () => {
    const id = os().openApp("terminal")!;
    expect(workspaceCount(os())).toBe(2);
    os().moveToWorkspace(id, 1);
    expect(workspaceCount(os())).toBe(3);
    os().switchWorkspace(1);
    os().closeWindow(id);
    expect(workspaceCount(os())).toBe(1);
  });
  test("compactWorkspaces removes gaps but keeps the active one", () => {
    const wins = [{ workspace: 0 }, { workspace: 3 }].map((w, i) => ({ ...os().windows[0], id: `w${i}`, ...w })) as never;
    const result = compactWorkspaces(wins, 2);
    expect(result.workspace).toBe(1);
    expect(result.windows.map((win) => win.workspace)).toEqual([0, 2]);
  });
});

describe("fs + notifications", () => {
  test("tryFs applies changes and reports Linux errors as notifications", () => {
    expect(tryFs((fs) => write(fs, `${HOME}/x.txt`, "hi"))).toBe(true);
    expect(read(os().fs, `${HOME}/x.txt`)).toBe("hi");
    expect(tryFs((fs) => write(fs, "/nope/x", ""), "Save")).toBe(false);
    expect(os().notes[0]).toMatchObject({ title: "Save failed", body: "No such file or directory" });
  });
  test("DND keeps notifications out of toasts", () => {
    os().setSetting("dnd", true);
    os().notify({ title: "quiet" });
    expect(os().notes).toHaveLength(1);
    expect(os().toasts).toHaveLength(0);
  });
  test("volume/brightness keys clamp the level and raise the OSD", () => {
    os().setSetting("volume", 95);
    os().showOsd("volume", 10);
    expect(os().osd).toEqual({ kind: "volume", value: 100 });
    os().showOsd("brightness", -500);
    expect(os().settings.brightness).toBe(10);
  });
  test("settings persist through the storage adapter", () => {
    os().setSetting("clock24", false);
    const saved = JSON.parse(localStorage.getItem("ubuntu-react")!);
    expect(saved.state.settings.clock24).toBe(false);
    expect(saved.version).toBe(1);
  });
});
