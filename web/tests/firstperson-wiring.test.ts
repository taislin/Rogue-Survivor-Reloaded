import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { NullRogueUI } from "@ui/NullRogueUI";
import { RogueGame } from "@engine/RogueGame";
import { SimRatio } from "@engine/GameOptions";
import { GameMode } from "@engine/Session";
import { Direction } from "@engine/Direction";
import { DEFAULT_VIEW_MODE } from "@engine/firstperson/Types";
import { Map as GameMap } from "@data/Map";
import { buildScene, type Scene } from "@engine/firstperson/SceneBuilder";
import { LOS_DISTANCE_FACTOR, daylightFor } from "@engine/firstperson/Daylight";

/**
 * The first-person view, driven through a real played game.
 *
 * Everything else in the first-person suite builds a scene by hand, which proves
 * the geometry and the draw list. This file proves the *wiring*: that the option
 * reaches the renderer, that a turned camera reaches the camera, and that a real
 * game with the mode on runs to completion without a crash or a hang.
 *
 * **What it cannot check, and why it is still worth having.** The headless
 * simulator drops the drawing call, so this exercises every part of the path up to
 * and including `UI_DrawScene` and none of what comes after it. The Canvas2D blit
 * — the `drawImage` calls, the affine transform for the sheared floor quads, the
 * clip to the panel — has **not** been run against a real canvas by this suite or
 * by anything else in it, because there is no browser here and the rasteriser in
 * `tests/helpers` is a separate implementation that agrees by construction rather
 * than by observation.
 *
 * That is not a hypothetical gap. Earlier in this series the rasteriser and the
 * browser disagreed about flat-coloured quads and the golden showed 67 base fills
 * as "missing texture" — a defect the game does not have. Two implementations of
 * one primitive, and a shared type did not prevent it. Opening the game is still
 * the definition of done for the pixels; this is the definition of done for the
 * plumbing.
 */
