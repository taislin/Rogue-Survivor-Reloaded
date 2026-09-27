import { ItemModel } from "@data/ItemModel";
import { ItemModelDB, Models } from "@data/Models";
import { Attack, AttackKind } from "@data/Attack";
import { BlastAttack } from "@data/BlastAttack";
import { Verb } from "@data/Verb";
import { DollPart } from "@data/Doll";
import { GameImages } from "./GameImages";

import { ItemMedicineModel } from "@engine/items/ItemMedicine";
import { ItemFoodModel } from "@engine/items/ItemFood";
import {
  ItemMeleeWeaponModel,
  ItemRangedWeaponModel,
  ItemAmmoModel,
  AmmoType,
} from "@engine/items/ItemWeapon";
import { ItemGrenadeModel, ItemGrenadePrimedModel } from "@engine/items/ItemExplosive";
import {
  ItemBarricadeMaterialModel,
  ItemEntertainmentModel,
  ItemSprayPaintModel,
  ItemSprayScentModel,
} from "@engine/items/ItemMisc";
import { ItemBodyArmorModel } from "@engine/items/ItemBodyArmor";
import { ItemTrackerModel, TrackingFlags } from "@engine/items/ItemTracker";
import { ItemLightModel } from "@engine/items/ItemLight";
import { ItemTrapModel } from "@engine/items/ItemTrap";
import { Odor } from "@data/Odor";
import { WorldTime } from "@engine/WorldTime";
// `Rules` imports `ItemID` from this file, so this edge closes a cycle. It is
// safe because neither side touches the other at module scope: `Rules` only
// reads `ItemID` inside a method, and the only thing read from `Rules` here is
// `FOOD_BASE_POINTS`, inside the GameItems constructor. Preferred over
// hardcoding the 1440, which is the class of bug this file just had.
import { Rules } from "@engine/Rules";

import armorsData from "./data/Items_Armors.json";
import barricadingData from "./data/Items_Barricading.json";
import entData from "./data/Items_Entertainment.json";
import explosivesData from "./data/Items_Explosives.json";
import foodData from "./data/Items_Food.json";
import lightsData from "./data/Items_Lights.json";
import medicineData from "./data/Items_Medicine.json";
import meleeData from "./data/Items_MeleeWeapons.json";
import rangedData from "./data/Items_RangedWeapons.json";
import spraypaintsData from "./data/Items_Spraypaints.json";
import scentspraysData from "./data/Items_Scentsprays.json";
import trackersData from "./data/Items_Trackers.json";
import trapsData from "./data/Items_Traps.json";

export enum ItemID {
  MEDICINE_BANDAGES = 0,
  MEDICINE_MEDIKIT = 1,
  MEDICINE_PILLS_STA = 2,
  MEDICINE_PILLS_SLP = 3,
  MEDICINE_PILLS_SAN = 4,
  MEDICINE_PILLS_ANTIVIRAL = 5,

  FOOD_ARMY_RATION = 6,
  FOOD_GROCERIES = 7,
  FOOD_CANNED_FOOD = 8,

  MELEE_BASEBALLBAT = 9,
  MELEE_COMBAT_KNIFE = 10,
  MELEE_CROWBAR = 11,
  UNIQUE_JASON_MYERS_AXE = 12,
  MELEE_HUGE_HAMMER = 13,
  MELEE_SMALL_HAMMER = 14,
  MELEE_GOLFCLUB = 15,
  MELEE_IRON_GOLFCLUB = 16,
  MELEE_SHOVEL = 17,
  MELEE_SHORT_SHOVEL = 18,
  MELEE_TRUNCHEON = 19,
  MELEE_IMPROVISED_CLUB = 20,
  MELEE_IMPROVISED_SPEAR = 21,

  RANGED_ARMY_PISTOL = 22,
  RANGED_ARMY_RIFLE = 23,
  RANGED_HUNTING_CROSSBOW = 24,
  RANGED_HUNTING_RIFLE = 25,
  RANGED_PISTOL = 26,
  RANGED_KOLT_REVOLVER = 27,
  RANGED_PRECISION_RIFLE = 28,
  RANGED_SHOTGUN = 29,

  EXPLOSIVE_GRENADE = 30,
  EXPLOSIVE_GRENADE_PRIMED = 31,

  BAR_WOODEN_PLANK = 32,

