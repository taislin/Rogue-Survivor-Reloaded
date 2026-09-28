import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { HeadlessRunner } from "../../src/sim/HeadlessRunner";
import { NullRogueUI } from "@ui/NullRogueUI";
import { IRogueUI, GameKeyEvent, MouseButton } from "@engine/IRogueUI";
import {
  RogueGame,
  INVENTORYPANEL_X,
  GROUNDINVENTORYPANEL_Y,
  MAP_PANEL_WIDTH,
  MAP_PANEL_HEIGHT,
} from "@engine/RogueGame";
import { GameMode } from "@engine/Session";
import { SimRatio } from "@engine/GameOptions";
import { Item } from "@data/Item";
import { ItemID } from "@gameplay/GameItems";
import { Color } from "@engine/Color";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";

/**
 * Two mouse paths that the headless simulator cannot reach, because it has no
 * mouse: parking the cursor on a tile, and picking an item up off the ground.
 * Both are driven here through a UI that behaves like a browser.
 */

/**
 * A browser-shaped `IRogueUI`: the cursor is whatever the test says it is, keys
 * arrive only when posted, and redraws are counted.
 *
 * Extends `NullRogueUI` rather than re-implementing the interface, so the parts
 * that are not the point of this file — including the map ⇄ screen conversion,
 * which this test exercises through the mouse — come from the one implementation
 * that has them. A hand-written `implements IRogueUI` breaks on every interface
 * addition and invites a second copy of the conversion arithmetic, which is the
 * exact hazard the move to `IRogueUI` was for.
 */
class MouseProbeUI extends NullRogueUI {
  redraws = 0;
  mousePosition: Point = new Point(0, 0);
  mouseButtons: MouseButton | null = null;
  /** False models a UI that peeks at the buttons without consuming them. */
  consumeMouseButtons = true;
  /** CSS pixels per canvas pixel, i.e. `UI_GetCanvasScale*`. */
  displayScale = 1;

  private pendingKey: GameKeyEvent | null = null;

  resetCounts(): void { this.redraws = 0; }

  postKey(key: string): void {
    this.pendingKey = { key, keyCode: key.charCodeAt(0), shift: false, ctrl: false, alt: false };
  }

  /**
   * Converts canvas coordinates into what the browser would report.
   *
   * A canvas displayed at `displayScale` covers `displayScale` CSS pixels per
   * canvas pixel, so the reported position is the larger of the two — and
   * `UI_GetCanvasScale*` is the factor the engine divides it back down by.
   */
  fromCanvas(x: number, y: number): Point {
    return new Point(x * this.displayScale, y * this.displayScale);
  }

  UI_WaitKey(): Promise<GameKeyEvent> {
    const k = this.pendingKey;
    if (k !== null) { this.pendingKey = null; return Promise.resolve(k); }
    return new Promise<GameKeyEvent>((r) => setTimeout(() => r({ key: "Escape", keyCode: 27, shift: false, ctrl: false, alt: false }), 0));
  }
  UI_PeekKey(): GameKeyEvent | null { const k = this.pendingKey; this.pendingKey = null; return k; }
  UI_PostKey(e: GameKeyEvent): void { this.postKey(e.key); }
  UI_GetMousePosition(): Point { return this.mousePosition; }
  UI_PeekMouseButtons(): MouseButton | null {
    if (!this.consumeMouseButtons) return this.mouseButtons;
    const b = this.mouseButtons;
    this.mouseButtons = null;
    return b;
  }
  UI_PostMouseButtons(b: MouseButton): void { this.mouseButtons = b === MouseButton.None ? null : b; }
  async UI_PreloadImages(_ids: string[], p?: (l: number, t: number) => void): Promise<void> { p?.(0, 0); }
  UI_Repaint(): void {}
  UI_Clear(_c: Color): void { this.redraws++; }
  async UI_Wait(_m: number): Promise<void> { await Promise.resolve(); }
  UI_DrawImage(): void {}
  UI_DrawImageTinted(): void {}
  UI_DrawImageTransform(): void {}
  UI_DrawGrayLevelImage(): void {}
  UI_DrawTransparentImage(): void {}
  UI_DrawPoint(): void {}
  UI_DrawLine(): void {}
  UI_DrawRect(): void {}
  UI_FillRect(): void {}
  UI_DrawString(): void {}
  UI_DrawStringBold(): void {}
  UI_DrawStringLarge(): void {}
  UI_DrawStringBoldLarge(): void {}
  UI_DrawPopup(): void {}
  UI_DrawPopupTitle(): void {}
  UI_DrawPopupTitleColors(): void {}
  UI_ClearMinimap(): void {}
  UI_SetMinimapColor(): void {}
  UI_DrawMinimap(): void {}
  UI_GetCanvasScaleX(): number { return this.displayScale; }
  UI_GetCanvasScaleY(): number { return this.displayScale; }
  UI_BeginScaledDraw(_s: number, _r?: Rect): void {}
  UI_EndScaledDraw(): void {}
  UI_SaveScreenshot(): string { return ""; }
  UI_ScreenshotExtension(): string { return "png"; }
  UI_DoQuit(): void {}
}

