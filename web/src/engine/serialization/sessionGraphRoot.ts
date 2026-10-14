/**
 * The session graph: the whole save, as one object.
 *
 * `Session.save` writes this, `Session.load` reads it. Everything below the root
 * is the object graph — see `SessionGraph.ts` for the format — and the root
 * itself is the handful of things that are not part of it: the world and the
 * current map, the clock, the scoring, the unique actors/items/maps, and the one
 * fact that cannot be derived — **which actor the player was**.
 *
 * ## The player is the interesting one
 *
 * C# serialises `Actor.m_Controller`, so a saved game arrives with its
 * `PlayerController` attached and `actor.isPlayer` is true again on load without
 * anyone thinking about it. The port does not carry controllers (see
 * `specs.ts`), so the writer looks for the player-controlled actor and records
 * it here, and `RogueGame.LoadGame` hands that actor a fresh controller. Without
 * it a load would restore a world in which nobody is the player: no `isPlayer`,
 * no view, and `RefreshPlayer` would find nothing to bind.
 */

import { Actor } from "@data/Actor";
import type { World } from "@data/World";
import type { Map as GameMap } from "@data/Map";
import { PlayerController } from "@data/PlayerController";
import { Scoring } from "@engine/Scoring";
import { UniqueActors, UniqueItems, UniqueMaps } from "@engine/Session";
import { GraphReader, GraphWriter, GRAPH_VERSION, type Enc, type GraphData, type RefMark } from "./SessionGraph";
import { CLASS_SPECS, decodeScoring, decodeUniques, encodeScoring, encodeUniques } from "./specs";

/** What `readSessionGraph` hands back, ready to be installed on a session. */
export interface LoadedGraph {
  world: World;
  currentMap: GameMap;
  scoring: Scoring;
  uniqueActors: UniqueActors;
  uniqueItems: UniqueItems;
  uniqueMaps: UniqueMaps;
  /**
   * The actor the player was controlling, or null.
   *
   * It comes back with no controller attached, because controllers are not part
   * of the graph. `RogueGame.LoadGame` is what gives it one.
   */
  player: Actor | null;
  /**
   * The global clock, as a turn number.
   *
   * Returned rather than installed: the caller holds a `Session` whose
   * `worldTime` getter *creates* a blank clock when the backing field is null, so
   * the value is written by `Session.load` through the field it owns.
   */
  worldTimeTurn: number;
}

/**
 * Writes the whole graph for a session.
 *
 * The session's own fields are read through the same accessors `load` writes
 * them back through, so the two cannot drift on which field of the session a
 * value lives in.
 */
export function writeSessionGraph(
  world: World,
  currentMap: GameMap,
  scoring: Scoring,
  uniques: { uniqueActors: UniqueActors; uniqueItems: UniqueItems; uniqueMaps: UniqueMaps },
  player: Actor | null,
  worldTimeTurn: number
): GraphData {
  const writer = new GraphWriter(CLASS_SPECS);
  const root: Record<string, Enc> = {
    world: writer.ref(world),
    currentMap: writer.ref(currentMap),
    player: writer.ref(player),
    // The global clock. Each map also carries its own `localTime`, which is a
    // different number: a district caught up in the background has turned a
    // different number of times from the world.
    worldTime: worldTimeTurn,
    scoring: encodeScoring(scoring, writer),
    uniques: encodeUniques(uniques, writer),
  };
  return writer.finish(root);
}

/**
 * Reads a graph back.
 *
 * Every way this can fail throws, and the caller is expected to let it: a
 * truncated save, a save from another build, a graph whose references do not
 * resolve. `Session.load` catches and refuses, which is the only correct
 * response — a world half-restored is worse than no world.
 */
export function readSessionGraph(data: GraphData): LoadedGraph {
  const reader = new GraphReader(data, CLASS_SPECS);
  const root = data.root as Record<string, Enc>;

  const world = reader.resolve(root.world as RefMark) as World;
  const currentMap = reader.resolve(root.currentMap as RefMark) as GameMap;
  const scoring = decodeScoring(root.scoring, reader);
  const uniques = decodeUniques(root.uniques, reader);
  const player = root.player === null ? null : (reader.resolve(root.player as RefMark) as Actor);
  const worldTimeTurn = root.worldTime as number;
  if (!Number.isInteger(worldTimeTurn) || worldTimeTurn < 0) {
    throw new Error(`save carries world turn ${String(worldTimeTurn)}, which is not a turn`);
  }

  return {
    world,
    currentMap,
    scoring,
    player,
    worldTimeTurn,
    uniqueActors: uniques.uniqueActors,
    uniqueItems: uniques.uniqueItems,
    uniqueMaps: uniques.uniqueMaps,
  };
}

/** The graph version a save carries, for the refusal check. */
export { GRAPH_VERSION };

/**
 * The actor on this map that the player was controlling, if any.
 *
 * `isPlayer` is derived from the controller (`_controller instanceof
 * PlayerController`), so that is what is asked — the same test `RefreshPlayer`
 * makes when it looks for the player after a load, which is why the two agree on
 * who the player is.
 */
export function findPlayerActor(map: GameMap): Actor | null {
  for (const actor of map.actors) {
    if (actor.isPlayer) return actor;
  }
  return null;
}

/**
 * Gives a restored actor its player controller.
 *
 * Split out here so the one caller (`RogueGame.LoadGame`) and the tests agree on
 * what "put the player back" means: a `PlayerController`, which is also what
 * makes `actor.isPlayer` true and therefore what `RefreshPlayer` looks for.
 */
export function reattachPlayer(actor: Actor | null): Actor | null {
  if (actor == null) return null;
  if (actor.controller == null) actor.controller = new PlayerController();
  return actor;
}

/**
 * Gives every *other* restored actor the controller its model says it should have.
 *
 * `_controller` is skipped for every actor in the graph, not only the player's
 * (see `specs.ts`), so a save read back is a world of actors and no controllers
 * at all — the probe that found this measured 0 of 881. `RogueGame.LoadGame`
 * runs `reattachPlayer` first and passes the player in here so it is left alone;
 * everyone else is picked up from `ActorModel.defaultControllerCtor`, which is
 * the same call `ActorModel.create` makes for a newly spawned one.
 *
 * Without it a load silently freezes the world: `advancePlayMap` gives a
 * controller-less actor a free action instead of a turn, so every NPC alive when
 * the save was written stops acting for the rest of the session. It is also what
 * made `DoTrade` throw `Cannot read properties of null (reading 'rateTradeOffer')`
 * — the first AI that *does* have a controller chats with one of the frozen ones
 * and reads a mind that is not there.
 *
 * Returns how many it rebuilt, so a caller (and a test) can tell a real pass from
 * an empty one.
 */
export function reattachControllers(world: World, player: Actor | null): number {
  let rebuilt = 0;
  for (let x = 0; x < world.size; x++) {
    for (let y = 0; y < world.size; y++) {
      const district = world.getDistrict(x, y);
      if (district === null) continue;
      for (const map of district.maps) {
        for (const actor of map.actors) {
          if (actor === player || actor.controller !== null) continue;
          // A model with no default controller is a real answer and is left as
          // it is: `advancePlayMap`'s null branch is the designed home for one.
          const ctor = actor.model.defaultControllerCtor;
          if (ctor === null) continue;
          actor.controller = new ctor();
          rebuilt++;
        }
      }
    }
  }
  return rebuilt;
}
