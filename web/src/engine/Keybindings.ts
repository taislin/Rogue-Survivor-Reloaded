/**
 * Keybindings and InputTranslator for browser keyboard events.
 * Ported from src/Engine/Keybindings.cs and src/Engine/InputTranslator.cs
 */

import { PlayerCommand } from './PlayerCommand';
import { storage } from "@engine/storage";

export class Keybindings {
  private static readonly STORAGE_KEY = 'rogue_survivor_keybindings';

  /**
   * Command -> its keys, in the order they were bound.
   *
   * A list rather than a single key, which is the one place the port is
   * deliberately *more* capable than the C#: `Keybindings.cs` keeps
   * `Dictionary<PlayerCommand, Keys>`, so a command has exactly one key there and
   * choosing a different movement scheme means giving up the arrow keys. Several
   * keys per command is what makes the numpad usable alongside the arrows without
   * a choice, and the first entry stays the one shown in help text.
   */
  private commandToKeys = new Map<PlayerCommand, string[]>();

  /**
   * Key -> the one command that owns it.
   *
   * Still one-to-one, deliberately: the C# enforces the same rule
   * (`Keybindings.Set` steals a key from whatever held it, and
   * `CheckForConflict` reports two commands sharing one), and a key that reached
   * two commands would depend on map iteration order to resolve.
   */
  private keyToCommand = new Map<string, PlayerCommand>();

  constructor() {
    this.resetToDefaults();
  }

  /**
   * Friendly names for the numpad, used as the binding identity.
   *
   * The identity has to be readable, because these strings are what the help
   * screen and every "press <...>" hint in the game print. `Num 4` says what a
   * player needs to know; `Numpad4` is a DOM `code` leaking into the UI.
   */
  private static readonly NUMPAD_NAMES: ReadonlyMap<string, string> = new Map([
    ["NumpadDecimal", "Num ."],
    ["NumpadAdd", "Num +"],
    ["NumpadSubtract", "Num -"],
    ["NumpadMultiply", "Num *"],
    ["NumpadDivide", "Num /"],
    ["NumpadEnter", "Num Enter"],
  ]);

  /**
   * The key part of a binding description, made unambiguous.
   *
   * A numpad key and the digit above it both arrive from the browser as
   * `key: "7"`, so the character alone cannot tell them apart: binding one
   * silently took the other away, which is why this port could not simply take
   * the C#'s numpad movement defaults — `Keys.NumPad7` and `Keys.D7` are distinct
   * values in C# and the same string here.
   *
   * `event.code` is the *physical* position ("Numpad7" against "Digit7") and is
   * the only thing that distinguishes them, so a numpad key is named by position
   * and everything else keeps its character.
   */
  static canonicalKey(key: string, code?: string): string {
    if (code != null && code.startsWith("Numpad")) {
      const named = Keybindings.NUMPAD_NAMES.get(code);
      if (named !== undefined) return named;
      // Numpad0..Numpad9
      return `Num ${code.slice("Numpad".length)}`;
    }
    return key.toUpperCase();
  }

  /** True when this event came from the numeric keypad rather than the digit row. */
  static isNumpad(code?: string): boolean {
    return code != null && code.startsWith("Numpad");
  }

  /**
   * `code` is optional so that everything which synthesises a key rather than
   * reading a real event — the headless UI, tests — keeps working unchanged. A
   * missing `code` simply means "no position information", never "the digit row".
   */
  static makeKey(key: string, ctrl = false, alt = false, shift = false, code?: string): string {
    const parts: string[] = [];
    if (ctrl) parts.push('Ctrl');
    if (alt) parts.push('Alt');
    if (shift) parts.push('Shift');
    parts.push(Keybindings.canonicalKey(key, code));
    return parts.join('+');
  }

