# Rogue Survivor: Still Alive — Reference Fork Audit

> **Status: the port is done. This file is now a *survey*, not a progress board.**
> It was written when the decision was "nothing ported", and it is worth keeping
> for that: §5's tiering and §7's "do not port" list are what stopped a
> regression going in. But **where it disagrees with
> [`BROWSER_PORT_PLAN.md`](BROWSER_PORT_PLAN.md) about what the port contains, the
> plan is right**, and §6's defect list below is *not* a to-do list — eight were
> applied, four turned out not to apply here, and three needed a different fix.
>
> [`BROWSER_PORT_PLAN.md`](BROWSER_PORT_PLAN.md) §5.6 is the live position;
> [`STILL_ALIVE_JOURNAL.md`](STILL_ALIVE_JOURNAL.md) is how each stage went.
> In short: **Stages 1–5 all landed** on `feature/still-alive-ruleset`, all 37
> declared features have readers, and `PENDING_WIRING` is `{}`. Stage 1 was
> `f0782aa`/`4d43299`, Stage 2 `dd42e82`, Stage 3's merged tables `cfcf2ea`.
>
> **Three things below need their framing changed now that the port exists:**
>
> - **§6's fifteen defects are not fifteen open bugs.** The four that do not
>   apply — and the reasons, which the audit could not have seen because it read
>   the C# rather than this codebase — are recorded as `NOT_APPLICABLE` data in
>   `tests/stage2-fixes.test.ts`, so they are not re-audited. Do not "fix" one of
>   them from this table.
> - **§5's tiering is a cost estimate written before any of it was built.** It is
>   now a record of how the estimate compared to reality, not a plan.
> - **§3's row counts are the fork's, not the port's**, and the merged tables
>   carry more: `Items_MeleeWeapons` is 41 rows rather than the 37 the fork has,
>   because rows are keyed by id and the fork's *removals* were kept.

The three things worth knowing before reading on:

- **The fork is not a fork in the Git sense.** It shares no history with
  `src/`; it is a divergent copy. Diffing it needs `--strip-trailing-cr` — the
  two trees use different line endings and a naive `diff` reports every one of
  195 files as wholly rewritten, which is how a two-week audit can look like a
  rewrite of everything.
- **The fork is well annotated.** Almost every change carries a
  `//@@MP (Release N-M)` or `//@@MP - reason` comment, so authorship and intent
  are recoverable from the source rather than inferred. Use it.
- **The art is present and reusable.** 349 sprite paths are byte-identical to
  vanilla's and 711 are new, all PNG, all under the *same* filename convention.
  Art is not the constraint; the CC-BY attribution obligation is (§7).

---

## Table of Contents