  ARMOR_ARMY_BODYARMOR = 33,
  ARMOR_CHAR_LIGHT_BODYARMOR = 34,
  ARMOR_HELLS_SOULS_JACKET = 35,
  ARMOR_FREE_ANGELS_JACKET = 36,
  ARMOR_POLICE_JACKET = 37,
  ARMOR_POLICE_RIOT = 38,
  ARMOR_HUNTER_VEST = 39,

  TRACKER_BLACKOPS = 40,
  TRACKER_CELL_PHONE = 41,
  TRACKER_ZTRACKER = 42,
  TRACKER_POLICE_RADIO = 43,

  SPRAY_PAINT1 = 44,
  SPRAY_PAINT2 = 45,
  SPRAY_PAINT3 = 46,
  SPRAY_PAINT4 = 47,

  SCENT_SPRAY_STENCH_KILLER = 48,

  LIGHT_FLASHLIGHT = 49,
  LIGHT_BIG_FLASHLIGHT = 50,

  AMMO_LIGHT_PISTOL = 51,
  AMMO_HEAVY_PISTOL = 52,
  AMMO_LIGHT_RIFLE = 53,
  AMMO_HEAVY_RIFLE = 54,
  AMMO_SHOTGUN = 55,
  AMMO_BOLTS = 56,

  TRAP_EMPTY_CAN = 57,
  TRAP_BEAR_TRAP = 58,
  TRAP_SPIKES = 59,
  TRAP_BARBED_WIRE = 60,

  ENT_BOOK = 61,
  ENT_MAGAZINE = 62,

  UNIQUE_SUBWAY_BADGE = 63,
  UNIQUE_FAMU_FATARU_KATANA = 64,
  UNIQUE_BIGBEAR_BAT = 65,
  UNIQUE_ROGUEDJACK_KEYBOARD = 66,
  UNIQUE_SANTAMAN_SHOTGUN = 67,
  UNIQUE_HANS_VON_HANZ_PISTOL = 68,

  _COUNT = 69,
}

export class GameItems implements ItemModelDB {
  private readonly models: ItemModel[] = new Array(ItemID._COUNT);