  resetToDefaults(): void {
    this.commandToKeys.clear();
    this.keyToCommand.clear();

    this.set(PlayerCommand.BARRICADE_MODE, 'B');
    this.set(PlayerCommand.BREAK_MODE, 'K');
    this.set(PlayerCommand.CLOSE_DOOR, 'Shift+T');
    this.set(PlayerCommand.FIRE_MODE, 'F');

    // C# `Keybindings.cs:65`: `Keys.F | Keys.Control`, Release 7-6. `Ctrl+F` rather
    // than `F` because plain `F` is FIRE_MODE, and the C# picked the modifier
    // instead of the letter for the same reason.
    this.set(PlayerCommand.MAKE_COOKING_FIRE, 'Ctrl+F');
    this.set(PlayerCommand.HELP_MODE, 'H');
    this.set(PlayerCommand.KEYBINDING_MODE, 'Shift+K');

    this.set(PlayerCommand.ITEM_SLOT_0, '1');
    this.set(PlayerCommand.ITEM_SLOT_1, '2');
    this.set(PlayerCommand.ITEM_SLOT_2, '3');
    this.set(PlayerCommand.ITEM_SLOT_3, '4');
    this.set(PlayerCommand.ITEM_SLOT_4, '5');
    this.set(PlayerCommand.ITEM_SLOT_5, '6');
    this.set(PlayerCommand.ITEM_SLOT_6, '7');
    this.set(PlayerCommand.ITEM_SLOT_7, '8');
    this.set(PlayerCommand.ITEM_SLOT_8, '9');
    this.set(PlayerCommand.ITEM_SLOT_9, '0');

    /*
     * The commands the movement grid displaced.
     *
     * Seven commands lost their key to the grid. Six letters went to the eight
     * directions: `S` was SHOUT, `A` USE_SPRAY, `E` NEGOCIATE_TRADE, `Z` SLEEP,
     * `W` WAIT_LONG and `C` CLOSE_DOOR, and LOOK_RIGHT lost `C` as well.
     *
     * Five letters were unclaimed — `J` `L` `M` `Q` `U` — and `Q` is a grid
     * corner, so four of the seven could keep a bare letter and the rest had to
     * take a Shift chord.
     *
     * WAIT_LONG kept its letter as `Shift+W`, one chord from the bare `W` the player
     * knew. It deliberately did *not* take the freed `Shift+X`: `X` is now
     * WAIT_OR_SELF, and "wait a turn" beside "wait an hour" trades a
     * muscle-memory win for a mispress that costs a turn.
     *
     * LOOK_RIGHT took `Shift+C` for the same reason, keeping `C` as the letter.
     *
     * The remaining four could not use a Shift chord at all, because every letter
     * they wanted was already taken by a longer existing binding: `Shift+S` is
     * SAVE_GAME and `Ctrl+S` is SWITCH_PLACE (so SHOUT took the free `U`),
     * `Shift+A` is ABANDON_GAME (USE_SPRAY took `M`), `Shift+E` is EAT_CORPSE
     * and `Ctrl+E` is MARK_ENEMIES_MODE (NEGOCIATE_TRADE took `L`), and
     * `Shift+M` is MESSAGE_LOG. SLEEP took `Shift+Z`, which nothing else claims.
     */
    this.set(PlayerCommand.ABANDON_GAME, 'Shift+A');
    this.set(PlayerCommand.ADVISOR, 'Shift+H');
    this.set(PlayerCommand.BUILD_LARGE_FORTIFICATION, 'Ctrl+N');
    this.set(PlayerCommand.BUILD_SMALL_FORTIFICATION, 'N');
    this.set(PlayerCommand.CITY_INFO, 'I');
    this.set(PlayerCommand.EAT_CORPSE, 'Shift+E');
    this.set(PlayerCommand.GIVE_ITEM, 'G');
    this.set(PlayerCommand.HINTS_SCREEN_MODE, 'Ctrl+H');
    this.set(PlayerCommand.NEGOCIATE_TRADE, 'L');
    this.set(PlayerCommand.LOAD_GAME, 'Shift+L');
    this.set(PlayerCommand.MARK_ENEMIES_MODE, 'Ctrl+E');
    this.set(PlayerCommand.MESSAGE_LOG, 'Shift+M');

    /*
     * The eight compass moves, as the 3x3 grid the player expects from an
     * isometric map:
     *
     *     Q W E        NW  N  NE
     *     A S D         W  S   E
     *     Z C           SW    SE
     *
     * Eight keys rather than nine, because the centre is `S` and there is no
     * "stand still" key in the middle of it — waiting is `X`/`Num 5`, which was
     * the C#'s `NumPad5` (`Keybindings.cs:93`) and reads as a deliberate act
     * rather than as something reached by not moving.
     *
     * `set` for the letter, `addKey` for the extra keys, so each direction
     * carries all of them and none replaces another.
     *
     * The four arrows stay on the four cardinals only, as they were: an arrow
     * that reached a diagonal would make Up mean north *and* north-west, and the
     * grid letter is what disambiguates. The numpad diagonals are redundant with
     * `Q`/`E`/`Z`/`C` but stay because they cost nothing, and because `NumPad7`
     * and `D7` both arriving as the string `"7"` is the ambiguity `canonicalKey`
     * exists to resolve.
     */
    this.set(PlayerCommand.MOVE_N, 'W');
    this.set(PlayerCommand.MOVE_NE, 'E');
    this.set(PlayerCommand.MOVE_E, 'D');
    this.set(PlayerCommand.MOVE_SE, 'C');
    this.set(PlayerCommand.MOVE_S, 'S');
    this.set(PlayerCommand.MOVE_SW, 'Z');
    this.set(PlayerCommand.MOVE_W, 'A');
    this.set(PlayerCommand.MOVE_NW, 'Q');

    this.addKey(PlayerCommand.MOVE_N, 'ArrowUp');
    this.addKey(PlayerCommand.MOVE_E, 'ArrowRight');
    this.addKey(PlayerCommand.MOVE_S, 'ArrowDown');
    this.addKey(PlayerCommand.MOVE_W, 'ArrowLeft');

    this.addKey(PlayerCommand.MOVE_N, 'Num 8');
    this.addKey(PlayerCommand.MOVE_NE, 'Num 9');
    this.addKey(PlayerCommand.MOVE_E, 'Num 6');
    this.addKey(PlayerCommand.MOVE_SE, 'Num 3');
    this.addKey(PlayerCommand.MOVE_S, 'Num 2');
    this.addKey(PlayerCommand.MOVE_SW, 'Num 1');
    this.addKey(PlayerCommand.MOVE_W, 'Num 4');
    this.addKey(PlayerCommand.MOVE_NW, 'Num 7');

    this.set(PlayerCommand.OPTIONS_MODE, 'Shift+O');
    this.set(PlayerCommand.ORDER_MODE, 'O');
    this.set(PlayerCommand.PULL_MODE, 'Ctrl+P');
    this.set(PlayerCommand.PUSH_MODE, 'P');
    this.set(PlayerCommand.QUIT_GAME, 'Shift+Q');
    this.set(PlayerCommand.REVIVE_CORPSE, 'Shift+R');
    this.set(PlayerCommand.RUN_TOGGLE, 'R');
    this.set(PlayerCommand.SAVE_GAME, 'Shift+S');
    this.set(PlayerCommand.SCREENSHOT, 'Shift+N');
    this.set(PlayerCommand.SHOUT, 'U');
    this.set(PlayerCommand.SLEEP, 'Shift+Z');
    this.set(PlayerCommand.SWITCH_PLACE, 'Ctrl+S');
    this.set(PlayerCommand.LEAD_MODE, 'T');
    this.set(PlayerCommand.USE_SPRAY, 'M');
    this.set(PlayerCommand.USE_EXIT, '.');
    this.set(PlayerCommand.WAIT_OR_SELF, 'X');
    this.set(PlayerCommand.WAIT_LONG, 'Shift+W');

    /*
     * Still Alive, Release 7-6. C# `Keybindings.cs:90` binds `UNLOAD_AMMO` to a
     * bare `Keys.U`.
     *
     * **The bare `U` is SHOUT's**, and has been since the movement grid took `S`
     * off it — see the displacement note above, which is where the C#'s `S` for
     * SHOUT became this port's `U`. So the command takes `Shift+U`: one chord from
     * the key the reference uses, and the same trade the other displaced commands
     * made. `WAIT_LONG` kept its letter as `Shift+W` and `LOOK_RIGHT` as `Shift+C`,
     * for the same reason and with the same reasoning written down — a chord
     * preserves the muscle memory, whereas the one free bare letter (`J`) would
     * have taught the player a key the reference never used.
     *
     * A `Shift+` letter needs no `shouldPreventDefault` handling, unlike the `Ctrl+`
     * five, because the browser has no action of its own for it.
     */
    this.set(PlayerCommand.UNLOAD_AMMO, 'Shift+U');

    /*
     * Waiting a turn is on `X` and on `Num 5`, the C#'s `NumPad5`
     * (`Keybindings.cs:93`), which this port had dropped in favour of `.` alone —
     * while `manual.txt` kept advertising the numpad key. Both are back: `X` is
     * under the right hand rather than on the numeric keypad, and the numpad key
     * is where the C# had it.
     *
     * `USE_EXIT` and `WAIT_OR_SELF` swapped places. `X` was the exit and `.` was
     * the wait, and this puts the exit where the wait was. It is a deliberate
     * swap, so it is worth saying why the exit did not keep `X`: `X` and `Shift+X`
     * as "take the stairs" and "sleep an hour" is the pairing that reads worst
     * under pressure, and one of the two had to move anyway.
     */
    this.addKey(PlayerCommand.WAIT_OR_SELF, 'Num 5');

    /*
     * Map zoom. Bound to the unshifted '=' and '-', not to '+' and '_': on a US
     * layout '+' *is* shift+'=', so the browser reports key "+" with
     * `shiftKey: true` and `makeKey` would build the description "Shift++",
     * which matches no binding. `InputTranslator` folds the shifted symbols
     * back onto the unshifted key, so every one of them still zooms.
     */
    this.set(PlayerCommand.ZOOM_IN, '=');
    this.set(PlayerCommand.ZOOM_OUT, '-');

    /*
     * Turning, for the first-person view.
     *
     * `V` rather than the arrow keys, on purpose. The *design* is that Left and
     * Right turn and Up and Down walk — but that remap happens where the command
     * is dispatched, not in the binding table, so a binding for LOOK_LEFT on an
     * arrow key would fight MOVE_W for the same key and one of them would win
     * depending on the view mode. Keeping `V` here means the arrow keys keep their
     * one meaning in the binding table, the remap is a single pure function over
     * the command, and it is testable over all eight movement commands at once.
     *
     * LOOK_RIGHT was `C`, paired with LOOK_LEFT's `V` by adjacency. The grid took
     * `C`, so it is `Shift+C` now — still adjacent in feel, still a free action
     * either hand can reach, and reachable by muscle memory from the old binding.
     *
     * Two keys, because a free action wants a comfortable pair and either hand
     * reaches both.
     */
    this.set(PlayerCommand.LOOK_LEFT, 'V');
    this.addKey(PlayerCommand.LOOK_LEFT, '[');
    this.set(PlayerCommand.LOOK_RIGHT, 'Shift+C');
    this.addKey(PlayerCommand.LOOK_RIGHT, ']');

    /*
     * Switching between the two views. The options screen is the real home for
     * the choice — it persists through the `m_` prefix, is readable before the
     * first frame, and has a description explaining that the arrow keys change
     * meaning — so this is a shortcut rather than the only way there. It writes
     * the *option* and then runs the same `ApplyOptions` the options screen does,
     * so there is one place the change takes effect rather than two.
     */
    this.set(PlayerCommand.VIEW_MODE_TOGGLE, 'Shift+F');

    /*
     * Still Alive, Release 8-2. C# `Keybindings.cs:88` binds
     * `SWAP_INVENTORY` to `Keys.Y`, and the port takes the letter rather than a
     * physical key code because `Keybindings` is a browser table throughout.
     *
     * `Y` is unclaimed, which is the only reason this is safe: the C# picked it
     * for the same reason.
     *
     * **It is dispatched**, and this comment used to say it was not — "nothing
     * under `PlayerCommand.SWAP_INVENTORY` is wired into `RogueGame` yet, and a
     * binding with no handler is inert rather than wrong". That was written when
     * the binding landed and the handler did not, and the handler arrived later
     * without the sentence being revisited: `RogueGame`'s turn loop dispatches
     * `PlayerCommand.SWAP_INVENTORY` to `HandlePlayerSwapItemInventory`, the
     * rebind screen has a row for it, and two help strings name the key.
     *
     * It is kept as a correction rather than quietly deleted because the claim was
     * load-bearing once: it is what a reader would have checked to decide the
     * feature was half-landed, and a comment that says a thing is inert when it
     * is live is worse than no comment — it sends a reader looking for a missing
     * piece that is present.
     */
    this.set(PlayerCommand.SWAP_INVENTORY, 'Y');
  }

