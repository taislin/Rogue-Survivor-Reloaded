import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { NullRogueUI } from "@ui/NullRogueUI";
import { RogueGame } from "@engine/RogueGame";
import {
  GameOptions,
  IdleAdvance,
  OptionIDs,
  idleAdvanceMs,
} from "@engine/GameOptions";
import { GameMode } from "@engine/Session";
import { IRogueUI, GameKeyEvent, MouseButton } from "@engine/IRogueUI";
import { Color } from "@engine/Color";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";

/**
 * Idle auto-advance: the game takes a turn for a player who does nothing.
 *
 * The option exists because standing still in a turn-based survival game is a
 * death sentence, and a player who walks away from the keyboard has no way to
 * say so. It is a small change to the input wait, so the thing worth testing is
 * not "does it tick" — that is visible in one play session — but the four things
 * that would be *quietly* wrong. None of them throws; each would look like the
 * feature working.
 *
 *  1. It never fires. A clock that is compared but never satisfied looks exactly
 *     like a game that is simply not idle.
 *  2. It fires when it should not — mid-action, or before the interval. If a
 *     keypress loses a race with the timeout, the player performs an action they
 *     did not choose, which is worse than the problem being solved.
 *  3. It fires in a *targeting* mode. `WaitKeyOrMouse` has seven callers and six
 *     of them ask "which tile?". A timeout in those would raise walls and issue
 *     orders at a tile the player never looked at.
 *  4. It changes a seeded run. The headless simulator must be untouched, or
 *     `integration/reproducibility.test.ts` is asserting nothing.
 *
 * The harness is the one from `idle-district-sim.test.ts`, for the same reason
 * that file uses it: a clock the test drives, so "idle" is a decision rather
 * than a wait, and a UI that parks the input wait so the timeout path is
 * reachable at all.
 *
 * Every wait started here is *drained* before the test ends — see `released`.
 * An abandoned `HandlePlayerActor` keeps polling the probe UI, and the next
 * test's keypress is then consumed by the previous test's leftover turn. That
 * does not fail loudly; it hangs, because the next wait never sees a key.
 */

const SEED = 13579;
let game: RogueGame;
let realUI: IRogueUI;
let realNowMs: () => number;

/**
 * A UI that never answers on its own, so the input wait parks and the timeout
 * path is reached. Keys and mouse state are driven by the test.
 *
 * Extends `NullRogueUI` rather than re-implementing `IRogueUI` — see the note on
 * `IdleProbeUI` in `idle-district-sim.test.ts`. The parts that are not the point
 * of this file, including the map ⇄ screen conversion, come from the one
 * implementation that has them.
 */
class AutoAdvanceProbeUI extends NullRogueUI {
  mousePosition: Point = new Point(0, 0);
  mouseButtons: MouseButton | null = null;
  private pendingKey: GameKeyEvent | null = null;

  postKey(key: string): void {
    this.pendingKey = { key, keyCode: key.charCodeAt(0), shift: false, ctrl: false, alt: false };
  }
  moveMouse(x: number, y: number): void { this.mousePosition = new Point(x, y); }

