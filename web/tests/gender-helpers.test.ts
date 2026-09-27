import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { RogueGame } from "@engine/RogueGame";
import { GameActors, ActorID } from "@gameplay/GameActors";

/**
 * Regression test for §1.1f bug 52.
 *
 * The trade screen read:
 *
 *     lines.Add(String.Format("You are {0} trusted leader, will accept all
 *                               trades.", HisOrHer(npc)));
 *
 * and the port had:
 *
 *     `You are ${this.HimOrHer(npc)} trusted leader, will accept all trades.`
 *
 * `HisOrHer` returns "his"/"her" (possessive) and `HimOrHer` returns
 * "him"/"her" (objective). Both helpers exist in the port and both are
 * individually correct -- the wrong one was called, so a **male** trusted-leader
 * NPC read "You are him trusted leader". Female NPCs were unaffected, which is
 * exactly why it survived: the common case looked right.
 *
 * The failure mode is grammatical, so it type-checks, builds, and runs. Only a
 * test that reads the string catches it.
 */

const actorsDB = new GameActors();

/** The helpers are pure and read only `actor.model.dollBody.isMale`. */
function stubActor(isMale: boolean): any {
  return { model: { dollBody: { isMale } } };
}

/**
 * Calls a RogueGame method without constructing a RogueGame. All four gender
 * helpers are stateless one-liners, so `this` is irrelevant; standing up a full
 * game to read "his" off a male actor would be absurd.
 */
function callHelper(name: string, isMale: boolean): string {
  const fn = (RogueGame.prototype as any)[name];
  expect(typeof fn, `RogueGame.${name} does not exist`).toBe("function");
  return fn.call({}, stubActor(isMale));
}

describe("gender helpers return the right case", () => {
  it("HisOrHer is possessive: his / her", () => {
    // C# RogueGame.cs:1072
    expect(callHelper("HisOrHer", true)).toBe("his");
    expect(callHelper("HisOrHer", false)).toBe("her");
  });

  it("HimOrHer is objective: him / her", () => {
    // C# RogueGame.cs:1082
    expect(callHelper("HimOrHer", true)).toBe("him");
    expect(callHelper("HimOrHer", false)).toBe("her");
  });

  it("HeOrShe and HimselfOrHerself agree with the C#", () => {
    // C# RogueGame.cs:1077, 1088. Asserted because they share the isMale read
    // and a wrong `isMale` would break all four at once.
    expect(callHelper("HeOrShe", true)).toBe("he");
    expect(callHelper("HeOrShe", false)).toBe("she");
    expect(callHelper("HimselfOrHerself", true)).toBe("himself");
    expect(callHelper("HimselfOrHerself", false)).toBe("herself");
  });

  it("the helpers agree with the actor model, not a hardcoded gender", () => {
    // Guards a "fix" that hardcodes one branch to make a string match. The
    // helpers take an Actor, so the model is wrapped in one here.
    const male = actorsDB.get(ActorID.MALE_CIVILIAN);
    const female = actorsDB.get(ActorID.FEMALE_CIVILIAN);
    expect(male.dollBody.isMale).toBe(true);
    expect(female.dollBody.isMale).toBe(false);
    const call = (n: string, model: any) =>
      (RogueGame.prototype as any)[n].call({}, { model });
    expect(call("HisOrHer", male)).toBe("his");
    expect(call("HisOrHer", female)).toBe("her");
  });
});

describe("the trusted-leader line uses the possessive helper", () => {
  // The line is built inside a `do {} while (state != ...)` trade-screen loop
  // whose closure captures a dozen pieces of trade state, so it cannot be
  // invoked in isolation without reproducing the whole trade flow. This is
  // therefore a source assertion rather than a behavioural one. It is
  // deliberately narrow -- it looks for this one sentence -- so it fails only
  // if that specific call site regresses, not on unrelated edits.
  const source = readFileSync(
    new URL("../src/engine/RogueGame.ts", import.meta.url),
    "utf8"
  );

  it("the sentence exists exactly once", () => {
    const matches = source.match(
      /trusted leader, will accept all trades\./g
    );
    expect(matches, "trusted-leader sentence not found -- was it reworded?").toHaveLength(1);
  });

  it("calls HisOrHer, not HimOrHer", () => {
    const line = source
      .split("\n")
      .find((l) => l.includes("trusted leader, will accept all trades."));
    expect(line, "trusted-leader line not found").toBeDefined();
    expect(line).toContain("HisOrHer(");
    // \b matters: "HisOrHer" contains no "HimOrHer", but a naive substring
    // check for "imOrHer" would also match nothing useful. Be explicit.
    expect(line).not.toMatch(/\bHimOrHer\(/);
  });

  it("produces grammatical English for both genders", () => {
    // The real assertion, spelled out: this is what the player reads.
    for (const isMale of [true, false]) {
      const rendered = `You are ${callHelper("HisOrHer", isMale)} trusted leader, will accept all trades.`;
      expect(rendered).toMatch(/^You are (his|her) trusted leader, will accept all trades\.$/);
    }
    expect(`You are ${callHelper("HisOrHer", true)} trusted leader, will accept all trades.`)
      .not.toContain(" him ");
  });
});
