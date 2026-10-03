/**
 * `Feature.AnimalShelter` — C# `BaseTownGenerator.cs:3945-4042`
 * `MakeAnimalShelterBuilding`, plus the two private helpers it calls:
 * `:4044-4187` `MakeAnimalShelterOfficeBuilding` and `:4189-4251`
 * `GenerateAnimalShelter_KennelsLevel`.
 *
 * An animal shelter is the only town building in the reference that is a *place*
 * rather than a room: a chain wire yard full of trees, a five-by-five office in
 * one corner of it with a van parked outside the door, and a kennel level one
 * storey down holding ten three-by-three cells off a corridor. The surface and
 * the kennel level are joined by a stairwell at the office's north-west inside
 * corner, and both ends of it are `AddExit(…, isAnAIExit: true)`, so a dog could
 * walk between them.
 *
 * ## The dispatch is band `20..29` of the green cascade, and takes its roll
 *
 * C# `:570-582` is the "Parks" region's tail, and the shelter is the middle of
 * its five arms:
 *
 * ```csharp
 * int rolled = m_DiceRoller.Roll(0, 99);
 * if (rolled >= 65)                        greenSuccess = MakeParkBuilding(map, b, false);
 * else if (rolled >= 30 && rolled < 64)     greenSuccess = MakeFarmBuilding(map, b);
 * else if (rolled >= 20 && rolled < 29)     greenSuccess = MakeAnimalShelterBuilding(map, b);
 * else if (rolled >= 10 && rolled < 19)     greenSuccess = MakeParkBuilding(map, b, true);
 * else                                     greenSuccess = MakeJunkyard(map, b);
 * ```
 *
 * So it does not roll for its own dispatch: the die arrives as
 * {@link makeAnimalShelterBuilding}'s `dispatchRoll`, spent by
 * `BaseTownGenerator.makeJunkyards`, because four other buildings want it. See
 * the module header in `./makeJunkyard`, which is the same argument.
 *
 * ### The `< 29` is read as `< 30`, and that is a decision, not a transcription
 *
 * The C# writes `>= 20 && rolled < 29`, which is nine values (20..28) for an arm
 * whose own comment says "10%", and its graveyard sibling writes `< 19` for the
 * same reason: every `X9` upper bound in this cascade is one short of the ten the
 * comments describe. The band's *intent* is 20..29 and this port takes the
 * intent, for two reasons that are not stylistic:
 *
 * - **the graveyard arm above it already did.** `makeJunkyards` reads
 *   `rolled >= 10 && rolled < 20` where the C# writes `< 19`, so the cascade's
 *   convention in this port is ten values per 10% arm. Reading this arm any other
 *   way would make the two neighbours 10 and 9 wide and leave the seams visible.
 * - **the band table in `tests/graveyard.test.ts` pins it.** That test's bands
 *   are `park 65..99 / farm 30..63 / shelter 20..29 / graveyard 10..19 /
 *   junkyard 0..9`, and its whole point is that they are *disjoint* — which is
 *   what lets the port test a band before handing the roll on and still agree
 *   with the C#'s ordered `if/else`. `< 29` would put 29 in no band at all, and a
 *   roll nobody claims is a roll the cascade silently drops.
 *
 * **The farm's off-by-one at `64` is *not* touched.** That is a different call and
 * it belongs to `Feature.Farm`: the C#'s `rolled < 64` sends 64 down the trailing
 * `else`, and `makeJunkyards`' header records that as a C# bug the port kept
 * verbatim. This arm's bounds are `20..30`, which touches nothing above 30, so
 * the farm's question is still open and is still decided when the farm lands.
 *
 * ## The dogs: ten `createNewFeralDog` + `actorPlace` calls, through the seam
 *
 * C# `:4230` builds a `CreateNewFeralDog(0)` in each of the ten kennel cells,
 * `:4231-4233` drops three cooked chickens on the tile beside it, and `:4234`
 * puts the dog at `kennelPos`. All three lines are ported.
 *
 * The spawn used to be left out on purpose, on two grounds, and both are gone.
 *
 * - **The dice.** `createNewFeralDog` calls `skinDog`
 *   (`BaseMapGenerator.cs:92`), which spends exactly one `Roll(0, N)` per dog
 *   off the district's roller, so ten cells is ten rolls that had to land in the
 *   C#'s order or every roll after the shelter would move and a different
 *   district would come out the other end. They do: the factory is
 *   `ctx.createNewFeralDog`, the delegate in `BaseTownGenerator.placement()`
 *   calls `this.createNewFeralDog`, and that spends `this.m_DiceRoller` — the
 *   same object `ctx.roller` hands out, once per cell, in the C#'s order. Ten
 *   rolls, no module-level RNG, and nothing drawn from the kennel level's own
 *   seed, which is a *map* seed derived from the surface map's at `:4197` and is
 *   not a dice source at all.
 * - **The seam.** The decision to spawn actors during world generation had no
 *   recorded call, so a building that invented a spawner would have owned the
 *   second, unrecorded copy of it. `TownBuilding.ts` now declares the seam that
 *   omission was waiting for — `actorPlace` (`:397`) and, added beside it,
 *   `createNewFeralDog` (`:395`) — so the ten dogs are placed the recorded way,
 *   like every other actor the world generates.
 *
 * ### The one place this port spends dice the C# does not
 *
 * C# `:4234` is `map.PlaceActorAt(dog, kennelPos)` (`Data/Map.cs:653`): a direct
 * place onto a tile the method already knows, and **no dice whatsoever**.
 * `ctx.actorPlace` is the port's `MapGenerator.actorPlace` — the C#'s
 * `Engine/MapGenerator.cs:224` — and it is a rejection sampler: it rolls a
 * candidate position over the whole map and only then asks `goodPositionFn`
 * whether it landed on the tile the C# named. Hitting one specific tile of a
 * 21x8 level costs about 168 attempts at two rolls apiece, so a kennel level now
 * costs the district stream roughly `10 x 168 x 2` rolls where the C# spent 10.
 *
 * That is the price of going through the recorded seam rather than around it,
 * and it is a *recorded* difference rather than an accident: the alternative was
 * a second, private way for a building to put an actor somewhere, which is the
 * thing the omission existed to prevent. It is Still Alive only, because the
 * `Feature.AnimalShelter` gate is the first statement of
 * {@link makeAnimalShelterBuilding} and runs before the first roll — which is
 * why the CLASSIC fingerprint `9bb5e4907bc3f62c` (asserted across eleven test
 * files, `tests/bank-building.test.ts` among them) is unmoved by any of this. A Still Alive district generated before this change
 * and one generated after are not the same district, and that belongs in a
 * comment rather than in a pair of worlds somebody has to diff to notice.
 *
 * `tests/animal-shelter.test.ts` drives the real generator and counts the dogs.
 *
 * ## The dead locals
 *
 * The C# declares two and reads neither: `officeInsideRect` at `:3985` in the
 * outer method (the helper recomputes it at `:4046`) and the `cells` list at
 * `:4211`, which accumulates ten rects that nothing ever asks for. Both are left
 * out rather than transliterated, because `noUnusedLocals` is on and a
 * `void`-consumed variable is noise; the geometry they describe is built anyway,
 * by the helper and by the loop.
 *
 * ## What the seam could not hand over
 *
 * Nine `makeObj*`/`makeItem*` factories, none of them on `TownBuildingContext`,
 * re-declared below and transliterated so the C# method is ported whole rather
 * than truncated. They are the candidates for the next addition to the context;
 * promoting them means deleting the copies here.
 *
 * | C# | port | wanted as | new? |
 * | --- | --- | --- | --- |
 * | `MakeObjFence` `BaseMapGenerator.cs:444` | {@link makeObjChainwireFence} | `ctx.makeObjChainwireFence` | **no** — byte-identical to `makeJunkyard.ts`'s copy |
 * | `MakeObjKennelFence` `:458` | {@link makeObjKennelFence} | `ctx.makeObjKennelFence` | **yes** |
 * | `MakeObjChainFenceGate` `:1176` | {@link makeObjChainFenceGate} | `ctx.makeObjChainFenceGate` | **yes**, with three `GameImages` ids |
 * | `MakeObjVan` `:1195` | {@link makeObjVan} | `ctx.makeObjVan` | **yes**, with one `GameImages` id |
 * | `MakeObjTree` `:535` | {@link makeObjTree} | `ctx.makeObjTree` | **yes** — the port's `protected` copy is vanilla's and has half the hit points |
 * | `MakeObjTable` `:681` | {@link makeObjTable} | `ctx.makeObjTable` | **yes** — `BURNABLE`, 6 kg |
 * | `MakeObjChair` `:693` | {@link makeObjChair} | `ctx.makeObjChair` | **yes** — `BURNABLE`, not jumpable |
 * | `MakeObjShelf` `:595` | {@link makeObjShelf} | `ctx.makeObjShelf` | **no** — byte-identical to `makeClinicBuilding.ts`'s copy |
 * | `MakeItemBigFlashlight` `:1640` | {@link makeItemBigFlashlight} | `ctx.makeItemBigFlashlight` | **yes** |
 * | `MakeItemBinoculars` `:1872` | {@link makeItemBinoculars} | `ctx.makeItemBinoculars` | **yes** |
 * | `MakeItemCookedChicken` `:2238` | {@link makeItemCookedChicken} | — | **yes**, and deliberately *not* the port's own `makeItemCookedChicken` |
 *
 * **`MakeItemCookedChicken` is the one place this port takes the C# over its own
 * copy.** The C#'s is deterministic — `turnCounter + TURNS_PER_DAY * BestBeforeDays`,
 * no roll at all — while `BaseMapGenerator.makeItemCookedChicken` (`:1193`) rolls
 * `m_Rules.roll(min, max)` for a best-before somewhere in the second half of the
 * window. Reaching past `ctx.roller` for `ctx.game.rules` is the coupling
 * `./TownBuilding` exists to remove, and the C#'s costs the district nothing, so
 * the C#'s is what a kennel cell gets. The two disagree about freshness and
 * nothing else.
 *
 * The four map-object factories that the port *has* (`tree`, `table`, `chair`,
 * `shelf`) are not the port's: all four are vanilla's numbers where the fork's
 * are `BURNABLE` and heavier, and the tree has `BASE_HITPOINTS * 20` upstream
 * against the port's `* 10`. A Stage 5 building is the fork's building and the
 * divergence is reported rather than papered over, for the reason
 * `makeClinicBuilding`'s `makeObjShelf` gives.
 *
 * `IsMetal` (Release 5-4) is not a field the port's `MapObject` has and is left
 * off everywhere here, for the reason `BaseMapGenerator.makeObjFireBarrel` gives
 * at `:617`.
 *
 * ## The kennel level's shared fence columns
 *
 * `:4226` steps `x` by `cellWidth - 1` over a map `cellWidth` wide, so
 * neighbouring cells share the column between them: the cell at `x = 0` spans
 * columns 0-2 and the cell at `x = 2` spans 2-4. Each wants a kennel fence on
 * column 2, and `MapObjectFill` (`Engine/MapGenerator.cs:329`) declines a tile
 * that already has an object, so the shared column is fenced once — by whichever
 * cell is filled first. Ten cells, five shared columns, and five free-standing
 * fences at columns 0, 4, 8, 12, 16 and 20. Transliterated as written: the shape
 * is legible (each cell has a gate at `x + 1` reachable from the corridor, and
 * the shared columns are the ones between two gates) and "fixing" it would move
 * every wall in every kennel.
 *
 * The `Release 7-6` note on `:4196` ("expanded the height by 2") is why the cells
 * are flush with the map's bottom and left edges: `yCells = 5` plus `cellHeight
 * = 3` is 8, which is the whole map, so the bottom and left wall tiles the
 * `TileRectangle` laid at `:4203` are overwritten by concrete and kennel fence.
 * Also transliterated, and also load-bearing — it is where the level's floor
 * stops being a floor.
 */

