/**
 * Core game rules – port of src/Engine/Rules.cs
 *
 * C# `out string reason` overloads collapse to a single TS method returning a
 * {@link RuleResult}; `IsBumpableFor` returns a {@link BumpResult}.
 */

import { Actor } from "@data/Actor";
import { ActorAction } from "@data/ActorAction";
import { Attack, AttackKind } from "@data/Attack";
import { BlastAttack } from "@data/BlastAttack";
import { Corpse } from "@data/Corpse";
import { Defence } from "@data/Defence";
import { DollPart } from "@data/Doll";
import { Item } from "@data/Item";
import { Location } from "@data/Location";
import { Map as GameMap, Lighting } from "@data/Map";
import { MapObject, MapObjectBreak } from "@data/MapObject";
import { OdorScent, Odor } from "@data/Odor";
import { Weather } from "@data/Weather";

import {
  ActionBashDoor,
  ActionBreak,
  ActionChat,
  ActionGetFromContainer,
  ActionLeaveMap,
  ActionMeleeAttack,
  ActionMoveStep,
  ActionOpenDoor,
  ActionRechargeItemBattery,
  ActionSwitchPlace,
  ActionSwitchPowerGenerator,
} from "@engine/actions/Actions";
import { DiceRoller } from "@engine/DiceRoller";
import { Direction } from "@engine/Direction";
import { LOS } from "@engine/LOS";
import { Point } from "@engine/Point";
import { GameMode } from "@engine/Session";
import { DayPhase, WorldTime } from "@engine/WorldTime";
import { ItemBodyArmor } from "@engine/items/ItemBodyArmor";
import {
  ItemGrenade,
  ItemGrenadeModel,
  ItemGrenadePrimed,
  ItemGrenadePrimedModel,
} from "@engine/items/ItemExplosive";
import { ItemFood } from "@engine/items/ItemFood";
import { ItemLight } from "@engine/items/ItemLight";
import { ItemBarricadeMaterial, ItemEntertainment, ItemSprayScent } from "@engine/items/ItemMisc";
import { ItemMedicine } from "@engine/items/ItemMedicine";
import { ItemTracker } from "@engine/items/ItemTracker";
import { ItemTrap } from "@engine/items/ItemTrap";
import { ItemAmmo, ItemRangedWeapon, ItemWeapon } from "@engine/items/ItemWeapon";
import { DoorWindow, Fortification, PowerGenerator } from "@engine/mapobjects/MapObjects";

import { FactionID } from "@gameplay/GameFactions";
import { GangID } from "@gameplay/GameGangs";
import { ItemID } from "@gameplay/GameItems";
import { SkillID } from "@gameplay/Skills";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

// ────────────────────────────────────────────────────────────────────────────
// Result types
// ────────────────────────────────────────────────────────────────────────────

export interface RuleResult {
  ok: boolean;
  reason: string;
}

export interface BumpResult {
  action: ActorAction | null;
  reason: string;
}

export const OK: RuleResult = Object.freeze({ ok: true, reason: "" });
export const NO_ACTION: BumpResult = Object.freeze({ action: null, reason: "" });

function fail(reason: string): RuleResult {
  return { ok: false, reason };
}

function noAction(reason: string): BumpResult {
  return { action: null, reason };
}

/** C# `out Location` result of RollValidMoveInMap. */
export interface MoveLocationResult {
  ok: boolean;
  location: Location;
}

/** C# `out Direction` result of RollValidMoveDirection / RollValidBumpDirection. */
export interface DirectionResult {
  ok: boolean;
  direction: Direction | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Rules
// ────────────────────────────────────────────────────────────────────────────

export class Rules {
  // ── Constants ────────────────────────────────────────────────────────────
  static readonly BASE_ACTION_COST = 100;
  static readonly BASE_SPEED = Rules.BASE_ACTION_COST;

  // Stamina
  static readonly STAMINA_INFINITE = 99;
  static readonly STAMINA_MIN_FOR_ACTIVITY = 10;
  static readonly STAMINA_COST_RUNNING = 4;
  static readonly STAMINA_REGEN_WAIT = 2;
  static readonly STAMINA_REGEN_PER_TURN = 2;
  static readonly STAMINA_COST_JUMP = 8;
  static readonly STAMINA_COST_MELEE_ATTACK = 8;
  static readonly STAMINA_COST_MOVE_DRAGGED_CORPSE = 8;

  // Stumbling
  static readonly JUMP_STUMBLE_CHANCE = 25;
  static readonly JUMP_STUMBLE_ACTION_COST = Rules.BASE_ACTION_COST;

  // Scents
  static readonly LIVING_SCENT_DROP = OdorScent.MAX_STRENGTH;
  static readonly UNDEAD_MASTER_SCENT_DROP = OdorScent.MAX_STRENGTH;

  // Barricading
  static readonly BARRICADING_MAX = 2 * DoorWindow.BASE_HITPOINTS;

  // FOV
  private static readonly MINIMAL_FOV = 2;

  // Day/Night and weather effects
  static readonly FOV_PENALTY_SUNSET = 1;
  static readonly FOV_PENALTY_EVENING = 2;
  static readonly FOV_PENALTY_MIDNIGHT = 3;
  static readonly FOV_PENALTY_DEEP_NIGHT = 4;
  static readonly FOV_PENALTY_SUNRISE = 2;
  static readonly NIGHT_STA_PENALTY = 2;
  static readonly FOV_PENALTY_RAIN = 1;
  static readonly FOV_PENALTY_HEAVY_RAIN = 2;

  // Weapons & firing
  static readonly MELEE_WEAPON_BREAK_CHANCE = 1;
  static readonly MELEE_WEAPON_FRAGILE_BREAK_CHANCE = 3;
  static readonly MELEE_DISARM_BASE_CHANCE = 5;
  static readonly FIREARM_JAM_CHANCE_NO_RAIN = 1;
  static readonly FIREARM_JAM_CHANCE_RAIN = 3;
  private static readonly FIRING_WHEN_STA_TIRED = 0.75; // -25%
  private static readonly FIRING_WHEN_STA_NOT_FULL = 0.9; // -10%
  private static readonly FIRING_WHEN_SLP_EXHAUSTED = 0.5; // -50%
  private static readonly FIRING_WHEN_SLP_SLEEPY = 0.75; // -25%

  // Body armors
  static readonly BODY_ARMOR_BREAK_CHANCE = 2;

  // Hunger/Rot & Sleep & Sanity
  static readonly FOOD_BASE_POINTS = WorldTime.TURNS_PER_HOUR * 48;
  static readonly FOOD_HUNGRY_LEVEL = Rules.FOOD_BASE_POINTS / 2;
  static readonly ROT_BASE_POINTS = WorldTime.TURNS_PER_DAY * 4;
  static readonly ROT_HUNGRY_LEVEL = Rules.ROT_BASE_POINTS / 2;
  static readonly SLEEP_BASE_POINTS = WorldTime.TURNS_PER_HOUR * 60;
  static readonly SLEEP_SLEEPY_LEVEL = Rules.SLEEP_BASE_POINTS / 2;
  static readonly SANITY_BASE_POINTS = WorldTime.TURNS_PER_DAY * 4;
  static readonly SANITY_UNSTABLE_LEVEL = Rules.SANITY_BASE_POINTS / 2;
  static readonly SANITY_NIGHTMARE_CHANCE = 2;
  static readonly SANITY_NIGHTMARE_SLP_LOSS = 2 * WorldTime.TURNS_PER_HOUR;
  static readonly SANITY_NIGHTMARE_SAN_LOSS = WorldTime.TURNS_PER_HOUR;
  static readonly SANITY_NIGHTMARE_STA_LOSS = 10 * Rules.STAMINA_COST_RUNNING;
  static readonly SANITY_INSANE_ACTION_CHANCE = 5;

  static readonly SANITY_HIT_BUTCHERING_CORPSE = WorldTime.TURNS_PER_HOUR;
  static readonly SANITY_HIT_UNDEAD_EATING_CORPSE = 2 * WorldTime.TURNS_PER_HOUR;
  static readonly SANITY_HIT_LIVING_EATING_CORPSE = 4 * WorldTime.TURNS_PER_HOUR;
  static readonly SANITY_HIT_EATEN_ALIVE = 4 * WorldTime.TURNS_PER_HOUR;
  static readonly SANITY_HIT_ZOMBIFY = 2 * WorldTime.TURNS_PER_HOUR;
  static readonly SANITY_HIT_BOND_DEATH = 8 * WorldTime.TURNS_PER_HOUR;

  static readonly SANITY_RECOVER_KILL_UNDEAD = 3 * WorldTime.TURNS_PER_HOUR;
  static readonly SANITY_RECOVER_BOND_CHANCE = 5;
  static readonly SANITY_RECOVER_BOND = 4 * WorldTime.TURNS_PER_HOUR;
  static readonly SANITY_RECOVER_CHAT_OR_TRADE = 3 * WorldTime.TURNS_PER_HOUR;

  static readonly FOOD_STARVING_DEATH_CHANCE = 5;
  static readonly FOOD_EXPIRED_VOMIT_CHANCE = 25;
  static readonly FOOD_VOMIT_STA_COST = 100;
  static readonly ROT_STARVING_HP_CHANCE = 5;
  static readonly ROT_HUNGRY_SKILL_CHANCE = 5;
  static readonly SLEEP_EXHAUSTION_COLLAPSE_CHANCE = 5;
  private static readonly SLEEP_COUCH_SLEEPING_REGEN =
    1 + Rules.SLEEP_BASE_POINTS / (12 * WorldTime.TURNS_PER_HOUR);
  static readonly SLEEP_NOCOUCH_SLEEPING_REGEN = (2 * Rules.SLEEP_COUCH_SLEEPING_REGEN) / 3;
  static readonly SLEEP_ON_COUCH_HEAL_CHANCE = 5;
  static readonly SLEEP_HEAL_HITPOINTS = 2;

  // Loud noises
  static readonly LOUD_NOISE_RADIUS = 5;
  private static readonly LOUD_NOISE_BASE_WAKEUP_CHANCE = 10;
  private static readonly LOUD_NOISE_DISTANCE_BONUS = 10;

  // Victims dropping items
  static readonly VICTIM_DROP_GENERIC_ITEM_CHANCE = 50;
  static readonly VICTIM_DROP_AMMOFOOD_ITEM_CHANCE = 100;

  // Improvised weapons
  static readonly IMPROVED_WEAPONS_FROM_BROKEN_WOOD_CHANCE = 25;

  // Trackers
  static readonly ZTRACKINGRADIUS = 6;

  // Actor weight
  static readonly DEFAULT_ACTOR_WEIGHT = 10;

  // Things on fire
  static readonly FIRE_RAIN_TEST_CHANCE = 1;
  static readonly FIRE_RAIN_PUT_OUT_CHANCE = 10;

  // Trust & Bond
  static readonly TRUST_NEUTRAL = 0;
  static readonly TRUST_TRUSTING_THRESHOLD = 12 * WorldTime.TURNS_PER_HOUR;
  static readonly TRUST_MIN = -Rules.TRUST_TRUSTING_THRESHOLD;
  static readonly TRUST_MAX = 4 * Rules.TRUST_TRUSTING_THRESHOLD;
  static readonly TRUST_BOND_THRESHOLD = Rules.TRUST_MAX;
  static readonly TRUST_BASE_INCREASE = 1;
  static readonly TRUST_GOOD_GIFT_INCREASE = 3 * WorldTime.TURNS_PER_HOUR;
  static readonly TRUST_MISC_GIFT_INCREASE =
    Rules.TRUST_BASE_INCREASE + Rules.TRUST_GOOD_GIFT_INCREASE / 10;
  static readonly TRUST_GIVE_ITEM_ORDER_PENALTY = -WorldTime.TURNS_PER_HOUR;
  static readonly TRUST_LEADER_KILL_ENEMY = 3 * WorldTime.TURNS_PER_HOUR;

  // Murder
  static readonly MURDERER_SPOTTING_BASE_CHANCE = 5;
  static readonly MURDERER_SPOTTING_DISTANCE_PENALTY = 1;
  static readonly MURDER_SPOTTING_MURDERCOUNTER_BONUS = 5;

  // Infection & Corpses
  private static readonly INFECTION_BASE_FACTOR = 1.0;
  static INFECTION_LEVEL_1_WEAK = 10;
  static INFECTION_LEVEL_2_TIRED = 30;
  static INFECTION_LEVEL_3_VOMIT = 50;
  static INFECTION_LEVEL_4_BLEED = 75;
  static INFECTION_LEVEL_5_DEATH = 100;
  static INFECTION_LEVEL_1_WEAK_STA = 24;
  static INFECTION_LEVEL_2_TIRED_STA = 24;
  static INFECTION_LEVEL_2_TIRED_SLP = 3 * WorldTime.TURNS_PER_HOUR;
  static INFECTION_LEVEL_4_BLEED_HP = 6;
  static INFECTION_EFFECT_TRIGGER_CHANCE_1000 = Math.floor(
    (1000 * 2.0) / WorldTime.TURNS_PER_DAY
  );

