/**
 * Draw-call profiler for the headless run.
 *
 *   npm run profile                                  # 3x3 world, 40 turns
 *   npm run profile -- --turns 200 --seed 7 --undead
 *
 * WHAT THIS IS FOR
 *
 * Phase 8 task 11 asks for a 60 fps target on a 21x21 view. Frame *rate* needs a
 * browser, which CI does not have. Frame *work* does not: what actually decides
 * whether a frame is cheap is how many draw calls it issues, and that is
 * measurable in Node by counting the calls the engine makes through `IRogueUI`.
 *
 * So this reports calls per frame, broken down by method. It is how the
 * minimap's per-frame full-map scan was found: `DrawMiniMap` walks all 10 000
 * tiles of a 100x100 map on every single frame, issuing up to 10 000
 * `UI_SetMinimapColor` calls and 10 000 `new Point` allocations. Nothing about
 * that is visible to a type-checker, and it is invisible running the game
 * slowly, but at 60 fps it is 600 000 calls and allocations per second.
 *
 * INTERPRETING THE NUMBERS
 *
 * The budget for a 21x21 view is roughly 441 tiles, so a few thousand draw
 * calls per frame is already uncomfortable for Canvas 2D. Anything in the tens
 * of thousands is a bug, not a tuning problem. The `--per-frame` view resets the
 * counters after each turn, which is the number to watch; the cumulative view is
 * there to catch work that only happens on some turns.
 */

import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { NullRogueUI } from "../src/ui/NullRogueUI";
import { ActorID } from "../src/gameplay/GameActors";

interface Args {
  seed: number;
  size: number;
  turns: number;
  undead: boolean;
  top: number;
  perFrame: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { seed: 12345, size: 3, turns: 40, undead: true, top: 12, perFrame: true };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--seed": args.seed = Number(argv[++i]); break;
      case "--size": args.size = Number(argv[++i]); break;
      case "--turns": args.turns = Number(argv[++i]); break;
      case "--undead": args.undead = true; break;
      case "--survivor": args.undead = false; break;
      case "--top": args.top = Number(argv[++i]); break;
      case "--cumulative": args.perFrame = false; break;
      case "--help":
      case "-h":
        process.stdout.write(
          "usage: npm run profile -- [--seed N] [--size N] [--turns N] [--undead|--survivor] [--top N] [--cumulative]\n"
        );
        process.exit(0);
        break;
      default:
        if (argv[i].startsWith("--")) {
          process.stderr.write(`unknown flag: ${argv[i]}\n`);
          process.exit(2);
        }
    }
  }
  return args;
}


/**
 * Times `RedrawPlayScreen` — the engine-side cost of building a frame.
 *
 * This is directly measurable in Node, unlike frame rate: it covers the loops,
 * the `Point` allocations, the map lookups and the string building that
 * `RedrawPlayScreen` performs before handing anything to the UI. It does *not*
 * cover the browser's rasterisation, which is what the draw-call counts proxy
 * for. The two together are the whole picture.
 */
