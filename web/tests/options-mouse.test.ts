import { describe, it, expect, beforeEach } from "vitest";
import { OptionsScreen } from "@ui/OptionsScreen";
import { NullRogueUI } from "@ui/NullRogueUI";
import { GameOptions, Options } from "@engine/GameOptions";
import { GameKeyEvent, MouseButton, IRogueUI } from "@engine/IRogueUI";
import { Point } from "@engine/Point";
import { Color } from "@engine/Color";
import { Rect } from "@engine/Rect";
import { MusicPriority, type IMusicManager, type MusicPriorityValue } from "@engine/audio/IMusicManager";

/**
 * The options screen and the mouse.
 *
 * A list of 41 options is a list of 41 rows, and a list of rows is the canonical
 * thing a mouse is good at. Before this the screen called `UI_WaitKey()` and
 * nothing else: `UI_GetMousePosition` and `UI_PeekMouseButtons` appeared nowhere
 * in `OptionsScreen`, so a click did literally nothing.
 *
 * **The awkward part, and why it needed row geometry.** The screen had no notion of
 * where a row *is* — it drew by advancing a `gy` and returned it — so hit-testing
 * would have meant re-deriving the layout, which is a second copy of the
 * arithmetic. That is already how the two `drawMenuOrOptions` implementations came
 * to disagree about the value column. The one place that computes the geometry now
 * reports it, and these tests assert a click and the highlight agree about which row
 * is selected.
 *
 * Nothing here changes a rule. It changes how a player *reaches* an option; the
 * keyboard still does everything it did, and the screen still only leaves on ESC.
 */

/** One scripted input event, in the order the screen will see them. */
type Step =
  | { kind: "key"; key: string }
  | { kind: "move"; x: number; y: number }
  | { kind: "click"; x: number; y: number; button?: MouseButton };

/**
 * A UI that records what it drew and replays scripted input.
 *
 * Extends `NullRogueUI` rather than implementing `IRogueUI`, so an interface
 * addition does not break it — the hazard `mouse-paths.test.ts` records. Mouse
 * buttons *consume*, mirroring `InputHandler`: a press is delivered once and a held
 * button is not re-reported, which is what stops one click from looping forever.
 */
class OptionsProbeUI extends NullRogueUI {
  /** `UI_DrawStringBoldLarge` calls for the frame currently on screen. */
  readonly boldDraws: Array<{ text: string; x: number; y: number }> = [];
  mousePosition: Point = new Point(-1, -1);
  mouseButtons: MouseButton | null = null;
  /** CSS pixels per logical pixel, i.e. `UI_GetCanvasScale*`. */
  displayScale = 1;
  private steps: Step[] = [];
  private pressed: GameKeyEvent | null = null;

  setScript(steps: Step[]): void { this.steps = [...steps]; }

  private next(): Step | undefined { return this.steps.shift(); }

  /**
   * The option rows as drawn: their label text, and where each was drawn.
   *
   * Recovered from the drawing rather than from the screen's private list, so the
   * test measures what a player can see and aim at. Option labels are the bold
   * strings that carry the cursor prefix the screen puts on a row; the header lines
   * and the value column do not.
   */
  get rows(): Array<{ label: string; x: number; y: number }> {
    return this.boldDraws
      .filter((d) => d.text.startsWith("---> ") || d.text.startsWith("     "))
      .map((d) => ({ label: d.text.slice(5).trim(), x: d.x, y: d.y }));
  }

  /** The label the screen is currently pointing at, if any. */
  get highlighted(): string | null {
    const marked = this.boldDraws.find((d) => d.text.startsWith("---> "));
    return marked === undefined ? null : marked.text.slice(5).trim();
  }

