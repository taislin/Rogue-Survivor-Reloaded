import type { Map as GameMap } from "./Map";

export abstract class TimedTask {
  turnsLeft: number;

  constructor(turnsLeft: number) {
    this.turnsLeft = turnsLeft;
  }

  get isCompleted(): boolean {
    return this.turnsLeft <= 0;
  }

  tick(m: GameMap): void {
    if (--this.turnsLeft <= 0) {
      this.trigger(m);
    }
  }

  abstract trigger(m: GameMap): void;
}
