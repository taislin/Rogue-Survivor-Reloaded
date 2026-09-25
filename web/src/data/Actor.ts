import { Models } from "./Models";
import type { ActorModel } from "./ActorModel";
import type { Faction } from "./Faction";
import { Activity } from "./Activity";
import { Attack } from "./Attack";
import { Defence } from "./Defence";
import { Location } from "./Location";
import { Doll } from "./Doll";
import { ActorSheet } from "./ActorSheet";
import { Inventory } from "./Inventory";
import { PlayerController } from "./PlayerController";
import type { ActorController } from "./ActorController";
import type { AIController } from "./AIController";
import type { Corpse } from "./Corpse";
import type { Item } from "./Item";
import { DollPart } from "./Doll";
import { ItemMeleeWeapon, ItemRangedWeapon } from "@engine/items/ItemWeapon";

export const enum ActorFlags {
  NONE = 0,
  IS_UNIQUE = 1 << 0,
  IS_PROPER_NAME = 1 << 1,
  IS_PLURAL_NAME = 1 << 2,
  IS_DEAD = 1 << 3,
  IS_RUNNING = 1 << 4,
  IS_SLEEPING = 1 << 5,
}

export interface TrustRecord {
  actor: Actor;
  trust: number;
}

export class Actor {
  private flags: number = ActorFlags.NONE;

  private modelId: number;
  private factionId: number;
  gangId: number = 0;
  private rawName: string;
  private _controller: ActorController | null = null;
  isBotPlayer: boolean = false;
  sheet!: ActorSheet;
  readonly spawnTime: number;

  inventory: Inventory | null = null;
  doll!: Doll;

  hitPoints: number = 0;
  previousHitPoints: number = 0;
  staminaPoints: number = 0;
  previousStaminaPoints: number = 0;
  foodPoints: number = 0;
  previousFoodPoints: number = 0;
  sleepPoints: number = 0;
  previousSleepPoints: number = 0;
  sanity: number = 0;
  previousSanity: number = 0;

  location: Location = new Location();
  actionPoints: number = 0;
  lastActionTurn: number = 0;
  activity: Activity = Activity.IDLE;
  targetActor: Actor | null = null;
  audioRangeMod: number = 0;

  currentMeleeAttack: Attack = Attack.BLANK;
  currentRangedAttack: Attack = Attack.BLANK;
  currentDefence: Defence = Defence.BLANK;

  leader: Actor | null = null;
  private followersList: Actor[] | null = null;
  trustInLeader: number = 0;
  private trustList: TrustRecord[] | null = null;

  killsCount: number = 0;
  private aggressorOfList: Actor[] | null = null;
  private selfDefenceFromList: Actor[] | null = null;
  private boringItemsList: Item[] | null = null;
  murdersCounter: number = 0;
  infection: number = 0;
  draggedCorpse: Corpse | null = null;

  isInvincible: boolean = false;
  odorSuppressorCounter: number = 0;

  constructor(
    model: ActorModel,
    faction: Faction,
    nameOrSpawnTime?: string | number,
    isProperName: boolean = false,
    isPluralName: boolean = false,
    spawnTime: number = 0
  ) {
    this.modelId = model.id;
    this.factionId = faction.id;

    if (typeof nameOrSpawnTime === "string") {
      this.rawName = nameOrSpawnTime;
      this.isProperName = isProperName;
      this.isPluralName = isPluralName;
      this.spawnTime = spawnTime;
    } else {
      this.rawName = model.name;
      this.isProperName = false;
      this.isPluralName = false;
      this.spawnTime = typeof nameOrSpawnTime === "number" ? nameOrSpawnTime : 0;
    }

    this.onModelSet();
  }

  get model(): ActorModel {
    return Models.actors.get(this.modelId);
  }

  set model(value: ActorModel) {
    this.modelId = value.id;
    this.onModelSet();
  }

  get faction(): Faction {
    return Models.factions.get(this.factionId);
  }

  set faction(value: Faction) {
    this.factionId = value.id;
  }

  get controller(): ActorController | null {
    return this._controller;
  }

  set controller(value: ActorController | null) {
    if (this._controller) {
      this._controller.leaveControl();
    }
    this._controller = value;
    if (this._controller) {
      this._controller.takeControl(this);
    }
  }

  get isPlayer(): boolean {
    return this._controller instanceof PlayerController;
  }

  get name(): string {
    return this.isPlayer ? `(YOU) ${this.rawName}` : this.rawName;
  }

