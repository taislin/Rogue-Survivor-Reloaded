/**
 * Town building seam.
 *
 * `BaseTownGenerator` is where the C# keeps all fourteen of its building
 * generators, and at 5 800 lines it has no reviewable seam left: appending a
 * building means appending 200-300 lines to the same class, so two agents
 * cannot write two buildings at once and a change to one is unreviewable
 * against the other thirteen.
 *
 * This module is that seam. A building generator is **a new file exporting one
 * function**, handed a {@link TownBuildingContext} and nothing else -- not
 * `this`, not the 5 800-line class. The context is a narrow, explicit
 * interface: the block being built, the district's dice roller, the map, and
 * the placement primitives every building needs.
 *
 * ## Writing a new building
 *
 * ```ts
 * // src/gameplay/generators/buildings/MakeLibraryBuilding.ts
 * import { Models } from '@data/Models';
 * import { TileID } from '@gameplay/GameTiles';
 * import { GameImages } from '@gameplay/GameImages';
 * import type { TownBuildingContext } from '../TownBuilding';
 *
 * // C# `BaseTownGenerator.cs:1908` `MakeLibraryBuilding`.
 * export function makeLibraryBuilding(ctx: TownBuildingContext): boolean {
 *   const { map, block } = ctx;
 *   if (block.insideRect.width < 5 || block.insideRect.height < 5) return false;
 *
 *   ctx.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, block.rectangle);
 *   ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_STONE)!, block.buildingRect);
 *   ctx.placeDoor(map, block.buildingRect.left, ..., ..., ctx.makeObjGlassDoor());
 *   ctx.makeUniqueZone('library', block.buildingRect);
 *   ctx.makeWalkwayZones(map, block);
 *   return true;
 * }
 * ```
 *
 * then one line in {@link TOWN_BUILDING_PASSES}, and nothing else changes:
 *
 * ```ts
 * export const TOWN_BUILDING_PASSES: TownBuildingPass[] = [
 *   { csharpName: 'MakeLibraryBuilding', tryBuild: makeLibraryBuilding },
 * ];
 * ```
 *
 * ## What is deliberately NOT here
 *
 * **Furniture and items.** The `makeObj*` / `makeItem*` families
 * (`BaseMapGenerator.ts:410-1130`) are `protected`, so a building in its own
 * file cannot call them at all. Only the six door and window factories are on
 * the context, because `placeDoor` -- 76 call sites today, 135 in the C# -- is
 * useless without them. Anything else a building needs is added to the context
 * when a building needs it, which is two lines in this file plus one in
 * `BaseTownGenerator.placement()`: the context is a list of things buildings
 * have actually asked for, not a mirror of the class.
 *
 * `placeIf`, `placeDoorIfNoObject`, `isAccessible` and `hasNoObjectAt` are left
 * on the generator for the same reason. Each has one caller in the port
 * (`makeHousingRoom`, `placeDoorIfAccessibleAndNotAdjacent`) and no call site
 * in the thirteen C# buildings still to come, so putting them here would be the
 * speculative abstraction the port plan warns against.
 *
 * **The C#'s per-block roll cascade.** See {@link TownBuildingPass}.
 */

import type { Actor } from '@data/Actor';
import type { District } from '@data/District';
import type { Item } from '@data/Item';
import type { Map as GameMap } from '@data/Map';
import type { MapObject } from '@data/MapObject';
import type { TileModel } from '@data/TileModel';
import type { Zone } from '@data/Zone';
import type { DiceRoller } from '@engine/DiceRoller';
import type { TileDecoratorFn } from '@engine/MapGenerator';
import type { Point } from '@engine/Point';
import { Rect } from '@engine/Rect';
import type { DoorWindow } from '@engine/mapobjects/MapObjects';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

// ── Constants (RogueGame.MAP_MAX_WIDTH/HEIGHT) ──────────────────────────────
const MAP_MAX_WIDTH = 100;
const MAP_MAX_HEIGHT = 100;

