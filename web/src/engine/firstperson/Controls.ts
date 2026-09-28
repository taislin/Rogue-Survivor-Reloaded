import { Direction } from "@engine/Direction";
import { GameOptions } from "@engine/GameOptions";
import { PlayerCommand } from "@engine/PlayerCommand";
import type { ViewMode } from "./Types";

/**
 * Which command a movement key actually means, in each view.
 *
 * A pure function over the command, deliberately, and that is the whole design.
 *
 * The first-person scheme is that Left and Right *turn* and Up and Down *walk*:
 * rotation is quantised to one eighth of a turn, so the camera always faces one of
 * the eight compass directions and walking forward is exactly that direction
 * rather than a rounded approximation of it. Getting that into the engine without
 * touching the binding table matters — a `LOOK_LEFT` binding on an arrow key would
 * fight `MOVE_W` for the same key, and which of them won would depend on the view
 * mode, so the binding table would no longer say what a key does.
 *
 * So the remap happens here, at dispatch, where the view mode is known. Two
 * consequences worth stating:
 *
 *  - The four diagonals are unreachable. `MOVE_NE` and friends do nothing in first
 *    person, because any diagonal is a rotation away and then walking forward. The
 *    numpad's 1/3/7/9 therefore stop working for movement in this view, which the
 *    toggle message says out loud rather than leaving the player to find out.
 *  - `LOOK_LEFT`/`LOOK_RIGHT` cost nothing. They are dispatched beside the zoom
 *    keys, which redraw and leave the turn loop alone, so turning does not spend
 *    an action point or advance the world.
 */

/**
 * Rewrites a command for the view the player is in.
 *
 * Returns the command unchanged for anything that is not a movement, so this can
 * sit in front of the whole command switch rather than inside the movement cases.
 * In the top-down view it is the identity for every command, which is asserted in
 * the tests — a port that quietly changed what a key does would be invisible
 * otherwise, and "invisible to a passing test suite" is this project's most
 * reliable bug class.
 */
export function remapForView(command: PlayerCommand, view: ViewMode): PlayerCommand {
  // The predicate goes through `GameOptions.isFirstPersonView` rather than
  // `view === "first-person"`, so a saved options blob holding a value this build
  // does not know falls back to the top-down view rather than into a renderer
  // whose control scheme it never opted into.
  if (!GameOptions.isFirstPersonView(view)) return command;
  switch (command) {
    case PlayerCommand.MOVE_W:
      return PlayerCommand.LOOK_LEFT;
    case PlayerCommand.MOVE_E:
      return PlayerCommand.LOOK_RIGHT;
    default:
      return command;
  }
}

/**
 * The direction a movement command actually walks in.
 *
 * Top-down: the command's own compass direction. First person: the way the
 * camera faces, or the opposite, because there is no strafing.
 *
 * `facing` is a `Direction` and not an angle, which is the property the whole
 * scheme rests on: rotation is quantised to 45°, one step of `Direction.left` /
 * `right`, so the facing is *always* a `Direction.COMPASS` entry and this returns
 * it exactly. There is no rounding anywhere, and therefore no way for the direction
 * a player walks in to disagree with the way the view is facing.
 */
export function resolveMoveDirection(
  command: PlayerCommand,
  facing: Direction,
  view: ViewMode,
): Direction | null {
  const own = commandDirection(command);
  if (!GameOptions.isFirstPersonView(view)) return own;
  // Only north/south are movement in this view; the remap has already turned
  // west/east into turns. Anything else is not a movement and has no direction.
  if (command === PlayerCommand.MOVE_N) return facing;
  if (command === PlayerCommand.MOVE_S) return Direction.opposite(facing);
  return own;
}

/** The compass direction a movement command names, or null if it names none. */
function commandDirection(command: PlayerCommand): Direction | null {
  switch (command) {
    case PlayerCommand.MOVE_N:  return Direction.N;
    case PlayerCommand.MOVE_NE: return Direction.NE;
    case PlayerCommand.MOVE_E:  return Direction.E;
    case PlayerCommand.MOVE_SE: return Direction.SE;
    case PlayerCommand.MOVE_S:  return Direction.S;
    case PlayerCommand.MOVE_SW: return Direction.SW;
    case PlayerCommand.MOVE_W:  return Direction.W;
    case PlayerCommand.MOVE_NW: return Direction.NW;
    default: return null;
  }
}

/** One turn's worth of rotation: 45°, a full turn in eight presses. */
export function turnFacing(facing: Direction, steps: number): Direction {
  return Direction.COMPASS[(((facing.index + steps) % 8) + 8) % 8]!;
}
