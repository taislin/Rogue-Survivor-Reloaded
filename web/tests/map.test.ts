import { describe, it, expect, beforeEach } from "vitest";
import { Map as GameMap } from "@data/Map";
import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { Point } from "@engine/Point";
import { Location } from "@data/Location";
import { GameActors, ActorID } from "@gameplay/GameActors";
import { GameTiles, TileID } from "@gameplay/GameTiles";

/**
 * Regression tests for the actor list.
 *
 * The bug these exist for: `Map.placeActor` used to always append to the actor
 * list, dropping the add-or-move branch that C# `Map.PlaceActorAt` has
 * (src/Data/Map.cs:492-499). Since all movement routes through `placeActor`,
 * every step an actor took left a permanent duplicate behind. Nothing threw —
 * the per-turn gauge loop simply iterated the duplicates, so a player starved
 * on turn 9 and the live actor count only ever grew.
 *
 * `assertActorIntegrity` is the runtime guard; these are the unit-level
 * guarantees behind it.
 */

const actorsDB = new GameActors();
const tilesDB = new GameTiles();
const faction = new Faction("Testers", "tester");

function newActor(name: string, modelId: ActorID = ActorID.MALE_CIVILIAN): Actor {
  return new Actor(actorsDB.get(modelId), faction, name);
}

function newMap(size = 20): GameMap {
  const map = new GameMap(1234, "test map", size, size);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) map.setTileModelAt(x, y, tilesDB.get(TileID.FLOOR_CONCRETE));
  }
  return map;
}

describe("Map.placeActor", () => {
  let map: GameMap;
  let a: Actor;

  beforeEach(() => {
    map = newMap();
    a = newActor("Alice");
  });

  it("adds a new actor to both the list and the position index", () => {
    map.placeActor(a, new Point(3, 4));

    expect(map.countActors).toBe(1);
    expect(map.getActorAt(3, 4)).toBe(a);
    expect(map.getActor(0)).toBe(a);
    expect(a.location.map).toBe(map);
    expect(a.location.position).toEqual(new Point(3, 4));
    expect(() => map.assertActorIntegrity()).not.toThrow();
  });

  it("MOVES an actor already on the map instead of duplicating it", () => {
    map.placeActor(a, new Point(3, 4));
    map.placeActor(a, new Point(5, 6));

    // The core regression: the list must still hold exactly one entry.
    expect(map.countActors).toBe(1);
    expect(map.getActorAt(5, 6)).toBe(a);
    expect(map.getActorAt(3, 4)).toBeNull();
    expect(a.location.position).toEqual(new Point(5, 6));
    expect(() => map.assertActorIntegrity()).not.toThrow();
  });

  it("does not accumulate duplicates over many moves", () => {
    map.placeActor(a, new Point(1, 1));

    // Walk a 2x2 circuit. Each step must land on a tile the actor does not
    // already occupy, which placeActor rejects as "actor already at position"
    // -- so this also pins that the self-collision guard still fires.
    const circuit = [new Point(1, 1), new Point(2, 1), new Point(2, 2), new Point(1, 2)];
    // Start at 1: the actor already stands on circuit[0].
    for (let i = 1; i < 53; i++) {
      map.placeActor(a, circuit[i % circuit.length]);
    }
    expect(map.countActors).toBe(1);
    expect(() => map.assertActorIntegrity()).not.toThrow();
  });

  it("rejects placing onto a tile occupied by another actor", () => {
    const b = newActor("Bob");
    map.placeActor(a, new Point(3, 4));
    expect(() => map.placeActor(b, new Point(3, 4))).toThrow(/another actor already at position/);
    expect(map.countActors).toBe(1);
  });

  it("rejects placing an actor onto its own current tile", () => {
    map.placeActor(a, new Point(3, 4));
    expect(() => map.placeActor(a, new Point(3, 4))).toThrow(/actor already at position/);
  });

  it("rejects an out-of-bounds position", () => {
    expect(() => map.placeActor(a, new Point(-1, 5))).toThrow(RangeError);
    expect(() => map.placeActor(a, new Point(5, 999))).toThrow(RangeError);
    expect(map.countActors).toBe(0);
  });
});

describe("Map.removeActor", () => {
  let map: GameMap;
  let a: Actor;
  let b: Actor;

  beforeEach(() => {
    map = newMap();
    a = newActor("Alice");
    b = newActor("Bob");
    map.placeActor(a, new Point(1, 1));
    map.placeActor(b, new Point(2, 2));
  });

  it("removes the actor from the list and the index", () => {
    map.removeActor(a);
    expect(map.countActors).toBe(1);
    expect(map.getActorAt(1, 1)).toBeNull();
    expect(map.getActorAt(2, 2)).toBe(b);
    expect(() => map.assertActorIntegrity()).not.toThrow();
  });

  it("is a no-op for an actor that is not on this map", () => {
    const stranger = newActor("Stranger");
    const c = newActor("Carol");
    map.placeActor(c, new Point(9, 9));

    // C# returns early and does not touch the position index. Deleting
    // unconditionally would evict Carol, who stands at the stranger's
    // coordinates.
    stranger.location = new Location(map, new Point(9, 9));
    map.removeActor(stranger);

    expect(map.getActorAt(9, 9)).toBe(c);
    expect(map.countActors).toBe(3);
  });

  it("leaves the actor re-placeable after removal", () => {
    map.removeActor(a);
    map.placeActor(a, new Point(7, 7));
    expect(map.countActors).toBe(2);
    expect(map.getActorAt(7, 7)).toBe(a);
    expect(() => map.assertActorIntegrity()).not.toThrow();
  });
});

describe("Map.assertActorIntegrity", () => {
  it("passes on a healthy map", () => {
    const map = newMap();
    for (let i = 0; i < 10; i++) map.placeActor(newActor(`a${i}`), new Point(i, 0));
    expect(() => map.assertActorIntegrity()).not.toThrow();
  });

  it("catches a duplicated actor (the bug it was added for)", () => {
    const map = newMap();
    const a = newActor("Alice");
    map.placeActor(a, new Point(1, 1));

    // Simulate the old append-always behaviour directly on the list, which is
    // the state that bug produced.
    (map as unknown as { actorsList: Actor[] }).actorsList.push(a);

    expect(() => map.assertActorIntegrity()).toThrow(/appears 2x in the actor list/);
  });

  it("catches an index that disagrees with the list", () => {
    const map = newMap();
    const a = newActor("Alice");
    map.placeActor(a, new Point(1, 1));
    // Drop the spatial entry, leaving the list and the index inconsistent. The
    // per-actor check fires before the size check, and is the more useful
    // message, so that is what we assert on.
    (map as unknown as { actorsByPos: Map<string, Actor> }).actorsByPos.clear();

    expect(() => map.assertActorIntegrity()).toThrow(
      /actor "the Alice" is at \(1, 1\) but the index has nothing/
    );
  });

  it("catches a list and index that disagree in size", () => {
    const map = newMap();
    const a = newActor("Alice");
    map.placeActor(a, new Point(1, 1));
    // An index entry pointing at an actor that is not in the list: sizes differ
    // and every listed actor is still correctly indexed.
    const ghost = newActor("Ghost");
    (map as unknown as { actorsByPos: Map<string, Actor> }).actorsByPos.set("9,9", ghost);

    expect(() => map.assertActorIntegrity()).toThrow(/indexed by position/);
  });
});
