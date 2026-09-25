/**
 * Integer 2-D point — mirrors System.Drawing.Point.
 */
export class Point {
  constructor(
    readonly x: number,
    readonly y: number,
  ) {}

  add(other: Point): Point {
    return new Point(this.x + other.x, this.y + other.y);
  }

  subtract(other: Point): Point {
    return new Point(this.x - other.x, this.y - other.y);
  }

  equals(other: Point): boolean {
    return this.x === other.x && this.y === other.y;
  }

  distanceSquared(other: Point): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return dx * dx + dy * dy;
  }

  distance(other: Point): number {
    return Math.sqrt(this.distanceSquared(other));
  }

  /** Chebyshev ("chessboard") distance — used for range checks. */
  chebyshev(other: Point): number {
    return Math.max(Math.abs(this.x - other.x), Math.abs(this.y - other.y));
  }

  toString(): string {
    return `(${this.x}, ${this.y})`;
  }

  static readonly Zero = new Point(0, 0);
}
