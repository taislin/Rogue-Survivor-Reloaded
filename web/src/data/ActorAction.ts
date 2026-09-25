import type { Actor } from "./Actor";

export abstract class ActorAction {
  protected readonly actor: Actor;
  protected readonly game: any;
  failReason: string = "";

  protected constructor(actor: Actor, game: any) {
    this.actor = actor;
    this.game = game;
  }

  abstract isLegal(): boolean;
  abstract perform(): void;
}
