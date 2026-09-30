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
 *
 * Extends `NullRogueUI` rather than re-implementing `IRogueUI`, so the parts that
 * are not the point of this file — including the map ⇄ screen conversion — come
 * from the one implementation that has them. A hand-written `implements
 * IRogueUI` breaks on every interface addition and invites a second copy of the
 * conversion arithmetic, which is the exact hazard the move to `IRogueUI` was for.
 */
class IdleProbeUI extends NullRogueUI {
  mousePosition: Point = new Point(0, 0);
  mouseButtons: MouseButton | null = null;
  private pendingKey: GameKeyEvent | null = null;
  /**
   * Text handed to the two string draw calls, in order.
   *
   * Recorded because "the message log is clean" and "the message log is not on
   * screen" are different claims, and only the second one is the bug. The log is
   * read by `MessageManager.draw`, so anything still in it is painted on the next
   * `RedrawPlayScreen` -- which is how a finished simulation ends up still
   * showing its own progress counter.
   */
  readonly drawnText: string[] = [];

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
  UI_DrawStringBold(_c: Color, t: string): void { ui.drawnText.push(t); }
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
 *
 * The default has to cover the *slow* case, not the typical one, because this
 * file is the suite's only wall-clock-sensitive one. It was 20 s while the
 * per-test budgets were 30 s, and a single background turn under load
 * outlasts both — so the deadline fired first and reported a real pass as a
 * failure. 120 s leaves room for the ~1 min turn the comment above measures,
 * plus the second turn some of these tests wait for.
 */
async function waitUntil(what: string, condition: () => boolean, deadlineMs = 120_000): Promise<void> {
  const until = Date.now() + deadlineMs;
  while (!condition()) {
    if (Date.now() > until) throw new Error(`timed out waiting for: ${what}`);
    await new Promise<void>((r) => setTimeout(r, 25));
  }
}

/**
 * Per-test budget for the tests that wait on real background simulation.
 *
 * The reasoning at the `await waiting` sites below is that a deadline there
 * "would turn a loaded machine into a spurious failure" — but the `30_000` that
 * was passed anyway *is* a deadline, and a tighter one than the work needs. The
 * two statements contradicted each other, and the test lost: it passed alone in
 * 2 s and timed out in the full run, which is CI on `ubuntu-latest`. These tests
 * are bounded by this budget rather than by a `Promise.race`, so it has to
 * exceed a loaded background turn.
 */
/**
 * How long a catch-up may take before the test calls it a failure.
 *
 * **Raised from 180s to 600s, and the honest reason is load, not a new slowness.**
 * The file runs in ~5s on its own. It times out at 180s only inside the full
 * parallel suite, and only for the two tests that `await` a real background turn.
 * That was true before `Feature.HelicopterRescue`; the suite has simply grown (99
 * to 101 files) and pushed it over.
 *
 * What `Feature.HelicopterRescue` *does* add is real, though: the civilian arm
 * pathfinds toward the helicopter on the rescue day, once, for every civilian in
 * earshot. That is a faithful port -- `CivilianAI.cs:526-543` has no turn bound
 * either -- so the cost is inherited from the reference rather than introduced
 * here, and the alternative was to diverge from the C# to keep a *test harness*
 * happy. So the budget moves and the cost is recorded, rather than the other way
 * round.
 *
 * The earlier 180s was itself the fix for a 30s timeout that "failed in the full
 * suite while passing alone" -- the same trap one notch tighter. A budget test
 * sized against a loaded machine is a coin toss; 600s is sized against a machine
 * running the whole suite.
 */
const SIM_BUDGET_MS = 600_000;

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
  }, SIM_BUDGET_MS);

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
  }, SIM_BUDGET_MS);

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
  }, SIM_BUDGET_MS);

  it("a keypress stops the catch-up", async () => {
    await createLag(4);
    setup();
    const district = game.session.currentMap!.district!;
    const before = Math.max(...lagBehind(district));

    const waiting = game.WaitKeyOrMouse();
    clock.advance(1500);
    ui.postKey("a");                        // the player acts
    // The poll may be part-way through a background turn, so this cannot be
    // bounded by a short `Promise.race` — a deadline here really would turn a
    // loaded machine into a spurious failure. What bounds it instead is
    // `SIM_BUDGET_MS`, which is sized against a loaded background turn rather
    // than against this one. (The previous `30_000` was the deadline in
    // disguise, and it was shorter than the work, so the test failed in the
    // full suite while passing alone.)
    const ev = await waiting;
    expect(ev.key!.key).toBe("a");

    // And no catch-up happens after they have acted. This window is the only
    // thing that makes the assertion mean anything, so it is deliberately longer
    // than a background turn would take to *start*: a catch-up that leaked past
    // the keypress would fire on the very next poll.
    await new Promise<void>((r) => setTimeout(r, 500));
    expect(Math.max(...lagBehind(district))).toBe(before);
  }, SIM_BUDGET_MS);
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

