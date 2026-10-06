import { ActorModel } from "@data/ActorModel";
import { ActorModelDB, Models } from "@data/Models";
import { DollBody } from "@data/Doll";
import { Abilities } from "@data/Abilities";
import { ActorSheet } from "@data/ActorSheet";
import type { ActorController } from "@data/ActorController";
import { SkeletonAI } from "@gameplay/ai/SkeletonAI";
import { ZombieAI } from "@gameplay/ai/ZombieAI";
import { RatAI } from "@gameplay/ai/RatAI";
import { SewersThingAI } from "@gameplay/ai/SewersThingAI";
import { CivilianAI } from "@gameplay/ai/CivilianAI";
import { CHARGuardAI } from "@gameplay/ai/CHARGuardAI";
import { SoldierAI } from "@gameplay/ai/SoldierAI";
import { GangAI } from "@gameplay/ai/GangAI";
import { FeralDogAI } from "@gameplay/ai/FeralDogAI";
import { UnintelligentAnimalAI } from "@gameplay/ai/UnintelligentAnimalAI";
import { InsaneHumanAI } from "@gameplay/ai/InsaneHumanAI";
import { Attack } from "@data/Attack";
import { Defence } from "@data/Defence";
import { Verb } from "@data/Verb";
import { GameImages } from "./GameImages";
import { Rules } from "@engine/Rules";

import actorsData from "./data/Actors.json";

export enum ActorID {
  UNDEAD_SKELETON = 0,
  UNDEAD_RED_EYED_SKELETON = 1,
  UNDEAD_RED_SKELETON = 2,
  UNDEAD_ZOMBIE = 3,
  UNDEAD_DARK_EYED_ZOMBIE = 4,
  UNDEAD_DARK_ZOMBIE = 5,
  UNDEAD_ZOMBIE_MASTER = 6,
  UNDEAD_ZOMBIE_LORD = 7,
  UNDEAD_ZOMBIE_PRINCE = 8,
  UNDEAD_MALE_ZOMBIFIED = 9,
  UNDEAD_FEMALE_ZOMBIFIED = 10,
  UNDEAD_MALE_NEOPHYTE = 11,
  UNDEAD_FEMALE_NEOPHYTE = 12,
  UNDEAD_MALE_DISCIPLE = 13,
  UNDEAD_FEMALE_DISCIPLE = 14,
  UNDEAD_RAT_ZOMBIE = 15,
  MALE_CIVILIAN = 16,
  FEMALE_CIVILIAN = 17,
  FERAL_DOG = 18,
  CHAR_GUARD = 19,
  ARMY_NATIONAL_GUARD = 20,
  BIKER_MAN = 21,
  POLICEMAN = 22,
  GANGSTA_MAN = 23,
  BLACKOPS_MAN = 24,
  SEWERS_THING = 25,
  JASON_MYERS = 26,
  // ── Still Alive additions. Append only: a save names its actors by this
  // number, so inserting here would resurrect the wrong corpse.
  DERANGED_PATIENT = 27,
  CHAR_SCIENTIST = 28,
  // RABBIT and CHICKEN (GameActors.cs:988-1039, Release 7-6) are appended
  // rather than placed beside FERAL_DOG as the C# has them, and the C#'s own
  // enum order cannot be reproduced here for the reason above: the C# was free
  // to insert `RABBIT, CHICKEN` after `FERAL_DOG` because nothing in the C#
  // stores an `ActorModel` across versions either, whereas the port's
  // `SessionGraph` writes the model id of every actor on the map. At 29 and 30
  // the ids of the 29 actors that already existed are untouched; a save that
  // says `27` still means the deranged patient and a save that says `28` still
  // means the CHAR scientist.
  RABBIT = 29,
  CHICKEN = 30,
  _COUNT = 31,
}

export class GameActors implements ActorModelDB {
  private readonly models: ActorModel[] = new Array(ActorID._COUNT);

