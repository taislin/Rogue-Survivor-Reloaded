/**
 * `Feature.DarknessFov` 2b — light sources outside your own field of view.
 *
 * Still Alive, Release 6-5, refined 7-5 and 7-6.
 *
 * 2a (the FOV floor of 0) is in `darkness-fov.test.ts`. This is the half that
 * makes a floor with a fire in it *playable*: a tile with a light source on it is
 * visible even when it is outside the actor's own FOV, so a survivor standing in
 * a pitch-dark basement can see the burning barrel two tiles away that is the
 * only reason they are not dead.
 *
 * The C# has no per-tile light-level grid either — this only ever adds keys to
 * the `Set<number>` the port already had — so both renderers pick it up for free.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { DollPart } from "@data/Doll";
import { Faction } from "@data/Faction";
import { Map as GameMap } from "@data/Map";
import { MapObjectBreak, MapObjectFire } from "@data/MapObject";
import { Models } from "@data/Models";
import { Point } from "@engine/Point";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { Weather } from "@data/Weather";
import { Lighting } from "@data/Map";
import { WorldTime } from "@engine/WorldTime";
import { DiceRoller } from "@engine/DiceRoller";
import { Options as GameOptions } from "@engine/GameOptions";
import { LOS } from "@engine/LOS";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { Campfire } from "@engine/mapobjects/MapObjects";
import { ItemLight } from "@engine/items/ItemLight";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameImages } from "@gameplay/GameImages";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { PlayerController } from "@data/PlayerController";

const survivors = new Faction("The Survivors", "survivor");

let map: GameMap;
let rules: Rules;
let player: Actor;
let npc: Actor;

/** The player, lit and unlit, as the engine computes it. */
const time = new WorldTime(0);

const sees = (): Set<number> =>
  LOS.computeFOVFor(rules, player, time, Weather.CLEAR, true);

const litAt = (set: Set<number>, x: number, y: number): boolean => set.has(y * 1024 + x);

beforeEach(() => {
  new GameActors();
  new GameItems();
  new GameTiles();
  map = new GameMap(1, "test", 40, 40);
  rules = new Rules(new DiceRoller(1));
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  Session.useSeed(1);
  // The player, in a plain unlit room. FOV 0, so only lights should be visible.
  map.lighting = Lighting.DARKNESS;
  player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
  player.controller = new PlayerController();
  map.placeActor(player, new Point(10, 10));
  npc = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "npc");
  map.placeActor(npc, new Point(13, 12));
});

const lightACampfire = (x: number, y: number): Campfire => {
  const c = new Campfire("campfire", "MapObjects/campfire", MapObjectBreak.BREAKABLE, 50);
  c.fireState = MapObjectFire.ONFIRE;
  map.placeMapObject(c, new Point(x, y));
  return c;
};

