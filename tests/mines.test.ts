import { expect, test } from "bun:test";
import { emptyBoard, lost, placeMines, reveal, toggleFlag, won } from "../src/lib/mines";

const count = (board: ReturnType<typeof emptyBoard>, key: "mine" | "open") => board.flat().filter((cell) => cell[key]).length;

test("first click and its neighbours are never mines", () => {
  for (let i = 0; i < 50; i++) {
    const board = placeMines(8, 8, 10, { row: 0, col: 0 });
    expect(count(board, "mine")).toBe(10);
    expect([board[0]![0]!, board[0]![1]!, board[1]![0]!, board[1]![1]!].some((cell) => cell.mine)).toBe(false);
  }
});

test("revealing a zero flood-fills; a mine loses; opening all safe cells wins", () => {
  const board = emptyBoard(3, 3);
  board[2]![2]!.mine = true;
  board[1]![1]!.adjacent = board[1]![2]!.adjacent = board[2]![1]!.adjacent = 1;
  const opened = reveal(board, 0, 0);
  expect(count(opened, "open")).toBe(8);
  expect(won(opened)).toBe(true);
  expect(lost(reveal(board, 2, 2))).toBe(true);
});

test("flags block reveal and toggle off", () => {
  const flagged = toggleFlag(emptyBoard(2, 2), 0, 0);
  expect(reveal(flagged, 0, 0)).toBe(flagged);
  expect(toggleFlag(flagged, 0, 0)[0]![0]!.flag).toBe(false);
});
