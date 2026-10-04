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
   * Every player-controlled actor in the world, in map order.
   *
   * **Additive, and deliberately not a `GRAPH_VERSION` bump.** `MULTIPLAYER_PLAN.md`
   * §6 item 8 asks for "`players[]` … with a `GRAPH_VERSION` bump to refuse older
   * saves". The bump is declined, for the reason `Session.armyHelicopterRescueMap`
   * already records for the same shape of change: *"an absent key is simply a
   * default — an old save restores with no rescue site, which is what it had."*
   * Bumping here would refuse **every existing single-player save** to distinguish
   * two formats that are byte-identical when there is one player, and multiplayer
   * does not exist yet, so there is no save it would protect.
   *
   * So `players` is a root key riding in plain JSON: a save written before this
   * change has no `players` key at all, and reading it falls back to wrapping
   * `player`. That is the whole migration.
   *
   * World-wide rather than `currentMap`-only, which is the actual fix: two players
   * in two districts is the case that matters, and a `currentMap` scan cannot see
   * the second one. The walk is free next to the serialisation it accompanies — a
   * 3x3 world is 4.6 MB of JSON and ~970 actors.
   */
  players: Actor[];
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
  worldTimeTurn: number,
  players: readonly Actor[] = []
): GraphData {
  const writer = new GraphWriter(CLASS_SPECS);
  const root: Record<string, Enc> = {
    world: writer.ref(world),
    currentMap: writer.ref(currentMap),
    player: writer.ref(player),
    // The whole roster, additive beside the single `player` above rather than
    // replacing it. See `LoadedGraph.players` for why there is no version bump.
    //
    // Written even when it holds one actor, so a save from a two-player game is
    // distinguishable from a one-player one *by inspection* — which is what makes
    // "why did my second player vanish" a question a bug report can answer. The
    // fallback on read means the key is never load-bearing for correctness, only
    // for diagnosis.
    players: players.map((a) => writer.ref(a)),
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
  /*
   * The roster, with the migration in one line.
   *
   * A save written before `players` existed has no such key, so `root.players` is
   * `undefined` rather than `null` — and `undefined` is the whole difference
   * between "one player, recorded the old way" and "no players at all". Reading
   * it as `?? [player]` covers both, and an empty `players` on a save that *does*
   * have the key is left empty rather than second-guessed, because that would
   * resurrect a player the writer deliberately did not record.
   */
  const roster = (root.players as Enc[] | undefined) ?? (player === null ? [] : [root.player as Enc]);
  const players = roster.map((enc) => reader.resolve(enc as RefMark) as Actor);
  const worldTimeTurn = root.worldTime as number;
  if (!Number.isInteger(worldTimeTurn) || worldTimeTurn < 0) {
    throw new Error(`save carries world turn ${String(worldTimeTurn)}, which is not a turn`);
  }

  return {
    world,
    currentMap,
    scoring,
    player,
    players,
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
 * Every player-controlled actor in the world, in a stable order.
 *
 * The order is district-grid then map then actor-list, which is the order the
 * world generates in, so two saves of the same world produce the same array — the
 * property a round-trip test needs to compare it without sorting.
 *
 * `MULTIPLAYER_PLAN.md` §6 item 8. Distinct from {@link findPlayerActor}, which is
 * kept because it answers a *different* question: "the one player", used where a
 * caller genuinely wants a single actor and the caller is single-player. The two
 * were one function until the player count stopped being one, and folding them
 * back together would mean every reader had to re-derive "which one" for itself.
 */
export function findPlayerActors(world: World): Actor[] {
  const out: Actor[] = [];
  for (let x = 0; x < world.size; x++) {
    for (let y = 0; y < world.size; y++) {
      const district = world.getDistrict(x, y);
      if (district === null) continue;
      for (const map of district.maps) {
        for (const actor of map.actors) {
          if (actor.isPlayer) out.push(actor);
        }
      }
    }
  }
  return out;
}

/**
 * Gives restored actors their player controllers, returning the ones it gave one
 * to.
 *
 * Split out here so the one caller (`RogueGame.LoadGame`) and the tests agree on
 * what "put the player back" means: a `PlayerController`, which is also what
 * makes `actor.isPlayer` true and therefore what `RefreshPlayer` looks for.
 *
 * **Was `reattachPlayer(actor: Actor | null): Actor | null`**, singular, and it is
 * gone rather than kept alongside: the roster call subsumes it exactly, and a
 * second entry point with a different null-handling contract is one more thing to
 * keep in step. Its only remaining caller was a test, and a function kept alive
 * by a test is dead code with a green tick.
 *
 * The `controller == null` guard is the same one, and for the same reason: a
 * restored actor arrives with no controller because controllers are not part of
 * the graph, but a caller may pass an actor that already has one (a test that
 * saved and loaded in-process), and clobbering it would be a silent behaviour
 * change rather than a repair.
 */
export function reattachPlayers(actors: readonly Actor[]): Actor[] {
  const out: Actor[] = [];
  for (const actor of actors) {
    if (actor == null) continue;
    if (actor.controller == null) actor.controller = new PlayerController();
    out.push(actor);
  }
  return out;
}
