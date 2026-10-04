/**
 * Multiplayer Phase 1 — the gate: a two-player headless run survives 50 turns.
 *
 * `plans/MULTIPLAYER_PLAN.md` §8 Phase 1 attaches this to the phase:
 *
 * > **Gate:** a two-player headless run survives 50 turns, and the two-player save
 * > round-trips through the existing bijection test.
 *
 * The second half lives in `save-player-roster.test.ts`. This is the first.
 *
 * ## What "survives 50 turns" is actually testing
 *
 * Not that the scheduler can do it — Phase 0 settled that in one map turn. The
 * thing at risk is the engine's **single-player game-over assumption**, which has
 * two halves and both are here:
 *
 * 1. `GameLoop`'s condition is `m_Player != null && !m_Player.isDead && …`, and
 *    `HeadlessRunner`'s own loop is `if (player === null || player.isDead) break;`.
 *    Both read *one* actor. With two players, "the player I last bound died" and
 *    "no player is left" are different questions, and only the second one is
 *    about the game.
 * 2. `KillActor` runs the death sequence — `PlayerDied`, the post-mortem — only
 *    `if (deadGuy === this.m_Player)`. A death that is not the bound player's is
 *    not just un-announced; nothing anywhere records that a player died.
 *
 * So the second case in this file kills **player A while B is still alive** and
 * requires the run to carry on to 50. That is the whole claim: *one player dying
 * ends one player's game, not the game.*
 *
 * ## The first version of this file passed while testing none of that
 *
 * It wrote its own `for` loop over `AdvancePlay`, which meant the engine's stop
 * condition was never evaluated: the loop under test was the test's. Both cases
 * went green on the first run, including the death case. Nothing was broken and
 * nothing was verified — the only difference between it and this version is that
 * the turns now come from `HeadlessRunner.playTurns`, which is the loop that owns
 * the assumption. Hence the extraction: a test cannot check a stop condition it
 * replaces.
 *
 * Kept because it is the failure mode this kind of gate is prone to. A gate that
 * passes on the first attempt deserves the suspicion, and the fix was to move the
 * loop, not to relax anything.
 *
 * ## Why the second player is driven by the same peek as the first
 *
 * One `NullRogueUI` serves both, and `UI_PeekKey()` takes no argument — the
 * finding Phase 0 recorded. Two players therefore cannot be told apart at the
 * input seam, which is why this file does not try to give them different keys.
 * Both wait. That is enough for the claim: the assertion is that *turns keep
 * happening and the right player keeps acting*, not that either is playing well.
 *
 * The acting player is recorded at `HandlePlayerActor`, which is where the engine
 * itself decides who acts — `this.m_Player = player` is the line that makes
 * `m_Player` mean "the acting player" rather than "the one player". Recording
 * anywhere lower would be asserting the scheduler rather than the player binding.
 *
 * ## The wedge guard, again
 *
 * Same reason as `multiplayer-phase0-roundrobin.test.ts`: a play loop that never
 * ends its turn spins in the microtask queue and starves the timers that would
 * catch it. The `cap` here is ~40 turns of headroom, and the run is 50 turns of
 * *world* time, so the cap is about wedges and never about the test's own length.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { NullRogueUI } from "@ui/NullRogueUI";
import { RogueGame } from "@engine/RogueGame";
import { PlayerController } from "@data/PlayerController";
import { Actor } from "@data/Actor";
import { Map } from "@data/Map";
import { Point } from "@engine/Point";
import type { GameKeyEvent } from "@engine/IRogueUI";

/** A `NullRogueUI` whose peek answers `WAIT` once scripting is on. */
class ScriptedPeekUI extends NullRogueUI {
  static readonly WAIT_KEY: GameKeyEvent = {
    key: "X",
    keyCode: 88,
    shift: false,
    ctrl: false,
    alt: false,
  };

  scripted = false;
  peekCount = 0;
  cap = 2_000;

  override UI_PeekKey(): GameKeyEvent | null {
    if (!this.scripted) return super.UI_PeekKey();
    if (++this.peekCount > this.cap) {
      throw new Error(
        `ScriptedPeekUI served ${this.peekCount} peeks without a turn ending — ` +
          `the play loop is spinning on input that does not end a turn`,
      );
    }
    return { ...ScriptedPeekUI.WAIT_KEY };
  }
}