  constructor() {
    Models.items = this;

    // Medicine
    const medImages = [
      GameImages.ITEM_BANDAGES,
      GameImages.ITEM_MEDIKIT,
      GameImages.ITEM_PILLS_GREEN,
      GameImages.ITEM_PILLS_BLUE,
      GameImages.ITEM_PILLS_SAN,
      GameImages.ITEM_PILLS_ANTIVIRAL,
    ];
    // CSV column order matches the ItemID enum here (unlike Items_Food.csv),
    // so indexing is safe.
    const medPlural = [
      // C# sets IsPlural on everything except the medikit (GameItems.cs:703,
      // 718, 727, 735, 743).
      true, false, true, true, true, true,
    ];
    for (let i = 0; i < medicineData.length; i++) {
      const d: any = medicineData[i];
      const model = new ItemMedicineModel(
        d.NAME,
        d.PLURAL,
        medImages[i],
        d.HP,
        d.STA,
        d.SLP,
        d.INF,
        d.SAN
      );
      model.isPlural = medPlural[i];
      model.stackingLimit = d.STACKING;
      model.flavorDescription = d.FLAVOR ?? "";
      this.setModel(ItemID.MEDICINE_BANDAGES + i, model);
    }

    // Food
    //
    // Keyed by ID, like every other item table below, because the CSV row
    // order is not the ItemID order: Items_Food.csv lists ARMY_RATION,
    // CANNED_FOOD, GROCERIES while the enum is ARMY_RATION, GROCERIES,
    // CANNED_FOOD. A positional loop therefore handed each row the wrong
    // ItemID, and each id the wrong image. It was invisible while
    // nutrition/bestBefore were undefined, but it put bestBeforeDays = -1
    // (the "never expires" sentinel) on the groceries model, so
    // `makeItemGroceries` computed max = TURNS_PER_DAY * -1 and built a
    // freshUntil of -360, which `new WorldTime` rejects.
    const foodMap: Record<string, { id: ItemID; img: string }> = {
      FOOD_ARMY_RATION: { id: ItemID.FOOD_ARMY_RATION, img: GameImages.ITEM_ARMY_RATION },
      FOOD_GROCERIES: { id: ItemID.FOOD_GROCERIES, img: GameImages.ITEM_GROCERIES },
      FOOD_CANNED_FOOD: { id: ItemID.FOOD_CANNED_FOOD, img: GameImages.ITEM_CANNED_FOOD },
    };
    for (const d of foodData as any[]) {
      const meta = foodMap[d.ID];
      if (!meta) continue;
      const model = new ItemFoodModel(
        d.NAME,
        d.PLURAL,
        meta.img,
        // The CSV stores nutrition as a ratio, but `ItemFoodModel.nutrition`
        // is in food points, so the ratio has to be scaled. The C# does this
        // at load time (GameItems.cs:192, `NUTRITION = (int)(Rules.FOOD_BASE_
        // POINTS * line[3].ParseFloat())`); without it a 0.25 army ration
        // restores a quarter of one point against a 1440-point meter.
        Math.trunc(Rules.FOOD_BASE_POINTS * d.NUTRITION),
        d.BESTBEFORE
      );
      model.stackingLimit = d.STACKINGLIMIT;
      // "canned food"/"canned food" and "groceries"/"groceries" are the same
      // word, so C# `CheckPlural` marks them plural; "army ration" is not.
      model.isPlural = GameItems.checkPlural(d.NAME, d.PLURAL);
      model.flavorDescription = d.FLAVOR ?? "";
      this.setModel(meta.id, model);
    }

    // Melee weapons
    //
    // The verb is per weapon and is NOT in the CSV: the C# spells it out at
    // each construction site (GameItems.cs:778-985, e.g. `new Verb("smash",
    // "smashes")` for the baseball bat, `new Verb("stab", "stabs")` for the
    // combat knife). `Verb`'s second argument defaults to youForm + "s"
    // (Verb.cs:19), so it is only listed where the C# passes one. Reading
    // `d.VERB` from the data gave every weapon an undefined verb, so the UI
    // said things like "undefined the zombie".
    //
    // Image, id and verb in one table: the file previously carried two
    // identical 16-entry maps, which is two places to forget to update.
    const meleeMap: Record<string, { id: ItemID; img: string; verb: [string, string?] }> = {
      MELEE_BASEBALLBAT: { id: ItemID.MELEE_BASEBALLBAT, img: GameImages.ITEM_BASEBALL_BAT, verb: ["smash", "smashes"] },
      MELEE_COMBAT_KNIFE: { id: ItemID.MELEE_COMBAT_KNIFE, img: GameImages.ITEM_COMBAT_KNIFE, verb: ["stab", "stabs"] },
      MELEE_CROWBAR: { id: ItemID.MELEE_CROWBAR, img: GameImages.ITEM_CROWBAR, verb: ["strike"] },
      UNIQUE_JASON_MYERS_AXE: { id: ItemID.UNIQUE_JASON_MYERS_AXE, img: GameImages.ITEM_JASON_MYERS_AXE, verb: ["slash", "slashes"] },
      MELEE_HUGE_HAMMER: { id: ItemID.MELEE_HUGE_HAMMER, img: GameImages.ITEM_HUGE_HAMMER, verb: ["smash", "smashes"] },
      MELEE_SMALL_HAMMER: { id: ItemID.MELEE_SMALL_HAMMER, img: GameImages.ITEM_SMALL_HAMMER, verb: ["smash"] },
      MELEE_GOLFCLUB: { id: ItemID.MELEE_GOLFCLUB, img: GameImages.ITEM_GOLF_CLUB, verb: ["strike"] },
      MELEE_IRON_GOLFCLUB: { id: ItemID.MELEE_IRON_GOLFCLUB, img: GameImages.ITEM_IRON_GOLF_CLUB, verb: ["strike"] },
      MELEE_SHOVEL: { id: ItemID.MELEE_SHOVEL, img: GameImages.ITEM_SHOVEL, verb: ["strike"] },
      MELEE_SHORT_SHOVEL: { id: ItemID.MELEE_SHORT_SHOVEL, img: GameImages.ITEM_SHORT_SHOVEL, verb: ["strike"] },
      MELEE_TRUNCHEON: { id: ItemID.MELEE_TRUNCHEON, img: GameImages.ITEM_TRUNCHEON, verb: ["strike"] },
      MELEE_IMPROVISED_CLUB: { id: ItemID.MELEE_IMPROVISED_CLUB, img: GameImages.ITEM_IMPROVISED_CLUB, verb: ["strike"] },
      MELEE_IMPROVISED_SPEAR: { id: ItemID.MELEE_IMPROVISED_SPEAR, img: GameImages.ITEM_IMPROVISED_SPEAR, verb: ["pierce"] },
      UNIQUE_FAMU_FATARU_KATANA: { id: ItemID.UNIQUE_FAMU_FATARU_KATANA, img: GameImages.ITEM_FAMU_FATARU_KATANA, verb: ["slash", "slashes"] },
      UNIQUE_BIGBEAR_BAT: { id: ItemID.UNIQUE_BIGBEAR_BAT, img: GameImages.ITEM_BIGBEAR_BAT, verb: ["smash", "smashes"] },
      UNIQUE_ROGUEDJACK_KEYBOARD: { id: ItemID.UNIQUE_ROGUEDJACK_KEYBOARD, img: GameImages.ITEM_ROGUEDJACK_KEYBOARD, verb: ["bash", "bashes"] },
    };

    for (const d of meleeData as any[]) {
      const meta = meleeMap[d.ID];
      if (!meta) continue;
      const atk = Attack.meleeAttack(
        new Verb(meta.verb[0], meta.verb[1]),
        d.ATK,
        d.DMG,
        d.STA ?? 0,
        d.DISARM ?? 0
      );
      const model = new ItemMeleeWeaponModel(
        d.NAME,
        d.PLURAL,
        meta.img,
        atk,
        d.ISFRAGILE === 1,
        d.TOOLBASHDMGBONUS ?? 0,
        d.TOOLBUILDBONUS ?? 0
      );
      model.equipmentPart = DollPart.RIGHT_HAND;
      model.stackingLimit = d.STACKINGLIMIT;
      model.flavorDescription = d.FLAVOR ?? "";
      this.setModel(meta.id, model);
    }

    // Ranged weapons
    //
    // Verb is per weapon and not in the CSV, as with melee: the C# passes
    // `new Verb("shoot")` everywhere except the army rifle's salvo
    // (GameItems.cs:987-1086). `kind` is derived from the ammo type, which
    // is equivalent to the C#'s explicit AttackKind per weapon since only the
    // crossbow takes bolts.
    const rangedMap: Record<string, { id: ItemID; img: string; ammo: AmmoType; verb: [string, string?] }> = {
      RANGED_ARMY_PISTOL: { id: ItemID.RANGED_ARMY_PISTOL, img: GameImages.ITEM_ARMY_PISTOL, ammo: AmmoType.HEAVY_PISTOL, verb: ["shoot"] },
      RANGED_ARMY_RIFLE: { id: ItemID.RANGED_ARMY_RIFLE, img: GameImages.ITEM_ARMY_RIFLE, ammo: AmmoType.HEAVY_RIFLE, verb: ["fire a salvo at", "fires a salvo at"] },
      RANGED_HUNTING_CROSSBOW: { id: ItemID.RANGED_HUNTING_CROSSBOW, img: GameImages.ITEM_HUNTING_CROSSBOW, ammo: AmmoType.BOLT, verb: ["shoot"] },
      RANGED_HUNTING_RIFLE: { id: ItemID.RANGED_HUNTING_RIFLE, img: GameImages.ITEM_HUNTING_RIFLE, ammo: AmmoType.LIGHT_RIFLE, verb: ["shoot"] },
      RANGED_PISTOL: { id: ItemID.RANGED_PISTOL, img: GameImages.ITEM_PISTOL, ammo: AmmoType.LIGHT_PISTOL, verb: ["shoot"] },
      RANGED_KOLT_REVOLVER: { id: ItemID.RANGED_KOLT_REVOLVER, img: GameImages.ITEM_KOLT_REVOLVER, ammo: AmmoType.HEAVY_PISTOL, verb: ["shoot"] },
      RANGED_PRECISION_RIFLE: { id: ItemID.RANGED_PRECISION_RIFLE, img: GameImages.ITEM_PRECISION_RIFLE, ammo: AmmoType.HEAVY_RIFLE, verb: ["shoot"] },
      RANGED_SHOTGUN: { id: ItemID.RANGED_SHOTGUN, img: GameImages.ITEM_SHOTGUN, ammo: AmmoType.SHOTGUN, verb: ["shoot"] },
      UNIQUE_SANTAMAN_SHOTGUN: { id: ItemID.UNIQUE_SANTAMAN_SHOTGUN, img: GameImages.ITEM_SANTAMAN_SHOTGUN, ammo: AmmoType.SHOTGUN, verb: ["shoot"] },
      UNIQUE_HANS_VON_HANZ_PISTOL: { id: ItemID.UNIQUE_HANS_VON_HANZ_PISTOL, img: GameImages.ITEM_HANS_VON_HANZ_PISTOL, ammo: AmmoType.HEAVY_PISTOL, verb: ["shoot"] },
    };

    for (const d of rangedData as any[]) {
      const meta = rangedMap[d.ID];
      if (!meta) continue;
      const kind = meta.ammo === AmmoType.BOLT ? AttackKind.BOW : AttackKind.FIREARM;
      const atk = Attack.rangedAttack(
        kind,
        new Verb(meta.verb[0], meta.verb[1]),
        d.ATK,
        d.RAPID1 ?? d.ATK,
        d.RAPID2 ?? d.ATK,
        d.DMG,
        d.RANGE
      );
      const model = new ItemRangedWeaponModel(
        d.NAME,
        d.PLURAL,
        meta.img,
        atk,
        meta.ammo,
        // Column is MAXAMMO (Items_RangedWeapons.csv). Reading `MAX_AMMO`
        // gave every ranged weapon maxAmmo = undefined, so guns could never
        // hold a magazine.
        d.MAXAMMO
      );
      model.equipmentPart = DollPart.RIGHT_HAND;
      model.flavorDescription = d.FLAVOR ?? "";
      this.setModel(meta.id, model);
    }

    // Explosives
    for (const d of explosivesData as any[]) {
      const blastDamage: number[] = [];
      for (let i = 0; i <= d.RADIUS; i++) blastDamage.push(d[`BLAST${i}`]);

      const grenade = new ItemGrenadeModel(
        d.NAME,
        d.PLURAL,
        GameImages.ITEM_GRENADE,
        d.FUSE,
        new BlastAttack(d.RADIUS, blastDamage, true, false),
        GameImages.ICON_BLAST,
        d.MAXTHROW
      );
      grenade.equipmentPart = DollPart.RIGHT_HAND;
      grenade.stackingLimit = d.STACKINGLIMIT;
      grenade.flavorDescription = d.FLAVOR ?? "";
      this.setModel(ItemID.EXPLOSIVE_GRENADE, grenade);

      const primedGrenade = new ItemGrenadePrimedModel(
        `primed ${d.NAME}`,
        `primed ${d.PLURAL}`,
        GameImages.ITEM_GRENADE_PRIMED,
        grenade
      );
      primedGrenade.equipmentPart = DollPart.RIGHT_HAND;
      this.setModel(ItemID.EXPLOSIVE_GRENADE_PRIMED, primedGrenade);
    }

    // Barricading
    for (const d of barricadingData as any[]) {
      const model = new ItemBarricadeMaterialModel(
        d.NAME,
        d.PLURAL,
        GameImages.ITEM_WOODEN_PLANK,
        d.VALUE
      );
      // Column is STACKINGLIMIT (Items_Barricading.csv), not STACKING as the
      // other tables spell it. Reading `STACKING` left it undefined, so the
      // `> 0` test failed and planks were never stackable.
      model.stackingLimit = d.STACKINGLIMIT;
      model.flavorDescription = d.FLAVOR ?? "";
      this.setModel(ItemID.BAR_WOODEN_PLANK, model);
    }

    // Body Armor
    const armorMap: Record<string, { id: ItemID; img: string; slot: DollPart }> = {
      ARMOR_ARMY_BODYARMOR: { id: ItemID.ARMOR_ARMY_BODYARMOR, img: GameImages.ITEM_ARMY_BODYARMOR, slot: DollPart.TORSO },
      ARMOR_CHAR_LIGHT_BODYARMOR: { id: ItemID.ARMOR_CHAR_LIGHT_BODYARMOR, img: GameImages.ITEM_CHAR_LIGHT_BODYARMOR, slot: DollPart.TORSO },
      ARMOR_HELLS_SOULS_JACKET: { id: ItemID.ARMOR_HELLS_SOULS_JACKET, img: GameImages.ITEM_HELLS_SOULS_JACKET, slot: DollPart.TORSO },
      ARMOR_FREE_ANGELS_JACKET: { id: ItemID.ARMOR_FREE_ANGELS_JACKET, img: GameImages.ITEM_FREE_ANGELS_JACKET, slot: DollPart.TORSO },
      ARMOR_POLICE_JACKET: { id: ItemID.ARMOR_POLICE_JACKET, img: GameImages.ITEM_POLICE_JACKET, slot: DollPart.TORSO },
      ARMOR_POLICE_RIOT: { id: ItemID.ARMOR_POLICE_RIOT, img: GameImages.ITEM_POLICE_RIOT_ARMOR, slot: DollPart.TORSO },
      ARMOR_HUNTER_VEST: { id: ItemID.ARMOR_HUNTER_VEST, img: GameImages.ITEM_HUNTER_VEST, slot: DollPart.TORSO },
    };

    for (const d of armorsData as any[]) {
      const meta = armorMap[d.ID];
      if (!meta) continue;
      const model = new ItemBodyArmorModel(
        d.NAME,
        d.PLURAL,
        meta.img,
        d.PRO_HIT,
        d.PRO_SHOT,
        // Column is ENC (Items_Armors.csv). Reading `ENCUMBRANCE` gave every
        // piece of body armor encumbrance 0, so armor weighed nothing.
        d.ENC,
        d.WEIGHT
      );
      model.equipmentPart = meta.slot;
      model.flavorDescription = d.FLAVOR ?? "";
      this.setModel(meta.id, model);
    }

    // Trackers
    //
    // `HASCLOCK` is a data column, not a per-model constant, and the C# reads
    // it from the row (GameItems.cs:1239, 1249, ...). It happened to agree
    // with the hardcoded values, but only by luck.
    const trackerMap: Record<string, { id: ItemID; img: string; flags: TrackingFlags }> = {
      TRACKER_BLACKOPS: { id: ItemID.TRACKER_BLACKOPS, img: GameImages.ITEM_BLACKOPS_GPS, flags: TrackingFlags.BLACKOPS_FACTION },
      TRACKER_CELL_PHONE: { id: ItemID.TRACKER_CELL_PHONE, img: GameImages.ITEM_CELL_PHONE, flags: TrackingFlags.FOLLOWER_AND_LEADER },
      TRACKER_ZTRACKER: { id: ItemID.TRACKER_ZTRACKER, img: GameImages.ITEM_ZTRACKER, flags: TrackingFlags.UNDEADS },
      TRACKER_POLICE_RADIO: { id: ItemID.TRACKER_POLICE_RADIO, img: GameImages.ITEM_POLICE_RADIO, flags: TrackingFlags.POLICE_FACTION },
    };

    for (const d of trackersData as any[]) {
      const meta = trackerMap[d.ID];
      if (!meta) continue;
      const model = new ItemTrackerModel(
        d.NAME,
        d.PLURAL,
        meta.img,
        meta.flags,
        // The column is in hours; batteries are counted in turns. The C#
        // scales it at every tracker (GameItems.cs:1237, 1247, 1257, 1267:
        // `traData.BATTERIES * WorldTime.TURNS_PER_HOUR`). Un-scaled, a cell
        // phone's 72 hours became 72 turns, i.e. 2.4 hours of battery.
        d.BATTERIES * WorldTime.TURNS_PER_HOUR,
        d.HASCLOCK === 1
      );
      model.equipmentPart = DollPart.LEFT_HAND;
      model.flavorDescription = d.FLAVOR ?? "";
      this.setModel(meta.id, model);
    }

    // Spray Paints
    const paintMap: Record<string, { id: ItemID; img: string; tagImg: string }> = {
      SPRAY_PAINT1: { id: ItemID.SPRAY_PAINT1, img: GameImages.ITEM_SPRAYPAINT, tagImg: GameImages.DECO_PLAYER_TAG1 },
      SPRAY_PAINT2: { id: ItemID.SPRAY_PAINT2, img: GameImages.ITEM_SPRAYPAINT2, tagImg: GameImages.DECO_PLAYER_TAG2 },
      SPRAY_PAINT3: { id: ItemID.SPRAY_PAINT3, img: GameImages.ITEM_SPRAYPAINT3, tagImg: GameImages.DECO_PLAYER_TAG3 },
      SPRAY_PAINT4: { id: ItemID.SPRAY_PAINT4, img: GameImages.ITEM_SPRAYPAINT4, tagImg: GameImages.DECO_PLAYER_TAG4 },
    };
    for (const d of spraypaintsData as any[]) {
      const meta = paintMap[d.ID];
      if (!meta) continue;
      const model = new ItemSprayPaintModel(d.NAME, d.PLURAL, meta.img, d.QUANTITY, meta.tagImg);
      model.equipmentPart = DollPart.LEFT_HAND;
      model.flavorDescription = d.FLAVOR ?? "";
      this.setModel(meta.id, model);
    }

    // Scent Sprays
    //
    // This table used to be dead: Items_Scentsprays.json was never imported
    // and the lone model was written out by hand, with a quantity of 10
    // instead of the CSV's 40 and a strength of 60 instead of
    // STRENGTH * TURNS_PER_HOUR (3 * 30 = 90, GameItems.cs:1332).
    for (const d of scentspraysData as any[]) {
      if (d.ID !== "SCENT_SPRAY_STENCH_KILLER") continue;
      const model = new ItemSprayScentModel(
        d.NAME,
        d.PLURAL,
        GameImages.ITEM_STENCH_KILLER,
        d.QUANTITY,
        Odor.SUPPRESSOR,
        d.STRENGTH * WorldTime.TURNS_PER_HOUR
      );
      model.equipmentPart = DollPart.LEFT_HAND;
      model.flavorDescription = d.FLAVOR ?? "";
      this.setModel(ItemID.SCENT_SPRAY_STENCH_KILLER, model);
    }

    // Lights
    const lightMap: Record<string, { id: ItemID; img: string; outImg: string }> = {
      LIGHT_FLASHLIGHT: { id: ItemID.LIGHT_FLASHLIGHT, img: GameImages.ITEM_FLASHLIGHT, outImg: GameImages.ITEM_FLASHLIGHT_OUT },
      LIGHT_BIG_FLASHLIGHT: { id: ItemID.LIGHT_BIG_FLASHLIGHT, img: GameImages.ITEM_BIG_FLASHLIGHT, outImg: GameImages.ITEM_BIG_FLASHLIGHT_OUT },
    };
    for (const d of lightsData as any[]) {
      const meta = lightMap[d.ID];
      if (!meta) continue;
      // Batteries are in hours in the CSV and in turns on the model; the C#
      // scales both lights (GameItems.cs:1311, 1318). Un-scaled, the
      // flashlight's 24 hours became 24 turns -- under a minute of light.
      const model = new ItemLightModel(
        d.NAME,
        d.PLURAL,
        meta.img,
        d.FOV,
        d.BATTERIES * WorldTime.TURNS_PER_HOUR,
        meta.outImg
      );
      model.equipmentPart = DollPart.LEFT_HAND;
      model.flavorDescription = d.FLAVOR ?? "";
      this.setModel(meta.id, model);
    }

    // Ammo
    //
    // Names, stack quantities and IsPlural from GameItems.cs:1088-1130. The
    // port had invented its own: "light pistol ammo" instead of "light pistol
    // bullets", quantities 30/30/30/20/16/12 instead of 20/12/14/20/10/30,
    // and no IsPlural -- so a single round read as "a light pistol ammo"
    // (Item.ts:29 falls back to singular when IsPlural is false).
    const ammo: [ItemID, string, string, AmmoType, number][] = [
      [ItemID.AMMO_LIGHT_PISTOL, "light pistol bullets", GameImages.ITEM_AMMO_LIGHT_PISTOL, AmmoType.LIGHT_PISTOL, 20],
      [ItemID.AMMO_HEAVY_PISTOL, "heavy pistol bullets", GameImages.ITEM_AMMO_HEAVY_PISTOL, AmmoType.HEAVY_PISTOL, 12],
      [ItemID.AMMO_LIGHT_RIFLE, "light rifle bullets", GameImages.ITEM_AMMO_LIGHT_RIFLE, AmmoType.LIGHT_RIFLE, 14],
      [ItemID.AMMO_HEAVY_RIFLE, "heavy rifle bullets", GameImages.ITEM_AMMO_HEAVY_RIFLE, AmmoType.HEAVY_RIFLE, 20],
      [ItemID.AMMO_SHOTGUN, "shotgun shells", GameImages.ITEM_AMMO_SHOTGUN, AmmoType.SHOTGUN, 10],
      [ItemID.AMMO_BOLTS, "crossbow bolts", GameImages.ITEM_AMMO_BOLTS, AmmoType.BOLT, 30],
    ];
    for (const [id, name, img, type, quantity] of ammo) {
      const model = new ItemAmmoModel(name, name, img, type, quantity);
      model.isPlural = true;
      model.flavorDescription = "";
      this.setModel(id, model);
    }

    // Traps
    const trapMap: Record<string, { id: ItemID; img: string }> = {
      TRAP_EMPTY_CAN: { id: ItemID.TRAP_EMPTY_CAN, img: GameImages.ITEM_EMPTY_CAN },
      TRAP_BEAR_TRAP: { id: ItemID.TRAP_BEAR_TRAP, img: GameImages.ITEM_BEAR_TRAP },
      TRAP_SPIKES: { id: ItemID.TRAP_SPIKES, img: GameImages.ITEM_SPIKES },
      TRAP_BARBED_WIRE: { id: ItemID.TRAP_BARBED_WIRE, img: GameImages.ITEM_BARBED_WIRE },
    };
    for (const d of trapsData as any[]) {
      const meta = trapMap[d.ID];
      if (!meta) continue;
      const model = new ItemTrapModel(
        d.NAME,
        d.PLURAL,
        meta.img,
        d.STACKING ?? 1,
        d.TRIGGER_CHANCE,
        d.DAMAGE,
        d.DROP_ACTIVATE === 1,
        d.USE_ACTIVATE === 1,
        d.ONE_TIME === 1,
        d.BREAK_CHANCE ?? 0,
        d.BLOCK_CHANCE ?? 0,
        d.BREAK_ESCAPE ?? 0,
        d.NOISY === 1,
        d.NOISE ?? "",
        d.FLAMMABLE === 1
      );
      model.flavorDescription = d.FLAVOR ?? "";
      this.setModel(meta.id, model);
    }

    // Entertainment
    const entMap: Record<string, { id: ItemID; img: string }> = {
      ENT_BOOK: { id: ItemID.ENT_BOOK, img: GameImages.ITEM_BOOK },
      ENT_MAGAZINE: { id: ItemID.ENT_MAGAZINE, img: GameImages.ITEM_MAGAZINE },
    };
    for (const d of entData as any[]) {
      const meta = entMap[d.ID];
      if (!meta) continue;
      const model = new ItemEntertainmentModel(d.NAME, d.PLURAL, meta.img, d.VALUE, d.BORE_CHANCE);
      model.stackingLimit = d.STACKING;
      model.flavorDescription = d.FLAVOR ?? "";
      this.setModel(meta.id, model);
    }

    // Uniques
    const subwayBadge = new ItemModel("Subway badge", "Subway badges", GameImages.ITEM_SUBWAY_BADGE);
    subwayBadge.isProper = true;
    subwayBadge.flavorDescription = "A master pass for the city subway system.";
    this.setModel(ItemID.UNIQUE_SUBWAY_BADGE, subwayBadge);

    this.postProcess();
  }

