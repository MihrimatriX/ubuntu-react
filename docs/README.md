# Ubuntu 24.04 in React

A browser recreation of the Ubuntu 24.04 LTS desktop (GNOME 46, Yaru, Ubuntu Dock) where every app actually
works and all apps share one virtual file system. Create a file in Terminal and it appears in Files at once;
double-click it there and it opens in Text Editor; save it and `cat` shows the new content.

No backend: everything runs in the browser and persists to `localStorage`.

![Activities overview with Terminal and Files](screenshots/overview.jpg)

| | |
| --- | --- |
| ![Files](screenshots/files.jpg) **Files**: breadcrumbs, search, rubber-band selection, drag and drop | ![Terminal running neofetch](screenshots/terminal.jpg) **Terminal**: a bash-like shell over the shared file system |
| ![Text Editor](screenshots/editor.jpg) **Text Editor**: CodeMirror 6 with tabs and syntax highlighting | ![Settings in dark style](screenshots/dark.jpg) **Settings**: 12 panels, dark style, wallpapers, dock options |
| ![App Grid](screenshots/grid.jpg) **App Grid** with search | ![Quick Settings](screenshots/quick.jpg) **Quick Settings** with submenus |

## Quick start

### Docker Compose

```bash
echo "SITE_URL=https://ubuntu.example.com" > .env   # optional, see below
docker compose up -d --build
# open http://localhost:8080 and log in with any password
```

| `.env` variable | Default | Purpose |
| --- | --- | --- |
| `SITE_URL` | empty | Public URL baked in at build time, so link previews get absolute image URLs (Facebook, LinkedIn, X and Slack require them). |
| `PORT` | `8080` | Host port. |

The container only serves the app over plain HTTP. Put a reverse proxy in front for the domain and TLS. With
**Nginx Proxy Manager**, add a Proxy Host that forwards to the server's IP on `PORT`, or to `ubuntu-react:8080`
when NPM shares a Docker network with the container, and request the SSL certificate there.

The image is a two-stage build. Bun builds the bundle, and the same Bun base image then runs `server.ts`
as the non-root `bun` user, without `node_modules`. A `HEALTHCHECK` is included.

### Local development

Requires Bun ≥ 1.3.

```bash
bun install
bun dev              # dev server with HMR (bun ./index.html)
bun test             # unit + happy-dom component tests
bun run typecheck
bun run build        # production bundle in dist/ (SITE_URL=… for absolute social URLs)
bun run e2e          # end-to-end scenario in real Chrome (needs `bun dev` running)
bun run e2e:mouse    # desktop icon and window title-bar mouse checks (URL=… to target another server)
bun run shots        # screenshots of every scene into e2e/shots/ for visual review
```

`e2e`, `e2e:mouse` and `shots` drive the installed Google Chrome through `playwright-core` (no browser download).
The README images come from the same script:

```bash
DIR=docs/screenshots EXT=jpg bun e2e/shot.ts overview files terminal editor dark grid quick
SIZE=1200x630 DIR=public bun e2e/shot.ts overview && mv public/overview.png public/og.png
```

## Performance and delivery

| | Before | Now |
| --- | ---: | ---: |
| Render-blocking CSS | 1.72 MB (72 fonts inlined as base64) | 67 KB |
| Fonts downloaded on first load | all subsets, woff + woff2 | the 3 woff2 files the page uses |
| Initial JS (gzip) | 164 KB | 164 KB |

- **Fonts:** Bun's CSS bundler inlines every `url()`. `build.ts` moves the woff2 fonts back out into files, so
  `unicode-range` lets the browser fetch only the subsets a page uses, and it drops the woff fallbacks.
- **Code splitting:** every app is `lazy()`-loaded. CodeMirror (≈670 KB) and xterm (≈490 KB) load only when
  Text Editor or Terminal opens.
- **Serving (`server.ts`):** files are gzip-compressed (level 9) at build time, and the server sends the `.gz`
  copy when the client accepts gzip. Content-hashed assets are cached for a year as `immutable`, `index.html` is
  revalidated on every load, and `X-Content-Type-Options` and `Referrer-Policy` are set. Missing files return 404
  and encoded `..` paths return 400. Source maps are left out of the image.

## SEO and link previews

`index.html` carries a description, a canonical URL, `theme-color`, an SVG favicon, Open Graph and
Twitter card tags, and a `<noscript>` fallback. The preview image is `public/og.png` (1200×630). The build
replaces `%SITE_URL%` with the `SITE_URL` value.

## Dependencies beyond the fixed stack

| Package | Why |
| --- | --- |
| `@codemirror/state`, `/view`, `/search`, `lang-*`, `theme-one-dark` | Parts of CodeMirror 6, imported directly by the editor (languages, dark theme, search panel). |
| `@xterm/addon-webgl` | Official xterm renderer. The DOM renderer mis-measured Ubuntu Mono glyphs and drifted columns (visible in `neofetch`); WebGL draws each glyph in its cell. Falls back to DOM. |
| `@happy-dom/global-registrator` (dev) | DOM for the component tests in `bun test`. |
| `playwright-core` (dev) | Drives the installed Chrome for the e2e checks and screenshots. |

## Architecture

