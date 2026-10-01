/**
 * `ReplaceDestroyedWall` — C# `RogueGame.cs:20134-20232`, first reader Release 3.
 *
 * `ApplyExplosionDamage` has asked "should this wall come down?" since the fuel
 * pump arm landed, and answered correctly, but the consequence was a no-op with a
 * `TODO` in it. These tests are the consequence.
 *
 * ## What this file is actually for
 *
 * Most of it is a wall-to-rubble table, and that part is transcription. The two
 * cases worth reading the comments on are the ones where a *plausible* port gets
 * a different answer than the reference:
 *
 * 1. **The police station and subway walls have no case in the C# switch, and
 *    still work.** `GameTiles` registers both with `GameImages.TILE_WALL_STONE`
 *    as their image, and the method switches on `imageId` rather than `TileID`,
 *    so they arrive already spelled `Tiles/wall_stone` and take the stone rubble.
 *    A `TileID`-keyed switch -- the obvious port -- would put all three stone-ish
 *    walls in the `default` arm, which in the C# is a `throw`. The test at
 *    "police station and subway walls" is the one that fails first if someone
 *    "fixes" that switch to key on `TileID`.
 *
 * 2. **Two floors in the second switch cannot be reached.** `floor_food_court_pool`
 *    and `floor_white_tile` are handled by the method's floor swap but are absent
 *    from `Map.isBuildingFloorTileAt`, which is the only way into that swap. So a
 *    food-court pool next door never becomes the new floor. Kept dead, matching
 *    the reference; see "the floor swap's dead cases".
 *
 * ## The three things that make the explosion itself awkward to test
 *
 * - `ApplyExplosionDamage` is driven directly with `distanceFromBlast = 0` rather
 *   than through `DoBlast`. `DoBlast` walks a radius, checks line of sight, and
 *   reaches `RedrawPlayScreen`; calling the damage method with a hand-made
 *   zero-radius `BlastAttack` confines the whole blast to the one tile under test
 *   and leaves the renderer out of it.
 * - **The blast is built by hand, not borrowed from an explosive.** The fuel pump's
 *   real `blastAttack` carries `CausesTileFires`, so igniting the wall would also
 *   start a fire that scorch-marked the tile on its own account -- and with the
 *   `_damaged` guard now live, that is a second thing suppressing the scorch mark
 *   and the suppression test would stop isolating `wallDestroyed`.
 * - `m_TownGenerator` has to be set for the plank drop, since that case is the one
 *   that reaches back into the generator.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { BlastAttack } from "@data/BlastAttack";
import { Faction } from "@data/Faction";
import { Location } from "@data/Location";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { PlayerController } from "@data/PlayerController";
import { Point } from "@engine/Point";
import { Ruleset, Session } from "@engine/Session";
import { Weather } from "@data/Weather";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameImages } from "@gameplay/GameImages";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { BaseTownGenerator, Parameters } from "@gameplay/generators/BaseTownGenerator";
import { RogueGame } from "@engine/RogueGame";
import { NullRogueUI } from "@ui/NullRogueUI";

const survivors = new Faction("The Survivors", "survivor");

let game: RogueGame;
let map: GameMap;
let player: Actor;
let gen: BaseTownGenerator;

/** Radius 0: the C#'s `BlastAttack` requires `damage.length === radius + 1`. */
const wallBlast = (): BlastAttack => new BlastAttack(0, [50], false, true);

/**
 * Blast one tile. The C#'s entry point is `ApplyExplosionDamage`, and with
 * `distanceFromBlast = 0` the whole blast is that one tile.
 *
 * **The item model is primed dynamite, not the fuel pump.** `ApplyExplosionDamage`
 * reads `CausesTileFires` off the *item* rather than off the blast attack, so the
 * fuel pump's model would light the tile it just opened -- adding an
 * `Effects/onFire` decoration that breaks every assertion about which decorations
 * the wall swap left behind, and giving `ScorchBurntTile` a second, unrelated
 * reason to skip the scorch mark. Dynamite is the honest choice: a real
 * `CanDestroyWalls` explosive with `CausesTileFires` false.
 */
const blast = (x: number, y: number): Promise<unknown> =>
  game.ApplyExplosionDamage(
    new Location(map, new Point(x, y)),
    0,
    wallBlast(),
    Models.items.get(ItemID.EXPLOSIVE_DYNAMITE_PRIMED)!,
  );

const pave = (id: TileID, x0 = 0, y0 = 0, w = 30, h = 30): void => {
  for (let x = x0; x < x0 + w; x++) {
    for (let y = y0; y < y0 + h; y++) map.setTileModelAt(x, y, Models.tiles.get(id)!);
  }
};

