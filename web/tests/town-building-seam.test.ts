import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Map as GameMap } from "@data/Map";
import { MapObject, MapObjectBreak } from "@data/MapObject";
import { District, DistrictKind } from "@data/District";
import { Models } from "@data/Models";
import { Zone } from "@data/Zone";
import { DiceRoller } from "@engine/DiceRoller";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Rules } from "@engine/Rules";
import { DoorWindow } from "@engine/mapobjects/MapObjects";
import { BaseTownGenerator, Block, Parameters } from "@gameplay/generators/BaseTownGenerator";
import {
  TOWN_BUILDING_PASSES,
  decorateOutsideWalls,
  makeWalkwayZones,
  runTownBuildingPasses,
} from "@gameplay/generators/TownBuilding";
import type { TownBuildingContext, TownBuildingPass } from "@gameplay/generators/TownBuilding";
import { GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameItems } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";

/**
 * The town building seam: `./TownBuilding`, and the one call site that reaches
 * it from `BaseTownGenerator.generate()`.
 *
 * This is a seam test, not a building test. It pins two things that a diff
 * cannot show and a broken generator would not announce:
 *
 * 1. **The extension point is live.** A generator pushed into
 *    `TOWN_BUILDING_PASSES` really is reached by `generate()`, and one that is
 *    not in the registry really is not. A registry that nothing read would look
 *    identical in review to one that works, and the thirteen C# buildings still
 *    to be ported would all be silent no-ops.
 * 2. **The context's primitives are the generator's primitives.** Every member
 *    of `placement()` forwards to a method that already existed. A wrapper that
 *    dropped an argument, or a free function that got the loop order wrong,
 *    would still compile and would still produce a plausible-looking district.
 */

const rules = new Rules(new DiceRoller(20250929));
// The model databases register themselves into `Models` statics on
// construction, and `generate()` reaches all four: a shop drops items, a house
// basement spawns a rat, and every actor factory needs a faction.
new GameTiles();
new GameActors();
new GameItems();
new GameFactions();

function newParams(): Parameters {
  const params = new Parameters();
  params.district = new District(new Point(0, 0), DistrictKind.GENERAL);
  params.mapWidth = 40;
  params.mapHeight = 40;
  return params;
}

/**
 * `m_Game` is `any` in the port; the generator calls `ApplyOnFire` on it for a
 * burning wrecked car, and reads `rules` off it.
 */
function newGenerator(params = newParams()): BaseTownGenerator {
  return new BaseTownGenerator({ rules, ApplyOnFire: () => undefined } as never, params);
}

/** Zones with their bounds, sorted, so two maps compare without order noise. */
function zoneNames(map: GameMap): string[] {
  return map.zones
    .map((z) => `${z.name}@${z.bounds.left},${z.bounds.top},${z.bounds.width},${z.bounds.height}`)
    .sort();
}

/** Every tile model id and object image, as one comparable string. */
function layout(map: GameMap): string {
  const out: string[] = [];
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      const obj = map.getMapObjectAt(x, y);
      out.push(`${map.getTileAt(x, y)!.model.id}/${obj ? obj.imageId : "-"}`);
    }
  }
  return out.join(",");
}

afterEach(() => {
  TOWN_BUILDING_PASSES.length = 0;
});