  constructor() {
    Models.actors = this;

    // Per-model sprite, or null when the actor is drawn entirely from its doll
    // decorations instead. This mirrors the C# `GameActors` constructor
    // argument-by-argument: every living actor (and the zombified pair) is
    // passed `null` there, because they are skinned and dressed at spawn time
    // by the generator. Undead and uniques carry a whole-body sprite.
    //
    // Getting this wrong is invisible until you look for it: a living actor
    // given a sprite draws that sprite *under* its doll layers, so the doll
    // still looks right, but a null-sprite actor given the wrong sprite shows
    // the wrong body entirely.
    const actorImageMap: Record<number, string | null> = {
      [ActorID.UNDEAD_SKELETON]: GameImages.ACTOR_SKELETON,
      [ActorID.UNDEAD_RED_EYED_SKELETON]: GameImages.ACTOR_RED_EYED_SKELETON,
      [ActorID.UNDEAD_RED_SKELETON]: GameImages.ACTOR_RED_SKELETON,
      [ActorID.UNDEAD_ZOMBIE]: GameImages.ACTOR_ZOMBIE,
      [ActorID.UNDEAD_DARK_EYED_ZOMBIE]: GameImages.ACTOR_DARK_EYED_ZOMBIE,
      [ActorID.UNDEAD_DARK_ZOMBIE]: GameImages.ACTOR_DARK_ZOMBIE,
      [ActorID.UNDEAD_ZOMBIE_MASTER]: GameImages.ACTOR_ZOMBIE_MASTER,
      [ActorID.UNDEAD_ZOMBIE_LORD]: GameImages.ACTOR_ZOMBIE_LORD,
      [ActorID.UNDEAD_ZOMBIE_PRINCE]: GameImages.ACTOR_ZOMBIE_PRINCE,
      [ActorID.UNDEAD_MALE_ZOMBIFIED]: null, // dressed as a civilian, then zombified
      [ActorID.UNDEAD_FEMALE_ZOMBIFIED]: null,
      [ActorID.UNDEAD_MALE_NEOPHYTE]: GameImages.ACTOR_MALE_NEOPHYTE,
      [ActorID.UNDEAD_FEMALE_NEOPHYTE]: GameImages.ACTOR_FEMALE_NEOPHYTE,
      [ActorID.UNDEAD_MALE_DISCIPLE]: GameImages.ACTOR_MALE_DISCIPLE,
      [ActorID.UNDEAD_FEMALE_DISCIPLE]: GameImages.ACTOR_FEMALE_DISCIPLE,
      [ActorID.UNDEAD_RAT_ZOMBIE]: GameImages.ACTOR_RAT_ZOMBIE,
      [ActorID.SEWERS_THING]: GameImages.ACTOR_SEWERS_THING,
      // Livings: no sprite, drawn from the doll.
      [ActorID.MALE_CIVILIAN]: null,
      [ActorID.FEMALE_CIVILIAN]: null,
      [ActorID.FERAL_DOG]: null,
      [ActorID.CHAR_GUARD]: null, // skinned & dressed
      [ActorID.ARMY_NATIONAL_GUARD]: null,
      [ActorID.BIKER_MAN]: null,
      [ActorID.GANGSTA_MAN]: null,
      [ActorID.POLICEMAN]: null,
      [ActorID.BLACKOPS_MAN]: null,
      [ActorID.JASON_MYERS]: null, // skinned
      // Still Alive: both skinned & dressed, so drawn from the doll like
      // Jason Myers and the CHAR guard rather than from a whole-body sprite.
      [ActorID.DERANGED_PATIENT]: null,
      [ActorID.CHAR_SCIENTIST]: null,
      // The two food animals are `null` for a stronger reason: their *whole
      // body* is the skin decoration (BaseTownGenerator.cs:11981/11996 adds
      // `RABBIT_SKIN_EAST` and nothing else), so a whole-body sprite would be
      // drawn under a doll that has no other layer to draw.
      [ActorID.RABBIT]: null,
      [ActorID.CHICKEN]: null,
    };

    // Rows must be bound to models by their ID, not by position. The C# does
    // exactly that: 30 explicit `GetDataFromCSVTable(table, IDs.X)` calls
    // (GameActors.cs:1113-1158), each resolving a row through
    // `FindLineForModel`, which matches the ID *string*.
    //
    // It said 27 and cited `:1017-1056`, which is the CHICKEN / DERANGED_PATIENT
    // *model* block and not the CSV reader at all. A count with the wrong line
    // range under it is worse than a wrong count, because a reader who checks the
    // range concludes the count was checked too.
    //
    // Binding positionally happened to work for rows 0-17 and then broke:
    // `Actors.csv` lists FERAL_DOG at row 26 while the enum has it at 18, so
    // **9 of the then-27 actors were reading someone else's entire stat block**
    // -- and FERAL_DOG is no longer the last row, there are four after it, and
    // the population is 31 (`ActorID._COUNT`). The 9 and the two indices are
    // still right; the "of 27" and "last" are not.
    // the Sewers Thing spawned with 30 HP instead of 400, Jason Myers with the
    // dog's 15, BlackOps soldiers with the boss's 400 HP and STA 99, and every
    // name and score value from CHAR guard onward was off by one.
    //
    // Row 0 is labeled `_FIRST` rather than `UNDEAD_SKELETON`, so a strict
    // by-ID lookup needs the alias -- and note the C# would throw
    // "actor UNDEAD_SKELETON not found" on this file, the same upstream data
    // defect as `Skills.csv`'s `_FIRST_LIVING`. See §1.1c.
    const byId = new Map<string, any>();
    for (const row of actorsData as any[]) {
      byId.set(row.ID === "_FIRST" ? "UNDEAD_SKELETON" : row.ID, row);
    }

    for (let i = 0; i < ActorID._COUNT; i++) {
      const d = byId.get(ActorID[i]);
      if (!d) throw new Error(`Actors.csv has no row for ${ActorID[i]}`);
      const isUndead = i <= ActorID.UNDEAD_RAT_ZOMBIE || i === ActorID.SEWERS_THING;
      const isLiving = !isUndead;
      // The two food animals share a sheet shape -- food and sleep at the dog
      // constants, no sanity, no inventory -- that no other living actor has,
      // so they are named here rather than inferred from `isLiving`.
      const isUnintelligentAnimal =
        i === ActorID.RABBIT || i === ActorID.CHICKEN;

      // The C# fills each sheet from named constants (GameActors.cs 66-69,
      // 175, 204-212) rather than literals, and the split is not simply
      // living/undead:
      //   - only the rotting branch of the undead decays on ROT_BASE_POINTS;
      //     the three skeletons, the rat zombie and the sewers thing get
      //     NO_FOOD and never rot,
      //   - the feral dog and Jason Myers get food and sleep but NO_SANITY,
      //   - and so do the two food animals, which take the dog's food and sleep
      //     constants but no sanity and no inventory (GameActors.cs:1005-1008,
      //     1032-1035).
      // Flattening all of that to `isLiving ? 100 : 0` capped every meter at
      // 100 while the thresholds stayed at 720/900/1440, so actors spawned
      // already "Hungry", "Sleepy" and "Disturbed" and every
      // HoursUntil* helper returned 0.
      const rots =
        i >= ActorID.UNDEAD_ZOMBIE && i <= ActorID.UNDEAD_FEMALE_DISCIPLE;
      const hasSanity =
        isLiving && !isUnintelligentAnimal &&
        i !== ActorID.FERAL_DOG && i !== ActorID.JASON_MYERS;

      const abilities = GameActors.abilitiesFor(i);

      // C# per-actor verb: every living uses the shared VERB_PUNCH except the
      // feral dog, which bites (GameActors.cs:939) and the two food animals,
      // where a rabbit bites like the dog (:1006) and a chicken pecks (:1033).
      // The ternary could not express that one exception, so the dog punched.
      const verb =
        i === ActorID.CHICKEN ? "peck"
        : i === ActorID.FERAL_DOG || i === ActorID.RABBIT ? "bite"
        : isUndead ? (i < ActorID.UNDEAD_ZOMBIE ? "claw" : "bite")
        : "punch";
      const attack = Attack.meleeAttack(new Verb(verb), d.ATK, d.DMG);
      const defence = new Defence(d.DEF, d.PRO_HIT, d.PRO_SHOT);

      const food = rots
        ? Rules.ROT_BASE_POINTS
        : isLiving
          ? Rules.FOOD_BASE_POINTS
          : 0;
      const sleep = isLiving ? Rules.SLEEP_BASE_POINTS : 0;
      const sanity = hasSanity ? Rules.SANITY_BASE_POINTS : 0;
      // C# sizes these per actor too: HUMAN_INVENTORY = 7 for every living
      // actor, DOG_INVENTORY = 1 for the feral dog, NO_INVENTORY = 0 for the
      // undead and for the two food animals (GameActors.cs 66, 207, 212, 1008,
      // 1035). A flat 6 for the living is one slot short of the original, which
      // the status panel draws as "Inventory 1-7".
      //
      // The animals' 0 is redundant with `hasInventory = false` -- `Actor` only
      // builds an `Inventory` when that flag is set -- but it is the number the
      // C# passes and it is what a save round-trips, so it is passed here too.
      const invCapacity =
        i === ActorID.FERAL_DOG ? 1
        : isUnintelligentAnimal ? 0
        : isLiving ? 7
        : 0;

      const sheet = new ActorSheet(
        d.HP,
        d.STA,
        food,
        sleep,
        sanity,
        attack,
        defence,
        d.FOV,
        d.AUDIO ?? 0,
        d.SMELL ?? 0,
        invCapacity
      );

      // C# passes `DollBody(false, …)` exactly once in the whole file, for
      // FEMALE_CIVILIAN (GameActors.cs:695). The three female undead get
      // `true`, because their dolls are either whole-body sprites or copied
      // from the victim's decorations, so the flag only reaches the generated
      // first names and the he/she pronouns (BaseMapGenerator.giveNameToActor,
      // RogueGame's Conjugate). Inferring gender from the actor's name -- which
      // is what excluding the female undead did -- gave those three female
      // zombies he/him and male names.
      const isMale = i !== ActorID.FEMALE_CIVILIAN;
      const body = new DollBody(isMale, d.SPD);

      // Null is meaningful and must survive: it means "no whole-body sprite,
      // draw this actor from its doll decorations". Coalescing it away here
      // (as `?? GameImages.ACTOR_ZOMBIE` did) gave every living actor a zombie
      // body, and since the sprite is drawn *under* the doll the result was a
      // civilian with a zombie's torso showing through.
      const img = Object.prototype.hasOwnProperty.call(actorImageMap, i) ? actorImageMap[i] : null;
      const model = new ActorModel(
        img,
        d.NAME,
        d.PLURAL,
        d.SCORE ?? 0,
        body,
        abilities,
        sheet,
        null
      );
      model.flavorDescription = d.FLAVOR ?? "";
      this.setModel(i, model);
    }
  }