1. [What is in `_refs`](#1-what-is-in-_refs)
2. [Scale of the delta](#2-scale-of-the-delta)
3. [Content delta](#3-content-delta)
4. [Systems delta](#4-systems-delta)
5. [Porting tiering](#5-porting-tiering)
6. [Bug fixes worth taking on their own merit](#6-bug-fixes-worth-taking-on-their-own-merit)
7. [Do not port](#7-do-not-port)
8. [Attribution and licensing](#8-attribution-and-licensing)
9. [Commands and gotchas](#9-commands-and-gotchas)
10. [Where this is recorded elsewhere](#10-where-this-is-recorded-elsewhere)

---

## 1. What is in `_refs`

```
_refs/StillAlive-master/
  CHANGELOG                          1,029 lines, 20 releases, 2017-07 → 2023-07
  LICENSE                            GPLv3
  "Rogue Survivor Still Alive"/
    Data/  Engine/  Gameplay/  UI/   203 .cs files, 98,623 lines
    Resources/
      Data/                           16 CSVs (15 vs vanilla's 14)
      Images/                         1,060 PNGs
      Sfx/                            183 .ogg
      Music/                          22 .ogg
      Ambients/                       13 .ogg
    CREDITS.txt                       per-file third-party media attribution
    MANUAL.txt  help.txt
```

The fork is a **total content replacement**, not an extension. There is no
subset of Still Alive that can be adopted piecemeal without either taking the
data tables with it or hand-picking from the C#.

Its own changelog is unusually good and is worth reading in full before
diffing — it is organised by release, distinguishes features from fixes from
balance, and marks which items came from a named forum user. Several entries
read as design rationale rather than a changelog line, e.g. *"The world now
decays as time passes (configurable in Options)"* is annotated elsewhere in the
source as **cosmetic only; it does not affect gameplay**.

## 2. Scale of the delta

| | vanilla `src/` | Still Alive | port `web/src` |
|---|---|---|---|
| C#/TS files | 195 | 203 | ~200 |
| source lines | 69,266 | **98,623** (+42%) | 65,153 |
| `RogueGame` | 23,232 | 33,146 | 26,878 |
| town generator | 5,850 | **12,042** | 5,805 |
| `BaseAI` | 6,422 | 8,322 | 4,526 |
| `Rules` | 4,439 | 5,787 | 2,872 |
| `GameItems` | 1,769 | 3,547 | 625 |
| sprites on disk | 422 | 1,060 | 1,124 (3 image sets) |
| SFX / ambients | 6 / 0 | 183 / 13 | 3 / 0 |

**61,539 lines** changed across the files the two trees share. The
concentration is not uniform: the town generator doubles (new buildings), the
sound list goes 3 → 181 constants, and `Data/` and `Engine/AI/` are almost
untouched (`Zone`, `District`, `Defence`, `Odor`, `Corpse`, `Weather` and all
three sensor classes are byte-identical modulo line endings).

That last fact is load-bearing for the port: **the data layer is not where the
work is.** The port's `src/data/` is already correct for most of what Still
Alive adds, because Still Alive mostly layered mechanics on top of it.

## 3. Content delta

Straight from `Resources/Data/*.csv`, ID-set differences against `src/`:

| Table | vanilla | SA | added |
|---|---|---|---|
| Melee weapons | 16 | **37** | cleaver, brass knuckles, flail, kitchen knife, scimitar, mace, nunchaku, frying pan, pitch fork, scythe, sickle, spear, spiked mace, **chainsaw**, standard axe, fire axe, barbed wire bat, keyboard, tennis racket, hockey stick, machete, pickaxe, pipe wrench |
| Ranged | 10 | **22** | army rifles ×4, army pistol, army precision rifle, precision rifle, revolver, vintage pistol, nail gun, **flamethrower**, stun gun, SMG, double barrel, **minigun**, tactical shotgun, **grenade launcher**, bio force gun, hunting crossbow, pistol, shotgun |
| Food | 3 | **19** | raw/cooked fish, rabbit, chicken, dog meat, human flesh; chicken egg, wild berries, vegetables, snack bars, peanuts, grapes |
| Explosives | 1 | **10** | molotov, dynamite, C4, fuel can, fuel pump, smoke grenade, flashbang, Holy Hand Grenade, plasma burst |
| Lights | 2 | **6** | night vision goggles, binoculars, flare, glowstick |
| Medicine | 6 | **12** | 4 beers, cigarettes, energy drink, small + large medikit |
| Armors | 7 | **9** | fire hazard suit, biohazard suit |
| Entertainment | 2 | **8** | 4 books + 4 magazines (vanilla had 1 of each) |
| Backpacks | — | **5** | waist pouch, satchel, daypack, hiking pack, army rucksack (new CSV) |
| Actors | 27 | 30 | rabbit, chicken, CHAR scientist, deranged patient; −Jason Myers and 6 unique NPCs |
| Skills | 29 | 29 | `BOWS` → `BOWS_EXPLOSIVES` |

**New CSV columns** — these are the ones that matter most, because they are
mechanic changes expressed as data:

- `WEIGHT` on melee and ranged weapons → subtracted from `Doll.Body.Speed`
  (`Rules.cs:4656`). Huge hammer 5, minigun 20, flamethrower 10, most pistols 0.
- `FIRE_RESIST%` and `INF_RESIST%` on body armor. Vanilla armor had **no**
  fire resistance at all; it had `Protection_Hit` / `Protection_Shot` /
  `Encumbrance` / `Weight` and nothing else.
- `Causes food poisoning?` and `Can be cooked?` on food.

Still Alive also **removes** content: Big Bear, Famu Fataru, Hans von Hanz,
RoguedJack, Duckman and Santaman are gone as unique NPCs (Release 8-1), taking
four unique weapons with them, and `JASON_MYERS` with the rest.

## 4. Systems delta

Grouped as the changelog groups it, with the load-bearing code locations.

**Survival.** Blood alcohol with a five-tier intoxication scale and ranged/
melee accuracy penalties; food poisoning with an antiviral-pill counter; cooking
raw meat on fires; fishing; butchering with a bladed-weapon gate; cannibalism
sanity **and** poisoning consequences; weapon weight; shield encumbrance
(`SHIELD_ENCUMBERANCE_PENALTY = 0.75f`, `Rules.cs:130`); armor fire and infection
resistance.

**Fire.** Vanilla's whole system is one block — a rain roll over all map
objects. Still Alive replaces it with tile fires that spread to 8 neighbours at
5%/turn, `FuelUnits` reservoirs on barrels, campfires and cars, weather-derived
extinguish chances, self-extinguishing, stop-drop-and-roll on `Wait`, fire
extinguishers as an item, siphon kits as a fuel source, and `SetTileOnFire`
(`RogueGame.cs:24613`) refusing to ignite non-walkable tiles — which is the fix
for *"Fires no longer travel through walls"*.

**Light and vision.** An ambient lighting system, true darkness
(`MINIMAL_FOV_PLAYER = 0` vs `MINIMAL_FOV_LIVINGACTORS = 1`, `Rules.cs:86-87`),
binoculars, night vision, and a hard gate on reading/healing/barricading in the
dark.

**World.** ~15 new building types — bank, bar, church, library, clinic, mechanic
workshop, farm, fuel station, fire station, animal shelter with a linked kennels
sub-level, junkyard, graveyard, army office, ordinary office, and a **three-map
shopping mall** — plus ponds, a city size of 5×5 to 7×7, district minimum 50×50,
a new Army underground map, world decay, and idle-item despawn.

**AI.** An anti-loop system built on `RepetitiveNoAPCostActionsThisTurnCount` and
`AI_REPETITIVE_NOAPCOST_ACTION_LIMIT = 8` (`Rules.cs:19`); a full
darkness-navigation branch; fire avoidance and self-extinguishing; harder trap
avoidance; an `UnintelligentAnimalAI` for chickens and rabbits; a rewritten
`FeralDogAI` that forms packs; and behaviours for cooking, fishing, butchering,
molotov-making and hunting animals.

**Meta.** Difficulty options moved to character creation and locked (ESC
re-reads `options.dat` from disk to prevent loading into a save started on
different settings); a Resources Availability option; a Backpacks option;
Black Ops raids from day 14 and CHAR research-team raids from day 21; backup
saves; a helicopter-rescue endgame; an ambient audio channel; 181 sound
constants; and a difficulty-scaled starting kit.

## 5. Porting tiering

Cost here is *in this port's architecture*, not generically. Two things that are
normally the expensive parts are free:

- **Save format.** `SessionGraph` writes **every own field of an object** minus
  an explicit skip list. A new scalar field on `Actor`, `Item`, `MapObject`,
  `Corpse`, `Location`, `Inventory`, `District` or `World` costs **zero edits**
  to the serialiser. `Tile` is the sole exception at ~4 lines in `tilesGrid`
  plus its `assertFields` list. A new item class is 1 line in `specs.ts`.
- **Rendering.** `grep GameImages\. web/src/ui web/src/engine/firstperson`
  returns **nothing**. Every draw call is `imageCache.get(id) → drawImage`. A new
  tile or map object renders in both top-down and first-person with no switch to
  add.

What is expensive: `RogueGame.ts` is already 26,878 lines, and a new item
*behaviour type* needs hand-edited `instanceof` chains in `DoUseItem`,
`OnEquipItem`, `OnUnequipItem`, `DoDropItem`, `DescribeItemShort` and
`DescribeItemLong` — 282 `instanceof Item*` sites exist in total, with no
registry and no reflective factory. And six table-shape tests must be updated in
the same commit: `data-tables`, `sprite-assets`, `audio-levels` (which requires
`sox` to regenerate `AudioLevels.ts`), `music-priority`, `save-graph-coverage`,
`model-data-binding`.

| Tier | Contents | Assets | Data | Code | Verdict |
|---|---|---|---|---|---|
| **0** | §6 bug fixes | none | none | ~150 lines | **Best value in the audit.** No balance change, no data churn, four of the fifteen are things existing tests would catch if they regressed. |
| **1** | New weapons/armors/explosives/foods/lights, `WEIGHT`, `FIRE_RESIST%`/`INF_RESIST%`, small rebalances | 1,100 sprite constants | CSV columns + `convert-csv.js` + `ItemID` + `GameItems` maps | mechanical | Wide but repetitive. Each new item is ~3 edits; the `WEIGHT`/resist columns are ~2 each. |
| **2** | Weight/speed, fire resist, alcohol, food poisoning, cooking, extinguishers, tile fires, darkness FOV, helicopter endgame, difficulty options | moderate | new options | new state fields, new actions, new keybinds, `RogueGame` surgery | Each item changes balance. Weeks. |
| **3** | New buildings, animals, new-mechanic AI, mall, army base, ambient audio, 180 SFX | full set | new CSVs | new generators + AI classes | Large. |
| — | `TaskAddMapObject` | — | — | — | Skip: dead in the fork itself (§7). |

**One sharp edge if you go to Tier 3.** The shopping-mall generator requires a
49×49 block, which does not fit cleanly alongside the fork's own 50×50 minimum
district size — `MakeMallBlocks` has a special case to avoid double-roads when
`map.Width > 50`. Copying the mall without the district-size change, or with a
different one, will produce a broken district.

## 6. Bug fixes worth taking on their own merit

Each of these is a defect in vanilla Alpha 10.1 that Still Alive fixed, each
verified absent from the port. They are listed highest value-per-line first,
and none requires art, data changes, or a balance decision.

> **This is a survey of the fork, not a backlog — eight were applied, four do not
> apply to this codebase, and three needed a different fix than the audit
> described.** The table's "verified absent from the port" was true when written;
> it is not a statement that they are all still open. Per-defect outcomes live in
> `tests/stage2-fixes.test.ts`, where the four inapplicable ones are `NOT_APPLICABLE`
> *data* rather than prose, so they cannot be silently re-fixed later. The reasoning
> is in [`STILL_ALIVE_JOURNAL.md`](STILL_ALIVE_JOURNAL.md) §5.6c.
>
> The instructive pattern across the four: **each was a defect in vanilla that the
> fork fixed, checked against the C# rather than against this port** — and each
> turned out to have no pre-condition here. `RateItemExchange`'s throwing switch
> became a matrix; door repair (and so the plank duplication) does not exist at
> all; and the three fire defects need tile fires and fuel cans, which did not
> exist until Stage 4. Two more were *worse* than described: the
> `efficientRange` off-by-one drove the hit value **negative**, not merely out of
> range, and battery recharge was two defects rather than one.

| # | Defect | Fix | Location | Size |
|---|---|---|---|---|
| 1 | **Furniture spawns on top of exits and stairs.** Shelves, beds and junk can land on an exit tile, sealing a basement against its house or the sewers ladder. | add `map.GetExitAt(p) == null` to both fill helpers | `MapGenerator.cs:278, 304` | 2 lines |
| 2 | **World generation throws when no CHAR district is a candidate**, with an unreachable catch. The game is dead. | `GenerateWorld` returns `bool`; `StartNewGame` retries with a new seed | `RogueGame.cs:4059, 4197` | ~15 lines |
| 3 | **The police-station prisoner is invincible.** Vanilla never sets `IsUnique`, so the "invincible until spotted" logic and its de-invincibility half disagree. | `specialPrisoner.IsUnique = true` | `BaseTownGenerator.cs:9146` | 1 line |
| 4 | **The Sewers Thing is invincible**, same cause. | `actor.IsUnique = true` | `RogueGame.cs:4693` | 1 line |
| 5 | **`RateItemExchange` throws on unhandled item types.** A player holding a cell phone or tracker can crash NPC trading. | `#if !DEBUG return REFUSE;` plus explicit refusals | `BaseAI.cs:6933, 6981, 6994` | ~10 lines |
| 6 | **Item duplication when giving an item to a follower.** Stacking on a tile that already holds the same item clones it — a save-corrupting exploit. | `DropItemForTransferBetweenActors` drops onto the giver's own tile | `RogueGame.cs:20920, 21389` | ~35 lines |
| 7 | **Infinite battery recharge.** The recharge check tests the left hand first, so a light there recharges itself forever. | test the right hand first, add the eyes slot, add an "already full" guard | `Rules.cs:1330-1373, 2030-2040` | ~30 lines |
| 8 | **`Attack.efficientRange` off-by-one.** `Range / 2` means a range-1 weapon can never hit. | special-case `Range == 1` | `Attack.cs:56-64` | 4 lines |
| 9 | **Plank duplication.** Repairing a door with a single wooden plank creates planks. | require ≥ 2 | `Rules.cs:2630` | 4 lines |
| 10 | **Fires travel through walls**; exploding fuel cans destroy walls; corpses appear permanently on fire. | `SetTileOnFire` refuses non-walkable tiles; `DoBlast` refuses wall replacement at a map edge; `KillActor` extinguishes | `RogueGame.cs:24622, 20019, 23732` | ~15 lines |
| 11 | **Flee-stamina logic checks the wrong actor** — whether the *fleeing* NPC has a ranged weapon, not whether the enemy does. | check the enemy | `BaseAI.cs:3598` | 3 lines |
| 12 | **AI stuck in an open/close-door loop** underground. | bail out of `BehaviorSecurePerimeter` when the actor cannot see sky | `BaseAI.cs:4209` | 1 line |
| 13 | **NPCs take items marked `IsForbiddenToAI`.** Vanilla enforces the flag only inside the AI layer, so any other code path bypasses it. | enforce in `canActorGetItem` / `Use` / `Equip` | `Rules.cs:665, 811, 869` | ~25 lines |
| 14 | **AI light-equip priority is inverted** — the NPC drops its torch in favour of its cell phone. | lights outrank phones; disable drop-useless-light | `BaseAI.ts` equiv. `BaseAI.cs:1895-1927` | ~20 lines |
| 15 | **You can read books, heal and barricade in total darkness.** | FOV gate on those actions | `RogueGame.cs:21492-21525` | ~30 lines |

Two more worth knowing about but not porting blind:

- **Killing in self-defence counted as murder** (gang members who accosted you,
  feral dogs, aggressively hungry civilians). This is a `Rules.IsMurder` change
  and is a real correctness fix, but it also touches faction relations and
  scoring.
- **`Attack` ordering**: vanilla checks `IsActorExhausted` before `IsActorSleepy`
  and `IsActorTired` before `StaminaPoints < MaxSTA`, applying the harsher
  penalty first. Still Alive swaps both. Two lines, and it is a buff to the
  player.

## 7. Do not port

The fork is a fork, and it is the *older* code in a few specific places. These
are cases where copying it would be a regression against the port's current
baseline:

- **`ExplorationData.cs`** — Still Alive's version is pre-Alpha-10. It uses a
  plain `Queue` and has **no** `GetExploredAge`, so `BehaviorExplore` scores
  unexplored-only and loses the "prefer oldest explored" gradient vanilla has.
  Keep the port's.
- **`BehaviorWander`** — Still Alive rewrote it to be purely random with
  penalties layered on, dropping vanilla's "prefer unexplored" and "prefer
  fast-breakable objects" terms. A net loss. Keep the port's.
- **`Session.Save`** — Still Alive removed the `stream.Close()` calls. That is a
  file-handle leak. The port's explicit close is correct.
- **`RateTradeOffer`'s unique-item guard** — vanilla refuses trading a unique
  item for a non-unique one; Still Alive deleted the clause, so NPCs can now be
  talked out of quest items. Vanilla is right.
- **`TaskAddMapObject`** — added by the fork, and its only call site is inside an
  `#if false` block documented as *"opted not to use the below"*. Dead code in
  the fork itself; it exists only to add a serialization format for nothing.
- **`DeleteItemsSittingIdle`** — scans every tile of every map once per player
  day. O(W×H) per map per day across up to 49 districts is a real frame-time
  hazard in a browser.
- **Autosave anchoring** — the fork replaced the save-relative
  `Session.NextAutoSaveTime` with `TurnCounter % 540`, anchored to absolute world
  turn, so loading a late save can skip or double the next autosave. The
  save-relative design is more robust.
- **`//#if DEBUG` dev-tool block in `RogueForm.cs`** — more invasive than
  vanilla's, and irrelevant to a browser port.

Two places in the fork are also internally inconsistent, which is worth knowing
if you ever read its AI: the darkness branch fires on `fov <= 1` in
`CivilianAI` but `fov <= 0` in the other four AI classes — and the
`MINIMAL_FOV_LIVINGACTORS = 1` floor makes the latter **unreachable**. Four of
the five blocks are dead as shipped.

## 8. Attribution and licensing

- **Code**: Still Alive is GPLv3, the same licence as this project and as the
  original by Jacques Ruiz. No conflict.
- **Media**: `CREDITS.txt` states the third-party files are **CC0 or CC-BY 3.0**
  unless otherwise noted, and that **every one has been modified** (remixed,
  cropped, or re-amplified for normalisation). Attribution is not optional for the
  CC-BY subset.
- The credits file lists roughly 90 `freesound.org` sources by author and URL,
  plus separate sections for images and music. Sprites contributed by a named
  forum user are marked as such and are CC-BY.

**Decision on record (2026-09-29): any asset port lands as a credits page plus a
main-menu entry.** This is what the fork itself does — Release 7-6 added *"a
main menu item for the list of all resource file credits"* — and the port already
has a `docs/` site and an options screen to hang it from. Nothing is being
ported under this decision yet; it is recorded so that a future change does not
have to re-litigate it.

Conversion, if it ever happens, is mechanical: the 711 new sprites are PNG under
the same filenames as the 349 shared ones, and `web/scripts/optimize-sprites.py`
already does the PNG→WebP pass with a pixel-level check.

## 9. Commands and gotchas

```sh
SA="_refs/StillAlive-master/Rogue Survivor Still Alive"

# The one that matters. Without it every file reads as fully rewritten.
diff --strip-trailing-cr -U3 "src/Engine/Rules.cs" "$SA/Engine/Rules.cs"

# Per-file line deltas, largest first
for f in $(cd src && find . -name '*.cs'); do
  printf '%6s %6s  %s\n' \
    "$(wc -l < "src/$f")" \
    "$(wc -l < "$SA/$f" 2>/dev/null || echo 0)" "$f"
done | sort -k2 -nr

# CSV ID set differences. Parse properly: the files are quoted and reordered.
python3 - <<'EOF'
import csv
def ids(p):
    with open(p, newline='', encoding='utf-8-sig') as f:
        return [r[0].strip().strip('"') for r in csv.reader(f)
                if r and r[0].strip().strip('"') not in ('', 'ID')]
a = ids('src/Resources/Data/Items_MeleeWeapons.csv')
b = ids('$SA/Resources/Data/Items_MeleeWeapons.csv')
print('added  :', [x for x in b if x not in a])
print('removed:', [x for x in a if x not in b])
EOF
```

**Gotchas, in the order they will bite you:**

1. **Line endings.** Covered above. `git diff --no-index --ignore-cr-at-eol` also
   works.
2. **`src/Gameplay/AI/LOSSensor.cs` and `SmellSensor.cs` are dead files.** They
   are not in `src/RogueSurvivor.csproj`; the compiled ones live under
   `Gameplay/AI/Sensors/`. Still Alive simply never carried the orphan copies
   forward, which makes the file-list diff look like a deletion. It is not.
3. **`GameOptions.DIFFICULTY_STARVED_ZOMBIFICATION` changed type** from an int
   percentage to a `bool`. Copying it breaks the options binary format, which is
   the port's `GRAPH_VERSION` equivalent.
4. **Item rows bind by ID string, not position** in the port's `GameItems.ts`,
   and that is deliberate — positional binding has already caused two shipped
   data-corruption bugs there. Still Alive's CSVs are **reordered and requoted**
   relative to vanilla's, so a positional port would silently mis-bind. Use the
   ID-keyed maps.
5. **`ItemID` and `PlayerCommand` are append-only.** `Keybindings` persists
   `[commandNumber, key]` pairs, so renumbering either enum invalidates every
   user's saved bindings. Append; do not renumber.
6. **`TileID` is positional.** `tests/tile-palette.test.ts` derives the
   floor/wall boundary from `id <= RAIL_EW`, so inserting a tile mid-enum
   silently reclassifies every tile after it.
7. **The fork's own `BaseMapGenerator` has one genuinely better method** worth
   reading before writing any new generator: `IsADoorNSEW` (`MapGenerator.cs:450`).
   It keeps furniture off door tiles, and its absence is why the fork needed it
   everywhere.

## 10. Where this is recorded elsewhere

- `BROWSER_PORT_PLAN.md` §1.1 lists what is **proven clean** — do not re-audit
  those areas. This file is the companion for the *upstream comparison* question
  and does not overlap with it.
- `STILL_ALIVE_JOURNAL.md` is the long-form record of the port: what each stage
  was, what was tried, and what turned out to be wrong. `BROWSER_PORT_PLAN.md`
  §5.6 is the summary; the journal is why.
- `docs/` holds the published manual and controls pages. §4's systems *were*
  adopted, so they became documentation changes too, not just code — the
  controls page carries the fork's new bindings and the in-game manual its
  commands.
