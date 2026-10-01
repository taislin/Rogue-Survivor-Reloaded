/**
 * `Feature.Farm` — C# `BaseTownGenerator.cs:3685-3805` `MakeFarmBuilding`
 * (Release 7-3) plus `:3807-3943` `MakeFarmShedBuilding`, and the two factories it
 * reaches for that had to be added to `BaseMapGenerator`.
 *
 * A farm is a grass field inside a wooden fence with a crop on *every* tile of its
 * inside rect, and a five-by-five shed dropped anywhere in the middle of the field
 * with a tractor parked outside its door and a dirt track running out to the street.
 * It is the only C# building with no walls of its own — the fence is objects on
 * walkway, exactly as a junkyard's is, which is why the first thing it lays is
 * `FLOOR_WALKWAY` over the whole block.
 *
 * ## There is no `FLOOR_PLANTED` in here, and there never was going to be
 *
 * This building was believed to be blocked on `TileID.FLOOR_PLANTED` and on the
 * alpha10 farming system. **It is not, and the C# is why.** Read every tile the
 * reference lays and the list is four long:
 *
 * | C# line | tile | where |
 * | --- | --- | --- |
 * | `:3698` | `FLOOR_WALKWAY` | `TileRectangle(b.Rectangle)` — the ring and the floor under the fence |
 * | `:3699` | `FLOOR_GRASS` | `TileFill(b.InsideRect)` — the field |
 * | `:3711` | `FLOOR_DIRT` | one tile under each fence post, and the shed's floor/door/driveway |
 * | `:3812-3813` | `WALL_WOOD_PLANKS` / `FLOOR_DIRT` | the shed, and only the shed |
 * | `:3862`, `:3890` | `FLOOR_DIRT` | the shed's driveway |
 * | `:3896` | `FLOOR_ASPHALT` | the driveway's last tile, on the block's walkway ring |
 *
 * **Zero `FLOOR_PLANTED`.** The crops are map objects — one `MakeObjFarmPlant` per
 * inside-rect tile at `:3736-3738` — so the farm needs no farming substrate, no
 * planting verb and no seed item. `FLOOR_PLANTED` is reachable in the reference only
 * from `HandlePlayerPlantSeeds` (`RogueGame.cs:14208`), which is unported, and from
 * the burn handler (`RogueGame.cs:24731`), which *is* ported and does not care where
 * the tile came from. `ItemID.VEGETABLE_SEEDS` does exist, so the shed can now put
 * seeds on the floor — see {@link makeItemVegetableSeeds} — but planting them is still
 * unreachable, and that half of the farming system is the part a player would notice.
 *
 * ## The dispatch is a *band* of the green cascade, not a seam pass
 *
 * C# `:570-581` is the "Parks" region and the farm is the second of its five arms:
 *
 * ```csharp
 * int rolled = m_DiceRoller.Roll(0, 99);
 * if (rolled >= 65)                    greenSuccess = MakeParkBuilding(map, b, false);
 * else if (rolled >= 30 && rolled < 64) greenSuccess = MakeFarmBuilding(map, b);
 * else if (rolled >= 20 && rolled < 29) greenSuccess = MakeAnimalShelterBuilding(map, b);
 * else if (rolled >= 10 && rolled < 19) greenSuccess = MakeParkBuilding(map, b, true);
 * else                                 greenSuccess = MakeJunkyard(map, b);
 * ```
 *
 * So the farm does not roll for its own dispatch — the die belongs to the pass
 * (`BaseTownGenerator.makeJunkyards`), exactly as it does for the junkyard, the
 * animal shelter and the two park arms. **This file therefore takes no `dispatchRoll`
 * and exports no band constants**: unlike `./makeJunkyard` and
 * `./makeAnimalShelterBuilding`, which both narrow a band they were handed, the farm
 * has nothing to narrow. Widening the green gate so the farm stops consuming
 * `30..63` is the pass owner's change (`tests/graveyard.test.ts`'s band table is where
 * it is pinned), and it is deliberately not made here.
 *
 * The `< 64` is a C# bug — 64 falls through every arm into the junkyard, so the C#'s
 * farm is 34% and its junkyard 11% against the comments' "35% / 10%" — and
 * `makeJunkyards`' header already records that it is ported as written. Nothing in
 * this file reads the band, so nothing here has an opinion about it.
 *
 * ## The suitability gate is two redundant lines and is transcribed that way
 *
 * `:3690-3693` is:
 *
 * ```csharp
 * if (b.InsideRect.Width  < 8 || b.InsideRect.Height < 6) return false;
 * if (b.InsideRect.Width  < 6 || b.InsideRect.Height < 8) return false;
 * ```
 *
 * Together that is simply `width >= 8 && height >= 8` — the second line's `6` is
 * unreachable behind the first line's `8`, and its `8` is the only part of the pair
 * that does any work. **Both lines are written below as the C# writes them.** The
 * redundancy is a two-character edit someone has been meaning to make since Release
 * 7-3, and collapsing it to `if (w < 8 || h < 8)` would delete the evidence. Note the
 * arithmetic it implies: `Block` insets twice (`rectangle` → `buildingRect` →
 * `insideRect`, `TownBuilding.ts:222-231`), so a farm needs a **12x12 block** for an
 * 8x8 inside rect.
 *
 * ## `Roll(0, 3)` is three outcomes, and the comment beside it is wrong
 *
 * `:3729` reads `int plantType = m_DiceRoller.Roll(0, 3); //berries (1), peanuts (2) or crops (3)`.
 * `DiceRoller.Roll` is `m_Rng.Next(min, max)` (`Engine/DiceRoller.cs:37-45`) and
 * .NET's `Random.Next(min, max)` is **exclusive of max**, so this is `[0, 3)` — 0, 1,
 * 2, three outcomes, one third each. The comment numbers them 1, 2, 3 and calls the
 * third one "crops".
 *
 * **Both the numbering and the third name are stale.** The switch at `:3734-3740` is
 * `case 0` berry bush, `case 1` peanut plant, `case 2` **grape vine** — there is no
 * crops case at all, and `case 3` cannot happen. The numbers read as 1-based against
 * a 0-based switch, which is where the confusion started. The behaviour is preserved
 * exactly (a third of farms are vineyards); the comment here is corrected rather than
 * copied, and the discrepancy is recorded so the next reader does not "fix" the roll
 * to `roll(0, 4)` on the strength of a comment that describes four outcomes.
 *
 * ## The chickens are inside `#if false` upstream and nothing from them is ported
 *
 * `:3771-3801` is a whole numbered step — "5. Populate with chickens" — and its body
 * is compiled out. The C#'s own comment above it explains why: the eggs spawned
 * correctly, the chickens started correctly, and the animal AI still walked at least
 * two of them out of the farm and usually one *inside* the locked army base, and the
 * author never found out why. What the block contained, for the record, since its
 * absence below must not read as an omission:
 *
 * - `map.CountActorsBasedOn(a => a.Faction == TheUnintelligentAnimals)` to count the
 *   district's existing animals, and `Rules.MAX_UNINTELLIGENT_ANIMALS_PER_DISTRICT`
 *   to compute `chickensToSpawn` as a top-up;
 * - a `DoForEachTile(b.InsideRect, …)` over every field tile, and inside it
 *   `CreateNewChicken(0)` (itself a roll-bearing factory) and
 *   `ActorPlace(m_DiceRoller, 25, map, chicken, p => map.IsWalkable(pt) && map.GetActorAt(pt) == null)`
 *   — a rejection sampler that would spend up to 25 dice per chicken;
 * - on a successful spawn, two `MakeItemChickenEgg()` dropped on the tile and a
 *   `Logger.WriteLine` naming the chicken, its position and the tile's image;
 * - a `for (int i = 0; i < chickensToSpawn; i++)` **commented out** in the reference,
 *   so even with the `#if` removed it would spawn one chicken per eligible tile
 *   rather than top up to the cap.
 *
 * **All of it is skipped deliberately.** It is dead upstream, so porting it would be
 * porting a bug the author already threw away, and it is the single most expensive
 * thing in this file in dice: every chicken is up to 25 rolls plus a
 * `CreateNewChicken` model roll, over a field that can be 64 tiles. A farm that spent
 * those would move every roll in the rest of the district.
 *
 * ## `COMPASS_NSEW` is not `Direction.COMPASS_4`
 *
 * The fence orientation loop at `:3706` iterates `Direction.COMPASS_NSEW`, which is
 * `{ N, S, E, W }` (`Data/Direction.cs:86-89`) — **not** the cardinal-only
 * `Direction.COMPASS_4`, which the port has and which is `{ N, E, S, W }`
 * (`Direction.ts:26-28`). The order is load-bearing: the loop returns on the *first*
 * direction whose neighbour is walkway, so a corner tile that can see walkway both
 * north and east gets the E-W fence sprite under `COMPASS_NSEW` and the
 * NS-right sprite under `COMPASS_4`. {@link COMPASS_NSEW} is declared locally with
 * the C#'s order and the difference is written down.
 *
 * ## The shed's dice, in order
 *
 * After the field is planted, and only if the inside rect is larger than 6x6:
 *
 * 1. `Roll(InsideRect.Left, InsideRect.Right - 5)` — `shedX`, C# `:3759`. Half-open,
 *    so the shed can sit flush against the inside rect's left edge but never past its
 *    right, which is what keeps its walls and its door-front inside the field.
 * 2. `Roll(InsideRect.Top, InsideRect.Bottom - 5)` — `shedY`, C# `:3760`. Same.
 * 3. `Roll(0, 4)` — the shed's door side, C# `:3825`, re-rolled for every refusal.
 * 4. Per shed interior tile that survives the three guards, `Roll(0, 3)` for the
 *    object — C# `:3922` — and, only on its `case 2`, `RollChance(50)` for drums
 *    against a fire barrel (`:3928`).
 * 5. Per such tile, `Roll(0, 12)` for the shed item — `MakeFarmShedItem`, C# `:7869`
 *    — and, only on its `case 11`, `RollChance(15)` for a fishing rod against seeds
 *    (`:7884`).
 *
 * ## The shed's door rejection loop is *live*, and it is the fence
 *
 * `:3853-3861` re-rolls when the tile in front of the door holds something that is not
 * one of the three crops, on the reasoning that it must be a fence. **It is a fence,
 * and it happens for two of the four arms on some seeds.** The shed is rolled inside
 * `InsideRect` — `shedX ∈ [Left, Right - 5)`, half-open — so its west wall can land
 * exactly on the field's left column, and the tile one step west of it is then on
 * `BuildingRect`, which is the fence line:
 *
 * ```
 *   west  refuses when shedX == Left
 *   east  refuses when shedX == Right - 6
 *   north refuses when shedY == Top
 *   south refuses when shedY == Bottom - 6
 * ```
 *
 * All four are reachable: the farm's inside rect is at least 8, so
 * `shedX ∈ {Left, …, Right - 6}` and both the near and the far value are in range.
 * The crop case is the common one — the fill put a crop on every inside-rect tile, so
 * a door that faces the open field always finds a plant and clears it, and that is why
 * a tractor can be parked there at all (`MapObjectPlace` declines an occupied tile).
 *
 * **The loop terminates anyway, and the argument is arithmetic rather than
 * probabilistic:** west and east cannot both refuse, because that needs
 * `Left == Right - 6`, i.e. an inside rect six wide, and step 0 has already refused
 * anything under eight. Same for north and south. So at most two of the four arms are
 * refusable and every re-roll redraws all four — the same shape, and the same
 * reasoning, as the animal shelter's office door at `:4099-4117`.
 *
 * ## The shed's driveway loop
 *
 * `:3873-3893` is `do { … } while (1 < 2)` and its exit is "the tile model is
 * `FLOOR_WALKWAY`". It terminates because `TileRectangle(b.Rectangle)` at `:3698` put
 * walkway on the block's own ring, one tile outside `BuildingRect`, and the door-front
 * tile is at worst on the field's edge — so the walk outwards crosses the field, the
 * fence line, and lands on walkway two or three tiles later. The
 * `else if (tileModel != FLOOR_DIRT)` is what stops it eating the fence: the fence
 * pass at `:3711` laid `FLOOR_DIRT` under every post, so a fence tile matches neither
 * arm and the fence survives. Only the field's grass tiles — which hold crops — are
 * the ones the loop clears and re-paves. The final two lines (`:3895-3896`) then clear
 * the walkway tile and make it asphalt, which is the farm's only opening in the fence
 * line: a dirt track from the shed that stops at the fence, and an asphalt patch on
 * the pavement outside it.
 *
 * ## The dead local
 *
 * `:3762` declares `shedInsideRect` in `MakeFarmBuilding` and reads it never —
 * `MakeFarmShedBuilding` recomputes the identical rect at `:3809`. It is left out
 * here because `noUnusedLocals` is on, and the geometry it describes is built anyway,
 * by the shed.
 *
 * ## What the shed costs in crops, and why
 *
 * Step 2 fills the whole inside rect, and step 4 then takes a bite out of it: the
 * shed's twenty-five tiles by `ClearRectangle`, the door-front tile's one plant, and
 * one or two more where the track crosses open field. **So a farm has fewer than
 * `w * h` crops on the map, and the honest invariant is per-tile rather than a total:
 * inside the field, grass carries a crop and dirt or a plank wall does not.** The
 * count that survives is "one crop per grass tile", which is what
 * `tests/farm-building.test.ts` asserts.
 *
 * ## What the seam could not hand over
 *
 * `MakeObjWoodenFence` and `MakeObjFarmPlant` are the two factories this building
 * needs, and both are **new methods on `BaseMapGenerator`** rather than local copies,
 * because unlike the nine factories `makeAnimalShelterBuilding` had to re-declare
 * they have exactly one caller each and putting them on `BaseMapGenerator` is where
 * the C# keeps them (`BaseMapGenerator.cs:467` and `:1155`). What is left is seven
 * local transcriptions:
 *
 * | C# | port | note |
 * | --- | --- | --- |
 * | `MakeObjRollerDoor` `:421` | {@link makeObjRollerDoor} | byte-identical to `makeJunkyard.ts`'s copy; `isMetal` is left off because the C# sets it and the port's `DoorWindow` has no such field — see below |
 * | `MakeObjTractor` `:1165` | {@link makeObjTractor} | **`isMetal` is set** |
 * | `MakeObjWorkbench` `:989` | {@link makeObjWorkbench} | a bare container |
 * | `MakeObjJunk` `:728` | {@link makeObjJunk} | the Still Alive values, not the port's vanilla ones |
 * | `MakeObjBarrels` `:743` | {@link makeObjBarrels} | the Still Alive values |
 * | `MakeObjFireBarrel` `:758` | {@link makeObjFireBarrel} | identical to the port's `protected` copy |
 * | `MakeObjPowerGenerator` `:789` | {@link makeObjPowerGenerator} | a `PowerGenerator` state object |
 *
 * The three map-object copies that the port *has* — `makeObjJunk`, `makeObjBarrels`,
 * `makeObjFireBarrel` — are not the port's: `makeJunkyard.ts` already re-declares the
 * first two with the fork's numbers for exactly this reason, and the barrel is
 * identical. A Stage 5 building is the fork's building, and the divergence is
 * reported rather than papered over.
 *
 * `MakeObjRollerDoor` is the one place `IsMetal` is wanted and not available: the C#
 * sets it at `:425`, the port's `DoorWindow` has no such field, and the same omission
 * is recorded in `makeJunkyard.ts`'s copy and in `makeBankBuilding`'s doors. Adding a
 * field to a core class as a side effect of a generator is how that goes wrong —
 * `isMetal` landed in `MapObject` for `Feature.FuelStation` and nothing else has been
 * given it since.
 *
 * ## No actors, and no second map
 *
 * Neither method places an actor (the chickens are `#if false`) and neither creates
 * a map: the farm is entirely on the district's surface. That is the difference from
 * the animal shelter, which is the only ported building so far that needed
 * `ctx.addExit` and `params.district.addUniqueMap`.
 */

