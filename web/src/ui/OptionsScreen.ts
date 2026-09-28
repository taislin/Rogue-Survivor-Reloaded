import type { IMusicManager } from "@engine/audio/IMusicManager";
import { Color } from "@engine/Color";
import {
	GameOptions,
	OptionIDs,
	Options,
	SimRatio,
	ZupDays,
} from "@engine/GameOptions";
import { MouseButton } from "@engine/IRogueUI";
import type { IRogueUI, GameKeyEvent } from "@engine/IRogueUI";
import { IMAGE_SETS } from "@engine/AssetPaths";
import { DEFAULT_VIEW_MODE, VIEW_MODES } from "@engine/firstperson/Types";
import { FONT_CHOICES } from "@ui/fonts";
import { DifficultySide, Scoring } from "@engine/Scoring";
import { Session } from "@engine/Session";
import { menuValueColumnX } from "@engine/RogueGame";
import { Point } from "@engine/Point";

/**
 * One drawn list row, in logical canvas pixels.
 *
 * `index` is the entry's own index in the list, not its position in the visible
 * window — so a scrolled list hit-tests against what the row *is*, which is what
 * the keyboard selection uses too, and the two cannot disagree about which option
 * is selected.
 */
interface MenuRow {
	index: number;
	left: number;
	right: number;
	top: number;
	bottom: number;
}

// RogueGame.cs layout constants
const CANVAS_HEIGHT = 768;
const MENU_BOLD_LINE_SPACING = 18;
const MENU_LINE_SPACING = 16;
const RIGHT_PADDING = 400;

// SetupConfig.GAME_VERSION
const GAME_VERSION = "0.2.0";

