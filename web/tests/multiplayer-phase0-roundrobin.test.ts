/**
 * Multiplayer Phase 0 — the round-robin claim, as one test.
 *
 * `plans/MULTIPLAYER_PLAN.md` §3 makes a specific, load-bearing claim about the
 * *existing* engine:
 *
 * > There is no player filter, no priority queue, no turn token, no time-slicing.
 * > It is a linear scan of `map.actors` from a cursor. The player is picked by
 * > exactly the same `actionPoints > 0` test as a zombie, and `actor.isPlayer` is
 * > read only *after* the pick … **Therefore: give a second actor a
 * > `PlayerController` and the existing scheduler alternates between them.**
 *
 * §8 makes that the whole of Phase 0 and attaches a gate to it:
 *
 * > **Gate:** the test is green. **If it is not, stop** — the round-robin
 * > assumption is wrong and §3 through §7 are void.
 *
 * So this file is not a step toward multiplayer; it is the check on whether the
 * next six phases are worth planning at all. It is deliberately small and
 * deliberately in the sim — §1.4a of the port plan is explicit that a browser
 * check does not substitute for a headless one here.
 *
 * ## What "acted exactly once" means
 *
 * `advancePlayMap` picks **one** actor per call, and the caller loops it until
 * `map.localTime.turnCounter` moves. So "one map turn with two players" is a
 * *sequence* of picks, and the thing to assert is that sequence: within one map
 * turn, each player is picked **exactly once**. Asserting a pair of counts would
 * be weaker than it looks and asserting "both appeared" weaker still — A, A, B, B
 * satisfies both. The alternation assertion is what makes it round-robin.
 *
 * The probe wraps `Rules.getNextActorToAct` on the prototype, which is the seam
 * §6.9 of the port plan records for tests that have to see inside the class.
 * Nothing else in the tree is modified, and the wrap is removed by the file
 * ending.
 *
 * ## The input seam is `UI_PeekKey`, and finding that out cost this test three runs
 *
 * The scripted input here overrides **`UI_PeekKey`**, not `UI_WaitKey`, and that is
 * not a detail. `WaitKeyOrMouse` — the wait every player turn goes through —
 * **polls**:
 *
 * ```ts
 * this.m_UI.UI_PeekKey();   // consume keys to avoid repeats
 * do {
 *   const inKey = this.m_UI.UI_PeekKey();
 *   …
 * ```
 *
 * It never calls `UI_WaitKey`. The first version of this file overrode
 * `UI_WaitKey`, so its keys were never seen; the player loop instead consumed
 * `NullRogueUI`'s idle cycle, which is `Enter, Escape, n, y` — and `Escape`
 * translates to `PlayerCommand.NONE`, which `break`s the switch **without** setting
 * `loop = false`. The turn therefore never ended, no action points were spent, the
 * scheduler picked the same player again, and the test hung.
 *
 * Two things about that hang are worth keeping:
 *
 * - **It is not a timeout.** Every iteration `await`s a promise that is already
 *   resolved, so the loop runs entirely in the microtask queue and starves the
 *   macrotask one. Vitest's own test timeout never fires and neither does a
 *   `Promise.race` against `setTimeout`. A hung engine test of this shape has to
 *   be broken by throwing from inside the input seam, which is what the
 *   `ScriptedPeekUI` cap below is for.
 * - **It is not an engine bug.** A real player pressing Escape gets the same
 *   nothing, but a real player then presses a key that *does* end the turn. The
 *   spin needs an input source that only ever offers non-ending keys, which is a
 *   property of this test's double and not of the game.
 *
 * **The finding that matters for §7** is the shape of it: the player's turn is
 * driven by a *synchronous poll*, not by a blocking call. §7 says a networked
 * `NetUI` works because "`IRogueUI` has 43 methods of which exactly three block",
 * and lists them as `UI_WaitKey`, `UI_Wait` and `UI_PreloadImages`. But the one
 * input path a networked player actually needs — the play loop — is none of those
 * three. It is a non-blocking peek. **A promise-returning `NetUI` cannot answer it.**
 * Either the peek has to block (which gives up the poll design and its
 * timeout-based `IdleAdvance`) or the loop has to become an await, and that is a
 * Phase 2/3 decision this test does not make.
 *
 * ## The setup, and why it is shaped this way
 *
 * A real world is generated and played by the existing harness, then bot control
 * is **released** so both players are human-controlled and the test controls the
 * input. Three details that are not incidental:
 *
 * - **Bot control is released rather than left on.** `m_botControl` and
 *   `m_isBotMode` are single fields bound to *one* actor — `BotTakeControl` does
 *   `m_botControl.takeControl(this.m_Player)` — so leaving bot mode on would have
 *   the second player answered with the *first* player's AI. That is a real
 *   Phase 1 obstacle (the same single-`m_Player` problem §6 item 1 is about), and
 *   leaving it on here would have tested the obstacle instead of the scheduler.
 * - **Scripting is switched on only after world generation.** The settle phase
 *   walks the four character-creation screens, which want `Enter` and a `y` at a
 *   nested confirm. A double that answered `X` to everything wedged the *new-game
 *   flow*, silently, as a hang — which is why this is a flag and not a subclass
 *   that only ever answers one key.
 * - **`X` (`WAIT_OR_SELF`) is the scripted key**, verified through the real
 *   translator rather than assumed: `InputTranslator.keyToCommand(new Keybindings(),
 *   "X", false, false, false)` is `WAIT_OR_SELF`, whose case sets `loop = false` and
 *   calls `DoWait`, spending the turn and exiting cleanly.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { NullRogueUI } from "@ui/NullRogueUI";
import { Rules } from "@engine/Rules";
import { RogueGame, SimFlags } from "@engine/RogueGame";
import { PlayerController } from "@data/PlayerController";
import { Actor } from "@data/Actor";
import { Map } from "@data/Map";
import { Point } from "@engine/Point";
import type { GameKeyEvent } from "@engine/IRogueUI";

/**
 * A `NullRogueUI` whose **peek** answers `X` once scripting is switched on.
 *
 * Subclassing rather than implementing `IRogueUI` on purpose: there are 43
 * methods, and a structural double would restate all of them, so any method the
 * engine grew later would become a compile error here instead of a silent `any`.
 */
