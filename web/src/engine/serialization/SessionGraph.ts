/**
 * Session graph serialisation — the machinery.
 *
 * `Session.save` used to write the session's scalars only, which is why a save
 * could not be loaded: restoring the scalars into a world with no actors is a
 * half-loaded game, and half-loaded is worse than not loaded. This file is the
 * graph, and `Session.load` refuses anything that does not carry a complete one.
 *
 * ## Why this cannot be `JSON.stringify`
 *
 * The C# gets save/load for free: `Session.SaveBin` hands the whole object graph
 * to a `BinaryFormatter`, which walks fields, preserves shared references and
 * handles cycles. The port has JSON, and the graph is a knot — `Map` -> `Actor`
 * -> `Location` -> `Map`, `Actor.targetActor` -> `Actor`, `Corpse.draggedBy` ->
 * `Actor` — so `JSON.stringify(world)` throws `Converting circular structure to
 * JSON`. Every reference has to become an id and be resolved in a second pass,
 * by hand. `SerializationContext` does the id half; the two passes below do the
 * rest.
 *
 * ## Why it is versioned and refused rather than partial
 *
 * `GRAPH_VERSION` goes into the save and `Session.load` refuses a graph written
 * at any other version — the same thing the C# does for a `SaveFormat` it cannot
 * read, and what "VERSION NOT COMPATIBLE" in `DoLoadGame` means.
 *
 * ## Why the fields are dumped rather than listed
 *
 * The failure mode this project keeps paying for is a serialiser that omits one
 * field: the save loads, the game plays, and the field is quietly gone (§1.1c —
 * an `undefined` stat still produces valid engine behaviour). A hand-written
 * field list per class is where that omission comes from.
 *
 * So a record is *every own field of the object*, minus an explicit skip list.
 * That makes completeness structural rather than remembered: a field added to
 * `Actor` tomorrow is in tomorrow's save without anyone editing a list, and the
 * only way to lose one is to name it in a skip list, which is a visible,
 * reviewable act. The cost is that a field holding a live object cannot be
 * dumped generically, so the writer **throws** with the path and the class name
 * rather than writing something lossy — a save that cannot be written says so,
 * instead of writing one that lies.
 *
 * Loading is the mirror: a shell is created per record, every field is assigned,
 * then a per-class `finish` hook rebuilds the *derived* containers the format
 * does not carry (`Map.actorsByPos` and friends — the position indexes are a
 * C#-free performance structure the port added, and rebuilding them through the
 * owner's own `place*` methods is what keeps them consistent with the lists).
 */

/**
 * Bumped whenever the graph format changes incompatibly.
 *
 * A save carrying any other version is refused, exactly as the C# refuses a
 * format it cannot read (`Session.Load` returns false for an unknown
 * `SaveFormat`).
 */
export const GRAPH_VERSION = 1;

/** A reference to another record, as `{ $: id }`. */
export interface RefMark {
  readonly $: number;
}

/** A JSON-safe value. */
export type Enc = unknown;

export interface ReadCtx {
  /** The object an id was assigned to, or throws — never `undefined`. */
  resolve(mark: RefMark): any;
}

export type FieldCodec =
  /** Not carried: a cache, a derived value, or runtime-only state. */
  | { readonly kind: "skip" }
  /** One reference to another record. */
  | { readonly kind: "ref" }
  /** An array of references, or null for "none". */
  | { readonly kind: "refList" }
  /** Anything else: encoded by hand, in both directions. */
  | {
      readonly kind: "inline";
      readonly encode: (value: any, writer: GraphWriter) => Enc;
      readonly decode: (value: Enc, ctx: ReadCtx) => any;
    };

