// GNOME top bar: workspace pill (→ Overview), clock (→ calendar + notifications), status icons
// (→ Quick Settings). The clock re-renders exactly on minute boundaries; the top-left pixel is the hot
// corner (opens the Overview when enabled); battery state comes from the Battery Status API when available.
import { useEffect, useState } from "react";
import {
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  BellOff,
  Bluetooth,
  Power,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useOS } from "../os/store";
import { workspaceCount } from "../os/windows";
import { CalendarPopover } from "./CalendarPopover";
import { QuickSettings } from "./QuickSettings";

/** Current time, refreshed at each minute boundary. */
export function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setTimeout(() => setNow(new Date()), 60_000 - (Date.now() % 60_000) + 50);
    return () => clearTimeout(timer);
  }, [now]);
  return now;
}

type BatteryManager = EventTarget & { level: number; charging: boolean };

/** Real battery level/charging state where the browser exposes it, otherwise a full, charging battery. */
export function useBattery() {
  const [battery, setBattery] = useState({ level: 100, charging: true });
  useEffect(() => {
    let manager: BatteryManager | undefined;
    const read = () => manager && setBattery({ level: Math.round(manager.level * 100), charging: manager.charging });
    const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryManager> }).getBattery;
    getBattery
      ?.call(navigator)
      .then((found) => {
        manager = found;
        read();
        ["levelchange", "chargingchange"].forEach((type) => found.addEventListener(type, read));
      })
      .catch(() => undefined);
    return () => ["levelchange", "chargingchange"].forEach((type) => manager?.removeEventListener(type, read));
  }, []);
  return battery;
}

const batteryIcon = ({ level, charging }: { level: number; charging: boolean }) =>
  charging ? <BatteryCharging /> : level > 60 ? <BatteryFull /> : level > 25 ? <BatteryMedium /> : <BatteryLow />;

export const formatTime = (date: Date, clock24: boolean) =>
  date.toLocaleTimeString("en-US", { hour: clock24 ? "2-digit" : "numeric", minute: "2-digit", hour12: !clock24 });

type Popover = "none" | "calendar" | "quick";

export function TopBar() {
  const now = useMinute();
  const settings = useOS((state) => state.settings);
  const workspace = useOS((state) => state.workspace);
  const count = useOS(workspaceCount);
  const overlay = useOS((state) => state.overlay);
  const unread = useOS((state) => state.notes.length > 0);
  const [popover, setPopover] = useState<Popover>("none");
  const battery = useBattery();
  useEffect(() => {
    if (popover === "none") return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setPopover("none");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popover]);
  const toggle = (next: Popover) => setPopover((current) => (current === next ? "none" : next));
  const pill = "flex h-6 items-center rounded-full px-3 hover:bg-white/15 aria-expanded:bg-white/20";

  return (
    <header className="fixed inset-x-0 top-0 z-[6000] flex h-8 items-center justify-between bg-black px-1.5 text-sm font-medium text-white">
      <div
        aria-hidden
        className="absolute left-0 top-0 size-1"
        onPointerEnter={() =>
          settings.hotCorner && useOS.getState().setOverlay(overlay === "none" ? "overview" : "none")
        }
      />
      <button
        aria-label="Activities"
        aria-expanded={overlay !== "none"}
        className={`${pill} gap-1.5`}
        onClick={() => useOS.getState().setOverlay(overlay === "none" ? "overview" : "none")}
      >
        {Array.from({ length: count }, (_, index) => (
          <i
            key={index}
            className={`block h-2 rounded-full bg-white transition-all ${index === workspace ? "w-8" : "w-2 opacity-60"}`}
          />
        ))}
      </button>
      <button
        aria-expanded={popover === "calendar"}
        className={`${pill} absolute left-1/2 -translate-x-1/2 gap-2`}
        onClick={() => toggle("calendar")}
      >
        {now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}&nbsp;&nbsp;
        {formatTime(now, settings.clock24)}
        {settings.dnd ? (
          <BellOff className="size-3.5" />
        ) : (
          unread && <i className="block size-1.5 rounded-full bg-white" />
        )}
      </button>
      <button
        aria-label="System menu"
        aria-expanded={popover === "quick"}
        className={`${pill} gap-2.5 [&>svg]:size-4`}
        onClick={() => toggle("quick")}
      >
        {settings.wifi ? <Wifi /> : <WifiOff />}
        {settings.bluetooth && <Bluetooth />}
        {settings.volume > 0 ? <Volume2 /> : <VolumeX />}
        {batteryIcon(battery)}
        <Power />
      </button>
      {popover !== "none" && (
        <>
          <div className="fixed inset-0 top-8" onPointerDown={() => setPopover("none")} />
          {popover === "calendar" ? (
            <CalendarPopover onClose={() => setPopover("none")} />
          ) : (
            <QuickSettings close={() => setPopover("none")} />
          )}
        </>
      )}
    </header>
  );
}
