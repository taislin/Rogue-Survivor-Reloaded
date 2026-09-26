# Rogue Survivor Reloaded — TypeScript / Browser Port

> **Status (2026-09-26):** Phases 1–7 ported and building. Phase 8 (polish / headless sim / CI) in progress.
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

**Takeaway for the next agent: "0 stubs + green type-check" is not a definition of done for this project. The headless sim is.**

### 1.2 Where the simulator stands

The harness works and is doing its job. World generation completes in ~250 ms. It then runs real turns and crashes on further latent bugs — the long tail is not finished.

Last two runs (note: **not reproducible**, see 1.4):

```
turns played : 8      →  Cannot read properties of undefined (reading 'register')
                         at Map.placeActor → DoSwitchPlace → ActionSwitchPlace.perform
turns played : 1      →  Tile (39, 3) already has an actor
```

Both are genuine unported/misported behaviour, not harness bugs.

### 1.3 How to run it

```bash
cd web
npm install
npm run type-check
npm run build
npm run sim                              # default 3x3 world, 200 turns
npm run sim -- --size 1 --turns 30       # fast smoke run
npm run sim -- --size 1 --turns 30 --trace   # per-actor + bot decisions
```

Other flags: `--undead <n>`, `--bot <true|false>`, `--verbose`.

### 1.4 Known issue: runs are not reproducible

`Session` seeds from `Date.now()` (`engine/Session.ts:219`), so every run explores a different world and fails in a different place. **This is the first thing to fix** — without a seed flag, each bug is found by luck and cannot be regression-tested. Add `HeadlessRunner.run({ seed })` overriding `session.seed` (a `Session.seed` field already exists and is used by save/load).

### 1.5 Next steps, in priority order

1. **Add a `--seed` flag** to the sim (1.4). Without it, nothing below is verifiable.
2. **Keep running the sim to failure and fix what it finds.** Loop: `npm run sim -- --size 1 --turns 30` → fix → repeat. Work down from the smallest world / fewest turns. Current known failures are `DoSwitchPlace` → `Map.placeActor` and a tile-collision assert in `placeActor`.
3. **Widen the run** once 1×1 is clean: `--size 3 --turns 200`, then the default. Watch for hangs, not just crashes — a turn that never returns is usually a blocking `UI_Wait*`.
4. **Add the test suite** (Phase 8 task 5, entirely unstarted — no Vitest, no coverage, no CI yet). See §4.
5. **Audit the remaining AI files for bug 3.** The `filterActors` fix was central, but any other `percepted as Actor` cast followed by a dereference is still suspect. Grep for the pattern.
6. Then work down the Phase 8 task list in §4.

### 1.6 Git state

- `master`, tracking `origin/master`.
- Phase 4 completion committed as `0bc8e7f`; the Phase 4 async audit (18 detached calls awaited, stale notes fixed) as `389a845`.
- The headless harness + the 9 fixes above were committed together as the Phase 8 simulator commit.

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
| `npm run type-check` | `tsc --noEmit` — necessary, **not sufficient** |
| `npm run build` | Vite production build |
| `npm run sim` | Headless engine run — the real test |

---

## 3. Phase Status

Phases 1–7 are ported and building. Historical per-slice detail has been removed; consult git history if needed.

| Phase | Output | Status |
|---|---|---|
| 1 — Scaffold & primitives | Vite + Express, `IRogueUI`, `CanvasUI`, `InputHandler`, `Point`/`Rect`/`Color`, `DiceRoller` | Done |
| 2 — Data layer | `Actor`, `Map`, `World`, `ActorModel`, `GameItems`, `GameActors`, `GameImages` | Done |
| 3 — Engine core | `Rules`, `LOS`, `Session`, `Scoring`, `GameOptions`, `ui/OptionsScreen.ts` | Done |
| 4 — Game loop | `RogueGame.ts` (~18 KLOC) all 10 slices | Ported, **0 stubs — but see §1.1: not behaviourally verified** |
| 5 — World gen & AI | `BaseAI` (184/184), all 11 AI controllers, 4 generator files (`MapGenerator`, `BaseMapGenerator`, `BaseTownGenerator` 5 814 lines, `StdTownGenerator`) | Done |
| 6 — Audio | Web Audio SFX + music | Done |
| 7 — Save / load | localStorage / IndexedDB, `Session` serialisation | Done |
| 8 — Polish, sim, CI | Headless harness built; rest not started | **In progress** |

