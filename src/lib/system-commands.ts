// Text-processing, session-info and launcher commands. Text tools read files or stdin; launchers only
// return Effects (open app / clear / exit) for the Terminal UI to perform.
import { read, resolve, stat, write } from "../os/fs";
import { COMMANDS, attempt, paint, parseFlags } from "./commands";
import type { Command, IO } from "./shell";

/** Concatenated contents of the file arguments, or stdin when there are none. */
function input(io: IO, name: string, files: string[]): string | null {
  if (!files.length) return io.stdin;
  let text = "";
  const ok = files.every((file) => attempt(io, `${name}: ${file}`, () => { text += read(io.ctx.fs, resolve(io.ctx.cwd, file)); }));
  return ok ? text : null;
}

const lines = (text: string) => (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");

function countArg(args: string[]): { count: number; rest: string[] } {
  const index = args.findIndex((arg) => arg === "-n" || /^-\d+$/.test(arg));
  if (index === -1) return { count: 10, rest: args };
  const value = args[index] === "-n" ? args[index + 1] : args[index]!.slice(1);
  return { count: Number(value) || 0, rest: args.filter((_, i) => i !== index && !(args[index] === "-n" && i === index + 1)) };
}

const slice = (name: "head" | "tail"): Command => (args, io) => {
  const { count, rest } = countArg(args);
  const text = input(io, name, rest);
  if (text === null) return { out: "", code: 1 };
  if (!text) return { out: "" };
  const all = lines(text);
  const picked = name === "head" ? all.slice(0, count) : all.slice(Math.max(0, all.length - count));
  return { out: `${picked.join("\n")}\n` };
};

const grep: Command = (args, io) => {
  const { flags, rest } = parseFlags(args);
  const [pattern, ...files] = rest;
  if (pattern === undefined) {
    io.err("Usage: grep [OPTION]... PATTERNS [FILE]...");
    return { out: "", code: 2 };
  }
  const source = pattern.replace(/[.*+?^${}()[\]\\]/g, "\\$&");
  const regex = new RegExp(source, flags.has("i") ? "gi" : "g");
  const sources = files.length ? files : ["-"];
  const matches: string[] = [];
  for (const file of sources) {
    const text = file === "-" ? io.stdin : input(io, "grep", [file]);
    if (text === null || !text) continue;
    lines(text).forEach((line, index) => {
      regex.lastIndex = 0;
      if (regex.test(line) === flags.has("v")) return;
      const prefix = (sources.length > 1 ? paint(io, "35", file) + ":" : "") + (flags.has("n") ? paint(io, "32", `${index + 1}`) + ":" : "");
      matches.push(prefix + (flags.has("v") ? line : line.replace(regex, (match) => paint(io, "01;31", match))));
    });
  }
  return { out: matches.length ? `${matches.join("\n")}\n` : "", code: matches.length ? 0 : 1 };
};

const wc: Command = (args, io) => {
  const { flags, rest } = parseFlags(args);
  const text = input(io, "wc", rest);
  if (text === null) return { out: "", code: 1 };
  const counts = { l: (text.match(/\n/g) ?? []).length, w: text.split(/\s+/).filter(Boolean).length, c: new TextEncoder().encode(text).length };
  const shown = (["l", "w", "c"] as const).filter((flag) => !flags.size || flags.has(flag));
  return { out: `${shown.map((flag) => String(counts[flag]).padStart(flags.size === 1 ? 0 : 7)).join(" ").trimStart()}${rest[0] ? ` ${rest[0]}` : ""}\n` };
};

const LOGO = [
  "            .-/+oossssoo+/-.", "        `:+ssssssssssssssssss+:`", "      -+ssssssssssssssssssyyssss+-",
  "    .ossssssssssssssssss dMMMNy sssso.", "   /sssssssssss hdmmNNmmyNMMMMh ssssss/", "  +sssssssss hmydMMMMMMMNddddy ssssssss+",
  " /ssssssss hNMMMyhhyyyyhmNMMMNh ssssssss/", ".ssssssss dMMMNh          hNMMMd ssssssss.", "+sss yyyy NMMMh            hMMMN yyyy sss+",
  "ossy NMMMNyMMh              hmmmh ssssssso", "+sss yyyy NMMMh            hMMMN yyyy sss+", ".ssssssss dMMMNh          hNMMMd ssssssss.",
  " /ssssssss hNMMMyhhyyyyhdNMMMNh ssssssss/", "  +sssssssss dmydMMMMMMMMddddy ssssssss+", "   /sssssssssss hdmNNNNmyNMMMMh ssssss/",
  "    .ossssssssssssssssss dMMMNy sssso.", "      -+sssssssssssssssssyyyssss+-", "        `:+ssssssssssssssssss+:`",
  "            .-/+oossssoo+/-.",
];

const LOGO_WIDTH = Math.max(...LOGO.map((line) => line.length)) + 3;

const neofetch: Command = (_args, io) => {
  const { env } = io.ctx;
  const minutes = Math.floor((Date.now() - env.startedAt) / 60_000);
  const info = [
    `${paint(io, "1;31", env.user)}@${paint(io, "1;31", env.host)}`, "-".repeat(env.user.length + env.host.length + 1),
    ["OS", "Ubuntu 24.04.1 LTS x86_64"], ["Host", "Browser Virtual Machine"], ["Kernel", "6.8.0-45-generic"],
    ["Uptime", `${minutes} mins`], ["Packages", `${Object.keys(COMMANDS).length} (builtin)`], ["Shell", "bash 5.2.21"],
    ["Resolution", env.resolution], ["DE", "GNOME 46"], ["WM", "Mutter"], ["Theme", "Yaru [GTK3/4]"], ["Icons", "Yaru [GTK3/4]"],
    ["Terminal", "gnome-terminal"], ["CPU", `Virtual CPU (${env.cores})`], ["Windows", String(env.windows)],
  ].map((row) => (typeof row === "string" ? row : `${paint(io, "1;31", row[0]!)}: ${row[1]}`));
  return { out: `${LOGO.map((line, index) => `${paint(io, "31", line.padEnd(LOGO_WIDTH))}${info[index] ?? ""}`).join("\n")}\n` };
};

/** Opens a path in `appId` (or by MIME type when undefined). Editors create a missing file, like gedit. */
const openFile = (name: string, appId?: string, create = false): Command => ([target], io) => {
  if (!target) {
    if (appId) io.effects.push({ type: "open", appId });
    else io.err(`${name}: missing argument`);
    return { out: "", code: appId ? 0 : 1 };
  }
  const path = resolve(io.ctx.cwd, target);
  const ok = attempt(io, `${name}: ${target}`, () => {
    if (create && !io.ctx.fs[path]) io.ctx.fs = write(io.ctx.fs, path, "");
    stat(io.ctx.fs, path);
  });
  if (ok) io.effects.push({ type: "open", appId, path });
  return { out: "", code: ok ? 0 : 1 };
};

const firefox: Command = ([url], io) => {
  io.effects.push({ type: "open", appId: "firefox", args: url ? [url] : undefined });
  return { out: "" };
};

const effect = (type: "clear" | "exit"): Command => (_args, io) => {
  io.effects.push({ type });
  return { out: "" };
};

const sudo: Command = ([name, ...rest], io) => {
  const command = name ? COMMANDS[name] : undefined;
  if (!command) {
    io.err(name ? `sudo: ${name}: command not found` : "usage: sudo command");
    return { out: "", code: 1 };
  }
  return command(rest, io);
};

export const SYSTEM_COMMANDS: Record<string, Command> = {
  echo: (args) => (args[0] === "-n" ? { out: args.slice(1).join(" ") } : { out: `${args.join(" ")}\n` }),
  grep, wc, head: slice("head"), tail: slice("tail"), neofetch, sudo, firefox,
  clear: effect("clear"), exit: effect("exit"),
  history: (_args, io) => ({ out: io.ctx.history.map((line, index) => `${String(index + 1).padStart(5)}  ${line}\n`).join("") }),
  whoami: (_args, io) => ({ out: `${io.ctx.env.user}\n` }),
  hostname: (_args, io) => ({ out: `${io.ctx.env.host}\n` }),
  date: () => ({ out: `${new Date().toString().replace(/ GMT.*/, "")}\n` }),
  uname: (args, io) => ({ out: args.includes("-a") ? `Linux ${io.ctx.env.host} 6.8.0-45-generic #45-Ubuntu SMP PREEMPT_DYNAMIC x86_64 x86_64 x86_64 GNU/Linux\n` : "Linux\n" }),
  help: () => ({ out: `GNU bash, version 5.2.21(1)-release (x86_64-pc-linux-gnu)\nAvailable commands:\n  ${Object.keys(COMMANDS).sort().join("  ")}\n` }),
  gedit: openFile("gedit", "text-editor", true), nano: openFile("nano", "text-editor", true),
  "gnome-text-editor": openFile("gnome-text-editor", "text-editor", true),
  "xdg-open": openFile("xdg-open"), nautilus: openFile("nautilus", "files"),
};
