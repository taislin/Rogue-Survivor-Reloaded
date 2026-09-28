import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { NullRogueUI } from "@ui/NullRogueUI";
import { RogueGame } from "@engine/RogueGame";
import { Direction } from "@engine/Direction";
import { PlayerCommand } from "@engine/PlayerCommand";
import { Keybindings } from "@engine/Keybindings";
import { SimRatio } from "@engine/GameOptions";
import { GameMode } from "@engine/Session";
import {
  remapForView,
  resolveMoveDirection,
  turnFacing,
} from "@engine/firstperson/Controls";
import { DEFAULT_VIEW_MODE } from "@engine/firstperson/Types";

/**
 * The first-person control scheme, tested *before* there is a first-person
 * renderer.
 *
 * That ordering is the point. The scheme's hard part is not the picture, it is
 * that left and right stop meaning west and east — and that is a change to what
 * keys do in a 26 000-line game loop, which is exactly the kind of thing a
 * renderer change can hide. Testing it here, with rendering still top-down, means
 * the control scheme is verified by the one harness that can actually run the
 * game: the headless simulator. By the time the pixels exist, the controls are
 * already pinned.
 *
 * Everything below is a pure function or a pure relationship, so no test in this
 * file needs a browser, a canvas, or a world.
 */

describe("the key remap", () => {
  const TOP_DOWN: readonly PlayerCommand[] = [
    PlayerCommand.MOVE_N, PlayerCommand.MOVE_NE, PlayerCommand.MOVE_E, PlayerCommand.MOVE_SE,
    PlayerCommand.MOVE_S, PlayerCommand.MOVE_SW, PlayerCommand.MOVE_W, PlayerCommand.MOVE_NW,
  ];

  it("changes nothing at all in the top-down view", () => {
    // The whole port's default, and the one thing that must not move. A remap that
    // leaked into top-down would change what every key does in the game everyone
    // plays, and no renderer would show it.
    for (const command of TOP_DOWN) {
      expect(remapForView(command, DEFAULT_VIEW_MODE)).toBe(command);
    }
    // Including the look commands, which have no top-down meaning.
    expect(remapForView(PlayerCommand.LOOK_LEFT, DEFAULT_VIEW_MODE)).toBe(PlayerCommand.LOOK_LEFT);
  });

  it("turns instead of strafing in the first-person view", () => {
    const view = "first-person" as const;
    expect(remapForView(PlayerCommand.MOVE_W, view)).toBe(PlayerCommand.LOOK_LEFT);
    expect(remapForView(PlayerCommand.MOVE_E, view)).toBe(PlayerCommand.LOOK_RIGHT);
    // Up and down still walk — they are the only two that do.
    expect(remapForView(PlayerCommand.MOVE_N, view)).toBe(PlayerCommand.MOVE_N);
    expect(remapForView(PlayerCommand.MOVE_S, view)).toBe(PlayerCommand.MOVE_S);
  });

  it("leaves the diagonals alone, which means they do not work", () => {
    // Not an oversight: any diagonal is one rotation away and then a step forward,
    // so the four diagonals are redundant rather than missing. It does mean the
    // numpad's 1/3/7/9 stop moving the player in this view, which is why the
    // toggle message and the option description both say the controls change.
    const view = "first-person" as const;
    for (const diagonal of [PlayerCommand.MOVE_NE, PlayerCommand.MOVE_SE, PlayerCommand.MOVE_SW, PlayerCommand.MOVE_NW]) {
      expect(remapForView(diagonal, view)).toBe(diagonal);
    }
  });

  it("leaves every non-movement command alone, in both views", () => {
    // Everything else — inventory, wait, the item slots, the options screen — must
    // survive the remap untouched, or the view mode would quietly become a game
    // with different verbs.
    for (const view of [DEFAULT_VIEW_MODE, "first-person" as const]) {
      for (const command of [
        PlayerCommand.WAIT_OR_SELF, PlayerCommand.WAIT_LONG, PlayerCommand.RUN_TOGGLE,
        PlayerCommand.USE_EXIT, PlayerCommand.ITEM_SLOT_0, PlayerCommand.OPTIONS_MODE,
        PlayerCommand.ZOOM_IN, PlayerCommand.ZOOM_OUT, PlayerCommand.LOOK_LEFT,
        PlayerCommand.LOOK_RIGHT, PlayerCommand.VIEW_MODE_TOGGLE,
      ]) {
        expect(remapForView(command, view), `command ${command} in ${view}`).toBe(command);
      }
    }
  });

  it("falls back to top-down for a view this build does not know", () => {
    // The saved value is unvalidated JSON. An unrecognised one must not select a
    // control scheme, or a hand-edited options blob silently changes what the
    // arrow keys do.
    for (const junk of ["FIRST-PERSON", "3d", "", "true", "first_person"]) {
      expect(remapForView(PlayerCommand.MOVE_W, junk as never)).toBe(PlayerCommand.MOVE_W);
    }
  });

  it("binds the new commands to keys nothing else has", () => {
    // Not paranoia. `Keybindings` resolves a key to one command, and a collision
    // is decided by which `set` ran last — so a new binding that reuses an existing
    // key silently removes a command nobody was trying to remove, and the symptom
    // is a key that stopped working somewhere unrelated. The arrow keys are
    // deliberately *not* used, because they are claimed by `MOVE_*` in the binding
    // table and are re-aimed at dispatch instead.
    const bindings = new Keybindings();
    const owner = new Map<string, PlayerCommand>();
    const collisions: string[] = [];
    for (const command of Object.values(PlayerCommand).filter(
      (value): value is PlayerCommand => typeof value === "number",
    )) {
      for (const key of bindings.getAll(command)) {
        const previous = owner.get(key);
        if (previous !== undefined && previous !== command) {
          collisions.push(`"${key}" is bound to both ${PlayerCommand[previous]} and ${PlayerCommand[command]}`);
        }
        owner.set(key, command);
      }
    }
    expect(collisions).toEqual([]);

    // And the three new commands are actually bound to something, so a rename of
    // `PlayerCommand` cannot leave them unreachable.
    expect(bindings.getAll(PlayerCommand.LOOK_LEFT).length).toBeGreaterThan(0);
    expect(bindings.getAll(PlayerCommand.LOOK_RIGHT).length).toBeGreaterThan(0);
    expect(bindings.getAll(PlayerCommand.VIEW_MODE_TOGGLE).length).toBeGreaterThan(0);
    // The arrow keys still mean movement in the table; the remap is at dispatch.
    expect(bindings.getAll(PlayerCommand.MOVE_W)).toContain("ArrowLeft");
    expect(bindings.getAll(PlayerCommand.MOVE_E)).toContain("ArrowRight");
  });
});