  private static readonly CORPSE_ZOMBIFY_BASE_CHANCE = 0;
  private static readonly CORPSE_ZOMBIFY_DELAY = 6 * WorldTime.TURNS_PER_HOUR;
  private static readonly CORPSE_ZOMBIFY_INFECTIONP_FACTOR = 1;
  private static readonly CORPSE_ZOMBIFY_NIGHT_FACTOR = 2.0;
  private static readonly CORPSE_ZOMBIFY_DAY_FACTOR = 0.01;
  private static readonly CORPSE_ZOMBIFY_TIME_FACTOR = 1 / WorldTime.TURNS_PER_DAY;
  private static readonly CORPSE_EATING_NUTRITION_FACTOR = 10.0;
  private static readonly CORPSE_EATING_INFECTION_FACTOR = 0.1;
  private static readonly CORPSE_DECAY_PER_TURN = 4 / WorldTime.TURNS_PER_DAY;

  // Refugees
  static readonly GIVE_RARE_ITEM_DAY = 7;
  static readonly GIVE_RARE_ITEM_CHANCE = 5;

  // Traps
  static readonly TRAP_UNDEAD_ACTOR_TRIGGER_PENALTY = 30;
  static readonly TRAP_SMALL_ACTOR_AVOID_BONUS = 90;
  static readonly CRUSHING_GATES_DAMAGE = 60;

  // Skills limits & bonuses per level
  static readonly UPGRADE_SKILLS_TO_CHOOSE_FROM = 5;
  static readonly UNDEAD_UPGRADE_SKILLS_TO_CHOOSE_FROM = 2;

  // Livings
  static SKILL_AGILE_ATK_BONUS = 2;
  static SKILL_AGILE_DEF_BONUS = 4;
  static SKILL_AWAKE_SLEEP_BONUS = 0.1;
  static SKILL_AWAKE_SLEEP_REGEN_BONUS = 0.15;
  static SKILL_BOWS_ATK_BONUS = 10;
  static SKILL_BOWS_DMG_BONUS = 4;
  static SKILL_CARPENTRY_BARRICADING_BONUS = 0.15;
  static SKILL_CARPENTRY_LEVEL3_BUILD_BONUS = 1;
  static SKILL_CHARISMATIC_TRUST_BONUS = 2;
  static SKILL_CHARISMATIC_TRADE_BONUS = 10;
  static SKILL_FIREARMS_ATK_BONUS = 10;
  static SKILL_FIREARMS_DMG_BONUS = 2;
  static SKILL_HARDY_HEAL_CHANCE_BONUS = 1;
  static SKILL_HAULER_INV_BONUS = 1;
  static SKILL_HIGH_STAMINA_STA_BONUS = 8;
  static SKILL_LEADERSHIP_FOLLOWER_BONUS = 1;
  static SKILL_LIGHT_EATER_MAXFOOD_BONUS = 0.1;
  static SKILL_LIGHT_EATER_FOOD_BONUS = 0.15;
  static SKILL_LIGHT_FEET_TRAP_BONUS = 15;
  static SKILL_LIGHT_SLEEPER_WAKEUP_CHANCE_BONUS = 20;
  static SKILL_MARTIAL_ARTS_ATK_BONUS = 6;
  static SKILL_MARTIAL_ARTS_DMG_BONUS = 2;
  static SKILL_MARTIAL_ARTS_DISARM_BONUS = 10;
  static SKILL_MEDIC_BONUS = 0.15;
  static SKILL_MEDIC_REVIVE_BONUS = 10;
  static SKILL_MEDIC_LEVEL_FOR_REVIVE_EST = 1;
  static SKILL_NECROLOGY_UNDEAD_BONUS = 2;
  static SKILL_NECROLOGY_CORPSE_BONUS = 4;
  static SKILL_NECROLOGY_LEVEL_FOR_INFECTION = 3;
  static SKILL_NECROLOGY_LEVEL_FOR_RISE = 5;
  static SKILL_STRONG_PSYCHE_LEVEL_BONUS = 0.15;
  static SKILL_STRONG_DMG_BONUS = 2;
  static SKILL_STRONG_THROW_BONUS = 1;
  static SKILL_STRONG_RESIST_DISARM_BONUS = 5;
  static SKILL_TOUGH_HP_BONUS = 6;
  static SKILL_UNSUSPICIOUS_BONUS = 20;
  static UNSUSPICIOUS_BAD_OUTFIT_PENALTY = 75;
  static UNSUSPICIOUS_GOOD_OUTFIT_BONUS = 75;

  // Undeads
  static SKILL_ZAGILE_ATK_BONUS = 1;
  static SKILL_ZAGILE_DEF_BONUS = 2;
  static SKILL_ZSTRONG_DMG_BONUS = 2;
  static SKILL_ZTOUGH_HP_BONUS = 4;
  static SKILL_ZEATER_REGEN_BONUS = 0.2;
  static SKILL_ZTRACKER_SMELL_BONUS = 0.1;
  static SKILL_ZLIGHT_FEET_TRAP_BONUS = 3;
  static SKILL_ZGRAB_CHANCE = 4;
  static SKILL_ZINFECTOR_BONUS = 0.15;
  static SKILL_ZLIGHT_EATER_MAXFOOD_BONUS = 0.15;
  static SKILL_ZLIGHT_EATER_FOOD_BONUS = 0.1;

  // ── Fields ────────────────────────────────────────────────────────────────
  readonly diceRoller: DiceRoller;

  /** Weather used when callers do not supply one (set by Session each turn). */
  weather: Weather = Weather.CLEAR;

  constructor(diceRoller: DiceRoller) {
    if (!diceRoller) throw new Error("diceRoller");
    this.diceRoller = diceRoller;
  }

  // ── Rolling & random choices ──────────────────────────────────────────────

  /** Roll in range [min, max[. */
  roll(min: number, max: number): number {
    return this.diceRoller.roll(min, max);
  }

  rollChance(chance: number): boolean {
    return this.diceRoller.rollChance(chance);
  }

  rollFloat(): number {
    return this.diceRoller.rollFloat();
  }

  /** Apply a random deviation to a value. */
  randomize(value: number, deviation: number): number {
    const halfDeviation = deviation / 2;
    return value - halfDeviation * this.diceRoller.rollFloat() + halfDeviation * this.diceRoller.rollFloat();
  }

  rollX(map: GameMap): number {
    if (!map) throw new Error("map");
    return this.diceRoller.roll(0, map.width);
  }

  rollY(map: GameMap): number {
    if (!map) throw new Error("map");
    return this.diceRoller.roll(0, map.height);
  }

  rollDirection(): Direction {
    return Direction.COMPASS[this.diceRoller.roll(0, 8)];
  }

  /** [0, skillValue] with a bell curve. */
  rollSkill(skillValue: number): number {
    if (skillValue <= 0) return 0;
    return (
      (this.diceRoller.roll(0, skillValue + 1) + this.diceRoller.roll(0, skillValue + 1)) / 2
    );
  }

  /** [damageValue/2, damageValue]. */
  rollDamage(damageValue: number): number {
    if (damageValue <= 0) return 0;
    return this.diceRoller.roll(damageValue / 2, damageValue + 1);
  }

  rollNeighbourInMap(from: Location): Location {
    for (;;) {
      const next = from.addDirection(this.rollDirection());
      if (next.map !== from.map) continue;
      if (from.map!.isInBounds(next.position.x, next.position.y)) return next;
    }
  }

  rollValidMoveInMap(actor: Actor, maxTries: number): MoveLocationResult {
    if (!actor) throw new Error("actor");

    for (let i = 0; i < maxTries; i++) {
      const nextLocation = this.rollNeighbourInMap(actor.location);
      if (this.isWalkableFor(actor, nextLocation.map!, nextLocation.position.x, nextLocation.position.y).ok) {
        return { ok: true, location: nextLocation };
      }
    }

    return { ok: false, location: actor.location };
  }

  rollValidMoveDirection(actor: Actor, maxTries: number): DirectionResult {
    if (!actor) throw new Error("actor");

    for (let i = 0; i < maxTries; i++) {
      const direction = this.rollDirection();
      const nextLocation = actor.location.addDirection(direction);
      if (nextLocation.map !== actor.location.map) continue;
      if (this.isWalkableForAt(actor, nextLocation).ok) return { ok: true, direction };
    }

    return { ok: false, direction: null };
  }

  rollValidBumpDirection(actor: Actor, maxTries: number): DirectionResult {
    if (!actor) throw new Error("actor");

    for (let i = 0; i < maxTries; i++) {
      const direction = this.rollDirection();
      const nextLocation = actor.location.addDirection(direction);
      if (nextLocation.map !== actor.location.map) continue;
      return { ok: true, direction };
    }

    return { ok: false, direction: null };
  }

  // ── Rules checking: Items ────────────────────────────────────────────────

  canActorGetItemFromContainer(actor: Actor, position: Point): RuleResult {
    if (!actor) throw new Error("actor");

    const map = actor.location.map!;

    // 1. Map object is not a container.
    const mapObj = map.getMapObjectAtPoint(position);
    if (!mapObj || !mapObj.isContainer) {
      return fail("object is not a container");
    }

    // 2. There is no items there.
    const invThere = map.getItemsAt(position);
    if (!invThere || invThere.isEmpty) {
      return fail("nothing to take there");
    }

    // 3. Actor cannot take the item.
    if (
      !actor.model.abilities.hasInventory ||
      !actor.model.abilities.canUseMapObjects ||
      actor.inventory === null ||
      !this.canActorGetItem(actor, invThere.topItem!).ok
    ) {
      return fail("cannot take an item");
    }

    return OK;
  }

  canActorGetItem(actor: Actor, it: Item): RuleResult {
    if (!actor) throw new Error("actor");
    if (!it) throw new Error("item");

    // 1. Actor cannot take items
    if (!actor.model.abilities.hasInventory || !actor.model.abilities.canUseMapObjects || !actor.inventory) {
      return fail("no inventory");
    }
    if (actor.inventory.isFull && !actor.inventory.canAddAtLeastOne(it)) {
      return fail("inventory is full");
    }
    if (it instanceof ItemTrap && it.isTriggered) {
      return fail("triggered trap");
    }

    return OK;
  }

  canActorEquipItem(actor: Actor, it: Item): RuleResult {
    if (!actor) throw new Error("actor");
    if (!it) throw new Error("item");

    // 1. Actor cant use items.
    if (!actor.model.abilities.canUseItems) {
      return fail("no ability to use items");
    }

    // 2. Item not equipable.
    if (!it.model.isEquipable) {
      return fail("this item cannot be equipped");
    }

    return OK;
  }

  canActorUnequipItem(actor: Actor, it: Item): RuleResult {
    if (!actor) throw new Error("actor");
    if (!it) throw new Error("item");

    // 1. Not equipped.
    if (!it.isEquipped) {
      return fail("not equipped");
    }

    // 2. Not in inventory.
    const inv = actor.inventory;
    if (!inv || !inv.contains(it)) {
      return fail("not in inventory");
    }

    return OK;
  }

  canActorDropItem(actor: Actor, it: Item): RuleResult {
    if (!actor) throw new Error("actor");
    if (!it) throw new Error("item");

    // 1. Equipped.
    if (it.isEquipped) {
      return fail("unequip first");
    }

    // 2. Not in inventory.
    const inv = actor.inventory;
    if (!inv || !inv.contains(it)) {
      return fail("not in inventory");
    }

    return OK;
  }

  canActorUseItem(actor: Actor, it: Item): RuleResult {
    if (!actor) throw new Error("actor");
    if (!it) throw new Error("item");

    // 1. Actor cant use items.
    if (!actor.model.abilities.canUseItems) {
      return fail("no ability to use items");
    }

    // 2. Actor cant use this specific kind of items.
    if (it instanceof ItemWeapon) {
      return fail("to use a weapon, equip it");
    }
    if (it instanceof ItemFood && !actor.model.abilities.hasToEat) {
      return fail("no ability to eat");
    }
    if (it instanceof ItemMedicine && actor.model.abilities.isUndead) {
      return fail("undeads cannot use medecine");
    }
    if (it instanceof ItemBarricadeMaterial) {
      return fail("to use material, build a barricade");
    }
    if (it instanceof ItemAmmo) {
      // 1. No compatible weapon equipped.
      const eqRanged = actor.getEquippedWeapon() as ItemRangedWeapon | null;
      if (!eqRanged || !(eqRanged instanceof ItemRangedWeapon) || eqRanged.ammoType !== it.ammoType) {
        return fail("no compatible ranged weapon equipped");
      }
      // 2. Weapon fully loaded.
      if (eqRanged.ammo >= eqRanged.rangedWeaponModel.maxAmmo) {
        return fail("weapon already fully loaded");
      }
    } else if (it instanceof ItemTrap) {
      if (!it.trapModel.useToActivate) {
        return fail("does not activate manually");
      }
    } else if (it instanceof ItemEntertainment) {
      if (!actor.model.abilities.isIntelligent) {
        return fail("not intelligent");
      }
      if (it.isBoringFor(actor)) {
        return fail("bored by this");
      }
    }

    // 4. Not in inventory.
    const inv = actor.inventory;
    if (!inv || !inv.contains(it)) {
      return fail("not in inventory");
    }

    return OK;
  }

