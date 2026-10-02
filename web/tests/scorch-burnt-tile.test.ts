/**
 * `ScorchBurntTile` -- the burn mark an explosion or a flame weapon leaves behind.
 *
 * Still Alive, Release 2, extended for explosive damage ranges in Release 4 and
 * split into wall/floor marks in Release 6-3.
 *
 * Until this was ported, `RogueGame.scorchBurntTile` was three lines that set the
 * `IS_SCORCHED` flag and stopped. The flag is the important half for the *simulation*
 * -- `Map.isInflammableTile` reads it, so a scorched tile has no fuel and a
 * spreading fire walks over it -- but a player never sees it. This file covers the
 * half a player sees, and the three decisions that separate one scorch mark from
 * another.
 *
 * The decisions, in the order the C# makes them:
 *
 *  1. **Stairs are skipped.** A scorch on a staircase would cover the exit.
 *  2. **A damaged wall is skipped.** The mark would hide the hole the blast made.
 *  3. **Damage picks the mark, and wall-vs-floor picks within the mark.** Five
 *     sprites for three tiers.
 *
 * And one decision that is easy to misread as a detail: **`damage > 0` gates the
 * flag too**, not just the drawing. A zero-damage call marks nothing at all. That
 * is why `setTileOnFire` only scorches a tile a fire has actually caught on.
 *
 * The tiers are the C#'s own, along with its own complaint about them -- it calls
 * the thresholds "a lazy way of doing it -- should go back and calculate based on
 * radius from the center of the blast" (`RogueGame.cs:24578`). Transliterated
 * unchanged; a scorch that differs from the reference is worse than one that is
 * merely arbitrary.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Exit, Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { Point } from "@engine/Point";
import { Ruleset, Session } from "@engine/Session";
import { WorldTime } from "@engine/WorldTime";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { GameImages } from "@gameplay/GameImages";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { GameActors } from "@gameplay/GameActors";
import { GameItems } from "@gameplay/GameItems";
import { NullRogueUI } from "@ui/NullRogueUI";
import { RogueGame } from "@engine/RogueGame";

let game: RogueGame;
let map: GameMap;

/** `ScorchBurntTile` is private; the tests reach it the way the engine does. */
const scorch = (x: number, y: number, damage: number): void =>
  (
    game as unknown as {
      scorchBurntTile(m: GameMap, x: number, y: number, damage: number): void;
    }
  ).scorchBurntTile(map, x, y, damage);

/** The scorch mark on a tile, if any. */
const mark = (x: number, y: number): string | undefined =>
  (map.getTileAt(x, y)!.getDecorations ?? []).find((d) => d.includes("scorched_"));

const pave = (x0: number, y0: number, w: number, h: number, id: TileID): void => {
  for (let x = x0; x < x0 + w; x++) {
    for (let y = y0; y < y0 + h; y++) {
      map.setTileModelAt(x, y, Models.tiles.get(id)!);
    }
  }
};

beforeEach(() => {
  new GameActors();
  new GameTiles();
  new GameItems();
  Session.useSeed(1);
  game = new RogueGame(new NullRogueUI());
  map = new GameMap(1, "test", 30, 30);
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  pave(0, 0, 30, 30, TileID.FLOOR_GRASS);
});

describe("ScorchBurntTile: the damage tiers", () => {
  it("draws the outer floor mark at or below 40 damage", () => {
    // The C#'s first tier is `damage <= 40`, and `setTileOnFire` passes
    // BASE_TILE_FIRE_DAMAGE (1), so an ordinary spreading fire draws this and
    // nothing heavier. Only explosions reach the tiers above.
    for (const [x, damage] of [
      [5, 1],
      [6, 20],
      [7, 40],
    ] as const) {
      scorch(x, 5, damage);
      expect(mark(x, 5), `${damage} damage`).toBe(GameImages.DECO_SCORCH_MARK_OUTER_FLOOR);
    }
  });

  it("draws the inner mark from 41 to 120 damage", () => {
    for (const [x, damage] of [
      [5, 41],
      [6, 80],
      [7, 120],
    ] as const) {
      scorch(x, 6, damage);
      expect(mark(x, 6), `${damage} damage`).toBe(GameImages.DECO_SCORCH_MARK_INNER_FLOOR);
    }
  });

  it("draws the centre mark above 120 damage", () => {
    scorch(5, 7, 121);
    expect(mark(5, 7)).toBe(GameImages.DECO_SCORCH_MARK_CENTER_FLOOR);
    scorch(6, 7, 5000);
    expect(mark(6, 7)).toBe(GameImages.DECO_SCORCH_MARK_CENTER_FLOOR);
  });

  it("picks the wall variant in the two lower tiers", () => {
    // Release 6-3 split the marks into wall and floor versions, because the wall
    // pair is "slightly tilted to give the appearance of being on a vertical"
    // (the C#'s words, `GameImages.cs:334`). Only the *centre* mark has no wall
    // variant, because it is a flat drawing and the C# lays it over a wall too.
    pave(10, 10, 1, 1, TileID.WALL_WOOD_PLANKS);
    scorch(10, 10, 20);
    expect(mark(10, 10)).toBe(GameImages.DECO_SCORCH_MARK_OUTER_WALL);
    pave(11, 11, 1, 1, TileID.WALL_WOOD_PLANKS);
    scorch(11, 11, 80);
    expect(mark(11, 11)).toBe(GameImages.DECO_SCORCH_MARK_INNER_WALL);
  });

  it("lays the flat centre mark over a wall as well, because there is no wall centre", () => {
    pave(12, 12, 1, 1, TileID.WALL_WOOD_PLANKS);
    scorch(12, 12, 500);
    expect(mark(12, 12)).toBe(GameImages.DECO_SCORCH_MARK_CENTER_FLOOR);
  });
});

