# Rogue Survivor Reloaded — TypeScript / Browser Port

> **Status (2026-09-27):** Phases 1–7 ported and playable. Phase 8 tasks 1–11 done; only 12 (optional touch support) remains.
> **The game now runs end to end in a browser.** A further 5 runtime bugs were found and fixed on 2026-09-27 — see §1.1b, which is the newest section and supersedes parts of §1.4a.
> **Read [Current State & Handover](#1-current-state--handover) first — it contains the bugs found and the exact next steps.**

Porting a C# WinForms zombie-survival roguelike (195 files, ~2.5 MB, largest `RogueGame.cs` at 955 KB / 23 233 lines) to a browser-playable TypeScript version. `src/` is the original C# and is **never modified** — it is the reference for every port.

> **Do not delete `src/`.** Nothing compiles or ships it (the Dockerfile copies
> only `web/`, and `.dockerignore` excludes it), so removing it saves no build
> time and no bundle size. It is the only statement of intended behaviour, and
> every one of the 15 bugs in §1.1 and §1.1b was found by diffing the port
> against it. Four of the six tasks still open in §1.5 are fidelity work that
> *cannot be done* without it. Revisit only once those close.

---

## Table of Contents

1. [Current State & Handover](#1-current-state--handover)
2. [Quick Reference](#2-quick-reference)
3. [Phase Status](#3-phase-status)
4. [Phase 8 — Polish, Headless Simulation & Deployment](#4-phase-8--polish-headless-simulation--deployment)
5. [Summary Timeline](#5-summary-timeline)
6. [Future Plans](#6-future-plans) — mobile/touch, HTML menus, outstanding housekeeping

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

### 1.1b Five more bugs, found by playing the thing (2026-09-27)

With the simulator green and the game "done", the port was run in a browser for
the first time. It was unplayable. All five of these are **C#-fidelity
divergences** — the port had silently dropped or inverted something the original
does — and none was visible to `tsc`, to the Vite build, or to the headless sim.
They are recorded here because the pattern recurs: *a port that type-checks and
runs headless can still be visibly, obviously broken on screen.*

| # | Bug | C# reference | Impact |
|---|-----|--------------|--------|
| 11 | `UpdatePlayerFOV` never pushed the FOV onto the map — `Map.SetViewAndMarkVisited(m_PlayerFOV)` had no counterpart | `RogueGame.cs:5373` | **Game-breaking.** `IsVisibleToPlayer` and `DrawTile` both read `tile.isInView`, so no tile was ever in view: the map drew empty — no tiles, no items, no corpses, no actors, not even the player. Also fixed the minimap (§1.4a). |
| 12 | `UI_PeekKey` was a true peek; C# **consumes** the key it returns (`m_HasKey = false` before returning) | `RogueForm.cs:135` | **Game-breaking.** `WaitKeyOrMouse` polls in a loop, so it was handed the same key forever. The first keypress wedged the game loop, which replayed that one command endlessly and never read the keyboard again: no movement, no help, no response. |
| 13 | Every living actor was mapped to `GameImages.ACTOR_ZOMBIE`, plus a `?? ACTOR_ZOMBIE` backstop that swallowed the legitimate `null`s | `GameActors.cs:659` onward passes `null` for all living actors | Living actors rendered as bare zombies. The sprite draws *under* the doll layers, so the player still looked human — just wearing a zombie's torso — while NPCs, which get no doll, had no head, hair or clothes at all. |
| 14 | `UI_DrawImageTinted` composited in three steps (drawImage → multiply fill → `destination-in` re-blit) and produced **no visible pixels** | `DXGameCanvas.DrawImage(…, tint)` is a plain blit for an opaque tint | Every in-view tile and every actor was invisible. Only visited ("grey") tiles rendered, because that path does not use the composite — which made it look like a *map/FOV* bug and sent the investigation in the wrong direction twice. |
| 15 | Sprites loaded lazily and **every draw silently skipped an uncached image**, so the map painted itself in progressively in draw order | C# preloads all images before the first frame | Tiles simply missing wherever a sprite had not arrived yet. Looked exactly like a positional/FOV bug. Fixed by preloading (`IRogueUI.UI_PreloadImages`); the dead `CanvasUI.preloadImages` that should have done it had no callers. |

#### How they were found, and the lesson

Bugs 11–13 and 15 were all reachable by reading the port against the C#.
Bugs 14–15 took much longer, and the reason is worth recording:

- `[render]`/`[draw]` logging (`?debug=1`, added in this commit) proved the FOV
  set was healthy (46 tiles, own tile in view, view rect centred, doll fully
  dressed) **and** that ~500 draw calls per frame executed with zero missing
  images. Both facts together excluded every candidate except the canvas layer.
- `skips=0` was the decisive datum: it eliminated the "lazy load" theory for the
  *in-view* tiles, which is what pointed at the composite.

**If you touch the renderer, turn on `?debug=1` first.** The `[draw]` tally
distinguishes "the call never ran" from "the call ran and drew nothing", which
is the difference between an engine bug and a canvas bug — and this project has
now produced one of each, in the same feature, in the same session.

#### Regression tests added alongside

Each fix is pinned, because all five are the kind that a future refactor
reintroduces silently: `tests/map.test.ts` (view/visited flags),
`tests/input-handler.test.ts` (the consumes-key contract),
`tests/actor-sprites.test.ts` (sprite-vs-doll mapping, including a check that
the two lists partition the enum), `tests/sprite-assets.test.ts` (preload
manifest completeness). **146 tests pass.**

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

### 1.4a Minimap reveal bug — FIXED, and the diagnosis here was wrong

Found while profiling the frame cost (task 11). **Fixed 2026-09-27** as
§1.1b bug 11; this section is kept because its *reasoning* was wrong in a way
that cost real time, and that is the part worth learning from.

`RogueGame.UpdatePlayerFOV` (web/src/engine/RogueGame.ts) only computed
`m_PlayerFOV`. It never pushed that set into the map. C# does, one line later:

```csharp
// src/Engine/RogueGame.cs:5373, inside UpdatePlayerFOV
player.Location.Map.SetViewAndMarkVisited(m_PlayerFOV);
```

`Map.SetViewAndMarkVisited` (src/Data/Map.cs:953) sets `IsInView` **and**
`IsVisited` for every visible tile. The TS port had no equivalent — the only
two places that touched `isVisited` were the starting-zone reveal and
`Map.setAllAsUnvisited`.

The minimap symptom was as described: the visited set never grew after the
initial reveal, so the minimap showed only the starting area for the whole game,
and `ClearMinimap` was called exactly once per run.

> **The original note here claimed** "`isInView` is also never set, though
> nothing appears to read it — `DrawMap` uses `m_PlayerFOV` directly, which is
> why the game still *looks* right." **Both halves of that were wrong.**
> `DrawMap` does *not* use `m_PlayerFOV` for tile visibility — it calls
> `IsVisibleToPlayer(map, position)`, which reads `tile.isInView`, and
> `DrawTile` picks its lit-vs-memorised sprite from `isInView`/`isVisited` too.
> So the missing call did not merely freeze the minimap: it blanked the entire
> in-game map. The note was written while looking at the minimap only, and the
> minimap has its own independent path, so the in-game renderer was never
> checked against it.
>
> **Lesson:** when a port is missing a call, do not assume the call is
> cosmetic. Trace every reader of the state it would have written. Here two
> independent renderers read the same flags and one of them was fatal.

**Fix shipped:** `Map.clearView()` / `Map.setViewAndMarkVisited()` (replacing the
inlined `ClearView` loop in the district-sim catchup), called from
`UpdatePlayerFOV`. Marking routes through `markVisited` so `minimapRevision`
tracks the visited set and the §4.1d cache stays correct. Verified: FOV of 46
tiles with the player's own tile in view, and the minimap raster now rebuilds as
ground is explored rather than once per run.

### 1.5 Next steps, in priority order

0. ~~**Fix the minimap reveal bug** (§1.4a).~~ **Done 2026-09-27** — see
   §1.1b bug 11. It turned out to be the whole in-game map, not just the minimap.
1. **Play the game, don't just sim it.** This is now the highest-value activity
   and it is the step that was skipped: all five bugs in §1.1b were found by
   opening a browser, and the sim found none of them because they were all
   *presentation-layer* faults the headless UI deliberately drops. If you make a
   rendering change, open the game and look at it. The corollary is the reverse
   of the old lesson: *the sim is the definition of done for the engine; the
   browser is the definition of done for the renderer.* Neither substitutes for
   the other, and both were green while the game was unplayable.
2. **Keep running the sim to failure and fix what it finds.** Now that the map
   stops corrupting itself, 1 000-turn runs are reachable. Loop over seeds:
   `for s in 1 2 3 4 5; do npm run sim -- --size 3 --turns 1000 --seed $s --undead; done`
   Watch for hangs, not just crashes — a turn that never returns is usually a
   blocking `UI_Wait*`.
3. **Write the AI behaviour and generator integrity tests** (Phase 8 §4.3 items
   2 and 3, the only test work left). The harness is trustworthy enough to
   assert on now, and the headless integration tests in `tests/integration/`
   are the pattern to follow. Generator integrity is the higher-value of the
   two: nothing currently checks that a generated town is fully reachable.
4. **Audit the remaining AI files for bug 3.** The `filterActors` fix was central,
   but any other `percepted as Actor` cast followed by a dereference is still
   suspect. Grep for the pattern.
5. **Restore C#'s `isInvincible` guard** on `Actor.hitPoints` (§1.2a).
6. **Serialise the world/map graph in `Session.save`** — the `TODO(phase 4)`
   there blocks any true save/load roundtrip test.
7. Then work down the rest of the Phase 8 task list in §4 (tasks 9–12).

**Items 3–6 all require reading `src/`.** See the warning at the top of this
file before considering its removal.

### 1.6 Known non-bugs (do not re-investigate)

- **`tests/integration/reproducibility.test.ts` fails on Windows** with
  `spawnSync npx ENOENT`. `execFileSync` cannot spawn `npx.ps1`. Confirmed
  failing on a clean tree; unrelated to the port. Consequence: `npm run verify`
  halts before its build step, so run `type-check`, `test` and `build`
  separately until it is fixed.
- **The untracked `icon.png` in the repo root** is not referenced by anything
  (the app uses `web/public/icon-192.png` and friends) and was not produced by
  any code in the tree. Left uncommitted rather than guessing at it.
- **The first load is slow** (~395 sprites before the menu appears). That is
  correct — C# preloads too — and the service worker caches them so later loads
  are instant. Bump `CACHE_VERSION` in `web/public/sw.js` when releasing, or
  clients keep the old bundle and the update only lands on the *next* load.

### 1.7 Git state

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
- `f61a9b2` — the five §1.1b bugs (11–15) plus the display pass: widescreen
  1366×768, the 12pt menu font with scrolling windows, death screenshots
  defaulting off, the service-worker 206/`CACHE_VERSION` fix, and the
  `?debug=1` `[render]`/`[draw]` diagnostics. Also rewrote the root `README.md`
  (it had described only the 2012 C# source) and trimmed `web/README.md`.
  146 tests pass; the reproducibility suite is the pre-existing Windows failure
  in §1.6.

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
| `npm run test` | Vitest, 146 tests |
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
| 4 — Game loop | `RogueGame.ts` (~19.7 KLOC) all 10 slices | Ported, **0 stubs — and now behaviourally exercised: 1 000-turn runs headless (§1.2) *and* played in a browser (§1.1b)** |
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
| 4 | Responsive canvas scaling (CSS `aspect-ratio` + `object-fit`) | **Done and verified in a browser** — now 1366×768 widescreen, smooth filtering (the old `image-rendering: pixelated` made upscaled text unreadable) |
| 5 | Vitest + `@vitest/coverage-v8`, `test` / `test:coverage` scripts, coverage thresholds | **Done** — 146 tests, 11 files, thresholds enforced (50/75/57/50) |
| 6 | GitHub Actions CI | **Done** — `.github/workflows/ci.yml`, type-check + coverage + build + seeded sim, plus a docker smoke job |
| 7 | PWA manifest + service worker (offline play) | **Done** — manifest, drawn icons, runtime-caching `sw.js` |
| 8 | Docker image for the self-hosted server | **Done but unverified** — docker is not installed locally, so the image has never been built; CI will exercise it first |
| 9 | Extract + optimise all sprite PNGs from C# embedded resources | **Done** — 1 124 sprites converted to lossless WebP, 2.41 MB → 0.32 MB, every file pixel-verified |
| 10 | Audio: normalise volume levels | **Done** — plus 25.7 MB of unreferenced MP3s deleted. Music RMS spread 4.88× → 1.71× |
| 11 | Performance pass: profile tile rendering (target 60 fps on a 21×21 view) | **Done for draw calls** — `npm run profile`; 3 058 → 658 calls/frame, engine 1.86 → 1.11 ms/frame. See §4.1d. Frame *rate* still unverified (needs a browser). Note the view is now 31×21 after the widescreen change (§1.1b), so re-profile if that matters |
| 12 | Mobile / touch support (optional — original was keyboard-only) | Not started — scoped in §6.1 |

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
| 4 | Game loop | Ported, 0 stubs — **behaviourally exercised headless (1 000-turn runs, §1.2) and in a browser (§1.1b)** |
| 5 | World generation + AI | Done |
| 6 | Audio | Done |
| 7 | Save / load | Done |
| 8 | Headless sim, tests, CI, deployment | In progress — sim plays 1 000 turns; 146 tests, CI, PWA, Docker, asset pass and frame-cost pass all in. Only 12 (optional touch) remains |

---

## 6. Future Plans

Not scheduled, not started. Recorded so the next person does not have to
rediscover the context. Ordered roughly by value-per-effort.

### 6.1 Mobile / touch support (Phase 8 task 12)

The original was keyboard-and-mouse only, so this is a genuine new feature
rather than a port. It is the one Phase 8 task left open.

**What actually blocks it.** The game is not a port of a touch UI; it is a port
of a *keyboard* UI. Nothing in `web/src/ui/` knows a finger exists:

- **Movement is a held-direction model.** `InputHandler` synthesises one
  `GameKeyEvent` per `keydown`, and the game loop consumes exactly one per turn
  (§`GameLoop`). There is no notion of a direction being *held*, so there is
  nothing to hook a virtual D-pad to. A naive touch D-pad that fires on
  `touchstart` will repeat-turn correctly but cannot express "keep walking
  north while I do something else", and diagonal movement needs two held
  directions — which the current one-event-per-turn model cannot represent
  without a change.
- **`UI_WaitKey()` is the only input primitive.** Every menu, popup and targeting
  mode is written as "draw, await one key, switch on it". Touch needs press,
  hold, drag and release semantics plus hit-testing, and a second pointer for
  pinch-zoom. The natural shape is a pointer abstraction the game already
  understands: translate a finger into the same `GameKeyEvent`s the keyboard
  produces, and leave every one of those call sites untouched.
- **Mouse is already a first-class path.** `WaitKeyOrMouse` already returns
  `{key, mousePos, mouseButtons}` and the targeting/inventory/mouse-look code is
  pointer-driven rather than key-driven. That is the part worth building on:
  touch-to-pointer is a small mapping, whereas touch-to-keyboard is not.
- **The canvas is now 1366×768 with 32 px tiles.** At phone scale the HUD text is
  unreadable and a tile is a few CSS pixels across. Touch support is really a
  *layout* project as much as an input one, and the fixed-size canvas plus
  `image-rendering` scaling will have to give way to something responsive.
- **The audio unlock and the PWA path already work** (service worker, manifest,
  Web Audio), so install-to-homescreen and offline play are largely done.

**Suggested order of attack:** (1) a virtual D-pad that emits synthesised
`GameKeyEvent`s, (2) a touch→pointer mapping feeding the existing mouse path,
(3) a responsive layout, (4) a pass over the long-list screens for scrolling
gestures. Steps 1 and 2 are independent and can ship separately; a phone is
already playable with only 1 and 2 on a small screen.

**Do not** start by touching `RogueGame`. The input abstraction is the seam; if
that is done right, the 19.7 KLOC game loop does not need to know.

### 6.2 Finish the fidelity work first

Cheaper and higher value than 6.1, and blocked on `src/` (see the warning at
the top). In order: the AI behaviour and generator integrity tests, the
`isInvincible` guard, world/map serialisation for a true save/load roundtrip,
and the audit for the `percepted as Actor` pattern. See §1.5.

### 6.3 Renderer and layout

- **HTML menus.** Discussed and deliberately deferred. All ~206 text/popup call
  sites go through `IRogueUI` and input is already Promise-based, so a menu
  flow ("draw → await key → redraw") maps one-to-one onto an async DOM dialog.
  Worth doing for the full-screen screens only — main menu, character creation,
  help, manual, options, keybindings, hiscores, message log, post-mortem — where
  real buttons, mouse clicks and real scrolling would be worth having. **Leave
  the in-game popups on canvas**: they overlay the live map and interleave with
  a redraw on every keypress, so they are the hard case, not the easy one. The
  interim 12pt font (f61a9b2) exists to make the canvas version readable until
  this happens.
- **Frame rate is still unmeasured.** Draw calls were cut 78% (§4.1d) and the
  view grew from 21×21 to 31×21 tiles, so a real browser measurement of actual
  fps is still outstanding, as is a re-profile at the new view size.
- **The 12pt menu font and the 8.25pt HUD font are a stopgap.** Once menus are
  HTML, the two-tier canvas font split can collapse back to one size.

### 6.4 Housekeeping

- `tests/integration/reproducibility.test.ts` cannot run on Windows
  (`execFileSync` cannot spawn `npx.ps1`) — see §1.6. Fix by resolving the
  binary path instead of relying on `npx` being spawnable.
- The `icon.png` in the repo root is unexplained and untracked (§1.6); someone
  should work out what writes it before it becomes a committed mystery.
- The Docker image has never been built locally (§4 task 8); CI exercises it
  first, and that is the first time anyone will know whether it works.
