# Rogue Survivor Reloaded — Browser Port

A browser-playable TypeScript port of **Rogue Survivor** by
[Jacques Ruiz (roguedjack)](http://roguesurvivor.blogspot.com/), whose original
2012 C#/Windows Forms source is preserved in [`src/`](src/) and used as the
reference for every line of the port.

The game is a turn-based, real-time survival roguelike: you play a survivor
(or an undead) in a procedurally generated city, scavenging while the district
behind you floods with the dead. Survive the nights.

**Website** — the manual, controls and project notes live in
[`docs/`](docs/), published with GitHub Pages. See [`docs/README.md`](docs/README.md)
for how to enable it.

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

---

## Contents

- [Running it](#running-it)
- [Scripts](#scripts)
- [Layout](#layout)
- [How the port is organised](#how-the-port-is-organised)
- [Assets](#assets)
- [Display](#display)
- [Testing and the headless simulator](#testing-and-the-headless-simulator)
- [Known issues](#known-issues)
- [Porting notes](#porting-notes)
- [Website](#website)
- [License](#license)

---

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
npm run verify     # type-check + 303 tests + build
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

## Known issues

- **`tests/integration/reproducibility.test.ts` fails on Windows** with
  `spawnSync npx ENOENT`. `execFileSync` cannot spawn `npx.ps1`. Pre-existing
  and unrelated to engine behaviour; the rest of the suite (303 tests) passes.
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

## License

GPLv3, inherited from the original project — see [`LICENSE.txt`](LICENSE.txt).

The original game and source are by Jacques Ruiz (roguedjack). This repository
is a port of that work and is covered by the same license.