Assets: 1 184 files shipped (397 classic sprites + 2 variation sets, 24 music tracks, 3 SFX), extracted from the C# embedded resources.

---

## 4. Phase 8 — Polish, Headless Simulation & Deployment

**Goal:** feature-complete, tested, deployable, with a headless harness for balance and AI verification.

### 4.1 Task list

| # | Task | Status |
|---|------|--------|
| 1 | Headless simulator (`NullRogueUI` + `HeadlessRunner` + CLI) | **Built; surfacing bugs. Not yet running clean.** |
| 2 | Deterministic `--seed` for reproducible runs | **Not started** — blocks verification (§1.4) |
| 3 | Drive the sim to a clean full-length run and fix what it finds | **Not started** |
| 4 | Responsive canvas scaling (CSS `aspect-ratio` + `object-fit`) | Not started |
| 5 | Vitest + `@vitest/coverage-v8`, `test` / `test:coverage` scripts, coverage thresholds, CI running type-check + coverage + build + a short sim | **Not started** |
| 6 | GitHub Actions CI | Not started (bundled with 5) |
| 7 | PWA manifest + service worker (offline play) | Not started |
| 8 | Docker image for the self-hosted server | Not started |
| 9 | Extract + optimise all sprite PNGs from C# embedded resources | Partly done (1 184 files extracted); optimisation pending |
| 10 | Audio: normalise volume levels | Not started |
| 11 | Performance pass: profile tile rendering (target 60 fps on a 21×21 view) | Not started |
| 12 | Mobile / touch support (optional — original was keyboard-only) | Not started |

### 4.2 Headless harness design (for whoever extends it)

- **`ui/NullRogueUI.ts`** — implements `IRogueUI` with no DOM. Drawing is a no-op; `UI_Wait` returns immediately. It **synthesises input** (`Enter` / `Escape` / `n` / `y`, exposed from both `UI_WaitKey` and `UI_PeekKey`) so blocking waiters — `WaitEnter`, `WaitYesOrNo`, `WaitKeyOrMouse` — cannot deadlock. This is what lets the game run with no human present; do not remove it.
- **`sim/HeadlessRunner.ts`** — boots the real `RogueGame`, loads data, `StartNewGame`, optionally `BotTakeControl`, then loops `AdvancePlay`. Collects metrics: turns played, final turn/day, player alive + HP, actors alive (undead/living), corpses, kills, score, duration, error.
- **`RogueGame.botDelayMs`** — the bot's action delay, defaulting to the original `BOT_DELAY`. The runner sets it to 0; without this a 1-turn run costs 250 ms × every AI actor.
- **`RogueGame.debugTrace`** — opt-in (`null` by default) per-actor/bot decision logging, enabled by `--trace`. Guarded by optional chaining so it costs nothing when off.

### 4.3 Test strategy (not yet implemented)

1. **Headless integration tests** — boot a small world, play N turns, assert no crash, actor counts stay consistent, the world clock advances, and the player is never soft-locked. Cheapest high-value tests; build these first.
2. **AI behaviour tests** — zombie pursuit, line-of-sight tracking, scent aggregation, civilian self-preservation, in isolated map scenarios.
3. **Generator integrity tests** — town/building/sewer generators must produce fully reachable nav-graphs with no deadlocks or out-of-bounds writes.
4. **Save/load roundtrip** — serialise a complex running game to JSON, deserialise, assert deep equality across actors, items, maps, world clocks.
5. **Coverage** — `@vitest/coverage-v8`, thresholds set from a measured baseline (do not pick aspirational numbers on day one; the port is not at full coverage and a failing threshold will just be disabled again).

---

## 5. Summary Timeline

| Phase | Scope | Status |
|---|---|---|
| 1 | Scaffold + primitives | Done |
| 2 | Data layer | Done |
| 3 | Engine core | Done |
| 4 | Game loop | Ported, 0 stubs — **behaviour unverified, see §1.1** |
| 5 | World generation + AI | Done |
| 6 | Audio | Done |
| 7 | Save / load | Done |
| 8 | Headless sim, tests, CI, deployment | In progress — harness built, long-tail bug hunt next |
