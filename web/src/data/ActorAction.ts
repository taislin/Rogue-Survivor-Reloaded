import type { Actor } from "./Actor";
import type { ActionGame } from "@engine/actions/ActionGame";

export abstract class ActorAction {
  protected readonly actor: Actor;
  /**
   * Typed as the action seam rather than `any`.
   *
   * This was `any`, and `actions/Actions.ts` matched it with a local
   * `type Game = any` whose stated reason — that typing it would create a circular
   * dependency on a RogueGame class "which hasn't been ported yet" — stopped being
   * true when RogueGame reached 36,802 lines. The looseness was not confined to
   * the constructor signatures: because the field is what `perform()` bodies reach
   * through, typing the constructors alone would have left all 38 `this.game.do*`
   * calls still unchecked. `ActionGame` is a structural interface in the leaf that
   * consumes it, so this edge introduces no cycle.
   */
  protected readonly game: ActionGame;
  failReason: string = "";

  protected constructor(actor: Actor, game: ActionGame) {
    this.actor = actor;
    this.game = game;
  }

  abstract isLegal(): boolean;
  abstract perform(): void;
}
