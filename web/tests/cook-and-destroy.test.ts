/**
 * The cooking pair: `COOK_FOOD` and `DESTROY_ITEM`, Release 7-6.
 *
 * Two inventory-key commands the fork added, both of which the port was missing
 * in a way that was *visible*: an item in an open backpack printed a
 * "to destroy" line with an empty bracket, because the destroy command did not
 * exist. Cooking was worse than a missing hint -- the automatic half
 * (`CookFoodOnFires`, four turns of a raw piece by a fire) shipped without the
 * player-facing half at all, so a survivor could cook only by dropping meat on
 * a fire and waiting for the tick.
 *
 * What is under test is both halves of each: the key table (`Ctrl+C` and
 * `Ctrl+D` have to *reach* the commands) and the handlers, driven through the
 * real `MouseToInventoryItem` with a real slot centre rather than by calling a
 * private method -- the slot lookup is half of what the handlers do, since both
 * refuse a target the cursor is not over.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { Item } from "@data/Item";
import { Map as GameMap } from "@data/Map";
import { MapObject, MapObjectBreak, MapObjectFire } from "@data/MapObject";
import { Models } from "@data/Models";
import { Point } from "@engine/Point";
import { INVENTORYPANEL_X, INVENTORYPANEL_Y, RogueGame } from "@engine/RogueGame";
import { InputTranslator, Keybindings } from "@engine/Keybindings";
import { NullRogueUI } from "@ui/NullRogueUI";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameImages } from "@gameplay/GameImages";
import { Barrel } from "@engine/mapobjects/MapObjects";
import { ItemFood } from "@engine/items/ItemFood";
import { PlayerCommand } from "@engine/PlayerCommand";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";

beforeAll(() => {
  new GameActors();
  new GameItems();
});

const survivors = new Faction("The Survivors", "survivor");

let game: RogueGame;
let ui: NullRogueUI;
let actor: Actor;
let map: GameMap;

beforeEach(() => {
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  game = new RogueGame(new NullRogueUI());
  ui = game.m_UI as NullRogueUI;
  // The constructor is (seed, name, width, height) -- passing two numbers sets
  // the *width* and the *name*, and every `placeActor` then fails a bounds check
  // that looks inexplicable. Same note as `tests/cooking.test.ts:46`.
  map = new GameMap(1, "test", 40, 40);
  game.m_Player = actor = new Actor(
    Models.actors.get(ActorID.MALE_CIVILIAN),
    survivors,
    "survivor",
  );
  map.placeActor(actor, new Point(20, 20));
  // Both handlers redraw the play screen, which draws the session's *current*
  // map and the view rect the play loop computes each turn. Without these the
  // handlers throw on state that only exists once a turn has run.
  game.session.currentMap = map;
  game.ComputeViewRect(new Point(20, 20));
});

/**
 * An alight map object at a tile -- the heat source.
 *
 * A bare `MapObject` rather than a barrel or a campfire, as in
 * `tests/cooking.test.ts:65`: the cook handler asks only whether a neighbour
 * `isOnFire`, so a plain object reaches the same code with no fuel to manage.
 * The barrel preference is its own test below.
 */
function lightFire(at: Point): MapObject {
  const obj = new MapObject(
    "fire",
    "Tiles/floor_asphalt",
    MapObjectBreak.BREAKABLE,
    MapObjectFire.BURNABLE,
  );
  obj.fireState = MapObjectFire.ONFIRE;
  map.placeMapObject(obj, at);
  return obj;
}

/** A lit barrel, the "receptacle" the C#'s search prefers over a burning car. */
function litBarrel(at: Point): Barrel {
  const barrel = new Barrel(
    "receptacle",
    GameImages.OBJ_EMPTY_BARREL,
    MapObjectBreak.UNBREAKABLE,
    10,
  );
  barrel.fireState = MapObjectFire.ONFIRE;
  map.placeMapObject(barrel, at);
  return barrel;
}

/** The centre of an inventory slot, in canvas coordinates. */
function slotCentre(slot: number): Point {
  const topLeft = game.InventorySlotToScreen(INVENTORYPANEL_X, INVENTORYPANEL_Y, slot, 0);
  return new Point(topLeft.x + 16, topLeft.y + 16);
}

function rawRabbit(): ItemFood {
  const it = new ItemFood(Models.items.get(ItemID.FOOD_RAW_RABBIT));
  actor.inventory!.addAll(it);
  return it;
}

