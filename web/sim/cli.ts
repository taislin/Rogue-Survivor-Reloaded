/**
 * CLI entry point for the headless simulator.
 *
 *   npm run sim                    # 3x3 world, 200 turns
 *   npm run sim -- --seed 12345    # reproducible run
 *   npm run sim -- --turns 1000    # longer stress run
 *   npm run sim -- --size 5 --undead --verbose
 *   npm run sim -- --bot=false     # drive the player with no AI (Escape-only)
 *
 * Prints a metrics report and exits non-zero if the run threw.
 */
import { HeadlessRunner, formatMetrics, HeadlessMetrics } from "../src/sim/HeadlessRunner";
import { ActorID } from "../src/gameplay/GameActors";

interface Args {
  seed: number;
  size: number;
  turns: number;
  undead: boolean;
  bot: boolean;
  verbose: boolean;
  trace: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { seed: 0, size: 3, turns: 200, undead: false, bot: true, verbose: false, trace: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--seed":
        args.seed = Number(argv[++i]);
        break;
      case "--size":
        args.size = Number(argv[++i]);
        break;
      case "--turns":
        args.turns = Number(argv[++i]);
        break;
      case "--undead":
        args.undead = true;
        break;
      case "--bot":
        args.bot = argv[++i] !== "false";
        break;
      case "--verbose":
        args.verbose = true;
        break;
      case "--trace":
        args.trace = true;
        break;
      case "--help":
      case "-h":
        process.stdout.write(
          "usage: npm run sim -- [--seed N] [--size N] [--turns N] [--undead] [--bot=false] [--verbose] [--trace]\n" +
            "\n" +
            "  --seed N   Pin the RNG seed: the same seed replays the same run\n" +
            "             exactly, so a crash can be reproduced and regression-tested.\n" +
            "             Omit it (or pass 0) for a fresh random world each time.\n"
        );
        process.exit(0);
        break;
      default:
        if (a.startsWith("--")) {
          process.stderr.write(`unknown flag: ${a}\n`);
          process.exit(2);
        }
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  process.stdout.write(
    `headless sim: ${args.size}x${args.size} world, ${args.turns} turns, ` +
      `${args.undead ? "undead" : "survivor"} player, bot=${args.bot}, ` +
      `seed=${args.seed !== 0 ? args.seed : "random"}\n\n`
  );

  const runner = new HeadlessRunner(args.seed);
  const metrics: HeadlessMetrics = await runner.run({
    worldSize: args.size,
    maxTurns: args.turns,
    isUndead: args.undead,
    undeadModel: ActorID.UNDEAD_MALE_ZOMBIFIED,
    bot: args.bot,
    verbose: args.verbose,
    trace: args.trace,
  });

  process.stdout.write("\n" + formatMetrics(metrics) + "\n");

  if (metrics.error !== undefined) {
    process.stderr.write("\nsimulation failed\n");
    process.exit(1);
  }
  if (metrics.turnsPlayed === 0) {
    process.stderr.write("\nsimulation played zero turns\n");
    process.exit(1);
  }
}

main().catch((e) => {
  process.stderr.write(`fatal: ${(e as Error).stack ?? String(e)}\n`);
  process.exit(1);
});
