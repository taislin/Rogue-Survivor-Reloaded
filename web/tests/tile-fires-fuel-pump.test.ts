/**
 * `Feature.TileFires`' two remaining arms: the crop loss at `RogueGame.cs:24731`
 * and the fuel pump at `:24634-24642`, `:20110-20121` and `:20123-20129`.
 *
 * Five things are pinned, and the first two are the ones that were wrong in this
 * port's own documentation until now.
 *
 * 1. **The crop arm was never blocked.** It was recorded as unportable because
 *    "the farming system that plants anything is alpha10-era and was never
 *    ported". That conflated planting with loss: the arm is `FLOOR_PLANTED` ->
 *    `FLOOR_GRASS` and needs nothing else, and `TileID.FLOOR_PLANTED` has been in
 *    the port all along (`GameTiles.ts:32`, registered at `:236`, flammable at
 *    `:407`). Three lines, unconditional, no roll and no message.
 * 2. **The fuel pump is the only way one pump detonates another.** Its 800
 *    hitpoints survive any blast in the game -- the strongest is 200 at ground
 *    zero -- so `ExplosionChainReactionMapObjects`' HP arm can never fire for a
 *    healthy pump, and pump-to-pump propagation is entirely `setTileOnFire`'s
 *    adjacency sweep.
 * 3. **The cascade is unbounded in depth, not in reach.** A blast of radius 2
 *    ignites two rings; each ignited tile runs its own sweep, which reaches one
 *    ring further; each of *those* blasts ignites two more. So a pump three tiles
 *    from the first goes up even though the blast never reached it, and the chain
 *    keeps going as long as it keeps finding pumps. There is no depth limit and no
 *    visited set in the C# either. What stops a chain is running out of pumps.
 * 4. **The sweep runs after the early returns.** A tile already burning, or one
 *    that is water, returns before the sweep is reached, so it never triggers a
 *    pump. And `return` inside the C#'s lambda leaves only that one adjacent
 *    tile -- it is not a break of the nine-tile walk, so several pumps can go up.
 * 5. **`causesTileFires` has to be set twice.** `ItemGrenadePrimedModel` copies
 *    its fields from the unprimed model by hand rather than inheriting, so a
 *    primed explosive that was not given the flag separately would have a
 *    visibly-correct unprimed twin and explosions that seed no fires.
 * 6. **Gating on `causesTileFires` alone is exactly equivalent** to the C#'s
 *    `IsFlameWeapon || CausesTileFires` for every explosive this port can
 *    detonate, because the only model carrying `IsFlameWeapon` without also
 *    carrying `CausesTileFires` is the flamethrower -- a ranged weapon, which
 *    never reaches `ApplyExplosionDamage`.
 *
 * The blast wall-destruction guard is exercised too, because removing
 * `throw new Error("blast.destroyWalls")` was a precondition for any of this:
 * the fuel pump's blast carries `canDestroyWalls`, so the arm could not have run
 * at all. `ReplaceDestroyedWall` is still unported, so what the guard decides is
 * asserted rather than what it would do.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { Map as GameMap } from "@data/Map";
import { MapObjectBreak, MapObjectFire } from "@data/MapObject";
import { Models } from "@data/Models";
import { Point } from "@engine/Point";
import { Ruleset, Session } from "@engine/Session";
import { Weather } from "@data/Weather";
import { GameImages } from "@gameplay/GameImages";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { MapObject } from "@data/MapObject";
import { BaseTownGenerator, Parameters } from "@gameplay/generators/BaseTownGenerator";
import { NullRogueUI } from "@ui/NullRogueUI";
import { PlayerController } from "@data/PlayerController";
import { RogueGame } from "@engine/RogueGame";

const survivors = new Faction("The Survivors", "survivor");

let game: RogueGame;
let map: GameMap;
let player: Actor;
let gen: BaseTownGenerator;

/** `ExplodeFuelPump` is private; this is the C#'s own entry point for it. */
const ignite = (x: number, y: number): Promise<void> =>
  (
    game as unknown as {
      setTileOnFire(m: GameMap, x: number, y: number, w: boolean): Promise<void>;
    }
  ).setTileOnFire(map, x, y, true);

const pave = (id: TileID, x0 = 0, y0 = 0, w = 30, h = 30): void => {
  for (let x = x0; x < x0 + w; x++) {
    for (let y = y0; y < y0 + h; y++) map.setTileModelAt(x, y, Models.tiles.get(id));
  }
};

