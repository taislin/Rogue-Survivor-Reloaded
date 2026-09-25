export class Abilities {
  static readonly NONE = new Abilities();

  isUndead: boolean = false;
  isUndeadMaster: boolean = false;
  canZombifyKilled: boolean = false;
  canTire: boolean = false;
  hasToEat: boolean = false;
  hasToSleep: boolean = false;
  hasSanity: boolean = false;
  canRun: boolean = false;
  canTalk: boolean = false;
  canUseMapObjects: boolean = false;
  canBashDoors: boolean = false;
  canBreakObjects: boolean = false;
  canJump: boolean = false;
  isSmall: boolean = false;
  hasInventory: boolean = false;
  canUseItems: boolean = false;
  canTrade: boolean = false;
  canBarricade: boolean = false;
  canPush: boolean = false;
  canJumpStumble: boolean = false;
  isLawEnforcer: boolean = false;
  isIntelligent: boolean = false;
  isRotting: boolean = false;
  canDisarm: boolean = true;

  // AI flags
  aiCanUseAIExits: boolean = false;
  aiNotInterestedInRangedWeapons: boolean = false;
  zombieAIExplore: boolean = false;

  constructor() {
    this.canDisarm = true;
  }
}