import type { Item } from '@data/Item';
import { Lighting, Map as GameMap } from '@data/Map';
import { MapObject, MapObjectBreak, MapObjectFire } from '@data/MapObject';
import { Models } from '@data/Models';
import { Feature, hasFeature } from '@engine/FeatureFlags';
import { Point } from '@engine/Point';
import { Rect } from '@engine/Rect';
import { Session } from '@engine/Session';
import { WorldTime } from '@engine/WorldTime';
import { ItemFood, ItemFoodModel } from '@engine/items/ItemFood';
import { ItemLight } from '@engine/items/ItemLight';
import { Car, DoorWindow } from '@engine/mapobjects/MapObjects';
import { GameImages } from '@gameplay/GameImages';
import { ItemID } from '@gameplay/GameItems';
import { TileID } from '@gameplay/GameTiles';
import type { TownBuildingContext } from '../TownBuilding';

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * C# `:577`, the shelter's band of the green cascade's `Roll(0, 99)`.
 *
 * **Half-open `[20, 30)`, where the C# writes `< 29`.** See the module header:
 * the cascade's comments describe 10% for this arm and its graveyard sibling,
 * the port already reads the sibling's `< 19` as `< 20`, and
 * `tests/graveyard.test.ts`'s band table pins this arm at 20..29. Read as
 * `< 29` this would be a nine-wide band with an orphan at 29.
 */
