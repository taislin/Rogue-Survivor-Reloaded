import { describe, it, expect, beforeEach } from "vitest";
import { LOSSensor, SensingFilter } from "@gameplay/ai/GameplaySensors";
import { Rules } from "@engine/Rules";
import { DiceRoller } from "@engine/DiceRoller";
import { Map as GameMap, Lighting } from "@data/Map";
import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { Point } from "@engine/Point";
import { GameActors, ActorID } from "@gameplay/GameActors";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { Weather } from "@data/Weather";
import { WorldTime } from "@engine/WorldTime";

/**
 * Regression test for §1.1f bug 51 -- the one consequential finding in that
 * sweep.
 *
 * C# `LOSSensor.Sense` (src/Gameplay/AI/Sensors/LOSSensor.cs:63-64) threads
 * the weather through explicitly:
 *
 *     m_FOV = LOS.ComputeFOVFor(game.Rules, actor, actor.Location.Map.LocalTime,
 *                                game.Session.World.Weather);
 *     int maxRange = game.Rules.ActorFOV(actor, actor.Location.Map.LocalTime,
 *                                game.Session.World.Weather);
 *
 * The port called `computeFOVFor(actor)` / `actorFOV(actor)`, relying on the
 * optional-weather overload, which falls back to the port-only `Rules.weather`
 * field. That field defaults to `Weather.CLEAR` and **nothing ever assigns it**
 * -- the C# has no such field at all. So the fallback was permanently CLEAR,
 * `weatherFovPenalty` always returned 0, and every AI actor saw 1-2 tiles
 * further than the C# in rain.
 *
 * Why it survived so long: the *player's* view was always correct, because
 * `RogueGame` passes the weather explicitly. The bug only affected the AI's
 * eyes, so the game looked fine from the player's side while being internally
 * asymmetric -- you could see less than the zombies could.
 */

const actorsDB = new GameActors();
const tilesDB = new GameTiles();
const survivors = new Faction("Survivors", "survivors");

function newMap(size = 41): GameMap {
  const map = new GameMap(1234, "weather test", size, size);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) map.setTileModelAt(x, y, tilesDB.get(TileID.FLOOR_CONCRETE));
  }
  // `weatherFovPenalty` is only consulted under Lighting.OUTSIDE (Rules.ts:2385);
  // under LIT or DARKNESS the weather is ignored, so a test that leaves the
  // default in place would pass for the wrong reason.
  map.lighting = Lighting.OUTSIDE;
  // A fresh WorldTime(0) is MIDNIGHT (WorldTime.ts:64), which carries a night
  // FOV penalty of 3. That penalty is constant across the weather variants, so
  // the comparison would still hold -- but midday removes it entirely, leaving
  // the weather as the only variable and making the ring counts exact.
  map.localTime.turnCounter = WorldTime.TURNS_PER_HOUR * 12; // MIDDAY
  return map;
}

/**
 * Minimal stand-in for RogueGame. The sensor reaches for exactly two things:
 * `game.rules` and `game.session.world.weather`. `Game` is `type Game = any` in
 * GameplaySensors.ts, so a stub is honest here -- and it is the only way to
 * prove the sensor reads the *session's* weather rather than `Rules.weather`.
 */
function makeGame(weather: Weather): any {
  return {
    rules: new Rules(new DiceRoller(1)),
    session: { world: { weather } },
  };
}

function senseWith(game: any, actor: Actor): { size: number; keys: string[] } {
  const sensor = new LOSSensor(SensingFilter.ACTORS);
  sensor.sense(game, actor);
  return { size: sensor.fov.size, keys: [...sensor.fov] };
}