/** C# `BaseTownGenerator.cs` district generation parameters, `:92-207`. */
export class Parameters {
  district: District | null = null;
  generatePoliceStation: boolean = false;
  generateHospital: boolean = false;

  private m_MapWidth: number = MAP_MAX_WIDTH;
  private m_MapHeight: number = MAP_MAX_HEIGHT;
  private m_MinBlockSize: number = 11;
  private m_WreckedCarChance: number = 10;
  private m_ShopBuildingChance: number = 10;
  private m_ParkBuildingChance: number = 10;
  private m_CHARBuildingChance: number = 10;
  private m_PostersChance: number = 2;
  private m_TagsChance: number = 2;
  private m_ItemInShopShelfChance: number = 100;
  private m_PolicemanChance: number = 15;

  get mapWidth(): number {
    return this.m_MapWidth;
  }

  set mapWidth(value: number) {
    if (value <= 0 || value > MAP_MAX_WIDTH) throw new RangeError('MapWidth');
    this.m_MapWidth = value;
  }

  get mapHeight(): number {
    return this.m_MapHeight;
  }

  set mapHeight(value: number) {
    if (value <= 0 || value > MAP_MAX_HEIGHT) throw new RangeError('MapHeight');
    this.m_MapHeight = value;
  }

  get minBlockSize(): number {
    return this.m_MinBlockSize;
  }

  set minBlockSize(value: number) {
    if (value < 4 || value > 32) throw new RangeError('MinBlockSize must be [4..32]');
    this.m_MinBlockSize = value;
  }

  get wreckedCarChance(): number {
    return this.m_WreckedCarChance;
  }

  set wreckedCarChance(value: number) {
    if (value < 0 || value > 100) throw new RangeError('WreckedCarChance must be [0..100]');
    this.m_WreckedCarChance = value;
  }

  get shopBuildingChance(): number {
    return this.m_ShopBuildingChance;
  }

  set shopBuildingChance(value: number) {
    if (value < 0 || value > 100) throw new RangeError('ShopBuildingChance must be [0..100]');
    this.m_ShopBuildingChance = value;
  }

  get parkBuildingChance(): number {
    return this.m_ParkBuildingChance;
  }

  set parkBuildingChance(value: number) {
    if (value < 0 || value > 100) throw new RangeError('ParkBuildingChance must be [0..100]');
    this.m_ParkBuildingChance = value;
  }

  get charBuildingChance(): number {
    return this.m_CHARBuildingChance;
  }

  set charBuildingChance(value: number) {
    if (value < 0 || value > 100) throw new RangeError('CHARBuildingChance must be [0..100]');
    this.m_CHARBuildingChance = value;
  }

  get postersChance(): number {
    return this.m_PostersChance;
  }

  set postersChance(value: number) {
    if (value < 0 || value > 100) throw new RangeError('PostersChance must be [0..100]');
    this.m_PostersChance = value;
  }

  get tagsChance(): number {
    return this.m_TagsChance;
  }

  set tagsChance(value: number) {
    if (value < 0 || value > 100) throw new RangeError('TagsChance must be [0..100]');
    this.m_TagsChance = value;
  }

  get itemInShopShelfChance(): number {
    return this.m_ItemInShopShelfChance;
  }

  set itemInShopShelfChance(value: number) {
    if (value < 0 || value > 100) throw new RangeError('ItemInShopShelfChance must be [0..100]');
    this.m_ItemInShopShelfChance = value;
  }

  get policemanChance(): number {
    return this.m_PolicemanChance;
  }

  set policemanChance(value: number) {
    if (value < 0 || value > 100) throw new RangeError('PolicemanChance must be [0..100]');
    this.m_PolicemanChance = value;
  }
}

/**
 * One city block and the three rectangles derived from it.
 * C# `BaseTownGenerator.cs:209-228` `Block` / `ResetRectangle`.
 *
 * Moved here, not copied: it is a building's first input, so a building file
 * that imported it from `BaseTownGenerator` would drag the whole class in
 * behind it -- which is the coupling this module exists to remove.
 */
