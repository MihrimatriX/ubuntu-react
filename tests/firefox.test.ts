import { expect, test } from "bun:test";
import { HOME_URL, SEARCH_URL, isBlocked, normalizeUrl } from "../src/apps/firefox/url";

test("normalizeUrl: URLs, bare hosts and searches", () => {
  expect(normalizeUrl("")).toBe(HOME_URL);
  expect(normalizeUrl("https://example.com/a")).toBe("https://example.com/a");
  expect(normalizeUrl("example.com")).toBe("https://example.com");
  expect(normalizeUrl("en.wikipedia.org/wiki/Linux")).toBe("https://en.wikipedia.org/wiki/Linux");
  expect(normalizeUrl("localhost:3000")).toBe("https://localhost:3000");
  expect(normalizeUrl("ubuntu noble numbat")).toBe(`${SEARCH_URL}ubuntu%20noble%20numbat`);
  expect(normalizeUrl("linux")).toBe(`${SEARCH_URL}linux`);
});

test("isBlocked matches hosts, not substrings", () => {
  expect(isBlocked("https://www.google.com/search?q=x")).toBe(true);
  expect(isBlocked("https://github.com/ubuntu")).toBe(true);
  expect(isBlocked("https://html.duckduckgo.com/html/?q=x")).toBe(false);
  expect(isBlocked("https://en.wikipedia.org/wiki/GitHub")).toBe(false);
  expect(isBlocked("https://notgithub.com")).toBe(false);
});
