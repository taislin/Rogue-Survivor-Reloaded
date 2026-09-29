/**
 * The graph codecs: one spec per class that gets a record, plus the inline
 * encoders for everything that rides along inside a field.
 *
 * Read `SessionGraph.ts` first — it explains the format, why fields are dumped
 * rather than listed, and why a shell is made with `Object.create`.
 *
 * ## The order of the specs matters
 *
 * `GraphWriter.specFor` takes the first spec whose `matches` returns true, so a
 * subclass has to be listed before its base: an `ItemGrenadePrimed` is an
 * `Item`, an `ItemExplosive` and an `ItemPrimedExplosive` at once, and only the
 * most specific spec records the fields the subclass actually has.
 *
 * ## Restore goes through the owner's own registration
 *
 * Anything the format does not carry — a map's `actorsByPos` index — is rebuilt
 * in the spec's `finish` hook, by calling `placeActor` / `addCorpse` where those
 * exist. Reconstructing an object and *forgetting* to register it produces an
 * object the engine cannot see: invisible to `getActorAt`, ignored by
 * `assertActorIntegrity`, and therefore a save that loads into a subtly
 * different game.
 */

import { Actor } from "@data/Actor";
import { ActorSheet } from "@data/ActorSheet";
import { Attack } from "@data/Attack";
import { Corpse } from "@data/Corpse";
import { Defence } from "@data/Defence";
import { District } from "@data/District";
import { Doll, DollBody } from "@data/Doll";
import { Inventory } from "@data/Inventory";
import { Item } from "@data/Item";
import { Location } from "@data/Location";
import { Exit, Map as GameMap } from "@data/Map";
import { MapObject } from "@data/MapObject";
import { OdorScent } from "@data/Odor";
import { Skill, SkillTable } from "@data/Skill";
import { StateMapObject } from "@data/StateMapObject";
import { TimedTask } from "@data/TimedTask";
import { Tile } from "@data/Tile";
import { Verb } from "@data/Verb";
import { World } from "@data/World";
import { Zone } from "@data/Zone";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { AchievementIDs, DifficultySide, KillData, Scoring } from "@engine/Scoring";
import { UniqueActors, UniqueItems, UniqueMaps } from "@engine/Session";
import { WorldTime } from "@engine/WorldTime";
import { TaskRemoveDecoration } from "@engine/tasks/TaskRemoveDecoration";
import { ItemAmmo, ItemMeleeWeapon, ItemRangedWeapon, ItemWeapon } from "@engine/items/ItemWeapon";
import { ItemBodyArmor } from "@engine/items/ItemBodyArmor";
import { ItemExplosive, ItemGrenade, ItemGrenadePrimed, ItemPrimedExplosive } from "@engine/items/ItemExplosive";
import { ItemFood } from "@engine/items/ItemFood";
import { ItemLight } from "@engine/items/ItemLight";
import { ItemMedicine } from "@engine/items/ItemMedicine";
import {
  ItemBarricadeMaterial,
  ItemEntertainment,
  ItemSprayPaint,
  ItemSprayScent,
} from "@engine/items/ItemMisc";
import { ItemTracker } from "@engine/items/ItemTracker";
import { ItemTrap } from "@engine/items/ItemTrap";
import {
  Barrel,
  Board,
  Campfire,
  Car,
  DoorWindow,
  Fortification,
  PowerGenerator,
} from "@engine/mapobjects/MapObjects";
import type { ClassSpec, Enc, FieldCodec, GraphWriter, ReadCtx, RefMark } from "./SessionGraph";

// ── Value types ─────────────────────────────────────────────────────────────

/**
 * Fails if `value` has an own field this encoding does not account for.
 *
 * Records are safe by construction — the writer dumps every own field — but an
 * *inline* class is encoded by hand, so a field added to it later would be
 * dropped in silence: the save would load, the game would play, and the new field
 * would be gone. That is the exact failure this project keeps paying for, so an
 * inline encoder states the fields it covers and this checks the rest.
 *
 * Cheap enough to run on every save: it is a key count on a few thousand small
 * objects, and it turns "a class gained a field" from a data-loss bug into an
 * error naming the class and the field.
 */
function assertFields(value: object, accounted: readonly string[], path: string): void {
  for (const key of Object.keys(value)) {
    if (!accounted.includes(key)) {
      throw new Error(
        `${path}.${key} is not carried by the graph format: add it to the encoder for ` +
          `${value.constructor?.name ?? "this class"}, or to its skip list if it is derived`
      );
    }
  }
}

const point: FieldCodec = {
  kind: "inline",
  encode: (p: Point) => [p.x, p.y],
  decode: (v) => new Point((v as number[])[0], (v as number[])[1]),
};

/**
 * `Attack` is immutable, and is copied out of the actor model — so it is a value
 * and not a record. It still has to be written out: equipping a weapon replaces
 * `actor.currentMeleeAttack` with the weapon's, which is not the model's unarmed
 * one, and re-deriving it from the inventory would have to know which item is
 * held.
 */
