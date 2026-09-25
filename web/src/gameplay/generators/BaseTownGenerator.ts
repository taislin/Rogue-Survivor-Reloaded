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
import { Options } from '@engine/GameOptions';
import { Point } from '@engine/Point';
import { Rect } from '@engine/Rect';
import { Rules } from '@engine/Rules';
import { Session, UniqueActor, UniqueMap } from '@engine/Session';
import { WorldTime } from '@engine/WorldTime';
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
const PARK_ITEM_CHANCE = 5;
const PARK_SHED_CHANCE = 75; // alpha10.1
const PARK_SHED_WIDTH = 5; // alpha10
const PARK_SHED_HEIGHT = 5; // alpha10

const MAX_CHAR_GUARDS_PER_OFFICE = 3;

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

// ── Types ──────────────────────────────────────────────────────────────────
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
    this.makeBlocks(map, true, blocks, cityRectangle);

    ///////////////////////////////////////
    // Make concrete buildings from blocks
    ///////////////////////////////////////
    const emptyBlocks: Block[] = blocks.slice();
    const completedBlocks: Block[] = [];

    // remember blocks.
    this.m_SurfaceBlocks = blocks.map((b) => new Block(b.rectangle));

    // Special buildings.
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

    // CHAR buildings..
    completedBlocks.length = 0;
    let charOfficesCount = 0;
    for (const b of emptyBlocks) {
      if (
        (this.m_Params.district!.kind === DistrictKind.BUSINESS && charOfficesCount === 0) ||
        this.m_DiceRoller.rollChance(this.m_Params.charBuildingChance)
      ) {
        const btype = this.makeCHARBuilding(map, b);
        if (btype === CHARBuildingType.OFFICE) {
          ++charOfficesCount;
          this.populateCHAROfficeBuilding(map, b);
        }
        if (btype !== CHARBuildingType.NONE) completedBlocks.push(b);
      }
    }
    for (const b of completedBlocks) {
      const index = emptyBlocks.indexOf(b);
      if (index !== -1) emptyBlocks.splice(index, 1);
    }

    // parks.
    completedBlocks.length = 0;
    for (const b of emptyBlocks) {
      if (this.m_DiceRoller.rollChance(this.m_Params.parkBuildingChance) && this.makeParkBuilding(map, b)) {
        completedBlocks.push(b);
      }
    }
    for (const b of completedBlocks) {
      const index = emptyBlocks.indexOf(b);
      if (index !== -1) emptyBlocks.splice(index, 1);
    }

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
    map.setTileModelAt(x, y, floor);
    this.mapObjectPlace(map, x, y, door);
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

  makeShopBuilding(map: GameMap, b: Block): boolean {
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
    // C#: (ShopType)m_DiceRoller.Roll((int)ShopType._FIRST, (int)ShopType._COUNT)
    const shopType = this.m_DiceRoller.roll(ShopType.GENERAL_STORE, ShopType.HUNTING + 1) as ShopType;

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

  makeParkBuilding(map: GameMap, b: Block): boolean {
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
    this.itemsDrop(
      map,
      b.insideRect,
      (pt) => map.getMapObjectAt(pt.x, pt.y) === null && this.m_DiceRoller.rollChance(PARK_ITEM_CHANCE),
      () => this.makeRandomParkItem()
    );

    ///////////
    // 5. Zone
    ///////////
    const parkZone = this.makeUniqueZone('Park', b.buildingRect);
    map.addZone(parkZone);
    this.makeWalkwayZones(map, b);

    // alpha10
    ////////////
    // 5. Shed?
    ////////////
    if (b.insideRect.width > PARK_SHED_WIDTH + 2 && b.insideRect.height > PARK_SHED_HEIGHT + 2) {
      if (this.m_DiceRoller.rollChance(PARK_SHED_CHANCE)) {
        // roll shed pos - dont put next to park fences!
        const shedX = this.m_DiceRoller.roll(b.insideRect.left + 1, b.insideRect.right - PARK_SHED_WIDTH);
        const shedY = this.m_DiceRoller.roll(b.insideRect.top + 1, b.insideRect.bottom - PARK_SHED_HEIGHT);
        const shedRect = new Rect(shedX, shedY, PARK_SHED_WIDTH, PARK_SHED_HEIGHT);

        // clear everything but zones in shed location
        this.clearRectangle(map, shedRect, false);

        // build it
        this.makeParkShedBuilding(map, 'Shed', shedRect);
      }
    }

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

  makeHuntingShopItem(): Item {
    // Weapons/Ammo (50%) Outfits&Traps (50%)
    if (this.m_DiceRoller.rollChance(50)) {
      // Weapons(40) Ammo(60)
      if (this.m_DiceRoller.rollChance(40)) {
        const roll = this.m_DiceRoller.roll(0, 2);

        switch (roll) {
          case 0:
            return this.makeItemHuntingRifle();
          case 1:
            return this.makeItemHuntingCrossbow();
          default:
            return null!; // unreachable, roll is [0, 2)
        }
      } else {
        const roll = this.m_DiceRoller.roll(0, 2);

        switch (roll) {
          case 0:
            return this.makeItemLightRifleAmmo();
          case 1:
            return this.makeItemBoltsAmmo();
          default:
            return null!; // unreachable, roll is [0, 2)
        }
      }
    } else {
      // Outfits&Traps
      const roll = this.m_DiceRoller.roll(0, 2);
      switch (roll) {
        case 0:
          return this.makeItemHunterVest();
        case 1:
          return this.makeItemBearTrap();
        default:
          return null!; // unreachable, roll is [0, 2)
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

  makeRandomBedroomItem(): Item {
    const randomItem = this.m_DiceRoller.roll(0, 24);

    switch (randomItem) {
      case 0:
      case 1:
        return this.makeItemBandages();
      case 2:
        return this.makeItemPillsSTA();
      case 3:
        return this.makeItemPillsSLP();
      case 4:
        return this.makeItemPillsSAN();
      case 5:
      case 6:
      case 7:
      case 8:
        return this.makeItemBaseballBat();
      case 9:
        return this.makeItemRandomPistol();
      case 10: // rare fire weapon
        if (this.m_DiceRoller.rollChance(30)) {
          if (this.m_DiceRoller.rollChance(50)) {
            return this.makeItemShotgun();
          } else {
            return this.makeItemHuntingRifle();
          }
        } else {
          if (this.m_DiceRoller.rollChance(50)) {
            return this.makeItemShotgunAmmo();
          } else {
            return this.makeItemLightRifleAmmo();
          }
        }
      case 11:
      case 12:
      case 13:
        return this.makeItemCellPhone();
      case 14:
      case 15:
        return this.makeItemFlashlight();
      case 16:
      case 17:
        return this.makeItemLightPistolAmmo();
      case 18:
      case 19:
        return this.makeItemStenchKiller();
      case 20:
        return this.makeItemHunterVest();
      case 21:
      case 22:
      case 23:
        if (this.m_DiceRoller.rollChance(50)) {
          return this.makeItemBook();
        } else {
          return this.makeItemMagazines();
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
            roomName = 'Living';
            this.makeCHARLivingRoom(underground, insideRoomRect);
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

    // CHAR Guards.
    const nbGuards = Math.floor(underground.width / 10); // 10 for 100.
    for (let i = 0; i < nbGuards; i++) {
      const guard = this.createNewCHARGuard(0);
      this.actorPlace(
        this.m_DiceRoller,
        underground.width * underground.height,
        underground,
        guard,
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

  makeCHARStorageRoom(map: GameMap, roomRect: Rect): void {
    // Replace floor with concrete.
    this.tileFill(map, Models.tiles.get(TileID.FLOOR_CONCRETE)!, roomRect);

    // Objects.
    // Barrels & Junk in the middle of the room.
    this.mapObjectFill(map, roomRect, (pt) => {
      if (this.countAdjWalls(map, pt.x, pt.y) > 0) return null;
      // dont block exits!
      if (map.getExitAt(pt) !== null) return null;

      // barrels/junk?
      if (this.m_DiceRoller.rollChance(50))
        return this.m_DiceRoller.rollChance(50)
          ? this.makeObjJunk(GameImages.OBJ_JUNK)
          : this.makeObjBarrels(GameImages.OBJ_BARRELS);
      else return null;
    });

    // Items.
    // Construction items in this mess.
    for (let x = roomRect.left; x < roomRect.right; x++)
      for (let y = roomRect.top; y < roomRect.bottom; y++) {
        if (this.countAdjWalls(map, x, y) > 0) continue;
        if (map.getMapObjectAt(x, y) !== null) continue;

        map.dropItemAt(this.makeShopConstructionItem(), new Point(x, y));
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

    // alpha10.1 moved Jason Myers out of power room to storage north corridor
    // also upped high stamina to 5 (was 3).
    // Jason Myers
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

    // alpha10.1 moved Jason Myers out of power room to storage north corridor
    /*
    // 3. Populate.
    // enraged patient!
    ActorModel model = m_Game.GameActors.JasonMyers;
    Actor jason = model.CreateNamed(m_Game.GameFactions.ThePsychopaths, "Jason Myers", false, 0);
    jason.IsUnique = true;
    jason.Doll.AddDecoration(DollPart.SKIN, GameImages.ACTOR_JASON_MYERS);
    GiveStartingSkillToActor(jason, Skills.IDs.TOUGH);
    GiveStartingSkillToActor(jason, Skills.IDs.TOUGH);
    GiveStartingSkillToActor(jason, Skills.IDs.TOUGH);
    GiveStartingSkillToActor(jason, Skills.IDs.STRONG);
    GiveStartingSkillToActor(jason, Skills.IDs.STRONG);
    GiveStartingSkillToActor(jason, Skills.IDs.STRONG);
    GiveStartingSkillToActor(jason, Skills.IDs.AGILE);
    GiveStartingSkillToActor(jason, Skills.IDs.AGILE);
    GiveStartingSkillToActor(jason, Skills.IDs.AGILE);
    GiveStartingSkillToActor(jason, Skills.IDs.HIGH_STAMINA);
    GiveStartingSkillToActor(jason, Skills.IDs.HIGH_STAMINA);
    GiveStartingSkillToActor(jason, Skills.IDs.HIGH_STAMINA);
    jason.Inventory.AddAll(MakeItemJasonMyersAxe());
    map.PlaceActorAt(jason, new Point(map.Width / 2, map.Height / 2));
    m_Game.Session.UniqueActors.JasonMyers = new UniqueActor()
    {
        TheActor = jason,
        IsSpawned = true
    };
    */

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
    for (let p = DollPart.RIGHT_HAND; p < DollPart._COUNT; p++) {
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
    /*
     *  NNNE
     *  W  E
     *  W  E
     *  WSSS
     *
     */
    const r = b.rectangle;

    // N
    map.addZone(this.makeUniqueZone('walkway', new Rect(r.left, r.top, r.width - 1, 1)));
    // S
    map.addZone(this.makeUniqueZone('walkway', new Rect(r.left + 1, r.bottom - 1, r.width - 1, 1)));
    // E
    map.addZone(this.makeUniqueZone('walkway', new Rect(r.right - 1, r.top, 1, r.height - 1)));
    // W
    map.addZone(this.makeUniqueZone('walkway', new Rect(r.left, r.top + 1, 1, r.height - 1)));
  }
}
