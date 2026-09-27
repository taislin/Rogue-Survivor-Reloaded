import { describe, it, expect } from "vitest";
import {
  GRAPH_VERSION,
  INLINE_GRAPH_CLASSES,
  PENDING_GRAPH_CLASSES,
  RECORD_GRAPH_CLASSES,
  SerializationContext,
} from "@engine/serialization/SessionGraph";
import { CLASS_SPECS } from "@engine/serialization/specs";
import { Session } from "@engine/Session";
import { storage } from "@engine/storage";

/**
 * The save-graph coverage ledger.
 *
 * World/map serialisation fails *quietly*: a codec that omits one field produces a
 * save that loads, plays, and has quietly lost that field. Nothing throws and
 * nothing looks wrong — the §1.1c shape, where an `undefined` stat still produces
 * valid engine behaviour.
 *
 * So the classes of the graph are declared in production code rather than in a
 * comment, and this file holds them to account in both directions:
 *
 *  - a class with a codec is on one of the two lists, and
 *  - a class on a list is accounted for by a codec, or is still pending.
 *
 * A serialiser is recognised by the name of its `ClassSpec` in `CLASS_SPECS`, so
 * adding one for a class that nobody has listed fails here rather than in a save
 * file six months later.
 *
 * ## What the ledger is *not*
 *
 * `PENDING_GRAPH_CLASSES` being empty is a claim, and this file cannot be what
 * makes it true. Completeness is established by
 * `tests/save-graph-roundtrip.test.ts`, which restores a played world and compares
 * every field the format carries, and by the writer, which throws rather than
 * writing a field it cannot encode. This file only keeps the *bookkeeping* honest:
 * no class can be added to the graph without appearing in one of the three lists.
 */

describe("save-graph coverage ledger", () => {
  it("declares a version, so a save can be refused for being unreadable", () => {
    expect(Number.isInteger(GRAPH_VERSION)).toBe(true);
    expect(GRAPH_VERSION).toBeGreaterThan(0);
  });

  it("puts every class in exactly one list", () => {
    const all = [...RECORD_GRAPH_CLASSES, ...INLINE_GRAPH_CLASSES, ...PENDING_GRAPH_CLASSES];
    const unique = new Set(all);
    // A duplicate would mean one class was counted twice, which is the shape of
    // "I added it to the done list but forgot to take it off the todo list".
    expect(unique.size, `duplicates: ${all.filter((n, i) => all.indexOf(n) !== i).join(", ")}`)
      .toBe(all.length);
    for (const name of all) {
      expect(name, `"${name}" is not a class name`).toMatch(/^[A-Z][A-Za-z]*$/);
    }
  });

  it("has nothing pending, because the roundtrip suite says the graph is complete", () => {
    // If a class is added here, `Session.load` is wrong to accept saves again —
    // the refusal it makes on `graph == null` exists precisely so a half-written
    // graph cannot be loaded. Whoever adds an entry must also make the graph carry
    // that class, and prove it in tests/save-graph-roundtrip.test.ts.
    expect(PENDING_GRAPH_CLASSES).toEqual([]);
  });

  it("has a codec for every class that gets a record", () => {
    const bases = new Set(CLASS_SPECS.map((spec) => spec.base));
    for (const name of RECORD_GRAPH_CLASSES) {
      expect(bases.has(name), `${name} is listed as a record class but has no codec`).toBe(true);
    }
  });

  it("has no codec for a class the lists do not mention", () => {
    // The direction that catches a new class being added to the graph and given a
    // codec without anybody deciding what to do about the ledger.
    for (const spec of CLASS_SPECS) {
      expect(
        RECORD_GRAPH_CLASSES.includes(spec.base),
        `${spec.name} has a codec but claims base "${spec.base}", which is on neither list`
      ).toBe(true);
    }
  });

  it("lists the inline classes, which are the ones a record's field carries", () => {
    // These are hand-encoded, so they are the classes where a new field could be
    // dropped in silence — which is why each of their encoders names the fields it
    // accounts for and the writer checks (see `assertFields` in specs.ts).
    expect(INLINE_GRAPH_CLASSES.length).toBeGreaterThan(0);
    for (const mustHave of ["Tile", "Zone", "Exit", "OdorScent", "TimedTask", "Scoring"]) {
      expect(INLINE_GRAPH_CLASSES).toContain(mustHave);
    }
  });

  it("registers every codec in an order where a subclass is found before its base", () => {
    // The writer takes the first spec that matches, so a mis-ordered registry
    // silently downgrades an object to its base class: an `ItemGrenadePrimed` comes
    // back as a plain `Item`, with none of the fields that make it explosive, and
    // nothing throws. The rule is therefore mechanical — a base class's own spec
    // must come after every spec that claims it as a base.
    const positionOf = new Map(CLASS_SPECS.map((spec, index) => [spec.name, index]));
    for (const spec of CLASS_SPECS) {
      const baseIndex = positionOf.get(spec.base);
      expect(baseIndex, `${spec.base} has no codec of its own`).toBeDefined();
      if (spec.name === spec.base) continue;
      expect(
        baseIndex! > positionOf.get(spec.name)!,
        `${spec.name} is registered after its own base ${spec.base}`
      ).toBe(true);
    }
  });
});

describe("SessionGraph id table", () => {
  it("assigns ids in first-seen order and hands the same one back", () => {
    const ctx = new SerializationContext();
    const a = { name: "a" };
    const b = { name: "b" };

    expect(ctx.idOf(a)).toBe(1);
    expect(ctx.idOf(b)).toBe(2);
    expect(ctx.idOf(a)).toBe(1);
    expect(ctx.count).toBe(2);
  });

  it("keeps null as null, so an absent reference stays absent", () => {
    // C# `Actor.TargetActor` is null far more often than not, and JSON has no
    // way to say "no reference" other than writing null.
    const ctx = new SerializationContext();
    expect(ctx.idOf(null)).toBeNull();
    expect(ctx.count).toBe(0);
  });

  it("resolves an id back to the object it was assigned to", () => {
    const ctx = new SerializationContext();
    const a = { name: "a" };
    ctx.idOf(a);
    expect(ctx.resolve(1)).toBe(a);
  });

  it("throws on an id it never handed out, rather than returning undefined", () => {
    // A corrupt or truncated save has to fail loudly here. Returning undefined
    // would put `undefined` into a `Location` or an `Actor.targetActor`, which is
    // precisely the §1.1c failure: valid-looking engine behaviour, wrong data.
    const ctx = new SerializationContext();
    ctx.idOf({});
    expect(() => ctx.resolve(7)).toThrow(/unresolved reference id 7/);
  });
});

describe("the save format is declared, not implied", () => {
  it("writes graphVersion, and a graph when there is a world", () => {
    const session = Session.get();
    if (session.world == null || session.currentMap == null) {
      // A session with no world legitimately writes no graph, and that is the case
      // tests/save-graph-roundtrip.test.ts covers explicitly.
      return;
    }
    Session.save(session);
    const saved = JSON.parse(storage.getItem(Session.STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    expect(saved.graphVersion).toBe(GRAPH_VERSION);
    expect(saved.graph).not.toBeNull();
  });
});