const attack: FieldCodec = {
  kind: "inline",
  encode: (a: Attack) => [
    a.kind,
    [a.verb.youForm, a.verb.heForm],
    a.hitValue,
    a.hit2Value,
    a.hit3Value,
    a.damageValue,
    a.staminaPenalty,
    a.disarmChance,
    a.range,
  ],
  decode: (v) => {
    const [kind, forms, hitValue, hit2Value, hit3Value, damage, stamina, disarm, range] = v as [
      number, string[], number, number, number, number, number, number, number,
    ];
    return new Attack(
      kind, new Verb(forms[0], forms[1]),
      hitValue, hit2Value, hit3Value, damage, stamina, disarm, range,
    );
  },
};

const defence: FieldCodec = {
  kind: "inline",
  encode: (d: Defence) => [d.value, d.protectionHit, d.protectionShot],
  decode: (v) => {
    const [value, protectionHit, protectionShot] = v as number[];
    return new Defence(value, protectionHit, protectionShot);
  },
};

/**
 * `WorldTime` is one authoritative number.
 *
 * `_day`, `_hour`, `_phase` and `_isNight` are all derived from `_turnCounter`,
 * and the constructor recomputes them, so a restored clock is a `new
 * WorldTime(turn)`. The two strike flags are per-turn edge detectors — a load is
 * not a turn, so they stay false.
 */
const worldTime: FieldCodec = {
  kind: "inline",
  encode: (t: WorldTime) => {
    // The four date fields and the two strike flags are not omissions: the
    // constructor recomputes the date, and a strike flag is a per-turn edge
    // detector that a load is not. They are listed so a *new* field is still caught.
    assertFields(
      t,
      ["_turnCounter", "_day", "_hour", "_phase", "_isNight", "_strikeOfMidnight", "_strikeOfMidday"],
      "WorldTime"
    );
    return t.turnCounter;
  },
  decode: (v) => new WorldTime(v as number),
};

/** `ItemFood.bestBefore` is a clock or nothing at all. */
const nullableWorldTime: FieldCodec = {
  kind: "inline",
  encode: (t: WorldTime | null) => (t === null ? null : t.turnCounter),
  decode: (v) => (v === null ? null : new WorldTime(v as number)),
};

const doll: FieldCodec = {
  kind: "inline",
  encode: (d: Doll) => {
    assertFields(d, ["body", "decorations"], "Doll");
    return [d.body.isMale, d.body.speed, (d as any).decorations];
  },
  decode: (v) => {
    const [isMale, speed, decorations] = v as [boolean, number, (string[] | null)[]];
    const out = new Doll(new DollBody(isMale, speed));
    // The array is dense and fixed-length by design (`new Array(_COUNT).fill(null)`),
    // so copying it wholesale is both correct and cheaper than replaying
    // `addDecoration` — which does *not* dedupe, so replaying it would be wrong
    // for a part that legitimately holds the same image twice.
    (out as any).decorations = decorations.map((list) => (list === null ? null : [...list]));
    return out;
  },
};

/** A `TrustRecord`: an actor reference and a number. */
const trustRecord: FieldCodec = {
  kind: "inline",
  encode: (r: { actor: Actor; trust: number }, w: GraphWriter) => [w.ref(r.actor), r.trust],
  decode: (v, ctx: ReadCtx) => {
    const [actor, trust] = v as [RefMark, number];
    return { actor: ctx.resolve(actor), trust };
  },
};

/**
 * A `Zone`: its name, its bounds, and its game attributes.
 *
 * These three are written as plain functions rather than as a `FieldCodec`
 * because they are used both on their own (a map's zone list) and as the
 * payload of another codec, and a `FieldCodec` would have to be handed a writer
 * it never uses.
 */
function encodeZone(z: Zone): Enc {
  assertFields(z, ["name", "bounds", "attributes"], "Zone");
  return [z.name, [z.bounds.x, z.bounds.y, z.bounds.width, z.bounds.height], encodeAttributes(z)];
}

function decodeZone(v: Enc): Zone {
  const [name, bounds, attributes] = v as [string, number[], Enc];
  const out = new Zone(name, new Rect(bounds[0], bounds[1], bounds[2], bounds[3]));
  const attrs = attributes as Record<string, unknown> | null;
  if (attrs != null) {
    for (const [key, value] of Object.entries(attrs)) out.setGameAttribute(key, value);
  }
  return out;
}

const zoneList: FieldCodec = {
  kind: "inline",
  encode: (list: Zone[]) => list.map(encodeZone),
  decode: (v) => (v as Enc[]).map(decodeZone),
};

/**
 * `Zone.attributes` is a `Map<string, any>`, and a JS `Map` stringifies to `{}`.
 *
 * The values are typed `any`, so they are encoded as plain JSON and the writer's
 * refusal applies to them too: a value that is a live object throws rather than
 * being written as `{}`.
 */
function encodeAttributes(z: Zone): Record<string, unknown> | null {
  const attributes = (z as any).attributes as globalThis.Map<string, unknown> | null;
  if (attributes == null || attributes.size === 0) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of attributes) out[key] = value;
  return out;
}

/** An `OdorScent`, positioned rather than referenced: it is only reachable
 * through its map's list and its position index. */
