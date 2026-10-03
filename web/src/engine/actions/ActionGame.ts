/**
 * The slice of `RogueGame` that `ActorAction` implementations are allowed to
 * reach — the seam `actions/Actions.ts` has always had and never typed.
 *
 * ## Why this exists
 *
 * `ActorAction.game` was `any`, and `Actions.ts` declared `type Game = any` with
 * the note that it kept the type loose "so this file has no circular dependency on
 * the RogueGame class (which hasn't been ported yet)". RogueGame *has* been
 * ported: it is 36,802 lines. The comment outlived its reason, and `any` outlived
 * the comment.
 *
 * The cost was not hypothetical. `RogueGame` carries 38 lowercase `do*` aliases
 * whose entire stated purpose is to let actions call `game.doWait(...)` in
 * camelCase — §6.5 of the port plan calls the block a "pure adapter" that "exists
 * solely so `Actions.ts` can use camelCase", and measures it at 215 lines and one
 * consumer. With `game` typed `any`, **none of those 38 aliases was checked against
 * anything.** A rename on the `Do*` side, a dropped parameter, or an arity change
 * would compile, ship, and fail at runtime in the middle of an NPC's turn.
 *
 * ## Every member here was measured, not chosen
 *
 * `Actions.ts` reaches exactly 39 members on `this.game`: the 38 aliases and
 * `rules`. Nothing was included because it looked relevant — a first draft listed
 * six more (`doUseMedicineItem`, `doTag`, `doThrowGrenade`, …) on the reasoning
 * that actions surely narrow items before using them, and every one turned out to
 * be uncalled. This interface is the set of calls that exist, so an unused member
 * here is a false claim that `implements` will then fail on.
 *
 * ## What is deliberately *not* here
 *
 * The `Do*` methods themselves. The actions call the lowercase aliases, so those
 * are the contract — and the aliases are one-line delegations, which means this
 * interface stays checkable against them without duplicating a signature. §6.8
 * keeps the `Do*`/`On*` block on `RogueGame` permanently anyway: it is Hub 1, the
 * 410-edge hub the split exists to protect, not something an action may reach past
 * the adapter to use.
 *
 * ## Why it lives in `engine/actions/` and not on `RogueGame`
 *
 * Declaring it as `RogueGame` would be the circular import the old comment feared.
 * A structural interface in the leaf that consumes it is not: `RogueGame` already
 * imports `Actions.ts`, one direction, and `implements` adds no import at all — it
 * is a compile-time assertion in each file, not a runtime relationship.
 */

import type { Actor } from "@data/Actor";
import type { FireMode } from "@data/Attack";
import type { Corpse } from "@data/Corpse";
import type { Item } from "@data/Item";
import type { Location } from "@data/Location";
import type { MapObject } from "@data/MapObject";
import type { Direction } from "@engine/Direction";
import type { ItemSprayScent } from "@engine/items/ItemMisc";
import type {
	DoorWindow,
	Fortification,
	PowerGenerator,
} from "@engine/mapobjects/MapObjects";
import type { Point } from "@engine/Point";
import type { Rules } from "@engine/Rules";
// `SayFlags` is declared in `Actions.ts`, which imports this file. That is a
// type-only cycle, which TypeScript erases and which costs nothing at runtime —
// but it is only safe because both edges are `import type`. Widening either one
// to a value import turns this into a real cycle, so keep them as they are.
import type { SayFlags } from "@engine/actions/Actions";

export interface ActionGame {
	/**
	 * The rule checker, reached by 37 of the 39 call sites — every `isLegal()`.
	 *
	 * On `RogueGame` this is the `rules` getter over `m_Rules`.
	 */
	readonly rules: Rules;

	// ── The adapter block: C# `Do*`, camelCase for actions. ───────────────────
	//
	// Signatures transcribed from the corresponding alias on `RogueGame`, so the
	// two are checked against each other by `implements` rather than kept in step
	// by hand. `doDropItem` is the one that differs from its `Do*` target on
	// purpose — it is `async` there and the alias is too, because
	// `ActionDropItem.perform()` calls it without awaiting.
	doBarricadeDoor(actor: Actor, door: DoorWindow): void;
	doBreak(actor: Actor, mapObj: MapObject): Promise<void>;
	doBuildFortification(actor: Actor, buildPos: Point, isLarge: boolean): Promise<void>;
	doChat(speaker: Actor, target: Actor): Promise<void>;
	doCloseDoor(actor: Actor, door: DoorWindow): void;
	doDropItem(actor: Actor, it: Item): Promise<void>;
	doEatCorpse(a: Actor, c: Corpse): void;
	doEatFoodFromGround(actor: Actor, it: Item): void;
	doEquipItem(actor: Actor, it: Item): void;
	doLeaveMap(actor: Actor, exitPoint: Point, askForConfirmation: boolean): Promise<boolean>;
	doMeleeAttack(attacker: Actor, defender: Actor): Promise<void>;
	doMoveActor(actor: Actor, direction: Location | Direction): Promise<void>;
	doOpenDoor(actor: Actor, door: DoorWindow): void;
	doPull(actor: Actor, mapObj: MapObject, moveActorToPos: Point): Promise<void>;
	doPush(actor: Actor, mapObj: MapObject, toPos: Point): Promise<void>;
	doRangedAttack(attacker: Actor, defender: Actor, LoF: Point[], mode: FireMode): Promise<void>;
	doRechargeItemBattery(actor: Actor, it: Item): void;
	doRepairFortification(actor: Actor, fort: Fortification): void;
	doReviveCorpse(actor: Actor, corpse: Corpse): void;
	doSay(speaker: Actor, target: Actor, text: string, flags: SayFlags): Promise<void>;
	doShout(speaker: Actor, text: string | null): Promise<void>;
	doSprayOdorSuppressor(actor: Actor, suppressor: ItemSprayScent, sprayOn: Actor): void;
	doStartDragCorpse(a: Actor, c: Corpse): void;
	doStartSleeping(actor: Actor): void;
	doStealLead(actor: Actor, other: Actor): Promise<void>;
	doStopDragCorpse(a: Actor, c: Corpse): void;
	doSwitchPlace(actor: Actor, other: Actor): void;
	doSwitchPowerGenerator(actor: Actor, powGen: PowerGenerator): Promise<void>;
	doTakeFromContainer(actor: Actor, position: Point): void;
	doTakeItem(actor: Actor, position: Point, it: Item): void;
	doTakeLead(actor: Actor, other: Actor): Promise<void>;
	doThrowGrenadePrimed(actor: Actor, targetPos: Point): Promise<void>;
	doThrowGrenadeUnprimed(actor: Actor, targetPos: Point): Promise<void>;
	doTrade(speaker: Actor, target: Actor): Promise<void>;
	doUnequipItem(actor: Actor, it: Item, canMessage?: boolean): void;
	doUseExit(actor: Actor, exitPoint: Point): Promise<boolean>;
	doUseItem(actor: Actor, it: Item): Promise<void>;
	doWait(actor: Actor, isFishing?: boolean): void;
}