  set name(value: string) {
    this.rawName = value.replace("(YOU) ", "");
  }

  /** C# TheName – the article-prefixed display name. */
  get theName(): string {
    return this.isProperName || this.isPluralName ? this.name : `the ${this.rawName}`;
  }

  /** C# IsInAGang – true if this actor belongs to any gang. */
  get isInAGang(): boolean {
    return this.gangId !== 0; // GangID.NONE
  }

  get unmodifiedName(): string {
    return this.rawName;
  }

  get isUnique(): boolean { return (this.flags & ActorFlags.IS_UNIQUE) !== 0; }
  set isUnique(v: boolean) { this.setFlag(ActorFlags.IS_UNIQUE, v); }

  get isProperName(): boolean { return (this.flags & ActorFlags.IS_PROPER_NAME) !== 0; }
  set isProperName(v: boolean) { this.setFlag(ActorFlags.IS_PROPER_NAME, v); }

  get isPluralName(): boolean { return (this.flags & ActorFlags.IS_PLURAL_NAME) !== 0; }
  set isPluralName(v: boolean) { this.setFlag(ActorFlags.IS_PLURAL_NAME, v); }

  get isDead(): boolean { return (this.flags & ActorFlags.IS_DEAD) !== 0; }
  set isDead(v: boolean) { this.setFlag(ActorFlags.IS_DEAD, v); }

  get isRunning(): boolean { return (this.flags & ActorFlags.IS_RUNNING) !== 0; }
  set isRunning(v: boolean) { this.setFlag(ActorFlags.IS_RUNNING, v); }

  get isSleeping(): boolean { return (this.flags & ActorFlags.IS_SLEEPING) !== 0; }
  set isSleeping(v: boolean) { this.setFlag(ActorFlags.IS_SLEEPING, v); }

  get isLeader(): boolean {
    return this.followersList !== null && this.followersList.length > 0;
  }

  get countFollowers(): number {
    return this.followersList ? this.followersList.length : 0;
  }

  get followers(): readonly Actor[] | null {
    return this.followersList;
  }

  get hasLeader(): boolean {
    return this.leader !== null;
  }

  get maxHitPoints(): number {
    return this.sheet.baseHitPoints;
  }

  get maxStamina(): number {
    return this.sheet.baseStaminaPoints;
  }

  get maxFood(): number {
    return this.sheet.baseFoodPoints;
  }

  get maxSleep(): number {
    return this.sheet.baseSleepPoints;
  }

  get maxSanity(): number {
    return this.sheet.baseSanity;
  }

  /** C# `public int AudioRange`. */
  get audioRange(): number {
    return this.sheet.baseAudioRange + this.audioRangeMod;
  }

  private setFlag(flag: ActorFlags, value: boolean): void {
    if (value) this.flags |= flag;
    else this.flags &= ~flag;
  }

  private onModelSet(): void {
    const m = this.model;
    this.doll = new Doll(m.dollBody);
    this.sheet = ActorSheet.clone(m.startingSheet);

    this.actionPoints = this.doll.body.speed;
    this.hitPoints = this.previousHitPoints = this.sheet.baseHitPoints;
    this.staminaPoints = this.previousStaminaPoints = this.sheet.baseStaminaPoints;
    this.foodPoints = this.previousFoodPoints = this.sheet.baseFoodPoints;
    this.sleepPoints = this.previousSleepPoints = this.sheet.baseSleepPoints;
    this.sanity = this.previousSanity = this.sheet.baseSanity;

    if (m.abilities.hasInventory) {
      this.inventory = new Inventory(m.startingSheet.baseInventoryCapacity);
    }

    this.currentMeleeAttack = m.startingSheet.unarmedAttack;
    this.currentDefence = m.startingSheet.baseDefence;
    this.currentRangedAttack = Attack.BLANK;
  }

  addFollower(other: Actor): void {
    if (!this.followersList) this.followersList = [];
    if (this.followersList.includes(other)) {
      throw new Error("other is already a follower");
    }
    this.followersList.push(other);
    if (other.leader) {
      other.leader.removeFollower(other);
    }
    other.leader = this;
  }

  removeFollower(other: Actor): void {
    if (!this.followersList) return;
    const idx = this.followersList.indexOf(other);
    if (idx !== -1) {
      this.followersList.splice(idx, 1);
      if (this.followersList.length === 0) {
        this.followersList = null;
      }
    }
    other.leader = null;

    const ai = other.controller as (AIController | null);
    if (ai && "directives" in ai) {
      ai.directives.reset();
      ai.setOrder(null);
    }
  }