  /**
   * Per-actor abilities, transcribed from the C#'s `new Abilities() { … }`
   * block for each of the 31 models the port builds (`GameActors.cs`,
   * `#region Init`).
   *
   * This used to be inferred from `isLiving` / `isUndead`, which is wrong in
   * both directions and cost the player most of the game. Every `Abilities`
   * field defaults to `false`, so an unlisted flag is *off* — and the old
   * blanket loop left these off for the player:
   *
   *   canUseMapObjects, canBashDoors, canBreakObjects, canJump,
   *   canBarricade, canPush, isIntelligent, aiCanUseAIExits
   *
   * The visible symptom was doors. `Rules.isBumpableFor` tries, in order, move
   * → fight/chat → open door → bash door → container → break, and returns the
   * *last* failure reason. With `canUseMapObjects` off, opening failed
   * ("no ability to open"); with `canBashDoors` off, bashing failed; so it fell
   * through to breaking and the player was told "cannot break objects" while
   * standing at a perfectly ordinary door. Reported as "bumping doesn't open
   * doors".
   *
   * It was also wrong for the undead in the other direction: skeletons and the
   * rat zombie were given `canBashDoors`/`canBreakObjects`/`isRotting`/
   * `canZombifyKilled` by the old loop, none of which the C# grants them
   * (GameActors.cs:255-301, 620-650), and `isUndeadMaster` was never set on the
   * zombie master / lord / prince despite `Rules` and the AI testing it.
   *
   * The `isRotting` flag drives the rot meter, so that one had teeth: skeletons
   * were rotting even though their sheet has NO_FOOD.
   */
  private static abilitiesFor(id: ActorID): Abilities {
    const a = new Abilities();
    const set = (...flags: Array<keyof Abilities>) => {
      for (const f of flags) (a[f] as boolean) = true;
    };

    switch (id) {
      // ── Undead: skeletons (GameActors.cs:255-301) ──
      case ActorID.UNDEAD_SKELETON:
      case ActorID.UNDEAD_RED_EYED_SKELETON:
      case ActorID.UNDEAD_RED_SKELETON:
        set("isUndead", "aiCanUseAIExits");
        break;

      // ── Undead: rotting branch (GameActors.cs:308-430) ──
      case ActorID.UNDEAD_ZOMBIE:
      case ActorID.UNDEAD_DARK_EYED_ZOMBIE:
      case ActorID.UNDEAD_DARK_ZOMBIE:
      case ActorID.UNDEAD_MALE_ZOMBIFIED:
      case ActorID.UNDEAD_FEMALE_ZOMBIFIED:
        set("isUndead", "isRotting", "canZombifyKilled", "canBashDoors",
            "canBreakObjects", "zombieAIExplore", "aiCanUseAIExits");
        break;

      // ── Undead: neophytes and disciples, which can also push (440-527) ──
      case ActorID.UNDEAD_MALE_NEOPHYTE:
      case ActorID.UNDEAD_FEMALE_NEOPHYTE:
      case ActorID.UNDEAD_MALE_DISCIPLE:
      case ActorID.UNDEAD_FEMALE_DISCIPLE:
        set("isUndead", "isRotting", "canZombifyKilled", "canBashDoors",
            "canBreakObjects", "canPush", "zombieAIExplore", "aiCanUseAIExits");
        break;

      // ── Undead masters, which can use map objects and jump (530-615) ──
      case ActorID.UNDEAD_ZOMBIE_MASTER:
      case ActorID.UNDEAD_ZOMBIE_LORD:
      case ActorID.UNDEAD_ZOMBIE_PRINCE:
        set("isUndead", "isUndeadMaster", "isRotting", "canZombifyKilled",
            "canBashDoors", "canBreakObjects", "canUseMapObjects", "canJump",
            "canJumpStumble", "canPush", "zombieAIExplore", "aiCanUseAIExits");
        break;

      // ── Rat zombie: small, so it slips past closed doors (620-650) ──
      case ActorID.UNDEAD_RAT_ZOMBIE:
        set("isUndead", "isSmall", "aiCanUseAIExits");
        break;

      // ── Sewers thing: no exits, no rot (652-660) ──
      case ActorID.SEWERS_THING:
        set("isUndead", "canBashDoors", "canBreakObjects");
        break;

      // ── Livings: civilians (668-724) ──
      case ActorID.MALE_CIVILIAN:
      case ActorID.FEMALE_CIVILIAN:
        set("hasInventory", "hasToEat", "hasToSleep", "hasSanity", "canTalk",
            "canUseMapObjects", "canBreakObjects", "canBashDoors", "canJump",
            "canTire", "canRun", "canUseItems", "canTrade", "canBarricade",
            "canPush", "isIntelligent", "aiCanUseAIExits");
        break;

      // ── CHAR guard: no HasToEat, unlike every other living (727-755) ──
      case ActorID.CHAR_GUARD:
        set("hasInventory", "canUseMapObjects", "canBreakObjects", "canJump",
            "canTire", "canRun", "canUseItems", "hasToSleep", "hasSanity",
            "canTalk", "canPush", "canBarricade", "isIntelligent");
        break;

      // ── National guard: as CHAR, plus CanTalk ordering aside no HasToEat (758-789) ──
      case ActorID.ARMY_NATIONAL_GUARD:
        set("hasInventory", "canUseMapObjects", "canBreakObjects", "canJump",
            "canTire", "canRun", "canUseItems", "canTalk", "hasToSleep",
            "hasSanity", "canPush", "canBarricade", "isIntelligent");
        break;

      // ── Biker: the only one that ignores ranged weapons (792-820) ──
      case ActorID.BIKER_MAN:
        set("hasInventory", "canUseMapObjects", "canBreakObjects", "canJump",
            "canTire", "canRun", "canUseItems", "hasToEat", "hasToSleep",
            "hasSanity", "canTalk", "canPush", "canBarricade", "canTrade",
            "isIntelligent", "aiNotInterestedInRangedWeapons");
        break;

      // ── Gangsta (823-851) ──
      case ActorID.GANGSTA_MAN:
        set("hasInventory", "canUseMapObjects", "canBreakObjects", "canJump",
            "canTire", "canRun", "canUseItems", "hasToEat", "hasToSleep",
            "hasSanity", "canTalk", "canPush", "canBarricade", "canTrade",
            "isIntelligent");
        break;

      // ── Policeman: law enforcer (854-889) ──
      case ActorID.POLICEMAN:
        set("hasInventory", "hasToEat", "hasToSleep", "hasSanity", "canTalk",
            "canUseMapObjects", "canBreakObjects", "canJump", "canTire",
            "canRun", "canUseItems", "canTrade", "canBarricade", "canPush",
            "aiCanUseAIExits", "isLawEnforcer", "isIntelligent");
        break;

      // ── BlackOps: no HasToEat (892-918) ──
      case ActorID.BLACKOPS_MAN:
        set("hasInventory", "canUseMapObjects", "canBreakObjects", "canJump",
            "canTire", "canRun", "canUseItems", "canTalk", "hasToSleep",
            "hasSanity", "canPush", "canBarricade", "isIntelligent");
        break;

      // ── Feral dog: no sanity, no talking, no trading (921-946) ──
      // `isLivingAnimal` is Release 7-5 and it is *not* specific to the two
      // rabbits-and-chickens models: the C# sets it on the dog as well
      // (GameActors.cs:970), and `RogueGame.ButcherMeat`'s meat switch has a
      // `feral dog` case waiting to match it. Without the flag the third of the
      // switch's three branches was unreachable and a butchered dog gave human
      // flesh.
      case ActorID.FERAL_DOG:
        set("isLivingAnimal", "hasInventory", "hasToEat", "hasToSleep",
            "canBreakObjects", "canJump", "canTire", "canRun", "aiCanUseAIExits");
        break;

      // ── Still Alive's two food animals, RABBIT and CHICKEN ──
      // GameActors.cs:992-1004 and 1019-1031; the two blocks are identical, so
      // the two ids fall through to the same four flags. What is *off* is the
      // interesting half: no inventory, nothing to eat or sleep for, no jump, no
      // AI exits, not intelligent -- and `isSmall`, which is the flag that
      // actually reaches the world, through the trap-avoid bonus and through
      // `Rules.canActorSwitchPlaceWith`.
      case ActorID.RABBIT:
      case ActorID.CHICKEN:
        set("isLivingAnimal", "canTire", "canRun", "isSmall");
        break;

      // ── Jason Myers: RAGE, so no eating and no sleeping (949-978) ──
      case ActorID.JASON_MYERS:
        set("hasInventory", "canUseMapObjects", "canBreakObjects", "canJump",
            "canTire", "canRun", "canUseItems", "canTalk", "canPush",
            "canBarricade", "aiCanUseAIExits");
        break;

      // ── Still Alive's deranged patient: the same RAGE sheet, verbatim ──
      // GameActors.cs:1045-1062, commented "was Jason Myers (Release 8-1)",
      // and it is the same fourteen flags with the same two HasTo* set false.
      // Forked rather than reimplemented so the two can diverge later: a
      // Still-Alive rebalance of one should not silently edit the other.
      case ActorID.DERANGED_PATIENT:
        set("hasInventory", "canUseMapObjects", "canBreakObjects", "canJump",
            "canTire", "canRun", "canUseItems", "canTalk", "canPush",
            "canBarricade", "aiCanUseAIExits");
        break;

      // ── Still Alive's CHAR scientist: a second CHAR guard (GameActors.cs:766-782) ──
      // Identical to CHAR_GUARD's fourteen flags, including the CHAR quirk of
      // no `hasToEat` and no `aiCanUseAIExits`.
      case ActorID.CHAR_SCIENTIST:
        set("hasInventory", "canUseMapObjects", "canBreakObjects", "canJump",
            "canTire", "canRun", "canUseItems", "hasToSleep", "hasSanity",
            "canTalk", "canPush", "canBarricade", "isIntelligent");
        break;

      default:
        // Every `ActorID` member has a case above - the build loop walks
        // `0.._COUNT-1` and `tests/actor-abilities.test.ts` pins the count to
        // `_COUNT` - so this is unreachable for a declared id and reachable only
        // for an out-of-range one, a cast, or a member added to the enum
        // without a case.
        //
        // It used to fall through to `return a`, handing back the
        // default-constructed `Abilities`: every flag false, which reads as
        // "this actor can do nothing" and is indistinguishable from an actor
        // the design deliberately gave no abilities. A blank sheet is a
        // plausible answer, so nothing noticed; a throw names the id.
        throw new Error(`unhandled ActorID in abilitiesFor: ${String(id)}`);
    }
    return a;
  }