function encodeScent(s: OdorScent): Enc {
  assertFields(s, ["odor", "strength", "position"], "OdorScent");
  return [s.odor, s.strength, s.position.x, s.position.y];
}

function decodeScent(v: Enc): OdorScent {
  const [odor, strength, x, y] = v as [number, number, number, number];
  return new OdorScent(odor, strength, new Point(x, y));
}

const scentList: FieldCodec = {
  kind: "inline",
  encode: (list: OdorScent[]) => list.map(encodeScent),
  decode: (v) => (v as Enc[]).map(decodeScent),
};

/**
 * A `TimedTask`, tagged with its concrete class.
 *
 * `TimedTask` is abstract and the one subclass adds private fields, so the tag is
 * not optional: a save that wrote only `turnsLeft` would restore a task that ticks
 * and then does nothing.
 */
function encodeTask(t: TimedTask): Enc {
  if (t instanceof TaskRemoveDecoration) {
    const task = t as any;
    // The subclass's own fields are named here, which is what makes a *second*
    // TimedTask subclass a decision somebody has to make rather than a silent
    // omission: the `instanceof` guard above already refuses it, and this says why.
    assertFields(t, ["turnsLeft", "m_X", "m_Y", "m_imageID"], "TaskRemoveDecoration");
    return ["TaskRemoveDecoration", t.turnsLeft, task.m_X, task.m_Y, task.m_imageID];
  }
  throw new Error(`TimedTask subclass ${t.constructor.name} has no graph codec`);
}

function decodeTask(v: Enc): TimedTask {
  const [kind, turnsLeft, x, y, imageID] = v as [string, number, number, number, string];
  if (kind !== "TaskRemoveDecoration") throw new Error(`save contains an unknown TimedTask "${kind}"`);
  return new TaskRemoveDecoration(turnsLeft, x, y, imageID);
}

const timerList: FieldCodec = {
  kind: "inline",
  encode: (list: TimedTask[]) => list.map(encodeTask),
  decode: (v) => (v as Enc[]).map(decodeTask),
};

/**
 * The tile grid, as parallel arrays.
 *
 * This is the one place where "a record per object" would be ruinous: a 100x100
 * map is 10 000 tiles, so records would cost about that many objects of overhead
 * and roughly triple the file, for an identity nothing refers to. Model ids and
 * flags are dense numbers and go in as arrays; decorations are almost always
 * absent, so only the tiles that have any are written.
 *
 * The flags word carries `isInside`, `isInView` and `isVisited` together, which
 * is why the visited set — the thing the minimap cache is derived from — cannot
 * drift: there is one word, and it is written whole.
 */
const tilesGrid: FieldCodec = {
  kind: "inline",
  encode: (grid: Tile[][]) => {
    const width = grid.length;
    const height = width > 0 ? grid[0].length : 0;
    const models: number[] = [];
    const flags: number[] = [];
    const decorations: [number, string[]][] = [];
    for (let x = 0; x < width; x++) {
      const column = grid[x];
      for (let y = 0; y < height; y++) {
        const tile = column[y] as any;
        assertFields(tile, ["modelId", "flags", "decorations"], "Tile");
        // Stride is the column length, i.e. the map's *height*: the grid is
        // indexed [x][y], so a flat index has to step by the row, not by a
        // guessed maximum. Guessing 10 000 for a 50x50 map made the arrays 76x
        // longer than the data and a save 150 MB.
        const i = x * height + y;
        models[i] = tile.modelId as number;
        flags[i] = tile.flags as number;
        const deco = tile.decorations as string[] | null;
        if (deco != null && deco.length > 0) decorations.push([i, deco]);
      }
    }
    // Width and height travel with the arrays: the decoder has to allocate the
    // grid before it can be told anything else, and the tile count does not
    // determine the shape (a 4x9 map has 36 tiles too).
    return [width, height, models, flags, decorations];
  },
  decode: (v) => {
    const [width, height, models, flags, decorations] = v as [
      number, number, number[], number[], [number, string[]][],
    ];
    const grid: Tile[][] = [];
    for (let x = 0; x < width; x++) {
      const column: Tile[] = new Array(height);
      for (let y = 0; y < height; y++) {
        const i = x * height + y;
        // Shaped by hand rather than `new Tile(model)`: that would need a
        // `Models.tiles` lookup per tile, thousands of them per map, for a class
        // whose entire state is the three fields below.
        const tile = Object.create(Tile.prototype) as any;
        tile.modelId = models[i];
        tile.flags = flags[i];
        tile.decorations = null;
        column[y] = tile;
      }
      grid.push(column);
    }
    for (const [i, images] of decorations) {
      (grid[Math.floor(i / height)][i % height] as any).decorations = images;
    }
    return grid;
  },
};