describe("which way a movement key walks", () => {
  it("is the command's own compass direction in the top-down view", () => {
    const view = DEFAULT_VIEW_MODE;
    const expected = new Map<PlayerCommand, Direction>([
      [PlayerCommand.MOVE_N, Direction.N],
      [PlayerCommand.MOVE_NE, Direction.NE],
      [PlayerCommand.MOVE_E, Direction.E],
      [PlayerCommand.MOVE_SE, Direction.SE],
      [PlayerCommand.MOVE_S, Direction.S],
      [PlayerCommand.MOVE_SW, Direction.SW],
      [PlayerCommand.MOVE_W, Direction.W],
      [PlayerCommand.MOVE_NW, Direction.NW],
    ]);
    for (const [command, direction] of expected) {
      expect(resolveMoveDirection(command, Direction.W, view), `command ${command}`).toBe(direction);
    }
  });

  it("is the way the camera faces, or the opposite, in the first-person view", () => {
    const view = "first-person" as const;
    // Every facing, both keys: the relationship is the *whole* design, so it is
    // checked for all eight rather than for the case that happens to be facing
    // north in whatever fixture was to hand.
    for (const facing of Direction.COMPASS) {
      expect(resolveMoveDirection(PlayerCommand.MOVE_N, facing, view), `forward from ${facing.name}`).toBe(facing);
      expect(resolveMoveDirection(PlayerCommand.MOVE_S, facing, view), `back from ${facing.name}`).toBe(
        Direction.opposite(facing),
      );
    }
  });

  it("is exact rather than rounded, which is what the 45° step buys", () => {
    // The facing is always a `Direction.COMPASS` entry, so walking forward returns
    // *that object*. If this ever returned a direction rounded from an angle, the
    // controls and the view would disagree near a diagonal — and it would disagree
    // by identity, so nothing downstream would notice.
    const view = "first-person" as const;
    for (const facing of Direction.COMPASS) {
      expect(resolveMoveDirection(PlayerCommand.MOVE_N, facing, view)).toBe(facing);
    }
  });

  it("reaches all eight directions by turning, so none is unreachable", () => {
    // The reason the diagonals can be dropped: every direction is a rotation away.
    // If this failed, some direction would be walkable only by a key that no longer
    // works in this view.
    const view = "first-person" as const;
    const reachable = new Set<Direction>();
    for (let steps = 0; steps < 8; steps++) {
      const facing = turnFacing(Direction.N, steps);
      reachable.add(resolveMoveDirection(PlayerCommand.MOVE_N, facing, view)!);
    }
    expect(reachable.size).toBe(8);
    for (const facing of Direction.COMPASS) {
      expect(reachable.has(facing), `${facing.name} is unreachable`).toBe(true);
    }
  });
});

