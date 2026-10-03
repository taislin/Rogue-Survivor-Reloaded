import { PlayerCommand } from "@engine/PlayerCommand";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";

/**
 * The in-game action menu's layout and hit-testing.
 *
 * **No drawing and no game state**, deliberately: every question this file answers
 * — how many columns, which button is at a point, where does arrow-down go from the
 * last one — is a question that can be settled in a test without a browser, and all
 * of them have been wrong at least once while writing the screen that uses it.
 *
 * A grid rather than a list because the box it lives in is the minimap's, which is
 * 200x200: a single column of ~14 actions at the menu's line height is ~250px and
 * does not fit, so it would either overflow or need scrolling. Three columns of five
 * fits with room for the frame.
 */

/** One button. `label` is drawn; `command` is what gets dispatched. */
export interface ActionEntry {
  readonly command: PlayerCommand;
  readonly label: string;
}

/**
 * The main in-game actions, and nothing else.
 *
 * **Curated, not "every command".** Three groups are deliberately absent:
 *
 * - The eight movement directions. They are relative to where you are facing, so a
 *   button labelled "North" is a lie the moment you turn; there is no correct label
 *   for them.
 * - The ten `ITEM_SLOT_n`. Those are the inventory panel's job and are already
 *   clickable there.
 * - The meta commands — save, load, options, keybindings, help, hints, quit. Those
 *   are not "actions" in the sense of doing something to the world, and putting
 *   "Quit Game" on a grid you might click with a mouse is a good way to lose a run.
 *
 * Order is reading order down each column, because that is how a person scans a
 * grid of buttons; `layout` fills columns top-to-bottom rather than laying the
 * entries out in a row, which is the part that is easy to get subtly wrong.
 */
export const ACTION_ENTRIES: readonly ActionEntry[] = [
  { command: PlayerCommand.WAIT_OR_SELF, label: "Wait" },
  { command: PlayerCommand.WAIT_LONG, label: "Wait Long" },
  { command: PlayerCommand.SLEEP, label: "Sleep" },
  { command: PlayerCommand.BARRICADE_MODE, label: "Barricade" },
  { command: PlayerCommand.BREAK_MODE, label: "Break" },
  { command: PlayerCommand.BUILD_SMALL_FORTIFICATION, label: "Fortify" },
  { command: PlayerCommand.BUILD_LARGE_FORTIFICATION, label: "Fortify Big" },
  { command: PlayerCommand.CLOSE_DOOR, label: "Close Door" },
  { command: PlayerCommand.EAT_CORPSE, label: "Eat Corpse" },
  { command: PlayerCommand.GIVE_ITEM, label: "Give Item" },
  { command: PlayerCommand.REVIVE_CORPSE, label: "Revive" },
  { command: PlayerCommand.SHOUT, label: "Shout" },
  { command: PlayerCommand.USE_EXIT, label: "Use Exit" },
  { command: PlayerCommand.USE_SPRAY, label: "Use Spray" },
  { command: PlayerCommand.MAKE_COOKING_FIRE, label: "Cook" },
  { command: PlayerCommand.FIRE_MODE, label: "Fire" },
];

export interface ActionMenuLayout {
  /** Where the grid starts. */
  readonly originX: number;
  readonly originY: number;
  readonly buttonWidth: number;
  readonly buttonHeight: number;
  readonly columns: number;
  readonly gap: number;
}

export interface ActionButton {
  readonly entry: ActionEntry;
  readonly index: number;
  readonly rect: Rect;
}

const DEFAULT_LAYOUT: ActionMenuLayout = {
  originX: 0,
  originY: 0,
  buttonWidth: 62,
  buttonHeight: 16,
  columns: 3,
  gap: 2,
};

