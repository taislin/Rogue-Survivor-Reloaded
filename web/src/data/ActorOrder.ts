import { Location } from "./Location";

export enum ActorTasks {
  BARRICADE_ONE = 0,
  BARRICADE_MAX = 1,
  GUARD = 2,
  PATROL = 3,
  DROP_ALL_ITEMS = 4,
  BUILD_SMALL_FORTIFICATION = 5,
  BUILD_LARGE_FORTIFICATION = 6,
  REPORT_EVENTS = 7,
  SLEEP_NOW = 8,
  FOLLOW_TOGGLE = 9,
  WHERE_ARE_YOU = 10,
}

export class ActorOrder {
  readonly task: ActorTasks;
  readonly location: Location;

  constructor(task: ActorTasks, location: Location) {
    this.task = task;
    this.location = location;
  }

  toString(): string {
    const pos = this.location.position;
    switch (this.task) {
      case ActorTasks.BARRICADE_ONE:
        return `barricade one (${pos.x},${pos.y})`;
      case ActorTasks.BARRICADE_MAX:
        return `barricade max (${pos.x},${pos.y})`;
      case ActorTasks.BUILD_LARGE_FORTIFICATION:
        return `build large fortification (${pos.x},${pos.y})`;
      case ActorTasks.BUILD_SMALL_FORTIFICATION:
        return `build small fortification (${pos.x},${pos.y})`;
      case ActorTasks.DROP_ALL_ITEMS:
        return "drop all items";
      case ActorTasks.GUARD:
        return `guard (${pos.x},${pos.y})`;
      case ActorTasks.PATROL:
        return `patrol (${pos.x},${pos.y})`;
      case ActorTasks.REPORT_EVENTS:
        return "reporting events to leader";
      case ActorTasks.SLEEP_NOW:
        return "sleep there";
      case ActorTasks.FOLLOW_TOGGLE:
        return "stop/start following";
      case ActorTasks.WHERE_ARE_YOU:
        return "reporting position";
      default:
        return "unhandled task";
    }
  }
}