const SEED = 777;

let game: RogueGame;
let realUI: IRogueUI;

/** A real, played game, so the mouse paths run against a real player and map. */
beforeAll(async () => {
  const runner = new HeadlessRunner(SEED, new NullRogueUI());
  game = runner.rogueGame;
  realUI = game.m_UI;
  await game.LoadData();
  // The null UI answers the prompts a new game shows (ENTER, yes/no), which is
  // how the simulator gets through StartNewGame at all. The probe is swapped in
  // afterwards, for the mouse paths only.
  const opts = RogueGame.options;
  opts.citySize = 1;
  opts.simulateDistricts = SimRatio.OFF;
  opts.isAnimDelayOn = false;
  opts.isAdvisorEnabled = false;
  game.session.gameMode = GameMode.GM_STANDARD;
  await game.StartNewGame();
}, 120_000);

afterEach(() => {
  (game as unknown as { m_UI: IRogueUI }).m_UI = realUI;
});

/** Runs `fn` with the probe installed as the game's UI. */
function withProbe<T>(probe: MouseProbeUI, fn: () => T): T {
  (game as unknown as { m_UI: IRogueUI }).m_UI = probe;
  return fn();
}

/**
 * Lets the play loop wait with the cursor on the player's tile, then lets it go.
 *
 * Returns the redraws counted while it waited. The release matters: a spinning
 * loop starves the event loop so badly that the test worker cannot report a
 * failure, so every path here ends with the loop returned.
 */
async function redrawsWhileWaiting(probe: MouseProbeUI, ms: number): Promise<number> {
  const player = game.player!;
  // The player's own tile: inside the view rect, so `HandleMouseLook` keeps
  // answering "looking" and the loop re-enters the wait on every pass.
  probe.mousePosition = game.MapToScreen(player.location.position);
  probe.resetCounts();

  const running = game.HandlePlayerActor(player);
  await new Promise<void>((r) => setTimeout(r, ms));
  probe.postKey("."); // WAIT_OR_SELF: ends the turn and returns from the loop
  await Promise.race([
    running,
    new Promise<void>((r) => setTimeout(r, 2000)),
  ]);
  return probe.redraws;
}

describe("play loop with the cursor parked on a map tile", () => {
  it("waits instead of redrawing in a loop", async () => {
    const probe = new MouseProbeUI();
    const redraws = await withProbe(probe, () => redrawsWhileWaiting(probe, 250));
    // One redraw for the frame already on screen. A spin does hundreds.
    expect(redraws).toBeLessThanOrEqual(2);
  }, 30_000);

  it("still parks when a mouse button is stranded, as after a drag out of the window", async () => {
    // The mousedown arrives, the mouseup is swallowed by leaving the window, and
    // the button stays set. A peek that does not consume reports it forever, the
    // wait returns on every poll, and the loop redraws without end — which is
    // what "the game freezes when I hover over an object" was.
    const probe = new MouseProbeUI();
    probe.consumeMouseButtons = false;
    probe.mouseButtons = MouseButton.Left;
    const redraws = await withProbe(probe, () => redrawsWhileWaiting(probe, 250));
    expect(redraws).toBeLessThanOrEqual(2);
  }, 30_000);
});

