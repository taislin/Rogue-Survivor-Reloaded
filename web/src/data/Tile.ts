import { Models } from "./Models";
import type { TileModel } from "./TileModel";

export const enum TileFlags {
  NONE = 0,
  IS_INSIDE = 1 << 0,
  IS_IN_VIEW = 1 << 1,
  IS_VISITED = 1 << 2,
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
