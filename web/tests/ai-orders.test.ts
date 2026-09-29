import { describe, it, expect, beforeAll } from "vitest";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { Point } from "@engine/Point";
import { Models } from "@data/Models";
import { Actor } from "@data/Actor";
import { Location } from "@data/Location";
import { ActorOrder, ActorTasks } from "@data/ActorOrder";
import { Map as GameMap } from "@data/Map";
import { ActorID } from "@gameplay/GameActors";
import { FactionID } from "@gameplay/GameFactions";
import { TileID } from "@gameplay/GameTiles";
import { CivilianAI } from "@gameplay/ai/CivilianAI";
import { OrderableAI } from "@gameplay/ai/OrderableAI";
import { DoorWindow } from "@engine/mapobjects/MapObjects";
import { ItemBarricadeMaterial, ItemBarricadeMaterialModel } from "@engine/items/ItemMisc";
import { Item } from "@data/Item";
import { ItemModel } from "@data/ItemModel";
import { ActionWait } from "@engine/actions/Actions";

/**
 * Orders: the ten things a follower can be told to do, and the one rule that
 * overrides all ten.
 *
 * `OrderableAI` sat at **0% branch coverage** — 139 branches, about a point of
 * the project's total — and it is the base class of every ordered actor in the
 * game: civilians, gangsters, the CHAR guard and soldiers. A file that decides
 * what a follower does with its turn, unexercised, is the largest untested
 * surface outside `RogueGame` itself.
 *
 * The expectations come from the dispatch in `OrderableAI.executeOrder` and the
 * C# strategy order it mirrors, not from reading what the port happens to do.
 *
 * **Why `executeOrder` and not `getAction`.** `getAction` never returns null: if
 * `selectAction` finds nothing it hands back an `ActionWait`. So "the order was
 * cancelled" is not observable at that level — and going through it would also be
 * non-deterministic, because `CivilianAI.selectAction` equips the best carried
 * item *before* it looks at the order, so an actor holding a better item than its
 * default never reaches the dispatch. The dispatch is the unit under test, so it
 * is called directly, through the same structural cast the rest of the suite uses
 * for `protected` members.
 *
 * The centrepiece is the leader check. Every order is cancelled when the actor
 * has no leader, and that is the most consequential rule in the file: a follower
 * left alive after its leader dies would otherwise keep executing "barricade that
 * door" forever, with nothing to report to. It is worth one test per task rather
 * than one test for the rule, because the rule is enforced at the top of a ten-way
 * switch — a task added to the switch without it would not be caught by a single
 * assertion.
 *
 * One game per file: `Session.get()` is a process-wide singleton and the model
 * databases self-register into `Models` statics.
 */

let game: HeadlessRunner["rogueGame"];
let map: GameMap;
let floorTile: ReturnType<typeof Models.tiles.get>;

const CIVILIAN = ActorID.MALE_CIVILIAN;
const SURVIVORS = FactionID.TheSurvivors;

/** Every task the dispatch handles. A new one added to `ActorTasks` fails the
 *  completeness test below, which is the point of keeping the list here. */
const ALL_TASKS: ActorTasks[] = [
  ActorTasks.BARRICADE_ONE,
  ActorTasks.BARRICADE_MAX,
  ActorTasks.BUILD_SMALL_FORTIFICATION,
  ActorTasks.BUILD_LARGE_FORTIFICATION,
  ActorTasks.DROP_ALL_ITEMS,
  ActorTasks.GUARD,
  ActorTasks.PATROL,
  ActorTasks.REPORT_EVENTS,
  ActorTasks.SLEEP_NOW,
  ActorTasks.FOLLOW_TOGGLE,
  ActorTasks.WHERE_ARE_YOU,
];

/** `BaseAI` is abstract and its members are `protected`; the suite reaches them
 *  through a structural cast rather than a subclass. */
type AnyAI = Record<string, (...args: never[]) => unknown>;

beforeAll(async () => {
  const runner = new HeadlessRunner(13579);
  const metrics = await runner.run({ worldSize: 1, maxTurns: 1, isUndead: true, bot: false });
  expect(metrics.error, "world generation threw").toBeUndefined();
  game = runner.rogueGame;
  map = game.session.currentMap!;
  floorTile = Models.tiles.get(TileID.FLOOR_CONCRETE);
}, 120_000);

/** Flat open floor, nothing else. Scents matter: the smell sensor reads a 3x3
 *  neighbourhood, and a leftover trail is read as one the test placed. */
