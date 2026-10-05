# Rogue Survivor: Reloaded

TypeScript port of the original C# game, playable in a browser.

**See the [root README](../README.md) for basic info on the project and for how to
contribute. This file covers setup, architecture, and project overview.**

## Running it

Requires Node 20.19+ (or 22.12+) — Vite 7's floor.

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
the game keeps working with no connection after the first visit. Its
`CACHE_VERSION` namespaces those caches and is what evicts the previous build.

You do not bump it by hand. `scripts/stamp-cache-version.mjs` runs after
`npm run build` and rewrites that line in `dist/` to a hash of the built files, so
the version changes exactly when the cached content does. A commit that touches no
cached content leaves returning players' caches intact, which is the point: the
assets handler is cache-first with no revalidation, so an eager manual bump costs
every returning player a re-download of the shell plus every sprite and track they
had cached. The committed value in `sw.js` is the fallback for local builds and for
any build that skips the script.

---

## Scripts

All run from `web/`.

| Script                     | What it does                                              |
|----------------------------|-----------------------------------------------------------|
| `npm run dev`              | Vite dev server, hot reload                                 |
| `npm run preview`          | Vite's own preview of `dist/`                              |
| `npm run build`            | Type-check then bundle to `dist/`                           |
| `npm run build:server`     | Compile the Express server to `dist-server/`                |
| `npm run build:all`        | Both of the above                                           |
| `npm run build:desktop`    | Bundle + Neutralino clients for every platform -> `dist/RogueSurvivorReloaded/` |
| `npm run build:release`    | `neu update`, then `build:desktop`, then regroup into `dist-release/RogueSurvivorReloaded-{windows,linux,macos}/` and zip each |
| `npm run serve`            | Run the built server                                        |
| `npm run type-check`       | `tsc --noEmit`                                              |
| `npm test`                 | Vitest suite                                                |
| `npm run test:watch`       | Vitest in watch mode                                       |
| `npm run test:slow`        | The `--mode slow` tests, which are excluded from `npm test`  |
| `npm run test:coverage`    | Vitest with V8 coverage                                     |
| `npm run test:coverage:serial` | Coverage without file parallelism, for a readable table  |
| `npm run verify`           | type-check + coverage + build (the full gate)               |
| `npm run check:base`       | Fail if the built output has a root-absolute URL. Only meaningful with `BASE_PATH` set |
| `npm run build:site`       | Assemble `_site/`: `docs/` at the root, the game in `game/` |
| `npm run build:pages`      | `build` + stamp the cache version + `build:site`, i.e. the whole Pages build |
| `npm run preview:site`     | Serve `_site/` under the Pages path prefix, for the browser check |
| `npm run sim`              | Headless simulation — plays a full game in Node, no browser |
| `npm run profile`          | Headless draw-call profiler                                 |
| `npm run neu:dev`          | Run the Neutralino desktop client against `dist/`          |

---

## Layout

The repository root holds `web/` (the port), `docs/` (the website source), `plans/`
(design docs), and `Dockerfile` / `LICENSE.txt`. This is `web/`:

```
.
├── index.html        Entry page; owns the 1366x768 canvas
├── base-path.ts      The deployment base; read by vite + vitest config
├── neutralino.config.json   Desktop wrapper config
├── public/
│   ├── assets/       Sprites (.webp), music, sfx, ambient beds, manual.txt
│   ├── fonts/        The four bundled font families, subset to woff2
│   ├── js/           neutralino.js (desktop only)
│   ├── manifest.webmanifest, icon*.png
│   └── sw.js         Service worker
├── scripts/
│   ├── stamp-cache-version.mjs  Derive the worker's cache version
│   ├── check-base.mjs           Fail on a root-absolute URL in dist/
│   ├── build-site.mjs           Assemble _site/ for GitHub Pages
│   ├── preview-site.mjs         Serve _site/ under the Pages prefix
│   ├── build-release.mjs        Package the three desktop archives
│   ├── gen-feature-flag-sites.mjs  Rescan the hasFeature call sites for the test
│   ├── measure-*.mjs            Audio levels, RogueGame size
│   └── *.py, convert-csv.js     Sprite/content merge and codegen (one-off)
├── server/           Express production server (local prod testing only)
├── sim/              Headless simulator CLI + profiler
├── src/
│   ├── main.ts       Browser entry point
│   ├── data/         Actor, ActorModel, Doll, Item, ItemModel, Tile, Map, World, …
│   ├── engine/       Rules, LOS, RogueGame, Session, FeatureFlags, actions,
│   │                 audio, items, map objects, save/load, UI contract
│   │                 ├── BaseUrl.ts   The base every asset and font URL is built from
│   │                 └── firstperson/ The first-person renderer
│   ├── gameplay/     Game data tables (JSON), AI controllers, map generators
│   ├── sim/          HeadlessRunner
│   └── ui/           IRogueUI implementations (Canvas, Null, Options)
├── tests/            150 Vitest files, including tests/integration/
└── dist/ dist-server/ dist-release/ _site/   (gitignored build output)
```

