// Pure shell interpreter: run(input, ctx) → { output, cwd, fs, effects, code }. Input is tokenized
// (quotes, escapes, operators), split into `&&` chains of `|` pipelines; each command gets the previous
// stdout as stdin. Side effects the UI must perform (open app, clear, exit) are returned, never executed.
import { list, resolve, write, type Fs } from "../os/fs";
import { COMMANDS } from "./commands";

export type Effect =
  { type: "open"; appId?: string; path?: string; args?: string[] } | { type: "clear" } | { type: "exit" };

type ShellEnv = { user: string; host: string; startedAt: number; resolution: string; cores: number; windows: number };
export type ShellContext = { fs: Fs; cwd: string; history: string[]; env: ShellEnv };
type ShellResult = { output: string; fs: Fs; cwd: string; effects: Effect[]; code: number };

/** What a command sees: mutable fs/cwd, stdin text, an stderr sink and whether stdout is the terminal. */
export type IO = { ctx: ShellContext; stdin: string; tty: boolean; effects: Effect[]; err: (message: string) => void };
export type Command = (args: string[], io: IO) => { out: string; code?: number };

class ShellError extends Error {}

type Token = { op: "|" | ">" | ">>" | "&&" } | { word: string };
type Simple = { argv: string[]; redirect?: { path: string; append: boolean } };

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let word: string | null = null;
  const flush = () => {
    if (word !== null) tokens.push({ word });
    word = null;
  };
  for (let index = 0; index < input.length; index++) {
    const char = input[index]!;
    const pair = input.slice(index, index + 2);
    if (pair === "&&" || pair === ">>") {
      flush();
      tokens.push({ op: pair });
      index++;
    } else if (char === "|" || char === ">") {
      flush();
      tokens.push({ op: char });
    } else if (char === " " || char === "\t") {
      flush();
    } else if (char === "'" || char === '"') {
      const end = input.indexOf(char, index + 1);
      if (end === -1) throw new ShellError(`unexpected EOF while looking for matching \`${char}'`);
      word = (word ?? "") + input.slice(index + 1, end);
      index = end;
    } else if (char === "\\" && index + 1 < input.length) {
      word = (word ?? "") + input[++index];
    } else {
      word = (word ?? "") + char;
    }
  }
  flush();
  return tokens;
}

/** Splits tokens into `&&`-separated pipelines of simple commands with an optional output redirect. */
export function parse(tokens: Token[]): Simple[][] {
  const chain: Simple[][] = [[]];
  let current: Simple = { argv: [] };
  const syntax = (near: string) => new ShellError(`syntax error near unexpected token \`${near}'`);
  const endCommand = (op: string) => {
    if (!current.argv.length) throw syntax(op);
    chain.at(-1)!.push(current);
    current = { argv: [] };
  };
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if ("word" in token) current.argv.push(token.word);
    else if (token.op === ">" || token.op === ">>") {
      const target = tokens[++index];
      if (!target || !("word" in target)) throw syntax("newline");
      current.redirect = { path: target.word, append: token.op === ">>" };
    } else {
      endCommand(token.op);
      if (token.op === "&&") chain.push([]);
    }
  }
  if (current.argv.length) chain.at(-1)!.push(current);
  else if (tokens.length) throw syntax("newline");
  return chain.filter((pipeline) => pipeline.length);
}

function runPipeline(pipeline: Simple[], ctx: ShellContext, effects: Effect[]): { output: string; code: number } {
  let stdin = "";
  let errors = "";
  let code = 0;
  pipeline.forEach((command, index) => {
    const [name = "", ...args] = command.argv;
    const tty = index === pipeline.length - 1 && !command.redirect;
    const io: IO = {
      ctx,
      stdin,
      tty,
      effects,
      err: (message) => {
        errors += `${message}\n`;
      },
    };
    const handler = COMMANDS[name];
    if (!handler) {
      io.err(`Command '${name}' not found`);
      stdin = "";
      code = 127;
      return;
    }
    const result = handler(args, io);
    code = result.code ?? 0;
    stdin = command.redirect ? redirect(result.out, command.redirect, io) : result.out;
  });
  return { output: errors + stdin, code };
}

function redirect(out: string, target: { path: string; append: boolean }, io: IO): string {
  try {
    io.ctx.fs = write(io.ctx.fs, resolve(io.ctx.cwd, target.path), out, target.append);
  } catch (error) {
    io.err(`bash: ${target.path}: ${(error as Error).message}`);
  }
  return "";
}

export function run(input: string, context: ShellContext): ShellResult {
  const ctx = { ...context };
  const effects: Effect[] = [];
  let output = "";
  let code = 0;
  try {
    for (const pipeline of parse(tokenize(input))) {
      const result = runPipeline(pipeline, ctx, effects);
      output += result.output;
      code = result.code;
      if (code !== 0) break;
    }
  } catch (error) {
    if (!(error instanceof ShellError)) throw error;
    output += `bash: ${error.message}\n`;
    code = 2;
  }
  return { output, fs: ctx.fs, cwd: ctx.cwd, effects, code };
}

/** Tab completion for the last word: command names in command position, VFS paths otherwise. */
export function complete(line: string, cwd: string, fs: Fs): { line: string; options: string[] } {
  const start = line.lastIndexOf(" ") + 1;
  const word = line.slice(start);
  const before = line.slice(0, start).trim();
  const commandPosition = !before || /(\||&&|sudo)$/.test(before);
  let candidates: string[];
  if (commandPosition) {
    candidates = Object.keys(COMMANDS)
      .filter((name) => name.startsWith(word))
      .sort();
  } else {
    const dirPart = word.slice(0, word.lastIndexOf("/") + 1);
    const partial = word.slice(dirPart.length);
    const dir = resolve(cwd, dirPart || ".");
    candidates =
      fs[dir]?.type === "dir"
        ? list(fs, dir)
            .filter((name) => name.startsWith(partial) && (partial.startsWith(".") || !name.startsWith(".")))
            .map((name) => dirPart + name + (fs[resolve(dir, name)]?.type === "dir" ? "/" : ""))
        : [];
  }
  return applyCompletion(line.slice(0, start), word, candidates);
}

/**
 * Decides what Tab does with the matching candidates for `word` (the text before it is `prefix`).
 * Returns the new input line and the options to print below the prompt (empty = print nothing).
 */
export function applyCompletion(
  prefix: string,
  word: string,
  candidates: string[],
): { line: string; options: string[] } {
  if (!candidates.length) return { line: prefix + word, options: [] };
  if (candidates.length === 1) {
    const only = candidates[0]!;
    return { line: prefix + only + (only.endsWith("/") ? "" : " "), options: [] };
  }
  let common = candidates[0]!;
  for (const candidate of candidates) while (!candidate.startsWith(common)) common = common.slice(0, -1);
  return { line: prefix + (common.length > word.length ? common : word), options: candidates };
}