/** One intact fuel pump, from the generator, so its 800 hitpoints are the real ones. */
const putPump = (x: number, y: number): void => {
  map.placeMapObject(gen.makeObjFuelPump(GameImages.OBJ_FUEL_PUMP), new Point(x, y));
};

const at = (x: number, y: number) => map.getMapObjectAt(x, y);
const tileAt = (x: number, y: number) => map.getTileAt(x, y);

/**
* Swap in a fresh map. Two things have to follow it: the module-level `map` and
 * **`Session.currentMap`** — `DoBlast` reaches `AddMessageIfAudibleForPlayer` ->
 * `RedrawPlayScreen`, which redraws `this.m_Session.currentMap`, and that is neither
 * an argument nor the player's map. `Map.placeActor` sets neither; a real district
 * sets them in `GenerateDistrictEntryMap`.
 */
function setMap(m: GameMap): GameMap {
  map = m;
  Session.get().currentMap = m;
  pave(TileID.FLOOR_GRASS);
  return m;
}

beforeEach(() => {
  new GameActors();
  new GameTiles();
  new GameItems();
  Session.useSeed(1);
  game = new RogueGame(new NullRogueUI());
  map = new GameMap(1, "test", 30, 30);
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  Session.get().weather = Weather.CLEAR;
  player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
  player.controller = new PlayerController();
  map.placeActor(player, new Point(1, 1));
  game.m_Player = player;
  // `DoBlast` reaches `AddMessageIfAudibleForPlayer` -> `RedrawPlayScreen` ->
  // `DrawMap`, which reads `m_MapViewRect`. The plain tile-fire tests never get
  // there -- nothing they call redraws -- so this is a fixture line the fuel pump
  // arm needs and they do not. A real district sets it in `GenerateDistrictEntryMap`.
  (game as unknown as { m_MapViewRect: { left: number; top: number; right: number; bottom: number } })
    .m_MapViewRect = { left: 0, top: 0, right: 30, bottom: 30 };
  const params = new Parameters();
  params.mapWidth = 30;
  params.mapHeight = 30;
  gen = new BaseTownGenerator({ rules: game.m_Rules, ApplyOnFire: () => undefined } as never, params);
  // `DoBlast` redraws: `AddMessageIfAudibleForPlayer` -> `RedrawPlayScreen`, which
  // wants `m_MapViewRect`, `Session.currentMap`, `Session.currentDistrict` and a
  // district's entry map. No test has ever triggered a blast before this one --
  // that is why none of that scaffolding exists -- and building a district out
  // here would test the renderer instead of the fuel pump. Drawing is orthogonal
  // to the cascade, so it is stubbed.
  (game as unknown as { RedrawPlayScreen(): void }).RedrawPlayScreen = () => {};
  setMap(map);
});

// ── 1. The crop arm ────────────────────────────────────────────────────────────

describe("Feature.TileFires: the crop arm", () => {
  it("turns a burning FLOOR_PLANTED tile back into grass, with no roll and no message", async () => {
    pave(TileID.FLOOR_PLANTED, 10, 10, 1, 1);
    expect(tileAt(10, 10)!.model).toBe(Models.tiles.get(TileID.FLOOR_PLANTED));

    // The C# reaches this from the burning-tile sweep, so ignite first and then run
    // the damage pass the same way the turn loop does.
    await ignite(10, 10);
    await (
      game as unknown as { applyBurnDamageFromTileFire(m: GameMap, p: Point): Promise<void> }
    ).applyBurnDamageFromTileFire(map, new Point(10, 10));

    expect(tileAt(10, 10)!.model, "a burnt crop is grass again").toBe(Models.tiles.get(TileID.FLOOR_GRASS));
  });

  it("leaves every other tile model alone, grass included", async () => {
    pave(TileID.FLOOR_GRASS, 12, 12, 1, 1);
    pave(TileID.FLOOR_CONCRETE, 14, 14, 1, 1);
    await ignite(12, 12);
    await ignite(14, 14);
    for (const x of [12, 14]) {
      await (
        game as unknown as { applyBurnDamageFromTileFire(m: GameMap, p: Point): Promise<void> }
      ).applyBurnDamageFromTileFire(map, new Point(x, x));
    }
    expect(tileAt(12, 12)!.model).toBe(Models.tiles.get(TileID.FLOOR_GRASS));
    expect(tileAt(14, 14)!.model).toBe(Models.tiles.get(TileID.FLOOR_CONCRETE));
  });

  it("is total: a second pass over an already-burnt tile is a no-op, not an error", async () => {
    pave(TileID.FLOOR_PLANTED, 10, 10, 1, 1);
    await ignite(10, 10);
    const pass = async () =>
      (
        game as unknown as { applyBurnDamageFromTileFire(m: GameMap, p: Point): Promise<void> }
      ).applyBurnDamageFromTileFire(map, new Point(10, 10));
    await pass();
    expect(tileAt(10, 10)!.model).toBe(Models.tiles.get(TileID.FLOOR_GRASS));
    await pass();
    expect(tileAt(10, 10)!.model).toBe(Models.tiles.get(TileID.FLOOR_GRASS));
  });
});

