// Dev helper (not part of the app): logs in through the real UI with the installed Chrome and saves a
// screenshot per scene into e2e/shots, for visual review against Ubuntu 24.04. Usage: bun e2e/shot.ts [scene...]
// DIR, SIZE (WxH) and EXT (png/jpg) override the output folder, viewport and format, e.g. for docs/screenshots.
import { chromium, type Page } from "playwright-core";

const URL = process.env.URL ?? "http://localhost:5173";
const DIR = process.env.DIR ?? "e2e/shots";
const [WIDTH, HEIGHT] = (process.env.SIZE ?? "1440x900").split("x").map(Number);
const EXT = process.env.EXT ?? "png";

const openApp = async (page: Page, name: string) => {
  await page.getByLabel("Show Applications").click();
  await page.locator(".backdrop-blur-xl button", { hasText: name }).first().click();
  await page.waitForTimeout(900);
};
const closeAll = (page: Page) => page.evaluate(() => document.querySelectorAll<HTMLElement>("[data-window] [aria-label=Close]").forEach((b) => b.click()));

const SCENES: Record<string, (page: Page) => Promise<void>> = {
  desktop: async () => {},
  quick: async (page) => { await page.getByLabel("System menu").click(); },
  calendar: async (page) => { await page.locator("header button").nth(1).click(); },
  overview: async (page) => { await openApp(page, "Terminal"); await openApp(page, "Files"); await page.getByLabel("Activities").click(); await page.waitForTimeout(400); },
  grid: async (page) => { await page.getByLabel("Show Applications").click(); },
  files: async (page) => { await openApp(page, "Files"); },
  terminal: async (page) => { await openApp(page, "Terminal"); await page.keyboard.type("neofetch\n"); await page.waitForTimeout(300); },
  editor: async (page) => { await page.locator('[data-desktop-path$="Welcome.txt"]').dblclick(); await page.waitForTimeout(1200); },
  firefox: async (page) => { await openApp(page, "Firefox"); },
  calculator: async (page) => { await openApp(page, "Calculator"); await page.keyboard.type("12*(3+4)\n"); },
  viewer: async (page) => { await openApp(page, "Image Viewer"); await page.getByText("ubuntu-logo.svg").dblclick().catch(() => {}); await page.waitForTimeout(500); },
  settings: async (page) => { await openApp(page, "Settings"); },
  monitor: async (page) => { await openApp(page, "System Monitor"); },
  mines: async (page) => { await openApp(page, "Mines"); },
  clocks: async (page) => { await openApp(page, "Clocks"); },
  dockmenu: async (page) => { await page.locator('[data-dock-app="files"]').click({ button: "right" }); },
  deskmenu: async (page) => { await page.mouse.click(900, 500, { button: "right" }); },
  dark: async (page) => { await page.getByLabel("System menu").click(); await page.getByText("Dark Style").click(); await page.keyboard.press("Escape"); await page.mouse.click(1000, 600); await openApp(page, "Files"); await openApp(page, "Settings"); },
  lock: async (page) => { await page.keyboard.press("Control+Alt+L"); await page.waitForTimeout(400); },
  wifimenu: async (page) => { await page.getByLabel("System menu").click(); await page.getByLabel("Wi-Fi options").click(); },
  winmenu: async (page) => { await openApp(page, "Text Editor"); await page.locator("[data-window] header").click({ button: "right", position: { x: 300, y: 20 } }); },
  filesearch: async (page) => { await openApp(page, "Files"); await page.keyboard.type("no"); await page.waitForTimeout(300); },
  details: async (page) => { await page.locator('[data-dock-app="files"]').click({ button: "right" }); await page.getByText("App Details").click(); },
  wifipage: async (page) => { await openApp(page, "Settings"); },
  ubuntudesktop: async (page) => { await openApp(page, "Settings"); await page.getByRole("button", { name: "Ubuntu Desktop" }).click(); await page.getByLabel("Panel mode").click(); await page.getByLabel("Show Trash in the Dock").click(); },
};

const browser = await chromium.launch({ channel: "chrome" });
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENES);
for (const name of names) {
  const page = await browser.newPage({ viewport: { width: WIDTH!, height: HEIGHT! } });
  page.on("pageerror", (error) => console.log(`[${name}] pageerror: ${error.message}`));
  page.on("console", (msg) => msg.type() === "error" && console.log(`[${name}] console: ${msg.text().slice(0, 200)}`));
  await page.goto(URL);
  await page.getByRole("button", { name: /ubuntu/ }).first().click({ timeout: 8000 });
  await page.getByLabel("Password").fill("x");
  await page.keyboard.press("Enter");
  await page.waitForSelector('[aria-label="Dock"]');
  await page.evaluate(() => document.querySelectorAll<HTMLElement>('[aria-label="Close notification"]').forEach((b) => b.click()));
  await SCENES[name]!(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.${EXT}`, quality: EXT === "jpg" ? 85 : undefined });
  await closeAll(page);
  await page.close();
}
await browser.close();