  canActorEatFoodOnGround(actor: Actor, it: Item): RuleResult {
    if (!actor) throw new Error("actor");
    if (!it) throw new Error("item");

    // 1. Item not food.
    if (!(it instanceof ItemFood)) {
      return fail("not food");
    }

    // 2. Item not in actor tile.
    const stackHere = actor.location.map!.getItemsAt(actor.location.position);
    if (!stackHere || !stackHere.contains(it)) {
      return fail("item not here");
    }

    return OK;
  }

  canActorRechargeItemBattery(actor: Actor, it: Item): RuleResult {
    if (!actor) throw new Error("actor");
    if (!it) throw new Error("item");

    // 1. Actor cant use items.
    if (!actor.model.abilities.canUseItems) {
      return fail("no ability to use items");
    }

    // 2. Item not equipped.
    if (!it.isEquipped || !actor.inventory?.contains(it)) {
      return fail("item not equipped");
    }

    // 3. Not a battery powered item.
    if (!this.isItemBatteryPowered(it)) {
      return fail("not a battery powered item");
    }

    return OK;
  }

  isItemBatteryPowered(it: Item): boolean {
    if (!it) return false;
    return it instanceof ItemLight || it instanceof ItemTracker;
  }

  isItemBatteryFull(it: Item): boolean {
    if (!it) return true;
    if (it instanceof ItemLight && it.isFullyCharged) return true;
    if (it instanceof ItemTracker && it.isFullyCharged) return true;
    return false;
  }

  canActorGiveItemTo(actor: Actor, target: Actor, gift: Item): RuleResult {
    if (!actor) throw new Error("actor");
    if (!target) throw new Error("target");
    if (!gift) throw new Error("gift");

    // 1. Target is enemy.
    if (this.areEnemies(actor, target)) {
      return fail("enemy");
    }

    // 2. Item is equipped.
    if (gift.isEquipped) {
      return fail("equipped");
    }

    // 3. Target is sleeping.
    if (target.isSleeping) {
      return fail("sleeping");
    }

    // 4. Target can't receive item.
    const result = this.canActorGetItem(target, gift);
    if (!result.ok) return result;

    return OK;
  }

  canActorSprayOdorSuppressor(actor: Actor, suppressor: ItemSprayScent, sprayOn: Actor): RuleResult {
    if (!actor) throw new Error("actor");
    if (!suppressor) throw new Error("suppressor");
    if (!sprayOn) throw new Error("target");

    // 1. Actor cannot use items
    if (!actor.model.abilities.canUseItems) {
      return fail("cannot use items");
    }

    // 2. Not an odor suppressor
    if (suppressor.odor !== Odor.SUPPRESSOR) {
      return fail("not an odor suppressor");
    }

    // 2. Spray is not equiped by actor or has no spray left.
    if (suppressor.sprayQuantity <= 0) {
      return fail("no spray left");
    }
    if (!(suppressor.isEquipped && actor.inventory !== null && actor.inventory.contains(suppressor))) {
      return fail("spray not equipped");
    }

    // 3. SprayOn is not self or adjacent.
    if (sprayOn !== actor) {
      if (
        !(
          actor.location.map === sprayOn.location.map &&
          this.isAdjacent(actor.location.position, sprayOn.location.position)
        )
      ) {
        return fail("not adjacent");
      }
    }

    return OK;
  }

  // ── Rules checking: Movement/Melee ───────────────────────────────────────

  canActorRun(actor: Actor): RuleResult {
    if (!actor) throw new Error("actor");

    // 1. Has not CanRun ability.
    if (!actor.model.abilities.canRun) {
      return fail("no ability to run");
    }

    // 2. Stamina below min level.
    if (actor.staminaPoints < Rules.STAMINA_MIN_FOR_ACTIVITY) {
      return fail("not enough stamina to run");
    }

    return OK;
  }

  isActorTired(actor: Actor): boolean {
    if (!actor) throw new Error("actor");
    return actor.model.abilities.canTire && actor.staminaPoints < Rules.STAMINA_MIN_FOR_ACTIVITY;
  }

  canActorMeleeAttack(actor: Actor, target: Actor): RuleResult {
    if (!actor) throw new Error("actor");
    if (!target) throw new Error("target");

    // 1. Target not adjacent in map or not sharing an exit.
    if (actor.location.map === target.location.map) {
      if (!this.isAdjacent(actor.location.position, target.location.position)) {
        return fail("not adjacent");
      }
    } else {
      // check there is an exit at both positions.
      const fromExit = actor.location.map!.getExitAt(actor.location.position);
      if (!fromExit) {
        return fail("not reachable");
      }
      const toExit = target.location.map!.getExitAt(target.location.position);
      if (!toExit) {
        return fail("not reachable");
      }
      // check the target stands on the exit.
      if (fromExit.toMap !== target.location.map || !fromExit.toPosition.equals(target.location.position)) {
        return fail("not reachable");
      }
    }

    // 2. Stamina below min level.
    if (actor.staminaPoints < Rules.STAMINA_MIN_FOR_ACTIVITY) {
      return fail("not enough stamina to attack");
    }

    // 3. Target is dead (doh!).
    if (target.isDead) {
      return fail("already dead!");
    }

    return OK;
  }

  hasActorJumpAbility(actor: Actor): boolean {
    return (
      actor.model.abilities.canJump ||
      actor.sheet.skillTable.getSkillLevel(SkillID.AGILE) > 0 ||
      actor.sheet.skillTable.getSkillLevel(SkillID.Z_AGILE) > 0
    );
  }

  isWalkableFor(actor: Actor, map: GameMap, x: number, y: number): RuleResult {
    if (!map) throw new Error("map");
    if (!actor) throw new Error("actor");

    // 1. Out of map.
    if (!map.isInBounds(x, y)) {
      return fail("out of map");
    }

    // 2. Tile not walkable.
    const tile = map.getTileAt(x, y);
    if (!tile || !tile.model.isWalkable) {
      return fail("blocked");
    }

    // 3. Map object not passable.
    const mapObj = map.getMapObjectAt(x, y);
    if (mapObj) {
      if (!mapObj.isWalkable) {
        // jump?
        if (mapObj.isJumpable) {
          if (!this.hasActorJumpAbility(actor)) {
            return fail("cannot jump");
          }
          if (actor.staminaPoints < Rules.STAMINA_COST_JUMP) {
            return fail("not enough stamina to jump");
          }
        } else if (actor.model.abilities.isSmall) {
          // small actor blocked only by closed doors.
          if (mapObj instanceof DoorWindow && mapObj.isClosed) {
            return fail("cannot slip through closed door");
          }
        } else {
          return fail("blocked by object");
        }
      }
    }

    // 4. An actor already there.
    if (map.getActorAt(x, y)) {
      return fail("someone is there");
    }

    // 5. Dragging a corpse when tired.
    if (actor.draggedCorpse !== null && this.isActorTired(actor)) {
      return fail("dragging a corpse when tired");
    }

    return OK;
  }

  isWalkableForAt(actor: Actor, location: Location): RuleResult {
    return this.isWalkableFor(actor, location.map!, location.position.x, location.position.y);
  }

  isBumpableFor(actor: Actor, game: Game, map: GameMap, x: number, y: number): BumpResult {
    if (!map) throw new Error("map");
    if (!actor) throw new Error("actor");

    ///////////////////////////////
    // Out of map : leave district?
    ///////////////////////////////
    if (!map.isInBounds(x, y)) {
      const leave = this.canActorLeaveMap(actor);
      if (leave.ok) {
        return { action: new ActionLeaveMap(actor, game, new Point(x, y)), reason: "" };
      }
      return noAction(leave.reason);
    }

    const to = new Point(x, y);

    // 1. Move?
    const moveAction = new ActionMoveStep(actor, game, to);
    if (moveAction.isLegal()) {
      return { action: moveAction, reason: "" };
    }

    // 2. Actor interact: fight/chat/(AI:switch place)
    const targetActor = map.getActorAtPoint(to);
    if (targetActor) {
      // attacking?
      if (this.areEnemies(actor, targetActor)) {
        const attack = this.canActorMeleeAttack(actor, targetActor);
        return attack.ok
          ? { action: new ActionMeleeAttack(actor, game, targetActor), reason: "" }
          : noAction(attack.reason);
      }

      // AI: switching place (alpha10.1 handle bot like it was an AI)
      if ((!actor.isPlayer || actor.isBotPlayer) && !targetActor.isPlayer) {
        const swap = this.canActorSwitchPlaceWith(actor, targetActor);
        if (swap.ok) return { action: new ActionSwitchPlace(actor, game, targetActor), reason: "" };
      }

      // chatting?
      const chat = this.canActorChatWith(actor, targetActor);
      if (chat.ok) return { action: new ActionChat(actor, game, targetActor), reason: "" };

      return noAction(chat.reason);
    }

    // 3. Object interact?
    const mapObj = map.getMapObjectAtPoint(to);
    if (mapObj) {
      // 3.1 Door?
      if (mapObj instanceof DoorWindow) {
        const door = mapObj;
        if (door.isClosed) {
          // closed: open/bash/barricade
          const openable = this.isOpenableFor(actor, door);
          if (openable.ok) return { action: new ActionOpenDoor(actor, game, door), reason: "" };
          const bashable = this.isBashableFor(actor, door);
          if (bashable.ok) return { action: new ActionBashDoor(actor, game, door), reason: "" };
          return noAction(bashable.reason);
        }
        if (door.barricadePoints > 0) {
          // barricaded: bash
          const bashable = this.isBashableFor(actor, door);
          if (bashable.ok) return { action: new ActionBashDoor(actor, game, door), reason: "" };
          return noAction("cannot bash the barricade");
        }
      }

      // 3.2 Container?
      const container = this.canActorGetItemFromContainer(actor, to);
      if (container.ok) return { action: new ActionGetFromContainer(actor, game, to), reason: "" };

      // 3.3 Break?
      const breakable = this.isBreakableFor(actor, mapObj);
      if (breakable.ok) return { action: new ActionBreak(actor, game, mapObj), reason: "" };

      // 3.4 Power Generator?
      if (mapObj instanceof PowerGenerator) {
        const powGen = mapObj;
        // Recharge battery powered item?
        if (powGen.isOn) {
          const leftItem = actor.getEquippedItem(DollPart.LEFT_HAND);
          if (leftItem && this.canActorRechargeItemBattery(actor, leftItem).ok) {
            return { action: new ActionRechargeItemBattery(actor, game, leftItem), reason: "" };
          }
          const rightItem = actor.getEquippedItem(DollPart.RIGHT_HAND);
          if (rightItem && this.canActorRechargeItemBattery(actor, rightItem).ok) {
            return { action: new ActionRechargeItemBattery(actor, game, rightItem), reason: "" };
          }
        }

        // Switch?
        const switchable = this.isSwitchableFor(actor, powGen);
        if (switchable.ok) return { action: new ActionSwitchPowerGenerator(actor, game, powGen), reason: "" };

        // Can do nothing by bumping.
        return noAction(switchable.reason);
      }

      return noAction(breakable.reason);
    }

    // 4. No action possible.
    return NO_ACTION;
  }

  isBumpableForAt(actor: Actor, game: Game, location: Location): BumpResult {
    return this.isBumpableFor(actor, game, location.map!, location.position.x, location.position.y);
  }

  // ── Rules checking: Switching Map Objects ────────────────────────────────

  isSwitchableFor(actor: Actor, powGen: PowerGenerator): RuleResult {
    if (!actor) throw new Error("actor");
    if (!powGen) throw new Error("powGen");

    // 1. Actor has ability.
    if (!actor.model.abilities.canUseMapObjects) {
      return fail("cannot use map objects");
    }

    // 2. Is not sleeping.
    if (actor.isSleeping) {
      return fail("is sleeping");
    }

    return OK;
  }

  // ── Rules checking: Leaving maps ─────────────────────────────────────────

  canActorLeaveMap(actor: Actor): RuleResult {
    if (!actor) throw new Error("actor");

    // 1. Player and not bot (alpha10.1)
    if (!actor.isPlayer || actor.isBotPlayer) {
      return fail("can't leave maps");
    }

    return OK;
  }

  // ── Rules checking: Using exits ──────────────────────────────────────────