  UI_WaitKey(): Promise<GameKeyEvent> {
    const k = this.pendingKey;
    if (k !== null) { this.pendingKey = null; return Promise.resolve(k); }
    return new Promise<GameKeyEvent>(() => {});
  }
  UI_PeekKey(): GameKeyEvent | null { const k = this.pendingKey; this.pendingKey = null; return k; }
  UI_PostKey(e: GameKeyEvent): void { this.postKey(e.key); }
  UI_GetMousePosition(): Point { return this.mousePosition; }
  UI_PeekMouseButtons(): MouseButton | null {
    const b = this.mouseButtons;
    this.mouseButtons = null;
    return b;
  }
  UI_PostMouseButtons(b: MouseButton): void { this.mouseButtons = b === MouseButton.None ? null : b; }
  async UI_PreloadImages(_i: string[], p?: (l: number, t: number) => void): Promise<void> { p?.(0, 0); }
  UI_Repaint(): void {}
  UI_Clear(_c: Color): void {}
  async UI_Wait(_m: number): Promise<void> { await Promise.resolve(); }
  UI_DrawImage(): void {}
  UI_DrawImageTinted(): void {}
  UI_DrawImageTransform(): void {}
  UI_DrawGrayLevelImage(): void {}
  UI_DrawTransparentImage(): void {}
  UI_DrawPoint(): void {}
  UI_DrawLine(): void {}
  UI_DrawRect(): void {}
  UI_FillRect(): void {}
  UI_DrawString(): void {}
  UI_DrawStringBold(): void {}
  UI_DrawStringLarge(): void {}
  UI_DrawStringBoldLarge(): void {}
  UI_DrawPopup(): void {}
  UI_DrawPopupTitle(): void {}
  UI_DrawPopupTitleColors(): void {}
  UI_ClearMinimap(): void {}
  UI_SetMinimapColor(): void {}
  UI_DrawMinimap(): void {}
  UI_GetCanvasScaleX(): number { return 1; }
  UI_GetCanvasScaleY(): number { return 1; }
  UI_BeginScaledDraw(_s: number, _r?: Rect): void {}
  UI_EndScaledDraw(): void {}
  UI_SaveScreenshot(): string { return ""; }
  UI_ScreenshotExtension(): string { return "png"; }
  UI_DoQuit(): void {}
}

/** A clock the test drives, so "idle" is a decision rather than a wait. */
class FakeClock {
  private t = 0;
  now = (): number => this.t;
  advance(ms: number): void { this.t += ms; }
}

let ui: AutoAdvanceProbeUI;
let clock: FakeClock;
/**
 * The turn currently in flight, drained by `afterEach`.
 *
 * Without this, a test that fails on an assertion never reaches its own `finish`,
 * and the abandoned `HandlePlayerActor` goes on polling the probe UI. The next
 * test's keypress is then consumed by the *previous* test's turn, so that one
 * hangs too — and the whole file stops reporting, taking the real failure with
 * it. A failing assertion here has to stay a failing assertion.
 */
let inFlight: Turn | null = null;

beforeAll(async () => {
  const runner = new HeadlessRunner(SEED, new NullRogueUI());
  game = runner.rogueGame;
  realUI = game.m_UI;
  realNowMs = game.nowMs;
  await game.LoadData();
  await runner.run({ worldSize: 1, maxTurns: 2, isUndead: true, bot: true });
  // The headless run leaves the survivor AI-controlled. `HandlePlayerActor`
  // takes the bot branch first thing, which never reaches the input wait, so the
  // timeout would be unreachable while that is set — and every test below would
  // pass for the wrong reason.
  game.BotReleaseControl();
}, 120_000);

afterEach(async () => {
  if (inFlight !== null && !inFlight.done) {
    ui.postKey(".");
    await inFlight.finish().catch(() => undefined);
  }
  inFlight = null;
  (game as unknown as { m_UI: IRogueUI }).m_UI = realUI;
  game.nowMs = realNowMs;
  game.m_IsPlayerLongWait = false;
  RogueGame.options.idleAutoAdvance = IdleAdvance.OFF;
  RogueGame.options.isAdvisorEnabled = false;
});

/**
 * Installs the probe UI and a fake clock, and turns the option on.
 *
 * The idle clock is cleared because booting the game stamped it from the *real*
 * clock; comparing that against a fake one goes negative and reads as "acted
 * long ago" forever. In a session the clock never changes, so this is purely a
 * harness artefact.
 */
function setup(step: IdleAdvance = IdleAdvance.TWO_SECONDS): void {
  ui = new AutoAdvanceProbeUI();
  clock = new FakeClock();
  (game as unknown as { m_UI: IRogueUI }).m_UI = ui;
  game.nowMs = clock.now;
  RogueGame.options.idleAutoAdvance = step;
  (game as unknown as { m_LastGameInputAt: number | null }).m_LastGameInputAt = null;
}

/** A pending turn, plus whether it has finished. */
interface Turn {
  readonly done: boolean;
  readonly error: unknown;
  spent: () => boolean;
  finish: () => Promise<void>;
}

