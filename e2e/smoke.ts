// Whole-site smoke test (server up; URL defaults to the dev server): opens every app from the App Grid and
// clicks through the shared helpers — pin/unpin (Dock menu + App Details), Bluetooth/Power Mode in Quick
// Settings and Settings, Overview window scaling, autofocused inputs, the Dock trash icon, System Monitor.
import { chromium } from "playwright-core";
import { APPS } from "../src/apps/registry";

const check = (ok: unknown, msg: string) => {
  if (!ok) throw new Error(`✗ ${msg}`);
  console.log(`✓ ${msg}`);
};
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const settings = () => page.evaluate(() => JSON.parse(localStorage.getItem("ubuntu-react")!).state.settings);
const openApp = async (name: string) => {
  await page.getByLabel("Show Applications").click();
  await page.locator(".backdrop-blur-xl button", { hasText: name }).first().click();
  await page.waitForTimeout(600);
};
const menuItem = (name: string) => page.getByRole("menuitem", { name, exact: true }).click();

try {
  await page.goto(process.env.URL ?? "http://localhost:5173");
  await page
    .getByRole("button", { name: /ubuntu/ })
    .first()
    .click({ timeout: 8000 });
  await page.keyboard.type("x"); // no click: the password field must be autofocused
  await page.keyboard.press("Enter");
  await page.waitForSelector('[aria-label="Dock"]');
  check(true, "password field is autofocused and login works");

  await page.getByLabel("System menu").click();
  await page.getByLabel("Bluetooth options").click();
  await menuItem("Pixel 8");
  check((await settings()).btConnected.includes("Pixel 8"), "Quick Settings connects a Bluetooth device");
  await menuItem("Pixel 8");
  check(!(await settings()).btConnected.includes("Pixel 8"), "clicking it again disconnects it");
  await page.getByLabel("Power Mode options").click();
  await menuItem("Power Saver");
  check((await settings()).powerMode === "power-saver", "Quick Settings sets the power mode");
  await page.keyboard.press("Escape");

  await page.locator('[data-dock-app="files"]').click({ button: "right" });
  await menuItem("Unpin");
  check(!(await settings()).pinned.includes("files"), "Dock menu unpins Files");
  await openApp("Files");
  await page.locator('[data-dock-app="files"]').click({ button: "right" });
  await menuItem("App Details");
  await page.getByRole("button", { name: "Pin to Dash" }).click();
  check((await settings()).pinned.includes("files"), "App Details pins it back");
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+Alt+t");
  await page.waitForTimeout(600);
  await page.keyboard.press("Control+Shift+Space");
  await page.waitForTimeout(400);
  const transforms = await page.locator("[data-window]").evaluateAll((els) => els.map((el) => el.style.transform));
  check(transforms.length === 2 && transforms.every((t) => t.includes("scale(")), "Overview scales both windows");
  await page.keyboard.type("calc");
  check(
    (await page.getByRole("textbox", { name: "Search" }).inputValue()) === "calc",
    "Overview search is autofocused",
  );
  await page.keyboard.press("Enter");
  await page.waitForSelector('[data-window^="calculator"]');
  check(true, "Enter opens the first search result (Calculator)");

  await openApp("Settings");
  await page.getByRole("button", { name: "Ubuntu Desktop" }).click();
  await page.getByLabel("Show Trash in the Dock").click();
  await page.locator('[data-desktop-path="/home/ubuntu/Desktop/Welcome.txt"]').click({ button: "right" });
  await menuItem("Move to Trash");
  check(
    (await page.getByLabel("Trash", { exact: true }).last().locator("img").getAttribute("src"))?.includes("trash-full"),
    "Dock trash turns full",
  );
  await page.getByRole("button", { name: "Bluetooth", exact: true }).click();
  await page.getByRole("button", { name: "Connect" }).first().click();
  check((await settings()).btConnected.length === 1, "Settings › Bluetooth connects a device");
  await page.getByRole("button", { name: "Power", exact: true }).click();
  check(
    await page.getByRole("radio", { name: "Power Saver" }).isChecked(),
    "Settings › Power shows the mode set in Quick Settings",
  );

  await openApp("System Monitor");
  await page.getByRole("tab", { name: "File Systems" }).click();
  check(await page.getByText(/kB files/).isVisible(), "System Monitor reports VFS usage");

  for (const app of APPS) await openApp(app.name);
  const open = await page
    .locator("[data-window]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-window")));
  check(
    APPS.every((app) => open.some((id) => id?.startsWith(`${app.id}-`))),
    `all ${APPS.length} apps open`,
  );
  check(!(await page.getByText(/has stopped/).count()), "no app crashed (error boundary)");
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
} finally {
  await browser.close();
}