function scenario(): void {
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) map.setTileModelAt(x, y, floorTile!);
  }
  for (const a of [...map.actors]) map.removeActor(a);
  for (const o of [...map.mapObjects]) map.removeMapObject(o);
  for (const s of [...map.scents]) map.removeScent(s);
  map.localTime.turnCounter = 12 * 30;
}

function spawn(modelId: ActorID, faction: FactionID, at: Point): Actor {
  const actor = Models.actors.get(modelId).createAnonymous(game.gameFactions.get(faction), 0);
  map.placeActor(actor, at);
  return actor;
}

function closedDoor(): DoorWindow {
  const door = new DoorWindow("door", "door_closed", "door_open", "door_broken", DoorWindow.BASE_HITPOINTS);
  // `canActorBarricadeDoor` refuses anything that is not closed or broken, and a
  // bare `new DoorWindow` is neither — so the state is part of "a door you can
  // barricade", not an incidental detail of the fixture.
  door.setState(DoorWindow.STATE_CLOSED);
  return door;
}

/** A stack of barricading material, which `canActorBarricadeDoor` requires. */
function barricadeMaterial(quantity = 5): ItemBarricadeMaterial {
  const model = new ItemBarricadeMaterialModel("wooden board", "wooden boards", "wood", 10);
  const item = new ItemBarricadeMaterial(model);
  item.quantity = quantity;
  return item;
}

function controllerFor(actor: Actor): AnyAI {
  const ai = new CivilianAI() as unknown as AnyAI;
  (ai as unknown as { takeControl(a: Actor): void }).takeControl(actor);
  return ai;
}

/** The dispatch, reached directly. `percepts`/`exploration` are the two inputs
 *  the real callers pass; null is what a caller with no percepts would pass. */
function executeOrder(ai: AnyAI, order: ActorOrder): unknown {
  return (ai as unknown as {
    executeOrder(g: unknown, o: ActorOrder, p: unknown, e: unknown): unknown;
  }).executeOrder(game, order, null, null);
}

/** The order's own description, so a red test says which order broke. */
const taskName = (t: ActorTasks): string =>
  new ActorOrder(t, new Location(map, new Point(1, 1))).toString();

/** A civilian at `at`, with a live leader it is following. */
function following(at = new Point(20, 20)): { ai: AnyAI; actor: Actor; leader: Actor } {
  const leader = spawn(CIVILIAN, SURVIVORS, at);
  const actor = spawn(CIVILIAN, SURVIVORS, new Point(at.x + 1, at.y));
  leader.addFollower(actor);
  return { ai: controllerFor(actor), actor, leader };
}

describe("an order needs a leader", () => {
  it.each(ALL_TASKS)("%s is cancelled with no leader at all", (task) => {
    scenario();
    const actor = spawn(CIVILIAN, SURVIVORS, new Point(20, 20));
    const ai = controllerFor(actor);
    expect(actor.leader, "the fixture gave the actor a leader").toBeNull();

    const action = executeOrder(
      ai,
      new ActorOrder(task, new Location(map, new Point(21, 20))),
    );

    expect(action, `an order ran with no leader: ${taskName(task)}`).toBeNull();
  });

  it("a dead leader cancels the order too", () => {
    // Not covered by the test above: `isDead` is a separate condition from
    // `null`, and a leader that *was* alive and then died is the case that
    // actually happens. Following a corpse is the bug.
    scenario();
    const { ai } = following();
    const leader = map.getActorAtPoint(new Point(20, 20))!;
    expect(leader.isDead, "the leader started dead").toBe(false);
    leader.isDead = true;

    const action = executeOrder(
      ai,
      new ActorOrder(ActorTasks.WHERE_ARE_YOU, new Location(map, new Point(20, 20))),
    );

    expect(action, "an order ran with a dead leader").toBeNull();
  });

  it("covers every task, so a new one cannot join the dispatch untested", () => {
    // The list above is a copy of the `ActorTasks` enum, and a copy is exactly
    // the thing that goes stale. If someone adds a task and implements it, this
    // fails and points at the omission — the alternative is a new task shipping
    // with no test, which is how the file reached 0% in the first place.
    const every = Object.values(ActorTasks).filter((v): v is ActorTasks => typeof v === "number");
    expect(
      [...every].sort((a, b) => a - b),
      "ActorTasks and the tested list have diverged",
    ).toEqual([...ALL_TASKS].sort((a, b) => a - b));
  });

  it("refuses an order whose task the dispatch does not handle", () => {
    // The `default:` arm throws rather than returning null, so a task added to
    // `ActorTasks` without a case is loud instead of silently idle. Pinned
    // because "loud" is the point, and softening it to a null return would be a
    // silent behaviour change for a bot player.
    scenario();
    const { ai } = following();

    expect(() =>
      executeOrder(ai, new ActorOrder(999 as ActorTasks, new Location(map, new Point(20, 20)))),
    ).toThrow();
  });
});

