import { Point } from "@engine/Point";
import type { Map as GameMap } from "./Map";

export enum DistrictKind {
  GENERAL = 0,
  RESIDENTIAL = 1,
  SHOPPING = 2,
  GREEN = 3,
  BUSINESS = 4,
  _COUNT = 5,
}

export class District {
  readonly worldPosition: Point;
  readonly kind: DistrictKind;
  name: string = "";

  private readonly mapsList: GameMap[] = [];
  private _entryMap: GameMap | null = null;
  private _sewersMap: GameMap | null = null;
  private _subwayMap: GameMap | null = null;

  constructor(worldPos: Point, kind: DistrictKind) {
    this.worldPosition = worldPos;
    this.kind = kind;
  }

  get maps(): readonly GameMap[] {
    return this.mapsList;
  }

  get countMaps(): number {
    return this.mapsList.length;
  }

  get entryMap(): GameMap | null {
    return this._entryMap;
  }

  set entryMap(value: GameMap | null) {
    if (this._entryMap) this.removeMap(this._entryMap);
    this._entryMap = value;
    if (value) this.addMap(value);
  }

  get sewersMap(): GameMap | null {
    return this._sewersMap;
  }

  set sewersMap(value: GameMap | null) {
    if (this._sewersMap) this.removeMap(this._sewersMap);
    this._sewersMap = value;
    if (value) this.addMap(value);
  }

  get subwayMap(): GameMap | null {
    return this._subwayMap;
  }

  set subwayMap(value: GameMap | null) {
    if (this._subwayMap) this.removeMap(this._subwayMap);
    this._subwayMap = value;
    if (value) this.addMap(value);
  }

  get hasSubway(): boolean {
    return this._subwayMap !== null;
  }

  addMap(map: GameMap): void {
    if (!this.mapsList.includes(map)) {
      map.district = this;
      this.mapsList.push(map);
    }
  }

  addUniqueMap(map: GameMap): void {
    this.addMap(map);
  }

  getMap(index: number): GameMap | null {
    if (index < 0 || index >= this.mapsList.length) return null;
    return this.mapsList[index];
  }

  removeMap(map: GameMap): void {
    const idx = this.mapsList.indexOf(map);
    if (idx !== -1) {
      this.mapsList.splice(idx, 1);
      map.district = null;
    }
  }
}
