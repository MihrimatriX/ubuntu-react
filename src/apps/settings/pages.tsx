// Settings pages. Every control writes the persisted settings slice directly, so changes apply instantly.
import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { HOME, usage, walk } from "../../os/fs";
import { enterFullscreen, keyboardLockSupported, SHORTCUTS } from "../../os/keyboard";
import { WALLPAPERS } from "../../os/seed";
import { ACCENTS, useOS, type Settings } from "../../os/store";
import { QUOTA_CHARS } from "../../os/storage";
import { FilePicker } from "../../shell/FilePicker";
import { Dialog } from "../../shell/chrome";
import { Group, Row, Switch } from "./widgets";

const set = <K extends keyof Settings>(key: K) => (value: Settings[K]) => useOS.getState().setSetting(key, value);

export function Appearance() {
  const settings = useOS((state) => state.settings);
  return (
    <>
      <Group title="Style">
        <div className="flex justify-center gap-6 p-4">
          {(["light", "dark"] as const).map((theme) => (
            <button key={theme} aria-pressed={settings.theme === theme} onClick={() => set("theme")(theme)} className="flex flex-col items-center gap-2 text-sm capitalize">
              <span className={`grid h-24 w-40 place-items-center rounded-xl border-4 ${settings.theme === theme ? "border-accent" : "border-transparent"} ${theme === "dark" ? "bg-[#242424]" : "bg-[#fafafa]"}`}
                style={{ backgroundImage: `url("${settings.wallpaper}")`, backgroundSize: "cover" }}>
                <span className={`h-12 w-24 rounded-md shadow-lg ${theme === "dark" ? "bg-[#303030]" : "bg-white"}`} />
              </span>
              {theme}
            </button>
          ))}
        </div>
      </Group>
      <Group title="Accent Color">
        <div className="flex flex-wrap justify-center gap-3 p-4">
          {Object.entries(ACCENTS).map(([name, color]) => (
            <button key={name} aria-label={name} title={name} onClick={() => set("accent")(color)}
              className="grid size-8 place-items-center rounded-full text-white" style={{ background: color }}>
              {settings.accent === color && <Check className="size-4" />}
            </button>
          ))}
        </div>
      </Group>
      <Background />
    </>
  );
}

/** Ubuntu Desktop panel: desktop icons (DING) and Ubuntu Dock options. */
export function UbuntuDesktop() {
  const settings = useOS((state) => state.settings);
  return (
    <>
      <Group title="Desktop Icons">
        <Row title="Size">
          <select className="field" value={settings.desktopIconSize} onChange={(e) => set("desktopIconSize")(Number(e.target.value))}>
            <option value={40}>Small</option><option value={48}>Standard</option><option value={64}>Large</option>
          </select>
        </Row>
        <Row title="Show Personal folder"><Switch label="Show Personal folder" checked={settings.showHome} onChange={set("showHome")} /></Row>
        <Row title="Show Trash"><Switch label="Show Trash on the desktop" checked={settings.showTrash} onChange={set("showTrash")} /></Row>
      </Group>
      <Group title="Dock">
        <Row title="Auto-hide the Dock" subtitle="The dock hides until the pointer reaches the screen edge">
          <Switch label="Auto-hide the Dock" checked={settings.dockAutohide} onChange={set("dockAutohide")} />
        </Row>
        <Row title="Panel mode" subtitle="The dock extends to the screen edge">
          <Switch label="Panel mode" checked={settings.dockPanel} onChange={set("dockPanel")} />
        </Row>
        <Row title="Icon size">
          <input type="range" min={32} max={64} step={4} value={settings.dockIconSize} aria-label="Icon size" className="w-48 accent-accent"
            onChange={(e) => set("dockIconSize")(Number(e.target.value))} />
        </Row>
        <Row title="Position on screen">
          <select className="field" value={settings.dockPosition} onChange={(e) => set("dockPosition")(e.target.value as typeof settings.dockPosition)}>
            <option value="left">Left</option><option value="bottom">Bottom</option><option value="right">Right</option>
          </select>
        </Row>
        <Row title="Show Trash in the Dock"><Switch label="Show Trash in the Dock" checked={settings.dockTrash} onChange={set("dockTrash")} /></Row>
      </Group>
    </>
  );
}

