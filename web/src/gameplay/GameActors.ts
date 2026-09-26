import { ActorModel } from "@data/ActorModel";
import { ActorModelDB, Models } from "@data/Models";
import { DollBody } from "@data/Doll";
import { Abilities } from "@data/Abilities";
import { ActorSheet } from "@data/ActorSheet";
import { Attack } from "@data/Attack";
import { Defence } from "@data/Defence";
import { Verb } from "@data/Verb";
import { GameImages } from "./GameImages";

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
  _COUNT = 27,
}

export class GameActors implements ActorModelDB {
  private readonly models: ActorModel[] = new Array(ActorID._COUNT);

  constructor() {
    Models.actors = this;

    const actorImageMap: Record<number, string> = {
      [ActorID.UNDEAD_SKELETON]: GameImages.ACTOR_SKELETON,
      [ActorID.UNDEAD_RED_EYED_SKELETON]: GameImages.ACTOR_RED_EYED_SKELETON,
      [ActorID.UNDEAD_RED_SKELETON]: GameImages.ACTOR_RED_SKELETON,
      [ActorID.UNDEAD_ZOMBIE]: GameImages.ACTOR_ZOMBIE,
      [ActorID.UNDEAD_DARK_EYED_ZOMBIE]: GameImages.ACTOR_DARK_EYED_ZOMBIE,
      [ActorID.UNDEAD_DARK_ZOMBIE]: GameImages.ACTOR_DARK_ZOMBIE,
      [ActorID.UNDEAD_ZOMBIE_MASTER]: GameImages.ACTOR_ZOMBIE_MASTER,
      [ActorID.UNDEAD_ZOMBIE_LORD]: GameImages.ACTOR_ZOMBIE_LORD,
      [ActorID.UNDEAD_ZOMBIE_PRINCE]: GameImages.ACTOR_ZOMBIE_PRINCE,
      [ActorID.UNDEAD_MALE_ZOMBIFIED]: GameImages.ACTOR_ZOMBIE,
      [ActorID.UNDEAD_FEMALE_ZOMBIFIED]: GameImages.ACTOR_ZOMBIE,
      [ActorID.UNDEAD_MALE_NEOPHYTE]: GameImages.ACTOR_MALE_NEOPHYTE,
      [ActorID.UNDEAD_FEMALE_NEOPHYTE]: GameImages.ACTOR_FEMALE_NEOPHYTE,
      [ActorID.UNDEAD_MALE_DISCIPLE]: GameImages.ACTOR_MALE_DISCIPLE,
      [ActorID.UNDEAD_FEMALE_DISCIPLE]: GameImages.ACTOR_FEMALE_DISCIPLE,
      [ActorID.UNDEAD_RAT_ZOMBIE]: GameImages.ACTOR_RAT_ZOMBIE,
      [ActorID.MALE_CIVILIAN]: GameImages.ACTOR_ZOMBIE,
      [ActorID.FEMALE_CIVILIAN]: GameImages.ACTOR_ZOMBIE,
      [ActorID.FERAL_DOG]: GameImages.ACTOR_ZOMBIE,
      [ActorID.CHAR_GUARD]: GameImages.ACTOR_ZOMBIE,
      [ActorID.ARMY_NATIONAL_GUARD]: GameImages.ACTOR_ZOMBIE,
      [ActorID.BIKER_MAN]: GameImages.ACTOR_ZOMBIE,
      [ActorID.POLICEMAN]: GameImages.ACTOR_ZOMBIE,
      [ActorID.GANGSTA_MAN]: GameImages.ACTOR_ZOMBIE,
      [ActorID.BLACKOPS_MAN]: GameImages.ACTOR_ZOMBIE,
      [ActorID.SEWERS_THING]: GameImages.ACTOR_SEWERS_THING,
      [ActorID.JASON_MYERS]: GameImages.ACTOR_JASON_MYERS,
    };

    const dataArr = actorsData as any[];
    for (let i = 0; i < dataArr.length && i < ActorID._COUNT; i++) {
      const d = dataArr[i];
      const isUndead = i <= ActorID.UNDEAD_RAT_ZOMBIE || i === ActorID.SEWERS_THING;
      const isLiving = !isUndead;

      const abilities = new Abilities();
      abilities.isUndead = isUndead;
      abilities.hasInventory = isLiving;
      abilities.canUseItems = isLiving;
      abilities.canTalk = isLiving;
      abilities.canTrade = isLiving;
      abilities.canRun = isLiving || i >= ActorID.UNDEAD_MALE_NEOPHYTE;
      abilities.hasToEat = isLiving;
      abilities.hasToSleep = isLiving;
      abilities.hasSanity = isLiving;
      abilities.canTire = isLiving;

      if (isUndead) {
        abilities.isRotting = true;
        abilities.canZombifyKilled = true;
        abilities.canBashDoors = true;
        abilities.canBreakObjects = true;
        abilities.zombieAIExplore = true;
        abilities.aiCanUseAIExits = true;
      }

      const verb = isUndead ? (i < ActorID.UNDEAD_ZOMBIE ? "claw" : "bite") : "punch";
      const attack = Attack.meleeAttack(new Verb(verb), d.ATK, d.DMG);
      const defence = new Defence(d.DEF, d.PRO_HIT, d.PRO_SHOT);

      const food = isLiving ? 100 : 0;
      const sleep = isLiving ? 100 : 0;
      const sanity = isLiving ? 100 : 0;
      const invCapacity = isLiving ? 6 : 0;

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

      const isMale = i !== ActorID.FEMALE_CIVILIAN && i !== ActorID.UNDEAD_FEMALE_ZOMBIFIED && i !== ActorID.UNDEAD_FEMALE_NEOPHYTE && i !== ActorID.UNDEAD_FEMALE_DISCIPLE;
      const body = new DollBody(isMale, d.SPD);

      const img = actorImageMap[i] ?? GameImages.ACTOR_ZOMBIE;
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

  private setModel(id: ActorID, model: ActorModel): void {
    model.id = id;
    this.models[id] = model;
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
}
