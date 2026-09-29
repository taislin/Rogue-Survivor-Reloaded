import { Color } from "@engine/Color";

export class TileModel {
  static readonly UNDEF = new TileModel("", Color.Pink, false, true);

  id: number = 0;
  readonly imageId: string;
  readonly isWalkable: boolean;
  readonly isTransparent: boolean;
  readonly minimapColor: Color;
  isWater: boolean = false;
  waterCoverImageId: string = "";
  /**
   * Can a tile fire spread onto this? Still Alive, Release 5-2.
   *
   * Only five tiles in the whole set are flammable -- planted floor, the two
   * carpets, wood plank walls and red curtains -- which is the whole design: fire
   * that spread over bare concrete would consume every building on the map, so
   * the model is that a fire needs *stuff* to burn and a warehouse is a safe
   * place to stand.
   *
   * A plain default-false field rather than a subclass or a table, so the 138
   * other models are unchanged by its absence.
   */
  isFlammable: boolean = false;

  constructor(
    imageId: string,
    minimapColor: Color,
    isWalkable: boolean,
    isTransparent: boolean
  ) {
    this.imageId = imageId;
    this.minimapColor = minimapColor;
    this.isWalkable = isWalkable;
    this.isTransparent = isTransparent;
  }
}

export abstract class TileModelDB {
  abstract get(id: number): TileModel;
}
