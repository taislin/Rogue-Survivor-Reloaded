/**
 * InsaneHumanAI.
 * Ported from src/Gameplay/AI/InsaneHumanAI.cs
 *
 * InsaneHumanAI, used by Unique Enraged Patient & Asylum patients.
 * Extremely simple : attack anyone in sight or shout insanities, wander.
 */

import { Activity } from '@data/Activity';
import type { Actor } from '@data/Actor';
import type { ActorAction } from '@data/ActorAction';
import type { Percept } from '@engine/ai/Sensors';
import { BaseAI, UseExitFlags } from './BaseAI';
import { LOSSensor, SensingFilter } from './GameplaySensors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

export class InsaneHumanAI extends BaseAI {
  // Constants
  // alpha10.1 obsolete : const ATTACK_CHANCE = 80;
  private static readonly SHOUT_CHANCE = 80;
  private static readonly USE_EXIT_CHANCE = 50;

  // NOTE: verbatim from the original C# source (InsaneHumanAI.cs).
  private static readonly INSANITIES: string[] = [
    'WHY WALK THERE?',
    'WHAT MAKES YOU FUN?',
    'YOU WEAR TOO MUCH COLORS!',
    'YOU HAVE BAD HABITS!',
    "MOM DIDN'T HANG ME!",
    'LUCIE! LUCIA!',
    'WHAT EGGS AND PASTA?',
    'TURTLE CATS!',
    'I REMEMBER THE CRABS!',
    'IT WAS AFTER THAT NOW!',
    'CUT IT! CUT IT NOW!',
    'DECEASED TOES!',
    'ICE-CREAM COPS!',
    'I SAW THAT FUCKING TWICE! TWICE! TWICE!',
    'FUCK BASTARD SAUSAGE!',
    'HEY YOU! STOP MOVING THE FLOOR!',
    'DROP THE FUCKING EGGS NOW!',
    'YOU GO FIRST AFTER ME!',
    'IT HURTS BUT ITS OK!',
    'LAST TIME WAS OK...',
    "SHE ISN'T NOT YET!",
    'I WAS CRAWLING HAHA!',
    'ROLLING LIKE AN EGG!',
    'THAT IS NOT DECENT!',
    'JUMP LIKE A FLOWER!',
    'NIGGER TRIGGER!',
    'CHEESE LIKE THESE...',
    'ILL-ADVISED LOBSTER!',
    'SSSHHHH! SILENCE... DO YOU SMELL?',
    'NOTHING BEATS. NOTHING!',
    "GROWN-UP MEN DON'T DO THAT!",
    'BARN BUSTER!',
    'SUPER SUPER?',
    'ONE MORE PASTA CRAP!',
    'LAZY LADY!',
    'I HATE TAP WATER!',
    'STILL WANKING FOR FOOD?',
    'LOOK! IT FITS LIKE A HOLE!',
    'PESKY POLAR PRANKS!',
    'LITTLE BY LITTLE YOU DIE...',
    'PLEASE TIE YOUR NECK PROPERLY!',
    'I SEE WHAT I SHIT ALL THE TIME!',
    "THAT'S FUCKING ANNOYING!",
    'I UNLOCK THE WALLS!',
    "I'M NOT SO SURE NOW!?",
    'RUSTY BUT TRUSTY!',
    'CHEESE LICKER!',
    'LAUNDRY TIME AGAIN AND AGAIN!',
    "DON'T YOU SEE I'M ASSEMBLED?",
    'MEXICAN MIDGETS!',
    'RAZOR RASCALS!',
    'PUNCH MY BALLS!',
    'STUCK IN A VICIOUS SQUARE!',
    'HORSE HOLSTER!',
    'THAT WAS COMPLETLY UNCALLED FOR!',
    "ROBOTS WON'T FOOL ME!",
  ];

  private m_LOSSensor!: LOSSensor;

  protected override createSensors(): void {
    this.m_LOSSensor = new LOSSensor(SensingFilter.ACTORS);
  }