describe("ScorchBurntTile: the guards", () => {
  it("sets the flag, so the tile has no fuel left", () => {
    scorch(3, 3, 10);
    expect(map.getTileAt(3, 3)!.isScorched, "IsScorched").toBe(true);
  });

  it("does nothing at all at zero damage -- not even the flag", () => {
    // This is the guard that is easy to misread as being about the drawing. In the
    // C# `IsScorched = true` is *inside* the `if (damage > 0)`, so a zero-damage
    // call leaves the tile completely untouched.
    scorch(4, 4, 0);
    expect(map.getTileAt(4, 4)!.isScorched, "no flag").toBe(false);
    expect(mark(4, 4), "no mark").toBeUndefined();
  });

  it("does not stack a second scorch over a first", () => {
    // Release 5-2's `TileAlreadyHasScorchDecoration`. The check asks about *any* of
    // the five, not the tier that is about to be drawn, so a tile that took a
    // 200-damage blast keeps the big mark when a 10-damage fire walks over it.
    scorch(2, 2, 500);
    scorch(2, 2, 10);
    expect(mark(2, 2), "the first mark survives").toBe(GameImages.DECO_SCORCH_MARK_CENTER_FLOOR);
    expect(
      map.getTileAt(2, 2)!.getDecorations!.filter((d) => d.includes("scorched_")).length,
      "exactly one mark",
    ).toBe(1);
  });

  it("skips stairs, so a scorch cannot cover an exit", () => {
    // C# `:24558`. The tile here is walkable floor, so only the exit check can be
    // what stopped it.
    // There is no stairs tile in the port's set, which makes this guard *more*
    // testable than the real thing: the exit is placed on ordinary walkable floor,
    // so the only thing that can stop the scorch is the `getExitAt` check.
    map.addExit(new Point(9, 9), new Exit(null, new Point(9, 20)));
    scorch(9, 9, 100);
    expect(mark(9, 9), "no mark over the stairs").toBeUndefined();
    expect(map.getTileAt(9, 9)!.isScorched, "and no flag").toBe(false);

    // A neighbouring tile with no exit is scorched, so the test is not passing
    // because `scorch` is broken.
    scorch(10, 9, 100);
    expect(mark(10, 9), "the tile beside it is marked").toBe(GameImages.DECO_SCORCH_MARK_INNER_FLOOR);
  });
});

describe("ScorchBurntTile: the mark is temporary, the flag is not", () => {
  it("schedules the C#'s three-day cleanup and then removes the drawing", () => {
    scorch(6, 6, 40);
    expect(mark(6, 6), "drawn now").toBe(GameImages.DECO_SCORCH_MARK_OUTER_FLOOR);

    // The C# adds `TaskRemoveDecoration(TURNS_PER_DAY * 3)` next to every mark:
    // a scorch is evidence that a fire *was* here, not a permanent scar.
    expect(map.countTimers, "one cleanup timer").toBe(1);

    const perDay = WorldTime.TURNS_PER_DAY;
    for (let turn = 0; turn < perDay * 3 - 1; turn++) map.tickTimers();
    expect(mark(6, 6), "still there before three days").toBe(GameImages.DECO_SCORCH_MARK_OUTER_FLOOR);

    map.tickTimers();
    expect(mark(6, 6), "gone after three days").toBeUndefined();
  });

  it("leaves the flag behind after the drawing has gone", () => {
    // The asymmetry is the point: `IsScorched` means "no fuel left", which is
    // permanent, while the drawing is a three-day memory of the fire.
    scorch(7, 7, 40);
    for (let turn = 0; turn < WorldTime.TURNS_PER_DAY * 3; turn++) map.tickTimers();
    expect(mark(7, 7), "drawing gone").toBeUndefined();
    expect(map.getTileAt(7, 7)!.isScorched, "flag remains").toBe(true);
  });
});

