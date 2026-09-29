import { Item } from "@data/Item";
import { ItemModel } from "@data/ItemModel";
import { Defence } from "@data/Defence";
import { GameFactions } from "@gameplay/GameFactions";
import { GameGangs, GangID } from "@gameplay/GameGangs";

export class ItemBodyArmorModel extends ItemModel {
  readonly protectionHit: number;
  readonly protectionShot: number;
  readonly encumbrance: number;
  readonly weight: number;
  /**
   * Still Alive's `FIRE_RESIST%` and `INF_RESIST%`, both defaulting to 0.
   *
   * **The two percentages mean different things**, which is the trap here. Fire
   * resistance is a damage *multiplier*: `dmg -= dmg * (fireResist / 100)`, so
   * 100 is total immunity and 0 is none. Infection resistance is a *chance to
   * block*: `rollChance(infectionResist)`, so 30 means a 30% chance the bite does
   * not infect. Both are "percent", neither is the other's formula, and the
   * fork's own code uses them differently at the two call sites.
   *
   * `infectionResistance` has a reader; `fireResistance` does not yet, because
   * the port has no fire damage to scale — that arrives with `TileFires`.
   */
  readonly fireResistance: number;
  readonly infectionResistance: number;

  constructor(
    aName: string,
    theNames: string,
    imageId: string,
    protectionHit: number,
    protectionShot: number,
    encumbrance: number,
    weight: number,
    fireResistance: number = 0,
    infectionResistance: number = 0
  ) {
    super(aName, theNames, imageId);
    this.protectionHit = protectionHit;
    this.protectionShot = protectionShot;
    this.encumbrance = encumbrance;
    this.weight = weight;
    this.fireResistance = fireResistance;
    this.infectionResistance = infectionResistance;
  }

  /** C# `ItemBodyArmorModel.ToDefence` - note the negated encumbrance. */
  toDefence(): Defence {
    return new Defence(-this.encumbrance, this.protectionHit, this.protectionShot);
  }
}

export class ItemBodyArmor extends Item {
  readonly protectionHit: number;
  readonly protectionShot: number;
  readonly encumbrance: number;
  readonly weight: number;
  /** Copied from the model, as `ItemBodyArmor.cs:35-36` does. */
  readonly fireResistance: number;
  readonly infectionResistance: number;

  constructor(model: ItemModel) {
    super(model);
    if (!(model instanceof ItemBodyArmorModel)) {
      throw new Error("model is not an ItemBodyArmorModel");
    }
    this.protectionHit = model.protectionHit;
    this.protectionShot = model.protectionShot;
    this.encumbrance = model.encumbrance;
    this.weight = model.weight;
    this.fireResistance = model.fireResistance;
    this.infectionResistance = model.infectionResistance;
  }

  isHostileForCops(): boolean {
    return GameFactions.BAD_POLICE_OUTFITS.includes(this.model.id);
  }

  isFriendlyForCops(): boolean {
    return GameFactions.GOOD_POLICE_OUTFITS.includes(this.model.id);
  }

  isHostileForBiker(gangID: GangID): boolean {
    return GameGangs.BAD_GANG_OUTFITS[gangID].includes(this.model.id);
  }

  isFriendlyForBiker(gangID: GangID): boolean {
    return GameGangs.GOOD_GANG_OUTFITS[gangID].includes(this.model.id);
  }
}
