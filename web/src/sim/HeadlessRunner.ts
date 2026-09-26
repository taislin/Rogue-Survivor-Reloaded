import { RogueGame, SimFlags } from "@engine/RogueGame";
import { NullRogueUI } from "@ui/NullRogueUI";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { GameMode, Session } from "@engine/Session";
import { SimRatio } from "@engine/GameOptions";
import { ActorID } from "@gameplay/GameActors";
import { SkillID } from "@gameplay/Skills";

/** Options for one headless run. */
export interface HeadlessOptions {
  /**
   * RNG seed. Same seed ⇒ same world, same turns, same crash.
   *
   * Must be applied *before* the `RogueGame` is constructed (the constructor
   * builds `Rules` from the session seed), which is why it lives on the
   * constructor rather than here.
   */
  seed?: number;
  /** World size in districts (C# `s_Options.citySize`). */
  worldSize?: number;
  /** Stop after this many world turns. */
  maxTurns?: number;
  /** Spawn the player as an undead. */
  isUndead?: boolean;
  /** Which undead, when `isUndead`. */
  undeadModel?: ActorID;
  /** Let the player's own AI play (no keyboard needed). */
  bot?: boolean;
  /** Log each turn as it happens. */
  verbose?: boolean;
  /** Write progress breadcrumbs to stderr — for diagnosing a stuck run. */
  trace?: boolean;
}

/** What a run produced — the raw material for balance/AI analysis. */
export interface HeadlessMetrics {
  turnsPlayed: number;
  /** World clock when the run ended. */
  finalTurn: number;
  finalDay: number;
  playerAlive: boolean;
  playerHitPoints: number;
  /** Total actors alive across every map in the world. */
  actorsAlive: number;
  actorsUndead: number;
  actorsLiving: number;
  /** Corpses accumulated — a proxy for how lethal the world is. */
  corpses: number;
  /** Player kills, from Scoring. */
  playerKills: number;
  /** Total world turns simulated across all districts. */
  totalScore: number;
  /** Wall-clock milliseconds the run took. */
  durationMs: number;
  /** Set when the run bailed out early. */
  error?: string;
}

/**
 * Runs the real game loop in Node, with no DOM.
 *
 * This is the Phase 8 "Headless Simulator". It boots the actual `RogueGame`
 * (same world generator, same AI, same turn loop as the browser build) and
 * drives it through `AdvancePlay`, which is what makes it useful twice over:
 * a stress/balance harness, and the only end-to-end test that the ported
 * simulation actually *runs* rather than merely type-checks.
 *
 * Input never blocks: painting goes to `NullRogueUI`, and if anything still
 * asks for a key the null UI answers Escape, which unwinds cleanly.
 *
 * Note: `Session.get()` is a process-wide singleton, so run one simulation
 * per process (the CLI does exactly that).
 */
export class HeadlessRunner {
  private readonly ui = new NullRogueUI();
  private readonly game: RogueGame;
  /** The seed this run was pinned to, or 0 for clock-derived. */
  readonly seed: number;

  /**
   * @param seed Pin the RNG seed for a reproducible run (0 = random).
   *   Applied before the game exists — see `HeadlessOptions.seed`.
   */
  constructor(seed = 0) {
    this.seed = seed;
    Session.useSeed(seed);
    this.game = new RogueGame(this.ui, new NullMusicManager());
  }

