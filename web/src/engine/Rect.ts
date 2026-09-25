import { Point } from "./Point";

/**
 * Axis-aligned integer rectangle — mirrors System.Drawing.Rectangle.
 */
export class Rect {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly width: number,
    readonly height: number,
  ) {}

  get left(): number   { return this.x; }
  get top(): number    { return this.y; }
  get right(): number  { return this.x + this.width; }
  get bottom(): number { return this.y + this.height; }

  get topLeft(): Point     { return new Point(this.x, this.y); }
  get topRight(): Point    { return new Point(this.right, this.y); }
  get bottomLeft(): Point  { return new Point(this.x, this.bottom); }
  get bottomRight(): Point { return new Point(this.right, this.bottom); }

  contains(p: Point): boolean {
    return (
      p.x >= this.x &&
      p.x < this.right &&
      p.y >= this.y &&
      p.y < this.bottom
    );
  }

  intersects(other: Rect): boolean {
    return (
      this.x < other.right &&
      this.right > other.x &&
      this.y < other.bottom &&
      this.bottom > other.y
    );
  }

  inflate(dx: number, dy: number): Rect {
    return new Rect(
      this.x - dx,
      this.y - dy,
      this.width + 2 * dx,
      this.height + 2 * dy,
    );
  }

  equals(other: Rect): boolean {
    return (
      this.x === other.x &&
      this.y === other.y &&
      this.width === other.width &&
      this.height === other.height
    );
  }

  toString(): string {
    return `{x:${this.x} y:${this.y} w:${this.width} h:${this.height}}`;
  }

  static readonly Empty = new Rect(0, 0, 0, 0);
}