**The C# is not in this repository.** It was removed in `cfd19ae`; the reference
sources are gitignored under `_refs/` at the repo root, so each contributor has to
fetch them. `_refs/StillAlive-master/` is the GPLv3 *Still Alive* fork, which is
where the second ruleset comes from. See [Porting notes](#porting-notes).

---

## How the port is organised

The original C# draws straight to a GDI surface, blocks on WinForms message
loops, and reads `Keys.D0`-style key codes. None of that survives a browser, so
the port replaces that layer and leaves the rules alone:

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

### Rulesets and game modes

Two orthogonal axes, both chosen before the first character is generated:

- **`Session.Ruleset`** — which content and mechanics set a run uses:
  `CLASSIC` (the Alpha 10.1 original, as the port has always been) or
  `STILL_ALIVE` (the GPLv3 fork in `_refs/`, ported as a superset: its content is
  in the model tables either way and the ruleset decides what spawns, what
  generates and what runs).
- **`Session.GameMode`** — the C#'s own axis: standard, corpses infection, vintage.

They compose, so "C&I zombies inside a Still Alive district" is expressible, which
is why `Ruleset` is not a fourth `GameMode` member and why `Rules.has*` stays a
`GameMode` layer that answers its questions independently.

Each Still Alive behaviour is declared once as a `Feature` in
`engine/FeatureFlags.ts` and read through `hasFeature(Session.get().ruleset, …)`.
That registry is the point: a bare `if (ruleset === STILL_ALIVE)` at each of the
~100 sites that need it is invisible, so "how much of the fork has leaked into the
engine" would be a judgement call somebody has to make by reading `RogueGame.ts`.
`tests/feature-flags.test.ts` turns it into a number, and reports a feature listed
here with no reader anywhere rather than hiding it. **New mechanics go here, on the
ruleset axis** — see the root README's contributing rules.

---

## Assets

Sprites are **lossless WebP** (VP8L), almost all of them 32×32: **3,300 files**
across five folder-backed styles (`classic` 1,108, `civ13` 1,114,
`deonapocalypse_v9_r1` 401, `dafttiles_b1` 340, `genesis_classic_1.4` 337) plus a
routing-only set that borrows Genesis actor sprites from Deonapocalypse. Also 185
`.ogg` sound effects, 28 music tracks, 13 ambient beds and a copy of the manual —
about 61 MB in `public/assets`, of which 27 MB is music.

```
web/public/assets/images/<set>/<Category>/<name>.webp
web/public/assets/music/RS - <Title>.ogg
web/public/assets/sfx/<name>.ogg
web/public/assets/ambients/<name>.ogg
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
- The extra width goes to the map: 27 tiles across instead of 21. Height, the
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
npm run verify     # type-check + the suite + build
npm run sim        # play a full game headless
```

Roughly 3,100 tests across 150 files, plus two slow-mode files that
`npm test` excludes and `npm run test:slow` runs.

`sim/` boots the real `RogueGame` — same generators, same AI, same turn loop —
and drives it through `AdvancePlay`, printing a metrics summary. A pinned seed
makes runs byte-reproducible, which is what the reproducibility test checks.

This is not a convenience. A clean `tsc` and a clean build do **not** mean the
port works: the first headless run found nine runtime bugs, two of them fatal,
and none of them visible to the type-checker. A later audit of the CSV → JSON
data layer found eighteen more, none of which the sim could see either.
`plans/BROWSER_PORT_PLAN.md` has the full list. If you change engine code, run the sim.

The suite covers the primitives, save/load, asset resolution, the input
contract, actor sprite mapping, map view/visited flags, the minimap cache
invalidation rules, the data tables and the Still Alive feature registry — each
pinned against a specific bug that shipped past a green build. Two are worth
calling out: `data-tables.test.ts` checks every generated JSON against its source
CSV, so editing a CSV without regenerating the JSON fails the build rather than
quietly shipping stale balance numbers, and `skills-data.test.ts` checks that
`Skills.csv` actually reaches the `Rules.SKILL_*` constants.

---

## Changes from the C# original

Everything here is a deliberate divergence, not a port that drifted. Each one is
either something the original platform could not do, or a QOL decision where the
original's answer is defensible but annoying. Nothing below changes game rules,
balance, or the data tables — the C# remains the reference for those, and the sim
(`npm run sim`) is what proves a change here did not alter outcomes. Still Alive
is the one deliberate content addition, and it is confined to its own ruleset
behind the `Feature` registry.

### New options on the options screen

Five of them, all marked `// browser port` in `engine/GameOptions.ts` against
the C# `GameOptions.IDs` list, which has no equivalent:

| Option | Choices | Notes |
|---|---|---|
| **Sprite style** | classic, deonapocalypse v9 r1, genesis classic 1.4, dafttiles b1, civ13, plus "Genesis actors, Deonapocalypse world" | Swaps the whole art set from `assets/images/`. `classic` is the original and the only complete set. |
| **Font** | JetBrains Mono (default), Iosevka Slab, Hack, IBM Plex Mono, Classic (system) | Four families vendored and subset to the glyphs the game can draw. See `src/ui/fonts.ts` for why they are bundled and subset, and for the advance width the menu layout depends on. |
| **View mode** | Top-down, First-person | A raycast renderer over the same map and rules; anything but top-down is labelled experimental. |
| **Speech bubbles** | Off (default), On | Draws what an actor last said in a bubble over their tile, so a line can be attributed to a person instead of scrolled past. Nothing is lost with it off — every line still reaches the message log. |
| **Idle auto-advance** | Off (default), 1s, 2s, 5s, 10s, 30s | Takes a turn for you when you do nothing. Stops the moment you press anything, and never fires while a targeting mode is open. |

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
  breakable and asks *"Really break &lt;thing&gt;? — Y/N"*, because a bump is also
  the move key: walking into a wall to edge up to a window was one keystroke from
  destroying it. Now bumping only moves, or reports the blocked move and names
  the break key. `BREAK_MODE` (K) is unchanged and still a direction-pick, so
  the deliberate act still needs a mode and a direction.
- **An action menu on `Tab`.** A modal grid of the common play actions (wait,
  sleep, barricade, fortify, close door, eat corpse, give item, revive, …), drawn
  over the minimap, clickable or arrow-keyed. It returns a `PlayerCommand` into the
  play loop rather than calling handlers itself, so a click cannot reach further
  than the keybinding could.
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
  the map: 27 tiles across instead of 21. See [Display](#display).
- **Desktop build.** `npm run build:release` produces zipped per-platform
  archives — Windows, Linux, macOS — via Neutralino. See `scripts/build-release.mjs`.
  It runs `neu update` first, which is a prerequisite rather than a nicety:
  `web/bin/` is gitignored, and `neu build` given an empty one logs
  "Copying binaries...", copies nothing, and **exits 0** with a
  `resources.neu` and no executables. The script therefore downloads the
  clients itself and then asserts they are there, so the failure names the
  cause instead of surfacing later as a missing `RogueSurvivorReloaded-win_x64.exe`.
  It needs network access on the first run of a given machine.
- **Releases are cut from GitHub Actions, by hand.** `.github/workflows/release.yml`
  is `workflow_dispatch`-only. It builds the three archives and attaches them to
  a tag; `dry_run` defaults to on, so the first run of it costs nothing but
  build minutes. See [Releasing](#releasing).
- **Offline play** in the browser, via a service worker. Deliberately *not*
  shipped in the desktop archives; the reasoning is in that script's header.
- **Death screenshots default to off**, because a silent file write in C# is a
  download prompt on every death in a browser. The option is still there.

---

## Known issues

- Touch support is not implemented; the game is keyboard and mouse only.
- First-person view is experimental: a raycast approximation over the 2D map, not
  a 3D rebuild of the game.
- *Still Alive* still has a short list of unported details — `MakeMechanicWorkshop`,
  the `BOWS` → `BOWS_EXPLOSIVES` rename, some blast-path sounds. The "Genuinely
  still open" block in `plans/STILL_ALIVE_JOURNAL.md` is the list; that file is a
  diary and is allowed to be behind, so re-grep before trusting it.

---

## Porting notes

`plans/BROWSER_PORT_PLAN.md` is the working document: the open backlog (§1.5), the
porting rules (§2), the do-not-repeat list (§1.6), and the `RogueGame.ts`
decomposition (§6, not started). Read §1.5 before picking up work.

The rest of `plans/` is context rather than instructions:
[`STILL_ALIVE_JOURNAL.md`](../plans/STILL_ALIVE_JOURNAL.md) is the primary record
of how the GPLv3 fork's content was merged and what nearly went wrong,
[`MULTIPLAYER_PLAN.md`](../plans/MULTIPLAYER_PLAN.md)
is a networked-play design, and
[`SUGGESTIONS.md`](../plans/SUGGESTIONS.md) is the 2010–11 fan-forum backlog with
a per-item measure of what already shipped.

**The C# reference is not in the repository** — it was deleted in `cfd19ae`, and
`_refs/` is gitignored. Fetch what you need to compare against into `_refs/`
yourself; `_refs/StillAlive-master/` is the GPLv3 fork the second ruleset comes
from. Where behaviour is wrong, compare against the C# before "fixing" the port.

---

## Website

[`docs/`](../docs/) is a static site — landing page, the complete game manual,
the control reference, a field guide, and notes on how the port works. It is the
**landing page of the published site**, at the root, and the game is one click
below it at `/game/`.

The game is the half that cannot move. `engine/BaseUrl.ts` supplies the base
that `AssetPaths.ts`, `GameSounds.ts` and `ui/fonts.ts` build every asset and
font URL from, and it is a build-time constant — so the game works at a domain
root or in a subdirectory, whichever it was built for, and which one is a
deployment decision rather than a code one. The docs site has no such
constraint: every link in it is relative (`manual.html`, `assets/css/site.css`,
`../fonts/`), so it works unchanged in any directory. That is the whole
asymmetry, and it is why the root belongs to the website.

```bash
node docs/tools/check-site.mjs      # validate links, assets, tags, CSS coverage
node docs/tools/build-manual.mjs    # regenerate manual.html from the source text
```

`docs/manual.html` is generated from the original manual text by the game's
author, reformatted and not rewritten; a copy ships inside the game at
`web/public/assets/manual.txt`, which is what a player reads offline. The
generator reads `src/Resources/Manual/RS Manual.txt` out of the original C# tree,
which is not in this repository, so it only runs for someone who has restored that
reference. See [`docs/README.md`](../docs/README.md) for the conventions. Editing
`manual.html` by hand does not survive the next regeneration: the generator emits
the whole file, so a hand-made nav link vanishes on the next `build-manual.mjs`
run.

---

## Deploying

[`../.github/workflows/pages.yml`](../.github/workflows/pages.yml) publishes the
site to GitHub Pages on a push to **`master`** (with a path filter), or on a manual
dispatch. `master` is the stable line; work on `dev` and on pull requests is
validated by `ci.yml`, which builds under a subdirectory base, runs `check:base`
and assembles and checks the site — but never publishes, because this workflow's
environment is the live `github-pages` one. It is a static site with no server
process anywhere in the path: the port has no API, no database and no uploads, so
anything serving it would do nothing but hand back files.

Pages cannot build anything — it serves a directory as it is given one — so the
workflow builds and hands Pages an artifact, and **Settings → Pages → Source has
to be "GitHub Actions"** rather than "Deploy from a branch". Locally, the same
three steps are one command:

```bash
BASE_PATH=/Rogue-Survivor-Reloaded/game/ npm run build:pages
```

which is `build` → `stamp-cache-version.mjs` → `build-site.mjs`, and assembles
`_site/` with `docs/` at the root and the game in `game/`. The base comes from
`actions/configure-pages`'s `base_path` output rather than being written down, so
renaming the repository moves the base with it.

**The base path is the part that is easy to get wrong, and the failure is
silent.** A hardcoded `/assets` under a subdirectory does not fail a test — it
ships a black screen, because the port preloads every sprite before the first
frame and cannot draw one it has not fetched. So two things guard it, both run in
CI:

- `npm run check:base` greps the *built output* for a root-absolute URL. The
  test suite cannot do this: its asset assertions resolve against `public/` on
  disk and never build a URL a browser would request. The check only has teeth
  for a subpath build, since at base `/` a root-absolute URL is correct by
  definition — so CI re-runs the suite with `BASE_PATH` set.
- The suite itself runs under a subpath base as well as the default one, which
  catches a base-agnostic path that got hardcoded in one module. `vitest.config.mts`
  imports the value from `base-path.ts` rather than repeating it, because
  Vitest does not inherit the Vite config: set it in one file only and the tests
  pass against a base production does not use.

`stamp-cache-version.mjs` still runs, and still matters — see *Offline play*
above. `scripts/build-site.mjs` refuses to assemble a site whose service worker
carries the committed `CACHE_VERSION`, because that deploy looks fine and leaves
every returning player on the previous build.

**Do the browser check before merging**, because it is the one thing none of the
above can do. Every check here is static analysis of the built artifact, and a
wrong base is a black screen rather than an error. `npm run preview:site` serves
`_site/` under the Pages path prefix — not at `/`, which would serve the game a
404 for every asset and look like the very bug being tested — so the URLs the
built page asks for are the ones the server answers:

```bash
BASE_PATH=/Rogue-Survivor-Reloaded/game/ npm run build:pages
npm run preview:site      # then open the printed game URL
```

`--base /` serves at the root if you built a root-base bundle, and `--open` just
prints the URLs. One trap: the worker caches assets cache-first, so a browser
that already loaded this origin can keep showing an earlier build until the
worker updates, which it does on navigation and at most daily. A private window
or a different port avoids that entirely.

`sw.js` and `manifest.webmanifest` resolve their paths against their own URL
rather than being templated. Vite copies `public/` to the output untransformed,
so neither can read the build's base, and the alternative — having something
substitute into them — is a second place for the base to be wrong. The result is
that the same built site works at a domain root, under a Pages subdirectory, and
from a local file server.

The root `Dockerfile` and `web/server/` are not part of this path. Both still
work, CI still builds and smoke-tests the image, and `npm run serve` is still the
local way to check a production build.

---

## Releasing

Desktop archives are published by
[`.github/workflows/release.yml`](../.github/workflows/release.yml), which is
**`workflow_dispatch`-only** and refuses to run anywhere but `master`. Nothing
runs on push, because a tag, a set of attached archives, and a version bump in
`package.json` are all things you would rather create deliberately.

Go to **Actions → Release → Run workflow**. The inputs:

| Input | Default | |
|---|---|---|
| `tag` | blank | Blank uses `v<version>` from `web/package.json`. A custom tag warns if the archives are named for a different version. |
| `notes` | blank | Blank auto-generates a table of the three archives with sizes and SHA-256s. |
| `draft` | off | Create as a draft for a human to publish. |
| `prerelease` | off | Mark as a pre-release rather than latest. |
| `dry_run` | **on** | Build and check the archives, publish nothing. Turn this off to actually release. |
| `allow_off_default_branch` | off | The build refuses to run anywhere but `master`, since a tag is just a pointer and would otherwise faithfully publish whatever was dispatched. |

Two jobs, and the split is deliberate: **build** runs `npm ci` and the whole
Vite + Neutralino build holding a read-only token, and **publish** holds
`contents: write` and does nothing but attach the artifact it was handed. So a
build that goes wrong cannot push a tag as a side effect, and the bytes that get
published are the ones that were built rather than the ones the publishing step
produced.

Re-running for a tag that already exists **replaces the archives** rather than
failing, which is the only sane behaviour when the only thing that changed
between two runs is the build.

There is no separate test step: `npm run build:release` runs `npm run build`,
which is `tsc -p tsconfig.json` over an include list that contains `tests/`. The
release build therefore already fails on a compile error anywhere in the test
suite. Behavioural coverage is CI's job.

---

## Licence

GPLv3, inherited from the original project — see [`LICENSE.txt`](../LICENSE.txt).

The original game and source are by Jacques Ruiz (roguedjack), as is the *Still
Alive* fork. This repository is a port of that work and is covered by the same
license.
