import { describe, it, expect } from "vitest";
import { DiceRoller } from "@engine/DiceRoller";
import { Direction } from "@engine/Direction";
import { WorldTime, DayPhase } from "@engine/WorldTime";
import { Point } from "@engine/Point";

describe("DiceRoller", () => {
  it("is reproducible for a given seed", () => {
    const a = new DiceRoller(12345);
    const b = new DiceRoller(12345);
    const seqA = Array.from({ length: 50 }, () => a.roll(0, 1000));
    const seqB = Array.from({ length: 50 }, () => b.roll(0, 1000));
    expect(seqA).toEqual(seqB);
  });

  it("diverges for different seeds", () => {
    const a = Array.from({ length: 50 }, ((r) => () => r.roll(0, 1000))(new DiceRoller(1)));
    const b = Array.from({ length: 50 }, ((r) => () => r.roll(0, 1000))(new DiceRoller(2)));
    expect(a).not.toEqual(b);
  });

  it("roll stays within [min, max)", () => {
    const r = new DiceRoller(7);
    for (let i = 0; i < 5_000; i++) {
      const v = r.roll(3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(9);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("roll returns min when max <= min, matching the C# guard", () => {
    const r = new DiceRoller(7);
    expect(r.roll(5, 5)).toBe(5);
    expect(r.roll(9, 2)).toBe(9);
  });

  it("rollFloat stays within [0, 1)", () => {
    const r = new DiceRoller(99);
    for (let i = 0; i < 5_000; i++) {
      const v = r.rollFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("rollChance honours 0% and 100% exactly", () => {
    const r = new DiceRoller(4242);
    for (let i = 0; i < 200; i++) {
      expect(r.rollChance(0)).toBe(false);
      expect(r.rollChance(100)).toBe(true);
    }
  });

  it("rollChance approximates the requested percentage", () => {
    const r = new DiceRoller(31337);
    let hits = 0;
    const trials = 20_000;
    for (let i = 0; i < trials; i++) if (r.rollChance(25)) hits++;
    const ratio = hits / trials;
    // 25% of 20k is 5000; allow a generous +/-3% band so this is not flaky.
    expect(ratio).toBeGreaterThan(0.22);
    expect(ratio).toBeLessThan(0.28);
  });

  it("shuffle preserves every element (a permutation, not a filter)", () => {
    const r = new DiceRoller(2024);
    const input = Array.from({ length: 200 }, (_, i) => i);
    const out = r.shuffle([...input]);
    expect(out).toHaveLength(input.length);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });

  it("shuffle actually reorders and is deterministic per seed", () => {
    const input = Array.from({ length: 100 }, (_, i) => i);
    const a = new DiceRoller(5).shuffle([...input]);
    const b = new DiceRoller(5).shuffle([...input]);
    const c = new DiceRoller(6).shuffle([...input]);
    expect(a).toEqual(b);
    expect(a).not.toEqual(input);
    expect(a).not.toEqual(c);
  });

  it("shuffle handles empty and single-element arrays", () => {
    const r = new DiceRoller(1);
    expect(r.shuffle([])).toEqual([]);
    expect(r.shuffle([42])).toEqual([42]);
  });
});

describe("Direction", () => {
  it("opposite maps each of the 8 compass points to its reverse", () => {
    for (const d of Direction.COMPASS) {
      expect(Direction.opposite(Direction.opposite(d))).toBe(d);
    }
    expect(Direction.opposite(Direction.N)).toBe(Direction.S);
    expect(Direction.opposite(Direction.E)).toBe(Direction.W);
    expect(Direction.opposite(Direction.NE)).toBe(Direction.SW);
  });

  it("left and right are inverses and consistent with opposite", () => {
    for (const d of Direction.COMPASS) {
      expect(Direction.left(Direction.right(d))).toBe(d);
      expect(Direction.right(Direction.left(d))).toBe(d);
      // Four steps around an 8-point compass is the opposite direction, and
      // eight is a full circle.
      expect(Direction.right(Direction.right(Direction.right(Direction.right(d))))).toBe(
        Direction.opposite(d)
      );
      let cur = d;
      for (let i = 0; i < 8; i++) cur = Direction.right(cur);
      expect(cur).toBe(d);
    }
  });

  it("left and right differ (guards against both being identity)", () => {
    for (const d of Direction.COMPASS) {
      expect(Direction.left(d)).not.toBe(d);
      expect(Direction.right(d)).not.toBe(d);
    }
  });

  it("applies to a point as an offset", () => {
    const p = new Point(10, 10);
    expect(Direction.N.applyTo(p).y).toBe(9);
    expect(Direction.S.applyTo(p).y).toBe(11);
    expect(Direction.E.applyTo(p).x).toBe(11);
    expect(Direction.W.applyTo(p).x).toBe(9);
    expect(Direction.NE.applyTo(p)).toEqual(new Point(11, 9));
  });

  it("NEUTRAL leaves a point unchanged", () => {
    const p = new Point(4, 7);
    expect(Direction.NEUTRAL.applyTo(p)).toEqual(p);
  });

  it("fromVector resolves exact directions and rejects non-adjacent", () => {
    expect(Direction.fromVector(0, -1)).toBe(Direction.N);
    expect(Direction.fromVector(1, 0)).toBe(Direction.E);
    expect(Direction.fromVector(-1, 1)).toBe(Direction.SW);
    // Two cells away is not a single compass step.
    expect(Direction.fromVector(2, 0)).toBeNull();
    expect(Direction.fromVector(0, 0)).toBeNull();
  });
});

describe("WorldTime", () => {
  it("uses 30 turns per hour and 720 per day", () => {
    expect(WorldTime.TURNS_PER_HOUR).toBe(30);
    expect(WorldTime.TURNS_PER_DAY).toBe(720);
  });

  it("derives day and hour from the turn counter", () => {
    const t = new WorldTime(0);
    expect(t.day).toBe(0);
    expect(t.hour).toBe(0);

    t.turnCounter = 30;
    expect(t.hour).toBe(1);
    expect(t.day).toBe(0);

    t.turnCounter = 719;
    expect(t.hour).toBe(23);
    expect(t.day).toBe(0);

    t.turnCounter = 720;
    expect(t.day).toBe(1);
    expect(t.hour).toBe(0);
  });

  it("rejects a negative turn counter", () => {
    expect(() => new WorldTime(-1)).toThrow(RangeError);
  });

  it("maps every hour of the day to the expected phase", () => {
    const expected: Array<[number, DayPhase]> = [
      [0, DayPhase.MIDNIGHT],
      [1, DayPhase.DEEP_NIGHT],
      [5, DayPhase.DEEP_NIGHT],
      [6, DayPhase.SUNRISE],
      [7, DayPhase.MORNING],
      [11, DayPhase.MORNING],
      [12, DayPhase.MIDDAY],
      [13, DayPhase.AFTERNOON],
      [17, DayPhase.AFTERNOON],
      [18, DayPhase.SUNSET],
      // There is no NIGHT phase: C# DayPhase has exactly 8 members and
      // EVENING covers 19h-23h (WorldTime.cs:13).
      [19, DayPhase.EVENING],
      [23, DayPhase.EVENING],
    ];
    for (const [hour, phase] of expected) {
      const t = new WorldTime(hour * WorldTime.TURNS_PER_HOUR);
      expect(t.hour).toBe(hour);
      expect(t.phase).toBe(phase);
    }
  });

  it("classifies night consistently with the phase table", () => {
    // Night runs from 18:00 (sunset) through to 06:00 (sunrise) exclusive.
    for (let hour = 0; hour < 24; hour++) {
      const t = new WorldTime(hour * WorldTime.TURNS_PER_HOUR);
      const shouldBeNight = hour >= 18 || hour < 6;
      expect(t.isNight).toBe(shouldBeNight);
    }
  });

  it("flags the strike of midnight and midday only on transition", () => {
    const t = new WorldTime(0);
    expect(t.isStrikeOfMidnight).toBe(false);

    t.turnCounter = 29; // still hour 0, no transition
    expect(t.isStrikeOfMidnight).toBe(false);

    t.turnCounter = 30; // hour 0 -> 1
    expect(t.isStrikeOfMidnight).toBe(false);

    t.turnCounter = WorldTime.TURNS_PER_DAY; // hour 23 -> 0, wraps to day 1
    expect(t.isStrikeOfMidnight).toBe(true);
    expect(t.isStrikeOfMidday).toBe(false);

    t.turnCounter = WorldTime.TURNS_PER_DAY + 12 * WorldTime.TURNS_PER_HOUR;
    expect(t.isStrikeOfMidday).toBe(true);
    expect(t.isStrikeOfMidnight).toBe(false);
  });
});
