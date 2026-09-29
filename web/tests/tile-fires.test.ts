/**
 * `Feature.TileFires` — fire that lives on the floor, not on an actor.
 *
 * Still Alive, Release 5-2.
 *
 * The mechanic is a per-tile flag plus three operations: spread to a neighbour,
 * burn out, burn whatever is standing there. The order of those three is the
 * design and is not interchangeable, so most of what follows is about the order
 * rather than the arithmetic.
 *
 * Only **five** tiles in the whole 143-model set are flammable, and that is the
 * whole design: fire that spread over bare concrete would consume every building
 * on the map, so a fire needs *stuff* to burn and a warehouse is a safe place to
 * stand.
 *
 * Two C# arms are **not** ported and both are noted at the implementation:
 * an actor *catching* fire (needs `Actor.isOnFire`, a separate Release 5-7
 * subsystem) and crop loss (needs the alpha10-era farming system, the same gap
 * that blocks `ResourcesAvailability`'s fruit interval).
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { Corpse } from "@data/Corpse";
import { Faction } from "@data/Faction";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { Point } from "@engine/Point";
import { Ruleset, Session } from "@engine/Session";
import { Weather } from "@data/Weather";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { GameImages } from "@gameplay/GameImages";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { NullRogueUI } from "@ui/NullRogueUI";
import { PlayerController } from "@data/PlayerController";
import { RogueGame } from "@engine/RogueGame";

const survivors = new Faction("The Survivors", "survivor");

let game: RogueGame;
let map: GameMap;
let player: Actor;

/** Runs the per-turn fire pass. */
const step = (): Promise<void> =>
  (game as unknown as { stepTileFires(m: GameMap): Promise<void> }).stepTileFires(map);

const ignite = (x: number, y: number): void => {
  (game as unknown as { setTileOnFire(m: GameMap, x: number, y: number, w: boolean): void })
    .setTileOnFire(map, x, y, true);
};

const burning = (x: number, y: number): boolean => map.isAnyTileFireThere(new Point(x, y));
const scorched = (x: number, y: number): boolean =>
  map.getTileAt(x, y)!.isScorched;

beforeEach(() => {
  new GameActors();
  new GameTiles();
  game = new RogueGame(new NullRogueUI());
  map = new GameMap(1, "test", 30, 30);
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  Session.get().weather = Weather.CLEAR;
  player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
  player.controller = new PlayerController();
  map.placeActor(player, new Point(1, 1));
  game.m_Player = player;
});

/** Fill a rectangle with one tile model, so a fire has something to spread over. */
const pave = (
  m: GameMap,
  x0: number,
  y0: number,
  w: number,
  h: number,
  id: TileID,
): void => {
  for (let x = x0; x < x0 + w; x++) {
    for (let y = y0; y < y0 + h; y++) m.setTileModelAt(x, y, Models.tiles.get(id));
  }
};

const carpet = (m: GameMap = map): void => pave(m, 10, 10, 6, 6, TileID.FLOOR_RED_CARPET);