/** An `Exit`, keyed by the position it leaves from. */
const exitsMap: FieldCodec = {
  kind: "inline",
  // The keys are `Map`'s positional encoding, carried through verbatim -- this
  // codec deliberately does not know the format, it only preserves it. See
  // `Map.key`.
  encode: (exits: globalThis.Map<number, Exit>, w: GraphWriter) =>
    [...exits.entries()].map(([key, exit]) => [
      key,
      w.ref(exit.toMap),
      exit.toPosition.x,
      exit.toPosition.y,
      exit.isAnAIExit,
    ]),
  decode: (v, ctx: ReadCtx) => {
    const out = new globalThis.Map<number, Exit>();
    for (const [key, toMap, x, y, isAI] of v as [number, RefMark | null, number, number, boolean][]) {
      const exit = new Exit(toMap === null ? null : ctx.resolve(toMap), new Point(x, y));
      exit.isAnAIExit = isAI;
      // The key *is* the source position, and `Exit` does not store it, so it is
      // written rather than re-derived from `toPosition` — which is where the exit
      // goes, not where it starts.
      out.set(key, exit);
    }
    return out;
  },
};

/** A `globalThis.Map<string, Inventory>` of ground items, keyed by position. */
const groundItems: FieldCodec = {
  kind: "inline",
  // Keys are `Map`'s positional encoding, carried through verbatim. See
  // `Map.key` and the note on `exitsMap`.
  encode: (inv: globalThis.Map<number, Inventory>, w: GraphWriter) =>
    [...inv.entries()].map(([key, inventory]) => [key, w.ref(inventory)]),
  decode: (v, ctx: ReadCtx) => {
    const out = new globalThis.Map<number, Inventory>();
    for (const [key, mark] of v as [number, RefMark][]) out.set(key, ctx.resolve(mark));
    return out;
  },
};

// ── World frame ─────────────────────────────────────────────────────────────

const worldSpec: ClassSpec = {
  name: "World",
  base: "World",
  matches: (v) => v instanceof World,
  create: () => Object.create(World.prototype),
  fields: {
    // The only field that is not a scalar: a dense grid of district references,
    // with holes for the districts nothing has generated yet.
    districtsGrid: {
      kind: "inline",
      encode: (grid: (District | null)[][], w: GraphWriter) => grid.map((column) => column.map((d) => w.ref(d))),
      decode: (v, ctx: ReadCtx) =>
        (v as (RefMark | null)[][]).map((column) =>
          column.map((mark) => (mark === null ? null : ctx.resolve(mark))),
        ),
    },
  },
};

const districtSpec: ClassSpec = {
  name: "District",
  base: "District",
  matches: (v) => v instanceof District,
  create: () => Object.create(District.prototype),
  fields: {
    worldPosition: point,
    /*
     * `mapsList` and the three named maps are both written, and they are not
     * redundant: the named maps are a *subset* of the list, because a district
     * also owns its sewer level and its hospital rooms, which have no named slot.
     *
     * They are restored by plain assignment rather than through the setters,
     * because each setter unhooks the old map (`old.district = null`) and hooks
     * the new one — on a shell that would rewrite the list being restored.
     */
    mapsList: { kind: "refList" },
    _entryMap: { kind: "ref" },
    _sewersMap: { kind: "ref" },
    _subwayMap: { kind: "ref" },
  },
};

const mapSpec: ClassSpec = {
  name: "Map",
  base: "Map",
  matches: (v) => v instanceof GameMap,
  create: () => Object.create(GameMap.prototype),
  fields: {
    tilesGrid,
    localTime: worldTime,
    // The back-reference that closes the map <-> district cycle.
    district: { kind: "ref" },
    // `rect` is derived from width and height, both of which are carried.
    rect: { kind: "skip" },
    /*
     * The position indexes are not C# fields — the port added them — and are
     * deliberately not carried: `finish` rebuilds them from the lists, which is
     * the only way to be sure the two agree. Carrying them would make a desync
     * between list and index *saveable*, which is worse than impossible.
     */
    actorsByPos: { kind: "skip" },
    mapObjectsByPos: { kind: "skip" },
    corpsesByPos: { kind: "skip" },
    scentsByPos: { kind: "skip" },
    /*
     * `m_MinimapRevision` is a cache-invalidation token, not state: the minimap
     * raster in `RogueGame` is keyed on the map's *identity* as well, so a loaded
     * map misses that cache and the raster is rebuilt.
     */
    m_MinimapRevision: { kind: "skip" },
    // A cursor for the turn-order scan, invalidated by every move.
    m_checkNextActorIndex: { kind: "skip" },
    exitsMap,
    groundItemsMap: groundItems,
    /*
     * The lists. For the actors and the map objects this is only *data* — which
     * objects, in which order — because `finish` re-registers each one through
     * `placeActor` / `placeMapObject`, which fill the list and the index together.
     */
    actorsList: { kind: "refList" },
    mapObjectsList: { kind: "refList" },
    corpsesList: { kind: "refList" },
    zonesList: zoneList,
    scentsList: scentList,
    timersList: timerList,
  },
  finish: (m: GameMap) => {
    const self = m as any;
    // The shell has no field initialisers, so the four indexes do not exist yet.
    // They are created here rather than in pass two so that nothing can try to
    // write into one before it is there.
    self.actorsByPos = new globalThis.Map();
    self.mapObjectsByPos = new globalThis.Map();
    self.corpsesByPos = new globalThis.Map();
    self.scentsByPos = new globalThis.Map();
    // The turn-order scan cursor, skipped as a cache. It still has to *exist*:
    // `checkNextActorIndex` reads it, and a shell would answer `undefined`
    // rather than 0 for a freshly loaded map.
    self.m_checkNextActorIndex = 0;

    /*
     * The lists are emptied first and rebuilt through the map's own registration
     * methods, rather than trusted as they arrive.
     *
     * `placeActor` would notice the actor is already listed and reindex it, but
     * `placeMapObject` appends unconditionally, so keeping the restored list would
     * leave every map object in it twice. Emptying all three and re-adding means
     * the list and the index are built by the same call, which is the only way
     * they can be guaranteed to agree — and `placeActor` throws on an occupied
     * tile, which is a free consistency check on a save that was truncated or
     * hand-edited.
     */
    const actors = self.actorsList as Actor[];
    const objects = self.mapObjectsList as MapObject[];
    const corpses = self.corpsesList as Corpse[];
    self.actorsList = [];
    self.mapObjectsList = [];
    self.corpsesList = [];

    for (const actor of actors) m.placeActor(actor, actor.location.position);
    for (const obj of objects) m.placeMapObject(obj, obj.location.position);
    // `addCorpse` indexes by the corpse's own position, so list and index are
    // built together here too.
    for (const corpse of corpses) m.addCorpse(corpse);

    // Scents index by position too, but `addScent` would append to a list that
    // is already correct, so the index is filled from the list directly --
    // through `indexScent`, which owns the key format. This used to rebuild the
    // key by hand (`` `${x},${y}` ``), which meant a second definition of
    // `Map`'s key encoding living in the serialiser. It did not break anything
    // while the two agreed; the first change to the encoding left every restored
    // scent unfindable at its own position, with nothing pointing at the cause.
    for (const scent of self.scentsList as OdorScent[]) {
      m.indexScent(scent);
    }
  },
};

