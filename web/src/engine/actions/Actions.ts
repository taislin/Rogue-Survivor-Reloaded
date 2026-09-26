/**
 * Concrete ActorAction implementations.
 * Ported from src/Engine/Actions/*.cs
 *
 * Each action holds a reference to the actor and the game, stores extra
 * parameters, and implements IsLegal() + Perform() by delegating to the
 * game's rule-checker and "Do*" mutation methods.
 *
 * The game / rules interfaces are kept as `any` here so that this file has
 * no circular dependency on the RogueGame class (which hasn't been ported yet).
 * Callers must supply the correct game object.
 */

import { Actor } from '@data/Actor';
import { ActorAction } from '@data/ActorAction';
import { FireMode } from '@data/Attack';
import { Corpse } from '@data/Corpse';
import { Item } from '@data/Item';
import { Location } from '@data/Location';
import { MapObject } from '@data/MapObject';
import { Direction } from '@engine/Direction';
import { Point } from '@engine/Point';
import { ItemPrimedExplosive } from '@engine/items/ItemExplosive';

// ────────────────────────────────────────────────────────────────────────────
// Helpers – thin interface used to avoid pulling the whole RogueGame class.
// ────────────────────────────────────────────────────────────────────────────

/** Subset of RogueGame accessed by actions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

// ────────────────────────────────────────────────────────────────────────────
// ActionWait
// ────────────────────────────────────────────────────────────────────────────

export class ActionWait extends ActorAction {
  constructor(actor: Actor, game: Game) {
    super(actor, game);
  }

  isLegal(): boolean {
    return true;
  }

  perform(): void {
    this.game.doWait(this.actor);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionSleep
// ────────────────────────────────────────────────────────────────────────────

export class ActionSleep extends ActorAction {
  constructor(actor: Actor, game: Game) {
    super(actor, game);
  }

  isLegal(): boolean {
    const result = this.game.rules.canActorSleep(this.actor);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doStartSleeping(this.actor);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionMoveStep
// ────────────────────────────────────────────────────────────────────────────

export class ActionMoveStep extends ActorAction {
  private newLocation: Location;

  constructor(actor: Actor, game: Game, directionOrPoint: Direction | Point) {
    super(actor, game);
    if (directionOrPoint instanceof Direction) {
      this.newLocation = actor.location.addDirection(directionOrPoint);
    } else {
      this.newLocation = new Location(actor.location.map, directionOrPoint);
    }
  }

  isLegal(): boolean {
    const result = this.game.rules.isWalkableFor(
      this.actor,
      this.newLocation.map!,
      this.newLocation.position.x,
      this.newLocation.position.y
    );
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doMoveActor(this.actor, this.newLocation);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionBump
// High-level bump: resolves into move / use / attack / chat at construction.
// ────────────────────────────────────────────────────────────────────────────

export class ActionBump extends ActorAction {
  readonly direction: Direction;
  readonly concreteAction: ActorAction | null;

  constructor(actor: Actor, game: Game, direction: Direction) {
    super(actor, game);
    this.direction = direction;
    const newLoc = actor.location.addDirection(direction);
    const result = game.rules.isBumpableFor(actor, game, newLoc.map!, newLoc.position.x, newLoc.position.y);
    this.concreteAction = result.action ?? null;
    if (!result.action) this.failReason = result.reason;
  }

  isLegal(): boolean {
    if (this.concreteAction === null) return false;
    return this.concreteAction.isLegal();
  }

  perform(): void {
    this.concreteAction?.perform();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionMeleeAttack
// ────────────────────────────────────────────────────────────────────────────

export class ActionMeleeAttack extends ActorAction {
  readonly target: Actor;

  constructor(actor: Actor, game: Game, target: Actor) {
    super(actor, game);
    this.target = target;
  }

  isLegal(): boolean {
    return true; // handled upstream in rules
  }

  perform(): void {
    this.game.doMeleeAttack(this.actor, this.target);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionRangedAttack
// ────────────────────────────────────────────────────────────────────────────

// C# declares FireMode once, in Data/Attack.cs - reuse that definition.
export { FireMode };

export class ActionRangedAttack extends ActorAction {
  readonly target: Actor;
  readonly mode: FireMode;
  private lof: Point[] = [];

  constructor(actor: Actor, game: Game, target: Actor, mode: FireMode = FireMode.DEFAULT) {
    super(actor, game);
    this.target = target;
    this.mode = mode;
  }

  isLegal(): boolean {
    this.lof = [];
    const result = this.game.rules.canActorFireAt(this.actor, this.target, this.lof);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doRangedAttack(this.actor, this.target, this.lof, this.mode);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionThrowGrenade
// ────────────────────────────────────────────────────────────────────────────

export class ActionThrowGrenade extends ActorAction {
  readonly throwPos: Point;

  constructor(actor: Actor, game: Game, throwPos: Point) {
    super(actor, game);
    this.throwPos = throwPos;
  }

  isLegal(): boolean {
    const result = this.game.rules.canActorThrowTo(this.actor, this.throwPos, null);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    const grenade = this.actor.getEquippedWeapon();
    if (grenade instanceof ItemPrimedExplosive) {
      this.game.doThrowGrenadePrimed(this.actor, this.throwPos);
    } else {
      this.game.doThrowGrenadeUnprimed(this.actor, this.throwPos);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionOpenDoor
// ────────────────────────────────────────────────────────────────────────────

export class ActionOpenDoor extends ActorAction {
  private door: MapObject;

  constructor(actor: Actor, game: Game, door: MapObject) {
    super(actor, game);
    this.door = door;
  }

  isLegal(): boolean {
    const result = this.game.rules.isOpenableFor(this.actor, this.door);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doOpenDoor(this.actor, this.door);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionCloseDoor
// ────────────────────────────────────────────────────────────────────────────

export class ActionCloseDoor extends ActorAction {
  private door: MapObject;

  constructor(actor: Actor, game: Game, door: MapObject) {
    super(actor, game);
    this.door = door;
  }

  isLegal(): boolean {
    const result = this.game.rules.isClosableFor(this.actor, this.door);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doCloseDoor(this.actor, this.door);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionBashDoor
// ────────────────────────────────────────────────────────────────────────────

export class ActionBashDoor extends ActorAction {
  private door: MapObject;

  constructor(actor: Actor, game: Game, door: MapObject) {
    super(actor, game);
    this.door = door;
  }

  isLegal(): boolean {
    const result = this.game.rules.isBashableFor(this.actor, this.door);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doBreak(this.actor, this.door);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionBarricadeDoor
// ────────────────────────────────────────────────────────────────────────────

export class ActionBarricadeDoor extends ActorAction {
  private door: MapObject;

  constructor(actor: Actor, game: Game, door: MapObject) {
    super(actor, game);
    this.door = door;
  }

  isLegal(): boolean {
    const result = this.game.rules.canActorBarricadeDoor(this.actor, this.door);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doBarricadeDoor(this.actor, this.door);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionBreak
// ────────────────────────────────────────────────────────────────────────────

export class ActionBreak extends ActorAction {
  readonly mapObject: MapObject;

  constructor(actor: Actor, game: Game, obj: MapObject) {
    super(actor, game);
    this.mapObject = obj;
  }

  isLegal(): boolean {
    const result = this.game.rules.isBreakableFor(this.actor, this.mapObject);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doBreak(this.actor, this.mapObject);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionBuildFortification
// ────────────────────────────────────────────────────────────────────────────

export class ActionBuildFortification extends ActorAction {
  readonly buildPos: Point;
  readonly isLarge: boolean;

  constructor(actor: Actor, game: Game, buildPos: Point, isLarge: boolean) {
    super(actor, game);
    this.buildPos = buildPos;
    this.isLarge = isLarge;
  }

  isLegal(): boolean {
    return this.game.rules.canActorBuildFortification(this.actor, this.buildPos, this.isLarge).ok;
  }

  perform(): void {
    this.game.doBuildFortification(this.actor, this.buildPos, this.isLarge);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionRepairFortification
// ────────────────────────────────────────────────────────────────────────────

export class ActionRepairFortification extends ActorAction {
  private fort: MapObject;

  constructor(actor: Actor, game: Game, fort: MapObject) {
    super(actor, game);
    this.fort = fort;
  }

  isLegal(): boolean {
    const result = this.game.rules.canActorRepairFortification(this.actor, this.fort);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doRepairFortification(this.actor, this.fort);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionSwitchPowerGenerator
// ────────────────────────────────────────────────────────────────────────────

export class ActionSwitchPowerGenerator extends ActorAction {
  private powGen: MapObject;

  constructor(actor: Actor, game: Game, powGen: MapObject) {
    super(actor, game);
    this.powGen = powGen;
  }

  isLegal(): boolean {
    const result = this.game.rules.isSwitchableFor(this.actor, this.powGen);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doSwitchPowerGenerator(this.actor, this.powGen);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionPush
// ────────────────────────────────────────────────────────────────────────────

export class ActionPush extends ActorAction {
  readonly direction: Direction;
  readonly to: Point;
  private obj: MapObject;

  constructor(actor: Actor, game: Game, pushObj: MapObject, pushDir: Direction) {
    super(actor, game);
    this.obj = pushObj;
    this.direction = pushDir;
    this.to = pushDir.applyTo(pushObj.location!.position);
  }

  isLegal(): boolean {
    const r1 = this.game.rules.canActorPush(this.actor, this.obj);
    const r2 = this.game.rules.canPushObjectTo(this.obj, this.to);
    if (!r2.ok) this.failReason = r2.reason;
    return r1.ok && r2.ok;
  }

  perform(): void {
    this.game.doPush(this.actor, this.obj, this.to);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionPull
// ────────────────────────────────────────────────────────────────────────────

export class ActionPull extends ActorAction {
  readonly moveActorDirection: Direction;
  readonly moveActorTo: Point;
  private obj: MapObject;

  constructor(actor: Actor, game: Game, pullObj: MapObject, moveActorDir: Direction) {
    super(actor, game);
    this.obj = pullObj;
    this.moveActorDirection = moveActorDir;
    this.moveActorTo = moveActorDir.applyTo(actor.location.position);
  }

  isLegal(): boolean {
    const result = this.game.rules.canPullObject(this.actor, this.obj, this.moveActorTo);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doPull(this.actor, this.obj, this.moveActorTo);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionUseItem
// ────────────────────────────────────────────────────────────────────────────

export class ActionUseItem extends ActorAction {
  private item: Item;

  constructor(actor: Actor, game: Game, item: Item) {
    super(actor, game);
    this.item = item;
  }

  isLegal(): boolean {
    const result = this.game.rules.canActorUseItem(this.actor, this.item);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doUseItem(this.actor, this.item);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionDropItem
// ────────────────────────────────────────────────────────────────────────────

export class ActionDropItem extends ActorAction {
  private item: Item;

  constructor(actor: Actor, game: Game, item: Item) {
    super(actor, game);
    this.item = item;
  }

  isLegal(): boolean {
    const result = this.game.rules.canActorDropItem(this.actor, this.item);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doDropItem(this.actor, this.item);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionTakeItem
// ────────────────────────────────────────────────────────────────────────────

export class ActionTakeItem extends ActorAction {
  private position: Point;
  private item: Item;

  constructor(actor: Actor, game: Game, position: Point, item: Item) {
    super(actor, game);
    this.position = position;
    this.item = item;
  }

  isLegal(): boolean {
    const result = this.game.rules.canActorGetItem(this.actor, this.item);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doTakeItem(this.actor, this.position, this.item);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionGetFromContainer
// ────────────────────────────────────────────────────────────────────────────

export class ActionGetFromContainer extends ActorAction {
  private position: Point;

  constructor(actor: Actor, game: Game, position: Point) {
    super(actor, game);
    this.position = position;
  }

  /** Gets the top item from the container at this position. */
  get item(): Item | undefined {
    return this.actor.location.map?.getItemsAt(this.position)?.topItem ?? undefined;
  }

  isLegal(): boolean {
    const result = this.game.rules.canActorGetItemFromContainer(this.actor, this.position);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doTakeFromContainer(this.actor, this.position);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionEquipItem
// ────────────────────────────────────────────────────────────────────────────

export class ActionEquipItem extends ActorAction {
  private item: Item;

  constructor(actor: Actor, game: Game, item: Item) {
    super(actor, game);
    this.item = item;
  }

  isLegal(): boolean {
    const result = this.game.rules.canActorEquipItem(this.actor, this.item);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doEquipItem(this.actor, this.item);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionUnequipItem
// ────────────────────────────────────────────────────────────────────────────

export class ActionUnequipItem extends ActorAction {
  private item: Item;

  constructor(actor: Actor, game: Game, item: Item) {
    super(actor, game);
    this.item = item;
  }

  isLegal(): boolean {
    const result = this.game.rules.canActorUnequipItem(this.actor, this.item);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doUnequipItem(this.actor, this.item);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionRechargeItemBattery
// ────────────────────────────────────────────────────────────────────────────

export class ActionRechargeItemBattery extends ActorAction {
  private item: Item;

  constructor(actor: Actor, game: Game, item: Item) {
    super(actor, game);
    this.item = item;
  }

  isLegal(): boolean {
    const result = this.game.rules.canActorRechargeItemBattery(this.actor, this.item);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doRechargeItemBattery(this.actor, this.item);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionEatCorpse
// ────────────────────────────────────────────────────────────────────────────

export class ActionEatCorpse extends ActorAction {
  readonly target: Corpse;

  constructor(actor: Actor, game: Game, target: Corpse) {
    super(actor, game);
    this.target = target;
  }

  isLegal(): boolean {
    const result = this.game.rules.canActorEatCorpse(this.actor, this.target);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doEatCorpse(this.actor, this.target);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionEatFoodOnGround
// ────────────────────────────────────────────────────────────────────────────

export class ActionEatFoodOnGround extends ActorAction {
  private item: Item;

  constructor(actor: Actor, game: Game, item: Item) {
    super(actor, game);
    this.item = item;
  }

  isLegal(): boolean {
    const result = this.game.rules.canActorEatFoodOnGround(this.actor, this.item);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doEatFoodFromGround(this.actor, this.item);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionReviveCorpse
// ────────────────────────────────────────────────────────────────────────────

export class ActionReviveCorpse extends ActorAction {
  readonly target: Corpse;

  constructor(actor: Actor, game: Game, target: Corpse) {
    super(actor, game);
    this.target = target;
  }

  isLegal(): boolean {
    const result = this.game.rules.canActorReviveCorpse(this.actor, this.target);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doReviveCorpse(this.actor, this.target);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionStartDragCorpse
// ────────────────────────────────────────────────────────────────────────────

export class ActionStartDragCorpse extends ActorAction {
  readonly target: Corpse;

  constructor(actor: Actor, game: Game, target: Corpse) {
    super(actor, game);
    this.target = target;
  }

  isLegal(): boolean {
    const result = this.game.rules.canActorStartDragCorpse(this.actor, this.target);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doStartDragCorpse(this.actor, this.target);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionStopDragCorpse
// ────────────────────────────────────────────────────────────────────────────

export class ActionStopDragCorpse extends ActorAction {
  readonly target: Corpse;

  constructor(actor: Actor, game: Game, target: Corpse) {
    super(actor, game);
    this.target = target;
  }

  isLegal(): boolean {
    const result = this.game.rules.canActorStopDragCorpse(this.actor, this.target);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doStopDragCorpse(this.actor, this.target);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionChat
// ────────────────────────────────────────────────────────────────────────────

export class ActionChat extends ActorAction {
  readonly target: Actor;

  constructor(actor: Actor, game: Game, target: Actor) {
    super(actor, game);
    this.target = target;
  }

  isLegal(): boolean {
    return true;
  }

  perform(): void {
    this.game.doChat(this.actor, this.target);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SayFlags – mirrors RogueGame.Sayflags
// ────────────────────────────────────────────────────────────────────────────

// Mirrors RogueGame.Sayflags (IS_FREE_ACTION = does not cost action points).
export enum SayFlags {
  NONE = 0,
  IS_IMPORTANT = 1 << 0,
  IS_FREE_ACTION = 1 << 1,
  IS_DANGER = 1 << 2,
}

// ────────────────────────────────────────────────────────────────────────────
// ActionSay
// ────────────────────────────────────────────────────────────────────────────

export class ActionSay extends ActorAction {
  readonly target: Actor;
  readonly text: string;
  readonly flags: SayFlags;

  constructor(actor: Actor, game: Game, target: Actor, text: string, flags: SayFlags = SayFlags.NONE) {
    super(actor, game);
    this.target = target;
    this.text = text;
    this.flags = flags;
  }

  isLegal(): boolean {
    return true;
  }

  perform(): void {
    this.game.doSay(this.actor, this.target, this.text, this.flags);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionShout
// ────────────────────────────────────────────────────────────────────────────

export class ActionShout extends ActorAction {
  readonly text: string | null;

  constructor(actor: Actor, game: Game, text: string | null = null) {
    super(actor, game);
    this.text = text;
  }

  isLegal(): boolean {
    const result = this.game.rules.canActorShout(this.actor);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doShout(this.actor, this.text);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionTrade
// ────────────────────────────────────────────────────────────────────────────

export class ActionTrade extends ActorAction {
  readonly target: Actor;

  constructor(actor: Actor, game: Game, target: Actor) {
    super(actor, game);
    this.target = target;
  }

  isLegal(): boolean {
    return this.game.rules.canActorInitiateTradeWith(this.actor, this.target).ok;
  }

  perform(): void {
    this.game.doTrade(this.actor, this.target);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionSwitchPlace
// ────────────────────────────────────────────────────────────────────────────

export class ActionSwitchPlace extends ActorAction {
  readonly target: Actor;

  constructor(actor: Actor, game: Game, target: Actor) {
    super(actor, game);
    this.target = target;
  }

  isLegal(): boolean {
    return this.game.rules.canActorSwitchPlaceWith(this.actor, this.target).ok;
  }

  perform(): void {
    this.game.doSwitchPlace(this.actor, this.target);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionTakeLead
// ────────────────────────────────────────────────────────────────────────────

export class ActionTakeLead extends ActorAction {
  readonly target: Actor;

  constructor(actor: Actor, game: Game, target: Actor) {
    super(actor, game);
    this.target = target;
  }

  isLegal(): boolean {
    return this.game.rules.canActorTakeLead(this.actor, this.target).ok;
  }

  perform(): void {
    if (this.target.hasLeader) {
      this.game.doStealLead(this.actor, this.target);
    } else {
      this.game.doTakeLead(this.actor, this.target);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionLeaveMap
// ────────────────────────────────────────────────────────────────────────────

export class ActionLeaveMap extends ActorAction {
  readonly exitPoint: Point;

  constructor(actor: Actor, game: Game, exitPoint: Point) {
    super(actor, game);
    this.exitPoint = exitPoint;
  }

  isLegal(): boolean {
    const result = this.game.rules.canActorLeaveMap(this.actor);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doLeaveMap(this.actor, this.exitPoint, true);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionUseExit
// ────────────────────────────────────────────────────────────────────────────

export class ActionUseExit extends ActorAction {
  readonly exitPoint: Point;

  constructor(actor: Actor, game: Game, exitPoint: Point) {
    super(actor, game);
    this.exitPoint = exitPoint;
  }

  isLegal(): boolean {
    const result = this.game.rules.canActorUseExit(this.actor, this.exitPoint);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doUseExit(this.actor, this.exitPoint);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ActionSprayOdorSuppressor
// ────────────────────────────────────────────────────────────────────────────

export class ActionSprayOdorSuppressor extends ActorAction {
  private spray: Item;
  readonly sprayOn: Actor;

  constructor(actor: Actor, game: Game, spray: Item, sprayOn: Actor) {
    super(actor, game);
    this.spray = spray;
    this.sprayOn = sprayOn;
  }

  isLegal(): boolean {
    const result = this.game.rules.canActorSprayOdorSuppressor(this.actor, this.spray, this.sprayOn);
    if (!result.ok) this.failReason = result.reason;
    return result.ok;
  }

  perform(): void {
    this.game.doSprayOdorSuppressor(this.actor, this.spray, this.sprayOn);
  }
}
