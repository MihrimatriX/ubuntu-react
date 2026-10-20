// GNOME Mines: pick a size, left-click opens, right-click flags; mines are placed on the first click.
import { useEffect, useState } from "react";
import { Flag } from "lucide-react";
import { emptyBoard, lost, placeMines, reveal, toggleFlag, won, type Board } from "../../lib/mines";
import { HeaderSlot } from "../../shell/chrome";
import type { AppProps } from "../registry";

const SIZES = { Small: [8, 8, 10], Medium: [16, 16, 40], Large: [16, 30, 99] } as const;
type Size = keyof typeof SIZES;
const NUMBER_COLORS = ["", "#1c71d8", "#26a269", "#c01c28", "#613583", "#a51d2d", "#0d7377", "#000", "#77767b"];

export default function Mines({ windowId }: AppProps) {
  const [size, setSize] = useState<Size>("Small");
  const [rows, cols, mines] = SIZES[size];
  const [board, setBoard] = useState<Board>(() => emptyBoard(rows, cols));
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const over = lost(board) || (started !== null && won(board));
  const flags = board.flat().filter((cell) => cell.flag).length;

  const restart = (next: Size = size) => {
    setSize(next);
    setBoard(emptyBoard(SIZES[next][0], SIZES[next][1]));
    setStarted(null);
  };
  useEffect(() => {
    if (started === null || over) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [started, over]);

  function open(row: number, col: number) {
    if (over) return;
    const current = started === null ? placeMines(rows, cols, mines, { row, col }) : board;
    if (started === null) setStarted(Date.now());
    setBoard(reveal(current, row, col));
  }

  const seconds = started === null ? 0 : Math.floor((now - started) / 1000);
  return (
    <div className="flex h-full flex-col items-center gap-3 bg-window p-4">
      <HeaderSlot windowId={windowId}>
        <select
          className="field"
          aria-label="Board size"
          value={size}
          onChange={(e) => restart(e.target.value as Size)}
        >
          {Object.keys(SIZES).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </HeaderSlot>
      <div className="flex w-full max-w-md items-center justify-between text-sm">
        <span className="flex items-center gap-1">
          <Flag className="size-4 text-red-600" />
          {flags} / {mines}
        </span>
        <button className="btn" onClick={() => restart()}>
          {lost(board) ? "Try Again" : won(board) && started ? "Play Again 🎉" : "New Game"}
        </button>
        <span className="tabular-nums">
          {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
        </span>
      </div>
      <div className="grid min-h-0 w-full flex-1 place-items-center" style={{ containerType: "size" }}>
        <div
          role="grid"
          aria-label="Minefield"
          className="grid gap-0.5 text-[clamp(10px,3cqmin,20px)]"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            width: `min(100cqw, 100cqh * ${cols / rows})`,
          }}
        >
          {board.map((cells, row) =>
            cells.map((cell, col) => (
              <button
                key={`${row}-${col}`}
                role="gridcell"
                aria-label={cell.open ? (cell.mine ? "mine" : String(cell.adjacent)) : cell.flag ? "flagged" : "hidden"}
                onClick={() => open(row, col)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!over) setBoard(toggleFlag(board, row, col));
                }}
                className={`grid aspect-square place-items-center rounded font-bold ${cell.open ? (cell.mine ? "bg-red-500" : "bg-view") : "bg-fg/20 hover:bg-fg/30"}`}
                style={{ color: NUMBER_COLORS[cell.adjacent] }}
              >
                {cell.open ? (
                  cell.mine ? (
                    "💣"
                  ) : (
                    cell.adjacent || ""
                  )
                ) : cell.flag ? (
                  <Flag className="size-3.5 text-red-600" />
                ) : (
                  ""
                )}
              </button>
            )),
          )}
        </div>
      </div>
    </div>
  );
}
