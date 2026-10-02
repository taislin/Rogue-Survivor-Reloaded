/**
 * `Feature.FireBarrels` — the three fuel-bearing map objects, and what a lit one
 * does to its tank.
 *
 * The interesting content here is not the arithmetic, it is the gating and one
 * deliberate divergence from the C#. A barrel is a day of fuel and a campfire
 * three hours, and both drain one unit per turn while alight; none of that is
 * subtle. What is worth a test is that a CLASSIC world never drains, and that
 * the fork's un-weathered rain roll is *not* reproduced.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Map as GameMap } from "@data/Map";
import { MapObjectBreak, MapObjectFire } from "@data/MapObject";
import { Point } from "@engine/Point";
import { Rules } from "@engine/Rules";
import { WorldTime } from "@engine/WorldTime";
import { Barrel, Campfire, Car, DoorWindow } from "@engine/mapobjects/MapObjects";
import { GameImages } from "@gameplay/GameImages";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { Ruleset, Session } from "@engine/Session";
import { Weather } from "@data/Weather";
import { RogueGame } from "@engine/RogueGame";
import { BaseMapGenerator } from "@gameplay/generators/BaseMapGenerator";
import { DiceRoller } from "@engine/DiceRoller";
import { MapObject } from "@data/MapObject";
import { NullRogueUI } from "@ui/NullRogueUI";

const barrelImage = GameImages.OBJ_BARRELS;
const campfireImage = "MapObjects/campfire";
const carImage = GameImages.OBJ_CAR1;

let map: GameMap;
let tile = 0;

/** A fresh, empty, in-bounds tile, so nothing collides with anything. */
const spot = (): Point => new Point(5, 5 + tile++);

const litBarrel = (fuel: number): Barrel => {
  const b = new Barrel("receptacle", barrelImage, MapObjectBreak.UNBREAKABLE, fuel);
  b.fireState = MapObjectFire.ONFIRE;
  map.placeMapObject(b, spot());
  return b;
};

const litCampfire = (fuel: number): Campfire => {
  const c = new Campfire("campfire", campfireImage, MapObjectBreak.BREAKABLE, fuel);
  c.fireState = MapObjectFire.ONFIRE;
  map.placeMapObject(c, spot());
  return c;
};

const setWeather = (w: Weather): void => {
  Session.get().weather = w;
};

beforeEach(() => {
  map = new GameMap(1, "test", 60, 60);
  tile = 0;
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  setWeather(Weather.CLEAR);
});

describe("Feature.FireBarrels: the tanks", () => {
  it("gives a barrel a day and a campfire three hours", () => {
    // Not one number for both. 720 and 90, and the pair is easy to swap because
    // they are both "a while".
    expect(new Barrel("r", barrelImage, MapObjectBreak.UNBREAKABLE, 0).maxFuelUnits).toBe(
      WorldTime.TURNS_PER_DAY,
    );
    expect(new Campfire("c", campfireImage, MapObjectBreak.BREAKABLE, 0).maxFuelUnits).toBe(
      WorldTime.TURNS_PER_HOUR * 3,
    );
  });

  it("gives a car 99, which is a stack limit and not a burn time", () => {
    expect(new Car("car", carImage, MapObjectBreak.BROKEN, 0).maxFuelUnits).toBe(99);
  });

  it("makes barrels and campfires burnable, and cars not", () => {
    // A car is a fuel *source*, not a fire. This is what does the fork's
    // "deliberately exempting Car fires" -- not a check in the burn loop.
    const barrel = new Barrel("r", barrelImage, MapObjectBreak.UNBREAKABLE, 0);
    const campfire = new Campfire("c", campfireImage, MapObjectBreak.BREAKABLE, 0);
    const car = new Car("car", carImage, MapObjectBreak.BROKEN, 0);

    expect(barrel.fireState).toBe(MapObjectFire.BURNABLE);
    expect(campfire.fireState).toBe(MapObjectFire.BURNABLE);
    expect(car.fireState).toBe(MapObjectFire.UNINFLAMMABLE);
  });

  it("gives barrels and campfires the door/window hit points, and cars none", () => {
    expect(new Barrel("r", barrelImage, MapObjectBreak.UNBREAKABLE, 0).maxHitPoints).toBe(
      DoorWindow.BASE_HITPOINTS,
    );
    expect(new Car("car", carImage, MapObjectBreak.BROKEN, 0).maxHitPoints).toBe(0);
  });
});