/**
 * Starts the player's turn and hands back a way to end it without abandoning it.
 *
 * `finish` presses `.` if the turn is still parked, which releases the input
 * wait, and then awaits it. That matters: a `HandlePlayerActor` left unresolved
 * at the end of a test goes on polling the probe UI and eats the next test's
 * keypress, which presents as a hang rather than as a failure.
 */
function startTurn(step: IdleAdvance = IdleAdvance.TWO_SECONDS): Turn {
  // Unconditionally, not only when an argument is given. Skipping it leaves the
  // game's real `NullRogueUI` in place, whose `UI_PeekKey` always answers — so
  // the wait returns instantly, nothing is bound to the keys it offers, and the
  // play loop spins on them. That is an unbounded loop rather than a failed
  // assertion, so it takes the whole run down instead of one test.
  setup(step);
  const player = game.player!;
  const before = player.actionPoints;
  let done = false;
  let error: unknown = null;
  // The rejection is caught rather than left to escape. This suite runs under
  // Node's default `--unhandled-rejections=throw`, so an uncaught one takes the
  // vitest worker down — which presents as the whole file hanging, with the
  // error that actually caused it nowhere in the output. See `Diagnostics`.
  const promise = game
    .HandlePlayerActor(player)
    .then(() => { done = true; })
    .catch((e: unknown) => { error = e; done = true; });
  const turn: Turn = {
    get done() { return done; },
    get error() { return error; },
    spent: () => player.actionPoints < before,
    finish: async () => {
      if (!done) ui.postKey(".");
      await promise;
      if (error !== null) throw error;
    },
  };
  inFlight = turn;
  return turn;
}

/** Lets `n` event-loop turns pass, so a parked wait can poll a few times. */
async function tick(n = 6): Promise<void> {
  for (let i = 0; i < n; i++) await new Promise<void>((r) => setTimeout(r, 1));
}