  removeAllFollowers(): void {
    while (this.followersList && this.followersList.length > 0) {
      this.removeFollower(this.followersList[0]);
    }
  }

  setTrustIn(other: Actor, trust: number): void {
    if (!this.trustList) this.trustList = [];
    let rec = this.trustList.find(r => r.actor === other);
    if (!rec) {
      rec = { actor: other, trust };
      this.trustList.push(rec);
    } else {
      rec.trust = trust;
    }
  }

  getTrustIn(other: Actor): number {
    if (!this.trustList) return 0;
    const rec = this.trustList.find(r => r.actor === other);
    return rec ? rec.trust : 0;
  }

  isFollowerOf(leader: Actor): boolean {
    return this.leader === leader;
  }

  /** C# IsInGroupWith – other is our leader, a follower or a mate. */
  isInGroupWith(other: Actor): boolean {
    if (this.hasLeader && this.leader === other) return true;
    if (other.hasLeader && other.leader === this.leader) return true;
    if (this.followersList && this.followersList.includes(other)) return true;
    return false;
  }

  isAggressorOf(target: Actor): boolean {
    return this.aggressorOfList !== null && this.aggressorOfList.includes(target);
  }

  addAggressorOf(target: Actor): void {
    if (!this.aggressorOfList) this.aggressorOfList = [];
    if (!this.aggressorOfList.includes(target)) {
      this.aggressorOfList.push(target);
    }
  }

  removeAggressorOf(target: Actor): void {
    if (!this.aggressorOfList) return;
    const idx = this.aggressorOfList.indexOf(target);
    if (idx !== -1) {
      this.aggressorOfList.splice(idx, 1);
      if (this.aggressorOfList.length === 0) {
        this.aggressorOfList = null;
      }
    }
  }

  isSelfDefenceFrom(attacker: Actor): boolean {
    return this.selfDefenceFromList !== null && this.selfDefenceFromList.includes(attacker);
  }

  addSelfDefenceFrom(attacker: Actor): void {
    if (!this.selfDefenceFromList) this.selfDefenceFromList = [];
    if (!this.selfDefenceFromList.includes(attacker)) {
      this.selfDefenceFromList.push(attacker);
    }
  }

  removeSelfDefenceFrom(attacker: Actor): void {
    if (!this.selfDefenceFromList) return;
    const idx = this.selfDefenceFromList.indexOf(attacker);
    if (idx !== -1) {
      this.selfDefenceFromList.splice(idx, 1);
      if (this.selfDefenceFromList.length === 0) {
        this.selfDefenceFromList = null;
      }
    }
  }

  // ── Boring items ─────────────────────────────────────────────────────────
  // alpha10 moved this out of Actor into ItemEntertainment; C# keeps the block
  // under #if false. Ported for fidelity (BaseAI.isJunkItem still calls it).

  addBoringItem(it: Item): void {
    if (!this.boringItemsList) this.boringItemsList = [];
    if (this.boringItemsList.includes(it)) return;
    this.boringItemsList.push(it);
  }

  isBoredOf(it: Item): boolean {
    return this.boringItemsList !== null && this.boringItemsList.includes(it);
  }

  // ── Equipment helpers ────────────────────────────────────────────────────

  /** Returns the equipped item on the given doll part, or null. */
  getEquippedItem(part: number): Item | null {
    if (!this.inventory || part === 0) return null;
    for (const it of this.inventory.items) {
      if ((it as any).equippedPart === part) return it;
    }
    return null;
  }

  /** Returns the weapon equipped at the right hand slot (DollPart.RIGHT_HAND). */
  getEquippedWeapon(): Item | null {
    return this.getEquippedItem(DollPart.RIGHT_HAND);
  }

  /** C# GetEquippedMeleeWeapon – assumed to be equipped at right hand. */
  getEquippedMeleeWeapon(): ItemMeleeWeapon | null {
    const it = this.getEquippedItem(DollPart.RIGHT_HAND);
    return it instanceof ItemMeleeWeapon ? it : null;
  }

  /** C# GetEquippedRangedWeapon – `GetEquippedItem(RIGHT_HAND) as ItemRangedWeapon`. */
  getEquippedRangedWeapon(): ItemRangedWeapon | null {
    const it = this.getEquippedItem(DollPart.RIGHT_HAND);
    return it instanceof ItemRangedWeapon ? it : null;
  }
}