export interface ClassSpec {
  /** The class name written into the record. */
  readonly name: string;
  /**
   * The entry in `RECORD_GRAPH_CLASSES` this spec belongs to.
   *
   * Declared rather than derived, because it cannot be derived: `DoorWindow` is a
   * `MapObject` but does not share a prefix with the name, and a name-based guess
   * would put half the codecs on the ledger as unaccounted for.
   */
  readonly base: string;
  /** True for instances of this class. Subclasses must be tested first. */
  readonly matches: (value: object) => boolean;
  /**
   * A bare shell: no constructor, so no field initialisers and no side effects.
   *
   * `Object.create` is deliberate. The alternative — running the real
   * constructor — means either remembering each constructor's arguments (19 item
   * classes, five map-object classes, and a `Map` that allocates 10 000 tiles
   * per call) or throwing those allocations away. A shell has no field
   * initialisers, which is safe *because the record carries every field*: the
   * load assigns all of them.
   */
  readonly create: () => any;
  /** Per-field encoders; anything unlisted is dumped generically. */
  readonly fields: Readonly<Record<string, FieldCodec>>;
  /**
   * State that is not a field of the class, but is still saved.
   *
   * The writer dumps own fields, so anything the format needs that the object
   * does not hold as a field has to be declared here. `Actor`'s skill list is the
   * case that motivates it: the skills live on `actor.sheet.skillTable`, but the
   * sheet itself is rebuilt from the actor model, so the list is written under
   * its own key and read back in `finish`.
   */
  readonly extra?: readonly ExtraField[];
  /**
   * Runs in a third pass, once *every* record's fields are assigned.
   *
   * The ordering is the whole point: rebuilding a map's actor index needs
   * `actor.location`, and reading an actor's model needs `modelId`. A hook that
   * ran in the same pass as the field assignment would see whichever record
   * happened to come first, which is not a thing to rely on.
   */
  readonly finish?: (obj: any, ctx: ReadCtx) => void;
}

export interface ExtraField {
  /** The key it is written under. Prefixed with `$` so it cannot be a field. */
  readonly key: string;
  /** Where the value comes from, for the writer. */
  readonly produce: (obj: any) => unknown;
  readonly codec: FieldCodec;
}

export interface GraphRecord {
  /** The class name, so the right spec is found on the way back. */
  readonly k: string;
  readonly f: Record<string, Enc>;
}

export interface GraphData {
  readonly v: number;
  readonly objs: readonly GraphRecord[];
  readonly root: Enc;
}

/**
 * The classes that get a record of their own — they have identity, so something
 * else has to be able to point at them.
 */
export const RECORD_GRAPH_CLASSES: readonly string[] = [
  "World",
  "District",
  "Map",
  "Actor",
  "Item",
  "MapObject",
  "Corpse",
  "Location",
  "Inventory",
];

/**
 * The classes that ride along inside another record's field, because nothing
 * ever points at them by identity.
 *
 * Most of these are immutable value objects (`Attack`, `DollBody`, `Point`) or
 * owned by exactly one container (`Tile` by its map's grid, `Zone` by its map's
 * list, `OdorScent` by its position). Giving them records would cost a file
 * entry per tile — a 100x100 map is 10 000 of them — to express an identity
 * nothing uses.
 */
export const INLINE_GRAPH_CLASSES: readonly string[] = [
  // Value types.
  "Point",
  "Rect",
  "Attack",
  "Defence",
  "Verb",
  "DollBody",
  "TrustRecord",
  "Skill",
  "WorldTime",
  // Owned by a map, and reachable only through it.
  "Tile",
  "Zone",
  "Exit",
  "OdorScent",
  "TimedTask",
  // Owned by an actor.
  "Doll",
  "ActorSheet",
  "SkillTable",
  // Session-level.
  "Scoring",
  "Achievement",
  "KillData",
  "GameEventData",
  "UniqueActors",
  "UniqueItems",
  "UniqueMaps",
];

