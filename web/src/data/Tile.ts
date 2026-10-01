import { Models } from "./Models";
import type { TileModel } from "./TileModel";

export const enum TileFlags {
  NONE = 0,
  IS_INSIDE = 1 << 0,
  IS_IN_VIEW = 1 << 1,
  IS_VISITED = 1 << 2,
  /**
   * A tile fire is burning here. Still Alive, Release 5-2.
   *
   * A flag rather than a set of decorations because the spread loop asks the
   * question hundreds of times per turn and decorates as a side effect of the
   * answer being yes. `EFFECT_ONFIRE` is added and removed alongside the flag, so
   * the two must always be changed together -- `setTileOnFire` and
   * `extinguishOnFireTile` are the only places that do.
   */
  IS_ON_FIRE = 1 << 3,
  /**
   * This tile has already burnt, so there is no flammable material left.
   * Still Alive, Release 6-1.
   *
   * Separate from `IS_ON_FIRE` and it matters: a burnt tile must not re-ignite by
   * spreading, or a single fire would creep across a whole building one layer at
   * a time and never stop.
   */
  IS_SCORCHED = 1 << 4,
}

export class Tile {
  private modelId: number;
  private flags: number = TileFlags.NONE;
  private decorations: string[] | null = null;

  constructor(model: TileModel) {
    this.modelId = model.id;
  }

  get model(): TileModel {
    return Models.tiles.get(this.modelId);
  }

  set model(value: TileModel) {
    this.modelId = value.id;
  }

  get isInside(): boolean {
    return (this.flags & TileFlags.IS_INSIDE) !== 0;
  }

  set isInside(value: boolean) {
    if (value) this.flags |= TileFlags.IS_INSIDE;
    else this.flags &= ~TileFlags.IS_INSIDE;
  }

  get isOnFire(): boolean {
    return (this.flags & TileFlags.IS_ON_FIRE) !== 0;
  }

  set isOnFire(value: boolean) {
    if (value) this.flags |= TileFlags.IS_ON_FIRE;
    else this.flags &= ~TileFlags.IS_ON_FIRE;
  }

  get isScorched(): boolean {
    return (this.flags & TileFlags.IS_SCORCHED) !== 0;
  }

  set isScorched(value: boolean) {
    if (value) this.flags |= TileFlags.IS_SCORCHED;
    else this.flags &= ~TileFlags.IS_SCORCHED;
  }

  /**
   * Burn this tile out: no flammable material left.
   *
   * Kept as a method rather than a bare `isScorched = true` so the flag and its
   * meaning stay together.
   *
   * **This is only the flag.** The scorch *decoration* is added by
   * `RogueGame.scorchBurntTile`, which is the C#'s method of the same name and
   * pairs the two deliberately: the flag means "no fuel left to burn", the drawing
   * is the temporary evidence that a fire was here, and `Map.isInflammableTile`
   * reads the flag while only the player ever sees the drawing. Calling this
   * directly scorches a tile with nothing to show for it -- which is what the port
   * did for its whole life before the drawing was wired, and why the damage tiers
   * had nowhere to go.
   */
  scorchTile(): void {
    this.isScorched = true;
  }

  get isInView(): boolean {
    return (this.flags & TileFlags.IS_IN_VIEW) !== 0;
  }

  set isInView(value: boolean) {
    if (value) this.flags |= TileFlags.IS_IN_VIEW;
    else this.flags &= ~TileFlags.IS_IN_VIEW;
  }

  get isVisited(): boolean {
    return (this.flags & TileFlags.IS_VISITED) !== 0;
  }

  set isVisited(value: boolean) {
    if (value) this.flags |= TileFlags.IS_VISITED;
    else this.flags &= ~TileFlags.IS_VISITED;
  }

  get hasDecorations(): boolean {
    return this.decorations !== null && this.decorations.length > 0;
  }

  get getDecorations(): readonly string[] | null {
    return this.decorations;
  }

  addDecoration(imageId: string): void {
    if (!this.decorations) {
      this.decorations = [];
    }
    if (!this.decorations.includes(imageId)) {
      this.decorations.push(imageId);
    }
  }

  hasDecoration(imageId: string): boolean {
    if (!this.decorations) return false;
    return this.decorations.includes(imageId);
  }

  removeDecoration(imageId: string): void {
    if (!this.decorations) return;
    const idx = this.decorations.indexOf(imageId);
    if (idx !== -1) {
      this.decorations.splice(idx, 1);
      if (this.decorations.length === 0) {
        this.decorations = null;
      }
    }
  }

  removeAllDecorations(): void {
    this.decorations = null;
  }
}
