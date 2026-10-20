// Minesweeper rules, pure: mines are placed on the first click (never on or around it), opening a cell
// with no adjacent mines flood-fills its neighbours, and the game is won when every safe cell is open.

type Cell = { mine: boolean; adjacent: number; open: boolean; flag: boolean };
export type Board = Cell[][];

const neighbours = (board: Board, row: number, col: number) =>
  [-1, 0, 1]
    .flatMap((dr) => [-1, 0, 1].map((dc) => [row + dr, col + dc] as const))
    .filter(([r, c]) => (r !== row || c !== col) && board[r]?.[c] !== undefined);

export const emptyBoard = (rows: number, cols: number): Board =>
  Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ mine: false, adjacent: 0, open: false, flag: false })),
  );

export function placeMines(
  rows: number,
  cols: number,
  count: number,
  safe: { row: number; col: number },
  random = Math.random,
): Board {
  const board = emptyBoard(rows, cols);
  const forbidden = new Set(
    [...neighbours(board, safe.row, safe.col), [safe.row, safe.col] as const].map(([r, c]) => r * cols + c),
  );
  const free = Array.from({ length: rows * cols }, (_, index) => index).filter((index) => !forbidden.has(index));
  for (let placed = 0; placed < Math.min(count, free.length); placed++) {
    const [index] = free.splice(Math.floor(random() * free.length), 1);
    board[Math.floor(index! / cols)]![index! % cols]!.mine = true;
  }
  board.forEach((cells, row) =>
    cells.forEach((cell, col) => {
      cell.adjacent = neighbours(board, row, col).filter(([r, c]) => board[r]![c]!.mine).length;
    }),
  );
  return board;
}

/** Opens a cell (flood-filling zeros). Returns a new board; opening a mine opens every mine. */
export function reveal(board: Board, row: number, col: number): Board {
  const next = board.map((cells) => cells.map((cell) => ({ ...cell })));
  const start = next[row]?.[col];
  if (!start || start.open || start.flag) return board;
  if (start.mine) {
    next.forEach((cells) =>
      cells.forEach((cell) => {
        if (cell.mine) cell.open = true;
      }),
    );
    return next;
  }
  const queue: [number, number][] = [[row, col]];
  while (queue.length) {
    const [r, c] = queue.pop()!;
    const cell = next[r]![c]!;
    if (cell.open || cell.flag) continue;
    cell.open = true;
    if (cell.adjacent === 0) queue.push(...neighbours(next, r, c).map(([nr, nc]) => [nr, nc] as [number, number]));
  }
  return next;
}

export const toggleFlag = (board: Board, row: number, col: number): Board =>
  board.map((cells, r) =>
    cells.map((cell, c) => (r === row && c === col && !cell.open ? { ...cell, flag: !cell.flag } : cell)),
  );

export const lost = (board: Board) => board.some((cells) => cells.some((cell) => cell.mine && cell.open));
export const won = (board: Board) => board.every((cells) => cells.every((cell) => cell.mine || cell.open));
