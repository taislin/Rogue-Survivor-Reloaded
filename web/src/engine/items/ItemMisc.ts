import { Item } from "@data/Item";
import { ItemModel } from "@data/ItemModel";
import type { Actor } from "@data/Actor";
import { Odor } from "@data/Odor";

// ── Entertainment ───────────────────────────────────────────────────────────

export class ItemEntertainmentModel extends ItemModel {
  value: number;
  boreChance: number;

  constructor(aName: string, theNames: string, imageId: string, value: number, boreChance: number) {
    super(aName, theNames, imageId);
    this.value = value;
    this.boreChance = boreChance;
  }
}

export class ItemEntertainment extends Item {
  private boringForList: Actor[] | null = null;

  constructor(model: ItemModel) {
    super(model);
    if (!(model instanceof ItemEntertainmentModel)) {
      throw new Error("model is not an ItemEntertainmentModel");
    }
  }

  get entertainmentModel(): ItemEntertainmentModel {
    return this.model as ItemEntertainmentModel;
  }

  addBoringFor(a: Actor): void {
    if (!this.boringForList) this.boringForList = [];
    if (!this.boringForList.includes(a)) {
      this.boringForList.push(a);
    }
  }

  isBoringFor(a: Actor): boolean {
    if (!this.boringForList) return false;
    return this.boringForList.includes(a);
  }
}

// ── Barricade Material ──────────────────────────────────────────────────────

export class ItemBarricadeMaterialModel extends ItemModel {
  readonly barricadingValue: number;

  constructor(aName: string, theNames: string, imageId: string, barricadingValue: number) {
    super(aName, theNames, imageId);
    this.barricadingValue = barricadingValue;
  }
}

export class ItemBarricadeMaterial extends Item {
  constructor(model: ItemModel) {
    super(model);
    if (!(model instanceof ItemBarricadeMaterialModel)) {
      throw new Error("model is not an ItemBarricadeMaterialModel");
    }
  }

  get barricadeModel(): ItemBarricadeMaterialModel {
    return this.model as ItemBarricadeMaterialModel;
  }
}

// ── Spray Paint ─────────────────────────────────────────────────────────────

export class ItemSprayPaintModel extends ItemModel {
  readonly maxPaintQuantity: number;

  constructor(aName: string, theNames: string, imageId: string, maxPaintQuantity: number) {
    super(aName, theNames, imageId);
    this.maxPaintQuantity = maxPaintQuantity;
  }
}

export class ItemSprayPaint extends Item {
  paintQuantity: number;

  constructor(model: ItemModel) {
    super(model);
    if (!(model instanceof ItemSprayPaintModel)) {
      throw new Error("model is not an ItemSprayPaintModel");
    }
    this.paintQuantity = model.maxPaintQuantity;
  }

  get sprayPaintModel(): ItemSprayPaintModel {
    return this.model as ItemSprayPaintModel;
  }
}

// ── Spray Scent ─────────────────────────────────────────────────────────────

export class ItemSprayScentModel extends ItemModel {
  readonly maxSprayQuantity: number;
  readonly odor: Odor;
  readonly strength: number;

  constructor(
    aName: string,
    theNames: string,
    imageId: string,
    maxSprayQuantity: number,
    odor: Odor,
    strength: number
  ) {
    super(aName, theNames, imageId);
    this.maxSprayQuantity = maxSprayQuantity;
    this.odor = odor;
    this.strength = strength;
  }
}

export class ItemSprayScent extends Item {
  sprayQuantity: number;

  constructor(model: ItemModel) {
    super(model);
    if (!(model instanceof ItemSprayScentModel)) {
      throw new Error("model is not an ItemSprayScentModel");
    }
    this.sprayQuantity = model.maxSprayQuantity;
  }

  get sprayScentModel(): ItemSprayScentModel {
    return this.model as ItemSprayScentModel;
  }

  get odor(): Odor {
    return this.sprayScentModel.odor;
  }

  get strength(): number {
    return this.sprayScentModel.strength;
  }
}
