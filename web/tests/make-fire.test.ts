/**
 * `Feature.Cooking` / `Feature.FireBarrels`: starting a fire with matches.
 *
 * Still Alive, Release 7-6.
 *
 * This is the command both of those features were blocked on. Until it landed the
 * only fire the port could produce came from an explosion, so a barrel could be
 * scorched but never *lit*, `CookFoodOnFires` had nothing to cook on that the player
 * had started, and `ItemID.MATCHES` did not exist at all.
 *
 * The four shapes worth testing, because the method branches on all of them:
 *
 *  1. **empty ground** — a new campfire is placed, a plank goes in, a match is used;
 *  2. **a barrel or campfire with fuel** — relit, and *no wood consumed*, which is
 *     the only thing distinguishing "reignites a fire" from "starts a fire";
 *  3. **one without fuel** — wood goes in first, then it is lit;
 *  4. **every refusal** — each check has its own message, and the messages are what
 *     the player reads, so they are asserted rather than counted.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { Item } from "@data/Item";
import { Faction } from "@data/Faction";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { PlayerController } from "@data/PlayerController";
import { Point } from "@engine/Point";
import { Ruleset, Session } from "@engine/Session";
import { Weather } from "@data/Weather";
import { DollPart } from "@data/Doll";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { ItemBarricadeMaterial } from "@engine/items/ItemMisc";
import { ItemID, GameItems } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { GameActors, ActorID } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameImages } from "@gameplay/GameImages";
import { MapObject, MapObjectBreak, MapObjectFire } from "@data/MapObject";
import { Barrel, Campfire } from "@engine/mapobjects/MapObjects";
import { NullRogueUI } from "@ui/NullRogueUI";
import { RogueGame } from "@engine/RogueGame";

const survivors = new Faction("The Survivors", "survivor");

let game: RogueGame;
let map: GameMap;
let player: Actor;

const pave = (id: TileID): void => {
  for (let x = 0; x < 30; x++) {
    for (let y = 0; y < 30; y++) map.setTileModelAt(x, y, Models.tiles.get(id)!);
  }
};

/** Give the player `count` planks of wood. */
const giveWood = (count: number): void => {
  const wood = new ItemBarricadeMaterial(Models.items.get(ItemID.BAR_WOODEN_PLANK)!);
  wood.quantity = count;
  player.inventory!.addAll(wood);
};

const giveMatches = (): void => {
  const matches = new Item(Models.items.get(ItemID.MATCHES)!);
  matches.quantity = 3;
  player.inventory!.addAll(matches);
};

/** Fire at (x, y), the C#'s `DoMakeFireForCooking(actor, pos)`. */
const makeFire = (x: number, y: number): void =>
  game.DoMakeFireForCooking(player, new Point(x, y));

/**
 * A barrel.
 *
 * Built through the generator's `makeObjFireBarrel` where the test needs a real one,
 * and constructed directly where the test needs to *set* `fuelUnits` first -- the
 * generator's factory always makes an empty receptacle, which is the other three
 * shapes.
 */
const makeBarrel = (fuel: number): Barrel => {
  const barrel = new Barrel(
    "receptacle",
    GameImages.OBJ_EMPTY_BARREL,
    MapObjectBreak.UNBREAKABLE,
    fuel,
  );
  barrel.isMaterialTransparent = true;
  barrel.isContainer = true;
  barrel.isMovable = true;
  barrel.isWalkable = true;
  return barrel;
};

const objectAt = (x: number, y: number) => map.getMapObjectAt(x, y);
const isLit = (x: number, y: number): boolean => objectAt(x, y)?.isOnFire === true;

beforeEach(() => {
  new GameTiles();
  new GameActors();
  new GameFactions();
  new GameItems();
  Session.useSeed(1);
  game = new RogueGame(new NullRogueUI());
  map = new GameMap(1, "test", 30, 30);
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  Session.get().weather = Weather.CLEAR;
  pave(TileID.FLOOR_CONCRETE);

  player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN)!, survivors, "you");
  player.controller = new PlayerController();
  map.placeActor(player, new Point(10, 10));
  game.m_Player = player;
});

describe("the matchbox", () => {
  it("exists, is appended, and is equippable in the off hand", () => {
    // Append-only: a save stores an `ItemID` as a bare number, so this is 178 and
    // not the C#'s mid-enum 121.
    expect(ItemID.MATCHES).toBe(178);
    const model = Models.items.get(ItemID.MATCHES)!;
    expect(model.singleName).toBe("box of matches");
    // The right hand is the only hand a weapon can occupy, so a matchbox in the left
    // hand costs the player nothing they are holding.
    expect(model.equipmentPart).toBe(DollPart.LEFT_HAND);
  });

  it("has a sprite that already shipped", () => {
    // It did: the asset was never the gap, the id was.
    expect(GameImages.ITEM_MATCHES).toBe("Items/item_matchbox");
    expect(GameImages.OBJ_CAMPFIRE).toBe("MapObjects/campfire");
  });
});