export const ANIMAL_SHELTER_ROLL_MIN = 20;
export const ANIMAL_SHELTER_ROLL_MAX = 30;

/** C# `:3952` — the block is too small for an office *and* a yard. */
const SHELTER_MIN_INSIDE = 6;

/** C# `:3971` — the office, and it is the same size whichever way it faces. */
const OFFICE_WIDTH = 5;
const OFFICE_HEIGHT = 5;

/**
 * C# `BaseTownGenerator.cs:528` `PARK_TREE_CHANCE`, reached through
 * `BaseTownGenerator`'s module constant of the same name. The shelter reuses the
 * park's tree chance rather than declaring one, so a shelter's yard is as sparse
 * as a park's.
 */
const PARK_TREE_CHANCE = 25;

/** C# `BaseTownGenerator.cs:528`, the four tree sprites `MakeObjParkTree` picks from. */
const PARK_TREES: readonly string[] = [
  GameImages.OBJ_TREE1,
  GameImages.OBJ_TREE2,
  GameImages.OBJ_TREE3,
  GameImages.OBJ_TREE4,
];

/** C# `:4100` — `MakeObjVan`'s tank, off a `Roll(0, 30)`. */
const VAN_FUEL_MAX = 30;

/** C# `:4139` — the office's shelves, and their contents, against a `RollChance`. */
const OFFICE_SHELF_CHANCE = 50;

// ── C# `:4191` GenerateAnimalShelter_KennelsLevel ────────────────────────────

/** C# `:4204` `:4205` — a kennel cell is three by three, and there are five rows. */
const KENNEL_CELL_WIDTH = 3;
const KENNEL_CELL_HEIGHT = 3;
const KENNEL_CELL_TOP = 5;

/**
 * C# `:4197`, the level's dimensions. `21x8` is the Release 7-6 "expanded the
 * height by 2": five rows of three cells exactly fills it, so the cells sit flush
 * with the bottom edge and over the bottom wall. See the module header.
 */
const KENNELS_LEVEL_WIDTH = 21;
const KENNELS_LEVEL_HEIGHT = 8;

/** C# `:4222` — the stairwell's foot on the kennel level, and its head on both. */
const KENNELS_LEVEL_EXIT = { x: 2, y: 1 };

/** C# `:4245` — the corridor zone, `Rectangle.FromLTRB(1, 1, map.Width, yCells)`. */
const KENNELS_CORRIDOR_LEFT = 1;
const KENNELS_CORRIDOR_TOP = 1;

/**
 * `maxTries` for the ten `ctx.actorPlace` calls that put the dogs on `kennelPos`
 * (C# `:4234`).
 *
 * **Twenty attempts per tile of the level, and the arithmetic is the whole
 * reason the number is a constant and not a literal.** `actorPlace` samples a
 * position uniformly over the map before it asks `goodPositionFn` about it, and
 * the good position is one specific tile of 21x8, so the expected number of
 * attempts is 168 and twenty times that leaves a per-dog chance of about
 * `e^-20` — roughly two in a billion — of the dog silently not being placed at
 * all. Ten dogs per shelter, so the file's own dog count is never a function of
 * luck.
 *
 * The C# has no such budget because `Map.PlaceActorAt` (`Data/Map.cs:653`) is not
 * a sampler: it puts the actor on the tile it is handed. The cost of this
 * constant is the rolls, and the module header records what those are.
 */
const KENNEL_DOG_PLACE_TRIES = 20 * KENNELS_LEVEL_WIDTH * KENNELS_LEVEL_HEIGHT;