/** A single wall tile in an otherwise grass field. */
const wallAt = (x: number, y: number, id: TileID): void =>
  map.setTileModelAt(x, y, Models.tiles.get(id)!);

const tileAt = (x: number, y: number) => map.getTileAt(x, y);
const decosAt = (x: number, y: number): readonly string[] =>
  tileAt(x, y)?.getDecorations ?? [];
const modelAt = (x: number, y: number, id: TileID): boolean =>
  tileAt(x, y)?.model === Models.tiles.get(id);

/** Any scorch mark at all, in any of the five tiers. */
const isScorched = (x: number, y: number): boolean =>
  decosAt(x, y).some((d) => d.startsWith("Tiles/Decoration/scorched_"));

beforeEach(() => {
  new GameActors();
  new GameTiles();
  new GameItems();
  Session.useSeed(1);
  game = new RogueGame(new NullRogueUI());
  map = new GameMap(1, "test", 30, 30);
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  Session.get().weather = Weather.CLEAR;
  Session.get().currentMap = map;
  player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
  player.controller = new PlayerController();
  map.placeActor(player, new Point(1, 1));
  game.m_Player = player;
  (game as unknown as { m_MapViewRect: { left: number; top: number; right: number; bottom: number } })
    .m_MapViewRect = { left: 0, top: 0, right: 30, bottom: 30 };
  const params = new Parameters();
  params.mapWidth = 30;
  params.mapHeight = 30;
  gen = new BaseTownGenerator({ rules: game.m_Rules, ApplyOnFire: () => undefined } as never, params);
  // `ReplaceDestroyedWall`'s plank arm calls back into the generator, and it is the
  // only code path in this file that needs `m_TownGenerator` to be set.
  game.m_TownGenerator = gen;
  (game as unknown as { RedrawPlayScreen(): void }).RedrawPlayScreen = () => {};
  pave(TileID.FLOOR_GRASS);
});

// ── 1. The wall-to-rubble table ───────────────────────────────────────────────