describe("turning", () => {
  it("is a full turn in eight presses, and comes back", () => {
    let facing = Direction.N;
    for (let i = 0; i < 8; i++) facing = turnFacing(facing, 1);
    expect(facing).toBe(Direction.N);
  });

  it("turns left to north-west, which is the example the design is named for", () => {
    // "north makes the player point NW of pressed left arrow" — one press from
    // north is north-west, and it is a `Direction.left` step, not an angle.
    expect(turnFacing(Direction.N, -1)).toBe(Direction.NW);
    expect(turnFacing(Direction.N, -1)).toBe(Direction.left(Direction.N));
    expect(turnFacing(Direction.N, 1)).toBe(Direction.NE);
  });

  it("wraps at both ends, and takes bigger jumps", () => {
    expect(turnFacing(Direction.N, -1)).toBe(Direction.NW);
    expect(turnFacing(Direction.NW, -1)).toBe(Direction.W);
    expect(turnFacing(Direction.N, 9)).toBe(Direction.NE);
    expect(turnFacing(Direction.N, -9)).toBe(Direction.NW);
    expect(turnFacing(Direction.N, 0)).toBe(Direction.N);
  });

  it("lands on the compass and never on NEUTRAL", () => {
    // `Direction.NEUTRAL` has index -1, and `COMPASS[(x + steps) % 8]` with a
    // negative step would index it — a direction with no movement, which is a
    // crash or a no-op depending on where it is used.
    for (let steps = -20; steps <= 20; steps++) {
      const turned = turnFacing(Direction.N, steps);
      expect(Direction.COMPASS).toContain(turned);
      expect(turned.index).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("the facing in a running game", () => {
  let runner: HeadlessRunner;
  let game: RogueGame;

  beforeAll(async () => {
    runner = new HeadlessRunner(12345, new NullRogueUI());
    game = runner.rogueGame;
    await game.LoadData();
    const options = RogueGame.options;
    options.citySize = 1;
    options.simulateDistricts = SimRatio.OFF;
    options.isAnimDelayOn = false;
    options.isAdvisorEnabled = false;
    game.session.gameMode = GameMode.GM_STANDARD;
    await game.StartNewGame();
  }, 180_000);

  afterAll(() => {
    // The view mode is process-wide, like every option. Leaving it on would change
    // what the arrow keys do for every other test in this worker.
    RogueGame.options.viewMode = DEFAULT_VIEW_MODE;
  });

  it("starts facing north, whatever the previous game did", () => {
    // A module-level `let` would fail this, and the failure would be two seeded sim
    // runs diverging on nothing but a remembered heading — the hardest kind of
    // non-determinism to notice, because both runs look valid.
    expect(game.FirstPersonFacing).toBe(Direction.N);
  });

  it("turns without spending an action point or a turn", () => {
    // The point of dispatching turning beside the zoom keys: it redraws and leaves
    // the play loop's `loop` flag alone. If it consumed a turn, surveying a room
    // would be lethal, and in a game where standing still is how you survive.
    const player = game.m_Player;
    const actionPoints = player.actionPoints;
    const worldTurn = game.session.worldTime.turnCounter;
    const position = player.location.position;

    game.TurnFirstPerson(1);
    game.TurnFirstPerson(1);
    game.TurnFirstPerson(-1);

    expect(game.FirstPersonFacing).toBe(Direction.NE);
    expect(player.actionPoints).toBe(actionPoints);
    expect(game.session.worldTime.turnCounter).toBe(worldTurn);
    expect(player.location.position.equals(position)).toBe(true);
  });

  it("survives a full circle and returns to where it started", () => {
    const start = game.FirstPersonFacing;
    for (let i = 0; i < 8; i++) game.TurnFirstPerson(1);
    expect(game.FirstPersonFacing).toBe(start);
  });

  it("resets the facing when the view is re-applied, because there is nothing to carry", () => {
    // The top-down view has no heading — the engine has no facing at all — so any
    // value carried across a view switch would be invented.
    game.TurnFirstPerson(1);
    game.TurnFirstPerson(1);
    expect(game.FirstPersonFacing).not.toBe(Direction.N);

    game.ApplyOptions(true);
    expect(game.FirstPersonFacing).toBe(Direction.N);
  });

  it("toggles the view through the option, and back", () => {
    const before = RogueGame.options.viewMode;
    game.ToggleViewMode();
    expect(RogueGame.options.viewMode).not.toBe(before);
    game.ToggleViewMode();
    expect(RogueGame.options.viewMode).toBe(before);
  });
});