import { Item } from '@data/Item';
import { Models } from '@data/Models';
import type { Map as GameMap } from '@data/Map';
import { MapObject, MapObjectBreak, MapObjectFire } from '@data/MapObject';
import { Direction } from '@engine/Direction';
import { Feature, hasFeature } from '@engine/FeatureFlags';
import { Rect } from '@engine/Rect';
import { Session } from '@engine/Session';
import { Barrel, DoorWindow, PowerGenerator } from '@engine/mapobjects/MapObjects';
import { ItemMeleeWeapon } from '@engine/items/ItemWeapon';
import { GameImages } from '@gameplay/GameImages';
import { ItemID } from '@gameplay/GameItems';
import { TileID } from '@gameplay/GameTiles';
import type { TownBuildingContext } from '../TownBuilding';
import { BaseMapGenerator } from '../BaseMapGenerator';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * C# `Data/Direction.cs:86-89` `COMPASS_NSEW` = `{ N, S, E, W }`.
 *
 * **Not `Direction.COMPASS_4`, which the port has and which is `{ N, E, S, W }`.**
 * The fence loop at `:3706` returns on the first direction whose neighbour is
 * walkway, so the order decides which of two sprites a corner fence post gets. See
 * the module header.
 */
const COMPASS_NSEW: readonly Direction[] = [
  Direction.N,
  Direction.S,
  Direction.E,
  Direction.W,
];