  protected override updateSensors(game: Game): Percept[] {
    return this.m_LOSSensor.sense(game, this.controlledActor);
  }

  protected override selectAction(game: Game, percepts: Percept[]): ActorAction | null {
    const actor = this.controlledActor;
    const mapPercepts = this.filterSameMap(game, percepts);

    ///////////////////////////////////////////////////////////////////////
    // alpha10 OBSOLETE 1 equip weapon
    // alpha10 1 equip best items
    // 2 (chance) move closer to an enemy, nearest & visible enemies first
    // 3 (chance) shout insanities.
    // 4 (chance) use exit.
    // 5 wander
    ///////////////////////////////////////////////////////////////////////

    // alpha10
    actor.isRunning = false;

    // 1 equip best items
    const bestEquip = this.behaviorEquipBestItems(game, false, false);
    if (bestEquip) return bestEquip;

    // 2 (chance) move closer to an enemy, nearest & visible enemies first
    // alpha10.1 always try to attack if (game.rules.rollChance(ATTACK_CHANCE))
    {
      const enemies = this.filterEnemies(game, mapPercepts);
      if (enemies) {
        const turn = actor.location.map?.localTime.turnCounter ?? 0;

        // try visible enemies first, the closer the best.
        const visibleEnemies = this.filter(game, enemies, p => p.turn === turn);
        if (visibleEnemies) {
          let bestEnemyPercept: Percept | null = null;
          let bestBumpAction: ActorAction | null = null;
          let closest = Number.MAX_VALUE;

          for (const enemyP of visibleEnemies) {
            const distance = game.rules.gridDistance(actor.location.position, enemyP.location.position);
            if (distance < closest) {
              const bumpAction = this.behaviorStupidBumpToward(game, enemyP.location.position, true, true);
              if (bumpAction) {
                closest = distance;
                bestEnemyPercept = enemyP;
                bestBumpAction = bumpAction;
              }
            }
          }

          if (bestBumpAction && bestEnemyPercept) {
            actor.activity = Activity.CHASING;
            actor.targetActor = bestEnemyPercept.percepted as Actor;
            return bestBumpAction;
          }
        }

        // then try rest, the closer the best.
        const oldEnemies = this.filter(game, enemies, p => p.turn !== turn);
        if (oldEnemies) {
          let bestEnemyPercept: Percept | null = null;
          let bestBumpAction: ActorAction | null = null;
          let closest = Number.MAX_VALUE;

          for (const enemyP of oldEnemies) {
            const distance = game.rules.gridDistance(actor.location.position, enemyP.location.position);
            if (distance < closest) {
              const bumpAction = this.behaviorStupidBumpToward(game, enemyP.location.position, true, true);
              if (bumpAction) {
                closest = distance;
                bestEnemyPercept = enemyP;
                bestBumpAction = bumpAction;
              }
            }
          }

          if (bestBumpAction && bestEnemyPercept) {
            actor.activity = Activity.CHASING;
            actor.targetActor = bestEnemyPercept.percepted as Actor;
            return bestBumpAction;
          }
        }
      }
    }

    // 3 (chance) shout insanities.
    if (game.rules.rollChance(InsaneHumanAI.SHOUT_CHANCE)) {
      const insanity = InsaneHumanAI.INSANITIES[game.rules.roll(0, InsaneHumanAI.INSANITIES.length)];
      actor.activity = Activity.IDLE;
      game.DoEmote(actor, insanity, true);
    }

    // 4 (chance) use exit.
    if (game.rules.rollChance(InsaneHumanAI.USE_EXIT_CHANCE)) {
      const useExit = this.behaviorUseExit(
        game,
        UseExitFlags.ATTACK_BLOCKING_ENEMIES | UseExitFlags.BREAK_BLOCKING_OBJECTS
      );
      if (useExit) {
        actor.activity = Activity.IDLE;
        return useExit;
      }
    }

    // 5 wander
    actor.activity = Activity.IDLE;
    return this.behaviorWander(game, null);
  }
}
