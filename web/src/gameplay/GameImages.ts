export class GameImages {
  // ── Activities ────────────────────────────────────────────────────────────
  static readonly ACTIVITY_CHASING = "Activities/chasing";
  static readonly ACTIVITY_CHASING_PLAYER = "Activities/chasing_player";
  static readonly ACTIVITY_TRACKING = "Activities/tracking";
  static readonly ACTIVITY_FLEEING = "Activities/fleeing";
  static readonly ACTIVITY_FLEEING_FROM_EXPLOSIVE = "Activities/fleeing_explosive";
  static readonly ACTIVITY_FOLLOWING = "Activities/following";
  static readonly ACTIVITY_FOLLOWING_ORDER = "Activities/following_order";
  static readonly ACTIVITY_FOLLOWING_PLAYER = "Activities/following_player";
  static readonly ACTIVITY_FOLLOWING_LEADER = "Activities/following_leader";
  static readonly ACTIVITY_SLEEPING = "Activities/sleeping";

  // ── Icons ─────────────────────────────────────────────────────────────────
  static readonly ICON_BLAST = "Icons/blast";
  static readonly ICON_CAN_TRADE = "Icons/can_trade";
  static readonly ICON_HAS_VITAL_ITEM = "Icons/has_vital_item";
  static readonly ICON_THREAT_SAFE = "Icons/threat_safe";
  static readonly ICON_THREAT_DANGER = "Icons/threat_danger";
  static readonly ICON_THREAT_HIGH_DANGER = "Icons/threat_high_danger";
  static readonly ICON_CANT_RUN = "Icons/cant_run";
  static readonly ICON_EXPIRED_FOOD = "Icons/expired_food";
  static readonly ICON_FOOD_ALMOST_HUNGRY = "Icons/food_almost_hungry";
  static readonly ICON_FOOD_HUNGRY = "Icons/food_hungry";
  static readonly ICON_FOOD_STARVING = "Icons/food_starving";
  static readonly ICON_HEALING = "Icons/healing";
  static readonly ICON_IS_TARGET = "Icons/is_target";
  static readonly ICON_IS_TARGETTED = "Icons/is_targetted";
  static readonly ICON_IS_TARGETING = "Icons/is_targeting";
  static readonly ICON_IS_IN_GROUP = "Icons/is_in_group";
  static readonly ICON_KILLED = "Icons/killed";
  static readonly ICON_LEADER = "Icons/leader";
  static readonly ICON_MELEE_ATTACK = "Icons/melee_attack";
  static readonly ICON_MELEE_MISS = "Icons/melee_miss";
  static readonly ICON_MELEE_DAMAGE = "Icons/melee_damage";
  static readonly ICON_ODOR_SUPPRESSED = "Icons/odor_suppressed";
  static readonly ICON_OUT_OF_AMMO = "Icons/out_of_ammo";
  static readonly ICON_OUT_OF_BATTERIES = "Icons/out_of_batteries";
  static readonly ICON_RANGED_ATTACK = "Icons/ranged_attack";
  static readonly ICON_RANGED_MISS = "Icons/ranged_miss";
  static readonly ICON_RANGED_DAMAGE = "Icons/ranged_damage";
  static readonly ICON_RUNNING = "Icons/running";
  static readonly ICON_ROT_ALMOST_HUNGRY = "Icons/rot_almost_hungry";
  static readonly ICON_ROT_HUNGRY = "Icons/rot_hungry";
  static readonly ICON_ROT_STARVING = "Icons/rot_starving";
  static readonly ICON_SLEEP_ALMOST_SLEEPY = "Icons/sleep_almost_sleepy";
  static readonly ICON_SLEEP_EXHAUSTED = "Icons/sleep_exhausted";
  static readonly ICON_SLEEP_SLEEPY = "Icons/sleep_sleepy";
  static readonly ICON_SPOILED_FOOD = "Icons/spoiled_food";
  static readonly ICON_TARGET = "Icons/target";
  static readonly ICON_LINE_BLOCKED = "Icons/line_blocked";
  static readonly ICON_LINE_CLEAR = "Icons/line_clear";
  static readonly ICON_LINE_BAD = "Icons/line_bad";
  static readonly ICON_SCENT_LIVING = "Icons/scent_living";
  static readonly ICON_SCENT_ZOMBIEMASTER = "Icons/scent_zm";
  static readonly ICON_AGGRESSOR = "Icons/enemy_you_aggressor";
  static readonly ICON_INDIRECT_ENEMIES = "Icons/enemy_indirect";
  static readonly ICON_SELF_DEFENCE = "Icons/enemy_you_self_defence";
  static readonly ICON_TRAP_ACTIVATED = "Icons/trap_activated";
  static readonly ICON_TRAP_ACTIVATED_SAFE_GROUP = "Icons/trap_activated_safe_group";
  static readonly ICON_TRAP_ACTIVATED_SAFE_PLAYER = "Icons/trap_activated_safe_player";
  static readonly ICON_TRAP_TRIGGERED = "Icons/trap_triggered";
  static readonly ICON_TRAP_TRIGGERED_SAFE_GROUP = "Icons/trap_triggered_safe_group";
  static readonly ICON_TRAP_TRIGGERED_SAFE_PLAYER = "Icons/trap_triggered_safe_player";
  static readonly ICON_SANITY_DISTURBED = "Icons/sanity_disturbed";
  static readonly ICON_SANITY_INSANE = "Icons/sanity_insane";
  static readonly ICON_BORING_ITEM = "Icons/boring_item";
  static readonly ICON_ZGRAB = "Icons/zgrab";

  // ── Tiles ─────────────────────────────────────────────────────────────────
  static readonly TILE_FLOOR_ASPHALT = "Tiles/floor_asphalt";
  static readonly TILE_FLOOR_CONCRETE = "Tiles/floor_concrete";
  static readonly TILE_FLOOR_GRASS = "Tiles/floor_grass";
  static readonly TILE_FLOOR_OFFICE = "Tiles/floor_office";
  static readonly TILE_FLOOR_PLANKS = "Tiles/floor_planks";
  static readonly TILE_FLOOR_SEWER_WATER = "Tiles/floor_sewer_water";
  static readonly TILE_FLOOR_SEWER_WATER_ANIM1 = "Tiles/floor_sewer_water_anim1";
  static readonly TILE_FLOOR_SEWER_WATER_ANIM2 = "Tiles/floor_sewer_water_anim2";
  static readonly TILE_FLOOR_SEWER_WATER_ANIM3 = "Tiles/floor_sewer_water_anim3";
  static readonly TILE_FLOOR_SEWER_WATER_COVER = "Tiles/floor_sewer_water_cover";
  static readonly TILE_FLOOR_TILES = "Tiles/floor_tiles";
  static readonly TILE_FLOOR_WALKWAY = "Tiles/floor_walkway";
  static readonly TILE_ROAD_ASPHALT_NS = "Tiles/road_asphalt_ns";
  static readonly TILE_ROAD_ASPHALT_EW = "Tiles/road_asphalt_ew";
  static readonly TILE_RAIL_ES = "Tiles/rail_ew";
  static readonly TILE_WALL_BRICK = "Tiles/wall_brick";
  static readonly TILE_WALL_CHAR_OFFICE = "Tiles/wall_char_office";
  static readonly TILE_WALL_HOSPITAL = "Tiles/wall_hospital";
  static readonly TILE_WALL_SEWER = "Tiles/wall_sewer";
  static readonly TILE_WALL_STONE = "Tiles/wall_stone";

  // ── Still Alive tiles (scripts/port-tile-models.py). Paths are verbatim
  // from the fork's GameImages.cs, which is why TILE_RAIL_ES names a
  // rail_ew file and FLOOR_ARMY reuses the office floor texture.
  static readonly TILE_FLOOR_BASKETBALL_COURT_18 = "Tiles/basketball_court/floor_basketball_court_18";
  static readonly TILE_FLOOR_BASKETBALL_COURT_19 = "Tiles/basketball_court/floor_basketball_court_19";
  static readonly TILE_FLOOR_BASKETBALL_COURT_20 = "Tiles/basketball_court/floor_basketball_court_20";
  static readonly TILE_FLOOR_BASKETBALL_COURT_21 = "Tiles/basketball_court/floor_basketball_court_21";
  static readonly TILE_FLOOR_BASKETBALL_COURT_22 = "Tiles/basketball_court/floor_basketball_court_22";
  static readonly TILE_FLOOR_BASKETBALL_COURT_23 = "Tiles/basketball_court/floor_basketball_court_23";
  static readonly TILE_FLOOR_BASKETBALL_COURT_24 = "Tiles/basketball_court/floor_basketball_court_24";
  static readonly TILE_FLOOR_BASKETBALL_COURT_25 = "Tiles/basketball_court/floor_basketball_court_25";
  static readonly TILE_FLOOR_BASKETBALL_COURT_27 = "Tiles/basketball_court/floor_basketball_court_27";
  static readonly TILE_FLOOR_BASKETBALL_COURT_28 = "Tiles/basketball_court/floor_basketball_court_28";
  static readonly TILE_FLOOR_BASKETBALL_COURT_29 = "Tiles/basketball_court/floor_basketball_court_29";
  static readonly TILE_FLOOR_BASKETBALL_COURT_30 = "Tiles/basketball_court/floor_basketball_court_30";
  static readonly TILE_FLOOR_BASKETBALL_COURT_31 = "Tiles/basketball_court/floor_basketball_court_31";
  static readonly TILE_FLOOR_BASKETBALL_COURT_32 = "Tiles/basketball_court/floor_basketball_court_32";
  static readonly TILE_FLOOR_BASKETBALL_COURT_33 = "Tiles/basketball_court/floor_basketball_court_33";
  static readonly TILE_FLOOR_BASKETBALL_COURT_34 = "Tiles/basketball_court/floor_basketball_court_34";
  static readonly TILE_FLOOR_BASKETBALL_COURT_36 = "Tiles/basketball_court/floor_basketball_court_36";
  static readonly TILE_FLOOR_BASKETBALL_COURT_37 = "Tiles/basketball_court/floor_basketball_court_37";
  static readonly TILE_FLOOR_BASKETBALL_COURT_38 = "Tiles/basketball_court/floor_basketball_court_38";
  static readonly TILE_FLOOR_BASKETBALL_COURT_39 = "Tiles/basketball_court/floor_basketball_court_39";
  static readonly TILE_FLOOR_BASKETBALL_COURT_40 = "Tiles/basketball_court/floor_basketball_court_40";
  static readonly TILE_FLOOR_BASKETBALL_COURT_41 = "Tiles/basketball_court/floor_basketball_court_41";
  static readonly TILE_FLOOR_BASKETBALL_COURT_42 = "Tiles/basketball_court/floor_basketball_court_42";
  static readonly TILE_FLOOR_BASKETBALL_COURT_43 = "Tiles/basketball_court/floor_basketball_court_43";
  static readonly TILE_FLOOR_BASKETBALL_COURT_45 = "Tiles/basketball_court/floor_basketball_court_45";
  static readonly TILE_FLOOR_BASKETBALL_COURT_46 = "Tiles/basketball_court/floor_basketball_court_46";
  static readonly TILE_FLOOR_BASKETBALL_COURT_47 = "Tiles/basketball_court/floor_basketball_court_47";
  static readonly TILE_FLOOR_BASKETBALL_COURT_48 = "Tiles/basketball_court/floor_basketball_court_48";
  static readonly TILE_FLOOR_BASKETBALL_COURT_49 = "Tiles/basketball_court/floor_basketball_court_49";
  static readonly TILE_FLOOR_BASKETBALL_COURT_50 = "Tiles/basketball_court/floor_basketball_court_50";
  static readonly TILE_FLOOR_BASKETBALL_COURT_51 = "Tiles/basketball_court/floor_basketball_court_51";
  static readonly TILE_FLOOR_BASKETBALL_COURT_52 = "Tiles/basketball_court/floor_basketball_court_52";
  static readonly TILE_FLOOR_BASKETBALL_COURT_54 = "Tiles/basketball_court/floor_basketball_court_54";
  static readonly TILE_FLOOR_BASKETBALL_COURT_55 = "Tiles/basketball_court/floor_basketball_court_55";
  static readonly TILE_FLOOR_BASKETBALL_COURT_56 = "Tiles/basketball_court/floor_basketball_court_56";
  static readonly TILE_FLOOR_BASKETBALL_COURT_57 = "Tiles/basketball_court/floor_basketball_court_57";
  static readonly TILE_FLOOR_BASKETBALL_COURT_58 = "Tiles/basketball_court/floor_basketball_court_58";
  static readonly TILE_FLOOR_BASKETBALL_COURT_59 = "Tiles/basketball_court/floor_basketball_court_59";
  static readonly TILE_FLOOR_BASKETBALL_COURT_60 = "Tiles/basketball_court/floor_basketball_court_60";
  static readonly TILE_FLOOR_BASKETBALL_COURT_61 = "Tiles/basketball_court/floor_basketball_court_61";
  static readonly TILE_FLOOR_BASKETBALL_COURT_63 = "Tiles/basketball_court/floor_basketball_court_63";
  static readonly TILE_FLOOR_BASKETBALL_COURT_64 = "Tiles/basketball_court/floor_basketball_court_64";
  static readonly TILE_FLOOR_BASKETBALL_COURT_65 = "Tiles/basketball_court/floor_basketball_court_65";
  static readonly TILE_FLOOR_BASKETBALL_COURT_66 = "Tiles/basketball_court/floor_basketball_court_66";
  static readonly TILE_FLOOR_BASKETBALL_COURT_67 = "Tiles/basketball_court/floor_basketball_court_67";
  static readonly TILE_FLOOR_BASKETBALL_COURT_68 = "Tiles/basketball_court/floor_basketball_court_68";
  static readonly TILE_FLOOR_BASKETBALL_COURT_69 = "Tiles/basketball_court/floor_basketball_court_69";
  static readonly TILE_FLOOR_BASKETBALL_COURT_70 = "Tiles/basketball_court/floor_basketball_court_70";
  static readonly TILE_FLOOR_BASKETBALL_COURT_OUTER = "Tiles/basketball_court/floor_basketball_court_outer";
  static readonly TILE_FLOOR_BLUE_CARPET = "Tiles/floor_blue_carpet";
  static readonly TILE_FLOOR_DIRT = "Tiles/floor_dirt";
  static readonly TILE_FLOOR_FOOD_COURT_POOL = "Tiles/floor_food_court_pool";
  static readonly TILE_FLOOR_PLANTED = "Tiles/floor_planted";
  static readonly TILE_FLOOR_POND_CENTER = "Tiles/floor_pond_center";
  static readonly TILE_FLOOR_POND_E_EDGE = "Tiles/floor_pond_east-edge";
  static readonly TILE_FLOOR_POND_NE_CORNER = "Tiles/floor_pond_ne-corner";
  static readonly TILE_FLOOR_POND_NW_CORNER = "Tiles/floor_pond_nw-corner";
  static readonly TILE_FLOOR_POND_N_EDGE = "Tiles/floor_pond_north-edge";
  static readonly TILE_FLOOR_POND_SE_CORNER = "Tiles/floor_pond_se-corner";
  static readonly TILE_FLOOR_POND_SW_CORNER = "Tiles/floor_pond_sw-corner";
  static readonly TILE_FLOOR_POND_S_EDGE = "Tiles/floor_pond_south-edge";
  static readonly TILE_FLOOR_POND_WATER_COVER = "Tiles/floor_pond_water_cover";
  static readonly TILE_FLOOR_POND_W_EDGE = "Tiles/floor_pond_west-edge";
  static readonly TILE_FLOOR_POOL_WATER_COVER = "Tiles/floor_pool_water_cover";
  static readonly TILE_FLOOR_RED_CARPET = "Tiles/floor_red_carpet";
  static readonly TILE_FLOOR_TENNIS_COURT_10 = "Tiles/tennis_court/floor_tennis_court_10";
  static readonly TILE_FLOOR_TENNIS_COURT_11 = "Tiles/tennis_court/floor_tennis_court_11";
  static readonly TILE_FLOOR_TENNIS_COURT_12 = "Tiles/tennis_court/floor_tennis_court_12";
  static readonly TILE_FLOOR_TENNIS_COURT_13 = "Tiles/tennis_court/floor_tennis_court_13";
  static readonly TILE_FLOOR_TENNIS_COURT_14 = "Tiles/tennis_court/floor_tennis_court_14";
  static readonly TILE_FLOOR_TENNIS_COURT_15 = "Tiles/tennis_court/floor_tennis_court_15";
  static readonly TILE_FLOOR_TENNIS_COURT_18 = "Tiles/tennis_court/floor_tennis_court_18";
  static readonly TILE_FLOOR_TENNIS_COURT_19 = "Tiles/tennis_court/floor_tennis_court_19";
  static readonly TILE_FLOOR_TENNIS_COURT_20 = "Tiles/tennis_court/floor_tennis_court_20";
  static readonly TILE_FLOOR_TENNIS_COURT_21 = "Tiles/tennis_court/floor_tennis_court_21";
  static readonly TILE_FLOOR_TENNIS_COURT_22 = "Tiles/tennis_court/floor_tennis_court_22";
  static readonly TILE_FLOOR_TENNIS_COURT_23 = "Tiles/tennis_court/floor_tennis_court_23";
  static readonly TILE_FLOOR_TENNIS_COURT_26 = "Tiles/tennis_court/floor_tennis_court_26";
  static readonly TILE_FLOOR_TENNIS_COURT_27 = "Tiles/tennis_court/floor_tennis_court_27";
  static readonly TILE_FLOOR_TENNIS_COURT_28 = "Tiles/tennis_court/floor_tennis_court_28";
  static readonly TILE_FLOOR_TENNIS_COURT_29 = "Tiles/tennis_court/floor_tennis_court_29";
  static readonly TILE_FLOOR_TENNIS_COURT_30 = "Tiles/tennis_court/floor_tennis_court_30";
  static readonly TILE_FLOOR_TENNIS_COURT_31 = "Tiles/tennis_court/floor_tennis_court_31";
  static readonly TILE_FLOOR_TENNIS_COURT_34 = "Tiles/tennis_court/floor_tennis_court_34";
  static readonly TILE_FLOOR_TENNIS_COURT_35 = "Tiles/tennis_court/floor_tennis_court_35";
  static readonly TILE_FLOOR_TENNIS_COURT_36 = "Tiles/tennis_court/floor_tennis_court_36";
  static readonly TILE_FLOOR_TENNIS_COURT_37 = "Tiles/tennis_court/floor_tennis_court_37";
  static readonly TILE_FLOOR_TENNIS_COURT_38 = "Tiles/tennis_court/floor_tennis_court_38";
  static readonly TILE_FLOOR_TENNIS_COURT_39 = "Tiles/tennis_court/floor_tennis_court_39";
  static readonly TILE_FLOOR_TENNIS_COURT_42 = "Tiles/tennis_court/floor_tennis_court_42";
  static readonly TILE_FLOOR_TENNIS_COURT_43 = "Tiles/tennis_court/floor_tennis_court_43";
  static readonly TILE_FLOOR_TENNIS_COURT_44 = "Tiles/tennis_court/floor_tennis_court_44";
  static readonly TILE_FLOOR_TENNIS_COURT_45 = "Tiles/tennis_court/floor_tennis_court_45";
  static readonly TILE_FLOOR_TENNIS_COURT_46 = "Tiles/tennis_court/floor_tennis_court_46";
  static readonly TILE_FLOOR_TENNIS_COURT_47 = "Tiles/tennis_court/floor_tennis_court_47";
  static readonly TILE_FLOOR_TENNIS_COURT_50 = "Tiles/tennis_court/floor_tennis_court_50";
  static readonly TILE_FLOOR_TENNIS_COURT_51 = "Tiles/tennis_court/floor_tennis_court_51";
  static readonly TILE_FLOOR_TENNIS_COURT_52 = "Tiles/tennis_court/floor_tennis_court_52";
  static readonly TILE_FLOOR_TENNIS_COURT_53 = "Tiles/tennis_court/floor_tennis_court_53";
  static readonly TILE_FLOOR_TENNIS_COURT_54 = "Tiles/tennis_court/floor_tennis_court_54";
  static readonly TILE_FLOOR_TENNIS_COURT_55 = "Tiles/tennis_court/floor_tennis_court_55";
  static readonly TILE_FLOOR_TENNIS_COURT_58 = "Tiles/tennis_court/floor_tennis_court_58";
  static readonly TILE_FLOOR_TENNIS_COURT_59 = "Tiles/tennis_court/floor_tennis_court_59";
  static readonly TILE_FLOOR_TENNIS_COURT_60 = "Tiles/tennis_court/floor_tennis_court_60";
  static readonly TILE_FLOOR_TENNIS_COURT_61 = "Tiles/tennis_court/floor_tennis_court_61";
  static readonly TILE_FLOOR_TENNIS_COURT_62 = "Tiles/tennis_court/floor_tennis_court_62";
  static readonly TILE_FLOOR_TENNIS_COURT_63 = "Tiles/tennis_court/floor_tennis_court_63";
  static readonly TILE_FLOOR_TENNIS_COURT_66 = "Tiles/tennis_court/floor_tennis_court_66";
  static readonly TILE_FLOOR_TENNIS_COURT_67 = "Tiles/tennis_court/floor_tennis_court_67";
  static readonly TILE_FLOOR_TENNIS_COURT_68 = "Tiles/tennis_court/floor_tennis_court_68";
  static readonly TILE_FLOOR_TENNIS_COURT_69 = "Tiles/tennis_court/floor_tennis_court_69";
  static readonly TILE_FLOOR_TENNIS_COURT_70 = "Tiles/tennis_court/floor_tennis_court_70";
  static readonly TILE_FLOOR_TENNIS_COURT_71 = "Tiles/tennis_court/floor_tennis_court_71";
  static readonly TILE_FLOOR_TENNIS_COURT_OUTER = "Tiles/tennis_court/floor_tennis_court_outer";
  static readonly TILE_FLOOR_WHITE_TILE = "Tiles/floor_white_tile";
  static readonly TILE_PARKING_ASPHALT_EW = "Tiles/parking_asphalt_ew";
  static readonly TILE_PARKING_ASPHALT_NS = "Tiles/parking_asphalt_ns";
  static readonly TILE_WALL_ARMY_BASE = "Tiles/wall_army_base";
  static readonly TILE_WALL_CONCRETE = "Tiles/wall_concrete";
  static readonly TILE_WALL_FUEL_STATION = "Tiles/wall_fuel_station";
  static readonly TILE_WALL_LIGHT_BROWN = "Tiles/wall_light_brown";
  static readonly TILE_WALL_MALL = "Tiles/wall_mall";
  static readonly TILE_WALL_PILLAR_CONCRETE = "Tiles/wall_pillar_concrete";
  static readonly TILE_WALL_RED_CURTAINS = "Tiles/wall_red_curtains";
  static readonly TILE_WALL_WOOD_PLANKS = "Tiles/wall_wood_planks";

  // ── Decorations ───────────────────────────────────────────────────────────
  static readonly DECO_BLOODIED_FLOOR = "Tiles/Decoration/bloodied_floor";
  static readonly DECO_BLOODIED_WALL = "Tiles/Decoration/bloodied_wall";
  static readonly DECO_ZOMBIE_REMAINS = "Tiles/Decoration/zombie_remains";
  static readonly DECO_VOMIT = "Tiles/Decoration/vomit";
  static readonly DECO_POSTERS1 = "Tiles/Decoration/posters1";
  static readonly DECO_POSTERS2 = "Tiles/Decoration/posters2";
  static readonly DECO_TAGS1 = "Tiles/Decoration/tags1";
  static readonly DECO_TAGS2 = "Tiles/Decoration/tags2";
  static readonly DECO_TAGS3 = "Tiles/Decoration/tags3";
  static readonly DECO_TAGS4 = "Tiles/Decoration/tags4";
  static readonly DECO_TAGS5 = "Tiles/Decoration/tags5";
  static readonly DECO_TAGS6 = "Tiles/Decoration/tags6";
  static readonly DECO_TAGS7 = "Tiles/Decoration/tags7";
  static readonly DECO_SHOP_CONSTRUCTION = "Tiles/Decoration/shop_construction";
  static readonly DECO_SHOP_GENERAL_STORE = "Tiles/Decoration/shop_general_store";
  static readonly DECO_SHOP_GROCERY = "Tiles/Decoration/shop_grocery";
  static readonly DECO_SHOP_GUNSHOP = "Tiles/Decoration/shop_gunshop";
  static readonly DECO_SHOP_PHARMACY = "Tiles/Decoration/shop_pharmacy";
  static readonly DECO_SHOP_SPORTSWEAR = "Tiles/Decoration/shop_sportswear";
  static readonly DECO_SHOP_HUNTING = "Tiles/Decoration/shop_hunting";
  static readonly DECO_CHAR_OFFICE = "Tiles/Decoration/char_office";
  static readonly DECO_CHAR_FLOOR_LOGO = "Tiles/Decoration/char_floor_logo";
  static readonly DECO_CHAR_POSTER1 = "Tiles/Decoration/char_poster1";
  static readonly DECO_CHAR_POSTER2 = "Tiles/Decoration/char_poster2";
  static readonly DECO_CHAR_POSTER3 = "Tiles/Decoration/char_poster3";
  static readonly DECO_PLAYER_TAG1 = "Tiles/Decoration/player_tag";
  static readonly DECO_PLAYER_TAG2 = "Tiles/Decoration/player_tag2";
  static readonly DECO_PLAYER_TAG3 = "Tiles/Decoration/player_tag3";
  static readonly DECO_PLAYER_TAG4 = "Tiles/Decoration/player_tag4";
  static readonly DECO_ROGUEDJACK_TAG = "Tiles/Decoration/roguedjack";
  static readonly DECO_SEWER_LADDER = "Tiles/Decoration/sewer_ladder";
  static readonly DECO_SEWER_HOLE = "Tiles/Decoration/sewer_hole";
  static readonly DECO_SEWERS_BUILDING = "Tiles/Decoration/sewers_building";
  static readonly DECO_SUBWAY_BUILDING = "Tiles/Decoration/subway_building";
  static readonly DECO_STAIRS_UP = "Tiles/Decoration/stairs_up";
  static readonly DECO_STAIRS_DOWN = "Tiles/Decoration/stairs_down";
  static readonly DECO_POWER_SIGN_BIG = "Tiles/Decoration/power_sign_big";
  static readonly DECO_POLICE_STATION = "Tiles/Decoration/police_station";
  static readonly DECO_HOSPITAL = "Tiles/Decoration/hospital";
  // Still Alive Release 4, first reader `Feature.Bank`.
  static readonly DECO_BANK_SIGN = "Tiles/Decoration/bank_sign";

  // ── Map Objects ───────────────────────────────────────────────────────────
  static readonly OBJ_TREE = "MapObjects/tree";
  static readonly OBJ_WOODEN_DOOR_CLOSED = "MapObjects/wooden_door_closed";
  static readonly OBJ_WOODEN_DOOR_OPEN = "MapObjects/wooden_door_open";
  static readonly OBJ_WOODEN_DOOR_BROKEN = "MapObjects/wooden_door_broken";
  static readonly OBJ_GLASS_DOOR_CLOSED = "MapObjects/glass_door_closed";
  static readonly OBJ_GLASS_DOOR_OPEN = "MapObjects/glass_door_open";
  static readonly OBJ_GLASS_DOOR_BROKEN = "MapObjects/glass_door_broken";
  static readonly OBJ_CHAR_DOOR_CLOSED = "MapObjects/dark_door_closed";
  static readonly OBJ_CHAR_DOOR_OPEN = "MapObjects/dark_door_open";
  static readonly OBJ_CHAR_DOOR_BROKEN = "MapObjects/dark_door_broken";
  static readonly OBJ_WINDOW_CLOSED = "MapObjects/window_closed";
  static readonly OBJ_WINDOW_OPEN = "MapObjects/window_open";
  static readonly OBJ_WINDOW_BROKEN = "MapObjects/window_broken";
  static readonly OBJ_BENCH = "MapObjects/bench";
  static readonly OBJ_FENCE = "MapObjects/fence";
  static readonly OBJ_CAR1 = "MapObjects/car1";
  static readonly OBJ_CAR2 = "MapObjects/car2";
  static readonly OBJ_CAR3 = "MapObjects/car3";
  static readonly OBJ_CAR4 = "MapObjects/car4";
  static readonly OBJ_SHOP_SHELF = "MapObjects/shop_shelf";
  static readonly OBJ_BED = "MapObjects/bed";
  static readonly OBJ_WARDROBE = "MapObjects/wardrobe";
  static readonly OBJ_TABLE = "MapObjects/table";
  static readonly OBJ_FRIDGE = "MapObjects/fridge";
  static readonly OBJ_DRAWER = "MapObjects/drawer";
  static readonly OBJ_CHAIR = "MapObjects/chair";
  static readonly OBJ_NIGHT_TABLE = "MapObjects/nighttable";
  static readonly OBJ_CHAR_CHAIR = "MapObjects/char_chair";
  static readonly OBJ_CHAR_TABLE = "MapObjects/char_table";
  static readonly OBJ_IRON_BENCH = "MapObjects/iron_bench";
  static readonly OBJ_IRON_DOOR_OPEN = "MapObjects/iron_door_open";
  static readonly OBJ_IRON_DOOR_CLOSED = "MapObjects/iron_door_closed";
  static readonly OBJ_IRON_DOOR_BROKEN = "MapObjects/iron_door_broken";
  static readonly OBJ_IRON_FENCE = "MapObjects/iron_fence";
  static readonly OBJ_BARRELS = "MapObjects/barrels";
  static readonly OBJ_JUNK = "MapObjects/junk";
  static readonly OBJ_POWERGEN_OFF = "MapObjects/power_generator_off";
  static readonly OBJ_POWERGEN_ON = "MapObjects/power_generator_on";
  static readonly OBJ_GATE_CLOSED = "MapObjects/gate_closed";
  static readonly OBJ_GATE_OPEN = "MapObjects/gate_open";
  static readonly OBJ_BOARD = "MapObjects/announcement_board";
  static readonly OBJ_SMALL_WOODEN_FORTIFICATION = "MapObjects/wooden_small_fortification";
  static readonly OBJ_LARGE_WOODEN_FORTIFICATION = "MapObjects/wooden_large_fortification";
  static readonly OBJ_HOSPITAL_BED = "MapObjects/hospital_bed";
  static readonly OBJ_HOSPITAL_CHAIR = "MapObjects/hospital_chair";
  static readonly OBJ_HOSPITAL_NIGHT_TABLE = "MapObjects/hospital_nighttable";
  static readonly OBJ_HOSPITAL_WARDROBE = "MapObjects/hospital_wardrobe";
  static readonly OBJ_HOSPITAL_DOOR_OPEN = "MapObjects/hospital_door_open";
  static readonly OBJ_HOSPITAL_DOOR_CLOSED = "MapObjects/hospital_door_closed";
  static readonly OBJ_HOSPITAL_DOOR_BROKEN = "MapObjects/hospital_door_broken";
  static readonly OBJ_GARDEN_FENCE = "MapObjects/garden_fence";
  static readonly OBJ_WIRE_FENCE = "MapObjects/wire_fence";
  static readonly OBJ_COUCH = "MapObjects/couch";
  // Still Alive Release 4/6-5, the bank's three. `Feature.Bank` is the reader.
  static readonly OBJ_BANK_TELLER = "MapObjects/bank_teller";
  static readonly OBJ_BANK_SAFE_CLOSED = "MapObjects/bank_safe_closed";
  static readonly OBJ_BANK_SAFE_OPEN = "MapObjects/bank_safe_open";

  // ── Actors ────────────────────────────────────────────────────────────────
  static readonly PLAYER_FOLLOWER = "Actors/player_follower";
  static readonly PLAYER_FOLLOWER_TRUST = "Actors/player_follower_trust";
  static readonly PLAYER_FOLLOWER_BOND = "Actors/player_follower_bond";
  static readonly ACTOR_SKELETON = "Actors/skeleton";
  static readonly ACTOR_RED_EYED_SKELETON = "Actors/red_eyed_skeleton";
  static readonly ACTOR_RED_SKELETON = "Actors/red_skeleton";
  static readonly ACTOR_ZOMBIE = "Actors/zombie";
  static readonly ACTOR_DARK_EYED_ZOMBIE = "Actors/dark_eyed_zombie";
  static readonly ACTOR_DARK_ZOMBIE = "Actors/dark_zombie";
  static readonly ACTOR_MALE_NEOPHYTE = "Actors/male_neophyte";
  static readonly ACTOR_FEMALE_NEOPHYTE = "Actors/female_neophyte";
  static readonly ACTOR_MALE_DISCIPLE = "Actors/male_disciple";
  static readonly ACTOR_FEMALE_DISCIPLE = "Actors/female_disciple";
  static readonly ACTOR_ZOMBIE_MASTER = "Actors/zombie_master";
  static readonly ACTOR_ZOMBIE_LORD = "Actors/zombie_lord";
  static readonly ACTOR_ZOMBIE_PRINCE = "Actors/zombie_prince";
  static readonly ACTOR_RAT_ZOMBIE = "Actors/rat_zombie";
  static readonly ACTOR_SEWERS_THING = "Actors/sewers_thing";
  static readonly ACTOR_JASON_MYERS = "Actors/jason_myers";
  // Still Alive's two additions that need no new ability or AI: the deranged
  // patient is the fork's replacement for Jason Myers ("was Jason Myers",
  // Release 8-1) and keeps his InsaneHumanAI and RAGE sheet, and the CHAR
  // scientist is a second CHARGuardAI. Both are skinned and dressed rather than
  // drawn whole-body, so `actorImageMap` maps them to null and these constants
  // exist for the same reason `ACTOR_JASON_MYERS` does.
  static readonly ACTOR_DERANGED_PATIENT = "Actors/deranged_patient";
  static readonly ACTOR_CHAR_SCIENTIST = "Actors/CHAR_scientist";
  static readonly ACTOR_BIG_BEAR = "Actors/big_bear";
  static readonly ACTOR_FAMU_FATARU = "Actors/famu_fataru";
  static readonly ACTOR_SANTAMAN = "Actors/santaman";
  static readonly ACTOR_ROGUEDJACK = "Actors/roguedjack";
  static readonly ACTOR_DUCKMAN = "Actors/duckman";
  static readonly ACTOR_HANS_VON_HANZ = "Actors/hans_von_hanz";

  // ── Actor Decorations ─────────────────────────────────────────────────────
  static readonly BLOODIED = "Actors/Decoration/bloodied";
  static readonly MALE_SKIN1 = "Actors/Decoration/male_skin1";
  static readonly MALE_SKIN2 = "Actors/Decoration/male_skin2";
  static readonly MALE_SKIN3 = "Actors/Decoration/male_skin3";
  static readonly MALE_SKIN4 = "Actors/Decoration/male_skin4";
  static readonly MALE_SKIN5 = "Actors/Decoration/male_skin5";
  static readonly MALE_HAIR1 = "Actors/Decoration/male_hair1";
  static readonly MALE_HAIR2 = "Actors/Decoration/male_hair2";
  static readonly MALE_HAIR3 = "Actors/Decoration/male_hair3";
  static readonly MALE_HAIR4 = "Actors/Decoration/male_hair4";
  static readonly MALE_HAIR5 = "Actors/Decoration/male_hair5";
  static readonly MALE_HAIR6 = "Actors/Decoration/male_hair6";
  static readonly MALE_HAIR7 = "Actors/Decoration/male_hair7";
  static readonly MALE_HAIR8 = "Actors/Decoration/male_hair8";
  static readonly MALE_SHIRT1 = "Actors/Decoration/male_shirt1";
  static readonly MALE_SHIRT2 = "Actors/Decoration/male_shirt2";
  static readonly MALE_SHIRT3 = "Actors/Decoration/male_shirt3";
  static readonly MALE_SHIRT4 = "Actors/Decoration/male_shirt4";
  static readonly MALE_SHIRT5 = "Actors/Decoration/male_shirt5";
  static readonly MALE_PANTS1 = "Actors/Decoration/male_pants1";
  static readonly MALE_PANTS2 = "Actors/Decoration/male_pants2";
  static readonly MALE_PANTS3 = "Actors/Decoration/male_pants3";
  static readonly MALE_PANTS4 = "Actors/Decoration/male_pants4";
  static readonly MALE_PANTS5 = "Actors/Decoration/male_pants5";
  static readonly MALE_SHOES1 = "Actors/Decoration/male_shoes1";
  static readonly MALE_SHOES2 = "Actors/Decoration/male_shoes2";
  static readonly MALE_SHOES3 = "Actors/Decoration/male_shoes3";
  static readonly MALE_EYES1 = "Actors/Decoration/male_eyes1";
  static readonly MALE_EYES2 = "Actors/Decoration/male_eyes2";
  static readonly MALE_EYES3 = "Actors/Decoration/male_eyes3";
  static readonly MALE_EYES4 = "Actors/Decoration/male_eyes4";
  static readonly MALE_EYES5 = "Actors/Decoration/male_eyes5";
  static readonly MALE_EYES6 = "Actors/Decoration/male_eyes6";

  static readonly FEMALE_SKIN1 = "Actors/Decoration/female_skin1";
  static readonly FEMALE_SKIN2 = "Actors/Decoration/female_skin2";
  static readonly FEMALE_SKIN3 = "Actors/Decoration/female_skin3";
  static readonly FEMALE_SKIN4 = "Actors/Decoration/female_skin4";
  static readonly FEMALE_SKIN5 = "Actors/Decoration/female_skin5";
  static readonly FEMALE_HAIR1 = "Actors/Decoration/female_hair1";
  static readonly FEMALE_HAIR2 = "Actors/Decoration/female_hair2";
  static readonly FEMALE_HAIR3 = "Actors/Decoration/female_hair3";
  static readonly FEMALE_HAIR4 = "Actors/Decoration/female_hair4";
  static readonly FEMALE_HAIR5 = "Actors/Decoration/female_hair5";
  static readonly FEMALE_HAIR6 = "Actors/Decoration/female_hair6";
  static readonly FEMALE_HAIR7 = "Actors/Decoration/female_hair7";
  static readonly FEMALE_SHIRT1 = "Actors/Decoration/female_shirt1";
  static readonly FEMALE_SHIRT2 = "Actors/Decoration/female_shirt2";
  static readonly FEMALE_SHIRT3 = "Actors/Decoration/female_shirt3";
  static readonly FEMALE_SHIRT4 = "Actors/Decoration/female_shirt4";
  static readonly FEMALE_PANTS1 = "Actors/Decoration/female_pants1";
  static readonly FEMALE_PANTS2 = "Actors/Decoration/female_pants2";
  static readonly FEMALE_PANTS3 = "Actors/Decoration/female_pants3";
  static readonly FEMALE_PANTS4 = "Actors/Decoration/female_pants4";
  static readonly FEMALE_PANTS5 = "Actors/Decoration/female_pants5";
  static readonly FEMALE_SHOES1 = "Actors/Decoration/female_shoes1";
  static readonly FEMALE_SHOES2 = "Actors/Decoration/female_shoes2";
  static readonly FEMALE_SHOES3 = "Actors/Decoration/female_shoes3";
  static readonly FEMALE_EYES1 = "Actors/Decoration/female_eyes1";
  static readonly FEMALE_EYES2 = "Actors/Decoration/female_eyes2";
  static readonly FEMALE_EYES3 = "Actors/Decoration/female_eyes3";
  static readonly FEMALE_EYES4 = "Actors/Decoration/female_eyes4";
  static readonly FEMALE_EYES5 = "Actors/Decoration/female_eyes5";
  static readonly FEMALE_EYES6 = "Actors/Decoration/female_eyes6";

  static readonly ARMY_HELMET = "Actors/Decoration/army_helmet";
  static readonly ARMY_PANTS = "Actors/Decoration/army_pants";
  static readonly ARMY_SHIRT = "Actors/Decoration/army_shirt";
  static readonly ARMY_SHOES = "Actors/Decoration/army_shoes";
  static readonly BIKER_HAIR1 = "Actors/Decoration/biker_hair1";
  static readonly BIKER_HAIR2 = "Actors/Decoration/biker_hair2";
  static readonly BIKER_HAIR3 = "Actors/Decoration/biker_hair3";
  static readonly BIKER_PANTS = "Actors/Decoration/biker_pants";
  static readonly BIKER_SHOES = "Actors/Decoration/biker_shoes";
  static readonly GANGSTA_HAT = "Actors/Decoration/gangsta_hat";
  static readonly GANGSTA_PANTS = "Actors/Decoration/gangsta_pants";
  static readonly GANGSTA_SHIRT = "Actors/Decoration/gangsta_shirt";
  static readonly CHARGUARD_HAIR = "Actors/Decoration/charguard_hair";
  static readonly CHARGUARD_PANTS = "Actors/Decoration/charguard_pants";
  static readonly POLICE_HAT = "Actors/Decoration/police_hat";
  static readonly POLICE_UNIFORM = "Actors/Decoration/police_uniform";
  static readonly POLICE_PANTS = "Actors/Decoration/police_pants";
  static readonly POLICE_SHOES = "Actors/Decoration/police_shoes";
  static readonly BLACKOP_SUIT = "Actors/Decoration/blackop_suit";
  static readonly HOSPITAL_DOCTOR_UNIFORM = "Actors/Decoration/hospital_doctor_uniform";
  static readonly HOSPITAL_NURSE_UNIFORM = "Actors/Decoration/hospital_nurse_uniform";
  static readonly HOSPITAL_PATIENT_UNIFORM = "Actors/Decoration/hospital_patient_uniform";
  static readonly SURVIVOR_MALE_BANDANA = "Actors/Decoration/survivor_male_bandana";
  static readonly SURVIVOR_FEMALE_BANDANA = "Actors/Decoration/survivor_female_bandana";
  static readonly DOG_SKIN1 = "Actors/Decoration/dog_skin1";
  static readonly DOG_SKIN2 = "Actors/Decoration/dog_skin2";
  static readonly DOG_SKIN3 = "Actors/Decoration/dog_skin3";
  // Still Alive's two food animals, Release 7-6 (GameImages.cs:971-975). East and
  // west pairs rather than a single sprite, because
  // `UnintelligentAnimalAI.faceSpriteForDirection` swaps the SKIN decoration as
  // the animal turns. There is no north/south pair: a head-on or rear view is the
  // same drawing either way, so the C# keeps the current skin for those headings.
  static readonly RABBIT_SKIN_EAST = "Actors/Decoration/rabbit_skin_east";
  static readonly RABBIT_SKIN_WEST = "Actors/Decoration/rabbit_skin_west";
  static readonly CHICKEN_SKIN_EAST = "Actors/Decoration/chicken_skin_east";
  static readonly CHICKEN_SKIN_WEST = "Actors/Decoration/chicken_skin_west";

  // ── Items ─────────────────────────────────────────────────────────────────
  static readonly ITEM_SLOT = "Items/itemslot";
  static readonly ITEM_EQUIPPED = "Items/itemequipped";
  static readonly ITEM_AMMO_LIGHT_PISTOL = "Items/item_ammo_light_pistol";
  static readonly ITEM_AMMO_HEAVY_PISTOL = "Items/item_ammo_heavy_pistol";
  static readonly ITEM_AMMO_LIGHT_RIFLE = "Items/item_ammo_light_rifle";
  static readonly ITEM_AMMO_HEAVY_RIFLE = "Items/item_ammo_heavy_rifle";
  static readonly ITEM_AMMO_SHOTGUN = "Items/item_ammo_shotgun";
  static readonly ITEM_AMMO_BOLTS = "Items/item_ammo_bolts";
  static readonly ITEM_ARMY_BODYARMOR = "Items/item_army_bodyarmor";
  static readonly ITEM_ARMY_PISTOL = "Items/item_army_pistol";
  static readonly ITEM_ARMY_RATION = "Items/item_army_ration";
  static readonly ITEM_ARMY_RIFLE = "Items/item_army_rifle";
  static readonly ITEM_BANDAGES = "Items/item_bandages";
  static readonly ITEM_BARBED_WIRE = "Items/item_barbed_wire";
  static readonly ITEM_BEAR_TRAP = "Items/item_bear_trap";
  static readonly ITEM_BASEBALL_BAT = "Items/item_baseballbat";
  static readonly ITEM_BIGBEAR_BAT = "Items/item_bigbear_bat";
  static readonly ITEM_BIG_FLASHLIGHT = "Items/item_big_flashlight";
  static readonly ITEM_BIG_FLASHLIGHT_OUT = "Items/item_big_flashlight_out";
  static readonly ITEM_BOOK = "Items/item_book";
  static readonly ITEM_BLACKOPS_GPS = "Items/item_blackops_gps";
  static readonly ITEM_CANNED_FOOD = "Items/item_canned_food";
  static readonly ITEM_CELL_PHONE = "Items/item_cellphone";
  static readonly ITEM_CHAR_LIGHT_BODYARMOR = "Items/item_CHAR_light_bodyarmor";
  static readonly ITEM_CROWBAR = "Items/item_crowbar";
  static readonly ITEM_COMBAT_KNIFE = "Items/item_combat_knife";
  static readonly ITEM_EMPTY_CAN = "Items/item_empty_can";
  static readonly ITEM_FAMU_FATARU_KATANA = "Items/item_famu_fataru_katana";
  static readonly ITEM_FLASHLIGHT = "Items/item_flashlight";
  static readonly ITEM_FLASHLIGHT_OUT = "Items/item_flashlight_out";
  static readonly ITEM_FREE_ANGELS_JACKET = "Items/item_free_angels_jacket";
  static readonly ITEM_GRENADE = "Items/item_grenade";
  static readonly ITEM_GRENADE_PRIMED = "Items/item_grenade_primed";
  static readonly ITEM_JASON_MYERS_AXE = "Items/item_jason_myers_axe";
  static readonly ITEM_GOLF_CLUB = "Items/item_golfclub";
  static readonly ITEM_GROCERIES = "Items/item_groceries";
  static readonly ITEM_HANS_VON_HANZ_PISTOL = "Items/item_hans_von_hanz_pistol";
  static readonly ITEM_HELLS_SOULS_JACKET = "Items/item_hells_souls_jacket";
  static readonly ITEM_HUGE_HAMMER = "Items/item_huge_hammer";
  static readonly ITEM_HUNTER_VEST = "Items/item_hunter_vest";
  static readonly ITEM_HUNTING_CROSSBOW = "Items/item_hunting_crossbow";
  static readonly ITEM_HUNTING_RIFLE = "Items/item_hunting_rifle";
  static readonly ITEM_IMPROVISED_CLUB = "Items/item_improvised_club";
  static readonly ITEM_IMPROVISED_SPEAR = "Items/item_improvised_spear";
  static readonly ITEM_IRON_GOLF_CLUB = "Items/item_iron_golfclub";
  static readonly ITEM_KOLT_REVOLVER = "Items/item_kolt_revolver";
  static readonly ITEM_MAGAZINE = "Items/item_magazine";
  static readonly ITEM_MEDIKIT = "Items/item_medikit";
  static readonly ITEM_PISTOL = "Items/item_pistol";
  static readonly ITEM_PILLS_ANTIVIRAL = "Items/item_pills_antiviral";
  static readonly ITEM_PILLS_BLUE = "Items/item_pills_blue";
  static readonly ITEM_PILLS_GREEN = "Items/item_pills_green";
  static readonly ITEM_PILLS_SAN = "Items/item_pills_san";
  static readonly ITEM_POLICE_JACKET = "Items/item_police_jacket";
  static readonly ITEM_POLICE_RADIO = "Items/item_police_radio";
  static readonly ITEM_POLICE_RIOT_ARMOR = "Items/item_police_riot_armor";
  static readonly ITEM_PRECISION_RIFLE = "Items/item_precision_rifle";
  static readonly ITEM_ROGUEDJACK_KEYBOARD = "Items/item_roguedjack_keyboard";
  static readonly ITEM_SANTAMAN_SHOTGUN = "Items/item_santaman_shotgun";
  static readonly ITEM_SHOTGUN = "Items/item_shotgun";
  static readonly ITEM_SHOVEL = "Items/item_shovel";
  static readonly ITEM_SMALL_HAMMER = "Items/item_small_hammer";
  static readonly ITEM_SPIKES = "Items/item_spikes";
  static readonly ITEM_SHORT_SHOVEL = "Items/item_short_shovel";
  static readonly ITEM_SPRAYPAINT = "Items/item_spraypaint";
  static readonly ITEM_SPRAYPAINT2 = "Items/item_spraypaint2";
  static readonly ITEM_SPRAYPAINT3 = "Items/item_spraypaint3";
  static readonly ITEM_SPRAYPAINT4 = "Items/item_spraypaint4";
  static readonly ITEM_STENCH_KILLER = "Items/item_stench_killer";
  static readonly ITEM_SUBWAY_BADGE = "Items/item_subway_badge";

  // ── Still Alive food and entertainment (scripts/port-item-models.py). Paths
  // verbatim from the fork's GameImages.cs, hence item_book_CHAR.
  static readonly ITEM_BOOK_BLUE = "Items/item_book_blue";
  static readonly ITEM_BOOK_CHAR = "Items/item_book_CHAR";
  static readonly ITEM_BOOK_GREEN = "Items/item_book_green";
  static readonly ITEM_BOOK_RED = "Items/item_book_red";
  static readonly ITEM_CHICKEN_EGG = "Items/item_chicken_egg";
  static readonly ITEM_COOKED_CHICKEN = "Items/item_cooked_chicken";
  static readonly ITEM_COOKED_DOG_MEAT = "Items/item_cooked_dog_meat";
  static readonly ITEM_COOKED_FISH = "Items/item_cooked_fish";
  static readonly ITEM_COOKED_HUMAN_FLESH = "Items/item_cooked_human_flesh";
  static readonly ITEM_COOKED_RABBIT = "Items/item_cooked_rabbit";
  static readonly ITEM_GRAPES = "Items/item_grapes";
  static readonly ITEM_MAGAZINE1 = "Items/item_magazine1";
  static readonly ITEM_MAGAZINE2 = "Items/item_magazine2";
  static readonly ITEM_MAGAZINE3 = "Items/item_magazine3";
  static readonly ITEM_MAGAZINE4 = "Items/item_magazine4";
  static readonly ITEM_PEANUTS = "Items/item_peanuts";
  static readonly ITEM_RAW_CHICKEN = "Items/item_raw_chicken";
  static readonly ITEM_RAW_DOG_MEAT = "Items/item_raw_dog_meat";
  static readonly ITEM_RAW_FISH = "Items/item_raw_fish";
  static readonly ITEM_RAW_HUMAN_FLESH = "Items/item_raw_human_flesh";
  static readonly ITEM_RAW_RABBIT = "Items/item_raw_rabbit";
  static readonly ITEM_SNACK_BAR = "Items/item_snack_bar";
  static readonly ITEM_VEGETABLES = "Items/item_vegetables";
  static readonly ITEM_WILD_BERRIES = "Items/item_wild_berries";

  // ── Still Alive weapons, armour and lights (scripts/port-item-models.py).
  static readonly ITEM_ARMY_PRECISION_RIFLE = "Items/item_army_precision_rifle";
  static readonly ITEM_ARMY_RIFLE1 = "Items/item_army_rifle1";
  static readonly ITEM_ARMY_RIFLE2 = "Items/item_army_rifle2";
  static readonly ITEM_ARMY_RIFLE3 = "Items/item_army_rifle3";
  static readonly ITEM_ARMY_RIFLE4 = "Items/item_army_rifle4";
  static readonly ITEM_BARBED_WIRE_BAT = "Items/item_barbed_wire_bat";
  static readonly ITEM_BINOCULARS = "Items/item_binoculars";
  static readonly ITEM_BIOHAZARD_SUIT = "Items/item_biohazard_suit";
  // The fork's GameImages.cs spells this "Items\\item_bio_force_gun", but the
  // file it ships is `item_Bio_Force_Gun.png`. That works on Windows, whose
  // filesystem is case-insensitive, and 404s here. The only such mismatch of
  // 1051 constants in the fork -- checked, not assumed.
  static readonly ITEM_BIO_FORCE_GUN = "Items/item_Bio_Force_Gun";
  static readonly ITEM_BONESAW = "Items/item_bonesaw";
  static readonly ITEM_BRASS_KNUCKLES = "Items/item_brass_knuckles";
  static readonly ITEM_CHAINSAW = "Items/item_chainsaw";
  static readonly ITEM_CLEAVER = "Items/item_cleaver";
  static readonly ITEM_DOUBLE_BARREL = "Items/item_double_barrel";
  static readonly ITEM_FIRE_AXE = "Items/item_fire_axe";
  static readonly ITEM_FIRE_HAZARD_SUIT = "Items/item_fire_hazard_suit";
  static readonly ITEM_FLAIL = "Items/item_flail";
  static readonly ITEM_FLAMETHROWER = "Items/item_flamethrower";
  static readonly ITEM_FRYING_PAN = "Items/item_frying_pan";
  static readonly ITEM_GRENADE_LAUNCHER = "Items/item_grenade_launcher";

  // ── Still Alive medicine, paint and explosives (scripts/port-item-models.py).
  static readonly ITEM_AMMO_FUEL = "Items/item_ammo_fuel";
  static readonly ITEM_SIPHON_KIT = "Items/item_siphon_kit";
  // Still Alive, Release 7-6. The sprite shipped with the classic pack, so this
  // is only the id: the fork's `GameImages.cs:1062` has the same path.
  static readonly ITEM_FISHING_ROD = "Items/item_fishing_rod";
  // Still Alive, Release 7-1. One of the ~420 constants the sprite commit
  // deferred; added here because `DarknessFov` 2b reads it.
  static readonly DECO_LIT_CANDLE = "Tiles/Decoration/lit_candle";
  static readonly ITEM_BEER_BOTTLE_BROWN = "Items/item_beer_bottle_brown";
  static readonly ITEM_BEER_BOTTLE_GREEN = "Items/item_beer_bottle_green";
  static readonly ITEM_BEER_CAN_BLUE = "Items/item_beer_can_blue";
  static readonly ITEM_BEER_CAN_RED = "Items/item_beer_can_red";
  static readonly ITEM_C4 = "Items/item_c4";
  static readonly ITEM_CIGARETTES = "Items/item_cigarettes";
  static readonly ITEM_DYNAMITE = "Items/item_dynamite";
  static readonly ITEM_ENERGY_DRINK = "Items/item_energy_drink";
  static readonly ITEM_FIRE_EXTINGUISHER = "Items/item_fire_extinguisher";
  static readonly ITEM_FLASHBANG = "Items/item_flashbang";
  static readonly ITEM_HOLY_HAND_GRENADE = "Items/item_Holy_Hand_Grenade";
  static readonly ITEM_LARGE_MEDIKIT = "Items/item_large_medikit";
  static readonly ITEM_MOLOTOV = "Items/item_molotov";
  static readonly ITEM_PAINT_THINNER = "Items/item_paint_thinner";
  static readonly ITEM_PLASMA_BURST_PRIMED = "Items/item_plasma_burst_primed";
  static readonly ITEM_SMALL_MEDIKIT = "Items/item_small_medikit";
  static readonly ITEM_SMOKE_GRENADE = "Items/item_smoke_grenade";
  static readonly OBJ_FUEL_PUMP = "MapObjects/fuel_pump";
  static readonly ITEM_HOCKEY_STICK = "Items/item_hockey_stick";
  static readonly ITEM_KATANA = "Items/item_katana";
  static readonly ITEM_KEYBOARD = "Items/item_keyboard";
  static readonly ITEM_KITCHEN_KNIFE = "Items/item_kitchen_knife";
  static readonly ITEM_LIT_FLARE = "Items/item_lit_flare";
  static readonly ITEM_LIT_GLOWSTICK = "Items/item_lit_glowstick";
  static readonly ITEM_MACE = "Items/item_mace";
  static readonly ITEM_MACHETE = "Items/item_machete";
  static readonly ITEM_MINIGUN = "Items/item_minigun";
  static readonly ITEM_NAIL_GUN = "Items/item_nail_gun";
  static readonly ITEM_NIGHT_VISION = "Items/item_night_vision";
  static readonly ITEM_NUNCHAKU = "Items/item_nunchaku";
  static readonly ITEM_PICKAXE = "Items/item_pickaxe";
  static readonly ITEM_PIPE_WRENCH = "Items/item_pipe_wrench";
  static readonly ITEM_PITCH_FORK = "Items/item_pitch_fork";
  static readonly ITEM_REVOLVER = "Items/item_revolver";
  static readonly ITEM_SCIMITAR = "Items/item_scimitar";
  static readonly ITEM_SCYTHE = "Items/item_scythe";
  static readonly ITEM_SICKLE = "Items/item_sickle";
  static readonly ITEM_SMG = "Items/item_SMG";
  static readonly ITEM_SPEAR = "Items/item_spear";
  static readonly ITEM_SPIKED_MACE = "Items/item_spiked_mace";
  static readonly ITEM_STANDARD_AXE = "Items/item_standard_axe";
  static readonly ITEM_STUN_GUN = "Items/item_stun_gun";
  static readonly ITEM_TACTICAL_SHOTGUN = "Items/item_tactical_shotgun";
  static readonly ITEM_TENNIS_RACKET = "Items/item_tennis_racket";
  static readonly ITEM_VINTAGE_PISTOL = "Items/item_vintage_pistol";
  static readonly ITEM_TRUNCHEON = "Items/item_truncheon";
  static readonly ITEM_WOODEN_PLANK = "Items/item_wooden_plank";
  static readonly ITEM_ZTRACKER = "Items/item_ztracker";

  // ── Still Alive primed explosives, one sprite each.
  static readonly ITEM_MOLOTOV_PRIMED = "Items/item_molotov_primed";
  static readonly ITEM_DYNAMITE_PRIMED = "Items/item_dynamite_primed";
  static readonly ITEM_C4_PRIMED = "Items/item_c4_primed";
  static readonly ITEM_SMOKE_GRENADE_PRIMED = "Items/item_smoke_grenade_primed";
  static readonly ITEM_FLASHBANG_PRIMED = "Items/item_flashbang_primed";
  static readonly ITEM_HOLY_HAND_GRENADE_PRIMED = "Items/item_Holy_Hand_Grenade_primed";

  // ── Feature.Church: the church building generator.
  //
  // The eight ids `MakeChurchBuilding` (`BaseTownGenerator.cs:2187`) draws, and
  // the one item sprite its antique-weapon roll needs. All nine are Release 7-6
  // additions the sprite commit left as bare constants, and all nine ship in the
  // *classic* pack, so every path here already resolves to a file on disk --
  // `tests/sprite-assets.test.ts` is what keeps that true.
  //
  // Kept in one block rather than filed next to the `DECO_`/`OBJ_` rows they
  // resemble, so a reader can see the whole of one building's art at once.
  static readonly DECO_CHURCH_HANGING1 = "Tiles/Decoration/hanging_purple";
  static readonly DECO_CHURCH_HANGING2 = "Tiles/Decoration/hanging_red";
  static readonly DECO_CHURCH_HANGING3 = "Tiles/Decoration/hanging_green";
  static readonly DECO_CHURCH_HANGING4 = "Tiles/Decoration/hanging_blue";
  static readonly DECO_CHURCH = "Tiles/Decoration/church_sign";
  static readonly OBJ_CHURCH_PEW = "MapObjects/church_pew";
  static readonly OBJ_LECTERN = "MapObjects/lectern";
  static readonly OBJ_DISPLAY_CASE = "MapObjects/display_case";
  static readonly ITEM_UNIQUE_BOOK = "Items/item_unique_book";

  // ── Feature.Bar: the bar building generator (`BaseTownGenerator.cs:2387`).
  //
  // The five ids `makeBarBuilding` draws. `DECO_BAR` and `DECO_VELVET_ROPE` are
  // Release 4 additions, the three map objects are vanilla furniture the port
  // had no reader for until this building, and all five ship in the *classic*
  // pack, so every path here already resolves to a file on disk --
  // `tests/sprite-assets.test.ts` is what keeps that true.
  //
  // Note the spelling: the C# calls the doorway art `DECO_BAR` and points it at
  // `shop_bar` (`GameImages.cs:327`); it is the bar sign, named after the shop
  // series it was drawn for.
  static readonly DECO_BAR = "Tiles/Decoration/shop_bar";
  static readonly DECO_VELVET_ROPE = "Tiles/Decoration/velvet_rope";
  static readonly OBJ_BAR_SHELVES = "MapObjects/bar_shelves";
  static readonly OBJ_KITCHEN_SINK = "MapObjects/kitchen_sink";
  static readonly OBJ_KITCHEN_COUNTER = "MapObjects/kitchen_counter";

  // ── Feature.Clinic: the clinic building generator (`BaseTownGenerator.cs:3358`).
  //
  // The six ids `makeClinicBuilding` draws. `DECO_CLINIC_SIGN` and the five
  // `clinic_*` objects are Release 4 additions the port had no reader for until
  // this building, and all six ship in the *classic* pack, so every path here
  // already resolves to a file on disk -- `tests/sprite-assets.test.ts` is what
  // keeps that true.
  //
  // `OBJ_POWERGEN_OFF` / `_ON` are *not* here: the port already had both for the
  // sewers and the CHAR offices, so they sit in the `OBJ_` rows above
  // (`GameImages.ts:301-302`) and are only listed in the clinic's own factory
  // table. `OBJ_CLINIC_DESK` is shared with the shopping mall, which the C# draws
  // from `MakeObjCheckout` (`BaseTownGenerator.cs:9978`) and not from the
  // reception desk -- one sprite, two names, as `MakeObjCounter` /
  // `MakeObjKitchenCounter` are.
  static readonly DECO_CLINIC_SIGN = "Tiles/Decoration/clinic_sign";
  static readonly OBJ_CLINIC_BED = "MapObjects/clinic_bed";
  static readonly OBJ_CLINIC_CUPBOARD = "MapObjects/clinic_cupboard";
  static readonly OBJ_CLINIC_CURTAIN = "MapObjects/clinic_curtain";
  static readonly OBJ_CLINIC_DESK = "MapObjects/clinic_desk";
  static readonly OBJ_CLINIC_MACHINERY = "MapObjects/clinic_machinery";

  // ── Feature.Library: the library building generator
  // (`BaseTownGenerator.cs:1908`).
  //
  // The three ids `makeLibraryBuilding` draws. `DECO_LIBRARY` is a Release 4
  // addition and the two map objects are vanilla furniture the port had no
  // reader for until this building; all three ship in the *classic* pack, so
  // every path here already resolves to a file on disk --
  // `tests/sprite-assets.test.ts` is what keeps that true.
  //
  // Note the spelling: the C# calls the doorway art `DECO_LIBRARY` and points it
  // at `shop_library` (`GameImages.cs:322`), like `DECO_BAR` above. The books
  // the shelves drop are `ITEM_BOOK_BLUE` / `_GREEN` / `_RED` at `:526-529`,
  // already present for the item models' sake.
  static readonly DECO_LIBRARY = "Tiles/Decoration/shop_library";
  static readonly OBJ_BOOK_SHELVES = "MapObjects/bookshelves";
  static readonly OBJ_CASH_REGISTER = "MapObjects/cash_register";

  // ── Feature.Junkyard: the junkyard building generator
  // (`BaseTownGenerator.cs:3537`).
  //
  // The eight ids `makeJunkyard` draws. `OBJ_BARRELS` and `OBJ_JUNK` are *not*
  // here: the port already had both for the sewers and the park, so they sit in
  // the `OBJ_` rows above (`GameImages.ts:299-300`) and are only listed in the
  // junkyard's own factory table. The other six are Release 4 additions the port
  // had no reader for until this building, and all six ship in the *classic*
  // pack, so every path here already resolves to a file on disk --
  // `tests/sprite-assets.test.ts` is what keeps that true.
  //
  // `DECO_JUNKYARD` is kept even though nothing ever draws it: the C#'s
  // `DecorateOutsideWalls` at `:3628` skips walkable tiles, and `:3557` has
  // already made the whole perimeter walkable dirt, so the sign is unreachable
  // in the reference. See the note in `makeJunkyard.ts`.
  static readonly DECO_JUNKYARD = "Tiles/Decoration/junkyard";
  static readonly OBJ_CHAINWIRE_FENCE = "MapObjects/chainwire_fence";
  static readonly OBJ_EMPTY_BARREL = "MapObjects/empty_barrel";
  // The roller door is `MakeObjRollerDoor` (`BaseMapGenerator.cs:421`), a
  // three-state metal door of its own, not a recoloured `MakeObjIronDoor`.
  static readonly OBJ_ROLLER_DOOR_CLOSED = "MapObjects/roller_door_closed";
  static readonly OBJ_ROLLER_DOOR_OPEN = "MapObjects/roller_door_open";
  static readonly OBJ_ROLLER_DOOR_BROKEN = "MapObjects/roller_door_broken";
  // C# `BaseMapGenerator.cs:552`, the `CARS` row `MakeObjWreckedCar` picks from:
  // four coloured cars plus the police car the fork added in Release 7-6. The
  // port's own protected `makeObjWreckedCar` uses the *vanilla* `car1..car4`
  // instead, which is why these five had no ids until now.
  static readonly OBJ_CAR_BLUE_PHASE0 = "MapObjects/car_blue_phase0";
  static readonly OBJ_CAR_GREEN_PHASE0 = "MapObjects/car_green_phase0";
  static readonly OBJ_CAR_RED_PHASE0 = "MapObjects/car_red_phase0";
  static readonly OBJ_CAR_WHITE_PHASE0 = "MapObjects/car_white_phase0";
  static readonly OBJ_POLICE_CAR_PHASE0 = "MapObjects/police_car_phase0";

  // ── Feature.FireStation: the fire station building generator
  // (`BaseTownGenerator.cs:3181`).
  //
  // The six ids `makeFireStationBuilding` draws that the port had no reader for.
  // `OBJ_EMPTY_BARREL` and the three `OBJ_ROLLER_DOOR_*` are *not* here: the
  // junkyard above already added both for the same C# factories
  // (`BaseMapGenerator.cs:758` and `:421`), so they are only listed in the fire
  // station's own factory table. `OBJ_POWERGEN_OFF` / `_ON` were in the `OBJ_`
  // rows from the sewers onwards. That leaves the sign and the truck.
  //
  // The truck is four sprites because the C# cuts one 32x64 (east-west) or 64x32
  // (north-south) image in half and lays the pieces down back-to-front
  // (`BaseMapGenerator.cs:1133`), which is also why there are four rather than
  // one. Only `DECO_FIRE_STATION` carries a `//@@MP` marker in the reference
  // (`GameImages.cs:317`, Release 7-3); the four trucks and the workbench are
  // vanilla art the port had no reader for until this building, added in the same
  // fork release without the marker. All six ship in the *classic* pack, so every
  // path here resolves to a file on disk -- `tests/sprite-assets.test.ts` is what
  // keeps that true.
  static readonly DECO_FIRE_STATION = "Tiles/Decoration/fire_station";
  static readonly OBJ_WORKBENCH = "MapObjects/workbench";
  static readonly OBJ_FIRE_TRUCK_EW_BACK = "MapObjects/fire_truck_EW_back";
  static readonly OBJ_FIRE_TRUCK_EW_FRONT = "MapObjects/fire_truck_EW_front";
  static readonly OBJ_FIRE_TRUCK_NS_BACK = "MapObjects/fire_truck_NS_back";
  static readonly OBJ_FIRE_TRUCK_NS_FRONT = "MapObjects/fire_truck_NS_front";

  // ── Effects & Misc ────────────────────────────────────────────────────────
  static readonly EFFECT_BARRICADED = "Effects/barricaded";
  static readonly EFFECT_ONFIRE = "Effects/onFire";
  static readonly UNDEF = "undef";
  static readonly MAP_EXIT = "map_exit";
  static readonly MINI_PLAYER_POSITION = "mini_player_position";
  static readonly MINI_PLAYER_TAG1 = "mini_player_tag";
  static readonly MINI_PLAYER_TAG2 = "mini_player_tag2";
  static readonly MINI_PLAYER_TAG3 = "mini_player_tag3";
  static readonly MINI_PLAYER_TAG4 = "mini_player_tag4";
  static readonly MINI_FOLLOWER_POSITION = "mini_follower_position";
  static readonly MINI_UNDEAD_POSITION = "mini_undead_position";
  static readonly MINI_BLACKOPS_POSITION = "mini_blackops_position";
  static readonly MINI_POLICE_POSITION = "mini_police_position";
  static readonly TRACK_FOLLOWER_POSITION = "track_follower_position";
  static readonly TRACK_UNDEAD_POSITION = "track_undead_position";
  static readonly TRACK_BLACKOPS_POSITION = "track_blackops_position";
  static readonly TRACK_POLICE_POSITION = "track_police_position";
  static readonly WEATHER_RAIN1 = "weather_rain1";
  static readonly WEATHER_RAIN2 = "weather_rain2";
  static readonly WEATHER_HEAVY_RAIN1 = "weather_heavy_rain1";
  static readonly WEATHER_HEAVY_RAIN2 = "weather_heavy_rain2";
  static readonly CORPSE_DRAGGED = "corpse_dragged";
  static readonly ROT1_1 = "rot1_1";
  static readonly ROT1_2 = "rot1_2";
  static readonly ROT2_1 = "rot2_1";
  static readonly ROT2_2 = "rot2_2";
  static readonly ROT3_1 = "rot3_1";
  static readonly ROT3_2 = "rot3_2";
  static readonly ROT4_1 = "rot4_1";
  static readonly ROT4_2 = "rot4_2";
  static readonly ROT5_1 = "rot5_1";
  static readonly ROT5_2 = "rot5_2";
}

/**
 * Every sprite id this class declares, de-duplicated.
 *
 * The set of ids is the preload manifest: `RogueGame.Run` fetches these before
 * the first frame so that no draw call has to wait on the network. The ids are
 * `static readonly` class fields, so they live on the constructor and have to be
 * read reflectively — there is no way to enumerate them at the type level.
 */
export function allImageIds(): string[] {
  const own = Object.getOwnPropertyNames(GameImages);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const name of own) {
    if (name === "length" || name === "name" || name === "prototype") continue;
    const value = (GameImages as unknown as Record<string, unknown>)[name];
    if (typeof value !== "string" || value.length === 0) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    ids.push(value);
  }
  return ids;
}