class ScriptedPeekUI extends NullRogueUI {
  static readonly WAIT_KEY: GameKeyEvent = {
    key: "X",
    keyCode: 88,
    shift: false,
    ctrl: false,
    alt: false,
  };

  /** Off during world generation; see the file header. */
  scripted = false;

  /** Peeks served since the last `resetCounters()`. Two per player turn. */
  peekCount = 0;

  /**
   * Throw rather than let the play loop spin forever.
   *
   * Not belt-and-braces: it is the *only* thing that can stop a wedged engine
   * test here, because the spin never yields to the macrotask queue and so
   * neither Vitest's timeout nor a `setTimeout` race can fire. A real turn is 2
   * peeks, so 200 is about 50 players' worth of headroom.
   */
  cap = 200;

  override UI_PeekKey(): GameKeyEvent | null {
    if (!this.scripted) return super.UI_PeekKey();
    if (++this.peekCount > this.cap) {
      throw new Error(
        `ScriptedPeekUI served ${this.peekCount} peeks without the turn ending — ` +
          `the play loop is spinning on input that does not end a turn`,
      );
    }
    return { ...ScriptedPeekUI.WAIT_KEY };
  }

  resetCounters(): void {
    this.peekCount = 0;
  }
}

const SEED = 20260903;
/** Enough turns for the player to be alive, fed and on a settled map. */
const SETTLE_TURNS = 12;

let ui: ScriptedPeekUI;
let game: RogueGame;
let map: Map;

/**
 * The order `getNextActorToAct` hands actors out, for the map under test.
 *
 * `null` is a real element, not a gap: the claim is that the sequence *ends* in
 * `null` before `NextMapTurn`, and a recorder that dropped nulls could not say so.
 * `undefined` means "not recording" — the settle phase and the background
 * districts share this method, and counting those would make the sequence
 * unreadable rather than wrong.
 */
let picks: Array<Actor | null> | undefined;

let uninstallProbe: () => void = () => {};

beforeAll(async () => {
  ui = new ScriptedPeekUI();
  const runner = new HeadlessRunner(SEED, ui);

  // A real world, played by the existing harness, so the player is a real actor
  // on a real map rather than a fixture. ~0.6 s for a 1×1 world at 12 turns.
  await runner.run({ worldSize: 1, maxTurns: SETTLE_TURNS, bot: true });
  game = runner.rogueGame;

  game.BotReleaseControl();
  game.botDelayMs = 0;
  ui.scripted = true;

  map = game.session.currentMap!;
  expect(map, "the settled run left the session on a map").toBeTruthy();

  const proto = Rules.prototype as unknown as {
    getNextActorToAct: (m: Map | null, turn: number) => Actor | null;
  };
  const original = proto.getNextActorToAct;
  proto.getNextActorToAct = function (
    this: Rules,
    m: Map | null,
    turn: number,
  ): Actor | null {
    const actor = original.call(this, m, turn);
    if (picks !== undefined && m === map) picks.push(actor);
    return actor;
  };
  uninstallProbe = () => {
    proto.getNextActorToAct = original;
  };
}, 120_000);

afterAll(() => {
  uninstallProbe();
});

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