export class Block {
  rectangle!: Rect;
  buildingRect!: Rect;
  insideRect!: Rect;

  constructor(rect: Rect) {
    this.resetRectangle(rect);
  }

  resetRectangle(rect: Rect): void {
    this.rectangle = rect;
    this.buildingRect = new Rect(rect.left + 1, rect.top + 1, rect.width - 2, rect.height - 2);
    this.insideRect = new Rect(
      this.buildingRect.left + 1,
      this.buildingRect.top + 1,
      this.buildingRect.width - 2,
      this.buildingRect.height - 2
    );
  }
}

// ── The context a building generator is handed ───────────────────────────────

/**
 * Everything a town building generator may touch, and nothing else.
 *
 * The `map` argument on every primitive is deliberate even though `ctx.map` is
 * right there: the C# passes `map` explicitly to all of them, and several
 * builders write to a *second* map from inside the same method -- a shop
 * basement, a house basement, a fire station's upstairs. The primitives keep
 * the C#'s signatures so a transliterated method needs no argument reshuffling.
 *
 * Call counts after each name are the port's own (`this.x(` in
 * `BaseTownGenerator.ts`) and then the C#'s, over the thirteen building
 * generators still to be ported (`BaseTownGenerator.cs:1908-5999`).
 * Everything listed has at least two callers on one side or the other; see the
 * module header for what was left out and why.
 */
export interface TownBuildingContext {
  // ── What is being built ───────────────────────────────────────────────
  /** The map the block sits on. Always the district's surface map. */
  readonly map: GameMap;
  readonly block: Block;
  /** Per-district generation settings; `district` is what a basement links into. */
  readonly params: Parameters;
  /**
   * The district's roller. Read once, when the context is built, which is
   * where the C# reads `m_DiceRoller` from: a building is generated inside
   * one block's turn and the roller is not reseeded until the next map.
   */
  readonly roller: DiceRoller;
  readonly game: Game;

  // ── Tiles ────────────────────────────────────────────────────────────
  /**
   * 41 call sites; 24 in the C# buildings.
   *
   * `rect` is required and the whole-map form is deliberately absent: every
   * building fills a rect, and the whole-map fills in the port are the sewers,
   * the subway and house basements, which no building generator drives.
   */
  tileFill(map: GameMap, model: TileModel, rect: Rect, decoratorFn?: TileDecoratorFn): void;

  /** 51 call sites; 56 in the C# buildings. The workhorse. */
  tileRectangle(map: GameMap, model: TileModel, rect: Rect, decoratorFn?: TileDecoratorFn): void;
  /** 4 call sites (`makeCHAROffice`); 6 in the C# buildings. */
  tileHLine(map: GameMap, model: TileModel, left: number, top: number, width: number, decoratorFn?: TileDecoratorFn): void;
  /** 4 call sites (`makeCHAROffice`); 6 in the C# buildings. */
  tileVLine(map: GameMap, model: TileModel, left: number, top: number, height: number, decoratorFn?: TileDecoratorFn): void;

  // ── Map objects ──────────────────────────────────────────────────────
  /** 38 call sites; 5 in the C# buildings. Skips occupied and exit tiles. */
  mapObjectPlace(map: GameMap, x: number, y: number, mapObj: MapObject): void;
  /** 14 call sites; 25 in the C# buildings. */
  mapObjectFill(map: GameMap, rect: Rect, createFn: (p: Point) => MapObject | null): void;
  /**
   * `MakeObjFuelPump` `BaseMapGenerator.cs:1105`; 3 port call sites, the nine in
   * the C# fuel station.
   *
   * On the seam rather than transcribed into the building file, unlike the
   * factories `makeFireStationBuilding` had to copy, because this one is not
   * only a building's: `ExplodeFuelPump` needs its broken sibling
   * (`RogueGame.cs:20128`) and `Feature.TileFires` will need both. A second copy
   * in a building file would be a second place for the two to disagree about
   * 800 hitpoints.
   */
  makeObjFuelPump(fuelPumpImageID: string): MapObject;
  /** 17 call sites; 20 in the C# buildings. Consumes one roll when it places. */
  mapObjectPlaceInGoodPosition(
    map: GameMap,
    rect: Rect,
    isGoodPosFn: (p: Point) => boolean,
    roller: DiceRoller,
    createFn: (p: Point) => MapObject | null
  ): void;
  /** 6 call sites; 14 in the C# buildings. */
  decorateOutsideWalls(map: GameMap, rect: Rect, decoFn: (x: number, y: number) => string | null): void;

