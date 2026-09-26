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
      if (d.STACKING > 0) {
        model.isStackable = true;
        model.stackingLimit = d.STACKING;
      }
      model.flavorDescription = d.FLAVOR ?? "";
      this.setModel(ItemID.MEDICINE_BANDAGES + i, model);
    }

    // Food
    const foodImages = [
      GameImages.ITEM_ARMY_RATION,
      GameImages.ITEM_GROCERIES,
      GameImages.ITEM_CANNED_FOOD,
    ];
    for (let i = 0; i < foodData.length; i++) {
      const d: any = foodData[i];
      const model = new ItemFoodModel(
        d.NAME,
        d.PLURAL,
        foodImages[i],
        d.NUTRITION,
        d.BESTBEFORE
      );
      if (d.STACKING > 0) {
        model.isStackable = true;
        model.stackingLimit = d.STACKING;
      }
      model.flavorDescription = d.FLAVOR ?? "";
      this.setModel(ItemID.FOOD_ARMY_RATION + i, model);
    }

    // Melee weapons
    const meleeImages: Record<string, string> = {
      MELEE_BASEBALLBAT: GameImages.ITEM_BASEBALL_BAT,
      MELEE_COMBAT_KNIFE: GameImages.ITEM_COMBAT_KNIFE,
      MELEE_CROWBAR: GameImages.ITEM_CROWBAR,
      UNIQUE_JASON_MYERS_AXE: GameImages.ITEM_JASON_MYERS_AXE,
      MELEE_HUGE_HAMMER: GameImages.ITEM_HUGE_HAMMER,
      MELEE_SMALL_HAMMER: GameImages.ITEM_SMALL_HAMMER,
      MELEE_GOLFCLUB: GameImages.ITEM_GOLF_CLUB,
      MELEE_IRON_GOLFCLUB: GameImages.ITEM_IRON_GOLF_CLUB,
      MELEE_SHOVEL: GameImages.ITEM_SHOVEL,
      MELEE_SHORT_SHOVEL: GameImages.ITEM_SHORT_SHOVEL,
      MELEE_TRUNCHEON: GameImages.ITEM_TRUNCHEON,
      MELEE_IMPROVISED_CLUB: GameImages.ITEM_IMPROVISED_CLUB,
      MELEE_IMPROVISED_SPEAR: GameImages.ITEM_IMPROVISED_SPEAR,
      UNIQUE_FAMU_FATARU_KATANA: GameImages.ITEM_FAMU_FATARU_KATANA,
      UNIQUE_BIGBEAR_BAT: GameImages.ITEM_BIGBEAR_BAT,
      UNIQUE_ROGUEDJACK_KEYBOARD: GameImages.ITEM_ROGUEDJACK_KEYBOARD,
    };

    const meleeIds: Record<string, ItemID> = {
      MELEE_BASEBALLBAT: ItemID.MELEE_BASEBALLBAT,
      MELEE_COMBAT_KNIFE: ItemID.MELEE_COMBAT_KNIFE,
      MELEE_CROWBAR: ItemID.MELEE_CROWBAR,
      UNIQUE_JASON_MYERS_AXE: ItemID.UNIQUE_JASON_MYERS_AXE,
      MELEE_HUGE_HAMMER: ItemID.MELEE_HUGE_HAMMER,
      MELEE_SMALL_HAMMER: ItemID.MELEE_SMALL_HAMMER,
      MELEE_GOLFCLUB: ItemID.MELEE_GOLFCLUB,
      MELEE_IRON_GOLFCLUB: ItemID.MELEE_IRON_GOLFCLUB,
      MELEE_SHOVEL: ItemID.MELEE_SHOVEL,
      MELEE_SHORT_SHOVEL: ItemID.MELEE_SHORT_SHOVEL,
      MELEE_TRUNCHEON: ItemID.MELEE_TRUNCHEON,
      MELEE_IMPROVISED_CLUB: ItemID.MELEE_IMPROVISED_CLUB,
      MELEE_IMPROVISED_SPEAR: ItemID.MELEE_IMPROVISED_SPEAR,
      UNIQUE_FAMU_FATARU_KATANA: ItemID.UNIQUE_FAMU_FATARU_KATANA,
      UNIQUE_BIGBEAR_BAT: ItemID.UNIQUE_BIGBEAR_BAT,
      UNIQUE_ROGUEDJACK_KEYBOARD: ItemID.UNIQUE_ROGUEDJACK_KEYBOARD,
    };

    for (const d of meleeData as any[]) {
      const id = meleeIds[d.ID];
      if (id === undefined) continue;
      const atk = Attack.meleeAttack(
        new Verb(d.VERB),
        d.ATK,
        d.DMG,
        d.STA_PENALTY ?? 0,
        d.DISARM ?? 0
      );
      const model = new ItemMeleeWeaponModel(
        d.NAME,
        d.PLURAL,
        meleeImages[d.ID],
        atk,
        d.FRAGILE === 1,
        d.TOOL_BASH ?? 0,
        d.TOOL_BUILD ?? 0
      );
      model.equipmentPart = DollPart.RIGHT_HAND;
      model.flavorDescription = d.FLAVOR ?? "";
      this.setModel(id, model);
    }

    // Ranged weapons
    const rangedMap: Record<string, { id: ItemID; img: string; ammo: AmmoType }> = {
      RANGED_ARMY_PISTOL: { id: ItemID.RANGED_ARMY_PISTOL, img: GameImages.ITEM_ARMY_PISTOL, ammo: AmmoType.HEAVY_PISTOL },
      RANGED_ARMY_RIFLE: { id: ItemID.RANGED_ARMY_RIFLE, img: GameImages.ITEM_ARMY_RIFLE, ammo: AmmoType.HEAVY_RIFLE },
      RANGED_HUNTING_CROSSBOW: { id: ItemID.RANGED_HUNTING_CROSSBOW, img: GameImages.ITEM_HUNTING_CROSSBOW, ammo: AmmoType.BOLT },
      RANGED_HUNTING_RIFLE: { id: ItemID.RANGED_HUNTING_RIFLE, img: GameImages.ITEM_HUNTING_RIFLE, ammo: AmmoType.LIGHT_RIFLE },
      RANGED_PISTOL: { id: ItemID.RANGED_PISTOL, img: GameImages.ITEM_PISTOL, ammo: AmmoType.LIGHT_PISTOL },
      RANGED_KOLT_REVOLVER: { id: ItemID.RANGED_KOLT_REVOLVER, img: GameImages.ITEM_KOLT_REVOLVER, ammo: AmmoType.HEAVY_PISTOL },
      RANGED_PRECISION_RIFLE: { id: ItemID.RANGED_PRECISION_RIFLE, img: GameImages.ITEM_PRECISION_RIFLE, ammo: AmmoType.HEAVY_RIFLE },
      RANGED_SHOTGUN: { id: ItemID.RANGED_SHOTGUN, img: GameImages.ITEM_SHOTGUN, ammo: AmmoType.SHOTGUN },
      UNIQUE_SANTAMAN_SHOTGUN: { id: ItemID.UNIQUE_SANTAMAN_SHOTGUN, img: GameImages.ITEM_SANTAMAN_SHOTGUN, ammo: AmmoType.SHOTGUN },
      UNIQUE_HANS_VON_HANZ_PISTOL: { id: ItemID.UNIQUE_HANS_VON_HANZ_PISTOL, img: GameImages.ITEM_HANS_VON_HANZ_PISTOL, ammo: AmmoType.HEAVY_PISTOL },
    };

    for (const d of rangedData as any[]) {
      const meta = rangedMap[d.ID];
      if (!meta) continue;
      const kind = meta.ammo === AmmoType.BOLT ? AttackKind.BOW : AttackKind.FIREARM;
      const atk = Attack.rangedAttack(
        kind,
        new Verb(d.VERB),
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
        d.MAX_AMMO
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
      grenade.isStackable = true;
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
      if (d.STACKING > 0) {
        model.isStackable = true;
        model.stackingLimit = d.STACKING;
      }
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
        d.ENCUMBRANCE,
        d.WEIGHT
      );
      model.equipmentPart = meta.slot;
      model.flavorDescription = d.FLAVOR ?? "";
      this.setModel(meta.id, model);
    }

    // Trackers
    const trackerMap: Record<string, { id: ItemID; img: string; flags: TrackingFlags; clock: boolean }> = {
      TRACKER_BLACKOPS: { id: ItemID.TRACKER_BLACKOPS, img: GameImages.ITEM_BLACKOPS_GPS, flags: TrackingFlags.BLACKOPS_FACTION, clock: false },
      TRACKER_CELL_PHONE: { id: ItemID.TRACKER_CELL_PHONE, img: GameImages.ITEM_CELL_PHONE, flags: TrackingFlags.FOLLOWER_AND_LEADER, clock: true },
      TRACKER_ZTRACKER: { id: ItemID.TRACKER_ZTRACKER, img: GameImages.ITEM_ZTRACKER, flags: TrackingFlags.UNDEADS, clock: false },
      TRACKER_POLICE_RADIO: { id: ItemID.TRACKER_POLICE_RADIO, img: GameImages.ITEM_POLICE_RADIO, flags: TrackingFlags.POLICE_FACTION, clock: true },
    };

    for (const d of trackersData as any[]) {
      const meta = trackerMap[d.ID];
      if (!meta) continue;
      const model = new ItemTrackerModel(
        d.NAME,
        d.PLURAL,
        meta.img,
        meta.flags,
        d.BATTERIES,
        meta.clock
      );
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
      model.flavorDescription = d.FLAVOR ?? "";
      this.setModel(meta.id, model);
    }

    // Scent Sprays
    const stenchKiller = new ItemSprayScentModel(
      "stench killer",
      "stench killers",
      GameImages.ITEM_STENCH_KILLER,
      10,
      Odor.SUPPRESSOR,
      60
    );
    this.setModel(ItemID.SCENT_SPRAY_STENCH_KILLER, stenchKiller);

    // Lights
    const lightMap: Record<string, { id: ItemID; img: string; outImg: string }> = {
      LIGHT_FLASHLIGHT: { id: ItemID.LIGHT_FLASHLIGHT, img: GameImages.ITEM_FLASHLIGHT, outImg: GameImages.ITEM_FLASHLIGHT_OUT },
      LIGHT_BIG_FLASHLIGHT: { id: ItemID.LIGHT_BIG_FLASHLIGHT, img: GameImages.ITEM_BIG_FLASHLIGHT, outImg: GameImages.ITEM_BIG_FLASHLIGHT_OUT },
    };
    for (const d of lightsData as any[]) {
      const meta = lightMap[d.ID];
      if (!meta) continue;
      const model = new ItemLightModel(d.NAME, d.PLURAL, meta.img, d.FOV, d.BATTERIES, meta.outImg);
      model.equipmentPart = DollPart.LEFT_HAND;
      model.flavorDescription = d.FLAVOR ?? "";
      this.setModel(meta.id, model);
    }

    // Ammo
    this.setModel(ItemID.AMMO_LIGHT_PISTOL, new ItemAmmoModel("light pistol ammo", "light pistol ammo", GameImages.ITEM_AMMO_LIGHT_PISTOL, AmmoType.LIGHT_PISTOL, 30));
    this.setModel(ItemID.AMMO_HEAVY_PISTOL, new ItemAmmoModel("heavy pistol ammo", "heavy pistol ammo", GameImages.ITEM_AMMO_HEAVY_PISTOL, AmmoType.HEAVY_PISTOL, 24));
    this.setModel(ItemID.AMMO_LIGHT_RIFLE, new ItemAmmoModel("light rifle ammo", "light rifle ammo", GameImages.ITEM_AMMO_LIGHT_RIFLE, AmmoType.LIGHT_RIFLE, 30));
    this.setModel(ItemID.AMMO_HEAVY_RIFLE, new ItemAmmoModel("heavy rifle ammo", "heavy rifle ammo", GameImages.ITEM_AMMO_HEAVY_RIFLE, AmmoType.HEAVY_RIFLE, 20));
    this.setModel(ItemID.AMMO_SHOTGUN, new ItemAmmoModel("shotgun ammo", "shotgun ammo", GameImages.ITEM_AMMO_SHOTGUN, AmmoType.SHOTGUN, 16));
    this.setModel(ItemID.AMMO_BOLTS, new ItemAmmoModel("crossbow bolts", "crossbow bolts", GameImages.ITEM_AMMO_BOLTS, AmmoType.BOLT, 12));

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
      model.flavorDescription = d.FLAVOR ?? "";
      this.setModel(meta.id, model);
    }

    // Uniques
    const subwayBadge = new ItemModel("Subway badge", "Subway badges", GameImages.ITEM_SUBWAY_BADGE);
    subwayBadge.isProper = true;
    subwayBadge.flavorDescription = "A master pass for the city subway system.";
    this.setModel(ItemID.UNIQUE_SUBWAY_BADGE, subwayBadge);
  }

  private setModel(id: ItemID, model: ItemModel): void {
    model.id = id;
    this.models[id] = model;
  }

  get(id: number): ItemModel {
    return this.models[id];
  }
}