const SEED = 20261004;
const SETTLE_TURNS = 12;
const GATE_TURNS = 50;

let ui: ScriptedPeekUI;
let runner: HeadlessRunner;
let game: RogueGame;
let map: Map;
let playerA: Actor;
let playerB: Actor;

/**
 * Every `HandlePlayerActor` call as `(worldTurn, actor)`, oldest first.
 *
 * `undefined` while not recording, because the settle phase and background
 * districts would otherwise fill it with turns nobody is asserting about.
 */
let acts: Array<{ turn: number; actor: Actor }> | undefined;
let uninstallProbe: () => void = () => {};

/** A tile on `m` with no actor on it, or `null` if the map is packed. */
function freeTileOn(m: Map): Point | null {
  for (let y = 1; y < m.height - 1; y++) {
    for (let x = 1; x < m.width - 1; x++) {
      const p = new Point(x, y);
      if (m.getActorAtPoint(p) === null) return p;
    }
  }
  return null;
}

beforeAll(async () => {
  ui = new ScriptedPeekUI();
  runner = new HeadlessRunner(SEED, ui);
  await runner.run({ worldSize: 1, maxTurns: SETTLE_TURNS, bot: true });
  game = runner.rogueGame;

  game.BotReleaseControl();
  game.botDelayMs = 0;
  ui.scripted = true;

  map = game.session.currentMap!;
  playerA = game.player!;
  expect(playerA, "the settled run left a live player").toBeTruthy();

  // Player B, beside A, on the same map — Phase 0's shape, which the gate is
  // deliberately built on rather than reinvented.
  const spot = freeTileOn(map);
  expect(spot, "a free tile for player B").not.toBeNull();
  playerB = new Actor(playerA.model, playerA.faction, "survivor");
  map.placeActor(playerB, spot!);
  playerB.controller = new PlayerController();

  const proto = RogueGame.prototype as unknown as {
    HandlePlayerActor: (a: Actor) => Promise<void>;
  };
  const original = proto.HandlePlayerActor;
  proto.HandlePlayerActor = function (
    this: RogueGame,
    a: Actor,
  ): Promise<void> {
    if (acts !== undefined)
      acts.push({ turn: this.session.worldTime.turnCounter, actor: a });
    return original.call(this, a);
  };
  uninstallProbe = () => {
    proto.HandlePlayerActor = original;
  };
}, 120_000);

afterAll(() => {
  uninstallProbe();
});

/**
 * Play `n` world turns **through the runner's own loop**, and return how many
 * world turns elapsed.
 *
 * Through the runner and not around it, on purpose — see the header. `playTurns`
 * is where `anyPlayerLeft()` is evaluated, and evaluating it is the entire
 * difference between this gate and the draft that passed for nothing.
 */
async function playTurns(n: number): Promise<number> {
  const before = game.session.worldTime.turnCounter;
  await runner.playTurns(n);
  // Elapsed world time rather than the count returned: a loop that advanced two
  // turns per iteration would make "50" a lie in the other direction.
  return game.session.worldTime.turnCounter - before;
}