// ── Things that live on a map ───────────────────────────────────────────────

const locationSpec: ClassSpec = {
  name: "Location",
  base: "Location",
  matches: (v) => v instanceof Location,
  create: () => Object.create(Location.prototype),
  fields: {
    map: { kind: "ref" },
    position: point,
  },
};

const inventorySpec: ClassSpec = {
  name: "Inventory",
  base: "Inventory",
  matches: (v) => v instanceof Inventory,
  create: () => Object.create(Inventory.prototype),
  fields: {
    /*
     * Order is load-bearing: `topItem` is the last item and stacking order
     * depends on it, so this is the list and not a set. Restoring it through
     * `addAll` would be wrong — `addAll` merges stacks, fusing two items into
     * one and quietly changing what the player is carrying.
     */
    itemsList: { kind: "refList" },
  },
};

/** Fields every `MapObject` has, whatever the subclass. */
const mapObjectFields: Record<string, FieldCodec> = {
  location: { kind: "ref" },
};

/**
 * One spec per concrete map-object class.
 *
 * A `MapObject`'s extra state is image ids baked in at world generation — a
 * `DoorWindow` knows its open and closed sprites because its constructor was
 * handed them, and nothing can re-derive them. So they are dumped like any other
 * field. The `StateMapObject` state word rides along in the same way.
 */
function mapObjectSpec(name: string, ctor: Function, matches: (v: object) => boolean): ClassSpec {
  return { name, base: "MapObject", matches, create: () => Object.create(ctor.prototype), fields: mapObjectFields };
}

/*
 * A note for whoever adds the fourth fuel-bearing map object, because this is the
 * part that is easy to get wrong: `mapObjectFields` lists only `location`, and it
 * is not an allow-list. A field with no codec entry is written by `encodePlain`,
 * so `fuelUnits` and `maxFuelUnits` ride along with no spec entry at all. Adding
 * them to the fields object would be redundant, not safer. What *is* load-bearing
 * is the spec existing and sitting above the bare `MapObject` catch-all below --
 * miss that and the object saves as a plain MapObject and silently loses its
 * class, which no field-level test would notice.
 */

const mapObjectSpecs: ClassSpec[] = [
  mapObjectSpec("DoorWindow", DoorWindow, (v) => v instanceof DoorWindow),
  mapObjectSpec("PowerGenerator", PowerGenerator, (v) => v instanceof PowerGenerator),
  mapObjectSpec("Board", Board, (v) => v instanceof Board),
  mapObjectSpec("Fortification", Fortification, (v) => v instanceof Fortification),
  // Fuel-bearing, and listed before the bare `MapObject` catch-all below.
  mapObjectSpec("Barrel", Barrel, (v) => v instanceof Barrel),
  mapObjectSpec("Campfire", Campfire, (v) => v instanceof Campfire),
  mapObjectSpec("Car", Car, (v) => v instanceof Car),
  mapObjectSpec("StateMapObject", StateMapObject, (v) => v instanceof StateMapObject),
  mapObjectSpec("MapObject", MapObject, (v) => v instanceof MapObject),
];

const corpseSpec: ClassSpec = {
  name: "Corpse",
  base: "Corpse",
  matches: (v) => v instanceof Corpse,
  create: () => Object.create(Corpse.prototype),
  fields: {
    deadGuy: { kind: "ref" },
    draggedBy: { kind: "ref" },
    position: point,
  },
};