describe("the idle auto-advance option", () => {
  it("is off by default", () => {
    // A turn-based game that advances itself is a different game, and this has to
    // be something a player opts into rather than something they discover.
    const fresh = new GameOptions();
    expect(fresh.idleAutoAdvance).toBe(IdleAdvance.OFF);
    expect(idleAdvanceMs(IdleAdvance.OFF)).toBe(0);
  });

  it("maps every step to the milliseconds the engine compares", () => {
    // Both directions, because the two lists are separate: a step with no
    // millisecond would silently read as "off", and a millisecond with no step
    // would be unreachable. `IdleAdvance._COUNT` is the options screen's
    // sentinel and must not resolve to a usable timeout.
    //
    // The loop starts *after* OFF, which is `_FIRST` and legitimately zero —
    // "off" is the absence of a timeout, not a timeout of nothing. It is checked
    // on its own below.
    // `<= _LAST`, not `< _LAST`: `_LAST` *is* the final usable step, and `_COUNT`
    // is the sentinel past it. A `<` bound here quietly skips the last step —
    // which is how this file ended up not checking the 30s one for a while.
    for (let i = IdleAdvance.OFF + 1; i <= IdleAdvance._LAST; i++) {
      const step = i as IdleAdvance;
      expect(idleAdvanceMs(step), `step ${step} has no timeout`).toBeGreaterThan(0);
      expect(GameOptions.idleAdvanceName(step), `step ${step} has no name`).not.toBe("OFF");
    }
    expect(idleAdvanceMs(IdleAdvance.OFF)).toBe(0);
    expect(GameOptions.idleAdvanceName(IdleAdvance.OFF)).toBe("OFF");
    expect(idleAdvanceMs(IdleAdvance._COUNT)).toBe(0);
  });

  it("keeps every usable step far above the cost of a turn", () => {
    // The documented cost of one district turn is ~22ms, and the redraw has to
    // fit in there too. A step close to that cannot be honoured: the game would
    // fall behind its own clock and the "idle" player would spend more time in
    // the loop than in the game.
    //
    // The bound is deliberately loose — roughly 20x the measured turn — because
    // 22ms was measured on a 1x1 world and a larger city costs more. This is a
    // floor on the *design*, not a measurement of the worst case, and the fastest
    // step is the one to watch on a big map rather than a reason to remove it.
    for (let i = IdleAdvance.OFF + 1; i <= IdleAdvance._LAST; i++) {
      expect(idleAdvanceMs(i as IdleAdvance)).toBeGreaterThanOrEqual(1000);
    }
    expect(idleAdvanceMs(IdleAdvance.ONE_SECOND)).toBe(1000);
  });

  it("steps in ascending order, off being the slowest of all", () => {
    // The options screen walks the enum with `+ 1`, so the order of the enum *is*
    // the order on screen. A step inserted out of sequence would be reachable
    // but read as a bug — "1 s" appearing after "30 s".
    const usable = [] as number[];
    for (let i = IdleAdvance.OFF + 1; i <= IdleAdvance._LAST; i++) {
      usable.push(idleAdvanceMs(i as IdleAdvance));
    }
    expect(usable).toEqual([...usable].sort((a, b) => a - b));
    expect(idleAdvanceMs(IdleAdvance.OFF)).toBe(0);
    expect(usable).toEqual([1000, 2000, 5000, 10000, 30000]);
  });

  it("has the three strings the options screen needs", () => {
    // Not redundant with `options-coverage.test.ts`, which only checks these are
    // non-empty. This is here because the value column is the only place a
    // player sees what the numbers mean, and a step that rendered as "2" rather
    // than "2 s" would be a units bug no other test could see.
    const options = new GameOptions();
    expect(GameOptions.optionName(OptionIDs.GAME_IDLE_AUTO_ADVANCE)).toContain("Auto-Advance");
    expect(GameOptions.describe(OptionIDs.GAME_IDLE_AUTO_ADVANCE)).toContain("turn");

    options.idleAutoAdvance = IdleAdvance.TEN_SECONDS;
    expect(options.describeValue(GameMode.GM_STANDARD, OptionIDs.GAME_IDLE_AUTO_ADVANCE)).toContain("10 s");
    options.idleAutoAdvance = IdleAdvance.OFF;
    expect(options.describeValue(GameMode.GM_STANDARD, OptionIDs.GAME_IDLE_AUTO_ADVANCE)).toContain(
      "default OFF",
    );
  });

  it("survives a clone, which is how the options screen keeps its undo", () => {
    // The option is a plain `m_` field, and `GameOptions.save`/`load`/`copyFrom`
    // all walk that prefix generically. This is here because "it is just a field"
    // is exactly the kind of thing that is true until someone writes an explicit
    // serializer, and `clone` is what the options screen presses ESC with.
    const src = new GameOptions();
    src.idleAutoAdvance = IdleAdvance.FIVE_SECONDS;
    expect(src.clone().idleAutoAdvance).toBe(IdleAdvance.FIVE_SECONDS);
  });
});

