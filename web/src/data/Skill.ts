export class Skill {
  readonly id: number;
  level: number = 0;

  constructor(id: number) {
    this.id = id;
  }
}

export class SkillTable {
  private table: Map<number, Skill> | null = null;

  constructor(startingSkills?: Iterable<Skill>) {
    if (startingSkills) {
      for (const sk of startingSkills) {
        this.addSkill(sk);
      }
    }
  }

  get skills(): Iterable<Skill> | null {
    if (!this.table) return null;
    return this.table.values();
  }

  get skillsList(): number[] | null {
    if (!this.table) return null;
    return Array.from(this.table.values()).map(s => s.id);
  }

  get countSkills(): number {
    return this.table ? this.table.size : 0;
  }

  get countTotalSkillLevels(): number {
    if (!this.table) return 0;
    let sum = 0;
    for (const s of this.table.values()) {
      sum += s.level;
    }
    return sum;
  }

  getSkill(id: number): Skill | null {
    if (!this.table) return null;
    return this.table.get(id) ?? null;
  }

  getSkillLevel(id: number): number {
    const sk = this.getSkill(id);
    return sk ? sk.level : 0;
  }

  addSkill(sk: Skill): void {
    if (!this.table) {
      this.table = new Map<number, Skill>();
    }
    if (this.table.has(sk.id)) {
      throw new Error(`Skill ID ${sk.id} already in table`);
    }
    this.table.set(sk.id, sk);
  }

  addOrIncreaseSkill(id: number): void {
    if (!this.table) {
      this.table = new Map<number, Skill>();
    }
    let sk = this.getSkill(id);
    if (!sk) {
      sk = new Skill(id);
      this.table.set(id, sk);
    }
    sk.level++;
  }

  decOrRemoveSkill(id: number): void {
    if (!this.table) return;
    const sk = this.getSkill(id);
    if (!sk) return;
    sk.level--;
    if (sk.level <= 0) {
      this.table.delete(id);
      if (this.table.size === 0) {
        this.table = null;
      }
    }
  }
}
