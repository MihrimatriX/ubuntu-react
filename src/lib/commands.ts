// File-system commands for the shell. Each one is (args, io) → { out, code }; VFS errors become Linux-style
// stderr lines. ANSI colors are only emitted when stdout is the terminal (io.tty), like real coreutils.
import { FsError, HOME, cp, list, mkdir, mv, read, resolve, rm, stat, walk, write, type FsNode } from "../os/fs";
import type { Command, IO } from "./shell";
import { SYSTEM_COMMANDS } from "./system-commands";

export function parseFlags(args: string[]) {
  const flags = new Set<string>();
  const rest: string[] = [];
  for (const arg of args) {
    if (arg.length > 1 && arg.startsWith("-") && !/^-\d+$/.test(arg))
      [...arg.slice(1)].forEach((flag) => flags.add(flag));
    else rest.push(arg);
  }
  return { flags, rest };
}

export const paint = (io: IO, code: string, text: string) => (io.tty ? `\x1b[${code}m${text}\x1b[0m` : text);
const at = (io: IO, path: string) => resolve(io.ctx.cwd, path);

/** Runs a VFS operation; on FsError prints "<prefix>: <message>" and returns false. */
export function attempt(io: IO, prefix: string, operation: () => void): boolean {
  try {
    operation();
    return true;
  } catch (error) {
    if (!(error instanceof FsError)) throw error;
    io.err(`${prefix}: ${error.message}`);
    return false;
  }
}

const nameColor = (io: IO, name: string, node: FsNode) =>
  node.type === "dir" ? paint(io, "1;34", name) : node.mime?.startsWith("image/") ? paint(io, "1;35", name) : name;

function longLine(io: IO, name: string, node: FsNode) {
  const date = new Date(node.mtime);
  const stamp = `${date.toLocaleString("en-US", { month: "short" })} ${String(date.getDate()).padStart(2)} ${date.toTimeString().slice(0, 5)}`;
  const mode = node.type === "dir" ? "drwxr-xr-x" : "-rw-r--r--";
  return `${mode} 1 ubuntu ubuntu ${String(node.size).padStart(5)} ${stamp} ${nameColor(io, name, node)}`;
}

const ls: Command = (args, io) => {
  const { flags, rest } = parseFlags(args);
  const targets = rest.length ? rest : ["."];
  const blocks: string[] = [];
  let code = 0;
  for (const target of targets) {
    const path = at(io, target);
    if (!attempt(io, `ls: cannot access '${target}'`, () => stat(io.ctx.fs, path))) {
      code = 2;
      continue;
    }
    const node = stat(io.ctx.fs, path);
    const names =
      node.type === "dir"
        ? [
            ...(flags.has("a") ? [".", ".."] : []),
            ...list(io.ctx.fs, path).filter((n) => flags.has("a") || !n.startsWith(".")),
          ]
        : [target];
    const entries = names.map((name) => {
      const child = node.type === "dir" ? (io.ctx.fs[resolve(path, name)] ?? node) : node;
      return flags.has("l") ? longLine(io, name, child) : nameColor(io, name, child);
    });
    const body = entries.join(flags.has("l") || !io.tty ? "\n" : "  ");
    blocks.push((targets.length > 1 ? `${target}:\n` : "") + body);
  }
  const out = blocks.filter(Boolean).join("\n\n");
  return { out: out ? `${out}\n` : "", code };
};

const cd: Command = ([target = "~"], io) => {
  const path = at(io, target);
  const ok = attempt(io, `bash: cd: ${target}`, () => {
    if (stat(io.ctx.fs, path).type !== "dir") throw new FsError("Not a directory");
  });
  if (ok) io.ctx.cwd = path;
  return { out: "", code: ok ? 0 : 1 };
};

const cat: Command = (args, io) => {
  if (!args.length) return { out: io.stdin };
  let out = "";
  let code = 0;
  for (const file of args)
    if (
      !attempt(io, `cat: ${file}`, () => {
        out += read(io.ctx.fs, at(io, file));
      })
    )
      code = 1;
  return { out, code };
};

