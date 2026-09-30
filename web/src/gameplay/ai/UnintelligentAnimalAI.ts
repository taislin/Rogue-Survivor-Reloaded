/**
 * UnintelligentAnimalAI.
 * Ported from src/Gameplay/AI/UnintelligentAnimalAI.cs
 *
 * Simple Animal AI : used by rabbits and chickens.
 * Designed for unintelligent creatures that exist only as a food source.
 * Added by (Release 7-6)
 */

import { Activity } from '@data/Activity';
import { DollPart } from '@data/Doll';
import { Odor } from '@data/Odor';
import type { ActorAction } from '@data/ActorAction';
import type { Percept } from '@engine/ai/Sensors';
import { ActionBump, ActionWait } from '@engine/actions/Actions';
import { Direction } from '@engine/Direction';
import { GameImages } from '@gameplay/GameImages';
import { BaseAI, isGrassLikeTile } from './BaseAI';
import { LOSSensor, SensingFilter, SmellSensor } from './GameplaySensors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

/**
 * C# `Direction.COMPASS_EASTERLY` / `COMPASS_WESTERLY` (Direction.cs:74-79).
 *
 * Local rather than added to `Direction`, because the port's `Direction` predates
 * the Release 7-3 split. The other upstream caller is `FeralDogAI.cs:314`, and
 * the port's `FeralDogAI.ts` has no facing code at all -- the dog skins were never
 * split east/west here -- so this class is the only user and a local will do.
 */
const EASTERLY: readonly Direction[] = [Direction.SE, Direction.E, Direction.NE];
const WESTERLY: readonly Direction[] = [Direction.SW, Direction.W, Direction.NW];

export class UnintelligentAnimalAI extends BaseAI {
  /**
   * C# :22-27. Declared and never read there either: all three emote arms that
   * would consume it are commented out upstream, so a fork animal never shouts.
   * Kept because it is part of the class, and because it is the record of the one
   * thing this controller is *not* allowed to do.
   */
  static readonly FIGHT_EMOTES = ['*screech*', '*screech*', '*screech*'];

  private m_LOSSensor!: LOSSensor;
  private m_LivingSmellSensor!: SmellSensor;

  protected override createSensors(): void {
    this.m_LOSSensor = new LOSSensor(SensingFilter.ACTORS | SensingFilter.CORPSES);
    this.m_LivingSmellSensor = new SmellSensor(Odor.LIVING);
  }

  protected override updateSensors(game: Game): Percept[] {
    const list = this.m_LOSSensor.sense(game, this.controlledActor);
    const living = this.m_LivingSmellSensor.sense(game, this.controlledActor);
    return [...list, ...living];
  }

  protected override selectAction(game: Game, percepts: Percept[]): ActorAction | null {
    const actor = this.controlledActor;
    const mapPercepts = this.filterSameMap(game, percepts);

    //////////////////////////////////////////////////////////////
    // 0.1 flee from fires
    // 1 flee from closest enemy
    // 2 eat - DISABLED
    // 3 rest or sleep
    // 4 wander
    //////////////////////////////////////////////////////////////

    // 0.1 flee from fires
    const runFromFires = this.behaviorFleeFromFires(game, actor.location);
    if (runFromFires) {
      actor.activity = Activity.FLEEING;
      return runFromFires;
    }

    // 1 flee from closest enemy
    const enemies = this.filterEnemies(game, mapPercepts);
    if (enemies) {
      const turn = actor.location.map?.localTime.turnCounter ?? 0;

      // try visible enemies first, the closer the best.
      const visibleEnemies = this.filter(game, enemies, p => p.turn === turn);
      if (visibleEnemies) {
        let bestBumpAction: ActorAction | null = null;
        let closest = Number.MAX_VALUE;

        for (const enemyP of visibleEnemies) {
          const distance = game.rules.gridDistance(actor.location.position, enemyP.location.position);
          if (distance < closest) {
            const bumpAction = this.behaviorWalkAwayFrom(game, enemyP);
            if (bumpAction) {
              // Check we are staying on the grass. If there is nowhere to go,
              // the animal is "pinned in a corner" or "didn't see that enemy
              // approach" (C#:93), and standing still is the right answer --
              // without this the rabbit would pace into a wall.
              const bump = bumpAction as ActionBump;
              const next = actor.location.addDirection(bump.direction);
              const tile = actor.location.map?.getTileAt(next.position.x, next.position.y);
              // The `tile &&` is the port's: the C# dereferences `GetTileAt`
              // unguarded, and an animal on the last row of the map has a
              // neighbour off it.
              if (tile && isGrassLikeTile(tile.model.id)) {
                closest = distance;
                bestBumpAction = bumpAction;
              }
            }
          }
        }

        if (bestBumpAction) {
          actor.activity = Activity.FLEEING;
          // C# also sets `TargetActor` here, commented out upstream (:110).
          this.faceSpriteForDirection((bestBumpAction as ActionBump).direction);
          return bestBumpAction;
        }
      }
    }

    // 2 eat.
    //
    // **Disabled upstream and still disabled here** (C#:118-127): "removed the
    // need for these animals to eat, as it added nothing to the game and just
    // cost CPU cycles". The commented C# also `return`ed a null
    // `determinedAction`, so re-enabling it verbatim would return "do nothing"
    // -- a bug nobody noticed precisely because the arm is dead. What the arm
    // *was* worth stating is the consequence, which is visible in the models:
    // RABBIT and CHICKEN carry `HasToEat = false` but still a DOG_HUN food
    // meter, so nothing drains it and nothing refills it, and `foodPoints` sits
    // at its maximum for the whole run. That is inert state, not a missing
    // behaviour, and it is why the sheet's food column cannot be read as a sign
    // that the animals are meant to forage.

    // 3. rest or sleep
    //
    // The C# writes `Activity.RESTING` here (:133), and the port has no such
    // member: `Activity` stops at `FLEEING_FROM_EXPLOSIVE = 8` plus the
    // `FISHING = 9` that came with `Feature.Fishing`, and every ported AI that
    // needed RESTING or WANDERING wrote IDLE instead (`FeralDogAI.ts:136`,
    // `RatAI.ts:120`) rather than renumber an enum the graph writer already
    // stores. So all three of this method's C# activities -- RESTING, WANDERING
    // and the second RESTING -- are IDLE here, and only the two FLEEINGs are
    // distinct. Nothing downstream can tell them apart: the C# never writes an
    // `Activity` to a save, and the two AI icon switches in `RogueGame` that
    // read one both throw on an unknown value.
    if (game.rules.isActorTired(actor)) {
      actor.activity = Activity.IDLE;
      return new ActionWait(actor, game);
    }
    // The sleep arm is commented out too (C#:136-141), "removed the need for
    // these animals to sleep". It was already unreachable before that: both
    // models have `hasToSleep = false`, and `Rules.isActorSleepy` tests that
    // flag first (Rules.ts:1745), so it could not have fired for a rabbit.

    // 4 wander
    const determinedAction = this.behaviorSimpleAnimalWander(game, null);
    if (determinedAction) {
      this.faceSpriteForDirection((determinedAction as ActionBump).direction);
      actor.activity = Activity.IDLE; // C# Activity.WANDERING (:149)
      return determinedAction;
    }

    // The chicken's egg-laying roll is commented out upstream (C#:154-169):
    // "instead, chickens will spawn with an egg". Worth noting because it is the
    // only `Rules.Roll` in the whole class: nothing here consumes randomness, so
    // a cornered animal waits without shifting the world's roll sequence.
    actor.activity = Activity.IDLE; // C# Activity.RESTING (:171)
    return new ActionWait(actor, game);
  }

