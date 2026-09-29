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
  // ── Still Alive tiles, 124 of them (scripts/port-tile-models.py).
  // Append-only: saves store a tile model id and the generators index this
  // numerically, so the existing 19 keep their values even though the fork
  // interleaves floors and walls freely. That interleaving is exactly why
  // tile-palette.test.ts derives walkability from the name and not a range.
  FLOOR_ARMY = 19,
  FLOOR_PLANTED = 20,
  FLOOR_WHITE_TILE = 21,
  FLOOR_RED_CARPET = 22,
  FLOOR_BLUE_CARPET = 23,
  FLOOR_DIRT = 24,
  FLOOR_POND_CENTER = 25,
  FLOOR_POND_N_EDGE = 26,
  FLOOR_POND_NE_CORNER = 27,
  FLOOR_POND_E_EDGE = 28,
  FLOOR_POND_SE_CORNER = 29,
  FLOOR_POND_S_EDGE = 30,
  FLOOR_POND_SW_CORNER = 31,
  FLOOR_POND_W_EDGE = 32,
  FLOOR_POND_NW_CORNER = 33,
  FLOOR_FOOD_COURT_POOL = 34,
  FLOOR_TENNIS_COURT_OUTER = 35,
  FLOOR_TENNIS_COURT_10 = 36,
  FLOOR_TENNIS_COURT_11 = 37,
  FLOOR_TENNIS_COURT_12 = 38,
  FLOOR_TENNIS_COURT_13 = 39,
  FLOOR_TENNIS_COURT_14 = 40,
  FLOOR_TENNIS_COURT_15 = 41,
  FLOOR_TENNIS_COURT_18 = 42,
  FLOOR_TENNIS_COURT_19 = 43,
  FLOOR_TENNIS_COURT_20 = 44,
  FLOOR_TENNIS_COURT_21 = 45,
  FLOOR_TENNIS_COURT_22 = 46,
  FLOOR_TENNIS_COURT_23 = 47,
  FLOOR_TENNIS_COURT_26 = 48,
  FLOOR_TENNIS_COURT_27 = 49,
  FLOOR_TENNIS_COURT_28 = 50,
  FLOOR_TENNIS_COURT_29 = 51,
  FLOOR_TENNIS_COURT_30 = 52,
  FLOOR_TENNIS_COURT_31 = 53,
  FLOOR_TENNIS_COURT_34 = 54,
  FLOOR_TENNIS_COURT_35 = 55,
  FLOOR_TENNIS_COURT_36 = 56,
  FLOOR_TENNIS_COURT_37 = 57,
  FLOOR_TENNIS_COURT_38 = 58,
  FLOOR_TENNIS_COURT_39 = 59,
  FLOOR_TENNIS_COURT_42 = 60,
  FLOOR_TENNIS_COURT_43 = 61,
  FLOOR_TENNIS_COURT_44 = 62,
  FLOOR_TENNIS_COURT_45 = 63,
  FLOOR_TENNIS_COURT_46 = 64,
  FLOOR_TENNIS_COURT_47 = 65,
  FLOOR_TENNIS_COURT_50 = 66,
  FLOOR_TENNIS_COURT_51 = 67,
  FLOOR_TENNIS_COURT_52 = 68,
  FLOOR_TENNIS_COURT_53 = 69,
  FLOOR_TENNIS_COURT_54 = 70,
  FLOOR_TENNIS_COURT_55 = 71,
  FLOOR_TENNIS_COURT_58 = 72,
  FLOOR_TENNIS_COURT_59 = 73,
  FLOOR_TENNIS_COURT_60 = 74,
  FLOOR_TENNIS_COURT_61 = 75,
  FLOOR_TENNIS_COURT_62 = 76,
  FLOOR_TENNIS_COURT_63 = 77,
  FLOOR_TENNIS_COURT_66 = 78,
  FLOOR_TENNIS_COURT_67 = 79,
  FLOOR_TENNIS_COURT_68 = 80,
  FLOOR_TENNIS_COURT_69 = 81,
  FLOOR_TENNIS_COURT_70 = 82,
  FLOOR_TENNIS_COURT_71 = 83,
  FLOOR_BASKETBALL_COURT_OUTER = 84,
  FLOOR_BASKETBALL_COURT_18 = 85,
  FLOOR_BASKETBALL_COURT_19 = 86,
  FLOOR_BASKETBALL_COURT_20 = 87,
  FLOOR_BASKETBALL_COURT_21 = 88,
  FLOOR_BASKETBALL_COURT_22 = 89,
  FLOOR_BASKETBALL_COURT_23 = 90,
  FLOOR_BASKETBALL_COURT_24 = 91,
  FLOOR_BASKETBALL_COURT_25 = 92,
  FLOOR_BASKETBALL_COURT_27 = 93,
  FLOOR_BASKETBALL_COURT_28 = 94,
  FLOOR_BASKETBALL_COURT_29 = 95,
  FLOOR_BASKETBALL_COURT_30 = 96,
  FLOOR_BASKETBALL_COURT_31 = 97,
  FLOOR_BASKETBALL_COURT_32 = 98,
  FLOOR_BASKETBALL_COURT_33 = 99,
  FLOOR_BASKETBALL_COURT_34 = 100,
  FLOOR_BASKETBALL_COURT_36 = 101,
  FLOOR_BASKETBALL_COURT_37 = 102,
  FLOOR_BASKETBALL_COURT_38 = 103,
  FLOOR_BASKETBALL_COURT_39 = 104,
  FLOOR_BASKETBALL_COURT_40 = 105,
  FLOOR_BASKETBALL_COURT_41 = 106,
  FLOOR_BASKETBALL_COURT_42 = 107,
  FLOOR_BASKETBALL_COURT_43 = 108,
  FLOOR_BASKETBALL_COURT_45 = 109,
  FLOOR_BASKETBALL_COURT_46 = 110,
  FLOOR_BASKETBALL_COURT_47 = 111,
  FLOOR_BASKETBALL_COURT_48 = 112,
  FLOOR_BASKETBALL_COURT_49 = 113,
  FLOOR_BASKETBALL_COURT_50 = 114,
  FLOOR_BASKETBALL_COURT_51 = 115,
  FLOOR_BASKETBALL_COURT_52 = 116,
  FLOOR_BASKETBALL_COURT_54 = 117,
  FLOOR_BASKETBALL_COURT_55 = 118,
  FLOOR_BASKETBALL_COURT_56 = 119,
  FLOOR_BASKETBALL_COURT_57 = 120,
  FLOOR_BASKETBALL_COURT_58 = 121,
  FLOOR_BASKETBALL_COURT_59 = 122,
  FLOOR_BASKETBALL_COURT_60 = 123,
  FLOOR_BASKETBALL_COURT_61 = 124,
  FLOOR_BASKETBALL_COURT_63 = 125,
  FLOOR_BASKETBALL_COURT_64 = 126,
  FLOOR_BASKETBALL_COURT_65 = 127,
  FLOOR_BASKETBALL_COURT_66 = 128,
  FLOOR_BASKETBALL_COURT_67 = 129,
  FLOOR_BASKETBALL_COURT_68 = 130,
  FLOOR_BASKETBALL_COURT_69 = 131,
  FLOOR_BASKETBALL_COURT_70 = 132,
  PARKING_ASPHALT_EW = 133,
  PARKING_ASPHALT_NS = 134,
  WALL_LIGHT_BROWN = 135,
  WALL_ARMY_BASE = 136,
  WALL_FUEL_STATION = 137,
  WALL_WOOD_PLANKS = 138,
  WALL_CONCRETE = 139,
  WALL_PILLAR_CONCRETE = 140,
  WALL_MALL = 141,
  WALL_RED_CURTAINS = 142,
  _COUNT = 143,
}

