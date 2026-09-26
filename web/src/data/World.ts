import { Weather } from "./Weather";
import { District } from "./District";

export class World {
  private readonly districtsGrid: (District | null)[][];
  readonly size: number;
  weather: Weather = Weather.CLEAR;
  nextWeatherCheckTurn: number = 0;

  constructor(size: number) {
    if (size <= 0) {
      throw new RangeError("size <= 0");
    }
    this.size = size;
    this.districtsGrid = [];
    for (let x = 0; x < size; x++) {
      const col: (District | null)[] = [];
      for (let y = 0; y < size; y++) {
        col.push(null);
      }
      this.districtsGrid.push(col);
    }
  }

  /** C# World.CoordToString – district coordinates to string [A-Z][0-9]. */
  static CoordToString(x: number, y: number): string {
    return `${String.fromCharCode(65 + x)}${y}`;
  }

  getDistrict(x: number, y: number): District | null {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) {
      throw new RangeError(`Coordinates out of bounds (${x}, ${y})`);
    }
    return this.districtsGrid[x][y];
  }

  setDistrict(x: number, y: number, district: District): void {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) {
      throw new RangeError(`Coordinates out of bounds (${x}, ${y})`);
    }
    this.districtsGrid[x][y] = district;
  }

  trimToBounds(pt: { x: number; y: number }): void {
    if (pt.x < 0) pt.x = 0;
    if (pt.x >= this.size) pt.x = this.size - 1;
    if (pt.y < 0) pt.y = 0;
    if (pt.y >= this.size) pt.y = this.size - 1;
  }

  static coordToString(x: number, y: number): string {
    return `${String.fromCharCode(65 + x)}${y}`;
  }
}
