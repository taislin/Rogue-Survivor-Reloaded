# Handover — Still Alive fidelity backlog

Written at `9561a3e` on `feature/still-alive-ruleset`. **Not pushed.** Baseline at that
commit: **138 files / 2,955 tests passing, `tsc` clean.**

Start here, then §"Where things stand".

## The one-paragraph version

Three of your original four items are banked: the army base, ten of sixteen distance-tier
sound families, and the fork's hunting-shop and bedroom item tables. The fourth — the
ordinary-office dispatch — is **implemented but uncommitted and red on 22 tests**, and is
the first thing to pick up. The pattern that explains almost every failure in this backlog
is recorded in §"The recurring defect", because it is worth more than any single fix in it.

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
| **Office dispatch** | ⚠️ **uncommitted, 22 failures / 7 files — start here** |
| Sounds, non-tier | ⏸ ~60 ids untouched |
| Coverage gate | ⚠️ unmeasured since `4b45c66` |

### Uncommitted work

`web/src/gameplay/generators/BaseTownGenerator.ts`, **+15/−17**. It replaces the
staged-not-wired comment block with the live arm of `BaseTownGenerator.cs:531`:

```ts
else {
  placed = this.makeOrdinaryOffice(map, b);
}
```

`makeOrdinaryOffice` was already ported and tested; `tests/ordinary-office.test.ts` passes
(7/7). **Do not `git checkout` this file** — the dispatch is the deliverable, not debris.

## Start here: the office dispatch, 22 failures / 7 files

| file | n | what it is | kind |
|---|---:|---|---|
| `bar-building` | 10 | `expected null not to be null` — no bar at its fixed seed | mechanical |
| `animal-shelter` | 5 | failure text literally reads **"seed 24 generated no animal shelter; pick another seed"** | mechanical |
| `church-building` | 2 | "at least one of **twenty** seeds built a church" → 0 | mechanical (widen sweep) |
| `junkyard-building` | 2 | zones 4 → 8 | judgement |
| `fire-station-building` | 1 | `inside 31,68 is not indoors` | judgement |
| `graveyard` | 1 | "the scoped scan can see park furniture at all: expected false to be true" | judgement |
| `helicopter-rescue` | 1 | `(12,18) should be closer to the chopper than (12,18): expected 10 to be less than 10` | judgement |

Roughly **17 mechanical** (re-pick a seed, widen a sweep), **5 needing judgement**.

Two notes that will save time:

- **`bar-building` already has the machinery** — a comment at `:345` says "The first seed
  in a fixed range that builds a bar", and `buildBar()` at `:320` takes a seed. The failing
  tests hardcode `DISTRICT_SEED = 3` (`:142`) instead of using it. A comment at `:392`
  already explains why the seed moved once before.
- **`animal-shelter`'s header states the policy**: *"the seeds below are chosen, not swept
  for… seed 24 and seed 47 do, and seeds 3, 5 and 8 do not."* After the dispatch neither
  works. Districts are 40×40 (`MAP = 40`, `:76`) and ~45 ms each; a scratch sweep over
  `1..250` is the way to find replacements. A throwaway test importing `BaseTownGenerator`
  + `Parameters` and writing hits to a file works — but note `Parameters` is exported from
  `BaseTownGenerator`, not its own module.

The helicopter failure is worth reading before "fixing": it compares a point with itself
(`expected 10 to be less than 10`), which is what a strict inequality degenerates into when
the fixture's chosen site *is* the helicopter. Probably a real assertion bug rather than a
seed problem.

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
4. Now 17 of the office dispatch's 22.

**The rule this suggests:** when a re-base fails, ask whether the assertion is about the
*property* or about a *dice outcome*. If the test's own comment describes an intent the
assertion doesn't implement (as in #3), fix the assertion to the stated intent. If it
asserts a content count, sweep for the content rather than pinning a seed.

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

- **Coverage gate** (`vitest.config.mts:55-95`) was measured at 58 files / 867 tests and is
  now stale — thresholds are statements 58 / branches 48 / functions 69 / lines 59. Re-measure
  with `--coverage --no-file-parallelism` (parallel runs are not a measurement; per-file
  numbers are stable, the aggregate is not).
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

1. Office dispatch — 17 mechanical fixes, then the 5 judgement calls.
2. The throwables, scoped as their own piece (explosion presentation, not audio).
3. Traps, then the fishing NPC arm.
4. Coverage gate re-measure.
5. Non-tier sounds, which have never been looked at.

Commit per step. Green before every commit — that rule is what kept this backlog from
accumulating a red tree, and the office dispatch is the one place it currently applies.