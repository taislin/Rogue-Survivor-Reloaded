import { CanvasUI }             from "@ui/CanvasUI";
import { InputHandler }         from "@ui/InputHandler";
import { Color }                from "@engine/Color";
import { RogueGame }            from "@engine/RogueGame";
import { WebAudioMusicManager } from "@engine/audio/WebAudioMusicManager";

async function main(): Promise<void> {
  // ── Bootstrap ──────────────────────────────────────────────────────────────
  const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
  if (!canvas) throw new Error("No #gameCanvas element found");

  const input = new InputHandler();
  const ui    = new CanvasUI(canvas, input);
  input.attach();

  // Hide loading overlay
  const loading = document.getElementById("loading");
  if (loading) loading.classList.add("hidden");

  // Phase 4: real game boot — loads data/options/keys/hints/manual/hiscores,
  // then runs the main menu → character creation → game loop.
  const game = new RogueGame(ui, new WebAudioMusicManager());
  try {
    await game.Run();
  } catch (e) {
    // Phase 4 lands slice by slice: show which method is still missing instead
    // of dying silently in the console.
    drawError(ui, e as Error);
  }
}

/** Explains an unported slice-4 method (or any boot error) on the canvas. */
function drawError(ui: CanvasUI, e: Error): void {
  console.error("[RogueSurvivor]", e);

  const notYetPorted = e.message.includes("not yet ported");
  ui.UI_Clear(Color.Black);

  let y = 120;
  ui.UI_DrawStringBold(
    notYetPorted ? Color.Yellow : Color.Red,
    notYetPorted ? "Rogue Survivor Reloaded — Phase 4 in progress" : "Rogue Survivor Reloaded — error",
    40,
    y
  );
  y += 40;

  ui.UI_DrawString(Color.White, e.message, 40, y);
  y += 40;

  if (notYetPorted) {
    const lines = [
      "The main menu, loading screens and character creation already work.",
      "The next Phase 4 slices port world generation, player commands and",
      "the play-screen renderer, then this boots into the game itself.",
    ];
    for (const line of lines) {
      ui.UI_DrawString(Color.LightGray, line, 40, y);
      y += 20;
    }
  } else {
    ui.UI_DrawString(Color.LightGray, "See the browser console for the stack trace.", 40, y);
  }

  ui.UI_Repaint();
}

main().catch(console.error);
