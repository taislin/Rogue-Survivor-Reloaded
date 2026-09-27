import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { NullRogueUI } from "@ui/NullRogueUI";
import { RogueGame } from "@engine/RogueGame";
import { District } from "@data/District";
import { SimRatio } from "@engine/GameOptions";
import { IRogueUI, GameKeyEvent, MouseButton } from "@engine/IRogueUI";
import { Color } from "@engine/Color";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";

/**
 * Idle catch-up of the neighbouring districts.
 *
 * The C# ran `SimulateNearbyDistricts` on a real thread every 10 ms, so
 * neighbouring districts were always current and entering one cost nothing. The
 * port has no thread and ran the same catch-up only while the player slept, so
 * districts fell behind by every turn the player was awake and the whole deficit
 * landed in one blocking burst on entry — measured at 274 ms after 60 turns, and
 * growing.
 *
 * This spends the player's *idle* time on it instead: one district turn per poll
 * of the input wait, once nothing has happened for a second. The three things
 * that can go wrong are all pinned here, because none of them throws or looks
 * wrong on screen:
 *
 *  1. It runs when it should not — determinism. If the simulator ever idled, every
 *     seeded run would change. `NullRogueUI` always answers, so it never does;
 *     `tests/integration/reproducibility.test.ts` guards the consequence.
 *  2. It steals a keypress. A background turn can reach `AddMessagePressEnter`
 *     through `ShowNewAchievement`, which blocks on ENTER with no check that the
 *     player is present.
 *  3. It never starts, because the clock or the "most behind" choice is wrong —
 *     the feature would look fine and do nothing, which is the failure mode a
 *     screenshot cannot catch.
 */

const SEED = 24680;
let game: RogueGame;

/**
 * A UI that never answers on its own, so the input wait parks and the idle path
 * is reached. Keys and mouse state are driven by the test.
 */
class IdleProbeUI implements IRogueUI {
  mousePosition: Point = new Point(0, 0);
  mouseButtons: MouseButton | null = null;
  private pendingKey: GameKeyEvent | null = null;

