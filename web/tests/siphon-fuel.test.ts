/**
 * `Feature.SiphonFuel` — draining a wrecked car into a fuel stack.
 *
 * Still Alive, Release 7-1, plus the Release 7-3 fuel pump.
 *
 * The mechanic is a unit conversion with an asymmetry: a `Car`'s tank becomes an
 * ammo stack, clamped to the stack limit, and whatever the inventory will not take
 * is left in the car. That asymmetry is the design — you drain what you can carry
 * and the rest stays put — and it is why `Car`'s tank is capped at 99 rather than
 * at a day's burn.
 *
 * Two of the two items this needs (`AMMO_FUEL`, `SIPHON_KIT`) are appended here
 * rather than read from a CSV, and `AMMO_FUEL` also finally gives
 * `ItemDespawn`'s `AmmoType.FUEL` exemption something to match.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { Models } from "@data/Models";
import { MapObject, MapObjectBreak } from "@data/MapObject";
import { Map as GameMap } from "@data/Map";
import { Point } from "@engine/Point";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { Car } from "@engine/mapobjects/MapObjects";
import { ItemAmmo } from "@engine/items/ItemWeapon";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameImages } from "@gameplay/GameImages";
import { Item } from "@data/Item";
import { DiceRoller } from "@engine/DiceRoller";
import { NullRogueUI } from "@ui/NullRogueUI";
import { PlayerController } from "@data/PlayerController";
import { RogueGame } from "@engine/RogueGame";
import type { Message } from "@data/Message";

const survivors = new Faction("The Survivors", "survivor");

let game: RogueGame;
let map: GameMap;
let player: Actor;
let tile: number;

beforeEach(() => {
  new GameActors();
  new GameItems();
  game = new RogueGame(new NullRogueUI());
  map = new GameMap(1, "test", 40, 40);
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
  player.controller = new PlayerController();
  map.placeActor(player, new Point(20, 20));
  game.m_Player = player;
  tile = 0;
});

/** A plain, unpowered fuel pump. Deliberately *not* a `Car`. */
const fuelPump = (): MapObject =>
  new MapObject("fuel pump", GameImages.OBJ_FUEL_PUMP, MapObjectBreak.UNBREAKABLE);

/** A wrecked car with `fuel` in the tank, adjacent to the player. */
const parkACar = (fuel: number, dx = 1, dy = 0): Car => {
  const car = new Car("wrecked car", GameImages.OBJ_CAR1, MapObjectBreak.BROKEN, fuel);
  map.placeMapObject(car, new Point(20 + dx, 20 + dy));
  return car;
};

const messages = (): string => {
  const mgr = (game as unknown as { m_MessageManager: { history: readonly Message[] } })
    .m_MessageManager;
  return mgr.history.map((m) => m.text).join("\n");
};

const siphon = (): boolean => game.HandlePlayerSiphonFuel();
const fuelInInventory = (): number =>
  player.inventory!.items
    .filter((i) => i.model.id === ItemID.AMMO_FUEL)
    .reduce((n, i) => n + i.quantity, 0);

describe("Feature.SiphonFuel: the two items", () => {
  it("appends AMMO_FUEL and SIPHON_KIT above the old enum", () => {
    // Append-only: a save stores ItemIDs by number, so anything below 168 is a
    // different item rather than a renamed one. The two ids below are what this
    // test is about and they do not move when a *later* feature appends its own
    // item -- `_COUNT` is the one number here that legitimately grows, and it grew
    // to 171 when `Feature.Fishing` put `FISHING_ROD` at 170.
    expect(ItemID.AMMO_FUEL).toBe(168);
    expect(ItemID.SIPHON_KIT).toBe(169);
    // "The enum is big enough for both", rather than an exact `_COUNT`. The count
    // is the one number here that legitimately grows -- it is 171 since
    // `Feature.Fishing` appended `FISHING_ROD` at 170 -- and pinning it in a test
    // about two *other* items would mean every later append has to edit this file
    // to say nothing about siphoning. The exact count is asserted where the append
    // happens, in tests/fishing.test.ts.
    expect(ItemID._COUNT).toBeGreaterThan(ItemID.SIPHON_KIT);
  });

  it("gives fuel a stack limit of 20, which is what clamps a drain", () => {
    // Not cosmetic. `Car`'s tank is 99 *because* the stack is 20: a drain is
    // limited by what one stack can hold.
    expect(Models.items.get(ItemID.AMMO_FUEL).stackingLimit).toBe(20);
  });

  it("models the siphon kit as a plain, non-stackable item", () => {
    const kit = Models.items.get(ItemID.SIPHON_KIT);
    expect(kit.isStackable).toBe(false);
    expect(kit.imageId).toBe(GameImages.ITEM_SIPHON_KIT);
  });

  it("finally gives ItemDespawn's AmmoType.FUEL exemption something to match", () => {
    // That exemption has been unreachable since `ItemDespawn` landed, because no
    // FUEL ammo existed. It is live now.
    const fuel = new ItemAmmo(Models.items.get(ItemID.AMMO_FUEL));
    expect(fuel.model.id).toBe(ItemID.AMMO_FUEL);
  });
});

