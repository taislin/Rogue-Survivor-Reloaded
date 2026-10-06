/**
 * BaseTownGenerator.
 * Ported from src/Gameplay/Generators/BaseTownGenerator.cs
 *
 * Generates the district surface map plus its sewers/subway levels, the town
 * blocks, all building types, and the actor factories used to populate them.
 */

import { Actor } from '@data/Actor';
import { District, DistrictKind } from '@data/District';
import { Item } from '@data/Item';
import { DollPart } from '@data/Doll';
import { MapObject } from '@data/MapObject';
import { Exit, Lighting, Map as GameMap } from '@data/Map';
import { Models } from '@data/Models';
import { TileModel } from '@data/TileModel';
import { Zone } from '@data/Zone';
import { DiceRoller } from '@engine/DiceRoller';
import { Direction } from '@engine/Direction';
import { GameOptions, Options } from '@engine/GameOptions';
import { Point } from '@engine/Point';
import { Rect } from '@engine/Rect';
import { Rules } from '@engine/Rules';
import { Session, GameMode, UniqueActor, UniqueMap } from '@engine/Session';
import { WorldTime } from '@engine/WorldTime';
import { Feature, hasFeature } from '@engine/FeatureFlags';
import { makeBackpack } from '@gameplay/Backpacks';
import { DoorWindow } from '@engine/mapobjects/MapObjects';
import { GangAI } from '@gameplay/ai/GangAI';
import { ActorID } from '@gameplay/GameActors';
import { FactionID } from '@gameplay/GameFactions';
import { GangID } from '@gameplay/GameGangs';
import { GameImages } from '@gameplay/GameImages';
import { ItemID } from '@gameplay/GameItems';
import { GameMusics } from '@gameplay/GameSounds';
import { GameTiles, TileID } from '@gameplay/GameTiles';
import { SkillID } from '@gameplay/Skills';
import { ZoneAttributes } from '@gameplay/ZoneAttributes';
import { BaseMapGenerator } from './BaseMapGenerator';
import { makeBarBuilding } from './BarBuilding';
import { makeBankBuilding } from './buildings/makeBankBuilding';
import { makeFireStationBuilding } from './buildings/makeFireStationBuilding';
import { makeFuelStationBuilding } from './buildings/makeFuelStationBuilding';
import {
  makeBasketballCourtBuilding,
  makeTennisCourtBuilding,
} from './buildings/makeSportsCourts';
import { makeFarmBuilding } from './buildings/makeFarmBuilding';
import { makeJunkyard } from './buildings/makeJunkyard';
import { makeAnimalShelterBuilding } from './buildings/makeAnimalShelterBuilding';
import { makeClinicBuilding } from './buildings/makeClinicBuilding';
import { makeMechanicWorkshop } from './buildings/makeMechanicWorkshop';
import { makeMallBlocks, makeShoppingMall } from './buildings/makeShoppingMall';
import { TOWN_BUILDING_PASSES, runTownBuildingPasses } from './TownBuilding';
import { makeChurchBuilding } from './buildings/makeChurchBuilding';
import { makeLibraryBuilding } from './buildings/makeLibraryBuilding';
import {
  Block,
  Parameters,
  makeWalkwayZones as makeWalkwayZonesOn,
  placeDoor as placeDoorOn,
} from './TownBuilding';
import type { TownBuildingContext, TownPlacement } from './TownBuilding';

// `Block` and `Parameters` moved to `./TownBuilding` so a building generator
// written as its own file can import them without pulling this 5 800-line
// class in behind it. Re-exported here because they have been part of this
// module's public surface since before that file existed, and the tests
// (`stage2-fixes.test.ts`, `item-factories.test.ts`) import them from here.
export { Block, Parameters };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

// ── Constants (RogueGame.MAP_MAX_WIDTH/HEIGHT, RogueGame day factors) ──────
const MAP_MAX_WIDTH = 100;
const MAP_MAX_HEIGHT = 100;
export const SEWERS_UNDEADS_FACTOR = 0.5; // 1.0 for as much as surface undead spawning.
export const SUBWAY_UNDEADS_FACTOR = 0.25; // 1.0 for as much as surface undead spawning.
const NATGUARD_DAY = 3;
const BIKERS_RAID_DAY = 2;
const GANGSTAS_RAID_DAY = 7;
const NAME_SUBWAY_RAILS = 'rails';

// ── Constants ──────────────────────────────────────────────────────────────
const PARK_TREE_CHANCE = 25;
const PARK_BENCH_CHANCE = 5;

// ── Still Alive, Release 6-1 and 7-6 (`BaseTownGenerator.cs:311-313`).
//
// The pond replaced alpha10's shed outright ("based on alpha 10 shed"), and the
// dimensions are unchanged, so `PARK_SHED_WIDTH`/`HEIGHT` below are these numbers
// under their old names.
const PARK_POND_CHANCE = 1000;
const PARK_POND_WIDTH = 5;
const PARK_POND_HEIGHT = 5;
/**
 * Still Alive, Release 4: inside a *graveyard*, the tree roll is reused as a
 * "grave or tree" roll and then a tombstone is drawn from it. The C# says so:
 * "use the original tree chance, but within that a higher chance to be a grave
 * instead" -- the comment is slightly wrong, 33 is not 25, but the reuse is the
 * point and the number is the C#'s.
 */
const PARK_GRAVE_OR_TREE_CHANCE = 33;

/** C# `BaseMapGenerator.cs:528`, Release 7-3. */
const PARK_TREES: readonly string[] = [
  GameImages.OBJ_TREE1,
  GameImages.OBJ_TREE2,
  GameImages.OBJ_TREE3,
  GameImages.OBJ_TREE4,
];
const PARK_ITEM_CHANCE = 5;
// The alpha10 shed, which Release 6-1 replaced with the pond and which the port
// still builds **under Classic**, so that Classic stays byte-identical. See step 6.
const PARK_SHED_CHANCE = 75; // alpha10.1
const PARK_SHED_WIDTH = 5; // alpha10
const PARK_SHED_HEIGHT = 5; // alpha10

const MAX_CHAR_GUARDS_PER_OFFICE = 3;

/**
 * C# `:8525` -- how often a bare CHAR storage-room tile carries junk or barrels.
 *
 * **47, and not the 50 this port had.** The C# writes a bare `RollChance(47)` with
 * no `//@@MP` marker and no release tag, so unlike the fire barrel and the two
 * Resources Availability gates there is nothing to hang a feature on and nothing
 * suggesting the number was ever tuned. It is applied as written, in both rulesets:
 * keeping a Classic-only 50 would be the port inventing a divergence from the
 * reference rather than recording one. It is **not** a free change -- this threshold
 * cascades into the bare-tile count and the loop's dice -- so the cost is measured
 * and recorded in this method's header rather than glossed here.
 */
/**
 * `ARMY_POSTERS` — `BaseTownGenerator.cs:11016`.
 *
 * A module const rather than a class static, alongside the other sprite tables in this
 * file. Three sprites, chosen by `roll(0, 3)` on every non-walkable tile that passes
 * the 25% gate.
 */
const ARMY_POSTERS: readonly string[] = [
  GameImages.DECO_ARMY_POSTER1,
  GameImages.DECO_ARMY_POSTER2,
  GameImages.DECO_ARMY_POSTER3,
];

const CHAR_STORAGE_JUNK_CHANCE = 47;
/**
 * C# `:8527` -- `else if (m_DiceRoller.RollChance(3)) //@@MP (Release 7-6)`.
 *
 * Still Alive only. Gated on `Feature.FireBarrels` *and* gated before the roll,
 * because consuming a die shifts every roll after it -- the same argument
 * `BaseMapGenerator.makeObjWreckedCar` (`:757-760`) makes for its fuel tank.
 */
const CHAR_STORAGE_FIRE_BARREL_CHANCE = 3;

const SEWERS_ITEM_CHANCE = 1;
const SEWERS_JUNK_CHANCE = 10;
const SEWERS_TAG_CHANCE = 10;
const SEWERS_IRON_FENCE_PER_BLOCK_CHANCE = 50; // 8 fences average on std maps size 75x75.
const SEWERS_ROOM_CHANCE = 20;

const SUBWAY_TAGS_POSTERS_CHANCE = 20;

const HOUSE_LIVINGROOM_ITEMS_ON_TABLE = 2;
const HOUSE_KITCHEN_ITEMS_ON_TABLE = 2;
const HOUSE_KITCHEN_ITEMS_IN_FRIDGE = 3;
const HOUSE_BASEMENT_CHANCE = 30;
const HOUSE_BASEMENT_OBJECT_CHANCE_PER_TILE = 10;
const HOUSE_BASEMENT_PILAR_CHANCE = 20;
const HOUSE_BASEMENT_WEAPONS_CACHE_CHANCE = 20;
// alpha10 new house stuff
const HOUSE_OUTSIDE_ROOM_NEED_MIN_ROOMS = 4;
const HOUSE_OUTSIDE_ROOM_CHANCE = 75;
const HOUSE_GARDEN_TREE_CHANCE = 10; // per tile
const HOUSE_PARKING_LOT_CAR_CHANCE = 10; // per tile
// alpha10.1 new house floorplan: apartments
const HOUSE_IS_APARTMENTS_CHANCE = 50;

const SHOP_BASEMENT_CHANCE = 30;
const SHOP_BASEMENT_SHELF_CHANCE_PER_TILE = 5;
const SHOP_BASEMENT_ITEM_CHANCE_PER_SHELF = 33;
const SHOP_WINDOW_CHANCE = 30;
const SHOP_BASEMENT_ZOMBIE_RAT_CHANCE = 5; // per tile.

/**
 * One church per ten still-empty blocks. C# `BaseTownGenerator.cs:600`, a `//10%`
 * comment against `if (rolled >= 89)` on a `Roll(0, 99)`.
 *
 * Not a `Parameters` field, unlike `shopBuildingChance` and
 * `parkBuildingChance`. Those two have a `m_Params` member in the C# to mirror
 * (`:92-207`); the church chance is a bare literal in the dispatch, and putting
 * it in `Parameters` would mean widening the shared seam for a number the
 * reference does not make configurable.
 */
const CHURCH_BUILDING_CHANCE = 10;

// ── Types ──────────────────────────────────────────────────────────────────
export enum ShopType {
  GENERAL_STORE = 0,
  GROCERY,
  SPORTSWEAR,
  PHARMACY,
  CONSTRUCTION,
  GUNSHOP,
  HUNTING,
}

export enum CHARBuildingType {
  NONE = 0,
  AGENCY,
  OFFICE,
}

// alpha10
export enum HouseOutsideRoomType {
  GARDEN = 0,
  PARKING_LOT,
}

export class BaseTownGenerator extends BaseMapGenerator {
  static readonly DEFAULT_PARAMS = new Parameters();

  private m_Params: Parameters = BaseTownGenerator.DEFAULT_PARAMS;
  protected m_DiceRoller: DiceRoller;

  /**
   * Blocks on surface map since during current generation.
   */
  private m_SurfaceBlocks: Block[] | null = null;

  /**
   * The placement primitives as a plain object, built once per generator.
   *
   * Most of what a building generator needs is already a public method on
   * `MapGenerator`, but `placeDoor`, `makeWalkwayZones`, `makeUniqueZone`,
   * `barricadeDoors`, `clearRectangle` and the six door factories are
   * `protected`, so they cannot be reached from a building in its own file.
   * Rather than widen their visibility one at a time, every delegate a building
   * is allowed to have is written out here, once: the set becomes the
   * `TownBuildingContext` interface in `./TownBuilding`, so "what a building may
   * touch" is one list instead of a set of `protected` keywords scattered over
   * two base classes.
   *
   * Cached rather than rebuilt per block: the delegates read `this.m_DiceRoller`
   * and `this.m_Params` at call time, so a cached object still follows the
   * per-district reseed in `generate()`.
   */
  private m_Placement: TownPlacement | null = null;

  get params(): Parameters {
    return this.m_Params;
  }

  set params(value: Parameters) {
    this.m_Params = value;
  }

  constructor(game: Game, parameters: Parameters) {
    super(game);
    this.m_Params = parameters;
    this.m_DiceRoller = new DiceRoller();
  }

  /** The cached placement primitives. See `m_Placement`. */
  private placement(): TownPlacement {
    if (this.m_Placement) return this.m_Placement;
    this.m_Placement = {
      tileFill: (map, model, rect, decoratorFn) =>
        decoratorFn ? this.tileFill(map, model, rect, decoratorFn) : this.tileFill(map, model, rect),
      tileRectangle: (map, model, rect, decoratorFn) =>
        decoratorFn
          ? this.tileRectangle(map, model, rect, decoratorFn)
          : this.tileRectangle(map, model, rect),
      tileHLine: (map, model, left, top, width, decoratorFn) =>
        decoratorFn
          ? this.tileHLine(map, model, left, top, width, decoratorFn)
          : this.tileHLine(map, model, left, top, width),
      tileVLine: (map, model, left, top, height, decoratorFn) =>
        decoratorFn
          ? this.tileVLine(map, model, left, top, height, decoratorFn)
          : this.tileVLine(map, model, left, top, height),

      mapObjectPlace: (map, x, y, mapObj) => this.mapObjectPlace(map, x, y, mapObj),
      mapObjectFill: (map, rect, createFn) => this.mapObjectFill(map, rect, createFn),
      makeObjFuelPump: (fuelPumpImageID) => this.makeObjFuelPump(fuelPumpImageID),
      mapObjectPlaceInGoodPosition: (map, rect, isGoodPosFn, roller, createFn) =>
        this.mapObjectPlaceInGoodPosition(map, rect, isGoodPosFn, roller, createFn),
      decorateOutsideWalls: (map, rect, decoFn) => this.decorateOutsideWalls(map, rect, decoFn),

      placeDoor: (map, x, y, floor, door) => this.placeDoor(map, x, y, floor, door),
      makeObjWoodenDoor: () => this.makeObjWoodenDoor(),
      makeObjHospitalDoor: () => this.makeObjHospitalDoor(),
      makeObjCharDoor: () => this.makeObjCharDoor(),
      makeObjGlassDoor: () => this.makeObjGlassDoor(),
      makeObjIronDoor: () => this.makeObjIronDoor(),
      makeObjWindow: () => this.makeObjWindow(),

      countAdjDoors: (map, x, y) => this.countAdjDoors(map, x, y),
      countAdjWalls: (map, x, y) => this.countAdjWalls(map, x, y),
      countAdjWalkables: (map, x, y) => this.countAdjWalkables(map, x, y),

      makeUniqueZone: (basename, rect) => this.makeUniqueZone(basename, rect),
      makeWalkwayZones: (map, b) => this.makeWalkwayZones(map, b),
      makeShopGeneralItem: () => this.makeShopGeneralItem(),
  makeShopConstructionItem: () => this.makeShopConstructionItem(),
      addExit: (from, fromPosition, to, toPosition, exitImageID, isAnAIExit) =>
        this.addExit(from, fromPosition, to, toPosition, exitImageID, isAnAIExit),
      barricadeDoors: (map, rect, barricadeLevel) => this.barricadeDoors(map, rect, barricadeLevel),

      itemsDrop: (map, rect, isGoodPositionFn, createFn) =>
        this.itemsDrop(map, rect, isGoodPositionFn, createFn),
      doForEachTile: (map, rect, doFn) => this.doForEachTile(map, rect, doFn),
      clearRectangle: (map, rect, clearZones) => this.clearRectangle(map, rect, clearZones),
      createNewFeralDog: (spawnTime) => this.createNewFeralDog(spawnTime),
      actorPlace: (roller, maxTries, map, actor, goodPositionFn) =>
        this.actorPlace(roller, maxTries, map, actor, goodPositionFn),
    };
    return this.m_Placement;
  }

  /**
   * The context handed to a building generator registered in
   * `TOWN_BUILDING_PASSES`. One per block, per pass.
   */
  private buildingContext(map: GameMap, b: Block): TownBuildingContext {
    return {
      map,
      block: b,
      params: this.m_Params,
      roller: this.m_DiceRoller,
      game: this.m_Game,
      ...this.placement(),
    };
  }

  // ── Entry Map (Surface) ──────────────────────────────────────────────────

  generate(seed: number): GameMap {
    this.m_DiceRoller = new DiceRoller(seed);
    const map = new GameMap(seed, 'Base City', this.m_Params.mapWidth, this.m_Params.mapHeight);

    ///////////////////
    // Init with grass
    ///////////////////
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_GRASS)!);

    ///////////////
    // Cut blocks
    ///////////////
    const blocks: Block[] = [];
    const cityRectangle = new Rect(0, 0, map.width, map.height);
    // C# `:390-393`, Release 7-3:
    //
    // ```csharp
    // if (m_Params.GenerateShoppingMall) //@@MP - mall must have a 46x46 block (Release 7-3)
    //     MakeMallBlocks(map, ref blocks, cityRectangle);
    // else
    //     MakeBlocks(map, true, ref blocks, cityRectangle);
    // ```
    //
    // **The one call site in the whole engine that replaces the block layout instead
    // of filling a block**, which is why it is not a `TOWN_BUILDING_PASSES` entry and
    // why the mall's generator takes a `recurse` callback rather than reaching for
    // `makeBlocks` itself.
    //
    // The context is built against a throwaway `Block`: `makeMallBlocks` and
    // `makeNarrowPark` never read `ctx.block` — they cut their own blocks from the
    // quads the split gives them — and `TownBuildingContext` has no shape without one.
    if (this.m_Params.generateShoppingMall) {
      makeMallBlocks(
        map,
        blocks,
        cityRectangle,
        this.buildingContext(map, new Block(cityRectangle)),
        (m, list, rect) => this.makeBlocks(m, true, list, rect)
      );
    } else {
      this.makeBlocks(map, true, blocks, cityRectangle);
    }

    ///////////////////////////////////////
    // Make concrete buildings from blocks
    ///////////////////////////////////////
    const emptyBlocks: Block[] = blocks.slice();
    const completedBlocks: Block[] = [];

    // remember blocks.
    this.m_SurfaceBlocks = blocks.map((b) => new Block(b.rectangle));

    // Special buildings.
    // Shopping mall? C# `:409-414`, Release 7-3. Ahead of the police station, which
    // is where the C# has it: "Single-block Unique buildings" is three blocks in
    // the reference and the mall is the first.
    //
    // `makeShoppingMall` returns `null` behind `Feature.ShoppingMall`, so the flag
    // and the feature gate are two locks on the same door and either one alone is
    // enough to keep Classic on `makeBlocks`.
    if (this.m_Params.generateShoppingMall) {
      const mallBlock = makeShoppingMall(map, blocks, this.buildingContext(map, new Block(cityRectangle)));
      if (mallBlock) {
        const index = emptyBlocks.indexOf(mallBlock);
        if (index !== -1) emptyBlocks.splice(index, 1);
      }
    }
    // Police Station?
    if (this.m_Params.generatePoliceStation) {
      const policeBlock = this.makePoliceStation(map, blocks);
      const index = emptyBlocks.indexOf(policeBlock);
      if (index !== -1) emptyBlocks.splice(index, 1);
    }
    // Hospital?
    if (this.m_Params.generateHospital) {
      const hospitalBlock = this.makeHospital(map, blocks);
      const index = emptyBlocks.indexOf(hospitalBlock);
      if (index !== -1) emptyBlocks.splice(index, 1);
    }

    // Army base. C# `:429-452`, and it is a **separate pass ahead of the shops and
    // ahead of the business cascade**, which is where it used to sit here too --
    // it ran after the business region, which is not where the C# has it.
    //
    // Two conditions, both of which matter:
    //
    //  * `DistrictKind.GREEN` only. The C# has the `|| DistrictKind.GENERAL`
    //   commented out at `:430`, so a general district does *not* get one -- and the
    //   port follows the comment rather than the ambition, because enabling it would
    //   put a guaranteed eight-zombie garrison in most districts.
    //  * **One per district.** `armyOfficesCount == 0` gates the attempt and the
    //   increment happens only when one was actually built, so a district whose
    //   blocks are all too small gets none rather than retrying forever.
    //
    // The C#'s `foreach` has no `break` and relies on that counter, which is why the
    // loop can look wasteful and is not: after the first success the `if` is false
    // for every later block.
    //
    // **Moving it is not free, and the reason it was worth doing is the pool.** The
    // C# runs this at `:429-452`, *before* the shops at `:457-465` and the business
    // region at `:467`; the port ran it after both, so it was offered only the
    // leftovers -- blocks that had already lost the shops roll and the CHAR loop. An
    // army base on a block is a whole block consumed, and a GREEN district has few
    // enough of them that "which pool" is the difference between one and none.
    // GREEN-only, so no GENERAL district and no Classic fingerprint is affected.
    this.makeArmyOffices(map, emptyBlocks);

    // shops.
    completedBlocks.length = 0;
    for (const b of emptyBlocks) {
      if (this.m_DiceRoller.rollChance(this.m_Params.shopBuildingChance) && this.makeShopBuilding(map, b)) {
        completedBlocks.push(b);
      }
    }
    for (const b of completedBlocks) {
      const index = emptyBlocks.indexOf(b);
      if (index !== -1) emptyBlocks.splice(index, 1);
    }

    // The C#'s **business region**, `BaseTownGenerator.cs:467-543`, transcribed whole.
    //
    // **This was three loops and is now one, because three loops cannot express the
    // C#.** The port had a CHAR loop, then a library pass over the pool, then a
    // business cascade over the pool again. The C# has one `foreach` with the CHAR
    // attempt, the library, the `roll(0, 4)` cascade, the general store and the
    // ordinary office *nested inside it*, and two facts only that nesting carries:
    //
    //   * `int rolled = m_DiceRoller.Roll(0, 99)` at `:478` gates the CHAR attempt at
    //     `rolled < 30 || charOfficesCount == 0` (`:479`), so the business *interior*
    //     only ever runs on the ~10% of blocks that entered on the outer
    //     `RollChance(CHARBuildingChance)`. The port's separate loops offered the
    //     interior every block the CHAR loop declined.
    //   * `completedBlocks.Add(b)` at `:535` is *inside* the interior's `if`, and
    //     therefore unconditional there — an office finishes its block exactly as a
    //     bar does. The port's `if (placed) completedBlocks.push(b)` let the
    //     unplaced ones back out to the parks, which is what kept any housing at all.
    //
    // Measured over 40 x 40 general districts (~5.3 blocks each), before and after
    // this merge: business blocks 2.8 -> 0.4 per district, and the parks region --
    // which the pool inversion had starved -- comes back (Park 0 -> 11 districts,
    // Church 4 -> 16, Pond 1 -> 10, Farm 0 -> 5, Graveyard 1 -> 3, over 40
    // districts). `TOWN_BUILDING_PASSES` is offered 38 blocks again instead of 0,
    // which it had come to depend on.
    //
    // **Housing did not follow, and it does not need to.** An earlier version of this
    // comment blamed it on the C#'s housing tail having an arm the port lacks --
    // `if (!completed) MakeNarrowPark(map, b)` at `:604-605` -- and put the shortfall
    // at "~2.4 bare blocks per district". That was measured wrong, twice: it was
    // inferred from zone counts rather than counted, and it was wrong because
    // `makeHousingBuilding` **never declines**. Over 4,158 calls across two rulesets
    // and three district sizes it returned false zero times, because
    // `MakeVanillaHousingBuilding`'s floor is a 4x4 inside rect (`:5673`) and
    // `MinBlockSize` is 11 (`:296`), so the smallest block `makeBlocks` can cut has a
    // 7x7 inside rect. The C#'s fallback is a safety net for a case its own generator
    // cannot produce, and the port inherits that, so there is nothing bare to fix and
    // wiring `MakeNarrowPark` here would be dead code.
    //
    // Housing at 0.8/district is therefore not a bug in this region: with the pool
    // inversion fixed, the blocks that reach the tail are the *parks region's*
    // rejects, and at 40x40 the district simply does not cut many more of them.
    //
    // **`rolled` is gated on `cascadeEnabled`, and that is a deliberate divergence.**
    // In the C# the `Roll(0, 99)` sits outside every feature gate, so a faithful
    // transcription would spend a die per block under CLASSIC and move both pinned
    // Classic digests (`9bb5e4907bc3f62c`, `edfe94f97003996a`) — i.e. invalidate
    // every saved Classic world — for a region whose four arms are all Still Alive
    // only. So under Classic `rolled` is 0, which makes `rolled < 30` always true
    // (the CHAR attempt happens whenever the outer gate passes, exactly as before)
    // and `rolled >= 30` always false (the interior never runs, exactly as before).
    // The Classic district is therefore byte-identical to what it was, and the
    // divergence is confined to Classic inside a region that already diverges.
    // Removing it is one `?:` if the Classic digests are ever re-taken on purpose.
    const cascadeEnabled =
      hasFeature(Session.get().ruleset, Feature.Bar) ||
      hasFeature(Session.get().ruleset, Feature.Bank) ||
      hasFeature(Session.get().ruleset, Feature.Clinic) ||
      hasFeature(Session.get().ruleset, Feature.MechanicWorkshop);

    completedBlocks.length = 0;
    let charOfficesCount = 0;
    /** C# `:471`'s `storesCount`, the general store's per-district cap. */
    let storesCount = 0;
    for (const b of emptyBlocks) {
      // C# `:475`. The C#'s condition is `BUSINESS || RollChance(...)`; the port had
      // `BUSINESS && charOfficesCount == 0`, which reads as a port of the *inner*
      // `:479` fallback lifted to the wrong level — the C# has both, and the inner
      // one is reproduced below.
      if (
        this.m_Params.district!.kind === DistrictKind.BUSINESS ||
        this.m_DiceRoller.rollChance(this.m_Params.charBuildingChance)
      ) {
        const ctx = this.buildingContext(map, b);
        const rolled = cascadeEnabled ? this.m_DiceRoller.roll(0, 99) : 0;

        // C# `:479-494`. A CHAR building finishes the block outright and `continue`s
        // past the whole interior; a *declined* CHAR attempt is what
        // `NoCHARBuildingMade` records, and it is the only route into the interior
        // that does not also need `rolled >= 30`.
        let noCHARBuildingMade = false;
        if (rolled < 30 || charOfficesCount === 0) {
          const btype = this.makeCHARBuilding(map, b);
          if (btype !== CHARBuildingType.NONE) {
            if (btype === CHARBuildingType.OFFICE) {
              ++charOfficesCount;
              this.populateCHAROfficeBuilding(map, b);
            }
            completedBlocks.push(b);
            continue;
          }
          noCHARBuildingMade = true;
        }

        // C# `:496-536`. `placed` is the C#'s local (`:497`, Release 7-3).
        let placed = false;
        if (cascadeEnabled && (rolled >= 30 || noCHARBuildingMade)) {
          // `:501`: the library is the `if` *above* the switch and is tried first, so
          // it spends no dispatch die and a block it takes is never charged the
          // `roll(0, 4)`. `makeLibraryBuilding` carries the C#'s `!hasLibrary` cap
          // itself, so returning false for a district that already has one lands in
          // the `else` exactly as the C#'s `!hasLibrary &&` does.
          if (this.tryMakeLibrary(map, b)) {
            placed = true;
          } else {
            // `:508-515`. **One die, four arms,** each behind its own feature:
            // `Feature.Bar`, `Feature.Bank`, `Feature.Clinic` and
            // `Feature.MechanicWorkshop`. The die is spent here, ahead of every arm's
            // own size and cap check, because that is the order the C# consumed it and
            // what makes the four mutually exclusive.
            //
            // Case 3 used to be an empty arm — the comment here said the workshop was
            // "vanilla and not part of this port's set", which it is not: vanilla
            // `src\` has no `MakeMechanicWorkshop` at all, and the fork added it in
            // Release 4. An empty arm is a *fall-through to the store and then the
            // office*, so filling it costs only the blocks the workshop declines for
            // itself.
            const roll2 = this.m_DiceRoller.roll(0, 4);
            if (roll2 === 0) placed = makeBarBuilding(ctx, roll2);
            else if (roll2 === 1) placed = makeBankBuilding(ctx, roll2);
            else if (roll2 === 2) placed = makeClinicBuilding(ctx, roll2);
            else if (roll2 === 3) placed = makeMechanicWorkshop(ctx, roll2);

            // `:519-526`, Release 7-3: "we've got enough of the standard biz types,
            // fill in a couple of gaps with General stores before we resort to
            // generic offices". Reached only on a decline, and capped at
            // `Round((Width / 10) / 3)` per district. The C#'s `map.Width / 10` is
            // *integer* division, so the floor is part of the formula rather than
            // rounding tidiness.
            if (!placed && storesCount < Math.round(Math.floor(map.width / 10) / 3)) {
              if (this.makeShopBuilding(map, b, ShopType.GENERAL_STORE)) {
                ++storesCount;
                placed = true;
              }
            }
          }

          // `:529-533`: what the interior did not build becomes a plain office. The
          // C# discards the return value — `:535`, not the office, is what finishes
          // the block.
          if (!placed) this.makeOrdinaryOffice(map, b);
        }

        // `:535`, unconditional *inside* the interior's `if`. This is the line the
        // office arm was blocked on, and the reason it is safe to have it here is the
        // `rolled < 30` gate above: only the ~10% of blocks that entered the outer
        // `if` reach this, so the other ~90% still fall through to the parks.
        if (placed || cascadeEnabled) completedBlocks.push(b);
      }
    }
    for (const b of completedBlocks) {
      const index = emptyBlocks.indexOf(b);
      if (index !== -1) emptyBlocks.splice(index, 1);
    }

    // ── The C#'s parks region, `BaseTownGenerator.cs:546-591`, as one loop ──────
    //
    // ```
    // if (m_DiceRoller.RollChance(m_Params.ParkBuildingChance))
    // {
    //     bool greenSuccess = true;
    //     if (!MakeTennisCourt(map, b) && !MakeBasketballCourt(map, b))
    //     {
    //         if (MakeFuelStation(map, b, fuelStationsPlaced)) { ++fuel; goto Completed; }
    //         if (!fireStationPlaced && MakeFireStation(map, b)) { … goto Completed; }
    //         int rolled = m_DiceRoller.Roll(0, 99);
    //         if (rolled >= 65)      greenSuccess = MakeParkBuilding(map, b, false);      // 35%
    //         else if (rolled < 64)  greenSuccess = MakeFarmBuilding(map, b);            // 35%
    //         else if (rolled < 29)  greenSuccess = MakeAnimalShelterBuilding(map, b);  // 10%
    //         else if (rolled < 19)  greenSuccess = MakeParkBuilding(map, b, true);      // 10%
    //         else                   greenSuccess = MakeJunkyard(map, b);               // 10%
    //     }
    //     Completed: if (greenSuccess) completedBlocks.Add(b);
    // }
    // ```
    //
    // **This was two passes and is now one, because two passes cannot express it.**
    // The port had a loop doing courts/fuel/fire/ordinary-park behind one
    // `rollChance(parkBuildingChance)`, and then `makeJunkyards` doing
    // graveyard/shelter/farm/junkyard behind a *second* one plus the `roll(0, 99)`.
    // Two `RollChance` where the C# has one, and the ordinary park on no die at all.
    //
    // The consequences that were measurable, over 40 x 40 districts:
    //
    //   * **The green arms ran at half rate.** A block had to pass two independent 10%
    //      gates to reach the `roll(0, 99)`, so ~1% of blocks became shelter/farm/
    //      graveyard/junkyard where the C# has ~10%.
    //   * **The ordinary park had no arm.** It was the tail of the *first* loop, so
    //      it was built for every block that passed the gate and lost the courts, the
    //      fuel station and the fire station -- and then the `roll(0, 99)` could not
    //      reach it again. In the C# it is the `rolled >= 65` arm, **35% of the die**,
    //      and the port built it at ~100%. So the port had far too many ordinary parks
    //      and none of the C#'s band discipline.
    //
    // The cascade itself is `makeGreenBuilding(map, b, rolled)`, a per-block `protected`
    // method like its five siblings, which replaces the `makeJunkyards(map, emptyBlocks)`
    // pass that used to live here.
    //
    // **The `roll(0, 99)` is spent only when an arm that needs it exists.** Under
    // CLASSIC the courts, fuel station, fire station, farm, shelter, graveyard and
    // junkyard are all Still Alive, so of the five bands only the ordinary park is
    // reachable — and the C# would reach it by drawing 65-99. Spending a die to then
    // take an arm the port already took unconditionally would move both pinned
    // Classic digests for no behavioural gain, so Classic takes the park directly and
    // pays nothing. That is the same trade as the business region's `rolled`, and it
    // is the third such gate in this one region: see the handover.
    const greenArmsExist =
      hasFeature(Session.get().ruleset, Feature.Farm) ||
      hasFeature(Session.get().ruleset, Feature.AnimalShelter) ||
      hasFeature(Session.get().ruleset, Feature.Graveyard) ||
      hasFeature(Session.get().ruleset, Feature.Junkyard);
    completedBlocks.length = 0;
    for (const b of emptyBlocks) {
      if (!this.m_DiceRoller.rollChance(this.m_Params.parkBuildingChance)) continue;

      // The courts are the first arm of the C#'s `&&` chain, ahead of the fuel
      // station and the fire station. **Their two gates are exact `buildingRect`
      // equality** -- 8x10 and 10x8 -- mutually exclusive by shape, so the chain
      // never chooses between them, and neither spends a die before its size return.
      let greenSuccess = true;
      if (this.makeTennisCourt(map, b)) {
        greenSuccess = true;
      } else if (this.makeBasketballCourt(map, b)) {
        greenSuccess = true;
      } else if (this.makeFuelStation(map, b)) {
        greenSuccess = true;
      } else if (this.makeFireStation(map, b)) {
        greenSuccess = true;
      } else if (!greenArmsExist) {
        // CLASSIC: only the ordinary park is reachable, and the port reached it
        // without a die before this merge. See the note above.
        greenSuccess = this.makeParkBuilding(map, b, false);
      } else {
        // `:572`. **The one `roll(0, 99)` the whole green cascade shares**, spent here
        // and not inside any arm, because one die picks between five mutually
        // exclusive buildings and a die spent per arm would be five.
        greenSuccess = this.makeGreenBuilding(map, b, this.m_DiceRoller.roll(0, 99));
      }
      if (greenSuccess) completedBlocks.push(b);
    }
    for (const b of completedBlocks) {
      const index = emptyBlocks.indexOf(b);
      if (index !== -1) emptyBlocks.splice(index, 1);
    }

    // Building generators registered in `./TownBuilding` (currently none shipped --
    // see TOWN_BUILDING_PASSES). Sits between the parks and the churches, which is
    // where the C# has its "green" and "housing" stages. **Not** where the bar goes:
    // the C# builds the bar inside the business cascade at `:511`, before the parks,
    // so it is dispatched by the shared `roll(0, 4)` pass above instead.
    runTownBuildingPasses(TOWN_BUILDING_PASSES, emptyBlocks, (b) => this.buildingContext(map, b));

    // churches. C# `BaseTownGenerator.cs:598-600` rolls for one per still-empty
    // block and falls through to a house when the roll misses.
    this.makeChurchBuildings(map, emptyBlocks);

    // all the rest is housings.
    completedBlocks.length = 0;
    for (const b of emptyBlocks) {
      this.makeHousingBuilding(map, b);
      completedBlocks.push(b);
    }
    for (const b of completedBlocks) {
      const index = emptyBlocks.indexOf(b);
      if (index !== -1) emptyBlocks.splice(index, 1);
    }

    ////////////
    // Decorate
    ////////////
    this.addWreckedCarsOutside(map, cityRectangle);
    this.decorateOutsideWallsWithPosters(map, cityRectangle, this.m_Params.postersChance);
    this.decorateOutsideWallsWithTags(map, cityRectangle, this.m_Params.tagsChance);

    // alpha10
    /////////
    // Music
    /////////
    map.bgMusic = GameMusics.SURFACE;

    ////////
    // Done
    ////////
    return map;
  }

  // ── Fire station ──────────────────────────────────────────────────────────

  /**
   * One fire station per district, on the first block the parks stage is rolling
   * for that is small enough. C# `BaseTownGenerator.cs:547` and `:563-568`:
   *
   * ```csharp
   * bool fireStationPlaced = true;      // :547
   * …
   *     if (m_DiceRoller.RollChance(m_Params.ParkBuildingChance))
   *     {
   *         if (!MakeTennisCourt(map, b) && !MakeBasketballCourt(map, b))
   *         {
   *             if (MakeFuelStation(map, b, fuelStationsPlaced)) { … goto Completed; }
   *             if (!fireStationPlaced && MakeFireStation(map, b))
   *             {
   *                 fireStationPlaced = true;
   *                 greenSuccess = true;
   *                 goto Completed;
   *             }
   * ```
   *
   * A `protected` method and not an inline `if` in `generate()` for the reason
   * `makeChurchBuildings` is one: the stage has to be *testable as a no-op*.
   * Overriding this away is a generator with the building genuinely removed, and
   * a Classic district from one has to be byte-identical to a Classic district
   * from the real class — which can only happen if nothing here runs under
   * Classic. See `tests/fire-station-building.test.ts`.
   *
   * **It takes no roll of its own, and that is the whole wiring.** The fire
   * station is not a case of a `switch` like the bar and the bank, and it has no
   * chance roll of its own like the church: it shares the parks region's single
   * `RollChance(m_Params.ParkBuildingChance)`, which the loop above has already
   * spent by the time this is called. A pass at the seam that rolled for itself
   * would spend a second die per block and be offered the blocks that lost the
   * first one, which the C# never does. The C#'s own `fireStationPlaced` flag
   * lives in the generator file keyed on the roller, for the same lifetime the
   * C#'s local had.
   *
   * `:547` initialises that flag to `true`, which makes `:563` unreachable and
   * `MakeFireStation` dead code in the reference; the port starts from `false`.
   * See the header in `./buildings/makeFireStationBuilding`.
   */
  protected makeFireStation(map: GameMap, b: Block): boolean {
    return makeFireStationBuilding(this.buildingContext(map, b));
  }

  // ── Fuel station ──────────────────────────────────────────────────────────

  /**
   * One fuel station per district while the district is under the map-wide cap.
   * C# `BaseTownGenerator.cs:557` and `:2811` `MakeFuelStation`:
   *
   * ```csharp
   * int fuelStationsPlaced = 0;                                        // :548
   * …
   *     if (!MakeTennisCourt(map, b) && !MakeBasketballCourt(map, b))
   *     {
   *         if (MakeFuelStation(map, b, fuelStationsPlaced))            // :557
   *         {
   *             ++fuelStationsPlaced;
   *             goto Completed;
   *         }
   * ```
   *
   * A `protected` method and not an inline `if` in `generate()` for the reason
   * `makeFireStation` is one: the gate has to be *testable as a no-op*. Overriding
   * it away is a generator with the building genuinely removed, and a Classic
   * district from one has to be byte-identical to a Classic district from the real
   * class -- which can only happen if nothing here, rolls included, runs under
   * Classic. See `tests/fuel-station-building.test.ts`.
   *
   * **It takes the parks region's die, not one of its own.** Like the fire station
   * it is a bare `if` inside the `&&` chain that `RollChance(ParkBuildingChance)`
   * gates, and it is reached for every block that got past the two sports courts.
   * The only roll it spends is its own door side (`:2839`), and that comes after
   * the suitability return, so a block the C# declines costs the district nothing
   * here either.
   *
   * The counter is *not* in this class. The C#'s `fuelStationsPlaced` resets per
   * district (`:548` is inside the parks region, inside the district loop) while
   * its cap comes from the whole map's `Width`, and the two halves only make sense
   * together; `./makeFuelStationBuilding` keeps both, keyed on the district's
   * roller, which is the lifetime the C#'s local had.
   */
  protected makeFuelStation(map: GameMap, b: Block): boolean {
    return makeFuelStationBuilding(this.buildingContext(map, b));
  }

  // ── Farm ───────────────────────────────────────────────────────────────────

  /**
   * `MakeFarmBuilding` — `BaseTownGenerator.cs:3685` — the `rolled >= 30 && rolled <
   * 64` band of the parks region's `roll(0, 99)`, and the **widest** of its five arms
   * at 34%.
   *
   * A `protected` method for the reason `makeFireStation` is one: the gate has to be
   * *testable as a no-op*, and a band test that lives inline in `generate()` cannot
   * be overridden away without overriding the whole loop. It takes **no roll of its
   * own** — the `roll(0, 99)` is the parks region's and is spent before this is
   * called — so a block that fails the band's shape check costs the district nothing
   * here.
   *
   * The band test is in the call site rather than in here, which is a departure from
   * the shelter and the junkyard: those two take the `dispatchRoll` and decline bands
   * themselves, and the farm does not. One shared die, five arms, and the ordering
   * requirement is only that the farm precedes the junkyard -- which is the `else`.
   */
  protected makeFarm(map: GameMap, b: Block): boolean {
    if (!hasFeature(Session.get().ruleset, Feature.Farm)) return false;
    return makeFarmBuilding(this.buildingContext(map, b));
  }

  // ── The green cascade ──────────────────────────────────────────────────────

  /**
   * C# `BaseTownGenerator.cs:570-581` -- the parks region's `Roll(0, 99)` and the
   * five mutually exclusive arms behind it.
   *
   * ```csharp
   * int rolled = m_DiceRoller.Roll(0, 99);
   * if (rolled >= 65)     greenSuccess = MakeParkBuilding(map, b, false);   // ordinary park
   * else if (rolled >= 30 && rolled < 64) greenSuccess = MakeFarmBuilding(map, b);
   * else if (rolled >= 20 && rolled < 29) greenSuccess = MakeAnimalShelterBuilding(map, b);
   * else if (rolled >= 10 && rolled < 19) greenSuccess = MakeParkBuilding(map, b, true);  // graveyard
   * else                  greenSuccess = MakeJunkyard(map, b);
   * ```
   *
   * **It takes the roll as a parameter and spends none of its own**, for the reason
   * every other arm in this region does: the die is the region's, and an arm that
   * rolled for itself would spend a second one per block and be offered the blocks
   * that lost the first. It is also what makes this method a *seam* -- a test can
   * override the whole cascade away and be certain no die was spent, which is the
   * property `tests/junkyard-building.test.ts` asserts.
   *
   * **The band boundaries are the C#'s, gaps included.** `rolled < 64` against
   * `rolled >= 65` leaves 64 matching no arm and falling to the junkyard; see
   * `JUNKYARD_ROLL_FARM_GAP` in `./buildings/makeJunkyard`. The arms are in the C#'s
   * order and the bands are disjoint apart from that, so the order is not load-bearing
   * -- which is worth saying because the graveyard sits *below* the shelter here and
   * *above* it in the C#.
   *
   * This replaces `makeJunkyards(map, emptyBlocks)`, which was a second pass over the
   * pool with its own `rollChance(parkBuildingChance)` -- so the green arms were being
   * offered only the blocks that had already lost the parks region's one gate, at
   * roughly half the C#'s rate.
   */
  protected makeGreenBuilding(map: GameMap, b: Block, rolled: number): boolean {
    // `:574`, `>= 65`: the ordinary park. Vanilla, and the only arm of the five that
    // is -- which is why the call site can reach it without spending the die under
    // Classic.
    if (rolled >= 65) return this.makeParkBuilding(map, b, false);
    // `:575`, `30..63`. **34%, not the 35% its comment claims** -- 64 goes past it.
    if (rolled >= 30 && rolled < 64) return this.makeFarm(map, b);
    // `:577`, band `20..29`. The generator declines every other band itself, for the
    // reason `makeJunkyard` does -- one shared die, five arms -- so this arm carries
    // no gate and no bound of its own.
    if (makeAnimalShelterBuilding(this.buildingContext(map, b), rolled)) return true;
    // `:579`, band `10..19`: the graveyard is a park with `isgraveyard` set.
    if (rolled >= 10 && rolled < 20 && hasFeature(Session.get().ruleset, Feature.Graveyard)) {
      return this.makeParkBuilding(map, b, true);
    }
    // `:580`, the trailing `else`: bands `0..9` and the reference's own 64.
    return makeJunkyard(this.buildingContext(map, b), rolled);
  }

  // ── Sports courts ──────────────────────────────────────────────────────────

  /**
   * C# `MakeTennisCourt(map, b)` — `BaseTownGenerator.cs:5858` — the **first**
   * operand of `if (!MakeTennisCourt(map, b) && !MakeBasketballCourt(map, b))` at
   * `:555`. Two `protected` shims and not inline `if`s for the reason every other
   * stage here has one: the gate has to be testable as a no-op, and over riding
   * this away is a generator with the building genuinely removed.
   *
   * **Not a dead method in the reference, unlike `MakeFireStation`.** That one is
   * unreachable because `:547` initialises `fireStationPlaced = true`; nothing does
   * the same to either court, both are `protected virtual` and neither is
   * overridden. Their `greenSuccess` at `:554` is initialised `true` and neither
   * court assigns it, which *looks* like the same class of bug and is not: a court
   * succeeding with `greenSuccess` still `true` is precisely how the block gets
   * consumed, which is what the C# means by it. Do not "fix" that initialiser.
   *
   * They are also **rare**, and the rarity is the content: an 8x10 `buildingRect`
   * is a 10x12 block, one tile off the floor of what `makeBlocks` cuts at the
   * default `minBlockSize` of 11. The Release 7-3 comment at `:555` ("these must be
   * limited to specific dimensions") reads as a warning rather than a design.
   */
  protected makeTennisCourt(map: GameMap, b: Block): boolean {
    return makeTennisCourtBuilding(this.buildingContext(map, b));
  }

  /** C# `MakeBasketballCourt(map, b)` — `BaseTownGenerator.cs:5968`, the second operand. */
  protected makeBasketballCourt(map: GameMap, b: Block): boolean {
    return makeBasketballCourtBuilding(this.buildingContext(map, b));
  }

  // ── Library ───────────────────────────────────────────────────────────────

  /**
   * C# `BaseTownGenerator.cs:501-508` on one block: the `if (!hasLibrary &&
   * MakeLibraryBuilding(map, b))` that precedes the business cascade's
   * `switch (roll2)`.
   *
   * **This was a pool pass and is now a per-block attempt, because the business
   * region is one loop again.** It used to be `makeLibraryBuildings(map,
   * emptyBlocks)`, offered every block the CHAR loop had declined -- which is a
   * superset of the C#'s blocks by a factor of about ten, since the C# only
   * offers it the blocks that entered the business `if` on the 10%
   * `RollChance(CHARBuildingChance)`. Reproducing the C#'s control flow by pool
   * membership only works while the pool *is* the C#'s pool, and after the merge
   * it is not.
   *
   * Still a `protected` method and not an inline `if` in `generate()` for the
   * reason `makeChurchBuildings` is one: the gate has to be *testable as a
   * no-op*. Overriding this method away is a generator with the feature genuinely
   * removed, and a Classic district generated by one has to be byte-identical to
   * a Classic district from the real class -- which can only happen if nothing
   * here runs under Classic. See `tests/library-building.test.ts`.
   *
   * It takes **no** roll of its own: the C# has no dispatch die for the library
   * (it is the `if` above the switch, not a case in it), so there is nothing to
   * gate, and a Classic district pays nothing for a building neither ruleset has.
   * The one-per-district cap is a `ref bool` the C# declares at `:469`, which
   * `TownBuildingContext` has nowhere to put, so it lives in the building keyed
   * on the roller -- the same lifetime the C#'s local had, for the same reason
   * the bar's and the bank's counters do.
   */
  protected tryMakeLibrary(map: GameMap, b: Block): boolean {
    return makeLibraryBuilding(this.buildingContext(map, b));
  }

  // ── Church ────────────────────────────────────────────────────────────────

  /**
   * One church per ten still-empty blocks, and a rolled attempt for every block.
   * C# `BaseTownGenerator.cs:598-604`.
   *
   * A `protected` method and not an inline `if` in `generate()` for one reason:
   * the gate has to be *testable as a no-op*. A test that only asserts "classic
   * produced no church" passes just as happily if the church stage ran and every
   * roll and every block happened to decline, so it proves nothing about the
   * dice. Overriding this method to do nothing at all is a generator with the
   * feature genuinely removed, and a classic district generated by one is
   * byte-identical to a classic district generated by the real class only if
   * nothing here -- roll included -- runs under Classic. See
   * `tests/church-building.test.ts`.
   *
   * The roll is inside the gate for the reason `makeObjWreckedCar` puts its fuel
   * roll inside one (`BaseMapGenerator.ts:565-572`): a roll that is taken and
   * discarded still moves every roll after it, and a Classic world has to stay
   * the world it has always been.
   */
  protected makeChurchBuildings(map: GameMap, emptyBlocks: Block[]): void {
    if (!hasFeature(Session.get().ruleset, Feature.Church)) return;

    const built: Block[] = [];
    for (const b of emptyBlocks) {
      // `churchBuildingChance` is a module constant rather than a `Parameters`
      // field: `Parameters` lives in `./TownBuilding`, which a building may not
      // widen, and this is the one chance in the C# that has no `m_Params`
      // behind it anyway -- `:600` is a literal `10` against a `Roll(0, 99)`.
      if (this.m_DiceRoller.rollChance(CHURCH_BUILDING_CHANCE) && makeChurchBuilding(this.buildingContext(map, b))) {
        built.push(b);
      }
    }
    for (const b of built) {
      const index = emptyBlocks.indexOf(b);
      if (index !== -1) emptyBlocks.splice(index, 1);
    }
  }

  // ── Sewers Map ───────────────────────────────────────────────────────────

  generateSewersMap(seed: number, district: District): GameMap {
    // Create.
    this.m_DiceRoller = new DiceRoller(seed);
    const sewers = new GameMap(seed, 'sewers', district.entryMap!.width, district.entryMap!.height);
    sewers.lighting = Lighting.DARKNESS;
    sewers.addZone(this.makeUniqueZone('sewers', sewers.rect));
    this.tileFill(sewers, Models.tiles.get(TileID.WALL_SEWER)!);

    ///////////////////////////////////////////////////
    // 1. Make blocks.
    // 2. Make tunnels.
    // 3. Link with surface.
    // 4. Additional jobs.
    // 5. Sewers Maintenance Room & Building(surface).
    // 6. Some rooms.
    // 7. Objects.
    // 8. Items.
    // 9. Tags.
    // alpha10
    // 10. Music.
    ///////////////////////////////////////////////////
    const surface = district.entryMap!;

    // 1. Make blocks.
    const blocks: Block[] = [];
    this.makeBlocks(sewers, false, blocks, new Rect(0, 0, sewers.width, sewers.height));

    // 2. Make tunnels.
    // Carve tunnels.
    for (const b of blocks) {
      this.tileRectangle(sewers, Models.tiles.get(TileID.FLOOR_SEWER_WATER)!, b.rectangle);
    }
    // Iron Fences blocking some tunnels.
    for (const b of blocks) {
      // chance?
      if (!this.m_DiceRoller.rollChance(SEWERS_IRON_FENCE_PER_BLOCK_CHANCE)) continue;

      // fences on a side.
      let fx1 = 0;
      let fy1 = 0;
      let fx2 = 0;
      let fy2 = 0;
      let goodFencePos = false;
      do {
        // roll side.
        const sideRoll = this.m_DiceRoller.roll(0, 4);
        switch (sideRoll) {
          case 0: // north.
          case 1: {
            // south.
            fx1 = this.m_DiceRoller.roll(b.rectangle.left, b.rectangle.right - 1);
            fy1 = sideRoll === 0 ? b.rectangle.top : b.rectangle.bottom - 1;

            fx2 = fx1;
            fy2 = sideRoll === 0 ? fy1 - 1 : fy1 + 1;
            break;
          }
          case 2: // east.
          case 3: {
            // west.
            fx1 = sideRoll === 2 ? b.rectangle.left : b.rectangle.right - 1;
            fy1 = this.m_DiceRoller.roll(b.rectangle.top, b.rectangle.bottom - 1);

            fx2 = sideRoll === 2 ? fx1 - 1 : fx1 + 1;
            fy2 = fy1;
            break;
          }
          default:
            throw new RangeError('unhandled roll');
        }

        // never on border.
        if (sewers.isOnMapBorder(fx1, fy1) || sewers.isOnMapBorder(fx2, fy2)) continue;

        // must have walls.
        if (this.countAdjWalls(sewers, fx1, fy1) !== 3) continue;
        if (this.countAdjWalls(sewers, fx2, fy2) !== 3) continue;

        // found!
        goodFencePos = true;
      } while (!goodFencePos);

      // add (both of them)
      this.mapObjectPlace(sewers, fx1, fy1, this.makeObjIronFence(GameImages.OBJ_IRON_FENCE));
      this.mapObjectPlace(sewers, fx2, fy2, this.makeObjIronFence(GameImages.OBJ_IRON_FENCE));
    }

    // 3. Link with surface.
    // loop until we got at least one link.
    let countLinks = 0;
    do {
      for (let x = 0; x < sewers.width; x++)
        for (let y = 0; y < sewers.height; y++) {
          // link? roll chance. 3%
          const doLink = this.m_DiceRoller.rollChance(3);
          if (!doLink) continue;

          // both surface and sewer tile must be walkable.
          const tileSewer = sewers.getTileAt(x, y)!;
          if (!tileSewer.model.isWalkable) continue;
          const tileSurface = surface.getTileAt(x, y)!;
          if (!tileSurface.model.isWalkable) continue;

          // no blocking object.
          if (sewers.getMapObjectAt(x, y) !== null) continue;

          // surface tile must be outside.
          if (tileSurface.isInside) continue;
          // surface tile must be walkway or grass.
          if (tileSurface.model !== Models.tiles.get(TileID.FLOOR_WALKWAY) && tileSurface.model !== Models.tiles.get(TileID.FLOOR_GRASS))
            continue;
          // surface tile must not be obstructed by an object.
          if (surface.getMapObjectAt(x, y) !== null) continue;

          // must not be adjacent to another exit.
          const pt = new Point(x, y);
          if (sewers.hasAnyAdjacentInMap(pt, (p) => sewers.getExitAt(p) !== null)) continue;
          if (surface.hasAnyAdjacentInMap(pt, (p) => surface.getExitAt(p) !== null)) continue;

          // link with ladder and sewer hole.
          this.addExit(sewers, pt, surface, pt, GameImages.DECO_SEWER_LADDER, true);
          this.addExit(surface, pt, sewers, pt, GameImages.DECO_SEWER_HOLE, true);

          // - one more link.
          ++countLinks;
        }
    } while (countLinks < 1);

    // 4. Additional jobs.
    // Mark all the map as inside.
    for (let x = 0; x < sewers.width; x++)
      for (let y = 0; y < sewers.height; y++) sewers.getTileAt(x, y)!.isInside = true;

    // 5. Sewers Maintenance Room & Building(surface).
    // search a suitable surface blocks.
    let goodBlocks: Block[] | null = null;
    for (const b of this.m_SurfaceBlocks!) {
      // surface building must be of minimal size.
      if (b.buildingRect.width > this.m_Params.minBlockSize + 2 || b.buildingRect.height > this.m_Params.minBlockSize + 2) continue;

      // must not be a special building or have an exit (eg: houses with basements)
      if (this.isThereASpecialBuilding(surface, b.insideRect)) continue;

      // we must carve a room in the sewers.
      let hasRoom = true;
      for (let x = b.rectangle.left; x < b.rectangle.right && hasRoom; x++)
        for (let y = b.rectangle.top; y < b.rectangle.bottom && hasRoom; y++) {
          if (sewers.getTileAt(x, y)!.model.isWalkable) hasRoom = false;
        }
      if (!hasRoom) continue;

      // found one.
      if (goodBlocks === null) goodBlocks = [];
      goodBlocks.push(b);
      break;
    }

    // if found, make maintenance room in sewers and building on surface.
    if (goodBlocks !== null) {
      // pick one at random.
      const surfaceBlock = goodBlocks[this.m_DiceRoller.roll(0, goodBlocks.length)];

      // clear surface building.
      this.clearRectangle(surface, surfaceBlock.buildingRect);
      this.tileFill(surface, Models.tiles.get(TileID.FLOOR_CONCRETE)!, surfaceBlock.buildingRect);
      const surfaceIndex = this.m_SurfaceBlocks!.indexOf(surfaceBlock);
      if (surfaceIndex !== -1) this.m_SurfaceBlocks!.splice(surfaceIndex, 1);

      // make maintenance building on the surface & room in the sewers.
      const newSurfaceBlock = new Block(surfaceBlock.rectangle);
      const ladderHolePos = new Point(
        newSurfaceBlock.buildingRect.left + Math.floor(newSurfaceBlock.buildingRect.width / 2),
        newSurfaceBlock.buildingRect.top + Math.floor(newSurfaceBlock.buildingRect.height / 2)
      );
      this.makeSewersMaintenanceBuilding(surface, true, newSurfaceBlock, sewers, ladderHolePos);
      const sewersRoom = new Block(surfaceBlock.rectangle);
      this.makeSewersMaintenanceBuilding(sewers, false, sewersRoom, surface, ladderHolePos);
    }

    // 6. Some rooms.
    for (const b of blocks) {
      // chance?
      if (!this.m_DiceRoller.rollChance(SEWERS_ROOM_CHANCE)) continue;

      // must be all walls = not already assigned as a room.
      if (!this.checkForEachTile(sewers, b.buildingRect, (pt) => !sewers.getTileAt(pt.x, pt.y)!.model.isWalkable)) continue;

      // carve a room.
      this.tileFill(sewers, Models.tiles.get(TileID.FLOOR_CONCRETE)!, b.insideRect);

      // 4 entries.
      sewers.setTileModelAt(b.buildingRect.left + Math.floor(b.buildingRect.width / 2), b.buildingRect.top, Models.tiles.get(TileID.FLOOR_CONCRETE)!);
      sewers.setTileModelAt(b.buildingRect.left + Math.floor(b.buildingRect.width / 2), b.buildingRect.bottom - 1, Models.tiles.get(TileID.FLOOR_CONCRETE)!);
      sewers.setTileModelAt(b.buildingRect.left, b.buildingRect.top + Math.floor(b.buildingRect.height / 2), Models.tiles.get(TileID.FLOOR_CONCRETE)!);
      sewers.setTileModelAt(b.buildingRect.right - 1, b.buildingRect.top + Math.floor(b.buildingRect.height / 2), Models.tiles.get(TileID.FLOOR_CONCRETE)!);

      // zone.
      sewers.addZone(this.makeUniqueZone('room', b.insideRect));
    }

    // 7. Objects.
    // junk.
    this.mapObjectFill(sewers, new Rect(0, 0, sewers.width, sewers.height), (pt) => {
      if (!this.m_DiceRoller.rollChance(SEWERS_JUNK_CHANCE)) return null;
      if (!sewers.isWalkable(pt.x, pt.y)) return null;

      return this.makeObjJunk(GameImages.OBJ_JUNK);
    });

    // 8. Items.
    for (let x = 0; x < sewers.width; x++)
      for (let y = 0; y < sewers.height; y++) {
        if (!this.m_DiceRoller.rollChance(SEWERS_ITEM_CHANCE)) continue;
        if (!sewers.isWalkable(x, y)) continue;

        // drop item.
        let it: Item;
        const roll = this.m_DiceRoller.roll(0, 3);
        switch (roll) {
          case 0:
            it = this.makeItemBigFlashlight();
            break;
          case 1:
            it = this.makeItemCrowbar();
            break;
          case 2:
            it = this.makeItemSprayPaint();
            break;
          default:
            throw new RangeError('unhandled roll');
        }
        sewers.dropItemAt(it, new Point(x, y));
      }

    // 9. Tags.
    for (let x = 0; x < sewers.width; x++)
      for (let y = 0; y < sewers.height; y++) {
        if (this.m_DiceRoller.rollChance(SEWERS_TAG_CHANCE)) {
          // must be a wall with walkables around.
          const t = sewers.getTileAt(x, y)!;
          if (t.model.isWalkable) continue;
          if (this.countAdjWalkables(sewers, x, y) < 2) continue;

          // tag.
          t.addDecoration(BaseTownGenerator.TAGS[this.m_DiceRoller.roll(0, BaseTownGenerator.TAGS.length)]);
        }
      }

    // alpha10
    // 10. Music.
    sewers.bgMusic = GameMusics.SEWERS;

    // Done.
    return sewers;
  }

  // ── Subway Map ───────────────────────────────────────────────────────────

  generateSubwayMap(seed: number, district: District): GameMap {
    // Create.
    this.m_DiceRoller = new DiceRoller(seed);
    const subway = new GameMap(seed, 'subway', district.entryMap!.width, district.entryMap!.height);
    subway.lighting = Lighting.DARKNESS;
    this.tileFill(subway, Models.tiles.get(TileID.WALL_BRICK)!);

    /////////////////////////////////////
    // 1. Trace rail line.
    // 2. Make station linked to surface?
    // 3. Small tools room.
    // 4. Tags & Posters almost everywhere.
    // 5. Additional jobs.
    // alpha10
    // 6. Music
    /////////////////////////////////////
    const surface = district.entryMap!;

    // 1. Trace rail line.
    const railStartX = 0;
    const railEndX = subway.width - 1;
    const railY = Math.floor(subway.width / 2) - 1;
    const railSize = 4;

    for (let x = railStartX; x <= railEndX; x++) {
      for (let y = railY; y < railY + railSize; y++) subway.setTileModelAt(x, y, Models.tiles.get(TileID.RAIL_EW)!);
    }
    subway.addZone(this.makeUniqueZone(NAME_SUBWAY_RAILS, new Rect(railStartX, railY, railEndX - railStartX + 1, railSize)));

    // 2. Make station linked to surface.
    // search a suitable surface blocks.
    let goodBlocks: Block[] | null = null;
    for (const b of this.m_SurfaceBlocks!) {
      // surface building must be of minimal size.
      if (b.buildingRect.width > this.m_Params.minBlockSize + 2 || b.buildingRect.height > this.m_Params.minBlockSize + 2) continue;

      // must not be a special building or have an exit (eg: houses with basements)
      if (this.isThereASpecialBuilding(surface, b.insideRect)) continue;

      // we must carve a room in the subway and must not be to close to rails.
      let hasRoom = true;
      const minDistToRails = 8;
      for (let x = b.rectangle.left - minDistToRails; x < b.rectangle.right + minDistToRails && hasRoom; x++)
        for (let y = b.rectangle.top - minDistToRails; y < b.rectangle.bottom + minDistToRails && hasRoom; y++) {
          if (!subway.isInBounds(x, y)) continue;
          if (subway.getTileAt(x, y)!.model.isWalkable) hasRoom = false;
        }
      if (!hasRoom) continue;

      // found one.
      if (goodBlocks === null) goodBlocks = [];
      goodBlocks.push(b);
      break;
    }

    // if found, make station room and building.
    if (goodBlocks !== null) {
      // pick one at random.
      const surfaceBlock = goodBlocks[this.m_DiceRoller.roll(0, goodBlocks.length)];

      // clear surface building.
      this.clearRectangle(surface, surfaceBlock.buildingRect);
      this.tileFill(surface, Models.tiles.get(TileID.FLOOR_CONCRETE)!, surfaceBlock.buildingRect);
      const surfaceIndex = this.m_SurfaceBlocks!.indexOf(surfaceBlock);
      if (surfaceIndex !== -1) this.m_SurfaceBlocks!.splice(surfaceIndex, 1);

      // make station building on the surface & room in the subway.
      const newSurfaceBlock = new Block(surfaceBlock.rectangle);
      const stairsPos = new Point(newSurfaceBlock.buildingRect.left + Math.floor(newSurfaceBlock.buildingRect.width / 2), newSurfaceBlock.insideRect.top);
      this.makeSubwayStationBuilding(surface, true, newSurfaceBlock, subway, stairsPos);
      const subwayRoom = new Block(surfaceBlock.rectangle);
      this.makeSubwayStationBuilding(subway, false, subwayRoom, surface, stairsPos);
    }

    // 3.  Small tools room.
    const toolsRoomWidth = 5;
    const toolsRoomHeight = 5;
    const toolsRoomDir = this.m_DiceRoller.rollChance(50) ? Direction.N : Direction.S;
    let toolsRoom = Rect.Empty;
    let foundToolsRoom = false;
    let toolsRoomAttempt = 0;
    do {
      const x = this.m_DiceRoller.roll(10, subway.width - 10);
      const y = toolsRoomDir === Direction.N ? railY - 1 : railY + railSize;

      if (!subway.getTileAt(x, y)!.model.isWalkable) {
        // make room rectangle.
        if (toolsRoomDir === Direction.N) toolsRoom = new Rect(x, y - toolsRoomHeight + 1, toolsRoomWidth, toolsRoomHeight);
        else toolsRoom = new Rect(x, y, toolsRoomWidth, toolsRoomHeight);
        // check room rect is all walls (do not overlap with platform or other rooms)
        foundToolsRoom = this.checkForEachTile(subway, toolsRoom, (pt) => !subway.getTileAt(pt.x, pt.y)!.model.isWalkable);
      }
      ++toolsRoomAttempt;
    } while (toolsRoomAttempt < subway.width * subway.height && !foundToolsRoom);

    if (foundToolsRoom) {
      // room.
      this.tileFill(subway, Models.tiles.get(TileID.FLOOR_CONCRETE)!, toolsRoom);
      this.tileRectangle(subway, Models.tiles.get(TileID.WALL_BRICK)!, toolsRoom);
      this.placeDoor(
        subway,
        toolsRoom.left + Math.floor(toolsRoomWidth / 2),
        toolsRoomDir === Direction.N ? toolsRoom.bottom - 1 : toolsRoom.top,
        Models.tiles.get(TileID.FLOOR_CONCRETE)!,
        this.makeObjIronDoor()
      );
      subway.addZone(this.makeUniqueZone('tools room', toolsRoom));

      // shelves on walls with construction items.
      this.doForEachTile(subway, toolsRoom, (pt) => {
        if (!subway.isWalkable(pt.x, pt.y)) return;
        if (this.countAdjWalls(subway, pt.x, pt.y) === 0 || this.countAdjDoors(subway, pt.x, pt.y) > 0) return;

        this.mapObjectPlace(subway, pt.x, pt.y, this.makeObjShelf(GameImages.OBJ_SHOP_SHELF));
        subway.dropItemAt(this.makeShopConstructionItem(), pt);
      });
    }

    // 4. Tags & Posters almost everywhere.
    for (let x = 0; x < subway.width; x++)
      for (let y = 0; y < subway.height; y++) {
        if (this.m_DiceRoller.rollChance(SUBWAY_TAGS_POSTERS_CHANCE)) {
          // must be a wall with walkables around.
          const t = subway.getTileAt(x, y)!;
          if (t.model.isWalkable) continue;
          if (this.countAdjWalkables(subway, x, y) < 2) continue;

          // poster?
          if (this.m_DiceRoller.rollChance(50)) t.addDecoration(BaseTownGenerator.POSTERS[this.m_DiceRoller.roll(0, BaseTownGenerator.POSTERS.length)]);

          // tag?
          if (this.m_DiceRoller.rollChance(50)) t.addDecoration(BaseTownGenerator.TAGS[this.m_DiceRoller.roll(0, BaseTownGenerator.TAGS.length)]);
        }
      }

    // 5. Additional jobs.
    // Mark all the map as inside.
    for (let x = 0; x < subway.width; x++)
      for (let y = 0; y < subway.height; y++) subway.getTileAt(x, y)!.isInside = true;

    // alpha10
    // 6. Music.
    subway.bgMusic = GameMusics.SUBWAY;

    // Done.
    return subway;
  }

  // ── Blocks generation ────────────────────────────────────────────────────

  quadSplit(
    rect: Rect,
    minWidth: number,
    minHeight: number
  ): { splitX: number; splitY: number; topLeft: Rect; topRight: Rect; bottomLeft: Rect; bottomRight: Rect } {
    // Choose a random split point.
    let leftWidthSplit = this.m_DiceRoller.roll(Math.floor(rect.width / 3), Math.floor((2 * rect.width) / 3));
    let topHeightSplit = this.m_DiceRoller.roll(Math.floor(rect.height / 3), Math.floor((2 * rect.height) / 3));

    // Ensure splitting does not produce rects below minima.
    if (leftWidthSplit < minWidth) leftWidthSplit = minWidth;
    if (topHeightSplit < minHeight) topHeightSplit = minHeight;

    let rightWidthSplit = rect.width - leftWidthSplit;
    let bottomHeightSplit = rect.height - topHeightSplit;

    let doSplitX = true;
    let doSplitY = true;

    if (rightWidthSplit < minWidth) {
      leftWidthSplit = rect.width;
      rightWidthSplit = 0;
      doSplitX = false;
    }
    if (bottomHeightSplit < minHeight) {
      topHeightSplit = rect.height;
      bottomHeightSplit = 0;
      doSplitY = false;
    }

    // Split point.
    const splitX = rect.left + leftWidthSplit;
    const splitY = rect.top + topHeightSplit;

    // Make the quads.
    const topLeft = new Rect(rect.left, rect.top, leftWidthSplit, topHeightSplit);

    const topRight = doSplitX ? new Rect(splitX, rect.top, rightWidthSplit, topHeightSplit) : Rect.Empty;

    const bottomLeft = doSplitY ? new Rect(rect.left, splitY, leftWidthSplit, bottomHeightSplit) : Rect.Empty;

    const bottomRight = doSplitX && doSplitY ? new Rect(splitX, splitY, rightWidthSplit, bottomHeightSplit) : Rect.Empty;

    return { splitX, splitY, topLeft, topRight, bottomLeft, bottomRight };
  }

  makeBlocks(map: GameMap, makeRoads: boolean, list: Block[], rect: Rect): void {
    const ring = 1; // dont change, keep to 1 (0=no roads, >1 = out of map)

    ////////////
    // 1. Split
    ////////////
    // +N to account for the road ring.
    let { topLeft, topRight, bottomLeft, bottomRight } = this.quadSplit(
      rect,
      this.m_Params.minBlockSize + ring,
      this.m_Params.minBlockSize + ring
    );

    ///////////////////
    // 2. Termination?
    ///////////////////
    if (topRight.equals(Rect.Empty) && bottomLeft.equals(Rect.Empty) && bottomRight.equals(Rect.Empty)) {
      // Make road ring?
      if (makeRoads) {
        this.makeRoad(map, Models.tiles.get(TileID.ROAD_ASPHALT_EW)!, new Rect(rect.left, rect.top, rect.width, ring)); // north side
        this.makeRoad(map, Models.tiles.get(TileID.ROAD_ASPHALT_EW)!, new Rect(rect.left, rect.bottom - 1, rect.width, ring)); // south side
        this.makeRoad(map, Models.tiles.get(TileID.ROAD_ASPHALT_NS)!, new Rect(rect.left, rect.top, ring, rect.height)); // west side
        this.makeRoad(map, Models.tiles.get(TileID.ROAD_ASPHALT_NS)!, new Rect(rect.right - 1, rect.top, ring, rect.height)); // east side

        // Adjust rect. (Rect is immutable in the web port.)
        topLeft = new Rect(topLeft.x + ring, topLeft.y + ring, topLeft.width - 2 * ring, topLeft.height - 2 * ring);
      }

      // Add block.
      list.push(new Block(topLeft));
      return;
    }

    //////////////
    // 3. Recurse
    //////////////
    // always top left.
    this.makeBlocks(map, makeRoads, list, topLeft);
    // then recurse in non empty quads.
    if (!topRight.equals(Rect.Empty)) {
      this.makeBlocks(map, makeRoads, list, topRight);
    }
    if (!bottomLeft.equals(Rect.Empty)) {
      this.makeBlocks(map, makeRoads, list, bottomLeft);
    }
    if (!bottomRight.equals(Rect.Empty)) {
      this.makeBlocks(map, makeRoads, list, bottomRight);
    }
  }

  protected makeRoad(map: GameMap, roadModel: TileModel, rect: Rect): void {
    const tiles = Models.tiles as GameTiles;
    this.tileFill(
      map,
      roadModel,
      rect,
      (_tile, prevModel, x, y) => {
        // don't overwrite roads!
        if (tiles.isRoadModel(prevModel)) map.setTileModelAt(x, y, prevModel);
      }
    );
    map.addZone(this.makeUniqueZone('road', rect));
  }

  // ── Door/Window placement ────────────────────────────────────────────────

  protected placeDoor(map: GameMap, x: number, y: number, floor: TileModel, door: DoorWindow): void {
    placeDoorOn(this.placement(), map, x, y, floor, door);
  }

  protected placeDoorIfNoObject(map: GameMap, x: number, y: number, floor: TileModel, door: DoorWindow): void {
    if (map.getMapObjectAt(x, y) !== null) return;
    this.placeDoor(map, x, y, floor, door);
  }

  protected placeDoorIfAccessible(map: GameMap, x: number, y: number, floor: TileModel, minAccessibility: number, door: DoorWindow): boolean {
    let countWalkable = 0;

    const p = new Point(x, y);
    for (const d of Direction.COMPASS) {
      const next = new Point(p.x + d.dx, p.y + d.dy);
      if (map.isWalkable(next.x, next.y)) ++countWalkable;
    }

    if (countWalkable >= minAccessibility) {
      this.placeDoorIfNoObject(map, x, y, floor, door);
      return true;
    } else return false;
  }

  protected placeDoorIfAccessibleAndNotAdjacent(
    map: GameMap,
    x: number,
    y: number,
    floor: TileModel,
    minAccessibility: number,
    door: DoorWindow
  ): boolean {
    let countWalkable = 0;

    const p = new Point(x, y);
    for (const d of Direction.COMPASS) {
      const next = new Point(p.x + d.dx, p.y + d.dy);
      if (map.isWalkable(next.x, next.y)) ++countWalkable;
      if (map.getMapObjectAt(next.x, next.y) instanceof DoorWindow) return false;
    }

    if (countWalkable >= minAccessibility) {
      this.placeDoorIfNoObject(map, x, y, floor, door);
      return true;
    } else return false;
  }

  // ── Cars ─────────────────────────────────────────────────────────────────

  protected addWreckedCarsOutside(map: GameMap, rect: Rect): void {
    //////////////////////////////////////
    // Add random cars (+ on fire effect)
    //////////////////////////////////////
    this.mapObjectFill(map, rect, (pt) => {
      if (this.m_DiceRoller.rollChance(this.m_Params.wreckedCarChance)) {
        const tile = map.getTileAt(pt.x, pt.y)!;
        if (!tile.isInside && tile.model.isWalkable && tile.model !== Models.tiles.get(TileID.FLOOR_GRASS)) {
          const car: MapObject = this.makeObjWreckedCar(this.m_DiceRoller);
          if (this.m_DiceRoller.rollChance(50)) {
            this.m_Game.ApplyOnFire(car);
          }
          return car;
        }
      }
      return null;
    });
  }

  isThereASpecialBuilding(map: GameMap, rect: Rect): boolean {
    // must not be a special building.
    const zonesUpThere = map.getZonesAt(rect.left, rect.top);
    if (zonesUpThere) {
      let special = false;
      for (const z of zonesUpThere)
        if (
          z.name.includes('Sewers Maintenance') || // RogueGame.NAME_SEWERS_MAINTENANCE
          z.name.includes('Subway Station') || // RogueGame.NAME_SUBWAY_STATION
          z.name.includes('office') ||
          z.name.includes('shop')
        ) {
          special = true;
          break;
        }
      if (special) return true;
    }

    // must not have an exit.
    if (this.hasAnExitIn(map, rect)) return true;

    // all clear.
    return false;
  }

  /**
   * `desiredShopType` is C# `:1436`'s nullable third parameter, and it exists for
   * one caller: `BaseTownGenerator.cs:521`, the business cascade's general-store arm,
   * which wants a shop it knows the type of. `null` spends the `roll` at `:1456`;
   * a value spends nothing, which is why the arm costs a block no die.
   */
  makeShopBuilding(map: GameMap, b: Block, desiredShopType: ShopType | null = null): boolean {
    ////////////////////////
    // 0. Check suitability
    ////////////////////////
    if (b.insideRect.width < 5 || b.insideRect.height < 5) return false;

    /////////////////////////////
    // 1. Walkway, floor & walls
    /////////////////////////////
    this.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, b.rectangle);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_STONE)!, b.buildingRect);
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_TILES)!, b.insideRect, (tile) => {
      tile.isInside = true;
    });

    ///////////////////////
    // 2. Decide shop type
    ///////////////////////
    // C#: `if (desiredShopType == null) Roll(_FIRST, _COUNT); else shopType = (ShopType)desiredShopType;`
    //     (`:1453-1459`, the parameter added in Release 7-3). A forced type spends
    //     no die, so the general-store arm below costs its block nothing to ask.
    const shopType =
      desiredShopType ?? (this.m_DiceRoller.roll(ShopType.GENERAL_STORE, ShopType.HUNTING + 1) as ShopType);

    //////////////////////////////////////////
    // 3. Make sections alleys with displays.
    //////////////////////////////////////////
    let alleysStartX = b.insideRect.left;
    let alleysStartY = b.insideRect.top;
    let alleysEndX = b.insideRect.right;
    let alleysEndY = b.insideRect.bottom;
    const horizontalAlleys = b.rectangle.width >= b.rectangle.height;
    let centralAlley: number;

    if (horizontalAlleys) {
      ++alleysStartX;
      --alleysEndX;
      centralAlley = b.insideRect.left + Math.floor(b.insideRect.width / 2);
    } else {
      ++alleysStartY;
      --alleysEndY;
      centralAlley = b.insideRect.top + Math.floor(b.insideRect.height / 2);
    }
    const alleysRect = new Rect(alleysStartX, alleysStartY, alleysEndX - alleysStartX, alleysEndY - alleysStartY);

    this.mapObjectFill(map, alleysRect, (pt) => {
      let addShelf: boolean;

      if (horizontalAlleys) addShelf = (pt.y - alleysRect.top) % 2 === 1 && pt.x !== centralAlley;
      else addShelf = (pt.x - alleysRect.left) % 2 === 1 && pt.y !== centralAlley;

      if (addShelf) return this.makeObjShelf(GameImages.OBJ_SHOP_SHELF);
      else return null;
    });

    ///////////////////////////////
    // 4. Entry door with shop ids
    //    Might add window(s).
    ///////////////////////////////
    const midX = b.rectangle.left + Math.floor(b.rectangle.width / 2);
    const midY = b.rectangle.top + Math.floor(b.rectangle.height / 2);

    // make doors on one side.
    if (horizontalAlleys) {
      const west = this.m_DiceRoller.rollChance(50);

      if (west) {
        // west
        this.placeDoor(map, b.buildingRect.left, midY, Models.tiles.get(TileID.FLOOR_WALKWAY)!, this.makeObjGlassDoor());
        if (b.insideRect.height >= 8) {
          this.placeDoor(
            map,
            b.buildingRect.left,
            midY - 1,
            Models.tiles.get(TileID.FLOOR_WALKWAY)!,
            this.makeObjGlassDoor()
          );
          if (b.insideRect.height >= 12)
            this.placeDoor(
              map,
              b.buildingRect.left,
              midY + 1,
              Models.tiles.get(TileID.FLOOR_WALKWAY)!,
              this.makeObjGlassDoor()
            );
        }
      } else {
        // east
        this.placeDoor(
          map,
          b.buildingRect.right - 1,
          midY,
          Models.tiles.get(TileID.FLOOR_WALKWAY)!,
          this.makeObjGlassDoor()
        );
        if (b.insideRect.height >= 8) {
          this.placeDoor(
            map,
            b.buildingRect.right - 1,
            midY - 1,
            Models.tiles.get(TileID.FLOOR_WALKWAY)!,
            this.makeObjGlassDoor()
          );
          if (b.insideRect.height >= 12)
            this.placeDoor(
              map,
              b.buildingRect.right - 1,
              midY + 1,
              Models.tiles.get(TileID.FLOOR_WALKWAY)!,
              this.makeObjGlassDoor()
            );
        }
      }
    } else {
      const north = this.m_DiceRoller.rollChance(50);

      if (north) {
        // north
        this.placeDoor(map, midX, b.buildingRect.top, Models.tiles.get(TileID.FLOOR_WALKWAY)!, this.makeObjGlassDoor());
        if (b.insideRect.width >= 8) {
          this.placeDoor(
            map,
            midX - 1,
            b.buildingRect.top,
            Models.tiles.get(TileID.FLOOR_WALKWAY)!,
            this.makeObjGlassDoor()
          );
          if (b.insideRect.width >= 12)
            this.placeDoor(
              map,
              midX + 1,
              b.buildingRect.top,
              Models.tiles.get(TileID.FLOOR_WALKWAY)!,
              this.makeObjGlassDoor()
            );
        }
      } else {
        // south
        this.placeDoor(
          map,
          midX,
          b.buildingRect.bottom - 1,
          Models.tiles.get(TileID.FLOOR_WALKWAY)!,
          this.makeObjGlassDoor()
        );
        if (b.insideRect.width >= 8) {
          this.placeDoor(
            map,
            midX - 1,
            b.buildingRect.bottom - 1,
            Models.tiles.get(TileID.FLOOR_WALKWAY)!,
            this.makeObjGlassDoor()
          );
          if (b.insideRect.width >= 12)
            this.placeDoor(
              map,
              midX + 1,
              b.buildingRect.bottom - 1,
              Models.tiles.get(TileID.FLOOR_WALKWAY)!,
              this.makeObjGlassDoor()
            );
        }
      }
    }

    // add shop image next to doors.
    let shopImage: string;
    let shopName: string;
    switch (shopType) {
      case ShopType.CONSTRUCTION:
        shopImage = GameImages.DECO_SHOP_CONSTRUCTION;
        shopName = 'Construction';
        break;
      case ShopType.GENERAL_STORE:
        shopImage = GameImages.DECO_SHOP_GENERAL_STORE;
        shopName = 'GeneralStore';
        break;
      case ShopType.GROCERY:
        shopImage = GameImages.DECO_SHOP_GROCERY;
        shopName = 'Grocery';
        break;
      case ShopType.GUNSHOP:
        shopImage = GameImages.DECO_SHOP_GUNSHOP;
        shopName = 'Gunshop';
        break;
      case ShopType.PHARMACY:
        shopImage = GameImages.DECO_SHOP_PHARMACY;
        shopName = 'Pharmacy';
        break;
      case ShopType.SPORTSWEAR:
        shopImage = GameImages.DECO_SHOP_SPORTSWEAR;
        shopName = 'Sportswear';
        break;
      case ShopType.HUNTING:
        shopImage = GameImages.DECO_SHOP_HUNTING;
        shopName = 'Hunting Shop';
        break;
      default:
        throw new RangeError('unhandled shoptype');
    }
    this.decorateOutsideWalls(map, b.buildingRect, (x, y) =>
      map.getMapObjectAt(x, y) === null && this.countAdjDoors(map, x, y) >= 1 ? shopImage : null
    );

    // window?
    if (this.m_DiceRoller.rollChance(SHOP_WINDOW_CHANCE)) {
      // pick a random side.
      const side = this.m_DiceRoller.roll(0, 4);
      let wx: number, wy: number;
      switch (side) {
        case 0:
          wx = b.buildingRect.left + Math.floor(b.buildingRect.width / 2);
          wy = b.buildingRect.top;
          break;
        case 1:
          wx = b.buildingRect.left + Math.floor(b.buildingRect.width / 2);
          wy = b.buildingRect.bottom - 1;
          break;
        case 2:
          wx = b.buildingRect.left;
          wy = b.buildingRect.top + Math.floor(b.buildingRect.height / 2);
          break;
        case 3:
          wx = b.buildingRect.right - 1;
          wy = b.buildingRect.top + Math.floor(b.buildingRect.height / 2);
          break;
        default:
          throw new RangeError('unhandled side');
      }
      // check it is ok to make a window there.
      let isGoodWindowPos = true;
      if (map.getTileAt(wx, wy)!.model.isWalkable) isGoodWindowPos = false;
      // do it?
      if (isGoodWindowPos) {
        this.placeDoor(map, wx, wy, Models.tiles.get(TileID.FLOOR_TILES)!, this.makeObjWindow());
      }
    }

    // barricade certain shops types.
    if (shopType === ShopType.GUNSHOP) {
      this.barricadeDoors(map, b.buildingRect, Rules.BARRICADING_MAX);
    }

    ///////////////////////////
    // 5. Add items to shelves.
    ///////////////////////////
    this.itemsDrop(
      map,
      b.insideRect,
      (pt) => {
        const mapObj = map.getMapObjectAtPoint(pt);
        if (!mapObj) return false;
        return mapObj.imageId === GameImages.OBJ_SHOP_SHELF && this.m_DiceRoller.rollChance(this.params.itemInShopShelfChance);
      },
      () => this.makeRandomShopItem(shopType)
    );

    ///////////
    // 6. Zone
    ///////////
    // shop building.
    map.addZone(this.makeUniqueZone(shopName, b.buildingRect));
    // walkway zones.
    this.makeWalkwayZones(map, b);

    ////////////////
    // 7. Basement?
    ////////////////
    if (this.m_DiceRoller.rollChance(SHOP_BASEMENT_CHANCE)) {
      // shop basement map:
      // - a single dark room.
      // - some shop items.

      // - a single dark room.
      const shopBasement = new GameMap(
        (map.seed << 1) ^ this.stringHashCode(shopName),
        'basement-' + shopName,
        b.buildingRect.width,
        b.buildingRect.height
      );
      shopBasement.lighting = Lighting.DARKNESS;
      this.doForEachTile(shopBasement, shopBasement.rect, (pt) => {
        shopBasement.getTileAt(pt.x, pt.y)!.isInside = true;
      });
      this.tileFill(shopBasement, Models.tiles.get(TileID.FLOOR_CONCRETE)!);
      this.tileRectangle(shopBasement, Models.tiles.get(TileID.WALL_BRICK)!, shopBasement.rect);
      shopBasement.addZone(this.makeUniqueZone('basement', shopBasement.rect));

      // - some shelves with shop items.
      // - some rats.
      this.doForEachTile(shopBasement, shopBasement.rect, (pt) => {
        if (!shopBasement.isWalkable(pt.x, pt.y)) return;
        if (shopBasement.getExitAt(pt)) return;

        if (this.m_DiceRoller.rollChance(SHOP_BASEMENT_SHELF_CHANCE_PER_TILE)) {
          this.mapObjectPlace(shopBasement, pt.x, pt.y, this.makeObjShelf(GameImages.OBJ_SHOP_SHELF));
          if (this.m_DiceRoller.rollChance(SHOP_BASEMENT_ITEM_CHANCE_PER_SHELF)) {
            const it = this.makeRandomShopItem(shopType);
            if (it) shopBasement.dropItemAt(it, pt);
          }
        }

        if (Rules.hasZombiesInBasements(Session.get().gameMode)) {
          if (this.m_DiceRoller.rollChance(SHOP_BASEMENT_ZOMBIE_RAT_CHANCE))
            shopBasement.placeActor(this.createNewBasementRatZombie(0), pt);
        }
      });

      // alpha10 music
      shopBasement.bgMusic = GameMusics.SEWERS;

      // link maps, stairs in one corner.
      const basementCorner = new Point(
        this.m_DiceRoller.rollChance(50) ? 1 : shopBasement.width - 2,
        this.m_DiceRoller.rollChance(50) ? 1 : shopBasement.height - 2
      );
      const shopCorner = new Point(basementCorner.x - 1 + b.insideRect.left, basementCorner.y - 1 + b.insideRect.top);
      this.addExit(shopBasement, basementCorner, map, shopCorner, GameImages.DECO_STAIRS_UP, true);
      this.addExit(map, shopCorner, shopBasement, basementCorner, GameImages.DECO_STAIRS_DOWN, true);

      // remove any blocking object in the shop.
      const blocker = map.getMapObjectAtPoint(shopCorner);
      if (blocker) map.removeMapObject(blocker);

      // add map.
      this.params.district!.addUniqueMap(shopBasement);
    }

    // Done
    return true;
  }

  /**
   * Either an Office (for large enough buildings) or an Agency (for small buildings).
   */
  makeCHARBuilding(map: GameMap, b: Block): CHARBuildingType {
    ///////////////////////////////
    // Offices are large buildings.
    // Agency are small ones.
    ///////////////////////////////
    if (b.insideRect.width < 8 || b.insideRect.height < 8) {
      // small, make it an Agency.
      if (this.makeCHARAgency(map, b)) return CHARBuildingType.AGENCY;
      else return CHARBuildingType.NONE;
    } else {
      if (this.makeCHAROffice(map, b)) return CHARBuildingType.OFFICE;
      else return CHARBuildingType.NONE;
    }
  }

  private static readonly CHAR_POSTERS = [
    GameImages.DECO_CHAR_POSTER1,
    GameImages.DECO_CHAR_POSTER2,
    GameImages.DECO_CHAR_POSTER3,
  ];

  makeCHARAgency(map: GameMap, b: Block): boolean {
    /////////////////////////////
    // 1. Walkway, floor & walls
    /////////////////////////////
    this.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, b.rectangle);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_CHAR_OFFICE)!, b.buildingRect);
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_OFFICE)!, b.insideRect, (tile) => {
      tile.isInside = true;
      tile.addDecoration(GameImages.DECO_CHAR_FLOOR_LOGO);
    });

    //////////////////////////
    // 2. Decide orientation.
    //////////////////////////
    const horizontalCorridor = b.insideRect.width >= b.insideRect.height;

    /////////////////
    // 3. Entry door
    /////////////////
    const midX = b.rectangle.left + Math.floor(b.rectangle.width / 2);
    const midY = b.rectangle.top + Math.floor(b.rectangle.height / 2);

    // make doors on one side.
    if (horizontalCorridor) {
      const west = this.m_DiceRoller.rollChance(50);

      if (west) {
        // west
        this.placeDoor(map, b.buildingRect.left, midY, Models.tiles.get(TileID.FLOOR_WALKWAY)!, this.makeObjGlassDoor());
        if (b.insideRect.height >= 8) {
          this.placeDoor(
            map,
            b.buildingRect.left,
            midY - 1,
            Models.tiles.get(TileID.FLOOR_WALKWAY)!,
            this.makeObjGlassDoor()
          );
          if (b.insideRect.height >= 12)
            this.placeDoor(
              map,
              b.buildingRect.left,
              midY + 1,
              Models.tiles.get(TileID.FLOOR_WALKWAY)!,
              this.makeObjGlassDoor()
            );
        }
      } else {
        // east
        this.placeDoor(
          map,
          b.buildingRect.right - 1,
          midY,
          Models.tiles.get(TileID.FLOOR_WALKWAY)!,
          this.makeObjGlassDoor()
        );
        if (b.insideRect.height >= 8) {
          this.placeDoor(
            map,
            b.buildingRect.right - 1,
            midY - 1,
            Models.tiles.get(TileID.FLOOR_WALKWAY)!,
            this.makeObjGlassDoor()
          );
          if (b.insideRect.height >= 12)
            this.placeDoor(
              map,
              b.buildingRect.right - 1,
              midY + 1,
              Models.tiles.get(TileID.FLOOR_WALKWAY)!,
              this.makeObjGlassDoor()
            );
        }
      }
    } else {
      const north = this.m_DiceRoller.rollChance(50);

      if (north) {
        // north
        this.placeDoor(map, midX, b.buildingRect.top, Models.tiles.get(TileID.FLOOR_WALKWAY)!, this.makeObjGlassDoor());
        if (b.insideRect.width >= 8) {
          this.placeDoor(
            map,
            midX - 1,
            b.buildingRect.top,
            Models.tiles.get(TileID.FLOOR_WALKWAY)!,
            this.makeObjGlassDoor()
          );
          if (b.insideRect.width >= 12)
            this.placeDoor(
              map,
              midX + 1,
              b.buildingRect.top,
              Models.tiles.get(TileID.FLOOR_WALKWAY)!,
              this.makeObjGlassDoor()
            );
        }
      } else {
        // south
        this.placeDoor(
          map,
          midX,
          b.buildingRect.bottom - 1,
          Models.tiles.get(TileID.FLOOR_WALKWAY)!,
          this.makeObjGlassDoor()
        );
        if (b.insideRect.width >= 8) {
          this.placeDoor(
            map,
            midX - 1,
            b.buildingRect.bottom - 1,
            Models.tiles.get(TileID.FLOOR_WALKWAY)!,
            this.makeObjGlassDoor()
          );
          if (b.insideRect.width >= 12)
            this.placeDoor(
              map,
              midX + 1,
              b.buildingRect.bottom - 1,
              Models.tiles.get(TileID.FLOOR_WALKWAY)!,
              this.makeObjGlassDoor()
            );
        }
      }
    }

    // add office image next to doors.
    const officeImage = GameImages.DECO_CHAR_OFFICE;
    this.decorateOutsideWalls(map, b.buildingRect, (x, y) =>
      map.getMapObjectAt(x, y) === null && this.countAdjDoors(map, x, y) >= 1 ? officeImage : null
    );

    ////////////////
    // 4. Furniture
    ////////////////
    // chairs on the sides.
    // alpha10.1 chance to add book/magazines
    this.mapObjectFill(map, b.insideRect, (pt) => {
      if (this.countAdjWalls(map, pt.x, pt.y) < 3) return null;

      // alpha10.1 book/magazines on chair?
      if (this.m_DiceRoller.rollChance(25))
        map.dropItemAt(this.m_DiceRoller.rollChance(20) ? this.makeItemBook() : this.makeItemMagazines(), pt);

      return this.makeObjChair(GameImages.OBJ_CHAR_CHAIR);
    });
    // walls/pilars in the middle.
    this.tileFill(
      map,
      Models.tiles.get(TileID.WALL_CHAR_OFFICE)!,
      new Rect(
        b.insideRect.left + Math.floor(b.insideRect.width / 2) - 1,
        b.insideRect.top + Math.floor(b.insideRect.height / 2) - 1,
        3,
        2
      ),
      (tile) => {
        tile.addDecoration(BaseTownGenerator.CHAR_POSTERS[this.m_DiceRoller.roll(0, BaseTownGenerator.CHAR_POSTERS.length)]);
      }
    );

    //////////////
    // 5. Posters
    //////////////
    // outside.
    this.decorateOutsideWalls(map, b.buildingRect, (x, y) => {
      if (this.countAdjDoors(map, x, y) > 0) return null;
      else {
        if (this.m_DiceRoller.rollChance(25))
          return BaseTownGenerator.CHAR_POSTERS[this.m_DiceRoller.roll(0, BaseTownGenerator.CHAR_POSTERS.length)];
        else return null;
      }
    });

    ////////////
    // 6. Zones.
    ////////////
    map.addZone(this.makeUniqueZone('CHAR Agency', b.buildingRect));
    this.makeWalkwayZones(map, b);

    // Done
    return true;
  }

  /**
   * C# `MakeOrdinaryOffice` — `BaseTownGenerator.cs:4964` (Release 7-3).
   *
   * **The port had no generic office at all.** `BaseTownGenerator.cs:531` has
   * `if (!placed) MakeOrdinaryOffice(map, b)` as the last arm of the business
   * cascade, so a block that failed the bar/bank/clinic roll became a plain office.
   * This port left the block unplaced, and the unplaced ones fell through to
   * `makeHousingBuilding` — so every business block the cascade missed became a
   * *house*. That is a fidelity bug rather than a missing feature: the C# says what
   * should be there, and this makes it there.
   *
   * Derived from `makeCHAROffice` rather than transliterated from the C#, because the
   * two C# methods differ in exactly fourteen places and one of the port's two is
   * already written and tested. The substitutions:
   *
   * | | CHAR office | ordinary office |
   * |---|---|---|
   * | outer wall | `WALL_CHAR_OFFICE` | `WALL_CONCRETE` |
   * | interior walls | `WALL_CHAR_OFFICE` | `WALL_LIGHT_BROWN` |
   * | doors | `MakeObjCharDoor` | `MakeObjGlassDoor` |
   * | entry doors | `BarricadeDoors(..., BARRICADING_MAX)` | none |
   * | table / chair | `OBJ_CHAR_TABLE` / `OBJ_CHAR_CHAIR` | `OBJ_TABLE` / `OBJ_CHAIR` |
   * | workstation | `OBJ_CHAR_DESKTOP` (not ported) | `OBJ_DESKTOP_COMPUTER` |
   * | foyer | reception desk + 6 couches | — |
   * | items | `MakeRandomCHAROfficeItem` | `MakeRandomOrdinaryOfficeItem` |
   * | zone | `"CHAR Office"` + `IS_CHAR_OFFICE` | `"Business"`, no attribute |
   *
   * `hallDepth` is renamed `foyerDepth` because the C# does, and the C# comment on
   * the zone is explicit that `"Business"` rather than `"office"` is deliberate — an
   * "Office" zone would clash with the CHAR buildings'.
   *
   * **Two gaps carried over from `makeCHAROffice`, not introduced here.** It omits
   * the C#'s "match each chair with a computer" pass (`@@MP`, Release 3), so the
   * workstation column above is aspirational, and it has no per-room couch. Both are
   * pre-existing omissions in the method this one is derived from; fixing them is one
   * job for both rather than two, and doing it here alone would have made the two
   * buildings diverge for a reason that has nothing to do with this port.
   */
  makeOrdinaryOffice(map: GameMap, b: Block): boolean {
    /////////////////////////////
    // 1. Walkway, floor & walls
    /////////////////////////////
    this.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, b.rectangle);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_CONCRETE)!, b.buildingRect);
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_OFFICE)!, b.insideRect, (tile) => {
      tile.isInside = true;
    });

    //////////////////////////
    // 2. Decide orientation.
    //////////////////////////
    const horizontalCorridor = b.insideRect.width >= b.insideRect.height;

    /////////////////
    // 3. Entry door
    /////////////////
    const midX = b.rectangle.left + Math.floor(b.rectangle.width / 2);
    const midY = b.rectangle.top + Math.floor(b.rectangle.height / 2);
    let doorSide: Direction;

    // make doors on one side.
    if (horizontalCorridor) {
      const west = this.m_DiceRoller.rollChance(50);

      if (west) {
        doorSide = Direction.W;
        // west
        this.placeDoor(map, b.buildingRect.left, midY, Models.tiles.get(TileID.FLOOR_WALKWAY)!, this.makeObjGlassDoor());
        if (b.insideRect.height >= 8) {
          this.placeDoor(
            map,
            b.buildingRect.left,
            midY - 1,
            Models.tiles.get(TileID.FLOOR_WALKWAY)!,
            this.makeObjGlassDoor()
          );
          if (b.insideRect.height >= 12)
            this.placeDoor(
              map,
              b.buildingRect.left,
              midY + 1,
              Models.tiles.get(TileID.FLOOR_WALKWAY)!,
              this.makeObjGlassDoor()
            );
        }
      } else {
        doorSide = Direction.E;
        // east
        this.placeDoor(
          map,
          b.buildingRect.right - 1,
          midY,
          Models.tiles.get(TileID.FLOOR_WALKWAY)!,
          this.makeObjGlassDoor()
        );
        if (b.insideRect.height >= 8) {
          this.placeDoor(
            map,
            b.buildingRect.right - 1,
            midY - 1,
            Models.tiles.get(TileID.FLOOR_WALKWAY)!,
            this.makeObjGlassDoor()
          );
          if (b.insideRect.height >= 12)
            this.placeDoor(
              map,
              b.buildingRect.right - 1,
              midY + 1,
              Models.tiles.get(TileID.FLOOR_WALKWAY)!,
              this.makeObjGlassDoor()
            );
        }
      }
    } else {
      const north = this.m_DiceRoller.rollChance(50);

      if (north) {
        doorSide = Direction.N;
        // north
        this.placeDoor(map, midX, b.buildingRect.top, Models.tiles.get(TileID.FLOOR_WALKWAY)!, this.makeObjGlassDoor());
        if (b.insideRect.width >= 8) {
          this.placeDoor(
            map,
            midX - 1,
            b.buildingRect.top,
            Models.tiles.get(TileID.FLOOR_WALKWAY)!,
            this.makeObjGlassDoor()
          );
          if (b.insideRect.width >= 12)
            this.placeDoor(
              map,
              midX + 1,
              b.buildingRect.top,
              Models.tiles.get(TileID.FLOOR_WALKWAY)!,
              this.makeObjGlassDoor()
            );
        }
      } else {
        doorSide = Direction.S;
        // south
        this.placeDoor(
          map,
          midX,
          b.buildingRect.bottom - 1,
          Models.tiles.get(TileID.FLOOR_WALKWAY)!,
          this.makeObjGlassDoor()
        );
        if (b.insideRect.width >= 8) {
          this.placeDoor(
            map,
            midX - 1,
            b.buildingRect.bottom - 1,
            Models.tiles.get(TileID.FLOOR_WALKWAY)!,
            this.makeObjGlassDoor()
          );
          if (b.insideRect.width >= 12)
            this.placeDoor(
              map,
              midX + 1,
              b.buildingRect.bottom - 1,
              Models.tiles.get(TileID.FLOOR_WALKWAY)!,
              this.makeObjGlassDoor()
            );
        }
      }
    }

    // add office image next to doors.
    const officeImage = GameImages.DECO_GENERIC_OFFICE;
    this.decorateOutsideWalls(map, b.buildingRect, (x, y) =>
      map.getMapObjectAt(x, y) === null && this.countAdjDoors(map, x, y) >= 1 ? officeImage : null
    );

    // barricade entry doors.

    ///////////////////////
    // 4. Make foyer.
    ///////////////////////
    const foyerDepth = 3;
    /**
     * The foyer, and only the foyer.
     *
     * `makeCHAROffice` draws the same wall line and never needs the rectangle, so this
     * is the one place the ordinary office computes something the CHAR office does
     * not: the six-couch pass below places into it.
     */
    let foyerRect: Rect;
    if (doorSide === Direction.N) {
      foyerRect = new Rect(b.insideRect.left + 1, b.insideRect.top + 1, b.insideRect.width - 2, foyerDepth);
      this.tileHLine(
        map,
        Models.tiles.get(TileID.WALL_LIGHT_BROWN)!,
        b.insideRect.left,
        b.insideRect.top + foyerDepth,
        b.insideRect.width
      );
    } else if (doorSide === Direction.S) {
      this.tileHLine(
        map,
        Models.tiles.get(TileID.WALL_LIGHT_BROWN)!,
        b.insideRect.left,
        b.insideRect.bottom - 1 - foyerDepth,
        b.insideRect.width
      );
      foyerRect = new Rect(b.insideRect.left + 1, b.insideRect.bottom - foyerDepth, b.insideRect.width - 2, foyerDepth);
    } else if (doorSide === Direction.E) {
      this.tileVLine(
        map,
        Models.tiles.get(TileID.WALL_LIGHT_BROWN)!,
        b.insideRect.right - 1 - foyerDepth,
        b.insideRect.top,
        b.insideRect.height
      );
      foyerRect = new Rect(b.insideRect.right - foyerDepth, b.insideRect.top + 1, foyerDepth, b.insideRect.height - 2);
    } else if (doorSide === Direction.W) {
      this.tileVLine(
        map,
        Models.tiles.get(TileID.WALL_LIGHT_BROWN)!,
        b.insideRect.left + foyerDepth,
        b.insideRect.top,
        b.insideRect.height
      );
      foyerRect = new Rect(b.insideRect.left + 1, b.insideRect.top + 1, foyerDepth, b.insideRect.height - 2);
    } else throw new Error('unhandled door side');

    /////////////////////////////////////
    // 5. Make central corridor & wings
    /////////////////////////////////////
    let corridorRect: Rect;
    let corridorDoor: Point, receptionPos: Point;
    if (doorSide === Direction.N) {
      corridorRect = new Rect(midX - 1, b.insideRect.top + foyerDepth, 3, b.buildingRect.height - 1 - foyerDepth);
      corridorDoor = new Point(corridorRect.left + 1, corridorRect.top);
      receptionPos = new Point(corridorRect.left, corridorRect.top - 1);
    } else if (doorSide === Direction.S) {
      corridorRect = new Rect(midX - 1, b.buildingRect.top, 3, b.buildingRect.height - 1 - foyerDepth);
      corridorDoor = new Point(corridorRect.left + 1, corridorRect.bottom - 1);
      receptionPos = new Point(corridorRect.left, corridorRect.bottom);
    } else if (doorSide === Direction.E) {
      corridorRect = new Rect(b.buildingRect.left, midY - 1, b.buildingRect.width - 1 - foyerDepth, 3);
      corridorDoor = new Point(corridorRect.right - 1, corridorRect.top + 1);
      receptionPos = new Point(corridorRect.right, corridorRect.top);
    } else if (doorSide === Direction.W) {
      corridorRect = new Rect(b.insideRect.left + foyerDepth, midY - 1, b.buildingRect.width - 1 - foyerDepth, 3);
      corridorDoor = new Point(corridorRect.left, corridorRect.top + 1);
      receptionPos = new Point(corridorRect.left - 1, corridorRect.top);
    } else throw new Error('unhandled door side');

    this.tileRectangle(map, Models.tiles.get(TileID.WALL_LIGHT_BROWN)!, corridorRect);
    this.placeDoor(map, corridorDoor.x, corridorDoor.y, Models.tiles.get(TileID.FLOOR_OFFICE)!, this.makeObjGlassDoor());

    /**
     * The foyer, which is the ordinary office's one piece of furniture the CHAR
     * office does not have. A reception desk beside the corridor door, then six
     * couches tried in turn — `mapObjectPlaceInGoodPosition` rejects a position that
     * fails the predicate and spends a roll, so a small foyer simply places fewer
     * and that is the intended behaviour rather than a shortfall.
     *
     * `OBJ_CLINIC_DESK` is shared with the shopping mall, exactly as the C# shares
     * it (`BaseTownGenerator.cs:5126`): one sprite, two names.
     */
    this.mapObjectPlace(map, receptionPos.x, receptionPos.y, this.makeObjReceptionDesk(GameImages.OBJ_CLINIC_DESK));
    const nbCouches = 6;
    for (let i = 0; i < nbCouches; i++) {
      this.mapObjectPlaceInGoodPosition(
        map,
        foyerRect,
        (pt) => !this.isADoorNSEW(map, pt.x, pt.y) && map.isWalkable(pt.x, pt.y) && this.countAdjWalls(map, pt) >= 3,
        this.m_DiceRoller,
        () => this.makeObjCouch(GameImages.OBJ_COUCH)
      );
    }

    /////////////////////////
    // 6. Make office rooms.
    /////////////////////////
    // make wings.
    let wingOne: Rect;
    let wingTwo: Rect;
    if (horizontalCorridor) {
      // top side.
      wingOne = new Rect(
        corridorRect.left,
        b.buildingRect.top,
        corridorRect.width,
        1 + corridorRect.top - b.buildingRect.top
      );
      // bottom side.
      wingTwo = new Rect(
        corridorRect.left,
        corridorRect.bottom - 1,
        corridorRect.width,
        1 + b.buildingRect.bottom - corridorRect.bottom
      );
    } else {
      // left side
      wingOne = new Rect(
        b.buildingRect.left,
        corridorRect.top,
        1 + corridorRect.left - b.buildingRect.left,
        corridorRect.height
      );
      // right side
      wingTwo = new Rect(
        corridorRect.right - 1,
        corridorRect.top,
        1 + b.buildingRect.right - corridorRect.right,
        corridorRect.height
      );
    }

    // make rooms in each wing with doors leaving toward corridor.
    const officeRoomsSize = 4;

    const officesOne: Rect[] = [];
    this.makeRoomsPlan(map, officesOne, wingOne, officeRoomsSize, officeRoomsSize);

    const officesTwo: Rect[] = [];
    this.makeRoomsPlan(map, officesTwo, wingTwo, officeRoomsSize, officeRoomsSize);

    const allOffices: Rect[] = [];
    allOffices.push(...officesOne);
    allOffices.push(...officesTwo);

    for (const roomRect of officesOne) {
      this.tileRectangle(map, Models.tiles.get(TileID.WALL_LIGHT_BROWN)!, roomRect);
      map.addZone(this.makeUniqueZone('Office room', roomRect));
    }
    for (const roomRect of officesTwo) {
      this.tileRectangle(map, Models.tiles.get(TileID.WALL_LIGHT_BROWN)!, roomRect);
      map.addZone(this.makeUniqueZone('Office room', roomRect));
    }

    for (const roomRect of officesOne) {
      if (horizontalCorridor) {
        this.placeDoor(
          map,
          roomRect.left + Math.floor(roomRect.width / 2),
          roomRect.bottom - 1,
          Models.tiles.get(TileID.FLOOR_OFFICE)!,
          this.makeObjGlassDoor()
        );
      } else {
        this.placeDoor(
          map,
          roomRect.right - 1,
          roomRect.top + Math.floor(roomRect.height / 2),
          Models.tiles.get(TileID.FLOOR_OFFICE)!,
          this.makeObjGlassDoor()
        );
      }
    }
    for (const roomRect of officesTwo) {
      if (horizontalCorridor) {
        this.placeDoor(
          map,
          roomRect.left + Math.floor(roomRect.width / 2),
          roomRect.top,
          Models.tiles.get(TileID.FLOOR_OFFICE)!,
          this.makeObjGlassDoor()
        );
      } else {
        this.placeDoor(
          map,
          roomRect.left,
          roomRect.top + Math.floor(roomRect.height / 2),
          Models.tiles.get(TileID.FLOOR_OFFICE)!,
          this.makeObjGlassDoor()
        );
      }
    }

    // tables with chairs.
    for (const roomRect of allOffices) {
      // table.
      const tablePos = new Point(
        roomRect.left + Math.floor(roomRect.width / 2),
        roomRect.top + Math.floor(roomRect.height / 2)
      );
      this.mapObjectPlace(map, tablePos.x, tablePos.y, this.makeObjTable(GameImages.OBJ_TABLE));

      // try to put chairs around.
      const nbChairs = 2;
      const insideRoom = new Rect(roomRect.left + 1, roomRect.top + 1, roomRect.width - 2, roomRect.height - 2);
      if (!this.isRectEmpty(insideRoom)) {
        for (let i = 0; i < nbChairs; i++) {
          const adjTableRect = this.intersectRect(new Rect(tablePos.x - 1, tablePos.y - 1, 3, 3), insideRoom);
          this.mapObjectPlaceInGoodPosition(map, adjTableRect, (pt) => !pt.equals(tablePos), this.m_DiceRoller, () =>
            this.makeObjChair(GameImages.OBJ_CHAIR)
          );
        }
      }
    }

    ////////////////
    // 7. Add items.
    ////////////////
    // drop goodies in rooms.
    for (const roomRect of allOffices) {
      this.itemsDrop(
        map,
        roomRect,
        (pt) => {
          const tile = map.getTileAt(pt.x, pt.y)!;
          if (tile.model !== Models.tiles.get(TileID.FLOOR_OFFICE)!) return false;
          const mapObj = map.getMapObjectAtPoint(pt);
          if (mapObj) return false;
          return true;
        },
        () => this.makeRandomOrdinaryOfficeItem()
      );
    }

    ///////////
    // 8. Zone
    ///////////
    const zone = this.makeUniqueZone('Business', b.buildingRect);
    map.addZone(zone);
    this.makeWalkwayZones(map, b);

    // Done
    return true;
  }

  makeCHAROffice(map: GameMap, b: Block): boolean {
    /////////////////////////////
    // 1. Walkway, floor & walls
    /////////////////////////////
    this.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, b.rectangle);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_CHAR_OFFICE)!, b.buildingRect);
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_OFFICE)!, b.insideRect, (tile) => {
      tile.isInside = true;
    });

    //////////////////////////
    // 2. Decide orientation.
    //////////////////////////
    const horizontalCorridor = b.insideRect.width >= b.insideRect.height;

    /////////////////
    // 3. Entry door
    /////////////////
    const midX = b.rectangle.left + Math.floor(b.rectangle.width / 2);
    const midY = b.rectangle.top + Math.floor(b.rectangle.height / 2);
    let doorSide: Direction;

    // make doors on one side.
    if (horizontalCorridor) {
      const west = this.m_DiceRoller.rollChance(50);

      if (west) {
        doorSide = Direction.W;
        // west
        this.placeDoor(map, b.buildingRect.left, midY, Models.tiles.get(TileID.FLOOR_WALKWAY)!, this.makeObjGlassDoor());
        if (b.insideRect.height >= 8) {
          this.placeDoor(
            map,
            b.buildingRect.left,
            midY - 1,
            Models.tiles.get(TileID.FLOOR_WALKWAY)!,
            this.makeObjGlassDoor()
          );
          if (b.insideRect.height >= 12)
            this.placeDoor(
              map,
              b.buildingRect.left,
              midY + 1,
              Models.tiles.get(TileID.FLOOR_WALKWAY)!,
              this.makeObjGlassDoor()
            );
        }
      } else {
        doorSide = Direction.E;
        // east
        this.placeDoor(
          map,
          b.buildingRect.right - 1,
          midY,
          Models.tiles.get(TileID.FLOOR_WALKWAY)!,
          this.makeObjGlassDoor()
        );
        if (b.insideRect.height >= 8) {
          this.placeDoor(
            map,
            b.buildingRect.right - 1,
            midY - 1,
            Models.tiles.get(TileID.FLOOR_WALKWAY)!,
            this.makeObjGlassDoor()
          );
          if (b.insideRect.height >= 12)
            this.placeDoor(
              map,
              b.buildingRect.right - 1,
              midY + 1,
              Models.tiles.get(TileID.FLOOR_WALKWAY)!,
              this.makeObjGlassDoor()
            );
        }
      }
    } else {
      const north = this.m_DiceRoller.rollChance(50);

      if (north) {
        doorSide = Direction.N;
        // north
        this.placeDoor(map, midX, b.buildingRect.top, Models.tiles.get(TileID.FLOOR_WALKWAY)!, this.makeObjGlassDoor());
        if (b.insideRect.width >= 8) {
          this.placeDoor(
            map,
            midX - 1,
            b.buildingRect.top,
            Models.tiles.get(TileID.FLOOR_WALKWAY)!,
            this.makeObjGlassDoor()
          );
          if (b.insideRect.width >= 12)
            this.placeDoor(
              map,
              midX + 1,
              b.buildingRect.top,
              Models.tiles.get(TileID.FLOOR_WALKWAY)!,
              this.makeObjGlassDoor()
            );
        }
      } else {
        doorSide = Direction.S;
        // south
        this.placeDoor(
          map,
          midX,
          b.buildingRect.bottom - 1,
          Models.tiles.get(TileID.FLOOR_WALKWAY)!,
          this.makeObjGlassDoor()
        );
        if (b.insideRect.width >= 8) {
          this.placeDoor(
            map,
            midX - 1,
            b.buildingRect.bottom - 1,
            Models.tiles.get(TileID.FLOOR_WALKWAY)!,
            this.makeObjGlassDoor()
          );
          if (b.insideRect.width >= 12)
            this.placeDoor(
              map,
              midX + 1,
              b.buildingRect.bottom - 1,
              Models.tiles.get(TileID.FLOOR_WALKWAY)!,
              this.makeObjGlassDoor()
            );
        }
      }
    }

    // add office image next to doors.
    const officeImage = GameImages.DECO_CHAR_OFFICE;
    this.decorateOutsideWalls(map, b.buildingRect, (x, y) =>
      map.getMapObjectAt(x, y) === null && this.countAdjDoors(map, x, y) >= 1 ? officeImage : null
    );

    // barricade entry doors.
    this.barricadeDoors(map, b.buildingRect, Rules.BARRICADING_MAX);

    ///////////////////////
    // 4. Make entry hall.
    ///////////////////////
    const hallDepth = 3;
    if (doorSide === Direction.N) {
      this.tileHLine(
        map,
        Models.tiles.get(TileID.WALL_CHAR_OFFICE)!,
        b.insideRect.left,
        b.insideRect.top + hallDepth,
        b.insideRect.width
      );
    } else if (doorSide === Direction.S) {
      this.tileHLine(
        map,
        Models.tiles.get(TileID.WALL_CHAR_OFFICE)!,
        b.insideRect.left,
        b.insideRect.bottom - 1 - hallDepth,
        b.insideRect.width
      );
    } else if (doorSide === Direction.E) {
      this.tileVLine(
        map,
        Models.tiles.get(TileID.WALL_CHAR_OFFICE)!,
        b.insideRect.right - 1 - hallDepth,
        b.insideRect.top,
        b.insideRect.height
      );
    } else if (doorSide === Direction.W) {
      this.tileVLine(
        map,
        Models.tiles.get(TileID.WALL_CHAR_OFFICE)!,
        b.insideRect.left + hallDepth,
        b.insideRect.top,
        b.insideRect.height
      );
    } else throw new Error('unhandled door side');

    /////////////////////////////////////
    // 5. Make central corridor & wings
    /////////////////////////////////////
    let corridorRect: Rect;
    let corridorDoor: Point;
    if (doorSide === Direction.N) {
      corridorRect = new Rect(midX - 1, b.insideRect.top + hallDepth, 3, b.buildingRect.height - 1 - hallDepth);
      corridorDoor = new Point(corridorRect.left + 1, corridorRect.top);
    } else if (doorSide === Direction.S) {
      corridorRect = new Rect(midX - 1, b.buildingRect.top, 3, b.buildingRect.height - 1 - hallDepth);
      corridorDoor = new Point(corridorRect.left + 1, corridorRect.bottom - 1);
    } else if (doorSide === Direction.E) {
      corridorRect = new Rect(b.buildingRect.left, midY - 1, b.buildingRect.width - 1 - hallDepth, 3);
      corridorDoor = new Point(corridorRect.right - 1, corridorRect.top + 1);
    } else if (doorSide === Direction.W) {
      corridorRect = new Rect(b.insideRect.left + hallDepth, midY - 1, b.buildingRect.width - 1 - hallDepth, 3);
      corridorDoor = new Point(corridorRect.left, corridorRect.top + 1);
    } else throw new Error('unhandled door side');

    this.tileRectangle(map, Models.tiles.get(TileID.WALL_CHAR_OFFICE)!, corridorRect);
    this.placeDoor(map, corridorDoor.x, corridorDoor.y, Models.tiles.get(TileID.FLOOR_OFFICE)!, this.makeObjCharDoor());

    /////////////////////////
    // 6. Make office rooms.
    /////////////////////////
    // make wings.
    let wingOne: Rect;
    let wingTwo: Rect;
    if (horizontalCorridor) {
      // top side.
      wingOne = new Rect(
        corridorRect.left,
        b.buildingRect.top,
        corridorRect.width,
        1 + corridorRect.top - b.buildingRect.top
      );
      // bottom side.
      wingTwo = new Rect(
        corridorRect.left,
        corridorRect.bottom - 1,
        corridorRect.width,
        1 + b.buildingRect.bottom - corridorRect.bottom
      );
    } else {
      // left side
      wingOne = new Rect(
        b.buildingRect.left,
        corridorRect.top,
        1 + corridorRect.left - b.buildingRect.left,
        corridorRect.height
      );
      // right side
      wingTwo = new Rect(
        corridorRect.right - 1,
        corridorRect.top,
        1 + b.buildingRect.right - corridorRect.right,
        corridorRect.height
      );
    }

    // make rooms in each wing with doors leaving toward corridor.
    const officeRoomsSize = 4;

    const officesOne: Rect[] = [];
    this.makeRoomsPlan(map, officesOne, wingOne, officeRoomsSize, officeRoomsSize);

    const officesTwo: Rect[] = [];
    this.makeRoomsPlan(map, officesTwo, wingTwo, officeRoomsSize, officeRoomsSize);

    const allOffices: Rect[] = [];
    allOffices.push(...officesOne);
    allOffices.push(...officesTwo);

    for (const roomRect of officesOne) {
      this.tileRectangle(map, Models.tiles.get(TileID.WALL_CHAR_OFFICE)!, roomRect);
      map.addZone(this.makeUniqueZone('Office room', roomRect));
    }
    for (const roomRect of officesTwo) {
      this.tileRectangle(map, Models.tiles.get(TileID.WALL_CHAR_OFFICE)!, roomRect);
      map.addZone(this.makeUniqueZone('Office room', roomRect));
    }

    for (const roomRect of officesOne) {
      if (horizontalCorridor) {
        this.placeDoor(
          map,
          roomRect.left + Math.floor(roomRect.width / 2),
          roomRect.bottom - 1,
          Models.tiles.get(TileID.FLOOR_OFFICE)!,
          this.makeObjCharDoor()
        );
      } else {
        this.placeDoor(
          map,
          roomRect.right - 1,
          roomRect.top + Math.floor(roomRect.height / 2),
          Models.tiles.get(TileID.FLOOR_OFFICE)!,
          this.makeObjCharDoor()
        );
      }
    }
    for (const roomRect of officesTwo) {
      if (horizontalCorridor) {
        this.placeDoor(
          map,
          roomRect.left + Math.floor(roomRect.width / 2),
          roomRect.top,
          Models.tiles.get(TileID.FLOOR_OFFICE)!,
          this.makeObjCharDoor()
        );
      } else {
        this.placeDoor(
          map,
          roomRect.left,
          roomRect.top + Math.floor(roomRect.height / 2),
          Models.tiles.get(TileID.FLOOR_OFFICE)!,
          this.makeObjCharDoor()
        );
      }
    }

    // tables with chairs.
    for (const roomRect of allOffices) {
      // table.
      const tablePos = new Point(
        roomRect.left + Math.floor(roomRect.width / 2),
        roomRect.top + Math.floor(roomRect.height / 2)
      );
      this.mapObjectPlace(map, tablePos.x, tablePos.y, this.makeObjTable(GameImages.OBJ_CHAR_TABLE));

      // try to put chairs around.
      const nbChairs = 2;
      const insideRoom = new Rect(roomRect.left + 1, roomRect.top + 1, roomRect.width - 2, roomRect.height - 2);
      if (!this.isRectEmpty(insideRoom)) {
        for (let i = 0; i < nbChairs; i++) {
          const adjTableRect = this.intersectRect(new Rect(tablePos.x - 1, tablePos.y - 1, 3, 3), insideRoom);
          this.mapObjectPlaceInGoodPosition(map, adjTableRect, (pt) => !pt.equals(tablePos), this.m_DiceRoller, () =>
            this.makeObjChair(GameImages.OBJ_CHAR_CHAIR)
          );
        }
      }
    }

    ////////////////
    // 7. Add items.
    ////////////////
    // drop goodies in rooms.
    for (const roomRect of allOffices) {
      this.itemsDrop(
        map,
        roomRect,
        (pt) => {
          const tile = map.getTileAt(pt.x, pt.y)!;
          if (tile.model !== Models.tiles.get(TileID.FLOOR_OFFICE)!) return false;
          const mapObj = map.getMapObjectAtPoint(pt);
          if (mapObj) return false;
          return true;
        },
        () => this.makeRandomCHAROfficeItem()
      );
    }

    ///////////
    // 8. Zone
    ///////////
    const zone = this.makeUniqueZone('CHAR Office', b.buildingRect);
    zone.setGameAttribute<boolean>(ZoneAttributes.IS_CHAR_OFFICE, true);
    map.addZone(zone);
    this.makeWalkwayZones(map, b);

    // Done
    return true;
  }

  /**
   * C# `MakeArmyOffice(Map, Block)` -- `BaseTownGenerator.cs:5271`, Release 6-3.
   *
   * **A sibling of `makeCHAROffice`, not a new shape.** The two methods are the
   * same generator with different tiles: same walkway, same wall rect, same
   * `horizontalCorridor` test, the same `midX`/`midY` door ladder, the same
   * `hallDepth = 3` corridor, the same two wings, and the same `makeRoomsPlan`
   * subdivision into 4x4 rooms. Reading the two side by side is the fastest way to
   * see exactly what the army variant changes, and that is worth recording because
   * the alternative -- 281 lines of fresh code -- would hide the fact that this is
   * five differences and not a second design.
   *
   * The differences, all of them:
   *  1. **Locked iron doors** where the CHAR office has glass ones. The C#'s outer
   *     doors are `MakeObjIronDoor(STATE_LOCKED)`, so the building is shut until
   *     something opens it. There is no locked state in the port's `DoorWindow` --
   *     CLOSED/OPEN/BROKEN, and `setState` ignores an unknown value -- so the door
   *     is placed CLOSED. Recorded rather than guessed at.
   *  2. `WALL_ARMY_BASE` and `FLOOR_ARMY` in place of the CHAR office's.
   *  3. Army table and computer station instead of the CHAR desk and chair.
   *  4. A `"Army Office"` zone carrying `IS_ARMY_OFFICE`.
   *  5. `PopulateArmyOfficeBuilding`'s eight National Guard zombies, which the
   *     caller does -- see `makeArmyOffices`.
   *
   * Note the C# returns an `ArmyBuildingType` rather than a bool, because it once
   * had a second type. Only `OFFICE` and `NONE` exist (`:248-252`), so a boolean is
   * the whole of it and the port says so rather than carrying an enum with one
   * reachable value.
   */
  makeArmyOffice(map: GameMap, b: Block): boolean {
    // C# `:5274-5275`. 8x8 is the floor, unlike every other office's 5x5.
    if (b.insideRect.width < 8 || b.insideRect.height < 8) return false;

    /////////////////////////////
    // 1. Walkway, floor & walls
    /////////////////////////////
    this.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, b.rectangle);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_ARMY_BASE)!, b.buildingRect);
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_ARMY)!, b.insideRect, (tile) => {
      tile.isInside = true;
    });

    //////////////////////////
    // 2. Decide orientation.
    //////////////////////////
    const horizontalCorridor = b.insideRect.width >= b.insideRect.height;

    /////////////////
    // 3. Entry door
    /////////////////
    const midX = b.rectangle.left + Math.floor(b.rectangle.width / 2);
    const midY = b.rectangle.top + Math.floor(b.rectangle.height / 2);
    const inside = b.insideRect.height;

    // C# `:5301-5360`: one to three doors on a rolled side, each one row further
    // from the middle, each gated on the inside rect being deep enough. The side
    // ladder is the C#'s `case 3` is north and `default` is south, inherited from
    // `MakeParkBuilding` rather than tidied.
    const outerDoor = (): void => {
      const west = this.m_DiceRoller.rollChance(50);
      if (horizontalCorridor) {
        if (west) {
          this.placeDoor(map, b.buildingRect.left, midY, Models.tiles.get(TileID.FLOOR_WALKWAY)!, this.makeObjIronDoor());
          if (inside >= 8) {
            this.placeDoor(map, b.buildingRect.left, midY - 1, Models.tiles.get(TileID.FLOOR_WALKWAY)!, this.makeObjIronDoor());
            if (inside >= 12) {
              this.placeDoor(map, b.buildingRect.left, midY + 1, Models.tiles.get(TileID.FLOOR_WALKWAY)!, this.makeObjIronDoor());
            }
          }
        } else {
          this.placeDoor(map, b.buildingRect.right - 1, midY, Models.tiles.get(TileID.FLOOR_WALKWAY)!, this.makeObjIronDoor());
          if (inside >= 8) {
            this.placeDoor(map, b.buildingRect.right - 1, midY - 1, Models.tiles.get(TileID.FLOOR_WALKWAY)!, this.makeObjIronDoor());
            if (inside >= 12) {
              this.placeDoor(map, b.buildingRect.right - 1, midY + 1, Models.tiles.get(TileID.FLOOR_WALKWAY)!, this.makeObjIronDoor());
            }
          }
        }
      } else {
        const north = this.m_DiceRoller.rollChance(50);
        if (north) {
          this.placeDoor(map, midX, b.buildingRect.top, Models.tiles.get(TileID.FLOOR_WALKWAY)!, this.makeObjIronDoor());
          if (b.insideRect.width >= 8) {
            this.placeDoor(map, midX - 1, b.buildingRect.top, Models.tiles.get(TileID.FLOOR_WALKWAY)!, this.makeObjIronDoor());
            if (b.insideRect.width >= 12) {
              this.placeDoor(map, midX + 1, b.buildingRect.top, Models.tiles.get(TileID.FLOOR_WALKWAY)!, this.makeObjIronDoor());
            }
          }
        } else {
          this.placeDoor(map, midX, b.buildingRect.bottom - 1, Models.tiles.get(TileID.FLOOR_WALKWAY)!, this.makeObjIronDoor());
          if (b.insideRect.width >= 8) {
            this.placeDoor(map, midX - 1, b.buildingRect.bottom - 1, Models.tiles.get(TileID.FLOOR_WALKWAY)!, this.makeObjIronDoor());
            if (b.insideRect.width >= 12) {
              this.placeDoor(map, midX + 1, b.buildingRect.bottom - 1, Models.tiles.get(TileID.FLOOR_WALKWAY)!, this.makeObjIronDoor());
            }
          }
        }
      }
    };
    outerDoor();

    //////////////////////////////
    // 4. Corridor
    //////////////////////////////
    const hallDepth = 3;
    let corridorRect: Rect;
    let corridorDoor: Point;
    if (horizontalCorridor) {
      this.tileHLine(map, Models.tiles.get(TileID.WALL_ARMY_BASE)!, b.insideRect.left, b.insideRect.top + hallDepth, b.insideRect.width);
      this.tileVLine(map, Models.tiles.get(TileID.WALL_ARMY_BASE)!, b.insideRect.right - 1 - hallDepth, b.insideRect.top, b.insideRect.height);
      corridorRect = new Rect(midX - 1, b.insideRect.top + hallDepth, 3, b.buildingRect.height - 1 - hallDepth);
      corridorDoor = new Point(corridorRect.left, corridorRect.top + 1);
    } else {
      this.tileHLine(map, Models.tiles.get(TileID.WALL_ARMY_BASE)!, b.insideRect.left, b.buildingRect.bottom - 1 - hallDepth, b.insideRect.width);
      this.tileVLine(map, Models.tiles.get(TileID.WALL_ARMY_BASE)!, b.insideRect.left + hallDepth, b.insideRect.top, b.insideRect.height);
      corridorRect = new Rect(midX - 1, b.buildingRect.top, 3, b.buildingRect.height - 1 - hallDepth);
      corridorDoor = new Point(corridorRect.left, corridorRect.top + 1);
    }
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_ARMY_BASE)!, corridorRect);
    this.placeDoor(map, corridorDoor.x, corridorDoor.y, Models.tiles.get(TileID.FLOOR_ARMY)!, this.makeObjIronDoor());

    ///////////////////////
    // 5. Rooms in two wings
    ///////////////////////
    const wingOne = horizontalCorridor
      ? new Rect(corridorRect.left, b.buildingRect.top, corridorRect.width, 1 + corridorRect.top - b.buildingRect.top)
      : new Rect(b.buildingRect.left, corridorRect.top, 1 + corridorRect.left - b.buildingRect.left, corridorRect.height);
    const wingTwo = horizontalCorridor
      ? new Rect(corridorRect.left, corridorRect.bottom - 1, corridorRect.width, 1 + b.buildingRect.bottom - corridorRect.bottom)
      : new Rect(corridorRect.right - 1, corridorRect.top, 1 + b.buildingRect.right - corridorRect.right, corridorRect.height);

    const officeRoomsSize = 4;
    const officesOne: Rect[] = [];
    this.makeRoomsPlan(map, officesOne, wingOne, officeRoomsSize, officeRoomsSize);
    const officesTwo: Rect[] = [];
    this.makeRoomsPlan(map, officesTwo, wingTwo, officeRoomsSize, officeRoomsSize);
    const allOffices = [...officesOne, ...officesTwo];

    for (const roomRect of allOffices) {
      this.tileRectangle(map, Models.tiles.get(TileID.WALL_ARMY_BASE)!, roomRect);
      map.addZone(this.makeUniqueZone('Office room', roomRect));
    }

    // One door per room, on the corridor side. Same four arms as the CHAR office,
    // with `makeObjCharDoor` swapped for the army's iron one.
    for (const roomRect of officesOne) {
      if (horizontalCorridor) {
        this.placeDoor(map, roomRect.left + Math.floor(roomRect.width / 2), roomRect.bottom - 1, Models.tiles.get(TileID.FLOOR_ARMY)!, this.makeObjIronDoor());
      } else {
        this.placeDoor(map, roomRect.right - 1, roomRect.top + Math.floor(roomRect.height / 2), Models.tiles.get(TileID.FLOOR_ARMY)!, this.makeObjIronDoor());
      }
    }
    for (const roomRect of officesTwo) {
      if (horizontalCorridor) {
        this.placeDoor(map, roomRect.left + Math.floor(roomRect.width / 2), roomRect.top, Models.tiles.get(TileID.FLOOR_ARMY)!, this.makeObjIronDoor());
      } else {
        this.placeDoor(map, roomRect.left, roomRect.top + Math.floor(roomRect.height / 2), Models.tiles.get(TileID.FLOOR_ARMY)!, this.makeObjIronDoor());
      }
    }

    // Furniture: an army table, a chair, and — per the C# `:5514` — a computer
    // station matched to each chair. `nbChairs` is 1 here against the CHAR
    // office's 2.
    //
    // **The station was missing, and the comment above this block claimed it was
    // not** — it described "a computer station in the rooms that get one" and a
    // `nbTables` that decides which, and neither existed: the loop placed a table
    // and a chair and stopped. So `GameImages.OBJ_ARMY_COMPUTER_STATION` had no
    // reader in the whole project, which is what the unused-constant audit turned
    // up, and the army office rendered as a room with a table in it.
    for (const roomRect of allOffices) {
      const tablePos = new Point(
        roomRect.left + Math.floor(roomRect.width / 2),
        roomRect.top + Math.floor(roomRect.height / 2),
      );
      this.mapObjectPlace(map, tablePos.x, tablePos.y, this.makeObjTable(GameImages.OBJ_ARMY_TABLE));

      const nbChairs = 1;
      const insideRoom = new Rect(roomRect.left + 1, roomRect.top + 1, roomRect.width - 2, roomRect.height - 2);
      if (!this.isRectEmpty(insideRoom)) {
        for (let i = 0; i < nbChairs; i++) {
          const adjTableRect = this.intersectRect(
            new Rect(tablePos.x - 1, tablePos.y - 1, 3, 3),
            insideRoom,
          );
          this.mapObjectPlaceInGoodPosition(map, adjTableRect, (pt) => !pt.equals(tablePos), this.m_DiceRoller, () =>
            this.makeObjChair(GameImages.OBJ_HOSPITAL_CHAIR),
          );

          // `//@@MP - match each chair with a computer (Release 3)` — the second
          // placement in the same 3x3, and the reason it needs the *door* test the
          // chair does not: the chair is decoration and a station is 10 kilos of
          // furniture, and a room whose only walkable tile is the doorway has to
          // stay walkable.
          this.mapObjectPlaceInGoodPosition(
            map,
            adjTableRect,
            (pt) => !pt.equals(tablePos) && !this.isADoorNSEW(map, pt.x, pt.y),
            this.m_DiceRoller,
            () => this.makeObjWorkstation(GameImages.OBJ_ARMY_COMPUTER_STATION),
          );
        }
      }
    }

    ///////////
    // 8. Zone
    ///////////
    const zone = this.makeUniqueZone('Army Office', b.buildingRect);
    zone.setGameAttribute<boolean>(ZoneAttributes.IS_ARMY_OFFICE, true);
    map.addZone(zone);
    this.makeWalkwayZones(map, b);

    return true;
  }

  /**
   * The army-office pass -- the C#'s `foreach` over `emptyBlocks` at `:430-452`.
   *
   * `protected` so a test can override it away, which is what makes the CLASSIC
   * byte-identity assertion a measurement rather than a tautology about a gate.
   */
  protected makeArmyOffices(map: GameMap, emptyBlocks: Block[]): void {
    if (!hasFeature(Session.get().ruleset, Feature.ArmyBase)) return;
    if (this.m_Params.district?.kind !== DistrictKind.GREEN) return;

    // Collect, then splice, like every other stage in this file -- so the pool a
    // later stage sees is the C#'s `completedBlocks`-adjusted one.
    for (const b of emptyBlocks) {
      if (!this.makeArmyOffice(map, b)) continue;
      this.populateArmyOfficeBuilding(map, b);
      // One per district: the C#'s `armyOfficesCount == 0` guard at `:431`, with
      // the count bumped only on a successful build. The `break` is that guard --
      // a district whose first blocks are all too small to build in falls through
      // to the next one, and gets none at all rather than retrying forever.
      const index = emptyBlocks.indexOf(b);
      if (index !== -1) emptyBlocks.splice(index, 1);
      break;
    }
  }

  /**
   * C# `PopulateArmyOfficeBuilding` -- `BaseTownGenerator.cs:5560`, Release 6-3.
   *
   * Eight National Guards, zombified. This is the *reason* the army office exists
   * in a Still Alive world: it is the district's one guaranteed source of them,
   * which is what the helicopter site picker is looking for when it needs a
   * district worth landing in.
   *
   * A `for` loop with a literal 8, as in the C#. Not a constant because a constant
   * implies it was ever tuned, and nothing in the reference tunes it.
   */
  protected populateArmyOfficeBuilding(map: GameMap, b: Block): void {
    if (!hasFeature(Session.get().ruleset, Feature.ArmyBase)) return;
    for (let i = 0; i < 8; i++) {
      const guard = this.createNewArmyNationalGuard(0, 'Private');
      const zombified = this.makeZombified(null, guard, 0);
      this.actorPlace(this.m_DiceRoller, 100, map, zombified, b.insideRect.left, b.insideRect.top, b.insideRect.width, b.insideRect.height);
    }
  }

  /** C# `Map.HasAnExitIn(Rectangle)`. */
  private hasAnExitIn(map: GameMap, rect: Rect): boolean {
    for (let x = rect.left; x < rect.right; x++)
      for (let y = rect.top; y < rect.bottom; y++)
        if (map.getExitAt(new Point(x, y))) return true;
    return false;
  }

  /** C# `Rectangle.Intersect(Rectangle)` — replaces the rectangle with the intersection of both. */
  private intersectRect(a: Rect, b: Rect): Rect {
    if (!a.intersects(b)) return Rect.Empty;
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    return new Rect(left, top, right - left, bottom - top);
  }

  /** C# `Rectangle.IsEmpty`. */
  private isRectEmpty(rect: Rect): boolean {
    return rect.width <= 0 || rect.height <= 0;
  }

  /** C# `string.GetHashCode()` equivalent (31-multiplier rolling hash). */
  private stringHashCode(s: string): number {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = (Math.imul(31, hash) + s.charCodeAt(i)) | 0;
    }
    return hash;
  }

  /**
   * C# `MakeParkBuilding(Map, Block, bool isgraveyard)` — `BaseTownGenerator.cs:5553`.
   *
   * **A graveyard is not a generator.** The fork (Release 4) did not add one: it
   * added a flag to this method and branched inside it three times. That is why
   * `Feature.Graveyard` is nearly free, and it is also why it is easy to
   * under-do — the three branches are the *whole* feature.
   *
   * What `isgraveyard` changes, and nothing else:
   *  1. the fill is graves and park trees instead of trees and benches;
   *  2. the zone is `Graveyard` rather than `Park`;
   *  3. the park-only items and shed are skipped ("only add stuff to parks").
   *
   * Two C# branches in this method are *commented out* upstream and the port
   * still runs them, and that divergence is pre-existing and deliberately not
   * touched here: the perimeter fence (the C# removed park fences in Release 7-3
   * and left the graveyard's iron railing inside the dead block) and the
   * entrance face (the C# has it under `if (isgraveyard)`, the port runs it for
   * both). Fixing those is a `makeParkBuilding` conformance job, not a
   * `Feature.Graveyard` one, and doing it here would change every park in every
   * Classic world.
   */
  makeParkBuilding(map: GameMap, b: Block, isgraveyard = false): boolean {
    ////////////////////////
    // 0. Check suitability
    ////////////////////////
    if (b.insideRect.width < 3 || b.insideRect.height < 3) return false;

    /////////////////////////////
    // 1. Grass, walkway & fence
    /////////////////////////////
    this.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, b.rectangle);
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_GRASS)!, b.insideRect);
    this.mapObjectFill(map, b.buildingRect, (pt) => {
      const placeFence =
        pt.x === b.buildingRect.left ||
        pt.x === b.buildingRect.right - 1 ||
        pt.y === b.buildingRect.top ||
        pt.y === b.buildingRect.bottom - 1;
      if (placeFence) return this.makeObjFence(GameImages.OBJ_FENCE);
      else return null;
    });

    ///////////////////////////////
    // 2. Random trees and benches
    ///////////////////////////////
    if (isgraveyard) {
      // C# `:5589-5615`. The tree roll is *reused* as a grave-or-tree roll and a
      // second roll picks the stone, which is why a graveyard has far more
      // tombstones than a park has trees. `roll(0, 10)` is half-open, so `case 0`
      // is 10%, cases 1-6 are 60% plain and 7-9 are 30% cross, and the `default`
      // is unreachable -- kept because the C# has it and because a future `roll`
      // that gains an arm should fail loudly rather than silently place nothing.
      this.mapObjectFill(map, b.insideRect, () => {
        if (!this.m_DiceRoller.rollChance(PARK_GRAVE_OR_TREE_CHANCE)) return null;
        switch (this.m_DiceRoller.roll(0, 10)) {
          case 0:
            return this.makeObjParkTree(this.m_DiceRoller);
          case 1:
          case 2:
          case 3:
          case 4:
          case 5:
          case 6:
            return this.makeObjTombstone(GameImages.OBJ_PLAIN_TOMBSTONE);
          case 7:
          case 8:
          case 9:
            return this.makeObjTombstone(GameImages.OBJ_CROSS_TOMBSTONE);
          default:
            return null;
        }
      });
    } else {
      this.mapObjectFill(map, b.insideRect, () => {
        const placeTree = this.m_DiceRoller.rollChance(PARK_TREE_CHANCE);
        if (placeTree) return this.makeObjTree(GameImages.OBJ_TREE);
        else return null;
      });

      this.mapObjectFill(map, b.insideRect, () => {
        const placeBench = this.m_DiceRoller.rollChance(PARK_BENCH_CHANCE);
        if (placeBench) return this.makeObjBench(GameImages.OBJ_BENCH);
        else return null;
      });
    }

    ///////////////
    // 3. Entrance
    ///////////////
    const entranceFace = this.m_DiceRoller.roll(0, 4);
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
      default: // south
        ex = b.buildingRect.left + Math.floor(b.buildingRect.width / 2);
        ey = b.buildingRect.bottom - 1;
        break;
    }
    const entranceObj = map.getMapObjectAt(ex, ey);
    if (entranceObj) map.removeMapObject(entranceObj);
    map.setTileModelAt(ex, ey, Models.tiles.get(TileID.FLOOR_WALKWAY)!);

    ////////////
    // 4. Items
    ////////////
    //
    // C# `:5642` wraps this and the shed in `if (!isgraveyard)` with the comment
    // "only add stuff to parks". A playground full of softballs and a garden shed
    // are not what a graveyard is for.
    //
    // The gate is on the *calls*, not inside them, and that is load-bearing: the
    // C#'s `RollChance(PARK_ITEM_CHANCE)` is not taken at all for a graveyard, and
    // a taken-and-discarded die moves every roll after it. Skip the call and the
    // stream is right; enter the call and throw the result away and it is not.
    if (!isgraveyard) {
      this.itemsDrop(
        map,
        b.insideRect,
        (pt) => map.getMapObjectAt(pt.x, pt.y) === null && this.m_DiceRoller.rollChance(PARK_ITEM_CHANCE),
        () => this.makeRandomParkItem()
      );
    }

    ///////////
    // 5. Zone
    ///////////
    const parkZone = this.makeUniqueZone(isgraveyard ? 'Graveyard' : 'Park', b.buildingRect);
    map.addZone(parkZone);
    this.makeWalkwayZones(map, b);

    // Still Alive, Release 6-1 (pond) and 7-6 (the barrel in the `else`).
    ////////////
    // 6. Pond?
    ////////////
    //
    // C# `:5690-5723`, which replaced alpha10's shed step.
    //
    // **This step lost its `!isgraveyard` guard and that is the C#'s doing.** The
    // port's shed line above had one; `MakeParkBuilding`'s step 6 in the reference
    // (`:5690`) is gated only on size, so a graveyard large enough for a pond gets
    // one. Graveyards and parks share this generator and the C# clearly stopped
    // distinguishing them at this step. Ported as written rather than keeping the
    // port's own guard, because that guard was inherited from a step the C# deleted.
    if (!hasFeature(Session.get().ruleset, Feature.Fishing)) {
      // No `Feature.Fishing`: the alpha10 shed, unchanged, which is what keeps
      // Classic byte-identical. The C# has no such branch -- it deleted the shed
      // outright in Release 6-1 -- but the C# also has no `Feature.Fishing`, so the
      // two are describing the same world from two feature sets.
      if (!isgraveyard && b.insideRect.width > PARK_SHED_WIDTH + 2 && b.insideRect.height > PARK_SHED_HEIGHT + 2) {
        if (this.m_DiceRoller.rollChance(PARK_SHED_CHANCE)) {
          const shedX = this.m_DiceRoller.roll(b.insideRect.left + 1, b.insideRect.right - PARK_SHED_WIDTH);
          const shedY = this.m_DiceRoller.roll(b.insideRect.top + 1, b.insideRect.bottom - PARK_SHED_HEIGHT);
          const shedRect = new Rect(shedX, shedY, PARK_SHED_WIDTH, PARK_SHED_HEIGHT);
          this.clearRectangle(map, shedRect, false);
          this.makeParkShedBuilding(map, 'Shed', shedRect);
        }
      }
    } else if (b.insideRect.width > PARK_POND_WIDTH + 2 && b.insideRect.height > PARK_POND_HEIGHT + 2) {
      if (this.m_DiceRoller.rollChance(PARK_POND_CHANCE)) {
        // roll pond pos - dont put next to park fences!
        const pondX = this.m_DiceRoller.roll(b.insideRect.left + 1, b.insideRect.right - PARK_POND_WIDTH);
        const pondY = this.m_DiceRoller.roll(b.insideRect.top + 1, b.insideRect.bottom - PARK_POND_HEIGHT);
        // The outer rect, "for the edge tiles (a la walls)" in the C#'s words.
        const pondRect = new Rect(pondX, pondY, PARK_POND_WIDTH, PARK_POND_HEIGHT);

        // clear everything but zones in pond location
        this.clearRectangle(map, pondRect, false);

        // build it
        this.makeParkPond(map, 'Pond', pondRect);

        // drop a fishing rod. Release 7-6. This one line is the whole reason the
        // NPC fishing arm is reachable: `Map.hasFishing` was true on no map in the
        // world before it, and `CivilianAI` gates the whole arm on that flag.
        map.dropItemAt(this.makeItemFishingRod(), new Point(pondX, pondY));
      }
    }

    // ── DEFERRED: the C#'s `else` arm (Release 7-6, `:5711-5723`) ────────────
    //
    // ```csharp
    // else //add a fire barrel
    // {
    //     bool placedBarrel = false;
    //     MapObjectFill(map, b.InsideRect, (pt) =>
    //     {
    //         if (!placedBarrel)
    //         {
    //             if (m_DiceRoller.RollChance(PARK_BENCH_CHANCE))
    //             { placedBarrel = true; return MakeObjFireBarrel(GameImages.OBJ_EMPTY_BIN); }
    //             else return null;
    //         }
    //         else return null;
    //     });
    // }
    //
    // **It is the C#'s, and it is not here, because landing it breaks world
    // generation determinism in a way that has not been explained yet.**
    //
    // The symptom is precise and reproducible: `helicopter-rescue.test.ts`'s "still
    // costs nothing under STILL_ALIVE: the stage generates no geometry" compares two
    // worlds from the same seed whose only difference is that one of them skips
    // `PickHelicopterRescueSite` -- which takes exactly one `m_Rules.roll`. With this
    // arm present the two worlds differ; remove it and they match again. One roll
    // from `m_Rules`, taken *before* the player spawn, cannot reach
    // `BaseTownGenerator`'s own per-district `DiceRoller` as far as the code reads,
    // so the coupling is not understood, and a change that reshuffles every world
    // the port can generate is not one to land on a guess.
    //
    // The arm itself is eleven lines and `GameImages.OBJ_EMPTY_BIN` is already
    // added for it, so this is a blocker to clear rather than work to avoid. The
    // pond itself is unaffected: `PARK_POND_CHANCE` is 1000, so a park big enough
    // for a pond always gets one, and only the too-small parks ever reached the
    // missing `else`.

    // Done.
    return true;
  }

  makeParkShedBuilding(map: GameMap, baseZoneName: string, shedBuildingRect: Rect): void {
    const shedInsideRect = new Rect(
      shedBuildingRect.x + 1,
      shedBuildingRect.y + 1,
      shedBuildingRect.width - 2,
      shedBuildingRect.height - 2
    );

    // build building & zone
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_BRICK)!, shedBuildingRect);
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_PLANKS)!, shedInsideRect, (tile) => {
      tile.isInside = true;
    });
    map.addZone(this.makeUniqueZone(baseZoneName, shedBuildingRect));

    // place shed door and make sure door front is cleared of objects (trees).
    const doorDir = this.m_DiceRoller.roll(0, 4);
    let doorX: number;
    let doorY: number;
    let doorFrontX: number;
    let doorFrontY: number;
    switch (doorDir) {
      case 0: // west
        doorX = shedBuildingRect.left;
        doorY = shedBuildingRect.top + Math.floor(shedBuildingRect.height / 2);
        doorFrontX = doorX - 1;
        doorFrontY = doorY;
        break;
      case 1: // east
        doorX = shedBuildingRect.right - 1;
        doorY = shedBuildingRect.top + Math.floor(shedBuildingRect.height / 2);
        doorFrontX = doorX + 1;
        doorFrontY = doorY;
        break;
      case 3: // north
        doorX = shedBuildingRect.left + Math.floor(shedBuildingRect.width / 2);
        doorY = shedBuildingRect.top;
        doorFrontX = doorX;
        doorFrontY = doorY - 1;
        break;
      default: // south
        doorX = shedBuildingRect.left + Math.floor(shedBuildingRect.width / 2);
        doorY = shedBuildingRect.bottom - 1;
        doorFrontX = doorX;
        doorFrontY = doorY + 1;
        break;
    }
    this.placeDoor(map, doorX, doorY, Models.tiles.get(TileID.FLOOR_TILES)!, this.makeObjWoodenDoor());
    const doorFrontObj = map.getMapObjectAt(doorFrontX, doorFrontY);
    if (doorFrontObj) map.removeMapObject(doorFrontObj);

    // mark as inside and add shelves with tools
    this.doForEachTile(map, shedInsideRect, (pt) => {
      if (!map.isWalkable(pt.x, pt.y)) return;

      if (this.countAdjDoors(map, pt.x, pt.y) > 0) return;

      if (this.countAdjWalls(map, pt.x, pt.y) === 0) return;

      // shelf.
      this.mapObjectPlace(map, pt.x, pt.y, this.makeObjShelf(GameImages.OBJ_SHOP_SHELF));

      // construction item (tools, lights)
      const it = this.makeShopConstructionItem();
      if (it.model.isStackable) it.quantity = it.model.stackingLimit;
      map.dropItemAt(it, pt);
    });
  }

  /**
   * C# `MakeParkPond(Map, string, Rectangle)` -- `BaseTownGenerator.cs:5737-5807`.
   *
   * Release 6-1's replacement for alpha10's shed, and the first thing in the game
   * that is a body of water rather than a decoration. Three things come out of it:
   * the tiles, a zone, and **`Map.hasFishing = true`** -- the flag the whole NPC
   * fishing arm gates on, which until this landed was false on every map in the
   * world.
   *
   * The C# fills the interior and then places four edges and four corners with four
   * separate `do/while` loops, one per side, each re-deciding its own corners. That
   * is 70 lines for what is a ring of sixteen tiles, and it is transcribed as four
   * loops rather than tidied into one, because the loops are what tell you the
   * corners are *deliberately* written twice -- once by the vertical sides and once
   * by the horizontal ones -- and a reader who collapses it loses the evidence that
   * the corner names agree.
   *
   * `IsInside = false` on the fill (Release 6-1's own change from alpha10's `true`)
   * is the load-bearing line: **a pond is outdoors.** Alpha10's shed was a building.
   */
  protected makeParkPond(map: GameMap, baseZoneName: string, pondBuildingRect: Rect): void {
    const pondInsideRect = new Rect(
      pondBuildingRect.x + 1,
      pondBuildingRect.y + 1,
      pondBuildingRect.width - 2,
      pondBuildingRect.height - 2,
    );

    // build & zone
    this.tileFill(
      map,
      Models.tiles.get(TileID.FLOOR_POND_CENTER)!,
      pondInsideRect,
      (tile) => {
        tile.isInside = false;
      },
    );
    map.addZone(this.makeUniqueZone(baseZoneName, pondInsideRect));
    // Release 7-6. The flag the fishing arm reads.
    map.hasFishing = true;
    // Read by the AI's "on fire and looking for water" behaviour, which has not
    // been ported -- see `Map.hasWaterTiles`.
    map.hasWaterTiles = true;

    // The four sides, each looping its own length and deciding its own corners.
    // WEST
    let westY = pondBuildingRect.top;
    do {
      if (westY === pondBuildingRect.bottom - 1) map.setTileModelAt(pondBuildingRect.left, westY, Models.tiles.get(TileID.FLOOR_POND_SW_CORNER)!);
      else if (westY === pondBuildingRect.top) map.setTileModelAt(pondBuildingRect.left, westY, Models.tiles.get(TileID.FLOOR_POND_NW_CORNER)!);
      else map.setTileModelAt(pondBuildingRect.left, westY, Models.tiles.get(TileID.FLOOR_POND_W_EDGE)!);
      westY++;
    } while (westY <= pondBuildingRect.bottom - 1);

    // EAST
    let eastY = pondBuildingRect.top;
    do {
      if (eastY === pondBuildingRect.bottom - 1) map.setTileModelAt(pondBuildingRect.right - 1, eastY, Models.tiles.get(TileID.FLOOR_POND_SE_CORNER)!);
      else if (eastY === pondBuildingRect.top) map.setTileModelAt(pondBuildingRect.right - 1, eastY, Models.tiles.get(TileID.FLOOR_POND_NE_CORNER)!);
      else map.setTileModelAt(pondBuildingRect.right - 1, eastY, Models.tiles.get(TileID.FLOOR_POND_E_EDGE)!);
      eastY++;
    } while (eastY <= pondBuildingRect.bottom - 1);

    // NORTH
    let northX = pondBuildingRect.left;
    do {
      if (northX === pondBuildingRect.left) map.setTileModelAt(northX, pondBuildingRect.top, Models.tiles.get(TileID.FLOOR_POND_NW_CORNER)!);
      else if (northX === pondBuildingRect.right - 1) map.setTileModelAt(northX, pondBuildingRect.top, Models.tiles.get(TileID.FLOOR_POND_NE_CORNER)!);
      else map.setTileModelAt(northX, pondBuildingRect.top, Models.tiles.get(TileID.FLOOR_POND_N_EDGE)!);
      northX++;
    } while (northX <= pondBuildingRect.right - 1);

    // SOUTH
    let southX = pondBuildingRect.left;
    do {
      if (southX === pondBuildingRect.left) map.setTileModelAt(southX, pondBuildingRect.bottom - 1, Models.tiles.get(TileID.FLOOR_POND_SW_CORNER)!);
      else if (southX === pondBuildingRect.right - 1) map.setTileModelAt(southX, pondBuildingRect.bottom - 1, Models.tiles.get(TileID.FLOOR_POND_SE_CORNER)!);
      else map.setTileModelAt(southX, pondBuildingRect.bottom - 1, Models.tiles.get(TileID.FLOOR_POND_S_EDGE)!);
      southX++;
    } while (southX <= pondBuildingRect.right - 1);
  }

  /**
   * C# `MakeObjTombstone(string)` -- `BaseMapGenerator.cs:979`, made static in
   * Release 5-7. `IsMaterialTransparent` and `JumpLevel = 1` are the two that
   * matter: a body should not stop at a headstone, and a headstone should be see-
   * and shoot-over.
   */
  protected makeObjTombstone(imageId: string): MapObject {
    const grave = new MapObject('tombstone', imageId);
    grave.isMaterialTransparent = true;
    grave.jumpLevel = 1;
    grave.standOnFovBonus = true;
    return grave;
  }

  /**
   * C# `MakeObjParkTree(DiceRoller)` — `BaseMapGenerator.cs:530`, Release 7-3.
   *
   * Four tree sprites where the old `makeObjTree` had one. The roll is on the
   * district's `DiceRoller`, not a fresh one, so it moves the stream exactly where
   * the C#'s does.
   */
  protected makeObjParkTree(roller: DiceRoller): MapObject {
    return this.makeObjTree(PARK_TREES[roller.roll(0, PARK_TREES.length)]!);
  }

  // alpha10.1 makes apartements or vanilla house
  makeHousingBuilding(map: GameMap, b: Block): boolean {
    // alpha10.1 decide floorplan
    // apartment?
    if (this.m_DiceRoller.rollChance(HOUSE_IS_APARTMENTS_CHANCE)) if (this.makeApartmentsBuilding(map, b)) return true;

    // vanilla house?
    return this.makeVanillaHousingBuilding(map, b);
  }

  // alpha10.1 apartment houses
  makeApartmentsBuilding(map: GameMap, b: Block): boolean {
    ////////////////////////
    // 0. Check suitability
    ////////////////////////
    if (b.insideRect.width < 9 || b.insideRect.height < 9) return false;
    if (b.insideRect.width > 17 || b.insideRect.height > 17) return false;

    // I pretty much copied and edited the char office algorithm. lame but i'm lazy.

    /////////////////////////////
    // 1. Walkway, floor & walls
    /////////////////////////////
    this.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, b.rectangle);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_BRICK)!, b.buildingRect);
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_PLANKS)!, b.insideRect, (tile) => {
      tile.isInside = true;
    });

    //////////////////////////
    // 2. Decide orientation.
    //////////////////////////
    const horizontalCorridor = b.insideRect.width >= b.insideRect.height;

    /////////////////////////////////////
    // 3. Entry door and opposite window
    /////////////////////////////////////
    const midX = b.rectangle.left + Math.floor(b.rectangle.width / 2);
    const midY = b.rectangle.top + Math.floor(b.rectangle.height / 2);
    let doorSide: Direction;

    if (horizontalCorridor) {
      const west = this.m_DiceRoller.rollChance(50);

      if (west) {
        doorSide = Direction.W;
        // west
        this.placeDoor(map, b.buildingRect.left, midY, Models.tiles.get(TileID.FLOOR_PLANKS)!, this.makeObjWoodenDoor());
        this.placeDoor(map, b.buildingRect.right - 1, midY, Models.tiles.get(TileID.FLOOR_PLANKS)!, this.makeObjWindow());
      } else {
        doorSide = Direction.E;
        // east
        this.placeDoor(map, b.buildingRect.right - 1, midY, Models.tiles.get(TileID.FLOOR_PLANKS)!, this.makeObjWoodenDoor());
        this.placeDoor(map, b.buildingRect.left, midY, Models.tiles.get(TileID.FLOOR_PLANKS)!, this.makeObjWindow());
      }
    } else {
      const north = this.m_DiceRoller.rollChance(50);

      if (north) {
        doorSide = Direction.N;
        // north
        this.placeDoor(map, midX, b.buildingRect.top, Models.tiles.get(TileID.FLOOR_PLANKS)!, this.makeObjWoodenDoor());
        this.placeDoor(map, midX, b.buildingRect.bottom - 1, Models.tiles.get(TileID.FLOOR_PLANKS)!, this.makeObjWindow());
      } else {
        doorSide = Direction.S;
        // south
        this.placeDoor(map, midX, b.buildingRect.bottom - 1, Models.tiles.get(TileID.FLOOR_PLANKS)!, this.makeObjWoodenDoor());
        this.placeDoor(map, midX, b.buildingRect.top, Models.tiles.get(TileID.FLOOR_PLANKS)!, this.makeObjWindow());
      }
    }

    //////////////////////////////////////////////
    // 4. Make central corridor & side apartments
    //////////////////////////////////////////////
    let corridorRect: Rect;
    if (doorSide === Direction.N) corridorRect = new Rect(midX, b.insideRect.top, 1, b.buildingRect.height - 1);
    else if (doorSide === Direction.S)
      corridorRect = new Rect(midX, b.buildingRect.top, 1, b.buildingRect.height - 1);
    else if (doorSide === Direction.E)
      corridorRect = new Rect(b.buildingRect.left, midY, b.buildingRect.width - 1, 1);
    else if (doorSide === Direction.W)
      corridorRect = new Rect(b.insideRect.left, midY, b.buildingRect.width - 1, 1);
    else throw new Error('apartment: unhandled door side');

    //////////////////////
    // 5. Make apartments
    //////////////////////
    // Rectangle.FromLTRB equivalent (Rect is immutable here).
    const fromLTRB = (left: number, top: number, right: number, bottom: number): Rect =>
      new Rect(left, top, right - left, bottom - top);

    // make wings.
    let wingOne: Rect;
    let wingTwo: Rect;
    if (horizontalCorridor) {
      // top side.
      wingOne = fromLTRB(b.buildingRect.left, b.buildingRect.top, b.buildingRect.right, corridorRect.top);
      // bottom side.
      wingTwo = fromLTRB(b.buildingRect.left, corridorRect.bottom, b.buildingRect.right, b.buildingRect.bottom);
    } else {
      // left side
      wingOne = fromLTRB(b.buildingRect.left, b.buildingRect.top, corridorRect.left, b.buildingRect.bottom);
      // right side
      wingTwo = fromLTRB(corridorRect.right, b.buildingRect.top, b.buildingRect.right, b.buildingRect.bottom);
    }

    // make apartements in each wing with doors leaving toward corridor and windows to the outside
    // pick sizes so the apartements are not cut into multiple rooms by MakeRoomsPlan
    let apartmentMinXSize: number;
    let apartmentMinYSize: number;
    if (horizontalCorridor) {
      apartmentMinXSize = 4;
      apartmentMinYSize = Math.floor(b.buildingRect.height / 2);
    } else {
      apartmentMinXSize = Math.floor(b.buildingRect.width / 2);
      apartmentMinYSize = 4;
    }

    const apartementsWingOne: Rect[] = [];
    this.makeRoomsPlan(map, apartementsWingOne, wingOne, apartmentMinXSize, apartmentMinYSize);
    const apartementsWingTwo: Rect[] = [];
    this.makeRoomsPlan(map, apartementsWingTwo, wingTwo, apartmentMinXSize, apartmentMinYSize);

    const allApartments: Rect[] = [...apartementsWingOne, ...apartementsWingTwo];

    for (const apartRect of apartementsWingOne) this.tileRectangle(map, Models.tiles.get(TileID.WALL_BRICK)!, apartRect);
    for (const roomRect of apartementsWingTwo) this.tileRectangle(map, Models.tiles.get(TileID.WALL_BRICK)!, roomRect);

    // put door leading to corridor; and an opposite window if outer wall / a door if inside
    for (const apartRect of apartementsWingOne) {
      if (horizontalCorridor) {
        this.placeDoor(
          map,
          apartRect.left + Math.floor(apartRect.width / 2),
          apartRect.bottom - 1,
          Models.tiles.get(TileID.FLOOR_PLANKS)!,
          this.makeObjWoodenDoor()
        );
        this.placeDoor(
          map,
          apartRect.left + Math.floor(apartRect.width / 2),
          apartRect.top,
          Models.tiles.get(TileID.FLOOR_PLANKS)!,
          this.makeObjWindow()
        );
      } else {
        this.placeDoor(
          map,
          apartRect.right - 1,
          apartRect.top + Math.floor(apartRect.height / 2),
          Models.tiles.get(TileID.FLOOR_PLANKS)!,
          this.makeObjWoodenDoor()
        );
        this.placeDoor(
          map,
          apartRect.left,
          apartRect.top + Math.floor(apartRect.height / 2),
          Models.tiles.get(TileID.FLOOR_PLANKS)!,
          this.makeObjWindow()
        );
      }
    }
    for (const apartRect of apartementsWingTwo) {
      if (horizontalCorridor) {
        this.placeDoor(
          map,
          apartRect.left + Math.floor(apartRect.width / 2),
          apartRect.top,
          Models.tiles.get(TileID.FLOOR_PLANKS)!,
          this.makeObjWoodenDoor()
        );
        this.placeDoor(
          map,
          apartRect.left + Math.floor(apartRect.width / 2),
          apartRect.bottom - 1,
          Models.tiles.get(TileID.FLOOR_PLANKS)!,
          this.makeObjWindow()
        );
      } else {
        this.placeDoor(
          map,
          apartRect.left,
          apartRect.top + Math.floor(apartRect.height / 2),
          Models.tiles.get(TileID.FLOOR_PLANKS)!,
          this.makeObjWoodenDoor()
        );
        this.placeDoor(
          map,
          apartRect.right - 1,
          apartRect.top + Math.floor(apartRect.height / 2),
          Models.tiles.get(TileID.FLOOR_PLANKS)!,
          this.makeObjWindow()
        );
      }
    }

    // fill appartements with furniture and items
    // an "apartement" is one big room that fits all the housing roles: bedroom, kitchen and living room.
    for (const apartRect of allApartments) {
      // bedroom
      this.fillHousingRoomContents(map, apartRect, 0);
      // kitchen
      this.fillHousingRoomContents(map, apartRect, 8);
      // living room
      this.fillHousingRoomContents(map, apartRect, 5);
    }

    ///////////
    // 6. Zone
    ///////////
    const zone = this.makeUniqueZone('Apartements', b.buildingRect);
    map.addZone(zone);
    this.makeWalkwayZones(map, b);

    // done
    return true;
  }

  // alpha10.1 pre alpha10.1 regular houses
  makeVanillaHousingBuilding(map: GameMap, b: Block): boolean {
    ////////////////////////
    // 0. Check suitability
    ////////////////////////
    if (b.insideRect.width < 4 || b.insideRect.height < 4) return false;

    /////////////////////////////
    // 1. Walkway, floor & walls
    /////////////////////////////
    this.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, b.rectangle);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_BRICK)!, b.buildingRect);
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_PLANKS)!, b.insideRect, (tile) => {
      tile.isInside = true;
    });

    ///////////////////////
    // 2. Rooms floor plan
    ///////////////////////
    const roomsList: Rect[] = [];
    this.makeRoomsPlan(map, roomsList, b.buildingRect, 5, 5);

    /////////////////
    // 3. Make rooms
    /////////////////
    // alpha10 make some housings floor plan non rectangular by randomly chosing not to place one border room
    // and replace it with a special "outside" room : a garden, a parking lot.

    let iOutsideRoom = -1;
    let outsideRoom: HouseOutsideRoomType = HouseOutsideRoomType.GARDEN;
    if (roomsList.length >= HOUSE_OUTSIDE_ROOM_NEED_MIN_ROOMS && this.m_DiceRoller.rollChance(HOUSE_OUTSIDE_ROOM_CHANCE)) {
      for (;;) {
        iOutsideRoom = this.m_DiceRoller.roll(0, roomsList.length);
        const r = roomsList[iOutsideRoom];
        if (
          r.left === b.buildingRect.left ||
          r.right === b.buildingRect.right ||
          r.top === b.buildingRect.top ||
          r.bottom === b.buildingRect.bottom
        )
          break;
      }
      // HouseOutsideRoomType._FIRST .. HouseOutsideRoomType._COUNT
      outsideRoom = this.m_DiceRoller.roll(
        HouseOutsideRoomType.GARDEN,
        HouseOutsideRoomType.PARKING_LOT + 1
      ) as HouseOutsideRoomType;
    }

    for (let i = 0; i < roomsList.length; i++) {
      let roomRect = roomsList[i];
      if (iOutsideRoom === i) {
        // make sure all tiles are marked as outside
        this.doForEachTile(map, roomRect, (pt) => {
          map.getTileAt(pt.x, pt.y)!.isInside = false;
        });

        // then shrink it properly so we dont overlap with tiles from other rooms and mess things up.
        // (C# Rectangle is a struct: the local copy is mutated, roomsList keeps the original rect)
        let shrunkX = roomRect.x;
        let shrunkY = roomRect.y;
        let shrunkWidth = roomRect.width;
        let shrunkHeight = roomRect.height;
        if (roomRect.left !== b.buildingRect.left) {
          shrunkX++;
          shrunkWidth--;
        }
        if (roomRect.right !== b.buildingRect.right) {
          shrunkWidth--;
        }
        if (roomRect.top !== b.buildingRect.top) {
          shrunkY++;
          shrunkHeight--;
        }
        if (roomRect.bottom !== b.buildingRect.bottom) {
          shrunkHeight--;
        }
        roomRect = new Rect(shrunkX, shrunkY, shrunkWidth, shrunkHeight);

        // then fill the outside room
        switch (outsideRoom) {
          case HouseOutsideRoomType.GARDEN:
            this.tileFill(map, Models.tiles.get(TileID.FLOOR_GRASS)!, roomRect);
            this.doForEachTile(map, roomRect, (pos) => {
              if (
                map.getTileAt(pos.x, pos.y)!.model === Models.tiles.get(TileID.FLOOR_GRASS)! &&
                this.m_DiceRoller.rollChance(HOUSE_GARDEN_TREE_CHANCE)
              ) {
                this.mapObjectPlace(map, pos.x, pos.y, this.makeObjTree(GameImages.OBJ_TREE));
              }
            });
            break;

          case HouseOutsideRoomType.PARKING_LOT:
            this.tileFill(map, Models.tiles.get(TileID.FLOOR_ASPHALT)!, roomRect);
            this.doForEachTile(map, roomRect, (pos) => {
              if (
                map.getTileAt(pos.x, pos.y)!.model === Models.tiles.get(TileID.FLOOR_ASPHALT)! &&
                this.m_DiceRoller.rollChance(HOUSE_PARKING_LOT_CAR_CHANCE)
              ) {
                this.mapObjectPlace(map, pos.x, pos.y, this.makeObjWreckedCar(this.m_DiceRoller));
              }
            });
            break;
        }
      } else {
        this.makeHousingRoom(map, roomRect, Models.tiles.get(TileID.FLOOR_PLANKS)!, Models.tiles.get(TileID.WALL_BRICK)!);
        this.fillHousingRoomContents(map, roomRect);
      }
    }

    // once all rooms are done, enclose the outside room
    if (iOutsideRoom !== -1) {
      const roomRect = roomsList[iOutsideRoom];
      switch (outsideRoom) {
        case HouseOutsideRoomType.GARDEN:
          this.doForEachTile(map, roomRect, (pos) => {
            if (
              (pos.x === roomRect.left ||
                pos.x === roomRect.right - 1 ||
                pos.y === roomRect.top ||
                pos.y === roomRect.bottom - 1) &&
              map.getTileAt(pos.x, pos.y)!.model === Models.tiles.get(TileID.FLOOR_GRASS)!
            ) {
              const objThere = map.getMapObjectAt(pos.x, pos.y);
              if (objThere) map.removeMapObject(objThere); // make sure trees are removed
              this.mapObjectPlace(
                map,
                pos.x,
                pos.y,
                this.makeObjFence(
                  GameImages.OBJ_GARDEN_FENCE,
                  1 /* MapObjectFire.BURNABLE */,
                  Math.floor(DoorWindow.BASE_HITPOINTS / 2)
                )
              );
            }
          });
          break;

        case HouseOutsideRoomType.PARKING_LOT:
          this.doForEachTile(map, roomRect, (pos) => {
            const isLotEntry =
              pos.x === roomRect.left + Math.floor(roomRect.width / 2) ||
              pos.y === roomRect.top + Math.floor(roomRect.height / 2);
            if (
              !isLotEntry &&
              (pos.x === roomRect.left ||
                pos.x === roomRect.right - 1 ||
                pos.y === roomRect.top ||
                pos.y === roomRect.bottom - 1) &&
              map.getTileAt(pos.x, pos.y)!.model === Models.tiles.get(TileID.FLOOR_ASPHALT)!
            ) {
              const objThere = map.getMapObjectAt(pos.x, pos.y);
              if (objThere) map.removeMapObject(objThere); // make sure cars are removed
              this.mapObjectPlace(map, pos.x, pos.y, this.makeObjWireFence(GameImages.OBJ_WIRE_FENCE));
            }
          });
          break;
      }
    }

    ///////////////////////////////////////
    // 5. Fix buildings with no door exits
    ///////////////////////////////////////
    let hasOutsideDoor = false;
    for (let x = b.buildingRect.left; x < b.buildingRect.right && !hasOutsideDoor; x++)
      for (let y = b.buildingRect.top; y < b.buildingRect.bottom && !hasOutsideDoor; y++) {
        if (!map.getTileAt(x, y)!.isInside) {
          const door = map.getMapObjectAt(x, y);
          if (door instanceof DoorWindow && !door.isWindow) hasOutsideDoor = true;
        }
      }
    if (!hasOutsideDoor) {
      // replace a random window with a door.
      // alpha10 list all the exit windows, pick one and replace with a door.

      // list all exit windows
      const buildingExits: Point[] = [];
      for (let x = b.buildingRect.left; x < b.buildingRect.right; x++)
        for (let y = b.buildingRect.top; y < b.buildingRect.bottom; y++) {
          if (!map.getTileAt(x, y)!.isInside) {
            const windowObj = map.getMapObjectAt(x, y);
            if (windowObj instanceof DoorWindow && windowObj.isWindow) {
              buildingExits.push(new Point(x, y));
            }
          }
        }

      // replace an exit window with a door
      if (buildingExits.length > 0) {
        const newDoorPos = buildingExits[this.m_DiceRoller.roll(0, buildingExits.length)];
        const oldWindow = map.getMapObjectAt(newDoorPos.x, newDoorPos.y);
        if (oldWindow) map.removeMapObject(oldWindow);
        this.mapObjectPlace(map, newDoorPos.x, newDoorPos.y, this.makeObjWoodenDoor());
        hasOutsideDoor = true;
      }

      // if we did not found an exit window to replace this is a bug, it should never happen.
      // i'm lazy and assume this never happens and throw an exception.
      if (hasOutsideDoor === false) {
        // Logger has no TS port yet.
        console.error(
          'ERROR: house has no exit, should never happen; sector@' +
            map.district!.worldPosition +
            ' house@' +
            b.buildingRect
        );
        throw new Error('house has not exit, should never happen. read the log.');
      }
    }

    ////////////////
    // 6. Basement?
    ////////////////
    if (this.m_DiceRoller.rollChance(HOUSE_BASEMENT_CHANCE)) {
      const basementMap = this.generateHouseBasementMap(map, b);
      this.params.district!.addUniqueMap(basementMap);
    }

    ///////////
    // 7. Zone
    ///////////
    map.addZone(this.makeUniqueZone('Housing', b.buildingRect));
    this.makeWalkwayZones(map, b);

    // Done
    return true;
  }

  makeSewersMaintenanceBuilding(
    map: GameMap,
    isSurface: boolean,
    b: Block,
    linkedMap: GameMap | null,
    exitPosition: Point
  ): void {
    ///////////////
    // Outer walls.
    ///////////////
    // if sewers dig room.
    if (!isSurface) this.tileFill(map, Models.tiles.get(TileID.FLOOR_CONCRETE)!, b.insideRect);
    // outer walls.
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_SEWER)!, b.buildingRect);
    // make sure its marked as inside (in case we replace a park for instance)
    for (let x = b.insideRect.left; x < b.insideRect.right; x++)
      for (let y = b.insideRect.top; y < b.insideRect.bottom; y++) map.getTileAt(x, y)!.isInside = true;

    //////////////////
    // Entrance door.
    //////////////////
    // pick door side and put tags.
    let doorX: number;
    let doorY: number;
    let digDirection: Direction;
    const sideRoll = this.m_DiceRoller.roll(0, 4);
    switch (sideRoll) {
      case 0: // north.
        digDirection = Direction.N;
        doorX = b.buildingRect.left + Math.floor(b.buildingRect.width / 2);
        doorY = b.buildingRect.top;

        map.getTileAt(doorX - 1, doorY)!.addDecoration(GameImages.DECO_SEWERS_BUILDING);
        map.getTileAt(doorX + 1, doorY)!.addDecoration(GameImages.DECO_SEWERS_BUILDING);
        break;

      case 1: // south.
        digDirection = Direction.S;
        doorX = b.buildingRect.left + Math.floor(b.buildingRect.width / 2);
        doorY = b.buildingRect.bottom - 1;

        map.getTileAt(doorX - 1, doorY)!.addDecoration(GameImages.DECO_SEWERS_BUILDING);
        map.getTileAt(doorX + 1, doorY)!.addDecoration(GameImages.DECO_SEWERS_BUILDING);
        break;

      case 2: // west.
        digDirection = Direction.W;
        doorX = b.buildingRect.left;
        doorY = b.buildingRect.top + Math.floor(b.buildingRect.height / 2);

        map.getTileAt(doorX, doorY - 1)!.addDecoration(GameImages.DECO_SEWERS_BUILDING);
        map.getTileAt(doorX, doorY + 1)!.addDecoration(GameImages.DECO_SEWERS_BUILDING);
        break;

      case 3: // east.
        digDirection = Direction.E;
        doorX = b.buildingRect.right - 1;
        doorY = b.buildingRect.top + Math.floor(b.buildingRect.height / 2);

        map.getTileAt(doorX, doorY - 1)!.addDecoration(GameImages.DECO_SEWERS_BUILDING);
        map.getTileAt(doorX, doorY + 1)!.addDecoration(GameImages.DECO_SEWERS_BUILDING);
        break;
      default:
        throw new RangeError('unhandled roll');
    }
    // add the door.
    this.placeDoor(map, doorX, doorY, Models.tiles.get(TileID.FLOOR_CONCRETE)!, this.makeObjIronDoor());
    this.barricadeDoors(map, b.buildingRect, Rules.BARRICADING_MAX);

    /////////////////////////////////
    // Hole/Ladder to sewers/surface.
    /////////////////////////////////
    // add exit.
    map
      .getTileAt(exitPosition.x, exitPosition.y)!
      .addDecoration(isSurface ? GameImages.DECO_SEWER_HOLE : GameImages.DECO_SEWER_LADDER);
    const sewerExit = new Exit(linkedMap, exitPosition);
    sewerExit.isAnAIExit = true;
    map.addExit(exitPosition, sewerExit);

    ///////////////////////////////////////////////////
    // If sewers, dig corridor until we reach a tunnel.
    ///////////////////////////////////////////////////
    if (!isSurface) {
      let digPos = digDirection.applyTo(new Point(doorX, doorY));
      while (map.isInBoundsPoint(digPos) && !map.getTileAt(digPos.x, digPos.y)!.model.isWalkable) {
        // corridor.
        map.setTileModelAt(digPos.x, digPos.y, Models.tiles.get(TileID.FLOOR_CONCRETE)!);
        // continue digging.
        digPos = digDirection.applyTo(digPos);
      }
    }

    /////////////////////
    // Furniture & Items.
    /////////////////////
    // bunch of tables near walls with construction items on them.
    const nbTables = this.m_DiceRoller.roll(
      Math.max(b.insideRect.width, b.insideRect.height),
      2 * Math.max(b.insideRect.width, b.insideRect.height)
    );
    for (let i = 0; i < nbTables; i++) {
      this.mapObjectPlaceInGoodPosition(
        map,
        b.insideRect,
        (pt) => this.countAdjWalls(map, pt.x, pt.y) >= 3 && this.countAdjDoors(map, pt.x, pt.y) === 0,
        this.m_DiceRoller,
        (pt) => {
          // add item.
          map.dropItemAt(this.makeShopConstructionItem(), pt);

          // Still Alive, Release 8-2: a bag on some of the tables. C# `:6612-6618`,
          // 5% and then 75/25, dropped *before* the table object is placed on the
          // same tile.
          //
          // **The feature gate is ahead of the roll, not behind it.** `rollChance`
          // delegates to `roll` and so spends a die even at 0%, so a Classic room
          // that rolled a sentinel chance would move every subsequent district roll
          // — and the Classic district digest (`9bb5e4907bc3f62c`, asserted in
          // eleven suites) is the thing that would notice. This is the same short-circuit
          // `resourcesChance` uses two hundred lines down, for the same reason.
          if (hasFeature(Session.get().ruleset, Feature.ShelterBackpacks)) {
            if (this.m_DiceRoller.rollChance(5)) {
              map.dropItemAt(
                this.m_DiceRoller.rollChance(75)
                  ? makeBackpack(ItemID.BACKPACK_WAIST_POUCH)!
                  : makeBackpack(ItemID.BACKPACK_SATCHEL)!,
                pt
              );
            }
          }

          // add table.
          return this.makeObjTable(GameImages.OBJ_TABLE);
        }
      );
    }
    // a bed and a fridge with food if lucky.
    if (this.m_DiceRoller.rollChance(33)) {
      // bed.
      this.mapObjectPlaceInGoodPosition(
        map,
        b.insideRect,
        (pt) => this.countAdjWalls(map, pt.x, pt.y) >= 3 && this.countAdjDoors(map, pt.x, pt.y) === 0,
        this.m_DiceRoller,
        () => this.makeObjBed(GameImages.OBJ_BED)
      );

      // fridge + food.
      this.mapObjectPlaceInGoodPosition(
        map,
        b.insideRect,
        (pt) => this.countAdjWalls(map, pt.x, pt.y) >= 3 && this.countAdjDoors(map, pt.x, pt.y) === 0,
        this.m_DiceRoller,
        (pt) => {
          // add food.
          map.dropItemAt(this.makeItemCannedFood(), pt);

          // add fridge.
          return this.makeObjFridge(GameImages.OBJ_FRIDGE);
        }
      );
    }

    ////////////////////////////////////
    // Add the poor maintenance guy/gal.
    ////////////////////////////////////
    const poorGuy = this.createNewCivilian(0, 3, 1);
    this.actorPlace(
      this.m_DiceRoller,
      b.rectangle.width * b.rectangle.height,
      map,
      poorGuy,
      b.insideRect.left,
      b.insideRect.top,
      b.insideRect.width,
      b.insideRect.height
    );

    //////////////
    // Make zone.
    //////////////
    map.addZone(this.makeUniqueZone('Sewers Maintenance', b.buildingRect));

    // Done...
  }

  makeSubwayStationBuilding(
    map: GameMap,
    isSurface: boolean,
    b: Block,
    linkedMap: GameMap | null,
    exitPosition: Point
  ): void {
    ///////////////
    // Outer walls.
    ///////////////
    // if sewers dig room.
    if (!isSurface) this.tileFill(map, Models.tiles.get(TileID.FLOOR_CONCRETE)!, b.insideRect);
    // outer walls.
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_SUBWAY)!, b.buildingRect);
    // make sure its marked as inside (in case we replace a park for instance)
    for (let x = b.insideRect.left; x < b.insideRect.right; x++)
      for (let y = b.insideRect.top; y < b.insideRect.bottom; y++) map.getTileAt(x, y)!.isInside = true;

    ////////////
    // Entrance
    ////////////
    // pick door/corridor side and put tags.
    // if not surface, we must dig toward the rails.
    let entryFenceX: number;
    let entryFenceY: number;
    let digDirection: Direction;
    let sideRoll: number;
    if (isSurface) sideRoll = this.m_DiceRoller.roll(0, 4);
    else sideRoll = b.rectangle.bottom < Math.floor(map.width / 2) ? 1 : 0;
    switch (sideRoll) {
      case 0: // north.
        digDirection = Direction.N;
        entryFenceX = b.buildingRect.left + Math.floor(b.buildingRect.width / 2);
        entryFenceY = b.buildingRect.top;

        if (isSurface) {
          map.getTileAt(entryFenceX - 1, entryFenceY)!.addDecoration(GameImages.DECO_SUBWAY_BUILDING);
          map.getTileAt(entryFenceX + 1, entryFenceY)!.addDecoration(GameImages.DECO_SUBWAY_BUILDING);
        }
        break;

      case 1: // south.
        digDirection = Direction.S;
        entryFenceX = b.buildingRect.left + Math.floor(b.buildingRect.width / 2);
        entryFenceY = b.buildingRect.bottom - 1;

        if (isSurface) {
          map.getTileAt(entryFenceX - 1, entryFenceY)!.addDecoration(GameImages.DECO_SUBWAY_BUILDING);
          map.getTileAt(entryFenceX + 1, entryFenceY)!.addDecoration(GameImages.DECO_SUBWAY_BUILDING);
        }
        break;

      case 2: // west.
        digDirection = Direction.W;
        entryFenceX = b.buildingRect.left;
        entryFenceY = b.buildingRect.top + Math.floor(b.buildingRect.height / 2);

        if (isSurface) {
          map.getTileAt(entryFenceX, entryFenceY - 1)!.addDecoration(GameImages.DECO_SUBWAY_BUILDING);
          map.getTileAt(entryFenceX, entryFenceY + 1)!.addDecoration(GameImages.DECO_SUBWAY_BUILDING);
        }
        break;

      case 3: // east.
        digDirection = Direction.E;
        entryFenceX = b.buildingRect.right - 1;
        entryFenceY = b.buildingRect.top + Math.floor(b.buildingRect.height / 2);

        if (isSurface) {
          map.getTileAt(entryFenceX, entryFenceY - 1)!.addDecoration(GameImages.DECO_SUBWAY_BUILDING);
          map.getTileAt(entryFenceX, entryFenceY + 1)!.addDecoration(GameImages.DECO_SUBWAY_BUILDING);
        }
        break;
      default:
        throw new RangeError('unhandled roll');
    }
    // add door if surface.
    if (isSurface) {
      map.setTileModelAt(entryFenceX, entryFenceY, Models.tiles.get(TileID.FLOOR_CONCRETE)!);
      this.mapObjectPlace(map, entryFenceX, entryFenceY, this.makeObjGlassDoor());
    }

    ///////////////////////////
    // Stairs to the other map.
    ///////////////////////////
    // add exits.
    for (let ex = exitPosition.x - 1; ex <= exitPosition.x + 1; ex++) {
      const thisExitPos = new Point(ex, exitPosition.y);
      map
        .getTileAt(thisExitPos.x, thisExitPos.y)!
        .addDecoration(isSurface ? GameImages.DECO_STAIRS_DOWN : GameImages.DECO_STAIRS_UP);
      const stairsExit = new Exit(linkedMap, thisExitPos);
      stairsExit.isAnAIExit = true;
      map.addExit(thisExitPos, stairsExit);
    }

    ///////////////////////////////////////////////////
    // If subway :
    // - dig corridor until we reach the rails.
    // - dig platform and make corridor zone.
    // - add closed iron fences between corridor and platform.
    // - make power room.
    ///////////////////////////////////////////////////
    if (!isSurface) {
      // Rectangle.FromLTRB equivalent (Rect is immutable here).
      const fromLTRB = (left: number, top: number, right: number, bottom: number): Rect =>
        new Rect(left, top, right - left, bottom - top);

      // - dig corridor until we reach the rails.
      map.setTileModelAt(entryFenceX, entryFenceY, Models.tiles.get(TileID.FLOOR_CONCRETE)!);
      map.setTileModelAt(entryFenceX + 1, entryFenceY, Models.tiles.get(TileID.FLOOR_CONCRETE)!);
      map.setTileModelAt(entryFenceX - 1, entryFenceY, Models.tiles.get(TileID.FLOOR_CONCRETE)!);
      map.setTileModelAt(entryFenceX - 2, entryFenceY, Models.tiles.get(TileID.WALL_STONE)!);
      map.setTileModelAt(entryFenceX + 2, entryFenceY, Models.tiles.get(TileID.WALL_STONE)!);

      let digPos = digDirection.applyTo(new Point(entryFenceX, entryFenceY));
      while (map.isInBoundsPoint(digPos) && !map.getTileAt(digPos.x, digPos.y)!.model.isWalkable) {
        // corridor.
        map.setTileModelAt(digPos.x, digPos.y, Models.tiles.get(TileID.FLOOR_CONCRETE)!);
        map.setTileModelAt(digPos.x - 1, digPos.y, Models.tiles.get(TileID.FLOOR_CONCRETE)!);
        map.setTileModelAt(digPos.x + 1, digPos.y, Models.tiles.get(TileID.FLOOR_CONCRETE)!);
        map.setTileModelAt(digPos.x - 2, digPos.y, Models.tiles.get(TileID.WALL_STONE)!);
        map.setTileModelAt(digPos.x + 2, digPos.y, Models.tiles.get(TileID.WALL_STONE)!);

        // continue digging.
        digPos = digDirection.applyTo(digPos);
      }

      // - dig platform and make corridor zone.
      const platformExtend = 10;
      const platformWidth = 3;
      let platformRect: Rect;
      const platformLeft = Math.max(0, b.buildingRect.left - platformExtend);
      const platformRight = Math.min(map.width - 1, b.buildingRect.right + platformExtend);
      let benchesLine: number;
      if (digDirection === Direction.S) {
        platformRect = fromLTRB(platformLeft, digPos.y - platformWidth, platformRight, digPos.y);
        benchesLine = platformRect.top;
        map.addZone(
          this.makeUniqueZone('corridor', fromLTRB(entryFenceX - 1, entryFenceY, entryFenceX + 1 + 1, platformRect.top))
        );
      } else {
        platformRect = fromLTRB(platformLeft, digPos.y + 1, platformRight, digPos.y + 1 + platformWidth);
        benchesLine = platformRect.bottom - 1;
        map.addZone(
          this.makeUniqueZone('corridor', fromLTRB(entryFenceX - 1, platformRect.bottom, entryFenceX + 1 + 1, entryFenceY + 1))
        );
      }
      this.tileFill(map, Models.tiles.get(TileID.FLOOR_CONCRETE)!, platformRect);

      // - iron benches in platform.
      for (let bx = platformRect.left; bx < platformRect.right; bx++) {
        if (this.countAdjWalls(map, bx, benchesLine) < 3) continue;

        // Still Alive, Release 8-2: a bag on 1% of the bench tiles. C# `:6920-6926`,
        // 1% and then 75/25, dropped before the bench goes on the same tile.
        //
        // The port's bench loop is not the C#'s — the C# scans the whole inside rect
        // in two dimensions behind four guards (adjacent doors, corners, exits, and
        // a two-tile exclusion around the entry stairs) and the port scans one line
        // behind one. So the eligible-tile set differs, and this is the reference's
        // roll placed at the port's corresponding point rather than a claim that the
        // two agree. Gated ahead of the roll for the Classic-digest reason spelled
        // out in the sewers maintenance building above.
        if (hasFeature(Session.get().ruleset, Feature.ShelterBackpacks)) {
          if (this.m_DiceRoller.rollChance(1)) {
            map.dropItemAt(
              this.m_DiceRoller.rollChance(75)
                ? makeBackpack(ItemID.BACKPACK_WAIST_POUCH)!
                : makeBackpack(ItemID.BACKPACK_SATCHEL)!,
              new Point(bx, benchesLine)
            );
          }
        }

        this.mapObjectPlace(map, bx, benchesLine, this.makeObjIronBench(GameImages.OBJ_IRON_BENCH));
      }

      // - platform zone.
      map.addZone(this.makeUniqueZone('platform', platformRect));

      // - add closed iron gates between corridor and platform.
      let ironFencePos: Point;
      if (digDirection === Direction.S) ironFencePos = new Point(entryFenceX, platformRect.top - 1);
      else ironFencePos = new Point(entryFenceX, platformRect.bottom);
      this.mapObjectPlace(map, ironFencePos.x, ironFencePos.y, this.makeObjIronGate(GameImages.OBJ_GATE_CLOSED));
      this.mapObjectPlace(map, ironFencePos.x + 1, ironFencePos.y, this.makeObjIronGate(GameImages.OBJ_GATE_CLOSED));
      this.mapObjectPlace(map, ironFencePos.x - 1, ironFencePos.y, this.makeObjIronGate(GameImages.OBJ_GATE_CLOSED));

      // - make power room.
      // access in the corridor, going toward the center of the map.
      let powerRoomEntry: Point;
      let powerRoomRect: Rect;
      const powerRoomWidth = 4;
      const powerRoomHalfHeight = 2;
      if (entryFenceX > Math.floor(map.width / 2)) {
        // west.
        powerRoomEntry = new Point(entryFenceX - 2, entryFenceY + powerRoomHalfHeight * digDirection.dy);
        powerRoomRect = fromLTRB(
          powerRoomEntry.x - powerRoomWidth,
          powerRoomEntry.y - powerRoomHalfHeight,
          powerRoomEntry.x + 1,
          powerRoomEntry.y + powerRoomHalfHeight + 1
        );
      } else {
        // east.
        powerRoomEntry = new Point(entryFenceX + 2, entryFenceY + powerRoomHalfHeight * digDirection.dy);
        powerRoomRect = fromLTRB(
          powerRoomEntry.x,
          powerRoomEntry.y - powerRoomHalfHeight,
          powerRoomEntry.x + powerRoomWidth,
          powerRoomEntry.y + powerRoomHalfHeight + 1
        );
      }

      // carve power room.
      this.tileFill(map, Models.tiles.get(TileID.FLOOR_CONCRETE)!, powerRoomRect);
      this.tileRectangle(map, Models.tiles.get(TileID.WALL_STONE)!, powerRoomRect);

      // add door with signs.
      this.placeDoor(map, powerRoomEntry.x, powerRoomEntry.y, Models.tiles.get(TileID.FLOOR_CONCRETE)!, this.makeObjIronDoor());
      map.getTileAt(powerRoomEntry.x, powerRoomEntry.y - 1)!.addDecoration(GameImages.DECO_POWER_SIGN_BIG);
      map.getTileAt(powerRoomEntry.x, powerRoomEntry.y + 1)!.addDecoration(GameImages.DECO_POWER_SIGN_BIG);

      // add power generators along wall.
      this.mapObjectFill(map, powerRoomRect, (pt) => {
        if (!map.getTileAt(pt.x, pt.y)!.model.isWalkable) return null;
        if (this.countAdjWalls(map, pt.x, pt.y) < 3 || this.countAdjDoors(map, pt.x, pt.y) > 0) return null;
        return this.makeObjPowerGenerator(GameImages.OBJ_POWERGEN_OFF, GameImages.OBJ_POWERGEN_ON);
      });
    }

    /////////////////////
    // Furniture & Items.
    /////////////////////
    // iron benches in station.
    for (let bx = b.insideRect.left; bx < b.insideRect.right; bx++)
      for (let by = b.insideRect.top + 1; by < b.insideRect.bottom - 1; by++) {
        // next to walls and no doors.
        if (this.countAdjWalls(map, bx, by) < 2 || this.countAdjDoors(map, bx, by) > 0) continue;

        // not next to stairs.
        if (this.m_Rules.gridDistance(new Point(bx, by), new Point(entryFenceX, entryFenceY)) < 2) continue;

        // bench.
        this.mapObjectPlace(map, bx, by, this.makeObjIronBench(GameImages.OBJ_IRON_BENCH));
      }

    /////////////////////////////////////
    // Add subway police guy on surface.
    /////////////////////////////////////
    if (isSurface) {
      const policeMan = this.createNewPoliceman(0);
      this.actorPlace(
        this.m_DiceRoller,
        b.rectangle.width * b.rectangle.height,
        map,
        policeMan,
        b.insideRect.left,
        b.insideRect.top,
        b.insideRect.width,
        b.insideRect.height
      );
    }

    //////////////
    // Make zone.
    //////////////
    map.addZone(this.makeUniqueZone('Subway Station', b.buildingRect));
  }

  makeRoomsPlan(map: GameMap, list: Rect[], rect: Rect, minRoomsXSize: number, minRoomsYSize: number): void {
    // alpha10.1 allow different x and y min size

    // 1. Split
    const { topLeft, topRight, bottomLeft, bottomRight } = this.quadSplit(rect, minRoomsXSize, minRoomsYSize);

    // 2. Termination?
    if (topRight.equals(Rect.Empty) && bottomLeft.equals(Rect.Empty) && bottomRight.equals(Rect.Empty)) {
      list.push(rect);
      return;
    }

    // 3. Recurse
    // always top left.
    this.makeRoomsPlan(map, list, topLeft, minRoomsXSize, minRoomsYSize);
    // then recurse in non empty quads.
    // we shift and inflate the quads cause we want rooms walls and doors to overlap.
    if (!topRight.equals(Rect.Empty)) {
      const shiftedTopRight = new Rect(topRight.left - 1, topRight.top, topRight.width + 1, topRight.height);
      this.makeRoomsPlan(map, list, shiftedTopRight, minRoomsXSize, minRoomsYSize);
    }
    if (!bottomLeft.equals(Rect.Empty)) {
      const shiftedBottomLeft = new Rect(bottomLeft.left, bottomLeft.top - 1, bottomLeft.width, bottomLeft.height + 1);
      this.makeRoomsPlan(map, list, shiftedBottomLeft, minRoomsXSize, minRoomsYSize);
    }
    if (!bottomRight.equals(Rect.Empty)) {
      const shiftedBottomRight = new Rect(
        bottomRight.left - 1,
        bottomRight.top - 1,
        bottomRight.width + 1,
        bottomRight.height + 1
      );
      this.makeRoomsPlan(map, list, shiftedBottomRight, minRoomsXSize, minRoomsYSize);
    }
  }

  makeHousingRoom(map: GameMap, roomRect: Rect, floor: TileModel, wall: TileModel): void {
    // 1. Floor & Walls
    this.tileFill(map, floor, roomRect);
    this.tileRectangle(
      map,
      wall,
      roomRect.left,
      roomRect.top,
      roomRect.width,
      roomRect.height,
      (_tile, _prevModel, x, y) => {
        // if we have a door there, don't put a wall!
        if (map.getMapObjectAt(x, y) !== null) map.setTileModelAt(x, y, floor);
      }
    );

    // 2. Doors & Windows
    const midX = roomRect.left + Math.floor(roomRect.width / 2);
    const midY = roomRect.top + Math.floor(roomRect.height / 2);
    const outsideDoorChance = 25;

    this.placeIf(
      map,
      midX,
      roomRect.top,
      floor,
      (x, y) => this.hasNoObjectAt(map, x, y) && this.isAccessible(map, x, y) && this.countAdjDoors(map, x, y) === 0,
      (x, y) =>
        this.isInside(map, x, y) || this.m_DiceRoller.rollChance(outsideDoorChance)
          ? this.makeObjWoodenDoor()
          : this.makeObjWindow()
    );
    this.placeIf(
      map,
      midX,
      roomRect.bottom - 1,
      floor,
      (x, y) => this.hasNoObjectAt(map, x, y) && this.isAccessible(map, x, y) && this.countAdjDoors(map, x, y) === 0,
      (x, y) =>
        this.isInside(map, x, y) || this.m_DiceRoller.rollChance(outsideDoorChance)
          ? this.makeObjWoodenDoor()
          : this.makeObjWindow()
    );
    this.placeIf(
      map,
      roomRect.left,
      midY,
      floor,
      (x, y) => this.hasNoObjectAt(map, x, y) && this.isAccessible(map, x, y) && this.countAdjDoors(map, x, y) === 0,
      (x, y) =>
        this.isInside(map, x, y) || this.m_DiceRoller.rollChance(outsideDoorChance)
          ? this.makeObjWoodenDoor()
          : this.makeObjWindow()
    );
    this.placeIf(
      map,
      roomRect.right - 1,
      midY,
      floor,
      (x, y) => this.hasNoObjectAt(map, x, y) && this.isAccessible(map, x, y) && this.countAdjDoors(map, x, y) === 0,
      (x, y) =>
        this.isInside(map, x, y) || this.m_DiceRoller.rollChance(outsideDoorChance)
          ? this.makeObjWoodenDoor()
          : this.makeObjWindow()
    );
  }

  // alpha10.1 can force room role (optional param)
  // FIXME -- room role should be an enum and not hardcoded numbers -_-
  // role: -1 roll at random; 0-4 bedroom, 5-7 living room, 8-9 kitchen
  fillHousingRoomContents(map: GameMap, roomRect: Rect, role?: number): void {
    const insideRoom = new Rect(roomRect.left + 1, roomRect.top + 1, roomRect.width - 2, roomRect.height - 2);

    // alpha10.1 roll room role if not set
    if (role === undefined || role === -1) role = this.m_DiceRoller.roll(0, 10);

    // alpha10.1 added restriction to not place a mapobj if adj to at least 5 mapobj as to not cramp apartements

    switch (role) {
      // 1. Bedroom? 0-4 = 50%
      case 0:
      case 1:
      case 2:
      case 3:
      case 4: {
        // beds with night tables.
        const nbBeds = this.m_DiceRoller.roll(1, 3);
        for (let i = 0; i < nbBeds; i++) {
          this.mapObjectPlaceInGoodPosition(
            map,
            insideRoom,
            (pt) =>
              this.countAdjWalls(map, pt.x, pt.y) >= 3 &&
              this.countAdjDoors(map, pt.x, pt.y) === 0 &&
              this.countAdjMapObjects(map, pt.x, pt.y) < 5, // alpha10.1 not cramped
            this.m_DiceRoller,
            (pt) => {
              // one night table around with item.
              const adjBedRect = this.roomsIntersectRect(new Rect(pt.x - 1, pt.y - 1, 3, 3), insideRoom);
              this.mapObjectPlaceInGoodPosition(
                map,
                adjBedRect,
                (pt2) =>
                  !pt2.equals(pt) &&
                  this.countAdjDoors(map, pt2.x, pt2.y) === 0 &&
                  this.countAdjWalls(map, pt2.x, pt2.y) > 0 &&
                  this.countAdjMapObjects(map, pt.x, pt.y) < 5, // alpha10.1 not cramped
                this.m_DiceRoller,
                (pt2) => {
                  // item.
                  const it = this.makeRandomBedroomItem();
                  if (it) map.dropItemAt(it, pt2);

                  // night table.
                  return this.makeObjNightTable(GameImages.OBJ_NIGHT_TABLE);
                }
              );

              // bed.
              return this.makeObjBed(GameImages.OBJ_BED);
            }
          );
        }

        // wardrobe/drawer with items
        const nbWardrobeOrDrawer = this.m_DiceRoller.roll(1, 4);
        for (let i = 0; i < nbWardrobeOrDrawer; i++) {
          this.mapObjectPlaceInGoodPosition(
            map,
            insideRoom,
            (pt) =>
              this.countAdjWalls(map, pt.x, pt.y) >= 2 &&
              this.countAdjDoors(map, pt.x, pt.y) === 0 &&
              this.countAdjMapObjects(map, pt.x, pt.y) < 5, // alpha10.1 not cramped
            this.m_DiceRoller,
            (pt) => {
              // item.
              const it = this.makeRandomBedroomItem();
              if (it) map.dropItemAt(it, pt);

              // wardrobe or drawer
              if (this.m_DiceRoller.rollChance(50)) return this.makeObjWardrobe(GameImages.OBJ_WARDROBE);
              else return this.makeObjDrawer(GameImages.OBJ_DRAWER);
            }
          );
        }
        break;
      }

      // 2. Living room? 5-6-7 = 30%
      case 5:
      case 6:
      case 7: {
        // tables with chairs.
        const nbTables = this.m_DiceRoller.roll(1, 3);

        for (let i = 0; i < nbTables; i++) {
          this.mapObjectPlaceInGoodPosition(
            map,
            insideRoom,
            (pt) =>
              this.countAdjWalls(map, pt.x, pt.y) === 0 &&
              this.countAdjDoors(map, pt.x, pt.y) === 0 &&
              this.countAdjMapObjects(map, pt.x, pt.y) < 5, // alpha10.1 not cramped
            this.m_DiceRoller,
            (pt) => {
              // items.
              for (let ii = 0; ii < HOUSE_LIVINGROOM_ITEMS_ON_TABLE; ii++) {
                const it = this.makeRandomKitchenItem();
                if (it) map.dropItemAt(it, pt);
              }

              // one chair around.
              const adjTableRect = this.roomsIntersectRect(new Rect(pt.x - 1, pt.y - 1, 3, 3), insideRoom);
              this.mapObjectPlaceInGoodPosition(
                map,
                adjTableRect,
                (pt2) =>
                  !pt2.equals(pt) &&
                  this.countAdjDoors(map, pt2.x, pt2.y) === 0 &&
                  this.countAdjMapObjects(map, pt.x, pt.y) < 5, // alpha10.1 not cramped
                this.m_DiceRoller,
                (_pt2) => this.makeObjChair(GameImages.OBJ_CHAIR)
              );

              // table.
              return this.makeObjTable(GameImages.OBJ_TABLE);
            }
          );
        }

        // drawers.
        const nbDrawers = this.m_DiceRoller.roll(1, 3);
        for (let i = 0; i < nbDrawers; i++) {
          this.mapObjectPlaceInGoodPosition(
            map,
            insideRoom,
            (pt) =>
              this.countAdjWalls(map, pt.x, pt.y) >= 2 &&
              this.countAdjDoors(map, pt.x, pt.y) === 0 &&
              this.countAdjMapObjects(map, pt.x, pt.y) < 5, // alpha10.1 not cramped
            this.m_DiceRoller,
            (_pt) => this.makeObjDrawer(GameImages.OBJ_DRAWER)
          );
        }
        break;
      }

      // 3. Kitchen? 8-9 = 20%
      case 8:
      case 9: {
        // table with item & chair.
        this.mapObjectPlaceInGoodPosition(
          map,
          insideRoom,
          (pt) =>
            this.countAdjWalls(map, pt.x, pt.y) === 0 &&
            this.countAdjDoors(map, pt.x, pt.y) === 0 &&
            this.countAdjMapObjects(map, pt.x, pt.y) < 5, // alpha10.1 not cramped
          this.m_DiceRoller,
          (pt) => {
            // items.
            for (let ii = 0; ii < HOUSE_KITCHEN_ITEMS_ON_TABLE; ii++) {
              const it = this.makeRandomKitchenItem();
              if (it) map.dropItemAt(it, pt);
            }

            // one chair around.
            const adjTableRect = new Rect(pt.x - 1, pt.y - 1, 3, 3);
            this.mapObjectPlaceInGoodPosition(
              map,
              adjTableRect,
              (pt2) => !pt2.equals(pt) && this.countAdjDoors(map, pt2.x, pt2.y) === 0,
              this.m_DiceRoller,
              (_pt2) => this.makeObjChair(GameImages.OBJ_CHAIR)
            );

            // table.
            return this.makeObjTable(GameImages.OBJ_TABLE);
          }
        );

        // fridge with items
        this.mapObjectPlaceInGoodPosition(
          map,
          insideRoom,
          (pt) =>
            this.countAdjWalls(map, pt.x, pt.y) >= 2 &&
            this.countAdjDoors(map, pt.x, pt.y) === 0 &&
            this.countAdjMapObjects(map, pt.x, pt.y) < 5, // alpha10.1 not cramped
          this.m_DiceRoller,
          (pt) => {
            // items.
            for (let ii = 0; ii < HOUSE_KITCHEN_ITEMS_IN_FRIDGE; ii++) {
              const it = this.makeRandomKitchenItem();
              if (it) map.dropItemAt(it, pt);
            }

            // fridge
            return this.makeObjFridge(GameImages.OBJ_FRIDGE);
          }
        );
        break;
      }

      default:
        throw new RangeError('unhandled roll');
    }
  }

  /** C# `Rectangle.Intersect(Rectangle)` — intersection of two rects, `Rect.Empty` when disjoint. */
  private roomsIntersectRect(a: Rect, b: Rect): Rect {
    const x1 = Math.max(a.left, b.left);
    const y1 = Math.max(a.top, b.top);
    const x2 = Math.min(a.right, b.right);
    const y2 = Math.min(a.bottom, b.bottom);
    if (x2 >= x1 && y2 >= y1) return new Rect(x1, y1, x2 - x1, y2 - y1);
    return Rect.Empty;
  }

  makeRandomShopItem(shop: ShopType): Item {
    switch (shop) {
      case ShopType.CONSTRUCTION:
        return this.makeShopConstructionItem();
      case ShopType.GENERAL_STORE:
        return this.makeShopGeneralItem();
      case ShopType.GROCERY:
        return this.makeShopGroceryItem();
      case ShopType.GUNSHOP:
        return this.makeShopGunshopItem();
      case ShopType.PHARMACY:
        return this.makeShopPharmacyItem();
      case ShopType.SPORTSWEAR:
        return this.makeShopSportsWearItem();
      case ShopType.HUNTING:
        return this.makeHuntingShopItem();
      default:
        throw new RangeError('unhandled shoptype');
    }
  }

  makeShopGroceryItem(): Item {
    if (this.m_DiceRoller.rollChance(50)) {
      return this.makeItemCannedFood();
    } else {
      return this.makeItemGroceries();
    }
  }

  makeShopPharmacyItem(): Item {
    const randomItem = this.m_DiceRoller.roll(0, 6);
    switch (randomItem) {
      case 0:
        return this.makeItemBandages();
      case 1:
        return this.makeItemMedikit();
      case 2:
        return this.makeItemPillsSLP();
      case 3:
        return this.makeItemPillsSTA();
      case 4:
        return this.makeItemPillsSAN();
      case 5:
        return this.makeItemStenchKiller();
      default:
        throw new RangeError('unhandled roll');
    }
  }

  makeShopSportsWearItem(): Item {
    const roll = this.m_DiceRoller.roll(0, 10);

    switch (roll) {
      case 0:
        if (this.m_DiceRoller.rollChance(30)) {
          return this.makeItemHuntingRifle();
        } else {
          return this.makeItemLightRifleAmmo();
        }
      case 1:
        if (this.m_DiceRoller.rollChance(30)) {
          return this.makeItemHuntingCrossbow();
        } else {
          return this.makeItemBoltsAmmo();
        }
      case 2:
      case 3:
      case 4:
      case 5:
        return this.makeItemBaseballBat(); // 40%
      case 6:
      case 7:
        return this.makeItemIronGolfClub(); // 20%
      case 8:
      case 9:
        return this.makeItemGolfClub(); // 20%
      default:
        throw new RangeError('unhandled roll');
    }
  }

  makeShopConstructionItem(): Item {
    const roll = this.m_DiceRoller.roll(0, 24);
    switch (roll) {
      case 0:
      case 1:
      case 2:
        return this.m_DiceRoller.rollChance(50) ? this.makeItemShovel() : this.makeItemShortShovel();
      case 3:
      case 4:
      case 5:
        return this.makeItemCrowbar();
      case 6:
      case 7:
      case 8:
        return this.m_DiceRoller.rollChance(50) ? this.makeItemHugeHammer() : this.makeItemSmallHammer();
      case 9:
      case 10:
      case 11:
        return this.makeItemWoodenPlank();
      case 12:
      case 13:
      case 14:
        return this.makeItemFlashlight();
      case 15:
      case 16:
      case 17:
        return this.makeItemBigFlashlight();
      case 18:
      case 19:
      case 20:
        return this.makeItemSpikes();
      case 21:
      case 22:
      case 23:
        return this.makeItemBarbedWire();
      default:
        throw new RangeError('unhandled roll');
    }
  }

  makeShopGunshopItem(): Item {
    // Weapons (40%) vs Ammo (60%)
    if (this.m_DiceRoller.rollChance(40)) {
      const roll = this.m_DiceRoller.roll(0, 4);

      switch (roll) {
        case 0:
          return this.makeItemRandomPistol();
        case 1:
          return this.makeItemShotgun();
        case 2:
          return this.makeItemHuntingRifle();
        case 3:
          return this.makeItemHuntingCrossbow();
        default:
          return null!; // unreachable, roll is [0, 4)
      }
    } else {
      const roll = this.m_DiceRoller.roll(0, 4);

      switch (roll) {
        case 0:
          return this.makeItemLightPistolAmmo();
        case 1:
          return this.makeItemShotgunAmmo();
        case 2:
          return this.makeItemLightRifleAmmo();
        case 3:
          return this.makeItemBoltsAmmo();
        default:
          return null!; // unreachable, roll is [0, 4)
      }
    }
  }

  /**
   * C# `MakeHuntingShopItem` -- `BaseTownGenerator.cs:7547`, with the fork's Releases
   * 1, 3, 7-1, 7-6 and 8-2.
   *
   * The vanilla table is a 50/50 split and two `roll(0, 2)` ladders, giving four
   * distinct items. The fork widens **both** rolls to `roll(0, 4)` and rebalances the
   * top-level split to 60/40, so the shop carries ten items and the *odds* of each
   * change as well as the contents.
   *
   * ## The odd entries are the point, not noise
   *
   * - **the ammo ladder returns two of each.** `Bolts, Bolts, LightRifleAmmo,
   *   LightRifleAmmo` (Release 8-2) -- no fourth distinct stack, so `case 2` and
   *   `case 3` are duplicates of `case 1` and `case 0`. This is deliberate: the fork
   *   wanted bolt and rifle ammo equally likely and made it so by weighting, not by
   *   adding an item. Transcribing it as "two entries, `roll(0, 2)`" would look like a
   *   tidy-up and would halve both stacks' odds.
   * - **`case 3` of the outfits ladder is two rolls deep** (Release 8-2): a 25% gate,
   *   then a 50/50 between binoculars and a **hiking pack**. So the hiking pack is
   *   10% of the outfits 40%, i.e. **4% of the whole shop** -- one backpack in twenty-five
   *   hunting shops. That is the last of the five backpack models to get a producer,
   *   and it arrives here rather than in one of the more obvious places.
   * - **the 25% gate's `else` is a fishing rod**, so the rod is 75% of `case 3` and
   *   also `case 2` of the weapons ladder (Release 7-6). One item, two doors.
   *
   * ## What this costs
   *
   * Every roll here is a `m_DiceRoller` draw on the district stream, and widening
   * `roll(0, 2)` to `roll(0, 4)` does **not** consume the same number of dice. So
   * every district after the first hunting shop diverges, which moves the Classic
   * district fingerprints and every seed-sensitive assertion downstream. That is why
   * this was reverted once and re-attempted deliberately rather than slipped in.
   */
  makeHuntingShopItem(): Item {
    // Weapons/Ammo (60%) Outfits&Traps (40%)
    if (this.m_DiceRoller.rollChance(60)) {
      //@@MP (Release 3) -- was 50.
      // Weapons(40) Ammo(60)
      if (this.m_DiceRoller.rollChance(40)) {
        const roll = this.m_DiceRoller.roll(0, 4);

        switch (roll) {
          case 0:
            return this.makeItemHuntingRifle();
          case 1:
            return this.makeItemHuntingCrossbow();
          case 2:
            return this.makeItemFishingRod(); //@@MP (Release 7-6)
          case 3:
            return this.makeItemCombatKnife(); //@@MP (Release 8-2)
          default:
            return null!; // unreachable, roll is [0, 4)
        }
      } else {
        const roll = this.m_DiceRoller.roll(0, 4);

        switch (roll) {
          case 0:
            return this.makeItemLightRifleAmmo();
          case 1:
            return this.makeItemBoltsAmmo();
          case 2:
            return this.makeItemBoltsAmmo(); //@@MP (Release 8-2)
          case 3:
            return this.makeItemLightRifleAmmo(); //@@MP (Release 8-2)
          default:
            return null!; // unreachable, roll is [0, 4)
        }
      }
    } else {
      // Outfits&Traps
      const roll = this.m_DiceRoller.roll(0, 4);
      switch (roll) {
        case 0:
          return this.makeItemHunterVest();
        case 1:
          return this.makeItemBearTrap();
        case 2:
          return this.makeItemStenchKiller(); //@@MP added (Release 1)
        case 3:
          // Two rolls, and the second one is where the last backpack model comes from.
          if (this.m_DiceRoller.rollChance(25)) {
            if (this.m_DiceRoller.rollChance(50))
              return this.makeItemBinoculars(); //@@MP added (Release 7-1)
            else return this.makeItemHikingPack(); //@@MP added (Release 8-2)
          } else return this.makeItemFishingRod();
        default:
          return null!; // unreachable, roll is [0, 4)
      }
    }
  }

  makeShopGeneralItem(): Item {
    const roll = this.m_DiceRoller.roll(0, 6);
    switch (roll) {
      case 0:
        return this.makeShopPharmacyItem();
      case 1:
        return this.makeShopSportsWearItem();
      case 2:
        return this.makeShopConstructionItem();
      case 3:
        return this.makeShopGroceryItem();
      case 4:
        return this.makeHuntingShopItem();
      case 5:
        return this.makeRandomBedroomItem();
      default:
        throw new RangeError('unhandled roll');
    }
  }

  makeHospitalItem(): Item {
    const randomItem = this.m_DiceRoller.roll(0, 7);
    switch (randomItem) {
      case 0:
        return this.makeItemBandages();
      case 1:
        return this.makeItemMedikit();
      case 2:
        return this.makeItemPillsSLP();
      case 3:
        return this.makeItemPillsSTA();
      case 4:
        return this.makeItemPillsSAN();
      case 5:
        return this.makeItemStenchKiller();
      case 6:
        return this.makeItemPillsAntiviral();
      default:
        throw new RangeError('unhandled roll');
    }
  }

  /**
   * C# `MakeRandomOrdinaryOfficeItem` — `BaseTownGenerator.cs:7776` (Release 7-3).
   *
   * The plain office's item table, against the CHAR office's. `roll(0, 11)` and then a
   * `default: return null` for the six arms the C# leaves empty — **a 50% chance to
   * find nothing**, as its own comment says. `ItemsDrop` skips a null factory, so the
   * empty arms cost a roll and place nothing, which is the intended shape.
   *
   * `case 5` is the Release 8-2 backpack site: 25% daypack, else a box of matches.
   */
  makeRandomOrdinaryOfficeItem(): Item | null {
    const randomItem = this.m_DiceRoller.roll(0, 11);

    switch (randomItem) {
      case 0:
      case 1:
        if (this.m_DiceRoller.rollChance(50)) {
          return this.makeItemEnergyDrink();
        }
        return this.makeItemPillsSTA();
      case 2:
      case 3:
        return this.makeItemSnackBar();
      case 4:
        return this.makeItemCellPhone();
      case 5:
        if (this.m_DiceRoller.rollChance(25)) {
          return this.makeItemDaypack(); //@@MP (Release 8-2)
        }
        return this.makeItemMatches();
      default:
        return null; // 50% chance to find nothing.
    }
  }

  /**
   * C# `MakeRandomBedroomItem` -- `BaseTownGenerator.cs:7657`, with Releases 1, 3, 4,
   * 5-2, 7-6 and 8-2.
   *
   * The port had vanilla's `roll(0, 24)` and a different item at almost every index.
   * The fork's table is **`roll(0, 20)`** with 21 cases -- and that is not a typo to be
   * tidied, it is the whole reason this method is interesting.
   *
   * ## `case 20` is unreachable, and is left that way
   *
   * `roll(0, 20)` is half-open, so it yields 0..19 and `case 20` never runs. The `case
   * 20` arm is where Release 8-2 put the **waist pouch** and **satchel**:
   *
   *     case 20:
   *         if (RollChance(75)) return MakeItemWaistPouch();
   *         else return MakeItemSatchel();
   *
   * So the bedroom is *not* a backpack site in the fork. That is the eighth backpack
   * location resolved: not by wiring it, but by measuring the roll and finding the arm
   * unreachable. Widening the roll to `roll(0, 21)` to "fix" it would invent a backpack
   * spawn the reference does not have, and the satchel and waist pouch get their real
   * producers from the sewers and the subway.
   *
   * The arm is transcribed anyway, with `default` still throwing: if the roll ever
   * widens, the case is there and correct rather than silently falling through.
   *
   * ## The one C# branch not ported
   *
   * `case 3` and `case 17` branch on `RogueGame.Options.IsSanityEnabled`, which the
   * port has no way to see -- the same divergence `makeLibraryBuilding` and
   * `makeShoppingMall` already document, and resolved the same way: take the option's
   * **default**, which is ON. So `case 3` is always `PillsSAN` and `case 17` is the
   * book/magazine pair rather than a large medikit.
   *
   * Note that this is the *opposite* choice from the port's old table, which put
   * `PillsSLP` at `case 3` and `PillsSAN` at `case 4` unconditionally. Taking the
   * default is not a no-op here; it swaps which pill a bedroom gives.
   *
   * ## The cost
   *
   * `roll(0, 24)` -> `roll(0, 20)` consumes the same one die but maps it to a different
   * item, and the four nested `rollChance` calls that survive the retune land on
   * different values. Every district containing a bedroom therefore diverges, which is
   * what moves the Classic fingerprints.
   */
  makeRandomBedroomItem(): Item {
    const randomItem = this.m_DiceRoller.roll(0, 20);

    switch (randomItem) {
      case 0:
      case 1:
        return this.makeItemSmallMedikit();
      case 2:
        return this.makeItemCandlesBox(); //@@MP
      case 3:
        //@MP - fixed crappy implem (Release 5-2). `IsSanityEnabled` is not portable; the
        // default is ON, so this is always SAN and never SLP. See the header.
        return this.makeItemPillsSAN();
      case 4:
        return this.makeItemTennisRacket(); //@@MP (Release 3)
      case 5:
        return this.makeItemIronGolfClub(); //@@MP (Release 3)
      case 6:
        return this.makeItemBaseballBat();
      case 7:
        return this.makeItemRandomPistol();
      case 8: // rare fire weapon
        // One `rollChance(50)`, not the port's `30` then `50`/`50` four-way. The fork
        // dropped the ammo arm entirely: a bedroom yields a gun or never.
        if (this.m_DiceRoller.rollChance(50)) {
          return this.makeItemShotgun();
        } else {
          return this.makeItemHuntingRifle();
        }
      case 9:
      case 10:
      case 11:
        return this.makeItemCellPhone();
      case 12:
        return this.makeItemFlashlight();
      case 13:
        return this.makeItemHockeyStick(); //@@MP (Release 3)
      case 14:
      case 15:
        return this.makeItemStenchKiller();
      case 16:
        return this.makeItemCigarettes(); //@@MP (Release 4)
      case 17:
        //@@MP - added check (Release 7-6). `IsSanityEnabled` again, same resolution.
        if (this.m_DiceRoller.rollChance(25)) {
          return this.makeItemBook();
        } else {
          return this.makeItemMagazines();
        }
      case 18:
        if (this.m_DiceRoller.rollChance(10)) {
          return this.makeItemNunchaku();
        } else {
          return this.makeItemHunterVest();
        }
      case 19:
        if (this.m_DiceRoller.rollChance(15)) {
          return this.makeItemFishingRod();
        } else {
          return this.makeItemBigFlashlight();
        }
      case 20:
        // **Unreachable.** `roll(0, 20)` is half-open. Transcribed, not fixed -- see
        // the header. This is where Release 8-2 put the waist pouch and the satchel.
        if (this.m_DiceRoller.rollChance(75)) {
          //@@MP (Release 8-2)
          return this.makeItemWaistPouch();
        } else {
          return this.makeItemSatchel();
        }
      default:
        throw new RangeError('unhandled roll');
    }
  }

  makeRandomKitchenItem(): Item {
    if (this.m_DiceRoller.rollChance(50)) {
      return this.makeItemCannedFood();
    } else {
      return this.makeItemGroceries();
    }
  }

  makeRandomCHAROfficeItem(): Item {
    const randomItem = this.m_DiceRoller.roll(0, 10);
    switch (randomItem) {
      case 0:
        // weapons:
        // - grenade (rare).
        // - shotgun/ammo
        if (this.m_DiceRoller.rollChance(10)) {
          // grenade!
          return this.makeItemGrenade();
        } else {
          // shotgun/ammo
          if (this.m_DiceRoller.rollChance(30)) {
            return this.makeItemShotgun();
          } else {
            return this.makeItemShotgunAmmo();
          }
        }
      case 1:
      case 2:
        if (this.m_DiceRoller.rollChance(50)) {
          return this.makeItemBandages();
        } else {
          return this.makeItemMedikit();
        }
      case 3:
        // Still Alive, Release 8-2: C# `:7761-7765` puts a daypack here behind a
        // 20% roll, with `MakeItemMatches` as the preserved `else`. The port's
        // `case 3` returns canned food with no roll at all, so the backpack needs
        // one inserted rather than re-routed — and the port's value is kept as the
        // `else` on both sides, because the C#'s matches and the port's canned food
        // are the same *slot* filled by different content, and only one of the two
        // is a backpack.
        //
        // The gate is ahead of the roll: `&&` short-circuits, so a Classic office
        // spends no die and the Classic district digest is untouched. See the
        // sewers maintenance building for the full argument.
        if (
          hasFeature(Session.get().ruleset, Feature.ShelterBackpacks) &&
          this.m_DiceRoller.rollChance(20)
        ) {
          return makeBackpack(ItemID.BACKPACK_DAYPACK)!;
        }
        return this.makeItemCannedFood();
      case 4: // rare tracker items
        if (this.m_DiceRoller.rollChance(50)) {
          if (this.m_DiceRoller.rollChance(50)) {
            return this.makeItemZTracker();
          } else {
            return this.makeItemBlackOpsGPS();
          }
        } else {
          return null!; // no tracker item
        }
      default:
        return null!; // 50% chance to find nothing.
    }
  }

  makeRandomParkItem(): Item {
    const randomItem = this.m_DiceRoller.roll(0, 8);
    switch (randomItem) {
      case 0:
        return this.makeItemSprayPaint();
      case 1:
        return this.makeItemBaseballBat();
      case 2:
        return this.makeItemPillsSLP();
      case 3:
        return this.makeItemPillsSTA();
      case 4:
        return this.makeItemPillsSAN();
      case 5:
        return this.makeItemFlashlight();
      case 6:
        return this.makeItemCellPhone();
      case 7:
        // Still Alive, Release 8-2: C# `:7825-7829` replaces this case outright with
        // a 75/25 waist pouch / satchel — there is no preserved `else`, so the
        // plank the port returns here is genuinely *replaced* under Still Alive
        // rather than kept as a fallback. The gate carries the difference: under
        // Classic the plank stands and no die is spent, under Still Alive the
        // reference's roll runs and the plank is gone.
        if (hasFeature(Session.get().ruleset, Feature.ShelterBackpacks)) {
          return this.m_DiceRoller.rollChance(75)
            ? makeBackpack(ItemID.BACKPACK_WAIST_POUCH)!
            : makeBackpack(ItemID.BACKPACK_SATCHEL)!;
        }
        return this.makeItemWoodenPlank();
      default:
        throw new RangeError('unhandled item roll');
    }
  }

  private static readonly POSTERS = [GameImages.DECO_POSTERS1, GameImages.DECO_POSTERS2];

  decorateOutsideWallsWithPosters(map: GameMap, rect: Rect, chancePerWall: number): void {
    this.decorateOutsideWalls(map, rect, (_x, _y) => {
      if (this.m_DiceRoller.rollChance(chancePerWall)) {
        return BaseTownGenerator.POSTERS[this.m_DiceRoller.roll(0, BaseTownGenerator.POSTERS.length)];
      } else {
        return null;
      }
    });
  }

  private static readonly TAGS = [
    GameImages.DECO_TAGS1,
    GameImages.DECO_TAGS2,
    GameImages.DECO_TAGS3,
    GameImages.DECO_TAGS4,
    GameImages.DECO_TAGS5,
    GameImages.DECO_TAGS6,
    GameImages.DECO_TAGS7,
  ];

  decorateOutsideWallsWithTags(map: GameMap, rect: Rect, chancePerWall: number): void {
    this.decorateOutsideWalls(map, rect, (_x, _y) => {
      if (this.m_DiceRoller.rollChance(chancePerWall)) {
        return BaseTownGenerator.TAGS[this.m_DiceRoller.roll(0, BaseTownGenerator.TAGS.length)];
      } else {
        return null;
      }
    });
  }

  populateCHAROfficeBuilding(map: GameMap, b: Block): void {
    //////////
    // Guards
    //////////
    for (let i = 0; i < MAX_CHAR_GUARDS_PER_OFFICE; i++) {
      const newGuard = this.createNewCHARGuard(0);
      this.actorPlace(
        this.m_DiceRoller,
        100,
        map,
        newGuard,
        b.insideRect.left,
        b.insideRect.top,
        b.insideRect.width,
        b.insideRect.height
      );
    }
  }

  // ── Special Locations ─────────────────────────────────────────────────────

  // ── House Basement ───────────────────────────────────────────────────────

  generateHouseBasementMap(map: GameMap, houseBlock: Block): GameMap {
    // make map.
    const rect = houseBlock.buildingRect;
    const seed = map.seed << (1 + rect.left * map.height + rect.top);
    const worldPos = this.params.district!.worldPosition;
    const basement = new GameMap(
      seed,
      `basement${worldPos.x}${worldPos.y}@${rect.left + Math.floor(rect.width / 2)}-${rect.top + Math.floor(rect.height / 2)}`,
      rect.width,
      rect.height
    );
    basement.lighting = Lighting.DARKNESS;
    basement.addZone(this.makeUniqueZone('basement', basement.rect));

    // enclose.
    this.tileFill(basement, Models.tiles.get(TileID.FLOOR_CONCRETE)!, (tile) => {
      tile.isInside = true;
    });
    this.tileRectangle(basement, Models.tiles.get(TileID.WALL_BRICK)!, new Rect(0, 0, basement.width, basement.height));

    // link to house with stairs.
    let surfaceStairs = new Point(0, 0);
    for (;;) {
      // roll.
      surfaceStairs = new Point(
        this.m_DiceRoller.roll(rect.left, rect.right),
        this.m_DiceRoller.roll(rect.top, rect.bottom)
      );

      // valid if walkable & no blocking object.
      // alpha10 and inside
      if (!map.getTileAt(surfaceStairs.x, surfaceStairs.y)!.model.isWalkable) continue;
      if (map.getMapObjectAt(surfaceStairs.x, surfaceStairs.y) !== null) continue;
      if (!map.getTileAt(surfaceStairs.x, surfaceStairs.y)!.isInside) continue;

      // good post.
      break;
    }
    const basementStairs = new Point(surfaceStairs.x - rect.left, surfaceStairs.y - rect.top);
    this.addExit(map, surfaceStairs, basement, basementStairs, GameImages.DECO_STAIRS_DOWN, true);
    this.addExit(basement, basementStairs, map, surfaceStairs, GameImages.DECO_STAIRS_UP, true);

    // random pilars/walls.
    this.doForEachTile(basement, basement.rect, (pt) => {
      if (!this.m_DiceRoller.rollChance(HOUSE_BASEMENT_PILAR_CHANCE)) return;
      if (pt.equals(basementStairs)) return;
      basement.setTileModelAt(pt.x, pt.y, Models.tiles.get(TileID.WALL_BRICK)!);
    });

    // fill with ome furniture/crap and items.
    this.mapObjectFill(basement, basement.rect, (pt) => {
      if (!this.m_DiceRoller.rollChance(HOUSE_BASEMENT_OBJECT_CHANCE_PER_TILE)) return null;

      if (basement.getExitAt(pt) !== null) return null;
      if (!basement.isWalkable(pt.x, pt.y)) return null;

      const roll = this.m_DiceRoller.roll(0, 5);
      switch (roll) {
        case 0: // junk
          return this.makeObjJunk(GameImages.OBJ_JUNK);
        case 1: // barrels.
          return this.makeObjBarrels(GameImages.OBJ_BARRELS);
        case 2: {
          // table with random item.
          const it = this.makeShopConstructionItem();
          basement.dropItemAt(it, pt);
          return this.makeObjTable(GameImages.OBJ_TABLE);
        }
        case 3: {
          // drawer with random item.
          const it = this.makeShopConstructionItem();
          basement.dropItemAt(it, pt);
          return this.makeObjDrawer(GameImages.OBJ_DRAWER);
        }
        case 4: // bed.
          return this.makeObjBed(GameImages.OBJ_BED);
        default:
          throw new RangeError('unhandled roll');
      }
    });

    // rats!
    if (Rules.hasZombiesInBasements(Session.get().gameMode)) {
      this.doForEachTile(basement, basement.rect, (pt) => {
        if (!basement.isWalkable(pt.x, pt.y)) return;
        if (basement.getExitAt(pt) !== null) return;

        if (this.m_DiceRoller.rollChance(SHOP_BASEMENT_ZOMBIE_RAT_CHANCE))
          basement.placeActor(this.createNewBasementRatZombie(0), pt);
      });
    }

    // weapons cache?
    if (this.m_DiceRoller.rollChance(HOUSE_BASEMENT_WEAPONS_CACHE_CHANCE)) {
      this.mapObjectPlaceInGoodPosition(
        basement,
        basement.rect,
        (pt) => {
          if (basement.getExitAt(pt) !== null) return false;
          if (!basement.isWalkable(pt.x, pt.y)) return false;
          if (basement.getMapObjectAt(pt.x, pt.y) !== null) return false;
          if (basement.getItemsAt(pt) !== null) return false;
          return true;
        },
        this.m_DiceRoller,
        (pt) => {
          // two grenades...
          basement.dropItemAt(this.makeItemGrenade(), pt);
          basement.dropItemAt(this.makeItemGrenade(), pt);

          // and a handfull of gunshop items.
          for (let i = 0; i < 5; i++) {
            const it = this.makeShopGunshopItem();
            basement.dropItemAt(it, pt);
          }

          // shelf.
          return this.makeObjShelf(GameImages.OBJ_SHOP_SHELF);
        }
      );
    }

    // alpha10
    // music.
    basement.bgMusic = GameMusics.SEWERS;

    // done.
    return basement;
  }

  // ── CHAR Underground Facility ────────────────────────────────────────────

  // alpha10 added entry pos
  generateUniqueMap_CHARUnderground(
    surfaceMap: GameMap,
    officeZone: Zone
  ): { map: GameMap; baseEntryPos: Point } {
    /////////////////////////
    // 1. Create basic secret map.
    // 2. Link to office.
    // 3. Create rooms.
    // 4. Furniture & Items.
    // 5. Posters & Blood.
    // 6. Populate.
    // 7. Add uniques.
    // alpha10
    // 8. Music
    /////////////////////////

    // 1. Create basic secret map.
    // huge map.
    const underground = new GameMap(
      (surfaceMap.seed << 3) ^ surfaceMap.seed,
      'CHAR Underground Facility',
      MAP_MAX_WIDTH,
      MAP_MAX_HEIGHT
    );
    underground.lighting = Lighting.DARKNESS;
    underground.isSecret = true;
    // fill & enclose.
    this.tileFill(underground, Models.tiles.get(TileID.FLOOR_OFFICE)!, (tile) => {
      tile.isInside = true;
    });
    this.tileRectangle(
      underground,
      Models.tiles.get(TileID.WALL_CHAR_OFFICE)!,
      new Rect(0, 0, underground.width, underground.height)
    );

    // 2. Link to office.
    // find surface point in office:
    // - in a random office room.
    // - set exit somewhere walkable inside.
    // - iron door, barricade the door.
    let roomZone: Zone | null = null;
    let surfaceExit = new Point(0, 0);
    for (;;) {
      // loop until found.
      // find a random room.
      do {
        const x = this.m_DiceRoller.roll(officeZone.bounds.left, officeZone.bounds.right);
        const y = this.m_DiceRoller.roll(officeZone.bounds.top, officeZone.bounds.bottom);
        const zonesHere = surfaceMap.getZonesAt(x, y);
        if (zonesHere.length === 0) continue;
        for (const z of zonesHere) {
          if (z.name.includes('room')) {
            roomZone = z;
            break;
          }
        }
      } while (roomZone === null);

      // find somewhere walkable inside.
      let foundSurfaceExit = false;
      let attempts = 0;
      do {
        surfaceExit = new Point(
          this.m_DiceRoller.roll(roomZone!.bounds.left, roomZone!.bounds.right),
          this.m_DiceRoller.roll(roomZone!.bounds.top, roomZone!.bounds.bottom)
        );
        foundSurfaceExit = surfaceMap.isWalkable(surfaceExit.x, surfaceExit.y);
        ++attempts;
      } while (attempts < 100 && !foundSurfaceExit);

      // failed?
      if (foundSurfaceExit === false) continue;

      // found everything, good!
      break;
    }

    // alpha10
    // remember position
    const baseEntryPos = surfaceExit;

    // barricade the rooms door.
    this.doForEachTile(surfaceMap, roomZone!.bounds, (pt) => {
      const existingDoor = surfaceMap.getMapObjectAt(pt.x, pt.y);
      if (!(existingDoor instanceof DoorWindow)) return;
      surfaceMap.removeMapObject(existingDoor);
      const door = this.makeObjIronDoor();
      door.barricadePoints = Rules.BARRICADING_MAX;
      this.mapObjectPlace(surfaceMap, pt.x, pt.y, door);
    });

    // stairs.
    // underground : in the middle of the map.
    const undergroundStairs = new Point(Math.floor(underground.width / 2), Math.floor(underground.height / 2));
    underground.addExit(undergroundStairs, new Exit(surfaceMap, surfaceExit));
    underground.getTileAt(undergroundStairs.x, undergroundStairs.y)!.addDecoration(GameImages.DECO_STAIRS_UP);
    surfaceMap.addExit(surfaceExit, new Exit(underground, undergroundStairs));
    surfaceMap.getTileAt(surfaceExit.x, surfaceExit.y)!.addDecoration(GameImages.DECO_STAIRS_DOWN);
    // floor logo.
    this.forEachAdjacent(underground, undergroundStairs.x, undergroundStairs.y, (pt) => {
      underground.getTileAt(pt.x, pt.y)!.addDecoration(GameImages.DECO_CHAR_FLOOR_LOGO);
    });

    // 3. Create floorplan & rooms.
    // make 4 quarters, splitted by a crossed corridor.
    const corridorHalfWidth = 1;
    const halfWidth = Math.floor(underground.width / 2);
    const halfHeight = Math.floor(underground.height / 2);
    const qTopLeft = new Rect(0, 0, halfWidth - corridorHalfWidth, halfHeight - corridorHalfWidth);
    const qTopRight = new Rect(halfWidth + 1 + corridorHalfWidth, 0, underground.width - (halfWidth + 1 + corridorHalfWidth), qTopLeft.bottom);
    const qBotLeft = new Rect(0, halfHeight + 1 + corridorHalfWidth, qTopLeft.right, underground.height - (halfHeight + 1 + corridorHalfWidth));
    const qBotRight = new Rect(qTopRight.left, qBotLeft.top, underground.width - qTopRight.left, underground.height - qBotLeft.top);

    // split all the map in rooms.
    const minRoomSize = 6;
    const roomsList: Rect[] = [];
    this.makeRoomsPlan(underground, roomsList, qBotLeft, minRoomSize, minRoomSize);
    this.makeRoomsPlan(underground, roomsList, qBotRight, minRoomSize, minRoomSize);
    this.makeRoomsPlan(underground, roomsList, qTopLeft, minRoomSize, minRoomSize);
    this.makeRoomsPlan(underground, roomsList, qTopRight, minRoomSize, minRoomSize);

    // make the rooms walls.
    for (const roomRect of roomsList) {
      this.tileRectangle(underground, Models.tiles.get(TileID.WALL_CHAR_OFFICE)!, roomRect);
    }

    // add room doors.
    // quarters have door side preferences to lead toward the central corridors.
    for (const roomRect of roomsList) {
      const westEastDoorPos =
        roomRect.left < halfWidth
          ? new Point(roomRect.right - 1, roomRect.top + Math.floor(roomRect.height / 2))
          : new Point(roomRect.left, roomRect.top + Math.floor(roomRect.height / 2));
      if (underground.getMapObjectAt(westEastDoorPos.x, westEastDoorPos.y) === null) {
        const door = this.makeObjCharDoor();
        this.placeDoorIfAccessibleAndNotAdjacent(
          underground,
          westEastDoorPos.x,
          westEastDoorPos.y,
          Models.tiles.get(TileID.FLOOR_OFFICE)!,
          6,
          door
        );
      }

      const northSouthDoorPos =
        roomRect.top < halfHeight
          ? new Point(roomRect.left + Math.floor(roomRect.width / 2), roomRect.bottom - 1)
          : new Point(roomRect.left + Math.floor(roomRect.width / 2), roomRect.top);
      if (underground.getMapObjectAt(northSouthDoorPos.x, northSouthDoorPos.y) === null) {
        const door = this.makeObjCharDoor();
        this.placeDoorIfAccessibleAndNotAdjacent(
          underground,
          northSouthDoorPos.x,
          northSouthDoorPos.y,
          Models.tiles.get(TileID.FLOOR_OFFICE)!,
          6,
          door
        );
      }
    }

    // add iron doors closing each corridor.
    for (let x = qTopLeft.right; x < qBotRight.left; x++) {
      this.placeDoor(underground, x, qTopLeft.bottom - 1, Models.tiles.get(TileID.FLOOR_OFFICE)!, this.makeObjIronDoor());
      this.placeDoor(underground, x, qBotLeft.top, Models.tiles.get(TileID.FLOOR_OFFICE)!, this.makeObjIronDoor());
    }
    for (let y = qTopLeft.bottom; y < qBotLeft.top; y++) {
      this.placeDoor(underground, qTopLeft.right - 1, y, Models.tiles.get(TileID.FLOOR_OFFICE)!, this.makeObjIronDoor());
      this.placeDoor(underground, qTopRight.left, y, Models.tiles.get(TileID.FLOOR_OFFICE)!, this.makeObjIronDoor());
    }

    // 4. Rooms, furniture & items.
    // furniture + items in rooms.
    // room roles with zones:
    // - corners room : Power Room.
    // - top left quarter : armory.
    // - top right quarter : storage.
    // - bottom left quarter : living.
    // - bottom right quarter : pharmacy.
    for (const roomRect of roomsList) {
      const insideRoomRect = new Rect(roomRect.left + 1, roomRect.top + 1, roomRect.width - 2, roomRect.height - 2);
      let roomName = '<noname>';

      // special room?
      // one power room in each corner.
      const isPowerRoom =
        (roomRect.left === 0 && roomRect.top === 0) ||
        (roomRect.left === 0 && roomRect.bottom === underground.height) ||
        (roomRect.right === underground.width && roomRect.top === 0) ||
        (roomRect.right === underground.width && roomRect.bottom === underground.height);
      if (isPowerRoom) {
        roomName = 'Power Room';
        this.makeCHARPowerRoom(underground, roomRect, insideRoomRect);
      } else {
        // common room.
        const roomRole =
          roomRect.left < halfWidth && roomRect.top < halfHeight
            ? 0
            : roomRect.left >= halfWidth && roomRect.top < halfHeight
              ? 1
              : roomRect.left < halfWidth && roomRect.top >= halfHeight
                ? 2
                : 3;
        // `//@@MP - a special new weapon. only 1 per game (Release 7-6)`. A local of
        // `GenerateUniqueMap_CHARUnderground` in the C# (`BaseTownGenerator.cs:8139`),
        // so it is a local here too and *not* a field: a field would make the gun
        // once-per-`BaseTownGenerator` rather than once-per-underground, which is a
        // different rule on a district with two.
        const placedBioForceGun = { value: false };

        switch (roomRole) {
          case 0: // armory room.
            roomName = 'Armory';
            this.makeCHARArmoryRoom(underground, insideRoomRect);
            break;
          case 1: // storage room.
            roomName = 'Storage';
            this.makeCHARStorageRoom(underground, insideRoomRect);
            break;
          case 2: // living room.
            // C# `:8357` has `MakeCHARLivingRoom` **commented out** and calls
            // `MakeCHARLabRoom(underground, insideRoomRect, ref placedBioForceGun)`
            // instead, with `roomName = "Lab"; //@@MP - more thematic (Release 3)`.
            // Both spellings of the C# are kept: the comment says why the arm is a
            // lab, and the variable keeps its C# name because that is what it was.
            roomName = 'Lab';
            this.makeCHARLabRoom(underground, insideRoomRect, placedBioForceGun);
            break;
          case 3: // pharmacy.
            roomName = 'Pharmacy';
            this.makeCHARPharmacyRoom(underground, insideRoomRect);
            break;
          default:
            throw new RangeError('unhandled role');
        }
      }

      underground.addZone(this.makeUniqueZone(roomName, insideRoomRect));
    }

    // 5. Posters & Blood.
    // char propaganda posters & blood almost everywhere.
    for (let x = 0; x < underground.width; x++)
      for (let y = 0; y < underground.height; y++) {
        // poster on wall?
        if (this.m_DiceRoller.rollChance(25)) {
          const tile = underground.getTileAt(x, y)!;
          if (tile.model.isWalkable) continue;
          tile.addDecoration(BaseTownGenerator.CHAR_POSTERS[this.m_DiceRoller.roll(0, BaseTownGenerator.CHAR_POSTERS.length)]);
        }

        // blood?
        if (this.m_DiceRoller.rollChance(20)) {
          const tile = underground.getTileAt(x, y)!;
          if (tile.model.isWalkable) tile.addDecoration(GameImages.DECO_BLOODIED_FLOOR);
          else tile.addDecoration(GameImages.DECO_BLOODIED_WALL);
        }
      }

    // 6. Populate.
    // don't block exits!
    // leveled up undeads!
    const nbZombies = underground.width; // 100 for 100.
    for (let i = 0; i < nbZombies; i++) {
      const undead = this.createNewUndead(0);
      for (;;) {
        const upID: ActorID = this.m_Game.NextUndeadEvolution(undead.model.id);
        if (upID === undead.model.id) break;
        undead.model = Models.actors.get(upID)!;
      }
      this.actorPlace(
        this.m_DiceRoller,
        underground.width * underground.height,
        underground,
        undead,
        (pt) => underground.getExitAt(pt) === null
      );
    }

    // CHAR scientists.
    //
    // Standing divergence, now fixed. This block was placing
    // `createNewCHARGuard` because `createNewCHARScientist` did not exist; the C# has
    // placed scientists here since Release 8-1 (`BaseTownGenerator.cs:8430-8436`).
    // Everything else in the block already matched the C# exactly — the same
    // `width / 10` count (10 for a 100-wide map), the same `underground` rect, the
    // same `width * height` placement area and the same "not on an exit" predicate
    // — so only the factory call changes.
    const nbScientists = Math.floor(underground.width / 10); // 10 for 100.
    for (let i = 0; i < nbScientists; i++) {
      const scientist = this.createNewCHARScientist(0);
      this.actorPlace(
        this.m_DiceRoller,
        underground.width * underground.height,
        underground,
        scientist,
        (pt) => underground.getExitAt(pt) === null
      );
    }

    // 7. Add uniques.
    // TODO...

    // alpha10
    // 8. Music
    underground.bgMusic = GameMusics.CHAR_UNDERGROUND_FACILITY;

    // done.
    return { map: underground, baseEntryPos };
  }

  makeCHARArmoryRoom(map: GameMap, roomRect: Rect): void {
    // Shelves with weapons/ammo along walls.
    this.mapObjectFill(map, roomRect, (pt) => {
      if (this.countAdjWalls(map, pt.x, pt.y) < 3) return null;
      // dont block exits!
      if (map.getExitAt(pt) !== null) return null;

      // table + tracker/armor/weapon.
      if (this.m_DiceRoller.rollChance(20)) {
        let it: Item | null = null;
        if (this.m_DiceRoller.rollChance(20)) {
          it = this.makeItemCHARLightBodyArmor();
        } else if (this.m_DiceRoller.rollChance(20)) {
          it = this.m_DiceRoller.rollChance(50) ? this.makeItemZTracker() : this.makeItemBlackOpsGPS();
        } else {
          // rare grenades.
          if (this.m_DiceRoller.rollChance(20)) {
            it = this.makeItemGrenade();
          } else {
            // weapon vs ammo.
            if (this.m_DiceRoller.rollChance(30)) {
              it = this.m_DiceRoller.rollChance(50) ? this.makeItemShotgun() : this.makeItemHuntingRifle();
            } else {
              it = this.m_DiceRoller.rollChance(50) ? this.makeItemShotgunAmmo() : this.makeItemLightRifleAmmo();
            }
          }
        }
        map.dropItemAt(it!, pt);

        return this.makeObjShelf(GameImages.OBJ_SHOP_SHELF);
      } else {
        return null;
      }
    });
  }

  /**
   * C# `MakeCHARStorageRoom(Map, Rectangle)` -- `BaseTownGenerator.cs:8508-8550`
   * (signature at `:8508`, closing brace at `:8550`, both verified by grep).
   *
   * The method itself is vanilla -- CHAR exists in Rogue Survivor proper -- but two
   * of its five arms are Still Alive, and both were missing here:
   *
   *  - `//@@MP (Release 7-6)` at `:8527`: a 3% **fire barrel** arm. An unlit, walkable,
   *    cookable barrel among the unlit drums, which is the whole point of it: the
   *    storage room is the one room in the base where you can cook.
   *  - `//@@MP - Resources Availability option (Release 7-4)` at `:8531` and again at
   *    `:8547`: the **canned food** the old `else` arm drops, and the gate on the
   *    construction-item loop.
   *
   * Four divergences found against the reference. Fixed three, left one on purpose:
   *
   * 1. **Fixed.** `rollChance(50)` -> `rollChance(47)` (`:8525`). See
   *    `CHAR_STORAGE_JUNK_CHANCE`.
   * 2. **Fixed.** The fire-barrel `else if` arm (`:8527-8528`), absent entirely.
   * 3. **Fixed.** The `else` arm, which was a bare `return null` where the C# drops
   *    canned food on a Resources Availability roll first (`:8531-8534`).
   * 4. **Fixed, and the premise corrected.** The construction-item loop is *not*
   *    something "the fork does not have" -- the C# has it at `:8539-8549`, this
   *    port had it too, and what was missing was its **gate**: the C# rolls
   *    `ResourcesAvailabilityToInt(Options.ResourcesAvailability)` per tile at
   *    `:8547` and the port dropped unconditionally. See the loop for why the fix is
   *    not simply "add the roll".
   *
   * ## Why this room cannot move the Classic district fingerprint
   *
   * `9bb5e4907bc3f62c` is a digest of one **surface district entry map**
   * (`tests/bank-building.test.ts:89-113`, `:599-614`). This method is reached only
   * from `generateUniqueMap_CHARUnderground`, which builds a *separate* secret map
   * stored as `uniqueMaps.charUndergroundFacility`
   * (`RogueGame.ts:31860-31871`). That runs from `GenerateWorld`
   * (`RogueGame.ts:30903-30912`), after the district loop that ends at `:30888`, so
   * no district is generated after this one and no district digest covers it.
   * `tests/char-storage-room.test.ts` proves that end to end by generating a real
   * Classic district and finding no `Storage` zone, no concrete floor and no fire
   * barrel on it.
   *
   * **What does change under Classic is this map, and it is worth being exact about
   * how much.** Taking `:8525`'s `47` instead of `50` is not a same-roll-different-
   * value edit. 47 places *fewer* junk-and-barrels objects than 50 does, which leaves
   * *more* tiles bare, which makes the construction loop below walk more tiles and
   * spend more dice there -- a cascade, not a single differing value. Measured at
   * seed 1 on a 32x32 room: 2185 rolls against the pre-change 2176. That is confined
   * to the underground map, which nothing downstream reads, and it is the cost of
   * matching the reference; but it is a cost, and this paragraph is where it lives
   * rather than in a test nobody reads.
   *
   * The two *gated* arms cost a Classic world nothing at all, and that is arranged
   * rather than lucky: `DiceRoller.rollChance` delegates to `roll`
   * (`DiceRoller.ts:40-42`) and spends a die even at 0%, so both readers short-circuit
   * on their feature flag *before* asking the roller. A still-alive-method-with-both-
   * features-off spends exactly what a 47%-only transcription spends, which is the
   * assertion that keeps the gating honest.
   *
   * ## Why none of this is behind `Feature.CHARResearchRaid` or `Feature.ArmyBase`
   *
   * Neither flag governs the CHAR underground, and the reference says so plainly:
   * `CreateUniqueMap_CHARUndegroundFacility` is called unconditionally at
   * `RogueGame.cs:4292`, with no `hasFeature` and no option, immediately after the
   * equally ungated `CreateUniqueMap_ArmyUndegroundBase` at `:4289`. In the port,
   * `Feature.ArmyBase` gates only the *surface* army office pass
   * (`makeArmyOffices`, `:2643`) and `Feature.CHARResearchRaid` gates only the day-21
   * raid event (`RogueGame.ts:7097`) -- neither is a gate on the underground map in
   * the C# or in the port, so inventing one here would be a divergence in the other
   * direction. The two flags that *do* belong to the lines changed are
   * `Feature.FireBarrels` and `Feature.ResourcesAvailability`, and both are applied
   * before the roll rather than after it.
   *
   * ## The six CHAR documents are **not** here
   *
   * Recorded here because this method is where they are usually expected. They are
   * not in `MakeCHARStorageRoom`: the reference's only `placedCHARdocument` latch is
   * in `MakeCHARLabRoom` (`BaseTownGenerator.cs:8552-8659` -- latch declared at
   * `:8554`, tested at `:8606`, set at `:8634`, the `Roll(0, 5)` at `:8609` and the
   * six `new Item(...) { IsUnique = true, IsForbiddenToAI = true }` at `:8612-8629`),
   * and `MakeCHARLabRoom` replaces the *living* room, not the storage room: the C#'s
   * room-role 2 branch is commented out at `:8356-8357` and calls
   * `MakeCHARLabRoom` at `:8359` with `ref placedBioForceGun`.
   *
   * The port has no `makeCHARLabRoom` at all -- `:5080` still calls
   * `makeCHARLivingRoom`, the method the C# marks `//@@MP - no longer used
   * (Release 3)` at `:8661`. Porting the lab room needs `MakeObjCHARvat`
   * (`BaseMapGenerator.cs:803`), `MakeObjWorkstation` (`:811`) and
   * `MakeObjCHARtrolley` (`:1290`) plus `GameImages.OBJ_CHAR_VAT`,
   * `OBJ_CHAR_DESKTOP` and `OBJ_CHAR_TROLLEY` (`GameImages.cs:673-675`), none of
   * which exist in the port. Until that lands, `UNIQUE_CHAR_DOCUMENT1..6` stay
   * registered and unplaced, which is where they were before this change.
   */
  makeCHARStorageRoom(map: GameMap, roomRect: Rect): void {
    const fireBarrels = hasFeature(Session.get().ruleset, Feature.FireBarrels);
    // C# `:8531` and `:8547`, both `//@@MP - Resources Availability option
    // (Release 7-4)`. `GameOptions.resourcesAvailabilityToInt` is 33/54/75 for
    // LOW/MED/HIGH (`GameOptions.ts:1524-1535`); the default option is MED, so the
    // C#'s own default world drops construction items on 54% of the bare tiles.
    //
    // `resourcesAvailable` is the gate and `resourcesChance` is only ever *rolled*
    // behind it, because `DiceRoller.rollChance` delegates to `roll`
    // (`DiceRoller.ts:40-42`) and therefore spends a die even at 0%. Both readers
    // below short-circuit on the flag rather than rolling a sentinel 0, so a
    // Classic room spends no die on either Resources Availability arm.
    const resourcesAvailable = hasFeature(Session.get().ruleset, Feature.ResourcesAvailability);
    const resourcesChance = resourcesAvailable
      ? GameOptions.resourcesAvailabilityToInt(Options.resourcesAvailability)
      : 0;

    // Replace floor with concrete.
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_CONCRETE)!, roomRect);

    // Objects.
    // Barrels & Junk in the middle of the room.
    this.mapObjectFill(map, roomRect, (pt) => {
      if (this.countAdjWalls(map, pt.x, pt.y) > 0) return null;
      // dont block exits!
      if (map.getExitAt(pt) !== null) return null;

      // barrels/junk? C# `:8525-8526`.
      if (this.m_DiceRoller.rollChance(CHAR_STORAGE_JUNK_CHANCE))
        return this.m_DiceRoller.rollChance(50)
          ? this.makeObjJunk(GameImages.OBJ_JUNK)
          : this.makeObjBarrels(GameImages.OBJ_BARRELS);
      // C# `:8527-8528`. The `else if` matters: a fire barrel is *not* junk or
      // barrels, and the C# asks for it on a tile that has already failed the 47%.
      if (fireBarrels && this.m_DiceRoller.rollChance(CHAR_STORAGE_FIRE_BARREL_CHANCE))
        return this.makeObjFireBarrel(GameImages.OBJ_EMPTY_BARREL);
      // C# `:8530-8534`. The old arm was `else return null`, which is the `else` of
      // a room that had nothing left to offer; the C# puts canned food on the floor
      // of the same tiles the barrels would have gone on.
      if (resourcesAvailable && this.m_DiceRoller.rollChance(resourcesChance))
        map.dropItemAt(this.makeItemCannedFood(), pt);
      return null;
    });

    // Items.
    // Construction items in this mess.
    for (let x = roomRect.left; x < roomRect.right; x++)
      for (let y = roomRect.top; y < roomRect.bottom; y++) {
        if (this.countAdjWalls(map, x, y) > 0) continue;
        if (map.getMapObjectAt(x, y) !== null) continue;

        // C# `:8547-8548`. **The gate the port was missing** -- and the one place
        // here where "fix the divergence" is not the same as "add the roll".
        //
        // The C# rolls per tile and drops on a pass. Vanilla had no Resources
        // Availability option at all, so its loop was unconditional, and that is
        // what this port has been generating: a construction item on *every* bare
        // floor tile of every Classic CHAR storage room. Gating the roll alone would
        // leave Classic dropping nothing, which is a far bigger change than the
        // three-point junk-density shift above and is not what either ruleset wants.
        // So the Classic branch keeps the unconditional drop and spends no die, and
        // the Still Alive branch is the C#'s roll.
        if (!resourcesAvailable || this.m_DiceRoller.rollChance(resourcesChance))
          map.dropItemAt(this.makeShopConstructionItem(), new Point(x, y));
      }
  }

  /**
   * One CHAR document, or `null` — the sixth of six, the C#'s `Roll(0, 5)` and
   * its six cases.
   *
   * Still Alive, Release 3. C# `MakeCHARLabRoom:8606-8634` — **the lab room, not
   * the storage room**, which is what two comments in this port got wrong before
   * this one: the storage room is where the port's *floor* comes from, and the
   * document latch is a floor-space `else` arm in the lab room that replaced the
   * living room.
   *
   * So this is deliberately a bare function and not a call from anywhere. The lab
   * room is the C#'s replacement for the CHAR living room (`//@@MP - added labs to
   * replace CHAR living rooms`), and the port has a living room and no lab, so
   * there is no site to attach it to. Putting the documents in the *storage* room
   * would be inventing a placement the reference does not have; leaving the roll
   * as prose leaves the one piece that can be transcribed untested. This is the
   * middle: the roll and the six models are real and exercised, and the room that
   * calls it is a one-line change when it lands.
   *
   * ## `UNIQUE_CHAR_DOCUMENT6` never appears
   *
   * The C# rolls `Roll(0, 5)` and switches six ways. **`roll(0, 5)` is half-open**
   * — `min + floor(next() * (max - min))` — so it yields 0..4 and `case 5` is
   * unreachable. Release 3 added six documents and rolled five. The same shape as
   * the bedroom's backpack (`MakeRandomBedroomItem`'s `case 20` under
   * `Roll(0, 20)`), and the same decision: the port plays five and says so
   * rather than widening the bound and being *more correct than the reference*.
   *
   * `IsUnique` and `IsForbiddenToAI` are set per drop rather than on the models,
   * because that is where the C# sets them: a unique item is one that will not
   * spawn twice rather than a kind of item, and all six models draw the same
   * sprite, so a model-level flag would make all six mutually exclusive.
   */
  makeCHARDocument(): Item {
    const roll = this.m_DiceRoller.roll(0, 5);
    let modelId: ItemID;
    switch (roll) {
      case 0:
        modelId = ItemID.UNIQUE_CHAR_DOCUMENT1;
        break;
      case 1:
        modelId = ItemID.UNIQUE_CHAR_DOCUMENT2;
        break;
      case 2:
        modelId = ItemID.UNIQUE_CHAR_DOCUMENT3;
        break;
      case 3:
        modelId = ItemID.UNIQUE_CHAR_DOCUMENT4;
        break;
      case 4:
        modelId = ItemID.UNIQUE_CHAR_DOCUMENT5;
        break;
      default:
        // Unreachable for `roll(0, 5)`, and kept because the C# keeps its
        // `InvalidOperationException` -- a `switch` over a number with no
        // `default` is a silent fallthrough, which is the failure this whole
        // repo's silent-failure rule exists to prevent.
        throw new RangeError('unhandled roll');
    }
    const it = new Item(Models.items.get(modelId));
    it.isUnique = true;
    it.isForbiddenToAI = true;
    return it;
  }

  /**
   * C# `MakeCHARLabRoom` — `BaseTownGenerator.cs:8552` (Release 3).
   *
   * Replaces the living room, and the C# says so in the dispatch itself: `case 2` at
   * `:8357` has `MakeCHARLivingRoom` **commented out** and calls this instead, with
   * `roomName = "Lab" //@@MP - more thematic`. So there is no living room to port and
   * no substitution to choose between — this port was generating a room the fork
   * deleted.
   *
   * The two halves are the C#'s:
   *
   * 1. `MapObjectFill` over the wall tiles (`CountAdjWalls >= 3`): 50% something, then
   *    75% a vat and else a workstation. A vat is a bare unbreakable `MapObject` —
   *    the C# sets nothing but `IsMaterialTransparent`.
   * 2. `MapObjectFill` over the bare middle tiles (`CountAdjWalls == 0`): 30% furniture,
   *    and in the *else* the room's one `UNIQUE_CHAR_DOCUMENT`.
   *
   * **Two C# quirks kept.**
   *
   * The document roll is `Roll(0, 5)` and the switch runs to `case 5`, so
   * `UNIQUE_CHAR_DOCUMENT6` is unreachable — the same off-by-one
   * `makeCHARDocument` already documents, and it is not widened here either.
   *
   * The floor logo decoration is *commented out* in the C# (`TileFill(...//,
   * (tile, model, x, y) => tile.AddDecoration(GameImages.DECO_CHAR_FLOOR_LOGO))`), so
   * the lab is plain `FLOOR_TILES` where the living room draws the logo. Left
   * uncommented: a commented line is not a description of a released build.
   *
   * `placedBioForceGun` is the C#'s `ref bool` and stays a `ref`: it is one gun per
   * *game*, not per room, so it cannot be a field of this class without saying so.
   */
  /**
   * C# `GenerateUniqueMap_ArmyBase` — `BaseTownGenerator.cs:10711` (Release 6-3).
   *
   * The army base underground: a 4-quarter floorplan split by a crossed corridor,
   * with one of each room type per quarter and a power room in every corner.
   *
   * ## What is faithful here and what is not
   *
   * The **structure** is the C#'s throughout: the `(surfaceMap.Seed << 3) ^
   * surfaceMap.Seed` map seed, `Lighting.DARKNESS`, `IsSecret`, the four quarters at
   * `corridorHalfWidth = 1`, `minRoomSize = 6`, the iron doors closing both corridors,
   * the corner test for power rooms, the role dispatch by quarter, the 25%/10% blood
   * and 25% poster per tile, and `nbZombies = underground.Width`.
   *
   * The **surface link** takes the `Zone officeZone` as a parameter, as the C# does
   * (`:10712`), and the caller is `RogueGame.CreateUniqueMap_ArmyUndegroundBase` —
   * which rolls for the district *and then* for the office inside it. That second roll
   * is the reason the zone is a parameter and not something found here: a green
   * district with three army offices is three times as likely to be chosen, and
   * finding "the first army office" inside the generator would throw that away.
   *
   * The C#'s abandoned name-based search (`z.Name.Contains("room")`, commented out at
   * `:10747-10764`) is why the caller searches on `IS_ARMY_OFFICE` instead. The loop
   * that finds a walkable tile keeps the C#'s shape: up to 100 attempts, and an outer
   * retry that never actually retries because the C#'s `continue` has nothing to
   * change.
   *
   * Returns `null` when it cannot find a walkable tile inside the office after the
   * C#'s 100 attempts — the failure `RogueGame.cs:4290` reports as "the army base
   * couldn't be generated for some reason".
   */
  createUniqueMap_ArmyBase(
    surfaceMap: GameMap,
    officeZone: Zone,
    mapSize: number
  ): { map: GameMap; baseEntryPos: Point } | null {
    /////////////////////////
    // 1. Create basic secret map.
    //////////////////////###
    // huge map.
    // `GameMap`, not `Map`: bare `Map` in this file is TypeScript's built-in, and the
    // C#'s `new Map(...)` is the game's. The alias is imported at the top of the file
    // and the shadowing is the whole reason this line has a comment on it.
    const underground = new GameMap(
      ((surfaceMap.seed << 3) ^ surfaceMap.seed) >>> 0,
      'Army Base',
      mapSize,
      mapSize
    );
    underground.lighting = Lighting.DARKNESS;
    underground.isSecret = true;
    // fill & enclose.
    this.tileFill(underground, Models.tiles.get(TileID.FLOOR_ARMY)!, (tile) => {
      tile.isInside = true;
    });
    this.tileRectangle(
      underground,
      Models.tiles.get(TileID.WALL_ARMY_BASE)!,
      new Rect(0, 0, underground.width, underground.height)
    );

    /////////////////////////
    // 2. Link to above ground office.
    /////////////////////////
    // find somewhere walkable inside.
    let surfaceExit = new Point(0, 0);
    let foundSurfaceExit = false;
    let attempts = 0;
    do {
      surfaceExit = new Point(
        this.m_DiceRoller.roll(officeZone.bounds.left, officeZone.bounds.right),
        this.m_DiceRoller.roll(officeZone.bounds.top, officeZone.bounds.bottom)
      );
      foundSurfaceExit = surfaceMap.isWalkable(surfaceExit.x, surfaceExit.y);
      attempts++;
    } while (attempts < 100 && !foundSurfaceExit);

    if (!foundSurfaceExit) return null;

    const baseEntryPos = surfaceExit;

    // stairs.
    // underground : in the middle of the map.
    const undergroundStairs = new Point(
      Math.floor(underground.width / 2),
      Math.floor(underground.height / 2)
    );
    underground.addExit(undergroundStairs, new Exit(surfaceMap, surfaceExit));
    underground
      .getTileAt(undergroundStairs.x, undergroundStairs.y)
      ?.addDecoration(GameImages.DECO_STAIRS_UP);
    surfaceMap.addExit(surfaceExit, new Exit(underground, undergroundStairs));
    surfaceMap
      .getTileAt(surfaceExit.x, surfaceExit.y)
      ?.addDecoration(GameImages.DECO_STAIRS_DOWN);
    // floor logo.
    this.forEachAdjacent(underground, undergroundStairs.x, undergroundStairs.y, (pt) =>
      underground.getTileAt(pt.x, pt.y)?.addDecoration(GameImages.DECO_ARMY_FLOOR_LOGO)
    );

    /////////////////////////
    // 3. Create floorplan & rooms.
    /////////////////////////
    // make 4 quarters, splitted by a crossed corridor.
    const corridorHalfWidth = 1;
    const qTopLeft = new Rect(0, 0, Math.floor(underground.width / 2) - corridorHalfWidth, Math.floor(underground.height / 2) - corridorHalfWidth);
    const qTopRight = new Rect(
      Math.floor(underground.width / 2) + 1 + corridorHalfWidth,
      0,
      underground.width,
      qTopLeft.bottom
    );
    const qBotLeft = new Rect(
      0,
      Math.floor(underground.height / 2) + 1 + corridorHalfWidth,
      qTopLeft.right,
      underground.height
    );
    const qBotRight = new Rect(qTopRight.left, qBotLeft.top, underground.width, underground.height);

    // split all the map in rooms.
    const minRoomSize = 6;
    const roomsList: Rect[] = [];
    this.makeRoomsPlan(underground, roomsList, qBotLeft, minRoomSize, minRoomSize);
    this.makeRoomsPlan(underground, roomsList, qBotRight, minRoomSize, minRoomSize);
    this.makeRoomsPlan(underground, roomsList, qTopLeft, minRoomSize, minRoomSize);
    this.makeRoomsPlan(underground, roomsList, qTopRight, minRoomSize, minRoomSize);

    // make the rooms walls.
    for (const roomRect of roomsList) {
      this.tileRectangle(underground, Models.tiles.get(TileID.WALL_ARMY_BASE)!, roomRect);
    }

    // add room doors.
    // quarters have door side preferences to lead toward the central corridors.
    for (const roomRect of roomsList) {
      const westEastDoorPos =
        roomRect.left < underground.width / 2
          ? new Point(roomRect.right - 1, roomRect.top + Math.floor(roomRect.height / 2))
          : new Point(roomRect.left, roomRect.top + Math.floor(roomRect.height / 2));
      if (underground.getMapObjectAt(westEastDoorPos.x, westEastDoorPos.y) === null) {
        this.placeDoorIfAccessibleAndNotAdjacent(
          underground,
          westEastDoorPos.x,
          westEastDoorPos.y,
          Models.tiles.get(TileID.FLOOR_ARMY)!,
          6,
          this.makeObjIronDoor()
        );
      }

      const northSouthDoorPos =
        roomRect.top < underground.height / 2
          ? new Point(roomRect.left + Math.floor(roomRect.width / 2), roomRect.bottom - 1)
          : new Point(roomRect.left + Math.floor(roomRect.width / 2), roomRect.top);
      if (underground.getMapObjectAt(northSouthDoorPos.x, northSouthDoorPos.y) === null) {
        this.placeDoorIfAccessibleAndNotAdjacent(
          underground,
          northSouthDoorPos.x,
          northSouthDoorPos.y,
          Models.tiles.get(TileID.FLOOR_ARMY)!,
          6,
          this.makeObjIronDoor()
        );
      }
    }

    // add iron doors closing each corridor.
    for (let x = qTopLeft.right; x < qBotRight.left; x++) {
      this.placeDoor(underground, x, qTopLeft.bottom - 1, Models.tiles.get(TileID.FLOOR_ARMY)!, this.makeObjIronDoor());
      this.placeDoor(underground, x, qBotLeft.top, Models.tiles.get(TileID.FLOOR_ARMY)!, this.makeObjIronDoor());
    }
    for (let y = qTopLeft.bottom; y < qBotLeft.top; y++) {
      this.placeDoor(underground, qTopLeft.right - 1, y, Models.tiles.get(TileID.FLOOR_ARMY)!, this.makeObjIronDoor());
      this.placeDoor(underground, qTopRight.left, y, Models.tiles.get(TileID.FLOOR_ARMY)!, this.makeObjIronDoor());
    }

    /////////////////////////
    // 4. Rooms, furniture & items.
    /////////////////////////
    // - corners room : Power Room.
    // - top left quarter : armory.
    // - top right quarter : command.
    // - bottom left quarter : living.
    // - bottom right quarter : pharmacy or storage.
    for (const roomRect of roomsList) {
      const insideRoomRect = new Rect(
        roomRect.left + 1,
        roomRect.top + 1,
        roomRect.width - 2,
        roomRect.height - 2
      );
      let roomName = '<noname>';

      // special room?
      // one power room in each corner.
      const isPowerRoom =
        (roomRect.left === 0 && roomRect.top === 0) ||
        (roomRect.left === 0 && roomRect.bottom === underground.height) ||
        (roomRect.right === underground.width && roomRect.top === 0) ||
        (roomRect.right === underground.width && roomRect.bottom === underground.height);
      if (isPowerRoom) {
        roomName = 'Power Room';
        this.makeArmyPowerRoom(underground, roomRect, insideRoomRect);
      } else {
        // common room.
        const roomRole =
          roomRect.left < underground.width / 2 && roomRect.top < underground.height / 2
            ? 0
            : roomRect.left >= underground.width / 2 && roomRect.top < underground.height / 2
              ? 1
              : roomRect.left < underground.width / 2 && roomRect.top >= underground.height / 2
                ? 2
                : 3;
        switch (roomRole) {
          case 0: // armory room.
            roomName = 'Armory';
            this.makeArmyArmoryRoom(underground, insideRoomRect);
            break;
          case 1: // command room
            roomName = 'Command';
            this.makeArmyCommandRoom(underground, insideRoomRect);
            break;
          case 2: // living room.
            roomName = 'Living';
            this.makeArmyRecRoom(underground, insideRoomRect);
            break;
          case 3: // pharmacy or storage room.
            if (this.m_DiceRoller.rollChance(50)) {
              roomName = 'Storage';
              this.makeArmyStorageRoom(underground, insideRoomRect);
              break;
            }
            roomName = 'Pharmacy';
            this.makeArmyPharmacyRoom(underground, insideRoomRect);
            break;
          default:
            throw new RangeError('unhandled role');
        }
      }

      underground.addZone(this.makeUniqueZone(roomName, insideRoomRect));
    }

    /////////////////////////
    // 5. Posters & Blood.
    /////////////////////////
    // army posters & blood almost everywhere.
    for (let x = 0; x < underground.width; x++) {
      for (let y = 0; y < underground.height; y++) {
        // poster on wall?
        if (this.m_DiceRoller.rollChance(25)) {
          const tile = underground.getTileAt(x, y);
          if (tile === null || tile.model.isWalkable) continue;
          tile.addDecoration(ARMY_POSTERS[this.m_DiceRoller.roll(0, ARMY_POSTERS.length)]!);
        }

        // large blood?  `//@@MP - was 20 (Release 3)`
        if (this.m_DiceRoller.rollChance(10)) {
          const tile = underground.getTileAt(x, y);
          if (tile === null) continue;
          tile.addDecoration(
            tile.model.isWalkable ? GameImages.DECO_BLOODIED_FLOOR : GameImages.DECO_BLOODIED_WALL
          );
        } else if (this.m_DiceRoller.rollChance(20)) {
          // small blood? //@@MP (Release 3)
          const tile = underground.getTileAt(x, y);
          if (tile === null) continue;
          tile.addDecoration(
            tile.model.isWalkable
              ? GameImages.DECO_BLOODIED_FLOOR_SMALL
              : GameImages.DECO_BLOODIED_WALL_SMALL
          );
        }
      }
    }

    /////////////////////////
    // 6. Populate.
    /////////////////////////
    // leveled up undeads!
    const nbZombies = underground.width; // 100 for 100.
    for (let i = 0; i < nbZombies; i++) {
      const undead = this.createNewUndead(0);
      for (;;) {
        const upID: ActorID = this.m_Game.NextUndeadEvolution(undead.model.id);
        if (upID === undead.model.id) break;
        undead.model = Models.actors.get(upID)!;
      }
      this.actorPlace(
        this.m_DiceRoller,
        underground.width * underground.height,
        underground,
        undead,
        (pt) => underground.getExitAt(pt) === null // don't block exits!
      );
    }

    /////////////////////////
    // 7. Add uniques.
    /////////////////////////
    // Empty in the C#, and the C# says why: "looks like RoguedJack had some plans for
    // a boss or special items for the CHAR underground that the army base is copied
    // from". The block is kept as a comment rather than deleted, because that note is
    // the reason this map is shaped the way it is.

    /////////////////////////
    // 8. Music.   // alpha10
    /////////////////////////
    // The C# assigns `CHAR_UNDERGROUND_FACILITY` here, not the army track, because the
    // base was copied from the CHAR facility. Kept: a track that fits better is not
    // the track the game plays.
    underground.bgMusic = GameMusics.CHAR_UNDERGROUND_FACILITY;

    return { map: underground, baseEntryPos };
  }


    /**
   * C# `MakeArmyCommandRoom` — `BaseTownGenerator.cs:11155`.
   *
   * Two `MapObjectFill` passes: radios and computer stations along the walls
   * (`CountAdjWalls >= 3`, 66% something), tables and more stations in the middle.
   *
   * The Black Ops GPS is `//@@MP - moved from the armory (Release 7-6)`: the fork took
   * it *out* of the armory's 34-way roll and put it here at a flat 10%, and both
   * changes are visible here and absent from `makeArmyArmoryRoom` respectively.
   *
   * `DECO_ARMY_FLOOR_LOGO` is commented out on the floor line, so the room is plain
   * `FLOOR_ARMY` — the same "a commented line is not a description of a release"
   * reading applied to the CHAR lab.
   */
  makeArmyCommandRoom(map: GameMap, roomRect: Rect): void {
    // Replace floor with tiles with painted logo.
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_ARMY)!, roomRect);

    // Objects.
    // radios along walls.
    this.mapObjectFill(map, roomRect, (pt) => {
      if (this.countAdjWalls(map, pt.x, pt.y) < 3) return null;
      // dont block exits!
      if (map.getExitAt(pt) !== null) return null;

      // computer/radio?
      if (this.m_DiceRoller.rollChance(66)) {
        if (this.m_DiceRoller.rollChance(25)) {
          return this.makeObjWorkstation(GameImages.OBJ_ARMY_COMPUTER_STATION);
        }
        if (this.m_DiceRoller.rollChance(10)) {
          map.dropItemAt(this.makeItemBlackOpsGPS(), pt); //@@MP - moved from the armory (Release 7-6)
        }
        return this.makeObjArmyRadioCupboard(GameImages.OBJ_ARMY_RADIO_CUPBOARD);
      }
      return null;
    });

    // desktops and tables in the middle of the room
    this.mapObjectFill(map, roomRect, (pt) => {
      if (this.countAdjWalls(map, pt.x, pt.y) > 0) return null;
      if (map.getExitAt(pt) !== null) return null;

      // tables/chairs.
      if (this.m_DiceRoller.rollChance(25)) {
        if (this.m_DiceRoller.rollChance(75)) {
          return this.makeObjWorkstation(GameImages.OBJ_ARMY_COMPUTER_STATION);
        }
        return this.makeObjTable(GameImages.OBJ_ARMY_TABLE);
      }
      return null;
    });
  }

  /**
   * C# `MakeArmyRecRoom` — `:11209`. **The eighth-and-last backpack site.**
   *
   * Beds and footlockers along the walls, tables and chairs in the middle. The
   * rucksack sits in the bed arm at `ResourcesAvailability / 3` — and *this* room
   * divides, where `makeArmyArmoryRoom`'s `armorChance` does not:
   *
   * ```
   * int rucksackChance = GameOptions.ResourcesAvailabilityToInt(...);
   * rucksackChance = (int)rucksackChance / 3;
   * ```
   *
   * The CHAR lab has the identical shape with its `armorChance / 3` line **commented
   * out** (`BaseTownGenerator.cs:8600`). Both are transcribed as written: this one
   * divides, the lab does not. At the default MED option that is 54/3 = 18% against
   * the lab's 54%, which is a visible difference between two rooms whose C# looks
   * almost identical.
   */
  makeArmyRecRoom(map: GameMap, roomRect: Rect): void {
    // Replace floor with tiles with painted logo.
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_ARMY)!, roomRect);

    // Objects.
    // Beds/Footlockers along walls.
    this.mapObjectFill(map, roomRect, (pt) => {
      if (this.countAdjWalls(map, pt.x, pt.y) < 3) return null;
      if (map.getExitAt(pt) !== null) return null;

      // bed/fridge?
      if (this.m_DiceRoller.rollChance(50)) {
        if (this.m_DiceRoller.rollChance(50)) {
          let rucksackChance = this.armyResourcesChance();
          rucksackChance = Math.floor(rucksackChance / 3);
          if (this.m_DiceRoller.rollChance(rucksackChance)) {
            map.dropItemAt(this.makeItemArmyRucksack(), pt); //@@MP - added (Release 8-2)
          }
          return this.makeObjBed(GameImages.OBJ_ARMY_BUNK_BED);
        }
        return this.makeObjArmyFootlocker(GameImages.OBJ_ARMY_FOOTLOCKER);
      }
      return null;
    });

    // Tables(with canned food) & Chairs in the middle.
    const resourcesChance = this.armyResourcesChance();
    this.mapObjectFill(map, roomRect, (pt) => {
      if (this.countAdjWalls(map, pt.x, pt.y) > 0) return null;
      if (map.getExitAt(pt) !== null) return null;

      // tables/chairs.
      if (this.m_DiceRoller.rollChance(30)) {
        if (this.m_DiceRoller.rollChance(30)) {
          //@@MP - Resources Availability option (Release 7-4)
          if (this.m_DiceRoller.rollChance(resourcesChance)) {
            map.dropItemAt(this.makeItemCannedFood(), pt);
          }
          return this.makeObjTable(GameImages.OBJ_ARMY_TABLE);
        }
        return this.makeObjChair(GameImages.OBJ_HOSPITAL_CHAIR);
      }
      return null;
    });
  }

  /**
   * C# `MakeArmyPowerRoom` — `:11296`.
   *
   * The only one of the six taking **two** rectangles: `wallsRect` for the door signs
   * and `roomRect` for the generators. Both C# call sites pass `roomRect` for both
   * (`//@@MP - unused parameter (Release 5-7)` on both), so in practice the walls pass
   * runs over the interior and finds no doors and does nothing.
   *
   * **That is kept.** Collapsing to one rectangle would be a tidy-up that changes what
   * the method does the moment a caller does pass a real `wallsRect`, and the C#'s
   * comment is the only evidence anyone ever will.
   */
  makeArmyPowerRoom(map: GameMap, wallsRect: Rect, roomRect: Rect): void {
    // Replace floor with concrete.
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_CONCRETE)!, roomRect);

    // add deco power sign next to doors.
    this.doForEachTile(map, wallsRect, (pt) => {
      if (!(map.getMapObjectAt(pt.x, pt.y) instanceof DoorWindow)) return;
      this.doForEachAdjacentInMap(map, pt, (ptAdj) => {
        const tile = map.getTileAt(ptAdj.x, ptAdj.y);
        if (tile === null || tile.model.isWalkable) return;
        tile.removeAllDecorations();
        tile.addDecoration(GameImages.DECO_POWER_SIGN_BIG);
      });
    });

    // add power generators along walls.
    this.doForEachTile(map, roomRect, (pt) => {
      const tile = map.getTileAt(pt.x, pt.y);
      if (tile === null || !tile.model.isWalkable) return;
      if (map.getExitAt(pt) !== null) return;
      if (this.countAdjWalls(map, pt.x, pt.y) < 3) return;

      this.mapObjectPlace(
        map,
        pt.x,
        pt.y,
        this.makeObjPowerGenerator(GameImages.OBJ_POWERGEN_OFF, GameImages.OBJ_POWERGEN_ON)
      );
    });
  }

  /**
   * C# `MakeArmyArmoryRoom` — `BaseTownGenerator.cs:11018`.
   *
   * One `MapObjectFill` over the wall tiles, each getting a shop shelf and, behind
   * `Feature.ResourcesAvailability`, an item off a 34-way roll.
   *
   * **The 34-way roll keeps two `default:` arms as content.** `case 30-31` is the
   * minigun *the first time only* and `case 32-33` the grenade launcher likewise —
   * `//@@MP - only one per game (Release 7-6)`. Both flags are method locals in the C#
   * and are locals here, so a second armory in the same base would get ammo for the
   * second minigun. A class field would have made them once per district.
   *
   * `case 25` is C4, which the C# spells `MakeItemC4Explosive`.
   */
  makeArmyArmoryRoom(map: GameMap, roomRect: Rect): void {
    //@@MP - only one per game (Release 7-6)
    let minigunSpawned = false;
    let grenadelauncherSpawned = false;

    const resourcesChance = this.armyResourcesChance();

    // Shelves with weapons/ammo along walls.
    this.mapObjectFill(map, roomRect, (pt) => {
      if (this.countAdjWalls(map, pt.x, pt.y) < 2) return null;
      // don't block doors
      if (this.isADoorNSEW(map, pt.x, pt.y)) return null; //@@MP (Release 7-6)
      // dont block exits!
      if (map.getExitAt(pt) !== null) return null;

      // table + tracker/armor/weapon.
      if (this.m_DiceRoller.rollChance(resourcesChance)) {
        const randomItem = this.m_DiceRoller.roll(0, 34);
        let it: Item;
        switch (randomItem) {
          case 0:
            it = this.makeItemArmyRifle();
            break;
          case 1:
          case 2:
          case 3:
          case 4:
          case 5:
          case 6:
            it = this.makeItemHeavyRifleAmmo();
            break;
          case 7:
            it = this.makeItemArmyPistol();
            break;
          case 8:
          case 9:
          case 10:
            it = this.makeItemHeavyPistolAmmo();
            break;
          case 11:
            it = this.makeItemTacticalShotgun();
            break;
          case 12:
          case 13:
          case 14:
          case 15:
          case 16:
            it = this.makeItemShotgunAmmo();
            break;
          case 17:
            it = this.makeItemGrenade();
            break;
          case 18:
          case 19:
            it = this.makeItemArmyBodyArmor();
            break;
          case 20:
            it = this.makeItemArmyPrecisionRifle();
            break;
          case 21:
          case 22:
          case 23:
            it = this.makeItemPrecisionRifleAmmo();
            break; //@@MP (Release 6-6)
          case 24:
            it = this.makeItemNightVisionGoggles();
            break;
          case 25:
            it = this.makeItemC4Explosive();
            break;
          case 26:
            it = this.makeItemFlamethrower();
            break; //@@MP (Release 7-1)
          case 27:
          case 28:
          case 29:
            it = this.makeItemMinigunAmmo();
            break; //@@MP (Release 7-6)
          case 30:
          case 31:
            if (!minigunSpawned) {
              //@@MP - only one per game (Release 7-6)
              it = this.makeItemMinigun();
              minigunSpawned = true;
            } else {
              it = this.makeItemMinigunAmmo();
            }
            break;
          case 32:
          case 33:
            if (!grenadelauncherSpawned) {
              //@@MP - only one per game (Release 7-6)
              it = this.makeItemGrenadeLauncher();
              grenadelauncherSpawned = true;
            } else {
              it = this.makeItemGrenadeLauncherAmmo();
            }
            break;
          default:
            throw new RangeError('unhandled roll');
        }
        map.dropItemAt(it, pt);
      }

      return this.makeObjShelf(GameImages.OBJ_SHOP_SHELF);
    });
  }

  /**
   * C# `MakeArmyPharmacyRoom` — `:11269`.
   *
   * Shelves along the walls, each with a `MakeHospitalItem` behind the Resources
   * Availability option. `CountAdjWalls < 2` here rather than the armory's — the C# has
   * both numbers and they are not the same test.
   */
  makeArmyPharmacyRoom(map: GameMap, roomRect: Rect): void {
    // Shelves with medicine along walls.
    const resourcesChance = this.armyResourcesChance();
    this.mapObjectFill(map, roomRect, (pt) => {
      if (this.countAdjWalls(map, pt.x, pt.y) < 2) return null;
      // don't block doors
      if (this.isADoorNSEW(map, pt.x, pt.y)) return null; //@@MP (Release 7-6)
      // dont block exits!
      if (map.getExitAt(pt) !== null) return null;

      // table + meds.
      if (this.m_DiceRoller.rollChance(resourcesChance)) {
        //@@MP - Resources Availability option (Release 7-4)
        map.dropItemAt(this.makeHospitalItem(), pt);
      }

      return this.makeObjShelf(GameImages.OBJ_SHOP_SHELF);
    });
  }

  /**
   * C# `MakeArmyStorageRoom` — `:11106`.
   *
   * The base's junk room, and the only one of the six that replaces its floor: the
   * base's `FLOOR_ARMY` becomes `FLOOR_CONCRETE` here, exactly as the CHAR storage
   * room does.
   *
   * The three 5% drops are `//@@MP - added items that were in the armory before
   * (Release 7-6)` — the fork moved some of the armory's stock in here, which is why
   * a storage room can now hand you a flashbang.
   */
  makeArmyStorageRoom(map: GameMap, roomRect: Rect): void {
    // Replace floor with concrete.
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_CONCRETE)!, roomRect);

    // Objects.
    // Barrels & Junk in the middle of the room.
    this.mapObjectFill(map, roomRect, (pt) => {
      if (this.countAdjWalls(map, pt.x, pt.y) > 0) return null;
      // dont block exits!
      if (map.getExitAt(pt) !== null) return null;

      // barrels/junk?
      if (this.m_DiceRoller.rollChance(50)) {
        //@@MP - added items that were in the armory before (Release 7-6)
        if (this.m_DiceRoller.rollChance(5)) map.dropItemAt(this.makeItemFlaresKit(), pt);
        if (this.m_DiceRoller.rollChance(5)) map.dropItemAt(this.makeItemSmokeGrenade(), pt);
        if (this.m_DiceRoller.rollChance(5)) map.dropItemAt(this.makeItemFlashbang(), pt);
        return this.m_DiceRoller.rollChance(50)
          ? this.makeObjJunk(GameImages.OBJ_JUNK)
          : this.makeObjBarrels(GameImages.OBJ_BARRELS);
      }
      return null;
    });

    // Items.
    const resourcesChance = this.armyResourcesChance();
    for (let x = roomRect.left; x < roomRect.right; x++) {
      for (let y = roomRect.top; y < roomRect.bottom; y++) {
        if (this.countAdjWalls(map, x, y) > 0) continue;
        if (map.getMapObjectAt(x, y) !== null) continue;
        //@@MP - Resources Availability option (Release 7-4)
        if (this.m_DiceRoller.rollChance(resourcesChance))
          map.dropItemAt(this.makeItemArmyRation(), new Point(x, y));
      }
    }
  }

  /**
   * The Resources Availability chance, read once and gated.
   *
   * Four of the six army rooms call this and each one reads it in the C#, at the point
   * of the roll. Gating on the flag *before* the roll matters for the same reason it
   * does in `makeCHARStorageRoom`: `DiceRoller.rollChance` delegates to `roll`
   * (`DiceRoller.ts:40-42`) and spends a die even at 0%, so a Classic room that asked
   * would spend four dice the C# never spends for Classic.
   *
   * Private and named so the four call sites cannot drift apart on the gate.
   */
  private armyResourcesChance(): number {
    if (!hasFeature(Session.get().ruleset, Feature.ResourcesAvailability)) return 0;
    return GameOptions.resourcesAvailabilityToInt(Options.resourcesAvailability);
  }

  makeCHARLabRoom(map: GameMap, roomRect: Rect, placedBioForceGun: { value: boolean }): void {
    let placedCHARdocument = false;
    // Replace floor with tiles with painted logo.
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_TILES)!, roomRect);

    // Objects.
    // vats along walls.
    this.mapObjectFill(map, roomRect, (pt) => {
      if (this.countAdjWalls(map, pt.x, pt.y) < 3) return null;
      // dont block exits!
      if (map.getExitAt(pt) !== null) return null;

      // bed/fridge?
      if (this.m_DiceRoller.rollChance(50)) {
        if (this.m_DiceRoller.rollChance(75)) {
          return this.makeObjCHARvat(GameImages.OBJ_CHAR_VAT);
        }
        return this.makeObjWorkstation(GameImages.OBJ_CHAR_DESKTOP);
      }
      return null;
    });

    // desktops and tables in the middle of the room
    const resourcesAvailable = hasFeature(Session.get().ruleset, Feature.ResourcesAvailability);
    const resourcesChance = resourcesAvailable
      ? GameOptions.resourcesAvailabilityToInt(Options.resourcesAvailability)
      : 0;
    this.mapObjectFill(map, roomRect, (pt) => {
      if (this.countAdjWalls(map, pt.x, pt.y) > 0) return null;
      // dont block exits!
      if (map.getExitAt(pt) !== null) return null;

      // tables/chairs.
      if (this.m_DiceRoller.rollChance(30)) {
        if (this.m_DiceRoller.rollChance(50)) {
          return this.makeObjWorkstation(GameImages.OBJ_CHAR_DESKTOP);
        }
        // The C# computes `armorChance` and then leaves the `armorChance / 3` line
        // commented out (`BaseTownGenerator.cs:8600`), so the chance is the raw
        // Resources Availability number and not a third of it.
        if (this.m_DiceRoller.rollChance(resourcesChance)) {
          map.dropItemAt(this.makeItemBiohazardSuit(), pt); //@@MP (Release 7-6)
        }
        return this.makeObjTable(GameImages.OBJ_CHAR_TABLE);
      }

      if (!placedCHARdocument) {
        // `makeCHARDocument()` spends the `roll(0, 5)` itself -- it documents that
        // bound and why `case 5` is dead -- so the roll is not repeated here.
        map.dropItemAt(this.makeCHARDocument(), pt);
        placedCHARdocument = true; //@@MP - only drop one per room
      }
      return null;
    });

    if (!placedBioForceGun.value) {
      //@@MP - added (Release 7-6)
      let placed = false;
      this.mapObjectPlaceInGoodPosition(
        map,
        roomRect,
        (pt) => map.getMapObjectAt(pt.x, pt.y) === null,
        this.m_DiceRoller,
        (pt) => {
          map.dropItemAt(this.makeItemBioForceGun(), pt);
          placed = true;
          // trolley.
          return this.makeObjCHARtrolley(GameImages.OBJ_CHAR_TROLLEY);
        }
      );
      placedBioForceGun.value = placed; //@@MP - only drop one per game
    }
  }

  makeCHARLivingRoom(map: GameMap, roomRect: Rect): void {
    // Replace floor with wood with painted logo.
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_PLANKS)!, roomRect, (tile) => {
      tile.addDecoration(GameImages.DECO_CHAR_FLOOR_LOGO);
    });

    // Objects.
    // Beds/Fridges along walls.
    this.mapObjectFill(map, roomRect, (pt) => {
      if (this.countAdjWalls(map, pt.x, pt.y) < 3) return null;
      // dont block exits!
      if (map.getExitAt(pt) !== null) return null;

      // bed/fridge?
      if (this.m_DiceRoller.rollChance(30)) {
        if (this.m_DiceRoller.rollChance(50)) return this.makeObjBed(GameImages.OBJ_BED);
        else return this.makeObjFridge(GameImages.OBJ_FRIDGE);
      } else {
        return null;
      }
    });
    // Tables(with canned food) & Chairs in the middle.
    this.mapObjectFill(map, roomRect, (pt) => {
      if (this.countAdjWalls(map, pt.x, pt.y) > 0) return null;
      // dont block exits!
      if (map.getExitAt(pt) !== null) return null;

      // tables/chairs.
      if (this.m_DiceRoller.rollChance(30)) {
        if (this.m_DiceRoller.rollChance(30)) {
          const table = this.makeObjTable(GameImages.OBJ_CHAR_TABLE);
          map.dropItemAt(this.makeItemCannedFood(), pt);
          return table;
        } else {
          return this.makeObjChair(GameImages.OBJ_CHAR_CHAIR);
        }
      } else {
        return null;
      }
    });
  }

  makeCHARPharmacyRoom(map: GameMap, roomRect: Rect): void {
    // Shelves with medicine along walls.
    this.mapObjectFill(map, roomRect, (pt) => {
      if (this.countAdjWalls(map, pt.x, pt.y) < 3) return null;
      // dont block exits!
      if (map.getExitAt(pt) !== null) return null;

      // table + meds.
      if (this.m_DiceRoller.rollChance(20)) {
        const it = this.makeHospitalItem();
        map.dropItemAt(it, pt);

        return this.makeObjShelf(GameImages.OBJ_SHOP_SHELF);
      } else {
        return null;
      }
    });
  }

  makeCHARPowerRoom(map: GameMap, wallsRect: Rect, roomRect: Rect): void {
    // Replace floor with concrete.
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_CONCRETE)!, roomRect);

    // add deco power sign next to doors.
    this.doForEachTile(map, wallsRect, (pt) => {
      if (!(map.getMapObjectAt(pt.x, pt.y) instanceof DoorWindow)) return;
      this.doForEachAdjacentInMap(map, pt, (ptAdj) => {
        const tile = map.getTileAt(ptAdj.x, ptAdj.y)!;
        if (tile.model.isWalkable) return;
        tile.removeAllDecorations();
        tile.addDecoration(GameImages.DECO_POWER_SIGN_BIG);
      });
    });

    // add power generators along walls.
    this.doForEachTile(map, roomRect, (pt) => {
      if (!map.getTileAt(pt.x, pt.y)!.model.isWalkable) return;
      if (map.getExitAt(pt) !== null) return;
      if (this.countAdjWalls(map, pt.x, pt.y) < 3) return;

      const powGen = this.makeObjPowerGenerator(GameImages.OBJ_POWERGEN_OFF, GameImages.OBJ_POWERGEN_ON);
      this.mapObjectPlace(map, pt.x, pt.y, powGen);
    });
  }

  // ── Police Station ───────────────────────────────────────────────────────

  makePoliceStation(map: GameMap, freeBlocks: Block[]): Block {
    ////////////////////////////////
    // 1. Pick a block.
    // 2. Generate surface station.
    // 3. Generate level -1.
    // 4. Generate level -2.
    // 5. Link maps.
    // 6. Add maps to district.
    // 7. Set unique maps.
    ////////////////////////////////

    // 1. Pick a block.
    // any random block will do.
    const policeBlock = freeBlocks[this.m_DiceRoller.roll(0, freeBlocks.length)];

    // 2. Generate surface station.
    const { stairsToLevel1: surfaceStairsPos } = this.generatePoliceStation(map, policeBlock);

    // 3. Generate Offices level (-1).
    const officesLevel = this.generatePoliceStation_OfficesLevel(map, policeBlock, surfaceStairsPos);

    // 4. Generate Jails level (-2).
    const jailsLevel = this.generatePoliceStation_JailsLevel(officesLevel);

    // alpha10 music
    officesLevel.bgMusic = GameMusics.SURFACE;
    jailsLevel.bgMusic = GameMusics.SURFACE;

    // 5. Link maps.
    // surface <-> offices level
    this.addExit(map, surfaceStairsPos, officesLevel, new Point(1, 1), GameImages.DECO_STAIRS_DOWN, true);
    this.addExit(officesLevel, new Point(1, 1), map, surfaceStairsPos, GameImages.DECO_STAIRS_UP, true);

    // offices <-> jails
    this.addExit(officesLevel, new Point(1, officesLevel.height - 2), jailsLevel, new Point(1, 1), GameImages.DECO_STAIRS_DOWN, true);
    this.addExit(jailsLevel, new Point(1, 1), officesLevel, new Point(1, officesLevel.height - 2), GameImages.DECO_STAIRS_UP, true);

    // 6. Add maps to district.
    this.params.district!.addUniqueMap(officesLevel);
    this.params.district!.addUniqueMap(jailsLevel);

    // 7. Set unique maps.
    const officesUM = new UniqueMap();
    officesUM.theMap = officesLevel;
    Session.get().uniqueMaps.policeStation_OfficesLevel = officesUM;
    const jailsUM = new UniqueMap();
    jailsUM.theMap = jailsLevel;
    Session.get().uniqueMaps.policeStation_JailsLevel = jailsUM;

    // done!
    return policeBlock;
  }

  generatePoliceStation(surfaceMap: GameMap, policeBlock: Block): { stairsToLevel1: Point } {
    // Fill & Enclose Building.
    this.tileFill(surfaceMap, Models.tiles.get(TileID.FLOOR_TILES)!, policeBlock.insideRect);
    this.tileRectangle(surfaceMap, Models.tiles.get(TileID.WALL_POLICE_STATION)!, policeBlock.buildingRect);
    this.tileRectangle(surfaceMap, Models.tiles.get(TileID.FLOOR_WALKWAY)!, policeBlock.rectangle);
    this.doForEachTile(surfaceMap, policeBlock.insideRect, (pt) => {
      surfaceMap.getTileAt(pt.x, pt.y)!.isInside = true;
    });

    // Entrance to the south with police signs.
    const entryDoorPos = new Point(
      policeBlock.buildingRect.left + Math.floor(policeBlock.buildingRect.width / 2),
      policeBlock.buildingRect.bottom - 1
    );
    surfaceMap.getTileAt(entryDoorPos.x - 1, entryDoorPos.y)!.addDecoration(GameImages.DECO_POLICE_STATION);
    surfaceMap.getTileAt(entryDoorPos.x + 1, entryDoorPos.y)!.addDecoration(GameImages.DECO_POLICE_STATION);

    // Entry hall.
    const entryHall = new Rect(
      policeBlock.buildingRect.left,
      policeBlock.buildingRect.top + 2,
      policeBlock.buildingRect.width,
      policeBlock.buildingRect.height - 2
    );
    this.tileRectangle(surfaceMap, Models.tiles.get(TileID.WALL_POLICE_STATION)!, entryHall);
    this.placeDoor(
      surfaceMap,
      entryHall.left + Math.floor(entryHall.width / 2),
      entryHall.top,
      Models.tiles.get(TileID.FLOOR_TILES)!,
      this.makeObjIronDoor()
    );
    this.placeDoor(surfaceMap, entryDoorPos.x, entryDoorPos.y, Models.tiles.get(TileID.FLOOR_TILES)!, this.makeObjGlassDoor());
    this.doForEachTile(surfaceMap, entryHall, (pt) => {
      if (!surfaceMap.isWalkable(pt.x, pt.y)) return;
      if (this.countAdjWalls(surfaceMap, pt.x, pt.y) === 0 || this.countAdjDoors(surfaceMap, pt.x, pt.y) > 0) return;
      this.mapObjectPlace(surfaceMap, pt.x, pt.y, this.makeObjBench(GameImages.OBJ_BENCH));
    });

    // Place stairs, north side.
    const stairsToLevel1 = new Point(entryDoorPos.x, policeBlock.insideRect.top);

    // Zone.
    surfaceMap.addZone(this.makeUniqueZone('Police Station', policeBlock.buildingRect));
    this.makeWalkwayZones(surfaceMap, policeBlock);

    return { stairsToLevel1 };
  }

  generatePoliceStation_OfficesLevel(surfaceMap: GameMap, policeBlock: Block, exitPos: Point): GameMap {
    // policeBlock & exitPos are unused, exactly as in the C# source.
    void policeBlock;
    void exitPos;

    //////////////////
    // 1. Create map.
    // 2. Floor plan.
    // 3. Populate.
    //////////////////

    // 1. Create map.
    const seed = (surfaceMap.seed << 1) ^ surfaceMap.seed;
    const map = new GameMap(seed, 'Police Station - Offices', 20, 20);
    map.lighting = Lighting.DARKNESS;
    this.doForEachTile(map, map.rect, (pt) => {
      map.getTileAt(pt.x, pt.y)!.isInside = true;
    });

    // 2. Floor plan.
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_TILES)!);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_POLICE_STATION)!, map.rect);
    // - offices rooms on the east side, doors leading west.
    const officesRect = new Rect(3, 0, map.width - 3, map.height);
    const roomsList: Rect[] = [];
    this.makeRoomsPlan(map, roomsList, officesRect, 5, 5);
    for (const roomRect of roomsList) {
      const inRoomRect = new Rect(roomRect.left + 1, roomRect.top + 1, roomRect.width - 2, roomRect.height - 2);
      // 2 kind of rooms.
      // - farthest east from corridor : security.
      // - others : offices.
      if (roomRect.right === map.width) {
        // Police Security Room.
        // make room with door.
        this.tileRectangle(map, Models.tiles.get(TileID.WALL_POLICE_STATION)!, roomRect);
        this.placeDoor(
          map,
          roomRect.left,
          roomRect.top + Math.floor(roomRect.height / 2),
          Models.tiles.get(TileID.FLOOR_CONCRETE)!,
          this.makeObjIronDoor()
        );

        // shelves with weaponry & armor next to the walls.
        this.doForEachTile(map, inRoomRect, (pt) => {
          if (
            !map.isWalkable(pt.x, pt.y) ||
            this.countAdjWalls(map, pt.x, pt.y) === 0 ||
            this.countAdjDoors(map, pt.x, pt.y) > 0
          )
            return;

          // shelf.
          this.mapObjectPlace(map, pt.x, pt.y, this.makeObjShelf(GameImages.OBJ_SHOP_SHELF));

          // weaponry/armor/radios.
          let it: Item | null = null;
          const roll = this.m_DiceRoller.roll(0, 10);
          switch (roll) {
            // 20% armors
            case 0:
            case 1:
              it = this.m_DiceRoller.rollChance(50) ? this.makeItemPoliceJacket() : this.makeItemPoliceRiotArmor();
              break;

            // 20% light/radio
            case 2:
            case 3:
              it = this.m_DiceRoller.rollChance(50)
                ? this.m_DiceRoller.rollChance(50)
                  ? this.makeItemFlashlight()
                  : this.makeItemBigFlashlight()
                : this.makeItemPoliceRadio();
              break;

            // 20% truncheon
            case 4:
            case 5:
              it = this.makeItemTruncheon();
              break;

            // 20% pistol/ammo - 30% pistol 70% amo
            case 6:
            case 7:
              it = this.m_DiceRoller.rollChance(30) ? this.makeItemPistol() : this.makeItemLightPistolAmmo();
              break;

            // 20% shotgun/ammo - 30% shotgun 70% amo
            case 8:
            case 9:
              it = this.m_DiceRoller.rollChance(30) ? this.makeItemShotgun() : this.makeItemShotgunAmmo();
              break;

            default:
              throw new RangeError('unhandled roll');
          }

          map.dropItemAt(it!, pt);
        });

        // zone.
        map.addZone(this.makeUniqueZone('security', inRoomRect));
      } else {
        // Police Office Room.
        // make room with door.
        this.tileFill(map, Models.tiles.get(TileID.FLOOR_PLANKS)!, roomRect);
        this.tileRectangle(map, Models.tiles.get(TileID.WALL_POLICE_STATION)!, roomRect);
        this.placeDoor(
          map,
          roomRect.left,
          roomRect.top + Math.floor(roomRect.height / 2),
          Models.tiles.get(TileID.FLOOR_PLANKS)!,
          this.makeObjWoodenDoor()
        );

        // add furniture : 1 table, 2 chairs.
        const goodOfficePos = (pt: Point): boolean =>
          map.isWalkable(pt.x, pt.y) && this.countAdjDoors(map, pt.x, pt.y) === 0;
        this.mapObjectPlaceInGoodPosition(map, inRoomRect, goodOfficePos, this.m_DiceRoller, () =>
          this.makeObjTable(GameImages.OBJ_TABLE)
        );
        this.mapObjectPlaceInGoodPosition(map, inRoomRect, goodOfficePos, this.m_DiceRoller, () =>
          this.makeObjChair(GameImages.OBJ_CHAIR)
        );
        this.mapObjectPlaceInGoodPosition(map, inRoomRect, goodOfficePos, this.m_DiceRoller, () =>
          this.makeObjChair(GameImages.OBJ_CHAIR)
        );

        // zone.
        map.addZone(this.makeUniqueZone('office', inRoomRect));
      }
    }
    // - benches in corridor.
    this.doForEachTile(map, new Rect(1, 1, 1, map.height - 2), (pt) => {
      if (pt.y % 2 === 1) return;
      if (!map.isWalkablePoint(pt)) return;
      if (this.countAdjWalls(map, pt) !== 3) return;

      this.mapObjectPlace(map, pt.x, pt.y, this.makeObjIronBench(GameImages.OBJ_IRON_BENCH));
    });

    // 3. Populate.
    // - cops.
    const nbCops = 5;
    for (let i = 0; i < nbCops; i++) {
      const cop = this.createNewPoliceman(0);
      this.actorPlace(this.m_DiceRoller, map.width * map.height, map, cop);
    }

    // done.
    return map;
  }

  generatePoliceStation_JailsLevel(surfaceMap: GameMap): GameMap {
    //////////////////
    // 1. Create map.
    // 2. Floor plan.
    // 3. Populate.
    //////////////////

    // 1. Create map.
    const seed = (surfaceMap.seed << 1) ^ surfaceMap.seed;
    const map = new GameMap(seed, 'Police Station - Jails', 22, 6);
    map.lighting = Lighting.DARKNESS;
    this.doForEachTile(map, map.rect, (pt) => {
      map.getTileAt(pt.x, pt.y)!.isInside = true;
    });

    // 2. Floor plan.
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_TILES)!);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_POLICE_STATION)!, map.rect);
    // - small cells.
    const cellWidth = 3;
    const cellHeight = 3;
    const yCells = 3;
    const cells: Rect[] = [];
    for (let x = 0; x + cellWidth <= map.width; x += cellWidth - 1) {
      // room.
      const cellRoom = new Rect(x, yCells, cellWidth, cellHeight);
      cells.push(cellRoom);
      this.tileFill(map, Models.tiles.get(TileID.FLOOR_CONCRETE)!, cellRoom);
      this.tileRectangle(map, Models.tiles.get(TileID.WALL_POLICE_STATION)!, cellRoom);

      // couch.
      const couchPos = new Point(x + 1, yCells + 1);
      this.mapObjectPlace(map, couchPos.x, couchPos.y, this.makeObjIronBench(GameImages.OBJ_IRON_BENCH));

      // gate.
      const gatePos = new Point(x + 1, yCells);
      map.setTileModelAt(gatePos.x, gatePos.y, Models.tiles.get(TileID.FLOOR_CONCRETE)!);
      // alpha10.1 made unbreakable because civ ai can now bash their way out when trapped :p
      this.mapObjectPlace(map, gatePos.x, gatePos.y, this.makeObjIronGate(GameImages.OBJ_GATE_CLOSED, false));
      // zone.
      map.addZone(this.makeUniqueZone('jail' /* RogueGame.NAME_POLICE_STATION_JAILS_CELL */, cellRoom));
    }
    // - corridor.
    const corridor = new Rect(1, 1, map.width - 1, yCells - 1);
    map.addZone(this.makeUniqueZone('cells corridor', corridor));
    // - the switch to open/close the cells.
    this.mapObjectPlace(map, map.width - 2, 1, this.makeObjPowerGenerator(GameImages.OBJ_POWERGEN_OFF, GameImages.OBJ_POWERGEN_ON));

    // 3. Populate.
    // a prisoner in each cell.
    // alph10.1 the prisoner who should not be is now in one of the cell at random instead of always the last one
    const prisonnerCell = this.m_DiceRoller.roll(0, cells.length);
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];

      // prisonner who should not be or regular civilian
      let prisoner: Actor;
      if (i === prisonnerCell) {
        // prisoner who should not be
        prisoner = this.createNewCivilian(0, 0, 1);
        prisoner.name = 'The Prisoner Who Should Not Be';
        // alpha10 marks every unique NPC `isUnique`, and that is what the
        // first-sighting check requires before it clears their invincibility
        // (`RogueGame.HandlePlayerActor`: `if (other.isUnique) { ... isInvincible = false }`).
        // This one forgot, so the prisoner was registered below, picked up
        // `isInvincible = true` by the worldgen sweep, and could never lose it —
        // the one actor in the game the player is guaranteed to meet and cannot
        // kill. Same fix as the fork's BaseTownGenerator.cs:9146.
        prisoner.isUnique = true;

        // plenty of food
        const prisonerInv = prisoner.inventory!;
        for (let j = 0; j < prisonerInv.maxCapacity; j++) prisonerInv.addAll(this.makeItemArmyRation());

        // register unique
        const uniquePrisoner = new UniqueActor();
        uniquePrisoner.theActor = prisoner;
        uniquePrisoner.isSpawned = true;
        Session.get().uniqueActors.policeStationPrisoner = uniquePrisoner;
      } else {
        // jailed. Civilian.
        prisoner = this.createNewCivilian(0, 0, 1);

        // make sure he is stripped of all default items!
        const prisonerInv = prisoner.inventory!;
        while (!prisonerInv.isEmpty) prisonerInv.removeAllQuantity(prisonerInv.getItem(0)!);

        // give him some food.
        prisonerInv.addAll(this.makeItemGroceries());
      }

      // drop him.
      map.placeActor(prisoner, new Point(cell.left + 1, cell.top + 1));
    }

    // done.
    return map;
  }

  /**
   * Layout :
   *  0 floor: Entry Hall.
   * -1 floor: Admissions (short term patients).
   * -2 floor: Offices. (doctors)
   * -3 floor: Patients. (nurses, injured patients)
   * -4 floor: Storage. (bunch of meds & pills; blocked by closed gates, need power on)
   * -5 floor: Power. (restore power to the whole building = lights, open storage gates)
   */
  makeHospital(map: GameMap, freeBlocks: Block[]): Block {
    ////////////////////////////////
    // 1. Pick a block.
    // 2. Generate surface building.
    // 3. Generate other levels maps.
    // 5. Link maps.
    // 6. Add maps to district.
    // 7. Set unique maps.
    ////////////////////////////////

    // 1. Pick a block.
    // any random block will do.
    const hospitalBlock = freeBlocks[this.m_DiceRoller.roll(0, freeBlocks.length)];

    // 2. Generate surface.
    this.generateHospitalEntryHall(map, hospitalBlock);

    // 3. Generate other levels maps.
    const admissions = this.generateHospital_Admissions((map.seed << 1) ^ map.seed);
    const offices = this.generateHospital_Offices((map.seed << 2) ^ map.seed);
    const patients = this.generateHospital_Patients((map.seed << 3) ^ map.seed);
    const storage = this.generateHospital_Storage((map.seed << 4) ^ map.seed);
    const power = this.generateHospital_Power((map.seed << 5) ^ map.seed);

    // alpha10 music
    admissions.bgMusic = offices.bgMusic = patients.bgMusic = storage.bgMusic = power.bgMusic = GameMusics.HOSPITAL;

    // 5. Link maps.
    // entry <-> admissions
    const entryStairs = new Point(
      hospitalBlock.insideRect.left + Math.floor(hospitalBlock.insideRect.width / 2),
      hospitalBlock.insideRect.top
    );
    const admissionsUpStairs = new Point(Math.floor(admissions.width / 2), 1);
    this.addExit(map, entryStairs, admissions, admissionsUpStairs, GameImages.DECO_STAIRS_DOWN, true);
    this.addExit(admissions, admissionsUpStairs, map, entryStairs, GameImages.DECO_STAIRS_UP, true);

    // admissions <-> offices
    const admissionsDownStairs = new Point(Math.floor(admissions.width / 2), admissions.height - 2);
    const officesUpStairs = new Point(Math.floor(offices.width / 2), 1);
    this.addExit(admissions, admissionsDownStairs, offices, officesUpStairs, GameImages.DECO_STAIRS_DOWN, true);
    this.addExit(offices, officesUpStairs, admissions, admissionsDownStairs, GameImages.DECO_STAIRS_UP, true);

    // offices <-> patients
    const officesDownStairs = new Point(Math.floor(offices.width / 2), offices.height - 2);
    const patientsUpStairs = new Point(Math.floor(patients.width / 2), 1);
    this.addExit(offices, officesDownStairs, patients, patientsUpStairs, GameImages.DECO_STAIRS_DOWN, true);
    this.addExit(patients, patientsUpStairs, offices, officesDownStairs, GameImages.DECO_STAIRS_UP, true);

    // patients <-> storage
    const patientsDownStairs = new Point(Math.floor(patients.width / 2), patients.height - 2);
    const storageUpStairs = new Point(1, 1);
    this.addExit(patients, patientsDownStairs, storage, storageUpStairs, GameImages.DECO_STAIRS_DOWN, true);
    this.addExit(storage, storageUpStairs, patients, patientsDownStairs, GameImages.DECO_STAIRS_UP, true);

    // storage <-> power
    const storageDownStairs = new Point(storage.width - 2, 1);
    const powerUpStairs = new Point(1, 1);
    this.addExit(storage, storageDownStairs, power, powerUpStairs, GameImages.DECO_STAIRS_DOWN, true);
    this.addExit(power, powerUpStairs, storage, storageDownStairs, GameImages.DECO_STAIRS_UP, true);

    // 6. Add maps to district.
    this.params.district!.addUniqueMap(admissions);
    this.params.district!.addUniqueMap(offices);
    this.params.district!.addUniqueMap(patients);
    this.params.district!.addUniqueMap(storage);
    this.params.district!.addUniqueMap(power);

    // 7. Set unique maps.
    const umAdmissions = new UniqueMap();
    umAdmissions.theMap = admissions;
    Session.get().uniqueMaps.hospital_Admissions = umAdmissions;
    const umOffices = new UniqueMap();
    umOffices.theMap = offices;
    Session.get().uniqueMaps.hospital_Offices = umOffices;
    const umPatients = new UniqueMap();
    umPatients.theMap = patients;
    Session.get().uniqueMaps.hospital_Patients = umPatients;
    const umStorage = new UniqueMap();
    umStorage.theMap = storage;
    Session.get().uniqueMaps.hospital_Storage = umStorage;
    const umPower = new UniqueMap();
    umPower.theMap = power;
    Session.get().uniqueMaps.hospital_Power = umPower;

    // done!
    return hospitalBlock;
  }

  generateHospitalEntryHall(surfaceMap: GameMap, block: Block): void {
    // Fill & Enclose Building.
    this.tileFill(surfaceMap, Models.tiles.get(TileID.FLOOR_TILES)!, block.insideRect);
    this.tileRectangle(surfaceMap, Models.tiles.get(TileID.WALL_HOSPITAL)!, block.buildingRect);
    this.tileRectangle(surfaceMap, Models.tiles.get(TileID.FLOOR_WALKWAY)!, block.rectangle);
    this.doForEachTile(surfaceMap, block.insideRect, (pt) => {
      surfaceMap.getTileAt(pt.x, pt.y)!.isInside = true;
    });

    // 2 entrances to the south with signs.
    const entryRightDoorPos = new Point(
      block.buildingRect.left + Math.floor(block.buildingRect.width / 2),
      block.buildingRect.bottom - 1
    );
    const entryLeftDoorPos = new Point(entryRightDoorPos.x - 1, entryRightDoorPos.y);
    surfaceMap.getTileAt(entryLeftDoorPos.x - 1, entryLeftDoorPos.y)!.addDecoration(GameImages.DECO_HOSPITAL);
    surfaceMap.getTileAt(entryRightDoorPos.x + 1, entryRightDoorPos.y)!.addDecoration(GameImages.DECO_HOSPITAL);

    // Entry hall = whole building.
    const entryHall = new Rect(
      block.buildingRect.left,
      block.buildingRect.top,
      block.buildingRect.width,
      block.buildingRect.height
    );
    this.placeDoor(surfaceMap, entryRightDoorPos.x, entryRightDoorPos.y, Models.tiles.get(TileID.FLOOR_TILES)!, this.makeObjGlassDoor());
    this.placeDoor(surfaceMap, entryLeftDoorPos.x, entryLeftDoorPos.y, Models.tiles.get(TileID.FLOOR_TILES)!, this.makeObjGlassDoor());
    this.doForEachTile(surfaceMap, entryHall, (pt) => {
      // benches only on west & east sides.
      if (pt.y === block.insideRect.top || pt.y === block.insideRect.bottom - 1) return;
      if (!surfaceMap.isWalkable(pt.x, pt.y)) return;
      if (this.countAdjWalls(surfaceMap, pt.x, pt.y) === 0 || this.countAdjDoors(surfaceMap, pt.x, pt.y) > 0) return;
      this.mapObjectPlace(surfaceMap, pt.x, pt.y, this.makeObjIronBench(GameImages.OBJ_IRON_BENCH));
    });

    // Zone.
    surfaceMap.addZone(this.makeUniqueZone('Hospital', block.buildingRect));
    this.makeWalkwayZones(surfaceMap, block);
  }

  generateHospital_Admissions(seed: number): GameMap {
    //////////////////
    // 1. Create map.
    // 2. Floor plan.
    // 3. Populate.
    //////////////////

    // 1. Create map.
    const map = new GameMap(seed, 'Hospital - Admissions', 13, 33);
    map.lighting = Lighting.DARKNESS;
    this.doForEachTile(map, map.rect, (pt) => {
      map.getTileAt(pt.x, pt.y)!.isInside = true;
    });
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_TILES)!);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_HOSPITAL)!, map.rect);

    // 2. Floor plan.
    // One central south->north corridor with admission rooms on each sides.
    const roomSize = 5;

    // 1. Central corridor.
    const corridor = new Rect(roomSize - 1, 0, 5, map.height);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_HOSPITAL)!, corridor);
    map.addZone(this.makeUniqueZone('corridor', corridor));

    // 2. Admission rooms, all similar 5x5 rooms (3x3 inside)
    const leftWing = new Rect(0, 0, roomSize, map.height);
    for (let roomY = 0; roomY <= map.height - roomSize; roomY += roomSize - 1) {
      const room = new Rect(leftWing.left, roomY, roomSize, roomSize);
      this.makeHospitalPatientRoom(map, 'patient room', room, true);
    }

    const rightWing = new Rect(map.rect.right - roomSize, 0, roomSize, map.height);
    for (let roomY = 0; roomY <= map.height - roomSize; roomY += roomSize - 1) {
      const room = new Rect(rightWing.left, roomY, roomSize, roomSize);
      this.makeHospitalPatientRoom(map, 'patient room', room, false);
    }

    // 3. Populate.
    // patients in rooms.
    const nbPatients = 10;
    for (let i = 0; i < nbPatients; i++) {
      // create.
      const patient = this.createNewHospitalPatient(0);
      // place.
      this.actorPlace(this.m_DiceRoller, map.width * map.height, map, patient, (pt) =>
        map.getZonesAt(pt.x, pt.y).some((z) => z.name.includes('patient room'))
      );
    }

    // nurses & doctor in corridor.
    const nbNurses = 4;
    for (let i = 0; i < nbNurses; i++) {
      // create.
      const nurse = this.createNewHospitalNurse(0);
      // place.
      this.actorPlace(this.m_DiceRoller, map.width * map.height, map, nurse, (pt) =>
        map.getZonesAt(pt.x, pt.y).some((z) => z.name.includes('corridor'))
      );
    }
    const nbDoctor = 1;
    for (let i = 0; i < nbDoctor; i++) {
      // create.
      const doctor = this.createNewHospitalDoctor(0);
      // place.
      this.actorPlace(this.m_DiceRoller, map.width * map.height, map, doctor, (pt) =>
        map.getZonesAt(pt.x, pt.y).some((z) => z.name.includes('corridor'))
      );
    }

    // done.
    return map;
  }

  generateHospital_Offices(seed: number): GameMap {
    //////////////////
    // 1. Create map.
    // 2. Floor plan.
    // 3. Populate.
    //////////////////

    // 1. Create map.
    const map = new GameMap(seed, 'Hospital - Offices', 13, 33);
    map.lighting = Lighting.DARKNESS;
    this.doForEachTile(map, map.rect, (pt) => {
      map.getTileAt(pt.x, pt.y)!.isInside = true;
    });
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_TILES)!);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_HOSPITAL)!, map.rect);

    // 2. Floor plan.
    // One central south->north corridor with offices rooms on each sides.
    const roomSize = 5;

    // 1. Central corridor.
    const corridor = new Rect(roomSize - 1, 0, 5, map.height);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_HOSPITAL)!, corridor);
    map.addZone(this.makeUniqueZone('corridor', corridor));

    // 2. Offices rooms, all similar 5x5 rooms (3x3 inside)
    const leftWing = new Rect(0, 0, roomSize, map.height);
    for (let roomY = 0; roomY <= map.height - roomSize; roomY += roomSize - 1) {
      const room = new Rect(leftWing.left, roomY, roomSize, roomSize);
      this.makeHospitalOfficeRoom(map, 'office', room, true);
    }

    const rightWing = new Rect(map.rect.right - roomSize, 0, roomSize, map.height);
    for (let roomY = 0; roomY <= map.height - roomSize; roomY += roomSize - 1) {
      const room = new Rect(rightWing.left, roomY, roomSize, roomSize);
      this.makeHospitalOfficeRoom(map, 'office', room, false);
    }

    // 3. Populate.
    // nurses & doctor in offices.
    const nbNurses = 5;
    for (let i = 0; i < nbNurses; i++) {
      // create.
      const nurse = this.createNewHospitalNurse(0);
      // place.
      this.actorPlace(this.m_DiceRoller, map.width * map.height, map, nurse, (pt) =>
        map.getZonesAt(pt.x, pt.y).some((z) => z.name.includes('office'))
      );
    }
    const nbDoctor = 2;
    for (let i = 0; i < nbDoctor; i++) {
      // create.
      const doctor = this.createNewHospitalDoctor(0);
      // place.
      this.actorPlace(this.m_DiceRoller, map.width * map.height, map, doctor, (pt) =>
        map.getZonesAt(pt.x, pt.y).some((z) => z.name.includes('office'))
      );
    }

    // done.
    return map;
  }

  generateHospital_Patients(seed: number): GameMap {
    //////////////////
    // 1. Create map.
    // 2. Floor plan.
    // 3. Populate.
    //////////////////

    // 1. Create map.
    const map = new GameMap(seed, 'Hospital - Patients', 13, 49);
    map.lighting = Lighting.DARKNESS;
    this.doForEachTile(map, map.rect, (pt) => {
      map.getTileAt(pt.x, pt.y)!.isInside = true;
    });
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_TILES)!);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_HOSPITAL)!, map.rect);

    // 2. Floor plan.
    // One central south->north corridor with admission rooms on each sides.
    const roomSize = 5;

    // 1. Central corridor.
    const corridor = new Rect(roomSize - 1, 0, 5, map.height);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_HOSPITAL)!, corridor);
    map.addZone(this.makeUniqueZone('corridor', corridor));

    // 2. Patients rooms, all similar 5x5 rooms (3x3 inside)
    const leftWing = new Rect(0, 0, roomSize, map.height);
    for (let roomY = 0; roomY <= map.height - roomSize; roomY += roomSize - 1) {
      const room = new Rect(leftWing.left, roomY, roomSize, roomSize);
      this.makeHospitalPatientRoom(map, 'patient room', room, true);
    }

    const rightWing = new Rect(map.rect.right - roomSize, 0, roomSize, map.height);
    for (let roomY = 0; roomY <= map.height - roomSize; roomY += roomSize - 1) {
      const room = new Rect(rightWing.left, roomY, roomSize, roomSize);
      this.makeHospitalPatientRoom(map, 'patient room', room, false);
    }

    // 3. Populate.
    // patients in rooms.
    const nbPatients = 20;
    for (let i = 0; i < nbPatients; i++) {
      // create.
      const patient = this.createNewHospitalPatient(0);
      // place.
      this.actorPlace(this.m_DiceRoller, map.width * map.height, map, patient, (pt) =>
        map.getZonesAt(pt.x, pt.y).some((z) => z.name.includes('patient room'))
      );
    }

    // nurses & doctor in corridor.
    const nbNurses = 8;
    for (let i = 0; i < nbNurses; i++) {
      // create.
      const nurse = this.createNewHospitalNurse(0);
      // place.
      this.actorPlace(this.m_DiceRoller, map.width * map.height, map, nurse, (pt) =>
        map.getZonesAt(pt.x, pt.y).some((z) => z.name.includes('corridor'))
      );
    }
    const nbDoctor = 2;
    for (let i = 0; i < nbDoctor; i++) {
      // create.
      const doctor = this.createNewHospitalDoctor(0);
      // place.
      this.actorPlace(this.m_DiceRoller, map.width * map.height, map, doctor, (pt) =>
        map.getZonesAt(pt.x, pt.y).some((z) => z.name.includes('corridor'))
      );
    }

    // done.
    return map;
  }

  generateHospital_Storage(seed: number): GameMap {
    //////////////////
    // 1. Create map.
    // 2. Floor plan.
    //////////////////

    // 1. Create map.
    const map = new GameMap(seed, 'Hospital - Storage', 51, 16);
    map.lighting = Lighting.DARKNESS;
    this.doForEachTile(map, map.rect, (pt) => {
      map.getTileAt(pt.x, pt.y)!.isInside = true;
    });
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_TILES)!);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_HOSPITAL)!, map.rect);

    // 2. Floor plan.
    // 1 north corridor linking stairs.
    // 1 central corridor to storage rooms, locked by an iron gate.
    // 1 south corridor to other storage rooms.

    // 1 north corridor linking stairs.
    const northCorridorHeight = 4;
    const northCorridorRect = new Rect(0, 0, map.width, northCorridorHeight);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_HOSPITAL)!, northCorridorRect);
    map.addZone(this.makeUniqueZone('north corridor', northCorridorRect));

    // 1 corridor to storage rooms, locked by an iron gate.
    const corridorHeight = 4;
    const centralCorridorRect = new Rect(0, northCorridorRect.bottom - 1, map.width, corridorHeight);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_HOSPITAL)!, centralCorridorRect);
    map.setTileModelAt(1, centralCorridorRect.top, Models.tiles.get(TileID.FLOOR_TILES)!);
    this.mapObjectPlace(map, 1, centralCorridorRect.top, this.makeObjIronGate(GameImages.OBJ_GATE_CLOSED));
    map.addZone(this.makeUniqueZone('central corridor', centralCorridorRect));
    // storage rooms.
    const storageWidth = 5;
    const storageHeight = 4;
    const storageCentral = new Rect(2, centralCorridorRect.bottom - 1, map.width - 2, storageHeight);
    for (let roomX = storageCentral.left; roomX <= map.width - storageWidth; roomX += storageWidth - 1) {
      const room = new Rect(roomX, storageCentral.top, storageWidth, storageHeight);
      this.makeHospitalStorageRoom(map, 'storage', room);
    }
    map.setTileModelAt(1, storageCentral.top, Models.tiles.get(TileID.FLOOR_TILES)!);

    // 1 south corridor to other storage rooms.
    const southCorridorRect = new Rect(0, storageCentral.bottom - 1, map.width, corridorHeight);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_HOSPITAL)!, southCorridorRect);
    map.setTileModelAt(1, southCorridorRect.top, Models.tiles.get(TileID.FLOOR_TILES)!);
    map.addZone(this.makeUniqueZone('south corridor', southCorridorRect));
    // storage rooms.
    const storageSouth = new Rect(2, southCorridorRect.bottom - 1, map.width - 2, storageHeight);
    for (let roomX = storageSouth.left; roomX <= map.width - storageWidth; roomX += storageWidth - 1) {
      const room = new Rect(roomX, storageSouth.top, storageWidth, storageHeight);
      this.makeHospitalStorageRoom(map, 'storage', room);
    }
    map.setTileModelAt(1, storageSouth.top, Models.tiles.get(TileID.FLOOR_TILES)!);

    // Still Alive, Release 8-1: the deranged patient, who replaces Jason Myers.
    //
    // The vanilla `Jason Myers` block below is the C#'s *alpha10.1* state, in
    // which the power room was emptied and Jason moved to this corridor with five
    // `HIGH_STAMINA`. The fork replaced him: `GameActors.cs:131` reads
    // `DerangedPatient { … } //@@MP - was Jason Myers (Release 8-1)`, and
    // `BaseTownGenerator.cs` in the fork contains no `JasonMyers` at all. So the
    // two are the *same* actor slot and one feature gates both, rather than a new
    // actor appearing beside the old one.
    //
    // `HIGH_STAMINA` five times is the alpha10.1 count, noted on the block below.
    // The fork's patient gets three, in the power room.
    if (!hasFeature(Session.get().ruleset, Feature.DerangedPatient)) {
      const model = Models.actors.get(ActorID.JASON_MYERS)!;
      const jason = model.createNamed(Models.factions.get(FactionID.ThePsychopaths)!, 'Jason Myers', false, 0);
      jason.isUnique = true;
      jason.doll.addDecoration(DollPart.SKIN, GameImages.ACTOR_JASON_MYERS);
      this.giveStartingSkillToActor(jason, SkillID.TOUGH);
      this.giveStartingSkillToActor(jason, SkillID.TOUGH);
      this.giveStartingSkillToActor(jason, SkillID.TOUGH);
      this.giveStartingSkillToActor(jason, SkillID.STRONG);
      this.giveStartingSkillToActor(jason, SkillID.STRONG);
      this.giveStartingSkillToActor(jason, SkillID.STRONG);
      this.giveStartingSkillToActor(jason, SkillID.AGILE);
      this.giveStartingSkillToActor(jason, SkillID.AGILE);
      this.giveStartingSkillToActor(jason, SkillID.AGILE);
      this.giveStartingSkillToActor(jason, SkillID.HIGH_STAMINA);
      this.giveStartingSkillToActor(jason, SkillID.HIGH_STAMINA);
      this.giveStartingSkillToActor(jason, SkillID.HIGH_STAMINA);
      this.giveStartingSkillToActor(jason, SkillID.HIGH_STAMINA);
      this.giveStartingSkillToActor(jason, SkillID.HIGH_STAMINA);
      jason.inventory!.addAll(this.makeItemJasonMyersAxe());
      map.placeActor(jason, new Point(Math.floor(map.width / 2), 1));
      const jasonUnique = new UniqueActor();
      jasonUnique.theActor = jason;
      jasonUnique.isSpawned = true;
      Session.get().uniqueActors.jasonMyers = jasonUnique;
    }

    // done.
    return map;
  }

  generateHospital_Power(seed: number): GameMap {
    //////////////////
    // 1. Create map.
    // 2. Floor plan.
    // 3. Populate.
    //////////////////

    // 1. Create map.
    const map = new GameMap(seed, 'Hospital - Power', 10, 10);
    map.lighting = Lighting.DARKNESS;
    this.doForEachTile(map, map.rect, (pt) => {
      map.getTileAt(pt.x, pt.y)!.isInside = true;
    });
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_CONCRETE)!);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_BRICK)!, map.rect);

    // 2. Floor plan.
    // one narrow corridor separated from the power gen room by iron fences.
    // barricade room for the Enraged Patient.

    // corridor with fences.
    const corridor = new Rect(1, 1, 2, map.height - 1);
    map.addZone(this.makeUniqueZone('corridor', corridor));
    for (let yFence = 1; yFence < map.height - 2; yFence++) {
      this.mapObjectPlace(map, 2, yFence, this.makeObjIronFence(GameImages.OBJ_IRON_FENCE));
    }

    // power room.
    const room = new Rect(3, 0, map.width - 3, map.height);
    map.addZone(this.makeUniqueZone('power room', room));

    // power generators.
    this.doForEachTile(map, room, (pt) => {
      if (pt.x === room.left) return;
      if (!map.isWalkable(pt.x, pt.y)) return;
      if (this.countAdjWalls(map, pt) < 3) return;

      this.mapObjectPlace(map, pt.x, pt.y, this.makeObjPowerGenerator(GameImages.OBJ_POWERGEN_OFF, GameImages.OBJ_POWERGEN_ON));
    });

    // alpha10.1 emptied this room and moved Jason Myers to the storage north
    // corridor; the fork put somebody else here instead. Still Alive, Release
    // 8-1 replaced Jason Myers outright, so this is the same actor slot he
    // vacated and the same `Feature.DerangedPatient` gate governs both. There is
    // no state in which both exist, which is why it is one flag.
    //
    // The C#'s block is `BaseTownGenerator.cs:9613-9639`. The differences from
    // Jason's, all of them the reference's:
    //
    // - `GameActors.DerangedPatient`, not `JasonMyers`;
    // - the named actor is "deranged patient", not "Jason Myers" — so the name is
    //   generated *and* overwritten, and `theName` reads as a description;
    // - the skin is `ACTOR_DERANGED_PATIENT`, not `ACTOR_JASON_MYERS`;
    // - three `HIGH_STAMINA`, where the corridor's Jason gets five (alpha10.1
    //   "also upped high stamina to 5 (was 3)", so the fork's patient is back at
    //   the pre-10.1 three);
    // - a bonesaw, not an axe;
    // - placed at the room's centre, not against the north wall.
    if (hasFeature(Session.get().ruleset, Feature.DerangedPatient)) {
      const model = Models.actors.get(ActorID.DERANGED_PATIENT)!;
      const jason = model.createNamed(Models.factions.get(FactionID.ThePsychopaths)!, 'deranged patient', false, 0);
      jason.isUnique = true;
      jason.doll.addDecoration(DollPart.SKIN, GameImages.ACTOR_DERANGED_PATIENT);
      this.giveStartingSkillToActor(jason, SkillID.TOUGH);
      this.giveStartingSkillToActor(jason, SkillID.TOUGH);
      this.giveStartingSkillToActor(jason, SkillID.TOUGH);
      this.giveStartingSkillToActor(jason, SkillID.STRONG);
      this.giveStartingSkillToActor(jason, SkillID.STRONG);
      this.giveStartingSkillToActor(jason, SkillID.STRONG);
      this.giveStartingSkillToActor(jason, SkillID.AGILE);
      this.giveStartingSkillToActor(jason, SkillID.AGILE);
      this.giveStartingSkillToActor(jason, SkillID.AGILE);
      this.giveStartingSkillToActor(jason, SkillID.HIGH_STAMINA);
      this.giveStartingSkillToActor(jason, SkillID.HIGH_STAMINA);
      this.giveStartingSkillToActor(jason, SkillID.HIGH_STAMINA);
      jason.inventory!.addAll(this.makeItemBonesaw());
      map.placeActor(jason, new Point(Math.floor(map.width / 2), Math.floor(map.height / 2)));
      const unique = new UniqueActor();
      unique.theActor = jason;
      unique.isSpawned = true;
      Session.get().uniqueActors.derangedPatient = unique;
    }

    // done.
    return map;
  }

  createNewHospitalPatient(spawnTime: number): Actor {
    void spawnTime;

    // decide model.
    const model = this.m_Rules.roll(0, 2) === 0 ? Models.actors.get(ActorID.MALE_CIVILIAN)! : Models.actors.get(ActorID.FEMALE_CIVILIAN)!;

    // create.
    const patient = model.createNumberedName(Models.factions.get(FactionID.TheCivilians)!, 0);
    this.skinNakedHuman(this.m_DiceRoller, patient);
    this.giveNameToActor(this.m_DiceRoller, patient);
    patient.name = 'Patient ' + patient.name;
    //patient.Controller = new CivilianAI();  // alpha10.1 defined by model like other actors

    // skills.
    this.giveRandomSkillsToActor(this.m_DiceRoller, patient, 1);

    // add patient uniform.
    patient.doll.addDecoration(DollPart.TORSO, GameImages.HOSPITAL_PATIENT_UNIFORM);

    // done.
    return patient;
  }

  createNewHospitalNurse(spawnTime: number): Actor {
    void spawnTime;

    // create.
    const nurse = Models.actors.get(ActorID.FEMALE_CIVILIAN)!.createNumberedName(Models.factions.get(FactionID.TheCivilians)!, 0);
    this.skinNakedHuman(this.m_DiceRoller, nurse);
    this.giveNameToActor(this.m_DiceRoller, nurse);
    nurse.name = 'Nurse ' + nurse.name;
    //nurse.Controller = new CivilianAI(); // alpha10.1 defined by model like other actors

    // add uniform.
    nurse.doll.addDecoration(DollPart.TORSO, GameImages.HOSPITAL_NURSE_UNIFORM);

    // skills : 1 + 1-Medic.
    this.giveRandomSkillsToActor(this.m_DiceRoller, nurse, 1);
    this.giveStartingSkillToActor(nurse, SkillID.MEDIC);

    // items : bandages.
    nurse.inventory!.addAll(this.makeItemBandages());

    // done.
    return nurse;
  }

  createNewHospitalDoctor(spawnTime: number): Actor {
    void spawnTime;

    // create.
    const doctor = Models.actors.get(ActorID.MALE_CIVILIAN)!.createNumberedName(Models.factions.get(FactionID.TheCivilians)!, 0);
    this.skinNakedHuman(this.m_DiceRoller, doctor);
    this.giveNameToActor(this.m_DiceRoller, doctor);
    doctor.name = 'Doctor ' + doctor.name;
    //doctor.Controller = new CivilianAI(); // alpha10.1 defined by model like other actors

    // add uniform.
    doctor.doll.addDecoration(DollPart.TORSO, GameImages.HOSPITAL_DOCTOR_UNIFORM);

    // skills : 1 + 3-Medic + 1-Leadership.
    this.giveRandomSkillsToActor(this.m_DiceRoller, doctor, 1);
    this.giveStartingSkillToActor(doctor, SkillID.MEDIC);
    this.giveStartingSkillToActor(doctor, SkillID.MEDIC);
    this.giveStartingSkillToActor(doctor, SkillID.MEDIC);
    this.giveStartingSkillToActor(doctor, SkillID.LEADERSHIP);

    // items : medikit + bandages.
    doctor.inventory!.addAll(this.makeItemMedikit());
    doctor.inventory!.addAll(this.makeItemBandages());

    // done.
    return doctor;
  }

  makeHospitalPatientRoom(map: GameMap, baseZoneName: string, room: Rect, isFacingEast: boolean): void {
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_HOSPITAL)!, room);
    map.addZone(this.makeUniqueZone(baseZoneName, room));

    const xDoor = isFacingEast ? room.right - 1 : room.left;

    // door in the corner.
    this.placeDoor(map, xDoor, room.top + 1, Models.tiles.get(TileID.FLOOR_TILES)!, this.makeObjHospitalDoor());

    // bed in the middle in the south.
    const bedPos = new Point(room.left + Math.floor(room.width / 2), room.bottom - 2);
    this.mapObjectPlace(map, bedPos.x, bedPos.y, this.makeObjBed(GameImages.OBJ_HOSPITAL_BED));

    // chair and nighttable on either side of the bed.
    this.mapObjectPlace(map, isFacingEast ? bedPos.x + 1 : bedPos.x - 1, bedPos.y, this.makeObjChair(GameImages.OBJ_HOSPITAL_CHAIR));
    const tablePos = new Point(isFacingEast ? bedPos.x - 1 : bedPos.x + 1, bedPos.y);
    this.mapObjectPlace(map, tablePos.x, tablePos.y, this.makeObjNightTable(GameImages.OBJ_HOSPITAL_NIGHT_TABLE));

    // chance of some meds/food/book on nightable.
    if (this.m_DiceRoller.rollChance(50)) {
      const roll = this.m_DiceRoller.roll(0, 3);
      let it: Item | null = null;
      switch (roll) {
        case 0:
          it = this.makeShopPharmacyItem();
          break;
        case 1:
          it = this.makeItemGroceries();
          break;
        case 2:
          it = this.makeItemBook();
          break;
      }
      if (it !== null) map.dropItemAt(it, tablePos);
    }

    // wardrobe in the corner.
    this.mapObjectPlace(map, isFacingEast ? room.left + 1 : room.right - 2, room.top + 1, this.makeObjWardrobe(GameImages.OBJ_HOSPITAL_WARDROBE));
  }

  makeHospitalOfficeRoom(map: GameMap, baseZoneName: string, room: Rect, isFacingEast: boolean): void {
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_PLANKS)!, room);
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_HOSPITAL)!, room);
    map.addZone(this.makeUniqueZone(baseZoneName, room));

    const xDoor = isFacingEast ? room.right - 1 : room.left;
    const yDoor = room.top + 2;

    // door in the middle.
    this.placeDoor(map, xDoor, yDoor, Models.tiles.get(TileID.FLOOR_TILES)!, this.makeObjWoodenDoor());

    // chairs and table facing the door.
    const xTable = isFacingEast ? room.left + 2 : room.right - 3;
    this.mapObjectPlace(map, xTable, yDoor, this.makeObjTable(GameImages.OBJ_TABLE));
    this.mapObjectPlace(map, xTable - 1, yDoor, this.makeObjChair(GameImages.OBJ_CHAIR));
    this.mapObjectPlace(map, xTable + 1, yDoor, this.makeObjChair(GameImages.OBJ_CHAIR));
  }

  makeHospitalStorageRoom(map: GameMap, baseZoneName: string, room: Rect): void {
    this.tileRectangle(map, Models.tiles.get(TileID.WALL_HOSPITAL)!, room);
    map.addZone(this.makeUniqueZone(baseZoneName, room));

    // door.
    this.placeDoor(map, room.left + 2, room.top, Models.tiles.get(TileID.FLOOR_TILES)!, this.makeObjHospitalDoor());

    // shelves with meds or food.
    this.doForEachTile(map, room, (pt) => {
      if (!map.isWalkable(pt.x, pt.y)) return;

      if (this.countAdjDoors(map, pt.x, pt.y) > 0) return;

      // shelf.
      this.mapObjectPlace(map, pt.x, pt.y, this.makeObjShelf(GameImages.OBJ_SHOP_SHELF));

      // full stacks of meds or canned food.
      const it = this.m_DiceRoller.rollChance(80) ? this.makeHospitalItem() : this.makeItemCannedFood();
      if (it.model.isStackable) it.quantity = it.model.stackingLimit;
      map.dropItemAt(it, pt);
    });

    // alpha10
    // chance to spawn a nurse
    if (this.m_DiceRoller.rollChance(20)) {
      // alpha10.1 increased to 20% (avg 5 nurses for 24 storage rooms)
      let spawnedActor = false;
      this.doForEachTile(map, room, (pt) => {
        if (spawnedActor) return;
        if (!map.isWalkable(pt.x, pt.y)) return;
        if (map.getMapObjectAt(pt.x, pt.y) !== null) return;
        map.placeActor(this.createNewHospitalNurse(0), pt);
        spawnedActor = true;
      });
    }
  }

  giveRandomItemToActor(roller: DiceRoller, actor: Actor, spawnTime: number): void {
    let it: Item | null = null;

    // rare item chance after Day X
    const day = new WorldTime(spawnTime).day;
    if (day > Rules.GIVE_RARE_ITEM_DAY && roller.rollChance(Rules.GIVE_RARE_ITEM_CHANCE)) {
      const roll = roller.roll(0, 6);
      switch (roll) {
        case 0:
          it = this.makeItemGrenade();
          break;
        case 1:
          it = this.makeItemArmyBodyArmor();
          break;
        case 2:
          it = this.makeItemHeavyPistolAmmo();
          break;
        case 3:
          it = this.makeItemHeavyRifleAmmo();
          break;
        case 4:
          it = this.makeItemPillsAntiviral();
          break;
        case 5:
          it = this.makeItemCombatKnife();
          break;
        default:
          it = null;
          break;
      }
    } else {
      // standard item.
      const roll = roller.roll(0, 10);
      switch (roll) {
        case 0:
          it = this.makeRandomShopItem(ShopType.CONSTRUCTION);
          break;
        case 1:
          it = this.makeRandomShopItem(ShopType.GENERAL_STORE);
          break;
        case 2:
          it = this.makeRandomShopItem(ShopType.GROCERY);
          break;
        case 3:
          it = this.makeRandomShopItem(ShopType.GUNSHOP);
          break;
        case 4:
          it = this.makeRandomShopItem(ShopType.PHARMACY);
          break;
        case 5:
          it = this.makeRandomShopItem(ShopType.SPORTSWEAR);
          break;
        case 6:
          it = this.makeRandomShopItem(ShopType.HUNTING);
          break;
        case 7:
          it = this.makeRandomParkItem();
          break;
        case 8:
          it = this.makeRandomBedroomItem();
          break;
        case 9:
          it = this.makeRandomKitchenItem();
          break;
        default:
          it = null;
          break;
      }
    }

    if (it != null) actor.inventory!.addAll(it);
  }

  createNewRefugee(spawnTime: number, itemsToCarry: number): Actor {
    let newRefugee: Actor;

    // civilian, policeman?
    if (this.m_DiceRoller.rollChance(this.params.policemanChance)) {
      newRefugee = this.createNewPoliceman(spawnTime);
      // add random items.
      for (let i = 0; i < itemsToCarry && newRefugee.inventory!.countItems < newRefugee.inventory!.maxCapacity; i++)
        this.giveRandomItemToActor(this.m_DiceRoller, newRefugee, spawnTime);
    } else {
      newRefugee = this.createNewCivilian(spawnTime, itemsToCarry, 1);
    }

    // give skills : 1 per day + 1 for starting.
    const nbSkills = 1 + new WorldTime(spawnTime).day;
    this.giveRandomSkillsToActor(this.m_DiceRoller, newRefugee, nbSkills);

    // done.
    return newRefugee;
  }

  createNewSurvivor(spawnTime: number): Actor {
    // decide model.
    const isMale = this.m_Rules.roll(0, 2) === 0;
    const model = isMale ? Models.actors.get(ActorID.MALE_CIVILIAN)! : Models.actors.get(ActorID.FEMALE_CIVILIAN)!;

    // create.
    const survivor = model.createNumberedName(Models.factions.get(FactionID.TheSurvivors)!, spawnTime);

    // setup.
    this.giveNameToActor(this.m_DiceRoller, survivor);
    this.dressCivilian(this.m_DiceRoller, survivor);
    survivor.doll.addDecoration(DollPart.HEAD, isMale ? GameImages.SURVIVOR_MALE_BANDANA : GameImages.SURVIVOR_FEMALE_BANDANA);

    // give items, good survival gear (7 items).
    // 1,2   1 can of food, 1 amr.
    survivor.inventory!.addAll(this.makeItemCannedFood());
    survivor.inventory!.addAll(this.makeItemArmyRation());
    // 3,4. 1 fire weapon with 1 ammo box or grenade.
    if (this.m_DiceRoller.rollChance(50)) {
      survivor.inventory!.addAll(this.makeItemArmyRifle());
      if (this.m_DiceRoller.rollChance(50)) survivor.inventory!.addAll(this.makeItemHeavyRifleAmmo());
      else survivor.inventory!.addAll(this.makeItemGrenade());
    } else {
      survivor.inventory!.addAll(this.makeItemShotgun());
      if (this.m_DiceRoller.rollChance(50)) survivor.inventory!.addAll(this.makeItemShotgunAmmo());
      else survivor.inventory!.addAll(this.makeItemGrenade());
    }
    // 5    1 healing item.
    survivor.inventory!.addAll(this.makeItemMedikit());

    // 6    1 pill item.
    switch (this.m_DiceRoller.roll(0, 3)) {
      case 0:
        survivor.inventory!.addAll(this.makeItemPillsSLP());
        break;
      case 1:
        survivor.inventory!.addAll(this.makeItemPillsSTA());
        break;
      case 2:
        survivor.inventory!.addAll(this.makeItemPillsSAN());
        break;
    }
    // 7    1 armor.
    survivor.inventory!.addAll(this.makeItemArmyBodyArmor());

    // give skills : 1 per day + 5 as bonus.
    const nbSkills = 3 + new WorldTime(spawnTime).day;
    this.giveRandomSkillsToActor(this.m_DiceRoller, survivor, nbSkills);

    // AI.
    //survivor.controller = new CivilianAI(); // alpha10.1 defined by model like other actors

    // slightly randomize Food and Sleep - 0..25%.
    const foodDeviation = Math.floor(0.25 * survivor.foodPoints);
    survivor.foodPoints = survivor.foodPoints - this.m_Rules.roll(0, foodDeviation);
    const sleepDeviation = Math.floor(0.25 * survivor.sleepPoints);
    survivor.sleepPoints = survivor.sleepPoints - this.m_Rules.roll(0, sleepDeviation);

    // done.
    return survivor;
  }

  createNewNakedHuman(spawnTime: number, itemsToCarry: number, skills: number): Actor {
    // C# does not use itemsToCarry/skills here.
    void itemsToCarry;
    void skills;

    // decide model.
    const model = this.m_Rules.roll(0, 2) === 0 ? Models.actors.get(ActorID.MALE_CIVILIAN)! : Models.actors.get(ActorID.FEMALE_CIVILIAN)!;

    // create.
    const civilian = model.createNumberedName(Models.factions.get(FactionID.TheCivilians)!, spawnTime);

    // done.
    return civilian;
  }

  createNewCivilian(spawnTime: number, itemsToCarry: number, skills: number): Actor {
    // decide model.
    const model = this.m_Rules.roll(0, 2) === 0 ? Models.actors.get(ActorID.MALE_CIVILIAN)! : Models.actors.get(ActorID.FEMALE_CIVILIAN)!;

    // create.
    const civilian = model.createNumberedName(Models.factions.get(FactionID.TheCivilians)!, spawnTime);

    // setup.
    this.dressCivilian(this.m_DiceRoller, civilian);
    this.giveNameToActor(this.m_DiceRoller, civilian);
    for (let i = 0; i < itemsToCarry; i++) this.giveRandomItemToActor(this.m_DiceRoller, civilian, spawnTime);
    this.giveRandomSkillsToActor(this.m_DiceRoller, civilian, skills);
    //civilian.controller = new CivilianAI();  // alpha10.1 defined by model like other actors

    // slightly randomize Food and Sleep - 0..25%.
    const foodDeviation = Math.floor(0.25 * civilian.foodPoints);
    civilian.foodPoints = civilian.foodPoints - this.m_Rules.roll(0, foodDeviation);
    const sleepDeviation = Math.floor(0.25 * civilian.sleepPoints);
    civilian.sleepPoints = civilian.sleepPoints - this.m_Rules.roll(0, sleepDeviation);

    // done.
    return civilian;
  }

  createNewPoliceman(spawnTime: number): Actor {
    // model.
    const model = Models.actors.get(ActorID.POLICEMAN)!;

    // create.
    const newCop = model.createNumberedName(Models.factions.get(FactionID.ThePolice)!, spawnTime);

    // setup.
    this.dressPolice(this.m_DiceRoller, newCop);
    this.giveNameToActor(this.m_DiceRoller, newCop);
    newCop.name = 'Cop ' + newCop.name;
    this.giveRandomSkillsToActor(this.m_DiceRoller, newCop, 1);
    this.giveStartingSkillToActor(newCop, SkillID.FIREARMS);
    this.giveStartingSkillToActor(newCop, SkillID.LEADERSHIP);
    //newCop.controller = new CivilianAI(); // alpha10.1 defined by model like other actors

    // give items.
    if (this.m_DiceRoller.rollChance(50)) {
      // pistol
      newCop.inventory!.addAll(this.makeItemPistol());
      newCop.inventory!.addAll(this.makeItemLightPistolAmmo());
    } else {
      // shoty
      newCop.inventory!.addAll(this.makeItemShotgun());
      newCop.inventory!.addAll(this.makeItemShotgunAmmo());
    }
    newCop.inventory!.addAll(this.makeItemTruncheon());
    newCop.inventory!.addAll(this.makeItemFlashlight());
    newCop.inventory!.addAll(this.makeItemPoliceRadio());
    if (this.m_DiceRoller.rollChance(50)) {
      if (this.m_DiceRoller.rollChance(80)) newCop.inventory!.addAll(this.makeItemPoliceJacket());
      else newCop.inventory!.addAll(this.makeItemPoliceRiotArmor());
    }

    // done.
    return newCop;
  }

  createNewUndead(spawnTime: number): Actor {
    let newUndead: Actor;

    if (Rules.hasAllZombies(Session.get().gameMode)) {
      // decide model.
      const chance = this.m_Rules.roll(0, 100);
      const undeadModel =
        chance < Options.spawnSkeletonChance
          ? Models.actors.get(ActorID.UNDEAD_SKELETON)!
          : chance < Options.spawnSkeletonChance + Options.spawnZombieChance
            ? Models.actors.get(ActorID.UNDEAD_ZOMBIE)!
            : chance < Options.spawnSkeletonChance + Options.spawnZombieChance + Options.spawnZombieMasterChance
              ? Models.actors.get(ActorID.UNDEAD_ZOMBIE_MASTER)!
              : Models.actors.get(ActorID.UNDEAD_SKELETON)!;

      // create.
      newUndead = undeadModel.createNumberedName(Models.factions.get(FactionID.TheUndeads)!, spawnTime);
    } else {
      // zombified.
      newUndead = this.makeZombified(null, this.createNewCivilian(spawnTime, 0, 0), spawnTime);
      // skills?
      const time = new WorldTime(spawnTime);
      const nbSkills = Math.floor(time.day / 2);
      if (nbSkills > 0) {
        for (let i = 0; i < nbSkills; i++) {
          const zombifiedSkill = this.m_Game.ZombifySkill(this.m_Rules.roll(0, SkillID._COUNT) as SkillID);
          if (zombifiedSkill != null) this.m_Game.SkillUpgrade(newUndead, zombifiedSkill);
        }
        this.recomputeActorStartingStats(newUndead);
      }
    }

    // done.
    return newUndead;
  }

  makeZombified(zombifier: Actor | null, deadVictim: Actor, turn: number): Actor {
    // create actor.
    const zombiefiedName = `${deadVictim.unmodifiedName}'s zombie`;
    const zombiefiedModel = deadVictim.doll.body.isMale
      ? Models.actors.get(ActorID.UNDEAD_MALE_ZOMBIFIED)!
      : Models.actors.get(ActorID.UNDEAD_FEMALE_ZOMBIFIED)!;
    const zombieFaction = zombifier === null ? Models.factions.get(FactionID.TheUndeads)! : zombifier.faction;
    const newZombie = zombiefiedModel.createNamed(zombieFaction, zombiefiedName, deadVictim.isPluralName, turn);

    // dress as victim.
    for (let p = DollPart._FIRST; p < DollPart._COUNT; p++) {
      const partDecos = deadVictim.doll.getDecorations(p);
      if (partDecos != null) {
        for (const deco of partDecos) newZombie.doll.addDecoration(p, deco);
      }
    }

    // add blood.
    newZombie.doll.addDecoration(DollPart.TORSO, GameImages.BLOODIED);

    return newZombie;
  }

  createNewSewersUndead(spawnTime: number): Actor {
    if (!Rules.hasAllZombies(Session.get().gameMode)) return this.createNewUndead(spawnTime);

    // decide model.
    const undeadModel = this.m_DiceRoller.rollChance(80) ? Models.actors.get(ActorID.UNDEAD_RAT_ZOMBIE)! : Models.actors.get(ActorID.UNDEAD_ZOMBIE)!;

    // create.
    const newUndead = undeadModel.createNumberedName(Models.factions.get(FactionID.TheUndeads)!, spawnTime);

    // done.
    return newUndead;
  }

  createNewBasementRatZombie(spawnTime: number): Actor {
    if (!Rules.hasAllZombies(Session.get().gameMode)) return this.createNewUndead(spawnTime);

    return Models.actors.get(ActorID.UNDEAD_RAT_ZOMBIE)!.createNumberedName(Models.factions.get(FactionID.TheUndeads)!, spawnTime);
  }

  createNewSubwayUndead(spawnTime: number): Actor {
    if (!Rules.hasAllZombies(Session.get().gameMode)) return this.createNewUndead(spawnTime);

    // standard zombies.
    const undeadModel = Models.actors.get(ActorID.UNDEAD_ZOMBIE)!;

    // create.
    const newUndead = undeadModel.createNumberedName(Models.factions.get(FactionID.TheUndeads)!, spawnTime);

    // done.
    return newUndead;
  }

  createNewCHARGuard(spawnTime: number): Actor {
    // model.
    const model = Models.actors.get(ActorID.CHAR_GUARD)!;

    // create.
    const newGuard = model.createNumberedName(Models.factions.get(FactionID.TheCHARCorporation)!, spawnTime);

    // setup.
    this.dressCHARGuard(this.m_DiceRoller, newGuard);
    this.giveNameToActor(this.m_DiceRoller, newGuard);
    newGuard.name = 'Gd. ' + newGuard.name;

    // give items.
    newGuard.inventory!.addAll(this.makeItemShotgun());
    newGuard.inventory!.addAll(this.makeItemShotgunAmmo());
    newGuard.inventory!.addAll(this.makeItemCHARLightBodyArmor());

    // done.
    return newGuard;
  }

  /**
   * Still Alive, Release 8-1 (`BaseTownGenerator.cs:11754-11796`).
   *
   * One member of `Feature.CHARResearchRaid`'s landing team. The raid spawns this
   * once as the leader and three more times as colleagues, all on the same factory
   * — the C# has no separate "colleague" variant, only the `"Dr. "` name prefix to
   * tell the ranks apart, and it is this factory's output that decides which is
   * which.
   */
  createNewCHARScientist(spawnTime: number): Actor {
    // model.
    const model = Models.actors.get(ActorID.CHAR_SCIENTIST)!;

    // create.
    const newScientist = model.createNumberedName(Models.factions.get(FactionID.TheCHARCorporation)!, spawnTime);

    // setup.
    this.dressCHARScientist(this.m_DiceRoller, newScientist);
    this.giveNameToActor(this.m_DiceRoller, newScientist);
    newScientist.name = 'Dr. ' + newScientist.name;

    // starting skills. Each of the three is called once per point, so HAULER is at
    // level 3, NECROLOGY at 5 and STRONG_PSYCHE at 2 -- the C# spells this out as
    // repeated calls rather than a count, and so does this.
    this.giveStartingSkillToActor(newScientist, SkillID.HAULER);
    this.giveStartingSkillToActor(newScientist, SkillID.HAULER);
    this.giveStartingSkillToActor(newScientist, SkillID.HAULER);
    this.giveStartingSkillToActor(newScientist, SkillID.NECROLOGY);
    this.giveStartingSkillToActor(newScientist, SkillID.NECROLOGY);
    this.giveStartingSkillToActor(newScientist, SkillID.NECROLOGY);
    this.giveStartingSkillToActor(newScientist, SkillID.NECROLOGY);
    this.giveStartingSkillToActor(newScientist, SkillID.NECROLOGY);
    this.giveStartingSkillToActor(newScientist, SkillID.STRONG_PSYCHE);
    this.giveStartingSkillToActor(newScientist, SkillID.STRONG_PSYCHE);

    // give items.
    newScientist.inventory!.addAll(this.makeItemCHARLaptop());
    newScientist.inventory!.addAll(this.makeItemZTracker());
    newScientist.inventory!.addAll(this.makeItemPistol());
    newScientist.inventory!.addAll(this.makeItemLightPistolAmmo());
    newScientist.inventory!.addAll(this.makeItemArmyRation());
    newScientist.inventory!.addAll(this.makeItemArmyRation());
    newScientist.inventory!.addAll(this.makeItemArmyRation());
    newScientist.inventory!.addAll(this.makeItemBiohazardSuit());
    newScientist.inventory!.addAll(this.makeItemBigFlashlight());

    // Antiviral pills exist in the corpses/infection ruleset and, in Vintage, when
    // the player option is on; elsewhere a large medikit stands in. The C# asks
    // `Rules.HasAntiviralPills(mode)` (`Rules.cs:5760-5769`); that helper is not in
    // the port yet and `Rules` is not this slice's file, so the test is inlined
    // rather than duplicating a `Rules` method that will land with the rest of
    // Release 7-6. The second clause — `GM_VINTAGE && RogueGame.Options.AntiviralPills`
    // — is dropped because the port has no `AntiviralPills` option, so Vintage takes
    // the medikit branch too. Once the helper exists this collapses back to it.
    if (Session.get().gameMode === GameMode.GM_CORPSES_INFECTION) {
      newScientist.inventory!.addAll(this.makeItemPillsAntiviral());
    } else {
      newScientist.inventory!.addAll(this.makeItemLargeMedikit());
    }

    // done.
    return newScientist;
  }

  createNewArmyNationalGuard(spawnTime: number, rankName: string): Actor {
    // model.
    const model = Models.actors.get(ActorID.ARMY_NATIONAL_GUARD)!;

    // create.
    const newNat = model.createNumberedName(Models.factions.get(FactionID.TheArmy)!, spawnTime);

    // setup.
    this.dressArmy(this.m_DiceRoller, newNat);
    this.giveNameToActor(this.m_DiceRoller, newNat);
    newNat.name = rankName + ' ' + newNat.name;

    // give items 6/7.
    newNat.inventory!.addAll(this.makeItemArmyRifle());
    newNat.inventory!.addAll(this.makeItemHeavyRifleAmmo());
    newNat.inventory!.addAll(this.makeItemArmyPistol());
    newNat.inventory!.addAll(this.makeItemHeavyPistolAmmo());
    newNat.inventory!.addAll(this.makeItemArmyBodyArmor());
    const planks = this.makeItemWoodenPlank();
    planks.quantity = Models.items.get(ItemID.BAR_WOODEN_PLANK)!.stackingLimit;
    newNat.inventory!.addAll(planks);

    // skills : carpentry for building small barricades.
    // alpha10 and firearms
    this.giveStartingSkillToActor(newNat, SkillID.CARPENTRY);
    this.giveStartingSkillToActor(newNat, SkillID.FIREARMS);

    // give skills : 1 per day after min arrival date.
    const nbSkills = new WorldTime(spawnTime).day - NATGUARD_DAY;
    if (nbSkills > 0) this.giveRandomSkillsToActor(this.m_DiceRoller, newNat, nbSkills);

    // done.
    return newNat;
  }

  createNewBikerMan(spawnTime: number, gangId: GangID): Actor {
    // decide model.
    const model = Models.actors.get(ActorID.BIKER_MAN)!;

    // create.
    const newBiker = model.createNumberedName(Models.factions.get(FactionID.TheBikers)!, spawnTime);

    // setup.
    newBiker.gangId = gangId;
    this.dressBiker(this.m_DiceRoller, newBiker);
    this.giveNameToActor(this.m_DiceRoller, newBiker);
    newBiker.controller = new GangAI();

    // give items.
    newBiker.inventory!.addAll(this.m_DiceRoller.rollChance(50) ? this.makeItemCrowbar() : this.makeItemBaseballBat());
    newBiker.inventory!.addAll(this.makeItemBikerGangJacket(gangId));

    // give skills : 1 per day after min arrival date.
    const nbSkills = new WorldTime(spawnTime).day - BIKERS_RAID_DAY;
    if (nbSkills > 0) this.giveRandomSkillsToActor(this.m_DiceRoller, newBiker, nbSkills);

    // done.
    return newBiker;
  }

  createNewGangstaMan(spawnTime: number, gangId: GangID): Actor {
    // decide model.
    const model = Models.actors.get(ActorID.GANGSTA_MAN)!;

    // create.
    const newGangsta = model.createNumberedName(Models.factions.get(FactionID.TheGangstas)!, spawnTime);

    // setup.
    newGangsta.gangId = gangId;
    this.dressGangsta(this.m_DiceRoller, newGangsta);
    this.giveNameToActor(this.m_DiceRoller, newGangsta);
    newGangsta.controller = new GangAI();

    // give items.
    newGangsta.inventory!.addAll(this.m_DiceRoller.rollChance(50) ? this.makeItemRandomPistol() : this.makeItemBaseballBat());

    // give skills : 1 per day after min arrival date.
    const nbSkills = new WorldTime(spawnTime).day - GANGSTAS_RAID_DAY;
    if (nbSkills > 0) this.giveRandomSkillsToActor(this.m_DiceRoller, newGangsta, nbSkills);

    // done.
    return newGangsta;
  }

  createNewBlackOps(spawnTime: number, rankName: string): Actor {
    // model.
    const model = Models.actors.get(ActorID.BLACKOPS_MAN)!;

    // create.
    const newBO = model.createNumberedName(Models.factions.get(FactionID.TheBlackOps)!, spawnTime);

    // setup.
    this.dressBlackOps(this.m_DiceRoller, newBO);
    this.giveNameToActor(this.m_DiceRoller, newBO);
    newBO.name = rankName + ' ' + newBO.name;

    // give items.
    newBO.inventory!.addAll(this.makeItemPrecisionRifle());
    newBO.inventory!.addAll(this.makeItemHeavyRifleAmmo());
    newBO.inventory!.addAll(this.makeItemArmyPistol());
    newBO.inventory!.addAll(this.makeItemHeavyPistolAmmo());
    newBO.inventory!.addAll(this.makeItemBlackOpsGPS());

    // done.
    return newBO;
  }

  /**
   * C# `BaseTownGenerator.cs:11957-11970` `CreateNewFeralDog(spawnTime)`.
   *
   * The only actor factory a *building* generator reaches, and it reaches this
   * one through `placement()` rather than through `this`: see
   * `TownBuildingContext.createNewFeralDog`. The ten kennel dogs of the animal
   * shelter (`:4230`) are its only callers outside this class, and the one roll
   * `skinDog` spends comes off `m_DiceRoller` — the district's roller — which is
   * what keeps them interleaved with the rest of the block's generation instead
   * of being a tenth of the world silently generating from somewhere else.
   */
  createNewFeralDog(spawnTime: number): Actor {
    // model
    const newDog = Models.actors.get(ActorID.FERAL_DOG)!.createNumberedName(Models.factions.get(FactionID.TheFerals)!, spawnTime);

    // skin
    this.skinDog(this.m_DiceRoller, newDog);

    // done.
    return newDog;
  }

  addExit(from: GameMap, fromPosition: Point, to: GameMap | null, toPosition: Point, exitImageID: string, isAnAIExit: boolean): void {
    const e = new Exit(to, toPosition);
    e.isAnAIExit = isAnAIExit;
    from.addExit(fromPosition, e);
    from.getTileAt(fromPosition.x, fromPosition.y)!.addDecoration(exitImageID);
  }

  makeWalkwayZones(map: GameMap, b: Block): void {
    makeWalkwayZonesOn(this.placement(), map, b);
  }
}
