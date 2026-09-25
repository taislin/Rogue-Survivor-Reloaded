import { MapObject, MapObjectBreak, MapObjectFire } from "./MapObject";

export class StateMapObject extends MapObject {
  private _state: number = 0;

  constructor(
    name: string,
    hiddenImageId: string,
    breakable: MapObjectBreak = MapObjectBreak.UNBREAKABLE,
    burnable: MapObjectFire = MapObjectFire.UNINFLAMMABLE,
    hitPoints: number = 0
  ) {
    super(name, hiddenImageId, breakable, burnable, hitPoints);
  }

  get state(): number {
    return this._state;
  }

  setState(newState: number): void {
    this._state = newState;
  }
}