  /**
   * Binds a command to exactly one key, discarding any it already had.
   *
   * This is `Keybindings.Set` — the C# shape, and what the defaults and the
   * storage loader use. To *add* a second key to a command, use `addKey`.
   */
  set(cmd: PlayerCommand, keyDesc: string): void {
    this.unbindAll(cmd);
    this.bind(cmd, keyDesc);
  }

  /**
   * Adds a key to a command that keeps the ones it already has.
   *
   * A key can only belong to one command (the C# rule), so this takes it away
   * from whichever command held it. Re-adding a key the command already has is a
   * no-op, so holding a key down on the rebind screen cannot grow the list.
   */
  addKey(cmd: PlayerCommand, keyDesc: string): void {
    const owner = this.keyToCommand.get(keyDesc);
    if (owner === cmd) return;
    if (owner !== undefined) this.unbind(owner, keyDesc);
    const keys = this.commandToKeys.get(cmd);
    if (keys === undefined) this.commandToKeys.set(cmd, [keyDesc]);
    else keys.push(keyDesc);
    this.keyToCommand.set(keyDesc, cmd);
  }

  /**
   * Drops the most recently added key of a command.
   *
   * The rebind screen binds this to Backspace, so a command can be given several
   * keys and then trimmed back without resetting everything.
   */
  removeLastKey(cmd: PlayerCommand): void {
    const keys = this.commandToKeys.get(cmd);
    if (keys === undefined || keys.length === 0) return;
    const dropped = keys.pop()!;
    this.keyToCommand.delete(dropped);
    if (keys.length === 0) this.commandToKeys.delete(cmd);
  }