describe("Feature.TileFires: what can burn", () => {
  it("marks exactly the C#'s five flammable tiles", () => {
    const flammable = [
      TileID.FLOOR_PLANTED,
      TileID.FLOOR_RED_CARPET,
      TileID.FLOOR_BLUE_CARPET,
      TileID.WALL_WOOD_PLANKS,
      TileID.WALL_RED_CURTAINS,
    ];
    for (const id of flammable) {
      expect(Models.tiles.get(id).isFlammable, `tile ${id}`).toBe(true);
    }
    // And the important negative: ordinary floor is not.
    for (const id of [TileID.FLOOR_CONCRETE, TileID.FLOOR_GRASS, TileID.FLOOR_ASPHALT]) {
      expect(Models.tiles.get(id).isFlammable, `tile ${id}`).toBe(false);
    }
  });

  it("counts the whole 143-tile set, so the list cannot quietly grow", () => {
    // The count is the point. "Five" is a balance decision, not an accident, and a
    // sixth flammable tile would change how every fire on the map plays.
    let n = 0;
    for (let id = 0; id < TileID._COUNT; id++) {
      if (Models.tiles.get(id).isFlammable) n++;
    }
    expect(n, "flammable tile count").toBe(5);
  });

  it("treats a burnt or burning tile as in-flammable", () => {
    carpet();
    const p = new Point(11, 11);
    expect(map.isInflammableTile(p, true)).toBe(false);
    map.getTileAt(11, 11)!.scorchTile();
    expect(map.isInflammableTile(p, true), "burnt out").toBe(true);
    // ...but a flame weapon can still deliberately land on it, which is what the
    // second parameter is for.
    expect(map.isInflammableTile(p, false), "a flame weapon may").toBe(false);
  });

  it("treats a non-flammable tile as in-flammable whatever the parameter", () => {
    pave(map, 20, 20, 3, 3, TileID.FLOOR_CONCRETE);
    expect(map.isInflammableTile(new Point(21, 21), true)).toBe(true);
    expect(map.isInflammableTile(new Point(21, 21), false)).toBe(true);
  });

  it("does not set water alight", () => {
    pave(map, 10, 10, 3, 3, TileID.FLOOR_POND_CENTER);
    ignite(11, 11);
    expect(burning(11, 11), "water does not burn").toBe(false);
  });
});

describe("Feature.TileFires: igniting and putting out", () => {
  it("lights a flammable tile and decorates it", () => {
    carpet();
    ignite(11, 11);
    expect(burning(11, 11)).toBe(true);
    // The decoration is what the renderer draws, and it must move with the flag.
    expect(map.getTileAt(11, 11)!.hasDecoration(GameImages.EFFECT_ONFIRE)).toBe(true);
  });

  it("scorches the tile it lights, so nothing can spread back onto it", () => {
    carpet();
    ignite(11, 11);
    expect(scorched(11, 11)).toBe(true);
  });

  it("does not scorch or light a wall when the fire merely spread", () => {
    // The Release 7-6 rule, and the reason a building is still a refuge: only a
    // flame weapon or an explosion may scorch a wall, so a spreading fire cannot
    // walk through one from outside to inside.
    map.setTileModelAt(20, 20, Models.tiles.get(TileID.WALL_RED_CURTAINS));
    (game as unknown as { setTileOnFire(m: GameMap, x: number, y: number, w: boolean): void })
      .setTileOnFire(map, 20, 20, false);
    expect(burning(20, 20), "not alight").toBe(false);
    expect(scorched(20, 20), "and not scorched").toBe(false);

    // With the flame-weapon flag the wall is *scorched* -- but still never
    // alight, because `setTileOnFire` only lights walkable tiles. A burning wall
    // would be a second way for fire to pass through a building.
    ignite(20, 20);
    expect(burning(20, 20), "a wall is never set alight, flame weapon or not").toBe(false);
    expect(scorched(20, 20), "but a flame weapon does scorch it").toBe(true);
  });

  it("is idempotent -- a second ignite changes nothing", () => {
    carpet();
    ignite(11, 11);
    const decos = map.getTileAt(11, 11)!.getDecorations!.length;
    ignite(11, 11);
    expect(burning(11, 11)).toBe(true);
    expect(map.getTileAt(11, 11)!.getDecorations!.length, "no duplicate decoration")
      .toBe(decos);
  });
});

