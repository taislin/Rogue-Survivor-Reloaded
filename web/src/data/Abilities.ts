export class Abilities {
  static readonly NONE = new Abilities();

  /**
   * A live animal rather than a person. Still Alive, Release 7-6.
   *
   * The distinction that matters is *insanity*: butchering a human costs sanity,
   * butchering a dead rabbit does not, because a rabbit was food anyway. The
   * fork models it as a flag on the model rather than inferring it from a list of
   * animal ids, which is the right call -- the AI, the butcher and the sanity
   * rule all need to ask the same question and none of them should own the list.
   *
   * Set on `RABBIT` and `CHICKEN`, which are the only two models in the port that
   * set it. `FERAL_DOG` is a third in the C#'s meat switch but the port has no
   * such model yet, so the switch's `default` arm is what covers it.
   */
  isLivingAnimal: boolean = false;
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