describe("ReplaceDestroyedWall: the wall-to-rubble table", () => {
  it("lays the matching rubble and adopts the neighbouring floor's model", async () => {
    pave(TileID.FLOOR_TILES, 10, 10, 5, 5);
    wallAt(12, 12, TileID.WALL_BRICK);
    expect(decosAt(12, 12)).toHaveLength(0);

    await blast(12, 12);

    expect(decosAt(12, 12)).toContain(GameImages.DECO_WALL_BRICK_DAMAGED);
    expect(modelAt(12, 12, TileID.FLOOR_TILES)).toBe(true);
    // The tile is walkable now, which is the entire point of the swap.
    expect(Models.tiles.get(TileID.FLOOR_TILES)!.isWalkable).toBe(true);
  });

  it("gives each rubble drawing its own sprite, and only that one", async () => {
    const cases: readonly [TileID, string][] = [
      [TileID.WALL_BRICK, GameImages.DECO_WALL_BRICK_DAMAGED],
      [TileID.WALL_CHAR_OFFICE, GameImages.DECO_WALL_CHAR_OFFICE_DAMAGED],
      [TileID.WALL_HOSPITAL, GameImages.DECO_WALL_HOSPITAL_DAMAGED],
      [TileID.WALL_STONE, GameImages.DECO_WALL_STONE_DAMAGED],
      [TileID.WALL_LIGHT_BROWN, GameImages.DECO_WALL_LIGHT_BROWN_DAMAGED],
      [TileID.WALL_ARMY_BASE, GameImages.DECO_WALL_ARMY_BASE_DAMAGED],
      [TileID.WALL_FUEL_STATION, GameImages.DECO_WALL_FUEL_STATION_DAMAGED],
      [TileID.WALL_MALL, GameImages.DECO_WALL_MALL_DAMAGED],
    ];
    pave(TileID.FLOOR_TILES, 5, 5, 20, 20);
    for (const [i, [wall, deco]] of cases.entries()) {
      const x = 6 + i * 2;
      wallAt(x, 15, wall);
      await blast(x, 15);
      expect(decosAt(x, 15), `wall ${TileID[wall]}`).toEqual([deco]);
    }
  });

  it("police station and subway walls take the stone rubble, because they are registered as stone", async () => {
    // The trap. Both models carry `GameImages.TILE_WALL_STONE` as their `imageId`,
    // and the switch keys on `imageId`, so both land in the `Tiles/wall_stone`
    // case. Nothing in the C# names them and nothing throws.
    pave(TileID.FLOOR_TILES, 5, 5, 20, 20);

    for (const [wall, label] of [
      [TileID.WALL_POLICE_STATION, "police station"],
      [TileID.WALL_SUBWAY, "subway"],
    ] as const) {
      expect(Models.tiles.get(wall)!.imageId, `${label} is aliased to stone`).toBe(
        GameImages.TILE_WALL_STONE,
      );
      wallAt(12, 15, wall);
      await blast(12, 15);
      expect(decosAt(12, 15), `${label} rubble`).toEqual([GameImages.DECO_WALL_STONE_DAMAGED]);
      wallAt(12, 15, wall);
    }
  });

  it("clears any decoration the wall was already carrying", async () => {
    // Release 4's reason: "eg shop signage". A blown-up cinema wall should stop
    // advertising itself over the hole it just left.
    pave(TileID.FLOOR_TILES, 10, 10, 5, 5);
    wallAt(12, 12, TileID.WALL_MALL);
    tileAt(12, 12)!.addDecoration(GameImages.DECO_SHOP_GROCERY);
    tileAt(12, 12)!.addDecoration(GameImages.DECO_TAGS1);
    expect(decosAt(12, 12)).toHaveLength(2);

    await blast(12, 12);

    expect(decosAt(12, 12)).toEqual([GameImages.DECO_WALL_MALL_DAMAGED]);
  });

  it("drops a plank instead of rubble for the wood-plank wall", async () => {
    pave(TileID.FLOOR_TILES, 10, 10, 5, 5);
    wallAt(12, 12, TileID.WALL_WOOD_PLANKS);

    await blast(12, 12);

    // No drawing at all for this one: the C#'s case is a bare `DropItemAt`.
    expect(decosAt(12, 12)).toHaveLength(0);
    expect(map.getItemsAt(new Point(12, 12))?.countItems ?? 0).toBe(1);
    expect(modelAt(12, 12, TileID.FLOOR_TILES), "the floor still comes through").toBe(true);
  });

  it("leaves a bare gap for the red-curtain wall", async () => {
    // C# `:20175`, "leaves a whole gap". The curtain comes down entirely.
    pave(TileID.FLOOR_TILES, 10, 10, 5, 5);
    wallAt(12, 12, TileID.WALL_RED_CURTAINS);

    await blast(12, 12);

    expect(decosAt(12, 12)).toHaveLength(0);
    expect(modelAt(12, 12, TileID.FLOOR_TILES)).toBe(true);
  });
});

// ── 2. The adjacent-floor probe ───────────────────────────────────────────────

