// Settings panels for hardware-ish things: Wi-Fi, Bluetooth, Displays, Power, Multitasking, Notifications,
// Date & Time. Radios are simulated, but every switch drives real desktop behavior (hot corner, auto-lock…).
import { Bluetooth as BluetoothIcon, Check, Lock, Wifi as WifiIcon } from "lucide-react";
import { useViewport } from "../../os/useDragResize";
import { BT_DEVICES, NETWORKS, POWER_MODES, toggle, useOS, type Settings } from "../../os/store";
import { useBattery } from "../../shell/TopBar";
import { Group, Row, Switch, set } from "./widgets";

export function Wifi() {
  const { wifi, wifiNetwork } = useOS((state) => state.settings);
  return (
    <>
      <Group>
        <Row title="Wi-Fi">
          <Switch label="Wi-Fi" checked={wifi} onChange={set("wifi")} />
        </Row>
      </Group>
      <Group title="Visible Networks">
        {!wifi && <Row title="Wi-Fi is turned off" subtitle="Turn on to connect to a wireless network" disabled />}
        {wifi &&
          NETWORKS.map(([name, signal, secured]) => (
            <button
              key={name}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-hover"
              onClick={() => set("wifiNetwork")(name)}
            >
              <WifiIcon className="size-4" style={{ opacity: 0.4 + signal * 0.2 }} />
              <span className="flex-1">
                {name}
                {name === wifiNetwork && <span className="ml-2 text-xs text-fg-dim">Connected</span>}
              </span>
              {secured && <Lock className="size-3.5 text-fg-dim" />}
              {name === wifiNetwork && <Check className="size-4 text-accent" />}
            </button>
          ))}
      </Group>
    </>
  );
}

export function Bluetooth() {
  const { bluetooth, btConnected } = useOS((state) => state.settings);
  return (
    <>
      <Group>
        <Row title="Bluetooth" subtitle={bluetooth ? "Visible as “ubuntu”" : undefined}>
          <Switch label="Bluetooth" checked={bluetooth} onChange={set("bluetooth")} />
        </Row>
      </Group>
      <Group title="Devices">
        {!bluetooth && <Row title="Bluetooth is turned off" disabled />}
        {bluetooth &&
          BT_DEVICES.map((device) => (
            <Row key={device} title={device} subtitle={btConnected.includes(device) ? "Connected" : "Disconnected"}>
              <BluetoothIcon className="size-4 text-fg-dim" />
              <button className="btn" onClick={() => set("btConnected")(toggle(btConnected, device))}>
                {btConnected.includes(device) ? "Disconnect" : "Connect"}
              </button>
            </Row>
          ))}
      </Group>
    </>
  );
}

export function Displays() {
  const view = useViewport();
  const nightLight = useOS((state) => state.settings.nightLight);
  const ratio = window.devicePixelRatio || 1;
  return (
    <>
      <Group title="Built-in Display">
        <Row
          title="Resolution"
          subtitle={`${Math.round(view.w * ratio)} × ${Math.round(view.h * ratio)} (${(view.w / view.h).toFixed(2)}:1)`}
        />
        <Row
          title="Scale"
          subtitle={`${Math.round(ratio * 100)} % — change it with the browser zoom (Ctrl + / Ctrl −)`}
        />
        <Row title="Orientation" subtitle="Landscape" disabled />
        <Row title="Refresh Rate" subtitle="60.00 Hz" disabled />
      </Group>
      <Group title="Night Light">
        <Row title="Night Light" subtitle="Makes the screen warmer to reduce eye strain">
          <Switch label="Night Light" checked={nightLight} onChange={set("nightLight")} />
        </Row>
      </Group>
    </>
  );
}

export function Power() {
  const { powerMode, blankMinutes } = useOS((state) => state.settings);
  const battery = useBattery();
  return (
    <>
      <Group title="Battery">
        <Row title={battery.charging ? "Charging" : "On battery"} subtitle={`${battery.level} %`} />
      </Group>
      <Group title="Power Mode">
        {(Object.keys(POWER_MODES) as Settings["powerMode"][]).map((mode) => (
          <label key={mode} className="flex items-center gap-3 px-4 py-3 text-sm">
            <input
              type="radio"
              name="power-mode"
              checked={powerMode === mode}
              onChange={() => set("powerMode")(mode)}
              className="accent-accent"
            />
            {POWER_MODES[mode]}
          </label>
        ))}
      </Group>
      <Group title="Power Saving">
        <Row title="Screen Blank" subtitle="Lock the screen after this much inactivity">
          <select className="field" value={blankMinutes} onChange={(e) => set("blankMinutes")(Number(e.target.value))}>
            {[1, 5, 15, 30].map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minute{minutes > 1 ? "s" : ""}
              </option>
            ))}
            <option value={0}>Never</option>
          </select>
        </Row>
      </Group>
    </>
  );
}

export function Multitasking() {
  const hotCorner = useOS((state) => state.settings.hotCorner);
  return (
    <>
      <Group title="General">
        <Row title="Hot Corner" subtitle="Touch the top-left corner to open the Activities Overview">
          <Switch label="Hot Corner" checked={hotCorner} onChange={set("hotCorner")} />
        </Row>
        <Row
          title="Active Screen Edges"
          subtitle="Drag windows against the top, left, and right screen edges to resize them"
        >
          <Switch label="Active Screen Edges" checked disabled onChange={() => undefined} />
        </Row>
      </Group>
      <Group title="Workspaces">
        <Row title="Dynamic workspaces" subtitle="Automatically removes empty workspaces">
          <Check className="size-4 text-accent" />
        </Row>
        <Row title="Fixed number of workspaces" disabled />
      </Group>
    </>
  );
}

export function Notifications() {
  const { dnd, lockNotifications } = useOS((state) => state.settings);
  return (
    <Group>
      <Row title="Do Not Disturb" subtitle="Notifications are still listed in the calendar, but no banners are shown">
        <Switch label="Do Not Disturb" checked={dnd} onChange={set("dnd")} />
      </Row>
      <Row title="Lock Screen Notifications" subtitle="Show how many notifications arrived while locked">
        <Switch label="Lock Screen Notifications" checked={lockNotifications} onChange={set("lockNotifications")} />
      </Row>
    </Group>
  );
}

export function DateTime() {
  const clock24 = useOS((state) => state.settings.clock24);
  return (
    <Group title="Date & Time">
      <Row title="Automatic Date & Time" subtitle="Requires internet access" disabled>
        <Switch label="Automatic Date & Time" checked disabled onChange={() => undefined} />
      </Row>
      <Row title="Time Zone" subtitle={Intl.DateTimeFormat().resolvedOptions().timeZone} />
      <Row title="Time Format">
        <select
          className="field"
          value={clock24 ? "24" : "12"}
          onChange={(e) => set("clock24")(e.target.value === "24")}
        >
          <option value="24">24-hour</option>
          <option value="12">AM / PM</option>
        </select>
      </Row>
    </Group>
  );
}
