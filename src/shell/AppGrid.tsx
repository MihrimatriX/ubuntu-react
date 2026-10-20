// "Show Applications": paged icon grid (page size from the viewport; wheel/←/→ or the dots change page).
// Typing searches like the Overview; Esc or a click on empty space closes it.
import { useEffect, useState } from "react";
import { APPS } from "../apps/registry";
import { useOS } from "../os/store";
import { useViewport } from "../os/useDragResize";
import { SearchField, SearchResults } from "./Overview";

const CELL = { w: 140, h: 140 };

export function AppGrid() {
  const open = useOS((state) => state.overlay === "grid");
  const view = useViewport();
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const close = () => useOS.getState().setOverlay("none");
  const columns = Math.max(2, Math.min(8, Math.floor((view.w - 200) / CELL.w)));
  const rows = Math.max(1, Math.min(4, Math.floor((view.h - 220) / CELL.h)));
  const pages = Math.max(1, Math.ceil(APPS.length / (columns * rows)));
  const turn = (step: number) => setPage((current) => Math.min(pages - 1, Math.max(0, current + step)));

  useEffect(() => {
    setPage(0);
    setQuery("");
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (!query && event.key === "ArrowRight") turn(1);
      if (!query && event.key === "ArrowLeft") turn(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, query, pages]);

  if (!open) return null;
  return (
    <div
      className="anim-pop absolute inset-x-0 bottom-0 top-8 z-[4000] flex flex-col bg-[#1d1d1d]/90 pt-4 text-white backdrop-blur-xl"
      onClick={(e) => e.target === e.currentTarget && close()}
      onWheel={(e) => turn(e.deltaY > 0 ? 1 : -1)}
    >
      <SearchField query={query} setQuery={setQuery} onDone={close} />
      {query ? (
        <SearchResults query={query} onDone={close} />
      ) : (
        <>
          <div
            className="m-auto grid gap-2"
            style={{ gridTemplateColumns: `repeat(${columns}, ${CELL.w}px)` }}
            onClick={(e) => e.target === e.currentTarget && close()}
          >
            {APPS.slice(page * columns * rows, (page + 1) * columns * rows).map((app) => (
              <button
                key={app.id}
                onClick={() => {
                  close();
                  useOS.getState().openApp(app.id);
                }}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl text-sm hover:bg-white/10 focus:bg-white/10"
                style={{ height: CELL.h }}
              >
                <img src={app.icon} alt="" className="size-20" draggable={false} />
                {app.name}
              </button>
            ))}
          </div>
          <div className="mb-24 flex justify-center gap-3">
            {pages > 1 &&
              Array.from({ length: pages }, (_, index) => (
                <button
                  key={index}
                  aria-label={`Page ${index + 1}`}
                  onClick={() => setPage(index)}
                  className={`size-2.5 rounded-full ${index === page ? "bg-white" : "bg-white/30"}`}
                />
              ))}
          </div>
        </>
      )}
    </div>
  );
}