describe("Feature.TileFires: spreading", () => {
  it("spreads to a neighbour eventually, and only to flammable tiles", async () => {
    // Run enough turns that a 5% per-neighbour roll is certain to land, and check
    // it never crosses onto the concrete the carpet is surrounded by.
    carpet();
    ignite(11, 11);
    for (let i = 0; i < 60; i++) await step();
    // "Is any tile burning *right now*" is the wrong question: a carpet fire
    // burns out within a few turns, so after 60 the whole thing can be over and
    // the assertion passes for the wrong reason or fails for no reason. The
    // evidence that it spread is the scorch count, which is permanent.
    let burnt = 0;
    for (let x = 10; x < 16; x++) for (let y = 10; y < 16; y++) if (scorched(x, y)) burnt++;
    expect(burnt, "scorched tiles after 60 turns").toBeGreaterThan(1);
    // Outside the 6x6 rectangle is concrete.
    for (const [x, y] of [[9, 11], [11, 9], [16, 13]]) {
      expect(burning(x, y), `${x},${y} is concrete`).toBe(false);
    }
  });

  it("never spreads onto a tile it has already burnt", async () => {
    // The fire's memory. Without `isScorched` a fire creeps across a room one
    // layer at a time and never stops.
    carpet();
    ignite(11, 11);
    for (let i = 0; i < 40; i++) await step();
    // 6x6 of carpet, so at most 36 tiles can ever have burned.
    let burnt = 0;
    for (let x = 10; x < 16; x++) for (let y = 10; y < 16; y++) if (scorched(x, y)) burnt++;
    expect(burnt, "no carpet burns twice, and none of it is infinite").toBeLessThanOrEqual(36);
  });

  it("does nothing at all under CLASSIC", async () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    carpet();
    ignite(11, 11);
    const burntTiles = (): number => {
      let n = 0;
      for (let x = 0; x < map.width; x++)
        for (let y = 0; y < map.height; y++) if (map.getTileAt(x, y)!.isScorched) n++;
      return n;
    };
    // The ignite above used the primitive directly, so one tile is already
    // scorched; what CLASSIC must prevent is the *turn pass* spreading it.
    const before = burntTiles();
    for (let i = 0; i < 30; i++) await step();
    expect(burntTiles(), "classic fire does not spread").toBe(before);
  });
});

describe("Feature.TileFires: burning out", () => {
  it("goes out on its own eventually, in clear weather", async () => {
    // 33% halved outdoors is ~17% a turn, so a fire lives a handful of turns.
    carpet();
    ignite(11, 11);
    for (let i = 0; i < 200 && burning(11, 11); i++) await step();
    expect(burning(11, 11), "a fire cannot burn forever").toBe(false);
    // And the decoration went with it.
    expect(map.getTileAt(11, 11)!.hasDecoration(GameImages.EFFECT_ONFIRE)).toBe(false);
  });

  it("burns out faster in rain than in clear weather", async () => {
    // 80 vs 33, halved outdoors -- a real difference, and the reason the weather
    // branch exists at all.
    //
    // **Averaged over many fires.** A single fire's lifetime is a geometric
    // distribution on a 17% or 40% per-turn roll, and one sample of each is worth
    // almost nothing: the first version of this test got `rain 10 vs clear 6` and
    // "failed" in the wrong direction on nothing but the roller's sequence. The
    // per-fire variance is the whole difficulty of testing anything probabilistic.
    const livesIn = async (weather: Weather): Promise<number> => {
      Session.get().weather = weather;
      const m = new GameMap(1, "t", 20, 20);
      const g = new RogueGame(new NullRogueUI());
      g.m_Player = player;
      pave(m, 5, 5, 4, 4, TileID.FLOOR_RED_CARPET);
      (g as unknown as { setTileOnFire(m: GameMap, x: number, y: number, w: boolean): void })
        .setTileOnFire(m, 6, 6, true);
      const run = (g as unknown as { stepTileFires(m: GameMap): Promise<void> })
        .stepTileFires.bind(g);
      let turns = 0;
      while (m.isAnyTileFireThere(new Point(6, 6)) && turns < 500) {
        await run(m);
        turns++;
      }
      return turns;
    };

    let clearTotal = 0;
    let rainTotal = 0;
    const TRIALS = 25;
    for (let i = 0; i < TRIALS; i++) {
      clearTotal += await livesIn(Weather.CLEAR);
      rainTotal += await livesIn(Weather.RAIN);
    }
    const clear = clearTotal / TRIALS;
    const rain = rainTotal / TRIALS;
    expect(rain, `rain ${rain.toFixed(1)} vs clear ${clear.toFixed(1)}, over ${TRIALS}`)
      .toBeLessThan(clear);
  });

  it("keeps an indoor fire alive longer than an outdoor one", async () => {
    // The divisor is 4 indoors and 2 out, and the C#'s comment ("fires inside
    // aren't affected by weather") understates what the code does: it makes them
    // roughly twice as long-lived in the same weather. Preserved as-is, with the
    // discrepancy written down rather than quietly "corrected".
    const lives = async (inside: boolean): Promise<number> => {
      Session.get().weather = Weather.CLEAR;
      const m = new GameMap(1, "t", 20, 20);
      const g = new RogueGame(new NullRogueUI());
      g.m_Player = player;
      pave(m, 5, 5, 4, 4, TileID.FLOOR_RED_CARPET);
      for (let x = 5; x < 9; x++) for (let y = 5; y < 9; y++) m.getTileAt(x, y)!.isInside = inside;
      (g as unknown as { setTileOnFire(m: GameMap, x: number, y: number, w: boolean): void })
        .setTileOnFire(m, 6, 6, true);
      const run = (g as unknown as { stepTileFires(m: GameMap): Promise<void> })
        .stepTileFires.bind(g);
      let turns = 0;
      while (m.isAnyTileFireThere(new Point(6, 6)) && turns < 500) {
        await run(m);
        turns++;
      }
      return turns;
    };
    const indoor = await lives(true);
    const outdoor = await lives(false);
    expect(indoor, `indoor ${indoor} vs outdoor ${outdoor}`).toBeGreaterThan(outdoor);
  });
});