/** C# `:3754` `SHED_WIDTH`, and `:3755` `SHED_HEIGHT` — the shed is 5x5, always. */
const SHED_WIDTH = 5;
const SHED_HEIGHT = 5;

/**
 * C# `:3729` `m_DiceRoller.Roll(0, 3)`, the farm's plant type. **Half-open, so
 * three outcomes**, and the C#'s own comment on that line ("berries (1), peanuts (2)
 * or crops (3)") is stale on both counts — see the module header. One roll per farm,
 * taken after the fence pass.
 */
const PLANT_TYPE_ROLLS = 3;

/** C# `:3756` — the shed is only built on an inside rect strictly larger than 6x6. */
const SHED_MIN_INSIDE = SHED_WIDTH + 1;
const SHED_MIN_INSIDE_Y = SHED_HEIGHT + 1;

/** C# `:3825` `m_DiceRoller.Roll(0, 4)`, the shed's door side. Half-open: 0..3. */
const SHED_DOOR_SIDES = 4;

/** C# `:3922` `m_DiceRoller.Roll(0, 3)`, the shed's per-tile object. */
const SHED_OBJECT_ROLLS = 3;

/** C# `:3928` `RollChance(50)` — drums against a fire barrel, inside `case 2`. */
const SHED_BARRELS_CHANCE = 50;

