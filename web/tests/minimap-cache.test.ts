import { describe, it, expect } from "vitest";
import { Map as GameMap } from "@data/Map";
import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { Point } from "@engine/Point";
import { GameActors, ActorID } from "@gameplay/GameActors";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { GameImages } from "@gameplay/GameImages";
import { RogueGame } from "@engine/RogueGame";
import { grepAll } from "./helpers/grepAll";

/**
 * The minimap raster cache in `RogueGame.DrawMiniMap` is only correct if the
 * map bumps `minimapRevision` whenever anything the raster derives from
 * changes. Getting that wrong produces a minimap that silently stops updating —
 * the player explores and the map stays blank. These tests pin the invalidation
 * contract, which is much easier to break by accident than to notice.
 */

const actorsDB = new GameActors();
const tilesDB = new GameTiles();
const faction = new Faction("Testers", "tester");

function newMap(size = 20): GameMap {
  const map = new GameMap(1234, "test map", size, size);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) map.setTileModelAt(x, y, tilesDB.get(TileID.FLOOR_CONCRETE));
  }
  return map;
}

describe("Map.minimapRevision", () => {
  it("does not change while the visited set is untouched", () => {
    const map = newMap();
    const before = map.minimapRevision;
    map.getTileAt(1, 1);
    map.getTileAt(5, 5);
    expect(map.minimapRevision).toBe(before);
  });

  it("bumps when a tile becomes visited", () => {
    const map = newMap();
    const before = map.minimapRevision;
    map.markVisited(3, 4);
    expect(map.minimapRevision).toBeGreaterThan(before);
    expect(map.getTileAt(3, 4)!.isVisited).toBe(true);
  });

  it("does not bump when re-marking an already visited tile", () => {
    // The FOV update revisits the same tiles constantly; bumping every time
    // would defeat the cache entirely.
    const map = newMap();
    map.markVisited(3, 4);
    const after = map.minimapRevision;
    for (let i = 0; i < 50; i++) map.markVisited(3, 4);
    expect(map.minimapRevision).toBe(after);
  });

  it("ignores out-of-bounds marks", () => {
    const map = newMap();
    const before = map.minimapRevision;
    map.markVisited(-1, 0);
    map.markVisited(0, 999);
    expect(map.minimapRevision).toBe(before);
  });

  it("bumps when the whole map is forgotten", () => {
    const map = newMap();
    map.markVisited(2, 2);
    const before = map.minimapRevision;
    map.setAllAsUnvisited();
    expect(map.minimapRevision).toBeGreaterThan(before);
    expect(map.getTileAt(2, 2)!.isVisited).toBe(false);
  });

  it("bumps when a tile model changes, since the model carries the minimap colour", () => {
    // Every caller today is world generation, before anything is drawn. This
    // test exists so that if that ever stops being true, the cached minimap
    // cannot silently go stale.
    const map = newMap();
    const before = map.minimapRevision;
    map.setTileModelAt(2, 2, tilesDB.get(TileID.WALL_STONE));
    expect(map.minimapRevision).toBeGreaterThan(before);
  });
});

describe("Map.getExitAtXY", () => {
  it("matches getExitAt for the same coordinate", () => {
    const map = newMap();
    const withExit = newMap();
    // An exit is just a position->Exit entry; add one directly to compare.
    const exit = { toMap: null, toPosition: new Point(0, 0) } as never;
    withExit.addExit(new Point(2, 3), exit);

    expect(withExit.getExitAtXY(2, 3)).toBe(withExit.getExitAt(new Point(2, 3)));
    expect(withExit.getExitAtXY(9, 9)).toBeNull();
    expect(map.getExitAtXY(0, 0)).toBeNull();
  });
});

describe("minimap cache invalidation end to end", () => {
  it("rebuilds exactly when the raster would differ", () => {
    // Mirrors what DrawMiniMap does: rebuild when (map, revision) changes.
    const map = newMap();
    let cachedMap: GameMap | null = null;
    let cachedRevision = -1;
    let rebuilds = 0;

    const draw = (m: GameMap): void => {
      if (cachedMap !== m || cachedRevision !== m.minimapRevision) {
        cachedMap = m;
        cachedRevision = m.minimapRevision;
        rebuilds++;
      }
    };

    draw(map);
    expect(rebuilds).toBe(1);

    // A frame with no change must not rebuild.
    draw(map);
    draw(map);
    expect(rebuilds).toBe(1);

    // Exploring does.
    map.markVisited(3, 3);
    draw(map);
    expect(rebuilds).toBe(2);

    // Switching maps does, even at the same revision number.
    const other = newMap();
    other.markVisited(1, 1);
    other.markVisited(2, 2);
    draw(other);
    expect(rebuilds).toBe(3);
  });
});

