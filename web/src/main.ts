import { CanvasUI }             from "@ui/CanvasUI";
import { InputHandler }         from "@ui/InputHandler";
import { Color }                from "@engine/Color";
import { RogueGame }            from "@engine/RogueGame";
import { WebAudioAmbientManager } from "@engine/audio/WebAudioAmbientManager";
import { WebAudioMusicManager } from "@engine/audio/WebAudioMusicManager";
import { WebAudioSoundManager } from "@engine/audio/WebAudioSoundManager";
import { loadGameFonts }        from "@ui/fonts";
import { InputTranslator }      from "@engine/Keybindings";
import { PlayerCommand }        from "@engine/PlayerCommand";
import { storage, hasNeutralino } from "@engine/storage";
import { fireAndForget }        from "@engine/Diagnostics";
import { startUpdateCheck }     from "@engine/Update";

async function main(): Promise<void> {
  // ── Bootstrap ──────────────────────────────────────────────────────────────
  if (typeof (window as any).Neutralino !== "undefined") {
    try {
      (window as any).Neutralino.init();
    } catch (e) {
      console.warn("[Neutralino] init failed:", e);
    }
  }

  registerStorageExitFlush();

  registerServiceWorker();

  // Ask whether a newer desktop build exists, here rather than at the menu, so
  // the answer has the whole first load to arrive in (the port preloads 1 009
  // image ids before the menu appears) and the menu usually draws it settled.
  //
  // `hasNeutralino` is an early-out, not the desktop test: it is true in the
  // browser build as well, because `index.html` loads the Neutralino client
  // there too. `Update` therefore asks the server one read-only question before
  // it fetches anything — see `nativeContainerReady`.
  if (hasNeutralino) {
    fireAndForget("desktop update check", startUpdateCheck());
  }

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
  // Three channels, because they are three different things: music and ambients are
  // streamed beds and sound effects are one-shots. The third is the only one that
  // applies the measured per-effect gains in `AudioLevels.SFX_GAINS` -- see
  // `RogueGame`'s constructor for why every effect was quietly playing too quietly
  // before it existed.
  const game = new RogueGame(
    ui,
    new WebAudioMusicManager(),
    new WebAudioAmbientManager(),
    new WebAudioSoundManager(),
  );
  try {
    await game.Run();
  } catch (e) {
    // Phase 4 lands slice by slice: show which method is still missing instead
    // of dying silently in the console.
    drawError(ui, e as Error);
  }
}

/**
 * Best-effort write-out when the page goes away.
 *
 * The desktop backend writes through an async RPC to the Neutralino server, and a
 * process that exits with one in flight loses it. Every `setItem` schedules a
 * write on a microtask, so the window is small — but small is not zero, and it is
 * exactly the window a player hits by quitting right after changing an option.
 *
 * The DOM events are the ones a Neutralino webview actually fires; the
 * `Neutralino.events` names are registered as well because a server-side exit
 * never reaches the page at all, and a handler that does not fire costs nothing.
 * There is no guarantee any of them runs long enough for the RPC — that is
 * inherent to writing over a socket, and the reason the write is scheduled on
 * every change rather than only at exit.
 */
function registerStorageExitFlush(): void {
  const flush = () => {
    // Not awaited: nothing can await during unload. A rejection here means the
    // write did not land, and `flush` already reported it.
    void storage.flush?.().catch(() => undefined);
  };
  for (const ev of ["pagehide", "beforeunload", "visibilitychange"]) {
    window.addEventListener(ev, flush);
  }
  const events = (window as any).Neutralino?.events;
  if (events && typeof events.on === "function") {
    for (const ev of ["windowExit", "windowClose", "appExit"]) {
      try {
        events.on(ev, flush);
      } catch {
        // An event name this client does not know. The DOM handlers above are the
        // ones that matter; this is belt and braces.
      }
    }
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
function drawError(ui: CanvasUI, e: unknown): void {
  console.error("[RogueSurvivor]", e);

  // **Nothing in here may throw.** This runs from a `catch`, so a fault in the
  // error reporter is a fault nobody can see: the canvas keeps whatever the boot
  // left on it — which, for a failure before the first draw, is nothing at all.
  // That is a black screen with no message, which is the least diagnosable
  // outcome available and strictly worse than the error it was hiding.
  //
  // Two ways that used to happen, both now closed:
  //   - `e.message` on a thrown *string*, `null` or `undefined`. `undefined.message`
  //     throws, and it threw *before* `UI_Clear`, so not even the red heading was
  //     painted.
  //   - the paint itself throwing, e.g. before the font finished loading.
  const message =
    e instanceof Error
      ? e.message
      : typeof e === "string"
        ? e
        : (() => {
            try {
              return String(e);
            } catch {
              return "an unknown value was thrown";
            }
          })();
  const notYetPorted = message.includes("not yet ported");

  try {
    ui.UI_Clear(Color.Black);

    let y = 120;
    ui.UI_DrawStringBold(
      notYetPorted ? Color.Yellow : Color.Red,
      notYetPorted ? "Rogue Survivor Reloaded — Phase 4 in progress" : "Rogue Survivor Reloaded — error",
      40,
      y
    );
    y += 40;

    ui.UI_DrawString(Color.White, message, 40, y);
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
  } catch (drawFailure) {
    // The console line above is the last resort and it has already happened, so
    // this only has to not make things worse.
    console.error("[RogueSurvivor] drawError could not paint:", drawFailure);
  }
}

main().catch(console.error);
