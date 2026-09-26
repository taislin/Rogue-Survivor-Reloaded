/**
 * Keybindings and InputTranslator for browser keyboard events.
 * Ported from src/Engine/Keybindings.cs and src/Engine/InputTranslator.cs
 */

import { PlayerCommand } from './PlayerCommand';

export class Keybindings {
  private static readonly STORAGE_KEY = 'rogue_survivor_keybindings';

  private commandToKey = new Map<PlayerCommand, string>();
  private keyToCommand = new Map<string, PlayerCommand>();

  constructor() {
    this.resetToDefaults();
  }

  static makeKey(key: string, ctrl = false, alt = false, shift = false): string {
    const parts: string[] = [];
    if (ctrl) parts.push('Ctrl');
    if (alt) parts.push('Alt');
    if (shift) parts.push('Shift');
    parts.push(key.toUpperCase());
    return parts.join('+');
  }

  resetToDefaults(): void {
    this.commandToKey.clear();
    this.keyToCommand.clear();

    this.set(PlayerCommand.BARRICADE_MODE, 'B');
    this.set(PlayerCommand.BREAK_MODE, 'K');
    this.set(PlayerCommand.CLOSE_DOOR, 'C');
    this.set(PlayerCommand.FIRE_MODE, 'F');
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

    this.set(PlayerCommand.ABANDON_GAME, 'Shift+A');
    this.set(PlayerCommand.ADVISOR, 'Shift+H');
    this.set(PlayerCommand.BUILD_LARGE_FORTIFICATION, 'Ctrl+N');
    this.set(PlayerCommand.BUILD_SMALL_FORTIFICATION, 'N');
    this.set(PlayerCommand.CITY_INFO, 'I');
    this.set(PlayerCommand.EAT_CORPSE, 'Shift+E');
    this.set(PlayerCommand.GIVE_ITEM, 'G');
    this.set(PlayerCommand.HINTS_SCREEN_MODE, 'Ctrl+H');
    this.set(PlayerCommand.NEGOCIATE_TRADE, 'E');
    this.set(PlayerCommand.LOAD_GAME, 'Shift+L');
    this.set(PlayerCommand.MARK_ENEMIES_MODE, 'Ctrl+E');
    this.set(PlayerCommand.MESSAGE_LOG, 'Shift+M');

    // Numpad + arrows + vi keys
    this.set(PlayerCommand.MOVE_E, 'ArrowRight');
    this.set(PlayerCommand.MOVE_N, 'ArrowUp');
    this.set(PlayerCommand.MOVE_S, 'ArrowDown');
    this.set(PlayerCommand.MOVE_W, 'ArrowLeft');

    this.set(PlayerCommand.OPTIONS_MODE, 'Shift+O');
    this.set(PlayerCommand.ORDER_MODE, 'O');
    this.set(PlayerCommand.PULL_MODE, 'Ctrl+P');
    this.set(PlayerCommand.PUSH_MODE, 'P');
    this.set(PlayerCommand.QUIT_GAME, 'Shift+Q');
    this.set(PlayerCommand.REVIVE_CORPSE, 'Shift+R');
    this.set(PlayerCommand.RUN_TOGGLE, 'R');
    this.set(PlayerCommand.SAVE_GAME, 'Shift+S');
    this.set(PlayerCommand.SCREENSHOT, 'Shift+N');
    this.set(PlayerCommand.SHOUT, 'S');
    this.set(PlayerCommand.SLEEP, 'Z');
    this.set(PlayerCommand.SWITCH_PLACE, 'Ctrl+S');
    this.set(PlayerCommand.LEAD_MODE, 'T');
    this.set(PlayerCommand.USE_SPRAY, 'A');
    this.set(PlayerCommand.USE_EXIT, 'X');
    this.set(PlayerCommand.WAIT_OR_SELF, '.');
    this.set(PlayerCommand.WAIT_LONG, 'W');
  }

  set(cmd: PlayerCommand, keyDesc: string): void {
    // remove previous bind (C#: `Keybindings.Set` — a key can only belong to one command).
    const prevCommand = this.getCommand(keyDesc);
    if (prevCommand !== PlayerCommand.NONE) {
      this.commandToKey.delete(prevCommand);
    }
    const prevKey = this.commandToKey.get(cmd);
    if (prevKey) {
      this.keyToCommand.delete(prevKey);
    }
    this.commandToKey.set(cmd, keyDesc);
    this.keyToCommand.set(keyDesc, cmd);
  }

  /** C#: `Keybindings.CheckForConflict` — true when 2 commands share the same key. */
  checkForConflict(): boolean {
    const seen = new Set<string>();
    for (const key of this.commandToKey.values()) {
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  }

  get(cmd: PlayerCommand): string | undefined {
    return this.commandToKey.get(cmd);
  }

  getCommand(keyDesc: string): PlayerCommand {
    return this.keyToCommand.get(keyDesc) ?? PlayerCommand.NONE;
  }

  saveToStorage(): void {
    if (typeof localStorage === 'undefined') return;
    const entries: [number, string][] = [];
    for (const [cmd, key] of this.commandToKey) {
      entries.push([cmd, key]);
    }
    localStorage.setItem(Keybindings.STORAGE_KEY, JSON.stringify(entries));
  }

  loadFromStorage(): boolean {
    if (typeof localStorage === 'undefined') return false;
    const json = localStorage.getItem(Keybindings.STORAGE_KEY);
    if (!json) return false;
    try {
      const entries = JSON.parse(json) as [number, string][];
      for (const [cmd, key] of entries) {
        this.set(cmd, key);
      }
      return true;
    } catch {
      return false;
    }
  }
}

export class InputTranslator {
  static keyToCommand(
    keybindings: Keybindings,
    key: string,
    ctrl = false,
    alt = false,
    shift = false
  ): PlayerCommand {
    // 1. Direct match with modifiers
    const keyDesc = Keybindings.makeKey(key, ctrl, alt, shift);
    let cmd = keybindings.getCommand(keyDesc);
    if (cmd !== PlayerCommand.NONE) return cmd;

    // 2. Unmodified match for numpad / arrows if no modifiers were active
    if (!ctrl && !alt && !shift) {
      cmd = keybindings.getCommand(key);
      if (cmd !== PlayerCommand.NONE) return cmd;
    }

    // 3. Item slot keys modifier check (Ctrl/Shift/Alt + 0..9)
    if (ctrl || alt || shift) {
      const rawKey = key.toUpperCase();
      for (let i = 0; i <= 9; i++) {
        const slotCmd = (PlayerCommand.ITEM_SLOT_0 + i) as PlayerCommand;
        const boundKey = keybindings.get(slotCmd);
        if (boundKey && boundKey.toUpperCase() === rawKey) {
          return slotCmd;
        }
      }
    }

    return PlayerCommand.NONE;
  }
}
