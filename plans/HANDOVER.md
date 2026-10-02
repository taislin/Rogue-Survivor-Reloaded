# Handover — Still Alive fidelity backlog

Written at `e133b88` on `feature/still-alive-ruleset`. **Not pushed.** Baseline at that
commit: **138 files / 2,955 tests passing, `tsc` clean.**

Start here, then §"Where things stand".

## The one-paragraph version

All four of the original items are now banked: the army base, ten of sixteen distance-tier
sound families, the fork's hunting-shop and bedroom item tables, and the ordinary-office
dispatch. The office dispatch could not be wired on its own — it turned out to be blocked
on the business region being handed the wrong pool of blocks — and fixing *that* was a
larger job than the dispatch it unblocked. Both are done, with measurements in §"The
business region: merged". The re-merge exposed two further gaps, one of them real and
still open: §"What the re-merge uncovered". The pattern that explains almost every failure
in this backlog is recorded in §"The recurring defect".

## Repo facts

- Branch `feature/still-alive-ruleset`. No commit has been pushed; there are ~14 local
  commits ahead of `4b45c66`.
- Verify with `npx --prefix web tsc --noEmit -p web` and `cd web && npx vitest run`
  (~3 min for the full suite).
- **A full suite run writes ~44 MB of coverage.** The disk filled to 0 bytes mid-session;
  902 MB of npm cache was cleared to recover. Check `df -h /` before a coverage run.

## Where things stand

| item | state |
|---|---|
| Army base | ✅ `96bd511`, `7c22cd5` — code complete, dispatch deliberately not wired |
| Sounds, distance tiers | ✅ `9ec647d`, `8a870a4`, `b2435b2` — 10 of 16 families, 23 of 52 ids |
| Item tables | ✅ `9561a3e` — hunting shop + bedroom, 10 pins re-based |
| **Business-region pool** | ✅ **merged into one C#-shaped loop; office dispatched** |
| Coverage gate | ✅ re-measured on 138 files / 2,955 tests; thresholds 67/55/78/68 |
| **`MakeNarrowPark` housing fallback** | 🔴 **new — blocks too small to house are left bare** |
| Sounds, non-tier | ⏸ ~60 ids untouched |
| Sounds, tier | ⏸ 29 ids — throwables, traps, dog, BFG, fishing |
| Army-base *dispatch* | ⏸ still not wired; a decision about minimum city size |

## The business region: merged

The office dispatch **is** delivered. It could not be delivered on its own, so this
section is both the diagnosis that blocked it and the change that unblocked it.

### What was wrong

The uncommitted work from the previous session was a **dead store**: `else { placed =
this.makeOrdinaryOffice(map, b); }`, with nothing reading `placed` afterwards. The office
was built and then a later pass built a house or a park on the same block.

The reason it could not simply be fixed is that the cascade is offered the **wrong pool of
blocks**. The C# runs *one* loop over `emptyBlocks` at `BaseTownGenerator.cs:472-536`; the
port ran three — a CHAR loop, a library pass over the pool, then a cascade over the pool
again. Two facts only the nesting carries were lost:

- `int rolled = m_DiceRoller.Roll(0, 99)` at `:478` gates the CHAR attempt at
  `rolled < 30 || charOfficesCount == 0` (`:479`), so the business *interior* only runs on
  the ~10% of blocks that entered on `RollChance(CHARBuildingChance)`.
- `completedBlocks.Add(b)` at `:535` is inside that `if`, so an office finishes its block
  exactly as a bar does.

Measured over 40 × 40 general districts (~5.3 blocks each):

| | before | after | C# shape |
|---|---|---|---|
| business blocks / district | 2.8 | **0.4** | 0.5 |
| parks-region districts with a park | 0/40 | **11/40** | — |
| churches / graveyards / farms | 4 / 1 / 0 | **16 / 3 / 5** | — |

The old `if (placed) completedBlocks.push(b)` was *load-bearing*: it was the only thing
letting a block out of the cascade and down to the parks. Wiring the office **and**
completing the block, as `:535` says, gave **Housing 32 → 0, Park 5 → 0, Church 4 → 0, and
`TOWN_BUILDING_PASSES` offered 0 blocks instead of 38** — half the game's block content
deleted by a "fidelity fix".

### What was done

One loop, C#-shaped, at `BaseTownGenerator.generate()`:

- outer gate `BUSINESS || rollChance(charBuildingChance)`;
- `const rolled = cascadeEnabled ? this.m_DiceRoller.roll(0, 99) : 0;` and
  `NoCHARBuildingMade` tracking;
- `if (rolled < 30 || charOfficesCount === 0)` → `makeCHARBuilding`, which `continue`s past
  the interior on success;
- `if (cascadeEnabled && (rolled >= 30 || noCHARBuildingMade))` → library, then the
  `roll(0, 4)` cascade, then the **general store** (`:519-526`, the arm that was missing
  entirely, which needed `makeShopBuilding`'s new nullable `desiredShopType` at `:1436`),
  then `if (!placed) makeOrdinaryOffice`, then `completedBlocks.push(b)` unconditionally;
- `makeLibraryBuildings(map, emptyBlocks)` became `tryMakeLibrary(map, b)`, a per-block
  attempt, because reproducing the C#'s control flow by *pool membership* only works while
  the pool **is** the C#'s pool.

**`rolled` is gated on `cascadeEnabled`, deliberately.** In the C# the `Roll(0, 99)` sits
outside every feature gate, so a faithful transcription spends a die per block under
CLASSIC and moves both pinned Classic digests — invalidating every saved Classic world —
for a region whose four arms are Still Alive only. Under Classic `rolled` is 0, which makes
`rolled < 30` always true and `rolled >= 30` always false, so Classic is byte-identical to
what it was. **Both digests still pass.** Removing the gate is one `?:` if they are ever
re-taken on purpose.

### How rare the interior actually is — read before believing "delivered"

The dispatch is wired and faithful. It is also, at the sizes measured, **nearly inert**,
and that is worth stating plainly rather than letting "office dispatch: done" imply a
building you will see.

Over **300 districts at 50x50** (the reference's own minimum), instrumented at the arm:

    interior entries : 21
    roll2            : bar 8, bank 5, clinic 5, mechanic 3
    store attempts   : 3   (3 succeeded)
    office calls     : 0

Two compounding reasons, both faithful:

- **The interior is entered ~7% of districts.** `:479`'s `|| charOfficesCount == 0`
  forces a CHAR attempt on the district's first business-region block and
  `MakeCHARBuilding` does not decline, so the interior waits for a *second* block with
  `rolled >= 30`. At 100x100 it is far commoner (bar in 16% of districts, clinic in 21%).
- **When it is entered, the general store takes every decline.** `:519` sits before
  `:529`, and it succeeds on any block with a 5x5 inside rect -- which is every block
  the interior is offered. So `roll2 === 3` (the mechanic workshop, **unported**, so an
  empty arm) is the only route to the office, and it needs the store to have been
  capped out first.

So the honest claim is: *the arm is transcribed and reachable, and the reference's own
arithmetic makes it rare.* Whether the reference is really this sparse is **unverified** —
that would need the C# run side by side, which nothing here can do. Treat "the office
rarely appears" as an open question rather than a matched behaviour.

`tests/business-cascade.test.ts` is new and covers the structure the per-arm suites
cannot see: the store arm's `if (!placed)` guard, its `round(floor(width / 10) / 3)`
cap (reached by exactly 3 districts in a 1200-seed sweep at width 100 — seeds 529, 1170,
1187 — so the cap is pinned on those rather than swept), the switch's exclusivity, and
the library being above the switch.

### What it cost

17 failures across 6 files, all re-derived rather than papered over. The instructive part:
**`graveyard`, `church-building`, `junkyard-building` and `helicopter-rescue` started
passing**, because the parks region had been starved and now works. Re-basing seeds to
"fix" those would have destroyed a working generator to satisfy a broken fixture — the
recurring defect, running the other way.

- `library-building` — `makeLibraryBuildings` is no longer a stage, so `LibrarySpy` counts
  attempts instead, and the pool-arithmetic assertion became a map-level one: a library's
  rect carries a `Library@` zone and none of `Bar@`/`Bank@`/`Clinic@`/`GeneralStore@`/
  `Business@`. That holds however the control flow is spelled; the pool version did not.
  Added `LIBRARY_SEED`, swept.
- `animal-shelter` — re-swept. Seeds 24/47 no longer build one; `1..300` finds eleven
  (59, 63, 106, …). The header already said "chosen, not swept for", which was the tell.
- `bank-building`, `clinic-building` — see below.
- `bar-building` — `DISTRICT_SEED` 3 → 8 and `DISTRICT_WIDTH` 40 → 50; new `WIDE_SEED = 28`
  for the 100-wide half of the cap test.
- `fire-station-building` — the fuel-pump assertion scanned the **whole district** rather
  than the fire station's rect, so it failed as soon as a district could contain a fuel
  station *and* a fire station. Scoped to the zone's rect.
- `feature-flags` — the `Library` multiset lost a site (the pass-level gate went away with
  the pass). Regenerated with `scripts/gen-feature-flag-sites.mjs`, never hand-edited.
- **`business-cascade` is new** — the interior had no suite at all before, which is how the
  missing general-store arm survived.

### The 40x40 trap, which cost three suites

**`MAP = 40` in the bank, clinic and bar suites is smaller than any district the reference
can generate.** `districtsSizeFloor` is 50 under Still Alive (Release 7-3 raised
`DistrictSize` from 30 to 50 for the shopping mall). At 40 × 40 the business interior is
*never reached*: `:479`'s `|| charOfficesCount == 0` forces a CHAR attempt on the
district's first business-region block, `MakeCHARBuilding` does not decline, and the
interior wants a second block with `rolled >= 30`. Over 60 seeds: **no bar, no bank and no
clinic at all**, and every content assertion in those three suites was iterating an empty
set and passing vacuously.

Fixed by moving the content assertions to 50 × 50 with swept seeds (`ARM_MAP`, `ARM_SEED`),
and leaving `MAP`/`SEED` alone for the Classic digest tests — that fingerprint is a 40 × 40
seed-1 value seven suites assert. **If a suite here grows a "no X appeared" failure, check
the district size before the seed.**

### What the re-merge uncovered

**`MakeNarrowPark` is ported but never called.** C# `:604-605`, in the housing tail:

```csharp
if (!completed) MakeNarrowPark(map, b);
```

The function exists in `buildings/makeShoppingMall.ts` (for the mall's degenerate quads) as
a module-private. The port's housing loop calls `makeHousingBuilding` unconditionally, so
every block too small to house is **left bare** — no grass, no trees, no zone. The re-merge
made this worse: the pool reaching the tail went from ~2.5 blocks to ~4.9 per district, so
bare blocks went from ~1.4 to ~2.4. Housing itself did not move (0.8/district against the
~4.3 the region's arithmetic predicts) for exactly this reason.

The fix is small — export `makeNarrowPark`, call it — but it spends dice under CLASSIC too,
so it moves both digests. **It is a decision, not a drive-by, and it is the next item.**

Also recorded, both in the same region and neither urgent:

- The port spends **two** `RollChance(ParkBuildingChance)` per block where the C# spends
  one: the parks loop (`generate()`) and the green cascade inside `makeJunkyards` (a
  misleading name — it runs the graveyard/shelter/farm/junkyard arms too). The C# has one
  gate and one `roll(0, 99)` behind it.
- The green cascade has no arm for `rolled >= 64`, which in the C# is the ordinary park
  (35%). The port does it in the *other* pass, on a different die.
- The army base runs **after** the business region; the C# runs it before the shops.

## The recurring defect — read this before fixing any of the above

**A large share of this backlog's test failures are fixtures coupled to a *seed* or a
*sweep width* rather than to the property the test is named for.** Four independent
instances, all found in two days:

1. `graveyard` asserted `newGenerator(100).generate(1)` still made a park. After the item
   retune that district makes **none**, so the control failed while testing nothing about
   graveyards. Fixed by sweeping for a park, as its sibling already swept for a graveyard.
2. `point-identity` parked a follower on a hardcoded `(49, 49)`; `placeActor` throws on an
   occupied tile, and that seed now has an actor there. Fixed by walking the bottom row
   back for a free tile.
3. `generator-integrity`'s tunnel-fragmentation test asserted `components > 1` using a
   `passable` helper that counts closed doors as openable — so it was demanding the player
   be unable to walk everywhere. **The generator was right.** See below.
4. 17 of the office dispatch's 22 — *and every one of the 22 turned out to be downstream
   of the dispatch being wrong*, which is the case where the rule above misleads: the
   seeds were incidental, and re-basing them would have buried the real defect.
5. Three suites (bar, bank, clinic) were **passing vacuously** at a district size the
   reference cannot generate. See §"The 40x40 trap". This is the mirror of #4 and just as
   expensive: a green test asserting nothing is not a test, and re-basing it would have
   kept it that way.

**The rule this suggests:** when a re-base fails, ask whether the assertion is about the
*property* or about a *dice outcome*, and — before assuming it is the dice — ask whether
the *generator* moved for a reason that makes the old answer wrong. Then ask whether the
test was passing at all. Sweeping seeds is the last resort, not the first.

**A corollary worth stating: a test that was green before your change is evidence, not
noise.** When the re-merge broke 17 tests, four suites went *green that had been red for
the right reason*, and nine were fixtures. Sorting them that way took minutes; sorting them
by "re-base whatever is red" would have taken an afternoon and produced a worse port.

## The subway finding (measured, keep it)

The retune broke `Subway@1-1 is a single region`. It was investigated rather than
re-based, and the generator turned out to be **correct**:

    doors as walls:  2 regions (8 maps), 3 (1), 4 (9)   -- never 1
    doors passable:  1 region (8 maps), 2 (10)

Over 18 subways on six seeds. Structurally every subway is 2–4 separate regions; the merge
is **through a door** — the tools room sits flush against the platform with one iron door
between them. Counting a closed door as openable joins them, and that is what a subway
station is. The assertion now counts components with doors as walls, which is what its
comment always claimed to test, plus a separate reachability assertion.

Also established: the retune did **not** cause the failure. Pre-retune **8 of 30** subway
maps were single-region across ten seeds; post-retune **10 of 30**. Seed 42's old green was
luck. (`8/30 → 10/30` is noise at n=30.)

*Method note:* a first sweep appeared to show every subway had 2 regions. It was wrong —
that scratch had dropped the `DoorWindow` exception from `passable`. Reusing the test's own
helper is not optional.

## Remaining sounds

29 tier ids inert, in 7 families. **None of these is a simple `play` call** — that is why
they are still here after 23 ids across 10 families.

- **Throwables (12: dynamite, grenade, molotov, flashbang, plasma, fuel can, fuel pump)** —
  not a sound change. `DoBlast` is still the *vanilla* shape: `rollChance(100)` where the
  fork has two audibility branches (`LOUD`, then `BOOMING`), a `hugeExplosion` flag reaching
  the message layer, and per-explosive `AnimDelay(SHORT|LONG)`. The fork's switch is
  inconsistent in ways that matter: `GRENADE_VISIBLE` plays in branch 1 *whether or not it
  is visible*; `DYNAMITE_VISIBLE` plays in **both** branches; `FUEL_PUMP` plays
  **`DYNAMITE_VISIBLE`** in branch 2 (the fork's copy-paste); fuel can / molotov / flashbang
  `break` silently in branch 2 "to avoid forgetting SFX". **`FUEL_PUMP_AUDIBLE` is never
  played in the reference either** — of the "52 inert" ids, at least one was never wirable.
  Scope this as its own piece: it also changes when the player is told about a blast they
  cannot hear.
- **Traps (6: `CAN_TRAP_*`, `BEAR_TRAP_*`)** — three-branch ladder (player / `QUIET` /
  `MODERATE`) over four trap types keyed on the `theName` **string**, each arm paired with
  a `DoScream`.
- **`EQUIP_BFG_PLAYER`** — unwireable, not unwired. The BFG does not exist in the port;
  `grep BFG` finds two comments and one commented-out C# line.
- **`DOG_BARK_*`** — needs `FeralDogAI` fight-emote audio; the port's `CivilianAI` has no
  dog arm.
- **`FISHING_REEL_NEARBY`** — needs the NPC catch arm, which adds a message the port lacks.
  `extended-audio.test.ts` currently asserts that absence **on purpose**.
- **~60 non-tier ids** — untouched, and never examined.

## The four sound shapes (do not normalise them)

The fork uses four, and writing them the obvious way silently changes the sound:

- **melee** — `isPlayer ? _PLAYER : audible ? _NEARBY`; `play`, so two hits are heard.
- **shove** — audibility **outside**, `isPlayer` inside. The inverse of melee. Written like
  melee, the player's own shove rings at any distance.
- **chainsaw** — the only three-rung ladder, and the only one using **two** radii
  (`QUIET` then `MODERATE`). Collapsed to one `bandForDistance`, a saw 7 tiles off plays
  `_NEARBY` where the fork plays `_FAR`. It also revs whether or not the swing lands, so it
  sits *above* the hit test.
- **vomit** — the only pair whose NPC arm passes **no radius** (`NO_NOISE_RADIUS` default).
  Transcribed as `QUIET`, its NPC tier goes silent from 6 tiles out.

Also: **cooking** uses `playIfNotAlreadyPlaying` for *both* tiers; **extinguisher** puts
sound and message on separate gates; **the door ladder** is ordered so `givesWood` beats
`isMetal`, and `ROLLER_DOER` is a *name string* comparison.

## House rules that bite

- **`Feature.*` before `rollChance`.** A zero-percent check must spend no die; reordering
  changes every seed.
- **A fork id must be *named* within three lines of a literal `Feature.ExtendedAudio`**
  (`extended-audio.test.ts`). A hoisted gate falls out of the window by the fourth branch —
  which is why ten gates cover three call sites. Repeat the lookup rather than widen the
  guard.
- **Generation order and dice consumption are exact.** Reordering two rolls changes every
  seed downstream.
- **`@@MP` markers sit in the comment block *above* a declaration**, not on the declaration
  line. `tests/fixtures/still-alive-sounds.json`'s `release` field is derived from that
  block and is the authority on whether an id is vanilla. This caused a live bug: the
  melee-miss pair was classified vanilla, so **Classic played two fork sounds** and the
  assertion meant to catch it could not see them.
- **Two pins are regenerated, never hand-edited:** `scripts/measure-roguegame.mjs` and
  `scripts/gen-feature-flag-sites.mjs`. The feature-flag test's file says so and explains
  why.
- **Classic district digests** are `9bb5e4907bc3f62c` and `edfe94f97003996a` (moved by
  `9561a3e`; they were `e097…` / `f023…`).
- **`roguegame-surface`:** reachable 113, hubs 30, **movable 83 — unchanged across three
  sound batches**, because every newly exercised method is `Do*`. That is the number the
  `RogueGame` split cares about.

## Also outstanding

- ~~**Coverage gate**~~ — **done.** Re-measured serially on 138 files / 2,955 tests:
  statements 69.87 / branches 57.93 / functions 80.64 / lines 71.29. The old gates were
  sitting ~12 points under the tree and gating nothing; re-pinned ~2.5 below actual at
  **67 / 55 / 78 / 68**. Two serial runs agreed to the digit, which confirms the config's
  claim that the aggregate wobble is a parallel-run artefact.
- **Chainsaw sanity penalty** is missing entirely — `CAUSE_GRUESOME_DEATH_SANITY_PENALTY`
  (Release 7-2) sits in the same `if (hitRoll > defRoll)` block as the melee hit sound added
  in `8a870a4`. A gameplay mechanic, deliberately not added inside a sounds commit.
- **Army-base dispatch**: `CreateUniqueMap_ArmyUndegroundBase` is complete and tested but
  called from nowhere, and the call site documents why. Wiring it faithfully makes the port
  unable to start its own 3×3 test worlds, because the C# bails out of `NewGame` when no
  green district has an army office. **That is a real fragility of the fork, not a
  transcription error** — reproducing it means the port cannot start a small world at all.
  It is a decision about minimum city size.
- **`RogueGame` split**: Wave 0 complete (gate answered: proceed). Wave 1 not started.
  Schedule is `STATE → WAVE 1 → VIEW/WAVE 2 → WORLD → ENGINE → WAVE 3`; hubs 1 and 2 never
  move. A prompt for it was drafted earlier — see §6.0.1 of `plans/BROWSER_PORT_PLAN.md` for
  the taxonomy.

## Suggested order

1. **`MakeNarrowPark` in the housing tail** — ~2.4 bare blocks per district, and the fix
   is ~5 lines. Take the Classic-digest decision first; it is the same one the `rolled`
   gate dodged, and dodging it twice in one region is a pattern.
2. The throwables, scoped as their own piece (explosion presentation, not audio).
3. Traps, then the fishing NPC arm.
4. Non-tier sounds, which have never been looked at.
5. The three parks-region items at the end of §"What the re-merge uncovered" — one
   `RollChance(ParkBuildingChance)` instead of two, the `rolled >= 64` park arm, and the
   army base's position.

**Check `df -h /` before any coverage run.** Commit per step, green before every commit.
The office dispatch is the case that proves why: it was green-able by re-basing 22 seeds,
and every one of those 22 was a symptom of a change that deleted half the game's blocks.