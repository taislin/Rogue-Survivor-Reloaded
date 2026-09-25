import { Color }            from "@engine/Color";
import { IRogueUI } from "@engine/IRogueUI";
import { GameOptions, OptionIDs, Options, SimRatio, ZupDays } from "@engine/GameOptions";
import { DifficultySide, Scoring } from "@engine/Scoring";
import { Session }          from "@engine/Session";
import { IMusicManager }    from "@engine/audio/IMusicManager";

// RogueGame.cs layout constants
const CANVAS_HEIGHT     = 768;
const BOLD_LINE_SPACING = 14;
const RIGHT_PADDING     = 400;

// SetupConfig.GAME_VERSION
const GAME_VERSION = "alpha 10.1";

/** Half-intensity shadow colors (C#: Color.FromArgb(c.A, c.R / 2, c.G / 2, c.B / 2)). */
function shadowOf(c: Color): Color {
  return Color.fromArgb(Math.floor(c.r / 2), Math.floor(c.g / 2), Math.floor(c.b / 2), c.a);
}

/**
 * Browser port of `RogueGame.HandleOptions(bool ingame)` (RogueGame.cs ≈ line 2294).
 *
 * Same option list, same left/right step values, same footnotes and difficulty
 * rating line; only the drawing and key plumbing go through {@link IRogueUI}.
 * The C# screen is entered from `PlayerCommand.OPTIONS_MODE` (RogueGame.cs ≈
 * line 5645) followed by `ApplyOptions(true)` — that call site arrives with the
 * Phase 4 game loop.
 */
export class OptionsScreen {
  /** C# `list` array — order is exactly the on-screen order. */
  private readonly list: OptionIDs[] = [
    OptionIDs.GAME_AUTOSAVE_PERIOD,          // alpha10.1
    // display & sounds
    OptionIDs.UI_MUSIC,
    OptionIDs.UI_MUSIC_VOLUME,
    OptionIDs.UI_ANIM_DELAY,
    OptionIDs.UI_SHOW_MINIMAP,
    OptionIDs.UI_SHOW_PLAYER_TAG_ON_MINIMAP,
    // helpers
    OptionIDs.UI_ADVISOR,
    OptionIDs.UI_COMBAT_ASSISTANT,
    OptionIDs.UI_SHOW_PLAYER_TARGETS,
    OptionIDs.UI_SHOW_TARGETS,
    // sim
    OptionIDs.GAME_SIMULATE_DISTRICTS,
    OptionIDs.GAME_SIM_THREAD,
    OptionIDs.GAME_SIMULATE_SLEEP,
    // death
    OptionIDs.GAME_DEATH_SCREENSHOT,
    OptionIDs.GAME_PERMADEATH,
    // maps
    OptionIDs.GAME_CITY_SIZE,
    OptionIDs.GAME_DISTRICT_SIZE,
    OptionIDs.GAME_REVEAL_STARTING_DISTRICT,
    // living
    OptionIDs.GAME_MAX_CIVILIANS,
    // OptionIDs.GAME_MAX_DOGS,
    OptionIDs.GAME_ZOMBIFICATION_CHANCE,
    OptionIDs.GAME_AGGRESSIVE_HUNGRY_CIVILIANS,
    OptionIDs.GAME_NPC_CAN_STARVE_TO_DEATH,
    OptionIDs.GAME_STARVED_ZOMBIFICATION_CHANCE,
    // undeads
    OptionIDs.GAME_MAX_UNDEADS,
    OptionIDs.GAME_ALLOW_UNDEADS_EVOLUTION,
    OptionIDs.GAME_DAY_ZERO_UNDEADS_PERCENT,
    OptionIDs.GAME_ZOMBIE_INVASION_DAILY_INCREASE,
    OptionIDs.GAME_UNDEADS_UPGRADE_DAYS,
    OptionIDs.GAME_SHAMBLERS_UPGRADE,
    OptionIDs.GAME_SKELETONS_UPGRADE,
    OptionIDs.GAME_RATS_UPGRADE,
    // events
    OptionIDs.GAME_NATGUARD_FACTOR,
    OptionIDs.GAME_SUPPLIESDROP_FACTOR,
    // reinc
    OptionIDs.GAME_MAX_REINCARNATIONS,
    OptionIDs.GAME_REINC_LIVING_RESTRICTED,
    OptionIDs.GAME_REINCARNATE_AS_RAT,
    OptionIDs.GAME_REINCARNATE_TO_SEWERS,
  ];

  private readonly menuEntries: string[];

  constructor(private readonly ui: IRogueUI, private readonly music?: IMusicManager) {
    this.menuEntries = this.list.map((id) => OptionsScreen.entryName(id));
  }