/** Applies `change` to every path argument, reporting "<verb> '<path>': <error>" per failure. */
function eachPath(io: IO, paths: string[], verb: string, change: (path: string) => void) {
  if (!paths.length) {
    io.err(`${verb.split(":")[0]}: missing operand`);
    return { out: "", code: 1 };
  }
  const failures = paths.filter((path) => !attempt(io, `${verb} '${path}'`, () => change(at(io, path)))).length;
  return { out: "", code: failures ? 1 : 0 };
}

const mkdirCommand: Command = (args, io) => {
  const { flags, rest } = parseFlags(args);
  return eachPath(io, rest, "mkdir: cannot create directory", (path) => {
    io.ctx.fs = mkdir(io.ctx.fs, path, flags.has("p"));
  });
};

const touch: Command = (args, io) =>
  eachPath(io, args, "touch: cannot touch", (path) => {
    const existing = io.ctx.fs[path];
    io.ctx.fs = write(io.ctx.fs, path, existing?.type === "file" ? (existing.content ?? "") : "");
  });

const rmCommand: Command = (args, io) => {
  const { flags, rest } = parseFlags(args);
  const recursive = flags.has("r") || flags.has("R");
  const targets = flags.has("f") ? rest.filter((path) => io.ctx.fs[at(io, path)]) : rest;
  if (flags.has("f") && !targets.length) return { out: "" };
  return eachPath(io, targets, "rm: cannot remove", (path) => {
    io.ctx.fs = rm(io.ctx.fs, path, recursive);
  });
};

function transfer(name: "mv" | "cp"): Command {
  return (args, io) => {
    const { flags, rest } = parseFlags(args);
    const destination = rest.pop();
    if (!destination || !rest.length) {
      io.err(`${name}: missing destination file operand`);
      return { out: "", code: 1 };
    }
    const target = at(io, destination);
    if (rest.length > 1 && io.ctx.fs[target]?.type !== "dir") {
      io.err(`${name}: target '${destination}': Not a directory`);
      return { out: "", code: 1 };
    }
    return eachPath(io, rest, `${name}: cannot ${name === "mv" ? "move" : "copy"}`, (path) => {
      io.ctx.fs =
        name === "mv" ? mv(io.ctx.fs, path, target) : cp(io.ctx.fs, path, target, flags.has("r") || flags.has("R"));
    });
  };
}

const tree: Command = ([target = "."], io) => {
  const root = at(io, target);
  if (!attempt(io, `tree: ${target}`, () => list(io.ctx.fs, root))) return { out: "", code: 2 };
  const lines = [paint(io, "1;34", target)];
  const draw = (dir: string, prefix: string) => {
    const names = list(io.ctx.fs, dir).filter((name) => !name.startsWith("."));
    names.forEach((name, index) => {
      const last = index === names.length - 1;
      const path = resolve(dir, name);
      const node = io.ctx.fs[path]!;
      lines.push(`${prefix}${last ? "└── " : "├── "}${nameColor(io, name, node)}`);
      if (node.type === "dir") draw(path, prefix + (last ? "    " : "│   "));
    });
  };
  draw(root, "");
  const visible = walk(io.ctx.fs, root).filter((path) => !path.slice(root.length).includes("/."));
  const dirs = visible.filter((path) => io.ctx.fs[path]?.type === "dir").length;
  return { out: `${lines.join("\n")}\n\n${dirs} directories, ${visible.length - dirs} files\n` };
};

const pwd: Command = (_args, io) => ({ out: `${io.ctx.cwd}\n` });

export const COMMANDS: Record<string, Command> = {
  ls,
  cd,
  cat,
  pwd,
  tree,
  touch,
  mkdir: mkdirCommand,
  rm: rmCommand,
  mv: transfer("mv"),
  cp: transfer("cp"),
  ...SYSTEM_COMMANDS,
};

export const displayPath = (path: string) =>
  path === HOME || path.startsWith(`${HOME}/`) ? `~${path.slice(HOME.length)}` : path;