  /** Forgets a command's keys, and gives them back to nobody. */
  private unbindAll(cmd: PlayerCommand): void {
    const keys = this.commandToKeys.get(cmd);
    if (keys === undefined) return;
    for (const key of keys) this.keyToCommand.delete(key);
    this.commandToKeys.delete(cmd);
  }

  private unbind(cmd: PlayerCommand, keyDesc: string): void {
    const keys = this.commandToKeys.get(cmd);
    if (keys === undefined) return;
    const at = keys.indexOf(keyDesc);
    if (at !== -1) keys.splice(at, 1);
    if (keys.length === 0) this.commandToKeys.delete(cmd);
  }

  private bind(cmd: PlayerCommand, keyDesc: string): void {
    const owner = this.keyToCommand.get(keyDesc);
    if (owner !== undefined && owner !== cmd) this.unbind(owner, keyDesc);
    this.commandToKeys.set(cmd, [keyDesc]);
    this.keyToCommand.set(keyDesc, cmd);
  }

  /** C#: `Keybindings.CheckForConflict` — true when 2 commands share the same key. */
  checkForConflict(): boolean {
    const seen = new Set<string>();
    for (const keys of this.commandToKeys.values()) {
      for (const key of keys) {
        if (seen.has(key)) return true;
        seen.add(key);
      }
    }
    return false;
  }