describe("DarknessFov 2b: the light-source scan", () => {
  it("sees a burning barrel that is outside the player's own FOV", () => {
    // The whole point. FOV is 0 here, so without the scan this is a black
    // screen; with it, the fire and its surroundings are visible.
    lightACampfire(13, 10);
    const fov = sees();
    expect(rules.actorFOV(player, map.localTime, Weather.CLEAR), "the player is blind").toBe(0);
    expect(litAt(fov, 13, 10), "but the fire is visible").toBe(true);
    expect(litAt(fov, 14, 10), "and so is the tile beside it").toBe(true);
  });

  it("does not see anything at all with no light source", () => {
    const fov = sees();
    // Only the player's own tile, which the FOV floor always includes.
    expect(fov.size, "a blind player sees one tile").toBe(1);
    expect(litAt(fov, 10, 10)).toBe(true);
  });

  it("sees a light up to ten tiles away, and not one further", () => {
    // The scan's own range, which is a *line of sight* check at range 10 and not
    // the actor's FOV. That is the whole point: a source outside the actor's view
    // range is still seen, but a source behind a wall is not, and neither of those
    // is the same as "twelve tiles away".
    lightACampfire(10, 22);
    expect(litAt(sees(), 10, 22), "twelve tiles is too far").toBe(false);

    lightACampfire(10, 18);
    expect(litAt(sees(), 10, 18), "eight tiles is within range").toBe(true);
  });

  it("sees a lit actor, and their surroundings", () => {
    const torch = new ItemLight(Models.items.get(ItemID.LIGHT_FLASHLIGHT));
    npc.inventory!.addAll(torch);
    torch.equippedPart = DollPart.LEFT_HAND;
    const fov = sees();
    expect(litAt(fov, 13, 12)).toBe(true);
    expect(litAt(fov, 14, 12), "and the tile beside them").toBe(true);
  });

  it("ignores an actor whose torch has no batteries", () => {
    const torch = new ItemLight(Models.items.get(ItemID.LIGHT_FLASHLIGHT));
    npc.inventory!.addAll(torch);
    torch.equippedPart = DollPart.LEFT_HAND;
    torch.batteries = 0;
    expect(sees().size, "a dead torch is not a light source").toBe(1);
  });

  it("sees a lit candle on the floor", () => {
    map.getTileAt(12, 14)!.addDecoration(GameImages.DECO_LIT_CANDLE);
    const fov = sees();
    expect(litAt(fov, 12, 14)).toBe(true);
    expect(litAt(fov, 13, 14), "and the tile beside it").toBe(true);
  });

  it("sees a dropped flare, but not a dropped torch", () => {
    // The C# checks `isThrowable` and says why: "we only want to check flares and
    // candles (throwables), as torches should be off if not equipped by an actor".
    // The FOV is recomputed after each drop. Snapshotting it first, as the first
    // version did, means the "is a dropped torch a light" assertion reads a set
    // that was computed *before the torch existed* -- so it is false whatever the
    // scan does, and the test passes with `isThrowable` deleted.
    map.dropItemAt(new ItemLight(Models.items.get(ItemID.LIGHT_FLARE)), new Point(13, 13));
    expect(litAt(sees(), 13, 13), "a flare").toBe(true);

    map.dropItemAt(
      new ItemLight(Models.items.get(ItemID.LIGHT_FLASHLIGHT)),
      new Point(8, 16),
    );
    expect(litAt(sees(), 8, 16), "a dropped torch is not").toBe(false);
    // ...and the flare is still lit, so the two are distinguished rather than the
    // whole neighbourhood simply being lit by one of them.
    expect(litAt(sees(), 13, 13)).toBe(true);
  });

  it("marks exactly the C#'s two lights as throwable", () => {
    expect(Models.items.get(ItemID.LIGHT_FLARE).isThrowable).toBe(true);
    expect(Models.items.get(ItemID.LIGHT_GLOWSTICK).isThrowable).toBe(true);
    expect(Models.items.get(ItemID.LIGHT_FLASHLIGHT).isThrowable).toBe(false);
    expect(Models.items.get(ItemID.LIGHT_BIG_FLASHLIGHT).isThrowable).toBe(false);
  });

  it("sees a tile fire, but never lights it through a wall", () => {
    map.setTileModelAt(14, 10, Models.tiles.get(TileID.FLOOR_RED_CARPET));
    map.getTileAt(14, 10)!.isOnFire = true;
    const fov = sees();
    expect(litAt(fov, 14, 10), "the burning floor").toBe(true);

    // A burning wall is skipped: lighting a wall makes it "visible", which makes
    // it *transparent*, and you can see straight through the building.
    map.setTileModelAt(16, 10, Models.tiles.get(TileID.WALL_BRICK));
    map.getTileAt(16, 10)!.isOnFire = true;
    expect(litAt(sees(), 16, 10), "a burning wall lights nothing").toBe(false);
  });

  it("names fourteen wall models, and they are the C#'s fourteen", () => {
    const tiles = Models.tiles as GameTiles;
    let n = 0;
    for (let id = 0; id < TileID._COUNT; id++) {
      if (tiles.isWallModel(Models.tiles.get(id))) n++;
    }
    // Fourteen, not fifteen: the C#'s `IsWallModel` lists exactly fourteen, and a
    // count is the only thing that catches a sixth wall being added to the list by
    // accident -- which is the same reasoning as the five-flammable-tile count.
    expect(n, "IsWallModel is a list of fourteen, not `!isWalkable`").toBe(14);
  });
});

