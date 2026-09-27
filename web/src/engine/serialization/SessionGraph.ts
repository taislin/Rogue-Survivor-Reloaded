/**
 * Session graph serialisation — the machinery.
 *
 * `Session.save` writes the session's scalars; the world/map object graph is
 * still missing, which is why a save cannot be loaded today. This file is the
 * frame for putting it back.
 *
 * ## Why this cannot be `JSON.stringify`
 *
 * The C# gets save/load for free: `Session.SaveBin` hands the whole object graph
 * to a `BinaryFormatter`, which walks fields, preserves shared references and
 * handles cycles. The port has JSON, and the graph is a knot — `Map` -> `Actor`
 * -> `Location` -> `Map`, `Actor.targetActor` -> `Actor`, `Item.owner` ->
 * `Actor` — so `JSON.stringify(world)` throws `Converting circular structure to
 * JSON`. Every reference has to become an id and be resolved in a second pass,
 * by hand.
 *
 * ## Why it is versioned and refused rather than partial
 *
 * A load that restores some of the world and silently drops the rest is the
 * failure mode this project keeps paying for (§1.1c: an `undefined` stat still
 * produces valid engine behaviour). So `GRAPH_VERSION` is written into the save
 * and `Session.load` refuses anything that does not carry a complete graph at
 * this version. The consequence is deliberate and worth stating plainly: until
 * every class below is implemented, **every save is unloadable**, and that is
 * the correct behaviour rather than a placeholder to be worked around.
 */

/**
 * Bumped whenever the graph format changes incompatibly.
 *
 * A save carrying any other version is refused, exactly as the C# refuses a
 * format it cannot read (`Session.Load` returns false for an unknown
 * `SaveFormat`) and as "VERSION NOT COMPATIBLE" in `DoLoadGame` means.
 */
export const GRAPH_VERSION = 1;

/**
 * The classes that still need `serialize`/`deserialize` before a save can carry
 * a world.
 *
 * Kept here rather than in the test so the two cannot drift, and asserted by
 * `tests/save-graph-coverage.test.ts` in both directions: a class that gains a
 * serialiser must leave this list, and a class on this list must not have one.
 * That turns "the serialiser covers 3 of these 22" from something a reader has
 * to notice into something the suite reports.
 *
 * Order is roughly the dependency order: a map needs its tiles, its district and
 * its zones; an actor needs its model, faction, location and sheet.
 */
export const PENDING_GRAPH_CLASSES: readonly string[] = [
  // World / map frame.
  "World",
  "District",
  "Map",
  "Tile",
  "WorldTime",
  "Zone",
  "Exit",
  "OdorScent",
  "TimedTask",
  // Things that live on a map.
  "Actor",
  "ActorSheet",
  "Doll",
  "Inventory",
  "SkillTable",
  "Item",
  "MapObject",
  "Corpse",
  "Location",
  // Session-level state that references the graph.
  "Scoring",
  "UniqueActors",
  "UniqueItems",
  "UniqueMaps",
];

/**
 * Ids for the objects that are referenced from more than one place.
 *
 * A `WeakMap` rather than a `Map`, so an id table built during a save does not
 * keep a whole city alive until the next GC. Ids are per-serialisation, never
 * persisted: they are a transport detail, and baking them into the file would
 * make the format depend on traversal order.
 */
export class SerializationContext {
  private readonly ids = new WeakMap<object, number>();
  private readonly objects: object[] = [];
  private nextId = 1;

  /** The id for `value`, assigning one on first sight. Null stays null. */
  idOf(value: object | null): number | null {
    if (value === null) return null;
    const existing = this.ids.get(value);
    if (existing !== undefined) return existing;
    const id = this.nextId++;
    this.ids.set(value, id);
    this.objects.push(value);
    return id;
  }

  /** The object an id was assigned to, for the resolving pass. */
  resolve(id: number): object {
    const value = this.objects[id - 1];
    if (value === undefined) throw new Error(`unresolved reference id ${id}`);
    return value;
  }

  /** How many objects have been given an id — the size of the id table. */
  get count(): number {
    return this.objects.length;
  }
}
