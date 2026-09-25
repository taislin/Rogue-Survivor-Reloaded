import { Item } from "@data/Item";
import { ItemModel } from "@data/ItemModel";

export const enum TrackingFlags {
  NONE = 0,
  FOLLOWER_AND_LEADER = 1 << 0,
  UNDEADS = 1 << 1,
  BLACKOPS_FACTION = 1 << 2,
  POLICE_FACTION = 1 << 3,
}

export class ItemTrackerModel extends ItemModel {
  readonly tracking: TrackingFlags;
  readonly maxBatteries: number;
  readonly hasClock: boolean;

  constructor(
    aName: string,
    theNames: string,
    imageId: string,
    tracking: TrackingFlags,
    maxBatteries: number,
    hasClock: boolean
  ) {
    super(aName, theNames, imageId);
    this.tracking = tracking;
    this.maxBatteries = maxBatteries;
    this.hasClock = hasClock;
    this.dontAutoEquip = true;
  }
}

export class ItemTracker extends Item {
  private _batteries: number;
  readonly tracking: TrackingFlags;

  constructor(model: ItemModel) {
    super(model);
    if (!(model instanceof ItemTrackerModel)) {
      throw new Error("model is not an ItemTrackerModel");
    }
    this.tracking = model.tracking;
    this._batteries = model.maxBatteries;
  }

  get trackerModel(): ItemTrackerModel {
    return this.model as ItemTrackerModel;
  }

  get canTrackFollowersOrLeader(): boolean {
    return (this.tracking & TrackingFlags.FOLLOWER_AND_LEADER) !== 0;
  }

  get canTrackUndeads(): boolean {
    return (this.tracking & TrackingFlags.UNDEADS) !== 0;
  }

  get canTrackBlackOps(): boolean {
    return (this.tracking & TrackingFlags.BLACKOPS_FACTION) !== 0;
  }

  get canTrackPolice(): boolean {
    return (this.tracking & TrackingFlags.POLICE_FACTION) !== 0;
  }

  get hasClock(): boolean {
    return this.trackerModel.hasClock;
  }

  get batteries(): number {
    return this._batteries;
  }

  set batteries(val: number) {
    this._batteries = Math.max(0, Math.min(val, this.trackerModel.maxBatteries));
  }

  get isFullyCharged(): boolean {
    return this._batteries >= this.trackerModel.maxBatteries;
  }
}