describe("multiplayer Phase 1 — the 50-turn gate", () => {
  it("a two-player run survives 50 world turns", async () => {
    acts = [];
    const before = game.session.worldTime.turnCounter;

    const elapsed = await playTurns(GATE_TURNS);
    const recorded = acts;
    acts = undefined;

    expect(
      elapsed,
      `the run played ${GATE_TURNS} world turns (advanced ${elapsed})`,
    ).toBe(GATE_TURNS);

    // Both players acted — not "both exist". A second player that the scheduler
    // never picks is exactly the shape a roster-only fix would leave behind.
    expect(
      recorded.some((e) => e.actor === playerA),
      "player A acted during the run",
    ).toBe(true);
    expect(
      recorded.some((e) => e.actor === playerB),
      "player B acted during the run — it is not just player A's game",
    ).toBe(true);

    // The binding moved between them, which is what `m_Player` has to mean now.
    expect(
      new Set(recorded.filter((e) => e.actor.isPlayer).map((e) => e.actor)).size,
      "both player-controlled actors held the binding at some point",
    ).toBe(2);

    expect(
      game.session.worldTime.turnCounter - before,
      "and the clock moved, so this was play and not five hundred no-ops",
    ).toBeGreaterThanOrEqual(GATE_TURNS);
  }, 300_000);

  it("the bound player dying does not end the game for the other", async () => {
    // The claim in one sentence: *one player dying ends one player's game, not
    // the game.* Everything in the header comes down to this assertion.
    //
    // The victim is `game.player` — **whichever player currently holds the
    // binding** — and not player A by name. That is the whole difference
    // between this and the version that passed against the unfixed engine: it
    // killed A, and `m_Player` happened to be bound to B at that moment, so
    // `!m_Player.isDead` was true and the single-player break never fired. The
    // hazard is not "player A dies", it is "the player the engine last
    // remembered dies", and only that ordering can reach the old condition.
    //
    // The assertion that would have caught this is the one below: kill the
    // bound player, then require more turns. Nothing else in the run can stop
    // it, because the survivor is standing on the map acting every turn.
    const doomed = game.player;
    expect(
      doomed === playerA || doomed === playerB,
      "the binding is on one of the two players, not stale",
    ).toBe(true);
    const survivor = doomed === playerA ? playerB : playerA;

    expect(doomed!.isDead, "the bound player starts alive").toBe(false);
    expect(survivor.isDead, "the survivor starts alive").toBe(false);

    acts = [];
    await game.KillActor(null, doomed!, "test: multiplayer gate");
    const afterKill = game.session.worldTime.turnCounter;

    expect(doomed!.isDead, "the kill took").toBe(true);
    // Checked *before* playing, so a survivor who dies of natural causes later
    // cannot make this read as though the scenario failed to set up.
    expect(survivor.isDead, "the survivor outlived the kill").toBe(false);

    const elapsed = await playTurns(GATE_TURNS);
    const recorded = acts;
    acts = undefined;

    expect(
      elapsed,
      `the run kept playing after the bound player died (advanced ${elapsed} ` +
        `of ${GATE_TURNS}) — the loop stopped early, which is the single-player ` +
        `game-over condition still reading one actor`,
    ).toBe(GATE_TURNS);

    const actedAfter = recorded.filter((e) => e.actor === survivor);
    expect(
      actedAfter.length,
      "the survivor kept acting after the death — a run that stopped at the " +
        "death has no turns here",
    ).toBeGreaterThan(0);

    expect(
      actedAfter.some((e) => e.turn > afterKill),
      "and held the binding after the kill, so the loop always saw a living player",
    ).toBe(true);
  }, 300_000);

  it("anyPlayerAlive answers the question both stop conditions now ask", async () => {
    // The predicate, exercised directly rather than through a loop.
    //
    // Two things read it: `GameLoop`'s `while` and `HeadlessRunner`'s break. Only
    // the second is reachable from this file — `GameLoop` starts at the main menu,
    // and `endgame-exit.test.ts` is what drives it — so the *single-player* wiring
    // is covered there (player dead ⇒ loop not entered, unchanged by this phase)
    // and the multiplayer behaviour of the predicate is covered here. What is not
    // covered anywhere is `GameLoop` under two players; it is one line reading a
    // predicate this test pins, and recording that is better than implying it.
    const aliveBefore = game.anyPlayerAlive;
    expect(aliveBefore, "a living player ⇒ true").toBe(true);

    // The case above left exactly one player standing, so this takes the roster
    // to zero — the transition nothing in the engine used to be able to observe
    // without also ending the run.
    const last = game.player!;
    expect(last.isDead, "the bound player is the living one").toBe(false);
    await game.KillActor(null, last, "test: last player");

    expect(game.anyPlayerAlive, "nobody left ⇒ false").toBe(false);

    // …and the runner's loop stops on it, which is the same predicate wired into
    // the other half of the engine. Zero turns and a frozen clock, rather than a
    // run that keeps simulating an empty world.
    const before = game.session.worldTime.turnCounter;
    const played = await runner.playTurns(5);
    expect(played, "no turns once nobody is left").toBe(0);
    expect(
      game.session.worldTime.turnCounter - before,
      "…and the world clock stopped with it",
    ).toBe(0);
  }, 300_000);
});
