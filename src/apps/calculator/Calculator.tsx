// GNOME Calculator: Basic/Advanced keypads generated from arrays, a clickable history above the entry,
// and full keyboard input (digits, operators, Enter/=, Backspace, Escape). Math comes from lib/calc.
import { useEffect, useRef, useState } from "react";
import { CalcError, evaluate, formatNumber } from "../../lib/calc";
import { HeaderSlot, Segmented } from "../../shell/chrome";
import type { AppProps } from "../registry";

const BASIC = ["7", "8", "9", "÷", "⌫", "4", "5", "6", "×", "(", "1", "2", "3", "−", ")", "0", ".", "%", "+", "="];
const ADVANCED = ["sin(", "cos(", "tan(", "π", "^", "ln(", "log(", "√(", "e", "!"];
const KEY_MAP: Record<string, string> = { "*": "×", "/": "÷", "-": "−" };

export default function Calculator({ windowId }: AppProps) {
  const [mode, setMode] = useState<"basic" | "advanced">("basic");
  const [degrees, setDegrees] = useState(true);
  const [expression, setExpressionState] = useState("");
  // Mirrors the latest expression so "=" never evaluates a stale value when keys arrive within one frame.
  const latest = useRef("");
  const setExpression = (next: string | ((current: string) => string)) => {
    latest.current = typeof next === "function" ? next(latest.current) : next;
    setExpressionState(latest.current);
  };
  const [error, setError] = useState("");
  const [history, setHistory] = useState<{ expression: string; result: string }[]>([]);
  const historyEnd = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    root.current?.focus();
  }, []);
  useEffect(() => {
    historyEnd.current?.scrollIntoView({ block: "end" });
  }, [history]);

  function press(key: string) {
    setError("");
    if (key === "C") return setExpression("");
    if (key === "⌫") return setExpression((current) => current.slice(0, -1));
    if (key !== "=") return setExpression((current) => current + key);
    const input = latest.current;
    if (!input.trim()) return;
    try {
      const result = formatNumber(evaluate(input, { degrees }));
      setHistory((current) => [...current, { expression: input, result }].slice(-50));
      setExpression(result);
    } catch (caught) {
      if (!(caught instanceof CalcError)) throw caught;
      setError(caught.message);
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const named: Record<string, string> = { Enter: "=", "=": "=", Backspace: "⌫", Escape: "C", Delete: "C" };
    const key = named[event.key] ?? KEY_MAP[event.key] ?? (/^[\d.+()%^!]$/.test(event.key) ? event.key : null);
    if (!key) return;
    event.preventDefault();
    press(key);
  }

  const button = (key: string, extra = "") => (
    <button key={key} aria-label={key === "⌫" ? "Backspace" : key} onClick={() => press(key)}
      className={`btn h-auto min-h-11 text-base ${key === "=" ? "btn-accent" : /^\d|\.$/.test(key) ? "bg-view font-medium" : ""} ${extra}`}>
      {key.length > 1 ? key.replace("(", "") : key}
    </button>
  );

  return (
    <div ref={root} className="flex h-full flex-col gap-2 bg-window p-2 outline-none" tabIndex={0} onKeyDown={onKeyDown}>
      <HeaderSlot windowId={windowId}>
        <Segmented label="Mode" value={mode} options={{ basic: "Basic", advanced: "Advanced" }} onChange={setMode} />
      </HeaderSlot>
      <div className="flex min-h-28 flex-1 flex-col justify-end overflow-hidden rounded-lg bg-view p-3 text-right">
        <div className="flex-1 overflow-y-auto text-sm text-fg-dim">
          {history.map((item, index) => (
            <button key={index} className="block w-full truncate text-right hover:text-fg" onClick={() => setExpression((current) => current + item.result)}>
              {item.expression} = <b>{item.result}</b>
            </button>
          ))}
          <div ref={historyEnd} />
        </div>
        <output aria-live="polite" className="mt-1 block truncate font-mono text-3xl">{expression || "0"}</output>
        <p className="h-5 text-sm text-red-500">{error}</p>
      </div>
      {mode === "advanced" && (
        <div className="grid grid-cols-5 gap-1.5">
          {ADVANCED.map((key) => button(key, "text-sm"))}
          <button className="btn col-span-5 text-sm" onClick={() => setDegrees(!degrees)}>Angle unit: {degrees ? "Degrees" : "Radians"}</button>
        </div>
      )}
      <div className="grid grid-cols-5 gap-1.5">{BASIC.map((key) => button(key))}</div>
      <button className="btn" onClick={() => press("C")}>Clear All</button>
    </div>
  );
}
