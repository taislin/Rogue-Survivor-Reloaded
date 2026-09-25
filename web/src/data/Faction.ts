export class Faction {
  id: number = 0;
  readonly name: string;
  readonly memberName: string;
  leadOnlyBySameFaction: boolean = false;
  private readonly enemies: Faction[] = [];

  constructor(name: string, memberName: string) {
    this.name = name;
    this.memberName = memberName;
  }

  get enemyList(): readonly Faction[] {
    return this.enemies;
  }

  addEnemy(other: Faction): void {
    if (!this.enemies.includes(other)) {
      this.enemies.push(other);
    }
  }

  isEnemyOf(other: Faction): boolean {
    return other !== this && this.enemies.includes(other);
  }
}
