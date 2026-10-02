/**
 * `Feature.Fishing`: the pond -- Release 6-1's replacement for alpha10's shed.
 *
 * This is the half of `Feature.Fishing` that was missing, and it is the half
 * everything else was waiting on. `Map.hasFishing` was false on every map in the
 * world, so the player's rod had nothing to be equipped beside and the NPC fishing
 * arm had no gate to pass. One C# line does most of the work of fixing that:
 * `BaseTownGenerator.cs:5709` drops a rod on the pond.
 *
 * What is here:
 *
 *  - the tiles (a 3x3 of `FLOOR_POND_CENTER` inside a ring of four edges and four
 *    corners),
 *  - `IsInside = false`, which is the load-bearing line and the C#'s own change
 *    from alpha10 -- a pond you cannot see the sky over is a bath,
 *  - the two map flags,
 *  - the zone name, which matters because two other subsystems match zones by
 *    substring,
 *  - and the gate, which is the only reason Classic is still byte-identical.
 *
 * What is **not** here: the NPC arm (`BehaviorGoFish`, `CivilianAI` step 15a). It is
 * reachable now and still unwired.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { District, DistrictKind } from "@data/District";
import { Map as GameMap } from "@data/Map";
import type { Zone } from "@data/Zone";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Rules } from "@engine/Rules";
import { DiceRoller } from "@engine/DiceRoller";
import { Ruleset, Session } from "@engine/Session";
import { CLASS_SPECS } from "@engine/serialization/specs";
import {
  GraphReader,
  GraphWriter,
  type GraphData,
  type RefMark,
} from "@engine/serialization/SessionGraph";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import {
  BaseTownGenerator,
  Parameters,
} from "@gameplay/generators/BaseTownGenerator";
import { ItemID, GameItems } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";

// `generate()` reads tiles, actors *and factions* out of the model database.
new GameTiles();
new GameActors();
new GameFactions();
new GameItems();

function newGenerator(size = 100): BaseTownGenerator {
  const params = new Parameters();
  params.district = new District(new Point(0, 0), DistrictKind.GREEN);
  params.mapWidth = size;
  params.mapHeight = size;
  return new BaseTownGenerator(
    { rules: new Rules(new DiceRoller(20250929)), ApplyOnFire: () => undefined } as never,
    params,
  );
}

const writeBack = (m: GameMap): GraphData => {
  const writer = new GraphWriter(CLASS_SPECS);
  return writer.finish({ currentMap: writer.ref(m) });
};
const readBack = (data: GraphData): GameMap => {
  const reader = new GraphReader(data, CLASS_SPECS);
  return reader.resolve((data.root as Record<string, unknown>).currentMap as RefMark) as GameMap;
};

/**
 * A district that produced a pond, found by sweeping seeds.
 *
 * Seed N landing in the pond branch is a property of the *dice stream*, not of the
 * feature, and any change earlier in `makeParkBuilding` moves it -- `Feature.Fishing`
 * did exactly that to `graveyard.test.ts`, which is why that file now sweeps too.
 */
let cached: { map: GameMap; zone: Zone; pond: Rect } | null = null;

/**
 * A district that produced a pond.
 *
 * `pond` is the **outer** 5x5 rect, recovered from the zone's bounds -- the C# zones
 * the *inside* rect (`MakeUniqueZone(baseZoneName, pondInsideRect)`, `:5744`) and
 * builds the edge ring outside it, so the zone is 3x3 and the pond is 5x5. Every
 * corner and edge assertion below needs the outer rect.
 */
function pondIn(): { map: GameMap; zone: Zone; pond: Rect } {
  if (cached !== null) return cached;
  for (let seed = 1; seed <= 40; seed++) {
    const map = newGenerator().generate(seed);
    for (const zone of map.zones) {
      if (!zone.name.startsWith("Pond@")) continue;
      const b = zone.bounds;
      cached = {
        map,
        zone,
        pond: new Rect(b.left - 1, b.top - 1, b.width + 2, b.height + 2),
      };
      return cached;
    }
  }
  throw new Error("no district in seeds 1..40 contained a Pond zone");
}

const tileIdAt = (map: GameMap, x: number, y: number): TileID => map.getTileAt(x, y)!.model.id;

beforeEach(() => {
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  cached = null;
});