  // ── Doors and windows ────────────────────────────────────────────────
  /** 76 call sites; 135 in the C# buildings. */
  placeDoor(map: GameMap, x: number, y: number, floor: TileModel, door: DoorWindow): void;
  /** C# `BaseMapGenerator.cs:434-496`; 16 port call sites, every C# building. */
  makeObjWoodenDoor(): DoorWindow;
  /** `:422-432`; 2 port call sites, the C# clinic and the hospital levels. */
  makeObjHospitalDoor(): DoorWindow;
  /** `:434-442`; 7 port call sites, the C# CHAR agency, office and armory. */
  makeObjCharDoor(): DoorWindow;
  /** `:444-455`; 40 port call sites, the C# shop, bank, library and office. */
  makeObjGlassDoor(): DoorWindow;
  /** `:457-467`; 10 port call sites, the C# bank, office and subway. */
  makeObjIronDoor(): DoorWindow;
  /** `:469-483`; 13 port call sites, the C# house, shop and CHAR office. */
  makeObjWindow(): DoorWindow;

  // ── Adjacency ────────────────────────────────────────────────────────
  /** 29 call sites; 16 in the C# buildings. */
  countAdjDoors(map: GameMap, x: number, y: number): number;
  /** 30 call sites; 13 in the C# buildings. */
  countAdjWalls(map: GameMap, x: number, y: number): number;
  /** 2 call sites (sewers, subway); 2 in the C# buildings. */
  countAdjWalkables(map: GameMap, x: number, y: number): number;

  // ── Zones, exits, barricades ─────────────────────────────────────────
  /** 43 call sites; 26 in the C# buildings, and every one of the 14 needs it. */
  makeUniqueZone(basename: string, rect: Rect): Zone;
  /** 8 call sites; 18 in the C# buildings, and every one of the 14 needs it. */
  makeWalkwayZones(map: GameMap, b: Block): void;
  /**
   * `MakeShopGeneralItem` `BaseTownGenerator.cs:7607`; 2 port call sites, the
   * fuel station and the gunshop (`:3972`).
   *
   * Seamed rather than transcribed, and the reason is the shape of it: a
   * `roll(0, 6)` over `makeShopPharmacyItem`, `makeShopSportsWearItem`,
   * `makeShopConstructionItem`, `makeShopGroceryItem`, `makeHuntingShopItem` and
   * `makeRandomBedroomItem`, all six of which are `protected` on the generator
   * and reach its own roller. A building file has a context and no `this`, so
   * copying it would mean copying six more factories with it.
   */
  makeShopGeneralItem(): Item;
  /** 20 call sites; 2 in the C# buildings (the animal shelter's stairs). */
  addExit(
    from: GameMap,
    fromPosition: Point,
    to: GameMap | null,
    toPosition: Point,
    exitImageID: string,
    isAnAIExit: boolean
  ): void;
  /** 3 call sites (gunshop, CHAR office, house); 1 in the C# buildings. */
  barricadeDoors(map: GameMap, rect: Rect, barricadeLevel: number): void;

