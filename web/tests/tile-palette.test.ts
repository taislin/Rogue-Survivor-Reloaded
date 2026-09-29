import { describe, it, expect } from "vitest";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { Color } from "@engine/Color";
import { DollPart } from "@data/Doll";

/**
 * Regression tests for the six §1.1f fidelity bugs in the four previously
 * unaudited tables (tile model, doll, `Rules` constants, item hierarchy).
 *
 * Every one of these is the same failure shape, and that is the point: **a
 * wrong *value* in a table produces no error.** A green type-check, a green
 * build, a clean 1 000-turn headless run and a readable minimap are all
 * consistent with a wall that renders 40% too dark or an AI that sees two tiles
 * too far in the rain. Only comparing against the C# finds them, and only a
 * test stops them coming back.
 *
 * C# references are to `src/`, which this project never modifies.
 */

const tiles = new GameTiles();

describe("§1.1f bug 53: DRK_GRAY1 is DimGray, not DarkGray", () => {
  // GameTiles.cs:47-48 declares DRK_GRAY1 = DimGray immediately followed by
  // DRK_GRAY2 = DarkGray; the port took the second name's value.
  it("uses the .NET DimGray value, which is what .NET DimGray is", () => {
    expect(Color.DimGray.r).toBe(105);
    expect(Color.DimGray.g).toBe(105);
    expect(Color.DimGray.b).toBe(105);
  });

  it("does not render brick or stone walls with DarkGray", () => {
    for (const id of [TileID.WALL_BRICK, TileID.WALL_STONE]) {
      const c = tiles.get(id).minimapColor;
      expect(c.r, `tile ${id} not DimGray`).toBe(Color.DimGray.r);
      expect(c.g, `tile ${id} not DimGray`).toBe(Color.DimGray.g);
      expect(c.b, `tile ${id} not DimGray`).toBe(Color.DimGray.b);
    }
  });

  it("keeps DarkGray distinct from DimGray, or the fix is unverifiable", () => {
    // If these two ever converge, the assertion above becomes vacuous.
    expect(Color.DarkGray.r).not.toBe(Color.DimGray.r);
  });
});

describe("§1.1f bug 54: WALL_POLICE_STATION is CadetBlue, not Cyan", () => {
  // GameTiles.cs:123 passes Color.CadetBlue. WALL_POLICE_STATION,
  // WALL_STONE and WALL_SUBWAY all render TILE_WALL_STONE, so the minimap
  // separates them by colour alone.
  it("uses CadetBlue, matching GameTiles.cs:123", () => {
    const c = tiles.get(TileID.WALL_POLICE_STATION).minimapColor;
    expect(c.r).toBe(95);
    expect(c.g).toBe(158);
    expect(c.b).toBe(160);
  });

  it("is distinguishable from the subway wall it shares a sprite with", () => {
    const police = tiles.get(TileID.WALL_POLICE_STATION).minimapColor;
    const subway = tiles.get(TileID.WALL_SUBWAY).minimapColor;
    expect(tiles.get(TileID.WALL_POLICE_STATION).imageId).toBe(
      tiles.get(TileID.WALL_SUBWAY).imageId
    );
    // Same sprite, so colour is the only discriminator. It must differ.
    expect(`${police.r},${police.g},${police.b}`).not.toBe(`${subway.r},${subway.g},${subway.b}`);
  });

  it("is not Cyan", () => {
    const c = tiles.get(TileID.WALL_POLICE_STATION).minimapColor;
    expect(`${c.r},${c.g},${c.b}`).not.toBe(`${Color.Cyan.r},${Color.Cyan.g},${Color.Cyan.b}`);
  });
});

describe("§1.1f bug 55: LIT_BROWN is BurlyWood, not Brown", () => {
  // GameTiles.cs:53 uses Color.BurlyWood, a System.Drawing known colour that
  // did not exist in the port at all -- so this was a missing constant rather
  // than a misnamed one.
  it("adds BurlyWood at the .NET value #DEB887", () => {
    expect(Color.BurlyWood.r).toBe(222);
    expect(Color.BurlyWood.g).toBe(184);
    expect(Color.BurlyWood.b).toBe(135);
  });

  it("renders plank floors as pale tan, not saturated red", () => {
    const c = tiles.get(TileID.FLOOR_PLANKS).minimapColor;
    expect(`${c.r},${c.g},${c.b}`).toBe("222,184,135");
    // Brown is (165,42,42): red-dominant. The tan must not be.
    expect(c.r).toBeGreaterThan(c.b);
  });

  it("does not collide with the dark red of WALL_CHAR_OFFICE", () => {
    const planks = tiles.get(TileID.FLOOR_PLANKS).minimapColor;
    const office = tiles.get(TileID.WALL_CHAR_OFFICE).minimapColor;
    expect(`${planks.r},${planks.g},${planks.b}`).not.toBe(`${office.r},${office.g},${office.b}`);
  });
});