  /** C# builds `menuEntries` with mode annotations ("-V" / "=S"). */
  private static entryName(id: OptionIDs): string {
    let name = GameOptions.optionName(id);
    if (
      id === OptionIDs.GAME_ALLOW_UNDEADS_EVOLUTION ||
      id === OptionIDs.GAME_RATS_UPGRADE ||
      id === OptionIDs.GAME_SKELETONS_UPGRADE ||
      id === OptionIDs.GAME_SHAMBLERS_UPGRADE
    ) {
      name += " -V";
    } else if (
      id === OptionIDs.GAME_ZOMBIFICATION_CHANCE ||
      id === OptionIDs.GAME_STARVED_ZOMBIFICATION_CHANCE
    ) {
      name += " =S";
    }
    return name;
  }

  /**
   * Blocking options loop (mirrors the C# `do { … } while (loop)`).
   * Saves the option set when the player presses ESC.
   */
  async run(_ingame = false): Promise<void> {
    const prevOptions = Options.clone(); // C# `GameOptions prevOptions = s_Options` (struct copy)
    let selected = 0;
    let loop = true;

    do {
      this.draw(selected);

      const key = await this.ui.UI_WaitKey();
      switch (key.key) {
        case "ArrowUp": // move up
          selected = selected > 0 ? selected - 1 : this.list.length - 1;
          break;
        case "ArrowDown": // move down
          selected = (selected + 1) % this.list.length;
          break;
        case "r":
        case "R": // restore previous.
          Options.copyFrom(prevOptions);
          break;
        case "Escape": // validate and leave
          loop = false;
          break;
        case "ArrowLeft":
          this.adjust(this.list[selected], -1);
          break;
        case "ArrowRight":
          this.adjust(this.list[selected], 1);
          break;
        default:
          break;
      }

      // force some options combinations.
      if (Options.simThread) Options.simulateWhenSleeping = false;
      // apply options.
      this.applyOptions();
    } while (loop);

    // save.
    GameOptions.save(Options);
  }

  /** `RogueGame.DrawHeader()` — RogueGame.cs ≈ line 19975. */
  private drawHeader(): void {
    this.ui.UI_DrawStringBold(
      Color.Red,
      `ROGUE SURVIVOR - ${GAME_VERSION}`,
      0,
      0,
      Color.DarkRed
    );
  }

  /** `RogueGame.DrawFootnote(color, text)` — RogueGame.cs ≈ line 19980. */
  private drawFootnote(color: Color, text: string): void {
    this.ui.UI_DrawStringBold(
      color,
      `<${text}>`,
      0,
      CANVAS_HEIGHT - BOLD_LINE_SPACING,
      shadowOf(color)
    );
  }

  /**
   * `RogueGame.DrawMenuOrOptions(...)` — RogueGame.cs ≈ line 19932.
   * The C# `ref int gy` parameter becomes the returned value.
   */
  private drawMenuOrOptions(
    currentChoice: number,
    entriesColor: Color,
    entries: string[],
    valuesColor: Color,
    values: string[],
    gx: number,
    gy: number,
    valuesOnNewLine = false,
    rightPadding = 256
  ): number {
    const right = gx + rightPadding;

    if (entries.length !== values.length) throw new Error("values length!= choices length");

    const entriesShadowColor = shadowOf(entriesColor);
    for (let i = 0; i < entries.length; i++) {
      const choiceStr = i === currentChoice ? `---> ${entries[i]}` : `     ${entries[i]}`;
      this.ui.UI_DrawStringBold(entriesColor, choiceStr, gx, gy, entriesShadowColor);

      const valueStr = i === currentChoice && !valuesOnNewLine ? `${values[i]} <---` : values[i];
      if (valuesOnNewLine) {
        gy += BOLD_LINE_SPACING;
        this.ui.UI_DrawStringBold(valuesColor, valueStr, gx + right, gy);
      } else {
        this.ui.UI_DrawStringBold(valuesColor, valueStr, right, gy);
      }

      gy += BOLD_LINE_SPACING;
    }
    return gy;
  }