function Background() {
  const wallpaper = useOS((state) => state.settings.wallpaper);
  const fs = useOS((state) => state.fs);
  const [picking, setPicking] = useState(false);
  const pictures = walk(fs, `${HOME}/Pictures`).filter((path) => fs[path]?.mime?.startsWith("image/")).map((path) => fs[path]!.content ?? "");
  const choices = [...new Set([...WALLPAPERS.map((item) => item.url), ...pictures])].filter(Boolean);
  return (
    <Group title="Background">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 p-4">
        {choices.map((url) => (
          <button key={url} aria-pressed={wallpaper === url} onClick={() => set("wallpaper")(url)}
            className={`aspect-video rounded-lg border-4 bg-cover bg-center ${wallpaper === url ? "border-accent" : "border-transparent hover:border-line"}`}
            style={{ backgroundImage: `url("${url}")` }} />
        ))}
        <button className="grid aspect-video place-items-center rounded-lg border-2 border-dashed border-line text-sm text-fg-dim hover:bg-hover" onClick={() => setPicking(true)}>
          <span className="flex items-center gap-1"><Plus className="size-4" />Add Picture…</span>
        </button>
      </div>
      {picking && (
        <FilePicker mode="open" title="Select a Picture" initialDir={`${HOME}/Pictures`} accept={(mime) => mime.startsWith("image/")}
          onCancel={() => setPicking(false)} onPick={(path) => { setPicking(false); set("wallpaper")(fs[path]?.content ?? wallpaper); }} />
      )}
    </Group>
  );
}

function beep(volume: number) {
  const audio = new AudioContext();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  gain.gain.value = (volume / 100) * 0.2;
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.15);
}

export function Sound() {
  const volume = useOS((state) => state.settings.volume);
  return (
    <Group title="Output">
      <Row title="Output Volume" subtitle={`${volume}%`}>
        <input type="range" min={0} max={100} value={volume} aria-label="Output Volume" className="w-56 accent-accent" onChange={(e) => set("volume")(Number(e.target.value))} />
      </Row>
      <Row title="Test" subtitle="Play a short tone at the current volume"><button className="btn" onClick={() => beep(volume)}>Test…</button></Row>
    </Group>
  );
}

export function Keyboard() {
  return (
    <>
      <Group title="Browser Keyboard Capture">
        <Row title="Full screen with keyboard lock" subtitle={keyboardLockSupported() ? "Lets Super, Alt+Tab and Ctrl+Alt+T reach the desktop" : "Keyboard Lock API is not supported by this browser — use the alternatives below"}>
          <button className="btn" onClick={enterFullscreen}>Enter Full Screen</button>
        </Row>
      </Group>
      <Group title="Keyboard Shortcuts">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 px-4 py-2 text-xs font-bold text-fg-dim"><span>Action</span><span>Shortcut</span><span>Alternative</span></div>
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 px-4 py-2 text-sm">
            <span>{shortcut.label}</span>
            <kbd className="rounded bg-hover px-2 py-0.5 font-mono text-xs">{shortcut.keys}</kbd>
            <kbd className="rounded bg-hover px-2 py-0.5 font-mono text-xs">{shortcut.alt}</kbd>
          </div>
        ))}
      </Group>
    </>
  );
}

export function About() {
  const fs = useOS((state) => state.fs);
  const name = useOS((state) => state.settings.deviceName);
  const [confirming, setConfirming] = useState(false);
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const used = JSON.stringify(fs).length;
  return (
    <>
      <div className="mb-6 flex flex-col items-center gap-2"><span className="text-5xl font-light text-accent">ubuntu</span><b>24.04.1 LTS</b></div>
      <Group>
        <Row title="Device Name"><input className="field w-48" value={name} aria-label="Device Name" onChange={(e) => set("deviceName")(e.target.value.replace(/[^\w-]/g, "") || "ubuntu")} /></Row>
        <Row title="Memory" subtitle={memory ? `${memory} GiB` : "Unknown"} />
        <Row title="Processor" subtitle={`Virtual CPU × ${navigator.hardwareConcurrency || 4}`} />
        <Row title="Disk Capacity" subtitle={`${(used / 1048576).toFixed(2)} MB of ${QUOTA_CHARS / 1048576} MB used · ${usage(fs)} bytes of file content`} />
        <Row title="OS Name" subtitle="Ubuntu 24.04.1 LTS · GNOME 46 · Wayland (browser)" />
      </Group>
      <Group title="Credits">
        <Row title="Icons" subtitle="Drawn in the style of the Yaru icon theme (CC BY-SA 4.0, © Canonical & Yaru contributors)" />
        <Row title="Trademarks" subtitle="Ubuntu and the Circle of Friends are trademarks of Canonical Ltd. This is a personal, educational project." />
      </Group>
      <Group>
        <Row title="Reset System" subtitle="Erase all files and settings and restart"><button className="btn btn-danger" onClick={() => setConfirming(true)}>Reset…</button></Row>
      </Group>
      {confirming && (
        <Dialog title="Reset System?" body="All files, settings and terminal history will be permanently erased." onCancel={() => setConfirming(false)}
          actions={[{ label: "Reset", style: "danger", run: () => { useOS.getState().resetSystem(); useOS.getState().setSession("boot"); } }]} />
      )}
    </>
  );
}
