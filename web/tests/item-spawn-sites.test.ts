/**
 * The three ammo and shield drops that had factories but no spawn site.
 *
 * The port has carried five Still Alive ammunition factories for a while -- nail
 * gun, plasma, minigun, grenade launcher and the random common roll -- with
 * `DoUnloadAmmoFromGun` as their only reader, so a survivor could take rounds
 * back out of a gun and nothing in the world put them in. The reference drops
 * them from `BaseTownGenerator` (`:8473` for plasma, `:7500` for nails) and
 * `RogueGame.cs:28314` (the army supply drop's common ammo).
 *
 * The riot shield's case was the same shape with one difference: the mechanic was
 * fully wired (`tests/police-riot-shield.test.ts` reads the block roll) and the
 * item was in no loot table at all, so a shield was an item only a save file
 * could hold.
 *
 * ## What is *not* here
 *
 * The army supply drop's `makeItemRandomCommonAmmo` arm (`RogueGame.cs:28314-28315`)
 * is still not ported. It sits in the helicopter-rescue supply drop, which is
 * where the next batch of this work goes; this file is the town generators.
 */

import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Item } from "@data/Item";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Options, Resources } from "@engine/GameOptions";
import { Ruleset, Session } from "@engine/Session";
import { ItemID } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { Parameters } from "@gameplay/generators/BaseTownGenerator";
import { StdTownGenerator } from "@gameplay/generators/StdTownGenerator";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";

new GameTiles();

/** The two generators' sources, which the rolls are pinned against. */
const townSource = readFileSync(
  resolve(__dirname, "..", "src/gameplay/generators/BaseTownGenerator.ts"),
  "utf8",
);
const mapGenSource = readFileSync(
  resolve(__dirname, "..", "src/gameplay/generators/BaseMapGenerator.ts"),
  "utf8",
);

function freshGenerator(seed = 4242): StdTownGenerator {
  const runner = new HeadlessRunner(seed);
  return new StdTownGenerator(runner.rogueGame, new Parameters());
}

/** The model ids `makeShopConstructionItem` returns, over `seeds` seeded rollers. */
function constructionModels(seeds: number[]): Set<number> {
  const seen = new Set<number>();
  for (const seed of seeds) {
    const g = freshGenerator(seed);
    for (let i = 0; i < 40; i++) seen.add(g.makeShopConstructionItem().model.id);
  }
  return seen;
}

/**
 * A room of single-tile alcoves, every one of them walled on all four sides.
 *
 * `makeCHARArmoryRoom` only puts a shelf where `countAdjWalls >= 3`, so a plain
 * walled rectangle yields its four corners and nothing else -- which is how the
 * first version of this test concluded plasma was still missing when it was only
 * testing the corners.
 */
function armoryMap(): { map: GameMap; room: Rect } {
  const map = new GameMap(11, "armory", 40, 40);
  const wall = Models.tiles.get(TileID.WALL_POLICE_STATION)!;
  const floor = Models.tiles.get(TileID.FLOOR_CONCRETE)!;
  for (let x = 0; x < 40; x++) {
    for (let y = 0; y < 40; y++) {
      // An alcove every three tiles: walls everywhere but the hole.
      const alcove = x % 3 === 1 && y % 3 === 1;
      map.setTileModelAt(x, y, alcove ? floor : wall);
    }
  }
  return { map, room: new Rect(1, 1, 38, 38) };
}

/** Every item on the floor of `room`, one entry per stack. */
function itemsIn(map: GameMap, room: Rect): Item[] {
  const out: Item[] = [];
  for (let x = room.left; x < room.right; x++) {
    for (let y = room.top; y < room.bottom; y++) {
      for (const it of map.getItemsAt(new Point(x, y))?.items ?? []) out.push(it);
    }
  }
  return out;
}

