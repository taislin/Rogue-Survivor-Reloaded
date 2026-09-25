import { ActorController } from "./ActorController";
import type { ActorOrder } from "./ActorOrder";
import type { ActorDirective } from "./ActorDirective";

export abstract class AIController extends ActorController {
  abstract get order(): ActorOrder | null;
  abstract get directives(): ActorDirective;
  abstract set directives(val: ActorDirective);
  abstract setOrder(newOrder: ActorOrder | null): void;
}
