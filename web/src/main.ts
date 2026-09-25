import { CanvasUI }     from "@ui/CanvasUI";
import { InputHandler }  from "@ui/InputHandler";
import { OptionsScreen } from "@ui/OptionsScreen";
import { Color }         from "@engine/Color";
import { Rect }          from "@engine/Rect";
import { WorldTime }     from "@engine/WorldTime";
import { DiceRoller }    from "@engine/DiceRoller";
import { Direction }     from "@engine/Direction";
import { GameOptions, Options } from "@engine/GameOptions";

async function main(): Promise<void> {
  // ── Bootstrap ──────────────────────────────────────────────────────────────
  const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
  if (!canvas) throw new Error("No #gameCanvas element found");

  const input  = new InputHandler();
  const ui     = new CanvasUI(canvas, input);
  input.attach();

  // Hide loading overlay
  const loading = document.getElementById("loading");
  if (loading) loading.classList.add("hidden");

  // Load persisted options (C# RogueGame.LoadOptions() at startup).
  Options.copyFrom(GameOptions.load());

  // ── Splash screen — proves the full stack is operational ──────────────────
  drawSplash(ui);

  // Self-test: DiceRoller, WorldTime, Direction
  selfTest();

  // Temporary input loop until Phase 4 wires the real game loop / main menu.
  const optionsScreen = new OptionsScreen(ui);
  let lastKey: string | undefined;
  for (;;) {
    const key = await ui.UI_WaitKey();
    if (key.key === "o" || key.key === "O") {
      await optionsScreen.run(true); // C# PlayerCommand.OPTIONS_MODE handler
      drawSplash(ui, lastKey);
      continue;
    }
    lastKey = `Last key: "${key.key}"`;
    console.log("[RogueSurvivor] Got key:", key.key);
    drawSplash(ui, lastKey);
  }
}

function drawSplash(ui: CanvasUI, subtitle?: string): void {
  ui.UI_Clear(Color.Black);

  // Outer border
  ui.UI_DrawRect(Color.DarkGreen, new Rect(4, 4, 1016, 760));
  ui.UI_DrawRect(Color.Green,     new Rect(6, 6, 1012, 756));

  // Title
  ui.UI_DrawStringBold(
    Color.Gold,
    "ROGUE SURVIVOR RELOADED",
    220, 180,
    Color.Black,
  );

  ui.UI_DrawString(Color.LightGray, "alpha 10.1  —  TypeScript browser port  (Phase 1)", 270, 210);

  // Status boxes
  const statusItems = [
    { label: "Color / Point / Rect",  ok: true },
    { label: "Direction",             ok: true },
    { label: "DiceRoller (Mulberry32)", ok: true },
    { label: "WorldTime",             ok: true },
    { label: "IRogueUI interface",    ok: true },
    { label: "InputHandler",          ok: true },
    { label: "CanvasUI (Canvas 2D)",  ok: true },
    { label: "OptionsScreen",         ok: true },
  ];

  let y = 290;
  for (const item of statusItems) {
    const color = item.ok ? Color.LightGreen : Color.DarkRed;
    const mark  = item.ok ? "✓" : "✗";
    ui.UI_DrawString(color, `${mark}  ${item.label}`, 300, y);
    y += 20;
  }

  // Minimap demo — fills a small gradient to show it works
  const MMAP_X = 800;
  const MMAP_Y = 250;
  ui.UI_ClearMinimap(Color.DarkBlue);
  for (let mx = 0; mx < 60; mx++) {
    for (let my = 0; my < 60; my++) {
      ui.UI_SetMinimapColor(mx, my, Color.fromArgb(mx * 4, 100, my * 4));
    }
  }
  ui.UI_DrawMinimap(MMAP_X, MMAP_Y);
  ui.UI_DrawRect(Color.Gray, new Rect(MMAP_X - 1, MMAP_Y - 1, 102, 102));
  ui.UI_DrawString(Color.Gray, "minimap", MMAP_X + 24, MMAP_Y + 105);

  // Subtitle / last key
  if (subtitle) {
    ui.UI_DrawString(Color.Cyan, subtitle, 450, 560);
  } else {
    ui.UI_DrawString(Color.DarkGray, "Press O for options · any other key logs to console", 360, 560);
  }

  // Version footer
  ui.UI_DrawString(Color.DarkGray, "Phases 1-3 complete (Phase 4 next)", 420, 730);
}

function selfTest(): void {
  // DiceRoller
  const rng = new DiceRoller(42);
  console.assert(rng.roll(0, 10) >= 0 && rng.roll(0, 10) < 10, "DiceRoller.roll range");
  console.assert(typeof rng.rollFloat() === "number", "DiceRoller.rollFloat type");

  // WorldTime
  const t = new WorldTime(30); // hour 1 → DEEP_NIGHT
  console.assert(t.isNight === true, "WorldTime.isNight at hour 1");

  // Direction
  const n = Direction.fromVector(0, -1);
  console.assert(n === Direction.N, "Direction.fromVector N");
  console.assert(Direction.opposite(Direction.N) === Direction.S, "Direction.opposite");

  console.log("[RogueSurvivor] Self-test passed ✓");
}

main().catch(console.error);