/**
 * One spec per concrete item class.
 *
 * Every item is *identified* by its model, which is global state (`Models.items`)
 * rather than part of the save — so a save is only loadable against the same data
 * build, exactly as it is for the C#. What varies per subclass is the mutable
 * state the model does not carry: battery counts, a fuse, a spray quantity, which
 * actors an entertainment item bores.
 */
function itemSpec(name: string, ctor: Function, matches: (v: object) => boolean): ClassSpec {
  return { name, base: "Item", matches, create: () => Object.create(ctor.prototype), fields: itemFields };
}

/** Fields that appear on some `Item` subclass rather than all of them. */
const itemFields: Record<string, FieldCodec> = {
  boringForList: { kind: "refList" },
  _owner: { kind: "ref" },
  bestBefore: nullableWorldTime,
};

const itemSpecs: ClassSpec[] = [
  // Subclasses before their bases: the writer takes the first match.
  itemSpec("ItemGrenadePrimed", ItemGrenadePrimed, (v) => v instanceof ItemGrenadePrimed),
  itemSpec("ItemGrenade", ItemGrenade, (v) => v instanceof ItemGrenade),
  itemSpec("ItemPrimedExplosive", ItemPrimedExplosive, (v) => v instanceof ItemPrimedExplosive),
  itemSpec("ItemExplosive", ItemExplosive, (v) => v instanceof ItemExplosive),
  itemSpec("ItemMeleeWeapon", ItemMeleeWeapon, (v) => v instanceof ItemMeleeWeapon),
  itemSpec("ItemRangedWeapon", ItemRangedWeapon, (v) => v instanceof ItemRangedWeapon),
  itemSpec("ItemWeapon", ItemWeapon, (v) => v instanceof ItemWeapon),
  itemSpec("ItemAmmo", ItemAmmo, (v) => v instanceof ItemAmmo),
  itemSpec("ItemBarricadeMaterial", ItemBarricadeMaterial, (v) => v instanceof ItemBarricadeMaterial),
  itemSpec("ItemBodyArmor", ItemBodyArmor, (v) => v instanceof ItemBodyArmor),
  itemSpec("ItemEntertainment", ItemEntertainment, (v) => v instanceof ItemEntertainment),
  itemSpec("ItemFood", ItemFood, (v) => v instanceof ItemFood),
  itemSpec("ItemLight", ItemLight, (v) => v instanceof ItemLight),
  itemSpec("ItemMedicine", ItemMedicine, (v) => v instanceof ItemMedicine),
  itemSpec("ItemSprayPaint", ItemSprayPaint, (v) => v instanceof ItemSprayPaint),
  itemSpec("ItemSprayScent", ItemSprayScent, (v) => v instanceof ItemSprayScent),
  itemSpec("ItemTracker", ItemTracker, (v) => v instanceof ItemTracker),
  itemSpec("ItemTrap", ItemTrap, (v) => v instanceof ItemTrap),
  itemSpec("Item", Item, (v) => v instanceof Item),
];

// ── Actor ───────────────────────────────────────────────────────────────────

const actorSpec: ClassSpec = {
  name: "Actor",
  base: "Actor",
  matches: (v) => v instanceof Actor,
  create: () => Object.create(Actor.prototype),
  fields: {
    /*
     * `_controller` is skipped, and it is the one skip on `Actor` that is not a
     * cache.
     *
     * C# serialises it — `BinaryFormatter` walks the field, so a saved game
     * carries its `PlayerController` and `AIController` objects. The port cannot:
     * a controller points back at its actor and, in the AI case, holds a whole
     * perception cache, and rebuilding those is a project of its own.
     *
     * What has to survive is *which* actor the player was, so the writer records
     * that in the root and `RogueGame.LoadGame` hands it a fresh
     * `PlayerController` — the same call `HandlePlayerActor` makes when the player
     * takes control. Every other actor's controller is rebuilt by the game's own
     * setup, as it is for a newly spawned one.
     */
    _controller: { kind: "skip" },
    /*
     * The sheet is rebuilt from the actor model instead of being saved.
     *
     * Its base values are copies of the model's `startingSheet` and nothing in
     * the game writes them — `sheet.baseHitPoints = x` appears nowhere — while
     * the skills are the one part that changes. So the skills are written (see
     * `extra` below) and the base values are re-derived, which also means a save
     * cannot disagree with the model catalogue it is loaded against.
     */
    sheet: { kind: "skip" },
    doll,
    location: { kind: "ref" },
    inventory: { kind: "ref" },
    // The equipped attack comes from the item in the hand, which is carried as
    // itself, so the attack words are written out rather than re-derived.
    currentMeleeAttack: attack,
    currentRangedAttack: attack,
    currentDefence: defence,
    // References. `followersList` is null rather than empty when there are no
    // followers, because `isLeader` and `countFollowers` both read that.
    leader: { kind: "ref" },
    followersList: { kind: "refList" },
    targetActor: { kind: "ref" },
    aggressorOfList: { kind: "refList" },
    selfDefenceFromList: { kind: "refList" },
    boringItemsList: { kind: "refList" },
    draggedCorpse: { kind: "ref" },
    trustList: {
      kind: "inline",
      encode: (list: { actor: Actor; trust: number }[] | null, w: GraphWriter) =>
        list === null ? null : list.map((r) => trustRecord.encode!(r, w)),
      decode: (v, ctx: ReadCtx) =>
        v === null ? null : (v as Enc[]).map((r) => trustRecord.decode!(r, ctx)),
    },
  },
  extra: [
    {
      key: "$skills",
      produce: (a: Actor) => encodeSkills((a.sheet as ActorSheet).skillTable),
      codec: {
        kind: "inline",
        encode: (v) => v,
        decode: (v) => v as number[][],
      },
    },
  ],
  finish: (a: Actor) => {
    const self = a as any;
    // Only the sheet is built here. Everything else came out of the record, and
    // calling `onModelSet()` would overwrite the restored hit points, action
    // points, doll and inventory with fresh values from the model.
    const skills = (self.$skills ?? []) as number[][];
    self.sheet = ActorSheet.clone(self.model.startingSheet);
    self.sheet.skillTable = decodeSkills(skills);
    delete self.$skills;
    // `_controller` is skipped, so a shell would answer `undefined` where the
    // class declares `null`. `isPlayer` is false either way, but a field that
    // changes type depending on how the object was built is the kind of thing
    // that bites later.
    self._controller = null;
  },
};