/**
 * C# `GameImages.cs:723` `OBJ_TRACTOR = @"MapObjects\tractor"`, used at `:3863`.
 *
 * **Declared on `GameImages` (added with this feature) so `sprite-assets.test.ts` covers it -- a local id is invisible to that test, which enumerates the class's own statics.**
 * The sprite does — `public/assets/images/classic/MapObjects/tractor.webp` ships with
 * the farm's other assets — so this is a missing constant and not a missing asset, and
 * it is the one thing in this file that belongs in `GameImages.ts` rather than in a
 * building. It is spelled with a forward slash like the six farm ids beside it,
 * because `imagePath()` normalises the C# backslash form anyway.
 *
 * It is *not* left out, and the alternative would have been to drop the tractor from
 * the farm: it is the object that says what the shed is for, and it is the only thing
 * on the door-front tile. `tests/sprite-assets.test.ts` only enumerates constants that
 * live on `GameImages`, so a local id is not covered by the "every id resolves to a
 * file" test — which is the other reason it wants moving.
 */


/** C# `MakeFarmShedItem`, `:7869` `m_DiceRoller.Roll(0, 12)`, the shed's per-tile item. */
const SHED_ITEM_ROLLS = 12;

/** C# `:7884` `RollChance(15)` — a fishing rod against seeds, inside `case 11`. */
const SHED_FISHING_ROD_CHANCE = 15;

// ── The C# method ─────────────────────────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:3685` `MakeFarmBuilding(map, b)` (Release 7-3).
 *
 * Returns `true` when the block became a farm, which is how `:573`'s
 * `greenSuccess = MakeFarmBuilding(map, b)` tells the green cascade the block is
 * finished with. Takes no `dispatchRoll`: the green region's shared `Roll(0, 99)` is
 * spent by the pass — see the module header.
 */
export function makeFarmBuilding(ctx: TownBuildingContext): boolean {
  // Behind `Feature.Farm` from the first statement, and it has to precede the
  // suitability return: under Classic a farm is not a cosmetic difference, it is a
  // block removed from the pool that the reference district would have kept.
  if (!hasFeature(Session.get().ruleset, Feature.Farm)) return false;

  const { map, block: b, roller } = ctx;

  ////////////////////////
  // 0. Check suitability
  ////////////////////////
  // C# `:3690-3691`. Kept as written, first half: an inside rect of 8 across and 6
  // down.
  if (b.insideRect.width < 8 || b.insideRect.height < 6) return false;
  // C# `:3692-3693`. Kept as written, second half: 6 across and 8 down. **Together
  // the two lines are just `width >= 8 && height >= 8`** — the `6`s are unreachable
  // behind the `8`s. Both are here because the redundancy is the record; see the
  // module header. `Block` insets twice, so 8x8 inside is a 12x12 block.
  if (b.insideRect.width < 6 || b.insideRect.height < 8) return false;

  /////////////////////////////
  // 1. Grass, walkway & fence
  /////////////////////////////
  // C# `:3698-3724`. Walkway over the whole block, grass over the inside rect (so
  // the fence line is grass and gets re-paved to dirt under each post), then a
  // `MapObjectFill` over the *building* rect that puts a fence on the perimeter and
  // chooses its orientation from the first cardinal neighbour that is walkway.
  //
  // There are no wall tiles anywhere: the fence *is* the boundary, and a farm is
  // walkable from the street to the crops and back. Same reason the junkyard's
  // `TileFill(FLOOR_DIRT, b.InsideRect)` has no `IsInside` decorator — this is
  // outdoors with a fence round it.
  const walkway = Models.tiles.get(TileID.FLOOR_WALKWAY)!;
  const dirt = Models.tiles.get(TileID.FLOOR_DIRT)!;
  ctx.tileRectangle(map, walkway, b.rectangle);
  ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_GRASS)!, b.insideRect);
  ctx.mapObjectFill(map, b.buildingRect, (pt) => {
    const onTheFenceLine =
      pt.x === b.buildingRect.left ||
      pt.x === b.buildingRect.right - 1 ||
      pt.y === b.buildingRect.top ||
      pt.y === b.buildingRect.bottom - 1;
    if (!onTheFenceLine) return null;

    // C# `:3706-3719`. `COMPASS_NSEW` order, and the `return` inside the loop is
    // what makes it "the first walkway neighbour wins" rather than "the last".
    for (const dir of COMPASS_NSEW) {
      const next = dir.applyTo(pt);
      if (!map.isInBounds(next.x, next.y)) continue;
      const nextTile = map.getTileAt(next.x, next.y);
      if (nextTile === null || nextTile.model !== walkway) continue;
      map.setTileModelAt(pt.x, pt.y, dirt);
      //if has footpath south or north then use EW
      if (dir === Direction.N || dir === Direction.S) {
        return makeObjWoodenFence(GameImages.OBJ_FARM_FENCE_EW);
      } else if (dir === Direction.E) {
        //else if has footpath east then use NS_right
        return makeObjWoodenFence(GameImages.OBJ_FARM_FENCE_NS_RIGHT);
      } else if (dir === Direction.W) {
        //else if has footpath west then use NS_left
        return makeObjWoodenFence(GameImages.OBJ_FARM_FENCE_NS_LEFT);
      }
    }
    return null;
  });

  ///////////////////////////////
  // 2. Random bushes / crops
  ///////////////////////////////
  // C# `:3729`. One roll per farm, and it is the farm's only roll before the shed's
  // two. Taken *after* the fence pass, which spends none.
  const plantType = roller.roll(0, PLANT_TYPE_ROLLS);
  // C# `:3730-3742`. The callback ignores `pt` on purpose: the C#'s does not read
  // it either, it just fills the whole inside rect in `MapObjectFill`'s order, so a
  // farm has a crop on **every** tile of its field. The switch is a total function
  // of the one roll and the `default` is the C#'s own
  // `throw new InvalidOperationException`, kept for the same reason.
  //
  // **The C#'s comment above `:3729` is wrong and this is the correction:** it reads
  // "berries (1), peanuts (2) or crops (3)", but `Roll(0, 3)` is half-open so there
  // are three outcomes numbered 0, 1, 2, and `case 2` is a **grape vine** — there is
  // no crops case. See the module header.
  ctx.mapObjectFill(map, b.insideRect, () => {
    switch (plantType) {
      case 0:
        return makeObjFarmPlant('berry bush', GameImages.OBJ_BERRY_BUSH);
      case 1:
        return makeObjFarmPlant('peanut plant', GameImages.OBJ_PEANUT_PLANT);
      case 2:
        return makeObjFarmPlant('grape vine', GameImages.OBJ_GRAPE_VINE);
      default:
        throw new RangeError('roll for plant type outside of range');
    }
  });

  ///////////
  // 3. Zone
  ///////////
  // C# `:3747-3749`. `"Farm"` exactly, capital F, and the walkway zones after it —
  // every one of the fourteen does this pair.
  const farmZone = ctx.makeUniqueZone('Farm', b.buildingRect);
  map.addZone(farmZone);
  ctx.makeWalkwayZones(map, b);

  ////////////
  // 4. Shed & entrance
  ////////////
  // C# `:3754-3769`. `insideRect` is already known to be at least 8x8 by step 0, so
  // the `> 6` gate below is always true and the shed is always built — which is
  // worth knowing, because it means the *shape* of this method does not depend on
  // its own suitability test. Both are kept: the C#'s test is the C#'s test, and a
  // reader checking the shed's arithmetic needs to see that the two constants are 5
  // and 6 rather than infer it.
  //
  // The C# also declares `shedInsideRect` here at `:3762` and never reads it; the
  // shed recomputes the identical rect at `:3809`. Left out, see the module header.
  if (b.insideRect.width > SHED_MIN_INSIDE && b.insideRect.height > SHED_MIN_INSIDE_Y) {
    // roll shed pos. C# `:3759-3760`, half-open: the shed can be flush with the
    // inside rect's left/top edge and can reach its right/bottom minus one, so its
    // walls are always on the field. **Its door-front tile is not** — a shed flush
    // against an edge puts one of its four door fronts on the fence line, which is
    // what the shed's rejection loop is for. See the module header.
    const shedX = roller.roll(b.insideRect.left, b.insideRect.right - SHED_WIDTH);
    const shedY = roller.roll(b.insideRect.top, b.insideRect.bottom - SHED_HEIGHT);
    const shedRect = new Rect(shedX, shedY, SHED_WIDTH, SHED_HEIGHT);

    // clear everything but zones in shed location. C# `:3765`. `false` because the
    // farm zone at `:3747` already covers it and the walkway zones must survive.
    ctx.clearRectangle(map, shedRect, false);

    // build it. C# `:3768`, with the `baseZoneName` argument spelled out: the C#'s
    // only call site passes the literal `"Shed"`, and `MakeFarmShedBuilding`'s
    // `block` parameter is never read.
    makeFarmShedBuilding(ctx, 'Shed', shedRect);
  }

  ///////////
  /// 5. Populate with chickens     //@@MP (Release 7-6)
  ///
  /// **The entire step is inside `#if false` upstream (`:3778-3801`) and NOTHING from
  /// it is ported.** The C#'s comment above it says why: the eggs all spawned in the
  /// farm, the chickens all started in the farm, and the animal AI still walked at
  /// least two of them off the block and usually one *inside* the locked army base,
  /// and the author never found out why. What it contained, so its absence here
  /// cannot read as an oversight: a `CountActorsBasedOn` over
  /// `TheUnintelligentAnimals` and a top-up against
  /// `Rules.MAX_UNINTELLIGENT_ANIMALS_PER_DISTRICT`; a `DoForEachTile` over the whole
  /// inside rect with a `CreateNewChicken(0)` and an `ActorPlace(m_DiceRoller, 25, …)`
  /// rejection sampler per tile; two `MakeItemChickenEgg()` and a `Logger.WriteLine`
  /// per successful spawn; and a `for (i < chickensToSpawn)` loop that is *itself*
  /// commented out in the reference. It is dead upstream, it is the most expensive
  /// thing in the file in dice (up to 25 rolls plus a chicken model roll per field
  /// tile, over a field that can be 64 tiles), and porting a bug the author threw
  /// away is not a port. See the module header.
  ///////////

  // Done. C# `:3804`.
  return true;
}

