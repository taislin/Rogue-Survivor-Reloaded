export class BlastAttack {
  readonly radius: number;
  readonly damage: readonly number[];
  readonly canDamageObjects: boolean;
  readonly canDestroyWalls: boolean;

  constructor(
    radius: number,
    damage: number[],
    canDamageObjects: boolean,
    canDestroyWalls: boolean
  ) {
    if (damage.length !== radius + 1) {
      throw new Error("damage.length !== radius + 1");
    }
    this.radius = radius;
    this.damage = [...damage];
    this.canDamageObjects = canDamageObjects;
    this.canDestroyWalls = canDestroyWalls;
  }
}
