export class Abilities {
  static readonly NONE = new Abilities();

  /**
   * A live animal rather than a person. Still Alive, Release 7-5.
   *
   * The distinction that matters is *insanity*: butchering a human costs sanity,
   * butchering a dead rabbit does not, because a rabbit was food anyway. The
   * fork models it as a flag on the model rather than inferring it from a list of
   * animal ids, which is the right call -- the AI, the butcher and the sanity
   * rule all need to ask the same question and none of them should own the list.
   *
   * Set on `FERAL_DOG`, `RABBIT` and `CHICKEN` -- the C# sets it on all three
   * (GameActors.cs:970, 994, 1021) and all three are now shipped models, so
   * `RogueGame.ButcherMeat`'s meat switch resolves all three of its cases. Note
   * it is *not* the same set as `GameActors.isUnintelligentAnimal`, which is
   * rabbits and chickens only: the dog is intelligent, just edible.
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