/** `[[skillId, level], ...]`, with a null or empty table as an empty list. */
function encodeSkills(table: SkillTable | null | undefined): number[][] {
  const out: number[][] = [];
  for (const skill of table?.skills ?? []) out.push([skill.id, skill.level]);
  return out;
}

/**
 * `SkillTable` has no "set this level" method — `addOrIncreaseSkill` can only
 * step a skill up — so the skills are built with their levels and handed to the
 * constructor, which is the only way in that keeps the table's own duplicate
 * check in force.
 */
function decodeSkills(list: number[][]): SkillTable {
  return new SkillTable(
    list.map(([id, level]) => {
      const skill = new Skill(id);
      skill.level = level;
      return skill;
    })
  );
}

// ── Session-level state ─────────────────────────────────────────────────────

/**
 * `Scoring`, flattened. Not a record: only `Session` points at it, so an id would
 * buy nothing.
 */
function encodeScoring(s: Scoring, w: GraphWriter): Enc {
  const self = s as any;
  return {
    startScoringTurn: self.m_StartScoringTurn,
    // A saved progress value, not an id counter: restored, never restarted.
    reincarnationNumber: self.m_ReincarnationNumber,
    // `kills` and `sightings` hand back live iterators, so the fields are read.
    kills: [...(self.m_Kills as globalThis.Map<number, KillData>).entries()].map(
      ([modelId, k]) => [modelId, k.amount, k.firstKillTurn]
    ),
    sightings: [...(self.m_Sightings as globalThis.Set<number>).values()],
    events: (self.m_Events as { turn: number; text: string }[]).map((e) => [e.turn, e.text]),
    visitedMaps: [...(self.m_VisitedMaps as globalThis.Set<GameMap>).values()].map((m) => w.ref(m)),
    followersWhenDied: (self.m_FollowersWhenDied as Actor[] | null)?.map((a) => w.ref(a)) ?? null,
    killer: w.ref(self.m_Killer),
    zombifiedPlayer: w.ref(self.m_ZombifiedPlayer),
    killPoints: self.m_KillPoints,
    // The raw field, not the `difficultyRating` accessor: that getter divides by
    // `1 + reincarnationNumber`, so going through it would divide twice.
    difficultyRating: self.m_DifficultyRating,
    side: self.m_Side,
    /*
     * `hasCompletedAchievement` indexes this array with no guard at all, so it has
     * to come back with all eight entries. The constructor builds them with their
     * names and text, so only the one mutable field is written.
     */
    achievements: s.achievements.map((a) => [a.id, a.isDone]),
    startingSkill: s.startingSkill,
    turnsSurvived: s.turnsSurvived,
    deathReason: s.deathReason,
    deathPlace: s.deathPlace,
    // A real field, not a cache: `setCompletedAchievement` does not increment it,
    // so it can legitimately disagree with the true count and must be restored.
    completedAchievementsCount: s.completedAchievementsCount,
    realLifePlayingTimeSeconds: s.realLifePlayingTimeSeconds,
  };
}

