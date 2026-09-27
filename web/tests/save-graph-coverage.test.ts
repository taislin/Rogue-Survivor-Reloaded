import { describe, it, expect } from "vitest";
import * as SessionGraph from "@engine/serialization/SessionGraph";
import {
  GRAPH_VERSION,
  PENDING_GRAPH_CLASSES,
  SerializationContext,
} from "@engine/serialization/SessionGraph";
import { Session } from "@engine/Session";
import { storage } from "@engine/storage";

/**
 * The save-graph coverage ledger.
 *
 * World/map serialisation is the last piece of §1.5 item 6, and it is the kind
 * of work that fails *quietly*: a class with a `serialize` that omits one field
 * produces a save that loads, plays, and has quietly lost that field. Nothing
 * throws and nothing looks wrong.
 *
 * So the set of classes still to do is declared in production code
 * (`PENDING_GRAPH_CLASSES`) rather than in a comment, and this file holds it to
 * account in both directions:
 *
 *  - a class that gains a serialiser must leave the pending list, and
 *  - a class on the pending list must not have one.
 *
 * A serialiser is recognised by the module exporting a `serialize` function for
 * that class name, so adding one without updating the list fails here rather
 * than in a save file six months later. The suite going quiet about the graph is
 * the failure this prevents.
 */

describe("save-graph coverage ledger", () => {
  it("declares a version, so a save can be refused for being unreadable", () => {
    expect(Number.isInteger(GRAPH_VERSION)).toBe(true);
    expect(GRAPH_VERSION).toBeGreaterThan(0);
  });

  it("lists every class the graph still needs, with no duplicates", () => {
    expect(PENDING_GRAPH_CLASSES.length).toBeGreaterThan(0);
    const unique = new Set(PENDING_GRAPH_CLASSES);
    // A duplicate would mean one class was counted twice and another skipped.
    expect(unique.size).toBe(PENDING_GRAPH_CLASSES.length);
    for (const name of PENDING_GRAPH_CLASSES) {
      expect(name).toMatch(/^[A-Z][A-Za-z]*$/);
    }
  });

  it("has no serialiser for a class it still lists as pending", () => {
    // Nothing is implemented yet, so this holds trivially — and it is the
    // assertion that starts doing the work the moment the first class lands.
    for (const name of PENDING_GRAPH_CLASSES) {
      expect(hasSerialiser(name), `${name} is pending but has a serialiser`).toBe(false);
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
  it("writes graphVersion, and writes no graph while the ledger is non-empty", () => {
    const session = Session.get();
    Session.save(session);

    const saved = JSON.parse(storage.getItem(Session.STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    expect(saved.graphVersion).toBe(GRAPH_VERSION);
    // The whole point: the format says what it is, and says it is incomplete.
    expect(saved.graph).toBeNull();
  });
});

/**
 * The serialisers that exist, discovered from the module's exports.
 *
 * Reading the export list rather than hard-coding one is what makes this test
 * notice a *new* serialiser: `serializeMap` and friends appear here
 * automatically, and the ledger assertion above then fails until the class is
 * accounted for in `PENDING_GRAPH_CLASSES`.
 */
function hasSerialiser(className: string): boolean {
  return Object.keys(SessionGraph).includes(`serialize${className}`);
}