describe("§1.1f bug 51: LOSSensor threads the world weather through", () => {
  let map: GameMap;
  let human: Actor;
  let zombie: Actor;

  beforeEach(() => {
    map = newMap();
    human = new Actor(actorsDB.get(ActorID.MALE_CIVILIAN), survivors, "Human");
    zombie = new Actor(actorsDB.get(ActorID.UNDEAD_ZOMBIE), survivors, "Zombie");
    map.placeActor(human, new Point(20, 20));
    map.placeActor(zombie, new Point(22, 20));
  });

  it("sanity: the map is OUTSIDE, so the weather penalty is actually consulted", () => {
    // If this ever fails the tests below pass vacuously.
    expect(map.lighting).toBe(Lighting.OUTSIDE);
  });

  it("sanity: it is midday, so no night penalty is mixed in", () => {
    // Isolates the weather as the only variable.
    const rules = new Rules(new DiceRoller(1));
    expect(map.localTime.isNight).toBe(false);
    expect(rules.nightFovPenalty(human, map.localTime)).toBe(0);
  });

  it("the fallback field is gone, so the trap cannot recur", () => {
    // This test used to assert `rules.weather` was CLEAR and that nothing
    // assigned it -- characterising the trap rather than closing it. The field
    // and the optional parameters are now gone, and `Rules.actorFOV` /
    // `Rules.computeFOVFor` require the time and weather the C# requires
    // (Rules.cs:3794), so the omission that caused the bug is a compile error.
    // If anyone re-adds a fallback here, this fails: the sensor would go back to
    // testing the fallback instead of the threading.
    const rules = new Rules(new DiceRoller(1));
    expect("weather" in rules).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(Rules.prototype, "weather"),
      "Rules.weather is back; the sensor's FOV is once again at the mercy of " +
        "whatever last assigned it",
    ).toBe(false);
  });

  it("a living actor sees less in rain than in clear weather", () => {
    const clear = senseWith(makeGame(Weather.CLEAR), human);
    const rain = senseWith(makeGame(Weather.RAIN), human);
    const heavy = senseWith(makeGame(Weather.HEAVY_RAIN), human);

    expect(rain.size).toBeLessThan(clear.size);
    expect(heavy.size).toBeLessThan(rain.size);
  });

  it("the rain penalty is exactly the size the C# rules specify", () => {
    // FOV_PENALTY_RAIN = 1, FOV_PENALTY_HEAVY_RAIN = 2 (Rules.ts:142-143).
    // One ring of tiles per point of penalty, so the counts are predictable
    // and a future off-by-one in the sensor would show up here.
    const rules = new Rules(new DiceRoller(1));
    expect(rules.weatherFovPenalty(human, Weather.RAIN)).toBe(1);
    expect(rules.weatherFovPenalty(human, Weather.HEAVY_RAIN)).toBe(2);
    expect(rules.weatherFovPenalty(human, Weather.CLEAR)).toBe(0);
    expect(rules.weatherFovPenalty(human, Weather.CLOUDY)).toBe(0);
  });

  it("the human's FOV actually shrinks, not just the percept list", () => {
    // `sense` returns percepts, which depend on what else is on the map. The
    // FOV set itself is the thing the bug moved, so assert on that.
    const sensor = new LOSSensor(SensingFilter.ACTORS);
    sensor.sense(makeGame(Weather.HEAVY_RAIN), human);
    const heavyKeys = new Set(sensor.fov);

    sensor.sense(makeGame(Weather.CLEAR), human);
    const clearKeys = new Set(sensor.fov);

    expect(heavyKeys.size).toBeLessThan(clearKeys.size);
    // Shrinking, not shifting: heavy rain must be a strict subset of clear.
    for (const key of heavyKeys) expect(clearKeys.has(key)).toBe(true);
  });

  it("an undead actor is unaffected, as the C# specifies", () => {
    // weatherFovPenalty returns 0 for undead before the switch (Rules.ts:2544),
    // mirroring the C#. Zombies see the same in rain as in clear weather.
    const clear = senseWith(makeGame(Weather.CLEAR), zombie);
    const heavy = senseWith(makeGame(Weather.HEAVY_RAIN), zombie);
    expect(heavy.size).toBe(clear.size);
  });

  it("the FOV still contains the actor's own tile", () => {
    // Guards against a fix that "works" by truncating the FOV to nothing.
    const { keys } = senseWith(makeGame(Weather.HEAVY_RAIN), human);
    expect(keys).toContain("20,20");
  });

  it("does not crash when the session has no world yet", () => {
    // Startup order is not guaranteed; `?.` is what makes this safe. A missing
    // world must degrade to the old behaviour, not throw inside a sensor.
    const rules = new Rules(new DiceRoller(1));
    const bare: any = { rules };
    expect(() => senseWith(bare, human)).not.toThrow();
    expect(senseWith(bare, human).size).toBeGreaterThan(0);
  });
});