```mermaid
flowchart LR
  subgraph Pure logic, unit tested
    fs[os/fs.ts<br/>VFS]
    shell[lib/shell.ts + commands<br/>interpreter]
    calc[lib/calc.ts<br/>shunting-yard]
    snap[lib/snap.ts<br/>window geometry]
    mines[lib/mines.ts]
  end
  store[(os/store.ts<br/>zustand + persist)]
  storage[os/storage.ts<br/>localStorage adapter]
  registry[apps/registry.ts<br/>AppDef list]
  shellui[shell/*<br/>Desktop, TopBar, Dock, Window,<br/>Overview, AppGrid, AltTab, Session]
  apps[apps/*<br/>lazy-loaded components]
  keyboard[os/keyboard.ts<br/>shortcut table]

  fs --> store
  store --> storage
  shell --> apps
  calc --> apps
  snap --> shellui
  registry --> shellui
  registry --> apps
  store <--> shellui
  store <--> apps
  keyboard --> store
```

- **Data-driven:** apps, the dock, App Grid, search, "Open With" and MIME routing all read `APPS` in
  `apps/registry.ts`. Adding an app = one registry entry + one component file. Shortcuts live in one table
  (`os/keyboard.ts`); context menus are plain item arrays passed to the single `ContextMenu`.
- **Pure core:** the VFS, shell, calculator, window geometry, Overview layout, Files selection/sorting, URL
  normalization and Mines are plain functions with tests. The UI only calls them and commits results to the store.
- **One store:** `os/store.ts` (VFS, settings, notifications, session, menus) plus `os/windows.ts` (window
  manager slice). Only the VFS, settings, terminal history and desktop icon positions are persisted, with
  `version` + `migrate`. The storage adapter skips writes when nothing persisted changed and warns near 5 MB;
  moving to IndexedDB means changing only `os/storage.ts`.
- **Pointer gestures:** window move/resize, desktop icon drags and the desktop rubber band share `track()` in
  `os/useDragResize.ts`. It captures the pointer only after the drag threshold, so plain clicks still reach
  title-bar widgets, and once captured the gesture keeps working over iframes and terminals. During a window drag,
  only the CSS `transform` changes; the store is written on `pointerup`. `rect` always holds the normal geometry,
  and maximized/snapped rects are derived. Minimized windows stay mounted, so terminal scrollback and editor undo
  history survive.
- **Desktop icons:** a column-major grid. Click, Ctrl+click and the rubber band select. The selection drags as a
  group onto free cells, or onto Trash or a folder. The first drag saves every icon's cell so nothing reflows,
  and new files take the first free cell.

## Line budget (excluding tests, assets, config)

| Module | Files | Lines |
| --- | ---: | ---: |
| `src/os` (store, VFS, windows, keyboard, storage, launcher) | 9 | 930 |
| `src/lib` (shell, commands, calc, snap, mines) | 6 | 746 |
| `src/shell` (desktop chrome, shared widgets) | 16 | 1,556 |
| `src/apps` (10 apps + registry) | 22 | 2,073 |
| `src/main.tsx` | 1 | 37 |
| **Total** | **54** | **5,342** |

Largest files: `src/shell/DesktopIcons.tsx` (209 lines) and `src/apps/files/Files.tsx` (187). Tests: 618 lines,
68 tests; e2e: the 9-check scenario and 8 mouse checks.

## Apps

Files, Terminal, Text Editor, Firefox, Calculator, Image Viewer, Settings and System Monitor, plus the
bonus apps Clocks and Mines. Apps share widgets from `shell/chrome.tsx`: header-bar slots, dialogs, a
crash boundary (an app that throws shows "has stopped" instead of taking down the desktop), tab strips and
segmented switchers.

Behaviors from GNOME that are wired up end to end:
- **Desktop:** hot corner, Screen Blank auto-lock, and a lock screen that counts missed notifications.
- **Window menu:** Always on Top, Move to Workspace.
- **Dock:** floating (non-panel) mode and Trash with drop support.
- **Keys and status:** volume/brightness keys with an OSD; battery status from the Battery Status API when the browser provides it.

## Known limitations

- **Embedded websites:** many sites send `X-Frame-Options` or CSP `frame-ancestors` and refuse to load
  inside an iframe (Google, GitHub, ubuntu.com, MDN, kernel.org…). Firefox shows an error page with
  "Open in New Tab" for them. The home page and bookmarks only list sites whose headers were checked to allow
  framing (Wikipedia, OpenStreetMap, DuckDuckGo HTML, Internet Archive, Hacker News, info.cern.ch, wiki.ubuntu.com).
  Navigation inside a cross-origin page does not update the address bar.
- **Keyboard shortcuts:** the host OS or the browser may catch Super, Alt+Tab, Alt+F4 and Ctrl+Alt+T. In full screen,
  Chromium's Keyboard Lock API passes them to the page. Every shortcut also has a browser-safe alternative
  (listed in Settings › Keyboard), e.g. Ctrl+Shift+Space for Activities and Alt+\` for Alt+Tab.
- **Storage:** about 5 MB of `localStorage`. Large images stored as data URLs fill it quickly.
- **Terminal:** the line editor assumes a command fits on one row (no soft-wrap cursor tracking).
- **Desktop icons:** an icon dropped on an occupied cell stays where it was; Ubuntu's desktop icons (DING) would push it to the next free cell.
- **Search engines:** the desktop is rendered client-side, so crawlers that don't run JavaScript only see the
  meta tags and the `<noscript>` text.

## License and credits

Code: MIT. Icons are drawn in the style of the [Yaru](https://github.com/ubuntu/yaru) icon theme
(CC BY-SA 4.0), and the original Yaru icons can be dropped into `public/yaru-icons/` with the same file names.
Fonts: Ubuntu and Ubuntu Mono via @fontsource (Ubuntu Font Licence).

Ubuntu and the Circle of Friends logo are trademarks of Canonical Ltd. This is a personal, educational project,
not affiliated with or endorsed by Canonical.