function decodeScoring(v: Enc, ctx: ReadCtx): Scoring {
  const data = v as Record<string, any>;
  const scoring = new Scoring();
  const self = scoring as any;

  self.m_StartScoringTurn = data.startScoringTurn;
  self.m_ReincarnationNumber = data.reincarnationNumber;
  self.m_Kills = new globalThis.Map(
    (data.kills as [number, number, number][]).map(([modelId, amount, firstKillTurn]) => {
      // `KillData`'s constructor sets `amount = 1` and takes the turn as its
      // second argument, so only the running total is put back afterwards.
      const kill = new KillData(modelId, firstKillTurn);
      kill.amount = amount;
      return [modelId, kill] as [number, KillData];
    })
  );
  self.m_Sightings = new globalThis.Set(data.sightings as number[]);
  self.m_Events = (data.events as [number, string][]).map(([turn, text]) => ({ turn, text }));
  self.m_VisitedMaps = new globalThis.Set((data.visitedMaps as RefMark[]).map((m) => ctx.resolve(m)));
  self.m_FollowersWhenDied =
    data.followersWhenDied === null ? null : (data.followersWhenDied as RefMark[]).map((m) => ctx.resolve(m));
  self.m_Killer = data.killer === null ? null : ctx.resolve(data.killer);
  self.m_ZombifiedPlayer = data.zombifiedPlayer === null ? null : ctx.resolve(data.zombifiedPlayer);
  self.m_KillPoints = data.killPoints;
  self.m_DifficultyRating = data.difficultyRating;
  self.m_Side = data.side as DifficultySide;
  for (const [id, isDone] of data.achievements as [AchievementIDs, boolean][]) {
    scoring.achievements[id].isDone = isDone;
  }
  scoring.startingSkill = data.startingSkill;
  scoring.turnsSurvived = data.turnsSurvived;
  scoring.deathReason = data.deathReason;
  scoring.deathPlace = data.deathPlace;
  scoring.completedAchievementsCount = data.completedAchievementsCount;
  scoring.realLifePlayingTimeSeconds = data.realLifePlayingTimeSeconds;
  return scoring;
}

/**
 * The unique actors, items and maps.
 *
 * `UniqueActors.toArray()` is the authority on the order, and it is *not* the
 * declaration order — `jasonMyers` is declared before `policeStationPrisoner`
 * but listed after it. Reading and writing through the same call is what keeps
 * the two sides in step, so the array order is never hard-coded here.
 */
function encodeUniques(
  uniques: { uniqueActors: UniqueActors; uniqueItems: UniqueItems; uniqueMaps: UniqueMaps },
  w: GraphWriter
): Enc {
  return {
    actors: uniques.uniqueActors.toArray().map((u) => [
      u.isSpawned, w.ref(u.theActor), u.isWithRefugees, u.eventThemeMusic, u.eventMessage,
    ]),
    items: [
      [uniques.uniqueItems.theSubwayWorkerBadge.isSpawned, w.ref(uniques.uniqueItems.theSubwayWorkerBadge.theItem)],
    ],
    maps: uniqueMapSlots(uniques.uniqueMaps).map((u) => [w.ref(u.theMap)]),
  };
}

function decodeUniques(
  v: Enc,
  ctx: ReadCtx
): { uniqueActors: UniqueActors; uniqueItems: UniqueItems; uniqueMaps: UniqueMaps } {
  const data = v as Record<string, any>;
  const uniqueActors = new UniqueActors();
  const slots = uniqueActors.toArray();
  (data.actors as [boolean, RefMark | null, boolean, string | null, string | null][]).forEach(
    ([isSpawned, actor, isWithRefugees, music, message], index) => {
      const unique = slots[index];
      unique.isSpawned = isSpawned;
      unique.theActor = actor === null ? null : ctx.resolve(actor);
      unique.isWithRefugees = isWithRefugees;
      unique.eventThemeMusic = music;
      unique.eventMessage = message;
    }
  );

  const uniqueItems = new UniqueItems();
  const [badgeSpawned, badge] = data.items[0] as [boolean, RefMark | null];
  uniqueItems.theSubwayWorkerBadge.isSpawned = badgeSpawned;
  uniqueItems.theSubwayWorkerBadge.theItem = badge === null ? null : ctx.resolve(badge);

  const uniqueMaps = new UniqueMaps();
  (data.maps as [RefMark | null][]).forEach(([theMap], index) => {
    uniqueMapSlots(uniqueMaps)[index].theMap = theMap === null ? null : ctx.resolve(theMap);
  });

  return { uniqueActors, uniqueItems, uniqueMaps };
}

/** The eight unique map slots, in the order `encodeUniques` writes them. */
function uniqueMapSlots(uniqueMaps: UniqueMaps): { theMap: GameMap | null }[] {
  return [
    uniqueMaps.charUndergroundFacility,
    uniqueMaps.policeStation_OfficesLevel,
    uniqueMaps.policeStation_JailsLevel,
    uniqueMaps.hospital_Admissions,
    uniqueMaps.hospital_Offices,
    uniqueMaps.hospital_Patients,
    uniqueMaps.hospital_Storage,
    uniqueMaps.hospital_Power,
  ];
}

// ── The registry ────────────────────────────────────────────────────────────

/**
 * Every spec, in the order the writer must try them: most specific first.
 *
 * A wrong order is not a subtle failure — the roundtrip suite restores a world
 * holding an `ItemGrenadePrimed` and a `DoorWindow`, and a mis-ordered list
 * brings them back as plain `Item`s and `MapObject`s, which the suite sees.
 */
export const CLASS_SPECS: readonly ClassSpec[] = [
  worldSpec,
  districtSpec,
  mapSpec,
  ...mapObjectSpecs,
  ...itemSpecs,
  corpseSpec,
  locationSpec,
  inventorySpec,
  actorSpec,
];

export { decodeScoring, decodeUniques, encodeScoring, encodeUniques };