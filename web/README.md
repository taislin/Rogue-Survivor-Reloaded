# Rogue Survivor: Reloaded

TypeScript port of the original C# game, playable in a browser.

**See the [root README](../README.md) for basic info on the project. This file covers setup, architecture, and project overview.**

## Running it

Requires Node 20+.

### Development

```bash
cd web
npm install
npm run dev
```

Vite dev server on **:3000** with hot reload.

### Production

```bash
npm run build:all   # browser bundle -> dist/, Express server -> dist-server/
npm run serve       # http://localhost:8080
```

| Variable | Default | Description                |
|----------|---------|----------------------------|
| `PORT`   | `8080`  | Production server port     |

The build is a static bundle, so `dist/` can be served by any static host; the
Express server is just a convenient one. A `Dockerfile` is included at the repo
root.

### Offline play

`web/public/sw.js` is a service worker that caches the shell and game assets, so
the game keeps working with no connection after the first visit. Bump
`CACHE_VERSION` in that file when releasing a build — it namespaces the caches
and is what evicts the previous one.

---

## Scripts

All run from `web/`.

| Script              | What it does                                              |
|---------------------|-----------------------------------------------------------|
| `npm run dev`       | Vite dev server, hot reload                                 |
| `npm run build`     | Type-check then bundle to `dist/`                           |
| `npm run build:server` | Compile the Express server to `dist-server/`            |
| `npm run build:all` | Both of the above                                           |
| `npm run build:desktop` | Bundle + Neutralino clients for every platform -> `dist/RogueSurvivorReloaded/` |
| `npm run build:release` | `build:desktop`, then regroup into `dist-release/RogueSurvivorReloaded-{windows,linux,macos}/` |
| `npm run serve`     | Run the built server                                        |
| `npm run type-check`| `tsc --noEmit`                                              |
| `npm test`          | Vitest suite                                                |
| `npm run test:coverage` | Vitest with V8 coverage                               |
| `npm run verify`    | type-check + coverage + build (the full gate)               |
| `npm run sim`       | Headless simulation — plays a full game in Node, no browser |
| `npm run profile`   | Headless draw-call profiler                                 |

---

## Layout

```
.
├── src/                  Original C# source (reference only — never modified)
├── BROWSER_PORT_PLAN.md  Porting plan, phase status, and the bug log
├── docs/                 Static website (GitHub Pages source)
├── Dockerfile
├── LICENSE.txt           GPLv3 (inherited from the original)
└── web/                  The port
    ├── index.html        Entry page; owns the 1366x768 canvas
    ├── public/
    │   ├── assets/       Sprites (.webp) and audio (.ogg)
    │   └── sw.js         Service worker
    ├── server/           Express production server
    ├── sim/              Headless simulator CLI + profiler
    ├── src/
    │   ├── main.ts       Browser entry point
    │   ├── data/         Map, Actor, Item, Tile, World, Doll, …
    │   ├── engine/       Rules, LOS, RogueGame, actions, audio, items
    │   ├── gameplay/     Game data tables, AI controllers, map generators
    │   ├── sim/          HeadlessRunner
    │   └── ui/           IRogueUI implementations (Canvas, Null, Options)
    └── tests/
```

---

## How the port is organised

The original C# draws straight to a GDI surface, blocks on WinForms message
loops, and reads `Keys.D0`-style key codes. None of that survives a browser, so
the port replaces exactly three things and leaves the rules alone:

| C# concept        | Port                                              |
|-------------------|---------------------------------------------------|
| `IRogueUI`        | `web/src/engine/IRogueUI.ts` — the rendering + input contract |
| `RogueForm`'s WinForms canvas | `web/src/ui/CanvasUI.ts` — Canvas 2D |
| Blocking `UI_WaitKey` / `UI_PeekKey` | Promises fed by `web/src/ui/InputHandler.ts` |
| `Application.DoEvents()` busy-wait loops | `await` + the real DOM event loop |
| `System.Drawing` | `Point` / `Rect` / `Color` in `web/src/engine/` |
| `*.csv` / `Resources` | JSON tables in `web/src/gameplay/data/` |

Because everything reaches the screen through `IRogueUI`, the entire engine runs
headless: `ui/NullRogueUI.ts` drops every painting call and answers keys locally,
which is what makes the simulator and the test suite possible.