// ── 2 & 3. The fuel pump sweep ─────────────────────────────────────────────────

describe("Feature.TileFires: fires blow up adjacent fuel pumps", () => {
  it("detonates a pump on the burning tile and leaves its wreck behind", async () => {
    putPump(11, 11);
    await ignite(11, 11);

    const wreck = at(11, 11);
    expect(wreck, "the pump's tile now holds the wreck").not.toBeNull();
    expect(wreck!.imageId).toBe(GameImages.OBJ_FUEL_PUMP_BROKEN);
    expect(wreck!.name).toBe("exploded fuel pump");
    // The wreck is UNBREAKABLE at 0 HP, so it is permanent furniture.
    expect(wreck!.breakState).toBe(MapObjectBreak.UNBREAKABLE);
    expect(wreck!.hitPoints).toBe(0);
    expect(wreck!.isMetal).toBe(true);
  });

  it("detonates a pump on any of the eight neighbours, because it is a 3x3 sweep", async () => {
    const spots: [number, number][] = [
      [12, 11], [10, 11], [11, 12], [11, 10],
      [12, 12], [12, 10], [10, 12], [10, 10],
    ];
    for (const [x, y] of spots) {
      // A fresh map per neighbour so each is a first pump, not a cascade.
      setMap(new GameMap(1, "n", 30, 30));
      putPump(x, y);
      await ignite(11, 11);
      expect(at(x, y)?.imageId, `pump at ${x},${y} went up`).toBe(GameImages.OBJ_FUEL_PUMP_BROKEN);
    }
  });

  it("cascades: two pumps within Chebyshev 2 of each other go up together", async () => {
    // The C#'s recursion: a blast sets tiles on fire, each of those sweeps its own
    // neighbours, so a pump two tiles from the first is reached with no depth limit.
    putPump(11, 11);
    putPump(13, 11);
    await ignite(11, 11);

    expect(at(11, 11)?.imageId).toBe(GameImages.OBJ_FUEL_PUMP_BROKEN);
    expect(at(13, 11)?.imageId, "the second pump was reached by the cascade").toBe(
      GameImages.OBJ_FUEL_PUMP_BROKEN,
    );
  });

  it("reaches further than the blast radius, because each blast ignites tiles that sweep again", async () => {
    // The reach is **not** the blast radius, and working that out is the whole
    // subtlety here. A pump's blast has radius 2, so it ignites tiles at Chebyshev
    // distance 1 and 2; each of *those* runs `setTileOnFire`'s sweep, which reaches
    // one ring further. So a pump three tiles away is adjacent to a tile the first
    // blast ignited, and goes up -- and its own blast then pushes the frontier out
    // again. There is no depth limit and no visited set in the C# either.
    putPump(11, 11);
    putPump(14, 11); // Chebyshev 3: outside the blast, inside the cascade
    await ignite(11, 11);

    expect(at(11, 11)?.imageId).toBe(GameImages.OBJ_FUEL_PUMP_BROKEN);
    expect(at(14, 11)?.imageId, "distance 3 is reached by the cascade, not the blast").toBe(
      GameImages.OBJ_FUEL_PUMP_BROKEN,
    );
  });

  it("stops where the chain runs out: an isolated far pump is untouched", async () => {
    // The cascade is unbounded in *depth*, not in *reach*. Once the ignited tiles
    // stop finding pumps, nothing ignites further tiles, so a pump with no chain
    // leading to it survives however far away it is.
    putPump(11, 11);
    putPump(22, 11);
    await ignite(11, 11);

    expect(at(11, 11)?.imageId).toBe(GameImages.OBJ_FUEL_PUMP_BROKEN);
    expect(at(22, 11)?.imageId, "eleven tiles away, with no chain").toBe(GameImages.OBJ_FUEL_PUMP);
  });

  it("leaves a non-pump object on an adjacent tile alone", async () => {
    // A shelf, deliberately: a *different* object on an adjacent tile must survive,
    // because the sweep tests `ImageID === OBJ_FUEL_PUMP` and nothing else.
    map.placeMapObject(
      new MapObject(
        "shelf",
        GameImages.OBJ_SHOP_SHELF,
        MapObjectBreak.BREAKABLE,
        MapObjectFire.BURNABLE,
        40,
      ),
      new Point(11, 12),
    );
    await ignite(11, 11);
    expect(at(11, 12)?.imageId, "only OBJ_FUEL_PUMP is special-cased").toBe(
      GameImages.OBJ_SHOP_SHELF,
    );
  });

  it("does not sweep when the tile is already burning, because the return comes first", async () => {
    putPump(11, 11);
    await ignite(11, 11);
    expect(at(11, 11)?.imageId).toBe(GameImages.OBJ_FUEL_PUMP_BROKEN);

    // The C#'s `:24616-24619` returns before the sweep for a tile that is already on
    // fire, so a second ignite on that tile detonates nothing further. Put a fresh
    // pump next to the burnt tile and re-ignite the *same* tile.
    setMap(new GameMap(1, "n2", 30, 30));
    await ignite(11, 11); // tile 11,11 now burning
    putPump(11, 12);
    await ignite(11, 11); // already on fire -> early return -> no sweep
    expect(at(11, 12)?.imageId, "an already-burning tile sweeps nothing").toBe(
      GameImages.OBJ_FUEL_PUMP,
    );
  });
});