describe("WaitKeyOrMouse", () => {
  it("delivers a pending press once, then waits for real input", async () => {
    const probe = new MouseProbeUI();
    probe.consumeMouseButtons = false;
    // Start from "no buttons observed": the engine remembers the last mask it
    // saw, across waits, so the press below has to be a change to count.
    probe.mouseButtons = null;

    await withProbe(probe, async () => {
      await Promise.race([
        game.WaitKeyOrMouse(),
        new Promise<void>((r) => setTimeout(r, 100)),
      ]);

      // A press the UI keeps reporting, as a stranded button would.
      probe.mouseButtons = MouseButton.Left;
      const first = await Promise.race([
        game.WaitKeyOrMouse().then((r) => r.mouseButtons),
        new Promise<MouseButton | null>((r) => setTimeout(() => r(null), 300)),
      ]);
      // The pending press is delivered…
      expect(first).toBe(MouseButton.Left);

      // …and the wait after it parks, even though the button is still "held".
      // Otherwise the play loop, which re-enters the wait while the cursor is on
      // the map, redraws forever.
      const second = await Promise.race([
        game.WaitKeyOrMouse().then(() => "returned"),
        new Promise<string>((r) => setTimeout(() => r("parked"), 300)),
      ]);
      expect(second).toBe("parked");
    });
  }, 30_000);

  it("returns when the mouse moves", async () => {
    const probe = new MouseProbeUI();
    await withProbe(probe, async () => {
      const parked = game.WaitKeyOrMouse();
      // A move that the UI would deliver as a mousemove.
      await new Promise((r) => setTimeout(r, 20));
      probe.mousePosition = new Point(probe.mousePosition.x + 8, probe.mousePosition.y + 8);
      const result = await Promise.race([
        parked.then((r) => r.mousePos),
        new Promise<string>((r) => setTimeout(() => r("parked"), 300)),
      ]);
      expect(result).not.toBe("parked");
    });
  }, 30_000);
});