/**
 * The classes that still need a codec before a save can carry a world.
 *
 * Empty, and the emptiness is now the claim rather than the aspiration: it stays
 * empty only because `tests/save-graph-roundtrip.test.ts` restores a played
 * world and compares it field by field, and because the writer throws rather
 * than dropping a field it cannot encode. Adding a class to the graph means
 * adding it to one of the two lists above, and the coverage suite checks the
 * three are disjoint and account for the graph.
 */
export const PENDING_GRAPH_CLASSES: readonly string[] = [];

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

/** Writes a graph: objects to records, references to ids. */
export class GraphWriter {
  private readonly ctx = new SerializationContext();
  private readonly records: ({ k: string; f: Record<string, Enc> } | undefined)[] = [];
  private readonly specs: readonly ClassSpec[];

  constructor(specs: readonly ClassSpec[]) {
    this.specs = specs;
  }

  /** The number of objects written, i.e. the size of the id table. */
  get count(): number {
    return this.records.length;
  }

  /**
   * A reference to `value`, writing its record the first time it is seen.
   *
   * The record slot is reserved *before* the fields are encoded, which is what
   * makes a cycle (`Actor` -> `Corpse` -> `Actor`) terminate: the inner
   * reference finds the id already assigned and writes nothing more.
   */
  ref(value: object | null): RefMark | null {
    if (value === null) return null;
    const id = this.ctx.idOf(value) as number;
    if (this.records[id - 1] === undefined) {
      const spec = this.specFor(value);
      // The slot is reserved before the fields are encoded, so a cycle finds the
      // id already taken and stops instead of recursing.
      const record = { k: spec.name, f: {} as Record<string, Enc> };
      this.records[id - 1] = record;
      record.f = encodeFields(value, spec, this);
    }
    return { $: id };
  }

  private specFor(value: object): ClassSpec {
    for (const spec of this.specs) {
      if (spec.matches(value)) return spec;
    }
    throw new Error(
      `no graph codec for ${describe(value)}; add it to RECORD_GRAPH_CLASSES with a ClassSpec`
    );
  }

  /** The finished graph. `root` is written by the caller. */
  finish(root: Enc): GraphData {
    for (let i = 0; i < this.records.length; i++) {
      if (this.records[i] === undefined) {
        throw new Error(`reference id ${i + 1} was handed out but never written`);
      }
    }
    return { v: GRAPH_VERSION, objs: this.records as GraphRecord[], root };
  }
}

/** Reads a graph: records to objects, ids to references. */
export class GraphReader implements ReadCtx {
  private readonly shells: any[];

  constructor(
    data: GraphData,
    private readonly specs: readonly ClassSpec[]
  ) {
    if (data == null || !Array.isArray(data.objs)) throw new Error("save carries no object table");
    if (data.v !== GRAPH_VERSION) {
      throw new Error(`graph version ${String(data.v)} is not ${GRAPH_VERSION}`);
    }

    // Pass one: a shell per record, so every id resolves to something even
    // though no field has been filled in yet. This is what lets a field
    // reference an object that has not been read.
    this.shells = data.objs.map((record, index) => {
      const spec = this.specForName(record.k);
      try {
        return spec.create();
      } catch (error) {
        throw new Error(`cannot create a ${record.k} for record ${index + 1}: ${String(error)}`);
      }
    });

    // Pass two: the fields.
    data.objs.forEach((record, index) => {
      assignFields(this.shells[index], this.specForName(record.k), record.f, this);
    });

    // Pass three: the hooks, which may read any object's fields.
    data.objs.forEach((record, index) => {
      this.specForName(record.k).finish?.(this.shells[index], this);
    });
  }

  resolve(mark: RefMark): any {
    if (mark == null || typeof mark.$ !== "number") {
      throw new Error(`malformed reference ${JSON.stringify(mark)}`);
    }
    const value = this.shells[mark.$ - 1];
    if (value === undefined) throw new Error(`unresolved reference id ${mark.$}`);
    return value;
  }

  private specForName(name: string): ClassSpec {
    for (const spec of this.specs) {
      if (spec.name === name) return spec;
    }
    throw new Error(`save contains a ${name}, which this build has no codec for`);
  }
}

