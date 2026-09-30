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
  /**
   * Still Alive, Release 5-7. The actor is alight.
   *
   * **Distinct from standing in a tile fire.** `Feature.TileFires` deals
   * `BASE_TILE_FIRE_DAMAGE` to anyone standing on a burning tile; this bit is a
   * separate state that follows the actor, is extinguished by rain or by
   * stop-drop-and-roll, and is drawn as a torso decoration. Conflating the two is
   * how a walker ends up on fire and shrugs it off by stepping off the tile.
   */
  IS_ON_FIRE = 1 << 6,
  /** Still Alive, Release 6-1. Standing in water; a hard block on ignition. */
  IS_IN_WATER = 1 << 7,
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

  // C# exposes these as properties whose setters carry the alpha10
  // `m_IsInvincible` guard, so an invincible actor cannot be worn down. The
  // port had them as plain public fields, which silently dropped the guard on
  // all six. The external syntax is identical (`actor.hitPoints = x` still
  // works), so no call site changes -- only the write is now filtered.
  //
  // `infection` is the odd one out: invincibility blocks infection *rising*,
  // not falling, so curing an invincible actor still works (Actor.cs:470).
  private _hitPoints = 0;
  private _staminaPoints = 0;
  private _foodPoints = 0;
  private _sleepPoints = 0;
  private _sanity = 0;
  private _infection = 0;

  previousHitPoints: number = 0;
  previousStaminaPoints: number = 0;
  /**
   * Still Alive, Release 7-6: contracted from raw meat, cleared by a per-turn
   * roll or by antiviral pills. A plain own field, so the graph writer carries
   * it with no spec entry -- which is the plan's "0 lines of serialisation" for
   * this feature, and the reason to prefer a bool here over anything richer.
   *
   * `infection` is the *other* status and is easy to confuse with this one: it
   * rises from zombie bites and is cured by antivirals too, but it is a level
   * rather than a flag, and a food-poisoned actor has `infection === 0`.
   */
  isFoodPoisoned: boolean = false;

  /**
   * Blood alcohol, in turns' worth of a standard drink. Still Alive, Release 7-1.
   *
   * A plain int, not a float, because the C#'s is one: one unit of drink is
   * `WorldTime.TURNS_PER_HOUR` (30), and passing out is five units (150). It
   * decays by exactly one per turn, so a survivor who downs five beers is out for
   * two and a half in-game hours. Modelling it as a level rather than a flag is
   * what lets the accuracy penalties have four tiers instead of one.
   *
   * Plain own fields, so the graph writer carries them with no spec entry -- the
   * same as `isFoodPoisoned`.
   */
  /**
   * What killed this actor, as a free-form string: "fire", "zombie bite", ...
   *
   * Still Alive, Release 7-6. Only one value is read today -- butchering checks
   * for `"fire"`, because meat off a body burnt to death comes out *cooked* and
   * anything else comes out raw. That is the whole feature, and it is a
   * surprising one: fire is a cooking method you do not choose.
   *
   * A string rather than an enum because the C# has a string, and because the set
   * of causes is open (every weapon, every hazard). A plain own field, so the
   * graph writer carries it with no spec entry.
   */
  causeOfDeath: string = "";

  bloodAlcohol: number = 0;
  /**
   * Last turn's `bloodAlcohol`, snapshotted at the top of the turn.
   *
   * Needed because the drink effects are *thresholds crossings*, not levels:
   * "vomit if you have just crossed 80%" cannot be expressed as "if BAC >= 80%",
   * or a survivor who is already at 85% would vomit on every can. The
   * `previous < T && current >= T` shape is the C#'s.
   */
  previousBloodAlcohol: number = 0;

  previousFoodPoints: number = 0;
  previousSleepPoints: number = 0;
  previousSanity: number = 0;

  /** C# `HitPoints` — Actor.cs:240 */
  get hitPoints(): number {
    return this._hitPoints;
  }
  set hitPoints(value: number) {
    if (this.isInvincible && value < this._hitPoints) return;
    this._hitPoints = value;
  }

  /** C# `StaminaPoints` — Actor.cs:257 */
  get staminaPoints(): number {
    return this._staminaPoints;
  }
  set staminaPoints(value: number) {
    if (this.isInvincible && value < this._staminaPoints) return;
    this._staminaPoints = value;
  }

  /** C# `FoodPoints` — Actor.cs:274 */
  get foodPoints(): number {
    return this._foodPoints;
  }
  set foodPoints(value: number) {
    if (this.isInvincible && value < this._foodPoints) return;
    this._foodPoints = value;
  }

  /** C# `SleepPoints` — Actor.cs:291 */
  get sleepPoints(): number {
    return this._sleepPoints;
  }
  set sleepPoints(value: number) {
    if (this.isInvincible && value < this._sleepPoints) return;
    this._sleepPoints = value;
  }

  /** C# `Sanity` — Actor.cs:308 */
  get sanity(): number {
    return this._sanity;
  }
  set sanity(value: number) {
    if (this.isInvincible && value < this._sanity) return;
    this._sanity = value;
  }

  /** C# `Infection` — Actor.cs:465. Inverted guard, see above. */
  get infection(): number {
    return this._infection;
  }
  set infection(value: number) {
    if (this.isInvincible && value > this._infection) return;
    this._infection = value;
  }

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

  /**
   * Is this actor on fire? See `ActorFlags.IS_ON_FIRE`.
   *
   * Set and cleared only by `RogueGame.SetActorOnFire` and
   * `RogueGame.ExtinguishOnFireActor` -- the C# keeps the same discipline
   * (`RogueGame.cs:24737` and `:24819`), and it matters: ignition is where fire
   * resistance is consulted, so a bare assignment would let an actor walk through
   * a fire-resistant suit and end up alight anyway.
   */
  get isOnFire(): boolean { return (this.flags & ActorFlags.IS_ON_FIRE) !== 0; }
  set isOnFire(v: boolean) { this.setFlag(ActorFlags.IS_ON_FIRE, v); }

  /** Still Alive, Release 6-1. Water is a hard block on being set alight. */
  get isInWater(): boolean { return (this.flags & ActorFlags.IS_IN_WATER) !== 0; }
  set isInWater(v: boolean) { this.setFlag(ActorFlags.IS_IN_WATER, v); }

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
    // C# is `m_Leader != null && !m_Leader.IsDead` (src/Data/Actor.cs:397-400).
    // The port dropped the liveness test, so a follower whose leader had just
    // died still reported a leader until `removeAllFollowers` ran. That flag
    // gates `checkOurLeader` in CivilianAI / GangAI / SoldierAI / CHARGuardAI
    // and six BaseAI branches, so it decides whether a follower will keep
    // following, hanging around or charging for a corpse.
    return this.leader !== null && !this.leader.isDead;
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

  /** C# `RemoveAllAgressorSelfDefenceRelations` - break every aggressor/self-defence link. */
  removeAllAgressorSelfDefenceRelations(): void {
    // removeAggressorOf/removeSelfDefenceFrom null the list once it empties, so
    // both loops terminate.
    while (this.aggressorOfList !== null) {
      const other = this.aggressorOfList[0];
      this.removeAggressorOf(other);
      other.removeSelfDefenceFrom(this);
    }
    while (this.selfDefenceFromList !== null) {
      const other = this.selfDefenceFromList[0];
      this.removeSelfDefenceFrom(other);
      other.removeAggressorOf(this);
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