// ── C# `BaseTownGenerator.cs:3807` MakeFarmShedBuilding ───────────────────────

/**
 * C# `MakeFarmShedBuilding(map, baseZoneName, shedBuildingRect, block)`.
 *
 * `baseZoneName` is the literal `"Shed"` at the one call site and `block` is never
 * read, so both are folded: the zone is called `Shed` and the block is `ctx.block`'s.
 * Returns nothing in the C# and nothing here.
 *
 * The shed is the only walled thing on a farm and the only part of it that is
 * `IsInside`, so it is the only part that is dark at night.
 */
function makeFarmShedBuilding(
  ctx: TownBuildingContext,
  baseZoneName: string,
  shedBuildingRect: Rect
): void {
  const { map, roller } = ctx;
  const shedInsideRect = new Rect(
    shedBuildingRect.left + 1,
    shedBuildingRect.top + 1,
    shedBuildingRect.width - 2,
    shedBuildingRect.height - 2
  );
  const dirt = Models.tiles.get(TileID.FLOOR_DIRT)!;

  // build building & zone. C# `:3812-3814`. Plank walls as an outline, dirt inside
  // with `IsInside = true` — the decorator, as everywhere else, rather than an
  // `isInside` pass of its own.
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_WOOD_PLANKS)!, shedBuildingRect);
  ctx.tileFill(map, dirt, shedInsideRect, (tile) => {
    tile.isInside = true;
  });
  map.addZone(ctx.makeUniqueZone(baseZoneName, shedBuildingRect));

  /////
  // place shed door and make sure door front is cleared of objects (trees).
  /////
  // C# `:3819-3867`. A rejection loop whose refusal is **live**: the shed is rolled
  // inside `InsideRect`, so on some seeds a side's door-front tile is on `BuildingRect`
  // — the fence line — and the loop re-rolls. See the module header for the four
  // conditions and the arithmetic that keeps the loop terminating.
  //
  // What it does on the arm that succeeds is remove a crop from the tile in front of
  // the door, which is not a nicety: the crops are walkable objects, so one in the
  // doorway is a plant you walk through, and a tractor placed on top of one would
  // simply not appear (`MapObjectPlace` declines an occupied tile).
  let doorX = 0;
  let doorY = 0;
  let doorFrontX = 0;
  let doorFrontY = 0;
  let doorDir = 0;
  let placed = false;
  do {
    // **Half-open**, so 0..3, and the switch below handles all four — unlike the
    // shelter's entrance ladder, which has a `default` for its south arm.
    doorDir = roller.roll(0, SHED_DOOR_SIDES);
    switch (doorDir) {
      case 0: // west
        doorX = shedBuildingRect.left;
        doorY = shedBuildingRect.top + Math.trunc(shedBuildingRect.height / 2);
        doorFrontX = doorX - 1;
        doorFrontY = doorY;
        break;
      case 1: // east
        doorX = shedBuildingRect.right - 1;
        doorY = shedBuildingRect.top + Math.trunc(shedBuildingRect.height / 2);
        doorFrontX = doorX + 1;
        doorFrontY = doorY;
        break;
      case 2: // north
        doorX = shedBuildingRect.left + Math.trunc(shedBuildingRect.width / 2);
        doorY = shedBuildingRect.top;
        doorFrontX = doorX;
        doorFrontY = doorY - 1;
        break;
      case 3: // south
        doorX = shedBuildingRect.left + Math.trunc(shedBuildingRect.width / 2);
        doorY = shedBuildingRect.bottom - 1;
        doorFrontX = doorX;
        doorFrontY = doorY + 1;
        break;
    }
    //make sure the door is not against the fence
    const mapObj = map.getMapObjectAt(doorFrontX, doorFrontY);
    if (mapObj !== null) {
      if (
        mapObj.imageId === GameImages.OBJ_BERRY_BUSH ||
        mapObj.imageId === GameImages.OBJ_PEANUT_PLANT ||
        mapObj.imageId === GameImages.OBJ_GRAPE_VINE
      ) {
        map.removeMapObject(mapObj); //get rid of the plant
      } else {
        //it's a fence, which we dont want a door against, so roll again. **Live, and
        // not once per farm:** a shed whose wall lands on the field's edge puts the
        // door front on the fence line, and the loop re-rolls until it faces open
        // field. See the module header for which of the four arms can refuse and why
        // two of them cannot both refuse.
        continue;
      }
    }
    map.setTileModelAt(doorFrontX, doorFrontY, dirt); //start the driveway
    ctx.mapObjectPlace(map, doorFrontX, doorFrontY, makeObjTractor(GameImages.OBJ_TRACTOR));
    placed = true;
  } while (!placed);

  // The door tile is a plank wall, and `placeDoor` puts the floor down first, so
  // this repairs the wall to dirt rather than hanging a door on a plank.
  ctx.placeDoor(map, doorX, doorY, dirt, makeObjRollerDoor());

  ///////////////
  // driveway
  ///////////////
  // C# `:3872-3896`. `ex`/`ey` start on the door front — which the loop above just
  // made dirt, and which is inside the field because the loop only accepted a side
  // whose front was not the fence — and walk outwards until they hit the block's own
  // walkway ring. The `else if` is the fence guard: the fence pass re-paved every post
  // to `FLOOR_DIRT`, so a fence tile matches neither arm and survives, and only the
  // field's grass tiles get cleared and re-paved.
  //
  // **The `while (1 < 2)` is an unbounded loop upstream and is a `for (;;)` here**
  // for the reason `makeAnimalShelterBuilding` writes the same way: the exit
  // condition is a tile model, and `TileRectangle(b.Rectangle)` at `:3698`
  // guarantees the ring is reachable. It cannot walk off the map.
  const walkway = Models.tiles.get(TileID.FLOOR_WALKWAY)!;
  let ex = doorFrontX;
  let ey = doorFrontY;
  for (;;) {
    switch (doorDir) {
      case 0:
        ex -= 1;
        break; // west
      case 1:
        ex += 1;
        break; // east
      case 2:
        ey -= 1;
        break; // north
      case 3:
        ey += 1;
        break; // south
      default:
        throw new RangeError('roll for driveway direction outside of range');
    }

    // The C# would throw on a tile outside the map. It cannot be: see above.
    const tileModel = map.getTileAt(ex, ey)!.model;
    if (tileModel === walkway) {
      //keep paving the driveway until we hit the walkway
      break;
    } else if (tileModel !== dirt) {
      removeMapObjectAt(map, ex, ey); //get rid of plants
      map.setTileModelAt(ex, ey, dirt);
    }
  }

  // The farm's only opening: the walkway tile the track crossed becomes asphalt.
  removeMapObjectAt(map, ex, ey);
  map.setTileModelAt(ex, ey, Models.tiles.get(TileID.FLOOR_ASPHALT)!);

  /////////
  // mark as inside and add workbench with tools
  /////////
  // C# `:3901-3942`. The generator is deliberately *outside* the switch — the C#'s
  // own comment at `:3913` says it was moved there in Release 7-6 "in order to make
  // it guaranteed spawn", because a `Roll(0, 3)` that rolls `default` leaves the
  // first tile bare. The three guards are the C#'s in the C#'s order: walkable, not
  // beside a door, and *has* a wall — so the shed's contents hug its walls and the
  // generator lands on the first eligible tile in `DoForEachTile`'s column-major
  // order.
  let alreadyPlacedGenertor = false; // the C#'s own spelling of the flag, at :3901
  ctx.doForEachTile(map, shedInsideRect, (pt) => {
    if (!map.isWalkablePoint(pt)) return;

    if (ctx.countAdjDoors(map, pt.x, pt.y) > 0) return;

    if (ctx.countAdjWalls(map, pt.x, pt.y) === 0) return;

    // generator. C# `:3913-3918`.
    if (!alreadyPlacedGenertor) {
      alreadyPlacedGenertor = true;
      ctx.mapObjectPlace(
        map,
        pt.x,
        pt.y,
        makeObjPowerGenerator(GameImages.OBJ_POWERGEN_OFF, GameImages.OBJ_POWERGEN_ON)
      );
    } else {
      // objects. C# `:3920-3934`. `case 2` costs two dice, the other two cost one.
      switch (roller.roll(0, SHED_OBJECT_ROLLS)) {
        case 0:
          ctx.mapObjectPlace(map, pt.x, pt.y, makeObjWorkbench(GameImages.OBJ_WORKBENCH));
          break;
        case 1:
          ctx.mapObjectPlace(map, pt.x, pt.y, makeObjJunk(GameImages.OBJ_JUNK));
          break;
        case 2:
          ctx.mapObjectPlace(
            map,
            pt.x,
            pt.y,
            roller.rollChance(SHED_BARRELS_CHANCE)
              ? makeObjBarrels(GameImages.OBJ_BARRELS)
              : makeObjFireBarrel(GameImages.OBJ_EMPTY_BARREL) //@@MP (Release 7-6)
          );
          break;
        default:
          break; //nothing
      }
    }

    // construction item (tools, lights). C# `:3937-3941`. Dropped whether or not an
    // object was placed, and it goes *under* the workbench and the barrels, which
    // are containers — that is the point, same as the junkyard's salvage.
    const it = makeFarmShedItem(ctx);
    if (it.model.isStackable) it.quantity = it.model.stackingLimit;
    map.dropItemAt(it, pt);
  });
}

