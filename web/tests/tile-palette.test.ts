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

  it("keeps isWalkable and isTransparent consistent with the C# table", () => {
    // GameTiles.cs passes (walkable, transparent); floors are both true,
    // walls both false. A swapped pair would make walls walkable.
    for (let i = 1; i < TileID._COUNT; i++) {
      const model = tiles.get(i);
      const id = i as TileID;
      const isFloor = id <= TileID.RAIL_EW;
      expect(model.isWalkable, `TileID ${i} walkable`).toBe(isFloor);
      expect(model.isTransparent, `TileID ${i} transparent`).toBe(isFloor);
    }
  });

  it("gives every wall a minimap colour that is not the UNDEF pink", () => {
    // A missing colour shows as magenta; catching it here beats seeing it.
    for (let id = TileID.WALL_BRICK; id < TileID._COUNT; id++) {
      const c = tiles.get(id).minimapColor;
      expect(`${c.r},${c.g},${c.b}`, `wall ${id} is UNDEF pink`).not.toBe(
        `${Color.Pink.r},${Color.Pink.g},${Color.Pink.b}`
      );
    }
  });
});
