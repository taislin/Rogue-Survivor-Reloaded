# Rogue Survivor Reloaded — TypeScript / Browser Port

> **Status (2026-09-27):** Phases 1–7 ported and playable. Phase 8 tasks 1–11 done; only 12 (optional touch support) remains.
> **The game now runs end to end in a browser.** 5 runtime bugs were found and fixed on 2026-09-27 by playing it — see §1.1b. A later audit of the CSV → JSON data layer found 18 more — see §1.1c. A fidelity sweep of the four previously-unaudited tables found 6 more — see §1.1f. A sim sweep found 6 more — see §1.1h. Two more came from playing the build that shipped those fixes — see §1.1i.
> **All 64 recorded bugs are now fixed.** The one remaining *feature* gap is
> world/map serialisation (§1.5 item 6), which is under way; load currently
> refuses a save rather than half-restoring one. Read
> [Current State & Handover](#1-current-state--handover) first.
>
> **The bug sections are the history of this port, and they are deliberately kept
> in order rather than merged:** §1.1 (engine), §1.1b (found by playing it),
> §1.1c (data layer), §1.1d (per-actor abilities), §1.1e (data binding), §1.1f
> (table fidelity sweep), §1.1g (what is now proven clean). Each is a different
> *class* of mistake, and the point of keeping them separate is that the class is
> the lesson — §1.1c and §1.1d have the same root cause four sections apart.
> §1.1g exists so the next audit starts from what is already proven.

Porting a C# WinForms zombie-survival roguelike (195 files, ~2.5 MB, largest `RogueGame.cs` at 955 KB / 23 233 lines) to a browser-playable TypeScript version. `src/` is the original C# and is **never modified** — it is the reference for every port.

> **Rule: a bug found in the C# is fixed in the TypeScript, never in `src/`.**
> `src/` stays byte-for-byte as the statement of intent, and the port is allowed
> to outgrow it where the original is provably wrong — a crash, a hang, a dead
> code path. Each such divergence is marked in the code at the fix, with the C#
> line reference and the reason. This settles the three "open decisions" that
> §1.5 item 7 used to carry; see that item.

> **Do not delete `src/`.** Nothing compiles or ships it (the Dockerfile copies
> only `web/`, and `.dockerignore` excludes it), so removing it saves no build
> time and no bundle size. It is the only statement of intended behaviour, and
> every one of the 62 bugs in §1.1, §1.1b, §1.1c, §1.1d, §1.1e, §1.1f and
> §1.1h was found by diffing the port against it. Six of the eight items in
> §1.5 are still open (one of them, item 3, is half-closed), and all six are
> fidelity work that *cannot be done* without it. Revisit only once those close.

---

## Table of Contents

1. [Current State & Handover](#1-current-state--handover)
   - [1.1 The bug log — 56 bugs](#11-the-bug-log--56-bugs) · [the four bug classes](#the-four-bug-classes-below-and-the-one-lesson-that-covers-them)
   - [1.1b](#11b-five-more-bugs-found-by-playing-the-thing-2026-09-27) found by playing it · [1.1c](#11c-eighteen-bugs-in-the-csv--json-data-layer-2026-09-27) the data layer · [1.1d](#11d-eight-bugs-in-the-per-actor-abilities-2026-09-27) per-actor abilities · [1.1e](#11e-the-actor-data-table-was-bound-by-position-not-by-id-2026-09-27) data binding · [1.1f](#11f-six-more-fidelity-bugs-from-a-sweep-of-the-four-unaudited-tables-2026-09-27) table fidelity · [1.1g](#11g-what-that-sweep-proved-clean--do-not-re-audit) **proven clean**
   - [1.2](#12-the-harness-now-runs-real-games) sim baseline · [1.2a](#12a-four-things-that-look-like-bugs-but-are-not) **not bugs**
   - [1.3](#13-how-to-run-it) commands · [1.4](#14-runs-are-now-reproducible) seeding · [1.4a](#14a-minimap-reveal-bug--fixed-and-the-diagnosis-here-was-wrong) a wrong diagnosis, kept · [1.4b](#14b-the-world-behind-the-player-stopped-running-2026-09-27) **the background sim had no thread**
   - [1.5](#15-next-steps) **next steps** · [1.6](#16-known-non-bugs-do-not-re-investigate) · [1.7](#17-git-state)
2. [Quick Reference](#2-quick-reference) — layout, porting rules, build commands
3. [Phase Status](#3-phase-status)
4. [Phase 8 — Polish, Headless Simulation & Deployment](#4-phase-8--polish-headless-simulation--deployment)
   - [4.1](#41-task-list) tasks · [4.1a](#41a-test-suite-layout) tests · [4.1b](#41b-deployment-notes) deploy · [4.1c](#41c-asset-payload-pass-tasks-9--10) assets · [4.1d](#41d-frame-cost-task-11) frame cost
   - [4.2](#42-headless-harness-design-for-whoever-extends-it) harness internals · [4.3](#43-test-strategy) test strategy
5. [Summary Timeline](#5-summary-timeline)
6. [Future Plans](#6-future-plans) — [6.1](#61-mobile--touch-support-phase-8-task-12) touch · [6.2](#62-finish-the-fidelity-work-first) · [6.3](#63-renderer-and-layout) · [6.4](#64-first-person--pseudo-3d-view-mode) · [6.5](#65-housekeeping)

---

## 1. Current State & Handover

### 1.1 The bug log — 56 bugs

**§1.1 through §1.1g are one bug log, in the order the bugs were found.** They are
kept as separate subsections rather than merged into a single table because each
is a different *class* of mistake, and the class is the lesson — §1.1c and §1.1d
turn out to have the same root cause four sections apart. Bugs 1–10 are below;
11–15 in §1.1b, 16–33 in §1.1c, 34–41 in §1.1d, 42–50 in §1.1e, 51–56 in §1.1f,
and §1.1g lists what is now proven clean so it is not re-audited.

**A clean `tsc` and a clean Vite build do not mean the port works.** Phase 4 was
marked "complete" on the basis of zero remaining `not yet ported` stubs plus a
green type-check. Neither test executes the game.

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

#### The four bug classes below, and the one lesson that covers them

Each subsection that follows is a different *class* of mistake, found by a
different method. Read them as four arguments for the same conclusion.

| § | Class | Found by | Why no tool caught it |
|---|---|---|---|
| §1.1 | Runtime faults — wrong container, wrong cast, dropped call | Running the engine headless | Nothing executed the code at all |
| §1.1b | Presentation faults | **Opening a browser and looking** | `NullRogueUI` drops every painting call, so the sim is structurally blind |
| §1.1c, §1.1e | Data faults — a loop or a positional index standing in for a table | Diffing the generated data against its source | Rows are read as `any`: a missing key is `undefined`, and `undefined` propagates without complaint |
| §1.1d, §1.1f | Silently substituted defaults — a blanket rule, a wrong colour, an unassigned fallback | Reading the port against the C#, table by table | The substituted value is *plausible*, so absence of an error reads as absence of a bug |

**The lesson, stated once.** Four times, the port replaced something specific in
the original with something general — a per-entity table with a loop, an ID lookup
with a row index, a threaded parameter with a default field, a named colour with
whatever was to hand. Every one of those substitutions compiled, type-checked, and
produced no error, because a plausible default and a correct value are
indistinguishable until you look at both. *A blanket rule over heterogeneous data
is a silent truncation of it.* Absence of an error is not evidence of correctness.

Two corollaries that have each cost real time:

- **The sim is the definition of done for the engine; the browser is the
  definition of done for the renderer.** Neither substitutes for the other, and
  both were green while the game was unplayable (§1.1b).
- **A grep is a hypothesis generator, not a verdict** (§1.5 item 4): the
  `percepted as Actor` pattern matched 43 sites and produced no live bug; the
  §1.1f sweep matched nothing mechanically and still found six.

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
manifest completeness). **146 tests pass** at that point in the port's history.

### 1.1c Eighteen bugs in the CSV → JSON data layer (2026-09-27)

Found by auditing every data table against `src/`, after a report that the
food/sleep/sanity meters were capped at 100. That turned out to be the top of
**five stacked layers, each hiding the next** — the reported symptom was in the
last one, and the four beneath it were all invisible.

Every one of these is invisible to `tsc`, to the build, **and to the headless
sim**, because the rows are read as `any`: a key that does not exist is
`undefined`, and `undefined` propagates through arithmetic and comparisons
without complaint. This is the same lesson as §1.1 and §1.1b wearing a
different disguise — *absence of an error is not evidence of correctness.*

| # | Bug | C# reference | Impact |
|---|-----|--------------|--------|
| 16 | Sheet meters hardcoded: `const food = isLiving ? 100 : 0`, same for sleep and sanity, while `Rules.FOOD_BASE_POINTS` etc. sat unused. Thresholds were never changed. | `GameActors.cs:204-212` | **Game-breaking.** 1440/1800/2880 became 100/100/100, so every actor spawned already "Hungry" *and* "Sleepy" *and* "Disturbed", and every `HoursUntil*` helper returned 0. |
| 17 | Undead food was `0` for everyone; C# gives the rotting branch `ROT_BASE_POINTS` (2880) and reserves `NO_FOOD` for the three skeletons, the rat zombie and the sewers thing. | `GameActors.cs:175`, `:260-650` | No zombie could ever rot. |
| 18 | `hasSanity` was `isLiving`, a combination C# never pairs with `NO_SANITY` | `GameActors.cs:938`, `:970` | The feral dog and Jason Myers drew an empty SAN bar. |
| 19 | Inventory capacity a flat `6` for the living | `HUMAN_INVENTORY = 7`, `DOG_INVENTORY = 1` | One slot short of the original's "Inventory 1-7". |
| 20 | `convert-csv.js` used the **raw CSV header cell** as the JSON key. Headers spell out units and ask questions: `"NUTRITION ratio of base food points"`, `"BATTERIES in hours"`, `"ACTIVATES WHEN DROPPED?"`. | C# reads by column *index*, so the text is decorative there | **Game-breaking, and silent.** 15 columns across 6 files produced keys no reader asks for: nutrition, bestBefore, batteries, FOV and every trap flag were all `undefined`. Food restored nothing; flashlights had no battery. |
| 21 | `d.ENCUMBRANCE` (column is `ENC`) | `GameItems.cs:424-434` | Every piece of body armor had encumbrance 0 — weighed nothing. |
| 22 | `d.STA_PENALTY`, `d.FRAGILE`, `d.TOOL_BASH`, `d.TOOL_BUILD` (columns are `STA`, `ISFRAGILE`, `TOOLBASHDMGBONUS`, `TOOLBUILDBONUS`) | `GameItems.cs:209-232` | Melee weapons lost their stamina penalty, fragility and tool bonuses. |
| 23 | `d.MAX_AMMO` (column is `MAXAMMO`) | `GameItems.cs:280-300` | Every ranged weapon had `maxAmmo: undefined` — no magazine. |
| 24 | `d.STACKING` on the barricade table (column is `STACKINGLIMIT`) | `GameItems.cs:384-410` | Wooden planks were never stackable. |
| 25 | `d.VERB` — **there is no `VERB` column at all.** The C# spells the verb out at each construction site. | `GameItems.cs:778-1086` | Every melee and ranged weapon had an undefined verb: the UI said *"undefined the zombie"*. |
| 26 | The `* WorldTime.TURNS_PER_HOUR` unit conversions the C# does at load were skipped in three tables | `GameItems.cs:1237,1311,1332` | A cell phone's **72 hours** of battery was 72 *turns* — 2.4 hours. Same for both lights and the stench killer. |
| 27 | `Items_Scentsprays.json` was never imported; the lone model was hand-written | `GameItems.cs:1325-1336` | Quantity 10 instead of 40, strength 60 instead of 90. A whole orphaned table. |
| 28 | `Skills.csv` was never read. All 43 `Rules.SKILL_*` statics were hardcoded to the C# **compile-time defaults** — the values the game has *before* `LoadSkillsFromCSV` runs. | `Skills.cs:310-430` | 36 coincide with the CSV, which is why it went unnoticed. **7 are the vanilla balance, not Reloaded's:** Strong 2 vs 3 damage, Z-Grab 4% vs 2%, Z-Tracker 10% vs 4% smell, Z-Tough 4 vs 3 HP, Z-Eater 0.2 vs 0.15 regen, Z-Light-Eater's two values swapped. |
| 29 | Food was cross-wired: the loader indexed rows positionally, but `Items_Food.csv` lists Ration, Canned, Groceries while the `ItemID` enum is Ration, Groceries, Canned | `GameItems.cs:751-774` | Every food got the wrong `ItemID` *and* the wrong sprite, and the `-1` "never expires" sentinel landed on groceries — so `makeItemGroceries` built a `freshUntil` of −360 and `new WorldTime` **threw**, failing three test files. |
| 30 | The C#'s post-processing pass is the only place `IsStackable` is finally decided: `model.StackingLimit > 1`, applied to every model, overriding all constructor assignments. The port decided it per table with `> 0`. | `GameItems.cs:1410-1421` | Every single-stack item (both foods but canned food, the plank, both uniques) was wrongly stackable. |
| 31 | `isPlural` was never set on anything | `GameItems.cs:703-743`, `:1092-1127` | `Item.ts:29` falls back to singular, so one round read as *"a light pistol ammo"*. |
| 32 | `isAn` used `/^[aeiou]/`; C#'s `StartsWithVowel` counts **`y`** | `GameItems.cs:681` | "Yellow…" items missed the "an". |
| 33 | The ammo table was invented: "light pistol ammo" instead of "light pistol **bullets**", and quantities 30/30/30/20/16/12 instead of 20/12/14/20/10/30. `EquipmentPart = LEFT_HAND` was also missing on trackers, spray paints and scent sprays, though the equip logic reads it. | `GameItems.cs:1088-1130` | Wrong names, wrong pack sizes, and three item types that could not be held correctly. |

#### The pattern, and why the sim could not have found any of it

Bugs 16–33 are all *data* faults, and the headless simulator is structurally
blind to them: it exercises the engine's behaviour, and an `undefined` stat
produces perfectly valid-looking engine behaviour. The player starves on turn
9 either way. The sim's value is catching crashes and corruption; it is not a
correctness oracle for content.

The one tool that *did* catch all of this was mechanical: enumerate the keys
each generated JSON actually has, enumerate the `d.X` reads each loop makes, and
diff them. That found bugs 20–25 in one pass. The lesson generalises — **when a
port has a machine-readable boundary between authored data and code, check the
two sides agree, rather than reviewing the code by eye.**

**Bug 23 had a consequence well beyond its own row, and it is worth calling out
separately.** With `maxAmmo` undefined, no living NPC could fire a ranged weapon
at all, so the entire ranged half of NPC behaviour was silently dead. Fixing it
changed the game's dynamics enough to invalidate the recorded sim baseline —
see §1.2. *A data bug can disable a whole subsystem, and the symptom will look
like a balance problem rather than a bug.*

#### Two upstream data bugs found on the way

- **`Skills.csv` cannot be loaded by the C# at all.** It labels its first rows
  `_FIRST_LIVING` and `_FIRST_UNDEAD` where the `Skills.IDs` enum has `AGILE`
  and `Z_AGILE`, and `FindLineForModel` (`Skills.cs:227`) matches on that
  column — so the original throws `skill AGILE not found` during startup. The
  port's `Skills.load()` therefore matches on **`NAME`**, the one column that is
  intact. Side benefit: the lookup throws if `Skills.NAMES` and the CSV ever
  drift apart. Fixing the CSV at source means editing `src/`, which this project
  forbids — **open question, needs a decision.**
- **`GameItems.cs:993` passes `rwp.FLAVOR` as the *plural* name** for every
  ranged weapon, where `d.PLURAL` was clearly meant. An upstream typo. The port
  keeps `d.PLURAL`; this is a deliberate divergence, not an oversight.

#### Regression tests added alongside

`tests/data-tables.test.ts` (45 cases) asserts the canonical column names for
all 15 tables, that no key contains a space, and — the important one — that
**every JSON value equals its CSV value positionally**, so a CSV edited without
regenerating the JSON fails the build instead of quietly shipping stale balance.
`tests/skills-data.test.ts` (53 cases) asserts all 43 `SKILL_*` constants equal
their CSV value with the right `(int)` truncation, and that each of the 7
corrected ones now *differs* from the C# default. Both were verified to fail
when the corresponding bug is reintroduced. **273 tests passed at that point**;
the suite is now larger, see §4.1a.


### 1.1d Eight bugs in the per-actor abilities (2026-09-27)

Found from a player report: *"bumping doesn't open doors, it just says that I
cannot break them."* The cause was much larger than doors, and it is the **same
shape** as §1.1c: a single loop standing in for per-actor detail.

`GameActors` inferred abilities from `isLiving` / `isUndead` and set **9 of the
23 flags**. `Abilities` defaults every flag to `false`, so everything unlisted
was off.

| # | Bug | C# reference | Impact |
|---|-----|--------------|--------|
| 34 | The blanket ability loop left **eight** flags off for the player: `canUseMapObjects`, `canBashDoors`, `canBreakObjects`, `canJump`, `canBarricade`, `canPush`, `isIntelligent`, `aiCanUseAIExits` | `GameActors.cs:668-679` | **Game-breaking.** The player could not open doors, break objects, bash, jump, barricade, push, or use map exits. See the chain below. |
| 35 | The same loop gave **skeletons and the rat zombie** `isRotting`, `canBashDoors`, `canBreakObjects`, `canZombifyKilled` | `GameActors.cs:255-301`, `:620-650` | The undead could bash and break things the C# forbids them, and could zombify kills. |
| 36 | …of which `isRotting` drives the rot meter | `Abilities.isRotting` | Skeletons were rotting despite the C# giving their sheet `NO_FOOD`. |
| 37 | `isUndeadMaster` was never set on the zombie master, lord or prince | `GameActors.cs:530-615` | `Rules` and `ZombieAI` both test it; the three most capable undead were treated as ordinary zombies. |
| 38 | `isSmall` was never set on the rat zombie | `GameActors.cs:620-624` | It could not slip past closed doors, which is the rat zombie's defining trait. |
| 39 | `isLawEnforcer` was never set on the policeman | `GameActors.cs:854-880` | The one law-enforcement NPC in the game was not one. |
| 40 | `aiNotInterestedInRangedWeapons` was never set on the biker | `GameActors.cs:792-812` | The one actor that ignores ranged weapons did not. |
| 41 | `canJumpStumble` was never set on the zombie masters | `GameActors.cs:530-615` | — |

**Why the door message was so misleading.** `Rules.isBumpableFor` tries, in
order, move → fight/chat → **open door** → **bash door** → container → **break**,
and returns the *last* failure reason (`Rules.cs:1345-1491`). With
`canUseMapObjects` off, opening failed with "no ability to open"; with
`canBashDoors` off, bashing failed too; so it fell through to breaking and
reported **"cannot break objects"** — a true statement about the last thing it
tried, and no hint that the first two had failed for a different reason. The
message was accurate; it was answering the wrong question.

Fixed by transcribing all 27 actors' `new Abilities() { … }` blocks from the C#
into a per-actor `abilitiesFor()` table, replacing the loop. Note the C#'s
`ZombieAI_AssaultBreakables` is commented out as obsolete
(`Abilities.cs:151`) and is genuinely absent, so it is not in the table.
Pinned by `tests/actor-abilities.test.ts` (31 cases), which asserts the exact
granted set for every actor.

**The lesson is the §1.1f one, third occurrence:** a loop cannot express a
table. Here the defaults are `false`, which is the worst case — an ability that
was never granted is indistinguishable from one that was deliberately withheld.
*When the original is a long literal table, port the table.*

### 1.1e The actor data table was bound by position, not by ID (2026-09-27)

Found by deliberately re-running the audit that produced §1.1d: *where else has
a per-entity C# table been replaced by something that cannot express it?*

`GameActors` read `dataArr[i]` and stored it at `ActorID[i]`, assuming row *n*
is model *n*. That holds for `Actors.csv` rows 0–17 and then breaks, because the
CSV lists **`FERAL_DOG` last (row 26)** while the enum has it at **18**.

| # | Bug | C# reference | Impact |
|---|-----|--------------|--------|
| 42 | **9 of 27 actor models read the wrong CSV row.** Rows 18–25 are rotated by one against the enum. | `GameActors.cs:1017-1056` — 27 explicit `GetDataFromCSVTable(ui, table, IDs.X)` calls, each resolving its row through `FindLineForModel`, which matches the ID *string* | The **Sewers Thing**, a unique boss, spawned with **30 HP instead of 400** and STA 60 instead of 99 — it dies in one or two hits. **Jason Myers** had the feral dog's **15 HP**. **BlackOps soldiers** spawned with the boss's **400 HP**, STA 99 and speed 33. |
| 43 | Every `name`/`plural`/`flavor` from CHAR guard onward was off by one | as above | Police-station guards are called "national guard", the national guard "biker", bikers "policeman", cops "gangsta", gangstas "blackOp", BlackOps "Sewers Thing", the sewers thing "Serial Killer", Jason Myers "feral dog", the feral dog "CHAR guard". Cops kept the `"Cop "` name prefix, so it read "Cop gangsta". |
| 44 | Every `scoreValue` from CHAR guard onward was off by one | as above | Killing a cop scored **60**; a biker, the national guard and a CHAR guard scored **0**. |
| 45 | The six unique weapons lost `IsProper` **and** `IsUnbreakable` | `GameItems.cs:826-828, 956-957, 968-969, 980-981, 1072-1073, 1083-1084` | The Big Bear bat, Famu Fataru katana, Roguedjack keyboard, Jason Myers axe, Santaman shotgun and Hans von Hanz pistol all roll `MELEE_WEAPON_BREAK_CHANCE` on every landed hit and are **lost forever** — the reward for four unique NPCs evaporates. |
| 46 | `ItemLightModel` lost its constructor's `DontAutoEquip = true` | `ItemLightModel.cs:42` | Picking up a flashlight **auto-equips it** and silently swaps out whatever was in your left hand. |
| 47 | The subway badge lost `DontAutoEquip` + `EquipmentPart = LEFT_HAND`, and gained a name and flavour text the C# does not have | `GameItems.cs:1403-1408` | It became permanently **unequippable** (`isEquipable` derives from `equipmentPart`). |
| 48 | The feral dog's unarmed verb was `punch` | `GameActors.cs:939` — every living uses `VERB_PUNCH` *except* the dog, which bites | Text-only, and unreachable while dogs are disabled, but live the moment they are not. |
| 49 | `DollBody.isMale` was `false` for the three female undead | `GameActors.cs:408, 456, 506` pass `true`; `DollBody(false, …)` appears **once** in the file, for `FEMALE_CIVILIAN` (`:695`) | Three female zombies got male first names and he/him pronouns. |
| 50 | The last positional loop: medicine bound `medImages[i]`, `medPlural[i]`, `MEDICINE_BANDAGES + i` | `GameItems.cs:699-747` | Correct today, one CSV reorder from being bug 42 again. Now keyed by ID. |

**Why 42 survived so long.** The per-model `Abilities()` and
`defaultControllerCtor` tables *are* keyed by ID and were correct, so a
BlackOps soldier with 400 HP was played by `SoldierAI` with the BlackOps ability
set, drawn with the BlackOps sprite and doll. Everything *except* the numbers
was right, which is exactly what a data-binding bug looks like.

**Second instance of the same upstream data defect.** `Actors.csv` row 0 is
labelled `_FIRST` where the enum has `UNDEAD_SKELETON`, so the C# would throw
`actor UNDEAD_SKELETON not found` — the same fault as `Skills.csv`'s
`_FIRST_LIVING` (§1.1c). The port's `byId` lookup aliases `_FIRST`, and
`Skills.load()` matches on `NAME` instead. **Two of the sixteen data files carry
this sentinel; the pattern is in whatever generates them, not in any one file.**

Pinned by `tests/model-data-binding.test.ts` (43 cases), which asserts every
actor against its own row and includes a test that *fails if `Actors.csv` is
ever put into enum order* — the signal to simplify the lookup. It was confirmed
to produce 11 failures when the positional binding is restored.

### 1.1f Six more fidelity bugs, from a sweep of the four unaudited tables (2026-09-27)

§1.5 items 3–5 kept closing individual tables. This sweeps the ones no audit had
touched: **the tile model table, the doll system, the `Rules` constants, and the
item model class hierarchy**. Four subsystems, ~3 000 lines of C# read line by
line against the port. **One consequential finding (51), four smaller ones
(52–55), one cosmetic naming gap (56)** — and, more usefully, a short list of what
is now proven clean (§1.1g), so it is not re-audited.

| # | Bug | C# reference | Impact |
|---|-----|--------------|--------|
| 51 | `Rules.weather` is a port-only fallback field, **never assigned**, and `GameplaySensors.sense` calls `computeFOVFor(actor)` / `actorFOV(actor)` without the weather argument the C# threads through. The field's own comment claims "set by Session each turn"; nothing sets it. | `LOSSensor.cs:64-65` passes `game.Session.World.Weather` explicitly. C# has no such field at all. | **The most consequential of the six.** `weatherFovPenalty` returns `FOV_PENALTY_RAIN` (1) / `FOV_PENALTY_HEAVY_RAIN` (2) only for rain, and `this.weather` is permanently `CLEAR`, so **every AI actor sees 1–2 tiles further than the C# in rain**. The *player's* view is correct (`RogueGame` passes the weather explicitly), so the game is internally asymmetric and the fault is invisible from the player's side. |
| 52 | The trade screen calls `HimOrHer(npc)` where the C# calls `HisOrHer(npc)` | `RogueGame.cs:7459` ↔ `RogueGame.ts:5813` | `HisOrHer` returns "his"/"her", `HimOrHer` returns "him"/"her". Both helpers exist in the port and are individually correct — the wrong one is called. A **male** trusted-leader NPC reads *"You are him trusted leader, will accept all trades."* Female NPCs are unaffected, which is what made it survive. All 13 other gender-helper call sites match. |
| 53 | `DRK_GRAY1 = Color.DarkGray`; the C# is `Color.DimGray` (105,105,105) vs `DarkGray` (64,64,64) | `GameTiles.cs:47` | Minimap only. `WALL_BRICK` (12) and `WALL_STONE` (17) render ~40% too dark. The C# declares `DRK_GRAY1 = DimGray` and `DRK_GRAY2 = DarkGray` back to back, and the port took the *second* name's value. `Color.DimGray` exists in `Color.ts:53` and is used correctly elsewhere in the port, so this is provably a slip. |
| 54 | `WALL_POLICE_STATION` minimap colour is `Color.Cyan`; the C# is `Color.CadetBlue` (95,158,160) | `GameTiles.cs:123` | Minimap only, and worse than it looks: `WALL_POLICE_STATION`, `WALL_STONE` and `WALL_SUBWAY` all render `TILE_WALL_STONE` and are distinguished on the minimap **purely by colour** (§6.4 notes the shared sprite). The C# chose a muted slate; pure aqua makes police-station walls read as a different material. `Color.CadetBlue` exists at `Color.ts:72`. |
| 55 | `LIT_BROWN = Color.Brown`; the C# is `Color.BurlyWood` (222,184,135) | `GameTiles.cs:53` | Minimap only. `FLOOR_PLANKS` (5) renders saturated red instead of pale tan, and collides visually with `WALL_CHAR_OFFICE`'s `DRK_RED (128,0,0)`. This is the one finding with a structural excuse — **`BurlyWood` does not exist in `Color.ts` at all** — but unlike the other two it is not merely a wrong existing name, so it needs the constant *added*. Undocumented in the port and in this file. |

Plus one cosmetic naming gap, recorded for completeness rather than as a defect:

| # | Gap | C# reference | Impact |
|---|-----|--------------|--------|
| 56 | `DollPart._FIRST` is absent from the TS enum; `BaseTownGenerator` loops from `RIGHT_HAND` instead | `Doll.cs:14-16`, `BaseTownGenerator.cs:5605` | **None.** `_FIRST` and `RIGHT_HAND` are both 1, so the loop bound and the 8 copied slots are identical. The only difference is the missing name. |

**Two more from the item-model sweep, both latent rather than active.** The
hierarchy came back with **0 HIGH and 0 MED** — in particular the critical ammo
initialisation is correct (`ItemRangedWeapon` sets `ammo = model.maxAmmo`, so a
fresh gun starts loaded, §1.1c bug 23) and all three `DontAutoEquip` flags are
ported. Two worth writing down:

- **`IsTool` uses `> 0` where the C# uses `!= 0`** (`ItemMeleeWeaponModel.cs:18`
  ↔ `ItemWeapon.ts:46`). The two differ only for a *negative* tool bonus, and
  every shipped value is non-negative, so `IsTool` agrees on all 16 melee weapons
  today. Latent.
- **`OptimizeBeforeSaving` was never ported** — the C# `Item.OptimizeBeforeSaving`
  virtual (`Item.cs:111`) is overridden by `ItemEntertainment` to prune dead actors
  from `m_BoringFor` and by `ItemTrap` to null a dead owner. The TS base `Item` has
  no such method and `grep` finds zero occurrences. Mostly inert, because the TS
  save path is `JSON.stringify` rather than the C# binary serialiser, and
  `ItemTrap`'s self-cleaning `owner` getter was ported. The one reachable
  consequence: in C# a revived actor *forgets* a boring item (the C# comment says so
  explicitly), where the TS keeps them in `boringForList` and `isBoringFor` keeps
  returning `true`.

**The pattern, fourth occurrence.** Bugs 53–55 are three wrong colour constants
in a table of nineteen, and 51 is a default value silently standing in for a
parameter the C# threads explicitly. Both are §1.1c's shape: *the port substitutes
a plausible-looking default for something the original computes or supplies, and
a default produces no error.* The tile table is small, entirely declarative, and
was assumed safe because nothing crashes when it is wrong — which is exactly the
assumption that let three of nineteen entries drift.

### 1.1g What that sweep proved clean — do not re-audit

Recorded because a clean result is a result, and because §1.5 item 4's lesson was
that a pattern match is a hypothesis generator rather than a verdict.

| Subsystem | Verified |
|---|---|
| **Tile models** (`GameTiles`, 19 entries) | All 19 ids present in both, **numeric values identical**. All **38 `isWalkable`/`isTransparent` booleans exact** — the highest-consequence check here, and clean. All 17 image ids map to the same constant. `isRoadModel`, the `Models.tiles` binding, and the `TileFlags` bit values all match. |
| **`Rules` constants** (166 active) | **166 in C#, 166 in TS, identical names, values and declaration order.** Name-set diff empty both directions. The only value diffs are trailing-zero float formatting. The three int-division expressions (`SLEEP_COUCH_SLEEPING_REGEN`, `TRUST_MISC_GIFT_INCREASE`, `INFECTION_EFFECT_TRIGGER_CHANCE_1000`) all evaluate identically. No port-invented constants. |
| **Item model hierarchy** (37 classes) | 0 HIGH, 0 MED. `ItemModel`'s 13 fields all present; every subclass ctor sets what the C# sets; all `EquipmentPart` assignments (47 in C#) reproduced. |
| **Doll system** | `isMale` correct for all 27 actors, including the three female undead that the C# passes `true` for (the single `DollBody(false, …)` is `FEMALE_CIVILIAN` only). All 9 dressing helpers match layer for layer, including the deliberate gaps (bikers and CHAR guards have no torso; BlackOps is skin+eyes+suit only) and the two-decoration `HEAD` ordering in police/gangsta. All 54 per-actor decoration call sites 1:1. Doll render order matches, **including the doubled `TORSO` draw the C# has** (`RogueGame.cs:18525`) and the same doubling in `DrawCorpse`. |
| **Factions** | `Faction` class exact. All **63 enemy relations** identical and in the same order, with the same symmetry-check pass. All 8 `LeadOnlyBySameFaction` flags and the `Rules` consumer match. |
| **MapObjects** | `DoorWindow.BASE_HITPOINTS = 40`, all three `STATE_*`, and the derived fortification values match. |

### 1.1h Six bugs: a `RuleResult` tested as a boolean, and two livelocks (2026-09-27)

Found by re-running the sim sweep after §1.1e, which is the procedure that has
now paid for itself four times. A different failure shape from §1.1c–e: not a
table replaced by a loop, but a **C# overload that does not exist in the port**.

| # | Bug | C# reference | Impact |
|---|-----|--------------|--------|
| 57 | `SpawnActorOnMapBorder` tested `isWalkableFor(...)` for truthiness | C# has a `bool IsWalkableFor(actor, map, x, y)` overload (`Rules.cs:1241`); the port has only the `RuleResult` form, and `!object` is always `false` | The walkability check was **dead**. Spawns landed on occupied tiles and threw from `Map.placeActor` — *"another actor already at position"*, the exact string `Map.cs:488` raises — **ending the run mid-invasion**. |
| 58 | `SpawnActorNear` — identical dead check | as above | Same, for the near-a-point spawner. |
| 59 | `canActorRun` tested as a boolean, twice | `RogueGame.cs:18630`, `:19232` | The "can't run" icon **never drew**, and the HUD showed "can run" in place of "TIRED" even when the actor was too tired to run. |
| 60 | `canActorInitiateTradeWith` tested as a boolean | `RogueGame.cs` HUD trade icon | The "can trade" icon showed for **every** actor regardless of whether a trade was possible. |
| 61 | `DoLeaveMap` returned early on a blocked exit **without spending action points** | `RogueGame.cs:13159-13179` returns bare, as the port did | **Livelock, and it hangs the test suite.** A player skips the `!actor.isPlayer` AP spend, so nothing was consumed, `canActorUseExit` passed again next turn, and a **bot** re-picked the same doomed exit forever. Seed 8 spun on turn 94 emitting `ActionUseExit` until killed. |
| 62 | `rateItemExhange` threw on an unhandled item type | `BaseAI.cs:5001-5002` throws the identical string | **Crash.** `RateItem` only rates a tracker JUNK when it is flat or the actor already owns a working one, so a civilian who does *not* own a tracker and is offered one walks into it. The run dies mid-trade. |

**The type-system escape.** Nothing warns about 57–60. `!ruleResultObject` is
valid TypeScript, the method is named `isWalkableFor`, the guard reads like a
perfectly ordinary check, and the C# it was translated from returns `bool` from
a *different overload* of the same method. The compiler cannot see across that.
Now pinned by `tests/rule-result-usage.test.ts`, which parses `Rules.ts` for the
44 `RuleResult`-returning methods and fails on any call site not followed by
`.ok`, naming file and line.

**61 and 62 are deliberate divergences from the C#**, both of which the plan had
recorded as "faithful, needs a decision" (§1.2a). A crash and a hang are not
behaviour worth preserving. For 61 the fix is the idiom the C# already uses
twenty lines earlier, where a failed `TryActorLeaveTile` does
`SpendActorActionPoints(...); return false;` under the comment *"waste ap"* — the
blocked-spot case simply forgot it. For 62 the JUNK gates have already rejected
the clearly-worse cases, so there is no comparison left to make and `MAYBE`
("acceptable, let the human decide") is the honest answer.

**Two new guards, because a hang is invisible.** A crash throws and the suite
goes red; a hang eats the CI timeout and locally just looks like a slow day.
`tests/headless-no-hang.test.ts` runs the seeds that actually hung or died
during the sweep under a wall-clock deadline, and reports which seed stalled.
Confirmed it fails by name — `seed 8 did not finish within 60000ms` — when the
AP spend is removed again.

### 1.1i Two bugs from playing the build that ships the fixes above (2026-09-27)

Both found by playing the browser build, and both are the §1.1b shape: a
C#-fidelity divergence that no test could see, because one needs a mouse and the
other needs a save file.

| # | Bug | C# reference | Impact |
|---|-----|--------------|--------|
| 63 | `UI_PeekMouseButtons` was a pure peek; the C# **consumes** it (`m_HasMouseButtons = false` before returning), and `WaitKeyOrMouse` uses a non-null answer as an *event* | `RogueForm.cs:281` | **Freeze.** The play loop re-enters the input wait on every pass while the cursor is over the map (`HandleMouseLook` answers "still looking"), so a held button made the wait return immediately and forever: the game redrew as fast as the CPU allowed, with the keyboard never getting a turn. The button need not be genuinely held — press, drag out of the window, release there, move back, and the document sees the mousedown and never the mouseup. Measured: 1200+ redraws in half a second, never stopping. Same class as bug 12, four commits apart, on the sibling method. |
| 64 | A save with no world reported a **successful** load, and `LoadGame` then dereferenced `session.currentMap` — null, because `Session.save` writes scalars only (`TODO(phase 4)`) | `Session.SaveBin` serialises the whole graph, so the C# cannot reach this state | **Load kills the game.** The TypeError was thrown inside `void this.LoadGame(...).then(...)` with no `.catch`: no "LOADING FAILED" message, an unhandled rejection, `StopSimThread` already called and `StartSimThread` never reached. Reachable with Shift+L. Worse, `Session.load` called `reset()` *before* validating, so even a refused load wiped the world the player was standing in. |

Both fixes are three-layered, because each had a single obvious fix that was not
the whole story:

- **63** — both UIs consume the button as C# does; `mouseleave` clears a release
  the document never saw (not `mousemove`, which would cancel a legitimate
  held click); and `WaitKeyOrMouse` delivers a press only when the mask differs
  from the last one it saw, tracked on the *game* rather than per call. The
  per-call version was tried first and still spun, because the loop re-enters the
  wait and the click was therefore re-delivered on every entry.
- **64** — `Session.load` refuses a save with no world, and decides that *before*
  `reset()`; the `catch` no longer nulls the session singleton (safe at startup
  in C#, a split-brain risk mid-game in a browser); `RefreshPlayer` treats a null
  map as "no player to find"; `DoLoadGame` reports the failure and restarts the
  sim thread in `finally`. Load is now **honest rather than working**: it says it
  cannot restore the save and the player keeps playing. The guard tests for the
  *data*, not a version string, so it lifts by itself when the graph lands.

**Item 6 is therefore partly closed, and the lesson is §1.1g's:** a missing call
is not cosmetic. `Session.save` looked complete — it wrote a save file, and the
roundtrip test in `tests/persistence.test.ts` was green — while every save it
produced was unrestorable. What the tests around it actually pinned was that the
scalars round-tripped, not that a game could be restored.

**Also closed here:** the two latent items §1.1f recorded rather than fixed. The
save graph's machinery and its coverage ledger are in
`engine/serialization/SessionGraph.ts`; `IsTool` now uses `!== 0` where C# does
(`ItemMeleeWeaponModel.cs:18`) rather than `> 0`, which differed only for a
negative tool bonus and would have stayed latent until a penalised item existed.

### 1.2 The harness now runs real games

Runs are reproducible (`--seed`, §1.4) and the map no longer corrupts itself
(§1.1 bug 10).

> **This baseline was invalidated by §1.1c and has been re-measured.** The
> figures previously recorded here were taken against a build with 18 live data
> bugs, one of which (`maxAmmo: undefined`, bug 23) meant **no living NPC could
> ever fire a ranged weapon**. Restoring it changed the dynamics completely, so
> the old numbers are gone rather than kept: comparing against them is
> meaningless.

Re-measured 2026-09-27 at 1×1 / 900 turns / `--undead`, seeds 1–12, after the
§1.1h fixes. **No crashes and no hangs across all twelve.**

```
seed  1  turns    6  dead (-11 hp)      seed  7  turns   11  dead (-11 hp)
seed  2  turns  900  alive (43 hp)      seed  8  turns  900  alive (60 hp)
seed  3  turns  111  dead ( -2 hp)      seed  9  turns   19  dead ( -1 hp)
seed  4  turns   49  dead ( -5 hp)      seed 10  turns   11  dead ( -1 hp)
seed  5  turns   60  dead (  0 hp)      seed 11  turns   69  dead ( -4 hp)
seed  6  turns   14  dead ( -1 hp)      seed 12  turns   46  dead ( -4 hp)
```

**Ten of twelve undead bots now die, and that is the §1.1c fix working.** The
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

### 1.2a Four things that look like bugs but are not

Do not re-investigate these:

- **~~Players die at full HP around turn ~100 when run as a survivor.~~ No longer
  true, and the old explanation was a symptom of §1.1c bug 16.** The bot used to
  exhaust "its 100 food points" because the meter really was capped at 100. It
  is 1 440 now, and a survivor bot reaches turn 400+ alive. The 1 000-turn
  survivor runs still do not complete, but the cause is combat, not starvation —
  which is what §1.2 now shows.
- **`hitPoints` can go negative** (seed 3 ends at −20). C# `InflictDamage` also
  does `HitPoints -= dmg` with no clamp, so this is faithful.
- **`SpawnActorOnMapBorder` can throw `another actor already at position`**
  (seed 2 above, and any survivor run past turn 720). **Faithful**: C#
  `Map.PlaceActorAt` throws `InvalidOperationException` with that exact string
  (`Map.cs:488`), and the port's spawner calls it with the same unguarded
  retry loop as `RogueGame.cs:4987`. The chosen border tile can already be
  occupied because `isWalkableFor` does not exclude tiles holding an actor. This
  is a genuine upstream bug that the port reproduces. It was unreachable while
  every run died of starvation first; fixing it would be a deliberate divergence
  from the original, so it needs a decision rather than a drive-by fix.


One real but unrelated divergence was open here and is now **fixed** — see
§1.5 item 5. It was wider than it looked: the C# puts an `m_IsInvincible` guard
in **six** property setters, not one, and the guard is not uniform. Five block
a *decrease* (`HitPoints`, `StaminaPoints`, `FoodPoints`, `SleepPoints`,
`Sanity` — `Actor.cs:240,257,274,291,308`); `Infection` is inverted and blocks
an *increase* (`Actor.cs:465`), so curing an invincible actor still works. All
six were plain public fields in the port, so the guard was absent on every one.

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

### 1.4b The world behind the player stopped running (2026-09-27)

Not a crash and not a wrong number — a **performance** divergence that only
shows up while playing, which is why §1.5 item 1 is the highest-value activity on
this list.

The C# ran `SimulateNearbyDistricts` on a real thread every 10 ms
(`SimThreadProc`, `RogueGame.cs:21550`), with the mutex that would have
serialised it against the player's turn commented out as obsolete. So the
original kept neighbouring districts continuously current, and entering one cost
nothing. The port has no thread: `StartSimThread` / `SimThreadProc` are empty
bodies. The same catch-up runs inline from `advancePlayDistrict`, but **only
while the player is sleeping**.

Measured on a 1×1 world: after 60 turns of normal play the neighbours were **60
turns behind**, and paying the whole deficit on entry cost **274 ms** in one
blocking burst — rising with how long the game has been running, since the
deficit accumulates.

**A Worker is the wrong answer, not a missing one.** `World` / `Session` /
`Scoring` are shared mutable state; that is precisely why the C# needed a lock
and then abandoned it. So the fix spends the *player's* idle time instead of a
second core: a turn-based game is most idle exactly when its player is
thinking, and that slack is free. The catch-up runs inside `WaitKeyOrMouse`,
one turn of the **most-behind** neighbour per poll (~22 ms), instead of
`SimulateNearbyDistricts`'s all-at-once 274 ms. Most-behind rather than
round-robin so it converges evenly; one district rather than all of them so
preemption stays at a turn boundary.

The choices worth not relitigating:

- **Mouse movement is not activity.** A player reading the map moves the cursor
  over it constantly, and counting that would starve the catch-up during exactly
  the thinking time it exists to fill. Only key presses and mouse *buttons*
  reset the clock.
- **The delay is 1 s** (`idleSimDelayMs`, a field rather than a `GameOptions`
  entry, like `botDelayMs` — the C# had a thread with a 10 ms sleep, not a
  setting, so there is no original to name an option after).
- **It is gated on `s_Options.isSimON`**, the same gate the sleep-path catch-up
  uses. A district simulation the player has switched off stays off.
- **Reproducibility is intact by construction, not by luck.** The headless
  simulator is never idle — `NullRogueUI.UI_PeekKey` always hands back a
  synthesised key, so the wait returns immediately and the branch is never
  reached. `tests/integration/reproducibility.test.ts` enforces it.
- **Preemption can only happen at a turn boundary** (~22 ms). A keypress
  arriving mid-turn waits for that turn to finish, and only while the player is
  idle, which is the only time any of this runs.

**A background turn must never take a keypress.** `AddMessagePressEnter` is
background-reachable through `ShowNewAchievement`, which awards achievements for
activity anywhere in the world and then blocks on ENTER without checking that
the player is present. On the C# sim thread that was harmless — nobody was typing
into it — but here the catch-up runs *inside the input wait*, so an achievement
earned two districts away would swallow the keypress the player was about to
make and drop a `<press ENTER>` into their log. It now returns early while a
background turn runs, leaving the informative message the caller already added.
Every other input-blocking helper needed no guard: they are all player-only
flows, or they gate on `IsVisibleToPlayer`, which is false for every actor in a
district being caught up.

Pinned by `tests/idle-district-sim.test.ts` (8 cases), including the two that
matter most: that the catch-up converges *exactly* (no overshoot, no spin) and
stops, and that mouse movement does not reset the clock.

**Lesson: the headless sim cannot find this class of bug at all.** It never
idles, and the burst it would have hit only happens on district entry. The
measurement that found it was 60 player turns and a stopwatch, not a test.

### 1.5 Next steps

**Open work, in priority order.** Struck-through items are closed and kept below
the list rather than deleted — each carries a measurement or a decision that is
expensive to re-derive.

0. ~~**Fix the minimap reveal bug** (§1.4a).~~ **Done 2026-09-27** — see
   §1.1b bug 11. It turned out to be the whole in-game map, not just the minimap.
0b. ~~**Audit the CSV → JSON data layer.**~~ **Done 2026-09-27** — see §1.1c,
   18 bugs across five layers, and two new suites that pin the layer shut. It
   left **three open decisions**, now item 7 below.
1. **Play the game, don't just sim it.** This is now the highest-value activity
   and it is the step that was skipped: all five bugs in §1.1b were found by
   opening a browser, and the sim found none of them because they were all
   *presentation-layer* faults the headless UI deliberately drops. If you make a
   rendering change, open the game and look at it. The corollary is the reverse
   of the old lesson: *the sim is the definition of done for the engine; the
   browser is the definition of done for the renderer.* Neither substitutes for
   the other, and both were green while the game was unplayable.
   **The §1.1c data bugs make the same point a third way:** the sim is blind to
   *content* faults too, because an `undefined` stat still produces valid
   engine behaviour. Only the browser shows a player standing at 100/100 food.
2. **Keep running the sim to failure and fix what it finds.**
   `for s in 1 2 3 4 5; do npm run sim -- --size 3 --turns 1000 --seed $s --undead; done`
   Watch for hangs, not just crashes — a turn that never returns is usually a
   blocking `UI_Wait*`.
   **The premise of this item has changed twice.** It originally read "now that
   the map stops corrupting itself, 1 000-turn runs are reachable" — which was
   true, and then stopped being true when §1.1c restored `maxAmmo` and every
   survivor started shooting the undead bot (§1.2). No seed now reaches 1 000
   turns: the undead bot dies to ranged fire, and long survivor runs hit the
   `SpawnActorOnMapBorder` throw (§1.2a). Both are faithful behaviour on a
   correct build. The item survives because sweeping seeds still finds crashes —
   it is the crash-hunt, not the turn count, that is worth repeating.
3. ~~**Write the AI behaviour and generator integrity tests.**~~ **Both done
   2026-09-27** — `tests/generator-integrity.test.ts` (7 cases) and
   `tests/ai-behaviour.test.ts` (14 cases). §4.3 items 2 and 3 are now closed,
   which was the last test work on the Phase 8 list.
   The generator suite asserts the invariants that hold unconditionally — no
   actor on a wall or out of bounds, no map object out of bounds, every map has
   a passable tile, the player starts passable and inside their map's largest
   region — and one calibrated threshold: a surface district's largest
   connected region must cover ≥60% of its passable tiles.

   **The threshold is measured, not guessed, and the measurement is the
   interesting part.** A six-seed sweep (1, 7, 42, 99, 4242, 12345; 54 surface
   districts) found the real range is **75.6%–100%**, with a stable 300–415
   orphan tiles per district. Those orphans are building interiors the
   generator gives no doorway to. That is a characteristic of the ported
   generator, consistent across every seed, so asserting 100% would be
   asserting the original has no unreachable rooms — not established, and not
   the point. 60% sits well under the observed floor, so it fires on a
   regression that seals a district rather than on the status quo.

   Seed 42 is pinned because it measured the *worst* district (75.6%), so the
   test runs against a hard world rather than a lucky one. There is no
   equivalent check anywhere in `src/` (grepped for reachability / flood /
   integrity: nothing), so this is new coverage, not a port.
4. ~~**Audit the remaining AI files for bug 3.**~~ **Done 2026-09-27** — 43
   `percepted as Actor` sites across the 11 AI controllers, all downstream of
   the filters in `BaseAI`, so securing the filters secures them. **The honest
   result: no live bug.** Four sites had the bug-3 shape (`if (other && ...)`,
   where a MapObject percept is truthy and the C# relies on `as` yielding
   null), and all four turn out to be currently harmless:
   - `filterEnemies` — `areEnemies(actor, mapObject)` returns false rather than
     throwing, because `Faction.isEnemyOf` does `enemyList.includes(undefined)`.
   - `filterActorsModel` — a non-Actor has no `.model`; breaks only if
     `MapObject` ever grows one.
   - `filterStrongestScent` — the closest to real: on the first iteration
     `pBest === null` short-circuits the strength compare, so a truthy
     non-scent was *returned* rather than dropped. Unreachable, since the only
     caller passes `SmellSensor.scents` (which is why the C# throws instead).
   - `CivilianAI`'s inline `isSoldier` predicate — the one site fed the **raw**
     `mapPercepts`, so a MapObject really does arrive; but `isSoldier` guards
     internally.

   All four are now explicit `instanceof` checks, matching the C# line for line,
   and pinned by `tests/ai-percept-filters.test.ts` (9 cases) as a
   *characterisation* suite: it locks the current behaviour so a future change
   to `areEnemies`, `isSoldier` or `MapObject` cannot turn a harmless
   truthiness check into a live one. **Lesson worth keeping: the pattern match
   found four instances and the behaviour check cleared all four. A grep is a
   hypothesis generator, not a verdict.**
5. ~~**Restore C#'s `isInvincible` guard.**~~ **Done 2026-09-27.** Wider than
   §1.2a claimed: **six** properties, not four, and the guard is not uniform.
   Five block a *decrease* (`HitPoints`, `StaminaPoints`, `FoodPoints`,
   `SleepPoints`, `Sanity` — `Actor.cs:240,257,274,291,308`); `Infection` is
   inverted and blocks an *increase* (`Actor.cs:465`), so curing an invincible
   actor still works. All six were plain public fields. Now getter/setter pairs
   with backing `_`-fields; the external syntax is unchanged, so no call site
   moved. Pinned by `tests/actor-invincible.test.ts` (21 cases), including a
   check that no own instance field shadows the prototype accessor — with
   `useDefineForClassFields: true` that would silently reintroduce the bug.
 6. **Fix the six §1.1f bugs.** They are small and mostly one-liners, but bug 51
    is not cosmetic: the rain FOV penalty never reaches any AI actor, and because
    the player's own view is correct the game looks self-consistent while every
    NPC sees 1–2 tiles too far. Bugs 53–55 are three wrong colour constants and
    need `Color.BurlyWood` **added** to `Color.ts` (it does not exist).
    §1.1g lists what is now proven clean, so this is the whole remaining
    fidelity surface in those four tables.
6. **Serialise the world/map graph in `Session.save`** — the `TODO(phase 4)`
   at `Session.ts:324` blocks any true save/load roundtrip test, and is why
   §4.3 item 4 is only a partial pass.
7. ~~**The three open decisions.**~~ **All three resolved 2026-09-27**, and none
   of them needed a ruling — see the `src/` rule at the top of this file.
   - **`Skills.csv` cannot be loaded by the C# at all** (§1.1c). The port
     works around it by matching on `NAME`. The workaround **stays** and `src/`
     is not corrected: the file is the reference, and the defect is upstream.
   - **`Skills.maxSkillLevel` is a port invention** — **this was wrong.** The C#
     has `Skills.MaxSkillLevel(IDs)` at `src/Gameplay/Skills.cs:170`, with
     *identical* logic (HAULER → 3, everything else → 5). The port is faithful;
     the three consumers and the two "5 max" UI strings are all correct. No
     change needed, and the plan was wrong about it.
   - **`SpawnActorOnMapBorder` throws on an occupied tile** (§1.2a). **Fixed in
     the port** (2026-09-27): both spawners now reject an occupied tile and try
     the next candidate, instead of letting `Map.placeActor` throw
     "another actor already at position" and end the run. `isWalkableFor` tests
     the tile *model*, not occupancy — that is the whole gap. Pinned by
     `tests/spawn-occupancy.test.ts`, which fills a map completely so every
     candidate is rejected, plus a control that a free tile still spawns.
8. Then work down the rest of the Phase 8 task list in §4. **Of tasks 9–12 only
   12 remains** — 9 (sprites), 10 (audio) and 11 (frame cost) are done, so this
   item is now just "task 12, if it is ever wanted", scoped in §6.1.

**Open items 2–7 all require reading `src/`.** See the warning at the top of
this file before considering its removal. (Item 1 does not — it needs a browser.)

**Watch the coverage margins.** They were raised well clear of their thresholds
(measured 65.15 / 80.49 / 73.21 / 65.15 against 50 / 75 / 57 / 50), so `verify`
will not trip on coverage for a while — but the baseline moves every time a
large unaudited area becomes reachable. Re-measure and re-set these together
rather than letting `verify` fail on them, or lowering them to hide it.

#### Closed items, kept for what they record

| Item | Closed | What is worth keeping |
|---|---|---|
| 0 — minimap reveal | 2026-09-27 | It was the whole in-game map, not the minimap. §1.4a keeps the *wrong* diagnosis too. |
| 0b — CSV → JSON data audit | 2026-09-27 | 18 bugs, §1.1c. Left three open decisions (now item 7) and found two upstream data defects. |
| 3 — AI behaviour + generator integrity tests | 2026-09-27 | The 60% reachability threshold is **measured, not guessed**: a six-seed sweep found 75.6%–100%. Seed 42 is pinned because it measured the worst district. Asserting 100% would assert the original has no unreachable rooms — not established, and not the point. The AI behaviour expectations come from the C# strategy order rather than from reading the port. |
| 4 — `percepted as Actor` audit | 2026-09-27 | 43 sites, **no live bug**. Four had the bug-3 shape and all four are harmless — the detail is in the list above and is the clearest statement in this file that a grep is a hypothesis generator, not a verdict. |
| 5 — `isInvincible` guard | 2026-09-27 | **Six** properties, not one, and the guard is not uniform: five block a decrease, `Infection` blocks an *increase*. `useDefineForClassFields: true` means a stray own field would silently shadow the accessor. |
| §1.4b — the world behind the player stopped running | 2026-09-27 | A **performance** divergence only playing could find: 60 turns of play left the neighbours 60 turns behind, and entering a district cost a 274 ms blocking burst. No Worker — the graph is shared mutable state, which is why the C# needed a lock and then dropped it. The slack is the player's idle time instead. |

### 1.6 Known non-bugs (do not re-investigate)

- ~~**`tests/integration/reproducibility.test.ts` fails on Windows** with
  `spawnSync npx ENOENT`.~~ **Fixed 2026-09-27.** It shelled out to a bare `npx`,
  which resolves only to `npx.ps1` on Windows, and `execFileSync` does not go
  through PowerShell — so the suite's only end-to-end CLI test could not run on a
  developer's own machine, and `npm run verify` halted before its build step. It
  now bundles through `node_modules/esbuild/bin/esbuild` invoked with
  `process.execPath`: a plain Node script, so no shell, no `.cmd` shim and no
  package runner on any platform. **`npm run verify` now completes end to end,
  which it never has before.**
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
- `280430c` — the eighteen §1.1c data-layer bugs, the `convert-csv.js` `COLUMNS`
  table, `Skills.load()`, and the two new data suites. 273 tests pass.
- `423bfad` — the §1.1c documentation pass, including the corrected sim baseline.
- `f629e83` — the `isInvincible` guard on all six Actor point properties
  (§1.5 item 5) and the `percepted as Actor` audit (§1.5 item 4), with
  `actor-invincible.test.ts` and `ai-percept-filters.test.ts`.
- `25b914e` — `generator-integrity.test.ts` (§4.3 item 3).
- `18987a1` — the per-actor abilities fix (§1.1d) and `actor-abilities.test.ts`.
- `5864c4b` — the CSV→model binding fix (§1.1e) and `model-data-binding.test.ts`.
  384 tests pass, 21 files.
- `2a8ee93` — corrected two miscounts in the bug log.
- `b0e4038` — the §1.1f fidelity sweep (bugs 51–56) and the §1.1g clean-bill,
  together with the Neutralino desktop wrapper. The sweep itself was
  documentation-only, so the bug count it changed was 6 newly recorded and then
  fixed in the same commit.
- `fc667e6` — the hover/input freeze, plus the item-pickup coverage that pins
  input mapping at both 1× and 2× display scale.
- `8d7b5dc` — the DPR-correct canvas (integer scaling, pixel-art rendering) and
  the 1×/2× map zoom.
- `652aa26` — a save that cannot be restored now fails loudly instead of killing
  the game (§1.1i bug 64), after `Session.load` was found to reset the world
  *before* validating.
- `825c9f0` — the occupied-tile spawn crash (§1.5 item 7), the `src/` rule that
  decides upstream-vs-port fixes, and the `SessionGraph` serialisation ledger
  that item 6 will build on.
- `447bbdf` — the Windows `verify` halt and the colliding screenshot filenames
  (§1.6).
- `1c27589` — the idle catch-up (§1.4b), and the `AddMessagePressEnter` guard it
  needed. 501 tests, 34 files.

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
| `npm run test` | Vitest, 409 tests |
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
| 8 — Polish, sim, CI | Headless harness, 384 tests, CI, PWA, Docker, asset pass, frame-cost pass | **In progress** — 11 of 12 tasks done; only 12 (optional touch) remains. See §4.1 |

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
| 5 | Vitest + `@vitest/coverage-v8`, `test` / `test:coverage` scripts, coverage thresholds | **Done** — 409 tests, 24 files, thresholds enforced (50/75/57/50) |
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
| `data-tables.test.ts` | Every generated JSON against its source CSV: canonical column names, no key containing a space, and values equal positionally. Catches the whole §1.1c class (45 cases) |
| `skills-data.test.ts` | `Skills.csv` actually reaches the `Rules.SKILL_*` statics, with the right `(int)` truncation, and each of the 7 corrected values differs from the C# default (53 cases) |
| `actor-invincible.test.ts` | C#'s `m_IsInvincible` guard on all six Actor point properties, including that `Infection`'s guard is inverted (21 cases) |
| `ai-percept-filters.test.ts` | The AI percept filters reject non-Actor percepts, and `filterSameMap` still admits them (9 cases, characterisation — see §1.5 item 4) |
| `ai-behaviour.test.ts` | The four §4.3 item-2 behaviours in isolated map scenarios: zombie pursuit by sight, LOS gating, scent aggregation, civilian self-preservation (14 cases) |
| `rule-result-usage.test.ts` | No `RuleResult` is ever tested for truthiness — the bug class behind §1.1h bugs 57-60. Parses `Rules.ts` for the 44 `RuleResult` methods and reports any call site missing `.ok`, by file and line (3 cases) |
| `headless-no-hang.test.ts` | Seeds that hung or died in the sweep finish under a wall-clock deadline, so a livelock fails loudly instead of eating the CI timeout (8 cases) |
| `model-data-binding.test.ts` | Every actor model binds to its own CSV row, unique weapons stay unbreakable, lights do not auto-equip, the badge is holdable. Also fails if `Actors.csv` is ever reordered into enum order (43 cases, §1.1e) |
| `actor-abilities.test.ts` | Every actor's granted ability set, transcribed from the C#; specifically that the player can open doors, and that skeletons/rat zombie do not rot (§1.1d, 31 cases) |
| `generator-integrity.test.ts` | A generated world is sound: no actor on a wall, nothing out of bounds, the player starts passable in the largest region, no surface district sealed. One game per file, seed 42 = the worst world measured (7 cases) |
| `actor-sprites.test.ts` | The whole-body sprite / doll-driven partition for all 27 actors, including that the two lists partition the enum (§1.1b bug 13) |
| `input-handler.test.ts` | `UI_PeekKey` **consumes** the key it returns, matching C# `RogueForm.cs:135` (§1.1b bug 12) |
| `minimap-cache.test.ts` | The `minimapRevision` invalidation contract: no bump without a change, no bump on re-marking, bumps on `markVisited` / `setAllAsUnvisited` / `setTileModelAt`, and a rebuild exactly when `(map, revision)` changes (§4.1d) |
| `map-zoom.test.ts` | Map zoom state, persisted through the `storage` wrapper |
| `headless-zoom.test.ts` | Zoom behaviour under a headless run |
| `canvas-layout.test.ts` | Canvas sizing, scaling and the 1366×768 widescreen layout |

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

### 4.1e Neutralino Desktop Wrapper & AppData Persistence

To support building lightweight native desktop applications (Windows, Linux, macOS) without the resource footprint of Electron, **NeutralinoJS** has been integrated:

- **Configuration (`neutralino.config.json`)**: Configured with `applicationId: "com.roguesurvivor.reloaded"`, targeting `/dist/` as the document root and bundling game assets, sprites, audio files, and JSON data tables into a lightweight native binary using the system's native webview.
- **AppData Persistence (`engine/storage.ts`)**: When running inside Neutralino (`hasNeutralino`), `storage` automatically uses `NeutralinoStorage`. It queries the OS AppData path (`Neutralino.os.getPath('data')`), creates the `rogue-survivor-reloaded/` directory, and persists key-value data (saves, options, keybindings, hiscores) to `storage.json` asynchronously while keeping synchronous memory access for engine performance.
- **Desktop Commands**:
  - `npm run neu:dev` — starts Neutralino in development mode.
  - `npm run build:desktop` (or `npm run neu:build`) — builds the Vite bundle and packages the native desktop application binaries.

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
is the fidelity sweeps in §1.1c–h. What it does prove is the observable
contract, and that is where the wiring bugs actually lived: §1.1 bug 3 was
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
4. **Save/load roundtrip** — ✅ `tests/persistence.test.ts`, for the six persistence modules. Note the gap: `Session` does not serialise the world/map object graph yet (see the `TODO(phase 4)` in `Session.save`), so a full "complex running game" roundtrip is not possible until that lands.
5. **Coverage** — ✅ `@vitest/coverage-v8`, thresholds at 50/75/57/50, set ~1–1.5 points under the measured baseline rather than at an aspirational number. **The baseline is now 65.15/80.49/73.21/65.15** (statements/branches/functions/lines), up from 52.68/77.14/59.97 with §1.1c — the later fidelity sweeps added both a lot of newly-reachable engine code and the suites that cover it. Margins are wide again; re-measure and re-set together when the next large area becomes reachable, rather than letting `verify` fail on them.


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
| 8 | Headless sim, tests, CI, deployment | In progress — 501 tests, CI, PWA, Docker, asset pass and frame-cost pass all in. Only 12 (optional touch) remains; see §1.2 for why 1 000-turn runs no longer complete |

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

Cheaper and higher value than 6.1, and blocked on `src/` (see the warning at the
top). **This list was written before §1.5 items 3–5 and the §1.1f sweep closed
most of it**, so it is now down to two items plus a sweep:

- ~~The AI behaviour and generator integrity tests~~ — generator integrity **done**;
  AI behaviour **open** (§1.5 item 3).
- ~~The `isInvincible` guard~~ — **done**, and it turned out to be six properties
  rather than one (§1.5 item 5).
- ~~The audit for the `percepted as Actor` pattern~~ — **done**, 43 sites, no live
  bug (§1.5 item 4).
- **The six §1.1f bugs** — the last of the four unaudited tables (§1.5 item 6).
- **World/map serialisation** for a true save/load roundtrip (§1.5 item 7). The
  `TODO(phase 4)` in `Session.save` is the blocker, and it is the reason §4.3
  item 4 is only a partial pass.
- **Whatever the next sweep finds.** §1.1g records the surface now proven clean,
  so the next audit should start outside it rather than repeat it.

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

### 6.4 First-person / pseudo-3D view mode

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

**Do not** start by touching the 19.7 KLOC `RogueGame` beyond the two changes
above. The `IRogueUI` seam exists for exactly this; the same advice as §6.1, and
for the same reason.

**And per §1.5 item 1: this is a renderer change, so the browser is the
definition of done, not the sim.** The sim will be green throughout, because
`NullRogueUI` drops every painting call. A raycaster that projects every sprite
off-screen, or picks the wrong wall face, is invisible to `npm test` and to
`npm run sim` — both will pass on a completely broken renderer. Profile with
`npm run profile`, then open the game and look at it.

### 6.5 Housekeeping

- `tests/integration/reproducibility.test.ts` cannot run on Windows
  (`execFileSync` cannot spawn `npx.ps1`) — see §1.6. Fix by resolving the
  binary path instead of relying on `npx` being spawnable.
- The `icon.png` in the repo root is unexplained and untracked (§1.6); someone
  should work out what writes it before it becomes a committed mystery.
- The Docker image has never been built locally (§4 task 8); CI exercises it
  first, and that is the first time anyone will know whether it works.