  canActorUseExit(actor: Actor, exitPoint: Point): RuleResult {
    if (!actor) throw new Error("actor");

    // 1. No exit there.
    if (!actor.location.map!.getExitAt(exitPoint)) {
      return fail("no exit there");
    }

    // 2. AI: can't use AI exits. (alpha10.1 handle bots)
    if ((!actor.isPlayer || actor.isBotPlayer) && !actor.model.abilities.aiCanUseAIExits) {
      return fail("this AI can't use exits");
    }

    // 3. Is sleeping.
    if (actor.isSleeping) {
      return fail("is sleeping");
    }

    return OK;
  }

  // ── Rules checking: Chatting & Trading ───────────────────────────────────

  canActorChatWith(speaker: Actor, target: Actor): RuleResult {
    if (!speaker) throw new Error("speaker");
    if (!target) throw new Error("target");

    // 1. One of them can't talk.
    if (!speaker.model.abilities.canTalk) {
      return fail("can't talk");
    }
    if (!target.model.abilities.canTalk) {
      return fail(`${target.theName} can't talk`);
    }

    // 2. One of them is sleeping.
    if (speaker.isSleeping) {
      return fail("sleeping");
    }
    if (target.isSleeping) {
      return fail(`${target.theName} is sleeping`);
    }

    return OK;
  }

  canActorInitiateTradeWith(speaker: Actor, target: Actor): RuleResult {
    if (!speaker) throw new Error("speaker");
    if (!target) throw new Error("target");

    // 1. Target is player.
    if (target.isPlayer) {
      return fail("target is player");
    }

    // 2. Actors are not traders and not leader->follower relationship.
    if (!speaker.model.abilities.canTrade && target.leader !== speaker) {
      return fail("can't trade");
    }
    if (!target.model.abilities.canTrade && target.leader !== speaker) {
      return fail("target can't trade");
    }

    if (this.areEnemies(speaker, target)) {
      return fail("is an enemy");
    }

    // 3. Target is sleeping.
    if (target.isSleeping) {
      return fail("is sleeping");
    }

    // 4. No item to trade.
    if (!speaker.inventory || speaker.inventory.isEmpty) {
      return fail("nothing to offer");
    }
    if (!target.inventory || target.inventory.isEmpty) {
      return fail("has nothing to trade");
    }

    return OK;
  }

  canActorShout(speaker: Actor): RuleResult {
    if (!speaker) throw new Error("speaker");

    // 1. Actor is sleeping.
    if (speaker.isSleeping) {
      return fail("sleeping");
    }

    // 2. Actor can't talk
    if (!speaker.model.abilities.canTalk) {
      return fail("can't talk");
    }

    return OK;
  }

  // ── Rules checking: Doors ────────────────────────────────────────────────

  isOpenableFor(actor: Actor, door: DoorWindow): RuleResult {
    if (!actor) throw new Error("actor");
    if (!door) throw new Error("door");

    // 1. Actor cannot use map objects.
    if (!actor.model.abilities.canUseMapObjects) {
      return fail("no ability to open");
    }

    // 2. Door is not closed nor barricaded.
    if (!door.isClosed || door.barricadePoints > 0) {
      return fail("not closed nor barricaded");
    }

    return OK;
  }

  isClosableFor(actor: Actor, door: DoorWindow): RuleResult {
    if (!actor) throw new Error("actor");
    if (!door) throw new Error("door");

    // 1. Actor cannot use map objects.
    if (!actor.model.abilities.canUseMapObjects) {
      return fail("can't use objects");
    }

    // 2. Door is not open.
    if (!door.isOpen) {
      return fail("not open");
    }

    // 3. Another actor here.
    if (door.location.map!.getActorAtPoint(door.location.position)) {
      return fail("someone is there");
    }

    return OK;
  }

  canActorBarricadeDoor(actor: Actor, door: DoorWindow): RuleResult {
    if (!actor) throw new Error("actor");
    if (!door) throw new Error("door");

    // 1. Actor cannot barricade doors.
    if (!actor.model.abilities.canBarricade) {
      return fail("no ability to barricade");
    }

    // 2. Door is not closed or broken.
    if (door.state !== DoorWindow.STATE_CLOSED && door.state !== DoorWindow.STATE_BROKEN) {
      return fail("not closed or broken");
    }

    // 3. Barricading limit reached.
    if (door.barricadePoints >= Rules.BARRICADING_MAX) {
      return fail("barricade limit reached");
    }

    // 4. An actor is there.
    if (door.location.map!.getActorAtPoint(door.location.position)) {
      return fail("someone is there");
    }

    // 5. No barricading material.
    if (!actor.inventory || actor.inventory.isEmpty) {
      return fail("no items");
    }
    if (!actor.inventory.hasItemMatching((it) => it instanceof ItemBarricadeMaterial)) {
      return fail("no barricading material");
    }

    return OK;
  }

  // ── Rules checking: Bashing doors & Breaking stuff ───────────────────────

  isBashableFor(actor: Actor, door: DoorWindow): RuleResult {
    if (!actor) throw new Error("actor");
    if (!door) throw new Error("door");

    // 1. Actor cannot bash doors.
    if (!actor.model.abilities.canBashDoors) {
      return fail("can't bash doors");
    }

    // 2. Actor is tired.
    if (this.isActorTired(actor)) {
      return fail("tired");
    }

    // 3. Door is not breakable.
    if (door.breakState !== MapObjectBreak.BREAKABLE && !door.isBarricaded) {
      return fail("can't break this object");
    }

    return OK;
  }

  isBreakableFor(actor: Actor, mapObj: MapObject): RuleResult {
    if (!actor) throw new Error("actor");
    if (!mapObj) throw new Error("mapObj");

    // 1. Actor cannot break.
    if (!actor.model.abilities.canBreakObjects) {
      return fail("cannot break objects");
    }

    // 2. Actor is tired.
    if (this.isActorTired(actor)) {
      return fail("tired");
    }

    // 3. Map object is not breakable.
    const door = mapObj instanceof DoorWindow ? mapObj : null;
    const isBarricadedDoor = door !== null && door.isBarricaded;
    if (mapObj.breakState !== MapObjectBreak.BREAKABLE && !isBarricadedDoor) {
      return fail("can't break this object");
    }

    // 4. Another actor there.
    if (mapObj.location.map!.getActorAtPoint(mapObj.location.position)) {
      return fail("someone is there");
    }

    return OK;
  }

  // ── Rules checking: Pushing/Pulling objects & Shoving actors ─────────────

  hasActorPushAbility(actor: Actor): boolean {
    return (
      actor.model.abilities.canPush ||
      actor.sheet.skillTable.getSkillLevel(SkillID.STRONG) > 0 ||
      actor.sheet.skillTable.getSkillLevel(SkillID.Z_STRONG) > 0
    );
  }

  canActorPush(actor: Actor, mapObj: MapObject): RuleResult {
    if (!actor) throw new Error("actor");
    if (!mapObj) throw new Error("mapObj");

    // 1. Actor cannot push/pull.
    if (!this.hasActorPushAbility(actor)) {
      return fail("cannot push objects");
    }

    // 2. Actor is tired.
    if (this.isActorTired(actor)) {
      return fail("tired");
    }

    // 3. Map obj is not movable.
    if (!mapObj.isMovable) {
      return fail("cannot be moved");
    }

    // 4. Another actor there.
    if (mapObj.location.map!.getActorAtPoint(mapObj.location.position)) {
      return fail("someone is there");
    }

    // 5. Map obj is on fire.
    if (mapObj.isOnFire) {
      return fail("on fire");
    }

    // 6. Actor is dragging a corpse. (alpha10)
    if (actor.draggedCorpse !== null) {
      return fail("dragging a corpse");
    }

    return OK;
  }

  canPushObjectTo(mapObj: MapObject, toPos: Point): RuleResult {
    if (!mapObj) throw new Error("mapObj");

    const map = mapObj.location.map!;

    // 1. Out of bounds.
    if (!map.isInBoundsPoint(toPos)) {
      return fail("out of map");
    }

    // 2. Not walkable.
    const tile = map.getTileAt(toPos.x, toPos.y);
    if (!tile || !tile.model.isWalkable) {
      return fail("blocked by an obstacle");
    }

    // 3. Another object there.
    if (map.getMapObjectAtPoint(toPos)) {
      return fail("blocked by an object");
    }

    // 4. An actor there.
    if (map.getActorAtPoint(toPos)) {
      return fail("blocked by someone");
    }

    return OK;
  }

  canPullObject(actor: Actor, mapObj: MapObject, moveToPos: Point): RuleResult {
    // 1. Actor cannot push this object.
    const pushed = this.canActorPush(actor, mapObj);
    if (!pushed.ok) return pushed;

    // 2. Another object already there. eg: actor standing on a bed.
    const otherMobj = actor.location.map!.getMapObjectAtPoint(actor.location.position);
    if (otherMobj) {
      return fail(`${otherMobj.theName} is blocking`);
    }

    // 3. Actor cannot walk to pos.
    const walkable = this.isWalkableForAt(actor, new Location(actor.location.map, moveToPos));
    if (!walkable.ok) return walkable;

    return OK;
  }

  canPullActor(actor: Actor, other: Actor, moveToPos: Point): RuleResult {
    // 1. Actor cannot shove.
    const shoved = this.canActorShove(actor, other);
    if (!shoved.ok) return shoved;

    // 2. Actor cannot walk to pos.
    const walkable = this.isWalkableForAt(actor, new Location(actor.location.map, moveToPos));
    if (!walkable.ok) return walkable;

    return OK;
  }

  canActorShove(actor: Actor, other: Actor): RuleResult {
    if (!actor) throw new Error("actor");
    if (!other) throw new Error("other");

    // 1. Actor cannot push/pull.
    if (!this.hasActorPushAbility(actor)) {
      return fail("cannot shove people");
    }

    // 2. Actor is tired.
    if (this.isActorTired(actor)) {
      return fail("tired");
    }

    // 3. Actor is dragging corpse. (alpha10)
    if (actor.draggedCorpse !== null) {
      return fail("dragging a corpse");
    }

    return OK;
  }

  canShoveActorTo(actor: Actor, toPos: Point): RuleResult {
    if (!actor) throw new Error("actor");

    const map = actor.location.map!;

    // 1. Out of bounds.
    if (!map.isInBoundsPoint(toPos)) {
      return fail("out of map");
    }

    // 2. Not walkable.
    const tile = map.getTileAt(toPos.x, toPos.y);
    if (!tile || !tile.model.isWalkable) {
      return fail("blocked");
    }

    // 3. Unwalkable object.
    const obj = map.getMapObjectAtPoint(toPos);
    if (obj && !obj.isWalkable) {
      return fail("blocked by an object");
    }

    // 4. An actor there.
    if (map.getActorAtPoint(toPos)) {
      return fail("blocked by someone");
    }

    // 5. Actor is dragging corpse. (alpha10)
    if (actor.draggedCorpse !== null) {
      return fail("dragging a corpse");
    }

    return OK;
  }

  // ── Rules checking: Targeting, Firing and Throwing ───────────────────────

  /** List enemies in fov, sorted by distance (closest first). */
  getEnemiesInFov(actor: Actor, fov: ReadonlySet<string>): Actor[] {
    if (!actor) throw new Error("actor");
    if (!fov) throw new Error("fov");

    const list: Actor[] = [];
    const map = actor.location.map!;

    for (const key of fov) {
      const [x, y] = key.split(",").map(Number);
      const other = map.getActorAt(x, y);
      if (!other) continue;
      if (other === actor) continue;
      if (!this.areEnemies(actor, other)) continue;
      list.push(other);
    }

    list.sort((a, b) => {
      const dA = this.stdDistance(a.location.position, actor.location.position);
      const dB = this.stdDistance(b.location.position, actor.location.position);
      return dA < dB ? -1 : dA > dB ? 1 : 0;
    });

    return list;
  }

  canActorFireAt(actor: Actor, target: Actor, lof: Point[] | null = null): RuleResult {
    if (!actor) throw new Error("actor");
    if (!target) throw new Error("target");

    if (lof) lof.length = 0;

    // 1. No ranged weapon or out of range.
    const rangedWeapon = actor.getEquippedWeapon();
    if (!(rangedWeapon instanceof ItemRangedWeapon)) {
      return fail("no ranged weapon equipped");
    }
    if (actor.currentRangedAttack.range < this.gridDistance(actor.location.position, target.location.position)) {
      return fail("out of range");
    }

    // 2. No ammo.
    if (rangedWeapon.ammo <= 0) {
      return fail("no ammo left");
    }

    // 3. No LoF.
    if (
      !LOS.canTraceFireLine(
        actor.location.map!,
        actor.location.position,
        target.location.position,
        actor.currentRangedAttack.range,
        lof
      )
    ) {
      return fail("no line of fire");
    }

    // 4. Target is dead (doh!).
    if (target.isDead) {
      return fail("already dead!");
    }

    return OK;
  }