  private setModel(id: ActorID, model: ActorModel): void {
    model.id = id;
    model.defaultControllerCtor = GameActors.defaultControllerFor(id);
    this.models[id] = model;
  }

  /**
   * C# passes `typeof(SkeletonAI)` / `typeof(ZombieAI)` / … as every
   * `ActorModel`'s `DefaultController`. The port built its models from CSV in
   * one loop, so the mapping lives here instead of in ~27 constructor calls.
   *
   * It matters beyond `Actor.create()`: `RogueGame.BotTakeControl()` reads
   * `defaultControllerCtor` off the player's model, so with this missing the
   * game's own bot mode silently failed to start.
   */
  private static defaultControllerFor(id: ActorID): (new () => ActorController) | null {
    switch (id) {
      case ActorID.UNDEAD_SKELETON:
      case ActorID.UNDEAD_RED_EYED_SKELETON:
      case ActorID.UNDEAD_RED_SKELETON:
        return SkeletonAI;

      case ActorID.UNDEAD_ZOMBIE:
      case ActorID.UNDEAD_DARK_EYED_ZOMBIE:
      case ActorID.UNDEAD_DARK_ZOMBIE:
      case ActorID.UNDEAD_MALE_ZOMBIFIED:
      case ActorID.UNDEAD_FEMALE_ZOMBIFIED:
      case ActorID.UNDEAD_MALE_NEOPHYTE:
      case ActorID.UNDEAD_FEMALE_NEOPHYTE:
      case ActorID.UNDEAD_MALE_DISCIPLE:
      case ActorID.UNDEAD_FEMALE_DISCIPLE:
      case ActorID.UNDEAD_ZOMBIE_MASTER:
      case ActorID.UNDEAD_ZOMBIE_LORD:
      case ActorID.UNDEAD_ZOMBIE_PRINCE:
        return ZombieAI;

      case ActorID.UNDEAD_RAT_ZOMBIE:
        return RatAI;
      case ActorID.SEWERS_THING:
        return SewersThingAI;

      case ActorID.MALE_CIVILIAN:
      case ActorID.FEMALE_CIVILIAN:
      case ActorID.POLICEMAN:
        return CivilianAI;
      case ActorID.CHAR_GUARD:
        return CHARGuardAI;
      // Still Alive's CHAR scientist uses the same controller
      // (GameActors.cs:788).
      case ActorID.CHAR_SCIENTIST:
        return CHARGuardAI;
      case ActorID.ARMY_NATIONAL_GUARD:
      case ActorID.BLACKOPS_MAN:
        return SoldierAI;
      case ActorID.BIKER_MAN:
      case ActorID.GANGSTA_MAN:
        return GangAI;
      case ActorID.FERAL_DOG:
        return FeralDogAI;
      // Still Alive's two food animals share one controller (GameActors.cs:1009
      // and 1036), which is the whole of the "unintelligent" in the name: it
      // flees, it rests, it wanders, and it has no third verb to speak.
      case ActorID.RABBIT:
      case ActorID.CHICKEN:
        return UnintelligentAnimalAI;
      case ActorID.JASON_MYERS:
        return InsaneHumanAI;
      // Still Alive's deranged patient, likewise (GameActors.cs:1063).
      case ActorID.DERANGED_PATIENT:
        return InsaneHumanAI;

      default:
        // `null` here is a real answer, not a blank one, and that is the whole
        // difference from `abilitiesFor`'s default. `ActorModel` declares the
        // field `(new () => ActorController) | null` and `ActorModel.create`
        // already branches on it, so "no default controller" is a state the
        // model layer models and handles. A default-constructed `Abilities`
        // has no such reading: all-false flags look exactly like a deliberate
        // no-abilities actor. Unreachable all the same - the build loop passes
        // `0.._COUNT-1` and every one of them is named above - so a throw
        // would also be defensible, but it would be throwing to protect a
        // branch nothing can reach.
        return null;
    }
  }

