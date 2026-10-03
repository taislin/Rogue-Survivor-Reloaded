/**
 * PlayerCommand enum.
 * Ported from src/Engine/PlayerCommand.cs
 */

export enum PlayerCommand {
  NONE = 0,

  QUIT_GAME,
  HELP_MODE,
  ADVISOR,
  OPTIONS_MODE,
  KEYBINDING_MODE,
  HINTS_SCREEN_MODE,
  SCREENSHOT,
  SAVE_GAME,
  LOAD_GAME,
  ABANDON_GAME,

  MOVE_N,
  MOVE_NE,
  MOVE_E,
  MOVE_SE,
  MOVE_S,
  MOVE_SW,
  MOVE_W,
  MOVE_NW,
  RUN_TOGGLE,
  WAIT_OR_SELF,
  WAIT_LONG,

  BARRICADE_MODE,
  BREAK_MODE,
  BUILD_LARGE_FORTIFICATION,
  BUILD_SMALL_FORTIFICATION,
  CLOSE_DOOR,
  EAT_CORPSE,
  FIRE_MODE,
  GIVE_ITEM,
  NEGOCIATE_TRADE,
  LEAD_MODE,
  MARK_ENEMIES_MODE,
  ORDER_MODE,
  PULL_MODE,
  PUSH_MODE,
  REVIVE_CORPSE,
  SHOUT,
  SLEEP,
  SWITCH_PLACE,
  USE_EXIT,
  USE_SPRAY,

  /*
   * Still Alive, Release 8-2. C# `PlayerCommand.SWAP_INVENTORY`
   * (`Engine/PlayerCommand.cs:57`).
   *
   * The C# has it in the middle, alphabetically among the mode commands. It is
   * appended here instead, at the end of the C#-declared block and before the
   * browser-port additions, because a stored `Keybindings` pair is
   * `[commandNumber, key]`: a command's number is part of the save format, so
   * inserting one silently re-points every binding above it. It is *not* in the
   * additions block below, which is for commands the C# does not have at all.
   *
   * "Swap" is the C#'s word for both directions -- into the bag and out of it --
   * and it is the key `RogueGame.HandlePlayerSwapItemInventory` dispatches on
   * (`RogueGame.cs:11083`).
   */
  SWAP_INVENTORY,

  CITY_INFO,
  MESSAGE_LOG,

  ITEM_SLOT_0,
  ITEM_SLOT_1,
  ITEM_SLOT_2,
  ITEM_SLOT_3,
  ITEM_SLOT_4,
  ITEM_SLOT_5,
  ITEM_SLOT_6,
  ITEM_SLOT_7,
  ITEM_SLOT_8,
  ITEM_SLOT_9,

  /*
   * Not in src/Engine/PlayerCommand.cs — browser-port additions.
   *
   * Appended, never inserted: `Keybindings` persists bindings as
   * `[commandNumber, key]` pairs, so every existing stored value keeps meaning
   * the same command, and `InputTranslator` reaches the item slots by counting
   * on from `ITEM_SLOT_0`.
   */
  /**
   * C# `MAKE_COOKING_FIRE` -- `PlayerCommand.cs:49`, Release 7-6, bound to `Ctrl+F`
   * (`Keybindings.cs:65`).
   *
   * **Not a browser-port addition despite sitting in that block**, so it is listed
   * separately rather than folded into it: it is in the C# and this file's header
   * says what that block is for.
   *
   * Appended rather than inserted, because `Keybindings` persists bindings as
   * `[commandNumber, key]` pairs. Inserting would silently repoint every stored
   * binding after it.
   */
  MAKE_COOKING_FIRE,
  ZOOM_IN,
  ZOOM_OUT,
  LOOK_LEFT,
  LOOK_RIGHT,
  VIEW_MODE_TOGGLE,

  /**
   * C# `UNLOAD_AMMO` -- `PlayerCommand.cs:59`, Release 7-6.
   *
   * Appended at the end for the reason the header of this file gives at length: a
   * stored `Keybindings` pair is `[commandNumber, key]`, so a command's number is
   * part of the save format and inserting one silently re-points every binding
   * above it. This is last, not next to `MAKE_COOKING_FIRE` where the C# has it,
   * and that costs nothing: nothing outside `Keybindings` and the turn loop
   * switches on a `PlayerCommand` by ordinal, and the turn loop switches on the
   * member.
   *
   * It is the seventh key in the fork's own inventory-management set -- unload the
   * ammunition from the equipped gun into the pack -- and it is the only reader of
   * ammunition in the reference. See `Keybindings` for why its key is `Shift+U`
   * rather than the C#'s bare `U`.
   */
  UNLOAD_AMMO,

  /**
   * The in-game action menu: a modal grid of buttons drawn over the minimap.
   *
   * Port-only, and appended at the end for the reason the header of this file
   * gives at length: a stored `Keybindings` pair is `[commandNumber, key]`, so a
   * command's number is part of the save format and inserting one silently
   * re-points every binding above it. It dispatches no action of its own — it
   * runs `HandleActionMenu`, which chooses one of the commands already here and
   * hands it back to the same `switch` the keybinding would have reached.
   */
  ACTION_MENU,
}
