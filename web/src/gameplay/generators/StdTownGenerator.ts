/**
 * StdTownGenerator.
 * Ported from src/Gameplay/Generators/StdTownGenerator.cs
 *
 * Standard city: surface/sewers/subway population on top of BaseTownGenerator.
 */

import type { District } from '@data/District';
import { Map as GameMap } from '@data/Map';
import { Options } from '@engine/GameOptions';
import { Rules } from '@engine/Rules';
import { Session } from '@engine/Session';
import { SEWERS_UNDEADS_FACTOR, BaseTownGenerator } from './BaseTownGenerator';

export class StdTownGenerator extends BaseTownGenerator {
  generate(seed: number): GameMap {
    const map = super.generate(seed);
    map.name = 'Std City';

    /////////////////////////////////
    // People and undeads in surface.
    /////////////////////////////////
    const maxTries = 10 * map.width * map.height;
    // civilians (includes police)
    for (let i = 0; i < Options.maxCivilians; i++) {
      // policeman, civilian?
      if (this.m_DiceRoller.rollChance(this.params.policemanChance)) {
        // create policeman.
        const cop = this.createNewPoliceman(0);
        // policeman on patrol starts outside.
        this.actorPlace(this.m_DiceRoller, maxTries, map, cop, (pt) => !map.getTileAt(pt.x, pt.y)!.isInside);
      } else {
        // create civilian with 1 skill.
        const civilian = this.createNewCivilian(0, 0, 1);
        // civilian starts inside.
        this.actorPlace(this.m_DiceRoller, maxTries, map, civilian, (pt) => map.getTileAt(pt.x, pt.y)!.isInside);
      }
    }
    // dogs
    // alpha10 dogs entirely disabled for now, much more work to do on them.
    /*
    for (let i = 0; i < Options.maxDogs; i++) {
      // feral.
      const dog = this.createNewFeralDog(0);
      this.actorPlace(this.m_DiceRoller, maxTries, map, dog, (pt) => !map.getTileAt(pt.x, pt.y)!.isInside);
    }
    */
    // start with day zero nb of undeads.
    const nbUndeads = Math.floor((Options.maxUndeads * Options.dayZeroUndeadsPercent) / 100);
    for (let i = 0; i < nbUndeads; i++) {
      const undead = this.createNewUndead(0);
      this.actorPlace(this.m_DiceRoller, maxTries, map, undead, (pt) => !map.getTileAt(pt.x, pt.y)!.isInside);
    }

    return map;
  }

  generateSewersMap(seed: number, district: District): GameMap {
    const sewers = super.generateSewersMap(seed, district);

    ////////////////////////////////
    // People and undeads in sewers
    ////////////////////////////////
    if (Rules.hasZombiesInSewers(Session.get().gameMode)) {
      const maxTries = 10 * sewers.width * sewers.height;
      // start with day zero nb of undeads.
      const nbUndeads = Math.floor(SEWERS_UNDEADS_FACTOR * ((Options.maxUndeads * Options.dayZeroUndeadsPercent) / 100));
      for (let i = 0; i < nbUndeads; i++) {
        const undead = this.createNewSewersUndead(0);
        this.actorPlace(this.m_DiceRoller, maxTries, sewers, undead);
      }
    }

    return sewers;
  }

  generateSubwayMap(seed: number, district: District): GameMap {
    const subway = super.generateSubwayMap(seed, district);

    // DISABLED in C# (#if false) — people and undeads in subways.
    // The disabled block uses SUBWAY_UNDEADS_FACTOR * (maxUndeads * dayZeroUndeadsPercent) / 100
    // undeads placed on the "rails" zones (see BaseTownGenerator.SUBWAY_UNDEADS_FACTOR).
    return subway;
  }
}
