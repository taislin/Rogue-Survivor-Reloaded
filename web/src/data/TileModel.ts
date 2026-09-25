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