  /**
   * The command's primary key — the first one bound.
   *
   * Every "press <...>" hint in the game and the help screen read this, so they
   * keep working unchanged and show the *first* key, not a list.
   */
  get(cmd: PlayerCommand): string | undefined {
    return this.commandToKeys.get(cmd)?.[0];
  }

  /** Every key bound to a command, in binding order. */
  getAll(cmd: PlayerCommand): string[] {
    return [...(this.commandToKeys.get(cmd) ?? [])];
  }

  getCommand(keyDesc: string): PlayerCommand {
    return this.keyToCommand.get(keyDesc) ?? PlayerCommand.NONE;
  }

  saveToStorage(): void {
    const entries: [number, string[]][] = [];
    for (const [cmd, keys] of this.commandToKeys) {
      entries.push([cmd, keys]);
    }
    storage.setItem(Keybindings.STORAGE_KEY, JSON.stringify(entries));
  }

  loadFromStorage(): boolean {
    const json = storage.getItem(Keybindings.STORAGE_KEY);
    if (!json) return false;
    try {
      /*
       * Both shapes are accepted: `[[cmd, key]]` from a save written before a
       * command could hold more than one key, and `[[cmd, [keys]]]` from after.
       * Refusing the old one would throw away a player's keybindings because the
       * game gained a feature, which is a bad trade for a list of strings.
       */
      const entries = JSON.parse(json) as [number, string | string[]][];
      for (const [cmd, keyOrKeys] of entries) {
        const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
        if (keys.length === 0) continue;
        this.set(cmd as PlayerCommand, keys[0]!);
        for (const extra of keys.slice(1)) this.addKey(cmd as PlayerCommand, extra);
      }
      return true;
    } catch {
      return false;
    }
  }
}