/** Any ordinary item, for the destroy tests. */
function katana(): Item {
  const it = new Item(Models.items.get(ItemID.MELEE_KATANA));
  actor.inventory!.addAll(it);
  return it;
}

/** Four passes of the per-turn tick, which is what cooks a piece. */
function cookFourTurns(): void {
  for (let i = 0; i < 4; i++) {
    // `CookFoodOnFires` is private; the tick is a per-turn effect and driving
    // `NextMapTurn` for it would start a whole simulation.
    (game as unknown as { CookFoodOnFires(m: GameMap): void }).CookFoodOnFires(map);
  }
}

/** The description of an item in the player's own pack. */
function description(it: Item): string[] {
  return game.DescribeItemLong(it, true, actor.inventory!.items.indexOf(it));
}

describe("the keys reach the commands", () => {
  it("binds Ctrl+C to cooking and Ctrl+D to destroying, as the fork does", () => {
    const kb = new Keybindings();
    expect(kb.getAll(PlayerCommand.COOK_FOOD)).toEqual(["Ctrl+C"]);
    expect(kb.getAll(PlayerCommand.DESTROY_ITEM)).toEqual(["Ctrl+D"]);

    // The chords actually translate, which is the half a key table alone does
    // not prove: `InputTranslator` is what the play loop reads, and a binding it
    // cannot parse is unreachable no matter what `Keybindings` holds.
    expect(InputTranslator.keyToCommand(kb, "c", true, false, false)).toBe(
      PlayerCommand.COOK_FOOD,
    );
    expect(InputTranslator.keyToCommand(kb, "d", true, false, false)).toBe(
      PlayerCommand.DESTROY_ITEM,
    );
  });

  it("dispatches both from the play loop", () => {
    // A source pin rather than a driven turn: the turn loop is hundreds of
    // `case PlayerCommand.*` arms and each has its own test. What must not
    // silently happen is a command with a key, a handler and no `case` -- which
    // is exactly the shape the fork's two took before this.
    //
    // The assertion is on the *call*, not on the case label alone: a `case`
    // whose arm does nothing is the same as no case at all, and it is what a
    // half-landed feature looks like.
    const src = readFileSync(resolve(__dirname, "..", "src/engine/RogueGame.ts"), "utf8");
    const at = src.indexOf("async HandlePlayerActor(");
    expect(at, "HandlePlayerActor is gone").toBeGreaterThan(-1);
    const playLoop = src.slice(at);
    for (const [cmd, handler] of [
      ["COOK_FOOD", "HandlePlayerCookFood"],
      ["DESTROY_ITEM", "HandlePlayerDestroyItem"],
    ] as const) {
      const arm = new RegExp(
        `case PlayerCommand\\.${cmd}\\b[\\s\\S]{0,600}?this\\.${handler}\\(`,
      );
      expect(playLoop, `the play loop never calls ${handler}`).toMatch(arm);
    }
  });
});

