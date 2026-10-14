import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { RogueGame } from "@engine/RogueGame";
import { NullRogueUI } from "@ui/NullRogueUI";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { SimRatio } from "@engine/GameOptions";
import { Session } from "@engine/Session";
import { SkillID } from "@gameplay/Skills";
import { Point } from "@engine/Point";
import { Models } from "@data/Models";
import { Map as GameMap, Exit } from "@data/Map";
import { District, DistrictKind } from "@data/District";
import { Actor } from "@data/Actor";
import { ActorID } from "@gameplay/GameActors";
import { FactionID } from "@gameplay/GameFactions";
import { TileID } from "@gameplay/GameTiles";

/**
 * `DoLeaveMap`'s district-change path, and the window the port's own
 * optimization opened in it.
 *
 * The C# checks the destination tile *after* preparing the destination
 * district (`src/Engine/RogueGame.cs:13147-13161`: the expensive
 * `BeforePlayerEnterDistrict` first, then "if spot not available, cancel").
 * The port moved that check ahead of the prepare, because preparing a district
 * the player will not enter after all costs a full catch-up simulation —
 * hundreds of turns, a stall, an interlude — for a move that never happens.
 *
 * The move-ahead is an optimization, not a replacement, and the difference is
 * not academic: the prepare is asynchronous here (it awaits the catch-up) and
 * it simulates the destination district, whose actors move. An actor can walk
 * onto the entry tile between the early check and the placement, and
 * `Map.placeActor` throws on an occupied tile — the reported crash, "another
 * actor already at position". The C# order cannot hit it: its check runs after
 * the simulation that creates the window.
 *
 * The fixture therefore stands in for the simulation with a spy on
 * `BeforePlayerEnterDistrict` that places an actor on the entry tile after the
 * real prepare returns — the occupancy is the window, and the simulation is
 * only one way it happens (the fixture runs with `SimRatio.OFF`, so the real
 * prepare is a cheap time jump and the test stays deterministic).
 */

const SEED = 31337;

let game: RogueGame;
let player: Actor;
let fromMap: GameMap;
let fromPos: Point;
let destMap: GameMap;
let destDistrict: District;
let exitPoint: Point;
/** The un-spied prepare, taken from the prototype so a spy that leaks past a
 *  failing test cannot capture itself as the "original" (infinite recursion). */
let realBeforePlayerEnter: (d: District) => Promise<void>;
const DEST = new Point(1, 1);

beforeAll(async () => {
  realBeforePlayerEnter = RogueGame.prototype.BeforePlayerEnterDistrict;
  Session.useSeed(SEED);
  game = new RogueGame(new NullRogueUI(), new NullMusicManager());
  await game.LoadData();
  const opts = RogueGame.options;
  opts.citySize = 1;
  opts.simulateDistricts = SimRatio.OFF;
  opts.isAnimDelayOn = false;
  opts.isAdvisorEnabled = false;
  opts.autoSavePeriodInHours = 0;
  game.session.gameMode = Session.get().gameMode;
  game.m_CharGen.isUndead = false;
  game.m_CharGen.isMale = true;
  game.m_CharGen.startingSkill = SkillID.AGILE;
  await game.StartNewGame();

  player = game.player!;
  fromMap = player.location.map!;
  fromPos = player.location.position;

  // An adjacent enemy gets a z-grab roll in `TryActorLeaveTile`, which would
  // fail the leave before any of this runs; the start square is not guaranteed
  // clear of neighbours, so clear it.
  for (const a of [...fromMap.actors]) {
    if (a === player) continue;
    const p = a.location.position;
    if (Math.abs(p.x - fromPos.x) <= 1 && Math.abs(p.y - fromPos.y) <= 1)
      fromMap.removeActor(a);
  }

  // A second district, hand-built and reachable by one exit. `StartNewGame`
  // with citySize 1 generates a single district, so the exit is added here
  // rather than found — the district is under the test's control either way,
  // which is the point: the prepare has to have somewhere to simulate.
  destDistrict = new District(new Point(0, 1), DistrictKind.GENERAL);
  destDistrict.name = "test district";
  destMap = new GameMap(98765, "test district", 20, 20);
  const floor = Models.tiles.get(TileID.FLOOR_ASPHALT);
  for (let x = 0; x < destMap.width; x++)
    for (let y = 0; y < destMap.height; y++)
      destMap.setTileModelAt(x, y, floor!);
  destDistrict.entryMap = destMap;

  // The exit sits under the player's feet — the standing-on-the-stairs case.
  exitPoint = new Point(fromPos.x, fromPos.y);
  fromMap.addExit(exitPoint, new Exit(destMap, DEST));
}, 120_000);

