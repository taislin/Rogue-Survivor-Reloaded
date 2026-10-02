# Still Alive Port — Stage Journal (long form)

> **This is the journal, not the plan.** It is the blow-by-blow record of how the
> Still Alive ruleset was ported: what was tried, what was wrong with it, and what
> the corrections were. It is kept verbatim because every lesson in it cost a real
> session to learn, and because the *shape* of the mistakes is the durable part.
>
> [`BROWSER_PORT_PLAN.md`](BROWSER_PORT_PLAN.md) §5.6 carries the current
> position — what landed, what is still owed, and the handful of rules that
> prevent the mistakes recurring. This file is the long answer to "why is it
> like that?", and it is **not** a statement of current state. Where the two
> disagree about what exists today, the plan is right.
>
> Sections are the plan's own, so `§5.6e` means the same thing in both files.
> Lines moved when this file was split out, so re-grep rather than trusting a
> `file:line` citation from inside it.
>
> Extracted from `BROWSER_PORT_PLAN.md` when it was ~4 259 lines; §5.6c–5.6f were
> ~2 450 of them.

---

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
> - **Crop loss — LANDED, and it was never blocked.** This entry used to say it
>   needed `FLOOR_PLANTED` "from the alpha10-era farming system that was never
>   ported". That conflated *planting* with *loss*. The arm at
>   `RogueGame.cs:24731-24734` is `FLOOR_PLANTED` -> `FLOOR_GRASS`, unconditional,
>   no roll and no message, and `TileID.FLOOR_PLANTED` has been in the port all
>   along (`GameTiles.ts:32`, model `:236`, flammable `:407`). Three lines.
>   `HandlePlayerPlantSeeds` (`:14208`) and `ItemID.VEGETABLE_SEEDS` are still
>   unported, so in the port today only something else could have planted the tile
>   — but the lossy half no longer needs the farming system to exist.
> - **Fuel-pump explosions — LANDED.** `ExplosionChainReactionMapObjects`
>   (`RogueGame.cs:20110`), `ExplodeFuelPump` (`:20123`) and the `SetTileOnFire`
>   adjacency sweep (`:24634-24642`) are all wired. The sweep is the *only* way one
>   pump sets another off — a pump's 800 HP is more than any blast in the game deals,
>   so the HP arm can never fire for a healthy pump.
>
>   **The cascade is unbounded in depth, not in reach.** A blast of radius 2 ignites
>   two rings; each ignited tile runs its own sweep and so reaches one ring further;
>   each of *those* blasts ignites two more. A pump three tiles from the first goes
>   up even though the blast never reached it, and the chain continues as long as it
>   keeps finding pumps. There is no depth limit and no visited set in the reference
>   either — this is transcribed, not introduced.
>
>   **Two things this forced, both worth recording separately.** (1) `DoBlast`
>   gained the C#'s third `itemModel` parameter and threads it to
>   `ApplyExplosionDamage`, because the tile-fire seeding at `:20036` is gated on a
>   model flag; `causesTileFires` (`ItemModel`, Release 7-3) is set on the six
>   models the C# sets it on, *twice each* since `ItemGrenadePrimedModel` copies by
>   hand. (2) `ApplyExplosionDamage`'s `throw new Error("blast.destroyWalls")` —
>   present since "Port Phase 4 slice 6" and reachable for dynamite and C4 the whole
>   time — had to go, because the fuel pump's blast carries `canDestroyWalls` and the
>   arm could not run at all. Its C# guard (`:20016-20024`) is now ported verbatim,
>   and **`ReplaceDestroyedWall` (`:20134-20232`) has since landed too**, so the arm
>   is end to end: a wall that passes the guard now comes down.
>
>   `ReplaceDestroyedWall` needed the nine `GameImages.DECO_WALL_*_DAMAGED`
>   constants, `Map.isBuildingFloorTileAt` (Release 3's structural-floor test), the
>   adjacent-floor probe, and the plank drop for `WALL_WOOD_PLANKS`. Two findings
>   worth carrying forward, both asserted in `tests/replace-destroyed-wall.test.ts`:
>
>   - **Both switches key on `TileModel.imageId`, never on `TileID`.**
>     `WALL_POLICE_STATION` and `WALL_SUBWAY` have no `case` in the C# switch, and
>     a `TileID`-keyed port would drop all three stone-ish walls into the C#'s
>     `default: throw`. They work because `GameTiles` registers all three with
>     `GameImages.TILE_WALL_STONE` as their image (`GameTiles.ts:247,250`), so they
>     arrive already spelled `Tiles/wall_stone`. The reference's own comment above
>     its model table warns to keep `IsDestructibleWallModel()` and
>     `ReplaceDestroyedWall()` in step; they are out of step *by name* and the
>     aliasing is what closes the gap. `ReplaceDestroyedWall`'s `default:` therefore
>     stays quiet instead of throwing, since throwing there would be a crash of this
>     port's own invention.
>   - **`floor_food_court_pool` and `floor_white_tile` are handled by the method's
>     second switch but absent from `isBuildingFloorTileAt`,** which is the only way
>     into it — so those two cases are dead in the C# and are kept dead here.
>
>   Landing the method also activated two guards that had been ported while
>   unreachable: `ApplyExplosionDamage`'s `if (!wallDestroyed)` scorch suppression
>   (`:20027-20030`) and `ScorchBurntTile`'s damaged-wall skip (`:24560-24569`),
>   which matches on the `_damaged` substring every rubble drawing ends with.
>
>
>   `Feature.SiphonFuel`'s player half was already wired (`RogueGame.ts:23475`) and
>   is unaffected.
>
>   **The blast path's other `itemModel` uses are still unported** — the three SFX
>   switches, the BFG plasma icon, smoke and flashbang, and the plasma charge's four
>   special cases. None is reachable in the port (no `DeploySmokeScreen`, no
>   `DetonateFlashbang`, no grenade launcher, no BFG), so porting them would be
>   ~200 lines of unreachable transcription. Gating the seeding on
>   `causesTileFires` *alone* is nonetheless exactly equivalent to the C#'s
>   `IsFlameWeapon || CausesTileFires` for every explosive the port can detonate,
>   because the only model with `IsFlameWeapon` and no `CausesTileFires` is the
>   flamethrower, a ranged weapon that never reaches `ApplyExplosionDamage`.
>
> - **Molotov explosions now seed tile fires.** A visible behaviour change and a
>   C#-parity fix: the reference has done this since Release 5-2 and the port's blast
>   path never reached the line at all. It is the reason the seeding condition is
>   pinned by an exhaustive per-model assertion rather than by a spot check.
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
> - ~~**`isOneHanded`.**~~ **LANDED.** `ItemWeaponModel.isOneHanded` now exists
>   (Release 7-2) and the fishing rod's "unequip a two-handed right-hand weapon"
>   arm (`RogueGame.cs:21945-21956`) is ported with it. The bullet that used to sit
>   here was wrong about the data, so the correction is the record: the fork does
>   **not** set `IsOneHanded = false` throughout, and one-handed is the
>   **majority** — **19 of 37 melee** and **7 of 22 ranged**. "True for the combat
>   knife and the pistols" named 1 melee and 4 of the 7 ranged, and missed the SMG,
>   the nail gun and the stun gun. See `IsOneHanded` below.
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

> ### `IsOneHanded` — the field, and the two guards that were blocked on it
>
> Still Alive, Release 7-2. **DONE**, and it is the last piece of the police riot
> shield: the shield itself, the block roll and the encumbrance landed earlier, but
> without this a shield and a baseball bat coexist, which the reference forbids.
>
> **The field is `ItemWeaponModel.isOneHanded`, defaulting to `false`, and it is on
> the base rather than the two subclasses.** The C# declares it twice with no
> common declaration to port — `ItemMeleeWeaponModel.IsOneHanded`
> (`ItemMeleeWeaponModel.cs:14`) is a settable property, while
> `ItemRangedWeaponModel`'s (`:43`) returns a private field (`:13`) that the
> constructor's `isOneHanded` parameter assigns (`:72`) as the **eighth**
> argument, between `isSingleShot` and `weight` (`:66`). That is the same asymmetry
> `weight` has, and the same reason `weight` is hoisted to the base: one
> declaration, one comment, and readers that do not care which subclass they were
> handed. `ItemWeapon.isOneHanded` is the pass-through the C# writes twice on the
> concrete items (`ItemMeleeWeapon.cs:16-19`, `ItemRangedWeapon.cs:27-30`) —
> it is on the *item* because the shield guard holds an `ItemMeleeWeapon` from
> `getEquippedMeleeWeapon()` and asks that, not the model.
>
> **Hand-set, not a column — and that is the part worth writing down.** There is
> no `ISONEHANDED` in `Items_MeleeWeapons.csv` or `Items_RangedWeapons.csv`, and
> the reference never reads one: all 37 melee and all 22 of its ranged values are
> literals at the construction site. It *looks* like data, so the natural
> assumption is that it is data, and `d.ISONEHANDED` would be `undefined` for every
> weapon in the game — silently giving all of them the default. So it is a
> `oneHanded: true` on the `meleeMap`/`rangedMap` row (`GameItems.ts:725`,
> `:847`), read as `meta.oneHanded === true`, which is the same treatment
> `butcher` already has and for the same reason: it is a hand-set per-model flag,
> and absence is the answer.
>
> **The correction, which is the reason this section is longer than the change.**
> The `Fishing` bullet above said the fork sets `IsOneHanded = false` throughout,
> `true` "for the combat knife and the pistols". That was wrong on both halves and
> wrong in the direction that matters — it implied one-handedness was rare, when
> **one-handed is the majority**:
>
> | | one-handed | two-handed |
> |---|---|---|
> | melee (C#'s 37) | **19** | **18** |
> | ranged (C#'s 22) | **7** | **15** |
>
> The combat knife is 1 of 19. The "pistols" are 4 of 7 — army pistol, pistol,
> revolver, vintage pistol — and are not all of it: the **SMG**, the **nail gun**
> and the **stun gun** are one-handed too, and the nail gun and the stun gun are
> not pistols, being the two `isSingleShot` weapons sitting immediately left of
> those literals in the source. Conversely the baseball bat, the chainsaw, the
> katana and the fire axe are all two-handed, so "the combat knife" was 1 of 19
> and the melee side was described as if it were the other 18. **Reading the wrong
> one of the two adjacent `bool` literals is a silent transposition**: it compiles,
> type-checks, and produces a plausible weapon.
>
> **The two guards, both in `OnEquipItem`, and both ungated.**
>
> 1. `:21014-21019` — equipping a **two-handed** weapon unequips an equipped
>    shield. A local `let isOneHanded = false` (`:20978`) is assigned from the
>    melee model (`:20987`) or the ranged one (`:20997`); the default is
>    transcribed rather than tidied because both downstream readers test
>    `!isOneHanded`, so a model that reached the test unassigned would have a
>    shield pulled off it.
> 2. `:21030-21045` — equipping a **shield** (`EquipmentPart == LEFT_ARM`)
>    unequips a two-handed melee weapon, **else** a two-handed ranged one. The
>    `else` is the reference's and is deliberate: a two-handed melee weapon wins
>    and the ranged one is never considered. Today it is unobservable, because an
>    actor has one right hand and so at most one of the two can be equipped; it is
>    kept because the two-arm case is exactly where it would stop being so.
>    The `EQUIP` sound at `:21043-21044` is **not** ported — it is
>    `GameSounds.EQUIP`, still pending with `Feature.ExtendedAudio`.
>
> **The fishing-rod arm is ported too.** `RogueGame.cs:21945-21956` asks the same
> field and was explicitly deferred *because the field did not exist*; the
> `DoUseFishingRodItem` header carried that as a recorded gap. It runs before the
> `isPlayer` test, as in the C#. Its `DoUnequipItem(..., false)` third argument is
> the C#'s `showMessage = false`, which is this port's `canMessage = false` — the
> two flags are *opposites by default* (the C# defaults `showMessage` to `false`,
> the port defaults `canMessage` to `true`), so the passed value agrees while the
> defaults do not. `Fishing` stays **NOT done** for its own reason: the NPC arm has
> no `BehaviorGoFish` and no pond generator, so `Map.hasFishing` is never set and
> nothing reaches this code from a player casting a rod.
>
> **Eight models have no reference value, and take the default.** The four
> `UNIQUE_` melee rows (Jason Myers' axe, the Famu Fataru katana, the Bigbear bat,
> the Roguedjack keyboard) and four ranged rows (`RANGED_ARMY_RIFLE`,
> `RANGED_KOLT_REVOLVER`, `UNIQUE_SANTAMAN_SHOTGUN`,
> `UNIQUE_HANS_VON_HANZ_PISTOL`) are ids that appear **nowhere in the reference** —
> the fork dropped the models and the CSV kept the rows. There is no
> `IsOneHanded` line to transcribe, so all eight are two-handed because the
> reference is silent, not because it said so. That is recorded at both tables
> rather than papered over with a plausible guess: two of the eight are pistols,
> and marking them one-handed would be a guess dressed as a transcription.
>
> **Why the Classic fingerprint cannot move, and it is not a gate.** It was checked
> for two reasons and answered structurally for both. The pinned
> `e097b9d976ffac15` is the FNV digest of `tile.model.id | mapObject.imageId |
> decorations | isInside` per cell (`tests/bank-building.test.ts:89-101`) — it
> reads tiles and map objects and nothing else, so no item model and no equip rule
> can reach it. And the shield arms are inert under Classic for a second,
> independent reason: the only model that names `DollPart.LEFT_ARM` is
> `POLICE_RIOT_SHIELD`, a hand-written model with no CSV row, so
> `getEquippedShield()` cannot answer for a Classic actor and the `if/else` arm is
> unreachable even when a Classic weapon's value is wrong. A wrong value would
> only mean the wrong weapon is dropped on a *shield* — and there is no shield. The
> fishing rod is a different mechanism and it is gated: `Feature.Fishing` is tested
> on the only call site (`RogueGame.ts:21852`, the `Feature.Fishing` arm of
> `DoUseItem`) before the method is entered, and
> `FISHING_ROD` is a hand-written model rather than a CSV row, so Classic cannot
> reach the arm at all.
>
> Tests: `tests/two-handed-weapons.test.ts`, asserting the exact 19 and 18 melee
> ids, the 7 and 15 ranged ids, and all three equip behaviours against real models.

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
> port's `UniqueMaps` does not have. (`Feature.ArmyBase` is now wired, but it is a
> *town* building generator with no underground level of its own, so the port still
> has no `armyBase` band to silence. The omission is unchanged; only the reason is.)
> The test asserts
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
| `ArmorResist` | none (model field) | 0 | **BOTH halves DONE.** The infection roll is gated in `Rules.infectionBlockedByArmor`; the fire column is consulted in `RogueGame.SetActorOnFire` as a **`rollChance` on whether ignition sticks**, which is the C#'s only use of it (`RogueGame.cs:24772`). It is *not* a damage multiplier, and the port's `ItemBodyArmor` comment saying so was wrong until this. Note the coupling: the fire half rides on `Feature.TileFires`, so fire resistance only functions under it |
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
| `ScorchBurntTile` | `Map.tileAlreadyHasScorchDecoration` | ~50 C# lines | **DONE** — the method was three lines that set `IS_SCORCHED` and stopped; the flag is what `Map.isInflammableTile` reads, but no player had ever seen it. Now the full C# `:24556-24608`: stairs skipped, damaged-wall guard, three damage tiers x wall/floor, and the `TaskRemoveDecoration(TURNS_PER_DAY * 3)` cleanup, plus the `ApplyExplosionDamage` call site with its plasma-charge exclusion. **`damage > 0` gates the flag too**, not just the drawing — a zero-damage call marks nothing. The damaged-wall guard was ported while vacuous - it looks for a `_damaged` decoration, which only `ReplaceDestroyedWall` (`:20134-20232`) adds - and **is now live**, since that method has landed. Every one of the nine rubble ids ends `_damaged`, so a tile fire now stops at an opened wall instead of blacking over it | 
| `MakeParkPond` | `makeItemFishingRod`, `Map.hasWaterTiles` | ~100 C# lines | **DONE, except the C#'s `else` arm** — Release 6-1's replacement for alpha10's shed, and the only thing in the game that makes `Map.hasFishing` true, so the player's rod finally has water and the NPC arm has a gate to pass. Gated on `Feature.Fishing` at the step, which is what keeps Classic on the shed and byte-identical. **The `else` (a fire barrel in parks too small for a pond) is deferred**: it is eleven C# lines and it breaks world-generation determinism in a way not yet explained — see the comment at the step | 
| `MAKE_COOKING_FIRE` | `ItemID.MATCHES`, `Rules.canStartCookingFire`, `DoMakeFireForCooking` | ~230 C# lines | **DONE** — the command both `Cooking` and `FireBarrels` were blocked on: until it landed the only fire in the port came from an explosion. `Ctrl+F`, an eight-check rule with per-refusal messages, MATCHES MODE, and three shapes (new campfire / refuel / relight) | 
| `Graveyard` | none — a `bool isgraveyard` on `makeParkBuilding` | ~0 new lines | **DONE** — three in-method branches (graves vs trees/benches, the `Graveyard` zone name, "only add stuff to parks") and a new band in the green cascade. No new method, because the C# added none |
| `TileFires` (actor arm) | `ActorFlags.IS_ON_FIRE`, `ActorFlags.IS_IN_WATER` | 0 | **DONE** — `SetActorOnFire` / `ExtinguishOnFireActor` / `ApplyBurnDamageToOnFireActor` / `stepActorsOnFire`, the 25% catch-fire roll, the per-turn burn, the rain and stop-drop-and-roll extinguishments, and the Release 6-6 exemption list so a burning actor is not burned twice |
| `ShelterBackpacks` | nested `Inventory` on an `Item` | new `ClassSpec` + a 7-call-site engine wiring | **DONE** — 5 models, `canGoInBackpacks` (a curated 100-model list, not a rule), the one-bag and Hauler-tier gates, a save codec with a `finish` hook for a bag record missing its inventory, a nested panel on the ground row, and `SWAP_INVENTORY` on `Y` |
| `ArmyBase` | `makeArmyOffice` + `makeArmyOffices` + `populateArmyOfficeBuilding` in `BaseTownGenerator` | ~281 C# lines | **DONE** — its own pass *ahead of* the business cascade, `DistrictKind.GREEN` only, one per district. A sibling of `makeCHAROffice` rather than a new shape: same corridor, wings and `makeRoomsPlan(4,4)` plan, five differences (iron doors, army tiles, army furniture, the `"Army Office"` zone + `IS_ARMY_OFFICE`, the garrison). **Size gate is 8x8, not the offices' 5x5** — the one thing a near-copy port gets wrong. `GENERAL` stays excluded because the C# has it commented out at `:430` | 
| `AnimalShelter` | new `makeAnimalShelterBuilding` + `createNewFeralDog` on `TownBuildingContext` | ~98 C# lines, plus the `:4230` spawner | **DONE** — band `20..29` of the green cascade, and it **places its ten dogs**. The spawn was deliberately omitted on arrival ("the C#'s spawner would need a decision on whether fork content is gated") and both reasons for that omission are now gone: the recorded `ctx.actorPlace` seam exists (`TownBuilding.ts:377`, documented *"14 call sites; 1 in the C# buildings (the animal shelter's dogs)"*), and the dice-stream worry is answered by the `Feature.AnimalShelter` gate running before the first roll, which is exactly why the Classic fingerprint `e097b9d976ffac15` is unmoved. `createNewFeralDog` is now a bare arrow delegate on the context beside `actorPlace`; `skinDog` spends its `Roll(0, N)` off **`ctx.roller`**, the district's. Ten kennel cells (`cellWidth = 3` over 21 wide, `x += 2` → x=0…18), one `CreateNewFeralDog(0)` each, three cooked chickens each. C# refs **re-verified against the reference**: the method spans `:4189-4251`, `kennelPos` is `:4228`, the dog is `:4230`, the chickens `:4231-4233` and `PlaceActorAt` `:4234` — nine line citations inherited from the earlier draft were off and are corrected. **One deliberate divergence, recorded not hidden:** C# `:4234` is a direct `Map.PlaceActorAt` costing zero dice, whereas `ctx.actorPlace` is a rejection sampler over the 21x8 level, so landing on a *named* tile costs roughly 3360 district rolls against the C#'s 10. Mandated — a private placement loop would be the second, unrecorded copy of the call this port refuses to have — and Still-Alive-only for the gate reason above |
| `Clinic` | new `makeClinicBuilding` | ~178 C# lines | **DONE** — `case 2` of the shared `roll(0, 4)`. Twelve factories re-declared privately, the largest set of the seven |
| `Library` | new `makeLibraryBuilding` | ~278 C# lines | **DONE** — its own pass *before* the cascade (the C#'s `if` sits above the `switch`, not in it), so it takes no dispatch roll. The C#'s `IsSanityEnabled` gate is not ported: the port has no such option, and the option's default is the only representable state |
| `Junkyard` | new `makeJunkyard` | ~147 C# lines | **DONE** — the trailing arm of the C#'s parks `Roll(0, 99)` green cascade, so it takes that die as a parameter. Two C# quirks transliterated rather than fixed: its three roller doors are always refused (the perimeter is already chain-wire fence) and its `DECO_JUNKYARD` is unreachable |
| `FireStation` | new `makeFireStationBuilding` | ~176 C# lines | **DONE** — folded into the parks loop, because the C# offers it only to blocks that already passed `RollChance(parkBuildingChance)`. **C# bug ported as fixed:** `:547` initialises `fireStationPlaced = true`, which makes `MakeFireStation` unreachable in the reference; the `//only one per district` comment says the intent, and the intent needs `false`. Placing no fuel pump — that belongs to `Feature.FuelStation` |
| `FuelStation` | new `makeFuelStationBuilding` + `MapObject.isMetal` + `makeObjFuelPump`/`makeObjFuelPumpBroken` | ~369 C# lines (`:2811-3179`) + `BaseMapGenerator.cs:1105-1119` | **DONE** — second arm of the parks `&&` chain (`:557`), between the two sports courts and the fire station, folded into the parks loop for the shared-die reason the fire station is. 3 `GameImages` constants. **`isMetal` landed with it**, which is what `makeBankBuilding`'s safes, `makeClinicBuilding`, `makeFireStationBuilding` and `makeAnimalShelterBuilding` had each documented as waiting on; the helicopter (`:1101`) sets it too and now can. Three quirks preserved: `:2820`'s `Math.Round(((double)(map.Width / 10)) / 2.5)` is **integer** division before the cast (width 115 caps at 4, not 5); the counter resets per district while the cap reads whole-map width; and **both `doorside` switches have no `case 4` and no default, which is unreachable rather than a fifth side** — `DiceRoller.Roll` is `Random.Next(min, max)` and exclusive of max, so `Roll(0, 4)` is `[0, 4)`. Two seam additions (`makeObjFuelPump`, `makeShopGeneralItem`). **TileFires' fuel-pump arm is still owed** — `ExplodeFuelPump` (`RogueGame.cs:20123`) and the `SetTileOnFire` adjacency check (`:24634`) that is the *only* way one pump detonates another, since a pump's 800 HP survives any blast |
| `Church` | new `makeChurchBuilding` | ~200 C# lines | **DONE** — a `rollChance(10)` pass at the C#'s stage, 9 `GameImages` constants, `UNIQUE_BOOK_OF_ARMAMENTS = 171` appended, `Map.hasChurch` |
| `Bank` | new `makeBankBuilding` | ~238 C# lines | **DONE** — `case 1` of the shared `roll(0, 4)` cascade, 5 `GameImages` constants |
| `Bar` | new `BarBuilding` | ~282 C# lines | **DONE** — `case 0` of the same cascade, 5 `GameImages` constants. The C#'s alcohol drops are **not** ported: they roll `m_Game.Rules`, not the district roller, and need `LIQUOR_AMBER`/`LIQUOR_CLEAR`, which the port has never appended |
| `BlackOpsRaid` | `hasFeature` gate + Release 6-1 refresh | ~10 lines | **DONE** — and the smallest feature in the set, because **the raid already existed**. `CheckForEvent_BlackOpsRaid`, `FireEvent_BlackOpsRaid` and both spawners were already in `RogueGame.ts` and firing in *every* ruleset. That is precisely why it sat in `PENDING_WIRING` with zero call sites: the partition test counts readers, so behaviour without a gate reads as unwired. The gate goes on the **check**, not the fire, so a Classic district spends no dice at all. It **replaces** `s_Options.BlackOpsRaidsEnabled` (`:28578`, Release 7-5) rather than sitting beside it — that option does not exist in the port. Also the Release 6-1 refresh: `GameMusics.BLACK_OPS` not `ARMY`, and "A plane passes quickly over the city!" / "Parachutists have dropped" rather than the pre-6-1 helicopter text. `Black Ops.ogg` vendored |
| `CHARResearchRaid` | `createNewCHARScientist` + the encounter | ~264 C# lines | **DONE** — and the "145 `CHAR` references in `RogueGame.cs`" estimate was a substring artifact (`CHARISMATIC`, `RECHARGE`, `PLASMA_CHARGE`); the real footprint is ~264 lines over nine files. It is an **encounter, not a generator**: no new maps, no blocks, no `TOWN_BUILDING_PASSES`. `ActorID.CHAR_SCIENTIST = 28` already existed with model, abilities and `CHARGuardAI`, so this was mostly foundations. `ItemID.CHAR_LAPTOP = 177` appended, `_COUNT` 177 → 178. Two C# quirks preserved: the squad loops subtract one from *different* totals, so **four** scientists (leader + 3, consistent) but only **two** guards for a constant that says three; and the dispatch is the **ninth of nine**, where each `CheckForEvent` spends a `RollChance`, so order is load-bearing. Unlike BlackOps the C# gates this on *nothing* — no flag, no option — so the `hasFeature` is purely the port's addition and is the only thing keeping a shotgun-carrying team out of a Classic district. Also fixes a standing divergence: the CHAR underground placed `createNewCHARGuard` where the C# places `CreateNewCHARScientist` (`:8430-8436`). One documented divergence: `Rules.HasAntiviralPills` does not exist in the port, so the test is inlined and Vintage takes the medikit branch. `RS - CHAR researchers.ogg` vendored |
| `SportsCourts` | new `makeSportsCourts` (two generators, one file) | ~221 C# lines | **DONE** — the **first** arm of the parks `&&` chain (`if (!MakeTennisCourt(map, b) && !MakeBasketballCourt(map, b))`, `:555`), ahead of the fuel station. Both reachable — unlike `MakeFireStation`, which the C# makes dead code at `:547`. **The only exact-equality gates among the C#'s fourteen**: `buildingRect` 8x10 and 10x8, which are mutually exclusive by shape so the chain never chooses between them, and which mean a 10x12 or 12x10 block. **And rare**: that is one tile off the floor of what `makeBlocks` cuts at the default `minBlockSize` of 11, which is why `:555`'s "must be limited to specific dimensions" reads as a warning. The entrance switch's `default` **is the roll-2 case** (`case 0/1/3` plus `default`, no `case 2`) and is load-bearing — the opposite of the fuel station's unreachable `case 4` hole, and the two must not be normalised to match. Basketball's `//70 is the last global piece` comment is off by one against tennis *and* against the real 48th placement at index 69; preserved verbatim with the discrepancy recorded. The two courts' tile-numbering schemes differ (tennis is a row-major index of its rect, basketball a sheet index with stride `9r+c-2`) and both are correct — the loop is positional and the numbers are labels. Four local factory copies; `ctx.makeObjChainwireFence` would delete three of them eventually. `isMetal` **is** set on all four objects — the notes in `makeAnimalShelterBuilding`/`makeFireStationBuilding` claiming the field does not exist are stale |
| `Farm` | new `makeFarmBuilding` + `makeObjWoodenFence`/`makeObjFarmPlant` | ~121 + shed C# lines | **DONE** — and **it was never blocked on the farming substrate**, which was the belief for most of this port's life. `TileID.FLOOR_PLANTED` was already here; the point is that `MakeFarmBuilding` never *uses* it. Its tiles are `FLOOR_WALKWAY`, `FLOOR_GRASS`, `FLOOR_DIRT`, `WALL_WOOD_PLANKS` and one `FLOOR_ASPHALT`. The crops are **map objects**, one per inside-rect tile, so the farm feeds `CheckIfPlantsFruit`'s *map-object* arm and not the planted-tile arm at all. Band `30..63` of the green `Roll(0, 99)`, so the C#'s `64` fall-through is still live and the distribution is still 35/34/10/10/11 against the comments' 35/35/10/10/10 — decided as the C# has it. Two quirks: the gate is `:3690-3693`'s two redundant lines (`< 8 || < 6` twice), transcribed rather than simplified; and the C#'s comment beside `Roll(0, 3)` says *"berries (1), peanuts (2) or crops (3)"* and is **stale** — there is no crops case and `case 2` is the grape vine. The chickens at `:3778-3801` are inside `#if false` upstream and nothing is ported, described at the step so the absence cannot read as an omission. **`ItemID.VEGETABLE_SEEDS` does not exist**, so the shed's most common item — six of twelve arms — is skipped with the roll preserved; a wrong item would be a quieter lie than an absent one |
| `WorldDecay` | `CheckIfWorldDecays` / `ApplyWorldDecayPhase` / `ChooseRelevantDecayDecorationForTile` + 4 sprite choosers, in `RogueGame` | ~700 C# lines (`:9246-9865`), on top of commit `e3c3347`'s substrate | **DONE** — and it is the reason the substrate was built: 108 of 142 models carry `canDecay`, the generator emits it, `Tile.decayPhase` rides in two bits of the existing `flags` word (the tile codec asserts the own-field set, so a new field would have needed registering), and `insertDecoration` exists because decay inserts at index 0 while `addDecoration` appends. 174 tile-decoration ids and 30 map-object ids (picket / chainwire fence / chainwire gate) added to `GameImages`. Wired into `advancePlayDistrict` at the C#'s `:5617-5626`. **`WALL_SUBWAY` needed no special case after all**: `GameTiles.cs` carries a comment claiming `ApplyWorldDecayPhase` handles it, but no such test exists anywhere in the reference — the mechanism is the `Lighting == OUTSIDE` test at `:9289`, and a subway arrives as `CanDecay && isInside && !isWalkable` on a `DARKNESS` map, which the existing `else //is underground, so no decay` arm declines. The `canDecay` flag is left `true` on purpose: it is what lets the tile *reach* the ladder that declines it. That arm tests `== OUTSIDE`, not `!= DARKNESS`, so `LIT` maps are declined too — sewers, basements, the CHAR facility and the mall car park all fall out of the same branch for free. **One latent landmine, pinned by a test rather than papered over:** the port registers `TILE_PARKING_ASPHALT_NS`/`_EW` as decaying models (the C# declares the images but never registers a model) and the decoration chooser has no case for them, so one reaching the reader hits the C#'s terminal `throw`. Nothing places either model, so it is unreachable in play; neither clearing `canDecay` nor inventing drawings would be a decision the reference supports. **The C#'s car arm is still wrong here and is not this feature's bug to fix:** it derives a decay phase by stripping the last character off the image id, which assumes `CARS` holds `car_red_phase0..`, while the port's holds vanilla `car1..car4` — so a phase rename lands on a *different* car. Fixing `CARS` would move the Classic fingerprint, so it is documented at the call site instead. **Not ported:** `GameOptions.cs:610-612`'s three phase-0 picket-fence sprites, which nothing places in either game, and `CheckIfPlantsFruit`, which is not this subsystem |

| `ShoppingMall` | new `makeShoppingMall` (`MallQuadSplit` + `MakeMallBlocks` + `MakeShoppingMall` + `GenerateShoppingMallGroundFloor` + `MakeMallShopDisplays`) plus `MakeNarrowPark`, `Parameters.generateShoppingMall` and `GameOptions`' district-size floor | ~600 C# lines ported of ~1 000 (`:1224-1305`, `:5809-5856`, `:9861-10176`, `:10614-10706`) | **PARTIAL, and the last three lines of its wiring are in `RogueGame.ts`** — the ground floor and both level *shells* are ported, with all six `AddExit` pairs, twelve shops, seventy shopfronts, twenty glass doors, the barber's chair-and-basin rewrite and the dealership's eight display cars; the `+1` food court / supermarket / two cinemas (`:10194-10488`, ~295 C# lines) and the `-1` car park's bays, pillars, railings and abandoned cars (`:10508-10608`, ~100) are **not**, and the car park **cannot** be without a `GameTiles.ts` change (there is no `PARKING_ASPHALT_NS`/`_EW` *model* in the port). 22 `GameImages` constants and **no vendoring** — every mall sprite was already in `assets/images/classic/`. 46 factories transcribed, one of them (`makeObjShelf`) disagreeing with the port's own copy. **`PENDING_WIRING` is now `{}`.** See its section |

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

> ### `Graveyard` — the cheapest feature on the board, and not for the reason expected
>
> Still Alive, Release 4. The fork did not add a graveyard *building*. It added a
> `bool isgraveyard` to `MakeParkBuilding` and branched inside it three times. So
> there is no new method, no new roll and no new pass — the whole feature is three
> conditionals and six `GameImages` constants, and the only reason it took any work
> at all is that "three conditionals" is exactly the kind of thing that gets
> half-done.
>
> The three branches: the fill is graves and park trees instead of trees and
> benches; the zone is `Graveyard` rather than `Park`; and the park-only items and
> shed are skipped ("only add stuff to parks"). The last one is gated on the
> *calls*, not inside them, because the C#'s `RollChance(PARK_ITEM_CHANCE)` is not
> taken at all for a graveyard — a taken-and-discarded die moves every roll after it.
>
> The graveyard band is `10..19` of the green region's one `Roll(0, 99)`, and it
> shares that die with the park, the farm, the animal shelter and the junkyard. The
> test pins the band table and asserts the bands are disjoint, which is the only
> reason the port may test the graveyard band *before* handing the roll to the
> junkyard and still agree with the C#'s ordered `if/else` chain.
>
> **A C# off-by-one, ported as written.** The farm's upper bound is `rolled < 64`,
> not `< 65`, so the value 64 satisfies no arm and falls to the junkyard: the
> junkyard gets 11% and the farm 34% against the comments' "35% / 10%". Transcribed
> rather than corrected, because the bands are a hand-tuned distribution and a
> one-point "fix" is invisible in a test and unarguable in a diff. Farm is still
> pending, so this is where it gets decided.
>
> Two pre-existing divergences in `makeParkBuilding` are deliberately **not**
> touched, because they are conformance debt rather than graveyard work and fixing
> them would change every park in every Classic world: the port still runs the
> perimeter fence (the C# removed park fences in Release 7-3 and left the
> graveyard's iron railing inside a commented-out block) and the entrance face (the
> C# has it under `if (isgraveyard)`, the port runs it for both). The port is also
> behind on the C#'s Release 7-3 changes to the same method — the pond, the fishing
> rod it drops, and the fire barrel. All of that is one `makeParkBuilding`
> conformance job, and it is not this feature.
>
> ### `ShoppingMall` — the last one, and the only one that moved a *global* option
>
> `ShoppingMall` emptied `PENDING_WIRING`, so the register is `{}` and the partition
> test in `tests/feature-flags.test.ts` now asserts that all 37 declared features are
> either read or withheld. Two readers, in two files, and the second is the interesting
> one: the generator's own first statement, and **the `DistrictSize` floor in
> `GameOptions`**.
>
> #### The floor, and why it is ruleset-dependent rather than global
>
> The decision this feature forced is whether to raise `GameOptions.districtSize`'s
> floor from 30 to 50 **globally**, which is what the C# does:
>
> ```csharp
> // _refs/StillAlive-master/.../Engine/GameOptions.cs:476
> if (value < 50) value = 50; //@@MP - was 30 (Release 7-3)
> ```
>
> That is the whole of Release 7-3's change to the option, and the reason is
> `MakeMallBlocks`: `MallQuadSplit` (`:1227-1228`) splits the **whole city rectangle**
> at a hard-coded `leftWidthSplit = topHeightSplit = 50`, so the mall always occupies
> the north-west 50x50 corner and the other three quads go back to `MakeBlocks`. Below
> 50 there is nowhere to put it. `DEFAULT_DISTRICT_SIZE` was already 50 in the port, so
> only a player who has deliberately stepped the option down is affected.
>
> **The C# cannot tell the two rulesets apart, because the C# has one ruleset — it *is*
> the fork.** This port has two and holds Classic byte-identical, and `districtSize` is
> read by world generation: a global 50 would move the pinned Classic fingerprint
> `e097b9d976ffac15` (7 test files, 11 assertion sites; `tests/bank-building.test.ts:606`
> shows the committed value). So the floor is read from the ruleset —
> `districtsSizeFloor()` in `GameOptions.ts`, `hasFeature(ruleset, Feature.ShoppingMall)
> ? 50 : 30` — which is also why this feature has a reader in `GameOptions` at all
> rather than only in its generator.
>
> The `//@@MP - was 30` on that C# line *is* the Classic value: the comment is the fork
> recording the number this port has to keep, and reading it as "50 always" is how a
> Classic district silently becomes 25 tiles wider.
>
> #### What is ported, and what is not
>
> | C# | port | |
> |---|---|---|
> | `MallQuadSplit` `:1224-1248` | `mallQuadSplit` | no dice — "static split point", `50` |
> | `MakeMallBlocks` `:1250-1305` | `makeMallBlocks` | the `map.Width > 50` test is load-bearing at both ends |
> | `MakeNarrowPark` `:5809-5856` | `makeNarrowPark` | **needed because of the mall**: at 50 wide all three leftover quads are degenerate and go here rather than back to `MakeBlocks`, so a default-sized mall district is *entirely* mall plus three empty narrow parks |
> | `MakeShoppingMall` `:9861-9926` | `makeShoppingMall` | six `AddExit` pairs, twelve calls, all `isAnAIExit: true` |
> | `GenerateShoppingMall_UpperLevel` `:10178-10193` | `generateShoppingMallUpperLevel` | **shell only** |
> | `GenerateShoppingMall_Parking` `:10490-10506` | `generateShoppingMallParking` | **shell only** |
> | `GenerateShoppingMallGroundFloor` `:9928-10176` | `generateShoppingMallGroundFloor` | all of it |
> | `MakeMallShopDisplays` `:10614-10706` | `makeMallShopDisplays` | all of it |
> | `MakeRandomMallShopItem` `:7400-7420` | `makeRandomMallShopItem` | all of it |
> | `GenerateShoppingMall_UpperLevel` `:10194-10488` | — | **not ported** (food court, supermarket, two cinemas) |
> | `GenerateShoppingMall_Parking` `:10508-10608` | — | **not ported, and blocked**: it fills the bays with `GameTiles.PARKING_ASPHALT_NS`/`_EW`, which have **no model in the port** |
>
> The shells are worth having rather than stubbing: the staircase column is what puts
> `parkingStairs1`/`parkingStairs2` at `(1, 25)`/`(1, 26)` on walkway, so the six exits
> land somewhere walkable and AI-usable instead of on nothing.
>
> `HasWaterTiles = true` on the upper level is **not** set, deliberately: its only
> reason in the C# is the food court's pool, which is part of what is not ported, and
> the flag is read by the AI when it is on fire looking for water to put itself out in.
>
> `UniqueMaps.ShoppingMall_{GroundFloor,UpperLevel,Parking}` (`:9921-9923`) are **not**
> ported. `ShoppingMall_GroundFloor` is an *alias* for the district's own entry map, so
> registering it would store a second name for a map the save graph already carries, and
> `UniqueMaps` is an inline graph class whose slot table is hand-written
> (`specs.ts:962`, `uniqueMapSlots`). The two level maps are reachable through
> `District.addUniqueMap`, which is what actually makes a map part of a district.
>
> #### Three C# quirks kept verbatim
>
> - **The twelve shops overlap by one row, twice.** Four rows at `t+0`, `t+10`, `t+25`,
>   `t+35`, each eleven tall, so rows 1/2 share `t+10` and rows 3/4 share `t+35`, and the
>   *later* row's `TileRectangle` wall lands on the earlier row's last row. A "tidy grid"
>   port (`0/11/22/33`) is 44 tiles short of the 46 the four rows have to cover.
> - **The shops dictionary has eleven entries for twelve `Block`s.** `shopBlock7` is not
>   in it, because it is the car dealership and `:10147-10169` fills it by hand with
>   eight display cars and the seating — which is also why `MallShopType.DEALERSHIP`'s
>   arm is `display = null`. The `//electronics` comment on `:10015` is stale; the two
>   `DECO_SHOP_DEALERSHIP` signs at `:10085`/`:10092` say what it is.
> - **The mall's own music assignment is dead.** `:9881` sets the surface map's
>   `BgMusic` to `SHOPPING_MALL`, and `Generate`'s last statement (`:537`) overwrites it
>   with `SURFACE`. A mall district plays the surface tune and its two levels play the
>   mall's.
>
> Plus two smaller ones: the four **bins** at `:9971` are on absolute map coordinates
> while every other list in that method is `l +`/`t +` (and two of the four line up only
> because a mall's `l` and `t` are both 2), and the **eleven registers** come out as
> ten checkouts because `:10142-10143` removes by name any that landed inside the
> barber's.
>
> #### The wiring this branch does not own
>
> Three lines, all in `RogueGame.ts`: a third `m_Rules.Roll(0, noSpecialDistricts.Count)`
> beside the two at `:4233`/`:4236` (the C# draws the mall's district *after* the police
> station and the hospital have each taken one — "Only ONE special building max per
> district", `:4226`), the parameter on `GenerateDistrictEntryMap`, and
> `genParams.generateShoppingMall = (district.WorldPosition == mallDistrictPos)` beside
> `:31806-31810`. They are written out at the head of
> `buildings/makeShoppingMall.ts`, in the `ShelterBackpacks` shape. Until they land the
> flag is `false` for every district, which is **load-bearing** and is why every Classic
> world stays byte-identical; `tests/shopping-mall-building.test.ts` pulls the same lever
> from the other side.

> ### `HelicopterRescue` and `ShelterBackpacks` — the two that closed other things
>
> **HelicopterRescue** consumed `Session.armyHelicopterRescueDay`, which
> `Feature.DifficultyAtCreation` had been writing and nothing reading since. It also
> makes 5 of `AmbientAudio`'s 8 outstanding tracks reachable, so it is two features
> for one piece of work.
>
> One thing it inherited rather than introduced: the civilian arm pathfinds toward
> the helicopter on the rescue day, for every civilian in earshot, with no turn
> bound. `CivilianAI.cs:526-543` has no turn bound either, so the cost is the
> reference's. It is recorded rather than fixed, because the alternative was to
> diverge from the C# to keep a test harness happy — see the note on
> `SIM_BUDGET_MS` in `tests/idle-district-sim.test.ts`, which is a test file carrying
> a design decision, and says so.
>
> **ShelterBackpacks** is the one feature whose *wiring* was more work than its
> model. The subagent correctly refused to touch `RogueGame.ts` (contended with the
> helicopter agent) and returned a copy-pasteable request for all seven call sites
> instead: the `SWAP_INVENTORY` dispatch, `TryPlayerUnwell`'s auto-close, the mouse
> lookup, the panel draw, `OnLMBItem`, `DoTakeItem`, and the description line. That
> was the right call and the right format.
>
> Three things the wiring turned up:
>
> - **A circular import that typechecked.** `ui/BackpackPanel` needs
>   `GROUNDINVENTORYPANEL_Y` (the C# puts the bag on the ground panel's row) and
>   `RogueGame` draws the panel, so `RogueGame` imports the panel. As a module-level
>   `const`, `BACKPACK_PANEL_Y` read `GROUNDINVENTORYPANEL_Y` before `RogueGame` had
>   assigned it, and the panel drew at `y = undefined`. It compiles: the constant is
>   declared `number`, and `undefined` is what a `number` holds when nobody wrote to
>   it. The fix is a function, read at use time. The alternative — moving the layout
>   constants into their own module — grew to nine the moment `RIGHTPANEL_X` turned
>   out to depend on two more, which is how a two-line cycle becomes a refactor.
> - **`canGoInBackpacks` is a curated list, not a rule.** 100 of the port's models,
>   transcribed from the C#'s hand-written set. Deriving it from `isEquipable` would
>   get a combat knife right and a hunting rifle wrong, and the tests pin those two
>   pairs precisely because the list looks like it should be derivable.
> - **The codec needed a `finish` hook, not just a spec.** A pre-feature save has no
>   `ItemBackpack` record at all, which is fine. The case that *crashes* is a record
>   with no `backpackInventory` key: `assignFields` only writes keys a record
>   carries, and a shell from `Object.create` has no field initialisers, so the
>   first `backpackInventory.isFull` — gate 4 of the transfer rule — throws on a save
>   that loaded perfectly. The `finish` hook fills it at the model's capacity, so it
>   is the same bag rather than a blank one.

> ### `Actor.isOnFire` — the subsystem three features were waiting on
>
> Not a `Feature`, but the highest fan-out item on the board: `Feature.ArmorResist`'s
> fire half, `Feature.TileFires`' catch-fire arm and `Feature.FireExtinguishers`' actor
> target were all blocked on one missing field. Still Alive, Release 5-7.
>
> **The decision worth arguing about: which feature owns it.** The C# gates nothing —
> it is core fork content — but this port gates everything, and every ignition source
> is the fork's fire (tile fires, molotovs, flamethrowers). So it rides on
> `Feature.TileFires`. The consequence is a **coupling**: `ArmorResist`'s fire half only
> functions under `TileFires`. That is defensible — fire resistance is only meaningful
> if fire can set you alight, and in this port fire *is* `TileFires` — but it is a
> coupling and not a fact of the C#, so it is recorded here rather than buried.
>
> Three things the C# does that are easy to get wrong:
>
> 1. **`FIRE_RESIST%` is a `rollChance`, not a damage multiplier.** The port's
>    `ItemBodyArmor` comment said it scaled damage. There is exactly one use in the
>    whole reference — `RogueGame.cs:24772`, deciding whether ignition *sticks* — and a
>    copy that read it as a reduction would quietly halve every burn instead of
>    preventing ignition. The test now uses the merged table's own distribution to
>    prove the shape: the fire hazard suit is 100% and the biohazard suit 5%, with the
>    seven ordinary armours at 0, so the three cases bracket the range and an
>    inverted sign or a swapped formula fails the ordering.
> 2. **Release 6-6's exemption list.** A burning actor takes 2 from being alight and
>    would take another 1 from the tile they are standing in, every turn. The C# records
>    them in `NextMapTurn` 3.1 and hands the set to the tile-fire sweep. Without it a
>    fire costs 3 a turn instead of 2, and the fix is invisible because the fire
>    "works".
> 3. **Water is a hard block, tested before the armour roll** (Release 6-1), and so are
>    skeletons. Order matters: a fire-resistant skeleton in water is unignitable for
>    two independent reasons, and a reader that rolled first would spend a die on it.
>
> The clear-weather extinguishment applies to **livings only** at 33% — "undead aren't
> smart enough to extinguish themselves" — while the deliberate stop-drop-and-roll on
> Wait is 50% and applies to everyone, because it is an action rather than a change in
> the environment. That asymmetry is the C#'s and is easy to flatten by accident.
>
> **Not ported: `DoScream`.** A successful ignition calls it, which draws the speaker's
> mouth open and plays a gendered sound. The port has no `DoScream`; the loud-noise half
> is ported because it has consequences, the sound is `Feature.ExtendedAudio`, and the
> animation is a renderer job.
>
> Three mutations, all caught: each gate removed, and `100 - fireResistance` for the
> reader. The gate mutations are caught by the reader partition *and* by a behavioural
> test, which took a second attempt — the first version of that test called a method
> that was separately gated, so it passed with the gate deleted. A gate that is only
> covered structurally is a gate nobody notices breaking.

> ### Two foundations, no features — the noise-distance model and the fork's animals
>
> Two subsystems landed that are **not** `Feature`s and carry no gate, because both
> are shared machinery that Classic already has a use for and the fork merely needs
> more of.
>
> **`engine/NoiseDistance.ts`** — the fork splits sound into four bands (23 / 14 / 8 /
> 5 tiles) and the port had no way to ask which band a listener is in. It is 255
> lines with **zero imports**: pure geometry, no audio state, no clock, no RNG. Every
> radius is an inclusive upper bound, as the C# has it, and the tests transcribe the
> C#'s `else if` chain longhand and compare at every distance from 0 to 40.
>
> It changes nothing yet, and the reason is the finding: **the port has no
> `IsAudibleToPlayer` at all.** What it has is `AddMessageIfAudibleForPlayer`, which
> is a faithful port of the C# method of the same name — and *that* takes no radius
> parameter in the C# either. So there was no single-radius call site to widen, which
> is a much better outcome than a plausible-looking rewrite of one.
>
> Two things it surfaced that are **not fixed**, deliberately:
>
> - `Rules.LOUD_NOISE_RADIUS` is 5 here and 14 in the C#. The port's value is
>   load-bearing (`OnLoudNoise` bounds its sleeper scan by it), so gunfire wakes
>   sleepers on a 5-tile radius. That is a real divergence, it belongs to `Rules`,
>   and it is not the distance model. The trap is that the C#'s *quiet* radius is
>   also 5, so anyone assuming the two constants correspond gets the quiet radius for
>   every gunshot tier. A test now asserts the coincidence exists.
> - The C#'s helicopter **stop** ladder is not the complement of its start ladder —
>   walking from 7 tiles to 3 leaves two tracks playing. Six distances differ. The
>   model asks the question the stop ladder meant to ask; making the two agree is the
>   caller's decision, and a test pins the exact set.
>
> **`RABBIT` and `CHICKEN`** (`ActorID` 29 and 30, appended, `_COUNT` 31) plus
> `UnintelligentAnimalAI` and two `BaseAI` behaviours the port lacked entirely
> (`behaviorSimpleAnimalWander`, `behaviorFleeFromFires`). Appended rather than placed
> beside `FERAL_DOG` as the C# has them, which would have renumbered 13 actors under
> every existing save.
>
> Three consequences worth recording:
>
> 1. **It found a bug in `Butchering`.** The C# sets `IsLivingAnimal` on the *feral
>    dog* (Release 7-5) and the port did not, so a dog corpse took the human branch
>    and yielded **human flesh**. The switch is keyed on that flag precisely so that
>    this cannot happen, and the flag was simply missing from the model that needed
>    it most.
> 2. **It revived `Butchering`'s three dead branches.** `FOOD_RAW_RABBIT`,
>    `FOOD_RAW_CHICKEN` and `FOOD_RAW_DOG_MEAT` are now reachable. The test that had
>    been guarding the C#'s un-ported `default: throw` was passing on a fiction — it
>    faked an animal name because no real one existed. It now hand-mutates a model
>    (and restores it in a `finally`, because the models are process-wide statics), and
>    a companion test asserts all three real animals reach a real case.
> 3. **Nothing spawns them yet.** No code path creates a rabbit, so they are inert —
>    the same position `DERANGED_PATIENT` and `CHAR_SCIENTIST` are in. The gate
>    decision therefore belongs on the *spawner* in `BaseMapGenerator`, not on the
>    models: `hasFeature` cannot gate a model without either breaking the
>    `ActorID` ↔ index identity that saves depend on, or nulling the model. Leaving
>    them ungated is byte-equivalent to Classic for as long as they are unreachable.
>
> The AI's flee-from-fire arm turned out **not** to need `Actor.isOnFire`: it reads
> `Map.isAnyTileFireThere`, which `Feature.TileFires` already provides. What it would
> eventually want is a sibling arm that triggers on the actor itself being alight —
> one guard in `BaseAI.behaviorFleeFromFires`, entirely local to that method.

> ### The Classic fingerprint is the real test of all seven buildings
>
> Six of the seven building tests commit the *same* constant for a 40x40 Classic
> district at seed 1: `e097b9d976ffac15`. That is deliberate and it is the only
> assertion in the set that actually constrains anything. Each agent verified its
> own district was unchanged and reported the number; agreeing on one number across
> six independently written files is the evidence that none of them moved a
> classic world.
>
> It caught two real bugs, both of which would have been invisible otherwise:
>
> - The business cascade's roll sat *outside* the per-generator gates, so CLASSIC
>   spent one die per block. Fingerprint went `e097b9d976ffac15` ->
>   `436f2b15e06ff29d` -> back.
> - A "per-district cap" test for the bar began failing as each new building
>   landed. That one is *not* a bug: the constant is a Still-Alive district whose
>   bar count depends on which blocks the cascade is offered, so every new pass in
>   that region moves it. It is now re-derived by scanning rather than asserted,
>   and says so, because "re-derive this" is the correct response and "pin it
>   harder" would have hidden the cascade's behaviour.
>
> The stage-ordered cascade also cost one honest divergence. The library's rolls
> land at the library block's index in the C# but ahead of the whole cascade in
> the port, because a separate pass runs the pool first. Reproducing the C#'s
> interleaving needs the building to be a branch *inside* the block loop rather
> than a pass over it, which is a different shape from the seam's. Recorded rather
> than hidden.
> ### The business cascade — one die, four arms
>
> The C# reaches the bar, the bank, the clinic and the mechanic workshop from a
> single `Roll(0, 4)` at `BaseTownGenerator.cs:510`:
>
> ```
> int roll2 = m_DiceRoller.Roll(0, 4);
> switch (roll2) {
>   case 0: placed = MakeBarBuilding(map, b, ref barsCount);     break;
>   case 1: placed = MakeBankBuilding(map, b, ref banksCount);   break;
>   case 2: placed = MakeClinicBuilding(map, b, ref clinicsCount); break;
>   case 3: placed = MakeMechanicWorkshop(map, b, ref mechanicsCount); break;
> }
> ```
>
> Three agents ported the bar and the bank independently, each rolling its own
> dispatch. That was a real bug and not a cosmetic one: two rolls per block where
> the C# spends one, and — worse — the mutual exclusivity the `switch` exists to
> provide was simply gone, so a block could be offered to both. The integration
> now spends one die and passes it down, and `makeClinicBuilding` will be
> `case 2` of the same switch rather than a new roll.
>
> Two things about the gate, both of which were got wrong first:
>
> - The roll has to be *outside* each generator's gate, because that is what makes
>   the arms exclusive. Which means a gate on the arms alone is not enough: CLASSIC
>   would still spend one die per block and every classic world would change. The
>   whole arm is gated instead. Caught by the bank test's committed CLASSIC
>   fingerprint, which went from `e097b9d976ffac15` to `436f2b15e06ff29d` and back.
> - A flat `TOWN_BUILDING_PASSES` registry cannot express a stage-ordered cascade.
>   The C# places the bar and bank *before* the parks, the church after them, and
>   the housings last; a flat list loses that. Each building therefore gets its own
>   pass at the C#'s stage, and the registry stays empty.
>
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