  // ── Contents and bulk edits ──────────────────────────────────────────
  /** 3 call sites; 8 in the C# buildings. */
  itemsDrop(
    map: GameMap,
    rect: Rect,
    isGoodPositionFn: (p: Point) => boolean,
    createFn: (p: Point) => Item | null
  ): void;
  /** 30 call sites; 8 in the C# buildings. */
  doForEachTile(map: GameMap, rect: Rect, doFn: (p: Point) => void): void;
  /** 3 call sites; 3 in the C# buildings (a farm or shelter clearing its yard). */
  clearRectangle(map: GameMap, rect: Rect, clearZones?: boolean): void;
  /** 14 call sites; 1 in the C# buildings (the animal shelter's dogs). */
  actorPlace(
    roller: DiceRoller,
    maxTries: number,
    map: GameMap,
    actor: Actor,
    goodPositionFn: (p: Point) => boolean
  ): boolean;
}

/**
 * The placement half of {@link TownBuildingContext}, cached per generator.
 *
 * Separate from the context because it does not change per block: `BaseTownGenerator`
 * builds it once and the per-block context spreads it in. It exists as its own
 * type so the extracted free functions below can take it without a block, and so
 * the delegates that make `protected` generator methods public are written once.
 */
export type TownPlacement = Omit<TownBuildingContext, 'map' | 'block' | 'params' | 'roller' | 'game'>;

/**
 * `placeDoor`, as a free function so a building file can use it without the
 * generator class. C# `BaseTownGenerator.cs:915`.
 *
 * The floor tile goes down *before* the object, so a wall tile that already had
 * a doorway is repaired to the floor rather than the door landing on concrete.
 */
export function placeDoor(
  place: TownPlacement,
  map: GameMap,
  x: number,
  y: number,
  floor: TileModel,
  door: DoorWindow
): void {
  map.setTileModelAt(x, y, floor);
  place.mapObjectPlace(map, x, y, door);
}

/**
 * Wall decoration outside a rect. C# `BaseMapGenerator.cs:826` `DecorateOutsideWalls`.
 *
 * Walks the whole rect and asks the callback per non-walkable, non-inside tile,
 * so the callback is where the per-building condition lives.
 */
export function decorateOutsideWalls(
  map: GameMap,
  rect: Rect,
  decoFn: (x: number, y: number) => string | null
): void {
  for (let x = rect.left; x < rect.right; x++) {
    for (let y = rect.top; y < rect.bottom; y++) {
      const tile = map.getTileAt(x, y);
      if (!tile) continue;
      if (tile.model.isWalkable) continue;
      if (tile.isInside) continue;

      const deco = decoFn(x, y);
      if (deco) tile.addDecoration(deco);
    }
  }
}

/**
 * The four walkway strips around a block. C# `BaseTownGenerator.cs:5794`.
 *
 * Every one of the fourteen C# building generators calls this, so it is the one
 * piece of building bookkeeping that is not optional:
 *
 * ```
 *  NNNE
 *  W  E
 *  W  E
 *  WSSS
 * ```
 */
export function makeWalkwayZones(place: TownPlacement, map: GameMap, b: Block): void {
  const r = b.rectangle;

  // N
  map.addZone(place.makeUniqueZone('walkway', new Rect(r.left, r.top, r.width - 1, 1)));
  // S
  map.addZone(place.makeUniqueZone('walkway', new Rect(r.left + 1, r.bottom - 1, r.width - 1, 1)));
  // E
  map.addZone(place.makeUniqueZone('walkway', new Rect(r.right - 1, r.top, 1, r.height - 1)));
  // W
  map.addZone(place.makeUniqueZone('walkway', new Rect(r.left, r.top + 1, 1, r.height - 1)));
}

// ── The extension point ──────────────────────────────────────────────────────

/** One C# `Make…(Map map, Block b)` building generator, as a free function. */
export type TownBuildingMaker = (ctx: TownBuildingContext) => boolean;

/**
 * One building, registered. See {@link TOWN_BUILDING_PASSES}.
 */
