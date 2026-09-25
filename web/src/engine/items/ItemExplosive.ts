import { Item } from "@data/Item";
import { ItemModel } from "@data/ItemModel";
import { BlastAttack } from "@data/BlastAttack";

export class ItemExplosiveModel extends ItemModel {
  readonly fuseDelay: number;
  readonly blastAttack: BlastAttack;
  readonly blastImage: string;

  constructor(
    aName: string,
    theNames: string,
    imageId: string,
    fuseDelay: number,
    attack: BlastAttack,
    blastImageId: string
  ) {
    super(aName, theNames, imageId);
    this.fuseDelay = fuseDelay;
    this.blastAttack = attack;
    this.blastImage = blastImageId;
  }
}

export class ItemExplosive extends Item {
  readonly primedModelId: number;

  constructor(model: ItemModel, primedModel: ItemModel) {
    super(model);
    this.primedModelId = primedModel.id;
  }
}

export class ItemPrimedExplosive extends ItemExplosive {
  fuseTimeLeft: number;

  constructor(model: ItemModel) {
    super(model, model);
    if (!(model instanceof ItemExplosiveModel)) {
      throw new Error("model is not an ItemExplosiveModel");
    }
    this.fuseTimeLeft = model.fuseDelay;
  }
}

export class ItemGrenadeModel extends ItemExplosiveModel {
  readonly maxThrowDistance: number;

  constructor(
    aName: string,
    theNames: string,
    imageId: string,
    fuseDelay: number,
    attack: BlastAttack,
    blastImageId: string,
    maxThrowDistance: number
  ) {
    super(aName, theNames, imageId, fuseDelay, attack, blastImageId);
    this.maxThrowDistance = maxThrowDistance;
  }
}

export class ItemGrenade extends ItemExplosive {
  constructor(model: ItemModel, primedModel: ItemModel) {
    super(model, primedModel);
  }
}

export class ItemGrenadePrimedModel extends ItemExplosiveModel {
  /** The unprimed grenade model this one was primed from (C# GrenadeModel). */
  readonly grenadeModel: ItemGrenadeModel;

  constructor(
    aName: string,
    theNames: string,
    imageId: string,
    grenadeModel: ItemGrenadeModel
  ) {
    super(
      aName,
      theNames,
      imageId,
      grenadeModel.fuseDelay,
      grenadeModel.blastAttack,
      grenadeModel.blastImage
    );
    this.grenadeModel = grenadeModel;
  }
}

export class ItemGrenadePrimed extends ItemPrimedExplosive {
  constructor(model: ItemModel) {
    super(model);
  }
}
