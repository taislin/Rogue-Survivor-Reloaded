import { describe, it, expect, beforeEach } from "vitest";
import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { GameActors, ActorID } from "@gameplay/GameActors";

/**
 * C#'s alpha10 `m_IsInvincible` guard on the Actor point setters.
 *
 * The bug: `hitPoints`, `staminaPoints`, `foodPoints`, `sleepPoints`, `sanity`
 * and `infection` were plain public fields in the port, so the guard the C#
 * puts in every one of those property setters was silently absent. Setting
 * `actor.isInvincible = true` — which the game itself does, for the cheat and
 * for the "player is invincible" options — had no effect on anything: the very
 * next `InflictDamage` wrote straight through.
 *
 * Six properties, and the guard is not uniform. Five block a *decrease*
 * (Actor.cs:240, 257, 274, 291, 308); `Infection` is inverted and blocks an
 * *increase* (Actor.cs:465), so curing an invincible actor still works.
 *
 * This only affects the invincibility cheat, not normal play — which is exactly
 * why it survived a green build, the sim, and 146 tests.
 */

// Registers itself into `Models.actors`, which `new Actor` needs.
new GameActors();

function makeActor(): Actor {
  const actor = new Actor(
    new GameActors().get(ActorID.MALE_CIVILIAN),
    new Faction("Testers", "tester"),
    "survivor"
  );
  actor.hitPoints = 30;
  actor.staminaPoints = 60;
  actor.foodPoints = 1440;
  actor.sleepPoints = 1800;
  actor.sanity = 2880;
  return actor;
}

/** The five decrease-guarded properties, with a value well above zero. */
const DECREASE_GUARDED: Array<[string, number]> = [
  ["hitPoints", 30],
  ["staminaPoints", 60],
  ["foodPoints", 1440],
  ["sleepPoints", 1800],
  ["sanity", 2880],
];

describe("Actor isInvincible guard", () => {
  let actor: Actor;

  beforeEach(() => {
    actor = makeActor();
  });

  describe("when not invincible", () => {
    it.each(DECREASE_GUARDED)("%s decreases normally", (prop, before) => {
      expect((actor as any)[prop]).toBe(before);
      (actor as any)[prop] = before - 10;
      expect((actor as any)[prop]).toBe(before - 10);
    });

    it("infection rises normally", () => {
      actor.infection = 40;
      expect(actor.infection).toBe(40);
    });
  });

  describe("when invincible", () => {
    beforeEach(() => {
      actor.isInvincible = true;
    });

    it.each(DECREASE_GUARDED)("%s cannot be decreased", (prop, before) => {
      (actor as any)[prop] = before - 10;
      expect((actor as any)[prop]).toBe(before);
    });

    it.each(DECREASE_GUARDED)("%s can still be raised (healing works)", (prop, before) => {
      (actor as any)[prop] = before + 25;
      expect((actor as any)[prop]).toBe(before + 25);
    });

    it("infection cannot rise", () => {
      actor.infection = 0;
      actor.infection = 40;
      expect(actor.infection).toBe(0);
    });

    it("infection can still be cured -- the guard is inverted for it", () => {
      actor.isInvincible = false;
      actor.infection = 40;
      actor.isInvincible = true;
      actor.infection = 0;
      expect(actor.infection).toBe(0);
    });

    it("survives the InflictDamage path, which is how damage actually arrives", () => {
      // Mirrors RogueGame.InflictDamage: `actor.hitPoints -= dmg`.
      actor.hitPoints -= 17;
      expect(actor.hitPoints).toBe(30);
    });

    it("stops being invincible when the flag is cleared", () => {
      actor.isInvincible = false;
      actor.hitPoints = 5;
      expect(actor.hitPoints).toBe(5);
    });
  });

  it("does not shadow the accessors with own instance fields", () => {
    // `useDefineForClassFields: true` means a stray `hitPoints = 0` field
    // declaration would define an own property that shadows the prototype
    // accessor and silently reintroduce the bug.
    expect(Object.getOwnPropertyDescriptor(actor, "hitPoints")).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(Actor.prototype, "hitPoints")!.set).toBeTypeOf("function");
  });
});