describe("ReplaceDestroyedWall: the adjacent-floor probe", () => {
  it("asks north first, and the order is load-bearing", async () => {
    // C# `:20183-20190`: y+1, y-1, x+1, x-1, first match wins. Four structural
    // floors around one wall, and only the y+1 one may be chosen.
    wallAt(12, 12, TileID.WALL_BRICK);
    map.setTileModelAt(12, 13, Models.tiles.get(TileID.FLOOR_OFFICE)!); // y+1
    map.setTileModelAt(12, 11, Models.tiles.get(TileID.FLOOR_CONCRETE)!); // y-1
    map.setTileModelAt(13, 12, Models.tiles.get(TileID.FLOOR_PLANKS)!); // x+1
    map.setTileModelAt(11, 12, Models.tiles.get(TileID.FLOOR_TILES)!); // x-1

    await blast(12, 12);

    expect(modelAt(12, 12, TileID.FLOOR_OFFICE)).toBe(true);
  });

  it("falls back to asphalt when no neighbour is a structural floor", async () => {
    // Grass is walkable but it is not one of the twenty-two, so this is the C#'s
    // "no adjacent floor tile" branch: asphalt, and the method returns before its
    // second switch ever runs.
    wallAt(12, 12, TileID.WALL_BRICK);
    await blast(12, 12);
    expect(modelAt(12, 12, TileID.FLOOR_ASPHALT)).toBe(true);
    expect(decosAt(12, 12)).toEqual([GameImages.DECO_WALL_BRICK_DAMAGED]);
  });

  it("adopts the one sewer-water model for a sewer neighbour", async () => {
    // The C# collapses five sewer *drawings* onto one *model* (`:20221-20227`),
    // because the animated frames are distinct images of the same destination
    // tile. Three of those five have no model of their own to stand in for them --
    // `FLOOR_SEWER_WATER` is a single registered model, with the cover hung off it
    // as `waterCoverImageId` rather than registered separately -- so this drives
    // the reachable one and the other four stay transcription.
    wallAt(12, 12, TileID.WALL_BRICK);
    map.setTileModelAt(12, 13, Models.tiles.get(TileID.FLOOR_SEWER_WATER)!);
    expect(map.isBuildingFloorTileAt(12, 13)).toBe(true);

    await blast(12, 12);

    expect(modelAt(12, 12, TileID.FLOOR_SEWER_WATER)).toBe(true);
  });

  it("the floor swap's dead cases", async () => {
    // `floor_food_court_pool` and `floor_white_tile` are handled by the method's
    // second switch and absent from `Map.isBuildingFloorTileAt`, so they can never
    // be the neighbour that gets picked. A wall flanked by exactly those two
    // floors has to fall through to the C#'s asphalt branch, which is only
    // observable if the predicate really does refuse them.
    for (const id of [TileID.FLOOR_FOOD_COURT_POOL, TileID.FLOOR_WHITE_TILE]) {
      map.setTileModelAt(12, 13, Models.tiles.get(id)!);
      expect(map.isBuildingFloorTileAt(12, 13), `${TileID[id]} must be refused`).toBe(false);
      map.setTileModelAt(12, 14, Models.tiles.get(id)!);
      expect(map.isBuildingFloorTileAt(12, 14), `${TileID[id]} must be refused`).toBe(false);

      wallAt(12, 12, TileID.WALL_BRICK);
      await blast(12, 12);
      expect(modelAt(12, 12, TileID.FLOOR_ASPHALT), `${TileID[id]} must not be adopted`).toBe(true);
      wallAt(12, 12, TileID.FLOOR_GRASS);
      map.setTileModelAt(12, 13, Models.tiles.get(TileID.FLOOR_GRASS)!);
      map.setTileModelAt(12, 14, Models.tiles.get(TileID.FLOOR_GRASS)!);
    }
  });

  it("adopts walkway for a structural floor the switch does not name", async () => {
    // Dirt is approved by `isBuildingFloorTileAt` and unnamed by the swap, so it
    // takes the `default` arm.
    wallAt(12, 12, TileID.WALL_BRICK);
    map.setTileModelAt(12, 13, Models.tiles.get(TileID.FLOOR_DIRT)!);
    expect(map.isBuildingFloorTileAt(12, 13)).toBe(true);

    await blast(12, 12);

    expect(modelAt(12, 12, TileID.FLOOR_WALKWAY)).toBe(true);
  });
});

// ── 3. isBuildingFloorTileAt ──────────────────────────────────────────────────

describe("Map.isBuildingFloorTileAt", () => {
  it("approves every structural floor model and nothing else", () => {
    // **Driven by `TileID`, not by image string**, because `Tile.model` is virtual:
    // its setter keeps only `value.id` and its getter resolves back through the
    // registry, so a fabricated `{ ...model, imageId }` is silently discarded and
    // the tile keeps its registered model. That is worth knowing because four of
    // the twenty-two approved ids -- the three sewer animation frames and the
    // sewer cover -- are *not* any model's `imageId`: they are decoration and
    // animation images hung off `FLOOR_SEWER_WATER` rather than registered tiles.
    // Those four stay transcription, exercised by no test here.
    const approved: readonly TileID[] = [
      TileID.FLOOR_OFFICE,
      TileID.FLOOR_TILES,
      TileID.FLOOR_CONCRETE,
      TileID.FLOOR_WALKWAY,
      TileID.FLOOR_PLANKS,
      TileID.FLOOR_RED_CARPET,
      TileID.FLOOR_BLUE_CARPET,
      TileID.FLOOR_DIRT,
      TileID.FLOOR_SEWER_WATER,
      TileID.FLOOR_POND_CENTER,
      TileID.FLOOR_POND_N_EDGE,
      TileID.FLOOR_POND_NE_CORNER,
      TileID.FLOOR_POND_E_EDGE,
      TileID.FLOOR_POND_SE_CORNER,
      TileID.FLOOR_POND_S_EDGE,
      TileID.FLOOR_POND_SW_CORNER,
      TileID.FLOOR_POND_W_EDGE,
      TileID.FLOOR_POND_NW_CORNER,
    ];
    for (const id of approved) {
      map.setTileModelAt(12, 12, Models.tiles.get(id)!);
      expect(map.isBuildingFloorTileAt(12, 12), TileID[id]).toBe(true);
    }

    map.setTileModelAt(12, 12, Models.tiles.get(TileID.FLOOR_GRASS)!);
    expect(map.isBuildingFloorTileAt(12, 12), "grass is walkable but not structural").toBe(false);
    map.setTileModelAt(12, 12, Models.tiles.get(TileID.WALL_BRICK)!);
    expect(map.isBuildingFloorTileAt(12, 12), "a wall is not a floor").toBe(false);
  });

  it("does not name the pond's water cover", () => {
    // The pond contributes nine structural tiles and the cover overlay is not one
    // of them, which is the C#'s list and not an oversight in the transcription.
    // Reachable as a *field* on `FLOOR_POND_CENTER` rather than as an image id.
    expect(Models.tiles.get(TileID.FLOOR_POND_CENTER)!.waterCoverImageId).toBe(
      GameImages.TILE_FLOOR_POND_WATER_COVER,
    );
    expect(Models.tiles.get(TileID.FLOOR_POND_CENTER)!.imageId).not.toBe(
      GameImages.TILE_FLOOR_POND_WATER_COVER,
    );
    map.setTileModelAt(12, 12, Models.tiles.get(TileID.FLOOR_POND_CENTER)!);
    expect(map.isBuildingFloorTileAt(12, 12)).toBe(true);
  });

  it("answers false for a tile off the map, which the one call site cannot reach", () => {
    expect(map.isBuildingFloorTileAt(-1, 5)).toBe(false);
    expect(map.isBuildingFloorTileAt(30, 5)).toBe(false);
  });
});

