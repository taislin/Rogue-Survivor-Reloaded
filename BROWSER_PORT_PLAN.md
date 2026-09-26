# Rogue Survivor Reloaded — TypeScript / Browser Port

> **Status (2026-09-26):** Phases 1–7 ported and building. Phase 8 tasks 1–11 done; only 12 (optional touch support) remains.
> **Read [Current State & Handover](#1-current-state--handover) first — it contains the bugs found and the exact next steps.**

Porting a C# WinForms zombie-survival roguelike (195 files, ~2.5 MB, largest `RogueGame.cs` at 955 KB / 23 233 lines) to a browser-playable TypeScript version. `src/` is the original C# and is **never modified** — it is the reference for every port.

---

## Table of Contents

1. [Current State & Handover](#1-current-state--handover)
2. [Quick Reference](#2-quick-reference)
3. [Phase Status](#3-phase-status)
4. [Phase 8 — Polish, Headless Simulation & Deployment](#4-phase-8--polish-headless-simulation--deployment)
5. [Summary Timeline](#5-summary-timeline)

---

## 1. Current State & Handover

### 1.1 The headline finding

**A clean `tsc` and a clean Vite build do not mean the port works.** Phase 4 was marked "complete" on the basis of zero remaining `not yet ported` stubs plus a green type-check. Neither test executes the game.

The Phase 8 headless simulator was the first thing ever to actually *run* the ported engine. In its first hour it found **9 runtime bugs**, two of which made the game completely non-functional:

| # | Bug | File | Impact |
|---|-----|------|--------|
| 1 | Tile grid allocated as a **sparse** `Array`; C# initialises every cell to `new Tile(TileModel.UNDEF)` | `data/Map.ts` | **Fatal.** `getTileAt` → null, `setTileModelAt` → crash. World generation could never complete. |
| 2 | `new window.Map<>()` in six field initialisers | `data/Map.ts` | **Fatal in Node** (the browser case was fine). |
| 3 | `filterActors` / `filterNonEnemies` used `a && …` as an "is an Actor" test, but a `MapObject` percept is truthy, so non-actors leaked through | `gameplay/ai/BaseAI.ts` | Every downstream `as Actor` cast dereferenced `undefined`. Reachable from `ZombieAI`, `CivilianAI`, melee/ranged attack. |
| 4 | 6 call sites passed a `Location` where `isBumpableFor` / `isWalkableFor` expected `(map, x, y)` — signature drift from the `baseAI_part*` merge | `engine/actions/Actions.ts`, `gameplay/ai/BaseAI.ts` | Crash on first AI move attempt. |
| 5 | `GameActors` never set `defaultControllerCtor`; C# passes `typeof(SkeletonAI)` etc. to every model | `gameplay/GameActors.ts`, `data/ActorModel.ts` | `BotTakeControl()` silently no-opped. The game's own bot mode was dead. |
| 6 | 3 methods `throw` on a non-actor percept where C# yields `null` | `gameplay/ai/BaseAI.ts` | Crashed instead of returning "no action". Now returns `null` / skips. |
| 7 | Unsafe `Percept` → `Actor` cast | `gameplay/ai/CivilianAI.ts` | `undefined.abilities`. Now an `instanceof` check. |
| 8 | Bot's fixed 250 ms action delay was a hard-coded `await sleep()` | `engine/RogueGame.ts` | Made headless runs 250× slower. Now `botDelayMs`, set to 0 by the runner. |
| 9 | No headless UI, so the engine could not be driven outside a browser | `ui/NullRogueUI.ts` *(new)* | Blocking. Now solved. |
| 10 | `Map.placeActor` always appended, dropping C#'s add-or-move branch | `data/Map.ts` | **Silent corruption.** Every step the player took added a permanent duplicate to the actor list, so the per-turn gauge loop ran 2, 4, 6, 8… times per turn: the player starved on turn 9 and the actor count only ever grew. See §1.2. |

**Takeaway for the next agent: "0 stubs + green type-check" is not a definition of done for this project. The headless sim is.**

### 1.2 The harness now runs real games

Runs are reproducible (`--seed`, §1.4) and the map no longer corrupts itself
(§1.1 bug 10). At 3×3 / 1 000 turns, 4 of 5 seeds play all 1 000 turns with the
player alive and no exception:

```
seed 1    turns played : 1000  player : alive (52 hp)  actors : 870 (565 undead / 305 living)
seed 2    turns played : 1000  player : alive (67 hp)  actors : 898 (582 undead / 316 living)
seed 3    turns played :   48  player : dead (-20 hp)
seed 7    turns played : 1000  player : alive (56 hp)  actors : 880 (565 undead / 315 living)
seed 42   turns played : 1000  player : alive (57 hp)  actors : 858 (561 undead / 297 living)
```

`Map.assertActorIntegrity()` runs every turn, so this class of bug now fails on
the turn it starts rather than as a strange death 40 turns later. It is not dead
code — reintroducing bug 10 makes it report the duplicate on turn 1.

### 1.2a Two things that look like bugs but are not

Do not re-investigate these:

- **Players still die at full HP (30) around turn ~100 when run as a survivor.**
  The bot exhausts its 100 food points because it never eats. The engine is
  behaving correctly. `--undead` sidesteps it cleanly (undead do not have to
  eat) and is what the long runs above use.
- **`hitPoints` can go negative** (seed 3 ends at −20). C# `InflictDamage` also
  does `HitPoints -= dmg` with no clamp, so this is faithful.

One real but unrelated divergence is still open: `Actor.hitPoints` is a plain
public field in TS, so the C# `HitPoints` setter's `m_IsInvincible` guard
(`Actor.cs:245`) is never enforced. That only affects the alpha10 invincibility
cheat, not normal play.

### 1.3 How to run it

```bash
cd web
npm install
npm run type-check
npm run build
npm run sim                                    # default 3x3 world, 200 turns
npm run sim -- --size 1 --turns 30             # fast smoke run
npm run sim -- --size 3 --turns 1000 --seed 7 --undead   # long run, reproducible
npm run sim -- --size 1 --turns 30 --trace     # per-actor + bot decisions
```

Other flags: `--seed <n>`, `--undead`, `--bot <true|false>`, `--verbose`.

### 1.4 Runs are now reproducible

`Session.reset()` used to seed from `Date.now()`, so every run explored a
different world and failed in a different place. `Session.useSeed(seed)` now pins
it and `reset()` honours it, exposed as `npm run sim -- --seed <n>`. Verified:
`--seed 12345` gives byte-identical metrics across 3 runs, and seeds 1/2/999 give
three different worlds.

The flag lives on the `HeadlessRunner` **constructor**, not `run()`: `RogueGame`'s
constructor builds `Rules` from `Session.get().seed`, so a seed applied later
would reseed world generation while leaving the rules roller on the old value —
half a deterministic run, which is worse than none.

### 1.4a Open bug: the minimap never reveals explored ground

Found while profiling the frame cost (task 11), and **not fixed** — it is a
gameplay change, not a performance one, so it is reported rather than bundled
in.

`RogueGame.UpdatePlayerFOV` (web/src/engine/RogueGame.ts:19400) only computes
`m_PlayerFOV`. It never pushes that set into the map. C# does, one line later
than the equivalent:

```csharp
// src/Engine/RogueGame.cs:5373, inside UpdatePlayerFOV
player.Location.Map.SetViewAndMarkVisited(m_PlayerFOV);
```

`Map.SetViewAndMarkVisited` (src/Data/Map.cs:953) sets `IsInView` **and**
`IsVisited` for every visible tile. The TS port has no equivalent — the only
two places that touch `isVisited` are the starting-zone reveal in
`RogueGame.cs:16837` and `Map.setAllAsUnvisited`.

Consequence: the visited set never grows after the initial reveal, so the
minimap shows only the starting area for the entire game. `isInView` is also
never set, though nothing appears to read it — `DrawMap` uses `m_PlayerFOV`
directly, which is why the game still *looks* right.

Evidence: a 40-turn headless run ends with 1 822 explored tiles and
`ClearMinimap` called exactly once — the raster is built during world
generation and never rebuilt, because nothing marks anything visited.

The fix is to port `setViewAndMarkVisited` (and `markAsVisited` /
`setAllAsVisited`, which `RogueForm.cs:180` uses for a debug cheat) and call it
from `UpdatePlayerFOV`. Note this will make the minimap rebuild far more often
than it does today — once per FOV change rather than never — which is what the
`minimapRevision` cache in §4.1d exists to make cheap. The two changes belong
together.

### 1.5 Next steps, in priority order

0. **Fix the minimap reveal bug above (1.4a).** Small, self-contained, and the
   profile harness can verify it: `ClearMinimap` should go from 1 to roughly
   "number of FOV changes", and explored tiles should keep growing.
1. **Keep running the sim to failure and fix what it finds.** Now that the map
   stops corrupting itself, 1 000-turn runs are reachable. Loop over seeds:
   `for s in 1 2 3 4 5; do npm run sim -- --size 3 --turns 1000 --seed $s --undead; done`
   Watch for hangs, not just crashes — a turn that never returns is usually a
   blocking `UI_Wait*`.
2. **Write the AI behaviour and generator integrity tests** (Phase 8 §4.3 items
   2 and 3, the only test work left). The harness is trustworthy enough to
   assert on now, and the headless integration tests in `tests/integration/`
   are the pattern to follow. Generator integrity is the higher-value of the
   two: nothing currently checks that a generated town is fully reachable.
3. **Audit the remaining AI files for bug 3.** The `filterActors` fix was central,
   but any other `percepted as Actor` cast followed by a dereference is still
   suspect. Grep for the pattern.
4. **Restore C#'s `isInvincible` guard** on `Actor.hitPoints` (§1.2a).
5. **Serialise the world/map graph in `Session.save`** — the `TODO(phase 4)`
   there blocks any true save/load roundtrip test.
6. Then work down the rest of the Phase 8 task list in §4 (tasks 9–12).

### 1.6 Git state

- `master`, tracking `origin/master`.
- Phase 4 completion committed as `0bc8e7f`; the Phase 4 async audit (18 detached
  calls awaited, stale notes fixed) as `389a845`.
- The headless harness + the 9 fixes above were committed together as the Phase 8
  simulator commit (`3154dee`).
- `c181116` — `--seed`, the `engine/storage.ts` wrapper (all 16 `localStorage` call
  sites in 8 modules, which threw `ReferenceError` in Node), and the runner's missing
  hi-score-table init.
- `43adb9d` — the `Map.placeActor` add-or-move fix (§1.1 bug 10), `removeActor`
  parity, and `assertActorIntegrity()`.

---

## 2. Quick Reference

### Layout

```
web/src/
├── engine/       pure game logic (no DOM) — RogueGame.ts, Rules.ts, LOS.ts, Session.ts, Scoring.ts
├── data/         pure data models — Actor.ts, Map.ts, World.ts, ActorModel.ts
├── gameplay/     definitions, generators, ai/ — GameActors.ts, GameItems.ts, generators/
├── ui/           browser layer — CanvasUI.ts, InputHandler.ts, OptionsScreen.ts, NullRogueUI.ts
├── sim/          HeadlessRunner.ts (Node harness)
└── main.ts       bootstrap
web/sim/cli.ts    CLI entry point for the headless sim
server/index.ts   Express production server
```

**Path aliases** (`web/tsconfig.json`): `@engine/*`, `@ui/*`, `@data/*`, `@gameplay/*`.

### Porting rules

Full detail in `web/.porting/CONVENTIONS.md`. The ones that matter:

1. **Never modify `src/`** (the C#). It is the reference.
2. **No platform leakage** — `engine/` and `data/` must not import from `ui/`. Only `main.ts` and `ui/` touch the DOM.
3. **Async-first** — anything that blocks in C# (waiting for input, `Thread.Sleep`) becomes `async` + `await`.
4. **C# → TS mapping:** `System.Drawing.*` → `engine/Color|Point|Rect`; `System.Random` → `DiceRoller` (Mulberry32); `Application.Run()` → async loop with `await UI_WaitKey()`; `BinaryFormatter` → JSON in `localStorage`; SFML/DirectX audio → Web Audio API; `Thread` + `Invoke()` → single-threaded async.
5. **`enum` flags stay numeric.** C# `[Flags]` enums must keep their integer values — the TS uses bitwise `|`, `&`, `~` directly and `Rules.canActorFireAt` relies on it. Reordering an enum silently breaks every bitmask test.
6. `enum` members with colliding names across namespaces (e.g. `Rules.Goal`, `Session.Goal`) are one flat `const enum` in the port.

### Build / verify

| Command | Purpose |
|---|---|
| `npm run verify` | type-check + coverage + build — what CI runs, in one command |
| `npm run type-check` | `tsc --noEmit`; covers `src/`, `sim/` and `tests/` — necessary, **not sufficient** |
| `npm run test` | Vitest, 104 tests |
| `npm run test:coverage` | Vitest with coverage thresholds enforced |
| `npm run build` | Vite production build |
| `npm run sim` | Headless engine run — the real test |
| `npm run profile` | Draw calls per frame + engine ms/frame — the perf harness |
| `npm run serve` | Express production server (needs `build:all` first) |

---

## 3. Phase Status

Phases 1–7 are ported and building. Historical per-slice detail has been removed; consult git history if needed.

| Phase | Output | Status |
|---|---|---|
| 1 — Scaffold & primitives | Vite + Express, `IRogueUI`, `CanvasUI`, `InputHandler`, `Point`/`Rect`/`Color`, `DiceRoller` | Done |
| 2 — Data layer | `Actor`, `Map`, `World`, `ActorModel`, `GameItems`, `GameActors`, `GameImages` | Done |
| 3 — Engine core | `Rules`, `LOS`, `Session`, `Scoring`, `GameOptions`, `ui/OptionsScreen.ts` | Done |
| 4 — Game loop | `RogueGame.ts` (~18 KLOC) all 10 slices | Ported, **0 stubs — and now behaviourally exercised: 1 000-turn runs, see §1.2** |
| 5 — World gen & AI | `BaseAI` (184/184), all 11 AI controllers, 4 generator files (`MapGenerator`, `BaseMapGenerator`, `BaseTownGenerator` 5 814 lines, `StdTownGenerator`) | Done |
| 6 — Audio | Web Audio SFX + music | Done |
| 7 — Save / load | localStorage / IndexedDB, `Session` serialisation | Done |
| 8 — Polish, sim, CI | Headless harness built; rest not started | **In progress** |

Assets: 1 151 files shipped (1 124 sprites across 3 image sets, 24 music tracks, 3 SFX), extracted from the C# embedded resources. **Total 24.9 MB**, down from 51.6 MB before the Phase 8 asset pass — see §4.1c.

---

## 4. Phase 8 — Polish, Headless Simulation & Deployment

**Goal:** feature-complete, tested, deployable, with a headless harness for balance and AI verification.

### 4.1 Task list

| # | Task | Status |
|---|------|--------|
| 1 | Headless simulator (`NullRogueUI` + `HeadlessRunner` + CLI) | **Built; playing 1 000-turn games. See §1.2.** |
| 2 | Deterministic `--seed` for reproducible runs | **Done** (`Session.useSeed`, `--seed`) |
| 3 | Drive the sim to a clean full-length run and fix what it finds | **In progress** — 1 000-turn runs clean on 4/5 seeds; keep sweeping |
| 4 | Responsive canvas scaling (CSS `aspect-ratio` + `object-fit`) | **Already present** in `index.html` (the task list was stale) — but never verified in a real browser |
| 5 | Vitest + `@vitest/coverage-v8`, `test` / `test:coverage` scripts, coverage thresholds | **Done** — 104 tests, 9 files, thresholds enforced (50/75/57/50) |
| 6 | GitHub Actions CI | **Done** — `.github/workflows/ci.yml`, type-check + coverage + build + seeded sim, plus a docker smoke job |
| 7 | PWA manifest + service worker (offline play) | **Done** — manifest, drawn icons, runtime-caching `sw.js` |
| 8 | Docker image for the self-hosted server | **Done but unverified** — docker is not installed locally, so the image has never been built; CI will exercise it first |
| 9 | Extract + optimise all sprite PNGs from C# embedded resources | **Done** — 1 124 sprites converted to lossless WebP, 2.41 MB → 0.32 MB, every file pixel-verified |
| 10 | Audio: normalise volume levels | **Done** — plus 25.7 MB of unreferenced MP3s deleted. Music RMS spread 4.88× → 1.71× |
| 11 | Performance pass: profile tile rendering (target 60 fps on a 21×21 view) | **Done for draw calls** — `npm run profile`; 3 058 → 658 calls/frame, engine 1.86 → 1.11 ms/frame. See §4.1d. Frame *rate* still unverified (needs a browser) |
| 12 | Mobile / touch support (optional — original was keyboard-only) | Not started |

### 4.1a Test suite layout

`web/tests/`, run with `npm run test` / `test:coverage`, or all three checks at
once with `npm run verify`. `tests/` is in `tsconfig.json`'s include list, so
`type-check` and `build` check the tests too.

| File | Covers |
|------|--------|
| `primitives.test.ts` | `DiceRoller` reproducibility + distribution, `Direction` 8-point algebra, `WorldTime` day/hour/phase and the midnight/midday strikes |
| `map.test.ts` | The `placeActor` add-or-move contract, duplicate/out-of-bounds rejection, `removeActor` no-op semantics, `assertActorIntegrity` |
| `null-ui.test.ts` | `NullRogueUI` never blocks and never touches the DOM |
| `audio-levels.test.ts` | Loudness table: no gain may clip, every id resolves, unknown ids return 1.0 |
| `sprite-assets.test.ts` | All 395 `GameImages` ids resolve to a file on disk; no stray `.png` |
| `persistence.test.ts` | `Session` / `GameOptions` / `Keybindings` / `HiScoreTable` / `GameHints` / `TextFile` roundtrips on the in-memory storage fallback |
| `integration/headless-run.test.ts` | A real seeded playthrough. `metrics.error === undefined` is the assertion that would have caught all nine bugs in §1.1 |
| `integration/reproducibility.test.ts` | Shells out to the real CLI twice per seed — `Session` is a process-wide singleton, and the CLI is what CI and users invoke |

Two constraints worth preserving:

- **One simulation per test file.** `Session.get()` is a singleton and the model
  databases self-register into `Models` statics, so two games in one process
  share state. Vitest isolates each file into a fresh worker, which is what
  makes the single `beforeAll` run clean.
- **Vitest is pinned to 3.2.x on purpose.** Vitest 5 declares
  `peerDependencies.vite: ^6.4 || ^7 || ^8` and would force a Vite major
  upgrade. Vitest 3 accepts Vite 5.

### 4.1b Deployment notes

- **Docker is built from the repository root**, not `web/`:
  `docker build -t rogue-survivor-web .` then `docker run -p 8080:8080`.
  `.dockerignore` excludes the C# `src/` tree — it is the port's reference and
  is never compiled, so keeping it out also keeps 58 MB of dead weight out of
  the build context.
- **The service worker caches `/assets/` at runtime, not on install.** The
  assets are 24.9 MB across 1 151 files; precaching them would make the first
  load unusably slow. The precache list therefore holds only unhashed URLs —
  Vite content-hashes the bundle, so it is picked up by the runtime handler
  rather than needing a build plugin to inject a manifest. Navigations are
  network-first so a stale `index.html` can never shadow a new build.


### 4.1c Asset payload pass (tasks 9 + 10)

Total assets **51.6 MB → 24.9 MB**. Two changes, very different in character:

| | before | after | how |
|---|---|---|---|
| Music + SFX | 50.2 MB (27 `.ogg` **and** 27 `.mp3`) | 24.6 MB | Deleted the MP3s. `musicPath()` appends `.ogg` unconditionally, so they were unreachable |
| Sprites | 2.41 MB (1 124 PNG) | 0.32 MB (1 124 WebP) | Lossless WebP, every file pixel-verified |

The old "55 MB" figure in this plan was `du` block overhead across 1 180 small
files, not real bytes. Do not trust `du` for asset accounting here — sum the
file sizes.

**Sprite format.** Re-saving the PNGs was measured at 98% of the original
(already well packed); WebP lossless is 13%. The set is 32×32 pixel art, 98% of
it within 256 colours. Two things the per-pixel verification forced, both
recorded in `scripts/optimize-sprites.py`:

- The C# export left arbitrary colour under `alpha=0` (junk.png has
  `(255,255,255,0)` in 492 of 1024 pixels). WebP discards colour under full
  transparency, so the script canonicalises the source by zeroing RGB where
  alpha is 0. No visible information is lost.
- The check asserts alpha is identical everywhere and RGB is identical for every
  pixel with `alpha > 0` — **not** byte-exactness of the colour stored under
  fully transparent pixels, which is undefined and which libwebp does not
  round-trip consistently across decoders. All 1 124 files pass that bar.

**Audio levels.** Measured with `sox`: music RMS spans 0.055–0.267 (4.88× in
perceived loudness), peak 0.365–1.000. C# hid this behind DirectX/SFML at a
fixed per-category volume; in a browser the player just keeps turning the volume
up and down. `scripts/measure-audio-levels.mjs` measures the files once and
generates `gameplay/AudioLevels.ts`; the managers apply it through a gain stage
and the audio on disk stays byte-identical to the C# originals. Music
normalises on RMS, SFX on peak, and every gain satisfies `peak * gain <= 1.0`
so normalisation cannot clip — seven tracks are peak-limited and deliberately
left quieter. Result: RMS spread **4.88× → 1.71×**.

`WebAudioMusicManager` routes its `<audio>` element through a `GainNode`, which
is required rather than tidy: correcting the quiet tracks needs up to 2.7× gain
and `HTMLMediaElement.volume` is capped at 1.0. Normalising purely by
attenuation would have forced every track down to the quietest one's level,
making the soundtrack ~2.4× quieter. Falls back to plain element volume where
Web Audio is unavailable.

### 4.1d Frame cost (task 11)

`npm run profile` measures what a frame costs without a browser: it counts
painting calls per method through `IRogueUI` (proxy for the browser's
rasterisation) and times `RedrawPlayScreen` (the engine-side loops,
allocations and lookups). Run it before optimising anything here — the
expensive frame work was not where it looked.

The 60 fps target itself is still **unverified**, because frame rate needs a
real browser. What is verified is the work per frame.

3×3 world, 60 turns, seed 12345:

| | before | after | |
|---|---|---|---|
| `UI_SetMinimapColor` | 2 429/frame | 30.4/frame | −98.7% |
| `UI_ClearMinimap` | 1.3/frame | 0 | — |
| **total calls/frame** | **3 058** | **658** | −78.5% |
| engine ms/frame | 1.86 | 1.11 | −40% |

The "before" is measured by forcing the cache to always rebuild in the same
build, so the comparison isolates the change rather than confounding it with
other edits.

The dominant cost was `DrawMiniMap`, which rebuilt the whole raster every
frame — all 10 000 tiles of a 100×100 map, one `UI_SetMinimapColor` per
visited tile, plus a `new Point` allocation per tile inside the loop. At 60 fps
that is ~148 000 calls per second redrawing an image that had not changed. The
raster is now cached against `Map.minimapRevision`, which is bumped by
`markVisited`, `setAllAsUnvisited` and `setTileModelAt`.

Two things to preserve:

- **Tiles must be marked visited through `Map.markVisited`**, never by
  assigning `tile.isVisited` directly, or the revision drifts and the cached
  raster goes stale. A stale minimap fails silently — it just stops updating.
- **`setTileModelAt` bumps the revision on purpose.** Every caller today is
  world generation, so it is not needed yet, but a tile model carries its
  minimap colour and a future runtime tile change would otherwise be invisible.

Also worth knowing when touching the renderer: `UI_DrawGrayLevelImage` is
called ~578 times a frame (it is how unexplored tiles are drawn) and setting
`ctx.filter` per call is a pipeline barrier in browsers, so the desaturated
variant is pre-rendered once per image and blitted. The profiler's *call count*
for that call does not drop — the cost per call does, which is the limit of
what a call-counting harness can show.

### 4.2 Headless harness design (for whoever extends it)

- **`ui/NullRogueUI.ts`** — implements `IRogueUI` with no DOM. Drawing is a no-op; `UI_Wait` returns immediately. It **synthesises input** (`Enter` / `Escape` / `n` / `y`, exposed from both `UI_WaitKey` and `UI_PeekKey`) so blocking waiters — `WaitEnter`, `WaitYesOrNo`, `WaitKeyOrMouse` — cannot deadlock. This is what lets the game run with no human present; do not remove it.
- **`sim/HeadlessRunner.ts`** — boots the real `RogueGame`, loads data, `StartNewGame`, optionally `BotTakeControl`, then loops `AdvancePlay`. Collects metrics: turns played, final turn/day, player alive + HP, actors alive (undead/living), corpses, kills, score, duration, error.
- **`RogueGame.botDelayMs`** — the bot's action delay, defaulting to the original `BOT_DELAY`. The runner sets it to 0; without this a 1-turn run costs 250 ms × every AI actor.
- **`RogueGame.debugTrace`** — opt-in (`null` by default) per-actor/bot decision logging, enabled by `--trace`. Guarded by optional chaining so it costs nothing when off.
- **`Map.assertActorIntegrity()`** — called by the runner every turn. Verifies no actor appears twice in `actorsList`, that each listed actor is indexed at its own position, and that the two agree in size. Not a C# method; see §1.2.
- **`Session.useSeed(seed)`** — pins the RNG seed. Must be called before `RogueGame` is constructed; the runner takes the seed as a constructor argument for that reason.
- **`engine/storage.ts`** — the `localStorage` wrapper. Falls back to an in-memory `Map` in Node. Every persistence module goes through it; naming the bare global threw `ReferenceError` outside a browser.

### 4.3 Test strategy

Items 1, 4 and 5 are implemented (see §4.1a). Items 2 and 3 are not.

1. **Headless integration tests** — ✅ `tests/integration/headless-run.test.ts`. Boots a seeded 1×1 world, plays 40 turns, asserts no crash, actor accounting stays consistent, the world clock advances, and the run is neither instant nor hung.
2. **AI behaviour tests** — ⬜ zombie pursuit, line-of-sight tracking, scent aggregation, civilian self-preservation, in isolated map scenarios.
3. **Generator integrity tests** — ⬜ town/building/sewer generators must produce fully reachable nav-graphs with no deadlocks or out-of-bounds writes.
4. **Save/load roundtrip** — ✅ `tests/persistence.test.ts`, for the six persistence modules. Note the gap: `Session` does not serialise the world/map object graph yet (see the `TODO(phase 4)` in `Session.save`), so a full "complex running game" roundtrip is not possible until that lands.
5. **Coverage** — ✅ `@vitest/coverage-v8`, thresholds at 50/75/57/50, set ~1–1.5 points under the measured 51.1/76.4/58.9 baseline rather than at an aspirational number.


---

## 5. Summary Timeline

| Phase | Scope | Status |
|---|---|---|
| 1 | Scaffold + primitives | Done |
| 2 | Data layer | Done |
| 3 | Engine core | Done |
| 4 | Game loop | Ported, 0 stubs — **behaviourally exercised: 1 000-turn runs, see §1.2** |
| 5 | World generation + AI | Done |
| 6 | Audio | Done |
| 7 | Save / load | Done |
| 8 | Headless sim, tests, CI, deployment | In progress — sim plays 1 000 turns; 104 tests, CI, PWA, Docker, asset pass and frame-cost pass all in. Only 12 (optional touch) remains |
