/**
 * Day phase enum — port of the C# DayPhase enum in WorldTime.cs.
 */
export enum DayPhase {
  SUNSET,     // 18h
  EVENING,    // 19–23h
  MIDNIGHT,   // 0h
  DEEP_NIGHT, // 1–5h
  SUNRISE,    // 6h
  MORNING,    // 7–11h
  MIDDAY,     // 12h
  AFTERNOON,  // 13–17h
}

/**
 * Game clock — direct port of WorldTime.cs.
 * One turn = 1/30 of an in-game hour.
 */
export class WorldTime {
  static readonly TURNS_PER_HOUR = 30;
  static readonly TURNS_PER_DAY  = WorldTime.TURNS_PER_HOUR * 24;

  private _turnCounter = 0;
  private _day         = 0;
  private _hour        = 0;
  private _phase       = DayPhase.MIDNIGHT;
  private _isNight     = true;
  private _strikeOfMidnight = false;
  private _strikeOfMidday   = false;

  constructor(turnCounter = 0) {
    if (turnCounter < 0) throw new RangeError("turnCounter must be >= 0");
    this._turnCounter = turnCounter;
    this.recomputeDate();
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  get turnCounter(): number    { return this._turnCounter; }
  get day(): number            { return this._day; }
  get hour(): number           { return this._hour; }
  get phase(): DayPhase        { return this._phase; }
  get isNight(): boolean       { return this._isNight; }
  get isStrikeOfMidnight(): boolean { return this._strikeOfMidnight; }
  get isStrikeOfMidday(): boolean   { return this._strikeOfMidday; }

  set turnCounter(value: number) {
    const prevPhase = this._phase;
    this._turnCounter = value;
    this.recomputeDate();
    const newPhase = this._phase;
    this._strikeOfMidnight = newPhase === DayPhase.MIDNIGHT && prevPhase !== DayPhase.MIDNIGHT;
    this._strikeOfMidday   = newPhase === DayPhase.MIDDAY   && prevPhase !== DayPhase.MIDDAY;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private recomputeDate(): void {
    const counter = this._turnCounter;
    this._day  = Math.floor(counter / WorldTime.TURNS_PER_DAY);
    this._hour = Math.floor((counter % WorldTime.TURNS_PER_DAY) / WorldTime.TURNS_PER_HOUR);

    switch (this._hour) {
      case 0:  this._phase = DayPhase.MIDNIGHT;   this._isNight = true;  break;
      case 1: case 2: case 3: case 4: case 5:
               this._phase = DayPhase.DEEP_NIGHT; this._isNight = true;  break;
      case 6:  this._phase = DayPhase.SUNRISE;    this._isNight = false; break;
      case 7: case 8: case 9: case 10: case 11:
               this._phase = DayPhase.MORNING;    this._isNight = false; break;
      case 12: this._phase = DayPhase.MIDDAY;     this._isNight = false; break;
      case 13: case 14: case 15: case 16: case 17:
               this._phase = DayPhase.AFTERNOON;  this._isNight = false; break;
      case 18: this._phase = DayPhase.SUNSET;     this._isNight = true;  break;
      default: this._phase = DayPhase.EVENING;    this._isNight = true;  break;
    }
  }

  // ── Formatting ────────────────────────────────────────────────────────────

  toString(): string {
    return `day ${this._day} hour ${String(this._hour).padStart(2, "0")}`;
  }

  static makeTimeDurationMessage(turns: number): string {
    if (turns < WorldTime.TURNS_PER_HOUR) return "less than an hour";
    if (turns < WorldTime.TURNS_PER_DAY) {
      const h = Math.floor(turns / WorldTime.TURNS_PER_HOUR);
      return h === 1 ? "about 1 hour" : `about ${h} hours`;
    }
    const d = Math.floor(turns / WorldTime.TURNS_PER_DAY);
    return d === 1 ? "about 1 day" : `about ${d} days`;
  }
}