// ── The C# method ───────────────────────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:3945` `MakeAnimalShelterBuilding(map, b)`.
 *
 * `dispatchRoll` is the green cascade's `Roll(0, 99)` at `:570`, spent by the
 * pass for the reason the module header gives. Returns `true` when the block
 * became an animal shelter, which is how the C#'s `greenSuccess =
 * MakeAnimalShelterBuilding(map, b)` says the block is finished with.
 */
export function makeAnimalShelterBuilding(
  ctx: TownBuildingContext,
  dispatchRoll: number
): boolean {
  // Behind `Feature.AnimalShelter` from the first statement, and *before* the
  // band is even looked at: the pass gates its own two rolls (module header on
  // `makeJunkyard`), and this is what makes a *direct* call under Classic a no-op
  // rather than a shelter.
  if (!hasFeature(Session.get().ruleset, Feature.AnimalShelter)) return false;

  // The `20..29` arm of the five-way cascade. Declining every other band here is
  // what keeps the arms mutually exclusive without the pass having to order them.
  if (dispatchRoll < ANIMAL_SHELTER_ROLL_MIN || dispatchRoll >= ANIMAL_SHELTER_ROLL_MAX) return false;

  const { map, block: b, roller, params } = ctx;

  ////////////////////////
  // 0. Check suitability
  ////////////////////////
  // C# `:3950-3951`. A strict `<` on both axes, so an inside rect of exactly 6x6
  // — a 10x10 block, `Block` insetting twice — is the smallest shelter. It has to
  // be: the office is 5x5 and the C# wants a tile of yard round it for the van
  // and its driveway, and `officeX` is rolled over `[InsideRect.Left,
  // InsideRect.Right - 5)` which is empty below 6.
  if (b.insideRect.width < SHELTER_MIN_INSIDE || b.insideRect.height < SHELTER_MIN_INSIDE) return false;

  /////////////////////////////
  // 1. Grass, trees, walkway & fence
  /////////////////////////////
  // C# `:3955-3970`. Walkway over the whole block, grass over the building rect
  // (so the fence line is grass, not the dirt a junkyard lays), a jumpable chain
  // wire fence round the building rect, and a 25%-per-tile tree fill inside it.
  ctx.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, b.rectangle);
  ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_GRASS)!, b.buildingRect);
  ctx.mapObjectFill(map, b.buildingRect, (pt) => {
    const placeFence =
      pt.x === b.buildingRect.left ||
      pt.x === b.buildingRect.right - 1 ||
      pt.y === b.buildingRect.top ||
      pt.y === b.buildingRect.bottom - 1;
    return placeFence ? makeObjChainwireFence(GameImages.OBJ_CHAINWIRE_FENCE) : null;
  });
  // The park's `PARK_TREE_CHANCE` and its four sprites, not one: C# `:3966-3969`
  // reaches `MakeObjParkTree` rather than `MakeObjTree`, which is the same
  // Release 7-3 change `BaseTownGenerator.makeObjParkTree` (:2427) exists for.
  // Two rolls per tile that gets a tree — the chance, then the model. The
  // callback does not read the point: the C#'s does not either, it just fills the
  // inside rect in order.
  ctx.mapObjectFill(map, b.insideRect, () =>
    roller.rollChance(PARK_TREE_CHANCE)
      ? makeObjTree(PARK_TREES[roller.roll(0, PARK_TREES.length)]!)
      : null
  );

  ////////////
  // 2. Office & entrance
  ////////////
  // C# `:3974-3987`. `officeX` is `Roll(InsideRect.Left, InsideRect.Right - 5)`
  // and `Roll` is half-open, so the office can sit flush against the inside
  // rect's left and top edges but never past its right or bottom — which is what
  // keeps `ClearRectangle` and the office's walls inside the yard.
  const officeX = roller.roll(b.insideRect.left, b.insideRect.right - OFFICE_WIDTH);
  const officeY = roller.roll(b.insideRect.top, b.insideRect.bottom - OFFICE_HEIGHT);
  const officeRect = new Rect(officeX, officeY, OFFICE_WIDTH, OFFICE_HEIGHT);

  // clear everything but zones in office location. C# `:3985`.
  ctx.clearRectangle(map, officeRect, false);

  // build it. C# `:3988`.
  const surfaceStairsPos = makeAnimalShelterOfficeBuilding(ctx, map, officeRect);

  ///////////
  // 3. Generate Kennels level (-1)
  ///////////
  // C# `:3993`. The level's seed is derived from the surface map's, not drawn
  // from the district roller — so building the same district twice gives the same
  // kennels without spending a die, and the kennel layout costs the stream
  // exactly the rolls the level's own generator takes.
  const kennelsLevel = generateAnimalShelterKennelsLevel(ctx, map);

  // Link maps. C# `:3997-3999`, surface <-> kennels level, both `isAnAIExit`:
  // an actor can walk between them, which is the point of a dog pound with a
  // yard on top.
  ctx.addExit(
    map,
    surfaceStairsPos,
    kennelsLevel,
    new Point(KENNELS_LEVEL_EXIT.x, KENNELS_LEVEL_EXIT.y),
    GameImages.DECO_STAIRS_DOWN,
    true
  );
  ctx.addExit(
    kennelsLevel,
    new Point(KENNELS_LEVEL_EXIT.x, KENNELS_LEVEL_EXIT.y),
    map,
    surfaceStairsPos,
    GameImages.DECO_STAIRS_UP,
    true
  );

  // Add maps to district. C# `:4002`. `District.AddUniqueMap` is `AddMap` in the
  // port (`Data/District.ts:77`) — there is no uniqueness check to lose.
  params.district?.addUniqueMap(kennelsLevel);

  ///////////////
  // 4. Entrance
  ///////////////
  // C# `:4007-4028`. One chain link gate on one rolled side, replacing the fence
  // post the fence fill put there. The `switch` is the C#'s and so is its shape:
  // `case 3` is *north* and the `default` — i.e. the 2 that `Roll(0, 4)` returns
  // for it — is *south*. That is inherited from `MakeParkBuilding` (`:5553`), which
  // has the identical `case 0/1/3/default` ladder; it is transliterated rather
  // than tidied because the two entrances are the same code copied once.
  const entranceFace = roller.roll(0, 4);
  let ex: number;
  let ey: number;
  switch (entranceFace) {
    case 0: // west
      ex = b.buildingRect.left;
      ey = b.buildingRect.top + Math.floor(b.buildingRect.height / 2);
      break;
    case 1: // east
      ex = b.buildingRect.right - 1;
      ey = b.buildingRect.top + Math.floor(b.buildingRect.height / 2);
      break;
    case 3: // north
      ex = b.buildingRect.left + Math.floor(b.buildingRect.width / 2);
      ey = b.buildingRect.top;
      break;
    default: // south. `roll(0, 4)` is half-open, so 0..3 is exhaustive.
      ex = b.buildingRect.left + Math.floor(b.buildingRect.width / 2);
      ey = b.buildingRect.bottom - 1;
      break;
  }
  removeMapObjectAt(map, ex, ey);
  ctx.mapObjectPlace(map, ex, ey, makeObjChainFenceGate(DoorWindow.STATE_CLOSED));

  ///////////
  // 5. Zone
  ///////////
  // C# `:4033-4035`. The C#'s local is called `parkZone` — copy-paste from
  // `MakeParkBuilding` — and the base name is "Animal shelter", capital A,
  // lower-case s. Not "AnimalShelter": that is what the zone *prefix* test in
  // this repo's tests is looking for, and it is the C#'s own spelling.
  const shelterZone = ctx.makeUniqueZone('Animal shelter', b.buildingRect);
  map.addZone(shelterZone);
  ctx.makeWalkwayZones(map, b);

  // Done. C# `:4038`.
  return true;
}

// ── C# `:4044` MakeAnimalShelterOfficeBuilding ──────────────────────────────