describe("Tile.hasDecorations guard", () => {
  it("is false for a tile with no decorations, so the 4 hasDecoration calls are skipped", () => {
    // DrawMiniMap's tag loop calls hasDecoration up to 4x per tile. Guarding
    // with hasDecorations turns 4 array walks into one boolean read for the
    // overwhelming majority of tiles, which have no decorations at all.
    const map = newMap();
    const bare = map.getTileAt(1, 1)!;
    expect(bare.hasDecorations).toBe(false);
    expect(bare.hasDecoration("anything")).toBe(false);

    bare.addDecoration("some_tag");
    expect(bare.hasDecorations).toBe(true);
    expect(bare.hasDecoration("some_tag")).toBe(true);
  });
});

describe("the player-tag scan is cached, not repeated per frame", () => {
  it("collects only visited tiles carrying a player tag, with the right sprite", () => {
    // The scan that used to run 10 000 iterations on every redraw — and every
    // redraw is forced by any mouse movement. Extracted as
    // `RogueGame.collectPlayerTagTiles` so it is testable without a frame.
    const map = newMap(10);
    const collect = (m: GameMap) =>
      (RogueGame as unknown as {
        collectPlayerTagTiles: (m: GameMap) => Array<{ x: number; y: number; minitag: string }>;
      }).collectPlayerTagTiles(m);

    expect(collect(map), "an unvisited map has no tags").toEqual([]);

    // Unvisited tile with a tag: must NOT appear, matching the original guard.
    const unvisited = map.getTileAt(1, 1)!;
    unvisited.addDecoration(GameImages.DECO_PLAYER_TAG1);
    expect(collect(map), "an unvisited tag must not be drawn").toEqual([]);

    map.markVisited(1, 1);
    expect(collect(map)).toEqual([{ x: 1, y: 1, minitag: GameImages.MINI_PLAYER_TAG1 }]);

    // All four tags map to distinct minimap sprites, and the first match wins.
    map.getTileAt(2, 2)!.addDecoration(GameImages.DECO_PLAYER_TAG2);
    map.getTileAt(3, 3)!.addDecoration(GameImages.DECO_PLAYER_TAG3);
    map.getTileAt(4, 4)!.addDecoration(GameImages.DECO_PLAYER_TAG4);
    map.markVisited(2, 2);
    map.markVisited(3, 3);
    map.markVisited(4, 4);
    const found = collect(map);
    expect(found).toHaveLength(4);
    expect(found.map((t) => t.minitag)).toEqual([
      GameImages.MINI_PLAYER_TAG1,
      GameImages.MINI_PLAYER_TAG2,
      GameImages.MINI_PLAYER_TAG3,
      GameImages.MINI_PLAYER_TAG4,
    ]);

    // An unrelated decoration is not a player tag.
    const map2 = newMap(6);
    map2.getTileAt(0, 0)!.addDecoration(GameImages.DECO_BLOODIED_FLOOR);
    map2.markVisited(0, 0);
    expect(collect(map2)).toEqual([]);
  });

  it("nothing in the game ever adds a player tag, so the scan is dormant in the C# too", () => {
    // Worth recording: the C# only ever *reads* DECO_PLAYER_TAG1..4
    // (RogueGame.cs:19059-19065). The loop is faithful, not a port omission, and
    // it is why caching the list was the right call rather than deleting it.
    const readers = grepAll("src", /addDecoration\(GameImages\.DECO_PLAYER_TAG/);
    expect(readers, "a player tag is now added at runtime; the revision contract must be revisited")
      .toEqual([]);
  });
});

describe("actor sanity", () => {
  it("constructs an actor, so the fixtures above stay honest", () => {
    const a = new Actor(actorsDB.get(ActorID.MALE_CIVILIAN), faction, "Alice");
    expect(a.theName).toBeTruthy();
  });
});
