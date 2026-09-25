import type { Actor } from "./Actor";
import type { ActorAction } from "./ActorAction";

export abstract class ActorController {
  protected actor: Actor | null = null;

  get controlledActor(): Actor | null {
    return this.actor;
  }

  takeControl(actor: Actor): void {
    this.actor = actor;
  }

  leaveControl(): void {
    this.actor = null;
  }

  abstract getAction(game: any): ActorAction | null;
}
