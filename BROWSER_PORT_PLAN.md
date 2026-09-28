# Rogue Survivor Reloaded — TypeScript / Browser Port

> **Status (2026-09-28):** Phases 1–7 ported and playable. Phase 8 tasks 1–11
> done; only 12 (optional touch support) remains. `npm run verify` is green end to
> end — type-check, 719 tests in 48 files with coverage enforced, and the Vite
> build. Read [Current State & Handover](#1-current-state--handover).
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
5. [Future Plans](#5-future-plans) — [5.1](#51-mobile--touch-support-phase-8-task-12) touch · [5.2](#52-where-the-fidelity-work-stands) · [5.3](#53-renderer-and-layout) · [5.4](#54-first-person--pseudo-3d-view-mode) · [5.5](#55-housekeeping)

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

- `master`, tracking `origin/master`, clean and in sync with the remote.
- **`git log --oneline` is the history.** This section used to enumerate every
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
- **Current state (2026-09-28): 719 tests across 48 files, `npm run verify` green
  end to end — type-check, coverage, and the Vite build.** Note that this was *not*
  true on arrival: the suite was red on Linux, for the reason in §1.6, and this
  line claimed otherwise. Verify it rather than reading it.
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
| `npm run test` | Vitest, 719 tests in 48 files |
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
| 4 — Game loop | `RogueGame.ts` (~26 KLOC) all 10 slices | Ported, **0 stubs — and now behaviourally exercised headless (§1.2) *and* played in a browser** |
| 5 — World gen & AI | `BaseAI` (184/184), all 11 AI controllers, 4 generator files (`MapGenerator`, `BaseMapGenerator`, `BaseTownGenerator` 5 814 lines, `StdTownGenerator`) | Done |
| 6 — Audio | Web Audio SFX + music | Done |
| 7 — Save / load | localStorage / IndexedDB, `Session` serialisation | Done |
| 8 — Polish, sim, CI | Headless harness, 719 tests, CI, PWA, Docker, asset pass, frame-cost pass, desktop wrapper | **In progress** — 11 of 12 tasks done; only 12 (optional touch) remains. See §4.1 |

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
| 5 | Vitest + `@vitest/coverage-v8`, `test` / `test:coverage` scripts, coverage thresholds | **Done** — 719 tests, 48 files, thresholds enforced (50/75/57/50) |
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
   2026-09-28; it was 61.7/81.1/74.9/61.7 on 2026-09-27, against
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

Not scheduled, not started. A second renderer that presents the same game in
first person, built entirely from the sprites that already ship. No new art.
Recorded here because the enabling facts are not obvious and are expensive to
re-derive.

**The art already suits it.** This is the finding that makes the idea viable,
and it is the opposite of what a top-down game's assets usually look like.
Checked directly in `src/Resources/Images/`: `Actors/zombie.png` is a
front-facing figure with raised arms, `MapObjects/car1.png` is a head-on car
rather than a plan view, and `Tiles/wall_brick.png` is a flat brick *texture* —
exactly what column-based wall rendering wants. The original artist drew
everything facing the viewer even though the game is top-down, so billboarding
these sprites will likely look better than the current view does. Two caveats:
small items are isometric rather than front-on (`Items/item_bandages.png` is a
side view), and tile decorations are flat icons that only work as wall decals.

**The data model cooperates.** Recorded precisely, because the whole design
rests on it:

- **Walls are real grid cells** (ids 12–18, `isWalkable` and `isTransparent`
  both false), not a property of adjacent floors. A DDA ray terminates on
  `!tile.model.isWalkable`.
- **Walls are exactly one tile thick** — `MapGenerator.tileRectangle`
  (`MapGenerator.ts:154-202`) fills a four-line outline, not a band. This is
  load-bearing: no ray starting in walkable space can reach an interior wall
  face, so the face normal is derivable from the ray direction alone and **no
  autotiling or per-face data is needed**, which is the thing that usually makes
  a grid raycaster expensive.
- `isWalkable === isTransparent` for all 18 defined models. The single
  exception is `TileModel.UNDEF` (`false, true`) — not walkable but see-through —
  so terminate rays on `isWalkable` and unfilled space correctly occludes.
- 7 wall ids share only **5 distinct images**: `WALL_POLICE_STATION`,
  `WALL_STONE` and `WALL_SUBWAY` all render `TILE_WALL_STONE`
  (`GameTiles.ts:65-68`), differing only in minimap colour. A first-person view
  will make that aliasing visible where it is currently invisible.
- Every sprite is a single 32×32 still image — 1124 files, no sprite sheets.
  Billboard scale is therefore a constant over ray distance.
- `Map.lighting` (`DARKNESS`/`OUTSIDE`/`LIT`) is per **map**, not per tile.
  There is no per-tile lighting to compute, so any fog is a synthesis and should
  be commented as one.

**Two engine changes, both small.** Everything else lives in the UI layer:

1. `RogueGame.DrawMap` branches on a render mode and calls a new
   `IRogueUI.UI_DrawScene(scene)` instead of the tile loop. `NullRogueUI` no-ops
   it — the headless sim is the test harness and must stay untouched — and
   `CanvasUI` ignores it. Precedent: `UI_BeginScaledDraw` was added the same way,
   with a comment recording why it is not in `IRogueUI.cs`.
2. **Redirect `RogueGame.ScreenToMap` through a new
   `UI_ScreenToMap(gx, gy): Point | null`.** Today it converts a cursor position
   to a tile for hover and click; in first person a click is a *ray*. Without
   this, tooltips and click-to-interact break silently. `CanvasUI` keeps today's
   arithmetic, `FirstPersonUI` ray-picks. Easy to overlook and it is not
   testable by inspection.

**The one genuine gameplay conflict: FOV is a circle, a first-person view is a
cone.** `Rules.actorFOV` returns 8 for a living, and `Rules.losDistance` is
`0.866 × Euclidean` (`Rules.ts:1881`), so the player can see a circle of radius
**~9.24 tiles in every direction**, and `IsVisibleToPlayer` reads `tile.isInView`
across that whole circle. A 90° cone shows roughly a quarter of it.

**Resolution: mouse-look is free, decided.** Rotation costs no turn and no
stamina; only movement and actions do. The player surveys their full FOV by
turning, as in any grid FPS, and the engine rules stay byte-identical to the
original. Camera angle is then a free float while actions still snap to the
existing 8-way `Direction.COMPASS`, separating presentation angle from rules
direction. The game already ships `Icons/threat_high_danger` and friends, so
off-screen threat markers are free reuses of existing art.

**The floor is the whole cost problem.** Walls are ~496 `drawImage` calls at
2 px columns and billboards are cheap, but a mode 7 floor is a per-texel
operation: the 992×672 view is ~992×336 texels below the horizon, which even at
quarter resolution is **~20 000 calls/frame** against the 658/frame treated as
the budget in §4.1d. On a GPU that is one fragment shader; in Canvas2D it is
roughly 40–120 ms/frame. Two routes to a textured floor:

- **Per-tile subdivided quads in Canvas2D.** Project each visible floor tile to
  a screen quad, `setTransform`, subdivide near tiles (2×2 → 4×4) to hide affine
  error where the trapezoid skew is worst. ~400–1800 calls. Some warping on
  nearby tiles; not very visible at 32 px art. No new technology.
- **A small raw-WebGL2 offscreen canvas** for the 3D view only, composited under
  the existing 2D HUD. True mode 7 at full resolution, trivially 60 fps, and
  still zero dependencies — raw WebGL2 is ~250 lines, not a framework. The cost
  is a second rendering path, and `CanvasUI`/`NullRogueUI` must exist regardless
  for the sim.

**Not yet decided between those two.** It is the one open decision in this
section, and it should be made with a measured draw-call profile rather than a
guess — see the profiling note at the end.

**Modules.** `FirstPerson/{Camera,Raycaster,Projector,Scene}.ts` and
`ui/FirstPersonUI.ts`. `Raycaster` and `Projector` take a `Map` and have no DOM
dependency, so they unit-test in Node — that is where the tests belong, since a
raycaster is only geometry. Note the grid is **y-down**, so the usual
left-handed raycaster basis must be flipped; easy to get backwards and hard to
see.

**Commit order,** on a branch, once the data work in §1.5 has landed:

1. `Raycaster` + tests, no UI at all
2. Walls only, flat-shaded floor — proves the camera and the seam
3. Billboards (actors, corpses, ground items, non-blocking map objects,
   decorations), far→near, per-column depth-tested against a `Float32Array` of
   wall distances so a zombie half behind a door clips correctly
4. Floor
5. Sky/ceiling from `tile.isInside`, one full-screen gradient for distance fog
   (the cheap way to make the night/rain FOV penalties read, at zero per-texel
   cost), rain overlay
6. Mode toggle, persisted via `storage` the way `MapZoom` already is

**If the frame budget bites, cut in this order:** billboard partial occlusion
first — draw whole sprites and accept a little pop through doorways; it is the
nicest feature to lose and the most expensive. Then floor subdivision depth.
Walls and the raycaster stay.

**Do not** start by touching `RogueGame` beyond the two changes
above. The `IRogueUI` seam exists for exactly this; the same advice as §6.1, and
for the same reason.

**And per §1.5 item 1: this is a renderer change, so the browser is the
definition of done, not the sim.** The sim will be green throughout, because
`NullRogueUI` drops every painting call. A raycaster that projects every sprite
off-screen, or picks the wrong wall face, is invisible to `npm test` and to
`npm run sim` — both will pass on a completely broken renderer. Profile with
`npm run profile`, then open the game and look at it.

### 5.5 Housekeeping

- `tests/integration/reproducibility.test.ts` cannot run on Windows
  (`execFileSync` cannot spawn `npx.ps1`) — see §1.6. Fix by resolving the
  binary path instead of relying on `npx` being spawnable.
- The `icon.png` in the repo root is unexplained and untracked (§1.6); someone
  should work out what writes it before it becomes a committed mystery.
- The Docker image has never been built locally (§4 task 8); CI exercises it
  first, and that is the first time anyone will know whether it works.