  /** Boots data + options, generates a world, plays `maxTurns` turns. */
  async run(opts: HeadlessOptions = {}): Promise<HeadlessMetrics> {
    const worldSize = opts.worldSize ?? 3;
    const maxTurns = opts.maxTurns ?? 200;
    const isUndead = opts.isUndead ?? false;

    const started = Date.now();
    const game = this.game;
    const trace = opts.trace ?? false;
    const step = (msg: string): void => {
      if (trace) process.stderr.write(`[headless +${Date.now() - started}ms] ${msg}\n`);
    };

    // ── Boot ────────────────────────────────────────────────────────────────
    // LoadData builds the model tables the generator needs.
    step("LoadData...");
    await game.LoadData();
    step("LoadData done");

    // Run() (RogueGame.ts:942) loads the hi score table, and the runner
    // deliberately bypasses Run() — which is how the first sim crash happened:
    // HandlePostMortem() dereferences m_HiScoreTable.register() on player death,
    // and nothing had ever constructed the table. The other Run() preamble steps
    // (options, hints, keybindings, manual) are skipped on purpose: they are UI
    // or player-preference state, the sim overrides the options it cares about
    // below, and loading stored options would make runs depend on leftovers.
    step("LoadHiScoreTable...");
    await game.LoadHiScoreTable();
    step("LoadHiScoreTable done");

    const s_Options = RogueGame.options;
    s_Options.citySize = worldSize;
    s_Options.simulateDistricts = SimRatio.OFF; // no background district sim
    s_Options.isAnimDelayOn = false; // never sleep between animations
    s_Options.isAdvisorEnabled = false; // no advisor popups mid-run

    game.session.gameMode = GameMode.GM_STANDARD;

    // ── Character ───────────────────────────────────────────────────────────
    game.m_CharGen.isUndead = isUndead;
    game.m_CharGen.isMale = true;
    game.m_CharGen.startingSkill = SkillID.AGILE;
    if (isUndead) game.m_CharGen.undeadModel = opts.undeadModel ?? ActorID.UNDEAD_MALE_ZOMBIFIED;

    // ── World + player ──────────────────────────────────────────────────────
    step("StartNewGame (world generation)...");
    await game.StartNewGame();
    step("StartNewGame done");

    if (opts.bot ?? true) {
      // Hand the player to their own model AI so no keyboard is needed.
      step("BotTakeControl...");
      game.BotTakeControl();
      // Bot mode sleeps BOT_DELAY (250 ms) before every action; a stress run
      // would spend all its wall-clock in `sleep`.
      game.botDelayMs = 0;
      step("BotTakeControl done");
    }

    const session = game.session;
    let turnsPlayed = 0;

    if (trace) {
      game.debugTrace = (m) => process.stderr.write(`[headless +${Date.now() - started}ms]${m}\n`);
    }

    // ── Turn loop ───────────────────────────────────────────────────────────
    try {
      for (let turn = 0; turn < maxTurns; turn++) {
        const player = game.player;
        if (player === null || player.isDead) break;

        const district = session.currentMap?.district;
        if (district === null || district === undefined) break;

        step(`turn ${turn} -> AdvancePlay`);
        await game.AdvancePlay(district, SimFlags.NOT_SIMULATING);
        turnsPlayed++;
        step(`turn ${turn} done (world turn ${session.worldTime.turnCounter})`);

        // Catch actor-list corruption at the turn it starts. `Map.placeActor`
        // once appended a duplicate per player step, which surfaced 40 turns
        // later as an inexplicable starvation death; this makes that class of
        // bug fail on the turn it begins. O(n) in actors, against a turn that
        // costs orders of magnitude more, so it stays on in every run.
        session.currentMap?.assertActorIntegrity();

        if (opts.verbose) {
          const p = game.player;
          process.stdout.write(
            `turn ${String(session.worldTime.turnCounter).padStart(5)} ` +
              `day ${session.worldTime.day} ` +
              `hp ${p === null ? "-" : p.hitPoints} ` +
              `alive ${this.countActors()}\n`
          );
        }
      }
    } catch (e) {
      const err = e as Error;
      const metrics = this.collect(turnsPlayed, started);
      // Keep the stack: a headless failure is otherwise very hard to locate.
      metrics.error = `${err.message}\n${err.stack ?? ""}`;
      return metrics;
    }

    return this.collect(turnsPlayed, started);
  }

  private countActors(): number {
    const session = this.game.session;
    const world = session.world;
    if (world === null) return 0;
    let n = 0;
    for (let dx = 0; dx < world.size; dx++) {
      for (let dy = 0; dy < world.size; dy++) {
        const d = world.getDistrict(dx, dy);
        if (d === null) continue;
        for (const m of d.maps) n += m.countActors;
      }
    }
    return n;
  }

  private collect(turnsPlayed: number, started: number): HeadlessMetrics {
    const game = this.game;
    const session = game.session;
    const player = game.player;
    const scoring = session.scoring;

    let actorsAlive = 0;
    let actorsUndead = 0;
    let corpses = 0;
    const world = session.world;
    if (world !== null) {
      for (let dx = 0; dx < world.size; dx++) {
        for (let dy = 0; dy < world.size; dy++) {
          const d = world.getDistrict(dx, dy);
          if (d === null) continue;
          for (const m of d.maps) {
            actorsAlive += m.countActors;
            corpses += m.corpses.length;
            for (const a of m.actors) {
              if (a.model.abilities.isUndead) actorsUndead++;
            }
          }
        }
      }
    }

    return {
      turnsPlayed,
      finalTurn: session.worldTime.turnCounter,
      finalDay: session.worldTime.day,
      playerAlive: player !== null && !player.isDead,
      playerHitPoints: player === null ? 0 : player.hitPoints,
      actorsAlive,
      actorsUndead,
      actorsLiving: actorsAlive - actorsUndead,
      corpses,
      playerKills: [...scoring.kills].length,
      totalScore: scoring.totalPoints,
      durationMs: Date.now() - started,
    };
  }
}

/** Formats a metrics object as a short human-readable report. */
export function formatMetrics(m: HeadlessMetrics): string {
  const lines = [
    `turns played     : ${m.turnsPlayed}`,
    `world clock      : turn ${m.finalTurn} (day ${m.finalDay})`,
    `player           : ${m.playerAlive ? "alive" : "dead"} (${m.playerHitPoints} hp)`,
    `actors alive     : ${m.actorsAlive}  (${m.actorsUndead} undead / ${m.actorsLiving} living)`,
    `corpses          : ${m.corpses}`,
    `player kills     : ${m.playerKills}`,
    `score            : ${m.totalScore}`,
    `duration         : ${m.durationMs} ms`,
  ];
  if (m.error !== undefined) lines.push(`ERROR            : ${m.error}`);
  return lines.join("\n");
}