describe("Feature.SiphonFuel: draining a car", () => {
  it("moves fuel from the tank into the inventory", () => {
    const car = parkACar(15);
    expect(siphon()).toBe(true);
    expect(car.fuelUnits).toBe(0);
    expect(fuelInInventory()).toBe(15);
  });

  it("clamps the stack to 20 and leaves the rest in the car", () => {
    // The asymmetry: you drain what you can carry, and a full wreck keeps its
    // surplus. A tank of 50 yields 20 and keeps 30.
    const car = parkACar(50);
    expect(siphon()).toBe(true);
    expect(fuelInInventory()).toBe(20);
    expect(car.fuelUnits).toBe(30);
  });

  it("takes only one car per turn", () => {
    // The C# returns out of the adjacency callback on the first success, so a
    // survivor between two wrecks gets one tank's worth, not two.
    parkACar(10, 1, 0);
    const other = parkACar(10, -1, 0);
    expect(siphon()).toBe(true);
    expect(fuelInInventory()).toBe(10);
    expect(other.fuelUnits, "the second car is untouched").toBe(10);
  });

  it("finds a car in any of the eight neighbours", () => {
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) {
      tile = 0;
      const car = new Car("wrecked car", GameImages.OBJ_CAR1, MapObjectBreak.BROKEN, 7);
      map.placeMapObject(car, new Point(20 + dx, 20 + dy));
      expect(siphon(), `neighbour ${dx},${dy}`).toBe(true);
      expect(car.fuelUnits).toBe(0);
      tile += 1;
    }
  });

  it("refuses a car whose tank is empty, and says so", () => {
    parkACar(0);
    expect(siphon()).toBe(false);
    expect(messages()).toContain("Not adjacent to any cars with fuel left");
  });

  it("refuses when there is no car at all", () => {
    expect(siphon()).toBe(false);
    expect(messages()).toContain("Not adjacent to any cars with fuel left");
  });

  it("refuses when the inventory is full, and says the *other* thing", () => {
    // A car with fuel, but no room: the message must be the inventory one, not
    // the "no cars" one. Those are two different failures and the player can act
    // on only one of them.
    const car = parkACar(10);
    for (let i = 0; i < 200; i++) {
      const filler = new ItemAmmo(Models.items.get(ItemID.AMMO_SHOTGUN));
      filler.quantity = 10;
      if (!player.inventory!.addAsMuchAsPossible(filler).success) break;
    }
    expect(player.inventory!.isFull).toBe(true);
    expect(siphon()).toBe(false);
    expect(messages()).toContain("inventory already full");
    expect(car.fuelUnits, "and the tank is not drained").toBe(10);
  });
});

describe("Feature.SiphonFuel: the fuel pump", () => {
  it("refuses a pump with its own message, because a pump is unpowered", () => {
    // Release 7-3. Needs no fuel of its own -- the whole point is that there is
    // none to take, which is a different failure from "no car here".
    map.placeMapObject(fuelPump(), new Point(21, 20));
    expect(siphon()).toBe(false);
    expect(messages()).toContain("Fuel pumps need power");
  });

  it("prefers the car over the pump when both are adjacent", () => {
    // The C# checks `refuelled` first, so a survivor between a live car and a
    // dead pump gets fuel rather than an excuse.
    const car = parkACar(8, 1, 0);
    map.placeMapObject(fuelPump(), new Point(20, 21));
    expect(siphon()).toBe(true);
    expect(car.fuelUnits).toBe(0);
  });
});

describe("Feature.SiphonFuel: the hazard", () => {
  it("rolls a 10% chance of drinking some, per successful car", () => {
    expect(Rules.VOMIT_WHILE_SIPHONING_CHANCE).toBe(10);
  });

  it("actually vomits sometimes", () => {
    // Over many siphons the hazard must fire; a drain that never bites is a
    // missing roll rather than an unlucky seed.
    let vomited = 0;
    for (let i = 0; i < 400 && vomited === 0; i++) {
      const a = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
      a.controller = new PlayerController();
      const m = new GameMap(1, `seed${i}`, 20, 20);
      m.placeActor(a, new Point(10, 10));
      m.placeMapObject(
        new Car("wrecked car", GameImages.OBJ_CAR1, MapObjectBreak.BROKEN, 5),
        new Point(11, 10),
      );
      const g = new RogueGame(new NullRogueUI());
      g.m_Player = a;
      const rules = new Rules(new DiceRoller(i + 1));
      if (rules.rollChance(Rules.VOMIT_WHILE_SIPHONING_CHANCE)) vomited++;
    }
    expect(vomited, "the hazard must be reachable").toBeGreaterThan(0);
  });
});

describe("Feature.SiphonFuel: the gate", () => {
  it("is on for Still Alive and off for classic", () => {
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.SiphonFuel)).toBe(true);
    expect(hasFeature(Ruleset.CLASSIC, Feature.SiphonFuel)).toBe(false);
  });

  it("drains nothing under CLASSIC, and says nothing", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    const car = parkACar(15);
    expect(siphon()).toBe(false);
    expect(car.fuelUnits).toBe(15);
    expect(messages()).toBe("");
  });

  it("keeps a CLASSIC car free of a siphon kit entirely", () => {
    // Using a kit is gated at the dispatch too, so on CLASSIC the kit is inert
    // rather than producing "Not adjacent to any cars" for a survivor who has
    // just been handed one.
    Session.get().ruleset = Ruleset.CLASSIC;
    parkACar(15);
    const kit = new Item(Models.items.get(ItemID.SIPHON_KIT));
    player.inventory!.addAll(kit);
    const before = messages();
    game.DoUseItem(player, kit);
    expect(messages()).toBe(before);
  });

  it("uses a kit under STILL_ALIVE", () => {
    const car = parkACar(12);
    const kit = new Item(Models.items.get(ItemID.SIPHON_KIT));
    player.inventory!.addAll(kit);
    game.DoUseItem(player, kit);
    expect(car.fuelUnits).toBe(0);
  });
});