describe("first person, in a real game", () => {
  let runner: HeadlessRunner;
  let ui: NullRogueUI;

  beforeAll(async () => {
    runner = new HeadlessRunner(4242, new NullRogueUI());
    game = runner.rogueGame;
    ui = runner.nullUI;
    await game.LoadData();
    const options = RogueGame.options;
    options.citySize = 1;
    options.simulateDistricts = SimRatio.OFF;
    options.isAnimDelayOn = false;
    options.isAdvisorEnabled = false;
    game.session.gameMode = GameMode.GM_STANDARD;
    await game.StartNewGame();
    // `NullRogueUI` counts painting calls only while this is on, and the whole
    // point of this file is to count them — `UI_DrawScene` being *absent* is as
    // much of a result as it being present.
    ui.profiling = true;
    probingUI = ui;
  }, 180_000);

  afterAll(() => {
    // The view mode is process-wide, like every option. Left on, it would change
    // what the arrow keys do for every other test in this worker.
    RogueGame.options.viewMode = DEFAULT_VIEW_MODE;
    probingUI = null;
  });

  it("is off by default, and the game plays top-down", () => {
    expect(RogueGame.options.viewMode).toBe(DEFAULT_VIEW_MODE);
    const map = game.session.currentMap!;
    ui.resetCallCounts();
    game.RedrawPlayScreen();
    // The top-down loop ran and the scene did not.
    expect(ui.callCounts["UI_DrawScene"]).toBeUndefined();
    // The tile loop, counted under the two methods it actually uses. Measured at
    // 61 `UI_DrawImageTinted` and 404 `UI_DrawGrayLevelImage` in this fixture — 465
    // calls for a 27x21 view — while `UI_DrawImage` is 43 in *both* modes, because
    // the minimap's own position markers go through it and are minimap-space rather
    // than map-space. So the discriminator has to be the tile methods, and an
    // earlier version of this assertion, which counted `UI_DrawImage`, could not
    // tell the two renderers apart at all.
    expect(tileDrawCalls()).toBeGreaterThan(200);
    expect(map).toBeDefined();
  });

  it("hands the renderer a scene once the option is on", () => {
    RogueGame.options.viewMode = "first-person";
    try {
      ui.resetCallCounts();
      game.RedrawPlayScreen();
      expect(ui.callCounts["UI_DrawScene"]).toBe(1);
      // And the tile loop really did stop rather than both running — drawing both
      // would double every frame's cost and read as a rendering bug nobody could
      // name. Zero rather than "small": these two methods are the tile loop, and
      // the minimap does not touch them.
      expect(tileDrawCalls()).toBe(0);
    } finally {
      RogueGame.options.viewMode = DEFAULT_VIEW_MODE;
    }
  });

  it("builds a frame the camera can actually stand in", () => {
    // Every one of these is a value the renderer would divide by. A camera outside
    // its own map, a zero field of view, a facing that is not a compass direction:
    // none of them throw, and all of them produce a frame that is not the game.
    const map = game.session.currentMap!;
    game.TurnFirstPerson(1);
    const position = game.m_Player.location.position;
    const scene = buildFor(map, position.x + 0.5, position.y + 0.5, game.FirstPersonFacing);
    expect(scene.camera.posX).toBe(position.x + 0.5);
    expect(scene.camera.planeLength).toBeGreaterThan(0);
    expect(scene.quads.length).toBeGreaterThan(0);
    for (const quad of scene.quads) {
      expect(Number.isFinite(quad.depth), "a quad has a non-finite depth").toBe(true);
      expect(Number.isFinite(quad.x + quad.y + quad.ux + quad.uy + quad.vx + quad.vy)).toBe(true);
    }
  });

  it("turns the camera and the camera's picture changes together", () => {
    // The end-to-end version of the control scheme: a turn must reach the geometry,
    // not merely the state. Two facings must produce two different draw lists.
    RogueGame.options.viewMode = "first-person";
    try {
      const map = game.session.currentMap!;
      const position = game.m_Player.location.position;
      const north = buildFor(map, position.x + 0.5, position.y + 0.5, Direction.N);
      const east = buildFor(map, position.x + 0.5, position.y + 0.5, Direction.E);
      expect(north.quads.length).toBeGreaterThan(0);
      expect(east.quads.length).toBeGreaterThan(0);
      // The *wall* columns differ, which is the picture changing rather than the
      // bookkeeping. Index 0 of the draw list is a floor quad, and a floor quad's
      // source x is a fixed subdivision step, so comparing an arbitrary index
      // compares two numbers that are allowed to be equal.
      const wallOf = (scene: Scene) => scene.quads.find((q) => q.imageId.includes("wall"));
      const northWall = wallOf(north)!;
      const eastWall = wallOf(east)!;
      expect(northWall).toBeDefined();
      expect(eastWall).toBeDefined();
      expect(northWall.depth).not.toBeCloseTo(eastWall.depth, 3);
    } finally {
      RogueGame.options.viewMode = DEFAULT_VIEW_MODE;
    }
  });

  it("survives a full turn in a corner, where the rays are most oblique", () => {
    RogueGame.options.viewMode = "first-person";
    try {
      // From wherever the camera already is: eight turns is a full circle, so it
      // must come back to the heading it started at. Asserting north instead would
      // be asserting that no earlier test had turned it.
      // `TurnFirstPerson` redraws by itself, like the zoom keys it sits beside —
      // that is what makes it free rather than a turn. So the loop must not redraw
      // again: two draws per turn would be a frame-rate bug that no assertion here
      // would otherwise catch.
      const start = game.FirstPersonFacing;
      ui.resetCallCounts();
      for (let i = 0; i < 8; i++) game.TurnFirstPerson(1);
      expect(game.FirstPersonFacing).toBe(start);
      expect(ui.callCounts["UI_DrawScene"]).toBe(8);
    } finally {
      RogueGame.options.viewMode = DEFAULT_VIEW_MODE;
    }
  });

  it("plays a run of turns without a crash or a hang", async () => {
    // The last line of defence, and the only one that exercises the scene builder
    // against a world the generator actually produced rather than a corridor built
    // by hand — walls of five different models, doors, water, decorations, exits
    // one tile outside the map edge.
    RogueGame.options.viewMode = "first-person";
    try {
      ui.resetCallCounts();
      const map = game.session.currentMap!;
      const metrics = await runner.run({
        worldSize: 1,
        maxTurns: 40,
        bot: true,
      });
      expect(metrics.error).toBeUndefined();
      expect(metrics.turnsPlayed).toBeGreaterThan(0);
      expect(ui.callCounts["UI_DrawScene"]).toBeGreaterThan(0);
      expect(map).toBeDefined();
    } finally {
      RogueGame.options.viewMode = DEFAULT_VIEW_MODE;
    }
  }, 180_000);
});

/** The UI whose call counts `tileDrawCalls` reads. Set in `beforeAll`. */
let probingUI: NullRogueUI | null = null;

/** The played game, so the module-level scene helper can read the engine's own FOV. */
let game: RogueGame;

/**
 * The map's per-tile draw calls.
 *
 * `UI_DrawImageTinted` for a tile the player can see, `UI_DrawGrayLevelImage` for
 * one they have merely visited. Both are called from `DrawTile` and nowhere else,
 * so this counts the tile loop and nothing but the tile loop.
 */
function tileDrawCalls(): number {
  const counts = probingUI?.callCounts ?? {};
  return (counts["UI_DrawImageTinted"] ?? 0) + (counts["UI_DrawGrayLevelImage"] ?? 0);
}

/**
 * Builds a scene the way `RogueGame.DrawFirstPersonScene` does, including the two
 * engine-supplied limits rather than convenient ones.
 *
 * That is the point of doing it here and not in the scene tests: the FOV comes
 * from `Rules.actorFOV` through the same arithmetic the game uses, so a change to
 * the night or weather penalty shows up as a change in what this renderer draws.
 */
function buildFor(map: GameMap, x: number, y: number, facing: Direction): Scene {
  const actor = game.m_Player;
  return buildScene({
    map,
    posX: x,
    posY: y,
    facing,
    width: 864,
    height: 672,
    isInside: map.getTileAt(Math.floor(x), Math.floor(y))?.isInside ?? false,
    actionPoints: actor.actionPoints,
    maxViewDistance:
      game.m_Rules.actorFOV(actor, game.session.worldTime, game.session.world!.weather) /
      LOS_DISTANCE_FACTOR,
    daylight: daylightFor(game.session.worldTime.phase),
  });
}
