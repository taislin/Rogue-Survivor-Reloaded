import type { IAmbientManager } from "@engine/audio/IAmbientManager";
import type { IMusicManager } from "@engine/audio/IMusicManager";
import type { ISoundManager } from "@engine/audio/ISoundManager";
import {
	AudioPreview,
	type AudioPreviewValue,
	previewAudioAdjustment,
} from "@engine/audio/OptionsAudioPreview";
import { Color } from "@engine/Color";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import {
	DIFFICULTY_OPTIONS,
	GameOptions,
	OptionIDs,
	Options,
	stepGameOption,
} from "@engine/GameOptions";
import type { GameKeyEvent, IRogueUI } from "@engine/IRogueUI";
import { MouseButton } from "@engine/IRogueUI";
import type { Point } from "@engine/Point";
import { menuValueColumnX } from "@engine/RogueGame";
import { DifficultySide, Scoring } from "@engine/Scoring";
import { Session } from "@engine/Session";

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

// RogueGame.cs layout constants.
//
// All five of these used to be written out here as well as in `RogueGame.ts` — the
// canvas height, both menu line steps, and the version string — each with a comment
// saying the other copy must agree and nothing checking that it did. They are
// imported now; `tests/version.test.ts` asserts the version, and the layout numbers
// are the same constants the rest of the game measures against, so a menu cannot
// drift from the HUD by editing a literal.
import { CANVAS_HEIGHT } from "@engine/CanvasSize";
import { MENU_BOLD_LINE_SPACING, MENU_LINE_SPACING } from "@engine/MenuChrome";
import { GAME_VERSION } from "@engine/GameVersion";

