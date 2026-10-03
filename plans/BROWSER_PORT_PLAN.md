# Rogue Survivor Reloaded — TypeScript / Browser Port

> **Trimmed 2026-10-03. Read this first.**
>
> This file used to be the whole port: a completion record for Phases 1–7 and 8, a
> phase-status table, the Still Alive stage board (§5.6), a milestone list in §1.7, and
> a fixed-defect log in §1.1a. **All of that was history and is now gone** — 2,490
> lines down to 1,151. What is left is the part that is *not* finished and the part
> that would be expensive to re-derive:
>
> - **§1.5 "Open work"** — the live backlog, and the single place to look first.
> - **§6 the `RogueGame.ts` decomposition** — the biggest refactor in the project,
>   **not started, including Wave 0**. Its taxonomy and wave schedule are the only
>   record of a decision already taken.
> - **§2 porting rules**, **§1.6 known non-bugs** — the do-not-repeat-this list.
> - **§5.1 / §5.3 / §5.4 forward design** — touch, renderer, first-person.
> - **§4.1b deploy**, **§4.2 harness**, **§4.3 test strategy** — for whoever extends them.
>
> The sprite-routing note below was added by `607b622` during this same merge and is
> kept verbatim: it is a shipped feature, but the *reasoning* is the durable part and
> the measurement behind it (336 of 339 Genesis sprites also exist in Deonapocalypse)
> is what stops anyone re-introducing the plain ordered chain.
>
> **Removed, and where it went:**
>
> | Removed | Why, and where it lives now |
> |---|---|
> | §5.6 Still Alive (401 lines) | Shipped and merged (`27c63aa`). The *reasoning* survives in [`STILL_ALIVE_JOURNAL.md`](STILL_ALIVE_JOURNAL.md); the fork survey it leaned on is gone with `STILL_ALIVE_REFERENCE.md` |
> | `STILL_ALIVE_REFERENCE.md` (441 lines) | A survey of the fork written when the decision was "nothing ported". Its §1/§3 fork measurements were good, but the fork is now only in a gitignored folder, its §6 defect list is pinned `NOT_APPLICABLE` in `tests/stage2-fixes.test.ts`, and its §7 "do not port" list is enforced by `PENDING_WIRING` |
> | `HANDOVER.md` (428 lines) | Session-scoped. Its **open items** were extracted into §1.5 below; its measured findings are cited from §1.5 and §6 |
> | §1.1a, §1.1, §1.2, §1.2a | Fixed-defect and baseline records. The one durable lesson (sim ≠ browser) is kept as §1.4a; the "things that look like bugs but are not" content is folded into §1.6 |
> | §1.7 Git state | A milestone list of completed commits, which is what `git log` is for. The one live fact (bump `CACHE_VERSION`) is in §4.1b |
> | §3 Phase Status, §4.1 task list, §4.1a test index, §4.1c assets, §4.1e desktop wrapper, §5.2, §5.5 | Completion records. §4.1a's index listed 53 of what are now 141 test files |
>
> **Measured at `master` `8d5dfc8`, 2026-10-03:** `npm run verify` green —
> **2,956 tests across 138 files**, type-check clean, coverage
> **69.74 / 57.53 / 80.56 / 71.18** against a gate of **67 / 55 / 78 / 68**
> (`web/vitest.config.mts:118-124`). ~4 min for a full suite; a coverage run writes
> ~44 MB, so check `df -h /` first.
>
> **An in-game action menu, 2026-10-02.** `Tab` opens a modal grid of buttons
> drawn over the minimap: wait, wait long, sleep, barricade, break, fortify, fortify
> big, close door, eat corpse, give item, revive, shout, use exit, use spray, cook,
> fire. Clickable, or arrows and Enter; Escape closes.
>
> Three decisions are worth recording, because each was the opposite of the obvious
> answer:
>
> - **A grid, not a list, because the box is the minimap's.** 200x200 fits about
>   eleven rows at the menu's line height and the list is sixteen, so it would
>   either overflow or need scrolling. Filled **column by column**, which keeps the
>   six building actions together instead of splitting them across a row boundary.
> - **The dispatch reuses the play loop's own `switch`.** `HandleActionMenu`
>   returns a `PlayerCommand` and the loop re-runs with it, so clicking "Sleep"
>   executes the same code the `S` keybinding would have, with the same pre-checks.
>   The alternative — the menu calling handlers itself — is a second copy that
>   drifts. It needed a one-extra-pass `while` around a 400-line switch rather than
>   an extraction, because those cases close over `loop`.
> - **No `RedrawPlayScreen`.** The play screen is already on the canvas; redrawing
>   it meant needing a live world just to open a menu over one, and it threw
>   `isDead` of undefined outside a game.
>
> **The grid is measured from the font, not guessed.** The second version shipped a
> grid whose columns drew over each other, because the button width was compared
> against a label length in *characters* while the budget is in pixels - the bold
> face is MENU_CHAR_WIDTH (10) per character, so "Fortify Big" needs 114px and
> the button was 62. Nothing in the metrics showed it; the arithmetic had mixed
> units. computeLayout now derives the width from the two longest strings the grid
> draws and the column count from the room available, and the panel is **anchored to
> the right margin and grown leftward**: the minimap leaves only ~340px to its right,
> budgeting the panel that much dropped it to a single column, and an opaque modal
> overlay may as well grow over the map as run off the screen.
>
> **The panel has to be filled, not outlined.** There is no alpha in this UI, so
> drawing buttons straight onto the play screen left the map visible through the
> gaps and behind the labels — which read as a styling choice rather than a missing
> `UI_FillRect`. The screen test asserts the fill *encloses every button*, because
> a count of draws cannot say where anything landed.
>
> Two existing tests caught things here, both right. The append-only guard on
> `PlayerCommand` was pinned to the name `UNLOAD_AMMO`, so adding any command broke
> a test written about that one member; it now asserts the invariant instead — the
> highest number belongs to the last member, values contiguous from zero. And the
> key-redefine screen listed every bound command but not the new one, which is the
> one thing that screen exists to prevent.
>
> A testing note worth not rediscovering: `WaitKeyOrMouse` opens with
> `UI_PeekKey()`, which **consumes** — that is the C# contract, and it is what stops
> a held key auto-repeating into the menu. In game the key that opened the menu was
> already consumed by the turn loop's own wait, so the peek finds nothing pending
> and the player presses afresh. A test that queues keys has no such key, so its
> first one is eaten and every assertion lands a step out.
>
> **Sprite styles are routed, not just switched, 2026-10-02.** The fallback used
> to be hardcoded to `classic`, so a style could only ever say "this set, else the
> original". The request that broke it was *Genesis actors over a Deonapocalypse
> world* — two sets in an order, **and** a way to say which sprites the first one
> applies to. The second half is the part that is easy to miss, and it is
> measurable: Genesis is a *variant of the classic set*, not an actors-only pack.
> It ships all seven categories, and **336 of its 339 sprites also exist in
> Deonapocalypse, with zero Genesis-only**. So a plain ordered chain would have
> answered "Genesis first" for everything and produced Genesis tiles, items and
> icons as well — an option that looked right and was quietly wrong.
>
> Hence `SpriteRoute`: a style is a list of `{prefix, chain}`, first match wins,
> catch-all **last**, and every chain ends at `classic` so a missing id still
> draws. `spriteChainFor(set, imageId)` resolves per sprite, because under a routed
> style an actor and a wall come from different sets. Nothing is merged or copied —
> the folders stay as they are on disk and the routing decides. `isFolderBacked`
> exists because a routed style has no folder *by design*, and "every advertised
> style has a folder" is true of the others and meaningless for it.
>
> The reminder that caught this: measure the data before designing the feature.
> Three of the four tests that failed on this change were existing ones doing their
> job — the credits had no line for the new style, and two sprite-style tests
> assumed one set meant one folder.
>
> **Citations in this file are unverified.** This pass fixed the claims that had become
> false and did not re-grep the line numbers — see §"Citation drift" at the end.

## Table of Contents