  canActorThrowTo(actor: Actor, pos: Point, lof: Point[] | null = null): RuleResult {
    if (!actor) throw new Error("actor");

    if (lof) lof.length = 0;

    // 1. No throwable item or out of range.
    const equipped = actor.getEquippedWeapon();
    const unprimedGrenade = equipped instanceof ItemGrenade ? equipped : null;
    const primedGrenade = equipped instanceof ItemGrenadePrimed ? equipped : null;
    if (!unprimedGrenade && !primedGrenade) {
      return fail("no grenade equiped");
    }

    let model: ItemGrenadeModel;
    if (unprimedGrenade) {
      model = unprimedGrenade.model as ItemGrenadeModel;
    } else {
      model = (primedGrenade!.model as ItemGrenadePrimedModel).grenadeModel;
    }
    const maxThrowDist = this.actorMaxThrowRange(actor, model.maxThrowDistance);
    if (this.gridDistance(actor.location.position, pos) > maxThrowDist) {
      return fail("out of throwing range");
    }

    // 2. No LoT.
    if (!LOS.canTraceThrowLine(actor.location.map!, actor.location.position, pos, maxThrowDist, lof)) {
      return fail("no line of throwing");
    }

    return OK;
  }

  // ── Rules checking: Hunger/Rot & Sleep & Sanity ──────────────────────────

  isActorHungry(a: Actor): boolean {
    return a.model.abilities.hasToEat && a.foodPoints <= Rules.FOOD_HUNGRY_LEVEL;
  }

  isActorStarving(a: Actor): boolean {
    return a.model.abilities.hasToEat && a.foodPoints <= 0;
  }

  isRottingActorHungry(a: Actor): boolean {
    return a.model.abilities.isRotting && a.foodPoints <= Rules.ROT_HUNGRY_LEVEL;
  }

  isRottingActorStarving(a: Actor): boolean {
    return a.model.abilities.isRotting && a.foodPoints <= 0;
  }

  isFoodStillFresh(food: ItemFood, turnCounter: number): boolean {
    if (!food.isPerishable) return true;
    return turnCounter < food.bestBefore!.turnCounter;
  }

  isFoodExpired(food: ItemFood, turnCounter: number): boolean {
    return (
      food.isPerishable &&
      turnCounter >= food.bestBefore!.turnCounter &&
      turnCounter < 2 * food.bestBefore!.turnCounter
    );
  }

  isFoodSpoiled(food: ItemFood, turnCounter: number): boolean {
    return food.isPerishable && turnCounter >= 2 * food.bestBefore!.turnCounter;
  }

  foodItemNutrition(food: ItemFood, turnCounter: number): number {
    if (this.isFoodStillFresh(food, turnCounter)) return food.nutrition;
    if (this.isFoodExpired(food, turnCounter)) return (2 * food.nutrition) / 3;
    return food.nutrition / 3;
  }

  isActorSleepy(a: Actor): boolean {
    return a.model.abilities.hasToSleep && a.sleepPoints <= Rules.SLEEP_SLEEPY_LEVEL;
  }

  isActorExhausted(a: Actor): boolean {
    return a.model.abilities.hasToSleep && a.sleepPoints <= 0;
  }

  sleepToHoursUntilSleepy(sleep: number, isNight: boolean): number {
    let left = sleep - Rules.SLEEP_SLEEPY_LEVEL;
    if (isNight) left = Math.floor(left / 2);
    if (left <= 0) return 0;
    return Math.floor(left / WorldTime.TURNS_PER_HOUR);
  }

  isAlmostSleepy(actor: Actor): boolean {
    if (!actor.model.abilities.hasToSleep) return false;
    return this.sleepToHoursUntilSleepy(actor.sleepPoints, actor.location.map!.localTime.isNight) <= 3;
  }

  canActorSleep(actor: Actor): RuleResult {
    if (!actor) throw new Error("actor");

    // 1. Already sleeping.
    if (actor.isSleeping) {
      return fail("already sleeping");
    }

    // 2. Has not to sleep.
    if (!actor.model.abilities.hasToSleep) {
      return fail("no ability to sleep");
    }

    // 3. Is hungry or worse.
    if (this.isActorHungry(actor) || this.isActorStarving(actor)) {
      return fail("hungry");
    }

    // 4. No need to sleep.
    if (actor.sleepPoints >= this.actorMaxSleep(actor) - WorldTime.TURNS_PER_HOUR) {
      return fail("not sleepy at all");
    }

    return OK;
  }

  isOnCouch(actor: Actor): boolean {
    if (!actor) throw new Error("actor");

    const mapObj = actor.location.map!.getMapObjectAtPoint(actor.location.position);
    if (!mapObj) return false;
    return mapObj.isCouch;
  }

  isActorDisturbed(a: Actor): boolean {
    return a.model.abilities.hasSanity && a.sanity <= this.actorDisturbedLevel(a);
  }

  isActorInsane(a: Actor): boolean {
    return a.model.abilities.hasSanity && a.sanity <= 0;
  }

  sanityToHoursUntilUnstable(a: Actor): number {
    const left = a.sanity - this.actorDisturbedLevel(a);
    if (left <= 0) return 0;
    return Math.floor(left / WorldTime.TURNS_PER_HOUR);
  }

  // ── Rules checking: Leading ──────────────────────────────────────────────

  canActorTakeLead(actor: Actor, target: Actor): RuleResult {
    if (!actor) throw new Error("actor");
    if (!target) throw new Error("target");

    // 1. Target is undead or an enemy.
    if (target.model.abilities.isUndead) {
      return fail("undead");
    }
    if (this.areEnemies(actor, target)) {
      return fail("enemy");
    }

    // 2. Target is sleeping.
    if (target.isSleeping) {
      return fail("sleeping");
    }

    // 3. Target has already a leader and can't steal the follower. (alpha10.1)
    if (target.hasLeader) {
      const actorCharism = actor.sheet.skillTable.getSkillLevel(SkillID.CHARISMATIC);
      const leaderCharism = target.leader!.sheet.skillTable.getSkillLevel(SkillID.CHARISMATIC);
      if (actorCharism <= leaderCharism) {
        return fail("has already a leader at least as charismatic as you");
      }
    }

    // 4. Target is a leader.
    if (target.countFollowers > 0) {
      return fail("is a leader");
    }

    // 5. Actor has reached max followers.
    const maxFollowers = this.actorMaxFollowers(actor);
    if (maxFollowers === 0) {
      return fail("can't lead");
    }
    if (actor.countFollowers >= maxFollowers) {
      return fail("too many followers");
    }

    // 6. Target is player!
    if (target.isPlayer) {
      return fail("is player");
    }

    // 7. Faction restrictions.
    if (actor.faction !== target.faction && target.faction.leadOnlyBySameFaction) {
      return fail(`${actor.faction.name} can't lead ${target.faction.name}`);
    }

    return OK;
  }

  canActorCancelLead(actor: Actor, target: Actor): RuleResult {
    if (!actor) throw new Error("actor");
    if (!target) throw new Error("target");

    // 1. Target not a actor follower.
    if (target.leader !== actor) {
      return fail("not your follower");
    }

    // 2. Target is sleeping.
    if (target.isSleeping) {
      return fail("sleeping");
    }

    return OK;
  }

  canActorSwitchPlaceWith(actor: Actor, target: Actor): RuleResult {
    if (!actor) throw new Error("actor");
    if (!target) throw new Error("target");

    // 1. Target not a actor follower.
    if (target.leader !== actor) {
      return fail("not your follower");
    }

    // 2. Target is sleeping.
    if (target.isSleeping) {
      return fail("sleeping");
    }

    return OK;
  }

  // ── Rules checking: Trust ────────────────────────────────────────────────

  isActorTrustingLeader(actor: Actor): boolean {
    if (!actor) throw new Error("actor");
    if (!actor.hasLeader) return false;
    return actor.trustInLeader >= Rules.TRUST_TRUSTING_THRESHOLD;
  }

  hasActorBondWith(actor: Actor, target: Actor): boolean {
    if (actor.leader === target) return actor.trustInLeader >= Rules.TRUST_BOND_THRESHOLD;
    if (target.leader === actor) return target.trustInLeader >= Rules.TRUST_BOND_THRESHOLD;
    return false;
  }

  // ── Rules checking: Building & Repairing ─────────────────────────────────

  countBarricadingMaterial(actor: Actor): number {
    if (!actor.inventory || actor.inventory.isEmpty) return 0;

    let count = 0;
    for (const it of actor.inventory.items) {
      if (it instanceof ItemBarricadeMaterial) count += it.quantity;
    }
    return count;
  }

  canActorBuildFortification(actor: Actor, pos: Point, isLarge: boolean): RuleResult {
    if (!actor) throw new Error("actor");

    // 1. No carpentry skill.
    if (actor.sheet.skillTable.getSkillLevel(SkillID.CARPENTRY) === 0) {
      return fail("no skill in carpentry");
    }

    // 2. Not walkable.
    const map = actor.location.map!;
    const tile = map.getTileAt(pos.x, pos.y);
    if (!tile || !tile.model.isWalkable) {
      return fail("cannot build on walls");
    }

    // 3. Not enough material.
    const need = this.actorBarricadingMaterialNeedForFortification(actor, isLarge);
    if (this.countBarricadingMaterial(actor) < need) {
      return fail(`not enough barricading material, need ${need}.`);
    }

    // 4. Tile occupied.
    if (map.getMapObjectAtPoint(pos) || map.getActorAtPoint(pos)) {
      return fail("blocked");
    }

    return OK;
  }

  canActorRepairFortification(actor: Actor, _fort: Fortification): RuleResult {
    if (!actor) throw new Error("actor");

    // 1. Cannot use map objects.
    if (!actor.model.abilities.canUseMapObjects) {
      return fail("cannot use map objects");
    }

    // 2. No material.
    const material = this.countBarricadingMaterial(actor);
    if (material <= 0) {
      return fail("no barricading material");
    }

    return OK;
  }

  // ── Rules checking: Corpses ──────────────────────────────────────────────

  actorDamageVsCorpses(a: Actor): number {
    // base = melee HALVED.
    let dmg = Math.floor(a.currentMeleeAttack.damageValue / 2);

    // Necrology.
    dmg += Rules.SKILL_NECROLOGY_CORPSE_BONUS * a.sheet.skillTable.getSkillLevel(SkillID.NECROLOGY);

    return dmg;
  }

  canActorEatCorpse(actor: Actor, corpse: Corpse): RuleResult {
    if (!actor) throw new Error("actor");
    if (!corpse) throw new Error("corpse");

    // 1. Actor is not undead or a starving living.
    if (!actor.model.abilities.isUndead) {
      if (!this.isActorStarving(actor) && !this.isActorInsane(actor)) {
        return fail("not starving or insane");
      }
    }

    return OK;
  }

  canActorButcherCorpse(actor: Actor, corpse: Corpse): RuleResult {
    if (!actor) throw new Error("actor");
    if (!corpse) throw new Error("corpse");

    // 1. Actor tired.
    if (this.isActorTired(actor)) {
      return fail("tired");
    }
    // 2. Corpse not in same tile as actor.
    if (!corpse.position.equals(actor.location.position) || !actor.location.map!.hasCorpse(corpse)) {
      return fail("not in same location");
    }

    return OK;
  }

  canActorStartDragCorpse(actor: Actor, corpse: Corpse): RuleResult {
    if (!actor) throw new Error("actor");
    if (!corpse) throw new Error("corpse");

    // 1. Corpse already dragged.
    if (corpse.isDragged) {
      return fail("corpse is already being dragged");
    }
    // 2. Actor tired.
    if (this.isActorTired(actor)) {
      return fail("tired");
    }
    // 3. Corpse not in same tile as actor.
    if (!corpse.position.equals(actor.location.position) || !actor.location.map!.hasCorpse(corpse)) {
      return fail("not in same location");
    }
    // 4. Actor already dragging a corpse.
    if (actor.draggedCorpse !== null) {
      return fail("already dragging a corpse");
    }

    return OK;
  }

  canActorStopDragCorpse(actor: Actor, corpse: Corpse): RuleResult {
    if (!actor) throw new Error("actor");
    if (!corpse) throw new Error("corpse");

    // Can't if Corpse not being dragged by actor.
    if (corpse.draggedBy !== actor) {
      return fail("not dragging this corpse");
    }

    return OK;
  }

  canActorReviveCorpse(actor: Actor, corpse: Corpse): RuleResult {
    if (!actor) throw new Error("actor");
    if (!corpse) throw new Error("corpse");

    // 1. No medic skill.
    if (actor.sheet.skillTable.getSkillLevel(SkillID.MEDIC) === 0) {
      return fail("lack medic skill");
    }

    // 2. Not on same tile.
    if (!corpse.position.equals(actor.location.position)) {
      return fail("not there");
    }

    // 3. Corpse not fresh.
    if (this.corpseRotLevel(corpse) > 0) {
      return fail("corpse not fresh");
    }

    // 4. No medikit.
    if (!actor.inventory?.hasItemMatching((it) => it.model.id === ItemID.MEDICINE_MEDIKIT)) {
      return fail("no medikit");
    }

    return OK;
  }

