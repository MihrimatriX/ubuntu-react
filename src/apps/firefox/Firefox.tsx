// Firefox: tabs, each with its own back/forward history; content is an <iframe>. Hosts known to forbid
// framing get a Firefox-style error page with "Open in New Tab" instead. about:home is a local page.
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, RotateCw, Search } from "lucide-react";
import { HeaderSlot, TabStrip } from "../../shell/chrome";
import { ICONS } from "../../os/icons";
import { useOS } from "../../os/store";
import type { AppProps } from "../registry";
import { EMBEDDABLE, HOME_URL, hostOf, isBlocked, normalizeUrl } from "./url";

type Tab = { id: number; stack: string[]; index: number; reload: number; loading: boolean };
let tabCounter = 0;
const newTab = (url = HOME_URL): Tab => ({
  id: ++tabCounter,
  stack: [url],
  index: 0,
  reload: 0,
  loading: url !== HOME_URL,
});
const urlOf = (tab: Tab) => tab.stack[tab.index]!;
const titleOf = (url: string) => (url === HOME_URL ? "New Tab" : hostOf(url));

function HomePage({ onGo }: { onGo: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center overflow-auto bg-[#f9f9fb] pt-16 text-[#15141a] dark:bg-[#2b2a33] dark:text-white">
      <img src={ICONS.firefox} alt="" className="size-20" />
      <h1 className="mt-3 text-3xl font-medium">Firefox</h1>
      <form
        className="mt-8 flex w-[min(600px,90%)] items-center gap-3 rounded-lg bg-white px-4 shadow-md dark:bg-[#42414d]"
        onSubmit={(e) => {
          e.preventDefault();
          onGo(new FormData(e.currentTarget).get("q")?.toString() ?? "");
        }}
      >
        <Search className="size-4 opacity-60" />
        <input
          name="q"
          autoFocus
          placeholder="Search with DuckDuckGo or enter address"
          className="h-12 flex-1 bg-transparent outline-none"
        />
      </form>
      <div className="mt-10 grid grid-cols-4 gap-4">
        {EMBEDDABLE.map((site) => (
          <button
            key={site.url}
            onClick={() => onGo(site.url)}
            className="flex w-24 flex-col items-center gap-2 rounded-lg p-2 text-xs hover:bg-black/5 dark:hover:bg-white/10"
          >
            <span className="grid size-14 place-items-center rounded-xl bg-white text-xl font-bold text-[#E95420] shadow dark:bg-[#42414d]">
              {site.title[0]}
            </span>
            <span className="w-full truncate text-center">{site.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BlockedPage({ url, onRetry }: { url: string; onRetry: () => void }) {
  return (
    <div className="flex h-full items-center justify-center bg-[#f9f9fb] p-8 text-[#15141a] dark:bg-[#2b2a33] dark:text-white">
      <div className="max-w-lg">
        <h1 className="text-2xl font-light">Hmm. This site can’t be shown here.</h1>
        <p className="mt-4 text-sm opacity-80">
          <b>{hostOf(url)}</b> sends a security header (X-Frame-Options or CSP frame-ancestors) that stops it from
          loading inside another page.
        </p>
        <div className="mt-6 flex gap-3">
          <a className="btn btn-accent" href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" />
            Open in New Tab
          </a>
          <button className="btn" onClick={onRetry}>
            Try Anyway
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Firefox({ windowId, args }: AppProps) {
  const [tabs, setTabs] = useState<Tab[]>(() => [newTab(args?.[0] ? normalizeUrl(args[0]) : HOME_URL)]);
  const [activeId, setActiveId] = useState(tabs[0]!.id);
  const [address, setAddress] = useState("");
  const [forced, setForced] = useState<string[]>([]);
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0]!;
  const url = urlOf(active);
  const update = (patch: (tab: Tab) => Partial<Tab>, id = active.id) =>
    setTabs((all) => all.map((tab) => (tab.id === id ? { ...tab, ...patch(tab) } : tab)));
  const navigate = (text: string) => {
    const next = normalizeUrl(text);
    update((tab) => ({
      stack: [...tab.stack.slice(0, tab.index + 1), next],
      index: tab.index + 1,
      loading: next !== HOME_URL,
    }));
  };
  const go = (step: number) => update((tab) => ({ index: tab.index + step, loading: true }));
  const closeTab = (id: number) => {
    const rest = tabs.filter((tab) => tab.id !== id);
    if (!rest.length) return useOS.getState().closeWindow(windowId);
    setTabs(rest);
    if (id === activeId) setActiveId(rest.at(-1)!.id);
  };
  const addTab = () => {
    const tab = newTab();
    setTabs((all) => [...all, tab]);
    setActiveId(tab.id);
  };

  useEffect(() => {
    setAddress(url === HOME_URL ? "" : url);
  }, [url]);
  useEffect(() => {
    useOS.getState().patchWindow(windowId, { title: `${titleOf(url)} — Mozilla Firefox` });
  }, [url, windowId]);
  useEffect(() => {
    if (args?.[0] && normalizeUrl(args[0]) !== url) navigate(args[0]);
  }, [args]);

  const content = (tab: Tab) => {
    const tabUrl = urlOf(tab);
    if (tabUrl === HOME_URL) return <HomePage onGo={navigate} />;
    if (isBlocked(tabUrl) && !forced.includes(tabUrl))
      return <BlockedPage url={tabUrl} onRetry={() => setForced([...forced, tabUrl])} />;
    return (
      <iframe
        key={`${tab.index}-${tab.reload}`}
        src={tabUrl}
        title={titleOf(tabUrl)}
        className="size-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        referrerPolicy="no-referrer"
        onLoad={() => update(() => ({ loading: false }), tab.id)}
      />
    );
  };
  return (
    <div className="flex h-full flex-col bg-[#f0f0f4] text-[#15141a] dark:bg-[#1c1b22] dark:text-white">
      <HeaderSlot windowId={windowId}>
        <TabStrip
          tabs={tabs}
          active={active.id}
          onSelect={setActiveId}
          onClose={closeTab}
          onAdd={addTab}
          className="flex-1 [&>[role=tab]]:justify-start"
          title={(tab) => <span className="block text-left font-normal">{titleOf(urlOf(tab))}</span>}
          icon={(tab) =>
            tab.loading ? (
              <RotateCw className="size-3.5 shrink-0 animate-spin" />
            ) : (
              <img src={ICONS.firefox} alt="" className="size-4" />
            )
          }
        />
      </HeaderSlot>
      <div className="flex items-center gap-1 bg-white px-2 py-1.5 dark:bg-[#2b2a33]">
        <button aria-label="Back" className="btn btn-flat" disabled={active.index === 0} onClick={() => go(-1)}>
          <ArrowLeft className="size-4" />
        </button>
        <button
          aria-label="Forward"
          className="btn btn-flat"
          disabled={active.index === active.stack.length - 1}
          onClick={() => go(1)}
        >
          <ArrowRight className="size-4" />
        </button>
        <button
          aria-label="Reload"
          className="btn btn-flat"
          onClick={() => update((tab) => ({ reload: tab.reload + 1, loading: url !== HOME_URL }))}
        >
          <RotateCw className="size-4" />
        </button>
        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(address);
          }}
        >
          <input
            aria-label="Address"
            value={address}
            placeholder="Search with DuckDuckGo or enter address"
            onChange={(e) => setAddress(e.target.value)}
            onFocus={(e) => e.target.select()}
            className="h-8 w-full rounded-md bg-[#f0f0f4] px-3 text-sm outline-none focus:ring-2 focus:ring-[#0061e0] dark:bg-[#1c1b22]"
          />
        </form>
      </div>
      <nav
        aria-label="Bookmarks"
        className="flex gap-1 overflow-hidden border-b border-black/10 bg-white px-2 pb-1 text-xs dark:bg-[#2b2a33]"
      >
        {EMBEDDABLE.slice(0, 6).map((site) => (
          <button
            key={site.url}
            className="truncate rounded px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => navigate(site.url)}
          >
            {site.title}
          </button>
        ))}
      </nav>
      <div className="relative min-h-0 flex-1 bg-white">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="absolute inset-0"
            style={{ visibility: tab.id === active.id ? "visible" : "hidden" }}
          >
            {content(tab)}
          </div>
        ))}
      </div>
    </div>
  );
}