  private draw(selected: number): void {
    const mode = Session.get().gameMode;
    const values = this.list.map((id) => Options.describeValue(mode, id));

    let gy = 0;
    this.ui.UI_Clear(Color.Black);
    this.drawHeader();
    gy += BOLD_LINE_SPACING;
    this.ui.UI_DrawStringBold(Color.Yellow, "Options", 0, gy); // alpha10 dont mention current mode
    gy += 2 * BOLD_LINE_SPACING;
    gy = this.drawMenuOrOptions(
      selected,
      Color.White,
      this.menuEntries,
      Color.LightGreen,
      values,
      0,
      gy,
      false,
      RIGHT_PADDING
    );

    // alpha10 — describe current option.
    gy += BOLD_LINE_SPACING;
    this.ui.UI_DrawStringBold(
      Color.White,
      this.menuEntries[selected].replace(/^\s+/, ""),
      0,
      gy
    );
    gy += BOLD_LINE_SPACING;
    const desc = GameOptions.describe(this.list[selected]);
    for (const line of desc.split("\n")) {
      this.ui.UI_DrawString(Color.White, `  ${line}`, 0, gy);
      gy += BOLD_LINE_SPACING;
    }

    // legend.
    gy += BOLD_LINE_SPACING;
    this.ui.UI_DrawStringBold(
      Color.Red,
      "* Caution : increasing these values makes the game runs slower and saving/loading longer.",
      0,
      gy
    );
    gy += BOLD_LINE_SPACING;
    this.ui.UI_DrawStringBold(Color.White, "-V : option always OFF when playing VTG-Vintage", 0, gy);
    gy += BOLD_LINE_SPACING;
    this.ui.UI_DrawStringBold(Color.White, "=S : option used only when playing STD-Standard", 0, gy);
    gy += BOLD_LINE_SPACING;

    // difficulty rating.
    gy += BOLD_LINE_SPACING;
    const diffForSurvivor = Math.floor(
      100 * Scoring.computeDifficultyRating(Options, DifficultySide.FOR_SURVIVOR, 0)
    );
    const diffForUndead = Math.floor(
      100 * Scoring.computeDifficultyRating(Options, DifficultySide.FOR_UNDEAD, 0)
    );
    this.ui.UI_DrawStringBold(
      Color.Yellow,
      `Difficulty Rating : ${diffForSurvivor}% as survivor / ${diffForUndead}% as undead.`,
      0,
      gy
    );
    gy += BOLD_LINE_SPACING;
    this.ui.UI_DrawStringBold(
      Color.White,
      "Difficulty used for scoring automatically decrease with each reincarnation.",
      0,
      gy
    );
    gy += 2 * BOLD_LINE_SPACING;

    // footnote.
    this.drawFootnote(
      Color.White,
      "cursor to move and change values, R to restore previous values, ESC to save and leave"
    );
    this.ui.UI_Repaint();
  }

