import { ActorController } from "./ActorController";
import type { ActorAction } from "./ActorAction";

/**
 * Marker controller representing the human player.
 * Player actions are produced by the game UI loop.
 */
export class PlayerController extends ActorController {
  override getAction(_game: any): ActorAction | null {
    throw new Error("Do not call PlayerController.getAction() directly.");
  }
}