describe("the input wait honours its timeout", () => {
  it("parks forever when not given a timeout", async () => {
    // The default, and the whole reason the timeout is a parameter: this is what
    // the six targeting modes get, and it must be indistinguishable from before.
    setup();
    let done = false;
    const wait = game.WaitKeyOrMouse().then((ev) => { done = true; return ev; });
    clock.advance(600_000);
    await tick();
    expect(done, "the wait ended without being given a timeout").toBe(false);
    ui.postKey(".");
    await wait;
  });

  it("gives up once the interval has elapsed", async () => {
    setup();
    // The clock is advanced *after* the wait starts, never before. `setup` clears
    // `m_LastGameInputAt`, and `WaitKeyOrMouse` stamps it with `nowMs()` on entry
    // when it is null — so a clock advanced beforehand is measuring from itself
    // and the wait never times out. That hangs rather than fails, because the
    // wait is waiting for input that this test is not going to send.
    const wait = game.WaitKeyOrMouse(2000);
    clock.advance(2000);
    const ev = await wait;
    expect(ev.timedOut).toBe(true);
  });

  it("does not give up one millisecond early", async () => {
    setup();
    let done = false;
    const wait = game.WaitKeyOrMouse(2000).then((ev) => { done = true; return ev; });
    clock.advance(1999);
    await tick();
    expect(done, "timed out one millisecond early").toBe(false);
    clock.advance(1);
    await wait;
  });

  it("reports a timeout as a timeout, not as a keypress", async () => {
    // The distinction the `timedOut` flag exists for: a fabricated `.` would make
    // an unattended turn indistinguishable from a deliberate one downstream.
    setup();
    const wait = game.WaitKeyOrMouse(2000);
    clock.advance(5000);
    const ev = await wait;
    expect(ev.key).toBeNull();
    expect(ev.timedOut).toBe(true);
  });

  it("a keypress wins the race and is not a timeout", async () => {
    setup();
    // Posted *after* the wait has started, not before. `WaitKeyOrMouse` opens by
    // draining the key queue — the "consume keys to avoid repeats" line — so a key
    // that arrives first is thrown away by that drain and the wait then parks,
    // correctly, until the timeout it was never going to be told about. A test
    // that posts too early does not fail; it waits for a clock nobody advances.
    const wait = game.WaitKeyOrMouse(2000);
    await tick();
    ui.postKey(".");
    const ev = await wait;
    expect(ev.key?.key).toBe(".");
    expect(ev.timedOut).toBe(false);
  });

  it("moving the mouse is not activity, and does not postpone the timeout", async () => {
    // Matches the existing rule for the district catch-up: a player reading the
    // map moves the cursor constantly, and counting it would starve the feature
    // during exactly the thinking time it exists to fill.
    //
    // The move *does* wake the wait — it returns so the caller can redraw the
    // hover state — so this is two waits. The point is that the second one is
    // measured from the first wake rather than restarted, and so the mouse never
    // pushed the deadline out. If moving the cursor reset the clock, the second
    // wait would need a fresh full interval every time the mouse twitched.
    setup();
    const first = game.WaitKeyOrMouse(2000);
    clock.advance(1500);
    ui.moveMouse(10, 10);
    const woken = await first;
    expect(woken.timedOut, "the mouse move did not wake the wait at all").toBe(false);

    const second = game.WaitKeyOrMouse(2000);
    clock.advance(600);
    const later = await second;
    expect(later.timedOut, "the cursor move postponed the deadline").toBe(true);
  });
});

describe("the play loop takes the turn", () => {
  it("waits for the player when the option is off", async () => {
    // The default, and the regression this feature could have caused: with the
    // option off, an idle player parks indefinitely.
    const turn = startTurn(IdleAdvance.OFF);
    clock.advance(600_000);
    await tick();
    expect(turn.done, "the turn ended with the option off").toBe(false);
    expect(turn.spent()).toBe(false);
    await turn.finish();
  });

  it("spends the turn when the player does nothing", async () => {
    const turn = startTurn();
    clock.advance(1000);
    await tick();
    expect(turn.spent(), "acted before the interval elapsed").toBe(false);
    clock.advance(1001);
    await tick();
    // The turn must resolve *here*, with nothing pressed. Asserting only that the
    // action points were spent would pass just as well if `finish` had supplied
    // a `.`, so the feature could be deleted and this test would still be green.
    expect(turn.done, "the turn did not resolve on its own").toBe(true);
    expect(turn.spent()).toBe(true);
    await turn.finish();
  });

  it("honours the fastest step, one second", async () => {
    // The step the option was extended for, so it gets the same treatment as the
    // others rather than being assumed to work by being present in the enum: a
    // step added to `IDLE_AUTO_ADVANCE_MS` but not to the loop the engine reads
    // would resolve to 0 — that is, silently to "off" — and this is the only
    // thing here that would notice.
    const turn = startTurn(IdleAdvance.ONE_SECOND);
    clock.advance(999);
    await tick();
    expect(turn.done, "acted before a second had passed").toBe(false);
    clock.advance(1);
    await tick();
    expect(turn.done, "never acted after a second").toBe(true);
    expect(turn.spent()).toBe(true);
    await turn.finish();
  });

  it("does not take the turn one millisecond early", async () => {
    const turn = startTurn(IdleAdvance.FIVE_SECONDS);
    clock.advance(4999);
    await tick();
    expect(turn.spent(), "acted before the interval elapsed").toBe(false);
    expect(turn.done).toBe(false);
    clock.advance(1);
    await tick();
    expect(turn.done, "never took the turn").toBe(true);
    await turn.finish();
  });

  it("leaves the upkeep below the loop done", async () => {
    // The upkeep below the play loop is reached by `continue`, not `return`. A
    // `return` would skip it and leave the map drawn against a stale field of
    // view — which presents as a rendering bug rather than a timing bug, so no
    // test watching only the turn counter would find it.
    const turn = startTurn();
    clock.advance(2001);
    await tick();
    expect(turn.done).toBe(true);
    expect(game.session.lastTurnPlayerActed).toBe(game.session.worldTime.turnCounter);
    await turn.finish();
  });

  it("does not take the turn while a hint is on screen", async () => {
    // A hint is marked as given the moment it is displayed, so a turn taken here
    // would tear it down unread and it would not come back.
    //
    // What it must not do instead is fall through to the input dispatch with no
    // key and no click: there is nothing there to act on, so the turn would
    // neither end nor progress, and the timeout would fire again on the next
    // interval. So the assertion is that the turn is still open *and* the hint is
    // still pending, and then that closing the hint lets the next timeout land.
    const turn = startTurn();
    // The overlay is nulled so the advisor's own teardown path does not clear
    // the pending hint first — that path only runs when an overlay exists.
    (game as unknown as { m_HintAvailableOverlay: unknown }).m_HintAvailableOverlay = null;
    (game as unknown as { m_AdvisorHintPending: number }).m_AdvisorHintPending = 3;

    clock.advance(60_000);
    await tick();
    expect(turn.done, "took a turn with a hint on screen").toBe(false);
    expect(turn.spent()).toBe(false);
    expect((game as unknown as { m_AdvisorHintPending: number }).m_AdvisorHintPending).toBe(3);

    // The timeout re-based its clock rather than left it satisfied, so closing
    // the hint is not enough — a fresh interval has to pass too. This is the
    // difference between "the game is waiting" and "the game is spinning": a
    // stale clock would make every subsequent poll time out immediately, and the
    // turn would redraw as fast as the machine can draw without ever progressing.
    (game as unknown as { m_AdvisorHintPending: number }).m_AdvisorHintPending = -1;
    await tick();
    expect(turn.spent(), "acted immediately on the hint closing").toBe(false);

    clock.advance(2001);
    await tick();
    expect(turn.done, "never took the turn after the hint closed").toBe(true);
    expect(turn.spent()).toBe(true);
    await turn.finish();
  });
});