describe("town building registry", () => {
  it("offers a registered building generator every still-empty block, with a usable context", () => {
    const params = newParams();
    const seen: TownBuildingContext[] = [];
    TOWN_BUILDING_PASSES.push({
      csharpName: "MakeStubBuilding",
      tryBuild: (ctx) => {
        seen.push(ctx);
        return false;
      },
    });

    const map = newGenerator(params).generate(4242);

    // Not zero: the whole point is that the registry is reached from
    // `generate()` and not merely defined.
    expect(seen.length).toBeGreaterThan(0);
    // And fewer than the block count: a 40x40 city at minBlockSize 11 has more
    // blocks than this, so some were already taken by a shop, a park or the
    // housing pass, and a later pass must not be offered them.
    expect(seen.length).toBeLessThan(16);

    for (const ctx of seen) {
      expect(ctx.map).toBe(map);
      expect(ctx.params).toBe(params);
      expect(ctx.roller).toBeInstanceOf(DiceRoller);
      expect(ctx.game).toBeDefined();
      expect(ctx.block).toBeInstanceOf(Block);
      // The three derived rectangles, so a building that destructures the
      // block works.
      expect(ctx.block.buildingRect.width).toBe(ctx.block.rectangle.width - 2);
      expect(ctx.block.insideRect.width).toBe(ctx.block.buildingRect.width - 2);
      expect(map.isInBoundsPoint(new Point(ctx.block.rectangle.left, ctx.block.rectangle.top))).toBe(true);
      // One roller for the whole district, or a building's rolls would not
      // interleave with the rest of world generation.
      expect(ctx.roller).toBe(seen[0].roller);
    }

    // Each block offered, offered once.
    const offered = seen.map((c) => c.block);
    expect(new Set(offered).size).toBe(offered.length);
  });

  it("never invokes a building generator that is not registered", () => {
    let unregisteredRan = 0;
    const unregistered: TownBuildingPass = {
      csharpName: "MakeUnregisteredBuilding",
      tryBuild: (ctx) => {
        ++unregisteredRan;
        ctx.map.addZone(new Zone("unregistered-stub", ctx.block.buildingRect));
        return true;
      },
    };
    expect(TOWN_BUILDING_PASSES).not.toContain(unregistered);

    const map = newGenerator().generate(4242);

    expect(unregisteredRan).toBe(0);
    expect(map.zones.map((z) => z.name)).not.toContain("unregistered-stub");
  });

  it("takes a block out of the pool only when the building says it built it", () => {
    const offered: Block[] = [];
    const built: Block[] = [];
    TOWN_BUILDING_PASSES.push({
      csharpName: "MakeStubBuilding",
      tryBuild: (ctx) => {
        offered.push(ctx.block);
        // Build the first two it is offered, decline the rest.
        if (built.length >= 2) return false;
        built.push(ctx.block);
        ctx.map.addZone(ctx.makeUniqueZone("stub", ctx.block.buildingRect));
        return true;
      },
    });

    const map = newGenerator().generate(4242);

    expect(built).toHaveLength(2);
    expect(map.zones.map((z) => z.name).filter((n) => n.startsWith("stub@"))).toHaveLength(2);
    // Offered exactly once each: a block a pass built is spliced out, so
    // neither a second pass nor the housing pass that follows ever sees it.
    for (const b of built) expect(offered.filter((o) => o === b)).toHaveLength(1);
    expect(new Set(offered).size).toBe(offered.length);
    // And the stub saw more than the two it built, so "only the built ones
    // leave the pool" is not vacuously true.
    expect(offered.length).toBeGreaterThan(built.length);
  });

  it("leaves the shipped registry empty, so the seam costs no dice", () => {
    // The whole refactor's claim is that nothing changed. With no registered
    // building the new call site is a no-op, and the map it produces is the map
    // the pre-seam code produced for the same seed.
    expect(TOWN_BUILDING_PASSES).toEqual([]);

    const a = newGenerator().generate(20250929);
    const b = newGenerator().generate(20250929);
    expect(layout(a)).toBe(layout(b));
    expect(zoneNames(a)).toEqual(zoneNames(b));
  });
});