  get(id: number): ActorModel {
    return this.models[id];
  }

  static isSkeletonBranch(m: ActorModel): boolean {
    return m.id === ActorID.UNDEAD_SKELETON || m.id === ActorID.UNDEAD_RED_EYED_SKELETON || m.id === ActorID.UNDEAD_RED_SKELETON;
  }

  static isShamblerBranch(m: ActorModel): boolean {
    return m.id === ActorID.UNDEAD_ZOMBIE || m.id === ActorID.UNDEAD_DARK_EYED_ZOMBIE || m.id === ActorID.UNDEAD_DARK_ZOMBIE;
  }

  static isRatBranch(m: ActorModel): boolean {
    return m.id === ActorID.UNDEAD_RAT_ZOMBIE;
  }

  /**
   * C# `GameActors.IsUnintelligentAnimal` (GameActors.cs:1252-1255), Release 7-6.
   *
   * An identity test on the two models, deliberately *not* the
   * `abilities.isLivingAnimal` flag: that flag is also on the feral dog, which
   * is not unintelligent, and the C#'s own distinction is "rabbit or chicken".
   * `Feature.AnimalShelter` is the consumer -- the C# tests this before letting
   * an actor in, which is how a shelter refuses a dog.
   */
  static isUnintelligentAnimal(m: ActorModel): boolean {
    return m.id === ActorID.RABBIT || m.id === ActorID.CHICKEN;
  }
}
