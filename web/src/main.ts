import { CanvasUI }             from "@ui/CanvasUI";
import { InputHandler }         from "@ui/InputHandler";
import { Color }                from "@engine/Color";
import { RogueGame }            from "@engine/RogueGame";
import { WebAudioAmbientManager } from "@engine/audio/WebAudioAmbientManager";
import { WebAudioMusicManager } from "@engine/audio/WebAudioMusicManager";
import { loadGameFonts }        from "@ui/fonts";
import { InputTranslator }      from "@engine/Keybindings";
import { PlayerCommand }        from "@engine/PlayerCommand";

async function main(): Promise<void> {
  // ── Bootstrap ──────────────────────────────────────────────────────────────
  if (typeof (window as any).Neutralino !== "undefined") {
    try {
      (window as any).Neutralino.init();
    } catch (e) {
      console.warn("[Neutralino] init failed:", e);
    }
  }

  registerServiceWorker();

  // `?debug=1` enables per-action `[render]` console logging (see
  // RogueGame.logRenderState) for diagnosing drawing reports.
  try {
    const debug = new URLSearchParams(location.search).get("debug") === "1";
    RogueGame.debugRender = debug;
    CanvasUI.debugDraw = debug;
  } catch {
    RogueGame.debugRender = false;
    CanvasUI.debugDraw = false;
  }

  const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
  if (!canvas) throw new Error("No #gameCanvas element found");

  /*
   * The typeface, before anything is drawn.
   *
   * A canvas draws text with whatever font is *loaded*, so a webfont that has not
   * arrived yet means the first frames are rendered in the fallback and then
   * silently re-rendered in the real face — a visible reflow of every menu and
   * panel, and a set of metrics that differ from the ones the layout maths
   * assumes. Awaiting here costs one font fetch during the loading overlay.
   *
   * It is awaited rather than fired-and-forgotten on purpose: `loadGameFonts`
   * never rejects (a missing face is a warning, and the stack falls back), so
   * this cannot hold up the boot.
   */
  await loadGameFonts();

  const input = new InputHandler();

  // Let the game claim keystrokes so the browser's own shortcuts do not fire
  // alongside them. Injected rather than imported into `ui/InputHandler`, because
  // the live bindings live behind a static on `RogueGame` and importing that into
  // the UI layer would close a cycle (RogueGame -> IRogueUI -> CanvasUI ->
  // InputHandler). See `InputHandler.setCommandPredicate`.
  input.setCommandPredicate((key, ctrl, alt, shift, code) => {
    const cmd = InputTranslator.keyToCommand(RogueGame.KeyBindings(), key, ctrl, alt, shift, code);
    return cmd !== PlayerCommand.NONE;
  });

  const ui    = new CanvasUI(canvas, input);
  input.attach();

  // Hide loading overlay
  const loading = document.getElementById("loading");
  if (loading) loading.classList.add("hidden");

  // Phase 4: real game boot — loads data/options/keys/hints/manual/hiscores,
  // then runs the main menu → character creation → game loop.
  // The third channel, built here for the same reason the second is: `RogueGame`
  // defaults both managers to their null implementations so the headless harness
  // and the tests never touch a browser audio API, and the browser passes the
  // real ones. C# does the same at `RogueGame.cs:861` — a *second* manager
  // instance, not a second kind of manager.
  const game = new RogueGame(ui, new WebAudioMusicManager(), new WebAudioAmbientManager());
  try {
    await game.Run();
  } catch (e) {
    // Phase 4 lands slice by slice: show which method is still missing instead
    // of dying silently in the console.
    drawError(ui, e as Error);
  }
}

/**
 * Enables offline play (Phase 8 task 7).
 *
 * Registered before the game boots but deliberately not awaited: the first
 * visit should start rendering immediately rather than wait on the SW, and a
 * failed registration must never stop the game from running. `sw.js` sits in
 * `public/` so Vite serves it from the origin root, which is required for it
 * to control the whole scope.
 */
function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  // file:// has no service worker support and throws rather than no-op'ing.
  if (location.protocol === "file:") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((e: unknown) => {
      // Offline play is a bonus, not a requirement: log and carry on.
      console.warn("[RogueSurvivor] service worker registration failed:", e);
    });
  });
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
