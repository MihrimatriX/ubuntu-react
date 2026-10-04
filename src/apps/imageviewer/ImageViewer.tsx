// Image Viewer (Loupe): zoom with wheel / trackpad pinch (ctrl+wheel) / buttons, drag to pan, fit or 1:1,
// rotate, and ←/→ through the other images in the same folder. Image files hold their URL as content.
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FolderOpen, Maximize, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { HOME, basename, dirname, list } from "../../os/fs";
import { useOS } from "../../os/store";
import { FilePicker } from "../../shell/FilePicker";
import { HeaderSlot } from "../../shell/chrome";
import type { AppProps } from "../registry";

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 20;
type View = { zoom: number | "fit"; x: number; y: number; rotation: number };
const FIT: View = { zoom: "fit", x: 0, y: 0, rotation: 0 };

export default function ImageViewer({ windowId, filePath }: AppProps) {
  const fs = useOS((state) => state.fs);
  const [path, setPath] = useState(filePath ?? null);
  const [view, setView] = useState<View>(FIT);
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [picking, setPicking] = useState(!filePath);
  const stage = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.focus();
  }, []);
  const node = path ? fs[path] : undefined;
  const siblings = path ? list(fs, dirname(path)).map((name) => `${dirname(path)}/${name}`).filter((p) => fs[p]?.mime?.startsWith("image/")) : [];

  useEffect(() => { if (filePath) setPath(filePath); }, [filePath]);
  useEffect(() => {
    setView(FIT);
  }, [path]);
  useEffect(() => {
    useOS.getState().patchWindow(windowId, { title: path ? basename(path) : "Image Viewer" });
  }, [path, windowId]);

  const fitZoom = () => {
    const box = stage.current?.getBoundingClientRect();
    return box ? Math.min(box.width / natural.w, box.height / natural.h, 1) : 1;
  };
  const zoom = view.zoom === "fit" ? fitZoom() : view.zoom;
  /** Zooms by `factor`, keeping the point under the cursor (relative to the stage center) fixed. */
  const zoomBy = (factor: number, at = { x: 0, y: 0 }) => setView((current) => {
    const from = current.zoom === "fit" ? fitZoom() : current.zoom;
    const to = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, from * factor));
    const ratio = to / from;
    return { ...current, zoom: to, x: at.x - (at.x - current.x) * ratio, y: at.y - (at.y - current.y) * ratio };
  });
  const cursor = (e: React.MouseEvent) => {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - box.left - box.width / 2, y: e.clientY - box.top - box.height / 2 };
  };
  const step = (delta: number) => {
    const next = siblings[(siblings.indexOf(path ?? "") + delta + siblings.length) % siblings.length];
    if (next) setPath(next);
  };

  function pan(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const el = event.currentTarget;
    const start = { x: event.clientX - view.x, y: event.clientY - view.y };
    el.setPointerCapture(event.pointerId);
    el.onpointermove = (e) => setView((current) => ({ ...current, x: e.clientX - start.x, y: e.clientY - start.y }));
    el.onpointerup = () => { el.onpointermove = el.onpointerup = null; };
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const keys: Record<string, () => void> = {
      ArrowLeft: () => step(-1), ArrowRight: () => step(1), "+": () => zoomBy(1.25), "=": () => zoomBy(1.25), "-": () => zoomBy(0.8),
      "0": () => setView(FIT), "1": () => setView({ ...view, zoom: 1, x: 0, y: 0 }), r: () => setView({ ...view, rotation: view.rotation + 90 }),
    };
    keys[event.key]?.();
  }

  return (
    <div ref={root} className="relative flex h-full flex-col bg-[#1e1e1e] text-white outline-none" tabIndex={0} onKeyDown={onKeyDown}>
      <HeaderSlot windowId={windowId}>
        <button className="btn btn-flat" aria-label="Open" onClick={() => setPicking(true)}><FolderOpen className="size-4" /></button>
      </HeaderSlot>
      <HeaderSlot windowId={windowId} side="end">
        <button className="btn btn-flat" aria-label="Rotate Left" onClick={() => setView({ ...view, rotation: view.rotation - 90 })}><RotateCcw className="size-4" /></button>
        <button className="btn btn-flat" aria-label="Rotate Right" onClick={() => setView({ ...view, rotation: view.rotation + 90 })}><RotateCw className="size-4" /></button>
      </HeaderSlot>
      <div ref={stage} className="relative min-h-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing" onPointerDown={pan}
        onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, cursor(e))} onDoubleClick={() => setView(view.zoom === "fit" ? { ...view, zoom: 1 } : FIT)}>
        {node?.content ? (
          <img src={node.content} alt={basename(path!)} draggable={false} onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth || 1, h: e.currentTarget.naturalHeight || 1 })}
            className="absolute left-1/2 top-1/2 max-w-none select-none" style={{
              width: natural.w, height: natural.h,
              transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px)) rotate(${view.rotation}deg) scale(${zoom})`,
            }} />
        ) : (
          <p className="grid h-full place-items-center text-white/50">{path ? "Could not load image" : "No image open"}</p>
        )}
        {siblings.length > 1 && (["left", "right"] as const).map((side) => (
          <button key={side} aria-label={side === "left" ? "Previous Image" : "Next Image"} onPointerDown={(e) => e.stopPropagation()} onClick={() => step(side === "left" ? -1 : 1)}
            className={`absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/50 hover:bg-black/70 ${side === "left" ? "left-3" : "right-3"}`}>
            {side === "left" ? <ChevronLeft /> : <ChevronRight />}
          </button>
        ))}
      </div>
      <footer className="flex items-center justify-center gap-1 bg-black/40 p-1.5 text-sm">
        <button className="btn btn-flat text-white" aria-label="Zoom Out" onClick={() => zoomBy(0.8)}><ZoomOut className="size-4" /></button>
        <span className="w-14 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button className="btn btn-flat text-white" aria-label="Zoom In" onClick={() => zoomBy(1.25)}><ZoomIn className="size-4" /></button>
        <button className="btn btn-flat text-white" aria-label="Best Fit" onClick={() => setView({ ...FIT, rotation: view.rotation })}><Maximize className="size-4" /></button>
        <button className="btn btn-flat text-white" onClick={() => setView({ ...view, zoom: 1, x: 0, y: 0 })}>1:1</button>
      </footer>
      {picking && (
        <FilePicker mode="open" title="Open Image" initialDir={path ? dirname(path) : `${HOME}/Pictures`} accept={(mime) => mime.startsWith("image/")}
          onCancel={() => setPicking(false)} onPick={(picked) => { setPicking(false); setPath(picked); }} />
      )}
    </div>
  );
}