describe("ScorchBurntTile: Map.tileAlreadyHasScorchDecoration", () => {
  it("answers true for every one of the five marks", () => {
    // All five are listed in the C# (`:406-416`), so "already scorched" means
    // scorched by *any* tier. Each is placed by hand because there is no other
    // way to get the two wall marks and the centre mark onto one tile.
    for (const imageId of [
      GameImages.DECO_SCORCH_MARK_OUTER_WALL,
      GameImages.DECO_SCORCH_MARK_INNER_WALL,
      GameImages.DECO_SCORCH_MARK_OUTER_FLOOR,
      GameImages.DECO_SCORCH_MARK_INNER_FLOOR,
      GameImages.DECO_SCORCH_MARK_CENTER_FLOOR,
    ]) {
      map.getTileAt(1, 1)!.addDecoration(imageId);
      expect(map.tileAlreadyHasScorchDecoration(1, 1), imageId).toBe(true);
      map.getTileAt(1, 1)!.removeDecoration(imageId);
      expect(map.tileAlreadyHasScorchDecoration(1, 1), `${imageId} removed`).toBe(false);
    }
  });

  it("ignores decorations that are not scorch marks", () => {
    map.getTileAt(1, 2)!.addDecoration(GameImages.EFFECT_ONFIRE);
    expect(map.tileAlreadyHasScorchDecoration(1, 2)).toBe(false);
  });
});

describe("Feature.TileFires: a fire draws the outer mark", () => {
  const ignite = (x: number, y: number, flameWeapon: boolean): Promise<void> =>
    (
      game as unknown as {
        setTileOnFire(m: GameMap, x: number, y: number, w: boolean): Promise<void>;
      }
    ).setTileOnFire(map, x, y, flameWeapon);

  it("ignites a walkable tile, which scorches it at BASE_TILE_FIRE_DAMAGE", async () => {
    // Red carpet is one of the five flammable models and is walkable, so it burns.
    pave(2, 2, 3, 3, TileID.FLOOR_RED_CARPET);
    await ignite(3, 3, true);

    expect(map.getTileAt(3, 3)!.isOnFire, "the fire took").toBe(true);
    // Damage 1 lands in the `<= 40` tier, so a spreading fire never draws anything
    // heavier than the outer mark however long it burns.
    expect(mark(3, 3)).toBe(GameImages.DECO_SCORCH_MARK_OUTER_FLOOR);
    expect(map.getTileAt(3, 3)!.isScorched, "and flags the tile").toBe(true);
  });

  it("does not scorch a wall a spreading fire reaches, and that is the whole design", async () => {
    // The C#'s note on `wasFlameWeapon` is the important part: a spreading fire
    // does not scorch or ignite walls, only flame weapons and explosions do.
    // Without this, fire walks straight through a wall and the building stops
    // being a refuge.
    pave(20, 20, 2, 2, TileID.WALL_BRICK);
    await ignite(20, 20, false);

    expect(map.getTileAt(20, 20)!.isOnFire, "a wall does not burn").toBe(false);
    expect(map.getTileAt(20, 20)!.isScorched, "and is not scorched by a fire").toBe(false);
    expect(mark(20, 20), "no mark").toBeUndefined();
  });

  it("does scorch that same wall for a flame weapon", async () => {
    // The other half of the same guard: a flame weapon takes the wall, which is
    // why the parameter exists at all rather than the scorch being unconditional.
    pave(21, 21, 2, 2, TileID.WALL_BRICK);
    await ignite(21, 21, true);

    expect(map.getTileAt(21, 21)!.isOnFire, "still no fire on a wall").toBe(false);
    expect(map.getTileAt(21, 21)!.isScorched, "but scorched").toBe(true);
    expect(mark(21, 21), "wall mark, outer tier").toBe(GameImages.DECO_SCORCH_MARK_OUTER_WALL);
  });

  it("is reachable under the feature flag", () => {
    expect(hasFeature(Session.get().ruleset, Feature.TileFires)).toBe(true);
  });
});