// ── C# `BaseTownGenerator.cs:7867` MakeFarmShedItem ────────────────────────────

/**
 * C# `MakeFarmShedItem()` (Release 7-6) — one `Roll(0, 12)` over the district's
 * roller, spent once per eligible shed tile, after that tile's object roll.
 *
 * `roll(0, 12)` returns 0..11, so the C#'s
 * `default: throw new InvalidOperationException("unhandled roll")` is unreachable and
 * has no counterpart here.
 *
 * **Arms 5..9 and arm 11's else are vegetable seeds, and all six now build.** They
 * used to return `null` and leave the tile bare while still spending the die; see
 * {@link makeItemVegetableSeeds}. The return type is `Item` and not `Item | null`
 * because every arm of the roll is now a real item, which is what makes the drop
 * below unconditional.
 */
function makeFarmShedItem(ctx: TownBuildingContext): Item {
  switch (ctx.roller.roll(0, SHED_ITEM_ROLLS)) {
    case 0:
      return makeItemShovel();
    case 1:
      return makeItemPickaxe();
    case 2:
      return makeItemChainsaw();
    case 3:
      return makeItemPitchFork();
    case 4:
      return makeItemScythe();
    case 5:
    case 6:
    case 7:
    case 8:
    case 9:
      return makeItemVegetableSeeds();
    case 10:
      return makeItemMachete();
    case 11:
      return ctx.roller.rollChance(SHED_FISHING_ROD_CHANCE)
        ? makeItemFishingRod()
        : makeItemVegetableSeeds();
    default:
      throw new RangeError('unhandled roll');
  }
}