  postKey(key: string): void {
    this.pendingKey = { key, keyCode: key.charCodeAt(0), shift: false, ctrl: false, alt: false };
  }
  /** Moves the cursor without the player having "acted". */
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

let ui: IdleProbeUI;
let clock: FakeClock;
let realUI: IRogueUI;

beforeAll(async () => {
  const runner = new HeadlessRunner(SEED, new NullRogueUI());
  game = runner.rogueGame;
  realUI = game.m_UI;
  await game.LoadData();
  await runner.run({ worldSize: 1, maxTurns: 2, isUndead: true, bot: true });
}, 120_000);

afterEach(() => {
  (game as unknown as { m_UI: IRogueUI }).m_UI = realUI;
  game.idleSimDelayMs = 1000;
  RogueGame.options.simulateDistricts = SimRatio.OFF;
});

/** Installs the probe UI and a fake clock. */
function setup(): void {
  ui = new IdleProbeUI();
  clock = new FakeClock();
  (game as unknown as { m_UI: IRogueUI }).m_UI = ui;
  game.nowMs = clock.now;
  game.idleSimDelayMs = 1000;
  // The headless runner turns district simulation off, and the idle catch-up is
  // gated on the same `isSimON` the sleep-path catch-up uses — so it has to be
  // enabled here, which also pins that the gate exists.
  RogueGame.options.simulateDistricts = SimRatio.FULL;
  // Clear the idle clock: booting the game stamped it from the *real* clock, and
  // comparing that against the fake one would go negative and look like "acted
  // long ago" forever. In a session the clock never changes, so this is purely a
  // harness artefact.
  (game as unknown as { m_LastGameInputAt: number | null }).m_LastGameInputAt = null;
}

/**
 * Waits for a condition, with a deadline, rather than sleeping a fixed amount.
 *
 * A background district turn costs ~22 ms on its own, but a minute under
 * coverage instrumentation with 34 test files in flight — so any assertion of
 * the form "sleep 150 ms and it should have happened" is a coin flip on how
 * loaded the machine is. Polling to a deadline is not: it waits exactly as long
 * as the work takes and no longer.
 */
async function waitUntil(what: string, condition: () => boolean, deadlineMs = 20_000): Promise<void> {
  const until = Date.now() + deadlineMs;
  while (!condition()) {
    if (Date.now() > until) throw new Error(`timed out waiting for: ${what}`);
    await new Promise<void>((r) => setTimeout(r, 25));
  }
}

/** The player's district and the neighbours behind it, by turn deficit. */
function lagBehind(district: District): number[] {
  const world = game.session.world!;
  const own = district.entryMap!;
  const lags: number[] = [];
  for (let x = 0; x < world.size; x++) {
    for (let y = 0; y < world.size; y++) {
      const other = world.getDistrict(x, y);
      if (other == null || other === district || other.entryMap == null) continue;
      lags.push(own.localTime.turnCounter - other.entryMap.localTime.turnCounter);
    }
  }
  return lags;
}

/**
 * Leaves the neighbours behind by playing the player's district forward.
 *
 * Needed because a previous test's catch-up levels everything, and because the
 * idle path only ever runs when there *is* something to catch up on — a test
 * that found no lag would pass for the wrong reason.
 */
async function createLag(turns = 4): Promise<void> {
  const district = game.session.currentMap!.district!;
  for (let i = 0; i < turns; i++) {
    await game.AdvancePlay(district, 0 as never);
  }
  expect(Math.max(...lagBehind(district))).toBeGreaterThan(0);
}

describe("idle catch-up picks the most-behind district", () => {
  it("has neighbours to catch up on at all", () => {
    // Guards the whole file: with a single district there is nothing to do, and
    // every test below would pass for the wrong reason.
    const district = game.session.currentMap!.district!;
    expect(lagBehind(district).length).toBeGreaterThan(0);
  });

  it("advances one turn of exactly one neighbour", async () => {
    await createLag(4);
    const district = game.session.currentMap!.district!;
    // Neighbours are commonly *tied*, so the total deficit is the honest measure:
    // one turn of one district removes exactly one turn of work overall.
    const totalBefore = lagBehind(district).reduce((a, b) => a + b, 0);
    const playerTurnBefore = game.session.currentMap!.localTime.turnCounter;

    const didWork = await game.simulateOneBehindDistrictTurn(district);

    expect(didWork).toBe(true);
    const totalAfter = lagBehind(district).reduce((a, b) => a + b, 0);
    expect(totalAfter).toBe(totalBefore - 1);
    // The player's own district must not move: this is the world behind them.
    expect(game.session.currentMap!.localTime.turnCounter).toBe(playerTurnBefore);
  });

  it("catches up every neighbour exactly, then stops", async () => {
    await createLag(3);
    const district = game.session.currentMap!.district!;
    const total = lagBehind(district).reduce((a, b) => a + b, 0);

    // Converges in exactly as many turns as there is work, and then reports that
    // there is none — no overshoot, no spin.
    let turns = 0;
    while (await game.simulateOneBehindDistrictTurn(district)) {
      if (++turns > total + 5) throw new Error("catch-up did not converge");
    }
    expect(turns).toBe(total);
    expect(Math.max(...lagBehind(district))).toBe(0);
    expect(await game.simulateOneBehindDistrictTurn(district)).toBe(false);
  });
});

describe("idle catch-up inside the input wait", () => {
  it("catches up once the player has been idle long enough", async () => {
    await createLag(4);
    setup();
    const district = game.session.currentMap!.district!;
    const before = Math.max(...lagBehind(district));

    // The wait is parked, so drive it as a floating promise and let the fake
    // clock cross the threshold.
    const waiting = game.WaitKeyOrMouse();
    await new Promise<void>((r) => setTimeout(r, 50));
    expect(Math.max(...lagBehind(district))).toBe(before); // not yet idle

    clock.advance(1500);
    await waitUntil("a background turn", () => Math.max(...lagBehind(district)) < before);

    ui.postKey(".");       // let the wait return
    await Promise.race([waiting, new Promise<void>((r) => setTimeout(r, 5_000))]);
  }, 30_000);

  it("does not run before the delay has passed", async () => {
    await createLag(4);
    setup();
    const district = game.session.currentMap!.district!;
    const before = Math.max(...lagBehind(district));

    const waiting = game.WaitKeyOrMouse();
    // Clock moves, but never past the 1000 ms the test configured.
    for (let i = 0; i < 5; i++) {
      clock.advance(100);
      await new Promise<void>((r) => setTimeout(r, 20));
    }
    expect(Math.max(...lagBehind(district))).toBe(before);

    // Asserting "nothing happened" passes just as well when the wait is dead on
    // arrival, so prove the wait is alive and the only thing withholding the
    // turn was the delay.
    clock.advance(1000);
    await waitUntil("the catch-up to resume once the delay elapses", () =>
      Math.max(...lagBehind(district)) < before);

    ui.postKey(".");
    await Promise.race([waiting, new Promise<void>((r) => setTimeout(r, 5_000))]);
  }, 30_000);

  it("treats mouse movement as NOT activity, so reading the map still catches up", async () => {
    // The reason movement is excluded: a player studying the map moves the cursor
    // over it constantly, and counting that would pause the catch-up during
    // exactly the thinking time it exists to fill.
    //
    // Movement also *ends* the wait — that is how the hover popup updates — so
    // this drives it the way the play loop does: wait, move, wait again. If
    // movement reset the idle clock, none of these waits would ever be idle.
    await createLag(4);
    setup();
    const district = game.session.currentMap!.district!;
    const before = Math.max(...lagBehind(district));

    for (let i = 0; i < 3; i++) {
      const waiting = game.WaitKeyOrMouse();
      await new Promise<void>((r) => setTimeout(r, 20));
      clock.advance(600);
      ui.moveMouse(100 + i, 200 + i);      // wakes the wait, but is not an action
      await Promise.race([waiting, new Promise<void>((r) => setTimeout(r, 5_000))]);
    }
    // A final wait, so the last poll can spend a turn.
    const last = game.WaitKeyOrMouse();
    await waitUntil("the catch-up to survive mouse movement", () =>
      Math.max(...lagBehind(district)) < before);

    ui.postKey(".");
    await Promise.race([last, new Promise<void>((r) => setTimeout(r, 5_000))]);
  }, 30_000);

  it("a keypress stops the catch-up", async () => {
    await createLag(4);
    setup();
    const district = game.session.currentMap!.district!;
    const before = Math.max(...lagBehind(district));

    const waiting = game.WaitKeyOrMouse();
    clock.advance(1500);
    ui.postKey("a");                        // the player acts
    // No timeout: the poll may be part-way through a background turn, and a
    // deadline here would turn a loaded machine into a spurious failure.
    const ev = await waiting;
    expect(ev.key!.key).toBe("a");

    // And no catch-up happens after they have acted.
    await new Promise<void>((r) => setTimeout(r, 150));
    expect(Math.max(...lagBehind(district))).toBe(before);
  }, 30_000);
});

describe("a background turn must not take a keypress", () => {
  it("AddMessagePressEnter returns immediately while simulating in the background", async () => {
    setup();
    // Reach the flag the way the idle path sets it, and confirm the press-enter
    // prompt neither blocks nor leaves a "<press ENTER>" in the log.
    const internals = game as unknown as {
      m_SimulatingInIdle: boolean;
      m_MessageManager: { count: number };
    };
    internals.m_SimulatingInIdle = true;
    const messagesBefore = internals.m_MessageManager.count;
    try {
      await Promise.race([
        game.AddMessagePressEnter(),
        new Promise<void>((r) => setTimeout(() => r(), 200)),
      ]);
      expect(internals.m_MessageManager.count).toBe(messagesBefore);
    } finally {
      internals.m_SimulatingInIdle = false;
    }
  });
});