/**
 * Run `advancePlayMap` until the map's local turn counter moves.
 *
 * The guard counts picks rather than wall-clock because a wedged turn cannot be
 * interrupted from outside — see the header. 2,000 picks is several times the
 * actors on a 1×1 surface district.
 */
async function runOneMapTurn(m: Map): Promise<number> {
  const before = m.localTime.turnCounter;
  let picks = 0;
  do {
    await game.AdvancePlay(m, SimFlags.NOT_SIMULATING);
    if (++picks > 2_000) {
      throw new Error(`map turn did not complete in ${picks} actor picks`);
    }
  } while (m.localTime.turnCounter === before);
  return picks;
}

describe("multiplayer Phase 0 — the round-robin claim", () => {
  it("picks a second player, alternates, and advances the world exactly one turn", async () => {
    const playerA = game.player!;
    expect(playerA, "the settled run left a live player").toBeTruthy();
    expect(playerA.isPlayer, "player A is a PlayerController").toBe(true);

    // ── Add player B, on the same map ──────────────────────────────────────
    const spot = freeTileOn(map);
    expect(spot, "a free tile for player B").not.toBeNull();

    const playerB = new Actor(playerA.model, playerA.faction, "survivor");
    map.placeActor(playerB, spot!);
    playerB.controller = new PlayerController();

    expect(playerB.isPlayer, "player B is a PlayerController too").toBe(true);
    expect(
      map.actors.filter((a) => a.isPlayer).length,
      "exactly two player-controlled actors on the map",
    ).toBe(2);

    // ── One map turn, watched ──────────────────────────────────────────────
    ui.resetCounters();
    picks = [];
    const turnBefore = map.localTime.turnCounter;

    const pickCount = await runOneMapTurn(map);

    const seen = picks!;
    const playerPicks = seen.filter((a): a is Actor => a !== null && a.isPlayer);
    const order = playerPicks.map((a) => (a === playerA ? "A" : "B"));

    // ── Each player acted exactly once ─────────────────────────────────────
    // "Exactly once" is the whole of it: a second pick inside one map turn would
    // mean the first turn did not spend the actor's action points.
    expect(
      order.filter((w) => w === "A").length,
      `player A was picked exactly once (order was ${order.join("")})`,
    ).toBe(1);
    expect(
      order.filter((w) => w === "B").length,
      `player B was picked exactly once (order was ${order.join("")})`,
    ).toBe(1);

    // ── …and they alternated, rather than merely both appearing ────────────
    // A, A, B, B satisfies both counts above. Only the ordering makes this
    // round-robin, which is the word §3 uses.
    expect(
      order[0] !== order[1],
      `the two player picks alternate, so neither was skipped (order was ${order.join("")})`,
    ).toBe(true);

    // ── The sequence terminated, which is what runs NextMapTurn ────────────
    expect(
      seen[seen.length - 1],
      "the pick sequence ended with null, the call that triggers NextMapTurn",
    ).toBeNull();

    // ── The world advanced exactly one turn ────────────────────────────────
    expect(map.localTime.turnCounter - turnBefore, "one map turn, not two").toBe(1);

    // Sanity on the recorder itself: a map full of actors took far more than two
    // picks, so the sequence really is the whole turn and not a stub.
    expect(
      pickCount,
      "the map turn visited every actor with action points, not just the two players",
    ).toBeGreaterThan(2);

    // ── The input seam, recorded rather than asserted ──────────────────────
    // Two players × two peeks (one drain, one read). The count is not the point;
    // the point is that both drew from one `IRogueUI`, which cannot say who is
    // asking. See the header and the second test.
    expect(ui.peekCount, "two peeks per player turn, from one shared UI").toBe(4);
  }, 60_000);

  it("and key isolation is not answerable here — the play loop peeks", () => {
    // Recorded as a finding rather than asserted as a defect.
    //
    // `UI_PeekKey()` takes no argument and is not one of §7's three blocking
    // methods, so there is no way for the engine to ask the UI *whose* key it
    // wants, and no way for a networked UI to answer without already knowing.
    //
    // What §7's "resolved rather than fixed UI" needs is therefore more than it
    // says: `actor.isPlayer ? session.uiFor(actor) : sharedNullUI` gives each
    // player its own object, which is necessary and not sufficient. The *play
    // loop* has to await rather than poll before a per-player UI can mean
    // anything, because a poll cannot suspend on a socket.
    //
    // So Phase 0's third assertion — "neither player's keys reached the other" —
    // is not deferred for want of a test. It is unanswerable against the current
    // `IRogueUI` shape, and finding that out is what Phase 0 was for.
    expect(ui.peekCount, "asserted above; the isolation was not").toBe(4);
  });
});