/**
 * The button rectangles, in reading order.
 *
 * **Filled column by column.** With three columns the entries run down the first,
 * then down the second, so the six building actions are not split across a row
 * boundary in the middle of the grid. Row-major would put `Wait`, `Wait Long`,
 * `Sleep` across the top and read as three unrelated things.
 *
 * The last column is short when the count does not divide by the columns, and the
 * rectangles are what it is — a `Rect` past the last row simply does not exist
 * rather than being clamped somewhere visible.
 */
export function layoutButtons(
  entries: readonly ActionEntry[],
  layout: ActionMenuLayout = DEFAULT_LAYOUT,
): ActionButton[] {
  const buttons: ActionButton[] = [];
  for (let i = 0; i < entries.length; i++) {
    const column = Math.floor(i / Math.ceil(entries.length / layout.columns));
    const row = i % Math.ceil(entries.length / layout.columns);
    buttons.push({
      entry: entries[i]!,
      index: i,
      rect: new Rect(
        layout.originX + column * (layout.buttonWidth + layout.gap),
        layout.originY + row * (layout.buttonHeight + layout.gap),
        layout.buttonWidth,
        layout.buttonHeight,
      ),
    });
  }
  return buttons;
}

/** The button at a screen point, or null. Clicks outside the grid close nothing. */
export function buttonAt(
  buttons: readonly ActionButton[],
  p: Point,
): ActionButton | null {
  for (const b of buttons) {
    if (b.rect.contains(p)) return b;
  }
  return null;
}

/** Rows in a full column. The last column is short when the count does not divide. */
function rowCount(count: number, columns: number): number {
  return Math.ceil(count / columns);
}

/**
 * How many entries column `c` holds.
 *
 * Columns are filled in turn and each is full before the next starts, so the short
 * one is the *last*: 16 entries in 3 columns is 6/6/4, not 6/5/5. Assuming a
 * rectangle instead is how `moveSelection` ends up returning 16 and 17 for a
 * 16-entry list.
 */
function columnSize(count: number, columns: number, c: number): number {
  const rows = rowCount(count, columns);
  return Math.max(0, Math.min(rows, count - c * rows));
}

/** Which column an index is in, clamped for the short last column. */
function columnOf(index: number, count: number, columns: number): number {
  return Math.min(Math.floor(index / rowCount(count, columns)), columns - 1);
}

/**
 * Where an arrow key moves from `index`.
 *
 * **Left/right cross the column boundary and keep the row**, rather than moving
 * one entry along: moving one entry along sends Left from the top of column two
 * into the middle of column one, which is what makes a grid feel broken. The row is
 * clamped rather than refused when the neighbouring column is shorter, so Right
 * from the bottom of the long first column lands on the last entry of the short
 * one instead of nowhere.
 */
export function moveSelection(
  index: number,
  key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight",
  count: number,
  columns: number,
): number {
  if (count <= 0) return 0;
  if (columns <= 1) return index;

  const rows = rowCount(count, columns);
  const col = columnOf(index, count, columns);
  const row = index - col * rows;
  const size = columnSize(count, columns, col);

  const wrapCol = (c: number): number => (c < 0 ? columns - 1 : c >= columns ? 0 : c);

  const inColumn = (c: number, r: number): number => {
    const s = columnSize(count, columns, c);
    if (s <= 0) return index;
    return c * rows + Math.max(0, Math.min(r, s - 1));
  };

  switch (key) {
    case "ArrowUp":
      return inColumn(col, row <= 0 ? size - 1 : row - 1);
    case "ArrowDown":
      return inColumn(col, row + 1 >= size ? 0 : row + 1);
    case "ArrowLeft":
      return inColumn(wrapCol(col - 1), row);
    case "ArrowRight":
      return inColumn(wrapCol(col + 1), row);
  }
}

/** The widest label in the grid, so a caller can check it fits before drawing. */
export function longestLabel(entries: readonly ActionEntry[]): number {
  return entries.reduce((n, e) => Math.max(n, e.label.length), 0);
}

export const ACTION_MENU_COLUMNS = 3;

export { DEFAULT_LAYOUT };