export class InputTranslator {
  /**
   * Keys that should reach a binding stored under a different key.
   *
   * A symbol key cannot always be typed without a modifier, so the browser
   * reports a different `key` for it depending on the keyboard: '+' arrives as
   * key "+" with `shiftKey` set, and the numpad's '+' arrives as "Add" with no
   * modifier at all. Without folding these onto the unshifted symbol, a
   * binding on '=' would be unreachable for anyone pressing '+'.
   */
  private static readonly KEY_ALIASES: ReadonlyMap<string, string> = new Map([
    ["+", "="],
    ["Add", "="],
    ["_", "-"],
    ["Subtract", "-"],
  ]);

  static keyToCommand(
    keybindings: Keybindings,
    key: string,
    ctrl = false,
    alt = false,
    shift = false,
    code?: string
  ): PlayerCommand {
    // 1. Direct match with modifiers. `code` is passed so a numpad key is looked
    //    up by position ("Num 7"), which is what makes a numpad binding win over
    //    a digit-row binding rather than the other way round.
    const keyDesc = Keybindings.makeKey(key, ctrl, alt, shift, code);
    let cmd = keybindings.getCommand(keyDesc);
    if (cmd !== PlayerCommand.NONE) return cmd;

    // 2. Unmodified match on the character alone: arrows, and a numpad digit
    //    falling back to a binding on the digit row. This is what keeps a player
    //    who selects items with the numpad working after the defaults gained
    //    numpad movement — the numpad 5 still reaches item slot 5 when nothing has
    //    claimed "Num 5".
    if (!ctrl && !alt && !shift) {
      cmd = keybindings.getCommand(key);
      if (cmd !== PlayerCommand.NONE) return cmd;
    }

    // 3. Same, for the symbol keys a modifier or a keypad spelling got in the
    //    way of — see KEY_ALIASES.
    const alias = InputTranslator.KEY_ALIASES.get(key);
    if (alias != null) {
      cmd = keybindings.getCommand(alias);
      if (cmd !== PlayerCommand.NONE) return cmd;
      // With a modifier held, the description carries it, so match that.
      if (ctrl || alt || shift) {
        cmd = keybindings.getCommand(Keybindings.makeKey(alias, ctrl, alt, shift));
        if (cmd !== PlayerCommand.NONE) return cmd;
      }
    }

    // 4. Item slot keys modifier check (Ctrl/Shift/Alt + 0..9)
    if (ctrl || alt || shift) {
      const rawKey = key.toUpperCase();
      for (let i = 0; i <= 9; i++) {
        const slotCmd = (PlayerCommand.ITEM_SLOT_0 + i) as PlayerCommand;
        for (const boundKey of keybindings.getAll(slotCmd)) {
          if (boundKey.toUpperCase() === rawKey) {
            return slotCmd;
          }
        }
      }
    }

    return PlayerCommand.NONE;
  }
}