  // ── Distances ────────────────────────────────────────────────────────────

  isAdjacent(a: Location, b: Location): boolean;
  isAdjacent(pA: Point, pB: Point): boolean;
  isAdjacent(a: Location | Point, b: Location | Point): boolean {
    if (a instanceof Location && b instanceof Location) {
      if (a.map !== b.map) return false;
      return this.isAdjacent(a.position, b.position);
    }
    const pA = a as Point;
    const pB = b as Point;
    return Math.abs(pA.x - pB.x) < 2 && Math.abs(pA.y - pB.y) < 2;
  }

  gridDistance(pA: Point, bX: number, bY: number): number;
  gridDistance(pA: Point, pB: Point): number;
  gridDistance(pA: Point, bXOrPb: number | Point, bY?: number): number {
    if (typeof bXOrPb === "number") {
      return Math.max(Math.abs(pA.x - bXOrPb), Math.abs(pA.y - bY!));
    }
    return Math.max(Math.abs(pA.x - bXOrPb.x), Math.abs(pA.y - bXOrPb.y));
  }

  /** Standard distance formula: square root of summed squares. */
  stdDistance(from: Point, to: Point): number {
    const dX = to.x - from.x;
    const dY = to.y - from.y;
    return Math.sqrt(dX * dX + dY * dY);
  }

  stdDistanceOf(v: Point): number {
    return Math.sqrt(v.x * v.x + v.y * v.y);
  }

  /** Distance to use in LOS computing – a smooth circle FOV. */
  losDistance(from: Point, to: Point): number {
    const dX = to.x - from.x;
    const dY = to.y - from.y;
    const square = dX * dX + dY * dY;
    return Math.sqrt(0.75 * square);
  }

  // ── Actor turn ordering ──────────────────────────────────────────────────

  getNextActorToAct(map: GameMap | null, _turnCounter: number): Actor | null {
    if (!map) return null;

    const n = map.countActors;
    for (let i = map.checkNextActorIndex; i < n; i++) {
      const a = map.getActor(i);
      if (a.actionPoints > 0 && !a.isSleeping) {
        map.checkNextActorIndex = i;
        return a;
      }
    }

    return null;
  }

  isActorBeforeInMapList(map: GameMap, actor: Actor, other: Actor): boolean {
    for (const a of map.actors) {
      if (a === actor) return true;
      if (a === other) return false;
    }
    // by default, assume yes.
    return true;
  }

  canActorActThisTurn(actor: Actor | null): boolean {
    if (!actor) return false;
    return actor.actionPoints > 0;
  }

  canActorActNextTurn(actor: Actor | null): boolean {
    if (!actor) return false;
    return actor.actionPoints + this.actorSpeed(actor) > 0;
  }

  /** If actor spends a turn now, will actor get the chance to act before other? */
  willActorActAgainBefore(actor: Actor, other: Actor): boolean {
    // if other can still act, nope.
    if (other.actionPoints > 0) return false;

    // if other will be able to act next turn BEFORE actor, nope.
    if (
      other.actionPoints + this.actorSpeed(other) > 0 &&
      this.isActorBeforeInMapList(actor.location.map!, other, actor)
    ) {
      return false;
    }

    return true;
  }

  willOtherActTwiceBefore(actor: Actor, other: Actor): boolean {
    if (this.isActorBeforeInMapList(actor.location.map!, actor, other)) {
      return other.actionPoints > Rules.BASE_ACTION_COST;
    }
    return other.actionPoints + this.actorSpeed(other) > Rules.BASE_ACTION_COST;
  }

  // ── Actors relations ─────────────────────────────────────────────────────

  /**
   * Check if both actors are enemies: enemy factions, enemy gangs,
   * personal enemies, group enemies (if checkGroups). Symmetrical.
   */
  areEnemies(actorA: Actor | null, actorB: Actor | null, checkGroups = true): boolean {
    if (!actorA || !actorB) return false;
    if (actorA === actorB) return false;

    // Enemy factions? (symmetrical)
    if (actorA.faction.isEnemyOf(actorB.faction)) return true;

    // Enemy gangs? (symmetrical)
    if (
      actorA.faction === actorB.faction &&
      actorA.isInAGang &&
      actorB.isInAGang &&
      actorA.gangId !== actorB.gangId
    ) {
      return true;
    }

    // Personal enemies? (symmetrical)
    if (this.arePersonalEnemies(actorA, actorB)) return true;

    // Enemy of groups (symmetrical)
    if (checkGroups && this.areGroupEnemies(actorA, actorB)) return true;

    return false;
  }

  /** Check if they are in an agressor-selfdefence relation. Symmetrical. */
  arePersonalEnemies(actorA: Actor | null, actorB: Actor | null): boolean {
    if (!actorA || !actorB) return false;
    if (actorA === actorB) return false;

    if (actorA.isAggressorOf(actorB)) return true;
    if (actorA.isSelfDefenceFrom(actorB)) return true;

    return false;
  }

  /** Check if they are enemies through group relations. Symmetrical. */
  areGroupEnemies(actorA: Actor | null, actorB: Actor | null): boolean {
    if (!actorA || !actorB) return false;
    if (actorA === actorB) return false;

    const isEnemyOfMyLeaderOrMates = (groupActor: Actor, target: Actor): boolean => {
      if (this.areEnemies(groupActor.leader, target, false)) return true;
      const mates = groupActor.leader?.followers;
      if (mates) {
        for (const mate of mates) {
          if (mate !== groupActor && this.areEnemies(mate, target, false)) return true;
        }
      }
      return false;
    };

    const isEnemyOfMyFollowers = (groupActor: Actor, target: Actor): boolean => {
      const followers = groupActor.followers;
      if (followers) {
        for (const follower of followers) {
          if (this.areEnemies(follower, target, false)) return true;
        }
      }
      return false;
    };

    // check A group
    if (actorA.hasLeader && isEnemyOfMyLeaderOrMates(actorA, actorB)) return true;
    if (actorA.countFollowers > 0 && isEnemyOfMyFollowers(actorA, actorB)) return true;

    // check B group
    if (actorB.hasLeader && isEnemyOfMyLeaderOrMates(actorB, actorA)) return true;
    if (actorB.countFollowers > 0 && isEnemyOfMyFollowers(actorB, actorA)) return true;

    return false;
  }

  isMurder(killer: Actor | null, victim: Actor | null): boolean {
    if (!killer || !victim) return false;

    // killing an undead is never a murder (doh!)
    if (victim.model.abilities.isUndead) return false;

    // a law enforcer killing a murderer is not a murder.
    if (killer.model.abilities.isLawEnforcer && victim.murdersCounter > 0) return false;

    // killing between enemy factions is allowed.
    if (killer.faction.isEnemyOf(victim.faction)) return false;

    // killing in self defence is not a murder.
    if (killer.isSelfDefenceFrom(victim)) return false;

    // all other cases are murders!
    return true;
  }

  // ── Stats affected by Skills & Status effects ────────────────────────────

  actorSpeed(actor: Actor): number {
    let speed = actor.doll.body.speed;

    // stamina.
    if (this.isActorTired(actor)) speed *= 2 / 3;

    // sleep.
    if (this.isActorExhausted(actor)) speed /= 2;
    else if (this.isActorSleepy(actor)) speed *= 2 / 3;

    // wearing armor.
    const armor = actor.getEquippedItem(DollPart.TORSO);
    if (armor instanceof ItemBodyArmor) speed -= armor.weight;

    // dragging corpses.
    if (actor.draggedCorpse !== null) speed /= 2;

    // done, speed must be >= 0.
    return Math.max(Math.floor(speed), 0);
  }

  actorMaxHPs(actor: Actor): number {
    const skillBonus =
      Rules.SKILL_TOUGH_HP_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.TOUGH) +
      Rules.SKILL_ZTOUGH_HP_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.Z_TOUGH);