function installFrameTimer(runner: HeadlessRunner): { frames: number; ms: number } {
  const acc = { frames: 0, ms: 0 };
  const game = runner.rogueGame;
  const original = game.RedrawPlayScreen.bind(game);
  game.RedrawPlayScreen = (): void => {
    const t0 = performance.now();
    try {
      original();
    } finally {
      acc.ms += performance.now() - t0;
      acc.frames++;
    }
  };
  return acc;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const ui = new NullRogueUI();
  ui.profiling = true;
  const runner = new HeadlessRunner(args.seed, ui);

  process.stdout.write(
    `profiling: ${args.size}x${args.size} world, ${args.turns} turns, ` +
      `${args.undead ? "undead" : "survivor"} player, seed=${args.seed}\n\n`
  );

  // Installed before the run so it sees every frame. Disabled while profiling
  // is off would defeat the point, so it is always on here.
  const timer = installFrameTimer(runner);

  const metrics = await runner.run({
    worldSize: args.size,
    maxTurns: args.turns,
    isUndead: args.undead,
    undeadModel: ActorID.UNDEAD_MALE_ZOMBIFIED,
    bot: true,
  });

  if (metrics.error !== undefined) {
    process.stderr.write(`\nrun failed: ${metrics.error.split("\n")[0]}\n`);
  }

  const rows = Object.entries(ui.callCounts)
    .map(([name, count]) => ({ name, count, perFrame: count / Math.max(1, metrics.turnsPlayed) }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  const mode = args.perFrame ? "per frame (avg)" : "cumulative";
  const width = Math.max(...rows.map((r) => r.name.length), 20);

  process.stdout.write(`turns played: ${metrics.turnsPlayed}   mode: ${mode}\n\n`);
  process.stdout.write(`${"call".padEnd(width)}  ${args.perFrame ? "per frame" : "total"}   share\n`);
  process.stdout.write(`${"-".repeat(width)}  ${"-".repeat(args.perFrame ? 9 : 5)}   ${"-".repeat(6)}\n`);

  const total = ui.totalCalls;
  for (const r of rows.slice(0, args.top)) {
    const value = args.perFrame ? r.perFrame.toFixed(1).padStart(9) : String(r.count).padStart(5);
    const share = `${((r.count / total) * 100).toFixed(1)}%`;
    process.stdout.write(`${r.name.padEnd(width)}  ${value}   ${share}\n`);
  }

  process.stdout.write(
    `\ntotal calls: ${total}` +
      `${args.perFrame ? `  (${(total / Math.max(1, metrics.turnsPlayed)).toFixed(0)} per frame)` : ""}\n`
  );

  // Engine-side cost, which unlike the counts above is a real measurement.
  if (timer.frames > 0) {
    const perFrame = timer.ms / timer.frames;
    process.stdout.write(
      `engine time  : ${timer.ms.toFixed(0)} ms over ${timer.frames} frames` +
        `  (${perFrame.toFixed(2)} ms/frame in RedrawPlayScreen)\n`
    );
    // 60 fps leaves 16.67 ms for everything. The engine's share is this number;
    // the browser's rasterisation of the draw calls above is the rest.
    process.stdout.write(
      `             ${((perFrame / 16.67) * 100).toFixed(1)}% of a 60 fps frame budget, before rasterisation\n`
    );
  }

  // A rough verdict, so this is useful without a spreadsheet.
  const perFrame = total / Math.max(1, metrics.turnsPlayed);
  const budget = 21 * 21;
  if (perFrame > 10_000) {
    process.stdout.write(
      `\nVERDICT: ${perFrame.toFixed(0)} calls/frame against a ~${budget}-tile budget.\n` +
        `  This is a bug, not a tuning problem. 60 fps would mean ${(perFrame * 60).toFixed(0)} calls/second.\n`
    );
  } else if (perFrame > 2_000) {
    process.stdout.write(`\nVERDICT: ${perFrame.toFixed(0)} calls/frame — uncomfortable for Canvas 2D, worth trimming.\n`);
  } else {
    process.stdout.write(`\nVERDICT: ${perFrame.toFixed(0)} calls/frame — within budget for a ${budget}-tile view.\n`);
  }

  const minimapShare =
    ((ui.callCounts.UI_SetMinimapColor ?? 0) + (ui.callCounts.UI_ClearMinimap ?? 0) + (ui.callCounts.UI_DrawMinimap ?? 0)) /
    Math.max(1, total);
  if (minimapShare > 0.25) {
    process.stdout.write(
      `  minimap calls are ${(minimapShare * 100).toFixed(0)}% of the frame — see RogueGame.DrawMiniMap.\n`
    );
  }
}

main().catch((e) => {
  process.stderr.write(`fatal: ${(e as Error).stack ?? String(e)}\n`);
  process.exit(1);
});
