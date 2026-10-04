import { afterEach, beforeEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useOS } from "../src/os/store";
import { Desktop } from "../src/shell/Desktop";

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean }
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLElement;
const $ = (selector: string) => container.querySelector<HTMLElement>(selector);
const $$ = (selector: string) => container.querySelectorAll<HTMLElement>(selector);
const click = (el: HTMLElement | null) => act(() => el!.click());

beforeEach(async () => {
  useOS.setState({ windows: [], workspace: 0, notes: [], toasts: [], session: "desktop" });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() => root.render(<Desktop />));
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
});

test("dock opens a window; close button removes it", async () => {
  await click($('[data-dock-app="terminal"]'));
  expect($$("[data-window]")).toHaveLength(1);
  await click($('[data-window] [aria-label="Close"]'));
  expect($$("[data-window]")).toHaveLength(0);
});

test("minimize keeps the window mounted; dock click cycle restores and re-minimizes it", async () => {
  await click($('[data-dock-app="files"]'));
  const win = $("[data-window]")!;
  await click(win.querySelector<HTMLElement>('[aria-label="Minimize"]'));
  expect(useOS.getState().windows[0]!.minimized).toBe(true);
  expect($("[data-window]")).toBe(win); // same DOM node: app state survives

  await click($('[data-dock-app="files"]'));
  expect(useOS.getState().windows[0]!.minimized).toBe(false);
  await click($('[data-dock-app="files"]'));
  expect(useOS.getState().windows[0]!.minimized).toBe(true);
  expect($$('[data-dock-app="files"] i')).toHaveLength(1); // one running dot
});

test("dock context menu Quit closes every window of the app", async () => {
  await act(() => { useOS.getState().openApp("terminal"); useOS.getState().openApp("terminal"); });
  expect($$('[data-dock-app="terminal"] i')).toHaveLength(2);
  await act(() => { $('[data-dock-app="terminal"]')!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 })); });
  const quit = [...$$('[role="menuitem"]')].find((item) => item.textContent?.includes("Quit"));
  await click(quit!);
  expect(useOS.getState().windows).toHaveLength(0);
});
