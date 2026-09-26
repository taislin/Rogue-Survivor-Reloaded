import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { RogueGame, MAP_ZOOM_LEVELS, MAP_PANEL_WIDTH, MAP_PANEL_HEIGHT, TILE_SIZE } from "@engine/RogueGame";
import { NullRogueUI } from "@ui/NullRogueUI";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { Point } from "@engine/Point";
import { Keybindings, InputTranslator } from "@engine/Keybindings";
import { PlayerCommand } from "@engine/PlayerCommand";

/**
 * The map zoom (browser-port addition) has to hold three things at once, and
 * each fails silently rather than loudly:
 *
 * 1. At zoom 1 it must be *exactly* C#'s camera — 31x21 tiles. Any drift here
 *    silently changes what the player can see, and the sim would keep passing.
 * 2. The camera must stay the same panel, i.e. tile counts scale with the zoom
 *    and the drawn extent still covers (or over-covers) the panel.
 * 3. `ScreenToMap` must invert what is actually on screen. The engine draws
 *    positions for 32px tiles and applies the scale afterwards (`withMapZoom`),
 *    so the inverse has to divide by the *displayed* tile size — get that
 *    wrong and mouse look/inventory clicks land on the wrong tile, which no
 *    headless run would ever catch since it has no mouse.
 */

function newGame(): RogueGame {
  return new RogueGame(new NullRogueUI(), new NullMusicManager());
}

describe("map zoom", () => {
  beforeEach(() => {
    // The level is process-wide (it is a display preference), and the test
    // order must not decide what the first assertion sees.
    newGame().SetMapZoom(1);
  });

  afterEach(() => {
    newGame().SetMapZoom(1);
  });

  it("keeps C#'s 31x21 camera at zoom 1", () => {
    const game = newGame();
    game.ComputeViewRect(new Point(50, 50));
    expect(game.MapZoom).toBe(1);
    expect(game.m_MapViewRect.width).toBe(31);
    expect(game.m_MapViewRect.height).toBe(21);
  });

  it("centres the player, as C#'s HALF_VIEW_* camera does", () => {
    const game = newGame();
    game.ComputeViewRect(new Point(50, 50));
    // 15 tiles left and right, 10 up and down.
    expect(game.MapToScreen(50, 50)).toEqual(new Point(15 * TILE_SIZE, 10 * TILE_SIZE));
    expect(game.MapToScreen(35, 40)).toEqual(new Point(0, 0));
  });

  it("fills the same panel with half as many tiles when zoomed in", () => {
    const game = newGame();
    game.SetMapZoom(2);
    game.ComputeViewRect(new Point(50, 50));

    const columns = Math.ceil(MAP_PANEL_WIDTH / (TILE_SIZE * 2));
    const rows    = Math.ceil(MAP_PANEL_HEIGHT / (TILE_SIZE * 2));
    expect(columns).toBe(16);
    expect(rows).toBe(11);

    expect(game.m_MapViewRect.width).toBe(columns);
    expect(game.m_MapViewRect.height).toBe(rows);
    // Fewer tiles must still cover the panel, or the map would not fill it.
    expect(columns * TILE_SIZE * 2).toBeGreaterThanOrEqual(MAP_PANEL_WIDTH);
    expect(rows * TILE_SIZE * 2).toBeGreaterThanOrEqual(MAP_PANEL_HEIGHT);
  });

  it("maps screen pixels back to the tile under the cursor at either zoom", () => {
    const game = newGame();

    game.SetMapZoom(1);
    game.ComputeViewRect(new Point(50, 50));
    // Anywhere inside the player's tile, at 32px.
    expect(game.ScreenToMap(15 * TILE_SIZE + 5, 10 * TILE_SIZE + 5)).toEqual(new Point(50, 50));
    // The tile to the right starts 32px further on.
    expect(game.ScreenToMap(16 * TILE_SIZE + 5, 10 * TILE_SIZE + 5)).toEqual(new Point(51, 50));

    game.SetMapZoom(2);
    game.ComputeViewRect(new Point(50, 50));
    // The panel's top-left corner is the view rect's top-left tile, still at
    // screen (0,0) — the camera is not offset by the zoom.
    expect(game.MapToScreen(43, 45)).toEqual(new Point(0, 0));
    expect(game.ScreenToMap(0, 0)).toEqual(new Point(43, 45));
    // The tile the player stands on is now twice as wide on screen. Note the
    // two coordinate spaces: MapToScreen answers in pre-scale pixels (what a
    // draw call inside the zoom scope wants), while the mouse arrives in
    // displayed pixels — so the on-screen x of that tile is MapToScreen * zoom.
    const preScale = game.MapToScreen(50, 50);
    const onScreen = new Point(preScale.x * 2, preScale.y * 2);
    expect(game.ScreenToMap(onScreen.x + 5, onScreen.y + 5)).toEqual(new Point(50, 50));
    expect(game.ScreenToMap(onScreen.x + TILE_SIZE * 2 + 5, onScreen.y + 5)).toEqual(new Point(51, 50));
  });

  it("round-trips every tile of the view at both zooms", () => {
    const game = newGame();
    for (const zoom of MAP_ZOOM_LEVELS) {
      game.SetMapZoom(zoom);
      game.ComputeViewRect(new Point(50, 50));

      for (let dx = 0; dx < game.m_MapViewRect.width; dx++) {
        for (let dy = 0; dy < game.m_MapViewRect.height; dy++) {
          const tile = new Point(game.m_MapViewRect.left + dx, game.m_MapViewRect.top + dy);
          // The middle of the tile as displayed — what the mouse would report.
          const preScale = game.MapToScreen(tile);
          const mid = new Point(
            (preScale.x + TILE_SIZE / 2) * zoom,
            (preScale.y + TILE_SIZE / 2) * zoom,
          );
          expect(game.ScreenToMap(mid.x, mid.y).equals(tile)).toBe(true);
        }
      }
    }
  });

  it("clamps at both ends and keeps the same level when already there", () => {
    const game = newGame();
    game.SetMapZoom(1);
    expect(game.MapZoom).toBe(1);

    // Stepping past the last level must be a no-op, not a wrap or a smaller
    // zoom: keys auto-repeat, so this runs on every repeat.
    game.StepMapZoom(1);
    expect(game.MapZoom).toBe(2);
    game.StepMapZoom(1);
    game.StepMapZoom(1);
    expect(game.MapZoom).toBe(2);

    game.StepMapZoom(-1);
    expect(game.MapZoom).toBe(1);
    game.StepMapZoom(-1);
    expect(game.MapZoom).toBe(1);
  });
});

