import { describe, expect, test } from "bun:test";
import { HOME, read } from "../src/os/fs";
import { seedFs } from "../src/os/seed";
import { applyCompletion, complete, parse, run, tokenize, type ShellContext } from "../src/lib/shell";

const env = { user: "ubuntu", host: "ubuntu", startedAt: Date.now(), resolution: "1920x1080", cores: 8, windows: 1 };
const fresh = (): ShellContext => ({ fs: seedFs(), cwd: HOME, history: [], env });

/** Runs several command lines in sequence, threading fs/cwd through like a terminal session. */
function session(...lines: string[]) {
  let ctx = fresh();
  let last = run("", ctx);
  for (const line of lines) {
    last = run(line, ctx);
    ctx = { ...ctx, fs: last.fs, cwd: last.cwd };
  }
  return last;
}

describe("tokenize/parse", () => {
  test("quotes, escapes and operators", () => {
    expect(tokenize(`echo "a b" 'c|d' e\\ f>>x&&ls|wc`)).toEqual([
      { word: "echo" },
      { word: "a b" },
      { word: "c|d" },
      { word: "e f" },
      { op: ">>" },
      { word: "x" },
      { op: "&&" },
      { word: "ls" },
      { op: "|" },
      { word: "wc" },
    ]);
    expect(tokenize(`echo ""`)).toEqual([{ word: "echo" }, { word: "" }]);
  });
  test("syntax errors", () => {
    expect(run(`echo "open`, fresh()).output).toContain("unexpected EOF");
    expect(run("| ls", fresh()).output).toContain("syntax error near unexpected token `|'");
    expect(run("echo hi >", fresh()).output).toContain("`newline'");
    expect(parse(tokenize("a | b && c"))).toHaveLength(2);
  });
});

describe("file commands", () => {
  test("the e2e scenario: mkdir && cd && echo > file", () => {
    const result = session("mkdir test && cd test && echo hi > a.txt");
    expect(result.cwd).toBe(`${HOME}/test`);
    expect(read(result.fs, `${HOME}/test/a.txt`)).toBe("hi\n");
    expect(session("mkdir test && cd test && echo hi > a.txt", "cat a.txt").output).toBe("hi\n");
  });
  test(">> appends, pipes feed stdin", () => {
    expect(session("echo one > f", "echo two >> f", "cat f").output).toBe("one\ntwo\n");
    expect(session("cat README.txt | grep -n Terminal | wc -l").output).toBe("2\n");
    expect(session("ls Documents | head -n 1").output).toBe("hello.py\n");
  });
  test("ls flags and errors", () => {
    expect(session("ls -a").output).toContain(".local");
    expect(session("ls").output).not.toContain(".local");
    expect(session("ls -l Documents").output).toMatch(/^-rw-r--r-- 1 ubuntu ubuntu/);
    const missing = session("ls nope");
    expect(missing.output).toBe("ls: cannot access 'nope': No such file or directory\n");
    expect(missing.code).toBe(2);
  });
  test("cd, pwd, rm -r, mv, cp -r", () => {
    expect(session("cd Documents", "pwd").output).toBe(`${HOME}/Documents\n`);
    expect(session("cd /nope").output).toBe("bash: cd: /nope: No such file or directory\n");
    expect(session("rm Documents").output).toBe("rm: cannot remove 'Documents': Is a directory\n");
    expect(session("rm -r Documents", "ls Documents").code).toBe(2);
    expect(session("mv README.txt r.txt", "cat r.txt").output).toContain("Welcome");
    expect(session("cp -r Documents D2", "ls D2").output).toBe("hello.py  notes.md\n");
  });
  test("&& stops at the first failure", () => {
    const result = session("cat nope && echo never");
    expect(result.output).toBe("cat: nope: No such file or directory\n");
    expect(result.code).toBe(1);
  });
  test("tree, touch, head/tail, wc", () => {
    expect(session("tree Documents").output).toContain("└── notes.md\n\n0 directories, 2 files");
    expect(read(session("touch new.txt").fs, `${HOME}/new.txt`)).toBe("");
    expect(session("tail -n 1 Documents/notes.md").output).toBe(
      "- [ ] Change the wallpaper (right-click the desktop)\n",
    );
    expect(session("echo a b c | wc -w").output).toBe("3\n");
  });
});

describe("system commands", () => {
  test("unknown commands, sudo, info", () => {
    const missing = session("foo");
    expect(missing.output).toBe("Command 'foo' not found\n");
    expect(missing.code).toBe(127);
    expect(session("sudo whoami").output).toBe("ubuntu\n");
    expect(session("uname -a").output).toContain("GNU/Linux");
    expect(session("neofetch").output).toContain("Ubuntu 24.04");
    expect(session("grep -i WELCOME README.txt").output).toContain("Welcome");
  });
  test("launchers return effects instead of acting", () => {
    expect(session("gedit notes.txt").effects).toEqual([
      { type: "open", appId: "text-editor", path: `${HOME}/notes.txt` },
    ]);
    expect(session("gedit notes.txt").fs[`${HOME}/notes.txt`]).toBeDefined();
    expect(session("xdg-open Pictures").effects).toEqual([
      { type: "open", appId: undefined, path: `${HOME}/Pictures` },
    ]);
    expect(session("firefox example.com").effects).toEqual([{ type: "open", appId: "firefox", args: ["example.com"] }]);
    expect(session("clear").effects).toEqual([{ type: "clear" }]);
  });
});

describe("tab completion", () => {
  test("a single match completes fully (dirs get '/', files a space)", () => {
    expect(complete("neof", HOME, seedFs())).toEqual({ line: "neofetch ", options: [] });
    expect(complete("cd Doc", HOME, seedFs())).toEqual({ line: "cd Documents/", options: [] });
    expect(complete("cat Documents/no", HOME, seedFs())).toEqual({ line: "cat Documents/notes.md ", options: [] });
  });
  test("several matches extend to the common prefix and list the options", () => {
    expect(complete("cd D", HOME, seedFs())).toEqual({
      line: "cd D",
      options: ["Desktop/", "Documents/", "Downloads/"],
    });
    expect(applyCompletion("ls ", "M", ["Music/", "Music2/"])).toEqual({
      line: "ls Music",
      options: ["Music/", "Music2/"],
    });
  });
  test("no match leaves the line alone", () => {
    expect(complete("cat zzz", HOME, seedFs())).toEqual({ line: "cat zzz", options: [] });
  });
});
