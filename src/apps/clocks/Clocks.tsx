// GNOME Clocks: World (time zones via Intl), Stopwatch with laps, and a Timer that sends a notification.
import { useEffect, useState } from "react";
import { notify, useOS, WORLD_CITIES } from "../../os/store";
import { ICONS } from "../../os/icons";
import { HeaderSlot, Segmented } from "../../shell/chrome";
import type { AppProps } from "../registry";

const pad = (value: number) => String(Math.floor(value)).padStart(2, "0");
const duration = (ms: number) => `${pad(ms / 3_600_000)}:${pad((ms / 60_000) % 60)}:${pad((ms / 1000) % 60)}`;

function useTick(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

function World() {
  const now = useTick(1000);
  const clock24 = useOS((state) => state.settings.clock24);
  return (
    <div className="flex flex-col divide-y divide-line rounded-xl border border-line bg-view">
      {WORLD_CITIES.map(([city, zone]) => (
        <div key={city} className="flex items-center justify-between p-4">
          <span>
            <b>{city}</b>
            <br />
            <span className="text-xs text-fg-dim">
              {new Date(now).toLocaleDateString("en-US", { timeZone: zone, weekday: "long" })}
            </span>
          </span>
          <span className="text-2xl tabular-nums">
            {new Date(now).toLocaleTimeString("en-US", {
              timeZone: zone,
              hour: "2-digit",
              minute: "2-digit",
              hour12: !clock24,
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

function Stopwatch() {
  const now = useTick(100);
  const [state, setState] = useState({ startedAt: 0, elapsed: 0, running: false, laps: [] as number[] });
  const total = state.elapsed + (state.running ? now - state.startedAt : 0);
  return (
    <div className="flex flex-col items-center gap-6">
      <span className="text-6xl font-light tabular-nums">
        {duration(total)}.{Math.floor((total % 1000) / 100)}
      </span>
      <div className="flex gap-3">
        <button
          className={`btn ${state.running ? "" : "btn-accent"}`}
          onClick={() =>
            setState(
              state.running
                ? { ...state, running: false, elapsed: total }
                : { ...state, running: true, startedAt: Date.now() },
            )
          }
        >
          {state.running ? "Pause" : total ? "Resume" : "Start"}
        </button>
        <button
          className="btn"
          disabled={!total}
          onClick={() =>
            setState(
              state.running
                ? { ...state, laps: [total, ...state.laps] }
                : { startedAt: 0, elapsed: 0, running: false, laps: [] },
            )
          }
        >
          {state.running ? "Lap" : "Clear"}
        </button>
      </div>
      <ol className="w-64 text-sm">
        {state.laps.map((lap, index) => (
          <li key={lap} className="flex justify-between border-b border-line py-1">
            <span>Lap {state.laps.length - index}</span>
            <span>{duration(lap)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Timer() {
  const now = useTick(250);
  const [minutes, setMinutes] = useState(5);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const left = endsAt ? Math.max(0, endsAt - now) : minutes * 60_000;
  useEffect(() => {
    if (endsAt && left === 0) {
      setEndsAt(null);
      notify({ title: "Time is up!", body: `${minutes} minute timer finished`, icon: ICONS.clocks });
    }
  }, [endsAt, left, minutes]);
  return (
    <div className="flex flex-col items-center gap-6">
      <span className="text-6xl font-light tabular-nums">{duration(left + 999)}</span>
      {!endsAt && (
        <label className="flex items-center gap-2 text-sm">
          Minutes
          <input
            type="number"
            min={1}
            max={999}
            value={minutes}
            className="field w-24"
            onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
      )}
      <button
        className={`btn ${endsAt ? "" : "btn-accent"}`}
        onClick={() => setEndsAt(endsAt ? null : Date.now() + minutes * 60_000)}
      >
        {endsAt ? "Cancel" : "Start"}
      </button>
    </div>
  );
}

export default function Clocks({ windowId }: AppProps) {
  const [tab, setTab] = useState<"World" | "Stopwatch" | "Timer">("World");
  const Page = { World, Stopwatch, Timer }[tab];
  return (
    <div className="h-full overflow-auto bg-window p-6">
      <HeaderSlot windowId={windowId} side="center">
        <Segmented
          label="View"
          value={tab}
          options={{ World: "World", Stopwatch: "Stopwatch", Timer: "Timer" }}
          onChange={setTab}
        />
      </HeaderSlot>
      <div className="mx-auto max-w-xl">
        <Page />
      </div>
    </div>
  );
}