/**
 * C# `BaseTownGenerator.cs:4044` `MakeAnimalShelterOfficeBuilding(map,
 * baseZoneName, officeBuildingRect, block, out stairsToSurface)`.
 *
 * The C#'s `baseZoneName` is the literal `"Office"` at the one call site (`:3988`)
 * and the `block` parameter is never read, so both are folded here: the zone is
 * called `Office` and the block is the one the caller's yard is on, which is
 * `ctx.block`. The `out Point stairsToSurface` becomes the return value, because
 * it is the only thing the caller takes out of it.
 */
function makeAnimalShelterOfficeBuilding(
  ctx: TownBuildingContext,
  map: GameMap,
  officeBuildingRect: Rect
): Point {
  const { roller } = ctx;
  const officeInsideRect = new Rect(
    officeBuildingRect.left + 1,
    officeBuildingRect.top + 1,
    officeBuildingRect.width - 2,
    officeBuildingRect.height - 2
  );

  // build building & zone. C# `:4050-4052`.
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_BRICK)!, officeBuildingRect);
  ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_OFFICE)!, officeInsideRect, (tile) => {
    tile.isInside = true;
  });
  map.addZone(ctx.makeUniqueZone('Office', officeBuildingRect));

  /////
  // place office door and make sure door front is cleared of objects (trees).
  /////
  // C# `:4057-4099`. The `do/while (!placed)` is a rejection loop, and the
  // rejection has exactly one cause: a chain wire fence on the tile in front of
  // the door. That can only happen on the west and north sides, because the
  // office is rolled inside `InsideRect` (`:3974-3975`) and the yard's fence is on
  // `BuildingRect`, one tile further out — so the loop always terminates: at most
  // two of the four arms are refusable and every roll redraws all four.
  let doorX = 0;
  let doorY = 0;
  let doorFrontX = 0;
  let doorFrontY = 0;
  let doorDir = 0;
  let placed = false;
  do {
    doorDir = roller.roll(0, 4);
    switch (doorDir) {
      case 0: // west
        doorX = officeBuildingRect.left;
        doorY = officeBuildingRect.top + Math.floor(officeBuildingRect.height / 2);
        doorFrontX = doorX - 1;
        doorFrontY = doorY;
        break;
      case 1: // east
        doorX = officeBuildingRect.right - 1;
        doorY = officeBuildingRect.top + Math.floor(officeBuildingRect.height / 2);
        doorFrontX = doorX + 1;
        doorFrontY = doorY;
        break;
      case 2: // north
        doorX = officeBuildingRect.left + Math.floor(officeBuildingRect.width / 2);
        doorY = officeBuildingRect.top;
        doorFrontX = doorX;
        doorFrontY = doorY - 1;
        break;
      default: // south. `roll(0, 4)` is half-open, so 0..3 is exhaustive — and
        // unlike the *entrance* ladder at `:4010` this one has all four cases.
        doorX = officeBuildingRect.left + Math.floor(officeBuildingRect.width / 2);
        doorY = officeBuildingRect.bottom - 1;
        doorFrontX = doorX;
        doorFrontY = doorY + 1;
        break;
    }
    //make sure the door is not against the fence
    const mapObj = map.getMapObjectAt(doorFrontX, doorFrontY);
    if (mapObj !== null && mapObj.imageId === GameImages.OBJ_CHAINWIRE_FENCE) {
      continue; //it's a fence, which we dont want a door against, so roll again
    }
    map.setTileModelAt(doorFrontX, doorFrontY, Models.tiles.get(TileID.FLOOR_ASPHALT)!); //start the driveway
    removeMapObjectAt(map, doorFrontX, doorFrontY); //get rid of tree if there
    ctx.mapObjectPlace(
      map,
      doorFrontX,
      doorFrontY,
      makeObjVan(GameImages.OBJ_VAN_PHASE0, roller.roll(0, VAN_FUEL_MAX))
    );
    placed = true;
  } while (!placed);

  ctx.placeDoor(
    map,
    doorX,
    doorY,
    Models.tiles.get(TileID.FLOOR_OFFICE)!,
    ctx.makeObjWoodenDoor()
  );

  // add building image next to doors. C# `:4101-4102`. Alive here, unlike the
  // junkyard's sign: the office's walls are `WALL_BRICK`, which is not walkable,
  // so `DecorateOutsideWalls` reaches the tiles and the ones beside the door get
  // the sign.
  ctx.decorateOutsideWalls(map, officeBuildingRect, (x, y) =>
    map.getMapObjectAt(x, y) === null && ctx.countAdjDoors(map, x, y) >= 1
      ? GameImages.DECO_ANIMAL_SHELTER
      : null
  );

  ///////////////
  // driveway
  ///////////////
  // C# `:4106-4132`. The van's roll of the door direction is *not* re-rolled: the
  // driveway runs the way the door faces, out of the yard, until it reaches the
  // walkway `TileRectangle` laid at `:3955`, and it leaves an open gate on the
  // last tile it paved. That gate is the shelter's vehicle entrance, distinct
  // from the pedestrian gate at `:4026`.
  //
  // The loop's exit condition is the block's own walkway ring, which
  // `TileRectangle(b.Rectangle)` guarantees is one tile outside `BuildingRect` on
  // every side — so the walk terminates in bounds and never walks off the map.
  let ex = doorFrontX;
  let ey = doorFrontY;
  for (;;) {
    const prevex = ex;
    const prevey = ey;
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

    if (map.getTileAt(ex, ey)!.model === Models.tiles.get(TileID.FLOOR_WALKWAY)!) {
      //keep paving the driveway until we hit the walkway
      ctx.mapObjectPlace(map, prevex, prevey, makeObjChainFenceGate(DoorWindow.STATE_OPEN));
      break;
    } else {
      removeMapObjectAt(map, ex, ey); //get rid of plants
      map.setTileModelAt(ex, ey, Models.tiles.get(TileID.FLOOR_ASPHALT)!);
    }
  }

  removeMapObjectAt(map, ex, ey);
  map.setTileModelAt(ex, ey, Models.tiles.get(TileID.FLOOR_ASPHALT)!);

  /////////
  // mark as inside and add chairs, shelves and tables
  /////////
  // C# `:4136-4172`. The stairs go at the office inside rect's north-west corner
  // and that one tile is skipped, so the first thing the `DoForEachTile` scan can
  // put down is a table — and a table on the stairwell is the one thing that would
  // make the exit unreachable. The five guards are the C#'s, in the C#'s order:
  // not the stairs, walkable, not beside a door, and *has* a wall (so furniture
  // hugs the room instead of floating in the middle of it).
  const stairsToSurface = new Point(officeInsideRect.left, officeInsideRect.top);
  const stairsPt = stairsToSurface;
  let chairPlaced = false;
  let tablePlaced = false;
  ctx.doForEachTile(map, officeInsideRect, (pt) => {
    if (pt.equals(stairsPt)) return;

    if (!map.isWalkablePoint(pt)) return;

    if (ctx.countAdjDoors(map, pt.x, pt.y) > 0) return;

    if (ctx.countAdjWalls(map, pt.x, pt.y) === 0) return;

    if (!tablePlaced) {
      //just one
      ctx.mapObjectPlace(map, pt.x, pt.y, makeObjTable(GameImages.OBJ_TABLE));
      tablePlaced = true;
      return;
    } else if (!chairPlaced) {
      //just one
      ctx.mapObjectPlace(map, pt.x, pt.y, makeObjChair(GameImages.OBJ_CHAIR));
      chairPlaced = true;
      return;
    }

    // objects
    if (roller.rollChance(OFFICE_SHELF_CHANCE)) {
      ctx.mapObjectPlace(map, pt.x, pt.y, makeObjShelf(GameImages.OBJ_SHOP_SHELF));
      // item. C# `:4165-4169`: the shelf rolls *first* and the item is chosen from
      // its answer, so "a flashlight" and "binoculars" are the two arms of one
      // roll, not two rolls. `Item it = null` is the C#'s own shape and `it` is
      // never null on either arm, so the null check below is dead — kept because
      // it is what the C# writes and a future third arm would want it.
      const it = roller.rollChance(OFFICE_SHELF_CHANCE)
        ? makeItemBigFlashlight()
        : makeItemBinoculars();

      map.dropItemAt(it, pt);
    }
  });

  return stairsToSurface;
}

