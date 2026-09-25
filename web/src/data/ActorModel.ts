import { DollBody } from "./Doll";
import { Abilities } from "./Abilities";
import { ActorSheet } from "./ActorSheet";
import type { ActorController } from "./ActorController";
import type { Faction } from "./Faction";
import { Actor } from "./Actor";

export class ActorModel {
  id: number = 0;
  readonly imageId: string;
  readonly dollBody: DollBody;
  readonly name: string;
  readonly pluralName: string;
  readonly abilities: Abilities;
  readonly startingSheet: ActorSheet;
  readonly defaultControllerCtor: (new () => ActorController) | null;
  readonly scoreValue: number;
  flavorDescription: string = "";
  createdCount: number = 0;

  constructor(
    imageId: string,
    name: string,
    pluralName: string,
    scoreValue: number,
    body: DollBody,
    abilities: Abilities,
    startingSheet: ActorSheet,
    defaultControllerCtor: (new () => ActorController) | null = null
  ) {
    this.imageId = imageId;
    this.name = name;
    this.pluralName = pluralName;
    this.scoreValue = scoreValue;
    this.dollBody = body;
    this.abilities = abilities;
    this.startingSheet = startingSheet;
    this.defaultControllerCtor = defaultControllerCtor;
  }

  create(faction: Faction, spawnTime: number): Actor {
    this.createdCount++;
    const actor = new Actor(this, faction, spawnTime);
    if (this.defaultControllerCtor) {
      const ctrl = new this.defaultControllerCtor();
      actor.controller = ctrl;
    }
    return actor;
  }

  createAnonymous(faction: Faction, spawnTime: number): Actor {
    return this.create(faction, spawnTime);
  }

  createNumberedName(faction: Faction, spawnTime: number): Actor {
    const actor = this.create(faction, spawnTime);
    actor.name = `${actor.name}${this.createdCount}`;
    actor.isProperName = true;
    return actor;
  }

  createNamed(faction: Faction, properName: string, isPluralName: boolean, spawnTime: number): Actor {
    const actor = this.create(faction, spawnTime);
    actor.name = properName;
    actor.isProperName = true;
    actor.isPluralName = isPluralName;
    return actor;
  }
}