/** Half-intensity shadow colors (C#: Color.FromArgb(c.A, c.R / 2, c.G / 2, c.B / 2)). */
function shadowOf(c: Color): Color {
	return Color.fromArgb(
		Math.floor(c.r / 2),
		Math.floor(c.g / 2),
		Math.floor(c.b / 2),
		c.a,
	);
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
	/**
	 * Wheel pixels that move the selection by one row.
	 *
	 * A mouse notch reports ~100px in Chrome and ~48px in Firefox (3 lines at the
	 * normalisation factor), so this is not a value every device agrees on — which
	 * is the point of picking it here rather than in the input layer. It is set so
	 * a notch moves a few rows: enough that the list travels, few enough that the
	 * player can still land on a single option and see where they are. The
	 * fraction is deliberate, so a fast scroll does not skip past everything.
	 *
	 * Chrome, which reports the largest deltas, moves furthest per notch — the
	 * opposite of what feels right, but the alternative (normalising to a fixed
	 * row count per *event*) breaks on a trackpad, where one flick is a stream of
	 * events. Accumulating and dividing handles both, which is why
	 * `UI_PeekWheel` sums rather than reporting the last delta.
	 */
	private static readonly WHEEL_PIXELS_PER_ROW = 40;

	/** C# `list` array — order is exactly the on-screen order. */
	private readonly list: OptionIDs[] = [
		OptionIDs.GAME_AUTOSAVE_PERIOD, // alpha10.1
		// display & sounds
		OptionIDs.UI_MUSIC,
		OptionIDs.UI_MUSIC_VOLUME,
		OptionIDs.UI_ANIM_DELAY,
		OptionIDs.UI_SHOW_MINIMAP,
		OptionIDs.UI_SHOW_PLAYER_TAG_ON_MINIMAP,
		// sprites
		OptionIDs.UI_SPRITE_STYLE,
		OptionIDs.UI_FONT_CHOICE,
		// view
		OptionIDs.UI_VIEW_MODE,
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

	/**
	 * A typeface change whose faces have not arrived yet.
	 *
	 * The game draws on demand rather than on a frame loop, and this screen draws
	 * once per keypress, so a typeface whose faces are still being fetched would
	 * stay invisible until the player pressed something else — the screen would
	 * sit in the old face looking like the option had done nothing. Redrawing when
	 * the load resolves is what makes the change appear at all.
	 */
	private pendingTypeface: Promise<void> | null = null;

	constructor(
		private readonly ui: IRogueUI,
		private readonly music?: IMusicManager,
	) {
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
		// The cursor as of the last input, so a wait can tell "the mouse moved" from
		// "the mouse is sitting there". See `waitForInput`.
		let prevMouse = this.ui.UI_GetMousePosition();

		do {
			this.draw(selected);

			const { key, mousePos, mouseButtons, wheel } = await this.waitForInput(prevMouse);
			prevMouse = mousePos;

			if (key !== null) {
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
			} else if (wheel !== 0) {
				// The wheel moves the selection and nothing else, for the same reason
				// the cursor does: it is a way of pointing at a row, not a way of
				// operating one. A wheel that changed values would make it the most
				// dangerous input on the screen, because it is the easiest to move by
				// accident — a flick while reaching for the mouse, on a screen where
				// nothing looks editable until you read it.
				//
				// Clamped rather than wrapped, unlike the arrow keys. A wheel is a
				// continuous gesture with a position, so the ends should stop it; a
				// wheel that wrapped from the last option to the first would also be
				// startling, because the list scrolls the other way.
				selected = Math.min(
					this.list.length - 1,
					Math.max(0, selected + Math.trunc(wheel / OptionsScreen.WHEEL_PIXELS_PER_ROW)),
				);
			} else {
				// A click outside every row changes nothing. An options screen is
				// where a stray click is most expensive — it silently changes a
				// setting the player then has to notice and undo — so the only
				// thing a click does is what it plainly means.
				const row = this.rowAt(
					mousePos.x / this.ui.UI_GetCanvasScaleX(),
					mousePos.y / this.ui.UI_GetCanvasScaleY(),
				);
				if (row !== null) {
					// A click on the row that is *already* selected steps its value.
					// A first click on any other row only moves the selection. This is
					// what every native options dialog does, and it means moving
					// around with the mouse — which is most of what a player does
					// here — can never change a setting by accident.
					//
					// Left button only. Any button would include the right one, and in a
					// browser the right button is not a free action: it is how a player
					// opens a context menu, and on a canvas it arrives here having
					// already been preventDefaulted away. Treating it as "step the
					// value" means the gesture a player makes when they are *looking for*
					// a right-click menu silently edits a setting instead.
					if (row.index === selected && mouseButtons === MouseButton.Left) {
						this.adjust(this.list[selected], 1);
					} else {
						selected = row.index;
					}
				}
			}

			// force some options combinations.
			if (Options.simThread) Options.simulateWhenSleeping = false;
			// apply options.
			this.applyOptions();

			// A typeface whose faces were still being fetched draws in the old
			// face until they land, and the loop's own redraw has already happened
			// by then. Redraw once more on arrival, or the change is only visible
			// after the next keypress.
			if (this.pendingTypeface !== null) {
				const pending = this.pendingTypeface;
				this.pendingTypeface = null;
				void pending.then(() => {
					if (loop) this.draw(selected);
				});
			}
		} while (loop);

		// save.
		GameOptions.save(Options);
	}

	/**
	 * Waits for a key, a click, a wheel notch, or the cursor moving onto a row.
	 *
	 * The same shape as `RogueGame.WaitKeyOrMouse`, and for the same reason: the
	 * screen has to redraw when the cursor moves, because the selection follows it.
	 * `UI_WaitKey` alone cannot do that — it only wakes on a key, so hover would
	 * mean polling, and a blocking wait cannot poll.
	 *
	 * Built from the existing `IRogueUI` primitives rather than a new one, so
	 * nothing else in the port has to grow a method. `UI_PeekMouseButtons` and
	 * `UI_PeekWheel` *consume*, so a press and a notch are each delivered exactly
	 * once and a held button is not re-reported — the same property the play loop
	 * depends on, and the reason it is spelled out in `IRogueUI` rather than being
	 * an implementation detail. A non-consuming wheel would be fatal here: this
	 * loop polls, so it would return immediately and forever and repaint the
	 * screen in a tight loop with the keyboard never getting a turn.
	 *
	 * Only real input ends the wait. The `setTimeout(0)` is the poll interval, not
	 * a redraw: nothing is drawn until this returns.
	 */
	private async waitForInput(prevMouse: Point): Promise<{
		key: GameKeyEvent | null;
		mousePos: Point;
		mouseButtons: MouseButton | null;
		wheel: number;
	}> {
		for (;;) {
			const key = this.ui.UI_PeekKey();
			if (key !== null) {
				return { key, mousePos: this.ui.UI_GetMousePosition(), mouseButtons: null, wheel: 0 };
			}
			const wheel = this.ui.UI_PeekWheel();
			if (wheel !== 0) {
				return { key: null, mousePos: this.ui.UI_GetMousePosition(), mouseButtons: null, wheel };
			}
			const mousePos = this.ui.UI_GetMousePosition();
			const mouseButtons = this.ui.UI_PeekMouseButtons();
			if (mouseButtons !== null) {
				return { key: null, mousePos, mouseButtons, wheel: 0 };
			}
			if (!mousePos.equals(prevMouse)) {
				// Movement, not a click. Returning here is what makes the selection
				// follow the cursor; the caller treats it as "no button", so a
				// brush across the list moves the highlight and changes nothing.
				return { key: null, mousePos, mouseButtons: null, wheel: 0 };
			}
			await new Promise<void>((r) => setTimeout(r, 0));
		}
	}

	/** `RogueGame.DrawHeader()` — RogueGame.cs ≈ line 19975. */
	private drawHeader(): void {
		this.ui.UI_DrawStringBoldLarge(
			Color.Red,
			`ROGUE SURVIVOR - ${GAME_VERSION}`,
			0,
			0,
			Color.DarkRed,
		);
	}

	/** `RogueGame.DrawFootnote(color, text)` — RogueGame.cs ≈ line 19980. */
	private drawFootnote(color: Color, text: string): void {
		this.ui.UI_DrawStringBoldLarge(
			color,
			`<${text}>`,
			0,
			CANVAS_HEIGHT - MENU_BOLD_LINE_SPACING,
			shadowOf(color),
		);
	}

	/**
	 * `RogueGame.DrawMenuOrOptions(...)` — RogueGame.cs ≈ line 19932.
	 * The C# `ref int gy` parameter becomes the returned value.
	 *
	 * Shows a scrolling window when the 36 options exceed the space above the
	 * description block, mirroring the main helper's windowing.
	 */
	/**
	 * Draws the list, and returns where each row landed.
	 *
	 * The row rects are not decoration. They are the only way a caller can turn a
	 * mouse position back into a row index, and without them hit-testing would have
	 * to re-derive the layout — the same arithmetic, a second time, which is how the
	 * two copies of this function came to disagree in the first place. Returning the
	 * geometry from the one place that computes it is what keeps a click and a
	 * highlight pointing at the same row.
	 *
	 * The returned rects are in **logical canvas pixels**, the space the engine
	 * draws in, and they cover the value column as well as the label — a click
	 * anywhere on the line selects the row, which is what a list row feels like.
	 * The caller is responsible for converting a CSS-pixel mouse position into this
	 * space (`UI_GetCanvasScale*`), exactly as the play screen does.
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
		rightPadding = 256,
		maxRows?: number,
	): number {
		// The shared helper, not `gx + rightPadding`. This function used to compute
		// its own value column and disagreed with `RogueGame.DrawMenuOrOptions` by
		// ~44px, because the shared one widens the column when a label is longer
		// than the padding allows — and `(Undead) Undeads Skills Upgrade Days` is.
		// Two layouts for one screen is a bug waiting for a mouse.
		const right = menuValueColumnX(gx, entries, rightPadding);

		if (entries.length !== values.length)
			throw new Error("values length!= choices length");

		let first = 0;
		let count = entries.length;
		if (maxRows !== undefined && maxRows < count) {
			const half = Math.floor(maxRows / 2);
			first = Math.min(Math.max(0, currentChoice - half), count - maxRows);
			count = maxRows;
		}

		const entriesShadowColor = shadowOf(entriesColor);
		for (let r = 0; r < count; r++) {
			const i = first + r;
			const rowTop = gy;
			const choiceStr =
				i === currentChoice ? `---> ${entries[i]}` : `     ${entries[i]}`;
			this.ui.UI_DrawStringBoldLarge(
				entriesColor,
				choiceStr,
				gx,
				gy,
				entriesShadowColor,
			);

			const valueStr =
				i === currentChoice && !valuesOnNewLine
					? `${values[i]} <---`
					: values[i];
			if (valuesOnNewLine) {
				gy += MENU_BOLD_LINE_SPACING;
				this.ui.UI_DrawStringBoldLarge(valuesColor, valueStr, gx + right, gy);
			} else {
				this.ui.UI_DrawStringBoldLarge(valuesColor, valueStr, right, gy);
			}

			gy += MENU_BOLD_LINE_SPACING;
			// The row's own band: the line *above* this baseline, from the previous
			// row's baseline to this one. Tiling it this way is what stops adjacent
			// rows overlapping — an earlier version spanned `baseline ± line`, so
			// every row covered a strip of its neighbour's and a click landed one
			// row low, consistently.
			this.rowRects.push({
				index: i,
				left: gx,
				right,
				top: rowTop - MENU_BOLD_LINE_SPACING,
				bottom: rowTop,
			});
		}
		if (count < entries.length) {
			this.ui.UI_DrawStringLarge(
				Color.Gray,
				`(${currentChoice + 1}/${entries.length} - list scrolls)`,
				gx,
				gy,
				shadowOf(Color.Gray),
			);
			gy += MENU_LINE_SPACING;
		}
		return gy;
	}

	/**
	 * The rows drawn by the last `draw`, in logical canvas pixels.
	 *
	 * Cleared and refilled by every `draw`, so it is always in step with what is on
	 * screen — a stale list would let a click select a row that is not there, which
	 * is a worse failure than a click doing nothing.
	 */
	private rowRects: MenuRow[] = [];

	/** The row under a logical-pixel point, or null. Later rows win on overlap. */
	private rowAt(x: number, y: number): MenuRow | null {
		let hit: MenuRow | null = null;
		for (const row of this.rowRects) {
			if (x >= row.left && x <= row.right && y >= row.top && y <= row.bottom) {
				hit = row;
			}
		}
		return hit;
	}

	private draw(selected: number): void {
		const mode = Session.get().gameMode;
		const values = this.list.map((id) => Options.describeValue(mode, id));

		// Refilled by every `draw`, so a click can never select a row that is not on
		// screen. Cleared here rather than at the end of the draw so an exception
		// mid-draw cannot leave last frame's rows behind.
		this.rowRects = [];

		let gy = 0;
		this.ui.UI_Clear(Color.Black);
		this.drawHeader();
		gy += MENU_BOLD_LINE_SPACING;
		this.ui.UI_DrawStringBoldLarge(Color.Yellow, "Options", 0, gy); // alpha10 dont mention current mode
		gy += 2 * MENU_BOLD_LINE_SPACING;
		// Window the 36 options above the description block; the footnote sits at
		// the canvas bottom, so reserve description + legend + rating + footnote
		// plus the scroll-hint line the windowed list appends.
		const reserveLines = 1 + 4 + 3 + 2 + 1 + 1;
		const listRows = Math.max(
			5,
			Math.floor(
				(CANVAS_HEIGHT - MENU_BOLD_LINE_SPACING - gy) / MENU_BOLD_LINE_SPACING,
			) - reserveLines,
		);
		gy = this.drawMenuOrOptions(
			selected,
			Color.White,
			this.menuEntries,
			Color.LightGreen,
			values,
			0,
			gy,
			false,
			RIGHT_PADDING,
			listRows,
		);

		// alpha10 — describe current option.
		gy += MENU_BOLD_LINE_SPACING;
		this.ui.UI_DrawStringBoldLarge(
			Color.White,
			this.menuEntries[selected].replace(/^\s+/, ""),
			0,
			gy,
		);
		gy += MENU_BOLD_LINE_SPACING;
		const desc = GameOptions.describe(this.list[selected]);
		for (const line of desc.split("\n")) {
			this.ui.UI_DrawStringLarge(Color.White, `  ${line}`, 0, gy);
			gy += MENU_LINE_SPACING;
		}

		// legend.
		gy += MENU_BOLD_LINE_SPACING;
		this.ui.UI_DrawStringBoldLarge(
			Color.Red,
			"* Caution : increasing these values makes the game runs slower and saving/loading longer.",
			0,
			gy,
		);
		gy += MENU_BOLD_LINE_SPACING;
		this.ui.UI_DrawStringBoldLarge(
			Color.White,
			"-V : option always OFF when playing VTG-Vintage",
			0,
			gy,
		);
		gy += MENU_BOLD_LINE_SPACING;
		this.ui.UI_DrawStringBoldLarge(
			Color.White,
			"=S : option used only when playing STD-Standard",
			0,
			gy,
		);
		gy += MENU_BOLD_LINE_SPACING;

		// difficulty rating.
		gy += MENU_BOLD_LINE_SPACING;
		const diffForSurvivor = Math.floor(
			100 *
				Scoring.computeDifficultyRating(
					Options,
					DifficultySide.FOR_SURVIVOR,
					0,
				),
		);
		const diffForUndead = Math.floor(
			100 *
				Scoring.computeDifficultyRating(Options, DifficultySide.FOR_UNDEAD, 0),
		);
		this.ui.UI_DrawStringBoldLarge(
			Color.Yellow,
			`Difficulty Rating : ${diffForSurvivor}% as survivor / ${diffForUndead}% as undead.`,
			0,
			gy,
		);
		gy += MENU_BOLD_LINE_SPACING;
		this.ui.UI_DrawStringBoldLarge(
			Color.White,
			"Difficulty used for scoring automatically decrease with each reincarnation.",
			0,
			gy,
		);
		gy += 2 * MENU_BOLD_LINE_SPACING;

		// footnote.
		// The mouse is mentioned because it works, and because the arrow keys are
		// still the fastest way to *change* a value — hover moves the selection,
		// and a click only steps the row that is already selected. Saying so keeps
		// the hint honest rather than longer.
		this.drawFootnote(
			Color.White,
			"cursor to move and change values, click a selected row to step it, R to restore previous values, ESC to save and leave",
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
			case OptionIDs.GAME_DISTRICT_SIZE:
				o.districtSize += dir * 5;
				break;
			case OptionIDs.UI_MUSIC:
				o.playMusic = !o.playMusic;
				break;
			case OptionIDs.UI_MUSIC_VOLUME:
				o.musicVolume += dir * 5;
				break;
			case OptionIDs.UI_ANIM_DELAY:
				o.isAnimDelayOn = !o.isAnimDelayOn;
				break;
			case OptionIDs.UI_SHOW_MINIMAP:
				o.isMinimapOn = !o.isMinimapOn;
				break;
			case OptionIDs.UI_SHOW_PLAYER_TAG_ON_MINIMAP:
				o.showPlayerTagsOnMinimap = !o.showPlayerTagsOnMinimap;
				break;
			case OptionIDs.UI_ADVISOR:
				o.isAdvisorEnabled = !o.isAdvisorEnabled;
				break;
			case OptionIDs.UI_COMBAT_ASSISTANT:
				o.isCombatAssistantOn = !o.isCombatAssistantOn;
				break;
			case OptionIDs.UI_SHOW_TARGETS:
				o.showTargets = !o.showTargets;
				break;
			case OptionIDs.UI_SHOW_PLAYER_TARGETS:
				o.showPlayerTargets = !o.showPlayerTargets;
				break;
			case OptionIDs.GAME_MAX_CIVILIANS:
				o.maxCivilians += dir * 5;
				break;
			case OptionIDs.GAME_MAX_DOGS:
				o.maxDogs += dir;
				break;
			case OptionIDs.GAME_MAX_UNDEADS:
				o.maxUndeads += dir * 10;
				break;
			case OptionIDs.GAME_DAY_ZERO_UNDEADS_PERCENT:
				o.dayZeroUndeadsPercent += dir * 5;
				break;
			case OptionIDs.GAME_ZOMBIE_INVASION_DAILY_INCREASE:
				o.zombieInvasionDailyIncrease += dir;
				break;
			case OptionIDs.GAME_CITY_SIZE:
				o.citySize += dir;
				break;
			case OptionIDs.GAME_NPC_CAN_STARVE_TO_DEATH:
				o.nPCCanStarveToDeath = !o.nPCCanStarveToDeath;
				break;
			case OptionIDs.GAME_STARVED_ZOMBIFICATION_CHANCE:
				o.starvedZombificationChance += dir * 5;
				break;
			case OptionIDs.GAME_SIMULATE_DISTRICTS:
				if (dir < 0) {
					if (o.simulateDistricts !== SimRatio.OFF) {
						o.simulateDistricts = (o.simulateDistricts - 1) as SimRatio;
					}
				} else if (o.simulateDistricts !== SimRatio.FULL) {
					o.simulateDistricts = (o.simulateDistricts + 1) as SimRatio;
				}
				break;
			case OptionIDs.GAME_SIMULATE_SLEEP:
				o.simulateWhenSleeping = !o.simulateWhenSleeping;
				break;
			case OptionIDs.GAME_SIM_THREAD:
				o.simThread = !o.simThread;
				break;
			case OptionIDs.GAME_ZOMBIFICATION_CHANCE:
				o.zombificationChance += dir * 5;
				break;
			case OptionIDs.GAME_REVEAL_STARTING_DISTRICT:
				o.revealStartingDistrict = !o.revealStartingDistrict;
				break;
			case OptionIDs.GAME_ALLOW_UNDEADS_EVOLUTION:
				o.allowUndeadsEvolution = !o.allowUndeadsEvolution;
				break;
			case OptionIDs.GAME_UNDEADS_UPGRADE_DAYS:
				if (dir < 0) {
					if (o.zombifiedsUpgradeDays !== ZupDays._FIRST) {
						o.zombifiedsUpgradeDays = (o.zombifiedsUpgradeDays - 1) as ZupDays;
					}
				} else if (o.zombifiedsUpgradeDays !== ZupDays._COUNT - 1) {
					o.zombifiedsUpgradeDays = (o.zombifiedsUpgradeDays + 1) as ZupDays;
				}
				break;
			case OptionIDs.GAME_MAX_REINCARNATIONS:
				o.maxReincarnations += dir;
				break;
			case OptionIDs.GAME_REINCARNATE_AS_RAT:
				o.canReincarnateAsRat = !o.canReincarnateAsRat;
				break;
			case OptionIDs.GAME_REINCARNATE_TO_SEWERS:
				o.canReincarnateToSewers = !o.canReincarnateToSewers;
				break;
			case OptionIDs.GAME_REINC_LIVING_RESTRICTED:
				o.isLivingReincRestricted = !o.isLivingReincRestricted;
				break;
			case OptionIDs.GAME_PERMADEATH:
				o.isPermadeathOn = !o.isPermadeathOn;
				break;
			case OptionIDs.GAME_DEATH_SCREENSHOT:
				o.isDeathScreenshotOn = !o.isDeathScreenshotOn;
				break;
			case OptionIDs.GAME_AGGRESSIVE_HUNGRY_CIVILIANS:
				o.isAggressiveHungryCiviliansOn = !o.isAggressiveHungryCiviliansOn;
				break;
			case OptionIDs.GAME_NATGUARD_FACTOR:
				o.natGuardFactor += dir * 10;
				break;
			case OptionIDs.GAME_SUPPLIESDROP_FACTOR:
				o.suppliesDropFactor += dir * 10;
				break;
			case OptionIDs.GAME_RATS_UPGRADE:
				o.ratsUpgrade = !o.ratsUpgrade;
				break;
			case OptionIDs.GAME_SHAMBLERS_UPGRADE:
				o.shamblersUpgrade = !o.shamblersUpgrade;
				break;
			case OptionIDs.GAME_SKELETONS_UPGRADE:
				o.skeletonsUpgrade = !o.skeletonsUpgrade;
				break;
			case OptionIDs.GAME_AUTOSAVE_PERIOD:
				o.autoSavePeriodInHours += dir * 12;
				break; // alpha10.1
			case OptionIDs.UI_SPRITE_STYLE: {
				/*
				 * Bounded index arithmetic over the list of sets that exist on
				 * disk, in the same shape as the SimRatio and ZupDays cases:
				 * clamped, not wrapped, so Left on the first set is a no-op
				 * rather than a jump to the last.
				 *
				 * The list is `AssetPaths.IMAGE_SETS` rather than an enum
				 * because that is the thing that has to agree with the folders
				 * in `assets/images/` — see `GameOptions.spriteStyle`.
				 */
				const index = IMAGE_SETS.indexOf(o.spriteStyle);
				const next = index + dir;
				if (next >= 0 && next < IMAGE_SETS.length) {
					o.spriteStyle = IMAGE_SETS[next]!;
				}
				break;
			}
		case OptionIDs.UI_FONT_CHOICE: {
			// Same bounded-index shape, over the typefaces `ui/fonts.ts` offers.
			// The setter applies it, so the next frame is drawn in the new face
			// rather than the next reload.
			const index = FONT_CHOICES.indexOf(o.fontChoice);
			const next = index + dir;
			if (next >= 0 && next < FONT_CHOICES.length) {
				o.fontChoice = FONT_CHOICES[next]!;
				// The setter applies the choice fire-and-forget; ask for the same
				// promise so the loop can redraw once the faces have landed. This
				// is the cached one, not a second load.
				this.pendingTypeface = Options.applyFontChoice();
			}
			break;
		}
		case OptionIDs.UI_VIEW_MODE: {
			// Same bounded-index shape, over the views `firstperson/Types` offers.
			// Unlike the two above there is nothing to apply afterwards: the view
			// mode has no second copy to push into, and `RogueGame.ApplyOptions`
			// picks the change up when this screen exits. See `m_ViewMode`.
			//
			// An unrecognised stored value — a hand-edited or truncated options
			// blob — is not on the list, so `indexOf` is -1 and `index + dir`
			// would land on an arbitrary neighbour. Repair it to the default and
			// stop, rather than showing a row whose value is about to jump.
			if (!VIEW_MODES.includes(o.viewMode)) {
				o.viewMode = DEFAULT_VIEW_MODE;
				break;
			}
			const index = VIEW_MODES.indexOf(o.viewMode);
			const next = index + dir;
			if (next >= 0 && next < VIEW_MODES.length) {
				o.viewMode = VIEW_MODES[next]!;
			}
			break;
		}
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
			scoring.reincarnationNumber,
		);
	}
}