describe("Feature.FireBarrels: burning fuel down", () => {
  // The port's own per-turn plumbing is heavy to drive, so these call the
  // step directly. That is a fair trade: the thing under test *is* the step, and
  // the call site is a one-line `hasFeature` guard which its own test covers.
  const game = (): RogueGame => new RogueGame(new NullRogueUI());

  it("burns one unit off a lit barrel per turn", () => {
    const g = game();
    const b = litBarrel(10);
    g.BurnFuelOnFires(map);
    expect(b.fuelUnits).toBe(9);
  });

  it("puts a barrel out when the tank runs dry, and restores its jump level", () => {
    const g = game();
    const b = litBarrel(1);
    b.jumpLevel = 0; // ApplyOnFire decrements it, so an alight barrel is unjumpable
    expect(b.isOnFire).toBe(true);
    g.BurnFuelOnFires(map);
    expect(b.fuelUnits).toBe(0);
    expect(b.isOnFire).toBe(false);
    expect(b.fireState).toBe(MapObjectFire.BURNABLE);
    expect(b.jumpLevel).toBe(1);
  });

  it("leaves an unlit barrel alone", () => {
    const g = game();
    const b = new Barrel("r", barrelImage, MapObjectBreak.UNBREAKABLE, 10);
    map.placeMapObject(b, spot());
    g.BurnFuelOnFires(map);
    expect(b.fuelUnits).toBe(10);
  });

  it("burns a campfire down too", () => {
    const g = game();
    const c = litCampfire(5);
    g.BurnFuelOnFires(map);
    expect(c.fuelUnits).toBe(4);
  });

  it("never touches a car, which cannot be alight", () => {
    const g = game();
    const car = new Car("car", carImage, MapObjectBreak.BROKEN, 30);
    map.placeMapObject(car, spot());
    // Forcing the flag anyway: the loop must still skip it, because the C#'s
    // exemption is the fire state, and a `Car` that somehow reads as alight is
    // not a case the loop handles.
    car.fireState = MapObjectFire.ONFIRE;
    g.BurnFuelOnFires(map);
    expect(car.fuelUnits).toBe(30);
  });

  it("drains nothing at all under CLASSIC", () => {
    // The gate is at the call site, so the honest test is that the flag is off
    // and the caller's guard would skip the step. Asserting the flag alone would
    // pass even if the guard were deleted, which is why the call-site guard has
    // its own mutation test.
    expect(hasFeature(Ruleset.CLASSIC, Feature.FireBarrels)).toBe(false);
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.FireBarrels)).toBe(true);
  });
});

