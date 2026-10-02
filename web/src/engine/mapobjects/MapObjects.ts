import { MapObject, MapObjectBreak, MapObjectFire } from "@data/MapObject";
import { WorldTime } from "@engine/WorldTime";
import { StateMapObject } from "@data/StateMapObject";

export class DoorWindow extends StateMapObject {
  static readonly BASE_HITPOINTS = 40;

  static readonly STATE_CLOSED = 1;
  static readonly STATE_OPEN = 2;
  static readonly STATE_BROKEN = 3;

  private readonly closedImageId: string;
  private readonly openImageId: string;
  private readonly brokenImageId: string;
  isWindow: boolean = false;
  private _barricadePoints: number = 0;

  constructor(
    name: string,
    closedImageId: string,
    openImageId: string,
    brokenImageId: string,
    hitPoints: number
  ) {
    super(name, closedImageId, MapObjectBreak.BREAKABLE, MapObjectFire.BURNABLE, hitPoints);
    this.closedImageId = closedImageId;
    this.openImageId = openImageId;
    this.brokenImageId = brokenImageId;
    this.setState(DoorWindow.STATE_CLOSED);
  }

  get isOpen(): boolean { return this.state === DoorWindow.STATE_OPEN; }
  get isClosed(): boolean { return this.state === DoorWindow.STATE_CLOSED; }
  get isBroken(): boolean { return this.state === DoorWindow.STATE_BROKEN; }

  get barricadePoints(): number {
    return this._barricadePoints;
  }

  set barricadePoints(value: number) {
    if (value > 0 && this._barricadePoints <= 0) {
      this.jumpLevel--;
      this.isWalkable = false;
    } else if (value <= 0 && this._barricadePoints > 0) {
      this.setState(this.state);
    }
    this._barricadePoints = Math.max(0, value);
  }

  get isBarricaded(): boolean {
    return this._barricadePoints > 0;
  }

  override get isTransparent(): boolean {
    if (this._barricadePoints > 0) return false;
    if (this.state === DoorWindow.STATE_OPEN) {
      if (this.fireState === MapObjectFire.ONFIRE) return false;
      return true;
    }
    return super.isTransparent;
  }

  override setState(newState: number): void {
    switch (newState) {
      case DoorWindow.STATE_OPEN:
        this.imageId = this.openImageId;
        this.isWalkable = true;
        break;
      case DoorWindow.STATE_CLOSED:
        this.imageId = this.closedImageId;
        this.isWalkable = false;
        break;
      case DoorWindow.STATE_BROKEN:
        this.imageId = this.brokenImageId;
        this.breakState = MapObjectBreak.BROKEN;
        this.hitPoints = 0;
        this._barricadePoints = 0;
        this.isWalkable = true;
        break;
      default:
        break;
    }
    super.setState(newState);
  }
}

export class Fortification extends MapObject {
  static readonly SMALL_BASE_HITPOINTS = Math.floor(DoorWindow.BASE_HITPOINTS / 2);
  static readonly LARGE_BASE_HITPOINTS = DoorWindow.BASE_HITPOINTS;

  constructor(name: string, imageId: string, hitPoints: number) {
    super(name, imageId, MapObjectBreak.BREAKABLE, MapObjectFire.BURNABLE, hitPoints);
  }
}

export class PowerGenerator extends StateMapObject {
  static readonly STATE_OFF = 0;
  static readonly STATE_ON = 1;

  private readonly offImageId: string;
  private readonly onImageId: string;

  constructor(name: string, offImageId: string, onImageId: string) {
    super(name, offImageId);
    this.offImageId = offImageId;
    this.onImageId = onImageId;
    this.setState(PowerGenerator.STATE_OFF);
  }

  get isOn(): boolean {
    return this.state === PowerGenerator.STATE_ON;
  }

  override setState(newState: number): void {
    super.setState(newState);
    if (newState === PowerGenerator.STATE_OFF) {
      this.imageId = this.offImageId;
    } else if (newState === PowerGenerator.STATE_ON) {
      this.imageId = this.onImageId;
    }
  }

  togglePower(): void {
    this.setState(this.state === PowerGenerator.STATE_OFF ? PowerGenerator.STATE_ON : PowerGenerator.STATE_OFF);
  }
}

export class Board extends MapObject {
  text: string[];

  constructor(name: string, imageId: string, text: string[]) {
    super(name, imageId);
    this.text = text;
  }
}

/**
 * Fuel-bearing map objects. Still Alive, Release 7-1 and 7-6.
 *
 * The C# declares `Barrel`, `Campfire` and `Car` as three independent classes
 * that each carry the same pair of ints, and reads them back out with three
 * `as` casts. That is reproduced here rather than tidied into a shared base:
 * the burn loop's three-way `instanceof` is a direct transcription of the C#,
 * and a base class would have made the specs one level deeper for no gain.
 *
 * The fuel is *not* the object's hit points. It is wood (or petrol, for a car)
 * measured in turns of burn, and it only drains while the thing is alight.
 */
export class Barrel extends MapObject {
  /**
   * A full barrel is a day of burning. 720 is not a round number anyone chose;
   * it is `TURNS_PER_DAY`, and it is worth writing as that because the campfire
   * below is a three-hour tank and the pairing is otherwise arbitrary.
   */
  static readonly MAX_FUEL_UNITS = WorldTime.TURNS_PER_DAY;

  fuelUnits: number;
  readonly maxFuelUnits: number;

  constructor(
    name: string,
    imageId: string,
    breakState: MapObjectBreak,
    fuelUnits: number,
  ) {
    super(name, imageId, breakState, MapObjectFire.BURNABLE, DoorWindow.BASE_HITPOINTS);
    this.fuelUnits = fuelUnits;
    this.maxFuelUnits = Barrel.MAX_FUEL_UNITS;
  }
}

export class Campfire extends MapObject {
  /** A campfire is a three-hour tank, not a day like a barrel. */
  static readonly MAX_FUEL_UNITS = WorldTime.TURNS_PER_HOUR * 3;

  fuelUnits: number;
  readonly maxFuelUnits: number;

  constructor(
    name: string,
    imageId: string,
    breakState: MapObjectBreak,
    fuelUnits: number,
  ) {
    super(name, imageId, breakState, MapObjectFire.BURNABLE, DoorWindow.BASE_HITPOINTS);
    this.fuelUnits = fuelUnits;
    this.maxFuelUnits = Campfire.MAX_FUEL_UNITS;
  }
}

/**
 * A car. Still Alive, Release 7-1.
 *
 * Two things here are counter-intuitive and both are faithful:
 *
 * - **`UNINFLAMMABLE` with zero hit points.** A car is a *fuel source*, not a
 *   fire. It cannot be set alight by spreading tile fire, so the C#'s
 *   "deliberately exempting Car fires" comment is enforced by the fire state
 *   rather than by a check in the burn loop. A car only loses its fuel when it
 *   explodes, which zeroes the tank outright.
 * - **A maximum of 99, not `TURNS_PER_DAY`.** Car fuel is siphoned into a
 *   jerry can as an ammo-like stack, so 99 is the stack limit, not a burn time.
 */
export class Car extends MapObject {
  static readonly MAX_FUEL_UNITS = 99;

  fuelUnits: number;
  readonly maxFuelUnits: number;

  constructor(
    name: string,
    imageId: string,
    breakState: MapObjectBreak,
    fuelUnits: number,
  ) {
    super(name, imageId, breakState, MapObjectFire.UNINFLAMMABLE, 0);
    this.fuelUnits = fuelUnits;
    this.maxFuelUnits = Car.MAX_FUEL_UNITS;
  }
}