describe("HandlePlayerCookFood", () => {
  it("moves one quantity of raw meat onto the fire beside the player", async () => {
    const fire = lightFire(new Point(21, 20));
    const raw = rawRabbit();

    expect(await game.HandlePlayerCookFood(actor, slotCentre(0))).toBe(true);
    // The stack lost exactly one, and the stack itself is still there -- the C#
    // drops a *fresh instance* of the same model rather than moving the stack,
    // which is what stops a stack of six becoming a pile on the floor.
    expect(raw.quantity).toBe(0);
    const onFire = map.getItemsAt(fire.location.position)!;
    expect(onFire.countItems).toBe(1);
    const piece = onFire.getItem(0)!;
    expect(piece).toBeInstanceOf(ItemFood);
    expect(piece.model.id).toBe(ItemID.FOOD_RAW_RABBIT);
    expect(piece.quantity).toBe(1);
    // Lazy workaround, the C#'s word for it: an NPC must not walk off with a
    // piece that is cooking.
    expect(piece.isForbiddenToAI).toBe(true);
  });

  it("spends the action points, as the fork does", async () => {
    lightFire(new Point(21, 20));
    rawRabbit();
    const before = actor.actionPoints;
    await game.HandlePlayerCookFood(actor, slotCentre(0));
    expect(actor.actionPoints).toBe(before - Rules.BASE_ACTION_COST);
  });

  it("cooks on later turns rather than at once", async () => {
    // The whole point of the handler: it moves meat, it does not cook it. Four
    // passes of the tick is what turns the piece into its twin.
    const fire = lightFire(new Point(21, 20));
    rawRabbit();
    await game.HandlePlayerCookFood(actor, slotCentre(0));
    cookFourTurns();
    const after = map.getItemsAt(fire.location.position)!;
    expect(after.getItem(0)!.model.id).toBe(ItemID.FOOD_COOKED_RABBIT);
  });

  it("prefers a barrel over a plain burning object", async () => {
    // The C#'s "prefer receptacles and campfires over cars" break: two burning
    // neighbours, one plain and one a barrel, and the meat must land on the
    // barrel whichever way the compass reaches them.
    lightFire(new Point(20, 19));
    const barrel = litBarrel(new Point(19, 20));
    rawRabbit();
    await game.HandlePlayerCookFood(actor, slotCentre(0));
    expect(map.getItemsAt(new Point(20, 19))?.countItems ?? 0).toBe(0);
    expect(map.getItemsAt(barrel.location.position)!.countItems).toBe(1);
  });

  it("refuses when no neighbouring tile is alight", async () => {
    rawRabbit();
    expect(await game.HandlePlayerCookFood(actor, slotCentre(0))).toBe(false);
    expect(actor.inventory!.countItems).toBe(1);
  });

  it("refuses food that wants no cooking, with the rule's own reason", async () => {
    lightFire(new Point(21, 20));
    const ration = new ItemFood(Models.items.get(ItemID.FOOD_ARMY_RATION));
    actor.inventory!.addAll(ration);
    expect(await game.HandlePlayerCookFood(actor, slotCentre(0))).toBe(false);
    expect(actor.inventory!.contains(ration)).toBe(true);
  });

  it("refuses a target the cursor is not over", async () => {
    lightFire(new Point(21, 20));
    rawRabbit();
    // A point in the middle of the map panel, far from any inventory slot.
    expect(await game.HandlePlayerCookFood(actor, new Point(400, 300))).toBe(false);
    expect(actor.inventory!.countItems).toBe(1);
  });
});

/**
 * Stops the play-screen redraw the destroy handler brackets its confirm with.
 *
 * A full redraw needs a whole session -- world, weather, current map, view
 * rect -- which is what an integration test builds and this one is not. The
 * redraw is not the subject; the removal is. Stubbed on the instance rather
 * than by subclassing `RogueGame`, because a stub that reaches `NullRogueUI`'s
 * counters is the only difference between the two.
 */
function noRedraw(): void {
  game.RedrawPlayScreen = () => {};
}

describe("HandlePlayerDestroyItem", () => {
  it("destroys the item under the cursor when the player says yes", async () => {
    const it = katana();
    noRedraw();
    ui.pushKeys("y");
    await game.HandlePlayerDestroyItem(actor, slotCentre(0));
    expect(actor.inventory!.contains(it)).toBe(false);
  });

  it("keeps it when the player says no", async () => {
    const it = katana();
    noRedraw();
    ui.pushKeys("n");
    await game.HandlePlayerDestroyItem(actor, slotCentre(0));
    expect(actor.inventory!.contains(it)).toBe(true);
  });

  it("does nothing when the cursor is over nothing", async () => {
    const it = katana();
    noRedraw();
    await game.HandlePlayerDestroyItem(actor, new Point(400, 300));
    expect(actor.inventory!.contains(it)).toBe(true);
  });
});

describe("the item descriptions name the two keys", () => {
  it("offers to destroy anything in the player's pack", () => {
    const lines = description(katana());
    expect(lines).toContain("to destroy : <Ctrl+D>");
  });

  it("offers to cook raw meat, last of the special keys", () => {
    const lines = description(rawRabbit());
    // C# `RogueGame.cs:32030`, landing in `inInvAdditionalDesc` -- which the
    // description emits after every other special key.
    expect(lines[lines.length - 1]).toBe("to cook : <Ctrl+C>");
  });

  it("does not offer to cook food that is already cooked", () => {
    const cooked = new ItemFood(Models.items.get(ItemID.FOOD_COOKED_RABBIT));
    actor.inventory!.addAll(cooked);
    expect(description(cooked).join("\n")).not.toContain("to cook");
  });
});