  /**
   * The C# runs one pass over every model after construction
   * (GameItems.cs:1410-1421) which is the *only* place `IsStackable` is
   * finally decided -- the per-model `IsStackable = ...` assignments in the
   * constructors are all overwritten by it:
   *
   *     model.IsAn = StartsWithVowel(model.SingleName);
   *     model.IsStackable = model.StackingLimit > 1;
   *
   * So the rule is `StackingLimit > 1` globally, not `> 0` per table. With
   * `> 0`, a stack limit of 1 (every food but canned food, the plank, both
   * uniques) marked the item stackable, so the inventory offered to merge
   * two army rations into one slot and then capped the pile at one.
   */
  private postProcess(): void {
    for (let i = 0; i < ItemID._COUNT; i++) {
      const model = this.models[i];
      if (!model) continue;
      model.isAn = GameItems.startsWithVowel(model.singleName);
      model.isStackable = model.stackingLimit > 1;
    }
  }

  /** C# `StartsWithVowel` (GameItems.cs:681). Note it counts `y`. */
  private static startsWithVowel(name: string): boolean {
    return "aeiouyAEIOUY".includes(name.charAt(0));
  }

  /** C# `CheckPlural` (GameItems.cs:688): the name is already plural. */
  private static checkPlural(name: string, plural: string): boolean {
    return name === plural;
  }

  private setModel(id: ItemID, model: ItemModel): void {
    model.id = id;
    this.models[id] = model;
  }

  get(id: number): ItemModel {
    return this.models[id];
  }
}