// ── 4 & 5. The model flags ─────────────────────────────────────────────────────

describe("Feature.TileFires: causesTileFires on the explosive models", () => {
  it("is set on both the unprimed and the primed model, because priming copies by hand", () => {
    const pairs: [ItemID, ItemID][] = [
      [ItemID.EXPLOSIVE_FUEL_PUMP, ItemID.EXPLOSIVE_FUEL_PUMP_PRIMED],
      [ItemID.EXPLOSIVE_MOLOTOV, ItemID.EXPLOSIVE_MOLOTOV_PRIMED],
      [ItemID.EXPLOSIVE_FUEL_CAN, ItemID.EXPLOSIVE_FUEL_CAN_PRIMED],
    ];
    for (const [unprimed, primed] of pairs) {
      expect(Models.items.get(unprimed)!.causesTileFires, `unprimed ${unprimed}`).toBe(true);
      expect(Models.items.get(primed)!.causesTileFires, `primed ${primed}`).toBe(true);
    }
  });

  it("is absent on everything the C# leaves without it", () => {
    const untouched: ItemID[] = [
      ItemID.EXPLOSIVE_GRENADE,
      ItemID.EXPLOSIVE_GRENADE_PRIMED,
      ItemID.EXPLOSIVE_DYNAMITE,
      ItemID.EXPLOSIVE_DYNAMITE_PRIMED,
      ItemID.EXPLOSIVE_C4,
      ItemID.EXPLOSIVE_C4_PRIMED,
      ItemID.EXPLOSIVE_SMOKE_GRENADE,
      ItemID.EXPLOSIVE_FLASHBANG,
      ItemID.EXPLOSIVE_HOLY_HAND_GRENADE,
      ItemID.EXPLOSIVE_PLASMA_CHARGE,
      ItemID.EXPLOSIVE_PLASMA_CHARGE_PRIMED,
    ];
    for (const id of untouched) {
      expect(Models.items.get(id)!.causesTileFires, `${id} must not seed fires`).toBe(false);
    }
  });

  it("matches the C#'s IsFlameWeapon || CausesTileFires for every explosive in the port", () => {
    // The only model in the reference with IsFlameWeapon and no CausesTileFires is
    // the flamethrower (`GameItems.cs:2084`), a ranged weapon that never reaches
    // `ApplyExplosionDamage`. So for every *explosive*, `causesTileFires` alone is
    // the whole of the C#'s condition. Asserted as a set so adding a seventh
    // explosive has to make a decision here.
    const csharpSetsFires = new Set<ItemID>([
      ItemID.EXPLOSIVE_MOLOTOV, ItemID.EXPLOSIVE_MOLOTOV_PRIMED,
      ItemID.EXPLOSIVE_FUEL_CAN, ItemID.EXPLOSIVE_FUEL_CAN_PRIMED,
      ItemID.EXPLOSIVE_FUEL_PUMP, ItemID.EXPLOSIVE_FUEL_PUMP_PRIMED,
    ]);
    for (const id of [
      ItemID.EXPLOSIVE_GRENADE, ItemID.EXPLOSIVE_GRENADE_PRIMED,
      ItemID.EXPLOSIVE_MOLOTOV, ItemID.EXPLOSIVE_MOLOTOV_PRIMED,
      ItemID.EXPLOSIVE_DYNAMITE, ItemID.EXPLOSIVE_DYNAMITE_PRIMED,
      ItemID.EXPLOSIVE_C4, ItemID.EXPLOSIVE_C4_PRIMED,
      ItemID.EXPLOSIVE_FUEL_CAN, ItemID.EXPLOSIVE_FUEL_CAN_PRIMED,
      ItemID.EXPLOSIVE_FUEL_PUMP, ItemID.EXPLOSIVE_FUEL_PUMP_PRIMED,
      ItemID.EXPLOSIVE_SMOKE_GRENADE, ItemID.EXPLOSIVE_FLASHBANG,
      ItemID.EXPLOSIVE_HOLY_HAND_GRENADE, ItemID.EXPLOSIVE_PLASMA_CHARGE,
    ]) {
      expect(Models.items.get(id)!.causesTileFires, `${id}`).toBe(csharpSetsFires.has(id));
    }
  });
});