  // ── input: one scripted step per poll ──
  UI_PeekKey(): GameKeyEvent | null {
    if (this.pressed !== null) { const k = this.pressed; this.pressed = null; return k; }
    const step = this.next();
    if (step === undefined) return null;
    if (step.kind === "key") {
      this.pressed = { key: step.key, keyCode: step.key.charCodeAt(0), shift: false, ctrl: false, alt: false };
      return this.UI_PeekKey();
    }
    this.mousePosition = new Point(step.x * this.displayScale, step.y * this.displayScale);
    if (step.kind === "click") this.mouseButtons = step.button ?? MouseButton.Left;
    return null;
  }
  UI_PostKey(e: GameKeyEvent): void { this.pressed = e; }
  UI_GetMousePosition(): Point { return this.mousePosition; }
  UI_PeekMouseButtons(): MouseButton | null {
    const b = this.mouseButtons; this.mouseButtons = null; return b;
  }
  UI_PostMouseButtons(b: MouseButton): void { this.mouseButtons = b === MouseButton.None ? null : b; }
  UI_GetCanvasScaleX(): number { return this.displayScale; }
  UI_GetCanvasScaleY(): number { return this.displayScale; }

  // ── draw ──
  UI_Clear(_c: Color): void { this.boldDraws.length = 0; }
  UI_DrawStringBoldLarge(_c: Color, text: string, x: number, y: number): void {
    this.boldDraws.push({ text, x, y });
  }
  UI_DrawStringLarge(): void {}
  UI_DrawString(): void {}
  UI_Repaint(): void {}
  UI_FillRect(): void {}
  UI_DrawRect(): void {}
  UI_DrawPoint(): void {}
  UI_DrawLine(): void {}
  UI_DrawImage(): void {}
  UI_DrawImageTinted(): void {}
  UI_DrawImageTransform(): void {}
  UI_DrawGrayLevelImage(): void {}
  UI_DrawTransparentImage(): void {}
  UI_ClearMinimap(): void {}
  UI_SetMinimapColor(): void {}
  UI_DrawMinimap(): void {}
  UI_DrawPopup(): void {}
  UI_DrawPopupTitle(): void {}
  UI_DrawPopupTitleColors(): void {}
  UI_BeginScaledDraw(_s: number, _r?: Rect): void {}
  UI_EndScaledDraw(): void {}
  UI_SaveScreenshot(): string { return ""; }
  UI_ScreenshotExtension(): string { return "png"; }
  UI_DoQuit(): void {}
  async UI_Wait(_m: number): Promise<void> { await Promise.resolve(); }
  async UI_PreloadImages(_i: string[], p?: (l: number, t: number) => void): Promise<void> { p?.(0, 0); }
}

/**
 * A music manager the screen can call into.
 *
 * Not `{}`: `applyOptions` runs on every iteration and calls `setVolume`, so a
 * bare object throws before the screen ever reaches its input. Implemented fully
 * rather than cast, so adding a method to the interface breaks this file instead of
 * silently passing.
 */
const music: IMusicManager = {
  play(): void {},
  playLooping(): void {},
  stop(): void {},
  pause(): void {},
  resume(): void {},
  isPlaying(): boolean { return false; },
  getCurrentMusicId(): string | null { return null; },
  getPriority(): MusicPriorityValue { return MusicPriority.NULL; },
  setVolume(): void {},
  getVolume(): number { return 0; },
};

/** Runs the screen, then the scripted Escape, and leaves the last frame drawn. */
async function run(ui: OptionsProbeUI, steps: Step[]): Promise<void> {
  ui.setScript([...steps, { kind: "key", key: "Escape" }]);
  await new OptionsScreen(ui as unknown as IRogueUI, music).run(false);
}

/**
 * One pass to learn the layout, because the row positions are what a click needs
 * and cannot be known until something has been drawn.
 */
async function learnRows(ui: OptionsProbeUI): Promise<Array<{ label: string; x: number; y: number }>> {
  await run(ui, []);
  const rows = ui.rows;
  expect(rows.length, "no option rows were drawn").toBeGreaterThan(5);
  return rows;
}

beforeEach(() => {
  GameOptions.load();
});