describe("a new order resets the state the last one built up", () => {
  function stale(): AnyAI {
    scenario();
    const { ai } = following();
    const state = ai as unknown as { m_ReachedPatrolPoint: boolean; m_ReportStage: number };
    state.m_ReachedPatrolPoint = true;
    state.m_ReportStage = 3;
    return ai;
  }

  it("clears the reached-patrol flag and the report stage", () => {
    // `setOrder` is the only place this happens. A follower re-tasked mid-report
    // would otherwise resume at the old stage and skip lines of a report it was
    // halfway through saying.
    const ai = stale();

    (ai as unknown as { setOrder(o: ActorOrder | null): void }).setOrder(
      new ActorOrder(ActorTasks.GUARD, new Location(map, new Point(22, 20))),
    );

    const state = ai as unknown as { m_ReachedPatrolPoint: boolean; m_ReportStage: number };
    expect(state.m_ReachedPatrolPoint, "the patrol flag survived a new order").toBe(false);
    expect(state.m_ReportStage, "the report stage survived a new order").toBe(0);
  });

  it("clearing the order to null resets too, rather than only a new one", () => {
    // The cancel path. `setOrder(null)` is how the game recalls a follower and
    // it goes through the same method, so it must not be the one caller that
    // skips the reset.
    const ai = stale();

    (ai as unknown as { setOrder(o: ActorOrder | null): void }).setOrder(null);

    const state = ai as unknown as { m_ReachedPatrolPoint: boolean; m_ReportStage: number };
    expect(state.m_ReachedPatrolPoint).toBe(false);
    expect(state.m_ReportStage).toBe(0);
  });
});

