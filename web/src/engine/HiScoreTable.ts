/**
 * High scores - port of src/Engine/HiScoreTable.cs
 *
 * C# binary serialization → `localStorage` JSON.
 */

import { Scoring } from "@engine/Scoring";

export class HiScore {
  name = "";
  totalPoints = 0;
  difficultyPercent = 0;
  survivalPoints = 0;
  killPoints = 0;
  achievementPoints = 0;
  turnSurvived = 0;
  /** Reallife playing time in seconds. */
  playingTimeSeconds = 0;
  skillsDescription = "";
  death = "";

  static fromScoring(name: string, sc: Scoring, skillsDescription: string): HiScore {
    if (!sc) throw new Error("scoring");

    const hi = new HiScore();
    hi.achievementPoints = sc.achievementPoints;
    hi.death = sc.deathReason ?? "";
    hi.difficultyPercent = Math.floor(100 * sc.difficultyRating);
    hi.killPoints = sc.killPoints;
    hi.name = name;
    hi.playingTimeSeconds = sc.realLifePlayingTimeSeconds;
    hi.skillsDescription = skillsDescription;
    hi.survivalPoints = sc.survivalPoints;
    hi.totalPoints = sc.totalPoints;
    hi.turnSurvived = sc.turnsSurvived;
    return hi;
  }
}

export class HiScoreTable {
  static readonly DEFAULT_MAX_ENTRIES = 12;
  static readonly STORAGE_KEY = "rogue-survivor-hiscores";

  private readonly m_Table: HiScore[];
  private readonly m_MaxEntries: number;

  get count(): number {
    return this.m_Table.length;
  }

  get(index: number): HiScore {
    if (index < 0 || index >= this.m_Table.length) throw new Error("index");
    return this.m_Table[index];
  }

  constructor(maxEntries: number) {
    if (maxEntries < 1) throw new Error("maxEntries < 1");
    this.m_Table = [];
    this.m_MaxEntries = maxEntries;
  }

  clear(): void {
    for (let i = 0; i < this.m_MaxEntries; i++) {
      const hi = new HiScore();
      hi.death = "no death";
      hi.difficultyPercent = 0;
      hi.killPoints = 0;
      hi.name = "no one";
      hi.playingTimeSeconds = 0;
      hi.survivalPoints = 0;
      hi.totalPoints = 0;
      hi.turnSurvived = 0;
      hi.skillsDescription = "no skills";
      this.m_Table.push(hi);
    }
  }

  // ── Storing & Retrieving ────────────────────────────────────────────────
  register(hi: HiScore): boolean {
    let i = 0;
    while (i < this.m_Table.length && this.m_Table[i].totalPoints >= hi.totalPoints) {
      ++i;
    }

    // NOTE: C# uses `>` here (not `>=`), so a full table always reports success
    // even when the new entry is immediately trimmed. Ported as-is.
    if (i > this.m_MaxEntries) return false;

    this.m_Table.splice(i, 0, hi);
    while (this.m_Table.length > this.m_MaxEntries) {
      this.m_Table.splice(this.m_Table.length - 1, 1);
    }
    return true;
  }

  // ── Saving & Loading ────────────────────────────────────────────────────
  static save(table: HiScoreTable): void {
    localStorage.setItem(
      HiScoreTable.STORAGE_KEY,
      JSON.stringify({ maxEntries: table.m_MaxEntries, entries: table.m_Table })
    );
  }

  /** Try to load, null if failed. */
  static load(): HiScoreTable | null {
    try {
      const raw = localStorage.getItem(HiScoreTable.STORAGE_KEY);
      if (raw === null) return null;

      const data = JSON.parse(raw) as { maxEntries: number; entries: HiScore[] };
      const table = new HiScoreTable(data.maxEntries);
      for (const entry of data.entries) table.m_Table.push(Object.assign(new HiScore(), entry));
      return table;
    } catch {
      // failed to load hiscore table (no hiscores?)
      return null;
    }
  }

  static delete(): boolean {
    try {
      localStorage.removeItem(HiScoreTable.STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }
}