  /**
   * `RogueGame.HandleOptions` Left/Right branches — the `dir` argument replaces
   * the duplicated `case Keys.Left:` / `case Keys.Right:` switches (`-1` / `+1`).
   */
  private adjust(option: OptionIDs, dir: -1 | 1): void {
    const o = Options;
    switch (option) {
      case OptionIDs.GAME_DISTRICT_SIZE: o.districtSize += dir * 5; break;
      case OptionIDs.UI_MUSIC: o.playMusic = !o.playMusic; break;
      case OptionIDs.UI_MUSIC_VOLUME: o.musicVolume += dir * 5; break;
      case OptionIDs.UI_ANIM_DELAY: o.isAnimDelayOn = !o.isAnimDelayOn; break;
      case OptionIDs.UI_SHOW_MINIMAP: o.isMinimapOn = !o.isMinimapOn; break;
      case OptionIDs.UI_SHOW_PLAYER_TAG_ON_MINIMAP: o.showPlayerTagsOnMinimap = !o.showPlayerTagsOnMinimap; break;
      case OptionIDs.UI_ADVISOR: o.isAdvisorEnabled = !o.isAdvisorEnabled; break;
      case OptionIDs.UI_COMBAT_ASSISTANT: o.isCombatAssistantOn = !o.isCombatAssistantOn; break;
      case OptionIDs.UI_SHOW_TARGETS: o.showTargets = !o.showTargets; break;
      case OptionIDs.UI_SHOW_PLAYER_TARGETS: o.showPlayerTargets = !o.showPlayerTargets; break;
      case OptionIDs.GAME_MAX_CIVILIANS: o.maxCivilians += dir * 5; break;
      case OptionIDs.GAME_MAX_DOGS: o.maxDogs += dir; break;
      case OptionIDs.GAME_MAX_UNDEADS: o.maxUndeads += dir * 10; break;
      case OptionIDs.GAME_DAY_ZERO_UNDEADS_PERCENT: o.dayZeroUndeadsPercent += dir * 5; break;
      case OptionIDs.GAME_ZOMBIE_INVASION_DAILY_INCREASE: o.zombieInvasionDailyIncrease += dir; break;
      case OptionIDs.GAME_CITY_SIZE: o.citySize += dir; break;
      case OptionIDs.GAME_NPC_CAN_STARVE_TO_DEATH: o.nPCCanStarveToDeath = !o.nPCCanStarveToDeath; break;
      case OptionIDs.GAME_STARVED_ZOMBIFICATION_CHANCE: o.starvedZombificationChance += dir * 5; break;
      case OptionIDs.GAME_SIMULATE_DISTRICTS:
        if (dir < 0) {
          if (o.simulateDistricts !== SimRatio.OFF) {
            o.simulateDistricts = (o.simulateDistricts - 1) as SimRatio;
          }
        } else if (o.simulateDistricts !== SimRatio.FULL) {
          o.simulateDistricts = (o.simulateDistricts + 1) as SimRatio;
        }
        break;
      case OptionIDs.GAME_SIMULATE_SLEEP: o.simulateWhenSleeping = !o.simulateWhenSleeping; break;
      case OptionIDs.GAME_SIM_THREAD: o.simThread = !o.simThread; break;
      case OptionIDs.GAME_ZOMBIFICATION_CHANCE: o.zombificationChance += dir * 5; break;
      case OptionIDs.GAME_REVEAL_STARTING_DISTRICT: o.revealStartingDistrict = !o.revealStartingDistrict; break;
      case OptionIDs.GAME_ALLOW_UNDEADS_EVOLUTION: o.allowUndeadsEvolution = !o.allowUndeadsEvolution; break;
      case OptionIDs.GAME_UNDEADS_UPGRADE_DAYS:
        if (dir < 0) {
          if (o.zombifiedsUpgradeDays !== ZupDays._FIRST) {
            o.zombifiedsUpgradeDays = (o.zombifiedsUpgradeDays - 1) as ZupDays;
          }
        } else if (o.zombifiedsUpgradeDays !== (ZupDays._COUNT - 1)) {
          o.zombifiedsUpgradeDays = (o.zombifiedsUpgradeDays + 1) as ZupDays;
        }
        break;
      case OptionIDs.GAME_MAX_REINCARNATIONS: o.maxReincarnations += dir; break;
      case OptionIDs.GAME_REINCARNATE_AS_RAT: o.canReincarnateAsRat = !o.canReincarnateAsRat; break;
      case OptionIDs.GAME_REINCARNATE_TO_SEWERS: o.canReincarnateToSewers = !o.canReincarnateToSewers; break;
      case OptionIDs.GAME_REINC_LIVING_RESTRICTED: o.isLivingReincRestricted = !o.isLivingReincRestricted; break;
      case OptionIDs.GAME_PERMADEATH: o.isPermadeathOn = !o.isPermadeathOn; break;
      case OptionIDs.GAME_DEATH_SCREENSHOT: o.isDeathScreenshotOn = !o.isDeathScreenshotOn; break;
      case OptionIDs.GAME_AGGRESSIVE_HUNGRY_CIVILIANS: o.isAggressiveHungryCiviliansOn = !o.isAggressiveHungryCiviliansOn; break;
      case OptionIDs.GAME_NATGUARD_FACTOR: o.natGuardFactor += dir * 10; break;
      case OptionIDs.GAME_SUPPLIESDROP_FACTOR: o.suppliesDropFactor += dir * 10; break;
      case OptionIDs.GAME_RATS_UPGRADE: o.ratsUpgrade = !o.ratsUpgrade; break;
      case OptionIDs.GAME_SHAMBLERS_UPGRADE: o.shamblersUpgrade = !o.shamblersUpgrade; break;
      case OptionIDs.GAME_SKELETONS_UPGRADE: o.skeletonsUpgrade = !o.skeletonsUpgrade; break;
      case OptionIDs.GAME_AUTOSAVE_PERIOD: o.autoSavePeriodInHours += dir * 12; break; // alpha10.1
      default:
        break;
    }
  }

  /** `RogueGame.ApplyOptions(bool ingame)` — RogueGame.cs ≈ line 19857. */
  private applyOptions(): void {
    // m_MusicManager.IsMusicEnabled = Options.PlayMusic;
    // m_MusicManager.Volume = Options.MusicVolume;   (C# volume is 0..100, WebAudio is 0..1)
    if (this.music) {
      this.music.setVolume(Options.musicVolume / 100);
      if (!Options.playMusic) this.music.stop();
    }

    // update difficulty. C# also re-derives Scoring.Side from the player, but
    // there is no player until Phase 4 — keep the side the game last set.
    const scoring = Session.get().scoring;
    scoring.difficultyRating = Scoring.computeDifficultyRating(
      Options,
      scoring.side,
      scoring.reincarnationNumber
    );
  }
}
