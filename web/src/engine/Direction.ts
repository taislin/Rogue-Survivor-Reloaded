import { Point } from "./Point";

/**
 * The 8 compass directions + NEUTRAL.
 * Direct port of Direction.cs — same index scheme (N=0 clockwise to NW=7).
 */
export class Direction {
  // ── The 9 singletons ─────────────────────────────────────────────────────
  static readonly NEUTRAL = new Direction(-1, "neutral", 0, 0);
  static readonly N  = new Direction(0, "N",   0, -1);
  static readonly NE = new Direction(1, "NE", +1, -1);
  static readonly E  = new Direction(2, "E",  +1,  0);
  static readonly SE = new Direction(3, "SE", +1, +1);
  static readonly S  = new Direction(4, "S",   0, +1);
  static readonly SW = new Direction(5, "SW", -1, +1);
  static readonly W  = new Direction(6, "W",  -1,  0);
  static readonly NW = new Direction(7, "NW", -1, -1);

  /** All 8 directions, clockwise starting North. */
  static readonly COMPASS: readonly Direction[] = [
    Direction.N, Direction.NE, Direction.E, Direction.SE,
    Direction.S, Direction.SW, Direction.W, Direction.NW,
  ];

  /** Cardinal-only subset. */
  static readonly COMPASS_4: readonly Direction[] = [
    Direction.N, Direction.E, Direction.S, Direction.W,
  ];

  // ── Instance ──────────────────────────────────────────────────────────────
  readonly index: number;
  readonly name: string;
  /** Unit vector of this direction. */
  readonly dx: number;
  readonly dy: number;
  /** Pre-computed normalized vector components. */
  readonly nx: number;
  readonly ny: number;

  private constructor(index: number, name: string, dx: number, dy: number) {
    this.index = index;
    this.name  = name;
    this.dx    = dx;
    this.dy    = dy;
    const len  = Math.sqrt(dx * dx + dy * dy);
    this.nx    = len === 0 ? 0 : dx / len;
    this.ny    = len === 0 ? 0 : dy / len;
  }

  // ── Static helpers ────────────────────────────────────────────────────────

  static fromVector(dx: number, dy: number): Direction | null {
    for (const d of Direction.COMPASS) {
      if (d.dx === dx && d.dy === dy) return d;
    }
    return null;
  }

  static approximateFromVector(dx: number, dy: number): Direction {
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return Direction.N;
    const nx = dx / len;
    const ny = dy / len;

    let best: Direction = Direction.N;
    let bestErr = Infinity;
    for (const d of Direction.COMPASS) {
      const err = Math.abs(nx - d.nx) + Math.abs(ny - d.ny);
      if (err < bestErr) { best = d; bestErr = err; }
    }
    return best;
  }

  static fromPoint(p: Point): Direction | null {
    return Direction.fromVector(p.x, p.y);
  }

  static right(d: Direction): Direction {
    return Direction.COMPASS[(d.index + 1) % 8];
  }

  static left(d: Direction): Direction {
    return Direction.COMPASS[((d.index - 1) + 8) % 8];
  }

  static opposite(d: Direction): Direction {
    return Direction.COMPASS[(d.index + 4) % 8];
  }

  /** Returns the Point displaced from `p` in this direction. */
  applyTo(p: Point): Point {
    return new Point(p.x + this.dx, p.y + this.dy);
  }

  toString(): string {
    return this.name;
  }
}
