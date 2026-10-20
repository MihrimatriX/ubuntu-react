import { expect, test } from "bun:test";
import { walkStep } from "../src/apps/monitor/SystemMonitor";

test("walkStep stays within bounds and reverts toward the middle", () => {
  let value = 50;
  for (let i = 0; i < 1000; i++) {
    value = walkStep(value, 10, 40);
    expect(value).toBeGreaterThanOrEqual(10);
    expect(value).toBeLessThanOrEqual(40);
  }
  expect(walkStep(40, 10, 40, () => 0.5)).toBeLessThan(40);
  expect(walkStep(10, 10, 40, () => 0.5)).toBeGreaterThan(10);
});
