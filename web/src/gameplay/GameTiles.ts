import { Color } from "@engine/Color";
import { TileModel, TileModelDB } from "@data/TileModel";
import { Models } from "@data/Models";
import { GameImages } from "./GameImages";

export enum TileID {
  UNDEF = 0,
  FLOOR_ASPHALT = 1,
  FLOOR_CONCRETE = 2,
  FLOOR_GRASS = 3,
  FLOOR_OFFICE = 4,
  FLOOR_PLANKS = 5,
  FLOOR_SEWER_WATER = 6,
  FLOOR_TILES = 7,
  FLOOR_WALKWAY = 8,
  ROAD_ASPHALT_EW = 9,
  ROAD_ASPHALT_NS = 10,
  RAIL_EW = 11,
  WALL_BRICK = 12,
  WALL_CHAR_OFFICE = 13,
  WALL_HOSPITAL = 14,
  WALL_POLICE_STATION = 15,
  WALL_SEWER = 16,
  WALL_STONE = 17,
  WALL_SUBWAY = 18,
  _COUNT = 19,
}

const DRK_GRAY1 = Color.DarkGray;
const DRK_RED   = Color.fromArgb(128, 0, 0);
const LIT_GRAY1 = Color.Gray;
const LIT_GRAY2 = Color.LightGray;
const LIT_GRAY3 = Color.fromArgb(230, 230, 230);
const LIT_BROWN = Color.Brown;

export class GameTiles extends TileModelDB {
  private readonly models: TileModel[] = new Array(TileID._COUNT);

  constructor() {
    super();
    Models.tiles = this;

    this.setModel(TileID.UNDEF, TileModel.UNDEF);

    // Floors
    this.setModel(TileID.FLOOR_ASPHALT, new TileModel(GameImages.TILE_FLOOR_ASPHALT, LIT_GRAY1, true, true));
    this.setModel(TileID.FLOOR_CONCRETE, new TileModel(GameImages.TILE_FLOOR_CONCRETE, LIT_GRAY2, true, true));
    this.setModel(TileID.FLOOR_GRASS, new TileModel(GameImages.TILE_FLOOR_GRASS, Color.Green, true, true));
    this.setModel(TileID.FLOOR_OFFICE, new TileModel(GameImages.TILE_FLOOR_OFFICE, LIT_GRAY3, true, true));
    this.setModel(TileID.FLOOR_PLANKS, new TileModel(GameImages.TILE_FLOOR_PLANKS, LIT_BROWN, true, true));
    const sewerWater = new TileModel(GameImages.TILE_FLOOR_SEWER_WATER, Color.Blue, true, true);
    sewerWater.isWater = true;
    sewerWater.waterCoverImageId = GameImages.TILE_FLOOR_SEWER_WATER_COVER;
    this.setModel(TileID.FLOOR_SEWER_WATER, sewerWater);
    this.setModel(TileID.FLOOR_TILES, new TileModel(GameImages.TILE_FLOOR_TILES, LIT_GRAY2, true, true));
    this.setModel(TileID.FLOOR_WALKWAY, new TileModel(GameImages.TILE_FLOOR_WALKWAY, LIT_GRAY2, true, true));
    this.setModel(TileID.ROAD_ASPHALT_EW, new TileModel(GameImages.TILE_ROAD_ASPHALT_EW, LIT_GRAY1, true, true));
    this.setModel(TileID.ROAD_ASPHALT_NS, new TileModel(GameImages.TILE_ROAD_ASPHALT_NS, LIT_GRAY1, true, true));
    this.setModel(TileID.RAIL_EW, new TileModel(GameImages.TILE_RAIL_ES, LIT_GRAY1, true, true));

    // Walls
    this.setModel(TileID.WALL_BRICK, new TileModel(GameImages.TILE_WALL_BRICK, DRK_GRAY1, false, false));
    this.setModel(TileID.WALL_CHAR_OFFICE, new TileModel(GameImages.TILE_WALL_CHAR_OFFICE, DRK_RED, false, false));
    this.setModel(TileID.WALL_HOSPITAL, new TileModel(GameImages.TILE_WALL_HOSPITAL, Color.White, false, false));
    this.setModel(TileID.WALL_POLICE_STATION, new TileModel(GameImages.TILE_WALL_STONE, Color.Cyan, false, false));
    this.setModel(TileID.WALL_SEWER, new TileModel(GameImages.TILE_WALL_SEWER, Color.DarkGreen, false, false));
    this.setModel(TileID.WALL_STONE, new TileModel(GameImages.TILE_WALL_STONE, DRK_GRAY1, false, false));
    this.setModel(TileID.WALL_SUBWAY, new TileModel(GameImages.TILE_WALL_STONE, Color.Blue, false, false));
  }

  private setModel(id: TileID, model: TileModel): void {
    model.id = id;
    this.models[id] = model;
  }

  override get(id: number): TileModel {
    return this.models[id] ?? TileModel.UNDEF;
  }

  isRoadModel(model: TileModel): boolean {
    return model === this.models[TileID.ROAD_ASPHALT_EW] || model === this.models[TileID.ROAD_ASPHALT_NS];
  }
}