describe("DarknessFov 2b: the burning-object footprint", () => {
  it("lights a 21-tile blob, not a 9-tile disc", () => {
    // The one non-trivial shape here: own tile, the 8 neighbours, the two-over
    // along each bearing, and the two three-point bearings either side of that.
    // So a burning barrel is visible from further away than a lit candle.
    lightACampfire(10, 20);
    const fov = sees();
    // The 9-tile disc.
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      expect(litAt(fov, 10 + dx, 20 + dy), `disc ${dx},${dy}`).toBe(true);
    }
    // Two tiles north, and the two three-point bearings either side of it.
    expect(litAt(fov, 10, 18), "two over, due north").toBe(true);
    expect(litAt(fov, 11, 18), "NNE").toBe(true);
    expect(litAt(fov, 9, 18), "NNW").toBe(true);
  });

  it("sheds the outer rings when the option is on", () => {
    // `reducedMapObjectLighting`, default OFF. A difficulty knob dressed as a
    // graphics one: a radius-1 disc instead of the 21-tile blob.
    const was = GameOptions.reducedMapObjectLighting;
    try {
      lightACampfire(10, 20);
      expect(litAt(sees(), 10, 18), "with the option off").toBe(true);

      GameOptions.reducedMapObjectLighting = true;
      const reduced = sees();
      expect(litAt(reduced, 10, 19), "the disc survives").toBe(true);
      expect(litAt(reduced, 10, 18), "the two-over does not").toBe(false);
    } finally {
      GameOptions.reducedMapObjectLighting = was;
    }
  });
});

describe("DarknessFov 2b: only the player, and only when the feature is on", () => {
  it("does not give the AI the scan", () => {
    // The C#'s reason is quotable: "otherwise the game runs like a slideshow"
    // (Release 7-1). Lighting sources go into the same visible set for an NPC as
    // for the player, so every survivor would see every fire on the map and walk
    // straight to it.
    // Six tiles away, not adjacent. An NPC's floor is 1, so its own FOV is
    // already the 3x3 disc -- a fire next to it is visible whether or not the scan
    // runs, and putting it there would test nothing. Six is outside that disc and
    // inside the scan's range-10 line of sight, which is the only band where the
    // two differ.
    lightACampfire(13, 18);
    const npcFov = LOS.computeFOVFor(rules, npc, time, Weather.CLEAR, true);
    expect(
      rules.actorFOV(npc, map.localTime, Weather.CLEAR),
      "the NPC's own FOV does not reach six tiles",
    ).toBe(1);
    expect(litAt(npcFov, 13, 18), "the NPC does not see the fire").toBe(false);
  });

  it("scans nothing under CLASSIC", () => {
    // Not "the player sees one tile" -- under CLASSIC the FOV floor is 2, so a
    // blind baseline is the wrong thing to compare against. The real claim is
    // that the scan adds *nothing*: the set with the scan requested must equal
    // the set without it.
    Session.get().ruleset = Ruleset.CLASSIC;
    lightACampfire(13, 10);
    const withScan = sees();
    const without = LOS.computeFOVFor(rules, player, time, Weather.CLEAR, false);
    expect(withScan.size, "classic sees its normal FOV").toBeGreaterThan(1);
    expect([...withScan].sort(), "and the scan added nothing").toEqual([...without].sort());
  });

  it("is skipped when the caller does not ask for it", () => {
    // The AI sensor path passes the default `false` and must stay cheap.
    lightACampfire(13, 10);
    const noScan = LOS.computeFOVFor(rules, player, map.localTime, Weather.CLEAR);
    expect(noScan.size, "no scan requested, so no light").toBe(1);
  });

  it("is on for Still Alive and off for classic", () => {
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.DarknessFov)).toBe(true);
    expect(hasFeature(Ruleset.CLASSIC, Feature.DarknessFov)).toBe(false);
  });
});
