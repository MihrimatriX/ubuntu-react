// GNOME 46 Quick Settings: action row (battery, screenshot, settings, lock, power menu), volume/brightness
// sliders and a toggle grid. Toggles with an arrow open an in-place submenu (Wi-Fi networks, Bluetooth
// devices, power modes). Every control writes straight to the persisted settings slice.
import { useState, type ReactNode } from "react";
import { BatteryCharging, BatteryFull, Bluetooth, Camera, Check, ChevronRight, Gauge, Lock, Moon, Plane, Power, Settings, Sun, SunMoon, Volume2, VolumeX, Wifi } from "lucide-react";
import { takeScreenshot } from "../os/launch";
import { BT_DEVICES, NETWORKS, useOS, type Settings as SettingsType } from "../os/store";
import { useBattery } from "./TopBar";

type Option = { label: string; active: boolean; select: () => void };
const POWER_LABELS = { performance: "Performance", balanced: "Balanced", "power-saver": "Power Saver" } as const;

function Toggle({ label, subtitle, icon, on, onToggle, open, onOpen }: {
  label: string; subtitle?: string; icon: ReactNode; on: boolean; onToggle: () => void; open?: boolean; onOpen?: () => void;
}) {
  const tone = on ? "bg-accent text-white hover:brightness-110" : "bg-white/10 hover:bg-white/15";
  return (
    <div className={`flex h-14 overflow-hidden rounded-full ${open ? "ring-2 ring-white/40" : ""}`}>
      <button aria-pressed={on} onClick={onToggle} className={`flex min-w-0 flex-1 items-center gap-3 pl-4 text-left [&>svg]:size-4 [&>svg]:shrink-0 ${tone} ${onOpen ? "" : "pr-4"}`}>
        {icon}
        <span className="min-w-0"><b className="block truncate text-sm">{label}</b>{subtitle && <span className="block truncate text-xs opacity-80">{subtitle}</span>}</span>
      </button>
      {onOpen && <button aria-label={`${label} options`} aria-expanded={open} onClick={onOpen} className={`grid w-10 place-items-center border-l border-black/15 ${tone}`}><ChevronRight className={`size-4 transition-transform ${open ? "rotate-90" : ""}`} /></button>}
    </div>
  );
}

function Slider({ icon, value, label, onChange, onIcon }: { icon: ReactNode; value: number; label: string; onChange: (value: number) => void; onIcon?: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button aria-label={onIcon ? `Mute ${label}` : label} onClick={onIcon} disabled={!onIcon} className="rounded-full p-1.5 hover:bg-white/10 disabled:hover:bg-transparent [&>svg]:size-4">{icon}</button>
      <input type="range" min={0} max={100} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-accent" />
    </div>
  );
}

const circle = "grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20 [&>svg]:size-4";