// ── C# `:4189` GenerateAnimalShelter_KennelsLevel ────────────────────────────

/**
 * C# `BaseTownGenerator.cs:4189` `GenerateAnimalShelter_KennelsLevel(surfaceMap)`.
 *
 * The only generator in the C# that takes a map it did not create and returns a
 * new one, and the only building in the port so far that needs a second map at
 * all — which is why `ctx.addExit` carries the comment it does at
 * `TownBuilding.ts:352` ("2 in the C# buildings (the animal shelter's stairs)").
 *
 * **Ten dogs, and the map argument is the kennel level's.** C# `:4230-4234` puts
 * a `CreateNewFeralDog(0)` and three cooked chickens in every cell; both halves
 * are here, and both go through the context, because the kennel level is a map
 * this method created and not `ctx.map` — `actorPlace` takes the map explicitly
 * for exactly that reason. See the module header for the dice the placement
 * search costs where the C#'s `PlaceActorAt` costs none.
 */
function generateAnimalShelterKennelsLevel(
  ctx: TownBuildingContext,
  surfaceMap: GameMap
): GameMap {
  // 1. Create map. C# `:4196-4201`, then `:4202` marks every tile indoors. The
  // seed is the surface map's, shifted and xored — so the kennels are a
  // deterministic function of the district rather than of the dice, and
  // generating the same district twice regenerates the same kennel. DARKNESS,
  // because it is underground: the port's `Map.lighting` is the C#'s `Lighting`
  // (`Data/Map.cs`).
  const seed = (surfaceMap.seed << 1) ^ surfaceMap.seed;
  const map = new GameMap(seed, 'Animal shelter', KENNELS_LEVEL_WIDTH, KENNELS_LEVEL_HEIGHT);
  map.lighting = Lighting.DARKNESS;
  // Every tile is indoors, walls included — the level has no outside.
  ctx.doForEachTile(map, map.rect, (pt) => {
    map.getTileAt(pt.x, pt.y)!.isInside = true;
  });

  // 2. Floor plan. C# `:4204-4206`.
  ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_TILES)!, map.rect);
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_HOSPITAL)!, map.rect);

  // - small cells. C# `:4207-4244`. Ten of them: `x` steps by two over a
  // three-wide cell on a map twenty-one wide, so the last is at 18.
  for (let x = 0; x + KENNEL_CELL_WIDTH <= map.width; x += KENNEL_CELL_WIDTH - 1) {
    // room.
    const cellRoom = new Rect(x, KENNEL_CELL_TOP, KENNEL_CELL_WIDTH, KENNEL_CELL_HEIGHT);
    ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_CONCRETE)!, cellRoom);
    ctx.mapObjectFill(map, cellRoom, (pt) => {
      const placeFence =
        pt.x === cellRoom.left ||
        pt.x === cellRoom.right - 1 ||
        pt.y === cellRoom.top ||
        pt.y === cellRoom.bottom - 1;
      return placeFence ? makeObjKennelFence(GameImages.OBJ_CHAINWIRE_FENCE) : null;
    });

    // deco and dog. C# `:4227-4234`.
    const kennelPos = new Point(x + 1, KENNEL_CELL_TOP + 1);
    map.getTileAt(kennelPos.x, kennelPos.y)!.addDecoration(GameImages.DECO_KENNEL);
    // C# `:4230`. One `skinDog` roll off the district roller per cell, in cell
    // order, exactly as the C# spends them; the factory reaches `m_DiceRoller`
    // itself, which is `ctx.roller`.
    const dog = ctx.createNewFeralDog(0);
    map.dropItemAt(makeItemCookedChicken(), kennelPos); // give him some food.
    map.dropItemAt(makeItemCookedChicken(), kennelPos);
    map.dropItemAt(makeItemCookedChicken(), kennelPos);
    // C# `:4234`, and the one deliberate divergence from it. The C# is
    // `map.PlaceActorAt(dog, kennelPos)` — direct, and free. `ctx.actorPlace` is
    // the rejection sampler that `MapGenerator.actorPlace` transliterates, so the
    // tile has to be named as the *only* good one and the search is over the
    // whole level. `map` is the kennel level, not `ctx.map`: the dog is one
    // storey down, and a dog on the yard is not a dog in a kennel cell.
    ctx.actorPlace(ctx.roller, KENNEL_DOG_PLACE_TRIES, map, dog, (pt) => pt.equals(kennelPos));

    // gate. C# `:4236-4240`. The tile under the gate is forced back to concrete —
    // the fence fill above just put a kennel fence on it, and `RemoveMapObjectAt`
    // is what actually makes room for the gate.
    const gatePos = new Point(x + 1, KENNEL_CELL_TOP);
    map.setTileModelAt(gatePos.x, gatePos.y, Models.tiles.get(TileID.FLOOR_CONCRETE)!);
    removeMapObjectAt(map, gatePos.x, gatePos.y); //remove fence to make space for the gate
    ctx.mapObjectPlace(map, gatePos.x, gatePos.y, makeObjChainFenceGate(DoorWindow.STATE_CLOSED));

    // zone. C# `:4243-4244`.
    map.addZone(ctx.makeUniqueZone('Kennels', cellRoom));
  }

  // - corridor. C# `:4245-4247`. `Rectangle.FromLTRB(1, 1, map.Width, yCells)`,
  // which is the whole strip above the cells and everything to their right on it.
  const corridor = new Rect(
    KENNELS_CORRIDOR_LEFT,
    KENNELS_CORRIDOR_TOP,
    map.width - KENNELS_CORRIDOR_LEFT,
    KENNEL_CELL_TOP - KENNELS_CORRIDOR_TOP
  );
  map.addZone(ctx.makeUniqueZone('cages corridor', corridor));

  // done. C# `:4249`.
  return map;
}

