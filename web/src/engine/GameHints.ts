/**
 * GameHints – advisor hints tracking and persistence.
 * Ported from src/Engine/GameHints.cs and AdvisorHint enum in Session.cs
 */

export enum AdvisorHint {
  _FIRST = 0,
  MOVE_BASIC = 0,
  MOUSE_LOOK,
  KEYS_OPTIONS,
  NIGHT,
  RAIN,
  ACTOR_MELEE,
  MOVE_RUN,
  MOVE_RESTING,
  MOVE_JUMP,
  ITEM_GRAB_CONTAINER,
  ITEM_GRAB_FLOOR,
  ITEM_UNEQUIP,
  ITEM_EQUIP,
  ITEM_TYPE_BARRICADING,
  ITEM_DROP,
  ITEM_USE,
  FLASHLIGHT,
  CELLPHONES,
  SPRAYS_PAINT,
  SPRAYS_SCENT,
  WEAPON_FIRE,
  WEAPON_RELOAD,
  GRENADE,
  DOORWINDOW_OPEN,
  DOORWINDOW_CLOSE,
  OBJECT_PUSH,
  OBJECT_BREAK,
  BARRICADE,
  EXIT_STAIRS_LADDERS,
  EXIT_LEAVING_DISTRICT,
  STATE_SLEEPY,
  STATE_HUNGRY,
  NPC_TRADE,
  NPC_GIVING_ITEM,
  NPC_SHOUTING,
  BUILD_FORTIFICATION,
  LEADING_NEED_SKILL,
  LEADING_CAN_RECRUIT,
  LEADING_GIVE_ORDERS,
  LEADING_SWITCH_PLACE,
  GAME_SAVE_LOAD,
  CITY_INFORMATION,
  CORPSE,
  CORPSE_EAT,
  SANITY,
  INFECTION,
  TRAPS,
  _COUNT,
}

export class GameHintsStatus {
  private static readonly STORAGE_KEY = 'rogue_survivor_hints';

  private hints: boolean[] = new Array(AdvisorHint._COUNT).fill(false);

  resetAllHints(): void {
    this.hints.fill(false);
  }

  isAdvisorHintGiven(hint: AdvisorHint): boolean {
    return this.hints[hint] ?? false;
  }

  setAdvisorHintAsGiven(hint: AdvisorHint): void {
    if (hint >= 0 && hint < AdvisorHint._COUNT) {
      this.hints[hint] = true;
    }
  }

  countAdvisorHintsGiven(): number {
    return this.hints.filter(Boolean).length;
  }

  hasAdvisorGivenAllHints(): boolean {
    return this.countAdvisorHintsGiven() >= AdvisorHint._COUNT;
  }

  saveToStorage(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(GameHintsStatus.STORAGE_KEY, JSON.stringify(this.hints));
  }

  static loadFromStorage(): GameHintsStatus {
    const status = new GameHintsStatus();
    if (typeof localStorage === 'undefined') return status;
    const json = localStorage.getItem(GameHintsStatus.STORAGE_KEY);
    if (!json) return status;
    try {
      const arr = JSON.parse(json);
      if (Array.isArray(arr)) {
        for (let i = 0; i < Math.min(arr.length, AdvisorHint._COUNT); i++) {
          if (arr[i]) status.hints[i] = true;
        }
      }
    } catch {
      status.resetAllHints();
    }
    return status;
  }
}