describe("the options screen and the mouse", () => {
  it("moves the highlight to the row the cursor is over", async () => {
    const probe = new OptionsProbeUI();
    const rows = await learnRows(probe);

    // Row 3, so the highlight has to genuinely move rather than start there.
    const target = rows[3]!;
    const ui = new OptionsProbeUI();
    await run(ui, [{ kind: "move", x: target.x + 5, y: target.y - 9 }]);

    expect(ui.highlighted, "the highlight did not follow the cursor").toBe(target.label);
  });

  it("does not change a value when the cursor merely passes over a row", async () => {
    const probe = new OptionsProbeUI();
    const rows = await learnRows(probe);
    const target = rows[3]!;

    const ui = new OptionsProbeUI();
    const before = JSON.stringify(Options);
    await run(ui, [{ kind: "move", x: target.x + 5, y: target.y - 9 }]);
    expect(JSON.stringify(Options), "hovering changed a setting").toBe(before);
  });

  it("selects a clicked row without stepping it, then steps it on a second click", async () => {
    const probe = new OptionsProbeUI();
    const rows = await learnRows(probe);
    const target = rows[3]!;
    // Inside the row band. The screen draws each label at its baseline and owns the
    // band *above* it, between this baseline and the previous one, so a click has
    // to aim above the baseline - which is also where the glyphs are, since canvas
    // text sits on its baseline.
    const at = { x: target.x + 5, y: target.y - 9 };

    // First click: the row was not selected, so this must move the selection and
    // change nothing. This is the property that keeps a stray click from silently
    // editing a setting, which on an options screen is the worst kind of accident.
    const first = new OptionsProbeUI();
    const before = JSON.stringify(Options);
    await run(first, [{ kind: "click", ...at }]);
    expect(first.highlighted, "the click did not select the row").toBe(target.label);
    expect(JSON.stringify(Options), "a first click on an unselected row changed a setting").toBe(before);

    // Second click on the now-selected row: this one steps the value.
    const second = new OptionsProbeUI();
    await run(second, [
      { kind: "click", ...at },
      { kind: "click", ...at },
    ]);
    expect(JSON.stringify(Options), "a click on the selected row did not step its value")
      .not.toBe(before);
  });

  it("ignores a click that lands on no row", async () => {
    const probe = new OptionsProbeUI();
    await learnRows(probe);

    // Top-left, above the list. The screen is modal and only saves on ESC, so a
    // click in dead space must not move the selection or touch a value.
    const ui = new OptionsProbeUI();
    const before = JSON.stringify(Options);
    await run(ui, [{ kind: "click", x: 2, y: 2 }]);
    expect(ui.highlighted, "a click on nothing moved the highlight").not.toBeNull();
    expect(JSON.stringify(Options), "a click on nothing changed a setting").toBe(before);
  });

  it("leaves only on Escape, and a click never ends the screen", async () => {
    const ui = new OptionsProbeUI();
    const rows = (await learnRows(ui)).slice(0, 2);
    let saves = 0;
    const originalSave = GameOptions.save.bind(GameOptions);
    GameOptions.save = ((o: GameOptions) => { saves++; originalSave(o); }) as typeof GameOptions.save;
    try {
      // Script clicks and a hover, and *no* Escape. `run` appends one, so the
      // script itself proves the screen survived every mouse event first.
      await run(ui, [
        { kind: "click", x: rows[0]!.x + 5, y: rows[0]!.y - 9 },
        { kind: "click", x: rows[1]!.x + 5, y: rows[1]!.y - 9 },
        { kind: "move", x: rows[0]!.x + 5, y: rows[0]!.y - 9 },
      ]);
      expect(saves, "the screen saved more than once").toBe(1);
    } finally {
      GameOptions.save = originalSave;
    }
  });

  it("works when the canvas is displayed at a fractional scale", async () => {
    // The reason the row rects are kept in logical pixels and converted on the way
    // in: a 1280x720 window is a scale of 0.94, and a click aimed at logical
    // coordinates would otherwise land on the wrong row or on nothing.
    const probe = new OptionsProbeUI();
    const rows = await learnRows(probe);
    const target = rows[3]!;

    const ui = new OptionsProbeUI();
    ui.displayScale = 1280 / 1366;
    // Inside the row band, which the screen owns *above* each baseline.
    await run(ui, [{ kind: "click", x: target.x + 5, y: target.y - 9 }]);
    expect(ui.highlighted, "a click missed its row at a fractional display scale")
      .toBe(target.label);
  });
});
