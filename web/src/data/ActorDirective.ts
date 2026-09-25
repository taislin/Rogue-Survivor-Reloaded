export enum ActorCourage {
  COWARD = 0,
  CAUTIOUS = 1,
  COURAGEOUS = 2,
}

export class ActorDirective {
  canTakeItems: boolean = true;
  canFireWeapons: boolean = true;
  canThrowGrenades: boolean = true;
  canSleep: boolean = true;
  canTrade: boolean = true;
  courage: ActorCourage = ActorCourage.CAUTIOUS;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.canTakeItems = true;
    this.canFireWeapons = true;
    this.canThrowGrenades = true;
    this.canSleep = true;
    this.canTrade = true;
    this.courage = ActorCourage.CAUTIOUS;
  }

  static courageString(c: ActorCourage): string {
    switch (c) {
      case ActorCourage.CAUTIOUS: return "Cautious";
      case ActorCourage.COURAGEOUS: return "Courageous";
      case ActorCourage.COWARD: return "Coward";
      default: return "Unknown";
    }
  }
}
