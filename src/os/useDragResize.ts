// Pointer-driven window move/resize. setPointerCapture keeps events flowing outside the element; during a
// drag only the CSS transform changes (resize writes size directly) — zero React renders — and the final
// rect is committed to the store on pointerup. Dragging a snapped window first restores its normal size.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { clampRect, resizeRect, snapZone, unsnapRect, workArea, type Edge, type Rect, type Size, type SnapState } from "../lib/snap";
import { useOS } from "./store";

export type Zone = Exclude<SnapState, "normal"> | null;

type Options = {
  displayed: Rect; normal: Rect; state: SnapState; area: Rect; min: Size;
  onMove: (rect: Rect) => void; onSnap: (zone: Exclude<Zone, null>) => void; onPreview: (zone: Zone) => void;
};

const DRAG_THRESHOLD = 4;

export function applyRect(el: HTMLElement, rect: Rect, offsetX = 0) {
  Object.assign(el.style, { left: `${rect.x + offsetX}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px`, transform: "" });
}

/** Title-bar elements that keep their own clicks: no drag, double-click or window menu starts on them. */
export const CONTROLS = "button, input, textarea, select, a, [role=tab]";

/**
 * Calls move(dx, dy) for each pointermove once the pointer has travelled `threshold` px, and end() on release
 * if it did. Capture starts only then: capturing on pointerdown retargets the click to the captor, so plain
 * clicks on header widgets (path bar, tabs) would never reach them.
 */
export function track(event: ReactPointerEvent, threshold: number, move: (dx: number, dy: number, e: PointerEvent) => void, end: () => void) {
  const target = event.currentTarget as HTMLElement;
  const { pointerId, clientX: startX, clientY: startY } = event;
  let started = false;
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    const [dx, dy] = [e.clientX - startX, e.clientY - startY];
    if (!started) {
      if (Math.hypot(dx, dy) < threshold) return;
      started = true;
      target.setPointerCapture(pointerId); // keeps events coming over iframes/terminals and off-window
    }
    move(dx, dy, e);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    if (started) end();
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

export function useDragResize(ref: RefObject<HTMLElement | null>, options: Options) {
  const latest = useRef(options);
  latest.current = options;

  /** Commits the gesture result; "commit" lets the layout effect apply it while transitions stay off for one frame. */
  const commit = (el: HTMLElement, apply: () => void) => {
    el.dataset.gesture = "commit";
    apply();
    requestAnimationFrame(() => delete el.dataset.gesture);
  };

  function startDrag(event: ReactPointerEvent) {
    const el = ref.current;
    if (!el || event.button !== 0 || (event.target as HTMLElement).closest(CONTROLS)) return;
    const opts = latest.current;
    let base = opts.displayed;
    let last = base;
    let zone: Zone = null;
    track(event, DRAG_THRESHOLD, (dx, dy, e) => {
      if (el.dataset.gesture !== "drag" && opts.state !== "normal") {
        base = unsnapRect(opts.displayed, opts.normal, { x: e.clientX - dx, y: e.clientY - dy });
        applyRect(el, base, el.offsetLeft - opts.displayed.x);
      }
      el.dataset.gesture = "drag";
      last = clampRect({ ...base, x: base.x + dx, y: base.y + dy }, opts.area);
      el.style.transform = `translate(${last.x - base.x}px, ${last.y - base.y}px)`;
      const nextZone = snapZone({ x: e.clientX, y: e.clientY }, opts.area);
      if (nextZone !== zone) {
        zone = nextZone;
        opts.onPreview(zone);
      }
    }, () => {
      opts.onPreview(null);
      commit(el, () => (zone ? opts.onSnap(zone) : opts.onMove(last)));
    });
  }

  function startResize(edge: Edge, event: ReactPointerEvent) {
    const el = ref.current;
    if (!el || event.button !== 0) return;
    event.stopPropagation();
    const opts = latest.current;
    const offsetX = el.offsetLeft - opts.displayed.x;
    let last = opts.displayed;
    track(event, 0, (dx, dy) => {
      el.dataset.gesture = "resize";
      last = resizeRect(opts.displayed, edge, dx, dy, opts.min);
      applyRect(el, last, offsetX);
    }, () => {
      commit(el, () => opts.onMove(clampRect(last, opts.area)));
    });
  }

  return { startDrag, startResize };
}

/** Viewport size, updated on resize. */
export function useViewport(): Size {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const onResize = () => setSize(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

/** The usable desktop area (viewport minus top bar and dock) for the current dock settings. */
export function useWorkArea(): Rect {
  const view = useViewport();
  const position = useOS((state) => state.settings.dockPosition);
  const iconSize = useOS((state) => state.settings.dockIconSize);
  const autohide = useOS((state) => state.settings.dockAutohide);
  return workArea(view, { position, iconSize, autohide });
}