export interface TownBuildingPass {
  /**
   * The C# method this ports, spelled as in the reference
   * (`BaseTownGenerator.cs`). For the reader who goes back to compare, and
   * for the plan's audit table.
   */
  readonly csharpName: string;
  /**
   * Offered every still-empty block, in registry order. Return `true` to
   * build the block and take it out of the pool.
   *
   * The registry is a flat list, which is **not** how the C# orders these:
   * there, a block gets one `Roll(0, 99)` and an `if (!placed) ... else if`
   * cascade over the mutually exclusive types, some of which are capped at
   * one per district (`hasLibrary`, `barsCount`, `storesCount`). A pass that
   * needs a cap has nowhere to keep the counter yet -- `Parameters` is the
   * candidate, since `RogueGame` already save/restore-swaps it per district
   * -- and a pass that wants the cascade should roll for itself rather than
   * have the registry roll on its behalf, because a registry roll would
   * move every later roll in world generation.
   *
   * Which means: **registering a building changes the dice stream**, exactly
   * as porting the C#'s cascade would, and the world fingerprints have to be
   * re-taken. That is the point -- but it is a change, not a refactor.
   */
  readonly tryBuild: TownBuildingMaker;
}

/**
 * The registered building generators, run in order by
 * `BaseTownGenerator.generate()`.
 *
 * **Empty on purpose, and that is the only honest state today.** Two of the
 * fourteen C# building generators are ported (`MakeShopBuilding`,
 * `MakeParkBuilding`) and the other twelve are not; the C# reaches them through
 * the roll cascade described on {@link TownBuildingPass.tryBuild}, and
 * flattening that cascade into a list is a *behaviour* decision, not a refactor
 * -- it is somebody's change to make with the fingerprints in front of them.
 *
 * Adding the thirteenth is one line here plus one new file. The names, for the
 * plan's audit table:
 *
 * | C# method | line | needs |
 * | --- | --- | --- |
 * | `MakeLibraryBuilding` | 1908 | one per district |
 * | `MakeChurchBuilding` | 2187 | 10% |
 * | `MakeBarBuilding` | 2387 | capped per district |
 * | `MakeMechanicWorkshop` | 2670 | capped per district |
 * | `MakeFuelStation` | 2811 | |
 * | `MakeFireStation` | 3181 | one per district |
 * | `MakeClinicBuilding` | 3358 | capped per district |
 * | `MakeJunkyard` | 3537 | 10% |
 * | `MakeFarmBuilding` | 3685 | 35% |
 * | `MakeAnimalShelterBuilding` | 3945 | 10% |
 * | `MakeBankBuilding` | 4253 | capped per district |
 * | `MakeOrdinaryOffice` | 4964 | fallback for the business district |
 * | `MakeNarrowPark` | 5809 | fallback for a block too small to house |
 * | `MakeTennisCourt` | 5858 | |
 *
 * Mutable rather than `readonly` so a test can push a stub and watch the
 * dispatch reach it -- see `tests/town-building-seam.test.ts`. Nothing outside
 * a test writes to it.
 */
export const TOWN_BUILDING_PASSES: TownBuildingPass[] = [];

/**
 * Runs `passes` over `emptyBlocks` in registry order, splicing out whatever
 * they build. The mirror image of the C#'s
 * `foreach (Block b in emptyBlocks) { if (chance && Make…(map, b)) completedBlocks.Add(b); }`
 * followed by `foreach (Block b in completedBlocks) emptyBlocks.Remove(b);`,
 * down to walking the pool forwards and removing afterwards -- the order the
 * blocks are *offered* in is dice, so a reverse iteration here would reseed
 * every world.
 *
 * `contextFor` is called once per block *per pass* rather than once per block,
 * so a pass that changes the block's rectangle (none do today) cannot leak that
 * change into the next pass. The C# is the same: `Make…` receives the `Block` by
 * reference and the list is not rebuilt between types.
 */
export function runTownBuildingPasses(
  passes: readonly TownBuildingPass[],
  emptyBlocks: Block[],
  contextFor: (block: Block) => TownBuildingContext
): void {
  for (const pass of passes) {
    const built: Block[] = [];
    for (const b of emptyBlocks) {
      if (pass.tryBuild(contextFor(b))) built.push(b);
    }
    for (const b of built) {
      const index = emptyBlocks.indexOf(b);
      if (index !== -1) emptyBlocks.splice(index, 1);
    }
  }
}
