/**
 * Seeded pseudo-random number generator — port of DiceRoller.cs.
 *
 * The C# version wraps System.Random (a linear-congruential generator).
 * We use a simple Mulberry32 PRNG which is fast, seedable, and
 * produces similar quality output without needing the .NET stdlib.
 */
export class DiceRoller {
  private state: number;

  constructor(seed?: number) {
    this.state = seed ?? (Date.now() >>> 0);
  }

  /** Mulberry32 — returns a float in [0, 1). */
  private next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  }

  /**
   * Roll in range [min, max).  Mirrors C# `Roll(min, max)`.
   */
  roll(min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(this.next() * (max - min));
  }

  /** Returns a float in [0, 1). */
  rollFloat(): number {
    return this.next();
  }

  /**
   * Returns true with the given percentage chance (0–100).
   * Mirrors `RollChance(int chance)`.
   */
  rollChance(chance: number): boolean {
    return this.roll(0, 100) < chance;
  }

  /** Shuffle an array in place (Fisher-Yates). */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