1. [Current State](#1-current-state--handover)
   - [1.3](#13-how-to-run-it) commands · [1.4](#14-runs-are-now-reproducible) seeding
   - [1.4a](#14a-lesson-the-sim-and-the-browser-check-different-things) **the two definitions of done** · [1.4b](#14b-lesson-no-worker-because-the-world-is-shared-mutable-state) **why there is no sim thread**
   - [1.5](#15-open-work) **open work — start here** · [1.6](#16-known-non-bugs-do-not-re-investigate)
2. [Quick Reference](#2-quick-reference) — layout, porting rules, build commands
3. [Phase 8 — remaining](#4-phase-8--remaining)
   - [4.1b](#41b-deployment-notes) deploy · [4.1d](#41d-frame-cost) frame cost · [4.2](#42-headless-harness-design-for-whoever-extends-it) harness internals · [4.3](#43-test-strategy) test strategy
4. [Future Plans](#5-future-plans) — [5.1](#51-mobile--touch-support) touch · [5.3](#53-renderer-and-layout) · [5.4](#54-first-person--pseudo-3d-view-mode) first-person
5. [`RogueGame.ts` decomposition](#6-roguegamets-decomposition) — **the overdue refactor, not started** · [6.1](#61-the-deferral-is-already-on-record) · [6.2](#62-the-real-structure-two-hubs-everything-else-a-leaf) · [6.3](#63-the-recorded-target-table-is-wrong-in-two-places) · [6.4](#64-wave-0--the-test-seam-before-anything-else) · [6.5](#65-wave-1--the-free-leaves-and-the-alias-block) · [6.6](#66-wave-2--the-render-cluster) · [6.7](#67-wave-3--the-new-game-flow) · [6.8](#68-never--the-two-hubs) · [6.9](#69-what-breaks-in-the-order-it-breaks) · [6.10](#610-sequencing-verification-and-stopping)

Siblings: [`STILL_ALIVE_JOURNAL.md`](STILL_ALIVE_JOURNAL.md) (how the Still Alive port
went — the reasoning behind §5.6, now deleted from here),
[`SUGGESTIONS.md`](SUGGESTIONS.md) (a 2010–11 forum compendium with a measured
implementation verdict per item), [`MULTIPLAYER_PLAN.md`](MULTIPLAYER_PLAN.md)
(design only, nothing written).

## 1. Current State & Handover

### 1.3 How to run it

```bash
cd web
npm install
npm run type-check
npm run build
npm run sim                                    # default 3x3 world, 200 turns
npm run sim -- --size 1 --turns 30             # fast smoke run
npm run sim -- --size 3 --turns 1000 --seed 2 --undead   # long run, reproducible
npm run sim -- --size 1 --turns 30 --trace     # per-actor + bot decisions
```

> **Caveat on "long run":** no seed currently reaches 1 000 turns. The undead bot
> is shot down by survivors (§1.5 item 9), and long survivor runs hit the
> `SpawnActorOnMapBorder` throw described in §1.2a. This is expected on a
> correct build — the old 1 000-turn baseline was measured while every ranged
> weapon was inert.

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

### 1.4a Lesson: the sim and the browser check different things

**The sim is the definition of done for the engine. The browser is the definition
of done for the renderer. Neither substitutes for the other, and this project has
had a green sim and a green build while the game was visibly, obviously broken.**

The most expensive instance: five bugs in a row where `tsc` was clean, the Vite
build was clean, and the headless simulator — which had just found nine runtime
bugs and was declaring the port done — found none of them, because every one was
a *presentation* fault and `NullRogueUI` drops every painting call. The map drew
empty. Every actor was invisible. Living NPCs rendered as bare zombies. And the
diagnosis sent the investigation in the wrong direction twice, because the
symptom that looked like a map/FOV bug was a canvas compositing bug: a
`destination-in` re-blit that produced no visible pixels at all, so only the
"memorised" grey path drew anything.

**So: if you touch the renderer, open the game and look at it.** Turn on
`?debug=1` first — the `[draw]` tally distinguishes "the call never ran" from
"the call ran and drew nothing", which is the difference between an engine bug
and a canvas bug, and this feature produced one of each in the same session.

The corollary runs the other way too, and cost a sim sweep to learn: the
simulator is structurally blind to *content* faults, because a data bug produces
perfectly valid engine behaviour. A missing `maxAmmo` meant no NPC could fire a
ranged weapon, so the entire ranged half of NPC behaviour was silently dead — and
the sim reported it as a balance problem, not a bug. `metrics.error === undefined`
is a crash check, not a correctness oracle.

### 1.4b Lesson: no Worker, because the world is shared mutable state

**There is no background sim thread in the port, and that is a consequence rather
than an omission.** The C# gave the world graph to a dedicated thread and needed
a lock to protect it, then dropped the lock. In a browser the graph cannot be
transferred — it is one shared mutable object graph — and a Worker would need
either a copy per tick (too expensive at 24.9 MB of assets and a 100x100 world) or
a lock. So the districts behind the player are advanced on the player's own idle
time instead: 60 turns of play left the neighbours 60 turns behind until
`simulateOneDistrictTurnWhileIdle` caught them up, and entering a district cost a
274 ms blocking burst, both measured.

**Consequence for anything that changes while the game is idle:** a district
transition has to catch up, so it is a visible stall, and the minimap's
revision-counter cache (§4.1d) is the thing that decides what the player sees
during it.

### 1.5 Open work

**There are no open bugs.** Everything here is work not started, or a decision not
taken. Ordered roughly by value-per-effort. The first four are the whole backlog;
the rest is context.

#### The backlog

1. **Restore the "classic did not disturb" pin. Highest value in this file.**
   `web/tests/data-tables.test.ts` used to carry a third suite comparing every
   committed JSON row against the original `src/Resources/Data/*.csv`. **It is
   deleted and the property is unpinned** — `src/` was removed from the repository's
   tracking in `cfd19ae`, so there is nothing to compare against and nothing to
   regenerate from. `web/src/gameplay/data/*.json` is now the only copy.
   The property is real: Still Alive is a second ruleset playing against these same
   tables, so the merge is only safe if classic is untouched — and taking the fork's
   tables wholesale *looks* like the merge while silently rebalancing classic (army
   ration nutrition 0.25 → 0.33, best-before 5 days → never) at the layer both
   rulesets read. The two surviving suites still catch a column the code cannot read
   and a header cell used raw as a key; what is no longer caught is **a value edited
   in one place and never regenerated in the other**.
   Fix by restoring `src/Resources/Data` and bringing the suite back — the test file's
   own header says it is worth restoring rather than rewriting, because it pinned an id
   rename (`Actors.csv` row 0, `_FIRST` → `UNDEAD_SKELETON`) that **nothing else
   records**. Failing that, commit a one-time snapshot of the vanilla CSVs as a fixture.
   Same problem blocks six generator scripts (`scripts/merge-content-tables.py:44` and
   the five port-side generators hardcode the gitignored reference tree), so **none of
   the data/sprite/sound work can be re-run or verified in CI.**

2. **Finish the `RogueGame.ts` split — §6, not started, Wave 0 included.**
   36,487 lines, 843 members, 113 reachable, 30 of those in two hubs that never move.
   The gate question *is* answered (§6.0), so this is unblocked; it is simply large.

3. **`MakeMechanicWorkshop` — the last unported C# generator.**
   `grep -rn makeMechanicWorkshop web/src/` → 0 hits; it survives only in comments at
   `TownBuilding.ts:564` and `makeClinicBuilding.ts:25`. The business cascade
   deliberately leaves its case 3 empty (`BaseTownGenerator.ts:559-563`), which is why
   the office arm almost never fires — `roll2 === 3` is the only route to
   `makeOrdinaryOffice`, and the general store takes every other decline.

4. **Touch support** — the last Phase 8 task, scoped in §5.1.

#### Open decisions

5. **Make Classic faithful in the two generator regions it is frozen out of.** Two
   deliberate dodges, each a `?:` a reader has to know about: the business region's
   `rolled` gate (`cascadeEnabled ? roll(0,99) : 0`) and the parks `greenArmsExist`
   gate. Under Classic `rolled` is 0, which makes the C#'s `roll(0,99)`-per-block free
   and keeps Classic byte-identical — at the cost of two regions whose four arms are
   Still Alive only. Removing the gates moves both pinned Classic digests and
   invalidates every saved Classic world, so it is 11 suites to re-pin
   (`grep -rl 9bb5e4907bc3f62c web/tests/`).

6. **Army-base dispatch — a decision about minimum city size, not a transcription
   error.** `CreateUniqueMap_ArmyUndegroundBase` is complete and tested but called
   from nowhere, and the call site documents why: the C# bails out of `NewGame` when no
   green district has an army office, so wiring it faithfully makes the port unable to
   start its own 3×3 test worlds. Reproducing that is *correct* and means the port
   cannot start a small world at all.

7. **29 sound ids remain inert, in 7 families** — throwables (12: dynamite, grenade,
   molotov, flashbang, plasma, fuel can, fuel pump; not a sound change but explosion
   *presentation* — `DoBlast` is still the vanilla shape), traps (6), `EQUIP_BFG_PLAYER`
   (unwireable — the BFG does not exist in the port), `DOG_BARK_*` (needs a
   `FeralDogAI` fight-emote arm), `FISHING_REEL_NEARBY` (needs the NPC catch arm's
   message). Plus **~60 non-tier ids never examined at all**. The four sound shapes
   (melee / shove / chainsaw / vomit) must not be normalised — the repo's own notes on
   why are worth reading before touching any of this.

#### Standing advice

8. **Play the game, don't just sim it.** The highest-value activity available, and the
   one that keeps producing bugs: the last six were all found this way, and none was
   visible to the sim or the build. See §1.4a for why the two are not substitutes.
   Every renderer change should be looked at in a browser.

9. **Keep sweeping sim seeds.** Crashes and hangs, not turn counts — no seed reaches
   1,000 turns, and that is *correct*, because the undead bot is shot by survivors.

10. **Watch the coverage margins.** Floors are **67/55/78/68**; measured
    **69.74/57.53/80.56/71.18**. Re-measure and re-set all four together; **do not lower
    them to hide a drop.**

    One caution that is a coverage trap rather than a margin problem: **a test that
    reads the source is a shape test, and it is blind to behaviour.** Several of the
    tests assert that a rule appears in one place (`LOS.fovKey` is the only FOV key; no
    empty `catch` without a stated reason). Those are worth having and they do fail on
    the regressions they were written for — but each was checked by re-introducing the
    bug and watching the test fail. **A source-grep test that was never broken on
    purpose is a comment with a build step.**

**If a new bug turns up**, the pattern that has worked every time: find the class, not
the instance. Every bug fixed in this port was a specific thing replaced by something
general — a table by a loop, an id lookup by a row index, a threaded parameter by a
default field, one coordinate space by two. Then pin it with a test that asserts the
*relationship* rather than a value, so the next drift fails loudly.

**And one habit this project keeps paying for**, from the ~30 sessions that produced
this file: **a test that was green before your change is evidence, not noise.** A large
share of the failures in any port-wide sweep are fixtures coupled to a *seed* or a
*sweep width* rather than to the property the test is named for — and just as often
the reverse, a test that was passing *vacuously*. When a re-base fails, ask whether the
assertion is about the property or about a dice outcome, ask whether the generator moved
for a reason that makes the old answer wrong, and then ask whether the test was passing
at all. Sweeping seeds is the last resort, not the first. And check the district size
before the seed: `MAP = 40` is smaller than any district the reference can generate
(`districtsSizeFloor` is 50 under Still Alive), so three building suites were asserting
over an empty set and passing.

### 1.6 Known non-bugs (do not re-investigate)

- ~~**`tests/integration/reproducibility.test.ts` fails on Windows** with
  `spawnSync npx ENOENT`.~~ **Fixed 2026-09-27, then re-broken and fixed again
  2026-09-28 — read all three states, because the middle one is the lesson.**
  It shelled out to a bare `npx`, which resolves only to `npx.ps1` on Windows,
  and `execFileSync` does not go through PowerShell. The first fix replaced that
  with `node_modules/esbuild/bin/esbuild` invoked through `process.execPath`,
  justified in a code comment as *"`.../bin/esbuild` is a plain Node script, so
  invoking it with the current executable needs no shell … on any platform."*

  **That was false, and the comment is what kept it false.** On Linux and macOS
  `esbuild/bin/esbuild` is the *native binary* — a statically-linked Go ELF
  executable — so `node` parsed its ELF header and threw `SyntaxError: Invalid or
  unexpected token` from `beforeAll`. All three tests in the file were **skipped**,
  `npm run verify` failed, and CI was red on `ubuntu-latest`. The Windows fix had
  broken Linux, and the failure was invisible in the file because the bug was in
  a *comment* asserting something untrue rather than in the code it described.

  The real fix is to stop reaching for an esbuild CLI: there is no path to one
  that is correct on every platform, since it is an ELF, a Mach-O, a `.cmd` or a
  `.ps1` depending on both the OS and the install. The suite now bundles through
  esbuild's **JavaScript API** (`import { build } from "esbuild"`), which is the
  same interface everywhere and needs no subprocess. **`npm run verify` completes
  end to end, and this time on Linux as well as Windows.**

  The transferable part: *a comment asserting a fact about a tool is not a
  verification of it.* Two of the three bugs fixed in this pass were found by
  reading a comment and checking it, and in both cases the comment was the bug.
- **The untracked `icon.png` in the repo root** is not referenced by anything
  (the app uses `web/public/icon-192.png` and friends) and was not produced by
  any code in the tree. Left uncommitted rather than guessing at it.
- **The first load is slow** (the whole image set before the menu appears —
  1 009 ids today, ~395 when this was written). That is
  correct — C# preloads too — and the service worker caches them so later loads
  are instant. Bump `CACHE_VERSION` in `web/public/sw.js` when releasing, or
  clients keep the old bundle and the update only lands on the *next* load.
- ~~**A raw NUL byte in `web/src/ui/CanvasUI.ts` made the file invisible to
  `grep`.**~~ **Fixed 2026-09-28.** `CanvasUI.downloadName` built a
  filename-sanitising regex with *literal* `0x00` and `0x1F` bytes instead of the
  escapes `\x00`–`\x1F`. The code was correct, and a source file containing a NUL
  is classified as **binary** by `grep` and ripgrep — so every `grep -rn` over
  `src/` answered `binary file matches` and reported **no findings at all** for
  one of the two most important UI files. A tool reporting zero findings is
  indistinguishable from a clean audit, which is worse than a loud failure.
  `git grep` was unaffected (git's heuristic only inspects the first 8 KB), so the
  file was visible to `tsc`, to `git grep`, and to nothing else.
  `tests/silent-failures.test.ts` now walks `src/` itself and fails if any file
  would read as binary.
- ~~**Three `farm_fence` image ids were lower-cased against upper-cased
  files.**~~ **Fixed 2026-10-02 (`7763447`)** — and it is worth keeping the shape,
  because the failure was quieter than a red test. `GameImages.ts` declared
  `farm_fence_ew` / `_ns_right` / `_ns_left`; the C# spells them `_EW` / `_NS_right`
  / `_NS_left` (`GameImages.cs:619-621`) and the files carry that capitalisation.
  So it is **the same defect twice**: a transcription that is a faithful *string*
  and an unfaithful *file*. It 404'd in every browser and in the desktop build —
  the farm rendered with invisible fence posts — while working on a
  case-insensitive filesystem, and it sat there as two failing
  `sprite-assets.test.ts` cases from the moment the farm building landed. The
  guard that should have caught it earlier is `toBeGreaterThan(200)`, so the
  assertion passed straight through 614 constants of growth.

  **The transferable part: an id that does not match its filename on a
  case-sensitive filesystem is a bug that a developer on macOS or Windows will
  never see.** Two of this project's own asset defects were that (here and
  `ITEM_BIO_FORCE_GUN`), and both were transcription slips rather than
  misunderstandings — which is why the asset tests now resolve *every* id through
  the same path the managers use, rather than spot-checking names.

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

**[corrected 2026-10-03] The file this points at, `web/.porting/CONVENTIONS.md`, does not
exist and never has** — `git log --all -- '*CONVENTIONS.md'` returns nothing;
`web/.porting/` holds only `assemble_roguegame.py`, `gen_stubs.py` and
`roguegame-methods.txt`, and is itself untracked. Rule 1 below is moot (`src/` deleted,
see the header). **Rule 2 is currently violated.** The rules are inlined here so this
section stands on its own.

1. ~~**Never modify `src/`** (the C#). It is the reference.~~ **Moot since `cfd19ae`** —
   `src/` is untracked. The divergence discipline still holds and is honoured at each fix
   site in the code; only the mechanical check is gone.
2. **No platform leakage** — `engine/` and `data/` must not import from `ui/`. Only
   `main.ts` and `ui/` touch the DOM.
   **[corrected 2026-10-03] This rule is currently violated in three places**, all of them
   deliberate-looking and none of them marked as a divergence:

   | Site | Import |
   |---|---|
   | `web/src/engine/RogueGame.ts:111` | `from "@ui/BackpackPanel"` |
   | `web/src/engine/RogueGame.ts:234` | `import { OptionsScreen } from "@ui/OptionsScreen"` |
   | `web/src/engine/GameOptions.ts:23` | `from "@ui/fonts"` |

   **Why the headline conclusion still holds:** nothing in `engine/` or `data/` reaches
   `document` or `window` directly, which is the property `MULTIPLAYER_PLAN.md` §1 leans
   on ("the headless simulator and a multiplayer server are the same program"). These three
   are module-level imports of *pure* helpers (a panel descriptor, a screen descriptor, a
   font-metrics table), not DOM access. But the rule as written is false, and
   `MULTIPLAYER_PLAN.md` cites it as a satisfied prerequisite. Either amend the rule to
   say "no *DOM access*, module imports of pure `ui/` helpers permitted" or invert the
   three imports — the former is two lines of documentation, the latter is three edits and
   a re-measure of the surface pins.
3. **Async-first** — anything that blocks in C# (waiting for input, `Thread.Sleep`) becomes `async` + `await`.
4. **C# → TS mapping:** `System.Drawing.*` → `engine/Color|Point|Rect`; `System.Random` → `DiceRoller` (Mulberry32); `Application.Run()` → async loop with `await UI_WaitKey()`; `BinaryFormatter` → JSON in `localStorage`; SFML/DirectX audio → Web Audio API; `Thread` + `Invoke()` → single-threaded async.
5. **`enum` flags stay numeric.** C# `[Flags]` enums must keep their integer values — the TS uses bitwise `|`, `&`, `~` directly and `Rules.canActorFireAt` relies on it. Reordering an enum silently breaks every bitmask test.
6. `enum` members with colliding names across namespaces (e.g. `Rules.Goal`, `Session.Goal`) are one flat `const enum` in the port.

### Build / verify

| Command | Purpose |
|---|---|
| `npm run verify` | type-check + coverage + build — what CI runs, in one command |
| `npm run type-check` | `tsc --noEmit`; covers `src/`, `sim/` and `tests/` — necessary, **not sufficient** |
| `npm run test` | Vitest — 138 files / 2,956 tests, ~4 min. Measure rather than trusting a number here |
| `npm run test:coverage` | Vitest with coverage thresholds enforced |
| `npm run build` | Vite production build |
| `npm run sim` | Headless engine run — the real test |
| `npm run profile` | Draw calls per frame + engine ms/frame — the perf harness |
| `npm run serve` | Express production server (needs `build:all` first) |

---

## 4. Phase 8 — remaining

**Goal:** feature-complete, tested, deployable, with a headless harness for balance and AI verification.

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
- **Desktop releases are cut by hand, from
  `.github/workflows/release.yml`.** It is `workflow_dispatch`-only, `dry_run`
  defaults on, and it refuses to build from anything but the default branch. The
  build and publish steps are separate jobs so the job that runs `npm ci` and a
  Vite + Neutralino build never holds a token that can push a tag; the archives
  cross between them as an artifact. Inputs and the full rationale are in
  `web/README.md` § *Releasing*.
- **A `neu build` that produced no executables was a green build.** Not a
  hypothetical — this is what `npm run build:release` did on a machine without
  `web/bin/`, which is every clean checkout and every CI runner, because
  `web/bin/` is gitignored. `neu build` logs "Copying binaries...", finds
  nothing to copy, and **exits 0** with a `resources.neu` and no clients. The
  only symptom was `build-release.mjs` failing seconds later on
  `missing .../RogueSurvivorReloaded-win_x64.exe`, which names the renamed
  application binary rather than the missing prerequisite. `build-release.mjs`
  now runs `neu update` itself and then asserts the seven client files are
  present, so the error names the cause. The lesson is the recurring one:
  **absence of an error is not evidence of correctness**, and this time the
  absence was in the tool's exit code rather than in a grep.


### 4.1d Frame cost

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
| **total calls/frame** | **3 058** | **661** | −78.4% |
| engine ms/frame | 1.86 | **0.68** | −63% |

**[corrected 2026-10-03]** this table said 658 / 1.11 ms. Re-measured with
`npm run profile` at `master` `8d5dfc8`: **661 calls/frame, 0.68 ms/frame**, of which
`UI_DrawGrayLevelImage` 328.8 (49.7%) and `UI_DrawImageTinted` 117.0 (17.7%). The
document carried **two** older sets of these numbers elsewhere (956 / 0.84 and
658 / 1.11); all are now this one.

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

**Exits are outside the revision, and that is correct — do not "fix" it.** They
are the one input the cache does not track, because they are static after
generation: all six `GenerateExit` call sites are inside `GenerateWorld`, which
finishes before the map is ever displayed, so the raster's first build already
sees them. This is worth stating because the arrangement looks wrong next to
`UI_ClearMinimap` now sitting inside the guard where C# cleared every frame. If a
feature ever adds a mid-game exit, *this* is the line that has to change with it,
and the reason will not be obvious from the code.

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

**All five items are now implemented.** Items 2 and 3 were the last test work on
the Phase 8 list and both landed 2026-09-27.

#### How to write the AI behaviour tests without writing a tautology

The hazard in item 2 is reading the port and asserting what it does, which
produces a test that passes forever and proves nothing. `tests/ai-behaviour.test.ts`
takes the **expectations from the C# strategy order** and checks the port
against them:

- `ZombieAI.SelectAction` (ZombieAI.cs:118-215) is a numbered priority list —
  bump the nearest visible enemy → melee → master → **strongest master scent** →
  **strongest living scent** → push objects → explore → wander. Scent tracking
  is only reached when nothing nearer applies, and `filterStrongestScent` picks
  the trail.
- Civilians retreat from a hostile rather than engaging.

What that does *not* prove is that the port matches the C# line for line — that
is the fidelity sweeps. What it does prove is the observable
contract, and that is where the wiring bugs actually lived: one early bug was
`filterActors` letting a non-Actor percept through, and no amount of reading
`selectAction` would have found it. Both discriminators were confirmed by
breaking the code: collapsing `filterStrongestScent` to "first scent" fails the
scent test, and shrinking the FOV sensor to one tile fails 7 of the 14.

#### Three things about these scenarios that are easy to get wrong

All three cost a wrong conclusion first:

- **Clear the scent grid.** World generation leaves ~33 scents on the map, and
  the smell sensor reads a 3×3 neighbourhood of that grid, so a leftover
  `LIVING` trail is picked up as if the test had placed it.
- **Scent is not long-range, and it has a high floor.** The sensor reads 3×3,
  and `actorSmellThreshold` is 163 for a zombie (SMELL 40 of
  `OdorScent.MAX_STRENGTH` 270). A trail below that is discarded before
  `filterStrongestScent` sees it — an early draft used strengths of 90 and 10,
  both under the floor, and concluded the AI followed the *weak* trail.
- **The zombie and the civilian acquire threats differently.** The zombie needs
  line of sight; civilians are unscented (`SMELL = 0`) so a zombie must *see*
  them, while a civilian reacts to a zombie through a wall because it hears one
  (AUDIO 16). Measured, not assumed: the civilian retreats at every gap 1–5,
  not only when adjacent.

1. **Headless integration tests** — ✅ `tests/integration/headless-run.test.ts`. Boots a seeded 1×1 world, plays 40 turns, asserts no crash, actor accounting stays consistent, the world clock advances, and the run is neither instant nor hung.
2. **AI behaviour tests** — ✅ `tests/ai-behaviour.test.ts`, 14 cases. Zombie pursuit by sight, LOS gating (with the no-wall control), scent aggregation, and civilian self-preservation, each in an isolated flattened map. Expectations come from the C# strategy order, not from reading the port — see the note below.
3. **Generator integrity tests** — ✅ `tests/generator-integrity.test.ts`, 7 cases. No actor on a wall or out of bounds, nothing out of bounds, every map has a passable tile, the player starts passable in the largest region, and no surface district is sealed. The connectivity threshold is measured, not guessed: 75.6%–100% across a six-seed sweep, so it is set at 60%.
4. **Save/load roundtrip** — ✅ and now a **full** pass rather than the partial one
   this item used to record. `tests/save-graph-roundtrip.test.ts` walks a played
   world through save/load and compares it field by field, `save-graph-coverage.test.ts`
   asserts every declared field is actually written, and `persistence.test.ts` still
   covers the other five persistence modules. The `TODO(phase 4)` in
   `Session.save` that blocked this is gone.
5. **Coverage** — ✅ `@vitest/coverage-v8`, **[corrected 2026-10-03]** thresholds at
   **67/55/78/68**, set under the
   measured baseline rather than at an aspirational number. **The baseline is now
   60.17/80.71/72.66/60.17** (statements/branches/functions/lines), re-measured
   2026-09-28; it was 61.7/81.1/74.9/61.7 on 2026-09-27 and 60.78/81.11/73.22/60.78 now, against
   52.68/77.14/59.97 when the data-layer audit landed. Statements and lines have
   *fallen* from a peak of 65.15/65.15: the renderer, HUD, options, font and
   serialisation work added reachable UI code the suites cover less thoroughly than
   the engine does. Margins are still wide; re-measure and re-set all four
   together rather than letting `verify` fail on them or lowering them to hide a
   drop.


---

## 5. Future Plans

Not scheduled, not started. Recorded so the next person does not have to
rediscover the context. Ordered roughly by value-per-effort.

### 5.1 Mobile / touch support (Phase 8 task 12)

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
that is done right, the ~26 KLOC game loop does not need to know.

### 5.3 Renderer and layout

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
  view grew from 21×21 to 27×21 tiles, so a real browser measurement of actual
  fps is still outstanding, as is a re-profile at the new view size.
- **The two-tier canvas font is a stopgap.** Once menus are HTML, the 10pt/12pt
  split can collapse back to one size. Note the HUD face is **10pt, not the
  8.25pt** this section used to claim: the port raised it to match the larger
  widescreen layout, and every panel constant (`SIDEPANEL_SECTION_HEIGHT` among
  them) was re-derived against the larger leading. The overlap bug was what happens
  when that re-derivation is done from two of the three terms.
- **The typeface is now an option, so the "one fixed face" assumption is gone.**
  Four vendored families plus the platform stack, all 0.6 em, all subset to the
  charset the game can draw. Anything that hard-codes a *glyph shape* expectation
  rather than a width will now meet four sets of shapes.

### 5.4 First-person / pseudo-3D view mode

**Built** (14 commits, merged to `master` as `f01ea5d`). A **second renderer behind
an option** — `(Gfx) View Mode`, defaulting to top-down, so the C# behaviour is what a
first run still shows. `F` toggles it in game; the options screen is its real home, and
the hotkey writes the *option* then calls the same `ApplyOptions` the options screen
does, so there is one place a view change takes effect. The list labels it
`(experimental)` — a claim about the renderer, not the option: the stored value is
still `"first-person"` because `isFirstPersonView` compares it exactly, and an
annotated value would read as top-down and silently hand the player the other view.

#### The design decisions that still constrain anyone who touches it

These are the reason the section was worth 309 lines, and the reason it is not simply
deleted as history. Each was a fork in the road where the obvious implementation was
wrong:

- **The tile loop is the discriminator between the renderers, and not the method you
  would guess.** Top-down spends **117** `UI_DrawImageTinted` and **328.8**
  `UI_DrawGrayLevelImage` per frame. First person spends `UI_DrawScene` 1 and **zero**
  of those two — the test asserts `tileDrawCalls()).toBe(0)` outright.
  `UI_DrawImage` is 43 in *both*, because the minimap's position markers go through it.
- **Rendering is gated on `tile.isInView`, not on the camera's cone.**
  `Rules.actorFOV` is a circle of ~9.24 tiles and the camera is a cone, so rays reach
  walls the player may not see. Drawing those hands over exactly what the rules
  withhold. A wall in view is drawn; one out of it is fog.
- **Two tile styles are billboards.** Some sprites are drawn as vertical strips
  (`edge`-fogged walls, transparent corners); some are not.
- **`UI_DrawGrayLevelImage` is the first-person tile path** and `UI_DrawImageTinted` is
  the top-down one. Swapping them is the obvious "simplification" and it breaks both.
- **`m_AnimOffsets` is written by `AnimateAttackLunge` and read by
  `DrawActorSprite`**, and the field is *not* render-only despite living near the
  renderer. §6.6's Wave 2 has to decide its ownership before that region moves.

#### Still open

- **Frame rate is unmeasured in a real browser.** See §5.3.
- **First-person goldens exist** — `tests/goldens/firstperson/`, 8 frames — and must be
  byte-identical across §6 Wave 2. They are the strongest available check on that move.
- **The 864×672 viewport and the DPR-correct canvas** are settled; the map zoom is
  1×/2×.

## 6. `RogueGame.ts` decomposition

> ## 6.0 Re-measured 2026-10-02, re-checked 2026-10-03 — Wave 0's gate, answered
>
> **[corrected 2026-10-03] "Wave 0 done" overstates it, and the table below is a week
> stale.** Two separate things were conflated:
>
> - **The gate question was answered** — by this measurement. Nothing private is reached
>   from outside the class, so §6.10's stop condition is not met and the refactor can
>   proceed. That finding still holds.
> - **Wave 0's *deliverables* do not exist.** §6.4's stated deliverable is
>   `GameContext` + `tests/helpers/game.ts`, and §6.10's table lists Wave 0's stop
>   condition as *"`GameContext` + `tests/helpers/game.ts` exist"*. Neither is there:
>   `web/src/engine/GameContext.ts` does not exist, and `web/tests/helpers/` holds only
>   `assetPath.ts`, `grepAll.ts`, `png.ts`, `softRaster.ts`. **No wave has been started,
> Wave 0 included.**
>
> **Status: nothing started. §6.2–§6.9's `file:line` citations are stale; use §6.0.1's
> table instead.** Those were taken on 2026-09-29 at 27,722 lines;
> the file is **36,487** (it has since taken the army-base underground work).
> It did not grow at the end — ported content landed in
> the middle — so a line range no longer identifies a region. Re-running §6.2's
> own table against the current file puts `DoSay` (`:21697`) and `DoUseItem`
> (`:22557`) in the "render cluster" it describes as a leaf with 11 outbound
> edges. Both are hub action methods.
>
> `scripts/measure-roguegame.mjs` classifies **by member name**, which is what
> §6's prose always described, and `tests/roguegame-surface.test.ts` pins its
> output so the numbers below cannot rot unnoticed.
>
> | | §6 (2026-09-29) | measured 2026-10-02 | **re-measured 2026-10-03** |
> |---|---|---|---|
> | file | 27,722 lines | 36,116 | **36,487** |
> | members | 584 | 836 | **843** |
> | methods | 595 | 751 | **757** |
> | public | 567 of 584 | 755 of 836 | **752 of 843** |
> | private | 17 | 81 | **91** |
> | reached from outside the class | *(not measured)* | 110 | **113** |
> | … in a region §6 moves | *(assumed ~0)* | 83 | **83** |
> | … in a hub, which never moves | — | 27 | **30** |
> | … **private** members reached from outside | — | 0 | **0** |
> | … in **no region §6 names** | — | 68 | **0** ✅ |
>
> Re-measure with `cd web && node scripts/measure-roguegame.mjs` — it is a generated
> pin, never hand-edit it. `tests/roguegame-surface.test.ts` asserts the output, so
> these cannot rot silently; note its own comments are stale in two places (`:28` says
> "now 35,961", `:131` says "from 17 to 90" while asserting 91).
>
> The two structural facts §6.10's gate rests on **both still hold**: 30 of 113 reached
> names sit in the two hubs that never move, and **zero** private members are reached
> from outside. The last row also improved — the 68 unclassified names are now all
> classified.
>
> **§6.10's stop condition is not met.** *"Stop if Wave 0 turns out to require
> changing a public signature that a test or `HeadlessRunner` depends on."* Nothing
> private is reached from outside the class: the two tests that need to be inside
> it do it through `prototype as any` (`gender-helpers.test.ts:41`,
> `minimap-cache.test.ts:162`) and one hand-builds a structural double
> (`panel-hitboxes.test.ts:96`), none of which is a public signature and none of
> which a wave can break. So the absent `private` boundary that §6.4 worries about
> costs nothing *at the seam*, which is the only place it would have cost
> anything.
>
> **The deferral's cost estimate is wrong, favourably.** §6.1 quotes the 2024
> deferral: "a split would … thread a `game` reference through ~500 call sites."
> The measured figure is **110 names** — every one a signature a wave must
> preserve. §6.4's `GameContext` was to name about sixteen ("the 11 service
> fields … plus `m_Player`, `m_PlayerFOV`, `m_MapViewRect`, `m_Overlays`,
> `m_FirstPersonFacing`"); the real figure is nearly seven times that. That is the
> answer to the question §6.4 deferred "until the game runs and the real
> cross-method dependencies are known".
>
> **And the region table is incomplete, which is the blocker.** 68 of the 110 are
> in no region §6 names — and they are not neutral leftovers. They include
> `AddMessage`, `AdvancePlay`, `KillActor`, `UpdatePlayerFOV`, `SpawnActorNear`,
> `RefreshPlayer`, `ApplyOptions`, `LoadGame`, the whole map-zoom triple
> (`MapZoom`/`SetMapZoom`/`StepMapZoom`) and the first-person pair
> (`TurnFirstPerson`/`ToggleViewMode`) — plus the state `GameContext` exists to
> carry: `m_PlayerFOV`, `m_PlayerWasRescued`, `m_CharGen`, `m_IsGameRunning`,
> `player`, `rules`, `keyBindings`, `options`, `gameItems`, `gameFactions`.
> **68 is larger than Wave 1's entire 2,079-line budget.** "Extract the leaves,
> keep the hubs" is right about the hubs and silent about the majority, so the
> §6.5–6.7 sequencing ("cheapest first") rests on a line budget that no longer
> describes the file.
>
> ### 6.0.1 The re-derived region table — the blocker, resolved
>
> §6.2's regions were a list of `file:line` ranges and left **68 of the 110**
> unclassified. They were not leftovers: they included `AddMessage`, `KillActor`,
> `AdvancePlay`, `UpdatePlayerFOV`, `SpawnActorNear`, `RefreshPlayer`, `ApplyOptions`,
> `LoadGame`, the map-zoom triple and the first-person pair — **more names than Wave 1's
> entire 2,079-line budget.** So §6.5–6.7's "cheapest first" ordering had no input.
>
> `scripts/measure-roguegame.mjs` now classifies **the whole class** by member name,
> into regions ordered by **extractability** rather than by position in the file —
> because position is not what decides what to do first, and the file has no layout
> that matches anything useful:
>
> | region | reached | extractable as | what is in it |
> |---|---:|---|---|
> | **`HUB 1`** | ~~20~~ **23** | **never moves** | `Do*` / `On*` action primitives |
> | **`HUB 2`** | 7 | **never moves** | `HandlePlayer*` / mouse command handlers |
> | `WAVE 1` | 6 | a leaf — no instance state | `Describe*`, `MapToScreen`/`ScreenToMap`, `GetUser*`, the `do*` aliases |
> | `WAVE 2` | 2 | a view interface | `DrawMap`, `RedrawPlayScreen` |
> | `WAVE 3` | 7 | last — deepest state | the new-game flow |
> | **`VIEW`** | 13 | a view interface | first-person facing, map zoom, screen projection, panel hit-testing, `IsVisibleToPlayer` |
> | **`WORLD`** | 15 | session + map | actor spawning, district entry, `RefreshPlayer`, helicopter rescue sites |
> | **`ENGINE`** | 17 | session + options | the turn loop, damage, `ApplyOptions`, `LoadGame`, reincarnation |
> | **`STATE`** | 23 | **carried, not moved** | fields, constants, and two sim callbacks |
> | | ~~110~~ **113** | | no residual |
>
> **[corrected 2026-10-03] Re-measured: 8 of these 9 rows are still exact.** Only
> `HUB 1` (20 → 23) and the total (110 → 113) moved. That makes this table the most
> current part of §6 by a wide margin, and it is why §6.0.1 rather than §6.2 should be
> the thing anyone plans against. The `STATE` bucket did gain the two sim callbacks
> §6.0 predicted (`simulateOneBehindDistrictTurn`, `stepActorsOnFire`), as recorded
> under "carried" rather than "moved" — the `carry` classification is doing its job.
>
> The three bolded non-§6 rows are the new part, and between them they account for
> **45 of the 110** the old table could not place.
>
> **§6.4's `GameContext` has to name 23 things, not 11.** §6.4 proposed "the 11 service
> fields … plus `m_Player`, `m_PlayerFOV`, `m_MapViewRect`, `m_Overlays`,
> `m_FirstPersonFacing`" — about sixteen. Measured, it is 23, and the list is *not only
> fields*: `TAG_MODE_TEXT`, `MAX_THROWABLE_DISTANCE` and `VERB_UNLOAD` are constants the
> UI reads, and `simulateOneBehindDistrictTurn` and `stepActorsOnFire` are **methods**
> the headless sim reaches. So "a context of fields" is the wrong shape — hence the
> `carry` classification rather than assuming everything in that bucket is data.
>
> **Wave 1's reachable seam is 6 names, not a region.** `DescribeActorActivity`,
> `DescribeItemLong`, `GetUserNewScreenshotName`, `MapToScreen`, `ScreenToMap`,
> `doEquipItem`. The wave itself is much larger than the part of it anything outside the
> class touches, which is worth knowing before scheduling it — and it is the concrete
> answer to §6.4's "when the game runs and the real cross-method dependencies are
> known".
>
> ### 6.0.2 What this changes about the waves
>
> The gate is answered (**proceed**) and the ordering is now derived rather than
> assumed. Read the table as a schedule, cheapest first:
>
> 1. **`STATE`** first, before any extraction. Nothing moves until the 23 carried names
>    are written down and pinned. This is §6.4's "deliberate interface pass", and it is
>    the step the old plan had no measurement for.
> 2. **`WAVE 1`** — 6 reachable leaves. Extract with a delegation left behind.
> 3. **`VIEW`** and **`WAVE 2`** together, because they share one interface: facing,
>    zoom and projection are the same state the render cluster reads.
> 4. **`WORLD`**, then **`ENGINE`**, then **`WAVE 3`** — each needs the session, and
>    `WAVE 3` needs all three of the above.
> 5. **`HUB 1` / `HUB 2` stay**, forever. §6.8's reasoning is unaffected by
>    re-measurement: they are 27 of the 110 reached, and they are the reason the split
>    is worth doing rather than the reason it fails.
>
> `tests/roguegame-surface.test.ts` pins every number above, plus the one invariant the
> scheme rests on: **no hub member appears in any movable bucket.**

> **Status: planned 2026-09-29.** *(Superseded in part — see §6.0 above: Wave 0
> has started, and every `file:line` below is stale.)* This is a refactor of the port
> itself, not a Still Alive feature. It is a **prerequisite for the Still Alive
> Stages 4–5** (both since shipped and merged), and it is what made that stage's
> "stop and refactor before Stage 5" an instruction
> rather than a shrug. Stages 1–3 of that plan do **not** need it: Stage 3 is data
> and sprites and never opens this file.
>
> **`file:line` citations below were verified 2026-09-29 and are stale — use
> §6.0's table.** Counts there are from an AST walk of the 595 methods and 173
> property declarations in the then-27,722-line file; the two regions whose
> figures changed on re-measurement are NEWGAME (28 outbound, not 51) and RENDER
> (11, not 45), because those count only calls landing *outside* the region.
> §6.0 re-measures by member name — which is what this prose always described —
> and `tests/roguegame-surface.test.ts` pins the output so it cannot rot
> unnoticed again.

### 6.1 The deferral is already on record

`86f0887` ("Port the RogueGame scaffold") says, verbatim:

> every `DoXXX` action, every `HandlePlayerXXX` command and every `Draw*` method reads/writes the same private fields (`m_Player`, `m_Session`, `m_Overlays`, `m_ViewRect`, …) — a split would make most of that state public and thread a `game` reference through ~500 call sites; […] The module table below is therefore **deferred to a post-Phase-4 refactor** (Phase 8) — it stays as the target shape **once the game runs and the real cross-method dependencies are known**.

The condition is met. The game runs, and the cross-method dependencies are now
measured rather than estimated — see §6.0, which answers the deferral's own stop
condition. The file went 4,044 → **36,487** lines. **[corrected 2026-10-03]** This is an overdue decision,
not a new one.

### 6.2 The real structure: two hubs, everything else a leaf

| Region | Lines | % | Outbound | Verdict |
|---|---|---|---|---|
| `14008–18936` `Do*`/`On*` action primitives | 4,929 | 17.8% | 410 | **Hub 1.** 212 calls into messaging alone. |
| `8770–11628` `HandlePlayer*` command handlers | 2,859 | 10.3% | 266 | **Hub 2.** |
| `23235–23492` map⇄screen coordinates | 258 | 0.9% | **0** | Free. |
| `12767–14007` `Describe*` | 1,241 | 4.5% | **4**, all messaging | Best ratio in the file. |
| `24066–24208` `GetUser*` paths | 143 | 0.5% | **0** | Free. |
| `23844–24065` menu chrome | 222 | 0.8% | **0** | Free; 14 inbound sites stay. |
| `27470–27684` `do*` aliases | 215 | 0.8% | 38, **0 field reads** | Pure adapter. Exists only for `Actions.ts`. |
| `20517–23492` render cluster | 2,976 | 10.7% | **11** | Highest value. |
| `1760–3481` new-game flow | 1,722 | 6.2% | **28** over 18 targets | Cheapest *after* Waves 1–2. |

**27.8% of the file is the two hubs**, and they are where 676 edges point. That is
the god object, and it is the part worth keeping intact. Everything else is a leaf
that happens to be trapped in the same file.

### 6.3 The recorded target table is wrong in two places

| Planned module | ~lines | Maps onto | Actual outbound |
|---|---|---|---|
| `GameActions.ts` | 6,000 | `14008–18936` | **410** — Hub 1 |
| `GameEvents.ts` | 3,000 | `4680–5977` | 79 |
| `GameRenderer.ts` | 3,500 | `20517–23492` | **11** |
| `GameUI.ts` | 4,000 | `6680–7991` + `23844–24065` | low |

The two hardest-coupled regions were slated for extraction and the two easiest for
retention. Following the recorded table would have failed, and would have been
read as proof that splitting is impossible. Retaining `GameActions`/`GameEvents`
and extracting `GameRenderer`/`GameUI` inverts that.

### 6.4 Wave 0 — the test seam, before anything else

`tests/helpers/` holds `assetPath.ts`, `grepAll.ts`, `png.ts`, `softRaster.ts` and
**nothing game-related**. Six tests construct a real
`RogueGame(new NullRogueUI(), new NullMusicManager())`; two reach through
`prototype as any` (`gender-helpers.test.ts:41`, `minimap-cache.test.ts:162`);
three write private fields (`idle-district-sim.test.ts` monkey-patches
`SimulateDistrict` on the instance); and `panel-hitboxes.test.ts:96` hand-builds a
structural fake of the whole class.

**Deliverable:** a `GameContext` interface in `src/engine/` listing the members
crossing a seam — the 11 service fields (`m_UI`, `m_Rules`, `m_Session`,
`m_MusicManager`, `m_TownGenerator`, …) plus `m_Player`, `m_PlayerFOV`,
`m_MapViewRect`, `m_Overlays`, `m_FirstPersonFacing` — and a
`tests/helpers/game.ts` that builds a conforming double. `NullRogueUI` is the
existing precedent: it implements `IRogueUI` and drops every paint call, and it is
why the sim cannot silently diverge.

Four module-level singletons must be resolved in the same pass: `s_Options`
(118 uses), `s_KeyBindings` (28), `s_Hints` (15), `s_MapZoom` (12).

**The `private` boundary was near-absent** — 567 of 584 members public at the
time, only 17 `private` (§6.0 re-measures: 755 of 836, with 81 private). A split
without a deliberate interface pass would have relocated the god object into N
sibling modules that import each other.

**What that cost, measured: nothing at the seam.** §6.0's stop condition was *"if
Wave 0 turns out to require changing a public signature that a test or
`HeadlessRunner` depends on, stop."* It does not — **zero private members are
reached from outside the class**, and the tests that need to be inside it get
there through `prototype as any` (`gender-helpers.test.ts:41`) or a hand-built
structural double (`panel-hitboxes.test.ts:96`). Wave 0 is therefore answered and
Waves 1–3 are unblocked.

### 6.5 Wave 1 — the free leaves and the alias block

2,079 lines, ~4 outbound edges in total. Cut the file to 25,643 and prove the
import graph works.

1. `24066–24208` `GetUser*` paths → `engine/Paths.ts` — 143 lines, 0 outbound, 3
   fields.
2. `23844–24065` menu chrome → `engine/MenuChrome.ts` — 222 lines, 0 outbound.
   `DrawMenuOrOptions` already populates `m_MenuRowBands` as a side effect, so
   `MenuRowAt`/`MenuRowAtMouse`/`WaitMenuInput` move as a unit and the 14 inbound
   sites become delegations.
3. `23235–23492` coordinates → `engine/MapCoordinates.ts` — 258 lines, **0
   outbound** (every `this.X(` in range is internal to it). 86 inbound
   `this.MapToScreen|ScreenToMap|MouseToMap` sites keep working through
   delegations. The 5 minimap-cache fields and `collectPlayerTagTiles` move with
   it — that static is *already* extracted for exactly this reason.
4. `12767–14007` `Describe*` → `engine/Describe.ts` — 1,241 lines, 4 outbound (all
   messaging), 23 field reads, all header verbs/colours. 56 inbound sites
   delegate. `GetAdvisorHintText` (501 lines) is a pure function of state and is
   the best single item in the region.
5. `27470–27684` `do*` aliases → `engine/GameFacade.ts` — 215 lines, 0 field
   reads, one consumer. It exists **solely** so `Actions.ts` can use camelCase,
   and moving it behind the Wave 0 interface is the last thing standing between
   `Actions.ts` and a real type.

Wave 1 is where most of the risk profile is settled: 4 of the 5 extractions are
leaves that never call back into the hubs.

### 6.6 Wave 2 — the render cluster

`20517–23492`, 2,976 lines, 11 outbound. The shape is already validated:
`firstperson/` was built alongside from the first commit with a **37-line
bridge** (`RogueGame.ts:21085-21121`) and a plain `SceneInputs` object, and
`SceneBuilder` holds no `RogueGame` reference at all. `web/README.md:132-134`
promises the `// C# Foo — RogueGame.cs:12345` comments make regressions
traceable, and splitting along C# `#region` boundaries *improves* that promise.

- **`engine/MapRenderer.ts`**, taking a `SceneInputs`-shaped data object. Follow
  `buildScene` exactly: data in, geometry out, no `this`.
- **152 `RedrawPlayScreen` sites and 191 overlay-method sites stay on
  `RogueGame`** as one-line delegations. This is the whole reason Wave 2 is safe
  and the reason it is not a rewrite.
- **`m_AnimOffsets` is the one field that crosses the seam** — written by
  `AnimateAttackLunge` (`:15270`, gameplay) and read by `DrawActorSprite`
  (`:21518`). Its own comment at `:15205` already calls it "a render-only value",
  so the field moves to the renderer and `AnimateAttackLunge` writes through a
  renderer method. That is the one design decision this wave requires.
- `IsValidPointInRect`/hint plumbing is unchanged.

### 6.7 Wave 3 — the new-game flow

`1760–3481`, 1,722 lines, 16 methods, 28 outbound calls to 18 targets. It is the
worst ratio in the file **as measured on day one** — and that ratio is why it goes
last, not whether it goes at all. Because Waves 1–2 land first, 20 of its 28 edges
terminate in modules that by then already exist:

| Outbound target | Lands in |
|---|---|
| `DrawMenuOrOptions`, `DrawHeader`, `DrawFootnote`, `MenuRowAtMouse` | Wave 1 `MenuChrome` |
| `GetUserSave`, `GetUserManualFilePath`, `GetUserHiScoreTextFilePath` | Wave 1 `Paths` |
| `DescribeSkillShort` | Wave 1 `Describe` |
| `AddMessage`, `ClearMessages`, `ClearMessagesHistory` | messaging (Wave 1) |
| `HandleHelpMode`, `HandleHintsScreen` | sibling modal screens |
| **`GenerateWorld`, `RefreshPlayer`, `RedrawPlayScreen`, `ApplyOptions`, `LoadGame`** | **hubs — 5 edges stay** |

So it goes from 28 hub-ward edges to ~5. It is `HandleSelectRulesetAndMode` that
makes it worth doing anyway: the new-game flow is the natural home for the ruleset
picker, and adding a screen to a 1,722-line region is materially worse than
adding it to a module.

### 6.8 Never — the two hubs

`14008–18936` (4,929 lines, 410 outbound) and `8770–11628` (2,859 lines, 266
outbound) stay. Together they are 27.8% of the file and the reason the split is
worth doing rather than the reason it fails. If a future split proposal starts
here, it is the same proposal the 2024 deferral already rejected, with the same
measured reason.

### 6.9 What breaks, in the order it breaks

**Five source-scanning assertions fail silently, and this is the one to fix
first.**

- `rule-result-usage.test.ts:111-116` reads `RogueGame.ts` as text and asserts
  `canActorRun(actor).ok` and
  `canActorInitiateTradeWith(this.m_Player, actor).ok` appear. Those bodies move
  in Wave 2 and 3; the test then either fails for the wrong reason or — worse —
  stops matching and guards nothing.
- `gender-helpers.test.ts:89-99` greps for one sentence and asserts it appears
  **exactly once**.
- `minimap-cache.test.ts:203` greps `src/` for a decoration call; it survives, but
  `collectPlayerTagTiles` must stay reachable as a static.

The precedent for the fix is `map-screen-conversion.test.ts:140-155`, which
documents replacing a scanner because *"its pattern never matched the source it
was guarding … and there is no version of a regex over a 26 000-line file that is
not one formatting change away from asserting nothing again."* **Each of these
becomes a behavioural test before its region moves**, not after. This is the same
discipline as §1.5's standing advice.

Also: `web/.porting/assemble_roguegame.py` is gitignored, untracked and already
dead (it hardcodes inputs that no longer exist). A split invalidates a dead tool,
nothing live.

### 6.10 Sequencing, verification, and stopping

| Wave | Lines out | Residual | Gate before the next |
|---|---|---|---|
| 0 | 0 | 27,722 | `GameContext` + `tests/helpers/game.ts` exist; the 4 singletons resolved; the 567 public members given a deliberate pass — **[corrected 2026-10-03] NOT MET: neither file exists** |
| 1 | 2,079 | 25,643 | `npm run verify` green; the 4 scanners replaced by behavioural tests |
| 2 | 2,976 | 22,667 | first-person goldens unchanged; the `m_AnimOffsets` decision made and tested |
| 3 | 1,722 | 20,945 | new-game flow reachable end to end in the sim |

**The residual column is the 2026-09-29 figure and is ~8,400 lines optimistic.**
The file was 27,722 then and is **36,487** now. **[corrected 2026-10-03]** Wave 0 has
*not* been done — its two deliverables do not exist — and
§6.0 re-derived the regions by member name, so **these four rows are a schedule,
not a measurement** — re-run `scripts/measure-roguegame.mjs` before Wave 1 and
take the line counts from that. The region boundaries in §6.2 are the part that
has genuinely rotted: `DoSay` and `DoUseItem` now sit inside what §6.2 calls the
render-cluster leaf, and both are hub action methods.

**Every wave is a pure move.** No behaviour change, no signature change that a
caller notices, one commit per region with the file's line count as the reviewable
diff. `npm run verify` green at each: 935 tests, type-check, build. The
first-person golden PNGs (`tests/goldens/firstperson/`, 8 frames) are the strongest
available check on Wave 2 and must be byte-identical.

**Stop if** Wave 0 turns out to require changing a public signature that a test or
`HeadlessRunner` depends on — that is the moment the deferral's stated cost
("thread a `game` reference through ~500 call sites") turns out to be the real
number rather than the pessimistic one, and the honest move is to stop and reassess
rather than push three waves deep. **Do not start Wave 1 before that is answered.**

---

## Citation drift — what to trust in this file

Added 2026-10-03, rewritten at the trim. This pass fixed the claims that had become
**actively false** and verified every one against `master` at `8d5dfc8`. It did **not**
re-grep the `file:line` citations. A sampled audit of 48 of them, before the trim:

| Outcome | Count |
|---|---|
| Still correct (line or ±3, content matches) | **19** |
| Drifted (file exists, line moved or content changed) | **23** |
| Point at a file that no longer exists | **6** |

**Re-grep before trusting any line number here.** The port reorganised
(`web/src/engine/*` → `web/src/gameplay/*`, plus new `ai/` and `generators/` trees) and
`RogueGame.ts` grew 32,753 → 36,487 lines, so most drift is large: `DoSay` `:21697` →
`:21743`, `DoUseItem` `:22557` → `:22631`, the first-person bridge `:21085-21121` →
`DrawFirstPersonScene :29165-29215` (≈8,000 lines), `DropActorScents` `:15185` → `:5569`,
`LoadData` `:27400` → `:36147`.

**Gone, and not coming back:** all 11 `*.cs:NNN` citations (the C# `src/` is untracked);
`web/.porting/CONVENTIONS.md` (never existed — see §2's porting rules, which are now
inlined); `server/index.ts` at the repo root (it is `web/server/index.ts`);
`tests/headless-zoom.test.ts` (it is `tests/integration/`); `icon.png` (deleted).

**Still accurate, and worth not re-deriving:** all six §6.9 "scanners that break
silently" citations; §6.0.1's region table (8 of 9 rows exact); §1.4a's "one simulation
per test file" and the slow-test opt-in; `PENDING_WIRING` empty; `release.yml`'s shape;
the asset accounting (2,403 files / 2,175 WebP / 226 `.ogg` / classic 1,108); and
§5.3's open list except the "First person spends 94" line, which §5.4 above corrects.

## Also wrong, not yet fixed

Known-stale, deliberately left rather than half-fixed:

- **§4.1b still describes Docker as the deploy path.** It is not — `Dockerfile:3-5` says
  so in capitals. The real path is `.github/workflows/pages.yml`, publishing the `docs/`
  site via `npm run build:pages` / `build:site` / `stamp-cache-version.mjs`. None of
  that was in the plan at all, and `.dockerignore:3-5`, `Dockerfile:18-22` and
  `ci.yml:128-129` all still describe excluding "`src/` (58 MB)", which no longer exists.
- **§2's Build/verify table is missing six npm scripts** — `test:slow`, `build:pages`,
  `build:site`, `preview:site`, `build:release`, `check:base`.
- **§6.2's 9-row line-range table is dead** — all 18 boundary lines land on unrelated
  code. §6.0.1 supersedes it; §6.2 should probably be struck rather than corrected.
- **§6.4–§6.8's counts**: `s_Options` 118 → **141**, `s_KeyBindings` 28 → **31**,
  inbound `MapToScreen|ScreenToMap|MouseToMap` 86 → **92**, `RedrawPlayScreen` sites
  152 → **178**.
- **§1.6's defect count is inconsistent four ways** — the heading says eight, the old ToC
  said seven, the body enumerated eleven, and the body says "not six edits". Pick one.
- **`hasFeature` does not throw** on an unhandled id, though §5.6 used to claim it did.
  It is a plain `Set.has()` (`FeatureFlags.ts:245-247`). The throw discipline exists in
  `GameOptions.optionName` / `.describe` (`GameOptions.ts:1290` / `:1416`), not here.
  Either write the guard or stop claiming it.
- **The test index is gone with §4.1a**, which is the right trade at 141 files — but the
  replacement is `ls web/tests/`, and there is no map from test file to subsystem.
- **`plans/` has no forward links between its files.** `STILL_ALIVE_JOURNAL.md`,
  `SUGGESTIONS.md` and `MULTIPLAYER_PLAN.md` all cite this one; this one cites none of
  them, and the two that were deleted were cited from four places.
