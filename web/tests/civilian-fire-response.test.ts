import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Actor } from "@data/Actor";
import { Activity } from "@data/Activity";
import { ActorOrder, ActorTasks } from "@data/ActorOrder";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { ActionMoveStep, ActionWait } from "@engine/actions/Actions";
import { coordKey } from "@engine/CoordKey";
import { Point } from "@engine/Point";
import { Ruleset, Session } from "@engine/Session";
import { ItemRangedWeapon } from "@engine/items/ItemWeapon";
import { CivilianAI } from "@gameplay/ai/CivilianAI";
import { LOSSensor } from "@gameplay/ai/GameplaySensors";
import { ActorID } from "@gameplay/GameActors";
import { FactionID } from "@gameplay/GameFactions";
import { ItemID } from "@gameplay/GameItems";
import { TileID } from "@gameplay/GameTiles";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";

class ProbeAI extends CivilianAI {
  select(game: HeadlessRunner["rogueGame"]) { return this.selectAction(game, []); }
  equip(game: HeadlessRunner["rogueGame"]) { return this.behaviorEquipBestItems(game, true, true); }
}

let previousRuleset: Ruleset;
beforeEach(() => { previousRuleset = Session.get().ruleset; });
afterEach(() => {
  Session.get().ruleset = previousRuleset;
  vi.restoreAllMocks();
});

function scenario() {
  const game = new HeadlessRunner(4242).rogueGame;
  const map = new GameMap(4242, "fire response", 10, 10);
  for (let x = 0; x < map.width; x++) for (let y = 0; y < map.height; y++) {
    map.setTileModelAt(x, y, Models.tiles.get(TileID.FLOOR_CONCRETE));
  }
  const actor = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), Models.factions.get(FactionID.TheSurvivors));
  map.placeActor(actor, new Point(4, 4));
  actor.isOnFire = true;
  const ai = new ProbeAI();
  ai.takeControl(actor);
  const order = new ActorOrder(ActorTasks.GUARD, actor.location);
  ai.setOrder(order);
  // A real unequipped weapon makes the old equipment-first path observable.
  actor.inventory!.addAll(new ItemRangedWeapon(Models.items.get(ItemID.RANGED_SHOTGUN)));
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  return { game, map, actor, ai, order };
}

describe("a burning civilian's priorities", () => {
  it("waits to extinguish before equipping or following an order", () => {
    const { game, actor, ai, order } = scenario();
    expect(ai.equip(game)).not.toBeNull();
    expect(ai.select(game)).toBeInstanceOf(ActionWait);
    expect(actor.activity).toBe(Activity.FLEEING);
    expect(ai.order).toBe(order);
    expect(actor.getEquippedWeapon()).toBeNull();
  });

  it("moves toward visible water before equipping or following an order", () => {
    const { game, map, actor, ai, order } = scenario();
    map.hasWaterTiles = true;
    map.setTileModelAt(5, 4, Models.tiles.get(TileID.FLOOR_SEWER_WATER));
    const sensor = (ai as unknown as { m_LOSSensor: LOSSensor }).m_LOSSensor;
    vi.spyOn(sensor, "fov", "get").mockReturnValue(new Set([coordKey(5, 4)]));
    expect(ai.select(game)).toBeInstanceOf(ActionMoveStep);
    expect(actor.isRunning).toBe(true);
    expect(actor.activity).toBe(Activity.FLEEING);
    expect(ai.order).toBe(order);
    expect(actor.getEquippedWeapon()).toBeNull();
  });

  it("interrupts a valid order when equipment is already settled", () => {
    const { game, map, actor, ai, order } = scenario();
    for (const item of [...actor.inventory!.items]) actor.inventory!.removeAllQuantity(item);
    const leader = new Actor(actor.model, actor.faction);
    map.placeActor(leader, new Point(3, 4));
    leader.addFollower(actor);
    expect(ai.equip(game)).toBeNull();
    expect(ai.select(game)).toBeInstanceOf(ActionWait);
    expect(actor.activity).toBe(Activity.FLEEING);
    expect(ai.order).toBe(order);
  });

  it.each([Ruleset.CLASSIC, Ruleset.STILL_ALIVE])("retains routine equipment decisions when fire response is inactive (%s)", (ruleset) => {
    const { game, actor, ai } = scenario();
    Session.get().ruleset = ruleset;
    if (ruleset === Ruleset.STILL_ALIVE) actor.isOnFire = false;
    expect(ai.select(game)?.constructor).toBe(ai.equip(game)?.constructor);
    expect(actor.activity).not.toBe(Activity.FLEEING);
  });
});