describe("orders with a live leader", () => {
  /** A soldier who can actually build and barricade, with material, plus a
   *  closed door two tiles away. The three preconditions are asserted inside so a
   *  null return names the missing one. */
  function builderWithDoor(): { ai: AnyAI; actor: Actor; door: DoorWindow } {
    scenario();
    const leader = spawn(CIVILIAN, SURVIVORS, new Point(20, 20));
    const actor = spawn(ActorID.ARMY_NATIONAL_GUARD, SURVIVORS, new Point(21, 20));
    leader.addFollower(actor);
    const ai = controllerFor(actor);
    actor.actionPoints = 100;
    expect(actor.inventory, "the soldier has no inventory at all").not.toBeNull();
    actor.inventory!.addAll(barricadeMaterial());
    map.placeMapObject(closedDoor(), new Point(22, 20));
    const door = map.getMapObjectAtPoint(new Point(22, 20)) as DoorWindow;
    expect(door, "the fixture placed no door").toBeInstanceOf(DoorWindow);
    expect(actor.model.abilities.canBarricade, "the soldier cannot barricade at all").toBe(true);
    expect(
      game.rules.canActorBarricadeDoor(actor, door).ok,
      "the fixture's door is not barricadable",
    ).toBe(true);
    return { ai, actor, door };
  }

  const orderOf = (ai: AnyAI): unknown => (ai as unknown as { order: unknown }).order;

  it("barricades a door it is standing next to", () => {
    // The one order whose successful outcome is a single action rather than a
    // journey, so it is the cheapest way to reach the payload of the dispatch.
    const { ai } = builderWithDoor();

    const action = executeOrder(
      ai,
      new ActorOrder(ActorTasks.BARRICADE_ONE, new Location(map, new Point(22, 20))),
    );

    expect(action, "an adjacent barricadable door produced no action").not.toBeNull();
  });

  it("barricading one clears the order, so the follower does not repeat it", () => {
    // `executeBarricading` calls `setOrder(null)` when `toTheMax` is false. The
    // observable is the order itself: a follower told to "barricade one" that
    // kept the order would return and re-barricade the same door forever, which
    // is a livelock the player sees as a follower stuck on a door.
    const { ai } = builderWithDoor();
    const order = new ActorOrder(ActorTasks.BARRICADE_ONE, new Location(map, new Point(22, 20)));
    (ai as unknown as { setOrder(o: ActorOrder | null): void }).setOrder(order);

    executeOrder(ai, order);

    expect(orderOf(ai), "BARRICADE_ONE left the order standing").toBeNull();
  });

  it("barricading to the max keeps the order, so the follower comes back", () => {
    // The other arm of the same branch, and the reason `toTheMax` exists. These
    // two tests are the whole argument for the parameter: identical up to a
    // boolean, opposite outcomes.
    const { ai } = builderWithDoor();
    const order = new ActorOrder(ActorTasks.BARRICADE_MAX, new Location(map, new Point(22, 20)));
    (ai as unknown as { setOrder(o: ActorOrder | null): void }).setOrder(order);

    const action = executeOrder(ai, order);

    expect(action, "BARRICADE_MAX produced no action").not.toBeNull();
    expect(orderOf(ai), "BARRICADE_MAX dropped the order instead of keeping it").not.toBeNull();
  });

  it("a door it cannot reach makes it walk toward the door first", () => {
    // The `2.2 Move closer` arm: far away, the order is not abandoned, it is
    // approached. Asserted by position rather than by action class, because the
    // class is an implementation detail and the movement is what the player sees.
    scenario();
    const leader = spawn(CIVILIAN, SURVIVORS, new Point(20, 20));
    const actor = spawn(ActorID.ARMY_NATIONAL_GUARD, SURVIVORS, new Point(21, 20));
    leader.addFollower(actor);
    const ai = controllerFor(actor);
    actor.actionPoints = 100;
    actor.inventory!.addAll(barricadeMaterial());
    const far = new Point(28, 20);
    map.placeMapObject(closedDoor(), far);

    const action = executeOrder(
      ai,
      new ActorOrder(ActorTasks.BARRICADE_ONE, new Location(map, far)),
    ) as { perform(): void } | null;

    expect(action, "a distant barricadable door produced no action").not.toBeNull();
    const before = new Point(actor.location.position.x, actor.location.position.y);
    action!.perform();
    expect(
      actor.location.position.equals(before),
      "the follower did not move toward a door it was told to barricade",
    ).toBe(false);
  });

  it("will not barricade a door that is not a door or window", () => {
    // The `instanceof DoorWindow` guard. A stale order pointing at a tile whose
    // object has since been replaced must decline rather than throw, and the
    // decline is the whole contract.
    scenario();
    const { ai } = following();
    // No map object at all: the weakest form of "not a door".
    const action = executeOrder(
      ai,
      new ActorOrder(ActorTasks.BARRICADE_ONE, new Location(map, new Point(21, 20))),
    );

    expect(action, "an order barricaded an empty tile").toBeNull();
  });

  it("an order naming a different map is not obeyed", () => {
    // Every order carries a `Location`, and `Location.map` is nullable. An order
    // whose map is not the actor's must not act on coordinates that mean nothing
    // here — this is the check that stops a stale order moving an actor across
    // the world by accident.
    scenario();
    const { ai } = following();

    const action = executeOrder(
      ai,
      new ActorOrder(ActorTasks.BARRICADE_ONE, new Location(null, new Point(21, 20))),
    );

    expect(action, "an order on a null map was obeyed").toBeNull();
  });

  it("drop all items does nothing when the actor carries nothing", () => {
    // The empty-inventory arm. Pinned because the interesting arm needs a
    // populated inventory, and an empty one returning null is what shows the
    // "nothing to do" case is a deliberate null rather than a crash.
    scenario();
    const { ai, actor } = following();
    expect(actor.inventory?.isEmpty, "the actor has an inventory that is not empty").toBe(true);

    const action = executeOrder(
      ai,
      new ActorOrder(ActorTasks.DROP_ALL_ITEMS, new Location(map, new Point(20, 20))),
    );

    expect(action, "drop-all on an empty inventory invented an action").toBeNull();
  });

  it("drop all items drops what is carried", () => {
    // The other arm, and the reason the order exists.
    scenario();
    const { ai, actor } = following();
    actor.inventory!.addAll(new Item(new ItemModel("apple", "apples", "apple")));
    expect(actor.inventory!.countItems, "the item did not go into the inventory").toBe(1);

    const action = executeOrder(
      ai,
      new ActorOrder(ActorTasks.DROP_ALL_ITEMS, new Location(map, new Point(20, 20))),
    ) as { perform(): void } | null;

    expect(action, "drop-all on a loaded inventory did nothing").not.toBeNull();
    action!.perform();
    expect(actor.inventory!.countItems, "the item was not dropped").toBe(0);
  });

  it("reports its position when asked", () => {
    scenario();
    const { ai } = following();

    const action = executeOrder(
      ai,
      new ActorOrder(ActorTasks.WHERE_ARE_YOU, new Location(map, new Point(20, 20))),
    );

    expect(action, "WHERE_ARE_YOU produced no action").not.toBeNull();
  });
});

