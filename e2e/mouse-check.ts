import { chromium } from "playwright-core";
// Mouse regression check (dev server up): desktop icon selection/drag, then title bar click/drag/double-click.
const check = (ok: unknown, msg: string) => {
  if (!ok) throw new Error(`✗ ${msg}`);
  console.log(`✓ ${msg}`);
};
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(process.env.URL ?? "http://localhost:5173");
await page
  .getByRole("button", { name: /ubuntu/ })
  .first()
  .click({ timeout: 8000 });
await page.getByLabel("Password").fill("x");
await page.keyboard.press("Enter");
await page.waitForSelector('[aria-label="Dock"]');

// Desktop icons: rubber band, group drag, click/Ctrl+click, no stacking on an occupied cell.
const icon = (path: string) => page.locator(`[data-desktop-path="${path}"]`);
const [home, trashIcon] = [icon("/home/ubuntu"), icon("/home/ubuntu/.local/share/Trash")];
const picked = () => page.locator('[data-desktop-path][aria-pressed="true"]').count();
const box = async (l: typeof home) => (await l.boundingBox())!;
const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
};
const start = await box(home);
await drag({ x: 400, y: 100 }, { x: 100, y: 280 });
check((await picked()) === 3, "rubber band on empty desktop selects all three icons");
await drag({ x: start.x + 45, y: start.y + 30 }, { x: start.x + 45 + 192, y: start.y + 30 });
check(
  Math.round((await box(home)).x - start.x) === 192 && (await picked()) === 3,
  "dragging a selected icon moves the whole selection",
);
await home.click();
check((await picked()) === 1, "plain click collapses the selection");
await trashIcon.click({ modifiers: ["Control"] });
check((await picked()) === 2, "Ctrl+click adds to the selection");
await page.mouse.click(700, 500);
const t = await box(trashIcon);
await drag({ x: t.x + 45, y: t.y + 30 }, { x: t.x + 45, y: t.y + 30 - 108 });
check(Math.round((await box(trashIcon)).y) === Math.round(t.y), "an icon dropped on an occupied cell stays put");

await page.locator('[data-dock-app="files"]').click();
const win = page.locator('[data-window^="files"]');
await win.waitFor();
await page.waitForTimeout(400);
// 1. click empty path-bar area -> should enter edit mode (was swallowed by early pointer capture)
const bar = win.locator("header .hdr-center > div").first();
const b = (await bar.boundingBox())!;
await page.mouse.click(b.x + b.width - 4, b.y + b.height / 2);
check(await win.getByLabel("Location").isVisible(), "click on empty path bar opens the location entry");
await page.keyboard.press("Escape");
// 2. drag by title bar moves the window
const before = (await win.boundingBox())!;
const h = (await win.locator("header").boundingBox())!;
await page.mouse.move(h.x + h.width - 200, h.y + 20);
await page.mouse.down();
await page.mouse.move(h.x + h.width - 100, h.y + 80, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(400);
const after = (await win.boundingBox())!;
check(
  Math.round(after.x - before.x) === 100 && Math.round(after.y - before.y) === 60,
  "dragging the title bar moves the window",
);
// 3. double-click title bar maximizes
await page.mouse.dblclick(h.x + h.width - 200 + 100, h.y + 80);
await page.waitForTimeout(400);
check(await win.getByLabel("Restore").isVisible(), "double-click on the title bar maximizes");
await browser.close();