    return actor.sheet.baseHitPoints + skillBonus;
  }

  actorMaxSTA(actor: Actor): number {
    const skillBonus =
      Rules.SKILL_HIGH_STAMINA_STA_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.HIGH_STAMINA);

    return actor.sheet.baseStaminaPoints + skillBonus;
  }

  actorItemNutritionValue(actor: Actor, baseValue: number): number {
    const skillBonus = Math.floor(
      baseValue * Rules.SKILL_LIGHT_EATER_FOOD_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.LIGHT_EATER)
    );
    return baseValue + skillBonus;
  }

  actorMaxFood(actor: Actor): number {
    const skillBonus = Math.floor(
      actor.sheet.baseFoodPoints *
        Rules.SKILL_LIGHT_EATER_MAXFOOD_BONUS *
        actor.sheet.skillTable.getSkillLevel(SkillID.LIGHT_EATER)
    );
    return actor.sheet.baseFoodPoints + skillBonus;
  }

  actorMaxRot(actor: Actor): number {
    const skillBonus = Math.floor(
      actor.sheet.baseFoodPoints *
        Rules.SKILL_ZLIGHT_EATER_MAXFOOD_BONUS *
        actor.sheet.skillTable.getSkillLevel(SkillID.Z_LIGHT_EATER)
    );
    return actor.sheet.baseFoodPoints + skillBonus;
  }

  actorMaxSleep(actor: Actor): number {
    const skillBonus = Math.floor(
      actor.sheet.baseSleepPoints * Rules.SKILL_AWAKE_SLEEP_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.AWAKE)
    );
    return actor.sheet.baseSleepPoints + skillBonus;
  }

  actorSleepRegen(actor: Actor, isOnCouch: boolean): number {
    const baseRegen = isOnCouch ? Rules.SLEEP_COUCH_SLEEPING_REGEN : Rules.SLEEP_NOCOUCH_SLEEPING_REGEN;
    const skillBonus = Math.floor(
      baseRegen * Rules.SKILL_AWAKE_SLEEP_REGEN_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.AWAKE)
    );
    return baseRegen + skillBonus;
  }

  actorMaxSanity(actor: Actor): number {
    return actor.sheet.baseSanity;
  }

  actorDisturbedLevel(actor: Actor): number {
    const factor =
      1.0 - Rules.SKILL_STRONG_PSYCHE_LEVEL_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.STRONG_PSYCHE);
    return Math.floor(Rules.SANITY_UNSTABLE_LEVEL * factor);
  }

  actorMaxInv(actor: Actor): number {
    const skillBonus =
      Rules.SKILL_HAULER_INV_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.HAULER);
    return actor.sheet.baseInventoryCapacity + skillBonus;
  }

  actorDamageBonusVsUndeads(actor: Actor): number {
    return Rules.SKILL_NECROLOGY_UNDEAD_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.NECROLOGY);
  }

  actorMeleeAttack(actor: Actor, baseAttack: Attack, target: Actor | null, objToBreak: MapObject | null = null): Attack {
    let hit = baseAttack.hitValue;
    let dmg = baseAttack.damageValue;
    let disarmBonus = 0;

    // skills bonuses.
    let hitBonus =
      Rules.SKILL_AGILE_ATK_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.AGILE) +
      Rules.SKILL_ZAGILE_ATK_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.Z_AGILE);
    let dmgBonus =
      Rules.SKILL_STRONG_DMG_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.STRONG) +
      Rules.SKILL_ZSTRONG_DMG_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.Z_STRONG);

    // martial arts apply only if no weapon equipped.
    if (actor.getEquippedWeapon() === null) {
      const ma = actor.sheet.skillTable.getSkillLevel(SkillID.MARTIAL_ARTS);
      if (ma > 0) {
        hitBonus += Rules.SKILL_MARTIAL_ARTS_ATK_BONUS * ma;
        dmgBonus += Rules.SKILL_MARTIAL_ARTS_DMG_BONUS * ma;
        disarmBonus += Rules.SKILL_MARTIAL_ARTS_DISARM_BONUS * ma;
      }
    }

    // necrology vs undeads.
    if (target && target.model.abilities.isUndead) {
      dmgBonus += this.actorDamageBonusVsUndeads(actor);
    }

    // add tool damage bonus vs map objects
    if (objToBreak !== null) {
      const eqMw = actor.getEquippedMeleeWeapon();
      if (eqMw) {
        dmgBonus += eqMw.toolBashDamageBonus;
      }
    }

    hit += hitBonus;
    dmg += dmgBonus;

    // disarm chance.
    let disarmChance = Rules.MELEE_DISARM_BASE_CHANCE;
    disarmChance += disarmBonus;
    // defender strong resist disarm
    if (target) {
      disarmChance -=
        Rules.SKILL_STRONG_RESIST_DISARM_BONUS * target.sheet.skillTable.getSkillLevel(SkillID.STRONG);
    }

    // sleepiness penalties.
    if (this.isActorExhausted(actor)) {
      hit /= 2;
      disarmChance /= 2;
    } else if (this.isActorSleepy(actor)) {
      hit *= 3 / 4;
      disarmChance *= 3 / 4;
    }

    // done.
    return Attack.meleeAttack(
      baseAttack.verb,
      Math.floor(hit),
      Math.floor(dmg),
      baseAttack.staminaPenalty,
      Math.floor(disarmChance)
    );
  }

  actorRangedAttack(actor: Actor, baseAttack: Attack, distance: number, target: Actor | null): Attack {
    let hitMod = 0;
    let dmgBonus = 0;

    // skill bonuses.
    switch (baseAttack.kind) {
      case AttackKind.BOW:
        hitMod = Rules.SKILL_BOWS_ATK_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.BOWS);
        dmgBonus = Rules.SKILL_BOWS_DMG_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.BOWS);
        break;
      case AttackKind.FIREARM:
        hitMod = Rules.SKILL_FIREARMS_ATK_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.FIREARMS);
        dmgBonus = Rules.SKILL_FIREARMS_DMG_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.FIREARMS);
        break;
      default:
        break;
    }

    if (target && target.model.abilities.isUndead) {
      dmgBonus += this.actorDamageBonusVsUndeads(actor);
    }

    // distance vs range penalties/bonus.
    const efficientRange = baseAttack.efficientRange;
    let distanceMod = 1;
    if (distance !== efficientRange) {
      let distanceScale = (efficientRange - distance) / baseAttack.range;
      // bigger effect (penalty) beyond efficient range
      if (distance > efficientRange) distanceScale *= 2;
      distanceMod = 1 + distanceScale;
    }
    let hit = (baseAttack.hitValue + hitMod) * distanceMod;
    let rapidHit1 = (baseAttack.hit2Value + hitMod) * distanceMod;
    let rapidHit2 = (baseAttack.hit3Value + hitMod) * distanceMod;

    const dmg = baseAttack.damageValue + dmgBonus;

    // sleep penalty.
    if (this.isActorExhausted(actor)) {
      hit *= Rules.FIRING_WHEN_SLP_EXHAUSTED;
      rapidHit1 *= Rules.FIRING_WHEN_SLP_EXHAUSTED;
      rapidHit2 *= Rules.FIRING_WHEN_SLP_EXHAUSTED;
    } else if (this.isActorSleepy(actor)) {
      hit *= Rules.FIRING_WHEN_SLP_SLEEPY;
      rapidHit1 *= Rules.FIRING_WHEN_SLP_SLEEPY;
      rapidHit2 *= Rules.FIRING_WHEN_SLP_SLEEPY;
    }

    // stamina penalty.
    if (this.isActorTired(actor)) {
      hit *= Rules.FIRING_WHEN_STA_TIRED;
      rapidHit1 *= Rules.FIRING_WHEN_STA_TIRED;
      rapidHit2 *= Rules.FIRING_WHEN_STA_TIRED;
    } else if (actor.staminaPoints < this.actorMaxSTA(actor)) {
      hit *= Rules.FIRING_WHEN_STA_NOT_FULL;
      rapidHit1 *= Rules.FIRING_WHEN_STA_NOT_FULL;
      rapidHit2 *= Rules.FIRING_WHEN_STA_NOT_FULL;
    }

    // return attack.
    return Attack.rangedAttack(
      baseAttack.kind,
      baseAttack.verb,
      Math.floor(hit),
      Math.floor(rapidHit1),
      Math.floor(rapidHit2),
      Math.floor(dmg),
      baseAttack.range
    );
  }

  /** Estimate chances to hit with a ranged attack (0 for normal shot, 1/2 for rapid fire). */
  computeChancesRangedHit(actor: Actor, target: Actor, shotCounter: number): number {
    const attack = this.actorRangedAttack(
      actor,
      actor.currentRangedAttack,
      this.gridDistance(actor.location.position, target.location.position),
      target
    );
    const defence = this.actorDefence(target, target.currentDefence);

    const hitValue = shotCounter === 0 ? attack.hitValue : shotCounter === 1 ? attack.hit2Value : attack.hit3Value;
    const defValue = defence.value;

    const ROLLS = 1000;
    let hits = 0;
    for (let i = 0; i < ROLLS; i++) {
      const atkRoll = this.rollSkill(hitValue);
      const defRoll = this.rollSkill(defValue);
      if (atkRoll > defRoll) hits++;
    }

    return Math.floor((100 * hits) / ROLLS);
  }

  actorMaxThrowRange(actor: Actor, baseRange: number): number {
    const bonus = Rules.SKILL_STRONG_THROW_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.STRONG);
    return baseRange + bonus;
  }

  actorDefence(actor: Actor, baseDefence: Defence): Defence {
    // Sleeping actors are defenceless.
    if (actor.isSleeping) return new Defence(0, 0, 0);

    // Base value + skill.
    const defBonus =
      Rules.SKILL_AGILE_DEF_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.AGILE) +
      Rules.SKILL_ZAGILE_DEF_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.Z_AGILE);
    let def = baseDefence.value + defBonus;

    // Sleepy effect.
    if (this.isActorExhausted(actor)) def /= 2;
    else if (this.isActorSleepy(actor)) def *= 3 / 4;

    // done.
    return new Defence(Math.floor(def), baseDefence.protectionHit, baseDefence.protectionShot);
  }

  actorMedicineEffect(actor: Actor, baseEffect: number): number {
    const effectBonus = Math.ceil(
      Rules.SKILL_MEDIC_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.MEDIC) * baseEffect
    );
    return baseEffect + effectBonus;
  }

  actorHealChanceBonus(actor: Actor): number {
    return Rules.SKILL_HARDY_HEAL_CHANCE_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.HARDY);
  }

  actorBarricadingPoints(actor: Actor, baseBarricadingPoints: number): number {
    let barBonus = 0;

    // carpentry skill
    barBonus += Math.floor(
      baseBarricadingPoints *
        Rules.SKILL_CARPENTRY_BARRICADING_BONUS *
        actor.sheet.skillTable.getSkillLevel(SkillID.CARPENTRY)
    );

    // tool build bonus
    const eqMw = actor.getEquippedMeleeWeapon();
    if (eqMw && eqMw.toolBuildBonus !== 0) {
      barBonus += Math.floor(baseBarricadingPoints * eqMw.toolBuildBonus);
    }

    return baseBarricadingPoints + barBonus;
  }

  actorMaxFollowers(actor: Actor): number {
    return (
      Rules.SKILL_LEADERSHIP_FOLLOWER_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.LEADERSHIP)
    );
  }

  actorFOV(actor: Actor, time?: WorldTime, weather?: Weather): number {
    const t = time ?? actor.location.map!.localTime;
    const w = weather ?? this.weather;

    // Sleeping actors have no FOV.
    if (actor.isSleeping) return 0;

    // base value.
    let FOV = actor.sheet.baseViewRange;

    // lighting/weather
    const light = actor.location.map!.lighting;
    switch (light) {
      case Lighting.DARKNESS:
        // FoV in darkness depends on actor.
        FOV = this.darknessFov(actor);
        break;
      case Lighting.LIT:
        // nothing to do, unmodified base FOV.
        break;
      case Lighting.OUTSIDE:
        // night & weather penalty
        FOV -= this.nightFovPenalty(actor, t);
        FOV -= this.weatherFovPenalty(actor, w);
        break;
      default:
        throw new Error("unhandled lighting");
    }

    // sleep penalty.
    if (this.isActorExhausted(actor)) FOV -= 2;
    else if (this.isActorSleepy(actor)) FOV -= 1;

    // light equipped or standing next to someone with light.
    // works only in darkness or during the night.
    if (light === Lighting.DARKNESS || (light === Lighting.OUTSIDE && t.isNight)) {
      let lightBonus = this.getLightBonusEquipped(actor);
      if (lightBonus === 0) {
        const map = actor.location.map!;
        if (
          map.hasAnyAdjacentInMap(actor.location.position, (pt) => {
            const other = map.getActorAtPoint(pt);
            if (!other) return false;
            return this.hasLightOnEquipped(other);
          })
        ) {
          lightBonus = 1;
        }
      }
      FOV += lightBonus;
    }

    // standing on some map objects.
    const mobj = actor.location.map!.getMapObjectAtPoint(actor.location.position);
    if (mobj && mobj.standOnFovBonus) ++FOV;

    // done.
    FOV = Math.max(Rules.MINIMAL_FOV, FOV);
    return FOV;
  }

  /** C# ActorFOV with defaults + FOV point set (used by sensors). */
  computeFOVFor(actor: Actor, time?: WorldTime, weather?: Weather): Set<string> {
    return LOS.computeFOVFor(this, actor, time ?? actor.location.map!.localTime, weather ?? this.weather);
  }

  actorSmell(actor: Actor): number {
    return (
      (1.0 + Rules.SKILL_ZTRACKER_SMELL_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.Z_TRACKER)) *
      actor.model.startingSheet.baseSmellRating
    );
  }

  actorSmellThreshold(actor: Actor): number {
    // sleeping actors can't smell.
    if (actor.isSleeping) return -1;

    // actor model base value.
    const smellRating = this.actorSmell(actor);
    return 1 + OdorScent.MAX_STRENGTH - Math.floor(smellRating * OdorScent.MAX_STRENGTH);
  }

  private hasLightOnEquipped(actor: Actor): boolean {
    const light = actor.getEquippedItem(DollPart.LEFT_HAND);
    return light instanceof ItemLight && light.batteries > 0;
  }

  private getLightBonusEquipped(actor: Actor): number {
    const light = actor.getEquippedItem(DollPart.LEFT_HAND);
    if (!(light instanceof ItemLight) || light.batteries <= 0) return 0;
    return light.fovBonus;
  }

  actorLoudNoiseWakeupChance(actor: Actor, noiseDistance: number): number {
    const baseChance = Rules.LOUD_NOISE_BASE_WAKEUP_CHANCE;
    const skillBonus =
      Rules.SKILL_LIGHT_SLEEPER_WAKEUP_CHANCE_BONUS *
      actor.sheet.skillTable.getSkillLevel(SkillID.LIGHT_SLEEPER);
    const distBonus = Math.max(0, (Rules.LOUD_NOISE_RADIUS - noiseDistance) * Rules.LOUD_NOISE_DISTANCE_BONUS);

    return baseChance + skillBonus + distBonus;
  }

  actorBarricadingMaterialNeedForFortification(builder: Actor, isLarge: boolean): number {
    const baseCost = isLarge ? 4 : 2;
    const skillBonus =
      builder.sheet.skillTable.getSkillLevel(SkillID.CARPENTRY) >= 3
        ? Rules.SKILL_CARPENTRY_LEVEL3_BUILD_BONUS
        : 0;
    return Math.max(1, baseCost - skillBonus);
  }

  actorTrustIncrease(actor: Actor): number {
    const skillBonus =
      Rules.SKILL_CHARISMATIC_TRUST_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.CHARISMATIC);
    return Rules.TRUST_BASE_INCREASE + skillBonus;
  }

  actorCharismaticTradeChance(actor: Actor): number {
    return Rules.SKILL_CHARISMATIC_TRADE_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.CHARISMATIC);
  }

  actorUnsuspicousChance(observer: Actor, actor: Actor): number {
    // base = unsuspicious skill.
    const baseChance = Rules.SKILL_UNSUSPICIOUS_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.UNSUSPICIOUS);

    // bonus.
    let bonus = 0;

    // wearing some outfit.
    const armor = actor.getEquippedItem(DollPart.TORSO);
    if (armor instanceof ItemBodyArmor) {
      if (observer.faction.id === FactionID.ThePolice) {
        if (armor.isHostileForCops()) bonus -= Rules.UNSUSPICIOUS_BAD_OUTFIT_PENALTY;
        else if (armor.isFriendlyForCops()) bonus += Rules.UNSUSPICIOUS_GOOD_OUTFIT_BONUS;
      } else if (observer.faction.id === FactionID.TheBikers) {
        if (armor.isHostileForBiker(observer.gangId as GangID)) bonus -= Rules.UNSUSPICIOUS_BAD_OUTFIT_PENALTY;
        else if (armor.isFriendlyForBiker(observer.gangId as GangID)) bonus += Rules.UNSUSPICIOUS_GOOD_OUTFIT_BONUS;
      }
    }

    return baseChance + bonus;
  }

  actorSpotMurdererChance(spotter: Actor, murderer: Actor): number {
    const spotterBonus = Rules.MURDER_SPOTTING_MURDERCOUNTER_BONUS * murderer.murdersCounter;
    const distancePenalty =
      Rules.MURDERER_SPOTTING_DISTANCE_PENALTY *
      this.gridDistance(spotter.location.position, murderer.location.position);

    return Rules.MURDERER_SPOTTING_BASE_CHANCE + spotterBonus - distancePenalty;
  }

  // ── Day/Night, Weather & Lighting ────────────────────────────────────────

  nightFovPenalty(actor: Actor, time: WorldTime): number {
    if (actor.model.abilities.isUndead) return 0;
    switch (time.phase) {
      case DayPhase.SUNSET:
        return Rules.FOV_PENALTY_SUNSET;
      case DayPhase.EVENING:
        return Rules.FOV_PENALTY_EVENING;
      case DayPhase.MIDNIGHT:
        return Rules.FOV_PENALTY_MIDNIGHT;
      case DayPhase.DEEP_NIGHT:
        return Rules.FOV_PENALTY_DEEP_NIGHT;
      case DayPhase.SUNRISE:
        return Rules.FOV_PENALTY_SUNRISE;
      default:
        return 0;
    }
  }

  nightStaminaPenalty(actor: Actor): number {
    if (actor.model.abilities.isUndead) return 0;
    return Rules.NIGHT_STA_PENALTY;
  }

  weatherFovPenalty(actor: Actor, weather: Weather): number {
    if (actor.model.abilities.isUndead) return 0;
    switch (weather) {
      case Weather.RAIN:
        return Rules.FOV_PENALTY_RAIN;
      case Weather.HEAVY_RAIN:
        return Rules.FOV_PENALTY_HEAVY_RAIN;
      default:
        return 0;
    }
  }

  isWeatherRain(weather: Weather): boolean {
    switch (weather) {
      case Weather.CLEAR:
      case Weather.CLOUDY:
        return false;
      case Weather.HEAVY_RAIN:
      case Weather.RAIN:
        return true;
      default:
        throw new Error(`unhandled weather ${weather}`);
    }
  }

  darknessFov(actor: Actor): number {
    if (actor.model.abilities.isUndead) return actor.sheet.baseViewRange;
    return Rules.MINIMAL_FOV;
  }

  odorsDecay(map: GameMap, pos: Point, weather: Weather): number {
    let decay = 1;

    // sewers?
    if (map === map.district?.sewersMap) {
      decay += 2;
    } else {
      // outside? = weather affected. (alpha10 weather affect only outside tiles)
      const tile = map.getTileAt(pos.x, pos.y);
      if (tile && !tile.isInside) {
        switch (weather) {
          case Weather.CLEAR:
          case Weather.CLOUDY:
            // default decay.
            break;
          case Weather.RAIN:
            decay += 1;
            break;
          case Weather.HEAVY_RAIN:
            decay += 2;
            break;
          default:
            throw new Error(`unhandled weather ${weather}`);
        }
      }
    }

    return decay;
  }

  canActorSeeSky(actor: Actor): boolean {
    if (actor.isDead) return false;
    if (actor.isSleeping) return false;
    return actor.location.map!.lighting === Lighting.OUTSIDE;
  }

  canActorKnowTime(actor: Actor): boolean {
    if (actor.isDead) return false;
    if (actor.isSleeping) return false;
    if (actor.location.map!.lighting === Lighting.OUTSIDE) return true;

    const eqTracker = actor.getEquippedItem(DollPart.LEFT_HAND);
    if (eqTracker instanceof ItemTracker && eqTracker.hasClock && eqTracker.batteries > 0) return true;

    return false;
  }

  // ── Map power rating ─────────────────────────────────────────────────────

  /** 0.0 = not powered at all to 1.0 = 100% power. */
  computeMapPowerRatio(map: GameMap): number {
    let totalOn = 0;
    let totalOff = 0;

    for (const obj of map.mapObjects) {
      if (!(obj instanceof PowerGenerator)) continue;
      if (obj.isOn) ++totalOn;
      else ++totalOff;
    }

    const totalCount = totalOn + totalOff;
    if (totalCount === 0) return 0.0;

    return totalOn / totalCount;
  }

  // ── Explosions ───────────────────────────────────────────────────────────

  blastDamage(distance: number, attack: BlastAttack): number {
    if (distance < 0 || distance > attack.radius) {
      throw new Error(`blast distance ${distance} out of range`);
    }
    return attack.damage[distance];
  }

  // ── Undead Regen/Food, Infection and Corpses ─────────────────────────────

  actorBiteHpRegen(a: Actor, dmg: number): number {
    const bonus = Math.floor(
      Rules.SKILL_ZEATER_REGEN_BONUS * a.sheet.skillTable.getSkillLevel(SkillID.Z_EATER) * dmg
    );
    return dmg + bonus;
  }

  actorBiteNutritionValue(actor: Actor, baseValue: number): number {
    const zskillFactor =
      Rules.SKILL_ZLIGHT_EATER_FOOD_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.Z_LIGHT_EATER);
    const skillFactor =
      Rules.SKILL_LIGHT_EATER_FOOD_BONUS * actor.sheet.skillTable.getSkillLevel(SkillID.LIGHT_EATER);

    return Math.floor(Rules.CORPSE_EATING_NUTRITION_FACTOR + zskillFactor + skillFactor) * baseValue;
  }

  corpseEeatingInfectionTransmission(infection: number): number {
    return Math.floor(Rules.CORPSE_EATING_INFECTION_FACTOR * infection);
  }

  actorInfectionHPs(a: Actor): number {
    return this.actorMaxHPs(a) + this.actorMaxSTA(a);
  }

  static infectionForDamage(infector: Actor, dmg: number): number {
    const factor =
      Rules.INFECTION_BASE_FACTOR +
      infector.sheet.skillTable.getSkillLevel(SkillID.Z_INFECTOR) * Rules.SKILL_ZINFECTOR_BONUS;
    return Math.floor(factor * dmg);
  }

  actorInfectionPercent(a: Actor): number {
    return Math.floor((100 * a.infection) / this.actorInfectionHPs(a));
  }

  infectionEffectTriggerChance1000(infectionPercent: number): number {
    return Rules.INFECTION_EFFECT_TRIGGER_CHANCE_1000 + Math.floor(infectionPercent / 5);
  }

  corpseFreshnessPercent(c: Corpse): number {
    return Math.floor((100 * c.hitPoints) / this.actorMaxHPs(c.deadGuy));
  }

  /** @returns [0..5] */
  corpseRotLevel(c: Corpse): number {
    const freshP = this.corpseFreshnessPercent(c);
    if (freshP < 5) return 5;
    if (freshP < 25) return 4;
    if (freshP < 50) return 3;
    if (freshP < 75) return 2;
    if (freshP < 90) return 1;
    return 0;
  }

  static corpseDecayPerTurn(_c: Corpse): number {
    return Rules.CORPSE_DECAY_PER_TURN;
  }

  corpseZombifyChance(c: Corpse, timeNow: WorldTime, checkDelay = true): number {
    let chance: number;

    // delay zombification.
    const dT = timeNow.turnCounter - c.turn;
    if (checkDelay && dT < Rules.CORPSE_ZOMBIFY_DELAY) return 0;

    // compute infection P
    const infP = this.actorInfectionPercent(c.deadGuy);

    // check only every X turns, higher frequency as infP rise.
    if (checkDelay) {
      const freq = infP >= 100 ? 1 : 100 / (1 + infP);
      if (timeNow.turnCounter % freq !== 0) return 0;
    }

    // base chance.
    chance = Rules.CORPSE_ZOMBIFY_BASE_CHANCE;

    // living infection
    chance += Rules.CORPSE_ZOMBIFY_INFECTIONP_FACTOR * infP;

    // less likely as time passes.
    chance -= Math.floor(Rules.CORPSE_ZOMBIFY_TIME_FACTOR * dT);

    // factor day & night.
    if (timeNow.isNight) chance *= Rules.CORPSE_ZOMBIFY_NIGHT_FACTOR;
    else chance *= Rules.CORPSE_ZOMBIFY_DAY_FACTOR;

    // ok.
    return Math.max(0, Math.min(100, Math.floor(chance)));
  }

  corpseReviveChance(actor: Actor, corpse: Corpse): number {
    if (!this.canActorReviveCorpse(actor, corpse)) return 0;
    const baseChance = Math.floor(this.corpseFreshnessPercent(corpse) / 4);
    const skillBonus = actor.sheet.skillTable.getSkillLevel(SkillID.MEDIC) * Rules.SKILL_MEDIC_REVIVE_BONUS;
    return baseChance + skillBonus;
  }

  corpseReviveHPs(actor: Actor, _corpse: Corpse): number {
    const baseHps = 5;
    const skillBonus = actor.sheet.skillTable.getSkillLevel(SkillID.MEDIC);
    return baseHps + skillBonus;
  }

  // ── Traps ────────────────────────────────────────────────────────────────

  getTrapTriggerChance(trap: ItemTrap, a: Actor): number {
    // alpha10.1 bugfix - correctly has 0 chance to trigger safe traps
    if (this.isSafeFromTrap(trap, a)) return 0;

    const baseChance = trap.trapModel.triggerChance * trap.quantity;

    let avoidBonus = 0;
    if (a.model.abilities.isUndead) avoidBonus -= Rules.TRAP_UNDEAD_ACTOR_TRIGGER_PENALTY;
    if (a.model.abilities.isSmall) avoidBonus += Rules.TRAP_SMALL_ACTOR_AVOID_BONUS;
    avoidBonus += a.sheet.skillTable.getSkillLevel(SkillID.LIGHT_FEET) * Rules.SKILL_LIGHT_FEET_TRAP_BONUS;
    avoidBonus += a.sheet.skillTable.getSkillLevel(SkillID.Z_LIGHT_FEET) * Rules.SKILL_ZLIGHT_FEET_TRAP_BONUS;

    return baseChance - avoidBonus;
  }

  checkTrapTriggers(trap: ItemTrap, a: Actor): boolean {
    const chance = this.getTrapTriggerChance(trap, a);
    return chance > 0 ? this.rollChance(chance) : false;
  }

  checkTrapTriggersMobj(trap: ItemTrap, mobj: MapObject): boolean {
    return this.rollChance(trap.trapModel.triggerChance * mobj.weight);
  }

  checkTrapStepOnBreaks(trap: ItemTrap, mobj: MapObject | null = null): boolean {
    let chance = trap.trapModel.breakChance;
    if (mobj !== null) chance *= mobj.weight;
    return this.rollChance(chance);
  }

  checkTrapEscapeBreaks(trap: ItemTrap, _a: Actor): boolean {
    return this.rollChance(trap.trapModel.breakChanceWhenEscape);
  }

  isSafeFromTrap(trap: ItemTrap, a: Actor): boolean {
    if (trap.owner === null) return false;
    if (trap.owner === a) return true;
    return a.isInGroupWith(trap.owner);
  }

  checkTrapEscape(trap: ItemTrap, a: Actor): boolean {
    if (this.isSafeFromTrap(trap, a)) return true;

    let escapeBonus = 0;
    escapeBonus +=
      a.sheet.skillTable.getSkillLevel(SkillID.LIGHT_FEET) * Rules.SKILL_LIGHT_FEET_TRAP_BONUS +
      a.sheet.skillTable.getSkillLevel(SkillID.Z_LIGHT_FEET) * Rules.SKILL_ZLIGHT_FEET_TRAP_BONUS;

    return this.rollChance(escapeBonus + (100 - trap.trapModel.blockChance * trap.quantity));
  }

  isTrapCoveringMapObjectThere(map: GameMap, pos: Point): boolean {
    const mobj = map.getMapObjectAt(pos.x, pos.y);
    if (mobj === null) return false;
    // mobj is either walkable and not a door (eg:bed) or jumpable (eg:table,car...)
    return mobj.isJumpable || (mobj.isWalkable && !(mobj instanceof DoorWindow));
  }

  isTrapTriggeringMapObjectThere(map: GameMap, pos: Point): boolean {
    const mobj = map.getMapObjectAt(pos.x, pos.y);
    if (mobj === null) return false;
    // mobj is NOT walkable and a door and NOT jumpable (eg:shelves,large fort)
    return !mobj.isWalkable && !mobj.isJumpable && !(mobj instanceof DoorWindow);
  }

  // ── Grabbing ─────────────────────────────────────────────────────────────

  zGrabChance(grabber: Actor, _victim: Actor): number {
    const zGrabLevel = grabber.sheet.skillTable.getSkillLevel(SkillID.Z_GRAB);
    return zGrabLevel * Rules.SKILL_ZGRAB_CHANCE;
  }

  // ── Game modes ───────────────────────────────────────────────────────────

  static hasImmediateZombification(mode: GameMode): boolean {
    return mode === GameMode.GM_STANDARD;
  }

  static hasInfection(mode: GameMode): boolean {
    return mode !== GameMode.GM_STANDARD;
  }

  static hasCorpses(mode: GameMode): boolean {
    return mode !== GameMode.GM_STANDARD;
  }

  static hasEvolution(mode: GameMode): boolean {
    return mode !== GameMode.GM_VINTAGE;
  }

  static hasAllZombies(mode: GameMode): boolean {
    return mode !== GameMode.GM_VINTAGE;
  }

  static hasZombiesInBasements(mode: GameMode): boolean {
    return mode !== GameMode.GM_VINTAGE;
  }

  static hasZombiesInSewers(mode: GameMode): boolean {
    return mode !== GameMode.GM_VINTAGE;
  }
}