/** Encodes one record's fields: every own field, minus the skip list. */
function encodeFields(obj: any, spec: ClassSpec, writer: GraphWriter): Record<string, Enc> {
  const out: Record<string, Enc> = {};
  const encode = (key: string, codec: FieldCodec | undefined, value: unknown): void => {
    if (codec !== undefined && codec.kind === "skip") return;
    // JSON has no way to say "this field is undefined", and an own field set to
    // undefined carries no information: the field will simply keep whatever the
    // class declares. Skipping it is the only honest option.
    if (value === undefined) return;
    if (codec === undefined) {
      out[key] = encodePlain(value, `${spec.name}.${key}`);
      return;
    }
    switch (codec.kind) {
      case "ref":
        out[key] = writer.ref(value as object | null);
        break;
      case "refList":
        out[key] = value === null ? null : (value as object[]).map((v) => writer.ref(v));
        break;
      case "inline":
        out[key] = codec.encode(value, writer);
        break;
      default:
        throw new Error(`${spec.name}.${key} has an unknown codec`);
    }
  };

  for (const key of Object.keys(obj)) encode(key, spec.fields[key], obj[key]);
  for (const extra of spec.extra ?? []) encode(extra.key, extra.codec, extra.produce(obj));
  return out;
}

/** Assigns one record's fields onto its shell. */
function assignFields(obj: any, spec: ClassSpec, fields: Record<string, Enc>, ctx: ReadCtx): void {
  for (const key of Object.keys(fields)) {
    const codec = spec.fields[key];
    const raw = fields[key];
    let value: unknown;
    if (codec === undefined) {
      value = raw;
    } else {
      switch (codec.kind) {
        case "skip":
          throw new Error(`record for ${spec.name} carries ${key}, which the format does not carry`);
        case "ref":
          value = raw === null ? null : ctx.resolve(raw as RefMark);
          break;
        case "refList":
          value = raw === null ? null : (raw as RefMark[]).map((m) => ctx.resolve(m));
          break;
        case "inline":
          value = codec.decode(raw, ctx);
          break;
        default:
          throw new Error(`${spec.name}.${key} has an unknown codec`);
      }
    }
    obj[key] = value;
  }
}

/**
 * Copies a value that is already JSON-shaped, and refuses anything else.
 *
 * The refusal is the point. A field holding a live object — a `Tile` inside a
 * map, an `Actor` inside a corpse, an `Attack` that somebody forgot to give a
 * codec — has no generic encoding: `JSON.stringify` would either recurse until
 * it hit a cycle or, worse, quietly emit `{}` for it and produce a save that
 * loads and lies. So this throws, naming the path, and the save does not get
 * written.
 */
function encodePlain(value: unknown, path: string): Enc {
  if (value === null) return null;
  switch (typeof value) {
    case "boolean":
    case "string":
      return value;
    case "number":
      // JSON turns these into null, which would restore as a real 0/null.
      if (!Number.isFinite(value)) throw new Error(`${path} is ${String(value)}, which JSON cannot carry`);
      return value;
    case "object":
      break;
    default:
      throw new Error(`${path} is a ${typeof value}, which JSON cannot carry`);
  }

  if (Array.isArray(value)) return value.map((entry, i) => encodePlain(entry, `${path}[${i}]`));

  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new Error(`${path} is a ${describe(value)}, which has no graph codec`);
  }
  const out: Record<string, Enc> = {};
  for (const key of Object.keys(value)) {
    const entry = (value as Record<string, unknown>)[key];
    if (entry === undefined) continue;
    out[key] = encodePlain(entry, `${path}.${key}`);
  }
  return out;
}

/** The class name of a value, for error messages. */
function describe(value: unknown): string {
  if (value === null || typeof value !== "object") return String(value);
  const name = (value as object).constructor?.name;
  return name ? `live ${name}` : "a live object";
}
