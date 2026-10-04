import { describe, expect, test } from "bun:test";
import { HOME, TRASH, trash, write } from "../src/os/fs";
import { seedFs } from "../src/os/seed";
import { entriesFor, nextSelection, RECENT, searchEntries, sortEntries, STARRED } from "../src/apps/files/entries";

const names = (entries: { name: string }[]) => entries.map((entry) => entry.name);
const opts = { hidden: false, starred: [] as string[] };

describe("entriesFor", () => {
  test("folders hide dotfiles unless asked", () => {
    expect(names(entriesFor(seedFs(), HOME, opts))).not.toContain(".local");
    expect(names(entriesFor(seedFs(), HOME, { ...opts, hidden: true }))).toContain(".local");
  });
  test("trash lists trashed items with their original location", () => {
    const fs = trash(seedFs(), `${HOME}/README.txt`);
    expect(entriesFor(fs, TRASH, opts)).toMatchObject([{ name: "README.txt", origin: `${HOME}/README.txt` }]);
  });
  test("recent is newest first, starred follows the list", async () => {
    const seeded = seedFs();
    await Bun.sleep(2);
    const fs = write(seeded, `${HOME}/fresh.txt`, "new");
    expect(entriesFor(fs, RECENT, opts)[0]!.name).toBe("fresh.txt");
    expect(names(entriesFor(fs, STARRED, { ...opts, starred: [`${HOME}/fresh.txt`, "/gone"] }))).toEqual(["fresh.txt"]);
  });
});

test("sortEntries keeps folders first and sorts naturally", () => {
  let fs = seedFs();
  for (const name of ["file10.txt", "file2.txt"]) fs = write(fs, `${HOME}/${name}`, "");
  const sorted = names(sortEntries(entriesFor(fs, HOME, opts), "name", false));
  expect(sorted.slice(0, 6)).toEqual(["Desktop", "Documents", "Downloads", "Music", "Pictures", "Videos"]);
  expect(sorted.slice(6)).toEqual(["file2.txt", "file10.txt", "README.txt"]);
  const reversed = names(sortEntries(entriesFor(fs, HOME, opts), "name", true));
  expect([reversed[0], reversed.at(-1)]).toEqual(["Videos", "file2.txt"]);
});

test("nextSelection: click, ctrl toggle, shift range", () => {
  const order = ["a", "b", "c", "d"];
  expect(nextSelection(["a"], order, "c", { ctrl: false, shift: false }, "a")).toEqual(["c"]);
  expect(nextSelection(["a"], order, "c", { ctrl: true, shift: false }, "a")).toEqual(["a", "c"]);
  expect(nextSelection(["a", "c"], order, "c", { ctrl: true, shift: false }, "a")).toEqual(["a"]);
  expect(nextSelection(["d"], order, "b", { ctrl: false, shift: true }, "d")).toEqual(["b", "c", "d"]);
});

test("searchEntries finds names recursively and skips hidden paths", () => {
  const fs = write(seedFs(), `${HOME}/.local/notes-hidden.md`, "x");
  expect(searchEntries(fs, HOME, "NOTES", opts).map((entry) => entry.path)).toEqual([`${HOME}/Documents/notes.md`]);
  expect(searchEntries(fs, HOME, "notes", { ...opts, hidden: true })).toHaveLength(2);
  expect(searchEntries(trash(fs, `${HOME}/README.txt`), TRASH, "read", opts).map((entry) => entry.name)).toEqual(["README.txt"]);
});