function spawnOnDest(): Actor {
  const npc = Models.actors
    .get(ActorID.MALE_CIVILIAN)
    .createAnonymous(game.gameFactions.get(FactionID.TheCivilians), 0);
  destMap.placeActor(npc, DEST);
  return npc;
}

beforeEach(() => {
  // The happy-path test below moves the player for real, and a crash mid-move
  // can leave them removed from their map without their location following;
  // every test starts with the player back on the origin map and the entry
  // tile empty.
  if (player.location.map !== fromMap || !fromMap.hasActor(player)) {
    const current = player.location.map;
    if (current !== null && current.hasActor(player)) current.removeActor(player);
    fromMap.placeActor(player, fromPos);
  }
  const occupant = destMap.getActorAtPoint(DEST);
  if (occupant !== null) destMap.removeActor(occupant);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DoLeaveMap across a district change", () => {
  it("refuses the move when the prepare leaves an actor on the entry tile, instead of throwing", async () => {
    // The reported crash. The tile was free when the early check looked, and
    // occupied by the time `placeActor` ran, because the prepare — which the
    // early check cannot see into — is where the district is simulated. The
    // C# has its check after the prepare for the same reason this one must
    // exist.
    const prepare = vi
      .spyOn(game, "BeforePlayerEnterDistrict")
      .mockImplementation(async (d) => {
        await realBeforePlayerEnter.call(game, d);
        spawnOnDest();
      });
    const addMessage = vi.spyOn(game, "AddMessage");

    const ok = await game.doLeaveMap(player, exitPoint, false);

    expect(ok, "a blocked exit returns true, as the early branch does").toBe(
      true,
    );
    expect(prepare).toHaveBeenCalledOnce();
    expect(player.location.map, "the player did not cross").toBe(fromMap);
    expect(player.location.position).toEqual(fromPos);
    expect(destMap.getActorAtPoint(DEST), "the squatter was not displaced")
      .not.toBeNull();
    expect(
      addMessage.mock.calls.some(([msg]) =>
        String((msg as { text?: string } | undefined)?.text ?? "").includes(
          "is blocking your way",
        ),
      ),
      "the player is told why the move was refused",
    ).toBe(true);
  });

  it("skips the prepare entirely when the entry tile is already occupied", async () => {
    // The pre-prepare check is the port's optimization over the C#'s order,
    // and it only is one if it still runs first: an occupied far side at a
    // border stair must not cost the interlude the C# paid. Pinned so the
    // post-prepare re-check cannot quietly replace it.
    spawnOnDest();
    const prepare = vi.spyOn(game, "BeforePlayerEnterDistrict");
    const after = vi.spyOn(game, "AfterPlayerEnterDistrict");

    const ok = await game.doLeaveMap(player, exitPoint, false);

    expect(ok).toBe(true);
    expect(prepare, "the expensive catch-up was skipped").not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    expect(player.location.map).toBe(fromMap);
  });

  it("runs the post-enter rebuild when it bails after the prepare", async () => {
    // `BeforePlayerEnterDistrict` clears the player's view on the way into the
    // catch-up — so the simulation shows them nothing — and stops the music,
    // on the assumption that the move completes and `AfterPlayerEnterDistrict`
    // rebuilds both (the view directly, the music on the next BGM tick).
    // Bailing out after the prepare without that rebuild leaves the player on
    // the origin map looking at a cleared screen until some later keypress
    // happens to recompute the FOV. The C# has the same hole; the port fixed
    // the black-arrival symptom on the success path and this pins the same
    // repair on the refusal path.
    vi.spyOn(game, "BeforePlayerEnterDistrict").mockImplementation(
      async (d) => {
        await realBeforePlayerEnter.call(game, d);
        spawnOnDest();
      },
    );
    const after = vi.spyOn(game, "AfterPlayerEnterDistrict");

    await game.doLeaveMap(player, exitPoint, false);

    expect(after).toHaveBeenCalledOnce();
    expect(player.location.map, "the rebuild ran for the map the player is on")
      .toBe(fromMap);
  });

  it("crosses into the new district when the entry tile stays free", async () => {
    const ok = await game.doLeaveMap(player, exitPoint, false);

    expect(ok).toBe(true);
    expect(player.location.map).toBe(destMap);
    expect(player.location.position).toEqual(DEST);
    expect(destMap.getActorAtPoint(DEST)).toBe(player);
    expect(game.session.currentMap, "SetCurrentMap ran").toBe(destMap);
  });
});