describe("Feature.Fishing: the pond's tiles", () => {
  it("fills a 3x3 of centre inside the 5x5", () => {
    const { map, pond } = pondIn();
    expect(pond.width, "the C#'s PARK_POND_WIDTH").toBe(5);
    expect(pond.height, "and HEIGHT").toBe(5);
    expect(tileIdAt(map, pond.left + 1, pond.top + 1)).toBe(TileID.FLOOR_POND_CENTER);
    expect(tileIdAt(map, pond.right - 2, pond.bottom - 2)).toBe(TileID.FLOOR_POND_CENTER);
  });

  it("rings it with the four corners, whose names agree across both C# loops", () => {
    // The C# writes each corner twice -- once from its vertical side and once from
    // its horizontal one -- and transcribing all four loops rather than collapsing
    // them into one ring is what keeps that agreement visible instead of lost.
    const { map, pond } = pondIn();
    expect(tileIdAt(map, pond.left, pond.top), "NW").toBe(TileID.FLOOR_POND_NW_CORNER);
    expect(tileIdAt(map, pond.right - 1, pond.top), "NE").toBe(TileID.FLOOR_POND_NE_CORNER);
    expect(tileIdAt(map, pond.left, pond.bottom - 1), "SW").toBe(TileID.FLOOR_POND_SW_CORNER);
    expect(tileIdAt(map, pond.right - 1, pond.bottom - 1), "SE").toBe(TileID.FLOOR_POND_SE_CORNER);
  });

  it("rings it with the four edges, mid-side", () => {
    const { map, pond } = pondIn();
    expect(tileIdAt(map, pond.left, pond.top + 2), "W").toBe(TileID.FLOOR_POND_W_EDGE);
    expect(tileIdAt(map, pond.right - 1, pond.top + 2), "E").toBe(TileID.FLOOR_POND_E_EDGE);
    expect(tileIdAt(map, pond.left + 2, pond.top), "N").toBe(TileID.FLOOR_POND_N_EDGE);
    expect(tileIdAt(map, pond.left + 2, pond.bottom - 1), "S").toBe(TileID.FLOOR_POND_S_EDGE);
  });

  it("is outdoors, which is the C#'s own change from alpha10", () => {
    // `TileFill(..., (tile) => tile.IsInside = false)` at `:5741`, annotated
    // "made false (Release 6-1)". Alpha10's shed was a building.
    const { map, pond } = pondIn();
    expect(map.getTileAt(pond.left + 1, pond.top + 1)!.isInside, "not indoors").toBe(false);
  });

  it("names its zone 'Pond', and nothing that looks for a park finds it", () => {
    // Not tidiness. `PickHelicopterRescueSite` counts green districts with a zone
    // whose name contains "Park" (`RogueGame.ts:28795`) and
    // `FindHelicopterLandingSpot` matches "Park"/"Graveyard"/"court" -- so the name
    // is load-bearing for two other subsystems.
    const { zone } = pondIn();
    expect(zone.name).toMatch(/^Pond@-?\d+--?\d+$/);
    expect(zone.name).not.toMatch(/Park/);
  });
});

describe("Feature.Fishing: the flags the pond sets", () => {
  it("sets Map.hasFishing, which was false on every map in the world before this", () => {
    expect(new GameMap(1, "fresh", 8, 8).hasFishing, "the C#'s default").toBe(false);
    expect(pondIn().map.hasFishing, "a map with a pond").toBe(true);
  });

  it("sets Map.hasWaterTiles, for an AI arm that is not ported yet", () => {
    // C# `Data/Map.cs:150`, read by the "I am on fire and looking for water"
    // behaviour. Recorded as unread by anything so the flag is not mistaken for
    // working behaviour.
    expect(pondIn().map.hasWaterTiles).toBe(true);
  });

  it("round-trips both through the save graph", () => {
    const map = pondIn().map;
    expect(readBack(writeBack(map)).hasFishing).toBe(true);
    expect(readBack(writeBack(map)).hasWaterTiles).toBe(true);
  });

  it("reads false from a save written before either flag existed", () => {
    // The compatibility half, and the reason both are properties over backing
    // fields: the graph reader makes a map with no key to assign.
    const fresh = readBack(writeBack(new GameMap(1, "fresh", 8, 8)));
    expect(fresh.hasFishing).toBe(false);
    expect(fresh.hasWaterTiles).toBe(false);
  });
});

describe("Feature.Fishing: the rod", () => {
  it("drops one on the pond's north-west tile", () => {
    // C# `BaseTownGenerator.cs:5709`, and the whole reason the NPC arm is reachable
    // at all: without a rod in the world nothing can fish, however willing the AI
    // is. It goes on `pondX, pondY` -- the outer rect's top-left, which is the NW
    // corner tile, not on the water.
    const { map, pond } = pondIn();
    const inventory = map.getItemsAt(new Point(pond.left, pond.top));
    expect(inventory, "an item on the pond's top-left").not.toBeNull();
    expect(
      inventory!.items.some((i) => i.model.id === ItemID.FISHING_ROD),
      "and it is a fishing rod",
    ).toBe(true);
  });
});

describe("Feature.Fishing: the gate, which is what keeps Classic identical", () => {
  it("builds the alpha10 shed instead when the feature is off", () => {
    // Release 6-1 deleted `MakeParkShedBuilding` outright and the reference has no
    // trace of it. The port still builds it under CLASSIC, because Classic has to
    // stay byte-identical to a world generated before this feature existed -- and
    // replacing the shed with a pond is a Classic map change.
    Session.get().ruleset = Ruleset.CLASSIC;
    let sawShed = false;
    for (let seed = 1; seed <= 40 && !sawShed; seed++) {
      const map = newGenerator().generate(seed);
      sawShed = map.zones.some((z) => z.name.startsWith("Shed@"));
      expect(map.hasFishing, `seed ${seed}: no pond under CLASSIC`).toBe(false);
      expect(map.hasWaterTiles, `seed ${seed}: and no water flag`).toBe(false);
    }
    expect(sawShed, "the shed is still what Classic gets").toBe(true);
  });

  it("is reachable under the feature flag", () => {
    expect(hasFeature(Session.get().ruleset, Feature.Fishing)).toBe(true);
  });
});