const RIGHT_PADDING = 400;

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

	/**
	 * C# `list` array — order is exactly the on-screen order.
	 *
	 * The difficulty rows are *removed* rather than disabled under Still Alive,
	 * and that is the fork's own mechanism rather than something this port
	 * invented: the C# deletes the same block from this list and leaves it
	 * commented under `//MOVED TO CHARACTER CREATION` (`RogueGame.cs:1557-1582`).
	 * Worth being precise about, because the feature is named for it and the C#
	 * has no lock: `HandleOptions` does not test its `ingame` parameter — the
	 * parameter is commented as unused (`RogueGame.cs:1509`) — and there is no
	 * runtime check anywhere that refuses a mid-game edit. The lock *is* the row
	 * not being there. A player who wants the mid-game screen back with difficulty
	 * rows under Classic gets exactly classic's list.
	 */
	private readonly list: OptionIDs[] = [
		OptionIDs.GAME_AUTOSAVE_PERIOD, // alpha10.1
		// display & sounds
		OptionIDs.UI_MUSIC,
		OptionIDs.UI_MUSIC_VOLUME,
		/**
		 * Still Alive, Release 2 / 6-1. The C# puts all four of these directly
		 * after `UI_MUSIC_VOLUME` (`GameOptions.cs:16-19`), so they go here too —
		 * this list is display order, not the enum order the save blob uses.
		 */
		OptionIDs.UI_SFXS,
		OptionIDs.UI_SFXS_VOLUME,
		OptionIDs.UI_AMBIENTSFXS,
		OptionIDs.UI_AMBIENTSFXS_VOLUME,
		OptionIDs.UI_ANIM_DELAY,
		OptionIDs.UI_SHOW_MINIMAP,
		OptionIDs.UI_SHOW_PLAYER_TAG_ON_MINIMAP,
		// sprites
		OptionIDs.UI_SPRITE_STYLE,
		OptionIDs.UI_FONT_CHOICE,
		// view
		OptionIDs.UI_VIEW_MODE,
		// speech bubbles — a renderer preference, so it is a plain row in every
		// ruleset rather than a feature-gated one. See `GameOptions.m_ShowSpeechBubbles`.
		OptionIDs.UI_SHOW_SPEECH_BUBBLES,
		// helpers
		OptionIDs.UI_ADVISOR,
		OptionIDs.UI_COMBAT_ASSISTANT,
		OptionIDs.UI_SHOW_PLAYER_TARGETS,
		OptionIDs.UI_SHOW_TARGETS,
		// sim
		OptionIDs.GAME_SIMULATE_DISTRICTS,
		OptionIDs.GAME_SIM_THREAD,
		OptionIDs.GAME_SIMULATE_SLEEP,
		// pacing
		OptionIDs.GAME_IDLE_AUTO_ADVANCE,
		// death
		OptionIDs.GAME_PERMADEATH,
		// maps
		OptionIDs.GAME_CITY_SIZE,
		OptionIDs.GAME_DISTRICT_SIZE,
		OptionIDs.GAME_REVEAL_STARTING_DISTRICT,
		// living
		OptionIDs.GAME_MAX_CIVILIANS,
		// Still Alive, Release 7-4. One gate covers both the row's presence and
		// its arrow-key handling, below, so CLASSIC cannot show a row that does
		// nothing when you press Left.
		...(hasFeature(Session.get().ruleset, Feature.ResourcesAvailability)
			? [OptionIDs.GAME_RESOURCES_AVAILABILITY]
			: []),
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
	].filter((id) => !this.movesToCharacterCreation(id));

	private readonly menuEntries: string[];

	/**
	 * Does this row belong to the character-creation difficulty screen?
	 *
	 * Read from the `list` initialiser, so it is called before `menuEntries` and
	 * before the constructor body — a plain method call, not a field, because a
	 * field initialised earlier would not be initialised yet.
	 *
	 * Membership comes from `DIFFICULTY_OPTIONS` rather than from a second list
	 * written here. The two screens show overlapping rows, and a membership set
	 * copied into each is free to drift: a row added to one would sit on the
	 * creation screen and still be editable mid-game, which is precisely the
	 * thing the feature exists to stop.
	 *
	 * Note it does not consult `run`'s `ingame` parameter, and neither does
	 * anything else — the C#'s `HandleOptions` ignores it too. The rows are gone
	 * from the mid-game screen *and* from the main menu's one, because for Still
	 * Alive a difficulty change between two runs is the same cheat.
	 */
	private movesToCharacterCreation(id: OptionIDs): boolean {
		return (
			hasFeature(Session.get().ruleset, Feature.DifficultyAtCreation) &&
			DIFFICULTY_OPTIONS.includes(id)
		);
	}

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
		/**
		 * Still Alive, Release 2 / 6-1: the two other buses.
		 *
		 * The screen had only a music handle, which is why the sfx and ambient rows
		 * had nowhere to be applied from — and why `optionsMenuAudioAdjustment` needs
		 * all three to preview a level. Optional, as `music` is, so the existing
		 * single-argument call sites and the test doubles that pass only a music
		 * manager keep working; a screen with no audio simply previews nothing.
		 */
		private readonly sfx?: ISoundManager,
		private readonly ambient?: IAmbientManager,
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
		/**
		 * The row the cursor was on last iteration, so the audio preview below fires
		 * once per arrival. `null` at the start: the first iteration is an arrival on
		 * row 0 and the C# previews there too, because it previews before reading
		 * input rather than after.
		 */
		let prevSelected: number | null = null;

		do {
			this.draw(selected);

			const { key, mousePos, mouseButtons, wheel } =
				await this.waitForInput(prevMouse);
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
					Math.max(
						0,
						selected + Math.trunc(wheel / OptionsScreen.WHEEL_PIXELS_PER_ROW),
					),
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
			// Still Alive, Release 7-3: preview the row the cursor has *landed on*.
			// The C# calls this from its own input handler on every keypress
			// (`RogueGame.cs:2268`), which fires on movement as well as on Left/Right,
			// so arriving at a volume row starts its cue. Only called when the row
			// changed: the default arm resumes everything, and firing it on an
			// unrelated row would be harmless but pointless work per keypress.
			if (selected !== prevSelected) {
				prevSelected = selected;
				this.audioAdjustment(this.list[selected]);
			}

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
				return {
					key,
					mousePos: this.ui.UI_GetMousePosition(),
					mouseButtons: null,
					wheel: 0,
				};
			}
			const wheel = this.ui.UI_PeekWheel();
			if (wheel !== 0) {
				return {
					key: null,
					mousePos: this.ui.UI_GetMousePosition(),
					mouseButtons: null,
					wheel,
				};
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
		);
	}

	/** `RogueGame.DrawFootnote(color, text)` — RogueGame.cs ≈ line 19980. */
	private drawFootnote(color: Color, text: string): void {
		this.ui.UI_DrawStringBoldLarge(
			color,
			`<${text}>`,
			0,
			CANVAS_HEIGHT - MENU_BOLD_LINE_SPACING,
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

		for (let r = 0; r < count; r++) {
			const i = first + r;
			const rowTop = gy;
			const choiceStr =
				i === currentChoice ? `---> ${entries[i]}` : `     ${entries[i]}`;
			this.ui.UI_DrawStringBoldLarge(entriesColor, choiceStr, gx, gy);

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
	 * `RogueGame.HandleOptions` Left/Right — the `dir` argument replaces
	 * the duplicated `case Keys.Left:` / `case Keys.Right:` switches (`-1` / `+1`).
	 *
	 * A thin wrapper over the shared `stepGameOption` rather than the switch
	 * itself: the fork's character-creation difficulty screen steps the same rows
	 * (`RogueGame.HandleNewCharacterDifficulty`), and two copies of twenty arms
	 * would be free to disagree. What is left here is the one thing that is this
	 * screen's alone — a typeface change needs a redraw once its faces land.
	 */
	private adjust(option: OptionIDs, dir: -1 | 1): void {
		const faceBefore = Options.fontChoice;
		stepGameOption(option, dir);
		if (Options.fontChoice !== faceBefore) {
			// The setter applies the choice fire-and-forget; ask for the same
			// promise so the loop can redraw once the faces have landed. This is
			// the cached one, not a second load.
			this.pendingTypeface = Options.applyFontChoice();
		}
	}

	/**
	 * `RogueGame.OptionsMenuAudioAdjustment` — `RogueGame.cs:2230` (Release 7-3).
	 *
	 * The body lives in `engine/audio/OptionsAudioPreview` and is shared, because
	 * this screen is not the only thing that could want it and a second copy on
	 * `RogueGame` would have had no caller at all — `HandleOptions` builds this
	 * screen, so the engine never gets a chance to call its own method.
	 *
	 * What is here is the mapping from an option row to a preview, which is the
	 * part that belongs next to the row list.
	 */
	private audioAdjustment(option: OptionIDs): void {
		const AUDIO_ROWS: Readonly<Partial<Record<OptionIDs, AudioPreviewValue>>> =
			{
				[OptionIDs.UI_MUSIC]: AudioPreview.MUSIC_ENABLE,
				[OptionIDs.UI_SFXS]: AudioPreview.SFX_ENABLE,
				[OptionIDs.UI_AMBIENTSFXS]: AudioPreview.AMBIENT_ENABLE,
				[OptionIDs.UI_MUSIC_VOLUME]: AudioPreview.MUSIC_VOLUME,
				[OptionIDs.UI_SFXS_VOLUME]: AudioPreview.SFX_VOLUME,
				[OptionIDs.UI_AMBIENTSFXS_VOLUME]: AudioPreview.AMBIENT_VOLUME,
			};
		previewAudioAdjustment(AUDIO_ROWS[option] ?? AudioPreview.NONE, {
			music: this.music,
			sfx: this.sfx,
			ambient: this.ambient,
		});
	}

	/** `RogueGame.ApplyOptions(bool ingame)` — RogueGame.cs ≈ line 19857. */
	private applyOptions(): void {
		// m_MusicManager.IsMusicEnabled = Options.PlayMusic;  (the fork's `IsAudioEnabled`)
		// m_MusicManager.Volume = Options.MusicVolume;   (C# volume is 0..100, WebAudio is 0..1)
		if (this.music) {
			// Enabled first: `stop()` below is the C#'s `StopAll`, and it only sticks
			// if the manager's own gate is already off. Without it the row reads OFF
			// and the next event theme starts the music again.
			this.music.setEnabled(Options.playMusic);
			this.music.setVolume(Options.musicVolume / 100);
			if (!Options.playMusic) this.music.stop();
		}
		// Still Alive, Release 2 / 6-1. Without these the two new volume rows step a
		// number on screen and change nothing audible. See `RogueGame.ApplyOptions`
		// for why the enabled flag is set apart from the volume.
		if (this.sfx) {
			this.sfx.setEnabled(Options.playSFXs);
			this.sfx.setVolume(Options.sfxVolume / 100);
		}
		if (this.ambient) {
			this.ambient.setEnabled(Options.playAmbientSFXs);
			this.ambient.setVolume(Options.ambientSFXVolume / 100);
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