describe("town building context", () => {
  let ctx: TownBuildingContext;
  let generator: BaseTownGenerator;

  beforeEach(() => {
    let captured: TownBuildingContext | null = null;
    TOWN_BUILDING_PASSES.push({
      csharpName: "MakeCaptureBuilding",
      tryBuild: (c) => {
        captured ??= c;
        return false;
      },
    });
    generator = newGenerator();
    generator.generate(7);
    expect(captured).not.toBeNull();
    ctx = captured as unknown as TownBuildingContext;
  });

  it("writes through to the same tile and object primitives the generator uses", () => {
    const viaGenerator = new GameMap(1, "via generator", 12, 12);
    const viaContext = new GameMap(1, "via context", 12, 12);
    const rect = new Rect(1, 1, 8, 8);
    const walls = Models.tiles.get(TileID.WALL_STONE)!;
    const floor = Models.tiles.get(TileID.FLOOR_CONCRETE)!;

    generator.tileRectangle(viaGenerator, walls, rect);
    generator.tileFill(viaGenerator, floor, rect);
    ctx.tileRectangle(viaContext, walls, rect);
    ctx.tileFill(viaContext, floor, rect);

    // Built by hand rather than through `makeObjShelf`, which is `protected`:
    // see the "What is deliberately NOT here" note in `./TownBuilding`. A
    // building in its own file cannot make furniture yet.
    const shelf = new MapObject("shelf", "shelf.png", MapObjectBreak.BREAKABLE, 0, 20);
    const bench = new MapObject("bench", "bench.png", MapObjectBreak.BREAKABLE, 0, 20);
    generator.mapObjectPlace(viaGenerator, 3, 3, shelf);
    ctx.mapObjectPlace(viaContext, 3, 3, shelf);

    generator.mapObjectFill(viaGenerator, new Rect(5, 5, 3, 3), () => bench);
    ctx.mapObjectFill(viaContext, new Rect(5, 5, 3, 3), () => bench);

    expect(layout(viaContext)).toBe(layout(viaGenerator));
  });

  it("placeDoor lays the floor under the door, and countAdjDoors then sees it", () => {
    // The property the extracted `placeDoor` exists for, and the reason it is
    // ordered that way: a doorway in a wall tile has to become walkable floor,
    // or the room it joins is sealed behind a door that opens onto concrete.
    // A fresh map, not the captured district's: that one already has doors on
    // it, which is exactly the sort of thing that makes an adjacency assertion
    // pass for the wrong reason.
    const map = new GameMap(3, "door", 12, 12);
    const block = new Block(new Rect(0, 0, 12, 12));
    ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_CONCRETE)!, block.rectangle);
    ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_STONE)!, block.buildingRect);
    const doorX = block.buildingRect.left;
    const doorY = block.buildingRect.top + 4;

    expect(ctx.countAdjDoors(map, doorX, doorY)).toBe(0);
    ctx.placeDoor(map, doorX, doorY, Models.tiles.get(TileID.FLOOR_WALKWAY)!, ctx.makeObjGlassDoor());

    expect(map.getMapObjectAt(doorX, doorY)).toBeInstanceOf(DoorWindow);
    // The floor went down under the door: a door standing on a concrete tile
    // connects nothing, and `Map.isWalkable` would still be false either way
    // because the closed door blocks the tile.
    expect(map.getTileAt(doorX, doorY)!.model).toBe(Models.tiles.get(TileID.FLOOR_WALKWAY));
    // The room behind it is reachable, which is what `placeDoor` exists for.
    expect(map.isWalkable(doorX + 1, doorY)).toBe(true);
    expect(ctx.countAdjDoors(map, doorX, doorY - 1)).toBe(1);
  });

  it("makeWalkwayZones and decorateOutsideWalls are the functions the generator now calls", () => {
    // Both were moved out of their classes so a building file can reach them
    // without the class. This pins the move: the free function and the
    // generator's method must produce the same zones and the same decorations,
    // or half the port's buildings would quietly stop having walkways.
    const viaGenerator = new GameMap(2, "via generator", 14, 14);
    const viaContext = new GameMap(2, "via context", 14, 14);
    const block = new Block(new Rect(0, 0, 14, 14));

    for (const map of [viaGenerator, viaContext]) {
      generator.tileFill(map, Models.tiles.get(TileID.FLOOR_CONCRETE)!);
      generator.tileRectangle(map, Models.tiles.get(TileID.WALL_STONE)!, block.buildingRect);
    }

    generator.makeWalkwayZones(viaGenerator, block);
    makeWalkwayZones(ctx, viaContext, block);
    expect(zoneNames(viaContext)).toEqual(zoneNames(viaGenerator));
    expect(viaContext.zones).toHaveLength(4);

    const deco = (x: number, y: number): string | null =>
      x === block.buildingRect.left && y === block.buildingRect.top ? "deco.png" : null;
    generator.decorateOutsideWalls(viaGenerator, block.buildingRect, deco);
    decorateOutsideWalls(viaContext, block.buildingRect, deco);
    expect(viaContext.getTileAt(block.buildingRect.left, block.buildingRect.top)!.getDecorations).toEqual(
      viaGenerator.getTileAt(block.buildingRect.left, block.buildingRect.top)!.getDecorations
    );
    // Inside and walkable tiles are skipped, so exactly one tile is decorated.
    expect(viaContext.zones).toHaveLength(4);
  });

  it("runTownBuildingPasses is the whole of the extension point", () => {
    // Driven directly, to pin the contract a new building is written against:
    // offered every block in registry order, `true` removes the block, and a
    // later pass never sees a block an earlier pass took.
    const a = new Block(new Rect(0, 0, 11, 11));
    const b = new Block(new Rect(12, 0, 11, 11));
    const c = new Block(new Rect(24, 0, 11, 11));
    const blocks = [a, b, c];
    // Stable names, not indices: a pass removes blocks, so `indexOf` shifts.
    const names = new Map<Block, string>([
      [a, "a"],
      [b, "b"],
      [c, "c"],
    ]);
    const order: string[] = [];
    const passes: TownBuildingPass[] = [
      {
        csharpName: "First",
        tryBuild: (x) => {
          order.push(`first:${names.get(x.block)}`);
          return x.block === b;
        },
      },
      {
        csharpName: "Second",
        tryBuild: (x) => {
          order.push(`second:${names.get(x.block)}`);
          return false;
        },
      },
    ];

    runTownBuildingPasses(passes, blocks, (block) => ({ ...ctx, block }));

    expect(order).toEqual(["first:a", "first:b", "first:c", "second:a", "second:c"]);
    expect(blocks).toEqual([a, c]);
  });
});