describe("Feature.FireBarrels: rain on a campfire", () => {
  const game = (): RogueGame => new RogueGame(new NullRogueUI());

  it("does NOT extinguish an outdoor campfire in clear weather", () => {
    // The divergence. The C# rolls FIRE_RAIN_PUT_OUT_CHANCE here with no
    // IsWeatherRain test in scope, so ported literally this campfire would die
    // every ten turns under a clear sky. The roll is weather-gated instead.
    const g = game();
    setWeather(Weather.CLEAR);
    // A day of fuel, not a small number: this loop runs 200 turns, and a
    // campfire whose *tank* ran dry would go out for a completely different
    // reason and make this test pass for the wrong cause.
    const c = litCampfire(WorldTime.TURNS_PER_DAY);
    let extinguished = false;
    for (let i = 0; i < 200 && !extinguished; i++) {
      g.BurnFuelOnFires(map);
      extinguished = !c.isOnFire;
    }
    expect(extinguished, "a campfire in clear weather").toBe(false);
    expect(c.fuelUnits).toBeLessThan(WorldTime.TURNS_PER_DAY);
  });

  it("does extinguish an outdoor campfire in rain, sometimes", () => {
    const g = game();
    setWeather(Weather.RAIN);
    const c = litCampfire(WorldTime.TURNS_PER_DAY);
    let extinguished = false;
    for (let i = 0; i < 500 && !extinguished; i++) {
      g.BurnFuelOnFires(map);
      extinguished = !c.isOnFire;
    }
    expect(extinguished, "a campfire in rain, given enough rolls").toBe(true);
  });

  it("spends a fuel unit only on the turns the rain did not put it out", () => {
    // The C#'s `rainExtinguishedIt` flag exists so an extinguished turn does not
    // *also* burn fuel. If it did, an extinguished barrel would quietly eat a
    // unit of wood it never had.
    const g = game();
    setWeather(Weather.RAIN);
    const c = litCampfire(WorldTime.TURNS_PER_DAY);
    let extinguishedAt = -1;
    let fuelAtExtinguish = -1;
    for (let i = 0; i < 500; i++) {
      g.BurnFuelOnFires(map);
      if (!c.isOnFire) {
        extinguishedAt = i;
        fuelAtExtinguish = c.fuelUnits;
        break;
      }
    }
    expect(extinguishedAt).toBeGreaterThanOrEqual(0);
    // At most one unit per *surviving* turn: turns 0..k-1 burned, turn k did not.
    expect(fuelAtExtinguish).toBeGreaterThanOrEqual(WorldTime.TURNS_PER_DAY - extinguishedAt);
  });

  it("leaves an indoor campfire alone in rain", () => {
    const g = game();
    setWeather(Weather.RAIN);
    const c = litCampfire(WorldTime.TURNS_PER_DAY);
    const p = c.location.position;
    map.getTileAt(p.x, p.y)!.isInside = true;
    let extinguished = false;
    for (let i = 0; i < 300 && !extinguished; i++) {
      g.BurnFuelOnFires(map);
      extinguished = !c.isOnFire;
    }
    expect(extinguished, "a campfire indoors").toBe(false);
  });

  it("gives barrels no rain roll at all, rain or not", () => {
    // Only `Campfire` is rained on in the C#, and that is almost certainly
    // deliberate: a barrel is a metal drum.
    const g = game();
    setWeather(Weather.RAIN);
    const b = litBarrel(WorldTime.TURNS_PER_DAY);
    let extinguished = false;
    for (let i = 0; i < 300 && !extinguished; i++) {
      g.BurnFuelOnFires(map);
      extinguished = !b.isOnFire;
    }
    expect(extinguished, "a barrel in the rain").toBe(false);
  });
});

describe("Feature.FireBarrels: the start-fire gate that is not here yet", () => {
  it("leaks no barrel onto a CLASSIC map", () => {
    // The generator's gate, asserted end to end: a CLASSIC world builds plain
    // `MapObject` wrecks with no tank at all, so nothing downstream can tell
    // they were ever candidates for one.
    Session.get().ruleset = Ruleset.CLASSIC;
    // `makeObjWreckedCar` is protected, so the test needs a subclass rather than
    // `Object.create` on the prototype -- the latter works but reads as a
    // loophole, and `as any` would hide the very signature being relied on.
    class Exposed extends BaseMapGenerator {
      generate(): GameMap {
        throw new Error("not used: this test only reaches one protected factory");
      }

      /**
       * `protected` is checked against the *enclosing* class body, so calling it
       * from the test function is an error even on an instance of the subclass.
       * The wrapper is the sanctioned way to open it, and it also names what the
       * test is about rather than leaking the access question into the test.
       */
      wreckedCar(): MapObject {
        return this.makeObjWreckedCar(GameImages.OBJ_CAR1);
      }
    }
    // The constructor takes the game for `game.rules`; the factory under test
    // reads none of it.
    const car = new Exposed({ rules: new Rules(new DiceRoller(1)) }).wreckedCar();
    expect(car).not.toBeInstanceOf(Car);
    expect(car).toBeInstanceOf(MapObject);
    expect((car as { fuelUnits?: number }).fuelUnits).toBeUndefined();
  });

  it("keeps the roll honest about the rain chance it uses", () => {
    // Pinned so a change to FIRE_RAIN_PUT_OUT_CHANCE cannot quietly make a
    // campfire in rain a certainty or an impossibility.
    expect(Rules.FIRE_RAIN_PUT_OUT_CHANCE).toBe(10);
  });
});