// ── Map operations the port spells differently ─────────────────────────────────

/**
 * C# `Map.RemoveMapObjectAt(int, int)` — `Data/Map.cs`. The port's `Map` has
 * `removeMapObject(obj)` and no by-position form, and every `RemoveMapObjectAt` in
 * these two methods is "if there is one there, take it off".
 */
function removeMapObjectAt(map: GameMap, x: number, y: number): void {
  const obj = map.getMapObjectAt(x, y);
  if (obj) map.removeMapObject(obj);
}

// ── The two factories promoted to `BaseMapGenerator` ──────────────────────────
//
// These two are `public static` on the generator rather than re-declared here: the
// C# has them `protected static` (`BaseMapGenerator.cs:467` and `:1155`), the
// headers on each say what they are for, and this file has a `TownBuildingContext`
// rather than a `this` to call an instance method on. A private copy here would be
// the ninth duplicate this project has collected, and the one thing worth not adding
// is a second place for a crop's two hit points and its `IsWalkable` to disagree.
//
// **The farm's crops are map objects, one per inside-rect tile** — which is why this
// building needs no farming substrate. See the module header on `FLOOR_PLANTED`.
const makeObjWoodenFence = BaseMapGenerator.makeObjWoodenFence;
const makeObjFarmPlant = BaseMapGenerator.makeObjFarmPlant;

// ── Factories the seam could not hand over: map objects ───────────────────────

/**
 * C# `BaseMapGenerator.cs:421` `MakeObjRollerDoor` — the shed's door, and six times a
 * wooden door's hit points with no wood, so a survivor who wants into the shed has
 * to break it.
 *
 * Byte-identical to `makeJunkyard.ts`'s copy. **`IsMetal` is the one field the C#
 * sets (`:425`, Release 5-4) and the port's `DoorWindow` has no room for** — the port's
 * `DoorWindow` inherits `MapObject.isMetal` but the C#'s initialiser is not a
 * constructor argument, so the fork's metal-ness of a roller door is not carried.
 * The same omission is recorded in `makeBankBuilding`'s doors.
 */
function makeObjRollerDoor(): DoorWindow {
  return new DoorWindow(
    'roller door',
    GameImages.OBJ_ROLLER_DOOR_CLOSED,
    GameImages.OBJ_ROLLER_DOOR_OPEN,
    GameImages.OBJ_ROLLER_DOOR_BROKEN,
    6 * DoorWindow.BASE_HITPOINTS
  );
}

/**
 * C# `BaseMapGenerator.cs:1165` `MakeObjTractor` — the one vehicle a farm has, parked
 * on the tile in front of the shed door.
 *
 * **`IsMetal` is set**, unlike the roller door's: `isMetal` is a `MapObject` field and
 * a tractor is a plain `MapObject`, so the C#'s `:1171` is a one-liner with nothing
 * missing. It only reaches the push/break sound effects (`RogueGame.cs:22607`,
 * `:22739`) — a tractor is UNBREAKABLE and not walkable, so nothing ever asks what it
 * is made of in any other way.
 */
function makeObjTractor(tractorImageID: string): MapObject {
  const tractor = new MapObject('tractor', tractorImageID);
  tractor.jumpLevel = 1;
  tractor.standOnFovBonus = true;
  tractor.isMetal = true;
  tractor.isMovable = false;
  return tractor;
}

/**
 * C# `BaseMapGenerator.cs:989` `MakeObjWorkbench` — a bare `MapObject` that is a
 * container, so the shed item dropped on the same tile goes *inside* it.
 */
function makeObjWorkbench(workbenchImageID: string): MapObject {
  const workbench = new MapObject('workbench', workbenchImageID);
  workbench.isContainer = true; //@@MP (Release 5-3)
  return workbench;
}