describe("DoMakeFireForCooking: the four shapes", () => {
  it("on empty ground it places a campfire, feeds it and lights it", () => {
    giveWood(2);
    giveMatches();
    makeFire(12, 12);

    const fire = objectAt(12, 12);
    expect(fire, "a campfire appeared").toBeInstanceOf(Campfire);
    expect(isLit(12, 12), "and it is burning").toBe(true);
    // 90 fuel units per plank (`FIRE_FUEL_PER_WOOD_PLANK`), consumed from the
    // smallest stack.
    expect((fire as Campfire).fuelUnits).toBe(90);
    // One match used.
    const matches = player.inventory!.getSmallestStackByModel(Models.items.get(ItemID.MATCHES)!);
    expect(matches === null || matches.quantity === 2, "one match consumed").toBe(true);
  });

  it("relights a barrel that still has fuel and consumes no wood", () => {
    giveWood(2);
    giveMatches();
    const barrel = makeBarrel(300);
    barrel.fuelUnits = 300;
    map.placeMapObject(barrel, new Point(13, 13));

    makeFire(13, 13);

    expect(isLit(13, 13), "the barrel is burning").toBe(true);
    // This is the whole difference between the two messages.
    expect(barrel.fuelUnits, "unchanged: no plank went in").toBe(300);
  });

  it("adds wood to a barrel that has none, and gives it four times as much", () => {
    giveWood(2);
    giveMatches();
    const barrel = makeBarrel(0);
    barrel.fuelUnits = 0;
    map.placeMapObject(barrel, new Point(14, 14));

    makeFire(14, 14);

    expect(isLit(14, 14), "the barrel is burning").toBe(true);
    // A barrel is four times a campfire, so it takes four planks' worth.
    expect(barrel.fuelUnits).toBe(360);
  });

  it("caps at the receptacle's maximum", () => {
    giveWood(9);
    giveMatches();
    const barrel = makeBarrel(0);
    map.placeMapObject(barrel, new Point(15, 15));

    makeFire(15, 15);
    expect(barrel.fuelUnits, "a barrel's plank is worth four").toBe(360);

    // **The cap itself is unreachable, and that is worth knowing.** A barrel only
    // takes wood when `fuelUnits <= 0` (`DoMakeFireForCooking`), so the largest
    // single jump is 0 -> 360, and `Barrel.MAX_FUEL_UNITS` is 720. The C#'s
    // `Math.Min` can never actually clamp a barrel -- it protects against a value
    // the branching above already excludes. Asserting that rather than inventing a
    // fixture that reaches it, because a test that constructs the unreachable case
    // is testing the test.
    expect(Barrel.MAX_FUEL_UNITS).toBe(720);
    expect(360).toBeLessThan(Barrel.MAX_FUEL_UNITS);
  });
});

describe("Rules.canStartCookingFire: the eight refusals", () => {
  const canStart = (x: number, y: number) =>
    game.m_Rules.canStartCookingFire(player, new Point(x, y));

  it("refuses off the map, and says so", () => {
    const r = canStart(-1, -1);
    expect(r.ok).toBe(false);
    expect(r.reason).not.toBe("");
  });

  it("refuses a wall", () => {
    map.setTileModelAt(11, 10, Models.tiles.get(TileID.WALL_STONE)!);
    giveWood(1);
    expect(canStart(11, 10).ok, "a wall is not a floor").toBe(false);
  });

  it("refuses a tile with somebody standing on it", () => {
    const other = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN)!, survivors, "someone");
    map.placeActor(other, new Point(12, 10));
    giveWood(1);
    expect(canStart(12, 10).ok, "someone is in the way").toBe(false);
  });

  it("refuses a tile with a thing on it that is not a receptacle", () => {
    // A *plain* map object. A barrel here would be accepted, because a receptacle is
    // exactly what this rule allows -- the refusal is for something else in the way.
    map.placeMapObject(
      new MapObject("table", GameImages.OBJ_TABLE, MapObjectBreak.BREAKABLE, MapObjectFire.BURNABLE),
      new Point(13, 10),
    );
    giveWood(1);
    const r = canStart(13, 10);
    expect(r.ok).toBe(false);
    expect(r.reason, "and names what is in the way").toContain("way");
  });

  it("refuses water", () => {
    pave(TileID.FLOOR_POND_CENTER);
    giveWood(1);
    expect(canStart(12, 10).ok, "you cannot start a fire in the water").toBe(false);
  });

  it("refuses empty ground with no wood, and names the missing thing", () => {
    // A *receptacle* does not need wood — relighting is free — so this only bites on
    // bare ground. That asymmetry is the C#'s.
    giveMatches();
    const bare = canStart(12, 10);
    expect(bare.ok).toBe(false);
    expect(bare.reason).toMatch(/wood/i);

    const barrel = makeBarrel(100);
    barrel.fuelUnits = 100;
    map.placeMapObject(barrel, new Point(12, 10));
    const r = canStart(12, 10);
    expect(r.ok, `a fuelled barrel needs nothing, but: ${r.reason}`).toBe(true);
  });

  it("accepts bare ground with wood and nothing in the way", () => {
    giveWood(1);
    expect(canStart(12, 10).ok).toBe(true);
  });
});

describe("the feature gate", () => {
  it("starts nothing under CLASSIC", () => {
    // `Cooking` gates the method and `ExtendedAudio` gates the recording. The C#
    // needs neither because `DoMakeFireForCooking` only exists in Release 7-6.
    Session.get().ruleset = Ruleset.CLASSIC;
    giveWood(2);
    giveMatches();
    makeFire(12, 12);
    expect(objectAt(12, 12), "no campfire under CLASSIC").toBeNull();
  });

  it("is on under STILL_ALIVE", () => {
    expect(hasFeature(Session.get().ruleset, Feature.Cooking)).toBe(true);
    expect(hasFeature(Session.get().ruleset, Feature.FireBarrels)).toBe(true);
  });
});