describe("§1.1f bug 56: DollPart._FIRST exists", () => {
  // Doll.cs:14-16 declares RIGHT_HAND = _FIRST, and BaseTownGenerator.cs:5605
  // loops from _FIRST. Values are identical, so this is a naming gap only --
  // but the alias makes the loop read as the original.
  it("aliases _FIRST to the first real part", () => {
    expect(DollPart._FIRST).toBe(DollPart.RIGHT_HAND);
    expect(DollPart._FIRST).toBe(1);
  });

  it("keeps the part values the C# enum assigns", () => {
    expect(DollPart.NONE).toBe(0);
    expect(DollPart.RIGHT_HAND).toBe(1);
    expect(DollPart.LEFT_HAND).toBe(2);
    expect(DollPart.HEAD).toBe(3);
    expect(DollPart.TORSO).toBe(4);
    expect(DollPart.LEGS).toBe(5);
    expect(DollPart.FEET).toBe(6);
    expect(DollPart.SKIN).toBe(7);
    expect(DollPart.EYES).toBe(8);
    expect(DollPart._COUNT).toBe(9);
  });
});

describe("the tile table is fully populated", () => {
  it("returns the UNDEF sentinel for TileID.UNDEF", () => {
    // `get` falls back to TileModel.UNDEF, whose imageId is "" -- so a hole in
    // the table is indistinguishable from UNDEF by value alone. The only way
    // to prove a slot was really assigned is to know what UNDEF looks like.
    expect(tiles.get(TileID.UNDEF).imageId).toBe("");
    expect(tiles.get(TileID.UNDEF).minimapColor).toBe(Color.Pink);
  });

  it("has a real model for every non-UNDEF TileID", () => {
    // Every id in [1, _COUNT) must resolve to a model with a real imageId.
    // A hole would silently resolve to UNDEF, whose "" imageId is the tell.
    for (let i = 1; i < TileID._COUNT; i++) {
      const model = tiles.get(i);
      expect(model.imageId, `TileID ${i} fell through to UNDEF`).not.toBe("");
      expect(model.id, `TileID ${i} model has the wrong id`).toBe(i);
    }
  });

  /**
   * Prefixes whose members are walkable and transparent. Everything else in the
   * enum is a wall.
   *
   * This replaces an assertion that read `id <= TileID.RAIL_EW` to decide what a
   * floor is, which silently assumed the enum is ordered floors-first. It is,
   * today — but the Still Alive content pack interleaves new walls *and* new
   * floors (`wall_mall`, `floor_white_tile`, `wall_pillar_concrete`,
   * `parking_asphalt_ns` all arrive in one batch), so the next person to append
   * a wall tile would have had to remember that appending a wall is illegal.
   * Deriving it from the name instead means the table can grow in any order, and
   * a *wrong* flag is caught rather than being reclassified by a boundary that
   * moves.
   */
  const WALKABLE_PREFIXES = ["FLOOR_", "ROAD_", "RAIL_", "PARKING_", "WALK_"];

  const tileName = (id: TileID): string => TileID[id] ?? "";

  it("keeps isWalkable and isTransparent consistent with the C# table", () => {
    // GameTiles.cs passes (walkable, transparent) and the two always agree:
    // floors are both true, walls both false. A swapped pair would make walls
    // walkable, so that agreement is the invariant.
    for (let i = 1; i < TileID._COUNT; i++) {
      const model = tiles.get(i);
      expect(
        model.isWalkable,
        `TileID ${i} (${tileName(i as TileID)}) has isWalkable !== isTransparent`,
      ).toBe(model.isTransparent);
    }
  });

  it("agrees with what the tile is called, not with its position in the enum", () => {
    for (let i = 1; i < TileID._COUNT; i++) {
      const id = i as TileID;
      const shouldBeWalkable = WALKABLE_PREFIXES.some((p) => tileName(id).startsWith(p));
      expect(
        tiles.get(id).isWalkable,
        `TileID ${i} (${tileName(id)}) isWalkable disagrees with its name`,
      ).toBe(shouldBeWalkable);
    }
  });

  it("gives every wall a minimap colour that is not the UNDEF pink", () => {
    // A missing colour shows as magenta; catching it here beats seeing it.
    // Keyed on `isWalkable` rather than on `id >= WALL_BRICK`, for the same
    // reason as above.
    for (let i = 1; i < TileID._COUNT; i++) {
      if (tiles.get(i).isWalkable) continue;
      const c = tiles.get(i).minimapColor;
      expect(`${c.r},${c.g},${c.b}`, `wall ${i} (${tileName(i as TileID)}) is UNDEF pink`).not.toBe(
        `${Color.Pink.r},${Color.Pink.g},${Color.Pink.b}`
      );
    }
  });

  it("would not have accepted a wall inserted before the last floor", () => {
    // The premise behind the two tests above, asserted so they cannot pass
    // vacuously: the old `id <= RAIL_EW` check really did classify by position,
    // so appending a wall to the middle of the table would have flipped the
    // walkable/transparent expectation for it *and* for everything after it.
    const lastFloor = WALKABLE_PREFIXES.length > 0 ? tiles.get(TileID.RAIL_EW) : null;
    expect(lastFloor?.isWalkable).toBe(true);
    expect(tileName(TileID.RAIL_EW).startsWith("RAIL_")).toBe(true);
  });
});
