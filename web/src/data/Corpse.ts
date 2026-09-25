import { Point } from "@engine/Point";
import type { Actor } from "./Actor";

export class Corpse {
  readonly deadGuy: Actor;
  readonly turn: number;
  position: Point;
  hitPoints: number;
  readonly maxHitPoints: number;
  rotation: number;
  private _scale: number;
  draggedBy: Actor | null = null;

  constructor(
    deadGuy: Actor,
    hitPoints: number,
    maxHitPoints: number,
    corpseTurn: number,
    rotation: number,
    scale: number
  ) {
    this.deadGuy = deadGuy;
    this.turn = corpseTurn;
    this.position = deadGuy.location.position;
    this.hitPoints = hitPoints;
    this.maxHitPoints = maxHitPoints;
    this.rotation = rotation;
    this._scale = Math.max(0, Math.min(1, scale));
  }

  get scale(): number {
    return this._scale;
  }

  set scale(value: number) {
    this._scale = Math.max(0, Math.min(1, value));
  }

  get isDragged(): boolean {
    return this.draggedBy !== null && !this.draggedBy.isDead;
  }
}