/**
 * C# `BaseMapGenerator.cs:728` `MakeObjJunk` — the Still Alive values, *not* the port's
 * own `protected makeObjJunk` (`:785`), which is vanilla's: one hit point,
 * `UNINFLAMMABLE`, no jump, no fov bonus, not a container, six kilos.
 *
 * The fork made junk breakable, strong, burnable, jumpable, and above all a
 * *container* (Release 5-3), which is what makes the shed's tools reachable when
 * they land on the pile. Identical to `makeJunkyard.ts`'s copy of the same factory.
 */
function makeObjJunk(junkImageID: string): MapObject {
  const junk = new MapObject(
    'junk',
    junkImageID,
    MapObjectBreak.BREAKABLE,
    MapObjectFire.BURNABLE,
    DoorWindow.BASE_HITPOINTS * 3
  );
  junk.isPlural = true;
  junk.isMaterialTransparent = true;
  junk.jumpLevel = 1;
  junk.standOnFovBonus = true;
  junk.isMovable = true;
  junk.isContainer = true;
  junk.givesWood = true;
  junk.weight = 15;
  return junk;
}

/**
 * C# `BaseMapGenerator.cs:743` `MakeObjBarrels` — the Still Alive values against the
 * port's own `protected makeObjBarrels` (`:801`), which is breakable, movable, gives
 * wood and weighs ten kilos. The fork made the stack unbreakable (Release 6-2) and
 * immovable (Release 7-6) and a container, so a shed's drum stack is a thing you loot
 * rather than a thing you tear apart. Identical to `makeJunkyard.ts`'s copy.
 */
function makeObjBarrels(barrelsImageID: string): MapObject {
  const barrels = new MapObject(
    'barrels',
    barrelsImageID,
    MapObjectBreak.UNBREAKABLE,
    MapObjectFire.UNINFLAMMABLE,
    DoorWindow.BASE_HITPOINTS * 2
  );
  barrels.isPlural = true;
  barrels.isMaterialTransparent = true;
  barrels.isMovable = false;
  barrels.isContainer = true;
  return barrels;
}

/**
 * C# `BaseMapGenerator.cs:758` `MakeObjFireBarrel` — a *lit-able* barrel, and the only
 * one of the two the shed's `case 2` can put down.
 *
 * Field for field identical to the port's `protected makeObjFireBarrel` (`:609`) and
 * to `makeJunkyard.ts`'s copy; carried here only because the method is `protected`
 * and the context does not have it. `hoverDescription` (Release 7-6) is not a field
 * the port's `MapObject` has, for the reason `BaseMapGenerator` gives at `:617`.
 */
function makeObjFireBarrel(barrelImageID: string): Barrel {
  const barrel = new Barrel('receptacle', barrelImageID, MapObjectBreak.UNBREAKABLE, 0);
  barrel.isMaterialTransparent = true;
  barrel.isContainer = true;
  barrel.isMovable = true;
  barrel.isWalkable = true;
  barrel.weight = 4;
  barrel.fireState = MapObjectFire.BURNABLE;
  return barrel;
}

/** C# `BaseMapGenerator.cs:789` `MakeObjPowerGenerator(off, on)` — the shed's light. */
function makeObjPowerGenerator(offImageID: string, onImageID: string): PowerGenerator {
  return new PowerGenerator('power generator', offImageID, onImageID);
}

// ── Factories the seam could not hand over: items ─────────────────────────────

/** C# `BaseMapGenerator.cs:1436` `MakeItemShovel` — the shed item roll's `case 0`. */
function makeItemShovel(): Item {
  return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_SHOVEL));
}

/** C# `:1738` `MakeItemPickaxe` — `case 1`. */
function makeItemPickaxe(): Item {
  return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_PICKAXE));
}

/** C# `:1893` `MakeItemChainsaw` — `case 2`, and `IsForbiddenToAI` because the AI cannot fuel it. */
function makeItemChainsaw(): Item {
  const chainsaw = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_CHAINSAW));
  //AI can't use them because they need fuel cans for ammo, which is currently only
  //handled for the player. TODO "in the future"?
  chainsaw.isForbiddenToAI = true;
  return chainsaw;
}

/** C# `:2094` `MakeItemPitchFork` — `case 3`. */
function makeItemPitchFork(): Item {
  return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_PITCH_FORK));
}

/** C# `:2099` `MakeItemScythe` — `case 4`. */
function makeItemScythe(): Item {
  return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_SCYTHE));
}

/** C# `:1728` `MakeItemMachete` — `case 10`. */
function makeItemMachete(): Item {
  return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_MACHETE));
}

/**
 * C# `:2188` `MakeItemFishingRod` — `MakeFarmShedItem`'s `case 11`, 15% of the time.
 *
 * **A bare `Item`, not an `ItemMeleeWeapon`**, and that is the C#'s
 * `new Item(GameItems.FISHING_ROD)`: the rod's port model sets
 * `equipmentPart = DollPart.LEFT_HAND` and `dontAutoEquip = true` but is an
 * `ItemModel`, not an `ItemWeaponModel` (`GameItems.ts:1031-1041`), and
 * `ItemWeapon`'s constructor rejects a non-weapon model outright. The rod is used, not
 * swung.
 */
function makeItemFishingRod(): Item {
  return new Item(Models.items.get(ItemID.FISHING_ROD));
}

/**
 * C# `BaseMapGenerator.cs:1825-1831` `MakeItemVegetableSeeds` — a plain `Item`, and
 * `IsForbiddenToAI` is the whole of it.
 *
 * **The C#'s spelling of the item is `"bunch of vegie seeds"` and the port keeps it
 * verbatim**, typo and all; see `GameItems.ts` where the model is built. There is
 * nothing to substitute and nothing to normalise here either: `Models.items.get`
 * resolves the id, and the id is what the shed's dice stream was already paying for
 * whether or not this function could build anything.
 *
 * `IsForbiddenToAI` because the seeds are only meaningful with a shovel or a pickaxe
 * in hand and `HandlePlayerPlantSeeds` (`RogueGame.cs:14208`) is still unported, so a
 * survivor holding one has nothing it can do with them.
 *
 * This used to be `null` -- the one thing in this building the port could not make --
 * and its being real now is what turns `MakeFarmShedItem` back into a total function.
 */
function makeItemVegetableSeeds(): Item {
  const seeds = new Item(Models.items.get(ItemID.VEGETABLE_SEEDS));
  seeds.isForbiddenToAI = true;
  return seeds;
}
