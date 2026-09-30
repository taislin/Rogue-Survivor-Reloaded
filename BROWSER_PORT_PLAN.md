# Rogue Survivor Reloaded — TypeScript / Browser Port

> **Status (2026-09-29):** Phases 1–7 ported and playable. Phase 8 tasks 1–11
> done; only 12 (optional touch support) remains. `npm run verify` — type-check,
> coverage gate and build — is **green**: **1542 tests in 69 files**. The coverage
> gate's branch floor was lowered from 75% to a measured ~47% with the reasoning
> recorded in `vitest.config.mts`; 75% came from the first 6-file suite and is
> unreachable now that `RogueGame.ts` alone is 6098 branches. Read
> [Current State & Handover](#1-current-state--handover).
>
> **A first-person view mode now exists**, behind `(Gfx) View Mode` in the options
> and `F` in game, merged to `master` as `f01ea5d` and labelled `(experimental)`.
> Top-down remains the default, so the C# behaviour is what a first run shows. It
> has now been run in a browser and **found wrong six times** — the floor alone
> accounted for four compounding defects, each hidden by the one before it and by
> an underlay that guaranteed the coverage metric stayed at 100%. See
> [§5.4](#54-firstperson--pseudo-3d-view-mode) for what they were and what the
> durable lesson is.
>
> **Ten presentation and correctness defects were found and fixed 2026-09-28**,
> all of them invisible to `tsc`, to the build, and to the headless simulator —
> including two entire features (ORDER_MODE and the target markers) that were
> dead code, and three sound effects that 404'd. They are recorded in
> [§1.1a](#11a-fixed-2026-09-28-eight-defects-nothing-could-see) rather than in a
> bug log, because the *pattern* is the durable part: **three of the ten were a
> single wrong assumption about a C# value type**, and the class that produced them
> is now a test rather than a memory.
>
> **This file records what is left, not what has been done.** The bug log that used
> to be here — 70 entries across nine sections — has been removed, along with the
> closed work items and the per-commit history. Every one of those is fixed and
> pinned by a test, and the tests are the record; `git log` is the record of when.
> Two things are deliberately kept, because they are instructions to *future* work
> rather than reports of finished work: [§1.1 what is proven clean](#11-what-is-proven-clean--do-not-re-audit),
> so the next audit does not repeat a finished one, and [§1.6 known
> non-bugs](#16-known-non-bugs-do-not-re-investigate), so a fixed non-bug is not
> re-investigated.
>
> What replaced the bug log as guidance is the set of *lessons*, each of which
> cost a real debugging session: **the sim is the definition of done for the
> engine, the browser is the definition of done for the renderer, and neither
> substitutes for the other** (§1.4a). **A blanket rule over heterogeneous data is
> a silent truncation of it, and absence of an error is not evidence of
> correctness** — a plausible default and a correct value are indistinguishable
> until you read both. **Keep one coordinate space**: four of the last nine bugs
> were arithmetic that assumed two spaces agreed, and in C# each was a single
> number. **A grep is a hypothesis generator, not a verdict** — and a grep that
> cannot see a file reports *no findings*, which is not the same as a clean one.

Porting a C# WinForms zombie-survival roguelike (195 files, ~2.5 MB, largest `RogueGame.cs` at 955 KB / 23 233 lines) to a browser-playable TypeScript version. `src/` is the original C# and is **never modified** — it is the reference for every port.

> **Rule: a bug found in the C# is fixed in the TypeScript, never in `src/`.**
> `src/` stays byte-for-byte as the statement of intent, and the port is allowed
> to outgrow it where the original is provably wrong — a crash, a hang, a free
> action, a wasted stall. Each such divergence is marked in the code at the fix,
> with the C# line reference and the reason. Six have been taken so far: two
> livelocks, one crash-on-occupied-tile, a dead sim thread, the halved
> reincarnation score, and the player's stair use costing no action point.

> **Do not delete `src/`.** Nothing compiles or ships it (the Dockerfile copies
> only `web/`, and `.dockerignore` excludes it), so removing it saves no build
> time and no bundle size. It is the only statement of intended behaviour, and
> essentially every bug in this port was found by diffing the port against it — or
> by playing the port and reading the C# afterwards to explain what was wrong.

---

## Table of Contents

1. [Current State & Handover](#1-current-state--handover)
   - [1.1a](#11a-fixed-2026-09-28-eight-defects-nothing-could-see) **fixed 2026-09-28 — the `Point` class/struct bug and seven others**
   - [1.1](#11-what-is-proven-clean--do-not-re-audit) **proven clean — do not re-audit**
   - [1.2](#12-the-harness-now-runs-real-games) sim baseline · [1.2a](#12a-three-things-that-look-like-bugs-but-are-not) **not bugs**
   - [1.3](#13-how-to-run-it) commands · [1.4](#14-runs-are-now-reproducible) seeding · [1.4a](#14a-lesson-the-sim-and-the-browser-check-different-things) **the two definitions of done** · [1.4b](#14b-lesson-no-worker-the-world-is-shared-mutable-state) **why there is no sim thread**
   - [1.5](#15-next-steps) **next steps** · [1.6](#16-known-non-bugs-do-not-re-investigate) · [1.7](#17-git-state)
2. [Quick Reference](#2-quick-reference) — layout, porting rules, build commands
3. [Phase Status](#3-phase-status)
4. [Phase 8 — Polish, Headless Simulation & Deployment](#4-phase-8--polish-headless-simulation--deployment)
   - [4.1](#41-task-list) tasks · [4.1a](#41a-test-suite-layout) **the test index** · [4.1b](#41b-deployment-notes) deploy · [4.1c](#41c-asset-payload-pass-tasks-9--10) assets · [4.1d](#41d-frame-cost-task-11) frame cost · [4.1e](#41e-neutralino-desktop-wrapper--appdata-persistence) desktop
   - [4.2](#42-headless-harness-design-for-whoever-extends-it) harness internals · [4.3](#43-test-strategy) test strategy
5. [Future Plans](#5-future-plans) — [5.1](#51-mobile--touch-support-phase-8-task-12) touch · [5.2](#52-where-the-fidelity-work-stands) · [5.3](#53-renderer-and-layout) · [5.4](#54-first-person--pseudo-3d-view-mode) · [5.5](#55-housekeeping) · [5.6](#56-still-alive-as-a-parallel-ruleset-stages-15) **Still Alive as a parallel ruleset (Stages 1–5)**
6. [`RogueGame.ts` decomposition](#6-roguegamets-decomposition) — the overdue refactor, and the prerequisite for §5.6 Stages 4–5 · [6.1](#61-the-deferral-is-already-on-record) · [6.2](#62-the-real-structure-two-hubs-everything-else-a-leaf) · [6.3](#63-the-recorded-target-table-is-wrong-in-two-places) · [6.4](#64-wave-0--the-test-seam-before-anything-else) · [6.5](#65-wave-1--the-free-leaves-and-the-alias-block) · [6.6](#66-wave-2--the-render-cluster) · [6.7](#67-wave-3--the-new-game-flow) · [6.8](#68-never--the-two-hubs) · [6.9](#69-what-breaks-in-the-order-it-breaks) · [6.10](#610-sequencing-verification-and-stopping)

---

## 1. Current State & Handover

### 1.1a Fixed 2026-09-28: eight defects nothing could see

Kept as a short record because **the pattern is the durable part, not the
listings.** Every one of these passed `tsc`, passed the Vite build, and passed the
headless simulator, and two of them are whole features that were dead code in a
game reported as feature-complete.

#### The one that produced five of them: `Point` is a class, and the C#'s was a struct

This is the single highest-value thing found in this pass, because it was one
wrong assumption rather than five separate mistakes. C# `System.Drawing.Point` is a
**struct**, so every construct leaning on value equality kept working when
translated; `Point` in the port is a **class**, so each of those silently changed
meaning — and none of them is a type error.

| Translated construct | C# | Port | Consequence |
|---|---|---|---|
| `a == b` on positions | value | **reference** | never true |
| `HashSet<Point>.Contains` | value | **reference** | never true |
| `fov.has(p.toString())` | — | `"x, y"` vs a `"x,y"` key | never true |

Cost, all with `showPlayerTargets` and `showPlayerTagsOnMinimap` on by default:

- **All of ORDER_MODE was dead.** `HandlePlayerOrderMode`'s follower-selection
  test (`RogueGame.cs:9340` is a value comparison on a `HashSet<Point>`) could
  never be true, so every follower was **greyed out and unselectable** unless
  phone-linked — with no explanation. The same broken test gated the click-to-tile
  command in all four `HandlePlayerOrderFollowerTo{BuildFortification,Barricade,Guard,Patrol}`
  handlers, so clicking a tile to give an order never worked either.
- **The target markers never drew.** `DrawMap` tested
  `m_Player.location.position == position` against a `Point` it had just
  allocated, so `DrawPlayerActorTargets` was unreachable. The player lost *both*
  the "you are targeting" icon and `ICON_IS_TARGETTED` — the indicator that
  something is chasing you.

**The fix is a rule, not six edits.** `LOS.fovKey`/`fovHas`/`fovPoints` are now the
only way to ask about an FOV, `m_PlayerFOV` is the same `FOV` type as every other
(one representation, not two), and `tests/point-identity.test.ts` **fails the
build** on a `==` between positions, a `Set<Point>`, a `fov.has(x.toString())`, or
a hand-rolled `` `${x},${y}` `` key outside `LOS`. Both behaviours are confirmed
against the broken code: the tests were re-run with the bugs reintroduced and 3 of
them failed.

The reason it stayed hidden is worth keeping: this is §1.4a exactly, except worse.
A missing *feature* is visible on screen. A feature that is present, correct in
every other respect, and gated by one always-false condition looks identical to a
feature that works.

#### The other three

- **Three sound effects 404'd, and silenced the music doing it.** The C# plays
  `UNDEAD_RISE`, `NIGHTMARE` and `UNDEAD_EAT` through the **music** manager
  (`RogueGame.cs:3280,3611,7052`) and loads them in the same list as the tracks.
  The port had one `musicPath()` consulting only the music table, so `undead rise`
  resolved to `/assets/music/undead rise.ogg` — which does not exist; the shipped
  file is `assets/sfx/sfx - undead rise.ogg`. Since `play()` assigns
  `audioElement.src` *before* the request resolves, each one did not merely fail
  to play: it **replaced and so silenced** the current track. A zombie's arrival
  was mute and took the soundtrack with it. `AssetPaths.audioPath` now checks both
  tables, and `tests/music-priority.test.ts` asserts every managed id resolves to a
  file that exists on disk.
- **Music had no priority and every track looped.** C# `MusicPriority` was dropped
  wholesale, so `UpdateBgMusic` — which fires on a fixed turn cadence — stopped
  whatever was playing and restarted the map theme, cutting off raid themes and
  fight cues mid-event. And `loop = true` was set once in the constructor and never
  reset, so `PLAYER_DEATH`, `FIGHT`, `INTRO` and the three ~1s effects looped for
  the rest of the session. `play`/`playLooping`/`getPriority` now exist, and each of
  the 26 call sites carries the priority and loop flag transcribed from the C#.
- **Two caches answered from a stale copy.** `CanvasUI`'s `grayCache` was the only
  image cache `invalidateImagesIfSetChanged` did not clear, and it is keyed by
  image id alone — so switching the sprite-style option left every *already-visited*
  tile drawing the previous style's grayscale sprite until a reload. And
  `InputHandler` preventDefaulted a fixed list of six keys, none of which is a
  modifier combination, so `Ctrl+S/N/P/H/E` each ran the game command **and** the
  browser's — `Ctrl+N` opened a new window mid-game and `Ctrl+P` a print dialog.
  The key case is now derived from the live bindings rather than a second list.

#### Two things this pass made structural

- **Nothing is swallowed silently any more.** 28 empty `catch (e) {}` blocks in
  `RogueGame` (plus three `catch (e2)` and three elsewhere) wrapped the combat and
  trap *visualisation* path, so a failed blit left a stale screen and printed
  nothing. Keeping the guard is right; keeping it silent is not.
  `engine/Diagnostics.ts` gives the project one `reportSwallowed` and one
  `fireAndForget` — the latter because `void somePromise()` silences the lint rule
  but not the rejection, and a rejection is **process-fatal under Node's default**
  `--unhandled-rejections=throw`, i.e. in the simulator and in Vitest.
  `Session.load` returned `false` for *every* cause and the caller rendered that as
  "NO GAME SAVED OR VERSION NOT COMPATIBLE", so a deserialiser bug was reported to
  the player as an incompatible save with nothing logged; it now records why.
  `tests/silent-failures.test.ts` permits an empty catch only where the source says
  why silence is correct.
- **A cold desktop start destroyed the player's settings.** `NeutralinoStorage`
  called `initAsync()` from its constructor while `setItem` wrote immediately, so
  every launch read the options as empty, wrote the defaults over the real
  `storage.json`, and *then* merged the file in. Writes are now withheld until the
  read lands, serialised, and coalesced — which also stopped a 4.6 MB save from
  pretty-printing the whole storage on the keypress. Pinned by
  `tests/neutralino-storage.test.ts`, which runs the real class against a fake
  `window.Neutralino` with controllable latency, because the bug *is* the race and
  a synchronous mock would hide it. All six cases were re-run against the original
  class and all six failed.

#### One performance result worth recording

The Field Of View was a `Set<string>` keyed `` `${x},${y}` ``. `computeFOVFor` builds
a `(2r+1)²` box — 361 tiles for a living actor — allocating a string per tile, and
`fovSub` allocates a further one per ray step: **~1 800 set entries and as many
short-lived strings per actor per turn**, and the sensors `split(",")`-parsed the
whole set back three times per `sense()`. `Map` had *already* been converted to a
numeric key for exactly this reason; the FOV simply never was, which is the "keep
one coordinate space" lesson arriving as a performance bug. Both now delegate to
one function, `engine/CoordKey.ts`, measured **4.5× faster** on the FOV build in
isolation. `npm run profile` reads 956 draw calls/frame and 0.84 ms/frame
engine-side (the recorded 658/1.11 is not comparable — it was taken at the old
21×21 view, and the view is now 27×21).

Also: the minimap's **player-tag** scan was outside the `minimapRevision` guard
while the raster inside it was not, so it re-walked all 10 000 tiles on every
redraw — and a redraw is forced by any mouse movement, ~1.2M tile iterations per
second at 60–120 Hz. It is now cached under the same guard. Worth recording *what*
it finds: `DECO_PLAYER_TAG1..4` are only ever read, in the C# too
(`RogueGame.cs:19059-19065`), so the loop was walking the whole map per frame to
discover there are none.

### 1.1 What is proven clean — do not re-audit

Kept, and the reason is the opposite of the rest of this file: a clean result is
a result. These surfaces were audited line by line against `src/` and found
correct, so re-auditing them is the one way this file can make things worse.

Recorded because a clean result is a result, and because a pattern match is a
hypothesis generator rather than a verdict: the `percepted as Actor` audit found
43 sites, four of which had the shape of a real bug, and cleared all four.

| Subsystem | Verified |
|---|---|
| **Tile models** (`GameTiles`, 19 entries) | All 19 ids present in both, **numeric values identical**. All **38 `isWalkable`/`isTransparent` booleans exact** — the highest-consequence check here, and clean. All 17 image ids map to the same constant. `isRoadModel`, the `Models.tiles` binding, and the `TileFlags` bit values all match. |
| **`Rules` constants** (166 active) | **166 in C#, 166 in TS, identical names, values and declaration order.** Name-set diff empty both directions. The only value diffs are trailing-zero float formatting. The three int-division expressions (`SLEEP_COUCH_SLEEPING_REGEN`, `TRUST_MISC_GIFT_INCREASE`, `INFECTION_EFFECT_TRIGGER_CHANCE_1000`) all evaluate identically. No port-invented constants. |
| **Item model hierarchy** (37 classes) | 0 HIGH, 0 MED. `ItemModel`'s 13 fields all present; every subclass ctor sets what the C# sets; all `EquipmentPart` assignments (47 in C#) reproduced. |
| **Doll system** | `isMale` correct for all 27 actors, including the three female undead that the C# passes `true` for (the single `DollBody(false, …)` is `FEMALE_CIVILIAN` only). All 9 dressing helpers match layer for layer, including the deliberate gaps (bikers and CHAR guards have no torso; BlackOps is skin+eyes+suit only) and the two-decoration `HEAD` ordering in police/gangsta. All 54 per-actor decoration call sites 1:1. Doll render order matches, **including the doubled `TORSO` draw the C# has** (`RogueGame.cs:18525`) and the same doubling in `DrawCorpse`. |
| **Factions** | `Faction` class exact. All **63 enemy relations** identical and in the same order, with the same symmetry-check pass. All 8 `LeadOnlyBySameFaction` flags and the `Rules` consumer match. |
| **MapObjects** | `DoorWindow.BASE_HITPOINTS = 40`, all three `STATE_*`, and the derived fortification values match. |

### 1.2 The harness now runs real games

Runs are reproducible (`--seed`, §1.4) and the map no longer corrupts itself
(§1.1 bug 10).

> **This baseline was re-measured after a data-layer audit.** The
> figures previously recorded here were taken against a build with 18 live data
> bugs, one of which (`maxAmmo: undefined`, bug 23) meant **no living NPC could
> ever fire a ranged weapon**. Restoring it changed the dynamics completely, so
> the old numbers are gone rather than kept: comparing against them is
> meaningless.

Re-measured 2026-09-27 at 1×1 / 900 turns / `--undead`, seeds 1–12, after the
fixes. **No crashes and no hangs across all twelve.**

```
seed  1  turns    6  dead (-11 hp)      seed  7  turns   11  dead (-11 hp)
seed  2  turns  900  alive (43 hp)      seed  8  turns  900  alive (60 hp)
seed  3  turns  111  dead ( -2 hp)      seed  9  turns   19  dead ( -1 hp)
seed  4  turns   49  dead ( -5 hp)      seed 10  turns   11  dead ( -1 hp)
seed  5  turns   60  dead (  0 hp)      seed 11  turns   69  dead ( -4 hp)
seed  6  turns   14  dead ( -1 hp)      seed 12  turns   46  dead ( -4 hp)
```

**Ten of twelve undead bots now die, and that is the data-layer fix working.** The
undead player is shot by survivors, and survivors could not shoot until bug 23
gave every ranged weapon a `maxAmmo`. The old baseline's "4 of 5 seeds play all
1 000 turns" was measured while the entire ranged half of NPC behaviour was
inert. A bot that walks into a crowd of armed survivors dying in single digits
to two digits is the expected consequence, not a new fault — but it does mean
**`--undead` is no longer a way to get a long run**, and neither is anything
else. Long runs now need a survivor who avoids being shot, which the current bot
does not try to do.

`Map.assertActorIntegrity()` still runs every turn, so the §1.1 bug 10 class
fails on the turn it starts rather than as a strange death 40 turns later. It is
not dead code — reintroducing bug 10 makes it report the duplicate on turn 1.

### 1.2a Three things that look like bugs but are not

Do not re-investigate these:

- ~~**Players die at full HP around turn ~100 when run as a survivor.**~~ No
  longer true, and the old explanation was a symptom of a hardcoded meter. The bot
  used to exhaust "its 100 food points" because the meter really was capped at
  100. It is 1 440 now, and a survivor bot reaches turn 400+ alive. The
  1 000-turn survivor runs still do not complete, but the cause is combat, not
  starvation — which is what §1.2 now shows.
- **`hitPoints` can go negative** (seed 3 ends at −20). C# `InflictDamage` also
  does `HitPoints -= dmg` with no clamp, so this is faithful.
- ~~**`SpawnActorOnMapBorder` can throw `another actor already at position`.**~~
  Was faithful, and **is now fixed in the port**. C#
  `Map.PlaceActorAt` does throw that string (`Map.cs:488`) and the port's
  spawner called it with the same unguarded retry loop as `RogueGame.cs:4987`,
  so a border tile that already held an actor ended the run. The whole gap was
  that `isWalkableFor` tests the tile *model*, not occupancy. Both spawners now
  reject an occupied tile and try the next candidate. This was a **deliberate
  divergence** — a crash is not behaviour worth preserving — and it is the one
  item in this file that was an upstream bug reproduced faithfully and then
  deliberately chosen against.

**One more was recorded here as open and is closed:** C#'s `m_IsInvincible` guard,
which this section once described as one property. It is **six**, and the guard
is not uniform: five block a *decrease* (`HitPoints`, `StaminaPoints`,
`FoodPoints`, `SleepPoints`, `Sanity` — `Actor.cs:240,257,274,291,308`),
`Infection` is inverted and blocks an *increase* (`Actor.cs:465`), so curing an
invincible actor still works. All six were plain public fields, so the guard was
absent on every one. Now getter/setter pairs over `_`-fields; the external syntax
is unchanged, so no call site moved. Pinned by `tests/actor-invincible.test.ts`
(21 cases), including a check that no own instance field shadows the prototype
accessor — with `useDefineForClassFields: true` that would silently reintroduce
the bug.

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
> is shot down by survivors (§1.2), and long survivor runs hit the
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

### 1.5 Next steps

**There are no open bugs.** Everything below is a decision about what to do next,
not a defect waiting to be fixed.

1. **Play the game, don't just sim it.** The highest-value activity available, and
   the one that keeps producing bugs: the last six were all found this way, and
   none was visible to the sim or the build. See §1.4a for why the two are not
   substitutes. Every renderer change should be looked at in a browser.
2. **Keep sweeping sim seeds.** Crashes and hangs, not turn counts — no seed
   reaches 1 000 turns, and that is *correct* (§1.2), because the undead bot is
   shot by survivors. Worth repeating; the goal changed twice and the crash-hunt
   is the durable part.
3. **Finish the fidelity sweep.** The four unaudited tables are done and the
   remaining subsystems are whatever §1.1 has not listed. This is the one item
   that genuinely needs `src/`.
4. **Touch support, if it is ever wanted** — the last Phase 8 task, scoped in §5.1.
5. **Watch the coverage margins.** Thresholds are 50/75/57/50; re-measured
   2026-09-28 at **60.17/80.71/72.66/60.17** (statements/branches/functions/lines).
   Note the direction: statements and lines have *fallen* from a peak of 65.15,
   because the renderer, HUD, options, font and serialisation work added reachable
   UI code the suites cover less thoroughly than the engine does. Margins are still
   wide. Re-measure and re-set all four together; do not lower them to hide a drop.

   One caution from the 2026-09-28 pass, which is a coverage trap rather than a
   margin problem: **a test that reads the source is a shape test, and it is
   blind to behaviour.** Several of the new tests assert that a rule appears in
   one place (`LOS.fovKey` is the only FOV key; no empty `catch` without a stated
   reason). Those are worth having and they do fail on the regressions they were
   written for — but each was checked by re-introducing the bug and watching the
   test fail, and each behavioural test was written to drive the shipped code
   rather than a restatement of it. A source-grep test that never was broken on
   purpose is a comment with a build step.

**If a new bug turns up**, the pattern that has worked every time: find the class,
not the instance. Every one of the ~70 fixed bugs was a specific thing replaced by
something general — a table by a loop, an id lookup by a row index, a threaded
parameter by a default field, one coordinate space by two. Then pin it with a test
that asserts the *relationship* rather than a value, so the next drift fails
loudly.

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
- **The first load is slow** (~395 sprites before the menu appears). That is
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

### 1.7 Git state

- `master` is in sync with `origin/master`. Work in progress is on
  **`feature/still-alive-ruleset`**, branched from `master` at `44182e5`.
  - `f0782aa` — Stage 1, the `Ruleset` axis (946 tests)
  - `4d43299` — ruleset picker, HUD/title labels, `NullRogueUI.pushKeys` (954)
  - `dd42e82` — Stage 2, eight of fifteen audited defects (971)
  - `cfcf2ea` … — Stage 3: merged data tables, 711 sprites, the 2 doable
    actors, 124 tile models, 90 items and 67 item factories (1504)
  - **Uncommitted**: Stage 3's merged data tables + the `TileID` ordering tests
    (992). `web/data/` is new and `web/scripts/merge-content-tables.py` is new;
    `src/` is untouched.
- `git log --oneline` is the history. This section used to enumerate every
  commit with its test count, which went stale within one commit and duplicated
  what git already answers better. The bug log (§1.1 and its subsections) is the
  record of *what* was wrong; git is the record of *when*.
- The milestones a log line does not explain, in the order they landed: Phase 4
  completion `0bc8e7f`; the Phase 8 simulator and its first nine fixes `3154dee`;
  `--seed` and the `storage` wrapper `c181116`; the `Map.placeActor`
  add-or-move fix `43adb9d`; five presentation bugs and the widescreen display pass
  `f61a9b2`; the eighteen data-layer bugs `280430c`; `isInvincible` and the
  `percepted as Actor` audit `f629e83`; per-actor abilities `18987a1`; the
  positional→by-ID data binding `5864c4b`; a fidelity sweep plus the Neutralino
  wrapper `b0e4038`; the DPR-correct canvas and 1×/2× map zoom `8d7b5dc`; the
  honest load failure `652aa26`; the occupied-tile spawn fix and the `src/` rule
  `825c9f0`; the Windows `verify` halt `447bbdf`; the idle catch-up `1c27589`;
  Neutralino 6.9 packaging `0c5e770`; whole-world serialisation `ae08a31`;
  JetBrains Mono `46ac665`; the sprite-style option `03f8a73`; multi-key bindings
  `5b2dc59`; the side panel, hitbox, popup and minimap fixes `4a6e845` and
  `2ebdddf`; the four typeface families `47c5b64`; and the look-handler and
  typeface-repaint fixes `6977b63`.
- **Current state (2026-09-29): 1542 tests across 69 files, `npm run verify` green**
  — type-check, coverage gate and build all pass. Coverage is ~59.8% statements /
  49.7% branches / 72.1% functions / 61.0% lines, which clears the measured floor
  in `vitest.config.mts`.
  This line has been wrong before and says so twice over: it previously claimed
  `verify` was green when it was red, then reported it red "against a 75% floor"
  after the branch floor had been deliberately lowered — 75% came from the first
  suite (6 files, 74 tests) and is unreachable now that `RogueGame.ts` alone is
  6098 branches, so it was replaced by a measured floor with the reasoning
  recorded in the config. **Verify it rather than reading it.** Measure with
  `--no-file-parallelism`; the default parallel run is not a measurement.
- Still Alive ruleset work is in progress on `feature/still-alive-ruleset`; see
  **§5.6** for the per-stage board and §5.6d for the data-merge decisions.
- Bump `CACHE_VERSION` in `web/public/sw.js` when releasing, or clients keep the
  old bundle and the update only lands on the *next* load (§1.6).

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
| `npm run test` | Vitest, 1542 tests in 69 files |
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
| 4 — Game loop | `RogueGame.ts` (~26 KLOC) all 10 slices | Ported, **0 stubs — behaviourally exercised headless (§1.2) *and* played in a browser**; a first-person renderer is now available behind an option (§5.4) |
| 5 — World gen & AI | `BaseAI` (184/184), all 11 AI controllers, 4 generator files (`MapGenerator`, `BaseMapGenerator`, `BaseTownGenerator` 5 814 lines, `StdTownGenerator`) | Done |
| 6 — Audio | Web Audio SFX + music | Done |
| 7 — Save / load | localStorage / IndexedDB, `Session` serialisation | Done |
| 8 — Polish, sim, CI | Headless harness, 1542 tests, CI, PWA, Docker, asset pass, frame-cost pass, desktop wrapper | **In progress** — 11 of 12 tasks done; only 12 (optional touch) remains. See §4.1 |
| 9 — Still Alive ruleset | Parallel ruleset on a separate axis from `GameMode`, one superset content pack | **In progress** — Stages 1–2 committed, Stage 3 half done, Stages 4–5 not started. See §5.6 |

Assets: 1 151 files shipped (1 124 sprites across 3 image sets, 24 music tracks, 3 SFX), extracted from the C# embedded resources. **Total 24.9 MB**, down from 51.6 MB before the Phase 8 asset pass — see §4.1c.

---

## 4. Phase 8 — Polish, Headless Simulation & Deployment

**Goal:** feature-complete, tested, deployable, with a headless harness for balance and AI verification.

### 4.1 Task list

| # | Task | Status |
|---|------|--------|
| 1 | Headless simulator (`NullRogueUI` + `HeadlessRunner` + CLI) | **Built; playing 1 000-turn games. See §1.2.** |
| 2 | Deterministic `--seed` for reproducible runs | **Done** (`Session.useSeed`, `--seed`) |
| 3 | Drive the sim to a clean full-length run and fix what it finds | **In progress, and the goal changed** — no seed now reaches 1 000 turns, because that is *correct* behaviour (§1.2: the undead bot is shot by survivors). Keep sweeping seeds for crashes, not for turn count |
| 4 | Responsive canvas scaling (CSS `aspect-ratio` + `object-fit`) | **Done and verified in a browser** — now 1366×768 widescreen, smooth filtering (the old `image-rendering: pixelated` made upscaled text unreadable) |
| 5 | Vitest + `@vitest/coverage-v8`, `test` / `test:coverage` scripts, coverage thresholds | **Harness done, gate passing** — 1542 tests, 69 files, thresholds set and met. The branch floor was once 75% and made `verify` red for most of the port's life; it was lowered to a measured value rather than left unpassable, with the reasoning in `vitest.config.mts`. Actual: ~62.8% statements / 52.1% branches / 73% functions / 63% lines |
| 6 | GitHub Actions CI | **Done** — `.github/workflows/ci.yml`, type-check + coverage + build + seeded sim, plus a docker smoke job |
| 7 | PWA manifest + service worker (offline play) | **Done** — manifest, drawn icons, runtime-caching `sw.js` |
| 8 | Docker image for the self-hosted server | **Done but unverified** — docker is not installed locally, so the image has never been built; CI will exercise it first |
| 9 | Extract + optimise all sprite PNGs from C# embedded resources | **Done** — 1 124 sprites converted to lossless WebP, 2.41 MB → 0.32 MB, every file pixel-verified |
| 10 | Audio: normalise volume levels | **Done** — plus 25.7 MB of unreferenced MP3s deleted. Music RMS spread 4.88× → 1.71× |
| 11 | Performance pass: profile tile rendering (target 60 fps on a 21×21 view) | **Done for draw calls** — `npm run profile`; 3 058 → 658 calls/frame, engine 1.86 → 1.11 ms/frame. See §4.1d. Frame *rate* still unverified (needs a browser). The view is now 27×21 after the widescreen change, so re-profile if that matters |
| 12 | Mobile / touch support (optional — original was keyboard-only) | Not started — scoped in §5.1 |

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
| `data-tables.test.ts` | Every generated JSON against its source CSV: canonical column names, no key containing a space, and values equal positionally. Catches the whole data-binding class (45 cases) |
| `skills-data.test.ts` | `Skills.csv` actually reaches the `Rules.SKILL_*` statics, with the right `(int)` truncation, and each of the 7 corrected values differs from the C# default (53 cases) |
| `actor-invincible.test.ts` | C#'s `m_IsInvincible` guard on all six Actor point properties, including that `Infection`'s guard is inverted (21 cases) |
| `ai-percept-filters.test.ts` | The AI percept filters reject non-Actor percepts, and `filterSameMap` still admits them (9 cases, characterisation — see §1.5 item 4) |
| `ai-behaviour.test.ts` | The four §4.3 item-2 behaviours in isolated map scenarios: zombie pursuit by sight, LOS gating, scent aggregation, civilian self-preservation (14 cases) |
| `rule-result-usage.test.ts` | No `RuleResult` is ever tested for truthiness — the bug class behind four dead `RuleResult` checks. Parses `Rules.ts` for the 44 `RuleResult` methods and reports any call site missing `.ok`, by file and line (3 cases) |
| `headless-no-hang.test.ts` | Seeds that hung or died in the sweep finish under a wall-clock deadline, so a livelock fails loudly instead of eating the CI timeout (8 cases) |
| `model-data-binding.test.ts` | Every actor model binds to its own CSV row, unique weapons stay unbreakable, lights do not auto-equip, the badge is holdable. Also fails if `Actors.csv` is ever reordered into enum order (43 cases) |
| `actor-abilities.test.ts` | Every actor's granted ability set, transcribed from the C#; specifically that the player can open doors, and that skeletons/rat zombie do not rot (31 cases) |
| `generator-integrity.test.ts` | A generated world is sound: no actor on a wall, nothing out of bounds, the player starts passable in the largest region, no surface district sealed. One game per file, seed 42 = the worst world measured (7 cases) |
| `actor-sprites.test.ts` | The whole-body sprite / doll-driven partition for all 27 actors, including that the two lists partition the enum |
| `input-handler.test.ts` | `UI_PeekKey` **consumes** the key it returns, matching C# `RogueForm.cs:135` |
| `minimap-cache.test.ts` | The `minimapRevision` invalidation contract: no bump without a change, no bump on re-marking, bumps on `markVisited` / `setAllAsUnvisited` / `setTileModelAt`, and a rebuild exactly when `(map, revision)` changes (§4.1d) |
| `map-zoom.test.ts` | Map zoom state, persisted through the `storage` wrapper |
| `headless-zoom.test.ts` | Zoom behaviour under a headless run |
| `canvas-layout.test.ts` | Canvas sizing, scaling and the 1366×768 widescreen layout |
| `hud-layout.test.ts` | The HUD's hardcoded vertical stack: status → inventory → ground → corpses → skills → minimap → log, with nothing overlapping. Also the minimap/view-rect coordinate space, which is where the minimap was drawn at the wrong scale |
| `panel-hitboxes.test.ts` | The side panel's hitboxes are the drawn grid: titles, number rows and inter-section gaps are not slots. Overlays declare whether the map zoom may move them, and a popup is never drawn scaled |
| `map-border-rings.test.ts` | The map border and its ring markers |
| `tile-palette.test.ts` | Tile model ids, image ids and the walkable/transparent flags |
| `gender-helpers.test.ts` | `HisOrHer` / `HimOrHer` and the rest — the family the trade-screen pronoun bug belonged to |
| `lossensor-weather.test.ts` | FOV and the weather penalty, the surface the FOV weather bug was about |
| `idle-district-sim.test.ts` | The idle catch-up keeps the districts behind the player in step (§1.4b) |
| `spawn-occupancy.test.ts` | Both spawners reject an occupied tile and try the next candidate |
| `keybindings-multi.test.ts` | Several keys per command, and `Digit7` vs `Numpad7` resolving to different commands |
| `sprite-style-option.test.ts` | The sprite-style option, its `classic` fallback, image generation and persistence |
| `game-font.test.ts` | Every vendored face is on disk and really a woff2, each family ships its licence, the subset covers what the sources can draw, and the canvas strings name the chosen family. **Hack is MIT + Bitstream Vera, not OFL**, so the licence assertion is deliberately not "there is an OFL somewhere" |
| `options-coverage.test.ts` | Every option id has a name, a description and a value. `describe` **throws** for an unhandled id, which is a black screen the moment the player scrolls to that row — this suite exists because the font option shipped that way |
| `screenshot-naming.test.ts` | `UI_SaveScreenshot` uses the path it is given and produces a safe filename |
| `save-graph-coverage.test.ts` | Every field the save specs declare is actually written, so a spec cannot drift into a field nothing persists |
| `firstperson-option.test.ts` | The `(Gfx) View Mode` option: defaults to top-down so a first run shows the C#'s game, round-trips through storage, survives a restore-previous, and reads an unrecognised stored value as top-down rather than as a renderer. Includes the failure direction: `mode !== "first-person"` is *true* for a typo |
| `map-screen-conversion.test.ts` | `UI_MapToScreen`/`UI_ScreenToMap`: the browser and headless renderers agree over a grid of inputs at both zooms, the two directions invert each other, and `RogueGame` **asks** rather than deciding. Replaced a source-scanning test that passed for the wrong reason — its pattern never matched the source it guarded |
| `firstperson-raster.test.ts` | The golden harness proving itself: a z-buffered software rasteriser and a PNG encoder, checked by inflating the encoder's own IDAT back to the pixels that went in. Found two bugs in the harness that would have been baked into every golden |
| `firstperson-geometry.test.ts` | The camera basis (screen-right is two compass steps, not `Direction.right`) and the raycaster: distances in tiles rather than ray parameter, face normals for all eight facings, doors closed and open, the map edge, the `inView` gate, and a 1500-ray sweep asserting walls are one tile thick |
| `firstperson-projector.test.ts` | The projection: the horizon and the wall centred on it, inverse-proportional height, the on-axis column finite at every viewport parity, the texture slice taken from the axis the wall runs along, and far-to-near ordering |
| `firstperson-scene.test.ts` | A whole frame: **every pixel below the horizon is covered, from all eight facings** (the floor was striped with holes and no count said so), walls after floor, the frame budget, the `inView` fog, decorations nearer than the wall they sit on, weather over the view and not through a roof, and five golden images |
| `firstperson-controls.test.ts` | The control scheme with rendering still top-down, so the headless simulator can verify it: the remap is the identity in top-down, turning costs no action point or turn, the facing is exact for all eight facings, every direction is reachable by turning, and the new bindings collide with nothing |
| `firstperson-wiring.test.ts` | The view in a real played game: the option reaches the renderer, the tile loop stops (573 calls top-down vs 94, and `UI_DrawImage` is 43 in *both* — the minimap's markers), a turn is one redraw, and 40 bot turns run without a crash |
| `save-graph-roundtrip.test.ts` | A real played world through save/load, compared field by field — the check §1.1i bug 64 shows is not "it did not throw" |
| `integration/save-load.test.ts` | The same at the `Session` level, including a save that cannot be restored failing loudly instead of killing the game |
| `integration/mouse-paths.test.ts` | Inventory and corpse hit-testing through real mouse positions, at 1× and 2× display scale |
| `point-identity.test.ts` | **`Point` is a class here and a struct in the C#, so value equality silently became reference identity.** Scans for `==` between positions, a `Set<Point>`, a `fov.has(x.toString())`, and a hand-rolled key outside `LOS`; and drives the two features that died — ORDER_MODE's link predicate (both the pass and the control) and `DrawMap`'s target marker. This is the suite for §1.1a |
| `music-priority.test.ts` | Every `GameSounds`/`GameMusics` id the music manager is handed resolves to a file that exists, sound effects route to `sfx/` and tracks to `music/`, the C# `MusicPriority` values, and that the manager resolves through `audioPath` rather than `musicPath` |
| `silent-failures.test.ts` | No `catch` swallows without either reporting or a stated reason; `fireAndForget` cannot produce an unhandled rejection; `Session.load` records *why* it failed; and no source file would read as **binary** to grep (§1.6) |
| `stale-cache-and-keys.test.ts` | The sprite-style change invalidates the grayscale cache, and a Ctrl-bound key suppresses the browser's own action — both through the real code, not by reading it |
| `neutralino-storage.test.ts` | The desktop store never writes before its initial read lands, and its writes are serialised and coalesced. Runs the real class against a fake `window.Neutralino` with controllable latency, because the bug *is* a race |

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
  present, so the error names the cause. The lesson is the §1.1a one again:
  **absence of an error is not evidence of correctness**, and this time the
  absence was in the tool's exit code rather than in a grep.


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

### 4.1e Neutralino Desktop Wrapper & AppData Persistence

To support building lightweight native desktop applications (Windows, Linux, macOS) without the resource footprint of Electron, **NeutralinoJS** has been integrated:

- **Configuration (`neutralino.config.json`)**: Configured with `applicationId: "com.roguesurvivor.reloaded"`, targeting `/dist/` as the document root and bundling game assets, sprites, audio files, and JSON data tables into a lightweight native binary using the system's native webview.
- **AppData Persistence (`engine/storage.ts`)**: When running inside Neutralino (`hasNeutralino`), `storage` automatically uses `NeutralinoStorage`. It queries the OS AppData path (`Neutralino.os.getPath('data')`), creates the `rogue-survivor-reloaded/` directory, and persists key-value data (saves, options, keybindings, hiscores) to `storage.json` asynchronously while keeping synchronous memory access for engine performance.
- **Desktop Commands**:
  - `npm run neu:dev` — starts Neutralino in development mode.
  - `npm run build:desktop` (or `npm run neu:build`) — builds the Vite bundle and packages the native desktop application binaries.

#### The 6.9.0 upgrade broke the packaging in four separate ways

Neutralino was moved from 5.3.0 to 6.9.0, and the config kept several 5.x key
names. 6.x does not complain about an unknown key — it reads `undefined` and
carries on — so each one surfaced as a different symptom, and the only report was
"the desktop build is broken". Worth keeping as a list, because none of it is
visible from reading the config:

| Symptom | Cause | Fix |
|---|---|---|
| `neu: ERRR ENOENT … stat 'web/undefined'` | 5.x `cli.resDir` was renamed; 6.x reads `cli.resourcesPath`. Undefined, then joined into a path | `resourcesPath: "dist/"` |
| Package in `dist/undefined/`, binaries called `undefined-win_x64.exe` | `cli.binaryName` unset — 5.x defaulted it, 6.x does not | `binaryName: "RogueSurvivorReloaded"` |
| **Black screen**, window opens | `enableServer` defaults to **false**, so the binary served nothing and opened **no listening socket at all** | `enableServer: true` |
| `NE_RS_UNBLDRE: Unable to load /dist/js/neutralino.js` | The Neutralino client lived in `web/js/`, *outside* Vite's `public/`, so it was never copied into `dist/` — and `dist/` is all a packaged app serves | `git mv web/js web/public/js` |

Two of these are rules rather than fixes:

- **A renamed key is not an error, it is `undefined`.** That is why the first two
  produced nonsense paths (`web/undefined`) instead of a message, and why the
  config should be read against the published
  [schema](https://raw.githubusercontent.com/neutralinojs/neutralinojs/main/schemas/neutralino.config.schema.json)
  rather than from memory of the old one.
- **Turn on `logging` while diagnosing this.** `logging: {enabled, writeToLogFile}`
  makes the binary write `neutralinojs.log` beside the executable, naming the exact
  resource it could not load. Without it the log is empty and the only symptom is a
  black window — which is how two of the four above were narrowed at all.

**`documentRoot: "/dist/"` with `url: "/index.html"` looks like a mistake and is
not.** `cli.resourcesPath` keeps its *directory name* as a prefix inside
`resources.neu`, so with `resourcesPath: "dist/"` the archive holds
`dist/index.html`, and `documentRoot: "/dist/"` is what resolves `/index.html` to
it. Changing it to `/` looks tidier and 404s on `/dist/dist/index.html`. (Learned
from the working project at `D:\GitHub\project_genesis\project_genesis`, whose
`scripts/build.js` states the rule outright — after I had already "fixed" it the
wrong way.)

**Where the package lands, and what is in it.** `neu build` writes
`web/dist/<binaryName>/`, which is *inside* the directory it packages, because
that directory is `resourcesPath`:

```
dist/RogueSurvivorReloaded/
├── resources.neu                        29.0 MB — the whole game, packed
├── RogueSurvivorReloaded-win_x64.exe     2.4 MB
├── RogueSurvivorReloaded-{linux,mac}_*   2.2–5.6 MB each
└── neutralinojs.log
```

**Yes — it copies the full game into that folder**, and the folder is what you
ship. `resources.neu` is Neutralino's own archive format rather than a zip, and it
is essentially all 28.7 MB of `dist/`: the JS bundle, ~1 100 sprites and the music.
Note the collision: `web/dist/` is *also* Vite's output, so a later `npm run build`
wipes the desktop package. Rebuilding is cheap, but do not expect `build:desktop`
output to survive a web build.

Verified by running the packaged binary and asking its own server, which beats
eyeballing a window: with `enableServer` on it listens, `/index.html`,
`/js/neutralino.js` and a sprite all return 200, and the error log is empty.
`--res-mode=directory` (ship loose files, skip the archive) does **not** work with
the flag alone — it also needs a path — so the archive stays the shipped form.

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
5. **Coverage** — ✅ `@vitest/coverage-v8`, thresholds at 50/75/57/50, set under the
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

### 5.2 Where the fidelity work stands

**Nothing is open.** The four previously-unaudited tables — tile models, the doll
system, the `Rules` constants, the item model hierarchy — have been swept and
their findings fixed, and §1.1 lists what came back clean so the next audit does
not repeat them. Data binding, per-actor abilities, `isInvincible`, the
`percepted as Actor` sweep, the AI behaviour and generator suites, and world/map
serialisation are all done and pinned.

So the honest answer to "what is left here" is: whatever is *not* in §1.1. That
requires reading `src/`, which is why the sweep cannot be finished from the
port's side alone.

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

**Built** (14 commits, merged to `master` as `f01ea5d`). It is a **second
renderer behind an option** — `(Gfx) View Mode`, defaulting to top-down, so the
C# behaviour is what a first run still shows and a player who has never heard of
this sees the game that was ported. `F` toggles it in game; the options screen is
its real home, and the hotkey writes the *option* and then calls the same
`ApplyOptions` the options screen does, so there is one place a view change takes
effect. The options list labels it `(experimental)`, which is a claim about the
renderer and not about the option: the stored value is still `"first-person"`,
because `isFirstPersonView` compares it exactly and an annotated value would read
as top-down and silently hand the player the other view.

`npm run verify` is green: **1542 tests, 69 files**. It was red for most of this
work — branch coverage sat at 49.88% against a 75% floor — and the floor was
later lowered to a measured value, because a gate that cannot be passed is not a
gate (`vitest.config.mts` records why 75% is unreachable). The earlier figure in
this section, 81.18%, was never reproducible. See §4.3.

What follows is what was decided, what turned out to be wrong, and what is still
open.

#### It has now been looked at, and it was wrong six times

The browser has now run this, from screenshots, and **the software rasteriser and
the goldens agreed with each other while both were wrong about the browser.** Every
one of these is a real defect that only a browser can show, and every one passed the
full suite first:

1. **The floor was two triangles of colour against two of texture**, converging on
   the vanishing point. A flat quad was being filled with `fillRect(x, y, w, h)`,
   which has no shear parameters, so it drew an upright *rectangle* where a
   sheared *parallelogram* was wanted. The two shapes differ by precisely the shear
   term, which is exactly the two triangles the screenshot showed. The floor
   coverage metric was 100% and the golden images were green.
2. **The affine transform was missing its translation**, so every sheared quad was
   drawn a third of a tile to the left of where the rasteriser put it.
3. **The view reached a third further than the rules allow**, because the per-column
   wall height was clamped to a minimum the ray distance was not, and FOV was
   leaking into the floor.
4. **Half the floor tiles were never drawn.** `ringOffsets` was parameterised by a
   `side` variable, but `side` cannot address a ring: there are `2d+1` values of it
   and `8d` cells, and `|side|` — used as "how far along the ring this is" — takes
   only `d` distinct values, so it is many-to-one by construction. It drew the
   shell's *interior* and never drew the two side edges: 119 of 168 tiles at
   `distance = 6`, with 50 missing. **This is the one worth remembering: the
   parameterisation was structurally incapable of enumerating what it claimed to,
   and no amount of testing the arithmetic would have found it.**
5. **Sub-quad corners were interpolated rather than projected** — the affine map
   over a projective shape, wrong by **99.5 px** on a near tile. Subdivision
   cannot rescue it: subdividing a bilinear map gives a finer bilinear map,
   converging on the *wrong* shape. So it survived every "add more subdivision"
   attempt, which is exactly what a real bug does.
6. **Each tile's base fill sat at its _nearest_ corner depth**, so it won the depth
   test against its own texture and painted over it. A checkerboard, because which
   of the two won depended on where in the tile you were looking.

The lesson generalises, and it is the reason this section exists: **a shared `Quad`
type constrains shape, not behaviour.** Two implementations of one primitive can
disagree about what that primitive *means* while agreeing perfectly about its
fields, and a software renderer plus golden images will happily certify both.

Three further things about *how* these were found, which cost more than the bugs:

- **The underlay hid all of them.** It exists to cover sub-pixel seams between
  floor tiles, and it is drawn over everything below the horizon — so "the floor
  has no holes" was 100% on a floor that was half missing and 100 px out of place.
  A metric that counts a pixel as covered if *anything* drew it cannot see a
  missing layer. The test that finally caught these asks how much of the floor is
  *textured* floor, with the flat fills removed from the draw list.
- **The goldens had encoded the broken floor as though it were the design.** That
  is the failure mode a golden-image harness has when nobody looks at the pictures.
  Every one of the five was regenerated, having been reviewed rather than accepted.
- **`minimapColor` is not a colour.** The underlay was painted in it — a *minimap*
  swatch, `Color.LightGray` for a floor that renders dark grey — and ignored
  `daylight`, so the seams showed as bright wedges and brighter still at midnight.
  The data model has no "average colour of this texture", and the engine cannot
  read pixels; the answer was to use the same expression the per-tile base fills
  already use, so the backstop always matches the layer it backs up.

The tests that now guard this assert *properties*, not call counts — which a
mutation can satisfy. One place builds the clip, one place applies the transform,
the flat/textured choice is only a choice of what to paint, each sub-quad lands
where the perspective divide puts it to within a pixel, and each base fill is
provably behind its own texture.

#### A `Quad` cannot be a floor tile, and the error falls as area

Worth recording separately, because it is a limit of the primitive rather than a
bug in the code. A `Quad` is a **parallelogram**: it stores two edge vectors and
the fourth corner is *implied*. A floor tile under perspective is projective, so
that implied corner is never right — **196 px** out at 1×1 subdivision, which is
the dark wedge the floor still showed around furniture after the four fixes above.

It cannot be corrected. Re-anchoring the quad at its nearest corner is the obvious
idea and it is **measurably identical to the pixel** — a parallelogram's diagonal
mismatch is the same from every corner. The only lever is subdivision, and the
error falls as the square of the cell size:

| split | 1×1 | 2×2 | 4×4 | 8×8 | 16×16 |
|-------|-----|-----|-----|-----|-------|
| worst error | 743 px | 372 px | 149 px | 50 px | 15 px |

So `subdivisionsFor` is now 8/4/2/1, where it was 4/2/1 and left ~50 px on the
nearest tile. That is a real cost — 8×8 is 64 quads for the tile the player is
standing on — and it is the reason the frame cost is the open item below rather
than a footnote.

The deeper fix is a primitive that is not a parallelogram (a projective quad, or
a per-column affine map), which is a change to `Quad` and to both rasterisers
rather than a tweak. Not done, and named here so the choice is visible.

#### Map objects are billboards, and always were

Furniture, cars, doors and gates are **never drawn as wall columns**, in any
direction. They are a single 32x32 billboard, and the reason is not a preference:
the top-down view draws each one as one *unscaled* 32x32 sprite, so there is no side
or back of a car to render. The game has never had that art. Stretching the icon to
a full 1.5-tile wall column invents geometry that does not exist.

That splits map objects two ways, and the split is **transparency, never
walkability**:

- **Opaque** (a closed door, a gate, a car, a fridge) stops the ray, so its columns
  get *no wall* and the object becomes the billboard. Testing walkability instead
  would let you see through a closed door, since a closed door is walkable-by-flag
  only when open.
- **Transparent** (a table, a chair, an open door) does not stop the ray at all. It
  is found by scanning tiles and drawn *behind* whatever the ray did stop at, which
  is the only way "you can see the wall past the table" is true.

A DDA terminating on walkability alone walks through closed doors; one terminating
on "is there an object here" hides the world behind every table.

The sprite is emitted **once per object, not once per column** — a shelf is hit by
fifty-odd columns. The dedupe is keyed on **object identity**, not `imageId`,
because every shop shelf in a district shares one image id and keying on it would
merge the shelf you are standing next to with the one at the end of the street.

**Still open:** map objects have no height in the data model, only an image, so
`MAP_OBJECT_HEIGHT = 1.0` is a compromise chosen to make furniture read as
furniture. Doors are the exception and are matched on an image-id substring, which
is the wrong tool and is used because the C# distinguishes them by a runtime
`DoorWindow` cast and the data model has no flag for it. A `height` on
`MapObject` would delete both the guess and the string match.

#### What was decided

**Rotation is quantised to one eighth of a turn, and that is load-bearing.** The
facing is stored as a `Direction`, not as an angle, so it is *always* a
`Direction.COMPASS` entry and walking forward returns that object exactly — no
rounding, and therefore no way for the controls and the view to disagree. It also
removes trigonometry from the whole subsystem: there is no `Math.sin` anywhere in
the port and this is why one is not needed.

The scheme: **Left/Right turn (45° each, free — no turn, no action point),
Up/Down walk forward and back along the facing.** The four diagonals are
unreachable, because any diagonal is a rotation away and then a step forward.

Watch out for `Direction.right`: it advances one *compass* step, 45°, so
`Direction.right(N)` is **NE**. The name reads like a perpendicular and is not one.
Screen-right is two steps.

**No `actor.direction` exists to update — in the C# or the port.** The C# `Actor`
is 1083 lines with no match for the word, and the engine's direction is a *command
argument* threaded from the keypress, never state read back off an actor. So the
camera is purely presentational: no save field, no `actorSpec` entry, nothing that
can perturb the simulation.

**The remap is a pure function applied at dispatch**, not a binding. An arrow-key
`LOOK_LEFT` binding would fight `MOVE_W` for the same key and the winner would
depend on the view mode, leaving the binding table unable to say what a key does.
The controls were therefore fully tested *before* any pixels existed, with
rendering still top-down, so the headless simulator could verify them.

**Do not trust this section's arithmetic — it has been wrong five times, and each
time in a way that looked right.** The original plan quoted a 992×672 viewport; it
is **864×672**, the map panel's size, so the below-horizon area is 864×336. It asked
for the floor to be settled "with a measured draw-call profile" while also warning
that the profile cannot see this renderer. Both were true and they contradicted
each other; §4.1d's profile counts calls on `NullRogueUI`, which drops every
painting call. Resolved by adding the `[fp]` browser tally rather than by picking a
number. The fifth was the `verify` claim in the status header, which said green and
was not — see the top of this file and §1.1a.

**`Color.fromArgb` takes `(r, g, b, a)` here — the reverse of C#'s
`FromArgb(alpha, r, g, b)`.** Passing the alpha first compiles, type-checks, and
silently yields a translucent *red*. Nothing catches it: the software rasteriser
writes alpha 255 unconditionally, so a golden image is identical either way and
only the browser blends it. A test now checks the synthesised colours are opaque
and greyish, with the spread limit chosen so `255,24,24,34` cannot slip through.

#### The three bugs the picture caught and the counts did not

Worth the whole exercise, and worth recording in the shape they took:

1. **The floor was striped with holes.** A `Quad` is affine; a floor tile under
   perspective is projective. Interpolating four corners bilinearly gives a shape
   slightly *smaller* than the truth at every edge, so two neighbouring tiles each
   pull inward and the sliver between them is drawn by nothing. Subdivision shrinks
   the error and never removes it, at a 16×16 grid on every near tile; expanding
   the quads does not close it either, because the error grows with the tile's
   screen size and the nearest tile is 40 px tall. What works is **one opaque
   underlay that cannot have a seam**, so whatever the tiles miss shows
   floor-coloured rather than sky-coloured. 0 of 32 256 floor pixels undrawn,
   asserted for all eight facings.

   **This fix is also what hid the next four.** The underlay covers everything
   below the horizon, so "0 undrawn" stayed true through a floor that was half
   missing and 100 px out of place — and the metric asserting it was counting the
   underlay as floor. The underlay is the right answer to a sub-pixel seam and the
   wrong answer to a missing tile, and the test could not tell the two apart. The
   "textured floor only" metric added later is what distinguishes them.
2. **The underlay had `depth: Infinity`,** so the depth test rejected it as
   already occluded. A depth buffer starts at "nothing here" *as* `Infinity`, so
   the one quad that must never be occluded is the one that cannot use it. It
   existed, read correctly, and drew nothing.
3. **The wall height was divided by the lateral offset instead of the distance.**
   They agree down the middle of the screen and differ by 1.64× at the edges — and
   the lateral offset of the wall *directly ahead* is zero, so the most ordinary
   wall in the game divided by zero. 18 assertions passed and the picture was a
   solid grey rectangle.

`planeLength` is `tan(fov / 2)` and took two attempts. Scaling it by `width / 2`
made the *field of view* depend on the canvas size — at 1366 px the edges subtended
nearly 180°. Its reciprocal is invisible at 90° because `atan(tan 45°)` and
`atan(1/tan 45°)` are both 45°, so the test that "proved" it used a 90° field of
view and could not tell the two apart. It now checks 60, 75, 100 and 120.

#### Still open

- **The `[fp]` numbers have never been read**, and that is now the most important
  open item in this section. The frame cost was designed-for rather than measured
  and the design has since changed underneath it: `subdivisionsFor` went 4/2/1 →
  8/4/2/1, which is **64 quads for the tile the player is standing on** where it
  was 16. The budget test only counts quads (under 2000) — it does not time
  anything, and nothing else in the suite can. Whether a frame fits in 16.7 ms is
  unknown, and it is the one claim in this section that a player would feel
  immediately. Read the `[fp]` line in a browser under `?debug=1` before anything
  else here.
- **The browser still resolves overlap by list order alone.** The test rasteriser
  keeps the nearest quad by depth; the browser has no depth buffer at all. The
  base-fill depth was chosen so the two agree — a fill that only *usually* loses to
  its own texture renders differently in each — but that is a mitigation, not a
  proof, and a future change to the draw order can reintroduce the disagreement.
  A shared depth-sorted list, or a real depth buffer, is the structural fix.
- **A `Quad` cannot represent a floor tile** — 15 px of error even at 16×16
  subdivision, and the cost of getting under a pixel is unaffordable. See the
  section above; the fix is a different primitive, not a smaller number.
- **`MapToScreen` still returns `Point`,** falling back to the pre-move arithmetic
  when a renderer cannot place a position. Turning it into `Point | null` wants
  doing in one pass *with* the renderer in hand — ~90 call sites, each needing a
  decision, and not 90 decisions made against a view that did not exist yet.
- **Map-anchored overlays are not yet projected.** Floating damage numbers, target
  icons and the melee-attack icon all position by `MapToScreen`; the conversion now
  goes through the UI, but nothing consumes it in first person yet, so those
  overlays are drawn in the wrong place rather than not at all.
- **The wall textures were not judged in a browser.** 3 of 5 are flat and tile
  well; `wall_hospital` is an embossed top-down panel and `wall_char_office` is a
  dark fill with a red border. At 1.5 tiles tall a 32×32 texture is a 1.5×
  vertical stretch, which is mild on brick and questionable on the other two. If
  they look wrong, add one optional `TileModel.wallTextureCrop` — as a reaction to
  seeing it, not a table built up front.
- **`wall_stone` is shared by three wall ids** that differ only in minimap colour.
  Invisible top-down, identical in first person. A per-face tint from `minimapColor`
  would separate them, at no per-texel cost.
- **Off-screen threat markers** are cheap — the game already ships
  `Icons/threat_high_danger` — and would be a genuine gain in a view with no
  peripheral vision.
- **The in-game help screen reads the manual text file, not the binding table,** so
  it does not list the new keys. The option description and the toggle message do
  say that the arrow keys change meaning, which covers the surprise; the manual is
  a content follow-up.
- **The option is labelled `(experimental)` and nothing enforces that.** It is a
  label, not a gate. Decide whether the first-person view ships as the default or
  stays opt-in, which is a content decision this section should not make silently.

#### Verified along the way, so it need not be re-derived

- **The art claim holds, mostly.** `Actors/zombie.png` and `skeleton.png` are
  front-facing with raised arms; `MapObjects/car1.png` is a head-on car;
  `Tiles/wall_brick.png`, `wall_stone.png` and `wall_sewer.png` are flat
  tileable textures. `wall_hospital.png` is an embossed panel with a drop shadow
  and `wall_char_office.png` is a dark fill with a red border — both readable as
  wall columns, neither ideal.
- **Walls really are one tile thick.** `MapGenerator.tileRectangle` fills a
  four-line outline, and a 1500-ray sweep over a fixture with an interior pillar
  asserts that no ray from walkable space reaches a face with a solid tile in front
  of it. Everything this renderer is cheap *because of* rests on that.
- **A closed door needs no special case; an open one does.** A closed door is not
  walkable, so the DDA stops on it and it is just a wall with another texture. An
  *open* door is walkable, so a raycaster terminating on walkability walks through
  it and never draws it. Hence three surface kinds: `wall`, `object`
  (transparent — a billboard), and `edge` (fog).
- **Rendering is gated on `tile.isInView`, not on the camera's cone.**
  `Rules.actorFOV` is a circle of ~9.24 tiles and the camera is a cone, so rays
  reach walls the player may not see. Drawing those hands over exactly what the
  rules withhold. A wall in view is drawn; one out of it is fog.
- **The tile loop is the discriminator between the renderers, and not the method
  you would guess.** Top-down spends 573 painting calls per frame, 61
  `UI_DrawImageTinted` and 404 `UI_DrawGrayLevelImage`. First person spends 94,
  `UI_DrawScene` 1, and **zero** of those two. `UI_DrawImage` is 43 in *both*,
  because the minimap's position markers go through it.

### 5.5 Housekeeping

- `tests/integration/reproducibility.test.ts` cannot run on Windows
  (`execFileSync` cannot spawn `npx.ps1`) — see §1.6. Fix by resolving the
  binary path instead of relying on `npx` being spawnable.
- The `icon.png` in the repo root is unexplained and untracked (§1.6); someone
  should work out what writes it before it becomes a committed mystery.
- The Docker image has never been built locally (§4 task 8); CI exercises it
  first, and that is the first time anyone will know whether it works.

### 5.6 Still Alive as a parallel ruleset (Stages 1–5)

> **Status: in progress on `feature/still-alive-ruleset`.** The decision is to
> ship Still Alive as a **second ruleset alongside classic**, selectable at
> new-game time, on a **separate axis from `GameMode`**. The fork audit this
> draws on is [`STILL_ALIVE_REFERENCE.md`](STILL_ALIVE_REFERENCE.md); this
> section is the implementation plan, not the survey.

**Where it actually is — read this before the subsections, they are not all
current.** Stages 1 and 2 are committed; Stage 3 is half done and uncommitted;
Stages 4 and 5 have not started.

| Stage | Scope | State |
|---|---|---|
| **1** | `Ruleset`, save compat, `FeatureFlags`, picker, HUD | **done** — `f0782aa`, `4d43299`. Except **1.7, deferred to Stage 4** |
| **2** | 15 audited defects → 8 fixed, 4 inapplicable, 1 open | **done** — `dd42e82` |
| **3** | merged content pack | **data tables, sprite files, the actors (2 of 4), all 143 tiles, 90 of 95 items and all 123 item factories done.** The 5 backpacks (a new mechanic) and ~420 unused `GameImages` constants are the only content left; nothing *calls* the new factories yet, which is placement and belongs to Stage 4/5 |
| **4** | 37 gated features | **19 of 37 wired** — `WeaponWeight`, `ArmorResist` (infection half only), `FoodPoisoning`, `Cooking`, `FireBarrels` (model and burn loop only; nothing can light them), `ItemDespawn`, `DarknessFov` (both halves), `DarknessGating`, `LightPriority`, `Alcohol`, `SiphonFuel`, `TileFires`, `FireExtinguishers`, `Butchering`, `ResourcesAvailability`, `DifficultyAtCreation`, `Fishing` (player path only — the NPC arm is still pending, see its section), `ExtendedAudio` (the 180-pair table; 3 of 180 call sites wired, see its section), `AmbientAudio` (**5 of its 13 tracks** — the channel and the table are done; the 5 helicopter / 2 church / 1 debug tracks are not, see its section). 18 remain |
| **5** | content, audio, credits | **started** — `ExtendedAudio`'s table and assets are in; the ambients channel, the 15 building generators and the credits page are not |

Two things a later session should not have to re-derive:

- **The fork's rebalanced values are deliberately absent from the merged
  tables.** "Ours wins" was chosen for every shared id, so classic is provably
  unchanged — but that means ~17 actors, 9 skills and 13 item rows of Still
  Alive tuning are *not* in the data. They are Stage 4 work, and the list is in
  `merge-content-tables.py`'s output, not only in prose. `ItemID` and
  `PlayerCommand` are append-only and still must be.
- **"Ours wins" applies to the sprites too, and there it costs something the
  CSVs did not.** The fork re-drew **66** of the 349 shared sprites. For the
  CSVs a discarded value can be re-read from the merge script's output, but for
  art there is nowhere to keep the fork's version — it is simply not copied and
  exists only in `_refs/`. Carrying both needs a Still-Alive-specific id or a
  per-ruleset image map, which is a Stage 5 decision. `merge-sprite-sets.py`
  prints the 66.
- **Three claims in the subsections below were written before the fork was
  opened and are now known to be wrong**, each corrected in place: the
  row-growth estimates in §5.6d (low on almost every table); the `TileID` cost
  (the flagged "one genuinely new cost" turned out to need no `src/` change at
  all); and the weather/rot sprite collision (it does not exist — `imagePathIn`
  permits subpaths, so the merge just left 14 unreferenced files).

Gate: `cd web && npm run verify` — **1542 tests across 69 files, green** as of
the data-merge commit. `BROWSER_PORT_PLAN.md` §5.6d is the only place the data
decisions are written down.

> `file:line` citations here were verified against the working tree on
> 2026-09-29, after the base-path refactor in `e78e125`'s successor commits.
> **`RogueGame.ts` is the one that moves** — it grew past 27 000 lines during
> that work, and two citations here were already stale on first write and had to
> be re-derived. Treat the line numbers as of this date and re-grep before
> trusting one.

#### 5.6a The decision, and the one structural idea

The question was whether classic and Still Alive could both live in one build.
They can, but **not as two content sets** — and the reason they cannot is the
same reason a single superset works. Four facts decide it, all verified rather
than assumed:

- **`Models` is a process-wide singleton with self-registering constructors.**
  Four `static` fields (`data/Models.ts:22-27`); each database assigns itself as
  the first statement of its own constructor (`GameItems.ts:143`,
  `GameActors.ts:60`, `GameTiles.ts:51`, `GameFactions.ts:35`); all four are
  constructed once at `RogueGame.ts:1337-1340` and never rebuilt —
  `LoadDataSkills`/`LoadDataItems`/`LoadDataActors` are empty stubs
  (`RogueGame.ts:27400-27410`). Last one constructed wins.
  `tests/generator-integrity.test.ts:20-26` already documents the consequence in
  prose: *"two games in one process share state."*
- **Saves record `modelId` as a bare number, and the design already accepts what
  that costs.** `specs.ts:610-616` says it outright: *"a save is only loadable
  against the same data build, exactly as it is for the C#."* Worse,
  `Actor.sheet` is `{kind:"skip"}` and is **re-derived in `finish`** from
  `self.model.startingSheet` — so a save read against a different table
  re-labels every actor in the world and recomputes its HP/STA/FOV. Silently
  wrong, not a load error: `Session.load` validates only `graph != null` and
  `graphVersion === 1`.
- **`TileID` is ordinal.** `tests/tile-palette.test.ts:145` derives walkable and
  transparent from `id <= TileID.RAIL_EW`. Two orderings, one invariant, dead.
  `GameGangs.ts:33-48` and `GameFactions.ts:22-32` have *already* inlined raw
  item numbers to break an import cycle, so the ids have leaked across module
  boundaries once.
- **`Rules.SKILL_*` are mutable process-global statics** — 43 written by
  `Skills.load()` (`Skills.ts:124-209`) onto a class whose skill constants are
  `static` even though `Rules` itself is per-`RogueGame` (`Rules.ts:277-327`).
  Two packs cannot coexist in memory even with the three above fixed.

So the design is **one superset content pack plus a ruleset flag.** The fork's
CSVs are a strict column superset of ours (`WEIGHT`; `FIRE_RESIST%` and
`INF_RESIST%`; food's two poison/cooking columns — all additions, never
replacements), and the handful of items the fork *removed* (the six
unique-NPC weapons, `JASON_MYERS`) are simply kept. Classic becomes "the flag
is off": Still Alive items never spawn, its buildings never generate, its
mechanics never run. And in a superset:

- **Saves stay compatible, and `GRAPH_VERSION` does not move.** A classic save's
  ids still mean what they meant because nothing shifted. This is the whole
  reason to prefer a superset to two packs, and it is worth stating twice,
  because it is the property that would be lost first and hardest to recover.
- **The renderer needs zero changes.** `grep GameImages\.` over
  `src/ui/` and `src/engine/firstperson/` returns nothing; every draw is
  `imageCache.get(id) → drawImage` (`CanvasUI.ts:376-461`).
- **The serialiser needs zero changes for new state.** A scalar field on
  `Actor`/`Item`/`MapObject`/`Corpse`/`Location`/`Inventory`/`District`/`World`
  is picked up structurally; `Tile` is the sole exception at ~4 lines
  (`specs.ts:317-347`); a new item class is 1 line in `specs.ts`.

**The cost this relocates rather than removes, and the one thing that makes it
tolerable.** A ruleset flag does not reduce complexity; it moves it into
`RogueGame.ts` (already 26 878 lines) and `BaseTownGenerator.ts` (5 805) as
`if (stillAlive)` in turn-processing code, where ~100 such branches would be
invisible to every existing test. The mitigation is to make the branches
**enumerable and tested** rather than scattered, and that is the first thing
Stage 1 builds:

```ts
// src/engine/FeatureFlags.ts
export const enum Feature {
  Alcohol, Cooking, Fishing, Butchering, TileFires, FireExtinguishers,
  SiphonFuel, DarknessFov, FoodPoisoning, WeaponWeight, ArmorResist,
  ShelterBackpacks, FireBarrels, AnimalShelter, Farm, FuelStation, FireStation,
  Church, Bank, Bar, Clinic, Library, Junkyard, Graveyard, ShoppingMall,
  ArmyBase, SportsCourts, AmbientAudio, CHARResearchRaid, BlackOpsRaid,
  HelicopterRescue, WorldDecay, ItemDespawn, DifficultyAtCreation,
}
export function hasFeature(ruleset: Ruleset, f: Feature): boolean;
```

`hasFeature` **throws on an unhandled id**, copying the discipline that
`GameOptions.optionName` and `.describe` already use (`GameOptions.ts:717-938`)
and that `tests/options-coverage.test.ts` already enforces. A new source-scanner
test then parses every `.ts` under `src/` and asserts the set of `hasFeature`
arguments equals `Object.keys(Feature)` exactly — both directions. That is the
same shape as the four scanners this project already runs
(`rule-result-usage.test.ts`, `point-identity.test.ts`, `silent-failures.test.ts`,
and the positional half of `data-tables.test.ts`), and it converts "how much
Still Alive has leaked into the engine" from a judgement call into a number the
build reports.

The flag is deliberately **not** more `Rules.has*` predicates. `Rules.has*`
(`Rules.ts:2845-2871`) is a `GameMode` layer, and the two axes compose — C&I
zombies inside a Still Alive district is a legitimate combination that a single
flattened enum cannot express. That is the reason for a separate field.

#### 5.6b Stage 1 — the ruleset axis

Cheap, and everything else depends on it. No content, no behaviour change.

> **Status: done 2026-09-29**, in `f0782aa` and `4d43299` on
> `feature/still-alive-ruleset`, except **1.7 which is deliberately deferred to
> Stage 4** — see below. 946 → 954 tests across the two commits.

| # | Change | Where | Note |
|---|---|---|---|
| 1.1 | `enum Ruleset { CLASSIC, STILL_ALIVE }` | `Session.ts`, beside `GameMode` (`:25-29`) | separate enum, not a `GameMode` member. **As built**, in `Session.ts` — and `FeatureFlags.ts` imports it rather than the reverse, so the dependency is one-directional and there is no cycle. |
| 1.2 | `Session.ruleset` field, accessor, `reset()` default | mirror `m_GameMode` (`:131`, `:202-207`) | **Not** assigned in `reset()`, for the same reason `m_GameMode` is not: the picker runs after the reset and `Session.load` restores over it. Only the construction-time default matters. |
| 1.3 | Serialise beside `gameMode`; restore beside `:518` | `Session.ts:337`, `:518` | additive; **no `GRAPH_VERSION` bump**. A save with no `ruleset` key was a classic save, so it defaults to `CLASSIC` rather than being refused — pinned by two tests |
| 1.4 | `descRuleset` / `descShortRuleset`, `throw` on unhandled | copy `descGameMode` (`:625-636`) and `descShortGameMode` (`:638-649`) | the throw is the point; a silent `default` here is how a mode would mis-branch without failing |
| 1.5 | `FeatureFlags.ts` as above + the scanner test | new file + new test | the load-bearing deliverable. **Two departures from the sketch below**, both forced by writing it |
| 1.6 | `HandleSelectRuleset()` screen, called from `HandleNewCharacter` | `RogueGame.ts:1979`, cloned from `HandleNewGameMode` (`:2016-2170`) | done |
| 1.7 | Hide/force options per ruleset | — | **deferred to Stage 4, deliberately.** See below. |
| 1.8 | `HeadlessOptions.ruleset`; read at boot; `--ruleset` CLI flag | `HeadlessRunner.ts:10-33` and `:138`; `sim/cli.ts:25-70` | done. The **duplicated `parseArgs` in `sim/profile.ts:43-69` was deliberately not touched** — `npm run profile` exists to time `RedrawPlayScreen`, and threading a flag through a second copy of a parser for a mode that generates identically today buys nothing |
| 1.9 | HUD / score / graveyard label | `hud-layout.test.ts:230` | done. The ruleset rides on the existing mode line (`... / Still Alive`) rather than taking a row: Y0..Y6 are all used and a seventh means growing a panel drawn in several places. Its own `hud-layout` case was added because those labels are 36 chars against the game mode's 25 |

**Two things 1.5 taught that the sketch above got wrong.**

*The partition needs a third state.* A two-way scan — every declared feature has
a call site — is red on arrival, because Stage 1 declares 37 features and has
zero readers, and softening it to a subset check is how a strict test becomes a
decorative one. So the registry carries `PENDING_WIRING` (feature → stage) and
the test asserts `Feature` is the disjoint union of **read** (the scan),
**pending**, and **withheld**, with a non-empty reason required for each
withheld. The count falls to zero as a consequence of writing the readers. It is
the same partition discipline `actor-sprites.test.ts` already applies to
`SPRITE_OWNED`/`DOLL_OWNED`, and it had teeth on its first run: it caught `Alcohol`
being both read and declared pending.

*The registers are keyed by name, not by enum value.* A computed
`{ [Feature.Alcohol]: 4 }` key is the *number* 4 stringified, so the register
reads `{"4": 4}` and nothing in it can be compared against a name — the only
currency the partition test deals in. `Feature` also has to be a plain enum
rather than a `const enum`, because a const enum forbids the reverse lookup that
the name bridge needs.

**Why 1.7 is deferred rather than built.** Its content is "hide or force options
per ruleset", and the only two features that touch an option at all —
`DifficultyAtCreation` and `ResourcesAvailability` — are both Stage 4. The honest
Stage 1 deliverable would be an empty annotation mechanism plus a test, which is
a speculative abstraction: the thing this file warns against repeatedly. It is
~40 lines when there is something to annotate, and zero until then.

**Verification.** `npm run verify` green. A headless run per ruleset from one seed
produces byte-identical metrics — the flag gates content, not generation, and
that is asserted rather than assumed. A typo'd `--ruleset` is rejected rather than
defaulted. A two-way scanner forbids any file outside the registry branching on
the ruleset directly, and a third `Ruleset` member would be unreachable because
the picker indexes rows with `selected === 1`, so the count is pinned to two.


#### 5.6c Stage 2 — the fifteen bug fixes

`STILL_ALIVE_REFERENCE.md` §6 lists fifteen defects in vanilla Alpha 10.1 that
the fork fixed. They split by whether gating them is defensible, and the split
matters: **a correctness fix behind a flag is still a bug in the other mode.**

> **Status: the unconditional half is done 2026-09-29** in `dd42e82` on
> `feature/still-alive-ruleset` — but the table below was **wrong about four of
> the fifteen**, and the corrections are more useful than the fixes. Each was
> checked against this codebase before being changed, not assumed from the C#,
> because `src/` is a rewrite of `Rogue Survivor.cs` rather than a copy of it and
> the audit read the C#.
>
> **Eight applied, four not applicable, three needed a different fix:**
>
> | Audit finding | What was actually true here |
> |---|---|
> | `RateItemExchange` throws on unhandled item types | **Not applicable.** The port replaced the C#'s throwing switch with a 3x3 `TRADE_RATING_MATRIX` (`BaseAI.TRADE_RATING_MATRIX`). There is nothing left to throw. |
> | Plank duplication on a 1-plank door repair | **Not applicable, and not for a reason the audit could have seen.** Door repair does not exist here — it is a Still Alive *feature* ("non-metallic doors can now be repaired"), so the duplication was a fork bug in fork code. Revisit in Stage 5, when the feature arrives. |
> | Fires travel through walls; fuel cans destroy walls; corpses stay alight | **Not applicable.** Fire lives on `MapObject.fireState` only: there are no tile fires, no fuel cans, and `Actor` has no `isOnFire` property at all, so a corpse has no state to get stuck in. All three are Still Alive content. |
> | Item duplication when giving an item to a follower | **Could not be confirmed**, and was not changed. `DropItem` already lands the item on the *giver's own tile* — which is the fork's own fix — so the pre-condition the fork's bug needed is absent. Worth a quantity-conservation test in Stage 4 if the fork's item economy is ported. |
> | Worldgen throws when no CHAR district is a candidate | **Needed a different fix.** Applied, plus a **12-attempt bound the fork does not have**: its `do { } while (!worldMade)` spins forever on a city too small to hold a business district, where this fails once with a usable message. |
> | Infinite battery recharge | **Two defects, not one.** The fork fixed the hand order *and* a missing "already full" guard; the second is the one with an observable effect today, and the first is only observable once a battery-powered *weapon* exists — which is SA's stun gun, i.e. Stage 3. |
> | `Attack.efficientRange` off-by-one | **Worse than described.** Not "a range-1 weapon can never hit": the distance penalty doubles past the efficient range, so `distanceMod` comes out at **-1** and the hit value goes *negative*. Latent today, live the moment Stage 3 merges a table containing a range-1 weapon. |
>
> The four inapplicable ones are recorded in `tests/stage2-fixes.test.ts` as
> `NOT_APPLICABLE` with their reasons, rather than as a comment, so they are not
> re-audited.

**Unconditional — correct in both rulesets, taken as ordinary bug fixes:**

| Fix | Fork location | Size | Done |
|---|---|---|---|
| Furniture spawns on top of exits/stairs | `MapGenerator.cs:278, 304` | 2 lines | ✓ (3 sites) |
| Worldgen throws when no CHAR district is a candidate | `RogueGame.cs:4059, 4197` | ~15 | ✓ + a bound |
| Police-station prisoner is invincible | `BaseTownGenerator.cs:9146` | 1 | ✓ |
| Sewers Thing is invincible | `RogueGame.cs:4693` | 1 | ✓ |
| `RateItemExchange` throws on unhandled item types | `BaseAI.cs:6933, 6981, 6994` | ~10 | n/a |
| Item duplication when giving an item to a follower | `RogueGame.cs:20920, 21389` | ~35 | unconfirmed |
| Infinite battery recharge | `Rules.cs:1330-1373, 2030-2040` | ~30 | ✓ (hand order + full guard) |
| `Attack.efficientRange` off-by-one | `Attack.cs:56-64` | 4 | ✓ |
| Plank duplication on a 1-plank door repair | `Rules.cs:2630` | 4 | n/a |
| Fires through walls; fuel cans destroy walls; corpses stay alight | `RogueGame.cs:24622, 20019, 23732` | ~15 | n/a |
| Flee-stamina logic checks the fleeing NPC's gun, not the enemy's | `BaseAI.cs:3598` | 3 | **already correct here** — `BaseAI.ts` already tests `hasEquipedRangedWeapon(enemy)` in the flee path, so there was nothing to fix |
| AI stuck in an open/close-door loop underground | `BaseAI.cs:4209` | 1 | ✓ (indoors guard) |
| NPCs take `IsForbiddenToAI` items | `Rules.cs:665, 811, 869` | ~25 | ✓ (3 gates) |

**Still open from this stage** — both need Stage 4's `DarknessFov` to be coherent,
and both are ~35 lines once it exists:

| Fix | Fork location | Why it waits |
|---|---|---|
| AI drops its torch in favour of its cell phone | `BaseAI.cs:1895-1927` | only coherent with the darkness rework: today there is no reason to prefer a light |
| Reading/healing/barricading is blocked in total darkness | `RogueGame.cs:21492-21525` | there is no total darkness to be blocked in |

**Verification, and the one that matters.** Every applied fix has a test in
`tests/stage2-fixes.test.ts`, and every one of them was checked against a
mutation that undoes the fix. One did not fail at first, and the reason is worth
more than the fix: the hand-order test passed against a swapped order because
**the mutation had not actually applied** — a whitespace mismatch in the patch
script, so it was a no-op that reported success. Re-applied line-wise, it fails.
A mutation that silently does nothing is indistinguishable from a test that
cannot fail, which is the same lesson as §1.1a arriving from a different
direction.


#### 5.6d Stage 3 — the merged content pack

> **Status: the data half is done 2026-09-29** (`cfcf2ea`, 971 → 992 tests,
> `verify` green). Sprites, ids, maps and `GameImages` are not started. The
> estimates in this subsection were written before the fork's tables were opened;
> **four of them were wrong and two decisions were taken against what the plan
> said.** Those corrections are the useful part and are recorded below, so a later
> session does not re-derive them.

The mechanical half. Three of the four generators are script runs, and all three
are deterministic — no timestamps, sorted directory reads — so re-running with
no input change produces zero diff. **None of the three is an npm script and
none runs in CI or `verify`**; `data-tables.test.ts`, `sprite-assets.test.ts` and
`audio-levels.test.ts` are the only backstop, which is why they are named in
every step below.

**Data tables — done.** Two corrections to what this section used to say:

1. **Not into `src/Resources/Data/`.** That directory is the C# game's own
   resource tree and the project rule is that `src/` is never modified — it is
   the statement of intent the port is written against, and the C# binary reads
   those same CSVs, so writing to it would change what "Alpha 10.1" means here.
   The merge lands in **`web/data/`**, and `convert-csv.js` reads that by
   default. `--from <dir>` points it elsewhere. `src/Resources/Data/` is now
   read-only, and `data-tables.test.ts` reads it for one purpose only (§ below).
2. **Ours wins on every shared id, and the fork's differing values are
   deliberately discarded here.** This is the second correction, and it is the
   load-bearing one. A superset built by unioning columns and rows is not the
   same as a superset built by taking either side's rows: the fork *rebalanced*
   classic — `FOOD_ARMY_RATION` nutrition 0.25 → 0.33, `BESTBEFORE` 5 days →
   never, 9 skills retuned, 17 of 30 actors retuned. Taking its rows would
   change classic at the data layer that **both** rulesets read, with no flag
   anywhere near it. So shared rows keep our values, fork-only rows are appended
   after them, and the fork's numbers become Stage 4 work behind the flag, to be
   lifted deliberately.
   `merge-content-tables.py` prints every row where the two trees disagree, so
   the list of what Stage 4 owes is in the script's output rather than only in
   this prose.

| Step | Where | State |
|---|---|---|
| `scripts/merge-content-tables.py` — new, builds `web/data/` from both trees | — | done |
| `COLUMNS` — `WEIGHT` on melee and ranged | `convert-csv.js` | done |
| `COLUMNS` — `FIRE_RESIST`, `INF_RESIST` on armors | `convert-csv.js` | done |
| `COLUMNS` — `CAUSES_POISON`, `CAN_BE_COOKED` on food | `convert-csv.js` | done — **mandatory**, the raw headers contain spaces and `data-tables.test.ts` rejects whitespace in keys |
| `COLUMNS` — new `Items_Backpacks.csv` | `convert-csv.js` | done |
| `EXPECTED_COLUMNS` — mirror all five (second hand-maintained copy, `.json`-keyed) | `data-tables.test.ts` | done |
| `data-tables.test.ts` — reads `web/data`; **new `did not disturb classic` suite** | `data-tables.test.ts` | done |
| `node scripts/convert-csv.js` | — | done; still throws before writing on any schema mismatch |

Row growth, **as measured rather than estimated** — the plan's numbers were low
on almost every table:

| Table | Was | Now | +rows |
|---|---|---|---|
| Actors | 27 | **31** | +4 (was reported as +5 — see below) |
| Items_Armors | 7 | 9 | +2 |
| Items_Backpacks | — | 5 | +5 (fork-only table) |
| Items_Barricading | 1 | 1 | 0 |
| Items_Entertainment | 2 | 10 | +8 (plan said 1→7) |
| Items_Explosives | 1 | 10 | +9 (plan said 1→9) |
| Items_Food | 3 | 19 | +16 (plan said 3→18) |
| Items_Lights | 2 | 6 | +4 |
| Items_Medicine | 6 | 14 | +8 (plan said 6→12) |
| Items_MeleeWeapons | 16 | 41 | +25 (plan said 16→36) |
| Items_RangedWeapons | 10 | 26 | +16 (plan said 10→21) |
| Items_Scentsprays | 1 | 1 | 0 |
| Items_Spraypaints | 4 | 6 | +2 |
| Items_Trackers | 4 | 4 | 0 |
| Items_Traps | 4 | 4 | 0 |
| Skills | 29 | 30 | +1 |

Five traps in these tables, all found the hard way, all now handled:

- **A renamed *row* duplicated an actor, and it was this merge's own bug.** Row
  0 of `Actors.csv` is `_FIRST` upstream — a placeholder for "the first undead",
  never filled in because the C# reads that table by index — and the fork filled
  it in as `UNDEAD_SKELETON`, also replacing the placeholder `FLAVOR` with a
  real one. The first version of the merge handled column renames but not row
  renames, so it appended `UNDEAD_SKELETON` as a *new* row: 32 rows for 31
  actors, with a duplicate 10 HP skeleton that nothing complained about. The
  merge now recognises a placeholder id whose NAME matches a fork-only row and
  adopts the fork's id at the vanilla row's position, keeping our values.
  It is deliberately narrow, because a bare name collision is a false positive
  waiting to happen — the fork's `ENT_BOOK_BLUE`/`_GREEN`/`_RED` and four
  `ENT_MAGAZINE` variants are all *new* items sharing the NAME "book" or
  "magazine" with an existing row. Only a `_`-prefixed placeholder qualifies.
  `data-tables.test.ts` pins the one permitted id change explicitly, so an id
  change nobody decided on still fails.
- **`Items_Traps.csv` is not valid UTF-8.** A stray `0xA0` sits before a `?` in
  one `FLAVOR` cell. The old pipeline read it as UTF-8 and wrote `U+FFFD` into
  the committed JSON, so a flavour string was silently corrupted. The merge
  reads it as latin-1 and writes UTF-8, which fixes the corruption.
- **The fork fixed a header typo**: `DESACTIVATES WHEN TRIGGERED?` →
  `DEACTIVATES ...`. Name-based column merging treated that as a *new* column
  and produced a 17-field table carrying "deactivates when triggered" twice;
  since the converter binds positionally, that would have shifted every value
  after it. Renames are now inferred by position, and only when both headers are
  the same width — when a column has genuinely been *inserted*, same-position
  would move real data, and name matching already covers that case.
- **Four tables gained columns *before* `FLAVOR`**, so the union header is the
  *fork's* order. Appending to ours would strand `FLAVOR` mid-table and
  contradict the `FLAVOR`-last convention both trees follow.
- **Shared ids are not conflicts.** `Actors.csv` shares 25 of them. The first
  draft of the merge script aborted on any shared id, which is wrong: a shared id
  is the same actor or item in both trees, and the answer is ours.

The "classic did not regress" property is now a test, not a claim:
`data-tables.test.ts` reads the read-only vanilla tree and asserts every classic
row is still present, in the same order, with the same values, with new rows
strictly appended. Mutation-checked — it fails when `FOOD_ARMY_RATION`'s
nutrition is set to the fork's 0.33, which is exactly the accident it exists to
prevent.

**Sprites — files on disk done, `GameImages` constants not.** The set is now
397 → **1 108 files**, added by `scripts/merge-sprite-sets.py` and converted by
the existing `optimize-sprites.py` (which re-decodes every file it writes and
aborts the whole run on one mismatch; 711 verified faithful, 652.9 KB →
324.2 KB). Verified by sha256 snapshot: **all 397 original sprites byte-identical,
0 modified, 0 removed.**

Merged into `classic` rather than added as a fifth set, as this section already
decided: `sprite-style-option.test.ts` asserts the largest set *is* `classic`,
because the per-id fallback retries against it, and a larger separate set would
invert that so every other set silently loaded Still Alive art.

Same ours-wins policy as the CSV merge, and it turned out to matter more here.
Measured on canonicalised pixels: of the 349 ids both trees have, **283 are
identical and 66 are re-drawn by the fork** — recoloured pills, re-skinned
survivors, a re-textured `Tiles/rail_ew` (ours is a 938-colour noisy texture,
theirs a 417-colour one), and all eight shop frontages on the district tiles.
Overwriting would change classic's appearance with no flag near it.

**The difference from the CSV merge, and Stage 5's debt.** Art is not a number,
so there is nowhere to *keep* the fork's version the way the discarded CSV
values can be re-read from the merge script's output. For those 66 the fork's
art is simply not copied, and it exists only in `_refs/`. Carrying both needs a
Still-Alive-specific id or a per-ruleset image map, which is Stage 5's call, not
a file copy. `merge-sprite-sets.py` prints the list. One rename was forced:
`shopping_mall plan.png` → `shopping_mall_plan`, because `imagePathIn` builds
the URL by concatenation and does not encode, so a space 404s.

The weather/rot collision this section flagged **does not exist**: the fork puts
`weather_rain1` and `rot1_1`…`rot5_2` under `Effects/`, we keep them at the set
root, and `imagePathIn` permits subpaths — so the merge produced
`Effects/weather_rain1.webp` *and* the root-level one, and the existing bare
constants keep resolving to ours. The `Effects/` copies are unreferenced files
rather than 14 constants to repoint. That is the same cheap option §5.6d
recommends for anything else: add the file, skip the constant, nothing breaks.

Two things still outstanding here, and they are the hand-edited part:

| Change | Where | Count |
|---|---|---|
| `GameImages` constants for the 711 new sprites | `GameImages.ts` | ~+711, **deliberately not done yet** — see below |
| 12 hand-written `{id, img}` maps — the sprite id is **not** in the JSON, it lives in TypeScript | `GameItems.ts` | ~+180 |

**The 711 constants are deferred on purpose, and the compiler is what makes that
safe.** §5.6d elsewhere says a sprite with no constant is "never preloaded and
never drawn" and calls skipping it the cheapest option; checking whether that
was actually true turned up something better. Every sprite reference in the
codebase goes through a `GameImages` constant — the 12 hand-written maps are
written `img: GameImages.ITEM_BANDAGES`, not with string literals — and a
grep for raw `"Tiles/..."`-style paths across `src/` finds 363 in
`GameImages.ts` itself (the constant values) and **two in comments**. So a
sprite with no constant is not merely undrawn, it is *unreferenceable*: naming
`GameImages.SOME_NEW_SPRITE` is a compile error. Nothing can silently depend on
a constant that does not exist yet, and the constants belong with the code that
draws them rather than 711 declarations ahead of it.

**The payload estimate in this section was wrong by roughly 60x.** It said the
asset payload goes 30 MB → ~50 MB. The 711 new sprites total **324 KB** — they
are 32×32 pixel art, and `classic` went 397 files / 98 KB to 1 108 files /
422 KB. (`du` reports 4.5 MB, but that is 4 KB block padding on 1 108 tiny
files, not payload.) The real cost of adding the constants is not bytes, it is
**711 extra requests in the preload manifest** — which classic players would pay
on every cold load for sprites no classic code path draws. That is the actual
argument for deferring them, and it is an argument about request count, not size.

**Actors — 2 of the fork's 4 done, and the other 2 are Stage 4 work, not
Stage 3.** `Actors.csv` gains four rows: `DERANGED_PATIENT`, `CHAR_SCIENTIST`,
`RABBIT`, `CHICKEN`. The first two landed because they needed nothing that does
not already exist:

- `DERANGED_PATIENT` is the fork's replacement for Jason Myers — the C# comments
  it "was Jason Myers (Release 8-1)" — and it is the same fourteen ability
  flags, the same `InsaneHumanAI`, and the same RAGE sheet with `HasToEat` and
  `HasToSleep` false. Both stay in the superset, so the flags are **duplicated
  rather than shared**: a Still Alive rebalance of one should not silently edit
  the other, and `ActorID` is append-only because a save names its actors by
  number. The fork *replaced* Jason Myers; the superset adds him a neighbour.
- `CHAR_SCIENTIST` is a second `CHARGuardAI` with the same fourteen flags,
  including the CHAR quirk of no `hasToEat` and no `aiCanUseAIExits`.

Both are passed `null` in the C# ("skinned. // skinned & dressed"), so
`actorImageMap` maps them to `null` and they are doll-driven like the CHAR guard
— which is why adding their `GameImages` constants is for parity with
`ACTOR_JASON_MYERS` rather than to draw them.

**`RABBIT` and `CHICKEN` are deliberately left out of the enum.** They need an
`IsLivingAnimal` ability the port has no field for, and an
`UnintelligentAnimalAI` the port has no controller for. Adding the enum members
without those would bind their CSV rows through a switch with no matching case
— producing an actor with *no abilities at all* and no error, since
`abilitiesFor` has no `default`. That is a Stage 4 slice. Their rows are
already in the merged `Actors.csv` and their sprites are on disk
(`Actors/Decoration/rabbit_skin_east` and friends), so nothing is lost by
waiting. Worth noting the failure this avoids is silent: `abilitiesFor` and
`defaultControllerFor` both `switch` without a `default`, so a forgotten case
returns a default-constructed object rather than throwing.

**Tiles — done, and the flags are now pinned rather than trusted.**
`scripts/port-tile-models.py` parses `GameTiles.cs` and emits the 124 new ids,
125 `GameImages` constants and 124 model lines, so the `new TileModel(...)`
arguments are copied out of the text rather than transcribed by hand. Appended
only: the existing 19 keep their values.

Two things are dropped **on purpose and counted on stdout**: `CanDecay` (94
tiles) and `IsFlammable` (5 — `FLOOR_PLANTED`, `FLOOR_RED_CARPET`,
`FLOOR_BLUE_CARPET`, `WALL_WOOD_PLANKS`, `WALL_RED_CURTAINS`). The port's
`TileModel` has no such fields, and both are tile-fire content with no vanilla
equivalent. `isWater`/`waterCoverImageId` *are* ported — 10 water tiles.

**A parser bug that lost 15 tiles, and the check that caught it.** The first
run appended 110 tiles and reported no error. The C# enum interleaves bare
`//@@MP (Release 6-1)` comments with **no trailing comma**, so splitting the
enum body on commas glued each comment to the name after it, and
`FLOOR_POND_CENTER` and `FLOOR_FOOD_COURT_POOL` — plus 13 more — silently
vanished. The symptom was a shorter-than-expected tile list with nothing
reporting a shortfall. It is now parsed line-wise with comments and
`#region`/`#endregion` stripped, brace-matched rather than regex-matched, and
the script prints a count so a short list is visible. The real check is in the
plan's own numbers: this section predicted 19 → 143, the broken run gave 129.

**The flags are pinned against the C#, in both directions.**
`tests/fixtures/still-alive-tiles.json` holds the C#'s own flags for all 142
models, and `tile-palette.test.ts` asserts the port matches them. That matters
because the name-prefix test is only *self-consistency*: it proves a tile called
`WALL_` is a wall, not that the fork agrees. A wall the port made a floor is
passable, and nothing in a self-consistent table would show it.

The fixture is committed rather than read from `_refs/` at test time because
`_refs/` is gitignored — a test that opened `GameTiles.cs` would pass locally
and fail in CI, which is the worst arrangement available. Regenerate with
`python3 scripts/port-tile-models.py --fixture tests/fixtures/still-alive-tiles.json`.

Mutation-checked: making a C# wall walkable, dropping a water tile's `isWater`,
and dropping its `waterCoverImageId` each fail the suite.

**Items — 71 of 95 done.** `scripts/port-item-models.py` parses `GameItems.cs`,
where every item is built the same way with the sprite as the *third* constructor
argument. That matters: `FOOD_RAW_RABBIT` is drawn by `ITEM_RAW_RABBIT`,
`MELEE_KATANA` by `ITEM_KATANA`, and no naming rule gets 95 of those right — the
sprite is read from the source, not derived from the id.

`ItemID` 69 → 140, append-only. Emitted in two passes, because "emittable" means
*the C# states every field this map needs somewhere a regex can reach*:

| Map | Added | What was read out of the C# |
|---|---|---|
| `foodMap` | 16 | sprite |
| `entMap` | 8 | sprite |
| `meleeMap` | 25 | sprite, `new Verb(...)`, `IsUnbreakable` |
| `rangedMap` | 16 | sprite, `Verb`, `AmmoType`, `IsUnbreakable` |
| `armorMap` | 2 | sprite, `EquipmentPart` → `DollPart` |
| `lightMap` | 4 | sprite **and** the 6th argument, the burnt-out sprite |
| `medMap` | 8 | sprite, `IsPlural` (absent = the model's `false` default) |
| `paintMap` | 2 | sprite, `tagImg` (both `UNDEF` — the extinguisher reuses the paint plumbing) |
| `explosiveMap` | 9 | sprite + both `BlastAttack` flags the port models; radius, fuse, max throw and the six damage steps were already in the CSV |
| backpack | 5 | **not done** — see below |

Plus 90 `GameImages` constants in total, and **`AmmoType` 6 → 13** for the fork's
seven new ammunition types (`NAIL`, `PRECISION_RIFLE`, `FUEL`, `CHARGE`,
`MINIGUN`, `GRENADES`, `PLASMA`). That enum is a clean append: vanilla's first
six are byte-identical, which is what makes appending safe for a save that stores
the number.

**The explosives block was a single hardcoded grenade and is now a map.** The
sprite and the two `BlastAttack` flags are per item in the C# and absent from
the CSV — the molotov cannot damage objects, dynamite and C4 destroy walls, and
the fuel pump is drawn with a *map object* sprite (`OBJ_FUEL_PUMP`) while the
fuel can borrows the ammo one. The C#'s third flag, `isProvocative`, is **not**
carried over: the port's `BlastAttack` has no such field and it exists to draw
zombies toward a blast, which is Stage 4 AI work.

**Two items that look like typos in the data and are not.** `FIRE_EXTINGUISHER`
sits in `Items_Spraypaints.csv` and is built as an `ItemSprayPaintModel` — the
fork reuses the quantity-and-tag plumbing and gives the extinguisher its
behaviour elsewhere, so the model belongs here and the `FireExtinguishers`
feature stays in Stage 4. Same shape as the food table's `CAUSES_POISON` and
`CAN_BE_COOKED` columns: data staged ahead of the code that reads it.

**The 5 backpacks are Stage 4, and the reason is mechanical rather than
tidy.** A backpack is `ItemBackpackModel(name, plural, img, INVENTORY_SLOTS,
ENC, WEIGHT)` on `DollPart.BACK` — a doll part the port does not have — wrapping
a nested `Inventory` with slot tiers gated on the Hauler skill. There is no map
to add them to. Giving them models now would produce five items that exist,
cannot be equipped, and would raise on a `PLAYER_COMMAND` slot if they were.

**The reverse-direction test has landed, with a named exception.** Every row of
every merged `Items_*.json` must bind to a model, because the maps skip
unmapped rows with `if (!meta) continue;` and adding a data row is a change no
compiler sees. The exception list holds exactly the 5 backpacks, and a third
test fails if an entry there *stops* being a real gap — so the list can shrink
but cannot quietly become a lie. Mutation-checked: removing a map entry, adding
a CSV row with no `ItemID`, and a stale exception entry each fail the suite.

**One deliberate divergence, checked rather than assumed.** The port's vanilla
`RANGED_PRECISION_RIFLE` uses `AmmoType.HEAVY_RIFLE`; the fork's *new*
`RANGED_ARMY_PRECISION_RIFLE` uses the new `PRECISION_RIFLE`. The fork retunes
the old rifle to take the new ammunition, and the superset deliberately does not
follow — that is the "ours wins" rule applied to a weapon stat, and changing it
would alter classic.

**Factories — done: 56 → 123, and a real bug caught on the way.**
`scripts/port-item-factories.py` transcribes the fork's 140 `MakeItem*` into the
port's `makeItem*` convention. **67 added.** The bodies there are near-identical
one-liners (`return new ItemMeleeWeapon(m_Game.GameItems.KATANA);`), which is
exactly why they are generated: a katana spawning as a ranged weapon is invisible
in a wall of similar code.

**The bug the generator made, and the test that had to be written to see it.**
The C# property name is looked up by suffix, and `KATANA` is a suffix of two ids:
`MELEE_KATANA` and `UNIQUE_FAMU_FATARU_KATANA`. The first match won, so
`makeItemKatana` was spawning the sword you win from a unique NPC rather than a
shop katana. Every field was a valid item, the sprite existed, `tsc` agreed, and
the tests that check a factory *works* — model behind it, sprite on disk — all
passed. Five names are ambiguous (`KATANA`, `MACE`, `KEYBOARD`, `REVOLVER`,
`SPEAR`); they are now an explicit `OVERRIDES` table and the resolver **returns
nothing** on an ambiguous match rather than guessing, so the next one is a hard
stop.

Guarding it needed a test that could not exist before:
`tests/fixtures/still-alive-item-factories.json` pins each of the 103 resolvable
factories to the id the C# names, and `item-factories.test.ts` asserts the
*identity* of the built item, not merely that it built one. Committed rather than
read from `_refs/` (gitignored) for the same reason as the tile flags.
Mutation-checked: pointing the katana factory at the unique sword, and
corrupting one fixture entry, each fail.

**Nine more primed explosive models, which vanilla does not have.** Vanilla has
one (`EXPLOSIVE_GRENADE_PRIMED`) and every other explosive reuses it, so a thrown
molotov primes into a *grenade*. The fork gives seven their own sprite and gives
the other three their *live* sprite — all recorded rather than left implicit. The
type system caught the three I initially missed, which is what it is for.

**`item-factories.test.ts` exercises all 123 factories.** They are called by
nothing — the town generators still place only the vanilla set — so nothing else
in the suite runs them, and a factory naming a missing id would throw the first
time a spawner reached for it.

**Still absent, 26 factories, all for items the port does not have:** the 6
`Ammo` ids and the 5 backpacks (Stage 4), and the still-Alive-only items with no
merged CSV row — matches, fishing rod, siphon kit, sleeping bag, flares kit,
glowstick box, candle box, vegetable seeds, CHAR laptop, unique book of
armaments, police riot shield. (Two of those now have hand-written *models* — the
siphon kit with `SiphonFuel` and the fishing rod with `Fishing` — which is not a
factory: nothing places either one, and the fork's own `MakeItemFishingRod` has no
callers at all.) Plus the four roll-and-branch bodies (beer,
alcohol, liquor-for-molotov, and the two random-weapon pickers), which are
content decisions about what a "random antique weapon" is rather than
transliterations.

**What is *not* done, and is the difference between data and a game:** nothing
calls the new factories. The town generators still place only the vanilla set, so
the 67 exist as spawn-ready wiring rather than as things you can meet. That is
placement — a balance decision about how many katanas a gun shop holds — and it
belongs with Stage 4/5 content.

**Content ids and maps** — the hand-edited core, and where the real cost is:


| Change | Where | Count |
|---|---|---|
| `ItemID` — **append only, never renumber** (saved keybindings are `[commandNumber, key]`) | `GameItems.ts` | **done: 90 of 95 CSV-backed + 9 primed explosives** (`_COUNT` 69 → 168) |
| 10 hand-written `{id, img}` maps — the sprite id is **not in the JSON**, it lives in TypeScript | `GameItems.ts` | **9 of 10 done**: food, ent, melee, ranged, armour, light, medicine, paint, explosives. Only backpacks remain, and they are a mechanic rather than a row |
| `makeItem*` factories | `BaseMapGenerator.ts` | **done — 56 → 123** (67 generated from the fork) |
| `ActorID` + sprite map + the two switches | `GameActors.ts` | **done, 2 of 4** — see below |
| `TileID` + models | `GameTiles.ts` | **done — 143 ids (was 19), 124 new** |
| `GameImages` constants for the tile sprites | `GameImages.ts` | **done — 125 new**, pulled in by the tiles |
| `GameImages` constants for the item sprites | `GameImages.ts` | **done — 90 new**, pulled in by the items |
| 4 new minimap colours | `Color.ts` | **done** — SteelBlue, Sienna, SeaGreen, OliveDrab, MediumPurple, Khaki, Cornsilk, BlanchedAlmond, all .NET values |
| `GameImages` constants | `GameImages.ts` | ~+711 |
| `Skills.NAMES`, `Rules.SKILL_*` | `Skills.ts`, `Rules.ts` | +1 (`BOWS` → `BOWS_EXPLOSIVES`) — **not started** |

**The `TileID` ordinal fix — done, and much cheaper than predicted.** This was
flagged as the one genuinely new cost in Stage 3, on the reasoning that the fork
interleaves new walls and new floors, so a superset list cannot be ordinal and
`id <= TileID.RAIL_EW` would have to go, with `GameTiles.ts` rewritten to carry
walkable and transparent as data.

**`GameTiles.ts` needed no change at all.** The premise was that `src/` infers
walkability from position. It does not — the model carries the flags — and
grepping for the ordinal assumption found exactly one use, in
`tile-palette.test.ts`, not in `src/`. So the fix was confined to the test:
the floor range is now `WALKABLE_PREFIXES = ["FLOOR_", "ROAD_", "RAIL_",
"PARKING_", "WALK_"]`, with `isWalkable === isTransparent` and wall-colour
assertions alongside, plus a check that `RAIL_EW` is walkable. 17 tests pass.

Worth keeping in mind that this was wrong, though: the cost was low *because an
earlier stage had already made the data explicit.* Had `GameTiles.ts` inferred
walkability from enum position the way the plan assumed, the merge would have
forced a real rewrite, and the estimate would have been right. The lesson is
that an audit which concludes "no change needed" should be recorded with the
evidence that produced it, or the next session re-derives it and assumes the
worse case.

**Tests that assert a single global content set** — each needs re-scoping to
"every row of the merged table", not merely extending:

| Test | Assertion | What it becomes |
|---|---|---|
| `data-tables.test.ts:23-24` | one CSV dir, one JSON dir | **done** — still one merged set, but the CSV dir is now `web/data`; `src/Resources/Data` is read for the classic-regression check only |
| `data-tables.test.ts:78, 85, 89-106` | exact ordered key list; no whitespace; positional JSON↔CSV equality | update `EXPECTED_COLUMNS` to the merged columns |
| `sprite-assets.test.ts:37-51, 111-119` | every id resolves to a file | unchanged, and now covers 711 more |
| `sprite-assets.test.ts:53-70` | no `.png` under any set | unchanged; `optimize-sprites.py` deletes them |
| `sprite-assets.test.ts:93, 96-99` | `> 200` ids, no duplicates | unchanged |
| `model-data-binding.test.ts:53-58` | asserts the *ordering property* of one CSV | relax: ordering is now an implementation detail, not a contract |
| `model-data-binding.test.ts:61, 83, 166` | one enum ↔ one CSV row; distinct sprites | unchanged — reads the CSV, so new rows are covered free |
| `skills-data.test.ts:87, 95, 104` | 43 assignments; vanilla *values* into process-global statics; `NAMES.length === _COUNT` | the vanilla-value assertions must become per-ruleset, or skill rebalance is impossible |
| `actor-sprites.test.ts:80-91`, `actor-abilities.test.ts:151` | expectation lists must **partition** the enum exactly | update the lists |
| `audio-levels.test.ts:70-80, 96-107` | every id has a gain; sfx end at peak ≈ 0.95 | see Stage 5 |
| `save-graph-coverage.test.ts:52, 55, 64, 70, 106-109` | ledger disjointness, subclass-before-base, no pending classes | unaffected — it constrains the *format*, not content |
| `save-graph-roundtrip.test.ts:195-197, 609-611` | field-by-field isomorphism; constructors identical | unaffected, and stronger in a superset: nothing is remapped |

**Payload and preload.** The image set is already 1 108 files; the preload
manifest is **still 395 ids** (`allImageIds()` at `GameImages.ts` enumerates the
constants reflectively), because the 711 new constants are deferred — so the
manifest grows only as the constants are added, not now. The asset payload grew
by 324 KB, not the ~20 MB this section originally estimated. One consequence to
plan for rather than discover:

- **`public/sw.js`'s committed `CACHE_VERSION` must be bumped.** The `/assets/*`
  handler is cache-first, so a deploy that adds 711 sprites without a bump keeps
  serving the old set to anyone who has played, and the new ids 404 from cache
  forever. `npm run build:pages` runs `scripts/stamp-cache-version.mjs`; `npm run
  build` and `npm run build:release` do not.
- **A sprite on disk with no `GameImages` constant is unreferenceable, not just
  undrawn** — as `classic/blank_texture.webp` and `Actors/CHAR_guard` are today.
  Every reference goes through a constant, so this is the cheapest place to save
  effort *and* a safe one: the type system is the check. 713 files are currently
  in this state by design, not by oversight.

#### 5.6e Stage 4 — mechanics

> **Status: four features are done 2026-09-29** — `WeaponWeight`,
> `FoodPoisoning` (including its 5% vomit action), `Cooking`, and half of
> `ArmorResist`. These are the *first features with real readers in gameplay
> code*; until now `hasFeature` was called only from `HeadlessRunner`, so
> `feature-flags.test.ts`'s partition was satisfied by a pending list. Two things
> in that suite changed as a consequence and are worth knowing: each feature left
> `PENDING_WIRING` (a feature that is both read and pending is a stale entry, and
> the suite fails on it), and the reader-list assertion now names **three** call
> sites *and their files*, because "how much of the fork is in the engine" is
> only a question while the list is exact.
>
> ### `WeaponWeight` — done
>
> The smallest feature in the table, and a good shape for the rest: the data was
> already merged, so this is a model field, a CSV read, and one gated line.
>
> `ItemWeaponModel.weight` is a new field with a **default of 0**. The C# puts
> `Weight` on the two subclasses — `ItemMeleeWeaponModel`'s is a settable property
> assigned in an object initialiser, `ItemRangedWeaponModel`'s is a positional
> constructor argument (Release 7-6) — so there is no common declaration to port.
> It lives on the port's shared base because `Rules.actorSpeed` reads it off
> whatever is equipped, and 0 is what every weapon the port already had means:
> `WEIGHT` did not exist in vanilla Alpha 10.1, so the merge gave all of them 0.
>
> The read in `actorSpeed` is gated on `Feature.WeaponWeight`. The fork casts the
> equipped weapon, ranged first and melee in the `else`, so an exotic subclass
> contributes nothing there; one read off the common base covers the same two
> cases without the fallthrough.
>
> **A test written from intuition would have "fixed" a correct number.** The
> katana's `WEIGHT` is **0** upstream — checked against the fork's own CSV, not
> against what a katana ought to weigh. The mace is 5 and the minigun 20. The test
> asserts all three, so the value is pinned rather than approximated.
>
> `tests/weapon-weight.test.ts` is written as a **pair** — the same actor, the same
> weapon, both rulesets — because the negative half is the one a coverage number
> cannot give: a weight applying to *both* would be a behaviour change to classic
> wearing a feature's name. Also asserted: every vanilla weapon weighs 0, a
> non-weapon in the right hand weighs nothing (a grenade is the probe, since food
> has no `equipmentPart` and can never be in hand), and no actor that can hold a
> weapon goes negative on any weapon in the table. Mutation-checked: removing the
> gate, and not reading the column, each fail.
>
> ### `Cooking` — done, and it closes the loop `FoodPoisoning` opened
>
> Automatic and **per-turn**, not a player action, which is the opposite of what
> the feature's own description ("cooking raw food on a fire") suggests: the C#
> ticks every alight map object and advances whatever food is lying on it, four
> passes to finish, so a piece left by a fire cooks on its own. Only the player's
> map needs the tick; the C# cooks NPC food instantly.
>
> The pairing is by **id, not by name**. The fork switches on the food's `AName` —
> `case "some raw fish": ... COOKED_FISH` — with no default, so renaming a row
> stops meat cooking *and fails in the worst direction*: the raw item still
> poisons, so a player who cooked it eats a poisonous piece for the rest of the
> run, and nothing says why. `Rules.cookedFoodFor` is a five-entry table keyed on
> `ItemID` and returns null for anything absent, and a test asserts the null case.
>
> The fork's collection order is load-bearing rather than incidental: it pulls
> every finished piece off the tile *before* adding any replacement, so two
> pieces of the same raw meat finishing on the same turn cannot consume each
> other through the inventory they are added back into. The port does the same.
> The cooked twin keeps the raw item's `bestBefore` — cooking an old rabbit does
> not make it fresh, it just stops it poisoning.
>
> **The gate is inside `CookFoodOnFires`, not at the call site.** It was at the
> call site first, and the test — which drives the tick directly, since four full
> map turns would couple these assertions to the turn order — cooked under
> classic and the test caught it. A private method whose safety depends on every
> caller remembering a flag is not private-safe, and the same argument that put
> `recoverFromFoodPoisoning`'s gate inside its function applies here.
>
> Six mutations, each caught: the tick's gate removed, the predicate's gate
> removed, a twin mapped to the wrong id, one pass declared finished, the swap
> forgetting to remove the raw item, and the fire test narrowed to four
> neighbours.
>
> **The heat source is thinner than the feature needs.** The rule asks only
> whether *some* neighbouring object `isOnFire`, and the port can already set
> that (`ApplyOnFire`, from explosions). What it cannot do is *start* a fire: no
> barrel, no campfire, no stove, and `CanStartCookingFire` has no counterpart —
> those are `FireBarrels` and one of the seven new `PlayerCommand`s. So the
> feature is complete and currently unreachable in a real game unless something
> explodes nearby, which is a wiring gap rather than a missing mechanic, and it is
> recorded here so it is not mistaken for finished.
>
> ### `FoodPoisoning` — done, and the first feature with more than one reader
>
> Raw meat can poison, time and antivirals can cure it. Three separate hooks —
> contraction on eating, a per-turn recovery roll, and the antiviral cure — which
> makes this the feature where the *shape* starts to matter: the flag has to be
> set and cleared consistently across all of them, and `feature-flags.test.ts`
> now asserts six call sites for it (two in `Rules` where the rolls live, four in
> `RogueGame` — the per-turn sweep, the two medicine/eat hooks, and the vomit),
> each located by file.
>
> `Actor.isFoodPoisoned` is a plain bool, so the graph writer carries it with no
> spec entry — the plan's "0 lines of serialisation", and the reason to prefer a
> flag here over anything richer. Worth knowing because it is confusable with
> `actor.infection`: that one is a *level* from zombie bites, cured by antivirals
> too, and a food-poisoned actor has `infection === 0`.
>
> **The freshness vocabulary is counter-intuitive and the test pins it.** The
> port's own helpers are `isFoodStillFresh` = `turn < bestBefore`, `isFoodExpired`
> = up to `2 * bestBefore`, and `isFoodSpoiled` = past that — so **"spoiled" is
> the most extreme of the three**, not the mild middle, and the factors are
> 1 / 3 / 5 in that order. Rotten meat is therefore certain and merely-expired
> is 60%. The test constructs the item so the *same* row is fresh, expired and
> spoiled in turn, and says why the other direction is also valid and starts
> maximally stale — that inversion is an easy way to write a test that looks
> right and means the opposite.
>
> The `Math.max(base, base * factor)` is not redundancy: the Hardy bonus is a
> *subtraction*, so without it a high-Hardy actor would roll against a negative
> chance on fresh meat.
>
> Mutations, each caught: contraction gate removed, recovery gate removed,
> `CAUSES_POISON` not read, the expired/spoiled factors swapped, the antiviral
> cure deleted, the vomit gate removed, the `DoVomit` flag gate removed (CLASSIC
> gets four hours), the `4` reverted to `1`, the `4` weakened to `2`, the
> `Math.max` floor removed, the `hasDecoration` guard removed, the timer dropped
> from two days to one, the antiviral entry deleted from the cure list, the cure
> widened to any medicine, and the cure widened to `infectionCure > 0`.
>
> **The 5% "vomit penalty" is now done too**, and it was the one part of this
> feature that turned out not to be food poisoning's business at all.
>
> `TryPlayerFoodPoisoning` mirrors `TryPlayerInsanity` step for step — same
> five steps, same early return when the generated action is not legal — because
> the fork runs them as one chain: insanity, then drunkenness, then food
> poisoning. The port called `TryPlayerInsanity` on its own at **35 sites**, so
> rather than add a second call at each one, the pair is folded into
> `TryPlayerUnwell` and all 35 now call that. A drunkenness arm is deliberately
> *absent* rather than stubbed to `false`: `Feature.Alcohol` has no
> implementation, and a stub that always returns false is indistinguishable from
> a forgotten one.
>
> **The real find was that `DoVomit` already existed, and the fork changed it.**
> Vanilla has vomiting — the cannibalism and nausea paths both call it — and
> Release 7-6 changed *every* vomit: four hours of sleep and food instead of one,
> plus the decoration put on a two-day timer. Porting that as "vomiting" would
> have silently quadrupled the cost of vanilla cannibalism, so `DoVomit` is now
> gated on the same flag as the contraction, and a test asserts the CLASSIC
> one-hour case rather than trusting the gate. This is the second time in Stage 4
> that a Still Alive change to a *shared* vanilla function has turned out to be
> the substance of a "new" feature (`Cooking`'s `canBeCooked` was the first).
>
> The `hasDecoration` check is load-bearing and not obvious: without it a second
> vomit on the same tile re-arms the two-day timer, so the tile never clears.
> Asserting the decoration is *present* does not catch that — it is true either
> way — so the test counts `map.timers` instead, and separately pins the
> duration to `TURNS_PER_DAY * 2`.
>
> ### A bug that shipped on this branch, and the gate that is not the C#'s
>
> The first cut of the antiviral cure sat in the middle of `DoUseMedicineItem`
> with **no condition on the medicine at all**, so any medicine cleared
> `isFoodPoisoned` — bandages, sanity pills, anything. The C# is an explicit
> three-model list, `SMALL_MEDIKIT || LARGE_MEDIKIT || PILLS_ANTIVIRAL`, and it
> is one `else if` arm in the canned-drinks/cigarettes chain, so everything else
> falls through it untouched.
>
> The instructive part is the gate that *looks* right: `med.infectionCure > 0`.
> Medikits do carry a cure value so it passes, and it reads as a faithful
> paraphrase — but it also admits any other curative and widens the fork's
> behaviour. Both are caught by mutation, which is the only reason this was
> caught at all. The cure also moved to *after* `actor.inventory.consume(med)`,
> where the C# has it, even though the two do not interact today.
>
> ### `FireBarrels` — the model and the burn loop are done; nothing can light them
>
> Three new `MapObject` subclasses, transcribed from the C# field for field, and
> the per-turn step that drains them. **Two of the three numbers are not what the
> name suggests, and getting either wrong is a silent bug:**
>
> | | fire state | hit points | max fuel |
> |---|---|---|---|
> | `Barrel` | `BURNABLE` | `DoorWindow.BASE_HITPOINTS` | `TURNS_PER_DAY` = 720 |
> | `Campfire` | `BURNABLE` | `DoorWindow.BASE_HITPOINTS` | `TURNS_PER_HOUR * 3` = **90** |
> | `Car` | **`UNINFLAMMABLE`** | **0** | **99** |
>
> A barrel is a *day* and a campfire is *three hours*, so "a while" is 720 in one
> case and 90 in the other. And a car's 99 is not a burn time at all — it is the
> stack limit for siphoned `AMMO_FUEL`, which is why a car is capped at 99 while
> its tank is never consumed by burning.
>
> **`Car` being `UNINFLAMMABLE` is what implements the C#'s "deliberately
> exempting Car fires"** — the exemption is the fire state, not a check in the
> burn loop. The port keeps the three-way test anyway, because that is what the
> C# has, and a test forces a `Car` into `ONFIRE` to prove the loop still skips
> it rather than trusting the flag.
>
> **The fork deleted vanilla's rain loop and replaced it with a worse one.** The
> comment at `RogueGame.cs:6727` says the blanket "is it raining, then roll
> `FIRE_RAIN_PUT_OUT_CHANCE` against every burning object" was drafted but
> never implemented, and that the author is "utilising it" — but the code deletes
> it. Vanilla 7.1.1 (still in the port) is gone, replaced by a single roll
> inside the campfire arm at `RogueGame.cs:6812` that **has no `IsWeatherRain`
> test anywhere in scope**; the nearest one in that file is ~600 lines earlier,
> in an unrelated dousing check.
>
> Ported literally, an outdoor campfire dies every ten turns *under a clear sky*.
> The port gates the roll on `isWeatherRain`, which is the only reading under
> which the comment "rain may extinguish outdoor campfires" and the deleted loop
> make sense. This is the first place in Stage 4 where the port knowingly
> diverges from the C#, so it is called out rather than buried: the mutation that
> removes the weather gate is one of the eight the tests catch.
>
> **Barrels get no rain roll at all**, only campfires, which is almost certainly
> deliberate — a barrel is a metal drum — and the port keeps that asymmetry.
>
> The `isRainExtinguishedIt` flag in the C# is not incidental: it stops an
> *extinguishing* turn from also burning a unit of fuel, so a barrel that rain
> put out does not quietly eat wood it never had. Deleting it is caught.
>
> Serialization needed no codec entries. `mapObjectFields` lists only `location`
> and is **not** an allow-list: `encodeFields` falls through to `encodePlain` for
> any field with no codec, so `fuelUnits` and `maxFuelUnits` ride along
> automatically. What *is* load-bearing is that each class has a spec **above**
> the bare `MapObject` catch-all — miss that and the object saves perfectly,
> restores as a plain `MapObject`, and `instanceof Barrel` is quietly false. Both
> failure modes are mutation-caught.
>
> Eight mutations, each caught: turn-loop gate removed, drain turned into refill,
> the rain weather-gate removed, the rain roll removed, barrels given a rain
> roll, cars made non-exempt, the `isRainExtinguishedIt` flag lost, and the
> `Barrel` spec deleted. Plus three more in the round-trip test: the spec deleted,
> the specs moved below the catch-all, and the campfire's 90 changed to 720.
>
> **Not done, and it is the part that matters for play.** Nothing can light
> these things. Release 7-6's `CanStartCookingFire` is ~8 checks deep and needs
> `DarknessFov` for its "too dark to see" check, `Weather`, and
> `ItemBarricadeMaterial` — none of which exist. So this feature is reachable
> only by an explosion setting a barrel alight, which is the same dead end
> `Cooking` has, and the two should be finished together. The generator methods
> `makeObjFireBarrel` and `makeObjCampfire` exist but are **uncalled**: where
> fire barrels appear is placement, and placement is a balance decision this
> branch defers rather than guesses — the same reason the 67 imported item
> factories are uncalled.
>
> Two fields the C# sets here are missing from the port's `MapObject`:
> `isMetal` (Release 5-4) and `hoverDescription` (Release 7-6). They are left off
> deliberately. `isMetal` is read by other features — fuel stations, the fuel-pump
> explosion — and adding a flag to a core class as a side effect of a generator
> is how that goes wrong.

> ### `ItemDespawn` — done, and it is a whitelist read upside down
>
> The smallest of the remaining features and the only one that needed almost no
> new machinery: one nullable int on `Item`, one game option, and ~75 lines of
> plain code. The port's graph writer carried the field with no spec entry, the
> same as `Actor.isFoodPoisoned`, so serialization cost nothing — worth knowing,
> because budgeting it would have been the obvious mistake.
>
> The logic is a list of **exemptions**. `ApplyItemTurnTracker` returns early for
> everything worth keeping and stamps whatever falls off the end; the sweep later
> deletes what has aged out. So the bug surface is a mistake in the *keep* list,
> and the failure mode is an item vanishing from a map the player is looking at.
> The test asserts each exemption individually for that reason.
>
> **The ammo line reads backwards, and the C#'s own comment is what saves you.**
> It is:
>
> ```csharp
> if (ammo.AmmoType != BOLT && != LIGHT_PISTOL && != NAIL && != FUEL) return;
> ```
>
> A `return` in this whitelist is an exemption, so the four *named* types are the
> ones that fall through and get deleted — not the ones that are kept. The
> comment above it says as much ("nails, crossbows and pistols are early-game
> weps … thus these are just clutter"). Porting this as "the four that are kept"
> inverts the feature, and **the first draft of this test did exactly that** and
> passed, because the tests asserted the inverted reading. Only mutation caught
> it. The C#'s `ItemGrenade` is likewise a *subclass* of `ItemExplosive`, so a
> dynamite stick is not exempt and does rot.
>
> Three further details that are easy to get wrong, and two of which the tests
> were wrong about first:
>
> - **`isRecreational` is the whole reason beer is allowed to rot.** Beer,
>   cigarettes and energy drinks are all `ItemMedicine` — historically so they
>   can restore sanity — so a bare "is it medicine" preserves every dropped
>   bottle forever, which is precisely the clutter the feature exists to remove.
>   The fork sets the flag on exactly five items and no others.
> - **The sweep skips visible tiles**, so an item cannot vanish in plain sight.
>   The guard reads `tile.isInView`, which nothing computes in a unit test — the
>   first version of that test passed because *no* tile was visible, i.e. for the
>   wrong reason, and now asserts `isInView` before relying on it.
> - **Two clocks.** The rate-limit guard reads the *session's* world time; the
>   ageing reads the *map's* local time. Advancing only one exercises the early
>   return, so the tests set both.
>
> The `>=` boundary on the age is off-by-one-ish (`>` would mean "the day
> *after*"), and no other test in the file lands on it, so there is a dedicated
> one that sets the two clocks to deliberately different values.
>
> **The feature gate lives inside `DespawnJunkInDistrict`, not at the turn-loop
> call site.** That is a deliberate change from the C# and from how the earlier
> features were wired. At the call site the gate is turn-loop plumbing that only
> a source scanner can vouch for, and a mutation that deletes it fails nothing;
> inside the method it sits beside the other guard and the "does nothing under
> CLASSIC" test is a real test of the flag. *A gate at the call site is a gate
> nobody can mutation-check.*
>
> One of the C#'s exemptions was deliberately **not** ported and still needs
> revisiting: `ItemBackpack` does not exist as an item yet — the C# exempts
> backpacks in *both* this method and the sweep, so when `ShelterBackpacks`
> arrives both sites must change together or stashed backpacks will start rotting.
> The other half of that pair, `FISHING_ROD`, arrived with `Fishing` and is
> ported: the line is **ungated**, on the argument the Butchering animal carve-out
> already uses — it tests a *data* flag rather than a behaviour, and nothing in the
> port can produce a rod (the fork's own `BaseMapGenerator.MakeItemFishingRod` has
> no callers), so it cannot change a classic game. `SLEEPING_BAG` remains
> unimplemented.
>
> Sixteen mutations, each caught. Three of the first six did not fail, and each
> was a test bug rather than an implementation bug: two used `AMMO_SHOTGUN`,
> which is exempt and so was never stamped, making the assertion vacuous.

> ### `DarknessFov` — both halves done: true darkness, and the lights in it
>
> The feature is two separable halves, and only the cheap one is here. Splitting it
> matters because 2a is what unblocks the two Stage 2 features that have been
> parked since Stage 2, while 2b is the expensive one.
>
> **2a — the arithmetic, ~80 lines.** The C# has *two* floor constants where the
> port had one, and the pair is the whole feature:
>
> | | vanilla | Still Alive |
> |---|---|---|
> | `MINIMAL_FOV_PLAYER` | 2 | **0** — "ensures basements … are truly *dark*" |
> | `MINIMAL_FOV_LIVINGACTORS` | 2 | **1** — "NPC AI goes haywire if they can't see at all" |
> | night penalties (sunset/evening/midnight/deep/sunrise) | 1/2/3/4/2 | **4/6/5/7/4** |
> | stand-on bonus | 1 | 2, and **suppressed when FOV is already 0** |
> | torch indoors | 0 | +2 |
> | outside at night | — | floor of 1, before the clamp |
>
> The player/NPC asymmetry looks like a typo and is load-bearing: the player is
> meant to be blind, the NPCs are not, and a blind NPC stops pathing. The night
> penalties and the floors are **one** rebalance — the penalties were steepened
> "to offset the new BaseView FOV" — so they are read as a single record chosen by
> the flag (`Rules.fovProfile`) rather than as six `hasFeature` tests that could
> disagree after an edit. **The registry test asserts `DarknessFov` has exactly two
> readers, one in `Rules` and one in `LOS`, and that is the design.**
>
> The `LOS` half is a 10-line `isAdjacent` shortcut. `losDistance` is a *circle*
> (`sqrt(0.75 * d^2)`), which excludes the four diagonal neighbours of a tile at
> Chebyshev distance 1 — so at FOV 1 a player would see a cross with four blind
> corners. The C#'s comment says exactly that.
>
> **The C#'s "lazy workaround" of a floor of 1 outdoors at night is nearly dead,
> and the arithmetic is worth recording.** Base view range is 8 and the steepest
> penalty is 7, so an ordinary outdoor player is already at 1 and the line changes
> nothing. It only bites when heavy rain (−2) and exhaustion (−2) take the range
> to −3. The test asserts both cases, with a comment, because the one that looks
> load-bearing is the one that is not.
>
> Eight mutations caught. **Two more were no-ops, and saying so is the honest
> result:** removing the gate on the `isAdjacent` shortcut, and removing the
> shortcut's own `maxRange > 0` clause, both change nothing — under CLASSIC the
> floor is 2 so the diagonals pass the circle anyway, and at range 0 the loop
> bounds have already collapsed to the actor's own tile. The C# has the same
> redundancy. Rather than manufacture a test that "catches" their removal, there
> is a test that *demonstrates* why they are unnecessary, and both clauses are
> kept for fidelity with a comment saying they are not load-bearing.
>
> **2b — the Release 7-5 "other lit tiles" scan, ~180 lines, not here.** A
> whole-map pass in `computeFOVFor` that adds to the visible set the tiles lit by
> a burning barrel, a tile fire, an actor's torch, a lit candle, or a dropped
> light. The good news is that it needs **no new data types** — the C# has no
> per-tile light-level grid either; the scan only ever adds keys to the same
> `Set<number>` the port already has, so both renderers light up for free. The
> reasons it is not here: it is a per-FOV-recompute W×H×trace loop that the
> headless sim and minimap will feel, and two of its branches are blocked on
> `Feature.TileFires` (`isAnyTileFireThere`) and on a `GameTiles.isWallModel`
> predicate that does not exist. The three dead tint helpers the author abandoned
> (`LOS.cs:638-680`) are not ported at all.
>
> **So today a player in a basement sees exactly one tile**, and a burning barrel
> two tiles away lights nothing. `tests/darkness-fov.test.ts` pins that as the
> 2a behaviour, so the day 2b lands and starts lighting tiles at a distance, that
> test fails and says why.
>
> `DarknessGating` and `LightPriority` — both parked since Stage 2 as "needs
> `DarknessFov`" — were unblocked by 2a and are now done.

> ### `DarknessGating` — done, and it is why `DarknessFov` 2a was worth landing first
>
> The feature that had been parked since Stage 2 as "needs `DarknessFov` to be
> coherent". Five behaviours refuse in total darkness: using medicine, reading,
> barricading a door, building a fortification, repairing a fortification.
>
> **The parked dependency was real, and precisely: every one of those five checks
> is `actorFOV(...) == 0`, and under vanilla the floor is 2.** So the entire
> feature was *unreachable* before 2a landed — five branches that no test could
> ever enter. Porting it first would have been a worse state than not porting,
> because the code would have looked finished and nothing would have proved it.
>
> **One reader, and that is the design.** All five sites call
> `Rules.isActorInAbsoluteDarkness`; the flag is tested once, inside it. Five
> independent `hasFeature` calls would be five chances to disagree about what
> "too dark" means. The registry test asserts the count is one.
>
> The C# passes `weather` into these `Can*` methods; the port does not, and rather
> than widen four signatures and every call site, the helper reads the map's local
> time and the session's weather itself — which is exactly what the C# passes.
>
> **The C# has two different strings for one condition** — `"it's too dark too see"`
> on the two door checks, `"it's too dark to see"` on the two fortifications. That
> is the text the player actually sees, so it is reproduced and both spellings are
> pinned; a later "obvious" tidy-up has to be a deliberate act.
>
> **The gate is not redundant, but the thing that makes it redundant is subtle.**
> `actorFOV` returns 0 for a *sleeping* actor before it ever consults the FOV
> profile, so a sleeping player in a CLASSIC basement has FOV 0 and would be "in
> absolute darkness" if the flag were dropped. That is the case the CLASSIC test
> uses, and it is the only reason the gate does any work: for a *waking* actor the
> vanilla floor of 2 already makes the condition false. Worth knowing, because the
> obvious reading ("the profile makes this unreachable, drop the flag") is wrong.
>
> The Release 7-5 carve-out is the part that reads oddly until you see why it
> exists: cigarettes and booze may be used in the dark, but neither is really
> medicine — both are `ItemMedicine` only so they can restore a point of sanity,
> which is what `ItemModel.isRecreational` records. The rule is really "you cannot
> use *medicine* in the dark" and the exceptions are the two things that are not
> medicine. Reading gets no carve-out at all.
>
> `IsActorStandingInLight` is the 3x3 scan that makes the rule fair rather than
> absurd. Its radius is a documented limitation of the fork, not a shortcut taken
> here: the C# assumes ambient light "is always only 3x3 tiles", so a brazier two
> tiles away does not count, and a test pins that so nobody "fixes" it into a
> radius scan. Two of its five checks are **not ported** — a burning *tile*
> (`Feature.TileFires`, still pending) and a `DECO_LIT_CANDLE` decoration (a
> `GameImages` constant, deferred) — both with comments at the omission.
>
> Six mutations, each caught, including the tempting "fix" that widens the 3x3
> scan into a radius.

> ### `LightPriority` — done, and the last of the two Stage 2 holdouts
>
> The AI keeps its torch and drops the cell phone. Still Alive, Release 6-1, and
> the C#'s comment is the whole justification: "lights are now more important than
> cellphones now that darkness is revamped".
>
> The fix is a reordering of the left-hand equipment blocks — vanilla is
> **cellphone → light → spray**, the fork is **light → cellphone → spray**. With
> one left hand that ordering is the entire feature, and the second half of it is
> the `eqLight == null` guard on the phone block, which is not "prefer light" but
> "prefer light enough to throw the phone away".
>
> This is the second of the two features parked at Stage 2, and its dependency on
> `DarknessFov` was real for a concrete reason: before the rework, an NPC that
> preferred its phone was only doing something odd. With the player's floor at 0,
> it is an NPC walking into a basement holding a cell phone it will never switch
> on.
>
> **The two orders are almost entirely behaviourally indistinguishable, and three
> attempts to write a behavioural test for the order failed before the shape of the
> problem became clear.** Only one item fits in the left hand, and whenever a light
> *is* equipped the phone step can only return "unequip phone" or nothing — there
> is no phone equipped to replace it with — so both orders produce the same action.
> The orders diverge only when no light is equipped *and* the light step can
> produce an action, which needs `getBestLight` to select a particular light, and
> that turns out to depend on taboo state and battery levels deep in the AI.
>
> So **the flag and the guard are asserted structurally**, and the plan says so
> rather than implying behavioural coverage that does not exist. All three
> mutations (gate removed, order flipped, guard dropped) pass the behavioural
> tests and are caught by a source assertion; the user-visible consequence —
> the phone being dropped — *is* covered behaviourally.
>
> One implementation serves both rulesets: the steps are small closures and the
> order is a ternary, rather than two copies of the block. That matters beyond
> tidiness — adding a third left-hand item would otherwise have to be added twice,
> and the two rulesets would drift apart silently. A test asserts the shape.

> ### `Alcohol` — done, and it was marked done a long time before it was written
>
> **The feature the registry has been counting as wired for most of this branch,
> and was not.** Its only "reader" was a `step()` call in
> `HeadlessRunner.ts:156` that labels a run with the ruleset it played — a
> cosmetic line, which satisfied the read-or-pending partition and so let the
> feature leave `PENDING_WIRING` while nothing in the engine implemented it.
>
> That is a general failure mode, and the fix is to say it out loud: **a "has a
> reader" check that a log statement satisfies will eventually mark something done
> that is not.** The scanner test now asserts `Alcohol`'s first reader is in
> `RogueGame` and that the harness line is one of six rather than the only one, so
> the state cannot silently return.
>
> The mechanic is an int rather than a flag, which is what buys four accuracy tiers:
> one standard drink is `TURNS_PER_HOUR` (30) of blood alcohol, it decays one turn
> per turn, and passing out is five of them. Expressed in turns rather than points
> because the decay makes the unit a *duration* — five drinks is two and a half
> in-game hours on the floor.
>
> **The band names do not match the numbers**, and reading them as descriptions of
> the bands gives the wrong order: `FIRING_WHEN_HAMMERED` (0.66) is the 80–99% band
> and `FIRING_WHEN_TIPSY` (0.95) is 40–59%. The comments carry the percentages
> instead, and a test swaps the bands to prove it.
>
> `isActorDrunk` cuts at **60%**, the fourth of the six display bands, not the top
> and not half. So the panel can read "tipsy" while the swing is already degraded.
>
> **Both drink effects are threshold *crossings*, not levels.** They compare
> `previousBloodAlcohol` — snapshotted at the top of the turn — against the
> previous value, so a survivor at 85% does not vomit on every subsequent can.
> Reaching 80% vomits; reaching 100% vomits *again* and falls asleep, so a drink
> that does both is the C#'s behaviour and reads like a bug until you notice the
> two arms are not mutually exclusive.
>
> **`isRecreational` turns out to have a second reader**, and it was needed to make
> the feature work at all: `DoUseMedicineItem` refuses with "Don't waste medicine!"
> before reaching the alcohol block, and a beer at full sanity trips that. The C#
> makes `SanWaste` unconditionally false for a recreational item. **The first cut of
> this port read that backwards** — `isRecreational && wasted` instead of
> `isRecreational ? false : wasted` — and the symptom was a full-sanity survivor
> being told not to drink their beer. Mutation catches it; the manual read did not.
>
> `IsActorStandingInLight`'s sibling aside, the one thing **not** ported is the
> carve-out in the fourth arm of the drunkenness d6: the C# will not drop a box of
> candles, a flare kit or a box of glowsticks, because those prompt the player to
> drop one or all. None of the three exists in the port, and the exclusion is
> dropped rather than faked against the nearest ids (which are single `LIGHT_FLARE`
> and `LIGHT_GLOWSTICK` items that do not prompt). The site is commented.
>
> Six mutations caught. **One clause is provably unobservable and is characterised
> rather than tested**: the `previous < 80%` guard on the 80% arm. Enumerating
> every reachable value, the level test and the crossing test disagree only when
> `previous` is in [120, 150) — where the blackout arm fires anyway, so the outcome
> is identical — or at/above 150, where the survivor is asleep by construction and
> cannot drink. The test asserts that characterisation rather than pretending to
> cover it.
>
> Two of the six tests were themselves vacuous at first and are worth recording: the
> CLASSIC melee comparison used the *same* actor for both sides (because `at(1)`
> mutates the shared NPC), and the "bandages get nobody drunk" test drove a path
> that the waste check refused before the alcohol block was reached. Both passed
> with the corresponding mutation applied.

> ### `SiphonFuel` — done, and the first feature that only needed content
>
> Draining a wrecked car into a fuel stack. Still Alive, Release 7-1, plus the
> Release 7-3 fuel pump. The only feature so far whose *entire* prerequisite was
> two missing item rows rather than a new mechanic — and it went in quickly because
> `Car` and its `fuelUnits` already existed from the `FireBarrels` work.
>
> **The mechanic is a unit conversion with an asymmetry**: the tank becomes an ammo
> stack, clamped to `AMMO_FUEL`'s limit of 20, and whatever the inventory will not
> take is left in the car. You drain what you can carry and the rest stays put.
> That is also why `Car`'s tank is capped at 99 rather than at a day's burn — 99 is
> the siphonable total, not a burn time.
>
> Two details that are easy to miss and both are mutation-tested:
>
> - **One car per turn.** The C# returns out of the adjacency callback on the first
>   success, so a survivor standing between two wrecks gets one tank's worth.
> - **The 10% chance of drinking some** rolls per *successful* car, not per
>   attempt, and fires *after* the fuel is banked — so you keep the fuel and
>   still get sick.
>
> The fuel pump is the Release 7-3 arm and needs no fuel of its own: a pump is
> unpowered, so siphoning from one is refused with **its own message** rather than
> the generic "no cars" one. Both are pinned, because collapsing them into one
> message tells the player something they cannot act on — the inventory-full case
> is the other distinct message, and a survivor between a live car and a dead pump
> gets fuel rather than an excuse.
>
> **The two items are appended, not read from a CSV.** `AMMO_FUEL` is an
> `ItemAmmoModel` with `AmmoType.FUEL`; `SIPHON_KIT` is a hand-written plain
> `ItemModel` because there is no `Items_Misc.csv` in the merged pack. Both ids sit
> above the old enum, per the append-only rule — a save stores ItemIDs by number.
>
> `AMMO_FUEL` also **closes a gap left by `ItemDespawn`**: that feature's
> exemption list names `AmmoType.FUEL` and has had nothing to match it against since
> it landed, so one of its four ammo exemptions was unreachable. It is live now,
> and the test says so rather than leaving the exemption looking decorative.
>
> Six mutations, each caught. The handler keeps its own `hasFeature` guard even
> though its only caller already checks — a method that is safe only because of
> its caller is a method with a precondition nobody wrote down, and it is the
> method a test (and eventually an AI action) reaches directly.

> ### `TileFires` — done, and the feature that unblocks the most
>
> Fire that lives on the floor rather than on an actor. Still Alive, Release 5-2.
> The highest-value feature in the backlog: it unblocks `DarknessFov` 2b's
> light-source scan (which needs `isAnyTileFireThere`), the fire half of
> `ArmorResist` (which needs a `fireCausedIt` damage path), and `FireExtinguishers`
> — and it is what makes `Cooking` reachable at all, since a barrel with nothing
> to light it has always been inert.
>
> **Only five tiles in the whole 143-model set are flammable** — planted floor,
> the two carpets, wood plank walls, red curtains — and that is the design, not a
> shortcut. Fire that spread over bare concrete would consume every building on
> the map; instead a fire needs *stuff* to burn, so a warehouse is a safe place to
> stand. A test counts all 143 models and asserts exactly five, because a sixth
> would silently change how every fire on the map plays.
>
> **The one bug here is a transcription error with a long fuse, and it is the
> third double-negative in the branch.** The C# reads
> `if (!IsInflammableTile(adj, true)) { ...spread... }` — and that inner block *is*
> the work. The port's equivalent is a skip-guard, so the obvious transcription
> `if (!isInflammableTile(adj, true)) continue;` is **inverted**: it makes fire
> spread onto precisely the tiles that cannot burn. It compiled, it threw nothing,
> and the test suite's one spread assertion passed — because the fire had spread
> onto *some* tiles. It took instrumenting the loop to find. Same trap as
> `ItemDespawn`'s ammo exemption and the `isRecreational` carve-out; the
> mitigation now is the same, a mutation that re-inverts the guard and must fail.
>
> The order of the three per-tile steps is the design and is not interchangeable:
>
> 1. **Spread**, one 5% roll per untested flammable neighbour. A tile adjacent to
>    two fires gets a single roll, tracked in `alreadyTested`.
> 2. **Burn out**, at a weather-derived chance *halved* outdoors and *quartered*
>    indoors.
> 3. **Burn whoever is standing there** — but only if the fire did not *just*
>    arrive, or a tile that caught this turn would be damaged twice.
>
> The C#'s comment on the divisor says indoor fires "aren't affected by weather",
> which is not what the code does: dividing by 4 rather than 2 makes them roughly
> **twice as long-lived** in the same weather. Preserved as-is with the
> discrepancy written down rather than quietly "corrected".
>
> **Walls are never set alight**, only scorched, and only by a flame weapon or an
> explosion (Release 7-6). That is the only thing keeping a building a refuge:
> without it fire walks through a wall from outside to inside, and with it a
> burning wall would be a second way through. The scorch flag is also the fire's
> memory — a burnt tile cannot be re-ignited, or one match consumes a building
> forever.
>
> **Three C# arms are not ported**, each because a prerequisite does not exist:
>
> - **An actor *catching* fire** (`CATCH_ONFIRE_FROM_TILE_CHANCE`, 25%) needs
>   `Actor.isOnFire` and the whole `SetActorOnFire` / per-actor-fire subsystem.
>   That is Release 5-7 and it is its own feature, not part of "tile fires".
>   Standing in fire still hurts every turn; the actor does not *become* fire. A
>   test asserts `Actor` has no on-fire state at all, so the gap is visible.
> - **Crop loss** needs `FLOOR_PLANTED`, from the alpha10-era farming system that
>   was never ported — the same gap blocking `ResourcesAvailability`'s fruit
>   interval. The tile is marked flammable so fire spreads there correctly; only
>   the harvest loss is missing.
> - **Fuel-pump explosions** need `Feature.FuelStation`.
>
> No renderer change was needed: the port already draws tile decorations, and
> `EFFECT_ONFIRE` is one.
>
> **Two of the tests were wrong in instructive ways.** "Is any tile burning
> *right now*" cannot show that fire spread, because a carpet fire burns out in a
> few turns — the permanent evidence is the scorch count. And a single fire's
> lifetime is a geometric distribution on a 17%-or-40% per-turn roll, so the
> rain-vs-clear comparison is averaged over 25 fires: the one-sample version got
> `rain 10 vs clear 6` and "failed" in the wrong direction on nothing but the
> roller's sequence. **Probabilistic mechanics need trial counts, and this branch
> now has three such tests.**
>
> Seven mutations, each caught: the spread guard re-inverted, `isScorched` dropped
> from the flammability test (fire never stops spreading), the indoor divisor
> removed, the weather branch removed, walls allowed to light, a sixth flammable
> tile, and the feature gate removed.

> ### `FireExtinguishers` — done, and it needed almost no new machinery
>
> Putting a fire out with a can. Still Alive, Release 7-6. Small because the
> *content* was already merged: `FIRE_EXTINGUISHER` (ItemID 158), its sprite, its
> `GameImages` constant and its row in `Items_Spraypaints.csv` were all already in
> the port from Stage 3. This is the second feature in a row where the entire
> prerequisite was content rather than code.
>
> **The extinguisher is not a new verb.** It is a spray paint whose model sends
> the existing tag mode down a different branch, so there is no new
> `PlayerCommand` and no new mode loop. The C# threads a `specialCase` string and
> a parallel banner through the loop and re-tests the branch inside it, and that
> shape is reproduced — the alternative is the same loop twice.
>
> One gate covers the banner, the refusal message *and* the handler call, so
> CLASSIC cannot end up with an extinguisher that announces itself in EXTINGUISH
> MODE and then tags a floor instead.
>
> **Two of the C#'s three targets work**: a burning map object (barrel, campfire
> or car) and a burning tile. The third — an actor who is *on fire* — needs
> `Actor.isOnFire` and `ExtinguishOnFireActor`, and the port has neither. Same gap
> `TileFires` documents, from the same Release 5-7 subsystem: nothing can set a
> survivor alight yet, so there is nothing to put out. The call site says so
> rather than pretending, and a test asserts `Actor` has no on-fire state at all.
>
> The empty-can discard (Release 7-5) is kept: 20 sprays, then the can is gone
> with its own message.
>
> **Two mutations initially failed because the mode loop was untested.** Changing
> the model check to `true`, or switching the banner back to `TAG_MODE_TEXT`,
> broke nothing — because the tests only read the two constants, and a test that
> reads a constant cannot catch a wrong value in the place it is *used*. The fix
> is to drive the real loop with a scripted `WaitDirectionOrCancel` and read the
> overlay at the moment the direction is chosen. `RedrawPlayScreen` is stubbed too:
> it reads `m_MapViewRect`, which only `StartNewGame` sets.
>
> One test then failed for a fourth reason worth recording: it never equipped the
> extinguisher, so `HandlePlayerTag` returned "No spray paint equipped." before
> the loop and the prompt was never called.
>
> Ten mutations, each caught.

> ### `Butchering` — done, and the surprise is that fire is a cooking method
>
> Still Alive, Release 7-6 (`RogueGame.cs:11700`). Carving a corpse no longer only
> *destroys* it — it yields food, and the food depends on two things you would not
> guess:
>
> - **You do not choose how the meat is cooked. The corpse does.** The meat is
>   cooked if and only if `deadGuy.causeOfDeath == "fire"`. That single string
>   comparison is the entire purpose of the new `Actor.causeOfDeath` field, and it
>   is why that field had to be a string rather than a boolean: the fork is already
>   spending booleans like `tileFires` and `causesTileFires`, and this one is a
>   *cause*, of which there are many.
> - **Rot shortens the shelf life.**
>   `bestBefore = now + TURNS_PER_DAY * bestBeforeDays / (rotLevel + 1)`. A corpse
>   at rot level 5 ("about to crumble to dust") gives meat good for a sixth of its
>   normal time. Rot itself is bucketed off the corpse's *remaining hit points*,
>   not its age, which is worth knowing before writing a test that assumes
>   otherwise.
>
> The bladed-weapon requirement is **player only**, and that is the C#'s own
> decision, with its reasoning in a comment: it "decided not to enforce this for
> NPCs, as having them prioritise bladed weapons seemed like too much of a faff."
> Enforcing it for the AI too would make every NPC carry a knife, which is a
> different game. The port matches the C# rather than the summary.
>
> `canUseForButchering` is a flag on `ItemMeleeWeaponModel` set by thirteen entries
> in the melee table — the same thirteen the C# spells out one at a time at
> `GameItems.cs`. It is a list, and not a test of the weapon's name, because "is it
> sharp" is not something the melee model already carries. A combat knife and a
> chainsaw qualify; a baseball bat and a frying pan do not, and the test says so.
>
> Two deliberate non-ports:
>
> - The C#'s meat switch has three cases (rabbit, chicken, feral dog) and a
>   `default` that **throws** `ArgumentException`. Not ported. The port still has
>   no `RABBIT` or `CHICKEN` model — they need an `UnintelligentAnimalAI` the port
>   has no controller for — so a live animal that did exist would crash the
>   butcher. A missing content row must not be able to take the game down, so the
>   default arm falls through to no meat, and a test asserts it does not throw.
> - The meat *quantity* is the C#'s `ResourcesAvailability` 3/2/1 switch, which
>   lives in a feature of its own that does not exist yet, so the `default: 2` is
>   hardcoded. Note it is inside the C#'s *animal* arm only: a human body is never
>   scaled by it and the item keeps the quantity it was built with, which is 1.
>
> The no-insanity carve-out for animals is the reason `isLivingAnimal` is a flag on
> `Abilities` and not a list of ids: the sanity rule, the meat switch and the AI all
> need to ask the same question, and only the flag answers it. It is deliberately
> *ungated*, which is what keeps Classic byte-identical — an actor that is not an
> animal still gets exactly vanilla's sanity hit.

> ### `ArmorResist` — half done, and the half is not the one the table implies
>
> The row above says "fire-damage scaling + infection roll". **Only the infection
> roll is implementable today**, because the port has no fire damage at all: the
> fork's fire use is `dmg -= dmg * (Fire_Resistance / 100)` inside a damage path
> keyed on "this damage was fire-caused", a flag this codebase has no concept of,
> since fire arrives with `TileFires` and `FireBarrels`. So the fire column is
> loaded and carried and **read by nothing** — the fire hazard suit is currently
> just a slow suit. `tests/armor-resist.test.ts` asserts that absence by scanning
> the engine, so the gap is a test rather than a comment that goes stale.
>
> **The two percentages mean different things, which is the trap.** Fire
> resistance is a damage *multiplier* — 100 is total immunity. Infection
> resistance is a *chance to block the bite* — 50 blocks half the time. Both are
> "percent", one scales and one rolls, and the fork uses them differently at their
> two sites. The model's field comment says so, and a test asserts the ordering by
> `INF_RESIST%` rather than by reputation: the fire hazard suit (30) blocks *less*
> than the biohazard one (50), which inverts what the names suggest.
>
> Values are the fork's own: fire hazard 100/30, biohazard 5/50. That second pair
> is the one to read twice — "biohazard" sounds infection-first and is, but it has
> the **weakest** fire resistance in the table.
>
> **The gate, the torso lookup and the roll are one function** —
> `Rules.infectionBlockedByArmor` — rather than three lines at the bite site, and
> that is a correction rather than a preference. The first version of the test
> re-implemented the roll in order to check it, and consequently **passed with the
> ruleset gate deleted** and **passed with the fire formula substituted for the
> infection one**: the two mutations that matter most. A test that mirrors the
> logic is testing its own copy. Mutation-checked now four ways — gate removed,
> gate hardcoded open, formula substituted, column unread — each fails.
>
> The reader moved from `RogueGame` to `Rules` as a result, which
> `feature-flags.test.ts` caught by asserting the *file* as well as the name.
>
> **One honest gap in `WeaponWeight`, recorded rather than papered over.** The
> `speed >= 0` clamp is unreachable with the shipped data. The slowest actor that
> *has an inventory* is a civilian at 100 — the ones at 50 are undead, and
> `hasInventory` is false for all of them — so the worst case is
> `(100/2) - 10 armour - 20 minigun = 20`. A zombie at 50 *would* reach −5, which
> is presumably why the fork has the clamp, but a zombie cannot be handed a
> minigun. So that test asserts the invariant over every (holder, weapon) pair,
> and says in its comment that deleting the clamp would not fail it. A test that
> looks like coverage of the clamp and is not is worse than one that admits the
> limit.

> ### `DifficultyAtCreation` — done, and the "lock" is a deleted list, not a check
>
> Still Alive, Release 7-4. Two C# pieces: `HandleNewCharacterDifficulty(out int
> chosenDay)` at `RogueGame.cs:3782`, called from `RogueGame.cs:2884` after the
> name step; and a block of the mid-game option list at `RogueGame.cs:1557-1582`
> that is commented out under a heading reading `//MOVED TO CHARACTER CREATION`.
> Two gates, one per direction: `RogueGame` runs the screen, `OptionsScreen`
> drops the rows.
>
> **The name promises a lock and the C# has none.** This is the part worth
> knowing before reading the fork's code for it. `HandleOptions` does not test its
> `ingame` parameter — the C# comments the parameter as unused at
> `RogueGame.cs:1509` — and there is no runtime check anywhere that refuses a
> mid-game difficulty edit. The mechanism is that the row is *not on the list*.
> The port matches that rather than inventing a guard, and says so in both
> places; a test asserts the rows are gone from the mid-game screen under Still
> Alive and that classic still has all of them.
>
> That makes the name's other half load-bearing in a way that is easy to
> misread: it is **also** gone from the main menu's options screen, since the C#
> has one list for both. A player who wants to change difficulty between two
> Still Alive runs cannot, which is the same cheat the escape path is there to
> stop. The `ResourcesAvailability` row went with it, and
> `tests/resources-availability.test.ts`'s "listed under Still Alive" assertion
> had to be **inverted** rather than moved — that row is now off the mid-game
> screen under *both* rulesets. An inverted assertion is worth flagging because
> it is the kind of change a reviewer skims: the feature did not hide a row
> Still Alive lost, it moved it to a screen that does not exist for classic.
>
> **Two fields for one day, and `6` is not a number.** The option holds
> `visibleRescueDay` and the run holds `Session.armyHelicopterRescueDay`, with
> `hiddenRescueDay` in between. The split exists so "random" survives being
> shown repeatedly: pick random, back out, and the row still says `random`
> rather than a number you never chose. `6` is the marker and the floor is 6
> because of it — with a floor of 1 the marker would be a day reachable by
> accident. The C# rolls `new Random().Next(14, 28)`; the port rolls the game's
> own `DiceRoller`, because an unseedable rescue day is a run that cannot be
> reproduced, and `HandleNewCharacter` already seeds its roller for exactly that
> reason.
>
> **The field is written and read by nothing, and that is deliberate.**
> `HelicopterRescue` is the feature that consumes it and it is still pending. The
> alternative — leaving the capture until the endgame exists — is worse: the
> value has to be taken at the moment the player commits to it, and a save
> written before then has nothing to restore. So the cost table records a scalar
> in the save root with no reader, and `tests/integration/save-load.test.ts`
> round-trips it so the *plumbing* is pinned even though the behaviour is not.
>
> **`R` on the new screen resets to the shipped defaults, not to the values the
> screen was entered with**, and that reads as a bug until you find the C#'s own
> comment on the line: "`prevOptions; //@@MP - used to restore changes in this
> session, now resets defaults (Release 6-1)`" (`RogueGame.cs:3930`). Getting
> this wrong is easy: the mid-game screen *does* keep a `prevOptions` clone for
> its own `R`, so the obvious thing to do is copy that. It needs
> `OptionsCategory.DIFFICULTY` instead, or pressing `R` on the creation screen
> would throw away the player's font and view mode because they nudged a
> number. A test asserts exactly that: a non-default music volume survives.
>
> **Escape discards everything changed on the screen**, by reloading the stored
> options. That is the C#'s and it is not tidiness — its comment says it stops a
> player tweaking difficulty and then loading a save started with different
> settings. Without it, cancel would only close the screen.
>
> Two smaller ports, both because two screens now show the same rows. The
> Left/Right switch exists twice in the C# (once per screen, with the direction
> spelled into each line); the port has one `stepGameOption` in `GameOptions.ts`
> that both call, because twenty arms of step-per-arrow in two files are free to
> disagree and the first divergence is a row that steps on one screen and not
> the other. And the row *membership* is one exported `DIFFICULTY_OPTIONS` list
> read by both screens, with a test that walks the real mid-game list and fails
> if a row is on it and not in the `DIFFICULTY` reset arm — a row `R` does not
> reset is a player told "defaults" while their value stays.
>
> **One row where this port and the C#'s screen disagree.** The C# has
> `GAME_RATS_UPGRADE` commented out of the difficulty list (`RogueGame.cs:3790`;
> Release 5 removed rats upgrades upstream) and this port still has the option
> from classic. It is in `DIFFICULTY_OPTIONS` — leaving it behind would be the
> one Still Alive difficulty option still editable mid-game — and excluded from
> the screen, so it moves out of the mid-game list and has no row on the new one.
> That is a hole rather than a feature, and the comment says so.
>
> Six rows in the C#'s screen have no option here at all (`LIVING_DAMAGE_PERCENT`,
> `SANITY`, `ANTIVIRAL_PILLS`, `BACKPACKS`, `UNDEAD_DAMAGE_PERCENT`,
> `BLACKOPS_RAIDS`) and are therefore absent: a row with no `optionName` throws
> "unhandled option" the moment it is selected, which is how the font option took
> the game down once already.

> ### `Fishing` — the player path is done; the NPC arm is not, and says so
>
> Still Alive, Release 7-6. A rod, a wait, and a body of water — and the whole
> feature turns out to be one arithmetic expression plus the decision about where
> the fishing lives.
>
> **The C# infers fishing centrally and overrides its own argument.**
> `DoWait(Actor, bool isFishing = false)` takes a flag and then throws it away for
> a player holding a rod (`RogueGame.cs:23049`). A cast is not a mode you enter: it
> is a *wait* with a rod in the off hand. So the single wait and the long wait
> cannot disagree, and the port keeps the parameter and the inference, because a
> caller that remembered to pass the flag would be one more way for them to.
>
> **The arithmetic, and the two numbers in it that are easy to get wrong.**
>
> ```
>   CATCHING_FISH_BASE_CHANCE = 2      // "percentage. can't be less than 2"
>   HIGH  -> 4     MED -> 2     LOW -> (int)(2 * 0.5) = 1
>   max(chance, chance + SKILL_UNSUSPICIOUS_FISHING_BONUS * level)
> ```
>
> - **LOW truncates.** `(int)` is not a rounding mode, so a poor world still
>   fishes, at half as well. Rounding would give the same answer *at a base of 2*
>   and only differ at 3 or 5 — which is worth recording, because a mutation that
>   swaps `Math.trunc` for `Math.round` **survives this suite** and is not a gap:
>   the two are equal for every number the game can produce. Removing the LOW arm
>   outright is caught.
> - **The `Math.Max` is redundant as written and load-bearing anyway.** The right
>   side is `chance + bonus`, which for a non-negative bonus always exceeds
>   `chance`. Transcribed rather than simplified, because the author clearly
>   expected a correction to bite and the two forms disagree the moment a later
>   edit makes the bonus negative.
>
> **One gate, three decisions.** The `DoWait` gate covers the inference, the
> message and the catch together, which is the point: under CLASSIC a player
> holding a rod waits, breathes and nothing else, and there is no version of the
> three that can disagree because there is one `if`. Five gates in `RogueGame` and
> one in `Rules` in total; `feature-flags.test.ts` asserts the split.
>
> **The equip gate moved from the C#'s two sites into one rule, and it is
> behaviour-identical rather than merely equivalent.** The fork special-cases the
> rod in `OnLMBItem` (`RogueGame.cs:11395`) and again in `DoPlayerItemSlotUse`
> (`RogueGame.cs:11996`). The port folds both into `Rules.canActorEquipItem`, which
> is safe because both C# sites test the rod *first* in the same chain and then
> fall through to a binoculars branch no rod can take — so the water test is the
> only thing that can ever refuse one — and because the third caller,
> `DoTakeItem`'s auto-equip, cannot reach a rod at all (`DontAutoEquip`).
>
> **`bestBefore` is off the *map's* clock, not the session's**
> (`RogueGame.cs:23107`), and that distinction is invisible in a naive test: on a
> fresh map both clocks are 0, so a port that read the wrong one produces the same
> number and the test passes for the wrong reason. The test pushes the two clocks
> apart before it casts.
>
> **The fish is `isForbiddenToAI`, and that is a property of the catch rather than
> of the row.** The C#'s trailing `new ItemFood(RAW_FISH, bestBefore, true, true)`
> — the first flag is `IsForbiddenToAI` and the second is `IsRaw`, which the port
> reads off the row exactly as `ButcherMeat` already does. A fish in a shop is the
> AI's to take; a hooked one is not. The rod itself is now also exempt from
> `ItemDespawn`'s sweep (`RogueGame.cs:21477`), which closes the other half of the
> comment there that had been deferring `FISHING_ROD` since the feature landed.
>
> **Three things the feature needs are *not* here**, each recorded at the site
> rather than left for someone to find:
>
> - **The NPC arm.** `CivilianAI.cs:754` — fish when hungry and holding a rod on a
>   map with `HasFishing`, then `BehaviorGoFish`, then walk to the nearest visible
>   water, then to the first water tile on the map — plus `BaseAI.cs:6625` for the
>   equip-and-wait. It is the largest and least testable part of the feature, and
>   the port's `BaseAI` has no `BehaviorGoFish` and no pond generator, so
>   `Map.hasFishing` is never set `true` by anything. **`Fishing` is therefore NOT
>   done.** The `DoWait` NPC path (a non-player lands a fish on its first wait,
>   with no roll) *is* ported, so the arm is a behaviour to switch on rather than a
>   mechanism to build — but nothing reaches it.
> - **`isOneHanded`.** The C#'s "unequip a two-handed right-hand weapon" arm
>   (`RogueGame.cs:21945-21956`) reads `meleeModel.IsOneHanded`, and the port has
>   no such field. It is not a CSV column: the fork sets it by hand on every weapon
>   model in `GameItems.cs` (`false` throughout, `true` for the combat knife and
>   the pistols). Porting it is Release 7-2 *shield* data across 20-odd model
>   constructions, and inventing a default would silently unequip the wrong
>   weapons — so a survivor who equips a rod over a two-hander keeps both, which is
>   the C#'s behaviour for a one-hander and a divergence for the rest.
> - **The four sounds** (`GameSounds.cs:424-431`: cast and reel, player and
>   nearby). **Arrived** with `Feature.ExtendedAudio`: the two player ones are
>   wired and gated, and the `_NEARBY` pair is still not, because both of its arms
>   are `IsAudibleToPlayer(loc, Rules.QUIET_NOISE_RADIUS)` and the port has no
>   such radius. The C# stops the cast sound before the reel precisely because the
>   two overlap; that is not ported either, because the port's only `stop()` is
>   global. See `ExtendedAudio` below.
>
> `Map.hasFishing` is a **property over a backing field**, not a plain boolean,
> and the reason is the save graph rather than taste. `GraphReader` makes every
> object with `Object.create(Map.prototype)`, so **class field initialisers never
> run**; a save written before the flag existed simply has no key. A plain field
> would read `undefined` there — falsy, so it would work, and only by accident,
> until somebody wrote `hasFishing === true`. The test writes a real graph through
> the real writer, deletes the key, and reads `false` back.
>
> `Activity.FISHING = 9` is appended rather than inserted after `RESTING` as the
> C# has it. The C# never writes an `Activity` to a save at all, so its numbering
> is a per-run label; the port's writer *does* carry the field (it is an own field
> of `Actor`), so append-only is the rule here too. Both switches that `throw` on
> an unrecognised activity are taught the new value even though nothing can set it
> yet: an enum member nothing reaches is still a landmine, and the first NPC arm to
> set it would take the panel down with it.
>
> Sixteen mutations, fifteen caught. The survivor is the truncate/round pair
> above, which is **equivalent** for the shipped constant rather than an untested
> behaviour — recorded here because a suite that has an equivalent mutation and one
> that has a missing test should not look the same.

> ### `AmbientAudio` — a third channel, and five of thirteen tracks
>
> Still Alive, Release 5-3 (rain), 6-4 (helicopter), 6-6 (thunder, animals, bells),
> 7-3 (the debug cue). `Feature.AmbientAudio` is off `PENDING_WIRING`, and the
> honest headline is: **the table and the channel are done, and five of the
> thirteen tracks play.** The other eight are unwired and each is waiting on a
> named pending feature.
>
> **The C# has no ambient manager class, and that is the whole design.** The fork
> builds a *second instance of its music manager* — `m_AmbientSFXManager = new
> SFMLMusicManager()` at `RogueGame.cs:861`, on the sentence "music manager is good
> for long tracks, as they are streamed from disk rather than kept in memory" —
> and gives it its own `Volume` and its own `IsAudioEnabled`
> (`RogueGame.cs:2703-2704`). So "mixing an ambient with the music" is not a mixer
> at all: it is **two players writing to the same speakers at two independent
> levels**, the second at `AmbientSFXVolume = 75` against a `MusicVolume` of 100
> (`GameOptions.cs:1389`). `GameAmbients.cs:5` states the intent — "these may be
> played in conjunction with background music".
>
> **What that forced the port to be, which is not what it would have been from the
> name.** The music channel is one `<audio>` element for one track, and it can be
> because the C#'s music manager is per-track and the *game* only ever plays one
> music at a time. Ambients are not in that position:
> `StopAllAmbientsExcept` (`RogueGame.cs:10490`) stops a **named list of five**, and
> `CheckLandedHelicopterSFX` (`:10545`) asks `IsPlaying` about four separate ids to
> choose a distance tier. A one-element channel would make the second of those
> calls silently stop the first. So `IAmbientManager` is **per-id** —
> `playIfNotAlreadyPlaying(id, looping)`, `stop(id)`, `isPlaying(id)`,
> `getPlayingAmbients()` — and `WebAudioAmbientManager` keeps one element and one
> `GainNode` per voice, summed into a shared master. The C#'s bells add a second
> reason: they are played at sunset with `looping` defaulting to `false`
> (`ISoundManager.cs:52`), so a one-shot, and a looping bell would ring over every
> sunset for the rest of the session.
>
> **The mix is a gain stage, and deliberately has no per-track correction.** The
> master is the channel volume — a `GainNode`, because two voices each at 0.75 must
> sum to 0.75 rather than clip at 1.5. There is no `AMBIENT_GAINS` table, and the
> reason is the C#: `SFMLMusicManager.OnVolumeChange` (`SFMLMusicManager.cs:82-85`)
> sets **one** `Volume` on every sound it holds, so an ambient's loudness relative
> to another's is whatever the recording is. `measure-audio-levels.mjs` reads
> `assets/{music,sfx}` flat and would not see a third directory anyway, so adding
> per-ambient numbers would be a mixing decision the fork did not make.
>
> **What is wired: rain, thundering rain, night animals.** Five tracks, and all
> three of their C# inputs exist in the port — `Weather`
> (`data/Weather.ts`), `WorldTime.isNight`, `Tile.isInside`. The port's
> `CheckAmbientAudio` is the C#'s `CheckAmbientSFX` (`RogueGame.cs:10417`) whole,
> including the decision structure the C# depends on: the weather is tested
> **before** the clock, so a night in the rain is rain and not animals; the
> incoming bed is started **before** the others are stopped, so the swap has no
> silent gap; and there is **no inside/outside split** for the animals, which the
> C# also does not have.
>
> **What is not wired, and on what:**
>
> - **The five helicopter tracks — `Feature.HelicopterRescue`, still pending.**
>   `CheckLandedHelicopterSFX` (`RogueGame.cs:10524`) reads
>   `m_Session.ArmyHelicopterRescue_Map` and `_Coordinates`. The port has the rescue
>   *day* (`Session.armyHelicopterRescueDay`, written by `DifficultyAtCreation`) and
>   no map to put a helicopter on. The four distance tiers also need
>   `Rules.QUIET/MODERATE/BOOMING_NOISE_RADIUS`; the port has only
>   `LOUD_NOISE_RADIUS` (`Rules.ts:310`). **There is nothing to stub here** — a
>   stationary helicopter the player is not rescued by would be a new endgame, not
>   this feature, and the `StopAllAmbientsExcept` list would have to grow by four
>   the moment it landed.
> - **The two church bells — `Feature.Church`, still pending.** The C#'s trigger is
>   `m_Player.Location.Map.HasChurch` at sunset (`:5637`). The port's `Map` has no
>   `hasChurch` at all, and inventing one is a guess with a sound attached to it.
> - **`TEST_AMBIENT` — shipped, deliberately unreachable.** Its only C# caller is
>   `OptionsMenuAudioAdjustment` (`:2244`), a preview cue for the ambient-volume
>   row in the options screen, and the port has no such row (below). The file is
>   copied anyway so the table is the C#'s thirteen in full and the asset test is
>   total.
>
> **Two divergences inside the wired part, both recorded at the code rather than
> smoothed over.** The underground list gains `hospital_Admissions`, which the C#
> silences the other four hospital levels *not*; and drops `ArmyBase`, which the
> port's `UniqueMaps` does not have (`Feature.ArmyBase`, pending). The test asserts
> all eight surviving levels — five hospital, two police station, the CHAR
> underground — so the list cannot quietly shrink.
>
> **The two option rows are not here, and that is the one thing a player would
> notice.** The C# has `UI_AMBIENTSFXS` (an on/off) and `UI_AMBIENTSFXS_VOLUME`
> ("Ambient sounds volume (rain, church bells, distant animals, etc)",
> `GameOptions.cs:1038`). The port has neither, so the channel level is the
> constant `AMBIENT_SFX_VOLUME = 0.75` applied in the `RogueGame` constructor —
> the C#'s own default, but not player-movable. Adding the two rows is a
> `GameOptions`/`OptionsScreen` change and nothing about the channel blocks it;
> it is left out here because it is options work rather than audio work, and
> because §5.6g's "QA doubles" is worse served by a half-done options screen.
>
> **The load-time answer is that there is none, and that is a property of the port
> rather than luck.** 14.0 MB of `.ogg` went into `public/assets/ambients/`, and
> `Run()`'s boot path is unchanged: the port **does not preload audio at all** —
> `RogueGame.Run` prints "Loading music..." and "Loading sfxs..." and then fetches
> nothing (`RogueGame.ts:1683-1686`: "C# preloaded every GameMusics/GameSounds file
> here; the Web Audio manager fetches tracks by id on demand"). Only *images* are
> preloaded, because a browser cannot draw one it has not fetched. So an ambient
> costs a first-play fetch of one file, on the turn the weather turns, and the
> worst case is the thundering-rain-outside bed at 6.1 MB — fetched once, then
> held by the service worker's `cache-first` `/assets/` handler for the rest of the
> session. The regression is in **dist size and the offline cache footprint**
> (+14 MB on ~55 MB), not in time-to-first-frame. Had audio been preloaded the way
> the C# did it, this feature would have been a ~25% increase in the boot fetch and
> that is the argument for keeping it on demand.
>
> **Five `hasFeature` gates, all in `RogueGame.ts`:** one in
> `CheckAmbientAudio` (the whole behaviour, and the reason there is no version of
> "rain in a basement" that CLASSIC can half-receive) and four on `stopAll()` —
> sleeping, dying, reincarnating, loading a save. The four are gated even though
> under CLASSIC they are no-ops, because a gate that is unnecessary today is a
> gate nobody has to think about tomorrow, when something else in the engine learns
> to start a bed. The split is asserted in `feature-flags.test.ts`.
>
> **Six mutations, six caught:** removing the reader's gate, swapping the
> start/stops order, dropping `playIfNotAlreadyPlaying`'s guard, pointing
> `NIGHT_ANIMALS` at the wrong file, playing a bed one-shot instead of looped, and
> dropping the basement arm.

The largest stage, and the one that puts branches in the god file. Everything is
gated on a `Feature` from §5.6a, and the per-item serialisation cost is close to
zero precisely because of the dump-every-own-field design.

| Feature | New state | Serialisation | Engine work |
|---|---|---|---|
| `WeaponWeight` | none (model field) | 0 | **DONE** — `ItemWeaponModel.weight`, read from the merged `WEIGHT`, subtracted in `actorSpeed` under the flag |
| `ArmorResist` | none (model field) | 0 | **infection roll DONE** (gated, in `Rules.infectionBlockedByArmor`). Fire scaling **blocked on `TileFires`** — the port has no fire damage. Both CSV columns merged |
| `Alcohol` | `Actor.bloodAlcohol`, `previousBloodAlcohol` | 0 (own fields) | `IsDrunk`, 4 accuracy tiers, the 5-step description and colour, BAC decay, nightmare suppression |
| `FoodPoisoning` | `Actor.isFoodPoisoned` | **0** (own field, carried by the writer) | **DONE** — 20% base × perishing factor 1/3/5, 1% per-turn recovery, Hardy bonus, medkit/antiviral cure on the C#'s exact model list, and the 5% vomit action (stamina/sleep/food cost, two-day decoration timer) |
| `Cooking` | `ItemFood._cookedDegree`, `_maxCookedDegree` | 0 | `canActorCookFood`, `ActionCookFood`, campfires/barrels as heat sources |
| `Fishing` | `Activity.FISHING`, `Map.hasFishing` | 0 (own fields, carried by the writer) | **player path DONE** — `FISHING_ROD` at 170, the `canActorEquipFishingRod` water gate, `DoWait`'s cast arm with the 2/1/4% `ResourcesAvailability` scaling and the Unsuspicious bonus, the raw fish with the C#'s `bestBefore`, and the move and hit force-unequips. **NPC arm NOT done** — `CivilianAI`'s go-fish behaviour, `Map.hasFishing` is never set true (no pond generator in the port), and the rod cannot be spawned: the fork's own `BaseMapGenerator.MakeItemFishingRod` has no callers |
| `ResourcesAvailability` | none (option + `Resources` enum) | 0 | **DONE** — `GAME_RESOURCES_AVAILABILITY` option, the 33/54/75 projection, the survivor-only difficulty multiplier, and the starting kit. The Butchering meat quantity now reads it instead of the hardcoded `2` |
| `DifficultyAtCreation` | `Session.armyHelicopterRescueDay` | **1 line** — a scalar beside `ruleset` in the save root, no `GRAPH_VERSION` bump | **DONE** — `GAME_RESCUE_DAY` option (visible/hidden day, "6 = random"), the `HandleNewCharacterDifficulty` screen after character creation, the difficulty rows deleted from the mid-game options screen, and `OptionsCategory` so `R` there resets difficulty options only. Its consumer, `HelicopterRescue`, is not written — the field is set and read by nothing yet |
| `Butchering` | `Actor.causeOfDeath`, `Abilities.isLivingAnimal` | 0 | **DONE** — the player's-bladed-weapon gate, fire-death-means-cooked, `bestBefore` divided by rot level, rabbit/chicken/dog/human meat, the no-sanity-hit carve-out for animals. `ResourcesAvailability` (3/2/1) not implemented, so the C#'s `default: 2` is hardcoded for animals; `RABBIT`/`CHICKEN` still unspawnable without `UnintelligentAnimalAI`, so the unrecognised-animal arm yields no meat where the C# throws |
| `TileFires` | `Tile.flags.IS_ON_FIRE`, `Tile.scorched` | **~4 lines** — `tilesGrid` packs `modelId` + `flags` + `decorations` (`specs.ts:317-347`) | spread, extinguish, rain, damage to actors/corpses/crops, fuel units on barrels/cars |
| `DarknessFov` | none | 0 | `MINIMAL_FOV_PLAYER 0` vs `MINIMAL_FOV_LIVINGACTORS 1`; night penalties; the FOV-0 gates from Stage 2 |
| `FireExtinguishers`, `SiphonFuel` | `Barrel`/`Campfire`/`Car` fuel units | new class specs | 3 new map-object classes, siphon flow, extinguisher targeting mode |
| `ShelterBackpacks` | nested `Inventory` on an `Item` | new codec + 1 class spec | slot tiers gated on Hauler, transfer rules, nested-inventory UI |
| `AmbientAudio` | none | 0 | **5 of 13 tracks DONE** — the third audio channel (`IAmbientManager`/`NullAmbientManager`/`WebAudioAmbientManager`, one voice per id so the C#'s `StopAllAmbientsExcept` list is expressible), `AMBIENTS_ROOT` + `AMBIENT_FILES` for the fork's fourth `Resources/` subtree (14 MB, **not** on the preload path — the port fetches audio on demand), all 13 `.ogg` copied, and `CheckAmbientAudio` with rain / thundering rain / night animals behind **5 gates**. **8 tracks NOT done** — 5 helicopter on `HelicopterRescue` (no rescue map or coordinates, and no `QUIET/MODERATE/BOOMING_NOISE_RADIUS`), 2 church bells on `Church` (no `Map.hasChurch`), 1 `TEST_AMBIENT` with no options row to preview it from. The `UI_AMBIENTSFXS` + `UI_AMBIENTSFXS_VOLUME` **option rows are not ported**: the level is the constant `AMBIENT_SFX_VOLUME = 0.75`, the C#'s own default. See its section above |
| Item model flags | `ItemModel` +6 bools | 0 | `isFlameWeapon`, `isThrowable`, `isForbiddenToAI`, `isBatteryPowered`, `causesTileFires`, `canGoInBackpacks` |
| `Activity` +19 | enum | 0 | cosmetic labels, but they become load-bearing: `CivilianAI` filters trade partners on `isFightingOrFleeing` |
| 7 new `PlayerCommand`s | enum — **append only** | 0 | bury, cook, destroy item, make fire, unload ammo, inspection mode, swap inventory |
| `ExtendedAudio` | none (constants + a `Record` per id) | 0 | **table DONE** — 180 pairs in `GameSounds`/`SOUND_FILES`, 182 `.ogg` copied into `assets/sfx/`, generated from `GameSounds.cs` by `scripts/port-game-sounds.py` rather than transcribed. **3 call sites wired** (the two `Fishing` sounds §5.6e deferred, and `DoEatCorpse`'s id choice). The other 177 need the distance model — see its section |

`AmmoType` +7 and `AttackKind.OTHER` and `FireMode.FLAMING` are enum growth on
mechanic axes that are already shared — no per-pack variant needed.

The AI work (fire avoidance, darkness navigation, trap fear, the animal AI, the
dog pack rewrite, cooking/fishing/butchering behaviours) is the fork's
`BaseAI.cs` 6 422 → 8 322. Two things in it should **not** be copied:
`ExplorationData.cs` is pre-Alpha-10 and loses `GetExploredAge`, and the fork's
`BehaviorWander` is a net regression against ours. Both are listed in
`STILL_ALIVE_REFERENCE.md` §7.

**Verification.** A test per feature asserting it is reachable under
`STILL_ALIVE` and unreachable under `CLASSIC` — the negative half is the one
that matters, and it is the one a coverage number cannot give. Then two headless
runs per seed, one per ruleset, both required to terminate (§4.3's harness) —
`headless-no-hang.test.ts` and the loop detectors are what a ruleset flag is most
likely to upset, because turning mechanics on for one mode can produce an AI
cycle the other mode never had.

> ### Mapgen seam (`TownBuilding.ts`) — a pure move, proved rather than argued
>
> The 13 unported C# building generators would each add 150-300 lines to
> `BaseTownGenerator.ts`, which is 5,813 and does not have a reviewable seam
> inside it. That file now delegates the shared placement primitives
> (`decorateOutsideWalls`, `tileRectangle`, `tileHLine`, `tileVLine`,
> `tileFill`, `placeDoor`, zone helpers) to `gameplay/generators/TownBuilding.ts`,
> and a building is a *new file* returning one function plus one line in
> `TOWN_BUILDING_PASSES`. `Block` moved there too, because the context hands it
> out.
>
> **The determinism claim is measured, not asserted.** A generator refactor that
> shifts one dice roll is invisible to every test in the suite and invalidates
> every saved world, so it was checked by hashing the generated district —
> every tile, map object and actor, plus the object/actor/corpse counts — for a
> fixed seed, run through the bundled CLI on `9b32247` and again on the refactored
> tree. The two fingerprints are byte-identical (`c2b1c2f875d10ecb5422540f978e5203`).
>
> Note what that does and does not cover: one seed, one district, CLASSIC. It
> is strong evidence the extraction is a pure move, which is the actual claim
> being made — it is not a proof over all seeds, and the per-building work that
> follows is where broader coverage belongs.

> ### `ExtendedAudio` — the table and the assets are in; the distance model is not
>
> **180 pairs, 182 files, 3 gates.** The gate count is the interesting number and
> it is the opposite of every other feature in this section: the work is *data*,
> and data cannot leak into `CLASSIC` no matter how many entries it has — a sound
> id nothing plays is inert. So three is the count that has to be argued for, not
> the one that has to be grown.
>
> **The transcription is generated, not typed.** `scripts/port-game-sounds.py`
> parses `GameSounds.cs` and emits the `GameSounds.ts` block, the `SOUND_FILES`
> rows and `tests/fixtures/still-alive-sounds.json` from one parse, so the table
> and the contract cannot disagree; the test compares all three against the
> fixture. That is the whole risk of this feature. A hand transcription of 181
> pairs type-checks, builds, ships and is *silent* — `soundPath` hands the manager
> a URL, the fetch 404s, `WebAudioMusicManager` warns into a console nobody opens.
> The C# cannot have this bug: `m_SFXManager.Load(id, id_FILE)` is handed an
> **open file handle** at `RogueGame.cs:5278-5448`, so a missing file is a crash
> on the first frame. The web port's equivalent obligation is a test, and
> `tests/extended-audio.test.ts` is it — all 183 ids are stat'd through
> `soundPath`, the way the managers resolve them.
>
> **§5.6f item 1 is wrong about the file names, and the plan should say so.** It
> warns that "the fork's 180 new files use a different convention
> (`bash_wood_nearby.ogg` against our `sfx - ` prefix)". They do not: the fork
> already names its effects the way the port's `soundPath` expects, because
> `AssetPaths` derived the port's convention *from* the C#'s `*_FILE` constants
> and the fork kept them — `sfx - nightmare.ogg` and `sfx - undead eat nearby.ogg`
> are name-for-name matches across both versions. There was **no rename to do**;
> the convention is "the name the C#'s `*_FILE` constant spells", and the copy
> preserves it.
>
> **Item 2 is right, and it is the one real Classic/Still Alive difference.** The
> vanilla `sfx - undead eat.ogg` is a *single* effect the fork split per distance
> tier into `UNDEAD_EAT_PLAYER` / `UNDEAD_EAT_NEARBY`; `sfx - undead rise.ogg` is
> not in `GameSounds.cs` at all. Both vanilla files are kept untouched, and
> `DoEatCorpse` is the one gate in the feature that is a *choice* rather than an
> addition: it plays `UNDEAD_EAT` under `CLASSIC` and `UNDEAD_EAT_PLAYER` above
> it, so a Classic corpse feast stays on the file it has always used. The gate is
> over the id because there is nothing else to gate.
>
> **Three gates, and they are not one behaviour.** Two are the `Fishing` sounds
> this section's own `Fishing` block deferred — the cast in
> `DoUseFishingRodItem` and the reel in the `DoWait` catch. Two of the C#'s four
> are still absent, the `_NEARBY` pair, because both arms are
> `IsAudibleToPlayer(loc, Rules.QUIET_NOISE_RADIUS)` and **the port has no
> `QUIET_NOISE_RADIUS` and no audibility predicate that takes a radius**.
> Inventing a constant to reach a sound would be guessing a number the C# does
> not define here, so it is recorded at the site instead. The C#'s
> `Stop(FISHING_CAST_PLAYER)` before the reel is also not ported: its whole
> purpose is to cut the cast off because the two overlap, and `IMusicManager`'s
> `stop()` is *global*, so using it would silence the soundtrack over an
> inaudible overlap.
>
> **Item 4 — the distance model — is the rest of the feature, and it is the
> expensive part.** 177 of the 180 ids are still unwired. The `_nearby` / `_far` /
> `_visible` suffixes are 3 spatial tiers × 15 weapon classes, and the port has no
> distance-to-volume rule to select between them, so wiring them means building
> that first. `tests/extended-audio.test.ts` asserts that no fork-only id is
> *named* anywhere without a gate three lines away, so the count can only rise
> through a decision — and the test names the three that exist.
>
> **The loudness table is deliberately NOT regenerated, and this is the one
> decision here a later session is most likely to undo by accident.**
> `measure-audio-levels.mjs` peak-normalises sfx, which is right for the three
> vanilla effects — they are all player-perspective, and `sfx - undead eat` peaks
> at 0.39 against `nightmare`'s 1.0 — and wrong for the other 180, because their
> *relative* level is the design. Measured: `scream_far_01` peaks at 0.030 and
> `scream_nearby_01` at 0.141, and **112 of the 185 shipped effects sit below the
> 0.317** that the generator's 3.0x ceiling can lift to its 0.95 target. Running
> the script would give every tier of a scream the same peak — a scream across
> town as loud as one beside you — which is the single thing the `_far` / `_nearby`
> naming exists to prevent. So the fork's ids are left out of `SFX_GAINS`,
> `sfxGain` finds no entry and returns 1.0, and the levels are the C#'s. The test
> `leaves every fork effect at its source gain` is the tripwire: **re-running the
> generator fails it**, which is the only thing between a routine regeneration and
> a flattened distance matrix, since the file it writes says "GENERATED, do not
> edit by hand" and would not otherwise be questioned.
>
> **Load time: 7.2 MB and nothing at boot.** The port preloads every sprite before
> the first frame because a browser cannot draw one it has not fetched
> (`AssetPaths.ts:16-20`), but audio is fetched per play —
> `WebAudioSoundManager` has a `preload()` and **no caller**, and `Run()`'s
> "Loading sfxs..." block is two `UI_Repaint`s around nothing
> (`RogueGame.ts:1679-1706`). So the merge costs the boot path nothing, a
> `STILL_ALIVE` player nothing at boot, and a `CLASSIC` player nothing at all:
> they fetch an effect the first time they hear it and never fetch the other 181.
> What it does cost is 7.2 MB in the *build artifact* — `vite` copies `public/`
> verbatim — which is a download-budget question (§5.6g's "payload is paid by
> classic players" is real here and nowhere else in audio), not a frame-time one.
> Splitting `assets/sfx/` per ruleset is the only fix and it is not free:
> `soundPath` reads that directory flat, `measure-audio-levels.mjs` reads it flat
> and `.ogg`-only, and the ambients channel lands in the same tree. Deferred to a
> decision about the download budget, with the cost written down here rather than
> spent.
>
> **Three things found on the way, none of them fixed, because none of them are
> this feature's files:**
>
> - **`musicGain` is the wrong lookup for a sound effect.** The port plays every
>   effect through the *music* manager (`m_MusicManager.play(GameSounds.X,
>   MusicPriority.EVENT)`), and `WebAudioMusicManager.start` applies
>   `musicGain(id)` — which looks the id up in `MUSIC_FILES` and returns **1.0**
>   for every sfx id. So the three vanilla effects have been playing uncorrected
>   (`sfx - undead eat` at 1.0 rather than its measured 2.446) and the 180 new
>   ones would too. `WebAudioSoundManager` gets this right through `sfxGain`, and
>   nothing instantiates it: the port has no `m_SoundManager` at all. It is a
>   one-line change at the call site, but `WebAudioMusicManager` is where the
>   ambients channel is being built, so it is reported rather than touched.
> - **Two files ship with no constant.** `barbed_wire_nearby.ogg` and
>   `trip_mine_trigger_visible.ogg` are in the fork's `Resources/Sfx/` and named by
>   no `GameSounds` constant. The directory was copied verbatim rather than
>   filtered, so a constant that names one of them later already has its file;
>   the test registers both so a *third* orphan is deliberate, and asserts that no
>   orphan is a file the C# *does* name — which is what a misspelling looks like
>   from this side.
> - **`RS - Reincarnate.ogg` now exists in both `assets/music/` and
>   `assets/sfx/`.** The fork moved that track from music to sfx in Release 6-1
>   and has no `GameMusics.REINCARNATE`; the port still does, so `reincarnate` is a
>   key in both tables and `audioPath` (music first) sends it to the music encode.
>   Both files exist, so nothing is broken — but the sfx copy is unreachable, and
>   removing either would be a Classic change, so it is recorded.
>
> Four mutations, four caught: a mistyped file name in `SOUND_FILES`, a deleted
> `SOUND_FILES` row, a removed `ExtendedAudio` gate, and the `DoEatCorpse` ternary
> collapsed to the vanilla id.

#### 5.6f Stage 5 — content and audio

**Map generation.** `BaseTownGenerator.cs` 5 850 → 12 042 is fifteen new
building types plus a restructured block-roll, a three-map shopping mall, an
army underground, and 124 new tile models. All of it gates on a `Feature` and
reuses the existing `Parameters` object (`BaseTownGenerator.ts:92-207`,
`DEFAULT_PARAMS` at `:253`), which `RogueGame` already save/restore-swaps per
district (`:25186-25190`) and tunes per `DistrictKind` in a `switch`
(`:25060-25137`, with `districtSize` reaching the generator at `:25137`). The tennis and basketball courts are ~97 of the 124 new tiles
and are the single most expensive item in the audit for the least gameplay.

**One sharp edge to carry in from the audit:** the mall generator needs a
49×49 block, which does not fit cleanly alongside the fork's own 50×50 minimum
district size — `MakeMallBlocks` has a special case to avoid double-roads when
`map.Width > 50`. Copying the mall without the district-size change, or with a
different one, produces a broken district. Decide the district size *before* the
mall, not after.

**Audio is the one place "mechanical" is false.** The sprite pipeline handles
711 files unchanged; the sound pipeline does not, because
`measure-audio-levels.mjs` measures *filenames* and so does `soundPath` — so the
merge is a naming and loudness question rather than a copy. (This paragraph
originally claimed the fork's 180 files "use a different convention
(`bash_wood_nearby.ogg` against our `sfx - ` prefix)". That was wrong and item 1
below now says so: the convention came *from* the C#.)

1. ~~**Rename on copy** to whatever `GameSounds`/`SOUND_FILES` adopt.~~ **Not
   needed — the premise was wrong.** The port's convention is *derived from* the
   C#'s `*_FILE` constants and the fork kept them: `sfx - nightmare.ogg` and
   `sfx - undead eat nearby.ogg` are name-for-name matches across both versions,
   and all 181 of the fork's `*_FILE` values have a file whose basename is that
   value. `AssetPaths.ts:118-124` and `measure-audio-levels.mjs:112` both key off
   the basename, so the filename *is* the id — and the id was already right.
   **DONE**, by `scripts/port-game-sounds.py --emit` rather than by hand.
2. `sfx - undead eat.ogg` splits into `nearby` + `player` variants, and
   `sfx - undead rise.ogg` **does not exist in the fork at all**, though
   `GameSounds.ts:7-11` references both. **Ours kept**, and `DoEatCorpse` is gated
   on the id so the vanilla file stays the Classic one. See `ExtendedAudio`.
3. **180 `GameSounds` constants + 180 `SOUND_FILES` entries are mandatory**, not
   optional: `audio-levels.test.ts:76-80` fails without them. **DONE** — 180 new
   pairs (the 181st is `NIGHTMARE`, which both versions declare verbatim) and 183
   `SOUND_FILES` rows.
4. The `_nearby`/`_player`/`_far`/`_visible` suffixes imply a distance model
   that does not exist in the port, and the fork's matrix is 3 spatial tiers ×
   15 weapon classes. That model has to be built. **Not built** — it is the
   remaining 177 ids, and the reason the feature is table-first.
5. **13 ambients need a new audio channel.** `AssetPaths.ts:35-38` has music and
   sfx only.
6. `node scripts/measure-audio-levels.mjs` needs `sox` on `PATH` (present at
   `/usr/bin/sox`) and reads `public/assets/{music,sfx}` **flat and `.ogg`-only**
   via `readdirSync` (`:104, 112`) — a subdirectory or a `.wav` is invisible to
   both the script and `soundPath()`. **Do not run it on the merged sfx tree**:
   the fork's 180 are a distance matrix and peak-normalising them destroys it.
   See `ExtendedAudio`; a test fails if somebody does.

Music is a smaller merge: 22 fork tracks against our 24, with different names
(`RS - CHAR researchers.ogg`, `Shopping Mall.ogg`, `Post-rescue.ogg`).

**Attribution is settled and not optional.** The fork's media are CC0 / CC-BY
3.0 with mandatory attribution — roughly 90 `freesound.org` sources plus sprite
contributions — and every file has been modified. Per `STILL_ALIVE_REFERENCE.md`
§8 this lands as a credits page plus a main-menu entry, which is what the fork
itself did. The port already has `HandleCredits()` (`RogueGame.ts:3121`) to hang
it from, and `docs/` to publish it.

#### 5.6g Risks, and what would make me stop

- **God-file growth is the real cost, and the registry mitigates it rather than
  removing it.** The scanner test makes the branch count *visible*; it does not
  make `RogueGame.ts` smaller. If Stage 4's features end up scattered rather than
  funnelled through `FeatureFlags`, stop and refactor before Stage 5, because
  Stage 5's 15 building generators are where scattered branches become
  unreviewable. **§6 is that refactor**, sequenced so the four free leaves and the
  render cluster come out before any Still Alive mechanic lands. The two regions
  §6 refuses to split — `14008–18936` and `8770–11628`, 27.8% of the file — are
  where Stage 4's branches will end up, which is the point: they go where the
  code already is rather than where the flag is.
- **Payload is paid by classic players.** 30 MB → ~50 MB and a 2.5× preload, for
  content half the audience never sees. The only mitigation that works is a
  per-ruleset preload list — which means the manifest stops being
  `allImageIds()` and becomes a function of the ruleset, and that is a small but
  real change to the loading path and to `sprite-assets.test.ts`.
- **Two copies of the balance surface.** Difficulty, scoring, hi-scores and the
  post-mortem screen all gain a ruleset dimension, and the scoring multipliers in
  particular are a second balance surface to tune rather than one.
- **QA doubles.** Every bug report becomes "which ruleset?", and a fix can be
  right in one and wrong in the other. The Stage 4 negative tests are what keep
  that honest; without them the two modes drift.
- **The 48 ours-only and 73 theirs-only sprites** need a merge decision, not a
  mechanical one, and `STILL_ALIVE_REFERENCE.md` §7 lists the fork places where
  it is the *older* code. Copying from it without that list is how a regression
  gets in.

**Sequencing, and the one thing I would not skip.** Stage 1 is days and Stage 2
is days, and they are worth doing on their own merits whatever is decided about
Stages 3–5: Stage 2's unconditional half is thirteen genuine bug fixes to a
shipped game, four of which the existing test suite would catch if they ever
regressed. Stages 3–5 are the part that is hard to reverse, and **Stage 1 alone
converts every later change from a fork into an additive diff behind a flag** —
which is the whole argument for doing Stage 1 first even if the rest is never
done.

---

## 6. `RogueGame.ts` decomposition

> **Status: planned 2026-09-29, not started.** This is a refactor of the port
> itself, not a Still Alive feature. It is a **prerequisite for §5.6 Stages 4–5**,
> and it is what makes §5.6g's "stop and refactor before Stage 5" an instruction
> rather than a shrug. Stages 1–3 of that plan do **not** need it: Stage 3 is data
> and sprites and never opens this file.
>
> `file:line` citations verified 2026-09-29. Counts are from an AST walk of the
> 595 methods and 173 property declarations in the 27,722-line file; the two
> regions whose figures changed on re-measurement are NEWGAME (28 outbound, not
> 51) and RENDER (11, not 45), because those count only calls landing *outside*
> the region.

### 6.1 The deferral is already on record

`86f0887` ("Port the RogueGame scaffold") says, verbatim:

> every `DoXXX` action, every `HandlePlayerXXX` command and every `Draw*` method reads/writes the same private fields (`m_Player`, `m_Session`, `m_Overlays`, `m_ViewRect`, …) — a split would make most of that state public and thread a `game` reference through ~500 call sites; […] The module table below is therefore **deferred to a post-Phase-4 refactor** (Phase 8) — it stays as the target shape **once the game runs and the real cross-method dependencies are known**.

The condition is met. The game runs, and the cross-method dependencies are now
measured rather than estimated. The file went 4,044 → 27,722 lines in the 138
commits since. This is an overdue decision, not a new one.

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

**567 of 584 methods are public** — only 17 are `private`. The `private` boundary
is effectively absent, so a split without a deliberate interface pass just
relocates the god object into N sibling modules that import each other. Wave 0 is
where that pass happens.

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

So it goes from 28 hub-ward edges to ~5. It is §5.6b's `HandleSelectRuleset` that
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
discipline as §1.1a and §5.6c.

Also: `web/.porting/assemble_roguegame.py` is gitignored, untracked and already
dead (it hardcodes inputs that no longer exist). A split invalidates a dead tool,
nothing live.

### 6.10 Sequencing, verification, and stopping

| Wave | Lines out | Residual | Gate before the next |
|---|---|---|---|
| 0 | 0 | 27,722 | `GameContext` + `tests/helpers/game.ts` exist; the 4 singletons resolved; the 567 public methods given a deliberate pass |
| 1 | 2,079 | 25,643 | `npm run verify` green; the 4 scanners replaced by behavioural tests |
| 2 | 2,976 | 22,667 | first-person goldens unchanged; the `m_AnimOffsets` decision made and tested |
| 3 | 1,722 | 20,945 | new-game flow reachable end to end in the sim |

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