describe("picking an item up off the ground", () => {
  /** Empties the ground inventory, so each case starts from slot 0. */
  function clearGround(): void {
    const player = game.player!;
    const map = player.location.map!;
    const existing = map.getItemsAt(player.location.position);
    if (existing != null) {
      for (const it of [...existing.items]) existing.removeAllQuantity(it);
      map.removeItemsAtIfEmpty(player.location.position);
    }
  }

  /** Drops one item at the player's feet and returns it. */
  function dropItem(): Item {
    clearGround();
    const player = game.player!;
    const item = new Item(game.gameItems.get(ItemID.FOOD_ARMY_RATION));
    player.location.map!.dropItemAt(item, player.location.position);
    return item;
  }

  /** Centre of a ground-inventory slot, in canvas coordinates. */
  function groundSlotCentre(slot: number): Point {
    const topLeft = game.InventorySlotToScreen(INVENTORYPANEL_X, GROUNDINVENTORYPANEL_Y, slot, 0);
    return new Point(topLeft.x + 16, topLeft.y + 16);
  }

  it("moves the item into the player inventory on a left click", () => {
    const item = dropItem();
    const player = game.player!;
    const ground = player.location.map!.getItemsAt(player.location.position)!;
    expect(ground.contains(item)).toBe(true);

    const probe = new MouseProbeUI();
    withProbe(probe, () => {
      const centre = groundSlotCentre(0);
      probe.mousePosition = probe.fromCanvas(centre.x, centre.y);
      const res = game.HandleMouseInventory(probe.mousePosition, MouseButton.Left, false);
      expect(res.hasDoneAction).toBe(true);
    });

    expect(player.inventory!.contains(item)).toBe(true);
    expect(ground.isEmpty).toBe(true);
  });

  it("works the same when the canvas is displayed larger than 1:1", () => {
    // The reported position is in CSS pixels and the engine divides by
    // `UI_GetCanvasScale*`; a probe at 2x must land on the same slot. Before the
    // mouse mapping was fixed, the position was scaled by the backing store and
    // then divided by the display scale again, so a click at 2x missed the panel
    // entirely and items could not be picked up.
    const item = dropItem();
    const player = game.player!;
    const ground = player.location.map!.getItemsAt(player.location.position)!;
    const probe = new MouseProbeUI();
    probe.displayScale = 2;

    withProbe(probe, () => {
      const centre = groundSlotCentre(0);
      probe.mousePosition = probe.fromCanvas(centre.x, centre.y);
      const res = game.HandleMouseInventory(probe.mousePosition, MouseButton.Left, false);
      expect(res.hasDoneAction).toBe(true);
    });

    expect(player.inventory!.contains(item)).toBe(true);
    expect(ground.isEmpty).toBe(true);
  });

  it("claims the map panel by its canvas pixels at any display scale", () => {
    // The bug this pins: `HandleMouseLook` compared the mouse position against
    // `MAP_PANEL_WIDTH`/`HEIGHT` **without** dividing by `UI_GetCanvasScale*`,
    // while every other conversion in the file does. The two only agree at a
    // 1366x768 window, so at any other size the handler claimed the wrong region:
    //
    //  - below 1366 (a 1280x720 laptop is scale 0.94) it over-claimed 58 logical px
    //    past the panel, into the side panel and the first item slot at x=872. This
    //    handler runs first in the play loop and `continue`s when it claims, so the
    //    over-claimed band is stolen before the inventory is ever asked.
    //  - above 1366 it under-claimed: at 1920x1080 (1.41) the right 249px of the
    //    map could not be hovered, and at 2560x1440 half the map was dead.
    //
    // The 2x case above did not catch it, and neither did `panel-hitboxes.test.ts`:
    // both compared logical constants to logical constants and never set a scale.
    // The existing guard was written for the *map zoom* bug (2x zoom made the grid
    // wider than the panel), which is a different axis and a different fix.
    //
    // Asserted as a claim about *both* edges at once, because the two failures pull
    // in opposite directions and a one-sided test passes on half the bug: whatever
    // the scale, a position inside the panel must be claimed and a position in the
    // side panel must not be.
    //
    // **What this reliably pins, and what it does not.** The under-claim half is
    // deterministic and fails loudly on the old code at every scale above 1:1 — the
    // right edge of the panel is simply unreachable. The over-claim half is
    // *verified* here too, but it does not fail on the old code in this fixture,
    // because the over-claimed band maps to a tile just outside the 27-tile view
    // rect, so `IsInViewRect` returns false and the handler declines the mouse
    // anyway. Whether the over-claim actually steals a slot therefore depends on
    // the player standing right of centre, where that tile *is* in view — which is
    // what makes it intermittent and position-dependent in the field. The
    // arithmetic is in the comment on `HandleMouseLook`; the regression that is
    // cheap to assert is the under-claim, and that is what this holds down.
    const map = game.session.currentMap!;
    for (const displayScale of [1, 0.75, 1280 / 1366, 1.25, 1920 / 1366, 2, 3]) {
      const probe = new MouseProbeUI();
      probe.displayScale = displayScale;
      const label = `display scale ${displayScale.toFixed(3)}`;

      withProbe(probe, () => {
        // A point deep inside the map panel must be claimed by the look handler.
        const insideX = Math.floor(MAP_PANEL_WIDTH / 2);
        const insideY = Math.floor(MAP_PANEL_HEIGHT / 2);
        probe.mousePosition = probe.fromCanvas(insideX, insideY);
        const claimedInside = game.HandleMouseLook(probe.mousePosition);
        expect(claimedInside, `${label}: the middle of the map panel is not hoverable`).toBe(true);

        // The right-hand edge of the panel, 4px inside, must be claimed too —
        // this is the half that under-claimed above 1:1, and it is the half a
        // centre-point check cannot see.
        const edgeX = MAP_PANEL_WIDTH - 4;
        probe.mousePosition = probe.fromCanvas(edgeX, insideY);
        expect(
          game.HandleMouseLook(probe.mousePosition),
          `${label}: the right edge of the map panel is not hoverable`,
        ).toBe(true);

        // And the side panel must never be claimed, however far the test reaches
        // past the panel edge — this is the half that over-claimed below 1:1.
        for (const sidePanelX of [MAP_PANEL_WIDTH + 1, INVENTORYPANEL_X, INVENTORYPANEL_X + 16]) {
          probe.mousePosition = probe.fromCanvas(sidePanelX, insideY);
          expect(
            game.HandleMouseLook(probe.mousePosition),
            `${label}: the look handler claimed the side panel at x=${sidePanelX}`,
          ).toBe(false);
        }
      });
    }
    expect(map).toBeDefined();
  });

  it("reports the hovered item without taking it, on a click-free move", () => {
    const item = dropItem();
    const player = game.player!;
    const ground = player.location.map!.getItemsAt(player.location.position)!;
    const probe = new MouseProbeUI();

    withProbe(probe, () => {
      const centre = groundSlotCentre(0);
      probe.mousePosition = probe.fromCanvas(centre.x, centre.y);
      const hit = game.MouseToInventoryItem(probe.mousePosition);
      expect(hit.result).toBe(item);
      expect(hit.inv).toBe(ground);
    });

    // Nothing was taken, because no button was involved.
    expect(ground.contains(item)).toBe(true);
    expect(player.inventory!.contains(item)).toBe(false);
  });
});