describe("the option does not reach the targeting modes", () => {
  it("passes a timeout to exactly one caller", () => {
    // The structural guarantee, asserted on the source rather than through
    // behaviour. `WaitKeyOrMouse` has seven callers and six of them mean "which
    // tile?"; a timeout reaching those would raise walls and issue orders at a
    // tile the player never looked at. Driving a real barricade and checking
    // nothing was built is possible but fragile, and this is the property that
    // actually matters.
    const src = readFileSync(
      fileURLToPath(new URL("../src/engine/RogueGame.ts", import.meta.url)),
      "utf8",
    );
    const calls = src.match(/this\.WaitKeyOrMouse\([^)]*\)/g) ?? [];
    const withArg = calls.filter((c) => !c.endsWith("()"));
    expect(calls.length, "the call count changed — re-read this test").toBe(7);
    expect(withArg, "the timeout must be passed from one caller only").toHaveLength(1);
    expect(withArg[0]).toContain("idleAdvanceMs");
  });
});

describe("determinism", () => {
  it("leaves the headless simulator alone", async () => {
    // The strongest form: the whole sim, run headless with no input, must produce
    // the same metrics as before the option existed. If the timeout could fire
    // here, a seeded run would depend on wall-clock and
    // `integration/reproducibility.test.ts` would be asserting nothing.
    const seed = SEED + 1;
    const a = await new HeadlessRunner(seed, new NullRogueUI()).run({
      worldSize: 1, maxTurns: 12, isUndead: true, bot: true,
    });
    const b = await new HeadlessRunner(seed, new NullRogueUI()).run({
      worldSize: 1, maxTurns: 12, isUndead: true, bot: true,
    });

    expect(a.error).toBeUndefined();
    expect(b.error).toBeUndefined();
    expect(b.finalTurn).toBe(a.finalTurn);
    expect(b.playerKills).toBe(a.playerKills);
    expect(b.playerAlive).toBe(a.playerAlive);
  });
});