/** A neighbouring district that the player's own district has out-run. */
function laggingNeighbour(): District | null {
  const world = game.session.world!;
  const own = game.session.currentMap!.district!;
  const ownTurn = own.entryMap!.localTime.turnCounter;
  for (let x = 0; x < world.size; x++) {
    for (let y = 0; y < world.size; y++) {
      const other = world.getDistrict(x, y);
      if (other == null || other === own || other.entryMap == null) continue;
      if (other.entryMap.localTime.turnCounter < ownTurn) return other;
    }
  }
  return null;
}

/**
 * The other site of the same guard: crossing a district border.
 *
 * The idle catch-up above already sets `m_SimulatingInIdle`, and the block
 * above it sets the flag by hand. Neither proves the flag is set by the code that
 * runs at a border stair — and that is the one that was missing, so the honest
 * test drives `BeforePlayerEnterDistrict` itself and watches the flag from
 * inside the loop.
 *
 * The symptom it reproduces: the catch-up simulates up to `catchupTo` turns of a
 * district the player is not in, with the view deliberately cleared. A turn that
 * awards an achievement calls `ShowNewAchievement` → `AddMessagePressEnter`,
 * which blocks on ENTER. So the game stopped mid-simulation, on a screen showing
 * a progress counter, and ate the keypress the player was about to make.
 */
describe("a border-stair catch-up must not take a keypress", () => {
  it("holds the simulating-away flag for every turn it simulates", async () => {
    await createLag(1);
    setup();
    const target = laggingNeighbour();
    if (target === null) throw new Error("no lagging neighbour to test with");

    const internals = game as unknown as {
      m_SimulatingInIdle: boolean;
      m_MessageManager: { count: number };
      SimulateDistrict: (d: District) => Promise<void>;
    };
    const real = internals.SimulateDistrict.bind(game);
    const observed: boolean[] = [];
    let pressEnter: "returned" | "blocked" = "returned";

    internals.SimulateDistrict = async (d: District) => {
      observed.push(internals.m_SimulatingInIdle);

      // Stand in for `ShowNewAchievement`, which is the documented route from a
      // background district turn to `AddMessagePressEnter`. `IdleProbeUI`'s
      // `UI_WaitKey` never resolves on its own, so an unguarded prompt adds a
      // "<press ENTER>" and parks: exactly the bug, without needing to earn an
      // achievement to get there.
      const before = internals.m_MessageManager.count;
      await Promise.race([
        game.AddMessagePressEnter(),
        new Promise<void>((r) => setTimeout(() => r(), 150)),
      ]);
      if (internals.m_MessageManager.count !== before) pressEnter = "blocked";

      await real(d);
    };

    try {
      await game.BeforePlayerEnterDistrict(target);
    } finally {
      internals.SimulateDistrict = real;
    }

    // Without the flag this is the assertion that fails: the catch-up ran, and
    // every turn of it ran with the flag down.
    expect(observed.length, "the catch-up simulated no turns at all").toBeGreaterThan(0);
    expect(
      observed.every(Boolean),
      "a turn of the border catch-up ran without the simulating-away flag",
    ).toBe(true);
    expect(pressEnter, "a prompt took a keypress mid-catch-up").toBe("returned");
    // And it must be handed back, or the player is un-notifiable for the rest of
    // the session — a bug that would be far harder to notice than this one.
    expect(internals.m_SimulatingInIdle, "the flag was left set after the catch-up").toBe(false);
    // The progress text has to go too. It is the other half of "it says processing
    // even when done": the loop paints "Simulating district, please wait N/M" as it
    // goes, and with nothing repainting afterwards the last of those frames is what
    // the player is left looking at. Asserted on what a redraw *draws*, not on the
    // log's contents, because the log is not the screen.
    ui.drawnText.length = 0;
    game.RedrawPlayScreen();
    const stale = ui.drawnText.filter((t) => /Simulating district|keep ESC|Turns per second/.test(t));
    expect(
      stale,
      `the finished simulation is still painting its own progress: ${JSON.stringify(stale.slice(0, 3))}`,
    ).toEqual([]);
  }, SIM_BUDGET_MS);
});