describe("guarding a post", () => {
  it("walks to the post when it is not there yet", () => {
    scenario();
    const { ai, actor } = following(new Point(20, 20));
    const post = new Point(24, 20);

    const action = executeOrder(
      ai,
      new ActorOrder(ActorTasks.GUARD, new Location(map, post)),
    ) as { perform(): void } | null;

    expect(action, "guarding a distant post produced no action").not.toBeNull();
    expect(action, "guarding a distant post did not move").not.toBeInstanceOf(ActionWait);
    action!.perform();
    expect(actor.location.position.equals(post), "the follower never reached the post").toBe(false);
  });

  it("waits once it is standing on the post, rather than trying to path into it", () => {
    // The other arm of the position check. On the post the guard is *supposed* to
    // stand still, and the fall-through ends in `ActionWait` — so this is the test
    // that says "arrived", as opposed to the one above that says "travelling".
    scenario();
    const { ai, actor } = following(new Point(20, 20));
    const post = new Point(21, 20); // exactly where `following` put the follower
    expect(
      actor.location.position.equals(post),
      "the fixture did not start the follower on the post",
    ).toBe(true);

    const action = executeOrder(
      ai,
      new ActorOrder(ActorTasks.GUARD, new Location(map, post)),
    );

    expect(action, "guarding the post it stands on produced no action").toBeInstanceOf(ActionWait);
  });
});

describe("patrolling latches the point it has reached", () => {
  it("keeps moving until it arrives, then stops asking", () => {
    // `m_ReachedPatrolPoint` is assigned on every pass while false, so it latches.
    // That latch is the difference between a patrol that settles and one that
    // walks to its point forever — and it is a field on the controller, not on the
    // order, which is why it is reset in `setOrder` rather than per order.
    scenario();
    const { ai, actor } = following(new Point(20, 20));
    const point = new Point(21, 20);
    expect(actor.location.position.equals(point), "the fixture did not start the follower on the point")
      .toBe(true);
    const internals = ai as unknown as { m_ReachedPatrolPoint: boolean };
    const setOrder = (o: ActorOrder): void =>
      (ai as unknown as { setOrder(v: ActorOrder | null): void }).setOrder(o);

    // `setOrder` first, because `executePatrol` reads `this.order` rather than the
    // `order` parameter it is handed. That is worth knowing rather than working
    // around: the dispatch passes the order down and patrol ignores it, so the two
    // can only ever agree because there is exactly one order on the controller.
    // Calling the dispatch with an order the controller does not hold is a state
    // the real code never reaches, and it crashes — which is how this line was
    // found.
    setOrder(new ActorOrder(ActorTasks.PATROL, new Location(map, point)));
    // Standing on the point: the flag should latch true on this pass.
    executeOrder(ai, new ActorOrder(ActorTasks.PATROL, new Location(map, point)));
    expect(internals.m_ReachedPatrolPoint, "standing on the patrol point did not latch it").toBe(true);

    // And with it latched, a *new* order to a different point does not re-latch
    // from the old position: the flag survives, which is what stops a patrolling
    // follower oscillating between two points.
    const away = new Point(26, 20);
    setOrder(new ActorOrder(ActorTasks.PATROL, new Location(map, away)));
    expect(
      internals.m_ReachedPatrolPoint,
      "handing the follower a new patrol point did not clear the latch",
    ).toBe(false);
    executeOrder(ai, new ActorOrder(ActorTasks.PATROL, new Location(map, away)));
    expect(internals.m_ReachedPatrolPoint, "a distant point latched as reached").toBe(false);
  });
});

describe("the controller table and the class tree agree", () => {
  it("soldiers and civilians are orderable, the sewers thing is not", () => {
    // A guard on two independent places that have to agree: the `defaultControllerFor`
    // table in `GameActors`, and the class hierarchy. They are edited separately,
    // and a mismatch is silent — an actor whose controller is not orderable simply
    // ignores every order the player gives it.
    const cases: Array<[ActorID, boolean]> = [
      [ActorID.MALE_CIVILIAN, true],
      [ActorID.ARMY_NATIONAL_GUARD, true],
      [ActorID.GANGSTA_MAN, true],
      [ActorID.CHAR_GUARD, true],
      [ActorID.SEWERS_THING, false],
    ];
    for (const [id, shouldBeOrderable] of cases) {
      const ctor = Models.actors.get(id).defaultControllerCtor;
      expect(ctor, `${ActorID[id]} has no default controller`).toBeDefined();
      const ai = new ctor!() as unknown as object;
      expect(
        ai instanceof OrderableAI,
        `${ActorID[id]}: expected orderable=${shouldBeOrderable}`,
      ).toBe(shouldBeOrderable);
    }
  });
});
