import { Item } from "@data/Item";
import { ItemModel } from "@data/ItemModel";
import { GameFactions } from "@gameplay/GameFactions";
import { GameGangs, GangID } from "@gameplay/GameGangs";

export class ItemBodyArmorModel extends ItemModel {
  readonly protectionHit: number;
  readonly protectionShot: number;
  readonly encumbrance: number;
  readonly weight: number;

  constructor(
    aName: string,
    theNames: string,
    imageId: string,
    protectionHit: number,
    protectionShot: number,
    encumbrance: number,
    weight: number
  ) {
    super(aName, theNames, imageId);
    this.protectionHit = protectionHit;
    this.protectionShot = protectionShot;
    this.encumbrance = encumbrance;
    this.weight = weight;
  }
}

export class ItemBodyArmor extends Item {
  readonly protectionHit: number;
  readonly protectionShot: number;
  readonly encumbrance: number;
  readonly weight: number;

  constructor(model: ItemModel) {
    super(model);
    if (!(model instanceof ItemBodyArmorModel)) {
      throw new Error("model is not an ItemBodyArmorModel");
    }
    this.protectionHit = model.protectionHit;
    this.protectionShot = model.protectionShot;
    this.encumbrance = model.encumbrance;
    this.weight = model.weight;
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
