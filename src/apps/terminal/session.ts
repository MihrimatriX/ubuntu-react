// One terminal tab: an xterm instance plus a readline-style line editor (cursor keys, persistent history,
// Tab completion, Ctrl+C/L/A/E/U, hidden sudo password prompt). Enter runs the pure shell against the
// store's VFS, commits the resulting fs and applies returned effects (open app, clear, exit).
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { displayPath } from "../../lib/commands";
import { complete, run, type Effect } from "../../lib/shell";
import { openPath } from "../../os/launch";
import { useOS } from "../../os/store";

const THEME = {
  background: "#300a24",
  foreground: "#ffffff",
  cursor: "#ffffff",
  selectionBackground: "#b5d5ff66",
  black: "#171421",
  red: "#c01c28",
  green: "#26a269",
  yellow: "#a2734c",
  blue: "#12488b",
  magenta: "#a347ba",
  cyan: "#2aa1b3",
  white: "#d0cfcc",
  brightBlack: "#5e5c64",
  brightRed: "#f66151",
  brightGreen: "#33da7a",
  brightYellow: "#e9ad0c",
  brightBlue: "#2a7bde",
  brightMagenta: "#c061cb",
  brightCyan: "#33c7de",
  brightWhite: "#ffffff",
};
const SUDO_MS = 15 * 60_000;
const startedAt = Date.now();
let sudoUntil = 0;

export class TermSession {
  readonly term = new Terminal({
    fontFamily: '"Ubuntu Mono", monospace',
    fontSize: 15,
    cursorBlink: true,
    theme: THEME,
    allowProposedApi: true,
  });
  private fit = new FitAddon();
  private line = "";
  private cursor = 0;
  private historyIndex = -1;
  private sudoCommand: string | null = null;

  constructor(
    host: HTMLElement,
    public cwd: string,
    private hooks: { onTitle: (title: string) => void; onExit: () => void },
  ) {
    this.term.loadAddon(this.fit);
    this.term.open(host);
    this.useWebgl();
    this.term.onData((data) => this.onData(data));
    this.resize();
    this.prompt();
  }

  get title() {
    return `ubuntu@ubuntu: ${displayPath(this.cwd)}`;
  }

  /** GPU renderer draws every glyph into its cell (the DOM renderer drifts on some fonts); DOM stays as fallback. */
  private useWebgl() {
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      this.term.loadAddon(webgl);
    } catch {
      // No WebGL2 (e.g. happy-dom or old GPUs): keep the DOM renderer.
    }
  }

  resize() {
    if (this.term.element?.offsetWidth) this.fit.fit();
  }

  dispose() {
    this.term.dispose();
  }

  private prompt() {
    this.line = "";
    this.cursor = 0;
    this.historyIndex = -1;
    this.term.write(`\x1b[1;32mubuntu@ubuntu\x1b[0m:\x1b[1;34m${displayPath(this.cwd)}\x1b[0m$ `);
    this.hooks.onTitle(this.title);
  }

  /**
   * Rewrites the editable part of the line and puts the cursor back where it belongs.
   * ponytail: cursor moves assume the line fits on one row; track wrapping if long commands matter.
   */
  private redraw(line: string, cursor = line.length) {
    const back = this.cursor;
    this.term.write(
      `${back ? `\x1b[${back}D` : ""}\x1b[K${line}${line.length - cursor ? `\x1b[${line.length - cursor}D` : ""}`,
    );
    this.line = line;
    this.cursor = cursor;
  }

  private onData(data: string) {
    if (this.sudoCommand !== null) return this.onPassword(data);
    const { line, cursor } = this;
    const history = useOS.getState().termHistory;
    const keys: Record<string, () => void> = {
      "\r": () => this.submit(),
      "\x7f": () => cursor && this.redraw(line.slice(0, cursor - 1) + line.slice(cursor), cursor - 1),
      "\x1b[3~": () => this.redraw(line.slice(0, cursor) + line.slice(cursor + 1), cursor),
      "\x1b[D": () => cursor && this.redraw(line, cursor - 1),
      "\x1b[C": () => cursor < line.length && this.redraw(line, cursor + 1),
      "\x1b[H": () => this.redraw(line, 0),
      "\x01": () => this.redraw(line, 0),
      "\x1b[F": () => this.redraw(line, line.length),
      "\x05": () => this.redraw(line, line.length),
      "\x15": () => this.redraw(line.slice(cursor), 0),
      "\x1b[A": () => this.browseHistory(history, 1),
      "\x1b[B": () => this.browseHistory(history, -1),
      "\t": () => this.tab(),
      "\x03": () => {
        this.term.write("^C\r\n");
        this.prompt();
      },
      "\x0c": () => {
        this.term.clear();
        this.term.write("\x1b[H\x1b[2J");
        this.prompt();
        this.redraw(line, cursor);
      },
    };
    const handler = keys[data];
    if (handler) return void handler();
    const text = data.replace(/[\x00-\x1f\x7f]|\x1b\[[0-9;]*[A-Za-z~]/g, "");
    if (text) this.redraw(line.slice(0, cursor) + text + line.slice(cursor), cursor + text.length);
  }

  private browseHistory(history: string[], step: number) {
    const index = Math.min(Math.max(this.historyIndex + step, -1), history.length - 1);
    this.redraw(index === -1 ? "" : (history[history.length - 1 - index] ?? ""));
    this.historyIndex = index;
  }

  private tab() {
    if (this.cursor !== this.line.length) return;
    const result = complete(this.line, this.cwd, useOS.getState().fs);
    if (result.options.length > 1) {
      this.term.write(`\r\n${result.options.join("  ")}\r\n`);
      const kept = result.line;
      this.prompt();
      this.redraw(kept);
    } else this.redraw(result.line);
  }

  private onPassword(data: string) {
    if (data === "\x03") {
      this.sudoCommand = null;
      this.term.write("^C\r\n");
      return this.prompt();
    }
    if (data !== "\r") return;
    const command = this.sudoCommand!;
    this.sudoCommand = null;
    sudoUntil = Date.now() + SUDO_MS;
    this.term.write("\r\n");
    this.execute(command);
  }

  private submit() {
    const input = this.line.trim();
    this.term.write("\r\n");
    if (!input) return this.prompt();
    useOS.getState().pushHistory(input);
    if (/^sudo\s/.test(input) && Date.now() > sudoUntil) {
      this.sudoCommand = input;
      return void this.term.write("[sudo] password for ubuntu: ");
    }
    this.execute(input);
  }

  private execute(input: string) {
    const os = useOS.getState();
    const env = {
      user: "ubuntu",
      host: os.settings.deviceName,
      startedAt,
      resolution: `${innerWidth}x${innerHeight}`,
      cores: navigator.hardwareConcurrency || 4,
      windows: os.windows.length,
    };
    const result = run(input, { fs: os.fs, cwd: this.cwd, history: os.termHistory, env });
    if (result.fs !== os.fs) os.updateFs(() => result.fs);
    this.cwd = result.cwd;
    this.term.write(result.output.replace(/\n/g, "\r\n"));
    result.effects.forEach((effect) => this.apply(effect));
    if (!result.effects.some((effect) => effect.type === "exit")) this.prompt();
  }

  private apply(effect: Effect) {
    if (effect.type === "clear") this.term.write("\x1b[H\x1b[2J\x1b[3J");
    else if (effect.type === "exit") this.hooks.onExit();
    else if (effect.appId) useOS.getState().openApp(effect.appId, { filePath: effect.path, args: effect.args });
    else if (effect.path) openPath(effect.path);
  }
}