  // ── Dumb animals specifics ───────────────────────────────────────────────

  /**
   * C# :179-220. Swaps the animal's SKIN decoration for its east- or west-facing
   * twin when it turns, so a rabbit heading right is drawn facing right.
   *
   * Two deviations, both forced by the port rather than chosen:
   *
   * - The C# indexes `skin[0]` unconditionally and throws
   *   `InvalidOperationException` on an unrecognised skin, or on a null
   *   `skinImage`. `Doll.getDecorations` returns `null` for a part nobody
   *   dressed, so an unskinned animal -- one built by a test, or restored from a
   *   save written before skins existed -- would throw out of the middle of the
   *   AI's turn and take the run with it. Returning leaves the doll exactly as it
   *   was, which is what the straight-north/south arm already means.
   * - The C# switches on the literals `"Actors\\Decoration\\rabbit_skin_east"`
   *   and friends. The port's image ids use forward slashes, so matching those
   *   literals would silently fall through to the throw on every turn. The cases
   *   below compare the `GameImages` constants instead: the same four strings,
   *   and a rename of one becomes a type error rather than a silent miss.
   *
   * The `FaceSpriteForDirection(int x, int y)` overload (C#:222-231) is not
   * ported: nothing in the C# calls it, including `SelectAction`.
   */
  private faceSpriteForDirection(direction: Direction): void {
    const doll = this.controlledActor.doll;
    const skin = doll.getDecorations(DollPart.SKIN);
    if (!skin || skin.length === 0) return;

    let skinImage: string | null = null;
    if (EASTERLY.includes(direction)) {
      switch (skin[0]) {
        case GameImages.RABBIT_SKIN_EAST: return; // already the required sprite
        case GameImages.RABBIT_SKIN_WEST: skinImage = GameImages.RABBIT_SKIN_EAST; break;
        case GameImages.CHICKEN_SKIN_EAST: return;
        case GameImages.CHICKEN_SKIN_WEST: skinImage = GameImages.CHICKEN_SKIN_EAST; break;
        default: return;
      }
    } else if (WESTERLY.includes(direction)) {
      switch (skin[0]) {
        case GameImages.RABBIT_SKIN_EAST: skinImage = GameImages.RABBIT_SKIN_WEST; break;
        case GameImages.RABBIT_SKIN_WEST: return;
        case GameImages.CHICKEN_SKIN_EAST: skinImage = GameImages.CHICKEN_SKIN_WEST; break;
        case GameImages.CHICKEN_SKIN_WEST: return;
        default: return;
      }
    } else {
      return; // direction is straight south or north, so just keep the current skin
    }

    if (skinImage === null) return;
    doll.removeDecoration(skin[0]);
    doll.addDecoration(DollPart.SKIN, skinImage);
  }
}