// ── 4. The two guards that come alive with the method ─────────────────────────

describe("ReplaceDestroyedWall: the guards it activates", () => {
  it("suppresses the scorch mark on the wall that just came down", async () => {
    pave(TileID.FLOOR_TILES, 10, 10, 5, 5);
    wallAt(12, 12, TileID.WALL_BRICK);

    await blast(12, 12);

    // `ApplyExplosionDamage` skips `ScorchBurntTile` when `wallDestroyed`, so the
    // rubble is not blackened over.
    expect(isScorched(12, 12), "an opened wall must stay legible").toBe(false);
  });

  it("still scorches a tile whose wall survived", async () => {
    // The same blast on a wall the guard rejects, so the mark proves the test above
    // is skipping scorch rather than scorch being broken generally.
    pave(TileID.FLOOR_TILES, 10, 10, 5, 5);
    wallAt(12, 12, TileID.WALL_CONCRETE);

    await blast(12, 12);

    expect(isScorched(12, 12)).toBe(true);
    // And the indestructible wall is still standing, with no rubble over it -- the
    // scorch mark is the only decoration, which is what makes this the control for
    // the suppressed case.
    expect(modelAt(12, 12, TileID.WALL_CONCRETE)).toBe(true);
    expect(decosAt(12, 12).some((d) => d.includes("DECO_WALL") || d.includes("damaged"))).toBe(false);
  });

  it("leaves a border wall alone, and one whose ring leaves the map", async () => {
    pave(TileID.FLOOR_TILES, 10, 10, 5, 5);
    // On the outermost ring: `anyAdjacentOutOfBounds` is true, so a blast may not
    // punch a hole out of the world at a district boundary.
    wallAt(0, 15, TileID.WALL_BRICK);
    await blast(0, 15);
    expect(modelAt(0, 15, TileID.WALL_BRICK), "the boundary holds").toBe(true);
  });

  it("leaves an indestructible wall alone even mid-map", async () => {
    pave(TileID.FLOOR_TILES, 10, 10, 5, 5);
    wallAt(12, 12, TileID.WALL_CONCRETE);
    await blast(12, 12);
    expect(modelAt(12, 12, TileID.WALL_CONCRETE)).toBe(true);
  });

  it("gives every rubble drawing an id the scorch guard recognises", async () => {
    // `ScorchBurntTile`'s damaged-wall guard matches on the substring `_damaged`,
    // so all nine ids have to end in it -- they are named for the drawing, not for
    // a state, and that is what keeps a tile fire off an opened wall.
    const ids = [
      GameImages.DECO_WALL_BRICK_DAMAGED,
      GameImages.DECO_WALL_CHAR_OFFICE_DAMAGED,
      GameImages.DECO_WALL_HOSPITAL_DAMAGED,
      GameImages.DECO_WALL_SEWER_DAMAGED,
      GameImages.DECO_WALL_STONE_DAMAGED,
      GameImages.DECO_WALL_LIGHT_BROWN_DAMAGED,
      GameImages.DECO_WALL_ARMY_BASE_DAMAGED,
      GameImages.DECO_WALL_FUEL_STATION_DAMAGED,
      GameImages.DECO_WALL_MALL_DAMAGED,
    ];
    for (const id of ids) expect(id, id).toContain("_damaged");
  });
});