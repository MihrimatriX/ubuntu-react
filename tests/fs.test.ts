import { describe, expect, test } from "bun:test";
import { HOME, TRASH, cp, emptyTrash, list, mkdir, mv, read, resolve, restore, rm, stat, trash, trashed, write, mimeOf, uniqueName } from "../src/os/fs";
import { seedFs } from "../src/os/seed";

const base = () => seedFs();

describe("resolve", () => {
  test("handles ~, ., .. and absolute paths", () => {
    expect(resolve("/tmp", "~")).toBe(HOME);
    expect(resolve("/tmp", "~/Documents/../Music")).toBe(`${HOME}/Music`);
    expect(resolve(`${HOME}/Documents`, "./a/./b")).toBe(`${HOME}/Documents/a/b`);
    expect(resolve("/a/b", "../../../..")).toBe("/");
    expect(resolve("/a", "/etc//hostname")).toBe("/etc/hostname");
  });
});

describe("read/write/list", () => {
  test("write creates and appends, list returns sorted direct children", () => {
    let fs = write(base(), `${HOME}/a.txt`, "one\n");
    fs = write(fs, `${HOME}/a.txt`, "two\n", true);
    expect(read(fs, `${HOME}/a.txt`)).toBe("one\ntwo\n");
    expect(stat(fs, `${HOME}/a.txt`).size).toBe(8);
    expect(stat(fs, `${HOME}/a.txt`).mime).toBe("text/plain");
    expect(list(fs, `${HOME}/Documents`)).toEqual(["hello.py", "notes.md"]);
  });
  test("Linux error messages", () => {
    const fs = base();
    expect(() => read(fs, "/nope")).toThrow("No such file or directory");
    expect(() => read(fs, HOME)).toThrow("Is a directory");
    expect(() => list(fs, `${HOME}/README.txt`)).toThrow("Not a directory");
    expect(() => write(fs, "/missing/dir/x", "")).toThrow("No such file or directory");
    expect(() => mkdir(fs, `${HOME}/Music`)).toThrow("File exists");
    expect(() => rm(fs, `${HOME}/Music`)).toThrow("Is a directory");
  });
});

describe("mkdir/rm", () => {
  test("mkdir -p creates parents and is idempotent", () => {
    let fs = mkdir(base(), "/x/y/z", true);
    fs = mkdir(fs, "/x/y/z", true);
    expect(stat(fs, "/x/y").type).toBe("dir");
  });
  test("rm -r removes the subtree but not siblings with a shared prefix", () => {
    let fs = mkdir(mkdir(base(), "/x/y", true), "/xy");
    fs = rm(fs, "/x", true);
    expect(fs["/x/y"]).toBeUndefined();
    expect(fs["/xy"]).toBeDefined();
  });
});

describe("mv/cp", () => {
  test("mv renames a directory with its children", () => {
    const fs = mv(base(), `${HOME}/Documents`, `${HOME}/Docs`);
    expect(read(fs, `${HOME}/Docs/notes.md`)).toContain("# Notes");
    expect(fs[`${HOME}/Documents`]).toBeUndefined();
  });
  test("mv into an existing directory and overwrite an existing file", () => {
    let fs = mv(base(), `${HOME}/README.txt`, `${HOME}/Music`);
    expect(fs[`${HOME}/Music/README.txt`]).toBeDefined();
    fs = write(fs, `${HOME}/b.txt`, "B");
    fs = mv(write(fs, `${HOME}/a.txt`, "A"), `${HOME}/a.txt`, `${HOME}/b.txt`);
    expect(read(fs, `${HOME}/b.txt`)).toBe("A");
  });
  test("cannot move a directory into itself", () => {
    expect(() => mv(base(), HOME, `${HOME}/Music`)).toThrow("subdirectory of itself");
  });
  test("cp requires -r for directories and keeps the source", () => {
    expect(() => cp(base(), `${HOME}/Documents`, "/tmp")).toThrow("-r not specified");
    const fs = cp(base(), `${HOME}/Documents`, `${HOME}/Backup`, true);
    expect(read(fs, `${HOME}/Backup/hello.py`)).toBe(read(fs, `${HOME}/Documents/hello.py`));
  });
});

describe("trash", () => {
  test("trash → restore round trip keeps the original path", () => {
    let fs = trash(base(), `${HOME}/Documents/notes.md`);
    expect(fs[`${HOME}/Documents/notes.md`]).toBeUndefined();
    expect(trashed(fs)).toEqual([{ name: "notes.md", originalPath: `${HOME}/Documents/notes.md` }]);
    fs = restore(fs, "notes.md");
    expect(read(fs, `${HOME}/Documents/notes.md`)).toContain("# Notes");
    expect(trashed(fs)).toEqual([]);
  });
  test("name clashes get a numbered suffix, emptyTrash keeps the Trash dirs", () => {
    let fs = trash(base(), `${HOME}/README.txt`);
    fs = trash(write(fs, `${HOME}/README.txt`, "again"), `${HOME}/README.txt`);
    expect(trashed(fs).map((item) => item.name)).toEqual(["README (2).txt", "README.txt"]);
    fs = emptyTrash(fs);
    expect(trashed(fs)).toEqual([]);
    expect(stat(fs, `${TRASH}/files`).type).toBe("dir");
  });
});

test("helpers", () => {
  expect(mimeOf("a.PNG")).toBe("image/png");
  expect(mimeOf("Makefile")).toBe("application/octet-stream");
  expect(uniqueName(base(), HOME, "README.txt")).toBe("README (2).txt");
});
