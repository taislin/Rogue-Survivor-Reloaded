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
  /**
   * Can this tile go visibly rotten as the world's clock runs down? Still Alive,
   * Release 7-6. C# `TileModel.cs:62`, `CanDecay`.
   *
   * 108 of the 142 models, and the list is not "floors and wood": the ponds and
   * the dirt and the carpets are all *excluded* (the C#'s own comment at
   * `RogueGame.cs:9275` says why — "not relevant for ponds, grass, etc"), which is
   * the point of it being per-model rather than derived from walkability.
   *
   * A field and not a constructor argument, like `isWater` above, because the C#
   * sets it in an object initialiser (`{ CanDecay = true }`) rather than in the
   * argument list. Default false: the C# is an auto-property with no field
   * initialiser, so the CLR default is what a model that never mentions it gets.
   *
   * **Not the same thing as a destructible wall.** `GameTiles.isDestructibleWallModel`
   * is a hand-written list of twelve models, because that predicate is an `==`
   * chain in the C# and not a flag; `canDecay` is what it is not. Both exist, for
   * different questions: "does an explosion replace this with a floor" versus
   * "does the weather get to draw on it".
   */
  canDecay: boolean = false;

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
