import { describe, expect, test } from "bun:test";
import {
  cascade,
  clampRect,
  overviewLayout,
  resizeRect,
  snapRect,
  snapZone,
  unsnapRect,
  workArea,
} from "../src/lib/snap";

const view = { w: 1920, h: 1080 };
const area = workArea(view, { position: "left", iconSize: 48, autohide: false });

describe("workArea", () => {
  test("subtracts top bar and dock on each side", () => {
    expect(area).toEqual({ x: 68, y: 32, w: 1852, h: 1048 });
    expect(workArea(view, { position: "bottom", iconSize: 48, autohide: false })).toEqual({
      x: 0,
      y: 32,
      w: 1920,
      h: 980,
    });
    expect(workArea(view, { position: "right", iconSize: 48, autohide: true })).toEqual({
      x: 0,
      y: 32,
      w: 1920,
      h: 1048,
    });
  });
});

describe("snap", () => {
  const normal = { x: 300, y: 200, w: 600, h: 400 };
  test("snapRect maps states to halves / full area", () => {
    expect(snapRect("max", area, normal)).toEqual(area);
    expect(snapRect("left", area, normal)).toEqual({ ...area, w: 926 });
    expect(snapRect("right", area, normal)).toEqual({ ...area, x: 68 + 926, w: 926 });
    expect(snapRect("normal", area, normal)).toBe(normal);
  });
  test("snapZone detects edges", () => {
    expect(snapZone({ x: 900, y: 10 }, area)).toBe("max");
    expect(snapZone({ x: 70, y: 500 }, area)).toBe("left");
    expect(snapZone({ x: 1915, y: 500 }, area)).toBe("right");
    expect(snapZone({ x: 900, y: 500 }, area)).toBeNull();
  });
  test("unsnapRect restores size under the pointer", () => {
    const rect = unsnapRect(area, normal, { x: 68 + 1852 / 2, y: 40 });
    expect(rect.w).toBe(600);
    expect(rect.x).toBe(68 + 926 - 300);
  });
});

describe("clamp/resize/cascade", () => {
  test("title bar stays reachable", () => {
    expect(clampRect({ x: -5000, y: -50, w: 600, h: 400 }, area)).toEqual({ x: 68 - 600 + 40, y: 32, w: 600, h: 400 });
    expect(clampRect({ x: 5000, y: 5000, w: 600, h: 400 }, area)).toEqual({
      x: 1920 - 40,
      y: 1080 - 46,
      w: 600,
      h: 400,
    });
  });
  test("resize from west/north keeps the opposite edge and respects min size", () => {
    const start = { x: 100, y: 100, w: 400, h: 300 };
    expect(resizeRect(start, "se", 50, 20, { w: 200, h: 200 })).toEqual({ x: 100, y: 100, w: 450, h: 320 });
    expect(resizeRect(start, "nw", 300, 300, { w: 200, h: 200 })).toEqual({ x: 300, y: 200, w: 200, h: 200 });
  });
  test("cascade centers then offsets", () => {
    const first = cascade(0, { w: 800, h: 600 }, area);
    expect(cascade(1, { w: 800, h: 600 }, area).x - first.x).toBe(28);
    expect(cascade(0, { w: 5000, h: 5000 }, area)).toEqual(area);
  });
});

describe("overviewLayout", () => {
  const box = { x: 0, y: 0, w: 1000, h: 600 };
  test("never upscales and keeps every window inside the area", () => {
    const rects = overviewLayout(
      [
        { w: 200, h: 100 },
        { w: 1600, h: 1200 },
        { w: 800, h: 600 },
      ],
      box,
    );
    expect(rects[0]!.w).toBe(200);
    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(1000);
      expect(rect.y + rect.h).toBeLessThanOrEqual(600);
    }
  });
  test("a partial last row is centered", () => {
    const [, , third] = overviewLayout(
      [
        { w: 100, h: 100 },
        { w: 100, h: 100 },
        { w: 100, h: 100 },
      ],
      box,
    );
    expect(third!.x + third!.w / 2).toBeCloseTo(500, 0);
  });
});
