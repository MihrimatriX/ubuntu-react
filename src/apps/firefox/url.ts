// Address-bar logic, pure: turn typed text into a URL (or a search), and know which hosts refuse to be
// framed. Both lists were verified against real X-Frame-Options / CSP frame-ancestors headers.

export const HOME_URL = "about:home";
export const SEARCH_URL = "https://html.duckduckgo.com/html/?q=";

/** Sites that load inside an <iframe> (no X-Frame-Options / frame-ancestors). */
export const EMBEDDABLE = [
  { title: "Wikipedia", url: "https://en.wikipedia.org/wiki/Ubuntu" },
  {
    title: "OpenStreetMap",
    url: "https://www.openstreetmap.org/export/embed.html?bbox=28.9,41.0,29.1,41.1&layer=mapnik",
  },
  { title: "DuckDuckGo", url: "https://html.duckduckgo.com/html/" },
  { title: "Ubuntu Wiki", url: "https://wiki.ubuntu.com" },
  { title: "Internet Archive", url: "https://archive.org" },
  { title: "Hacker News", url: "https://news.ycombinator.com" },
  { title: "First Website", url: "https://info.cern.ch" },
  { title: "Example", url: "https://example.com" },
];

const BLOCKED_HOSTS = [
  "google.",
  "github.com",
  "kernel.org",
  "developer.mozilla.org",
  "gnu.org",
  "ubuntu.com",
  "duckduckgo.com",
  "neal.fun",
  "youtube.com",
  "facebook.com",
  "x.com",
  "twitter.com",
  "instagram.com",
  "reddit.com",
  "stackoverflow.com",
  "amazon.",
  "linkedin.com",
];

export function normalizeUrl(input: string): string {
  const text = input.trim();
  if (!text) return HOME_URL;
  if (/^(https?:|about:)/i.test(text)) return text;
  const looksLikeHost =
    !/\s/.test(text) && (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(text) || /^localhost(:\d+)?/.test(text));
  return looksLikeHost ? `https://${text}` : SEARCH_URL + encodeURIComponent(text);
}

/** True for hosts known to send X-Frame-Options/CSP that forbid framing (the html. DDG mirror is allowed). */
export function isBlocked(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  if (host === "html.duckduckgo.com" || host.endsWith("wikipedia.org")) return false;
  return BLOCKED_HOSTS.some((blocked) =>
    blocked.endsWith(".") ? host.includes(blocked) : host === blocked || host.endsWith(`.${blocked}`),
  );
}

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};