// ── Map operations the port spells differently ──────────────────────────────

/**
 * C# `Map.RemoveMapObjectAt(int, int)` — `Data/Map.cs`. The port's `Map` has
 * `removeMapObject(obj)` and no by-position form, and every C# `RemoveMapObjectAt`
 * in these three methods is "if there is one there, take it off".
 */
function removeMapObjectAt(map: GameMap, x: number, y: number): void {
  const obj = map.getMapObjectAt(x, y);
  if (obj) map.removeMapObject(obj);
}

// ── Factories the seam could not hand over: map objects ─────────────────────

/**
 * C# `BaseMapGenerator.cs:444` `MakeObjFence` — "chain wire and IS jumpable".
 *
 * Byte-identical to `makeJunkyard.ts`'s private copy of the same factory, and
 * that duplication is the honest state: the port's own `makeObjFence`
 * (`BaseMapGenerator.ts:486`) is vanilla's *wooden* fence, which gives wood and is
 * called `fence`, so neither building can use it. **Not a new context candidate**
 * — one `ctx.makeObjChainwireFence` would delete both copies at once, and that is
 * the shape to add it in.
 */
function makeObjChainwireFence(imageId: string): MapObject {
  const fence = new MapObject(
    'chain wire fence',
    imageId,
    MapObjectBreak.BREAKABLE,
    MapObjectFire.UNINFLAMMABLE,
    DoorWindow.BASE_HITPOINTS * 10
  );
  fence.isMaterialTransparent = true;
  fence.jumpLevel = 1;
  fence.standOnFovBonus = true;
  return fence;
}

/**
 * C# `BaseMapGenerator.cs:458` `MakeObjKennelFence` — "Chain wire but is NOT
 * jumpable" (Release 7-5).
 *
 * The *same* factory as {@link makeObjChainwireFence} with `JumpLevel` and
 * `StandOnFovBonus` left off, and that is the whole of it: a kennel pen is 3x3
 * and jumpable would mean a survivor could hop the wall and stand next to a dog
 * it could not reach, so the fork's answer was to take the jump away. Same name,
 * same image id, same hit points, one fewer capability — which is why these have
 * to be two functions and not one with a flag.
 */
function makeObjKennelFence(imageId: string): MapObject {
  const fence = new MapObject(
    'chain wire fence',
    imageId,
    MapObjectBreak.BREAKABLE,
    MapObjectFire.UNINFLAMMABLE,
    DoorWindow.BASE_HITPOINTS * 10
  );
  fence.isMaterialTransparent = true;
  return fence;
}

/**
 * C# `BaseMapGenerator.cs:1176` `MakeObjChainFenceGate(state)` — the two gates
 * this building uses, one closed at the shelter's pedestrian entrance (`:4026`),
 * one open at the end of the office driveway (`:4124`), plus one closed per kennel
 * cell (`:4239`).
 *
 * Half a door's hit points (2x against the wooden door's 1x and the roller door's
 * 6x) and material-transparent, so a survivor can see the yard through a closed
 * gate. `IsMaterialTransparent` is left off, as it is for the junkyard's roller
 * door and the port's other five door factories, for the reason
 * `DoorWindow`'s own `isTransparent` override gives (`MapObjects.ts:52`): the
 * port's `DoorWindow` has no such field and adding one to a core class as a side
 * effect of a generator is how that goes wrong.
 *
 * **The `state` is applied after the constructor, not passed to it.** The C#'s
 * `MakeObjChainFenceGate(int state)` threads it into a six-argument
 * `DoorWindow`; the port's constructor takes five and always opens closed
 * (`MapObjects.ts:25`), so the two `STATE_OPEN` gates — the shelter's vehicle
 * entrance at `:4124` — are a `setState` afterwards, exactly as
 * `makeBankBuilding`'s `placeBankVaultDoor` does it. Same three images, same
 * order.
 */
function makeObjChainFenceGate(state: number): DoorWindow {
  const gate = new DoorWindow(
    'chainlink gate',
    GameImages.OBJ_CHAINWIRE_GATE_CLOSED,
    GameImages.OBJ_CHAINWIRE_GATE_OPEN,
    GameImages.OBJ_CHAINWIRE_GATE_BROKEN,
    2 * DoorWindow.BASE_HITPOINTS
  );
  gate.setState(state);
  return gate;
}