// ── The wall guard the arm depends on ──────────────────────────────────────────

describe("Feature.TileFires: the blast wall guard no longer throws", () => {
  it("classifies twelve wall models as destructible and three as not", () => {
    const tiles = new GameTiles();
    const destructible: TileID[] = [
      TileID.WALL_BRICK, TileID.WALL_CHAR_OFFICE, TileID.WALL_HOSPITAL,
      TileID.WALL_LIGHT_BROWN, TileID.WALL_POLICE_STATION, TileID.WALL_STONE,
      TileID.WALL_SUBWAY, TileID.WALL_ARMY_BASE, TileID.WALL_FUEL_STATION,
      TileID.WALL_WOOD_PLANKS, TileID.WALL_MALL, TileID.WALL_RED_CURTAINS,
    ];
    for (const id of destructible) {
      expect(tiles.isDestructibleWallModel(Models.tiles.get(id)!), `${id} destructible`).toBe(true);
    }
    // The three the C# leaves out: sewer, concrete, concrete pillar.
    for (const id of [TileID.WALL_SEWER, TileID.WALL_CONCRETE, TileID.WALL_PILLAR_CONCRETE]) {
      expect(tiles.isDestructibleWallModel(Models.tiles.get(id)!), `${id} indestructible`).toBe(false);
    }
  });

  it("refuses any wall whose eight-neighbour ring leaves the map", () => {
    // `IsOnMapBorder` rejects the tile itself, `AnyAdjacentOutOfBounds` rejects the
    // ring *around* it. So the outermost tile is the one whose neighbours leave the
    // map, and (1, 15) is a false positive waiting to happen: its x = 0 neighbours
    // are still in bounds on a 30-wide map.
    expect(map.anyAdjacentOutOfBounds(new Point(0, 15))).toBe(true);
    expect(map.anyAdjacentOutOfBounds(new Point(1, 15))).toBe(false);
    expect(map.anyAdjacentOutOfBounds(new Point(15, 15))).toBe(false);
    expect(map.anyAdjacentOutOfBounds(new Point(29, 15))).toBe(true);
  });

  it("and the fuel pump blast, which carries canDestroyWalls, completes instead of throwing", async () => {
    const primed = Models.items.get(ItemID.EXPLOSIVE_FUEL_PUMP_PRIMED)! as unknown as {
      blastAttack: { canDestroyWalls: boolean };
    };
    expect(primed.blastAttack.canDestroyWalls).toBe(true);
    putPump(11, 11);
    // Would have thrown at `RogueGame.ts` before the guard was ported.
    await expect(ignite(11, 11)).resolves.toBeUndefined();
    expect(at(11, 11)?.imageId).toBe(GameImages.OBJ_FUEL_PUMP_BROKEN);
  });
});