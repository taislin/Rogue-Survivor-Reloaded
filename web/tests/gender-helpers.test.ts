import { describe, it, expect } from "vitest";
import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { PlayerController } from "@data/PlayerController";
import { Point } from "@engine/Point";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { RogueGame } from "@engine/RogueGame";
import { NullRogueUI } from "@ui/NullRogueUI";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameItems } from "@gameplay/GameItems";
import { GameTiles } from "@gameplay/GameTiles";

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

/** The trade screen below builds actors, which need a faction. */
const survivors = new Faction("The Survivors", "survivor");

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
  // **Behavioural, not a source scan.** This used to read `RogueGame.ts` as text
  // and assert the sentence appeared exactly once on a line calling `HisOrHer(`.
  // §6 of the port plan flags that shape as the thing to remove before any region
  // moves — a scan over one file "either fails for the wrong reason or stops
  // matching and guards nothing" once the text is relocated.
  //
  // It does not have to be a scan. The trade screen is a `do { draw; wait }` loop,
  // and what it draws is an `OverlayPopupTitleColors` whose `lines` are a public
  // field, pushed by a public `AddOverlay`. So the string the player reads is
  // reachable without reproducing the closure: feed the UI an Escape, let the
  // loop draw once and leave, and read the overlay. `fire-extinguishers.test.ts`
  // already reads `m_Overlays` this way.
  //
  // Driving the real screen also covers what the scan could not: that the *right*
  // NPC is described. A scan proved the sentence existed; it could not tell a
  // male NPC from a female one, which is the entire bug — female NPCs were
  // unaffected, which is why it survived.

  /**
   * Runs the trade screen once and returns the title and lines it drew.
   *
   * The lines are captured *at the redraw*, not read afterwards: the screen ends
   * with `ClearOverlays()`, so reading `m_Overlays` once the call returns finds
   * nothing — the loop ran, drew, and tidied up behind itself. That is also why
   * the `RedrawPlayScreen` stub is where the capture goes: it is the one call in
   * the loop that happens while the overlays are still on screen, and it is the
   * call that throws on an unstarted game (it reads `m_MapViewRect`, which only
   * `StartNewGame` sets) — the same stub `fire-extinguishers.test.ts` and
   * `inert-sound-tiers.test.ts` use.
   *
   * The title is captured too, because it is how the negative test below proves
   * the screen really ran: without it, "the line is absent" would also be what
   * an empty capture looks like.
   */
  async function tradeScreen(
    isMale: boolean,
    { trustsPlayer = true }: { trustsPlayer?: boolean } = {},
  ): Promise<{ title: string; lines: string }> {
    new GameItems();
    new GameTiles();
    const ui = new NullRogueUI();
    const game = new RogueGame(ui);
    Session.useSeed(1);
    const map = new GameMap(1, "test", 30, 30);
    Session.get().ruleset = Ruleset.CLASSIC;

    const you = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
    you.controller = new PlayerController();
    map.placeActor(you, new Point(10, 10));
    game.m_Player = you;

    const npc = new Actor(
      Models.actors.get(isMale ? ActorID.MALE_CIVILIAN : ActorID.FEMALE_CIVILIAN),
      survivors,
      "trader",
    );
    if (trustsPlayer) {
      // The line is gated on `npc.leader === player && isActorTrustingLeader(npc)`,
      // and that rule returns false for anyone without a leader or below
      // `TRUST_TRUSTING_THRESHOLD`. `hasLeader` also requires a living leader.
      npc.leader = you;
      npc.trustInLeader = Rules.TRUST_TRUSTING_THRESHOLD + 1;
    }
    map.placeActor(npc, new Point(11, 10));

    let title = "";
    let lines: string[] = [];
    const overlays = (
      game as unknown as { m_Overlays: { title?: string; lines?: string[] | null }[] }
    ).m_Overlays;
    (game as unknown as { RedrawPlayScreen(): void }).RedrawPlayScreen = () => {
      title = overlays.map((o) => o.title ?? "").join("\n");
      lines = overlays.flatMap((o) => o.lines ?? []);
    };
    // One Escape: the loop draws, waits, and at `state === 0` an Escape leaves.
    ui.pushKeys("Escape");
    await game.HandlePlayerTradeNegociation(you, npc);
    return { title, lines: lines.join("\n") };
  }

  it("reads 'his' for a male trusted leader, not 'him'", async () => {
    const { lines } = await tradeScreen(true);
    expect(lines).toContain("You are his trusted leader, will accept all trades.");
    expect(lines).not.toContain("You are him ");
  });

  it("reads 'her' for a female trusted leader", async () => {
    const { lines } = await tradeScreen(false);
    expect(lines).toContain("You are her trusted leader, will accept all trades.");
  });

  it("only says it to a follower who trusts the player", async () => {
    // The negative case, which the source scan could not express at all: the line
    // is gated on the leader relationship, so an NPC who does not follow the
    // player must not be described as a trusting follower.
    const { title, lines } = await tradeScreen(true, { trustsPlayer: false });
    expect(lines).not.toContain("trusted leader, will accept all trades.");
    // And the screen really did draw, so the negative above is not vacuous.
    expect(title).toContain("Trading with trader");
  });

  it("produces grammatical English for both genders", () => {
    // The helpers themselves, spelled out rather than through the screen.
    for (const isMale of [true, false]) {
      const rendered = `You are ${callHelper("HisOrHer", isMale)} trusted leader, will accept all trades.`;
      expect(rendered).toMatch(/^You are (his|her) trusted leader, will accept all trades\.$/);
    }
    expect(`You are ${callHelper("HisOrHer", true)} trusted leader, will accept all trades.`)
      .not.toContain(" him ");
  });
});
