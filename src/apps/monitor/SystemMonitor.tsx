// System Monitor: Processes are derived from real open windows (+ a few fixed system daemons) and
// "End Process" really closes the window; Resources plots CPU/RAM as a bounded random walk sampled
// every second; File Systems reports actual VFS storage use.
import { useEffect, useMemo, useState } from "react";
import { appById } from "../registry";
import { usage } from "../../os/fs";
import { useOS } from "../../os/store";
import { QUOTA_CHARS } from "../../os/storage";
import { HeaderSlot, Segmented } from "../../shell/chrome";
import type { AppProps } from "../registry";

const SAMPLES = 60;
const SYSTEM = [
  { name: "systemd", pid: 1, memory: 12.4 },
  { name: "gnome-shell", pid: 1987, memory: 312.6 },
  { name: "Xwayland", pid: 2044, memory: 64.1 },
  { name: "pipewire", pid: 2103, memory: 18.9 },
  { name: "nautilus-desktop", pid: 2210, memory: 41.7 },
];

/** Next value of a mean-reverting random walk clamped to [min, max]. */
export function walkStep(value: number, min: number, max: number, random = Math.random): number {
  const pull = ((min + max) / 2 - value) * 0.05;
  return Math.min(max, Math.max(min, value + pull + (random() - 0.5) * (max - min) * 0.15));
}

const pidOf = (id: string) => 3000 + [...id].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 9000, 7);

function Chart({ series, color, label }: { series: number[]; color: string; label: string }) {
  const points = series.map((value, index) => `${(index / (SAMPLES - 1)) * 600},${150 - value * 1.5}`).join(" ");
  return (
    <figure className="mb-6">
      <figcaption className="mb-2 flex justify-between text-sm">
        <b>{label}</b>
        <span>{series.at(-1)?.toFixed(1)}%</span>
      </figcaption>
      <svg
        viewBox="0 0 600 150"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label} history`}
        className="h-36 w-full rounded-lg border border-line bg-view"
      >
        {[37.5, 75, 112.5].map((y) => (
          <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="var(--line)" />
        ))}
        <polygon points={`0,150 ${points} 600,150`} fill={color} fillOpacity="0.15" />
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </figure>
  );
}

export default function SystemMonitor({ windowId }: AppProps) {
  const windows = useOS((state) => state.windows);
  const fs = useOS((state) => state.fs);
  const [tab, setTab] = useState<"processes" | "resources" | "filesystems">("processes");
  const [cpu, setCpu] = useState(() => Array.from({ length: SAMPLES }, () => 12));
  const [ram, setRam] = useState(() => Array.from({ length: SAMPLES }, () => 38));
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      const load = useOS.getState().windows.length * 4;
      setCpu((series) => [...series.slice(1), walkStep(series.at(-1)!, 2 + load / 2, 30 + load)]);
      setRam((series) => [...series.slice(1), walkStep(series.at(-1)!, 30 + load / 2, 45 + load)]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const processes = [
    ...windows.map((win) => ({
      id: win.id,
      name: appById(win.appId)?.name ?? win.appId,
      pid: pidOf(win.id),
      cpu: (cpu.at(-1)! / Math.max(windows.length, 1)) * 0.6,
      memory: 80 + (pidOf(win.id) % 220),
    })),
    ...SYSTEM.map((proc) => ({ id: "", ...proc, cpu: cpu.at(-1)! * 0.08 })),
  ];
  const vfsBytes = useMemo(() => JSON.stringify(fs).length, [fs]); // the 1s chart tick must not re-serialize the VFS

  return (
    <div className="flex h-full flex-col bg-window">
      <HeaderSlot windowId={windowId} side="center">
        <Segmented
          label="View"
          value={tab}
          options={{ processes: "Processes", resources: "Resources", filesystems: "File Systems" }}
          onChange={setTab}
        />
      </HeaderSlot>
      {tab === "processes" && (
        <>
          <div className="min-h-0 flex-1 overflow-auto bg-view">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-view text-left text-xs text-fg-dim">
                <tr>
                  <th className="p-2">Process Name</th>
                  <th>User</th>
                  <th>% CPU</th>
                  <th>ID</th>
                  <th>Memory</th>
                </tr>
              </thead>
              <tbody>
                {processes.map((proc) => (
                  <tr
                    key={proc.pid}
                    aria-selected={selected === proc.id && !!proc.id}
                    onClick={() => setSelected(proc.id || null)}
                    className={selected === proc.id && proc.id ? "bg-accent/20" : "hover:bg-hover"}
                  >
                    <td className="p-2">{proc.name}</td>
                    <td>{proc.id ? "ubuntu" : "root"}</td>
                    <td>{proc.cpu.toFixed(1)}</td>
                    <td>{proc.pid}</td>
                    <td>{proc.memory.toFixed(1)} MB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="flex justify-end border-t border-line p-2">
            <button
              className="btn btn-danger"
              disabled={!selected}
              onClick={() => {
                useOS.getState().closeWindow(selected!);
                setSelected(null);
              }}
            >
              End Process
            </button>
          </footer>
        </>
      )}
      {tab === "resources" && (
        <div className="overflow-auto p-6">
          <Chart series={cpu} color="#E95420" label={`CPU (${navigator.hardwareConcurrency || 4} cores)`} />
          <Chart series={ram} color="#7764D8" label="Memory and Swap" />
        </div>
      )}
      {tab === "filesystems" && (
        <div className="p-6">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-fg-dim">
              <tr>
                <th className="pb-2">Device</th>
                <th>Directory</th>
                <th>Type</th>
                <th>Used</th>
                <th className="w-1/3">Usage</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>/dev/vfs0</td>
                <td>/</td>
                <td>localStorage</td>
                <td>
                  {(vfsBytes / 1024).toFixed(1)} kB ({(usage(fs) / 1024).toFixed(1)} kB files)
                </td>
                <td>
                  <div className="h-2 rounded-full bg-hover">
                    <div
                      className="h-2 rounded-full bg-accent"
                      style={{ width: `${Math.min(100, (vfsBytes / QUOTA_CHARS) * 100)}%` }}
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