/** The ids `makeCHARArmoryRoom` drops over `seeds`, given the resources level. */
function armoryDrops(seeds: number[], resources: Resources): Map<number, number> {
  const counts = new Map<number, number>();
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  Options.resourcesAvailability = resources;
  for (const seed of seeds) {
    const g = freshGenerator(seed);
    const { map, room } = armoryMap();
    g.makeCHARArmoryRoom(map, room);
    for (const it of itemsIn(map, room)) {
      counts.set(it.model.id, (counts.get(it.model.id) ?? 0) + 1);
    }
  }
  return counts;
}

const SEEDS = [1, 2, 3, 7, 11, 42, 4242, 20251010];

describe("the spawn sites that had no caller", () => {
  it("drops the nail gun's ammunition from a construction shop", () => {
    // C# `BaseTownGenerator.cs:7500`, case 10 of `MakeShopConstructionItem`'s own
    // table. Over eight seeded rollers x forty draws the nails have to show up,
    // which is what "reachable" means for a roll arm -- and non-vacuously: a
    // table whose case were missing would answer `false` here.
    const seen = constructionModels(SEEDS);
    expect(seen.has(ItemID.AMMO_NAILS), "nail ammo never came out of the roll").toBe(true);
    // The rest of the ladder still works, so this was not a rewrite.
    expect(seen.has(ItemID.MELEE_CROWBAR)).toBe(true);
    expect(seen.size, "the roll still reaches several items").toBeGreaterThan(4);
  });

  it("rolls the riot shield in the police security room", () => {
    // C# `BaseTownGenerator.cs:8970`, case 18 of the fork's `Roll(0, 20)`. The
    // port ported vanilla's ten-outcome table, so the shield is *appended*: the
    // roll widened from 10 to 11 and the new outcome is the shield. Two source
    // pins, because the security room is only reachable through a whole police
    // station: that the range covers the case, and that the case builds the
    // shield through the factory that now exists.
    const securityRoom = townSource.slice(
      townSource.indexOf("// Police Security Room."),
      townSource.indexOf("// Police Office Room."),
    );
    expect(securityRoom).toContain("roll(0, 11)");
    expect(securityRoom).toMatch(/case 10:\s*it = this\.makeItemPoliceRiotShield\(\);/);
    expect(mapGenSource).toContain("makeItemPoliceRiotShield(): Item {");
  });

  it("drops plasma in the CHAR armory, and more of it the richer the world", () => {
    // C# `BaseTownGenerator.cs:8470-8473`: `RollChance(ResourcesAvailability / 3)`
    // in front of the whole chain, which is what makes plasma the rarest thing in
    // the room. The port puts the same roll at the end of the terminal ammo arm,
    // so it gets the scarcity without moving the arms above it.
    const high = armoryDrops(SEEDS, Resources.HIGH);
    const low = armoryDrops(SEEDS, Resources.LOW);
    expect(
      high.get(ItemID.AMMO_PLASMA) ?? 0,
      "a rich world's armory holds no plasma at all",
    ).toBeGreaterThan(0);
    expect(
      high.get(ItemID.AMMO_PLASMA) ?? 0,
      "plasma must stay rarer than the ammo it sits beside",
    ).toBeLessThan((high.get(ItemID.AMMO_SHOTGUN) ?? 0) + (high.get(ItemID.AMMO_LIGHT_RIFLE) ?? 0));
    expect(low.get(ItemID.AMMO_PLASMA) ?? 0).toBeLessThan(high.get(ItemID.AMMO_PLASMA) ?? 0);
  });
});

describe("the shield's factory", () => {
  it("builds a police riot shield that an NPC may pick up", () => {
    // C# `BaseMapGenerator.cs:1987-1990`, a plain `new Item` on the model. The
    // shield is *not* `IsForbiddenToAI`: the reference does not set it, and a
    // police officer who finds one on the floor should be able to use it.
    const shield = freshGenerator() as unknown as { makeItemPoliceRiotShield(): Item };
    const it = shield.makeItemPoliceRiotShield();
    expect(it.model.id).toBe(ItemID.POLICE_RIOT_SHIELD);
    expect(it.isForbiddenToAI).toBe(false);
    expect(it.quantity).toBe(1);
  });
});
