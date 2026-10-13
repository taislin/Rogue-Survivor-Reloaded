import { describe, expect, it } from "vitest";
import { Actor } from "@data/Actor";
import { Models } from "@data/Models";
import { GraphReader, GraphWriter } from "@engine/serialization/SessionGraph";
import { CLASS_SPECS } from "@engine/serialization/specs";
import { ActorID } from "@gameplay/GameActors";
import { FactionID } from "@gameplay/GameFactions";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";

describe("actor status counters in saves", () => {
  it.each(["stunnedTurns", "flashbangedTurns", "both", "neither"])(
    "defaults missing %s while retaining saved counters",
    (missing) => {
      new HeadlessRunner(4242);
      const actor = new Actor(
        Models.actors.get(ActorID.MALE_CIVILIAN),
        Models.factions.get(FactionID.TheSurvivors),
      );
      actor.stunnedTurns = 3;
      actor.flashbangedTurns = 5;
      const writer = new GraphWriter(CLASS_SPECS);
      const root = writer.ref(actor)!;
      const data = writer.finish(root);
      const fields = data.objs.find((record) => record.k === "Actor")!.f;
      if (missing === "both" || missing === "stunnedTurns") delete fields.stunnedTurns;
      if (missing === "both" || missing === "flashbangedTurns") delete fields.flashbangedTurns;
      const loaded = new GraphReader(data, CLASS_SPECS).resolve(root) as Actor;
      expect(loaded.stunnedTurns).toBe(missing === "both" || missing === "stunnedTurns" ? 0 : 3);
      expect(loaded.flashbangedTurns).toBe(missing === "both" || missing === "flashbangedTurns" ? 0 : 5);
    },
  );
});