/**
 * C# `BaseMapGenerator.cs:1195` `MakeObjVan(vanImageID, fuelUnits)` — the van
 * parked in front of the office door (`:4096`).
 *
 * The C# passes `MapObject.Break.BROKEN` twice: once as the constructor's break
 * argument and once as an explicit `BreakState =` in the initialiser. That is
 * redundant and harmless, so the constructor's argument is what is written here.
 * Three hundred kilos, breakable-but-broken, jumpable, movable — a van is a
 * release that takes two hits and gives nothing back.
 */
function makeObjVan(imageId: string, fuelUnits: number): Car {
  const van = new Car('van', imageId, MapObjectBreak.BROKEN, fuelUnits);
  van.jumpLevel = 1;
  van.isMovable = true;
  van.weight = 300;
  van.standOnFovBonus = true;
  return van;
}

/**
 * C# `BaseMapGenerator.cs:535` `MakeObjTree` — the fork's, not the port's.
 *
 * `BASE_HITPOINTS * 20` against the port's `protected makeObjTree`
 * (`BaseMapGenerator.ts:549`) at `* 10`: Release 7-6 made the tree breakable *and*
 * gave it twice the health, and the shelter's yard is 25% trees, so the hit points
 * are what a survivor chops at on the way to the office. A new context candidate
 * only in the sense that the port's own copy is the one that is wrong for the
 * fork — promoting it means changing the park's and the town's calls too, so it is
 * a bigger decision than this building's own copies are.
 */
function makeObjTree(imageId: string): MapObject {
  const tree = new MapObject(
    'tree',
    imageId,
    MapObjectBreak.BREAKABLE,
    MapObjectFire.BURNABLE,
    DoorWindow.BASE_HITPOINTS * 20 //@@MP - made breakable (Release 7-6)
  );
  tree.givesWood = true;
  return tree;
}

/**
 * C# `BaseMapGenerator.cs:681` `MakeObjTable`. `BURNABLE` and six kilos against the
 * port's `protected makeObjTable` (`BaseMapGenerator.ts:723`), which is
 * `UNINFLAMMABLE` and two.
 */
function makeObjTable(imageId: string): MapObject {
  const table = new MapObject(
    'table',
    imageId,
    MapObjectBreak.BREAKABLE,
    MapObjectFire.BURNABLE,
    DoorWindow.BASE_HITPOINTS
  );
  table.isMaterialTransparent = true;
  table.jumpLevel = 1;
  table.givesWood = true;
  table.isMovable = true;
  table.weight = 6;
  return table;
}

/**
 * C# `BaseMapGenerator.cs:693` `MakeObjChair`. `BURNABLE`, walkable (Release 4) and
 * *not* jumpable, where the port's `protected makeObjChair`
 * (`BaseMapGenerator.ts:739`) is `UNINFLAMMABLE` and jumpable at level 1.
 */
function makeObjChair(imageId: string): MapObject {
  const chair = new MapObject(
    'chair',
    imageId,
    MapObjectBreak.BREAKABLE,
    MapObjectFire.BURNABLE,
    Math.floor(DoorWindow.BASE_HITPOINTS / 3)
  );
  chair.isMaterialTransparent = true;
  chair.givesWood = true;
  chair.isMovable = true;
  chair.isWalkable = true; //@@MP (Release 4)
  chair.weight = 1;
  return chair;
}

/**
 * C# `BaseMapGenerator.cs:595` `MakeObjShelf`.
 *
 * Byte-identical to `makeClinicBuilding.ts`'s private copy of the same factory,
 * `BURNABLE` against the port's own vanilla `UNINFLAMMABLE`
 * (`BaseMapGenerator.ts:635`). **Not a new context candidate** — the third file to
 * want it, which is the argument for making it the second one promoted.
 */
function makeObjShelf(imageId: string): MapObject {
  const shelf = new MapObject(
    'shelf',
    imageId,
    MapObjectBreak.BREAKABLE,
    MapObjectFire.BURNABLE,
    DoorWindow.BASE_HITPOINTS
  );
  shelf.isContainer = true;
  shelf.givesWood = true;
  shelf.isMovable = true;
  shelf.weight = 6;
  return shelf;
}

// ── Factories the seam could not hand over: items ───────────────────────────

/**
 * C# `BaseMapGenerator.cs:1640` `MakeItemBigFlashlight`. One of the two arms of the
 * office's shelf item roll at `:4166`.
 */
function makeItemBigFlashlight(): Item {
  return new ItemLight(Models.items.get(ItemID.LIGHT_BIG_FLASHLIGHT)!);
}

/**
 * C# `BaseMapGenerator.cs:1872` `MakeItemBinoculars` — `IsForbiddenToAI = true`,
 * "code under DoTakeItem() will switch to male type if required". The other arm
 * of the same roll.
 */
function makeItemBinoculars(): Item {
  const item = new ItemLight(Models.items.get(ItemID.LIGHT_BINOCULARS)!);
  item.isForbiddenToAI = true;
  return item;
}

/**
 * C# `BaseMapGenerator.cs:2238` `MakeItemCookedChicken` — and deliberately *not*
 * `BaseMapGenerator.makeItemCookedChicken` (`:1193`).
 *
 * The C#'s is deterministic: `turnCounter + TURNS_PER_DAY * BestBeforeDays`, with
 * no roll anywhere in it. The port's own copy rolls `m_Rules.roll(min, max)` for
 * a best-before in the second half of the window, which is a *different factory*
 * wearing the same name — and reaching past `ctx.roller` for `ctx.game.rules` is
 * the coupling `./TownBuilding` exists to remove. So the C#'s is what a kennel
 * cell gets, and thirty chickens per shelter cost the district's dice nothing.
 *
 * `new ItemFood(model, freshUntil)` against the C#'s four-argument form: the
 * `ItemFood` constructor takes `(model, bestBeforeTurns)` and the C#'s trailing
 * `false, false` are its `IsEaten`/`IsCooked`-style defaults, which the port has
 * no parameter for.
 */
function makeItemCookedChicken(): Item {
  // FIXME: should be map local time. (the C#'s own FIXME, at `:2240`)
  const timeNow = Session.get().worldTime.turnCounter;
  const model = Models.items.get(ItemID.FOOD_COOKED_CHICKEN)! as ItemFoodModel;
  const freshUntil = timeNow + WorldTime.TURNS_PER_DAY * model.bestBeforeDays;
  return new ItemFood(model, freshUntil);
}