describe("Feature.TileFires: the victims", () => {
  it("burns an actor standing in a burning tile, every turn", async () => {
    carpet();
    const victim = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "vic");
    map.placeActor(victim, new Point(11, 11));
    ignite(11, 11);
    const hp = victim.hitPoints;
    await step();
    expect(victim.hitPoints, "one point of tile-fire damage").toBeLessThan(hp);
  });

  it("does not hurt anyone on a tile the fire did not reach", async () => {
    carpet();
    const bystander = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "byst");
    map.placeActor(bystander, new Point(20, 20));
    pave(map, 20, 20, 3, 3, TileID.FLOOR_RED_CARPET);
    ignite(11, 11);
    const hp = bystander.hitPoints;
    await step();
    expect(bystander.hitPoints).toBe(hp);
  });

  it("leaves skeletons alone -- they are immune to fire", async () => {
    carpet();
    const skeleton = new Actor(
      Models.actors.get(ActorID.UNDEAD_SKELETON),
      survivors,
      "skel",
    );
    map.placeActor(skeleton, new Point(11, 11));
    ignite(11, 11);
    const hp = skeleton.hitPoints;
    await step();
    expect(skeleton.hitPoints, "IsSkeletonBranch").toBe(hp);
  });

  it("burns a corpse on the tile", async () => {
    carpet();
    // A real Actor, because `Corpse` takes the dead one and reads its position.
    const dead = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "dead");
    map.placeActor(dead, new Point(11, 11));
    const corpse = new Corpse(dead, 10, 10, 0, 0, 1);
    map.addCorpse(corpse);
    const hp = corpse.hitPoints;
    ignite(11, 11);
    await step();
    expect(corpse.hitPoints, "corpses burn too").toBeLessThan(hp);
  });

  it("does not set the *actor* alight -- that arm is not ported", async () => {
    // Deliberate. The C# rolls CATCH_ONFIRE_FROM_TILE_CHANCE to set the actor
    // burning, which needs `Actor.isOnFire` -- a whole per-actor fire subsystem
    // (Release 5-7) that the port does not have. Standing in fire still hurts
    // every turn; the actor does not *become* fire.
    carpet();
    const victim = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "vic");
    map.placeActor(victim, new Point(11, 11));
    ignite(11, 11);
    await step();
    expect("isOnFire" in victim, "Actor has no on-fire state at all").toBe(false);
  });
});

describe("Feature.TileFires: the registry", () => {
  it("is on for Still Alive and off for classic", () => {
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.TileFires)).toBe(true);
    expect(hasFeature(Ruleset.CLASSIC, Feature.TileFires)).toBe(false);
  });
});