export function QuickSettings({ close }: { close: () => void }) {
  const settings = useOS((state) => state.settings);
  const battery = useBattery();
  const os = useOS.getState();
  const [menu, setMenu] = useState<"power" | "wifi" | "bluetooth" | "mode" | null>(null);
  const set = <K extends keyof SettingsType>(key: K, value: SettingsType[K]) => os.setSetting(key, value);
  const run = (action: () => void) => () => { close(); action(); };
  const toggleMenu = (name: typeof menu) => () => setMenu(menu === name ? null : name);
  const airplane = !settings.wifi && !settings.bluetooth;

  const submenus: Record<string, { title: string; options: Option[] }> = {
    power: { title: "Power Off", options: [
      { label: "Suspend", active: false, select: run(() => os.setLocked(true)) }, { label: "Restart…", active: false, select: run(() => os.setSession("boot")) },
      { label: "Power Off…", active: false, select: run(() => os.setSession("off")) }, { label: "Log Out", active: false, select: run(() => os.setSession("login")) },
    ] },
    wifi: { title: "Wi-Fi", options: NETWORKS.map(([name]) => ({ label: name, active: settings.wifi && settings.wifiNetwork === name, select: () => { set("wifi", true); set("wifiNetwork", name); } })) },
    bluetooth: { title: "Bluetooth", options: BT_DEVICES.map((device) => ({
      label: device, active: settings.bluetooth && settings.btConnected.includes(device),
      select: () => { set("bluetooth", true); set("btConnected", settings.btConnected.includes(device) ? settings.btConnected.filter((d) => d !== device) : [...settings.btConnected, device]); },
    })) },
    mode: { title: "Power Mode", options: (Object.keys(POWER_LABELS) as SettingsType["powerMode"][]).map((mode) => ({ label: POWER_LABELS[mode], active: settings.powerMode === mode, select: () => set("powerMode", mode) })) },
  };
  const open = menu ? submenus[menu] : undefined;

  return (
    <div className="anim-drop absolute right-1.5 top-10 flex w-[380px] flex-col gap-4 rounded-3xl bg-[#2b2b2b] p-4 text-white shadow-2xl">
      <div className="flex items-center gap-2">
        <span className="flex h-9 items-center gap-2 rounded-full bg-white/10 px-3 text-sm">{battery.charging ? <BatteryCharging className="size-4" /> : <BatteryFull className="size-4" />}{battery.level} %</span>
        <div className="flex-1" />
        <button aria-label="Take Screenshot" className={circle} onClick={run(takeScreenshot)}><Camera /></button>
        <button aria-label="Settings" className={circle} onClick={run(() => os.openApp("settings"))}><Settings /></button>
        <button aria-label="Lock Screen" className={circle} onClick={run(() => os.setLocked(true))}><Lock /></button>
        <button aria-label="Power Off / Log Out" aria-expanded={menu === "power"} className={circle} onClick={toggleMenu("power")}><Power /></button>
      </div>
      <Slider icon={settings.volume ? <Volume2 /> : <VolumeX />} label="Volume" value={settings.volume} onChange={(value) => set("volume", value)} onIcon={() => set("volume", settings.volume ? 0 : 50)} />
      <Slider icon={<Sun />} label="Brightness" value={settings.brightness} onChange={(value) => set("brightness", Math.max(10, value))} />
      <div className="grid grid-cols-2 gap-2">
        <Toggle label="Wi-Fi" subtitle={settings.wifi ? settings.wifiNetwork : undefined} icon={<Wifi />} on={settings.wifi} onToggle={() => set("wifi", !settings.wifi)} open={menu === "wifi"} onOpen={toggleMenu("wifi")} />
        <Toggle label="Bluetooth" subtitle={settings.bluetooth && settings.btConnected.length ? `${settings.btConnected.length} connected` : undefined} icon={<Bluetooth />}
          on={settings.bluetooth} onToggle={() => set("bluetooth", !settings.bluetooth)} open={menu === "bluetooth"} onOpen={toggleMenu("bluetooth")} />
        <Toggle label="Power Mode" subtitle={POWER_LABELS[settings.powerMode]} icon={<Gauge />} on={settings.powerMode !== "balanced"} onToggle={toggleMenu("mode")} open={menu === "mode"} onOpen={toggleMenu("mode")} />
        <Toggle label="Night Light" icon={<Moon />} on={settings.nightLight} onToggle={() => set("nightLight", !settings.nightLight)} />
        <Toggle label="Dark Style" icon={<SunMoon />} on={settings.theme === "dark"} onToggle={() => set("theme", settings.theme === "dark" ? "light" : "dark")} />
        <Toggle label="Airplane Mode" icon={<Plane />} on={airplane} onToggle={() => { set("wifi", airplane); set("bluetooth", false); }} />
      </div>
      {open && (
        <div className="anim-drop flex flex-col rounded-2xl bg-white/5 p-1.5" role="menu" aria-label={open.title}>
          <b className="px-3 pb-1 pt-2 text-sm">{open.title}</b>
          {open.options.map((option) => (
            <button key={option.label} role="menuitem" className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10" onClick={option.select}>
              <span className="flex-1">{option.label}</span>{option.active && <Check className="size-4" />}
            </button>
          ))}
          {menu !== "power" && <button className="rounded-lg px-3 py-2 text-left text-sm text-white/70 hover:bg-white/10" onClick={run(() => os.openApp("settings", { args: [menu === "mode" ? "power" : menu!] }))}>{open.title} Settings</button>}
        </div>
      )}
    </div>
  );
}