The game logic is a direct port and is kept line-for-line comparable to the C#
— most methods carry a `// C# Foo — RogueGame.cs:12345` comment pointing at
their original. That is deliberate: it is what makes a regression traceable.

---

## Assets

Sprites are **lossless WebP**, 32×32, 1124 files across three sprite sets
(`classic`, `genesis_classic_1.4`, `deonapocalypse_v9_r1`) plus 27 `.ogg` audio
tracks — about 25 MB total.

```
web/public/assets/images/<set>/<Category>/<name>.webp
web/public/assets/music/RS - <Title>.ogg
web/public/assets/sfx/sfx - <name>.ogg
```

`GameImages` ids stay in the C# form (`"Tiles\\floor_asphalt"`) and
`web/src/engine/AssetPaths.ts` derives the URL, so no call site builds a path by
hand. `scripts/optimize-sprites.py` performs the PNG → WebP conversion; a test
asserts every id still resolves to a file, so a rename cannot silently 404.

All sprites are preloaded before the first frame (`UI_PreloadImages`). This is
not an optimisation — a browser cannot draw a sprite it has not fetched, so
without the preload the map paints itself in progressively as files arrive.

---

## Display

- **1366×768 (16:9)**, upscaled with smooth filtering to fit the viewport. C#
  was 1024×768 (4:3).
- The extra width goes to the map: 31 tiles across instead of 21. Height, the
  right-hand panel, the message area and the minimap are unchanged.
- Text comes in two sizes: the dense in-game HUD at C#'s 8.25pt, and full-screen
  menus (main menu, character creation, help, manual, options, keybindings,
  hiscores, message log, city info, post-mortem) at 12pt with scrolling for the
  long lists.

Append `?debug=1` to the URL for per-action `[render]` and per-frame `[draw]`
console logging. This exists because "my sprite doesn't draw" is otherwise not
triageable without attaching a debugger to someone's browser.

---

## Testing and the headless simulator

```bash
cd web
npm run verify     # type-check + 409 tests + build
npm run sim        # play a full game headless
```

`sim/` boots the real `RogueGame` — same generators, same AI, same turn loop —
and drives it through `AdvancePlay`, printing a metrics summary. A pinned seed
makes runs byte-reproducible, which is what the reproducibility test checks.

This is not a convenience. A clean `tsc` and a clean build do **not** mean the
port works: the first headless run found nine runtime bugs, two of them fatal,
and none of them visible to the type-checker. A later audit of the CSV → JSON
data layer found eighteen more, none of which the sim could see either.
`BROWSER_PORT_PLAN.md` has the full list. If you change engine code, run the sim.

The suite covers the primitives, save/load, asset resolution, the input
contract, actor sprite mapping, map view/visited flags, the minimap cache
invalidation rules, and the data tables — each pinned against a specific bug
that shipped past a green build. The last two are worth calling out:
`data-tables.test.ts` checks every generated JSON against its source CSV, so
editing a CSV without regenerating the JSON fails the build rather than quietly
shipping stale balance numbers, and `skills-data.test.ts` checks that
`Skills.csv` actually reaches the `Rules.SKILL_*` constants.

---

## Changes from the C# original

Everything here is a deliberate divergence, not a port that drifted. Each one is
either something the original platform could not do, or a QOL decision where the
original's answer is defensible but annoying. Nothing below changes game rules,
balance, or the data tables — the C# in `src/` remains the reference for those,
and the sim (`npm run sim`) is what proves a change here did not alter outcomes.

### New options on the options screen

Three of them, all marked `// browser port` in `engine/GameOptions.ts` against
the C# `GameOptions.IDs` list, which has no equivalent:

| Option | Choices | Notes |
|---|---|---|
| **Sprite style** | Classic, Deonapocalypse v9 r1, Genesis Classic 1.4 | Swaps the whole art set from `assets/images/`. Classic is the original. |
| **Font** | JetBrains Mono (default), Iosevka Term Slab, Hack, IBM Plex Mono, Classic (system) | Four families vendored and subset to the glyphs the game can draw. See `src/ui/fonts.ts` for why they are bundled and subset. |
| **View mode** | Top-down, First-person | A raycast renderer over the same map and rules. |

The font option is the one most likely to surprise: every family is 0.6 em
monospace, chosen so the fixed-advance layout maths (`MENU_CHAR_WIDTH`) stays
correct whichever is selected. Only the glyph shapes change.

### Mouse

The original had a mouse, but it mostly only looked at things with it. The port
keeps every existing mouse behaviour and adds:

- **Break mode** — hover outlines the targeted tile green when the object can be
  broken and red when it holds something you may not; a left click breaks it.
  Empty floor gets no outline. The eight-direction keyboard path is unchanged.
- **Barricade mode** — the same, for doors and fortifications.
- **Double click** on an item picks it up; on a container, takes its top item.
  Goes through the same `ActionTakeItem` / `ActionGetFromContainer` that bumping
  uses, so it cannot reach further than a bump could.
- **The right-click menu is suppressed.** It opened over the canvas on every
  press, with "Save image as…" on it — the page is one canvas, so anything
  painted in one is a saveable image to the browser. An RMB drag was also leaving
  a text selection across the game.
- **The options screen** takes the mouse: click a row to select, click again to
  change, wheel to move the selection.

### Gameplay feel

- **Bumping never destroys anything.** The original stops on every bump into a
  breakable and asks *"Really break <thing>? — Y/N"*, because a bump is also the
  move key: walking into a wall to edge up to a window was one keystroke from
  destroying it. Now bumping only moves, or reports the blocked move and names
  the break key. `BREAK_MODE` (K) is unchanged and still a direction-pick, so
  the deliberate act still needs a mode and a direction.
- **Melee attacks lunge.** The attacker's sprite moves a quarter of a tile toward
  the target and back, over four whole-pixel frames. Render-only: the map
  position is never touched, so no rule, LOS check or save can observe it.
  Disabled with the existing "animation delays" option.
- **Menu text has no drop shadow.** The original drew every string twice, once in
  a half-intensity colour at +1/+1. Faithful, and on a canvas that scales
  fractionally the grey fringe compounds with the resample of an already
  antialiased glyph edge. The shadow argument is still supported, so this is
  reversible per call site.
- **Map zoom** (`=` / `-`) and **look left/right** exist only in the port; the C#
  `PlayerCommand` has no such members. Both are appended to the enum rather than
  inserted, so stored keybindings keep their meaning.

### Platform

- **1366×768 (16:9)** instead of the C# 1024×768 (4:3). The extra width goes to
  the map: 31 tiles across instead of 21. See [Display](#display).
- **Desktop build.** `npm run build:release` produces zipped per-platform
  archives — Windows, Linux, macOS — via Neutralino. See `scripts/build-release.mjs`.
- **Offline play** in the browser, via a service worker. Deliberately *not*
  shipped in the desktop archives; the reasoning is in that script's header.
- **Death screenshots default to off**, because a silent file write in C# is a
  download prompt on every death in a browser. The option is still there.

---

## Known issues

- **`tests/integration/reproducibility.test.ts` fails on Windows** with
  `spawnSync npx ENOENT`. `execFileSync` cannot spawn `npx.ps1`. Pre-existing
  and unrelated to engine behaviour; the rest of the suite (409 tests) passes.
- Death screenshots default to **off**. C# defaults them on, but there it is a
  silent file write while in a browser it is a download prompt on every death.
  The option is still on the options screen.
- Touch support (Phase 8 task 12) is not implemented; the game is keyboard and
  mouse only.

---

## Porting notes

`BROWSER_PORT_PLAN.md` is the working document: phase status, per-slice
breakdown, and a log of every runtime bug found by the simulator. Worth reading
before touching engine code — several entries describe failures that a
type-checker is structurally unable to catch.

The C# in `src/` is treated as read-only reference. If behaviour is wrong,
compare against it before "fixing" the port.

---

## Website

[`docs/`](docs/) is a static site — landing page, the complete game manual, the
control reference, and notes on how the port works. It is the GitHub Pages
source, using the plain "deploy from a branch" setup: set **Pages → Source →
Deploy from a branch**, branch `master`, folder `/docs`. No workflow and no
build step are involved.

```bash
node docs/tools/check-site.mjs      # validate links, assets, tags, CSS coverage
node docs/tools/build-manual.mjs    # regenerate manual.html from the source text
```

`docs/manual.html` is generated from `src/Resources/Manual/RS Manual.txt` — the
original manual by the game's author, reformatted and not rewritten. See
[`docs/README.md`](docs/README.md) for the conventions.

---

## Licence

GPLv3, inherited from the original project — see [`LICENSE.txt`](LICENSE.txt).

The original game and source are by Jacques Ruiz (roguedjack). This repository
is a port of that work and is covered by the same license.