/**
 * A district switch must leave the player *looking at* the new district.
 *
 * The sibling test above covers the keypress the catch-up must not steal. This
 * covers the two things that were left on screen afterwards, both of which the
 * player sees as "it did not work":
 *
 *  1. **The progress text stayed.** The catch-up clears the log and paints
 *     "Simulating district, please wait N/M..." as it goes, and C# removes only
 *     the trailing "<keep ESC>" line afterwards. Nothing repainted after that, so
 *     the last progress frame was still on the canvas -- reading as a simulation
 *     that had stalled rather than one that had finished.
 *  2. **The map came up black.** `BeforePlayerEnterDistrict` calls `clearView` on
 *     both the map being left and the one being entered, deliberately, so the
 *     simulation shows the player nothing. Nothing rebuilt the destination's
 *     `isInView` afterwards. `setViewAndMarkVisited` is the only thing that sets
 *     it -- its own comment calls it "what makes actors, items and corpses
 *     drawable at all" -- and it is reached only from `UpdatePlayerFOV`. So the
 *     player arrived in a district with nothing on it until a later keypress
 *     happened to run an FOV update, and needed a second one to see anything.
 *
 * Driven through `AfterPlayerEnterDistrict`, which is the hook the move already
 * calls and the first point at which the player is genuinely *on* the new map.
 */
describe("a district switch must leave the player looking at the new district", () => {
  /** How many tiles of the current map are marked visible. */
  function visibleTiles(): number {
    const map = game.session.currentMap!;
    let n = 0;
    for (let x = 0; x < map.width; x++) {
      for (let y = 0; y < map.height; y++) {
        if (map.getTileAt(x, y)?.isInView === true) n++;
      }
    }
    return n;
  }

  /** The view torn down exactly as the catch-up tears it down. */
  function clearedView(): void {
    game.session.currentMap!.clearView();
  }

  it("rebuilds the view the catch-up tore down", () => {
    clearedView();
    // Guards the fixture: with zero visible tiles before the call, any non-zero
    // count after can only have come from the FOV rebuild.
    expect(visibleTiles(), "the fixture did not actually clear the view").toBe(0);

    game.AfterPlayerEnterDistrict();

    expect(visibleTiles(), "the district switch left the map with no visible tiles").toBeGreaterThan(0);
  });

  it("leaves the visited set alone, so the district is not forgotten", () => {
    // `clearView` only drops `isInView` and keeps `isVisited`, which is what makes
    // this safe. If a future change to the catch-up reached for `setAllAsUnvisited`
    // instead, the player would arrive in a district they had already explored and
    // it would render as unmapped -- a much worse bug than a black screen, and one
    // that only shows up after exploring.
    clearedView();
    const map = game.session.currentMap!;
    const at = game.player!.location.position;
    const tile = map.getTileAt(at.x, at.y);
    expect(tile, "the player's own tile does not exist").not.toBeNull();
    tile!.isVisited = true;

    game.AfterPlayerEnterDistrict();

    expect(
      map.getTileAt(at.x, at.y)!.isVisited,
      "the district switch forgot a tile the player had already explored",
    ).toBe(true);
  });

  it("redraws, so the canvas is not left on the simulation's last frame", () => {
    // Ordering, and the reason this lives in `AfterPlayerEnterDistrict` rather
    // than at the end of the catch-up: the catch-up runs *before* the move, so a
    // redraw there would paint the map the player is leaving.
    const internal = game as unknown as { RedrawPlayScreen(): void };
    let redraws = 0;
    const real = internal.RedrawPlayScreen.bind(game);
    internal.RedrawPlayScreen = () => {
      redraws++;
      real();
    };
    try {
      game.AfterPlayerEnterDistrict();
    } finally {
      internal.RedrawPlayScreen = real;
    }
    expect(redraws, "the district switch never repainted the screen").toBeGreaterThan(0);
  });

  it("still restarts the sim thread, which is what it was for", () => {
    // The original body, guarded. The rebuild was added to a method that already
    // did something, and a fix that quietly stopped starting background
    // simulation would be invisible in a short test and very visible in a long game.
    const original = RogueGame.options.simulateDistricts;
    RogueGame.options.simulateDistricts = SimRatio.FULL;
    try {
      expect(() => game.AfterPlayerEnterDistrict()).not.toThrow();
    } finally {
      RogueGame.options.simulateDistricts = original;
    }
  });
});