describe("zoom keybindings", () => {
  it("binds zoom to the unshifted symbols by default", () => {
    const keys = new Keybindings();
    expect(keys.get(PlayerCommand.ZOOM_IN)).toBe("=");
    expect(keys.get(PlayerCommand.ZOOM_OUT)).toBe("-");
  });

  it("resolves the shifted and keypad spellings to the same commands", () => {
    const keys = new Keybindings();
    // '+' is shift+'=' on a US layout, so the browser reports a shift modifier
    // with it; the numpad's is spelled "Add" with no modifier at all.
    expect(InputTranslator.keyToCommand(keys, "+", false, false, true)).toBe(PlayerCommand.ZOOM_IN);
    expect(InputTranslator.keyToCommand(keys, "Add")).toBe(PlayerCommand.ZOOM_IN);
    expect(InputTranslator.keyToCommand(keys, "=")).toBe(PlayerCommand.ZOOM_IN);
    expect(InputTranslator.keyToCommand(keys, "_", false, false, true)).toBe(PlayerCommand.ZOOM_OUT);
    expect(InputTranslator.keyToCommand(keys, "Subtract")).toBe(PlayerCommand.ZOOM_OUT);
    expect(InputTranslator.keyToCommand(keys, "-")).toBe(PlayerCommand.ZOOM_OUT);
  });

  it("does not steal a bound key from another command", () => {
    const keys = new Keybindings();
    // Every default must be a distinct key, or the redefine screen would open
    // on a conflict.
    expect(keys.checkForConflict()).toBe(false);
    expect(InputTranslator.keyToCommand(keys, "=")).toBe(PlayerCommand.ZOOM_IN);
    expect(InputTranslator.keyToCommand(keys, "-")).toBe(PlayerCommand.ZOOM_OUT);
  });
});
