// notify() banners: the newest toasts stack at the top right and expire after 5s (store timer). The same
// NoteCard renders entries in the calendar popover's notification list.
import { X } from "lucide-react";
import { useOS, type Note } from "../os/store";

const timeAgo = (time: number) => {
  const minutes = Math.floor((Date.now() - time) / 60_000);
  return minutes < 1 ? "Just now" : minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ago`;
};

export function NoteCard({ note, onClose }: { note: Note; onClose: () => void }) {
  return (
    <div className="anim-drop relative flex gap-3 rounded-xl bg-[#3a3a3a] p-3 text-white shadow-lg">
      {note.icon && <img src={note.icon} alt="" className="size-8 shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <b className="truncate text-sm">{note.title}</b>
          <span className="ml-auto shrink-0 text-xs text-white/50">{timeAgo(note.time)}</span>
        </div>
        {note.body && <p className="mt-0.5 line-clamp-3 text-sm text-white/80">{note.body}</p>}
        {note.action && (
          <button
            className="mt-2 rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
            onClick={() => {
              note.action?.run();
              onClose();
            }}
          >
            {note.action.label}
          </button>
        )}
      </div>
      <button
        aria-label="Close notification"
        className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-[#555] hover:bg-[#666]"
        onClick={onClose}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

export function Notifications() {
  const toasts = useOS((state) => state.toasts);
  const notes = useOS((state) => state.notes);
  const dismiss = useOS((state) => state.dismissToast);
  const visible = notes.filter((note) => toasts.includes(note.id)).slice(0, 3);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-3 top-11 z-[8000] flex w-96 flex-col gap-2">
      {visible.map((note) => (
        <div key={note.id} className="pointer-events-auto">
          <NoteCard note={note} onClose={() => dismiss(note.id)} />
        </div>
      ))}
    </div>
  );
}