// Minimap palette. Every value here is compared against GameTiles.cs:47-53;
// three of them had drifted (the port took the *second* of two adjacent greys,
// used a saturated red where the C# used a tan, and a pure aqua where the C#
// used a muted slate). These constants are read by nothing but the minimap, so
// a wrong value is invisible until you compare.
//
// C# also declares DRK_GRAY2 = Color.DarkGray next to DRK_GRAY1, and never
// uses it. It is not declared here: the port has no unused-locals escape
// hatch, and carrying a dead constant through a mechanical port is how the
// three live ones drifted in the first place.
const DRK_GRAY1 = Color.DimGray; // C#: DimGray (105,105,105), not DarkGray
const DRK_RED   = Color.fromArgb(128, 0, 0);
const LIT_GRAY1 = Color.Gray;
const LIT_GRAY2 = Color.LightGray;
const LIT_GRAY3 = Color.fromArgb(230, 230, 230);
const LIT_BROWN = Color.BurlyWood; // C#: BurlyWood (222,184,135), not Brown

/** The fourteen wall models, from `GameTiles.cs:528`. */
const WALL_MODEL_IDS: readonly TileID[] = [
  TileID.WALL_BRICK,
  TileID.WALL_CHAR_OFFICE,
  TileID.WALL_HOSPITAL,
  TileID.WALL_LIGHT_BROWN,
  TileID.WALL_POLICE_STATION,
  TileID.WALL_STONE,
  TileID.WALL_SUBWAY,
  TileID.WALL_ARMY_BASE,
  TileID.WALL_FUEL_STATION,
  TileID.WALL_WOOD_PLANKS,
  TileID.WALL_CONCRETE,
  TileID.WALL_PILLAR_CONCRETE,
  TileID.WALL_RED_CURTAINS,
  TileID.WALL_MALL,
];

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
    // C#: Color.CadetBlue (95,158,160). Not Cyan -- WALL_POLICE_STATION,
    // WALL_STONE and WALL_SUBWAY all share TILE_WALL_STONE, so the minimap
    // distinguishes them by colour alone and a pure aqua read as a material.
    this.setModel(TileID.WALL_POLICE_STATION, new TileModel(GameImages.TILE_WALL_STONE, Color.CadetBlue, false, false));
    this.setModel(TileID.WALL_SEWER, new TileModel(GameImages.TILE_WALL_SEWER, Color.DarkGreen, false, false));
    this.setModel(TileID.WALL_STONE, new TileModel(GameImages.TILE_WALL_STONE, DRK_GRAY1, false, false));
    this.setModel(TileID.WALL_SUBWAY, new TileModel(GameImages.TILE_WALL_STONE, Color.Blue, false, false));

    // ── Still Alive: the 124 models above, ported from GameTiles.cs (Releases 4
    // through 8-2) by scripts/port-tile-models.py, flags copied verbatim.
    // NOT carried across, because the port's TileModel has no such fields and
    // both are tile-fire content with no vanilla equivalent: CanDecay (94
    // tiles).
    this.setModel(TileID.FLOOR_ARMY, new TileModel(GameImages.TILE_FLOOR_OFFICE, Color.Khaki, true, true));
    this.setModel(TileID.FLOOR_PLANTED, new TileModel(GameImages.TILE_FLOOR_PLANTED, Color.Green, true, true));
    this.setModel(TileID.FLOOR_WHITE_TILE, new TileModel(GameImages.TILE_FLOOR_WHITE_TILE, Color.Cornsilk, true, true));
    this.setModel(TileID.FLOOR_RED_CARPET, new TileModel(GameImages.TILE_FLOOR_RED_CARPET, DRK_RED, true, true));
    this.setModel(TileID.FLOOR_BLUE_CARPET, new TileModel(GameImages.TILE_FLOOR_BLUE_CARPET, Color.SteelBlue, true, true));
    this.setModel(TileID.FLOOR_DIRT, new TileModel(GameImages.TILE_FLOOR_DIRT, Color.Sienna, true, true));
    const mfloor_pond_center = new TileModel(GameImages.TILE_FLOOR_POND_CENTER, Color.Blue, true, true);
    mfloor_pond_center.isWater = true;
    mfloor_pond_center.waterCoverImageId = GameImages.TILE_FLOOR_POND_WATER_COVER;
    this.setModel(TileID.FLOOR_POND_CENTER, mfloor_pond_center);
    const mfloor_pond_n_edge = new TileModel(GameImages.TILE_FLOOR_POND_N_EDGE, Color.Blue, true, true);
    mfloor_pond_n_edge.isWater = true;
    mfloor_pond_n_edge.waterCoverImageId = GameImages.TILE_FLOOR_POND_WATER_COVER;
    this.setModel(TileID.FLOOR_POND_N_EDGE, mfloor_pond_n_edge);
    const mfloor_pond_ne_corner = new TileModel(GameImages.TILE_FLOOR_POND_NE_CORNER, Color.Blue, true, true);
    mfloor_pond_ne_corner.isWater = true;
    mfloor_pond_ne_corner.waterCoverImageId = GameImages.TILE_FLOOR_POND_WATER_COVER;
    this.setModel(TileID.FLOOR_POND_NE_CORNER, mfloor_pond_ne_corner);
    const mfloor_pond_e_edge = new TileModel(GameImages.TILE_FLOOR_POND_E_EDGE, Color.Blue, true, true);
    mfloor_pond_e_edge.isWater = true;
    mfloor_pond_e_edge.waterCoverImageId = GameImages.TILE_FLOOR_POND_WATER_COVER;
    this.setModel(TileID.FLOOR_POND_E_EDGE, mfloor_pond_e_edge);
    const mfloor_pond_se_corner = new TileModel(GameImages.TILE_FLOOR_POND_SE_CORNER, Color.Blue, true, true);
    mfloor_pond_se_corner.isWater = true;
    mfloor_pond_se_corner.waterCoverImageId = GameImages.TILE_FLOOR_POND_WATER_COVER;
    this.setModel(TileID.FLOOR_POND_SE_CORNER, mfloor_pond_se_corner);
    const mfloor_pond_s_edge = new TileModel(GameImages.TILE_FLOOR_POND_S_EDGE, Color.Blue, true, true);
    mfloor_pond_s_edge.isWater = true;
    mfloor_pond_s_edge.waterCoverImageId = GameImages.TILE_FLOOR_POND_WATER_COVER;
    this.setModel(TileID.FLOOR_POND_S_EDGE, mfloor_pond_s_edge);
    const mfloor_pond_sw_corner = new TileModel(GameImages.TILE_FLOOR_POND_SW_CORNER, Color.Blue, true, true);
    mfloor_pond_sw_corner.isWater = true;
    mfloor_pond_sw_corner.waterCoverImageId = GameImages.TILE_FLOOR_POND_WATER_COVER;
    this.setModel(TileID.FLOOR_POND_SW_CORNER, mfloor_pond_sw_corner);
    const mfloor_pond_w_edge = new TileModel(GameImages.TILE_FLOOR_POND_W_EDGE, Color.Blue, true, true);
    mfloor_pond_w_edge.isWater = true;
    mfloor_pond_w_edge.waterCoverImageId = GameImages.TILE_FLOOR_POND_WATER_COVER;
    this.setModel(TileID.FLOOR_POND_W_EDGE, mfloor_pond_w_edge);
    const mfloor_pond_nw_corner = new TileModel(GameImages.TILE_FLOOR_POND_NW_CORNER, Color.Blue, true, true);
    mfloor_pond_nw_corner.isWater = true;
    mfloor_pond_nw_corner.waterCoverImageId = GameImages.TILE_FLOOR_POND_WATER_COVER;
    this.setModel(TileID.FLOOR_POND_NW_CORNER, mfloor_pond_nw_corner);
    const mfloor_food_court_pool = new TileModel(GameImages.TILE_FLOOR_FOOD_COURT_POOL, Color.LightBlue, true, true);
    mfloor_food_court_pool.isWater = true;
    mfloor_food_court_pool.waterCoverImageId = GameImages.TILE_FLOOR_POOL_WATER_COVER;
    this.setModel(TileID.FLOOR_FOOD_COURT_POOL, mfloor_food_court_pool);
    this.setModel(TileID.FLOOR_TENNIS_COURT_OUTER, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_OUTER, Color.SeaGreen, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_10, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_10, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_11, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_11, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_12, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_12, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_13, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_13, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_14, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_14, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_15, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_15, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_18, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_18, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_19, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_19, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_20, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_20, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_21, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_21, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_22, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_22, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_23, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_23, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_26, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_26, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_27, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_27, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_28, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_28, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_29, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_29, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_30, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_30, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_31, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_31, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_34, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_34, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_35, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_35, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_36, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_36, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_37, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_37, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_38, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_38, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_39, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_39, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_42, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_42, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_43, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_43, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_44, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_44, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_45, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_45, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_46, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_46, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_47, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_47, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_50, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_50, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_51, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_51, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_52, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_52, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_53, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_53, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_54, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_54, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_55, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_55, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_58, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_58, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_59, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_59, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_60, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_60, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_61, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_61, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_62, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_62, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_63, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_63, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_66, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_66, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_67, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_67, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_68, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_68, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_69, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_69, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_70, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_70, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_TENNIS_COURT_71, new TileModel(GameImages.TILE_FLOOR_TENNIS_COURT_71, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_OUTER, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_OUTER, Color.Gray, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_18, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_18, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_19, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_19, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_20, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_20, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_21, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_21, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_22, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_22, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_23, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_23, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_24, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_24, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_25, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_25, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_27, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_27, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_28, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_28, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_29, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_29, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_30, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_30, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_31, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_31, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_32, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_32, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_33, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_33, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_34, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_34, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_36, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_36, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_37, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_37, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_38, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_38, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_39, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_39, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_40, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_40, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_41, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_41, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_42, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_42, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_43, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_43, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_45, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_45, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_46, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_46, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_47, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_47, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_48, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_48, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_49, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_49, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_50, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_50, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_51, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_51, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_52, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_52, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_54, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_54, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_55, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_55, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_56, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_56, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_57, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_57, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_58, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_58, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_59, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_59, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_60, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_60, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_61, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_61, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_63, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_63, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_64, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_64, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_65, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_65, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_66, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_66, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_67, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_67, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_68, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_68, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_69, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_69, Color.CornflowerBlue, true, true));
    this.setModel(TileID.FLOOR_BASKETBALL_COURT_70, new TileModel(GameImages.TILE_FLOOR_BASKETBALL_COURT_70, Color.CornflowerBlue, true, true));
    this.setModel(TileID.PARKING_ASPHALT_EW, new TileModel(GameImages.TILE_PARKING_ASPHALT_EW, Color.Gray, true, true));
    this.setModel(TileID.PARKING_ASPHALT_NS, new TileModel(GameImages.TILE_PARKING_ASPHALT_NS, Color.Gray, true, true));
    this.setModel(TileID.WALL_LIGHT_BROWN, new TileModel(GameImages.TILE_WALL_LIGHT_BROWN, Color.BurlyWood, false, false));
    this.setModel(TileID.WALL_ARMY_BASE, new TileModel(GameImages.TILE_WALL_ARMY_BASE, Color.OliveDrab, false, false));
    this.setModel(TileID.WALL_FUEL_STATION, new TileModel(GameImages.TILE_WALL_FUEL_STATION, Color.MediumPurple, false, false));
    this.setModel(TileID.WALL_WOOD_PLANKS, new TileModel(GameImages.TILE_WALL_WOOD_PLANKS, Color.Sienna, false, false));
    this.setModel(TileID.WALL_CONCRETE, new TileModel(GameImages.TILE_WALL_CONCRETE, Color.LightGray, false, false));
    this.setModel(TileID.WALL_PILLAR_CONCRETE, new TileModel(GameImages.TILE_WALL_PILLAR_CONCRETE, Color.LightGray, false, false));
    this.setModel(TileID.WALL_MALL, new TileModel(GameImages.TILE_WALL_MALL, Color.BlanchedAlmond, false, false));
    this.setModel(TileID.WALL_RED_CURTAINS, new TileModel(GameImages.TILE_WALL_RED_CURTAINS, DRK_RED, false, false));

    // ── Still Alive: the five flammable tiles. Release 5-2.
    //
    // **At the end, after every `setModel` above.** Marking them earlier silently
    // marked one tile, because the models for four of the five are installed by
    // the generated table further down and a later `setModel` replaces the object
    // wholesale -- taking the flag with it. Nothing failed; the count was just 1.
    //
    // `isFlammable` is not copied by `scripts/port-tile-models.py`, because the
    // port's `TileModel` had no such field until now. The generator's fixture
    // (`still-alive-tiles.json`) records it for all 143 models, so when that table
    // is regenerated this should hand over to it; until then this is the
    // authoritative list and the fixture is what says it should match.
    //
    // `FLOOR_PLANTED` is included because the C# includes it, even though nothing
    // in the port can plant anything -- the farming system is alpha10-era and was
    // never ported. Marking it costs nothing and keeps the list honest.
    for (const id of [
      TileID.FLOOR_PLANTED,
      TileID.FLOOR_RED_CARPET,
      TileID.FLOOR_BLUE_CARPET,
      TileID.WALL_WOOD_PLANKS,
      TileID.WALL_RED_CURTAINS,
    ] as const) {
      this.get(id).isFlammable = true;
    }
  }

  private setModel(id: TileID, model: TileModel): void {
    model.id = id;
    this.models[id] = model;
  }

  override get(id: number): TileModel {
    return this.models[id] ?? TileModel.UNDEF;
  }

  /**
   * Is this one of the fourteen *wall* models? Still Alive, Release 6-3.
   *
   * The explicit list, not `!model.isWalkable`, even though all fourteen happen to
   * be unwalkable. The reason is the use: `DarknessFov` 2b skips lighting a *tile
   * fire* on a wall, because making a wall "visible" makes it transparent and
   * you can see straight through the building. That is a list of fifteen specific
   * models, and `!isWalkable` would quietly include things the C# leaves dark --
   * rail, doors, anything else that is unwalkable.
   */
  isWallModel(model: TileModel): boolean {
    for (const id of WALL_MODEL_IDS) if (this.models[id] === model) return true;
    return false;
  }

  isRoadModel(model: TileModel): boolean {
    return model === this.models[TileID.ROAD_ASPHALT_EW] || model === this.models[TileID.ROAD_ASPHALT_NS];
  }
}
