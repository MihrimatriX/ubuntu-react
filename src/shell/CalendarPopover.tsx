// Date menu: notification list + Do Not Disturb on the left, month calendar (with month paging) on the right.
import { useState } from "react";
import { BellOff, ChevronLeft, ChevronRight } from "lucide-react";
import { useOS, WORLD_CITIES } from "../os/store";
import { Switch } from "./chrome";
import { NoteCard } from "./Notifications";

/** 6×7 grid of dates for the month containing `month`, weeks starting on Sunday. */
function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  return Array.from(
    { length: 42 },
    (_, index) => new Date(first.getFullYear(), first.getMonth(), index - first.getDay() + 1),
  );
}

export function CalendarPopover({ onClose }: { onClose: () => void }) {
  const clock24 = useOS((state) => state.settings.clock24);
  const notes = useOS((state) => state.notes);
  const dnd = useOS((state) => state.settings.dnd);
  const os = useOS.getState();
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const shift = (delta: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  return (
    <div className="anim-drop absolute left-1/2 top-10 flex w-[720px] max-w-[95vw] -translate-x-1/2 gap-3 rounded-3xl bg-[#2b2b2b] p-3 text-white shadow-2xl">
      <section className="flex min-h-80 flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-1">
          {notes.length === 0 ? (
            <div className="m-auto flex flex-col items-center gap-2 text-white/40">
              <BellOff className="size-12" />
              No Notifications
            </div>
          ) : (
            notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onClose={() => useOS.setState({ notes: notes.filter((n) => n.id !== note.id) })}
              />
            ))
          )}
        </div>
        <div className="flex items-center justify-between pt-2">
          <span className="flex items-center gap-3 text-sm">
            Do Not Disturb
            <Switch label="Do Not Disturb" checked={dnd} onChange={(value) => os.setSetting("dnd", value)} />
          </span>
          <button
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-40"
            disabled={!notes.length}
            onClick={os.clearNotes}
          >
            Clear
          </button>
        </div>
      </section>
      <section className="w-72 rounded-2xl bg-white/5 p-3">
        <div className="text-sm text-white/70">{today.toLocaleDateString("en-US", { weekday: "long" })}</div>
        <div className="mb-3 text-lg font-bold">
          {today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </div>
        <div className="mb-2 flex items-center justify-between">
          <button aria-label="Previous month" className="rounded-full p-1 hover:bg-white/10" onClick={() => shift(-1)}>
            <ChevronLeft className="size-4" />
          </button>
          <b className="text-sm">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</b>
          <button aria-label="Next month" className="rounded-full p-1 hover:bg-white/10" onClick={() => shift(1)}>
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
          {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
            <b key={index} className="py-1 text-white/50">
              {day}
            </b>
          ))}
          {monthGrid(month).map((date) => {
            const isToday = date.toDateString() === today.toDateString();
            const outside = date.getMonth() !== month.getMonth();
            return (
              <span
                key={date.toISOString()}
                className={`mx-auto grid size-8 place-items-center rounded-full ${isToday ? "bg-accent font-bold" : ""} ${outside ? "text-white/30" : ""}`}
              >
                {date.getDate()}
              </span>
            );
          })}
        </div>
        <button
          className="mt-3 w-full rounded-xl bg-white/5 p-3 text-left text-sm hover:bg-white/10"
          onClick={() => {
            onClose();
            os.openApp("clocks");
          }}
        >
          <b className="mb-1 block">World Clocks</b>
          {WORLD_CITIES.slice(1, 4).map(([city, zone]) => (
            <span key={city} className="flex justify-between text-white/80">
              {city}
              <span>
                {new Date().toLocaleTimeString("en-US", {
                  timeZone: zone,
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: !clock24,
                })}
              </span>
            </span>
          ))}
        </button>
      </section>
    </div>
  );
}
