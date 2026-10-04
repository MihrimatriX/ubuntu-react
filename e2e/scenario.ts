// End-to-end scenario, driven through the real UI with the installed Chrome:
// boot → login → Terminal `mkdir test && cd test && echo hi > a.txt` → visible in Files → double-click opens
// Text Editor → edit → Ctrl+S → `cat` in Terminal shows the edit. Run with the dev server up: bun run e2e
import { chromium, type Page } from "playwright-core";

const URL = process.env.URL ?? "http://localhost:5173";

function check(condition: unknown, message: string) {
  if (!condition) throw new Error(`✗ ${message}`);
  console.log(`✓ ${message}`);
}

const readFile = (page: Page, path: string) =>
  page.evaluate((file) => JSON.parse(localStorage.getItem("ubuntu-react")!).state.fs[file]?.content as string | undefined, path);

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(URL);
  check(await page.getByLabel("Booting").isVisible(), "boot splash is shown");
  await page.getByRole("button", { name: /ubuntu/ }).first().click({ timeout: 8000 });
  await page.getByLabel("Password").fill("anything");
  await page.keyboard.press("Enter");
  await page.waitForSelector('[aria-label="Dock"]');
  check(true, "login with any password reaches the desktop");

  await page.keyboard.press("Control+Alt+t");
  await page.waitForSelector(".xterm");
  await page.waitForTimeout(800);
  await page.keyboard.type("mkdir test && cd test && echo hi > a.txt\n");
  await page.waitForTimeout(300);

  await page.locator('[data-dock-app="files"]').click();
  await page.locator('[data-path="/home/ubuntu/test"]').dblclick();
  check(await page.locator('[data-path="/home/ubuntu/test/a.txt"]').isVisible(), "a.txt created in Terminal is visible in Files");

  await page.locator('[data-path="/home/ubuntu/test/a.txt"]').dblclick();
  const editor = page.locator('[data-window^="text-editor"]');
  await editor.locator(".cm-content").waitFor();
  check((await editor.locator(".cm-content").textContent()) === "hi", "double-click opens it in Text Editor");
  await editor.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" from the editor");
  check((await editor.locator("h2").textContent())?.startsWith("•"), "unsaved changes mark the title with •");
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(200);
  check(!(await editor.locator("h2").textContent())?.startsWith("•"), "Ctrl+S saves and clears the mark");

  await page.locator('[data-dock-app="terminal"]').click(); // focus the terminal (it is behind the editor)
  await page.waitForTimeout(300);
  // The terminal draws with WebGL, so its output is verified through the VFS: cat's stdout is redirected.
  await page.keyboard.type("cat a.txt > copy.txt\n");
  await page.waitForTimeout(400);
  check((await readFile(page, "/home/ubuntu/test/a.txt")) === "hi\n from the editor", "the edit is saved to the VFS");
  check((await readFile(page, "/home/ubuntu/test/copy.txt")) === "hi\n from the editor", "cat in Terminal reads the saved content");
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
} finally {
  await browser.close();
}
