// Window geometry, all pure: the work area is the viewport minus top bar and dock; snap states map
// to rects inside it; drag/resize results are clamped so at least 40px of the title bar stays visible.

export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };
export type SnapState = "normal" | "max" | "left" | "right";
export type DockPosition = "left" | "bottom" | "right";
export type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const TOPBAR_HEIGHT = 32;
const EDGE_THRESHOLD = 12;
const MIN_VISIBLE = 40;
const HEADER_HEIGHT = 46;

export const dockThickness = (iconSize: number) => iconSize + 20;

export function workArea(view: Size, dock: { position: DockPosition; iconSize: number; autohide: boolean }): Rect {
  const thickness = dock.autohide ? 0 : dockThickness(dock.iconSize);
  const area = { x: 0, y: TOPBAR_HEIGHT, w: view.w, h: view.h - TOPBAR_HEIGHT };
  if (dock.position === "left") return { ...area, x: thickness, w: area.w - thickness };
  if (dock.position === "right") return { ...area, w: area.w - thickness };
  return { ...area, h: area.h - thickness };
}

export function snapRect(state: SnapState, area: Rect, normal: Rect): Rect {
  const half = Math.round(area.w / 2);
  if (state === "max") return area;
  if (state === "left") return { ...area, w: half };
  if (state === "right") return { ...area, x: area.x + half, w: area.w - half };
  return normal;
}

/** Which snap target the pointer is hovering while dragging, if any. */
export function snapZone(pointer: { x: number; y: number }, area: Rect): Exclude<SnapState, "normal"> | null {
  if (pointer.y <= area.y + 4) return "max";
  if (pointer.x <= area.x + EDGE_THRESHOLD) return "left";
  if (pointer.x >= area.x + area.w - EDGE_THRESHOLD) return "right";
  return null;
}

/** Keeps the title bar reachable: ≥40px horizontally on screen, never above the top bar or below the area. */
export function clampRect(rect: Rect, area: Rect): Rect {
  const x = Math.min(Math.max(rect.x, area.x - rect.w + MIN_VISIBLE), area.x + area.w - MIN_VISIBLE);
  const y = Math.min(Math.max(rect.y, area.y), area.y + area.h - HEADER_HEIGHT);
  return { ...rect, x, y };
}

/** New rect after dragging `edge` by (dx, dy), respecting the minimum size from the opposite edge. */
export function resizeRect(start: Rect, edge: Edge, dx: number, dy: number, min: Size): Rect {
  let { x, y, w, h } = start;
  if (edge.includes("e")) w = Math.max(min.w, start.w + dx);
  if (edge.includes("s")) h = Math.max(min.h, start.h + dy);
  if (edge.includes("w")) {
    w = Math.max(min.w, start.w - dx);
    x = start.x + start.w - w;
  }
  if (edge.includes("n")) {
    h = Math.max(min.h, start.h - dy);
    y = start.y + start.h - h;
  }
  return { x, y, w, h };
}

/** Initial placement: centered in the area, shifted diagonally for each already-open window. */
export function cascade(index: number, size: Size, area: Rect): Rect {
  const w = Math.min(size.w, area.w);
  const h = Math.min(size.h, area.h);
  const offset = (index % 8) * 28;
  const x = area.x + Math.max(0, (area.w - w) / 2) + offset;
  const y = area.y + Math.max(0, (area.h - h) / 2) + offset;
  return clampRect({ x: Math.round(x), y: Math.round(y), w, h }, area);
}

/**
 * Where a snapped/maximized window lands when the user starts dragging it: it gets its old size back
 * and stays under the pointer at the same relative x position, like GNOME/Mutter.
 */
export function unsnapRect(snapped: Rect, normal: Rect, pointer: { x: number; y: number }): Rect {
  const ratio = (pointer.x - snapped.x) / snapped.w;
  return { ...normal, x: Math.round(pointer.x - normal.w * ratio), y: snapped.y };
}

/**
 * Overview layout: windows go into a near-square grid of cells inside `area`, each scaled down (never up)
 * to fit its cell with a margin and centered in it. Returns one rect per input size, same order.
 */
export function overviewLayout(sizes: Size[], area: Rect, gap = 32): Rect[] {
  const columns = Math.ceil(Math.sqrt(sizes.length));
  const rows = Math.ceil(sizes.length / columns);
  const cellW = (area.w - gap * (columns + 1)) / columns;
  const cellH = (area.h - gap * (rows + 1)) / rows;
  return sizes.map((size, index) => {
    const scale = Math.min(1, cellW / size.w, cellH / size.h);
    const [w, h] = [size.w * scale, size.h * scale];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const inRow = row === rows - 1 ? sizes.length - row * columns : columns; // center a partial last row
    const rowOffset = ((columns - inRow) * (cellW + gap)) / 2;
    const x = area.x + gap + rowOffset + column * (cellW + gap) + (cellW - w) / 2;
    const y = area.y + gap + row * (cellH + gap) + (cellH - h) / 2;
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  });
}
