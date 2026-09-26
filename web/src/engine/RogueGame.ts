/**
 * RogueGame — browser port of `src/Engine/RogueGame.cs` (23 233 lines).
 *
 * Phase 4 of the BROWSER_PORT_PLAN. Ported as ONE class (see the plan's
 * "As implemented" section): the C# regions share a single set of private
 * fields and input → actions → rendering call each other, so splitting into
 * modules would mean making most of that state public and creating circular
 * imports. The file is assembled from contiguous C# line-range slices.
 *
 * Scaffold: constants / fields / properties / constructor are ported; every
 * other method is a generated stub that throws until its slice lands.
 * Method index: `web/.porting/roguegame-methods.txt`.
 */

import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Color } from "@engine/Color";
import { Direction } from "@engine/Direction";
import { DiceRoller } from "@engine/DiceRoller";
import { WorldTime, DayPhase } from "@engine/WorldTime";
import { Rules } from "@engine/Rules";
import { Session, GameMode, RaidType, UniqueActor, UniqueMap, UniqueItem } from "@engine/Session";
import { AchievementIDs, Scoring, DifficultySide } from "@engine/Scoring";
import { MessageManager } from "@engine/MessageManager";
import { GameSaveManager } from "@engine/GameSave";
import { GameImages } from "@gameplay/GameImages";
import { GameMusics, GameSounds } from "@gameplay/GameSounds";
import { OptionsScreen } from "@ui/OptionsScreen";
import { HiScore, HiScoreTable } from "@engine/HiScoreTable";
import { Keybindings, InputTranslator } from "@engine/Keybindings";
import { GameHintsStatus, AdvisorHint } from "@engine/GameHints";
import { GameOptions, OptionIDs, Options, ReincMode, ZupDays } from "@engine/GameOptions";
import { PlayerCommand } from "@engine/PlayerCommand";
import { IRogueUI, GameKeyEvent, MouseButton } from "@engine/IRogueUI";
import { LOS } from "@engine/LOS";
import { TextFile } from "@engine/TextFile";
import { SayFlags } from "@engine/actions/Actions";
import { Item } from "@data/Item";
import { ItemBodyArmor } from "@engine/items/ItemBodyArmor";
import { ItemExplosive, ItemExplosiveModel, ItemGrenade, ItemGrenadeModel, ItemGrenadePrimed, ItemGrenadePrimedModel } from "@engine/items/ItemExplosive";
import { ItemFood } from "@engine/items/ItemFood";
import { ItemLight } from "@engine/items/ItemLight";
import { ItemMedicine } from "@engine/items/ItemMedicine";
import { ItemTrap } from "@engine/items/ItemTrap";
import { AmmoType, ItemAmmo, ItemMeleeWeapon, ItemRangedWeapon, ItemRangedWeaponModel, ItemWeapon, ItemWeaponModel } from "@engine/items/ItemWeapon";
import { ItemBarricadeMaterial, ItemEntertainment, ItemSprayPaint, ItemSprayScent } from "@engine/items/ItemMisc";
import { ItemTracker } from "@engine/items/ItemTracker";
import { MapObject, MapObjectBreak, MapObjectFire } from "@data/MapObject";
import { Board, DoorWindow, Fortification, PowerGenerator } from "@engine/mapobjects/MapObjects";
import { Actor } from "@data/Actor";
import { ActorModel } from "@data/ActorModel";
import { ActorDirective, ActorCourage } from "@data/ActorDirective";
import { ActorTasks, ActorOrder } from "@data/ActorOrder";
import { FireMode } from "@data/Attack";
import { BlastAttack } from "@data/BlastAttack";
import { ActorAction } from "@data/ActorAction";
import { Corpse } from "@data/Corpse";
import { Odor, OdorScent } from "@data/Odor";
import { Activity } from "@data/Activity";
import type { TimedTask } from "@data/TimedTask";
import { District, DistrictKind } from "@data/District";
import { DollPart } from "@data/Doll";
import { AIController } from "@data/AIController";
import { Faction } from "@data/Faction";
import { Inventory } from "@data/Inventory";
import { Location } from "@data/Location";
import { Models } from "@data/Models";
import { Message } from "@data/Message";
import { Map } from "@data/Map";
import { Skill } from "@data/Skill";
import { Tile } from "@data/Tile";
import { TileModel } from "@data/TileModel";
import { Verb } from "@data/Verb";
import { Weather } from "@data/Weather";
import { World } from "@data/World";
import { GameActors, ActorID } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { FactionID } from "@gameplay/GameFactions";
import { GameGangs, GangID } from "@gameplay/GameGangs";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameTiles } from "@gameplay/GameTiles";
import { GameTips } from "@gameplay/ZoneAttributes";
import { SkillID, Skills } from "@gameplay/Skills";
import { BaseTownGenerator, Parameters as TownParameters } from "@gameplay/generators/BaseTownGenerator";
import { StdTownGenerator } from "@gameplay/generators/StdTownGenerator";
import { BaseAI, TradeRating } from "@gameplay/ai/BaseAI";
import { ActionWait } from "@engine/actions/Actions";
import { OrderableAI } from "@gameplay/ai/OrderableAI";
import { IMusicManager } from "@engine/audio/IMusicManager";
import { NullMusicManager } from "@engine/audio/NullMusicManager";

/** C# `System.TimeSpan` — not ported yet; `TimeSpanToString` gets it in Phase 4 slice 6. */
type TimeSpan = number;

/** C# `SetupConfig.GAME_VERSION` (also duplicated in `ui/OptionsScreen.ts`). */
const GAME_VERSION = "alpha 10.1";

/** C# `Color.FromArgb(c.A, c.R / 2, c.G / 2, c.B / 2)` — used for text shadows. */
function shadowColorOf(c: Color): Color {
  return Color.fromArgb(Math.floor(c.r / 2), Math.floor(c.g / 2), Math.floor(c.b / 2), c.a);
}

/** C# numeric/string format alignment: `{0,3}`, `{0,6}` (right aligned). */
export function padLeft(s: string | number, width: number): string {
  return String(s).padStart(width, " ");
}

/** C# numeric/string format alignment: `{0,-25}` (left aligned). */
export function padRight(s: string | number, width: number): string {
  return String(s).padEnd(width, " ");
}

/** C# numeric format: `{0:D2}` / `{0:D3}` (zero padded integer). */
export function padZero(s: string | number, width: number): string {
  return String(s).padStart(width, "0");
}

// ── C# Constants (module level so initializers and static methods can see them)
export const MAP_MAX_HEIGHT: number = 100;
export const MAP_MAX_WIDTH: number = 100;
export const TILE_SIZE: number = 32;
export const ACTOR_SIZE: number = 32;
export const ACTOR_OFFSET: number = (TILE_SIZE - ACTOR_SIZE) / 2;
export const TILE_VIEW_WIDTH: number = 21;
export const TILE_VIEW_HEIGHT: number = 21;
export const HALF_VIEW_WIDTH: number = 10;
export const HALF_VIEW_HEIGHT: number = 10;
export const CANVAS_WIDTH: number = 1024;
export const CANVAS_HEIGHT: number = 768;
export const DAMAGE_DX: number = 10;
export const DAMAGE_DY: number = 10;
export const RIGHTPANEL_X: number = TILE_SIZE * TILE_VIEW_WIDTH + 4;
export const RIGHTPANEL_Y: number = 0;
export const RIGHTPANEL_TEXT_X: number = RIGHTPANEL_X + 4;
export const RIGHTPANEL_TEXT_Y: number = RIGHTPANEL_Y + 4;
export const INVENTORYPANEL_X: number = RIGHTPANEL_TEXT_X;
export const INVENTORYPANEL_Y: number = RIGHTPANEL_TEXT_Y + 170;
export const GROUNDINVENTORYPANEL_Y: number = INVENTORYPANEL_Y + 64;
export const CORPSESPANEL_Y: number = GROUNDINVENTORYPANEL_Y + 64;
export const INVENTORY_SLOTS_PER_LINE: number = 10;
export const SKILLTABLE_Y: number = CORPSESPANEL_Y + 64;
export const SKILLTABLE_LINES: number = 8;
export const LOCATIONPANEL_X: number = RIGHTPANEL_X;
export const LOCATIONPANEL_TEXT_X: number = LOCATIONPANEL_X + 4;
export const MESSAGES_X: number = 4;
export const MESSAGES_Y: number = TILE_VIEW_HEIGHT * TILE_SIZE + 4;
export const MESSAGES_SPACING: number = 12;
export const MESSAGES_FADEOUT: number = 25;
export const MAX_MESSAGES: number = 7;
export const MESSAGES_HISTORY: number = 59;
export const MINITILE_SIZE: number = 2;
export const MINIMAP_X: number = RIGHTPANEL_X + (CANVAS_WIDTH - RIGHTPANEL_X - MAP_MAX_WIDTH * MINITILE_SIZE) / 2;
export const MINIMAP_Y: number = MESSAGES_Y - MINITILE_SIZE * MAP_MAX_HEIGHT - 1;
export const MINI_TRACKER_OFFSET: number = 1;
export const DELAY_SHORT: number = 250;
export const DELAY_NORMAL: number = 500;
export const DELAY_LONG: number = 1000;
export const LINE_SPACING: number = 12;
export const BOLD_LINE_SPACING: number = 14;
export const CREDIT_CHAR_SPACING: number = 8;
export const CREDIT_LINE_SPACING: number = LINE_SPACING;
export const TEXTFILE_CHARS_PER_LINE: number = 120;
export const TEXTFILE_LINES_PER_PAGE: number = 50;
export const NAME_SUBWAY_STATION: string = "Subway Station";
export const NAME_SEWERS_MAINTENANCE: string = "Sewers Maintenance";
export const NAME_SUBWAY_RAILS: string = "rails";
export const NAME_POLICE_STATION_JAILS_CELL: string = "jail";
export const SPAWN_DISTANCE_TO_PLAYER: number = 10;
export const SEWERS_INVASION_CHANCE: number = 1;
export const SEWERS_UNDEADS_FACTOR: number = 0.50;
export const SUBWAY_INVASION_CHANCE: number = 1;
export const SUBWAY_UNDEADS_FACTOR: number = 0.25;
export const REFUGEES_WAVE_SIZE: number = 0.20;
export const REFUGEES_WAVE_ITEMS: number = 3;
export const REFUGEE_SURFACE_SPAWN_CHANCE: number = 80;
export const UNIQUE_REFUGEE_CHECK_CHANCE: number = 10;
export const NATGUARD_DAY: number = 3;
export const NATGUARD_END_DAY: number = 10;
export const NATGUARD_ZTRACKER_DAY: number = NATGUARD_DAY + 3;
export const NATGUARD_SQUAD_SIZE: number = 5;
export const NATGUARD_INTERVENTION_FACTOR: number = 5;
export const NATGUARD_INTERVENTION_CHANCE: number = 1;
export const ARMY_SUPPLIES_DAY: number = 4;
export const ARMY_SUPPLIES_FACTOR: number = 0.20 * Rules.FOOD_BASE_POINTS;
export const ARMY_SUPPLIES_CHANCE: number = 2;
export const ARMY_SUPPLIES_SCATTER: number = 1;
export const BIKERS_RAID_DAY: number = 2;
export const BIKERS_END_DAY: number = 14;
export const BIKERS_RAID_SIZE: number = 6;
export const BIKERS_RAID_CHANCE_PER_TURN: number = 1;
export const BIKERS_RAID_DAYS_GAP: number = 2;
export const GANGSTAS_RAID_DAY: number = 7;
export const GANGSTAS_END_DAY: number = 21;
export const GANGSTAS_RAID_SIZE: number = 6;
export const GANGSTAS_RAID_CHANCE_PER_TURN: number = 1;
export const GANGSTAS_RAID_DAYS_GAP: number = 3;
export const BLACKOPS_RAID_DAY: number = 14;
export const BLACKOPS_RAID_SIZE: number = 3;
export const BLACKOPS_RAID_CHANCE_PER_TURN: number = 1;
export const BLACKOPS_RAID_DAY_GAP: number = 5;
export const SURVIVORS_BAND_DAY: number = 21;
export const SURVIVORS_BAND_SIZE: number = 5;
export const SURVIVORS_BAND_CHANCE_PER_TURN: number = 1;
export const SURVIVORS_BAND_DAY_GAP: number = 5;
export const ZOMBIE_LORD_EVOLUTION_MIN_DAY: number = 7;
export const DISCIPLE_EVOLUTION_MIN_DAY: number = 7;
export const PLAYER_HEAR_FIGHT_CHANCE: number = 25;
export const PLAYER_HEAR_SCREAMS_CHANCE: number = 10;
export const PLAYER_HEAR_PUSHPULL_CHANCE: number = 25;
export const PLAYER_HEAR_BASH_CHANCE: number = 25;
export const PLAYER_HEAR_BREAK_CHANCE: number = 50;
export const PLAYER_HEAR_EXPLOSION_CHANCE: number = 100;
export const BLOOD_WALL_SPLAT_CHANCE: number = 20;
export const MESSAGE_NPC_SLEEP_SNORE_CHANCE: number = 10;
export const WEATHER_MIN_DURATION: number = 1 * WorldTime.TURNS_PER_HOUR;
export const WEATHER_MAX_DURATION: number = 3 * WorldTime.TURNS_PER_DAY;
export const BGMUSIC_UPDATE_TURNS: number = 4 * WorldTime.TURNS_PER_HOUR;
export const DISTRICT_EXIT_CHANCE_PER_TILE: number = 15;
export const DEBUG_AI_ACTOR_LOOP_COUNT_WARNING: number = 10;
export const BOT_DELAY: number = DELAY_SHORT;
export const LOCATIONPANEL_Y: number = MESSAGES_Y;
export const LOCATIONPANEL_TEXT_Y: number = LOCATIONPANEL_Y + 4;


// ── C# nested types ─────────────────────────────────────────────────────────

/** C# `[Flags] enum SimFlags` (RogueGame.cs:658). */
export enum SimFlags {
  NOT_SIMULATING = 0,
  HIDETAIL_TURN = 1 << 0,
  LODETAIL_TURN = 1 << 1,
}

/** C# `enum MapListFlags` (RogueGame.cs:22935). */
export enum MapListFlags {
  NONE = 0,
  EXCLUDE_SECRET_MAPS = 1 << 0,
}

/** C# `struct CharGen` (RogueGame.cs:647). */
export class CharGen {
  isUndead = false;
  undeadModel: ActorID = ActorID.MALE_CIVILIAN;
  isMale = true;
  startingSkill: SkillID = SkillID.AGILE;
}

// ── C# `#region Overlays` (RogueGame.cs:452) ────────────────────────────────

export abstract class Overlay {
  abstract draw(ui: IRogueUI): void;
}

export class OverlayImage extends Overlay {
  constructor(public screenPosition: Point, public imageID: string) {
    super();
  }
  draw(ui: IRogueUI): void {
    ui.UI_DrawImage(this.imageID, this.screenPosition.x, this.screenPosition.y);
  }
}

export class OverlayTransparentImage extends Overlay {
  constructor(
    public alpha: number,
    public screenPosition: Point,
    public imageID: string
  ) {
    super();
  }
  draw(ui: IRogueUI): void {
    ui.UI_DrawTransparentImage(this.alpha, this.imageID, this.screenPosition.x, this.screenPosition.y);
  }
}

export class OverlayText extends Overlay {
  constructor(
    public screenPosition: Point,
    public color: Color,
    public text: string,
    public shadowColor: Color | null = null
  ) {
    super();
  }
  draw(ui: IRogueUI): void {
    if (this.shadowColor !== null) {
      ui.UI_DrawString(this.shadowColor, this.text, this.screenPosition.x + 1, this.screenPosition.y + 1);
    }
    ui.UI_DrawString(this.color, this.text, this.screenPosition.x, this.screenPosition.y);
  }
}

export class OverlayLine extends Overlay {
  constructor(
    public screenFrom: Point,
    public color: Color,
    public screenTo: Point
  ) {
    super();
  }
  draw(ui: IRogueUI): void {
    ui.UI_DrawLine(this.color, this.screenFrom.x, this.screenFrom.y, this.screenTo.x, this.screenTo.y);
  }
}

export class OverlayRect extends Overlay {
  constructor(public color: Color, public rectangle: Rect) {
    super();
  }
  draw(ui: IRogueUI): void {
    ui.UI_DrawRect(this.color, this.rectangle);
  }
}

export class OverlayPopup extends Overlay {
  constructor(
    public lines: string[] | null,
    public textColor: Color,
    public boxBorderColor: Color,
    public boxFillColor: Color,
    public screenPosition: Point
  ) {
    super();
  }
  draw(ui: IRogueUI): void {
    if (this.lines === null) return;
    ui.UI_DrawPopup(this.lines, this.textColor, this.boxBorderColor, this.boxFillColor, this.screenPosition.x, this.screenPosition.y);
  }
}

export class OverlayPopupTitle extends Overlay {
  constructor(
    public title: string,
    public titleColor: Color,
    public lines: string[],
    public textColor: Color,
    public boxBorderColor: Color,
    public boxFillColor: Color,
    public screenPosition: Point
  ) {
    super();
  }
  draw(ui: IRogueUI): void {
    ui.UI_DrawPopupTitle(this.title, this.titleColor, this.lines, this.textColor, this.boxBorderColor, this.boxFillColor, this.screenPosition.x, this.screenPosition.y);
  }
}

export class OverlayPopupTitleColors extends Overlay {
  constructor(
    public title: string,
    public titleColor: Color,
    public lines: string[],
    public colors: Color[],
    public boxBorderColor: Color,
    public boxFillColor: Color,
    public screenPosition: Point
  ) {
    super();
  }
  draw(ui: IRogueUI): void {
    ui.UI_DrawPopupTitleColors(this.title, this.titleColor, this.lines, this.colors, this.boxBorderColor, this.boxFillColor, this.screenPosition.x, this.screenPosition.y);
  }
}

/** C# `static GameOptions s_Options` / `s_KeyBindings` / `s_Hints`. */
const s_Options = Options;
let s_KeyBindings = new Keybindings();
let s_Hints = new GameHintsStatus();

/** Mirrors `Logger.WriteLine` — dropped in the TS port (browser has console). */
function logInit(text: string): void {
  console.log(`[RogueGame] ${text}`);
}

export class RogueGame {
  /** Browser save slot used by the C# "current save file" (`GetUserSave`). */
  static readonly CURRENT_SAVE_SLOT = 0;


  readonly POPUP_FILLCOLOR: Color = Color.withAlpha(192, Color.CornflowerBlue);
  readonly CLOSE_DOOR_MODE_TEXT: string[] = [ "CLOSE MODE - directions to close, ESC cancels" ];
  readonly BARRICADE_MODE_TEXT: string[] = [ "BARRICADE/REPAIR MODE - directions to barricade/repair, ESC cancels" ];
  readonly BREAK_MODE_TEXT: string[] = [ "BREAK MODE - directions/wait to break an object, ESC cancels" ];
  readonly BUILD_LARGE_FORT_MODE_TEXT: string[] = [ "BUILD LARGE FORTIFICATION MODE - directions to build, ESC cancels" ];
  readonly BUILD_SMALL_FORT_MODE_TEXT: string[] = [ "BUILD SMALL FORTIFICATION MODE - directions to build, ESC cancels" ];
  readonly TRADE_MODE_TEXT: string[] = [ "TRADE MODE - Y to accept the deal, N to refuse" ];
  readonly NEGOCIATE_TRADE_MODE_TEXT: string[] = [ "NEGOCIATE TRADE MODE - directions to start negociating with someone, ESC cancels" ];
  readonly ASK_NEGOCIATE_TEXT: string[] = [ "DO YOU WANT TO NEGOCIATE TRADE WITH {0} - Y to negociate, N to cancel" ];
  readonly UPGRADE_MODE_TEXT: string[] = [ "UPGRADE MODE - follow instructions in the message panel" ];
  readonly FIRE_MODE_TEXT: string[] = [ "FIRE MODE - F to fire, T next target, M toggle mode, ESC cancels" ];
  readonly SWITCH_PLACE_MODE_TEXT: string[] = [ "SWITCH PLACE MODE - directions to switch place with a follower, ESC cancels" ];
  readonly TAKE_LEAD_MODE_TEXT: string[] = [ "TAKE LEAD MODE - directions to recruit a follower, ESC cancels" ];
  readonly PULL_MODE_TEXT: string[] = [ "PULL MODE - directions to select object, ESC cancels" ];
  readonly PUSH_MODE_TEXT: string[] = [ "PUSH/SHOVE MODE - directions to push/shove, ESC cancels" ];
  readonly TAG_MODE_TEXT: string[] = [ "TAG MODE - directions to tag a wall or on the floor, ESC cancels" ];
  readonly SPRAY_MODE_TEXT: string[] = [ "SPRAY MODE - directions to spray or wait key to spray on yourself, ESC cancels" ];
  readonly PULL_OBJECT_MODE_TEXT: string = "PULLING {0} - directions to walk to, ESC cancels";
  readonly PULL_ACTOR_MODE_TEXT: string = "PULLING {0} - directions to walk to, ESC cancels";
  readonly PUSH_OBJECT_MODE_TEXT: string = "PUSHING {0} - directions to push, ESC cancels";
  readonly SHOVE_ACTOR_MODE_TEXT: string = "SHOVING {0} - directions to shove, ESC cancels";
  readonly ORDER_MODE_TEXT: string[] = [ "ORDER MODE - follow instructions in the message panel, ESC cancels" ];
  readonly GIVE_MODE_TEXT: string[] = [ "GIVE MODE - directions to give item to someone, ESC cancels" ];
  readonly THROW_GRENADE_MODE_TEXT: string[] = [ "THROW GRENADE MODE - directions to select, F to fire,  ESC cancels" ];
  readonly MARK_ENEMIES_MODE: string[] = [ "MARK ENEMIES MODE - E to make enemy, T next actor, ESC cancels" ];
  readonly TRADING_DIALOG_MODE_TEXT: string[] = [ "TRADING MODE - TAB switch mode, 0..9 select, ESC cancels" ];
  readonly MODE_TEXTCOLOR: Color = Color.Yellow;
  readonly MODE_BORDERCOLOR: Color = Color.Yellow;
  readonly MODE_FILLCOLOR: Color = Color.withAlpha(192, Color.Gray);
  readonly TRADE_COLOR_SELECTED_ITEM: Color = Color.LightBlue;
  readonly TRADE_COLOR_ACCEPT: Color = Color.LightGreen;
  readonly TRADE_COLOR_REFUSE: Color = Color.DarkRed;
  readonly TRADE_COLOR_MAYBE_SUCCESS: Color = Color.Green;
  readonly TRADE_COLOR_MAYBE_FAILED: Color = Color.Red;
  readonly PLAYER_ACTION_COLOR: Color = Color.White;
  readonly OTHER_ACTION_COLOR: Color = Color.Gray;
  readonly SAYOREMOTE_DANGER_COLOR: Color = Color.Brown;
  readonly SAYOREMOTE_NORMAL_COLOR: Color = Color.DarkCyan;
  readonly PLAYER_AUDIO_COLOR: Color = Color.Green;
  readonly NIGHT_COLOR: Color = Color.Cyan;
  readonly DAY_COLOR: Color = Color.Gold;
  readonly TINT_DAY: Color = Color.White;
  readonly TINT_SUNSET: Color = Color.fromArgb(235, 235, 235);
  readonly TINT_EVENING: Color = Color.fromArgb(215, 215, 215);
  readonly TINT_MIDNIGHT: Color = Color.fromArgb(195, 195, 195);
  readonly TINT_NIGHT: Color = Color.fromArgb(205, 205, 205);
  readonly TINT_SUNRISE: Color = Color.fromArgb(225, 225, 225);
  readonly VERB_ACCEPT_THE_DEAL: Verb = new Verb("accept the deal", "accepts the deal");
  readonly VERB_ACTIVATE: Verb = new Verb("activate");
  readonly VERB_AVOID: Verb = new Verb("avoid");
  readonly VERB_BARRICADE: Verb = new Verb("barricade");
  readonly VERB_BASH: Verb = new Verb("bash", "bashes");
  readonly VERB_BE: Verb = new Verb("are", "is");
  readonly VERB_BUILD: Verb = new Verb("build");
  readonly VERB_BREAK: Verb = new Verb("break");
  readonly VERB_BUTCHER: Verb = new Verb("butcher");
  readonly VERB_CATCH: Verb = new Verb("catch", "catches");
  readonly VERB_CHAT_WITH: Verb = new Verb("chat with", "chats with");
  readonly VERB_CLOSE: Verb = new Verb("close");
  readonly VERB_COLLAPSE: Verb = new Verb("collapse");
  readonly VERB_CRUSH: Verb = new Verb("crush", "crushes");
  readonly VERB_DESACTIVATE: Verb = new Verb("desactivate");
  readonly VERB_DESTROY: Verb = new Verb("destroy");
  readonly VERB_DIE: Verb = new Verb("die");
  readonly VERB_DIE_FROM_STARVATION: Verb = new Verb("die from starvation", "dies from starvation");
  readonly VERB_DISARM: Verb = new Verb("disarm");
  readonly VERB_DISCARD: Verb = new Verb("discard");
  readonly VERB_DRAG: Verb = new Verb("drag");
  readonly VERB_DROP: Verb = new Verb("drop");
  readonly VERB_EAT: Verb = new Verb("eat");
  readonly VERB_ENJOY: Verb = new Verb("enjoy");
  readonly VERB_ENTER: Verb = new Verb("enter");
  readonly VERB_ESCAPE: Verb = new Verb("escape");
  readonly VERB_FAIL: Verb = new Verb("fail");
  readonly VERB_FEAST_ON: Verb = new Verb("feast on", "feasts on");
  readonly VERB_FEEL: Verb = new Verb("feel");
  readonly VERB_GET: Verb = new Verb("get");
  readonly VERB_GIVE: Verb = new Verb("give");
  readonly VERB_GRAB: Verb = new Verb("grab");
  readonly VERB_EQUIP: Verb = new Verb("equip");
  readonly VERB_HAVE: Verb = new Verb("have", "has");
  readonly VERB_HELP: Verb = new Verb("help");
  readonly VERB_HEAL_WITH: Verb = new Verb("heal with", "heals with");
  readonly VERB_JUMP_ON: Verb = new Verb("jump on", "jumps on");
  readonly VERB_KILL: Verb = new Verb("kill");
  readonly VERB_LEAVE: Verb = new Verb("leave");
  readonly VERB_MISS: Verb = new Verb("miss", "misses");
  readonly VERB_MURDER: Verb = new Verb("murder");
  readonly VERB_OFFER: Verb = new Verb("offer");
  readonly VERB_OPEN: Verb = new Verb("open");
  readonly VERB_ORDER: Verb = new Verb("order");
  readonly VERB_PERSUADE: Verb = new Verb("persuade");
  readonly VERB_PULL: Verb = new Verb("pull", "pulls");
  readonly VERB_PUSH: Verb = new Verb("push", "pushes");
  readonly VERB_RAISE_ALARM: Verb = new Verb("raise the alarm", "raises the alarm");
  readonly VERB_REFUSE_THE_DEAL: Verb = new Verb("refuse the deal", "refuses the deal");
  readonly VERB_RELOAD: Verb = new Verb("reload");
  readonly VERB_RECHARGE: Verb = new Verb("recharge");
  readonly VERB_REPAIR: Verb = new Verb("repair");
  readonly VERB_REVIVE: Verb = new Verb("revive");
  readonly VERB_SEE: Verb = new Verb("see");
  readonly VERB_SHOUT: Verb = new Verb("shout");
  readonly VERB_SHOVE: Verb = new Verb("shove");
  readonly VERB_SNORE: Verb = new Verb("snore");
  readonly VERB_SPRAY: Verb = new Verb("spray");
  readonly VERB_START: Verb = new Verb("start");
  readonly VERB_STOP: Verb = new Verb("stop");
  readonly VERB_STUMBLE: Verb = new Verb("stumble");
  readonly VERB_SWITCH: Verb = new Verb("switch", "switches");
  readonly VERB_SWITCH_PLACE_WITH: Verb = new Verb("switch place with", "switches place with");
  readonly VERB_TAKE: Verb = new Verb("take");
  readonly VERB_THROW: Verb = new Verb("throw");
  readonly VERB_TRADE: Verb = new Verb("trade");
  readonly VERB_TRANSFORM_INTO: Verb = new Verb("transform into", "transforms into");
  readonly VERB_UNEQUIP: Verb = new Verb("unequip");
  readonly VERB_VOMIT: Verb = new Verb("vomit");
  readonly VERB_WAIT: Verb = new Verb("wait");
  readonly VERB_WAKE_UP: Verb = new Verb("wake up", "wakes up");
  readonly m_UI!: IRogueUI;
  m_Rules!: Rules;
  m_Session!: Session;
  m_HiScoreTable!: HiScoreTable;
  m_MessageManager!: MessageManager;
  m_IsGameRunning: boolean = true;
  m_HasLoadedGame: boolean = false;
  m_Overlays: Overlay[] = [];
  m_Player!: Actor;
  m_PlayerFOV: Set<Point> = new Set<Point>();
  m_MapViewRect!: Rect;
  m_HintAvailableOverlay!: OverlayPopup;
  m_TownGenerator!: BaseTownGenerator;
  m_PlayedIntro!: boolean;
  m_MusicManager!: IMusicManager;
  /** C# `struct CharGen` — a struct is zero-initialized, so the field starts out filled. */
  m_CharGen: CharGen = new CharGen();
  m_Manual: TextFile | null = null;
  m_ManualLine!: number;
  m_GameFactions!: GameFactions;
  m_GameActors!: GameActors;
  m_GameItems!: GameItems;
  m_GameTiles!: GameTiles;
  m_IsPlayerLongWait!: boolean;
  m_IsPlayerLongWaitForcedStop!: boolean;
  m_PlayerLongWaitEnd!: WorldTime;
  m_SimThread!: unknown;
  readonly m_SimStateLock: object = {};
  m_SimThreadDoRun!: boolean;
  m_SimThreadIsWorking!: boolean;
  m_DEBUG_prevAiActor: Actor | null = null;
  m_DEBUG_sameAiActorCount: number = 0;
  m_isBotMode: boolean = false;
  m_botControl: BaseAI | null = null;
  readonly m_botLock: object = {};

  // ── C# `#region Properties` (RogueGame.cs:714) ────────────────────────────

  get session(): Session {
    return this.m_Session;
  }
  /** C# `public Session Session` — used by `game.Session` call sites. */
  get Session(): Session {
    return this.m_Session;
  }

  get rules(): Rules {
    return this.m_Rules;
  }
  /** C# `public Rules Rules` — used by `game.Rules` call sites. */
  get Rules(): Rules {
    return this.m_Rules;
  }

  get ui(): IRogueUI {
    return this.m_UI;
  }
  /** C# `public IRogueUI UI`. */
  get UI(): IRogueUI {
    return this.m_UI;
  }

  get isGameRunning(): boolean {
    return this.m_IsGameRunning;
  }
  set isGameRunning(value: boolean) {
    this.m_IsGameRunning = value;
  }
  /** C# `public bool IsGameRunning`. */
  get IsGameRunning(): boolean {
    return this.m_IsGameRunning;
  }
  set IsGameRunning(value: boolean) {
    this.m_IsGameRunning = value;
  }

  static get options(): GameOptions {
    return s_Options;
  }
  static get keyBindings(): Keybindings {
    return s_KeyBindings;
  }

  get gameFactions(): GameFactions {
    return this.m_GameFactions;
  }
  get GameFactions(): GameFactions {
    return this.m_GameFactions;
  }
  get gameActors(): GameActors {
    return this.m_GameActors;
  }
  get GameActors(): GameActors {
    return this.m_GameActors;
  }
  get gameItems(): GameItems {
    return this.m_GameItems;
  }
  get GameItems(): GameItems {
    return this.m_GameItems;
  }
  get gameTiles(): GameTiles {
    return this.m_GameTiles;
  }
  get GameTiles(): GameTiles {
    return this.m_GameTiles;
  }

  get player(): Actor | null {
    return this.m_Player;
  }
  /** C# `public Actor Player` (null before a game starts). */
  get Player(): Actor | null {
    return this.m_Player;
  }

  get townGenerator(): BaseTownGenerator {
    return this.m_TownGenerator;
  }
  get musicManager(): IMusicManager {
    return this.m_MusicManager;
  }

  // ── C# `#region Init` (RogueGame.cs:781) ──────────────────────────────────

  constructor(UI: IRogueUI, music: IMusicManager = new NullMusicManager()) {
    logInit("RogueGame()");

    this.m_UI = UI;
    logInit("creating MusicManager");
    // C# picks MDX/SFML/NullSoundManager (the C# Null implements both sound+music).
    // The browser passes `WebAudioMusicManager` from main.ts.
    this.m_MusicManager = music;

    logInit("creating MessageManager");
    this.m_MessageManager = new MessageManager(MESSAGES_SPACING, MESSAGES_FADEOUT, MESSAGES_HISTORY);

    this.m_Session = Session.get();
    logInit("creating Rules");
    this.m_Rules = new Rules(new DiceRoller(this.m_Session.seed));

    logInit("creating Generator");
    // C# `Parameters` is a struct copied from DEFAULT_PARAMS — TS needs a new one.
    const genParams = new TownParameters();
    genParams.mapWidth = genParams.mapHeight = MAP_MAX_WIDTH;
    this.m_TownGenerator = new StdTownGenerator(this, genParams);

    logInit("creating options, keys, hints.");
    s_KeyBindings = new Keybindings();
    s_KeyBindings.resetToDefaults();
    s_Hints = new GameHintsStatus();
    s_Hints.resetAllHints();

    logInit("creating dbs");
    this.m_GameFactions = new GameFactions();
    this.m_GameActors = new GameActors();
    this.m_GameItems = new GameItems();
    this.m_GameTiles = new GameTiles();

    logInit("RogueGame() done.");
  }

  /** C# `public static GameOptions Options`. */
  static Options(): GameOptions {
    return s_Options;
  }
  /** C# `public static Keybindings KeyBindings`. */
  static KeyBindings(): Keybindings {
    return s_KeyBindings;
  }

  // ── Method stubs (filled in by later slices) ─────────────────────────

  // C# AddMessage — RogueGame.cs:833
  AddMessage(msg: Message): void {
    // ignore empty messages
    if (msg.text.length === 0) return;

    // Clear if too much messages.
    if (this.m_MessageManager.count >= MAX_MESSAGES) this.m_MessageManager.clear();

    // Format message: <turn> <Text>
    msg.text = `${this.m_Session.worldTime.turnCounter} ${this.Capitalize(msg.text)}`;

    // Add.
    this.m_MessageManager.add(msg);
  }

  // C# AddMessageIfAudibleForPlayer — RogueGame.cs:853
  AddMessageIfAudibleForPlayer(location: Location, msg: Message): void {
    if (msg == null) throw new TypeError("msg");

    // 1. Audible to player?
    if (this.m_Player != null) {
      // if sleeping can't hear.
      if (this.m_Player.isSleeping) return;

      // can't hear if not same map.
      if (location.map !== this.m_Player.location.map) return;

      // can hear if close enough.
      if (this.m_Rules.stdDistance(this.m_Player.location.position, location.position) <= this.m_Player.audioRange) {
        // hear.
        msg.color = this.PLAYER_AUDIO_COLOR;
        this.AddMessage(msg);

        // if waiting, interupt.
        if (this.m_IsPlayerLongWait) this.m_IsPlayerLongWaitForcedStop = true;

        // redraw.
        this.RedrawPlayScreen();
      }
    }
  }

  // C# MakePlayerCentricMessage — RogueGame.cs:892
  MakePlayerCentricMessage(eventText: string, position: Point): Message {
    const playerPos = this.m_Player.location.position;
    const vDir = new Point(position.x - playerPos.x, position.y - playerPos.y);
    const text =
      `${eventText} ${Math.floor(this.m_Rules.stdDistanceOf(vDir))} tiles to the ` +
      `${Direction.approximateFromVector(vDir.x, vDir.y)}.`;
    return new Message(text, this.m_Session.worldTime.turnCounter);
  }

  // C# MakeErrorMessage — RogueGame.cs:899
  MakeErrorMessage(text: string): Message {
    return new Message(text, this.m_Session.worldTime.turnCounter, Color.Red);
  }

  // C# MakeYesNoMessage — RogueGame.cs:904
  MakeYesNoMessage(question: string): Message {
    return new Message(
      `${question}? Y to confirm, N to cancel`,
      this.m_Session.worldTime.turnCounter,
      Color.Yellow
    );
  }

  // C# ActorVisibleIdentity — RogueGame.cs:914
  ActorVisibleIdentity(actor: Actor): string {
    return this.IsVisibleToPlayer(actor) ? actor.theName : "someone";
  }

  // C# ObjectVisibleIdentity — RogueGame.cs:924
  ObjectVisibleIdentity(mapObj: MapObject): string {
    return this.IsVisibleToPlayer(mapObj) ? mapObj.theName : "something";
  }

  // C# MakeMessage — RogueGame.cs:929 (+7 overloads)
  MakeMessage(actor: Actor, doWhat: string): Message;
  MakeMessage(actor: Actor, doWhat: string, color: Color): Message;
  MakeMessage(actor: Actor, doWhat: string, target: Actor, phraseEnd?: string): Message;
  MakeMessage(actor: Actor, doWhat: string, target: MapObject, phraseEnd?: string): Message;
  MakeMessage(actor: Actor, doWhat: string, target: Item, phraseEnd?: string): Message;
  MakeMessage(
    actor: Actor,
    doWhat: string,
    third?: Color | Actor | MapObject | Item,
    phraseEnd?: string
  ): Message {
    const turn = this.m_Session.worldTime.turnCounter;

    if (third === undefined || third instanceof Color) {
      const msg = new Message(`${this.ActorVisibleIdentity(actor)} ${doWhat}`, turn);
      msg.color = actor.isPlayer ? this.PLAYER_ACTION_COLOR : (third ?? this.OTHER_ACTION_COLOR);
      return msg;
    }

    const target = third;
    const targetText =
      target instanceof Actor ? this.ActorVisibleIdentity(target)
      : target instanceof MapObject ? this.ObjectVisibleIdentity(target)
      : target.theName;

    const msg = new Message(
      `${this.ActorVisibleIdentity(actor)} ${doWhat} ${targetText}${phraseEnd ?? "."}`,
      turn
    );
    const involvesPlayer = actor.isPlayer || (target instanceof Actor && target.isPlayer);
    msg.color = involvesPlayer ? this.PLAYER_ACTION_COLOR : this.OTHER_ACTION_COLOR;
    return msg;
  }

  // C# ClearMessages — RogueGame.cs:1022
  ClearMessages(): void {
    this.m_MessageManager.clear();
  }

  // C# ClearMessagesHistory — RogueGame.cs:1027
  ClearMessagesHistory(): void {
    this.m_MessageManager.clearHistory();
  }

  // C# RemoveLastMessage — RogueGame.cs:1032
  RemoveLastMessage(): void {
    this.m_MessageManager.removeLastMessage();
  }

  // C# DrawMessages — RogueGame.cs:1037
  DrawMessages(): void {
    this.m_MessageManager.draw(this.m_UI, this.m_Session.lastTurnPlayerActed, MESSAGES_X, MESSAGES_Y);
  }

  // C# AddMessagePressEnter — RogueGame.cs:1043
  // alpha10.1 caller handle bot : check for IsBotPlayer and dont call this
  async AddMessagePressEnter(): Promise<void> {
    this.AddMessage(new Message("<press ENTER>", this.m_Session.worldTime.turnCounter, Color.Yellow));
    this.RedrawPlayScreen();
    await this.WaitEnter();
    this.RemoveLastMessage();
    this.RedrawPlayScreen();
  }

  // C# Conjugate — RogueGame.cs:1052 (+1 overloads)
  Conjugate(actor: Actor, verb: string): string;
  Conjugate(actor: Actor, verb: Verb): string;
  Conjugate(actor: Actor, verb: string | Verb): string {
    const isSoloSubject = actor.isProperName && !actor.isPluralName;
    if (typeof verb === "string") return isSoloSubject ? verb + "s" : verb;
    return isSoloSubject ? verb.heForm : verb.youForm;
  }

  // C# Capitalize — RogueGame.cs:1062
  Capitalize(text: string): string {
    if (text == null) return "";
    if (text.length === 1) return text[0].toUpperCase();
    return text[0].toUpperCase() + text.substring(1);
  }

  // C# HisOrHer — RogueGame.cs:1072
  HisOrHer(actor: Actor): string {
    return actor.model.dollBody.isMale ? "his" : "her";
  }

  // C# HeOrShe — RogueGame.cs:1077
  HeOrShe(actor: Actor): string {
    return actor.model.dollBody.isMale ? "he" : "she";
  }

  // C# HimOrHer — RogueGame.cs:1082
  HimOrHer(actor: Actor): string {
    return actor.model.dollBody.isMale ? "him" : "her";
  }

  // C# HimselfOrHerself — RogueGame.cs:1088
  HimselfOrHerself(actor: Actor): string {
    return actor.model.dollBody.isMale ? "himself" : "herself";
  }

  // C# AorAn — RogueGame.cs:1096
  AorAn(name: string): string {
    const c = name[0];
    return ("aeiou".indexOf(c) !== -1 ? "an " : "a ") + name;
  }

  // C# TruncateString — RogueGame.cs:1102
  TruncateString(s: string, maxLength: number): string {
    return s.length <= maxLength ? s : s.substring(0, maxLength);
  }

  // C# AnimDelay — RogueGame.cs:1109
  // C# blocks the sim thread; the browser loop awaits this instead.
  async AnimDelay(msecs: number): Promise<void> {
    if (s_Options.isAnimDelayOn) await this.m_UI.UI_Wait(msecs);
  }

  // C# Run — RogueGame.cs:1121
  async Run(): Promise<void> {
    // first run inits.
    await this.InitDirectories();

    // load data.
    await this.LoadData();

    // load options.
    await this.LoadOptions();

    // load hints.
    await this.LoadHints();

    // apply options.
    this.ApplyOptions(false);

    // load keys.
    await this.LoadKeybindings();

    // load music & sfxs.
    this.m_UI.UI_Clear(Color.Black);
    this.m_UI.UI_DrawStringBold(Color.White, "Loading music...", 0, 0);
    this.m_UI.UI_Repaint();
    // C# preloaded every GameMusics/GameSounds file here; the Web Audio
    // manager fetches tracks by id on demand (see WebAudioMusicManager).

    this.m_UI.UI_Clear(Color.Black);
    this.m_UI.UI_DrawStringBold(Color.White, "Loading music... done!", 0, 0);
    this.m_UI.UI_Repaint();

    this.m_UI.UI_Clear(Color.Black);
    this.m_UI.UI_DrawStringBold(Color.White, "Loading sfxs...", 0, 0);
    this.m_UI.UI_Repaint();

    this.m_UI.UI_Clear(Color.Black);
    this.m_UI.UI_DrawStringBold(Color.White, "Loading sfxs... done!", 0, 0);
    this.m_UI.UI_Repaint();

    // load and parse manual.
    await this.LoadManual();

    // load hi score table.
    await this.LoadHiScoreTable();

    // loop.
    while (this.m_IsGameRunning) {
      await this.GameLoop();
    }

    // stop music.
    this.m_MusicManager.stop();

    // quit.
    this.m_UI.UI_DoQuit();
  }

  // C# GameLoop — RogueGame.cs:1209
  async GameLoop(): Promise<void> {
    // main menu.
    await this.HandleMainMenu();

    // play until player dies or quits.
    while (this.m_Player != null && !this.m_Player.isDead && this.m_IsGameRunning) {
      // timer.
      const timeBefore = Date.now();

      // alpha10
      // roll player charisma for this turn
      this.m_Session.player_TurnCharismaRoll = this.m_Rules.roll(0, 100);

      // play.
      this.m_HasLoadedGame = false;
      await this.AdvancePlay(this.m_Session.currentMap!.district!, SimFlags.NOT_SIMULATING);

      // if quit, don't bother.
      if (!this.m_IsGameRunning) break;

      // timer.
      const timeAfter = Date.now();
      this.m_Session.scoring.realLifePlayingTimeSeconds += (timeAfter - timeBefore) / 1000;

      // alpha10
      // check background music every N game hours
      if (this.m_Session.worldTime.turnCounter % BGMUSIC_UPDATE_TURNS === 0) this.UpdateBgMusic();
    }
  }

  // C# InitDirectories — RogueGame.cs:1243
  async InitDirectories(): Promise<void> {
    // Browser port: no user directories. Options/keybindings live in
    // localStorage, saves in IndexedDB (GameSaveManager), the manual and hi
    // scores in bundled/localStorage data — so there is nothing to create.
    logInit("InitDirectories: using browser storage.");
  }

  // C# HandleMainMenu — RogueGame.cs:1283
  async HandleMainMenu(): Promise<void> {
    let loop = true;
    // C#: File.Exists(GetUserSave()) — saves are IndexedDB slots (see GetUserSave).
    const isLoadEnabled = await GameSaveManager.hasSave(RogueGame.CURRENT_SAVE_SLOT);

    const menuEntries: string[] = [
      "New Game",                                    // 0
      isLoadEnabled ? "Load Game" : "(Load Game)",   // 1
      "Redefine keys",                               // 2
      "Options",                                     // 3
      "Game Manual",                                 // 4
      "All Hints",                                   // 5
      "Hi Scores",                                   // 6
      "Credits",                                     // 7
      "Quit Game",                                   // 8
    ];
    let selected = 0;
    do {
      // music.
      if (!this.m_PlayedIntro) {
        this.m_MusicManager.stop();
        this.m_MusicManager.play(GameMusics.INTRO);
        this.m_PlayedIntro = true;
      }

      // display.
      const gx = 0;
      let gy = 0;
      this.m_UI.UI_Clear(Color.Black);
      this.DrawHeader();
      gy += BOLD_LINE_SPACING;
      this.m_UI.UI_DrawStringBold(Color.Yellow, "Main Menu", 0, gy);
      gy += 2 * BOLD_LINE_SPACING;
      const gyRef = { value: gy };
      this.DrawMenuOrOptions(selected, Color.White, menuEntries, Color.White, null, gx, gyRef);
      gy = gyRef.value;
      this.DrawFootnote(Color.White, "cursor to move, ENTER to select");

      // christmas special.
      const dateNow = new Date();
      if (dateNow.getMonth() === 11 && dateNow.getDate() >= 24 && dateNow.getDate() <= 26) {
        const NB_SANTAS = 10;
        for (let i = 0; i < NB_SANTAS; i++) {
          const santax = this.m_Rules.roll(0, 1024);
          const santay = this.m_Rules.roll(0, 768);
          this.m_UI.UI_DrawImage(GameImages.ACTOR_SANTAMAN, santax, santay);
          this.m_UI.UI_DrawStringBold(Color.Snow, "* Merry Christmas *", santax - 60, santay - 10);
        }
      }

      // repaint.
      this.m_UI.UI_Repaint();

      // get menu action.
      const key = await this.m_UI.UI_WaitKey();
      switch (key.key) {
        case "ArrowUp": // move up
          if (selected > 0) --selected;
          else selected = menuEntries.length - 1;
          break;
        case "ArrowDown": // move down
          selected = (selected + 1) % menuEntries.length;
          break;

        case "Enter": // validate
          switch (selected) {
            case 0:
              if (await this.HandleNewCharacter()) {
                await this.StartNewGame();
                loop = false;
              }
              break;

            case 1:
              if (!isLoadEnabled) break;
              gy += 2 * BOLD_LINE_SPACING;
              this.m_UI.UI_DrawStringBold(Color.Yellow, "Loading game, please wait...", gx, gy);
              this.m_UI.UI_Repaint();
              await this.LoadGame(this.GetUserSave());
              loop = false;
              // alpha10
              if (s_Options.isSimON && s_Options.simThread) this.StartSimThread();
              break;

            case 2:
              await this.HandleRedefineKeys();
              break;

            case 3:
              await this.HandleOptions(false);
              this.ApplyOptions(false);
              break;

            case 4:
              await this.HandleHelpMode();
              break;

            case 5:
              await this.HandleHintsScreen();
              break;

            case 6:
              await this.HandleHiScores(true);
              break;

            case 7:
              await this.HandleCredits();
              break;

            case 8:
              this.m_IsGameRunning = false;
              loop = false;
              break;

            default:
              break;
          } // switch selected
          break;
      }
    } while (loop);
  }

  // C# HandleNewCharacter — RogueGame.cs:1415
  async HandleNewCharacter(): Promise<boolean> {
    const roller = new DiceRoller();

    // Reset session
    this.m_Session.reset();

    // Game Mode
    if (!(await this.HandleNewGameMode())) return false;

    // Choose living/undead
    const race = await this.HandleNewCharacterRace(roller, false);
    if (!race.ok) return false;
    this.m_CharGen.isUndead = race.isUndead;

    // Choose gender/undead type
    if (race.isUndead) {
      const undead = await this.HandleNewCharacterUndeadType(roller, ActorID.UNDEAD_MALE_ZOMBIFIED);
      if (!undead.ok) return false;
      this.m_CharGen.undeadModel = undead.modelID;
    } else {
      const gender = await this.HandleNewCharacterGender(roller, true);
      if (!gender.ok) return false;
      this.m_CharGen.isMale = gender.isMale;
    }

    // Choose skill (living only)
    if (!race.isUndead) {
      const skill = await this.HandleNewCharacterSkill(roller, SkillID.AGILE);
      if (!skill.ok) return false;
      this.m_CharGen.startingSkill = skill.skID;
      // scoring : starting skill.
      this.m_Session.scoring.startingSkill = skill.skID;
    } else {
      // undead.
    }

    // done
    return true;
  }

  // C# HandleNewGameMode — RogueGame.cs:1477
  async HandleNewGameMode(): Promise<boolean> {
    const menuEntries: string[] = [
      Session.descGameMode(GameMode.GM_STANDARD),
      Session.descGameMode(GameMode.GM_CORPSES_INFECTION),
      Session.descGameMode(GameMode.GM_VINTAGE),
    ];
    const descs: string[] = [
      "Rogue Survivor standard game.",
      "Don't get a cold. Keep an eye on your deceased diseased friends.",
      "The classic zombies next door.",
    ];

    let loop = true;
    let choiceDone = false;
    let selected = 0;
    do {
      // display.
      this.m_UI.UI_Clear(Color.Black);
      const gx = 0;
      let gy = 0;
      this.m_UI.UI_DrawStringBold(Color.Yellow, "New Game - Choose Game Mode", gx, gy);
      gy += 2 * BOLD_LINE_SPACING;
      const gyRef = { value: gy };
      this.DrawMenuOrOptions(selected, Color.White, menuEntries, Color.LightGray, descs, gx, gyRef);
      gy = gyRef.value;
      gy += 2 * BOLD_LINE_SPACING;

      let descMode: string[] = [];
      switch (selected) {
        case 0:
          descMode = [
            "This is the standard game setting.",
            "Recommended for beginners.",
            "- All the kinds of undeads.",
            "- Undeads can evolve to stronger forms.",
            "- Livings can zombify instantly when dead.",
            "- No infection.",
            "- No corpses.",
          ];
          break;
        case 1:
          descMode = [
            "This is the standard game setting plus corpses and infection.",
            "Recommended to experience all the features of the game.",
            "- All the kinds of undeads.",
            "- Undeads can evolve to stronger forms.",
            "- Infection:",
            "  - some undeads can infect livings when biting them.",
            "  - infected livings can become ill and die.",
            "  - infected corpses have more chances to rise as zombies.",
            "- Corpses:",
            "  - livings that die drop corpses that will rot away.",
            "  - corpses may rise as zombies.",
            "  - undeads can eat corpses.",
            "  - livings can eat corpses if desperate.",
          ];
          break;
        case 2:
          descMode = [
            "This is the classic zombies for hardcore zombie fans.",
            "Recommended if you want classic movies zombies.",
            "- Undeads are only zombified men and women.",
            "- Undeads don't evolve to stronger forms.",
            "- Infection:",
            "  - some undeads can infect livings when biting them.",
            "  - infected livings can become ill and die.",
            "  - infected corpses have more chances to rise as zombies.",
            "- Corpses:",
            "  - livings that die drop corpses that will rot away.",
            "  - corpses may rise as zombies.",
            "  - undeads can eat corpses.",
            "  - livings can eat corpses if desperate.",
            "",
            "NOTE:",
            "This mode force some options OFF.",
            "Remember to set them back ON again when you play other modes!",
          ];
          break;
      }
      for (const str of descMode) {
        this.m_UI.UI_DrawStringBold(Color.Gray, str, gx, gy);
        gy += BOLD_LINE_SPACING;
      }

      this.DrawFootnote(Color.White, "cursor to move, ENTER to select, ESC to cancel");
      this.m_UI.UI_Repaint();

      // get menu action.
      const key = await this.m_UI.UI_WaitKey();
      switch (key.key) {
        case "ArrowUp": // move up
          if (selected > 0) --selected;
          else selected = menuEntries.length - 1;
          break;
        case "ArrowDown": // move down
          selected = (selected + 1) % menuEntries.length;
          break;

        case "Escape":
          choiceDone = false;
          loop = false;
          break;

        case "Enter":
          // validate
          switch (selected) {
            case 0: // standard
              this.m_Session.gameMode = GameMode.GM_STANDARD;
              choiceDone = true;
              loop = false;
              break;

            case 1: // corpses & infection
              this.m_Session.gameMode = GameMode.GM_CORPSES_INFECTION;
              choiceDone = true;
              loop = false;
              break;

            case 2: // vintage
              this.m_Session.gameMode = GameMode.GM_VINTAGE;

              // force some options off.
              s_Options.allowUndeadsEvolution = false;
              s_Options.shamblersUpgrade = false;
              s_Options.ratsUpgrade = false;
              s_Options.skeletonsUpgrade = false;
              this.ApplyOptions(false);

              choiceDone = true;
              loop = false;
              break;
          }
          break;
      }
    } while (loop);

    // done.
    return choiceDone;
  }

  // C# HandleNewCharacterRace — RogueGame.cs:1627
  async HandleNewCharacterRace(roller: DiceRoller, isUndead: boolean): Promise<{ ok: boolean; isUndead: boolean }> {
    const menuEntries: string[] = ["*Random*", "Living", "Undead"];
    const descs: string[] = [
      "(picks a race at random for you)",
      "Try to survive.",
      "Eat brains and die again.",
    ];

    // C# `out bool isUndead` — seeded with the caller's value (C# assigns `false` first).
    let undead = isUndead;
    let loop = true;
    let choiceDone = false;
    let selected = 0;
    do {
      // display.
      this.m_UI.UI_Clear(Color.Black);
      const gx = 0;
      let gy = 0;
      this.m_UI.UI_DrawStringBold(
        Color.Yellow,
        `[${Session.descGameMode(this.m_Session.gameMode)}] New Character - Choose Race`,
        gx,
        gy
      );
      gy += 2 * BOLD_LINE_SPACING;
      const gyRef = { value: gy };
      this.DrawMenuOrOptions(selected, Color.White, menuEntries, Color.LightGray, descs, gx, gyRef);
      gy = gyRef.value;
      gy += 2 * BOLD_LINE_SPACING;

      this.DrawFootnote(Color.White, "cursor to move, ENTER to select, ESC to cancel");
      this.m_UI.UI_Repaint();

      // get menu action.
      const key = await this.m_UI.UI_WaitKey();
      switch (key.key) {
        case "ArrowUp": // move up
          if (selected > 0) --selected;
          else selected = menuEntries.length - 1;
          break;
        case "ArrowDown": // move down
          selected = (selected + 1) % menuEntries.length;
          break;

        case "Escape":
          choiceDone = false;
          loop = false;
          break;

        case "Enter":
          // validate
          switch (selected) {
            case 0: // random
              undead = roller.rollChance(50);

              gy += BOLD_LINE_SPACING;
              this.m_UI.UI_DrawStringBold(Color.White, `Race : ${undead ? "Undead" : "Living"}.`, gx, gy);
              gy += BOLD_LINE_SPACING;
              this.m_UI.UI_DrawStringBold(Color.Yellow, "Is that OK? Y to confirm, N to cancel.", gx, gy);
              this.m_UI.UI_Repaint();
              if (await this.WaitYesOrNo()) {
                choiceDone = true;
                loop = false;
              }
              break;

            case 1: // living
              undead = false;
              choiceDone = true;
              loop = false;
              break;

            case 2: // undead
              undead = true;
              choiceDone = true;
              loop = false;
              break;
          }
          break;
      }
    } while (loop);

    // done.
    return { ok: choiceDone, isUndead: undead };
  }

  // C# HandleNewCharacterGender — RogueGame.cs:1719
  async HandleNewCharacterGender(roller: DiceRoller, isMale: boolean): Promise<{ ok: boolean; isMale: boolean }> {
    const maleModel = this.gameActors.get(ActorID.MALE_CIVILIAN);
    const femaleModel = this.gameActors.get(ActorID.FEMALE_CIVILIAN);

    const menuEntries: string[] = ["*Random*", "Male", "Female"];
    const descs: string[] = [
      "(picks a gender at random for you)",
      `HP:${padZero(maleModel.startingSheet.baseHitPoints, 2)}  Def:${padZero(maleModel.startingSheet.baseDefence.value, 2)}  Dmg:${maleModel.startingSheet.unarmedAttack.damageValue}`,
      `HP:${padZero(femaleModel.startingSheet.baseHitPoints, 2)}  Def:${padZero(femaleModel.startingSheet.baseDefence.value, 2)}  Dmg:${femaleModel.startingSheet.unarmedAttack.damageValue}`,
    ];

    // C# `out bool isMale` — seeded with the caller's value (C# assigns `true` first).
    let male = isMale;
    let loop = true;
    let choiceDone = false;
    let selected = 0;
    do {
      // display.
      this.m_UI.UI_Clear(Color.Black);
      const gx = 0;
      let gy = 0;
      this.m_UI.UI_DrawStringBold(
        Color.Yellow,
        `[${Session.descGameMode(this.m_Session.gameMode)}] New Living - Choose Gender`,
        gx,
        gy
      );
      gy += 2 * BOLD_LINE_SPACING;
      const gyRef = { value: gy };
      this.DrawMenuOrOptions(selected, Color.White, menuEntries, Color.LightGray, descs, gx, gyRef);
      gy = gyRef.value;
      this.DrawFootnote(Color.White, "cursor to move, ENTER to select, ESC to cancel");
      this.m_UI.UI_Repaint();

      // get menu action.
      const key = await this.m_UI.UI_WaitKey();
      switch (key.key) {
        case "ArrowUp": // move up
          if (selected > 0) --selected;
          else selected = menuEntries.length - 1;
          break;
        case "ArrowDown": // move down
          selected = (selected + 1) % menuEntries.length;
          break;

        case "Escape":
          choiceDone = false;
          loop = false;
          break;

        case "Enter":
          // validate
          switch (selected) {
            case 0: // random
              male = roller.rollChance(50);

              gy += BOLD_LINE_SPACING;
              this.m_UI.UI_DrawStringBold(Color.White, `Gender : ${male ? "Male" : "Female"}.`, gx, gy);
              gy += BOLD_LINE_SPACING;
              this.m_UI.UI_DrawStringBold(Color.Yellow, "Is that OK? Y to confirm, N to cancel.", gx, gy);
              this.m_UI.UI_Repaint();
              if (await this.WaitYesOrNo()) {
                choiceDone = true;
                loop = false;
              }
              break;

            case 1: // male
              male = true;
              choiceDone = true;
              loop = false;
              break;

            case 2: // female
              male = false;
              choiceDone = true;
              loop = false;
              break;
          }
          break;
      }
    } while (loop);

    // done.
    return { ok: choiceDone, isMale: male };
  }

  // C# DescribeUndeadModelStatLine — RogueGame.cs:1812
  DescribeUndeadModelStatLine(m: ActorModel): string {
    const sheet = m.startingSheet;
    return (
      `HP:${padZero(sheet.baseHitPoints, 3)}  Spd:${(m.dollBody.speed / 100).toFixed(2)}` +
      `  Atk:${padZero(sheet.unarmedAttack.hitValue, 2)}  Def:${padZero(sheet.baseDefence.value, 2)}` +
      `  Dmg:${padZero(sheet.unarmedAttack.damageValue, 2)}  FoV:${sheet.baseViewRange}` +
      `  Sml:${sheet.baseSmellRating.toFixed(2)}`
    );
  }

  // C# HandleNewCharacterUndeadType — RogueGame.cs:1820
  async HandleNewCharacterUndeadType(
    roller: DiceRoller,
    modelID: ActorID
  ): Promise<{ ok: boolean; modelID: ActorID }> {
    const skeletonModel = this.gameActors.get(ActorID.UNDEAD_SKELETON);
    const shamblerModel = this.gameActors.get(ActorID.UNDEAD_ZOMBIE);
    const maleModel = this.gameActors.get(ActorID.UNDEAD_MALE_ZOMBIFIED);
    const femaleModel = this.gameActors.get(ActorID.UNDEAD_FEMALE_ZOMBIFIED);
    const masterModel = this.gameActors.get(ActorID.UNDEAD_ZOMBIE_MASTER);

    const menuEntries: string[] = [
      "*Random*",
      skeletonModel.name,
      shamblerModel.name,
      maleModel.name,
      femaleModel.name,
      masterModel.name,
    ];
    const descs: string[] = [
      "(picks a type at random for you)",
      this.DescribeUndeadModelStatLine(skeletonModel),
      this.DescribeUndeadModelStatLine(shamblerModel),
      this.DescribeUndeadModelStatLine(maleModel),
      this.DescribeUndeadModelStatLine(femaleModel),
      this.DescribeUndeadModelStatLine(masterModel),
    ];

    // C# `out ActorID modelID` — seeded with the caller's value (C# assigns UNDEAD_MALE_ZOMBIFIED).
    let model = modelID;
    let loop = true;
    let choiceDone = false;
    let selected = 0;
    do {
      // display.
      this.m_UI.UI_Clear(Color.Black);
      const gx = 0;
      let gy = 0;
      this.m_UI.UI_DrawStringBold(
        Color.Yellow,
        `[${Session.descGameMode(this.m_Session.gameMode)}] New Undead - Choose Type`,
        gx,
        gy
      );
      gy += 2 * BOLD_LINE_SPACING;
      const gyRef = { value: gy };
      this.DrawMenuOrOptions(selected, Color.White, menuEntries, Color.LightGray, descs, gx, gyRef);
      gy = gyRef.value;
      this.DrawFootnote(Color.White, "cursor to move, ENTER to select, ESC to cancel");
      this.m_UI.UI_Repaint();

      // get menu action.
      const key = await this.m_UI.UI_WaitKey();
      switch (key.key) {
        case "ArrowUp": // move up
          if (selected > 0) --selected;
          else selected = menuEntries.length - 1;
          break;
        case "ArrowDown": // move down
          selected = (selected + 1) % menuEntries.length;
          break;

        case "Escape":
          choiceDone = false;
          loop = false;
          break;

        case "Enter":
          // validate
          switch (selected) {
            case 0: // random
              selected = roller.roll(0, 5);
              switch (selected) {
                case 0:
                  model = ActorID.UNDEAD_SKELETON;
                  break;
                case 1:
                  model = ActorID.UNDEAD_ZOMBIE;
                  break;
                case 2:
                  model = ActorID.UNDEAD_MALE_ZOMBIFIED;
                  break;
                case 3:
                  model = ActorID.UNDEAD_FEMALE_ZOMBIFIED;
                  break;
                case 4:
                  model = ActorID.UNDEAD_ZOMBIE_MASTER;
                  break;
                default:
                  throw new RangeError("unhandled select " + selected);
              }

              gy += BOLD_LINE_SPACING;
              this.m_UI.UI_DrawStringBold(Color.White, `Type : ${this.gameActors.get(model).name}.`, gx, gy);
              gy += BOLD_LINE_SPACING;
              this.m_UI.UI_DrawStringBold(Color.Yellow, "Is that OK? Y to confirm, N to cancel.", gx, gy);
              this.m_UI.UI_Repaint();
              if (await this.WaitYesOrNo()) {
                choiceDone = true;
                loop = false;
              }
              break;

            case 1: // skeleton
              model = ActorID.UNDEAD_SKELETON;
              choiceDone = true;
              loop = false;
              break;

            case 2: // shambler
              model = ActorID.UNDEAD_ZOMBIE;
              choiceDone = true;
              loop = false;
              break;

            case 3: // male zombified
              model = ActorID.UNDEAD_MALE_ZOMBIFIED;
              this.m_CharGen.isMale = true;
              choiceDone = true;
              loop = false;
              break;

            case 4: // female zombified
              model = ActorID.UNDEAD_FEMALE_ZOMBIFIED;
              this.m_CharGen.isMale = false;
              choiceDone = true;
              loop = false;
              break;

            case 5: // zm
              model = ActorID.UNDEAD_ZOMBIE_MASTER;
              choiceDone = true;
              loop = false;
              break;
          }
          break;
      }
    } while (loop);

    // done.
    return { ok: choiceDone, modelID: model };
  }

  // C# HandleNewCharacterSkill — RogueGame.cs:1952
  async HandleNewCharacterSkill(roller: DiceRoller, skID: SkillID): Promise<{ ok: boolean; skID: SkillID }> {
    // Make table of all skills.
    const allSkills: SkillID[] = new Array<SkillID>(Skills.LAST_LIVING + 1);
    const menuEntries: string[] = new Array<string>(allSkills.length + 1);
    const skillDesc: string[] = new Array<string>(allSkills.length + 1);
    menuEntries[0] = "*Random*";
    skillDesc[0] = "(picks a skill at random for you)";
    for (let i = Skills.FIRST_LIVING; i < Skills.LAST_LIVING + 1; i++) {
      allSkills[i] = i as SkillID;
      menuEntries[i + 1] = Skills.name(allSkills[i]);
      skillDesc[i + 1] = `${Skills.maxSkillLevel(allSkills[i])} max - ${this.DescribeSkillShort(allSkills[i])}`;
    }

    // Loop until choice done
    // C# `out Skills.IDs skID` — seeded with the caller's value (C# assigns _FIRST).
    let skill = skID;
    let loop = true;
    let choiceDone = false;
    let selected = 0;
    do {
      // display.
      this.m_UI.UI_Clear(Color.Black);
      const gx = 0;
      let gy = 0;
      this.m_UI.UI_DrawStringBold(
        Color.Yellow,
        `[${Session.descGameMode(this.m_Session.gameMode)}] New ${this.m_CharGen.isMale ? "Male" : "Female"} Character - Choose Starting Skill`,
        gx,
        gy
      );
      gy += 2 * BOLD_LINE_SPACING;
      const gyRef = { value: gy };
      this.DrawMenuOrOptions(selected, Color.White, menuEntries, Color.LightGray, skillDesc, gx, gyRef);
      gy = gyRef.value;
      this.DrawFootnote(Color.White, "cursor to move, ENTER to select, ESC to cancel");
      this.m_UI.UI_Repaint();

      // get menu action.
      const key = await this.m_UI.UI_WaitKey();
      switch (key.key) {
        case "ArrowUp": // move up
          if (selected > 0) --selected;
          else selected = menuEntries.length - 1;
          break;
        case "ArrowDown": // move down
          selected = (selected + 1) % menuEntries.length;
          break;

        case "Escape":
          choiceDone = false;
          loop = false;
          break;

        case "Enter":
          // validate
          if (selected === 0)
            // random
            skill = Skills.rollLiving(roller);
          else skill = (selected - 1 + Skills.FIRST_LIVING) as SkillID;

          gy += BOLD_LINE_SPACING;
          this.m_UI.UI_DrawStringBold(Color.White, `Skill : ${Skills.name(skill)}.`, gx, gy);
          gy += BOLD_LINE_SPACING;
          this.m_UI.UI_DrawStringBold(Color.Yellow, "Is that OK? Y to confirm, N to cancel.", gx, gy);
          this.m_UI.UI_Repaint();
          if (await this.WaitYesOrNo()) {
            choiceDone = true;
            loop = false;
          }
          break;
      }
    } while (loop);

    // done.
    return { ok: choiceDone, skID: skill };
  }

  // C# LoadManual — RogueGame.cs:2034
  async LoadManual(): Promise<void> {
    this.m_UI.UI_Clear(Color.Black);
    let gy = 0;
    this.m_UI.UI_DrawStringBold(Color.White, "Loading game manual...", 0, 0);
    gy += BOLD_LINE_SPACING;
    this.m_UI.UI_Repaint();

    this.m_Manual = new TextFile();
    this.m_ManualLine = 0;
    if (!(await this.m_Manual.load(this.GetUserManualFilePath()))) {
      // error.
      this.m_UI.UI_DrawStringBold(Color.Red, "Error while loading the manual.", 0, gy);
      gy += BOLD_LINE_SPACING;
      this.m_UI.UI_DrawStringBold(Color.Red, "The manual won't be available ingame.", 0, gy);
      gy += BOLD_LINE_SPACING;
      this.m_UI.UI_Repaint();
      this.DrawFootnote(Color.White, "press ENTER");
      await this.WaitEnter();

      // delete manual.
      this.m_Manual = null;
      return;
    }

    this.m_UI.UI_DrawStringBold(Color.White, "Parsing game manual...", 0, gy);
    gy += BOLD_LINE_SPACING;
    this.m_UI.UI_Repaint();
    this.m_Manual.formatLines(TEXTFILE_CHARS_PER_LINE);

    this.m_UI.UI_Clear(Color.Black);
    this.m_UI.UI_DrawStringBold(Color.White, "Game manual... done!", 0, gy);
    this.m_UI.UI_Repaint();
  }

  // C# HandleHiScores — RogueGame.cs:2072
  async HandleHiScores(saveToTextfile: boolean): Promise<void> {
    const file = saveToTextfile ? new TextFile() : null;

    this.m_UI.UI_Clear(Color.Black);
    let gy = 0;
    this.DrawHeader();
    gy += BOLD_LINE_SPACING;
    this.m_UI.UI_DrawStringBold(Color.Yellow, "Hi Scores", 0, gy);
    gy += BOLD_LINE_SPACING;
    this.m_UI.UI_DrawStringBold(
      Color.White,
      "---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+",
      0,
      gy
    );
    gy += BOLD_LINE_SPACING;

    // display.
    this.m_UI.UI_DrawStringBold(
      Color.White,
      "Rank | Name, Skills, Death       |  Score |Difficulty|Survival|  Kills |Achievm.|      Game Time | Playing time",
      0,
      gy
    );
    gy += BOLD_LINE_SPACING;

    // text.
    if (file) {
      file.append(`ROGUE SURVIVOR ${GAME_VERSION}`);
      file.append("Hi Scores");
      file.append("Rank | Name, Skills, Death       |  Score |Difficulty|Survival|  Kills |Achievm.|      Game Time | Playing time");
    }

    // individual entries.
    for (let i = 0; i < this.m_HiScoreTable.count; i++) {
      // display.
      const rankColor =
        i === 0 ? Color.LightYellow : i === 1 ? Color.LightCyan : i === 2 ? Color.LightGreen : Color.DimGray;
      this.m_UI.UI_DrawStringBold(
        rankColor,
        "------------------------------------------------------------------------------------------------------------------------",
        0,
        gy
      );
      gy += BOLD_LINE_SPACING;
      const hi = this.m_HiScoreTable.get(i);
      const line =
        `${padLeft(i + 1, 3)}. | ${padRight(this.TruncateString(hi.name, 25), 25)} | ${padLeft(hi.totalPoints, 6)}` +
        ` |     ${padLeft(hi.difficultyPercent, 3)}% | ${padLeft(hi.survivalPoints, 6)} | ${padLeft(hi.killPoints, 6)}` +
        ` | ${padLeft(hi.achievementPoints, 6)} | ${padLeft(new WorldTime(hi.turnSurvived).toString(), 14)}` +
        ` | ${this.TimeSpanToString(hi.playingTimeSeconds)}`;
      this.m_UI.UI_DrawStringBold(rankColor, line, 0, gy);
      gy += BOLD_LINE_SPACING;
      this.m_UI.UI_DrawStringBold(rankColor, `     | ${hi.skillsDescription}.`, 0, gy);
      gy += BOLD_LINE_SPACING;
      this.m_UI.UI_DrawStringBold(rankColor, `     | ${hi.death}.`, 0, gy);
      gy += BOLD_LINE_SPACING;

      // text.
      if (file) {
        file.append("------------------------------------------------------------------------------------------------------------------------");
        file.append(line);
        file.append(`     | ${hi.skillsDescription}`);
        file.append(`     | ${hi.death}`);
      }
    }

    // save.
    const textfilePath = this.GetUserHiScoreTextFilePath();
    if (file) file.save(textfilePath);

    // display.
    this.m_UI.UI_DrawStringBold(
      Color.White,
      "---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+",
      0,
      gy
    );
    gy += BOLD_LINE_SPACING;
    if (file) {
      this.m_UI.UI_DrawStringBold(Color.White, textfilePath, 0, gy);
      gy += BOLD_LINE_SPACING;
    }
    this.DrawFootnote(Color.White, "press ESC to leave");
    this.m_UI.UI_Repaint();
    await this.WaitEscape();
  }

  // C# LoadHiScoreTable — RogueGame.cs:2146
  async LoadHiScoreTable(): Promise<void> {
    this.m_UI.UI_Clear(Color.Black);
    this.m_UI.UI_DrawStringBold(Color.White, "Loading hiscores table...", 0, 0);
    this.m_UI.UI_Repaint();

    this.m_HiScoreTable =
      HiScoreTable.load() ?? new HiScoreTable(HiScoreTable.DEFAULT_MAX_ENTRIES);

    this.m_UI.UI_Clear(Color.Black);
    this.m_UI.UI_DrawStringBold(Color.White, "Loading hiscores table... done!", 0, 0);
    this.m_UI.UI_Repaint();
  }

  // C# SaveHiScoreTable — RogueGame.cs:2164
  SaveHiScoreTable(): void {
    this.m_UI.UI_Clear(Color.Black);
    this.m_UI.UI_DrawStringBold(Color.White, "Saving hiscores table...", 0, 0);
    this.m_UI.UI_Repaint();

    HiScoreTable.save(this.m_HiScoreTable);

    this.m_UI.UI_Clear(Color.Black);
    this.m_UI.UI_DrawStringBold(Color.White, "Saving hiscores table... done!", 0, 0);
    this.m_UI.UI_Repaint();
  }

  // C# StartNewGame — RogueGame.cs:2178
  async StartNewGame(): Promise<void> {
    const isUndead = this.m_CharGen.isUndead;

    // generate world.
    this.GenerateWorld(true, s_Options.citySize);

    // scoring : hello there.
    this.m_Session.scoring.addVisit(this.m_Session.worldTime.turnCounter, this.m_Player.location.map!);
    this.m_Session.scoring.addEvent(
      this.m_Session.worldTime.turnCounter,
      `${isUndead ? "Rose in" : "Woke up in"} ${this.m_Player.location.map!.name}.`
    );

    // setup proper scoring mode.
    this.m_Session.scoring.side = isUndead ? DifficultySide.FOR_UNDEAD : DifficultySide.FOR_SURVIVOR;

    // alpha10.1
    // schedule first autosave.
    this.ScheduleNextAutoSave();

    // advisor on?
    // alpha10 not if undead
    if (s_Options.isAdvisorEnabled) {
      this.ClearMessages();
      this.ClearMessagesHistory();
      if (this.m_Player.model.abilities.isUndead) {
        this.AddMessage(
          new Message("The Advisor is enabled but you will get no hint when playing undead.", 0, Color.Red)
        );
      } else {
        this.AddMessage(
          new Message("The Advisor is enabled and will give you hints during the game.", 0, Color.LightGreen)
        );
        this.AddMessage(
          new Message("The hints help a beginner learning the basic controls.", 0, Color.LightGreen)
        );
        this.AddMessage(
          new Message("You can disable the Advisor by going to the Options screen.", 0, Color.LightGreen)
        );
      }
      this.AddMessage(
        new Message(
          `Press ${s_KeyBindings.get(PlayerCommand.OPTIONS_MODE) ?? ""} during the game to change the options.`,
          0,
          Color.LightGreen
        )
      );
      this.AddMessage(new Message("<press ENTER>", 0, Color.Yellow));
      this.RedrawPlayScreen();
      await this.WaitEnter();
    }

    // welcome banner.
    this.ClearMessages();
    this.ClearMessagesHistory();
    this.AddMessage(new Message("*****************************", 0, Color.LightGreen));
    this.AddMessage(new Message("* Welcome to Rogue Survivor *", 0, Color.LightGreen));
    this.AddMessage(new Message("* We hope you like Zombies  *", 0, Color.LightGreen));
    this.AddMessage(new Message("*****************************", 0, Color.LightGreen));
    this.AddMessage(
      new Message(`Press ${s_KeyBindings.get(PlayerCommand.HELP_MODE) ?? ""} for help`, 0, Color.LightGreen)
    );
    this.AddMessage(
      new Message(
        `Press ${s_KeyBindings.get(PlayerCommand.KEYBINDING_MODE) ?? ""} to redefine keys`,
        0,
        Color.LightGreen
      )
    );
    this.AddMessage(new Message("<press ENTER>", 0, Color.Yellow));
    this.RefreshPlayer();
    this.RedrawPlayScreen();
    await this.WaitEnter();

    // wake up!
    this.ClearMessages();
    this.AddMessage(new Message(`${isUndead ? `${this.m_Player.name} rises...` : `${this.m_Player.name} wakes up.`}`, 0, Color.White));
    this.RedrawPlayScreen();

    // alpha10.1 reset/cleanup bot from previous session (C# `#if DEBUG` block — no bot in the browser port).

    // start simulation thread.
    this.StopSimThread(false); // alpha10 stop-start
    this.StartSimThread();
  }

  // C# HandleCredits — RogueGame.cs:2248
  async HandleCredits(): Promise<void> {
    const left = 0;
    const right = 256;
    let gy = 0;

    // music.
    this.m_MusicManager.stop();
    this.m_MusicManager.play(GameMusics.SLEEP);

    // draw.
    this.m_UI.UI_Clear(Color.Black);
    this.DrawHeader();
    gy += BOLD_LINE_SPACING;
    this.m_UI.UI_DrawStringBold(Color.Yellow, "Credits", 0, gy);
    gy += 2 * BOLD_LINE_SPACING;
    this.m_UI.UI_DrawStringBold(Color.White, "Programming, Graphics & Music by Jacques Ruiz (roguedjack) 2018", 0, gy);
    gy += 2 * BOLD_LINE_SPACING;

    this.m_UI.UI_DrawStringBold(Color.White, "Programming", left, gy);
    this.m_UI.UI_DrawString(Color.White, "- C# NET 3.5, Microsoft Visual Studio Community 2017", right, gy);
    gy += BOLD_LINE_SPACING;
    this.m_UI.UI_DrawStringBold(Color.White, "Graphic softwares", left, gy);
    this.m_UI.UI_DrawString(Color.White, "- Inkscape, Paint.NET", right, gy);
    gy += BOLD_LINE_SPACING;
    this.m_UI.UI_DrawStringBold(Color.White, "Sound & Music softwares", left, gy);
    this.m_UI.UI_DrawString(Color.White, "- GuitarPro 7, Audacity", right, gy);
    gy += BOLD_LINE_SPACING;
    this.m_UI.UI_DrawStringBold(Color.White, "Sound samples", left, gy);
    this.m_UI.UI_DrawString(Color.White, "- http://www.sound-fishing.net  http://www.soundsnap.com/", right, gy);

    gy += 2 * BOLD_LINE_SPACING;
    this.m_UI.UI_DrawStringBold(Color.White, "Contact", 0, gy);
    gy += BOLD_LINE_SPACING;
    this.m_UI.UI_DrawString(Color.White, "Email      : roguedjack@yahoo.fr", 0, gy);
    gy += BOLD_LINE_SPACING;
    this.m_UI.UI_DrawString(Color.White, "Blog       : http://roguesurvivor.blogspot.com/", 0, gy);
    gy += BOLD_LINE_SPACING;
    this.m_UI.UI_DrawString(Color.White, "Fans Forum : http://roguesurvivor.proboards.com/", 0, gy);
    gy += BOLD_LINE_SPACING;
    this.m_UI.UI_DrawStringBold(Color.White, "Thanks to the players for their feedback and eagerness to die!", 0, gy);
    gy += BOLD_LINE_SPACING;

    this.DrawFootnote(Color.White, "ESC to leave");
    this.m_UI.UI_Repaint();
    await this.WaitEscape();
  }

  // C# HandleOptions — RogueGame.cs:2295
  // The modal options loop is ported as `ui/OptionsScreen` (Phase 3).
  async HandleOptions(ingame: boolean): Promise<void> {
    await new OptionsScreen(this.m_UI, this.m_MusicManager).run(ingame);
  }

  // C# HandleRedefineKeys — RogueGame.cs:2570
  async HandleRedefineKeys(): Promise<void> {
    const menuEntries: string[] = [
      "Move N",
      "Move NE",
      "Move E",
      "Move SE",
      "Move S",
      "Move SW",
      "Move W",
      "Move NW",
      "Wait",
      "Wait 1 hour",
      "Abandon Game",
      "Advisor Hint",
      "Barricade",
      "Break",
      "Build Large Fortification",
      "Build Small Fortification",
      "City Info",
      "Close",
      "Fire",
      "Give",
      "Help",
      "Hints screen",
      "Negociate Trade",
      "Item 1 slot",
      "Item 2 slot",
      "Item 3 slot",
      "Item 4 slot",
      "Item 5 slot",
      "Item 6 slot",
      "Item 7 slot",
      "Item 8 slot",
      "Item 9 slot",
      "Item 10 slot",
      "Lead",
      "Load Game",
      "Mark Enemies",
      "Messages Log",
      "Options",
      "Order",
      "Pull", // alpha10
      "Push",
      "Quit Game",
      "Redefine Keys",
      "Run",
      "Save Game",
      "Screenshot",
      "Shout",
      "Sleep",
      "Switch Place",
      "Use Exit",
      "Use Spray",
    ];
    // C#'s O_* index constants — one command per menu entry, same order.
    const commands: PlayerCommand[] = [
      PlayerCommand.MOVE_N,
      PlayerCommand.MOVE_NE,
      PlayerCommand.MOVE_E,
      PlayerCommand.MOVE_SE,
      PlayerCommand.MOVE_S,
      PlayerCommand.MOVE_SW,
      PlayerCommand.MOVE_W,
      PlayerCommand.MOVE_NW,
      PlayerCommand.WAIT_OR_SELF,
      PlayerCommand.WAIT_LONG,
      PlayerCommand.ABANDON_GAME,
      PlayerCommand.ADVISOR,
      PlayerCommand.BARRICADE_MODE,
      PlayerCommand.BREAK_MODE,
      PlayerCommand.BUILD_LARGE_FORTIFICATION,
      PlayerCommand.BUILD_SMALL_FORTIFICATION,
      PlayerCommand.CITY_INFO,
      PlayerCommand.CLOSE_DOOR,
      PlayerCommand.FIRE_MODE,
      PlayerCommand.GIVE_ITEM,
      PlayerCommand.HELP_MODE,
      PlayerCommand.HINTS_SCREEN_MODE,
      PlayerCommand.NEGOCIATE_TRADE,
      PlayerCommand.ITEM_SLOT_0,
      PlayerCommand.ITEM_SLOT_1,
      PlayerCommand.ITEM_SLOT_2,
      PlayerCommand.ITEM_SLOT_3,
      PlayerCommand.ITEM_SLOT_4,
      PlayerCommand.ITEM_SLOT_5,
      PlayerCommand.ITEM_SLOT_6,
      PlayerCommand.ITEM_SLOT_7,
      PlayerCommand.ITEM_SLOT_8,
      PlayerCommand.ITEM_SLOT_9,
      PlayerCommand.LEAD_MODE,
      PlayerCommand.LOAD_GAME,
      PlayerCommand.MARK_ENEMIES_MODE,
      PlayerCommand.MESSAGE_LOG,
      PlayerCommand.OPTIONS_MODE,
      PlayerCommand.ORDER_MODE,
      PlayerCommand.PULL_MODE,
      PlayerCommand.PUSH_MODE,
      PlayerCommand.QUIT_GAME,
      PlayerCommand.KEYBINDING_MODE,
      PlayerCommand.RUN_TOGGLE,
      PlayerCommand.SAVE_GAME,
      PlayerCommand.SCREENSHOT,
      PlayerCommand.SHOUT,
      PlayerCommand.SLEEP,
      PlayerCommand.SWITCH_PLACE,
      PlayerCommand.USE_EXIT,
      PlayerCommand.USE_SPRAY,
    ];
    if (commands.length !== menuEntries.length) throw new RangeError("commands/menuEntries length mismatch");

    let loop = true;
    let selected = 0;
    let conflict = false;
    do {
      // check for conflict.
      conflict = s_KeyBindings.checkForConflict();

      // draw
      const values: string[] = commands.map((cmd) => s_KeyBindings.get(cmd) ?? "");

      const gx = 0;
      let gy = 0;
      this.m_UI.UI_Clear(Color.Black);
      this.DrawHeader();
      gy += BOLD_LINE_SPACING;
      this.m_UI.UI_DrawStringBold(Color.Yellow, "Redefine keys", 0, gy);
      gy += BOLD_LINE_SPACING;
      const gyRef = { value: gy };
      this.DrawMenuOrOptions(selected, Color.White, menuEntries, Color.LightGreen, values, gx, gyRef);
      gy = gyRef.value;
      if (conflict) {
        this.m_UI.UI_DrawStringBold(
          Color.Red,
          "Conflicting keys. Please redefine the keys so the commands don't overlap.",
          gx,
          gy
        );
        gy += BOLD_LINE_SPACING;
      }
      this.DrawFootnote(Color.White, "cursor to move, ENTER to rebind a key, ESC to save and leave");
      this.m_UI.UI_Repaint();

      // handle
      // get menu action.
      const key = await this.m_UI.UI_WaitKey();
      switch (key.key) {
        case "ArrowUp": // move up
          if (selected > 0) --selected;
          else selected = menuEntries.length - 1;
          break;
        case "ArrowDown": // move down
          selected = (selected + 1) % menuEntries.length;
          break;

        case "Escape": // leave.
          if (!conflict) {
            loop = false;
          }
          break;

        case "Enter": {
          // rebind
          // say.
          this.m_UI.UI_DrawStringBold(
            Color.Yellow,
            `rebinding ${menuEntries[selected]}, press the new key.`,
            gx,
            gy
          );
          this.m_UI.UI_Repaint();

          // read new key.
          let loopNewKey = true;
          let newKeyData = "";
          do {
            const newKey = await this.m_UI.UI_WaitKey();
            // ignore Shift and Control alone.
            if (newKey.key === "Shift" || newKey.key === "Control") continue;
            // always ignore Alt.
            if (newKey.alt) continue;
            // done!
            newKeyData = Keybindings.makeKey(newKey.key, newKey.ctrl, newKey.alt, newKey.shift);
            loopNewKey = false;
          } while (loopNewKey);

          // bind it.
          s_KeyBindings.set(commands[selected], newKeyData);

          break;
        }
      }
    } while (loop);

    // Save.
    this.SaveKeybindings();
  }

  // C# AdvancePlay — RogueGame.cs:2877 (+1 overloads)
  // C# has two overloads: AdvancePlay(District, SimFlags) — :2877 and
  // AdvancePlay(Map, SimFlags) — :3038. They are split into two private
  // methods here because TS has no overloads by arity only.
  async AdvancePlay(districtOrMap: District | Map, sim: SimFlags): Promise<void> {
    if (districtOrMap instanceof Map) {
      await this.advancePlayMap(districtOrMap, sim);
    } else {
      await this.advancePlayDistrict(districtOrMap, sim);
    }
  }

  /** C# `AdvancePlay(District district, SimFlags sim)` — RogueGame.cs:2877. */
  private async advancePlayDistrict(district: District, sim: SimFlags): Promise<void> {
    // lock (district)  // alpha10 lock district — the browser port is single threaded.

    // 0. Remember if current district.
    const wasNight = this.m_Session.worldTime.isNight;
    const prevPhase = this.m_Session.worldTime.phase;

    // 1. Advance all maps.
    // if player quit/loaded at any time, don't bother!
    for (const map of district.maps) {
      const prevLocalTurn = map.localTime.turnCounter;
      do {
        // play this map.
        await this.AdvancePlay(map, sim);
        // check for reincarnation.
        if (this.m_Player.isDead) await this.HandleReincarnation();
        // check stopping game.
        if (!this.m_IsGameRunning || this.m_HasLoadedGame || this.m_Player.isDead) return;
      } while (map.localTime.turnCounter === prevLocalTurn);
    }

    // 2. Advance district.
    // 2.1. Advance world time if current district.
    // alpha10 also check weather change
    if (district === this.m_Session.currentMap?.district) {
      this.m_Session.worldTime.turnCounter++;

      // sunrise/sunset.
      const canSeeSky = this.m_Rules.canActorSeeSky(this.m_Player);  // alpha10 message ony if can see sky
      const isNight = this.m_Session.worldTime.isNight;
      const newPhase = this.m_Session.worldTime.phase;
      if (wasNight && !isNight) {
        if (canSeeSky) this.AddMessage(new Message("The sun is rising again for you...", this.m_Session.worldTime.turnCounter, this.DAY_COLOR));
        await this.OnNewDay();
      } else if (!wasNight && isNight) {
        if (canSeeSky) this.AddMessage(new Message("Night is falling upon you...", this.m_Session.worldTime.turnCounter, this.NIGHT_COLOR));
        await this.OnNewNight();
      } else if (prevPhase !== newPhase) {
        if (canSeeSky) {
          this.AddMessage(
            new Message(`Time passes, it is now ${this.DescribeDayPhase(newPhase)}...`, this.m_Session.worldTime.turnCounter, isNight ? this.NIGHT_COLOR : this.DAY_COLOR)
          );
        }
      }

      // alpha10
      // if time to change weather do it and roll next change time.
      if (this.m_Session.worldTime.turnCounter >= this.m_Session.world!.nextWeatherCheckTurn) {
        this.ChangeWeather();
        this.m_Session.world!.nextWeatherCheckTurn =
          this.m_Session.worldTime.turnCounter + this.m_Rules.roll(WEATHER_MIN_DURATION, WEATHER_MAX_DURATION);
      }
    }

    // 2.2. Check for events.
    // C# assumes EntryMap/SewersMap are never null there; the TS types allow
    // null so the calls are guarded.

    // Entry/Surface map
    const entryMap = district.entryMap;
    if (entryMap !== null) {
      // 1 Invasion?
      if (this.CheckForEvent_ZombieInvasion(entryMap)) await this.FireEvent_ZombieInvasion(entryMap);
      // 2 Refugees?
      if (this.CheckForEvent_RefugeesWave(entryMap)) await this.FireEvent_RefugeesWave(district);
      // 3 National guard?
      if (this.CheckForEvent_NationalGuard(entryMap)) await this.FireEvent_NationalGuard(entryMap);
      // 4 Army drop supplies?
      if (this.CheckForEvent_ArmySupplies(entryMap)) await this.FireEvent_ArmySupplies(entryMap);
      // 5 Bikers raid?
      if (this.CheckForEvent_BikersRaid(entryMap)) await this.FireEvent_BikersRaid(entryMap);
      // 6 Gangsta raid?
      if (this.CheckForEvent_GangstasRaid(entryMap)) await this.FireEvent_GangstasRaid(entryMap);
      // 7 Blackops raid?
      if (this.CheckForEvent_BlackOpsRaid(entryMap)) await this.FireEvent_BlackOpsRaid(entryMap);
      // 8 Band of Survivors?
      if (this.CheckForEvent_BandOfSurvivors(entryMap)) await this.FireEvent_BandOfSurvivors(entryMap);
    }

    // Sewers
    // 1 Sewers Invasion?
    const sewersMap = district.sewersMap;
    if (sewersMap !== null) {
      if (this.CheckForEvent_SewersInvasion(sewersMap)) await this.FireEvent_SewersInvasion(sewersMap);
    }

    // DISABLED Subway — C# wraps this in `#if false`.
    // if (district.subwayMap !== null && this.CheckForEvent_SubwayInvasion(district.subwayMap)) {
    //   await this.FireEvent_SubwayInvasion(district.subwayMap);
    // }

    // 3. Simulate nearby districts?
    // if player is sleeping in this map and option enabled.
    if (
      s_Options.isSimON &&
      this.m_Player !== null &&
      this.m_Player.isSleeping &&
      s_Options.simulateWhenSleeping &&
      this.m_Player.location.map?.district === district
    ) {
      await this.SimulateNearbyDistricts(district);
    }
  } // end lock district

  /** C# `AdvancePlay(Map map, SimFlags sim)` — RogueGame.cs:3038. */
  private async advancePlayMap(map: Map, sim: SimFlags): Promise<void> {
    //////////////////////////////////////////////////////////
    // 0. Secret maps.
    // 1. Get next actor to Act.
    // 2. If none move to next turn and return.
    // 3. Ask actor to act. Handle player and AI differently.
    //////////////////////////////////////////////////////////

    // 0. Secret maps.
    if (map.isSecret) {
      // don't play the map at all, jump in time.
      map.localTime.turnCounter++;
      return;
    }

    // 1. Get next actor to Act.
    const actor = this.m_Rules.getNextActorToAct(map, map.localTime.turnCounter);

    // alpha10 ai loop bug detection
    if (actor !== null && !actor.isPlayer) {
      if (actor === this.m_DEBUG_prevAiActor) {
        if (++this.m_DEBUG_sameAiActorCount >= DEBUG_AI_ACTOR_LOOP_COUNT_WARNING) {
          // TO DEVS: you might want to add a debug breakpoint here ->
          //Logger.WriteLine(Logger.Stage.RUN_MAIN, "WARNING: AI actor " + actor.Name + " is probably looping!!");
          // C# `#if DEBUG` kept looping for debugging; `#else` (release, this build)
          // force the AI to spend a turn and emote. its better than crashing the game!
          this.DoWait(actor);
          this.DoEmote(actor, "My AI is looping, I'll  wait instead of crashing your game :)", true);
        }
      } else {
        this.m_DEBUG_sameAiActorCount = 0;
        this.m_DEBUG_prevAiActor = actor;
      }
    }

    // 2. If none move to next turn and return.
    if (actor === null) {
      await this.NextMapTurn(map, sim);
      return;
    }

    // 3. Ask actor to act. Handle player and AI differently.
    actor.previousStaminaPoints = actor.staminaPoints;
    if (actor.controller === null) {
      this.SpendActorActionPoints(actor, Rules.BASE_ACTION_COST);
    } else if (actor.isPlayer) {
      await this.HandlePlayerActor(actor);
      // if quit, dead or loaded, don't bother.
      if (!this.m_IsGameRunning || this.m_HasLoadedGame || this.m_Player.isDead) return;
      // Check special player events
      await this.CheckSpecialPlayerEventsAfterAction(actor);
    } else {
      await this.HandleAiActor(actor);
    }
    actor.previousHitPoints = actor.hitPoints;
    actor.previousFoodPoints = actor.foodPoints;
    actor.previousSleepPoints = actor.sleepPoints;
    actor.previousSanity = actor.sanity;
  }

  // C# NotifyOrderablesAI — RogueGame.cs:3027
  NotifyOrderablesAI(map: Map, raid: RaidType, position: Point): void {
    for (const a of map.actors) {
      if (!(a.controller instanceof OrderableAI)) continue;
      a.controller.onRaid(raid, new Location(map, position), map.localTime.turnCounter);
    }
  }

  // C# SpendActorActionPoints — RogueGame.cs:3124
  SpendActorActionPoints(actor: Actor, actionCost: number): void {
    actor.actionPoints -= actionCost;
    actor.lastActionTurn = actor.location.map!.localTime.turnCounter;
  }

  // C# SpendActorStaminaPoints — RogueGame.cs:3130
  SpendActorStaminaPoints(actor: Actor, staminaCost: number): void {
    if (actor.model.abilities.canTire) {
      // night penalty?
      if (actor.location.map!.localTime.isNight && staminaCost > 0) staminaCost += this.m_Rules.nightStaminaPenalty(actor);

      // exhausted?
      if (this.m_Rules.isActorExhausted(actor)) staminaCost *= 2;

      // apply.
      actor.staminaPoints -= staminaCost;
    } else {
      actor.staminaPoints = Rules.STAMINA_INFINITE;
    }
  }

  // C# RegenActorStaminaPoints — RogueGame.cs:3149
  RegenActorStaminaPoints(actor: Actor, staminaRegen: number): void {
    if (actor.model.abilities.canTire) {
      actor.staminaPoints = Math.min(this.m_Rules.actorMaxSTA(actor), actor.staminaPoints + staminaRegen);
    } else {
      actor.staminaPoints = Rules.STAMINA_INFINITE;
    }
  }

  // C# RegenActorHitPoints — RogueGame.cs:3157
  RegenActorHitPoints(actor: Actor, hpRegen: number): void {
    actor.hitPoints = Math.min(this.m_Rules.actorMaxHPs(actor), actor.hitPoints + hpRegen);
  }

  // C# RegenActorSleep — RogueGame.cs:3162
  RegenActorSleep(actor: Actor, sleepRegen: number): void {
    actor.sleepPoints = Math.min(this.m_Rules.actorMaxSleep(actor), actor.sleepPoints + sleepRegen);
  }

  // C# SpendActorSanity — RogueGame.cs:3167
  SpendActorSanity(actor: Actor, sanCost: number): void {
    actor.sanity -= sanCost;
    if (actor.sanity < 0) actor.sanity = 0;
  }

  // C# RegenActorSanity — RogueGame.cs:3173
  RegenActorSanity(actor: Actor, sanRegen: number): void {
    actor.sanity = Math.min(this.m_Rules.actorMaxSanity(actor), actor.sanity + sanRegen);
  }

  // C# NextMapTurn — RogueGame.cs:3178
  // async: C# blocks on AddMessagePressEnter/AnimDelay (infection messages,
  // corpse/zombie announcements) — those are awaitable in the port.
  async NextMapTurn(map: Map, sim: SimFlags): Promise<void> {
    const isLoDetail = (sim & SimFlags.LODETAIL_TURN) !== 0;

    if (!isLoDetail) {
      // 0. Raise the deads; Check infections (non STD)
      const hasCorpses = Rules.hasCorpses(this.m_Session.gameMode);
      const hasInfection = Rules.hasInfection(this.m_Session.gameMode);
      if (hasCorpses || hasInfection) {
        // Corpses
        if (hasCorpses && map.countCorpses > 0) {
          // decide who zombify or rots.
          const tryZombifyCorpses: Corpse[] = [];
          const rottenCorpses: Corpse[] = [];
          for (const c of map.corpses) {
            // zombify?
            const chanceZombify = this.m_Rules.corpseZombifyChance(c, map.localTime);
            if (this.m_Rules.rollChance(chanceZombify)) {
              // zombify this one.
              tryZombifyCorpses.push(c);
              continue;
            }
            // or rot away?
            this.InflictDamageToCorpse(c, Rules.corpseDecayPerTurn(c));
            if (c.hitPoints <= 0) {
              rottenCorpses.push(c);
              continue;
            }
          }
          // zombify!
          if (tryZombifyCorpses.length > 0) {
            const zombifiedCorpses: Corpse[] = [];
            for (const c of tryZombifyCorpses) {
              // only one actor per tile!
              if (map.getActorAtPoint(c.position) === null) {
                // C# also computed a `zombifiedHP` from corpse state here but never used it.
                zombifiedCorpses.push(c);
                await this.Zombify(null, c.deadGuy, false);

                if (this.IsVisibleToPlayer(map, c.position)) {
                  this.AddMessage(new Message(`The corpse of ${c.deadGuy.name} rise again!!`, map.localTime.turnCounter, Color.Red));
                  // FIXME --
                  // alpha10 this will be a sfx not music (PRIORITY_EVENT dropped: IMusicManager has no priorities)
                  this.m_MusicManager.play(GameSounds.UNDEAD_RISE);
                }
              }
            }
            for (const c of zombifiedCorpses) this.DestroyCorpse(c, map);
          }
          // rot! (message only)
          if (this.m_Player !== null && this.m_Player.location.map === map) {
            for (const c of rottenCorpses) {
              this.DestroyCorpse(c, map);
              if (this.IsVisibleToPlayer(map, c.position)) {
                this.AddMessage(new Message(`The corpse of ${c.deadGuy.name} turns into dust.`, map.localTime.turnCounter, Color.Purple));
              }
            }
          }
        }

        // Infection effects
        if (hasInfection) {
          let infectedToKill: Actor[] | null = null;
          for (const a of map.actors) {
            if (a.infection >= Rules.INFECTION_LEVEL_1_WEAK && !a.model.abilities.isUndead) {
              const infectionP = this.m_Rules.actorInfectionPercent(a);

              if (this.m_Rules.roll(0, 1000) < this.m_Rules.infectionEffectTriggerChance1000(infectionP)) {
                const isVisible = this.IsVisibleToPlayer(a);
                const isPlayer = a.isPlayer;  // alpha10.1 consistency fix
                const isBot = a.isBotPlayer;  // alpha10.1 handle bot

                // if sleeping, wake up.
                if (a.isSleeping) this.DoWakeUp(a);

                // apply effect.
                let killHim = false;
                if (infectionP >= Rules.INFECTION_LEVEL_5_DEATH) {
                  killHim = true;
                } else if (infectionP >= Rules.INFECTION_LEVEL_4_BLEED) {
                  this.DoVomit(a);
                  a.hitPoints -= Rules.INFECTION_LEVEL_4_BLEED_HP;
                  if (isVisible) {
                    if (isPlayer) this.ClearMessages();
                    this.AddMessage(this.MakeMessage(a, `${this.Conjugate(a, this.VERB_VOMIT)} blood.`, Color.Purple));
                    if (isPlayer && !isBot) {
                      await this.AddMessagePressEnter();
                      this.ClearMessages();
                    }
                  }
                  if (a.hitPoints <= 0) killHim = true;
                } else if (infectionP >= Rules.INFECTION_LEVEL_3_VOMIT) {
                  this.DoVomit(a);
                  if (isVisible) {
                    if (isPlayer) this.ClearMessages();
                    this.AddMessage(this.MakeMessage(a, `${this.Conjugate(a, this.VERB_VOMIT)}.`, Color.Purple));
                    if (isPlayer && !isBot) {
                      await this.AddMessagePressEnter();
                      this.ClearMessages();
                    }
                  }
                } else if (infectionP >= Rules.INFECTION_LEVEL_2_TIRED) {
                  this.SpendActorStaminaPoints(a, Rules.INFECTION_LEVEL_2_TIRED_STA);
                  a.sleepPoints -= Rules.INFECTION_LEVEL_2_TIRED_SLP;
                  if (a.sleepPoints < 0) a.sleepPoints = 0;
                  if (isVisible) {
                    if (isPlayer) this.ClearMessages();
                    this.AddMessage(this.MakeMessage(a, `${this.Conjugate(a, this.VERB_FEEL)} sick and tired.`, Color.Purple));
                    if (isPlayer && !isBot) {
                      await this.AddMessagePressEnter();
                      this.ClearMessages();
                    }
                  }
                } else if (infectionP >= Rules.INFECTION_LEVEL_1_WEAK) {
                  this.SpendActorStaminaPoints(a, Rules.INFECTION_LEVEL_1_WEAK_STA);
                  if (isVisible) {
                    if (isPlayer) this.ClearMessages();
                    this.AddMessage(this.MakeMessage(a, `${this.Conjugate(a, this.VERB_FEEL)} sick and weak.`, Color.Purple));
                    if (isPlayer && !isBot) {
                      await this.AddMessagePressEnter();
                      this.ClearMessages();
                    }
                  }
                }

                // if it kills him, remember.
                if (killHim) {
                  if (infectedToKill === null) infectedToKill = [];
                  infectedToKill.push(a);
                }
              } // trigged effect
            } // is infected
          } // each actor

          // kill infected to kill (duh)
          if (infectedToKill !== null) {
            for (const a of infectedToKill) {
              if (this.IsVisibleToPlayer(a)) this.AddMessage(this.MakeMessage(a, `${this.Conjugate(a, this.VERB_DIE)} of infection!`));
              await this.KillActor(null, a, "infection");
              // if player, force zombify NOW.
              if (a.isPlayer) {
                // remove player corpse!
                map.tryRemoveCorpseOf(a);
                // zombify player!
                await this.Zombify(null, a, false);

                // show
                this.AddMessage(this.MakeMessage(a, `${this.Conjugate(a, "turn")} into a Zombie!`));
                this.RedrawPlayScreen();
                await this.AnimDelay(DELAY_LONG);
              }
            }
          }
        }
      } // non STD game.

      // 1. Update odors.
      // alpha10 obsolete     1.1 Odor suppression/generation.

      //      1.2 Odors decay.
      let scentGarbage: OdorScent[] | null = null;

      // decay map scents
      for (const scent of map.scents) {
        // alpha10
        const decay = this.m_Rules.odorsDecay(map, scent.position, this.m_Session.weather);

        // decay.
        map.modifyScentAt(scent.odor, -decay, scent.position);

        // garbage?
        if (scent.strength < OdorScent.MIN_STRENGTH) {
          if (scentGarbage === null) scentGarbage = [];
          scentGarbage.push(scent);
        }
      }
      if (scentGarbage !== null) {
        for (const scent of scentGarbage) map.removeScent(scent);
      }

      //      1.3 Actors scents.
      for (const actor of map.actors) {
        // alpha10
        this.DropActorScents(actor);
        this.DecayActorScents(actor);
      }

      // 2. Regen actors AP & STA
      // regen.
      for (const actor of map.actors) {
        if (!actor.isSleeping) actor.actionPoints += this.m_Rules.actorSpeed(actor);

        if (actor.staminaPoints < this.m_Rules.actorMaxSTA(actor)) this.RegenActorStaminaPoints(actor, Rules.STAMINA_REGEN_PER_TURN);
      }
      // reset actor index.
      map.checkNextActorIndex = 0;

      // 3. Stop tired actors from running.
      for (const actor of map.actors) {
        if (actor.isRunning) {
          if (actor.staminaPoints < Rules.STAMINA_MIN_FOR_ACTIVITY) {
            actor.isRunning = false;
            if (actor === this.m_Player) {
              this.AddMessage(this.MakeMessage(actor, `${this.Conjugate(actor, this.VERB_BE)} too tired to continue running!`));
              this.RedrawPlayScreen();
            }
          }
        }
      }

      // 4. Actor gauges & states
      let actorsStarvedToDeath: Actor[] | null = null;
      for (const actor of map.actors) {
        // hunger && rot.
        if (actor.model.abilities.hasToEat) {
          // food points loss.
          --actor.foodPoints;
          if (actor.foodPoints < 0) actor.foodPoints = 0;

          // May kill starved actors.
          if (this.m_Rules.isActorStarving(actor)) {
            // kill him?
            if (this.m_Rules.rollChance(Rules.FOOD_STARVING_DEATH_CHANCE)) {
              if (actor.isPlayer || s_Options.nPCCanStarveToDeath) {
                if (actorsStarvedToDeath === null) actorsStarvedToDeath = [];
                actorsStarvedToDeath.push(actor);
              }
            }
          }
        } else if (actor.model.abilities.isRotting) {
          // rot.
          --actor.foodPoints;
          if (actor.foodPoints < 0) actor.foodPoints = 0;

          // rot effects.
          if (this.m_Rules.isRottingActorStarving(actor)) {
            // loose 1 HP.
            if (this.m_Rules.roll(0, 1000) < Rules.ROT_STARVING_HP_CHANCE) {
              if (this.IsVisibleToPlayer(actor)) {
                this.AddMessage(this.MakeMessage(actor, "is rotting away."));
              }
              if (--actor.hitPoints <= 0) {
                if (actorsStarvedToDeath === null) actorsStarvedToDeath = [];
                actorsStarvedToDeath.push(actor);
              }
            }
          } else if (this.m_Rules.isRottingActorHungry(actor)) {
            // loose a skill.
            if (this.m_Rules.roll(0, 1000) < Rules.ROT_HUNGRY_SKILL_CHANCE) this.DoLooseRandomSkill(actor);
          }
        }

        // sleep.
        if (actor.model.abilities.hasToSleep) {
          // sleep vs sleep points loss.
          if (actor.isSleeping) {
            // sleeping.
            // nightmare?
            if (this.m_Rules.isActorDisturbed(actor) && this.m_Rules.rollChance(Rules.SANITY_NIGHTMARE_CHANCE)) {
              // wake up, shout, lose sleep and sta.
              this.DoWakeUp(actor);
              await this.DoShout(actor, "NO! LEAVE ME ALONE!");
              actor.sleepPoints -= Rules.SANITY_NIGHTMARE_SLP_LOSS;
              if (actor.sleepPoints < 0) actor.sleepPoints = 0;
              this.SpendActorSanity(actor, Rules.SANITY_NIGHTMARE_SAN_LOSS);
              this.SpendActorStaminaPoints(actor, Rules.SANITY_NIGHTMARE_STA_LOSS);
              // msg.
              if (this.IsVisibleToPlayer(actor)) {
                this.AddMessage(this.MakeMessage(actor, `${this.Conjugate(actor, this.VERB_WAKE_UP)} from a horrible nightmare!`));
              }
              // if player, sfx.
              if (actor.isPlayer) {
                // FIXME replace with sfx
                // alpha10
                this.m_MusicManager.stop();
                this.m_MusicManager.play(GameSounds.NIGHTMARE);
              }
            }
          } else {
            // awake.
            --actor.sleepPoints;
            if (map.localTime.isNight) --actor.sleepPoints;
            if (actor.sleepPoints < 0) actor.sleepPoints = 0;
          }

          //      4.2 Handle sleeping actors.
          if (actor.isSleeping) {
            const isOnCouch = this.m_Rules.isOnCouch(actor);
            // activity.
            actor.activity = Activity.SLEEPING;

            // regen sleep pts.
            const sleepRegen = this.m_Rules.actorSleepRegen(actor, isOnCouch);
            actor.sleepPoints += sleepRegen;
            actor.sleepPoints = Math.min(actor.sleepPoints, this.m_Rules.actorMaxSleep(actor));

            // heal?
            if (actor.hitPoints < this.m_Rules.actorMaxHPs(actor)) {
              let healChance = isOnCouch ? Rules.SLEEP_ON_COUCH_HEAL_CHANCE : 0;
              healChance += this.m_Rules.actorHealChanceBonus(actor);
              if (this.m_Rules.rollChance(healChance)) this.RegenActorHitPoints(actor, Rules.SLEEP_HEAL_HITPOINTS);
            }

            // wake up?
            // wake up if hungry or fully slept.
            const wakeUp = this.m_Rules.isActorHungry(actor) || actor.sleepPoints >= this.m_Rules.actorMaxSleep(actor);
            if (wakeUp) {
              this.DoWakeUp(actor);
            } else {
              if (actor.isPlayer) {
                // check music.
                // C# compared m_MusicManager.Music != GameMusics.SLEEP before PlayLooping(SLEEP);
                // IMusicManager.play() already ignores the track it is already playing.
                this.m_MusicManager.play(GameMusics.SLEEP);
                // message.
                this.AddMessage(new Message("...zzZZZzzZ...", map.localTime.turnCounter, Color.DarkCyan));
                this.RedrawPlayScreen();
                // give some time to sim thread.
                // C#: if (s_Options.SimThread) Thread.Sleep(10); — no sim thread in the browser.
              } else if (this.m_Rules.rollChance(MESSAGE_NPC_SLEEP_SNORE_CHANCE) && this.IsVisibleToPlayer(actor)) {
                this.AddMessage(this.MakeMessage(actor, `${this.Conjugate(actor, this.VERB_SNORE)}.`));
                this.RedrawPlayScreen();
              }
            }
          }

          //      4.3 Exhausted actors might collapse.
          if (this.m_Rules.isActorExhausted(actor)) {
            if (this.m_Rules.rollChance(Rules.SLEEP_EXHAUSTION_COLLAPSE_CHANCE)) {
              // do it
              this.DoStartSleeping(actor);

              // message.
              if (this.IsVisibleToPlayer(actor)) {
                this.AddMessage(this.MakeMessage(actor, `${this.Conjugate(actor, this.VERB_COLLAPSE)} from exhaustion !!`));
                this.RedrawPlayScreen();
              }

              // player?
              if (actor === this.m_Player) {
                this.UpdatePlayerFOV(this.m_Player);
                this.ComputeViewRect(this.m_Player.location.position);
                this.RedrawPlayScreen();
              }
            }
          }
        }

        // sanity.
        if (actor.model.abilities.hasSanity) {
          // sanity loss.
          if (--actor.sanity <= 0) actor.sanity = 0;
        }

        // leader trust & leader/follower bond.
        const leader = actor.leader;
        if (actor.hasLeader && leader !== null) {
          // trust.
          this.ModifyActorTrustInLeader(actor, this.m_Rules.actorTrustIncrease(leader), false);
          // bond with leader.
          if (this.m_Rules.hasActorBondWith(actor, leader) && this.m_Rules.rollChance(Rules.SANITY_RECOVER_BOND_CHANCE)) {
            this.RegenActorSanity(actor, Rules.SANITY_RECOVER_BOND);
            this.RegenActorSanity(leader, Rules.SANITY_RECOVER_BOND);
            if (this.IsVisibleToPlayer(actor)) {
              this.AddMessage(this.MakeMessage(actor, `${this.Conjugate(actor, this.VERB_FEEL)} reassured knowing ${leader.name} is with ${this.HimOrHer(actor)}.`));
            }
            if (this.IsVisibleToPlayer(leader)) {
              this.AddMessage(this.MakeMessage(leader, `${this.Conjugate(leader, this.VERB_FEEL)} reassured knowing ${actor.name} is with ${this.HimOrHer(leader)}.`));
            }
          }
        }
      }

      // Kill (zombify) starved actors.
      if (actorsStarvedToDeath !== null) {
        for (const actor of actorsStarvedToDeath) {
          // message.
          if (this.IsVisibleToPlayer(actor)) {
            this.AddMessage(this.MakeMessage(actor, `${this.Conjugate(actor, this.VERB_DIE_FROM_STARVATION)} !!`));
            this.RedrawPlayScreen();
          }

          // kill.
          await this.KillActor(null, actor, "starvation");

          // zombify?
          if (
            !actor.model.abilities.isUndead &&
            Rules.hasImmediateZombification(this.m_Session.gameMode) &&
            this.m_Rules.rollChance(s_Options.starvedZombificationChance)
          ) {
            // remove morpse!
            map.tryRemoveCorpseOf(actor);
            // zombify!
            await this.Zombify(null, actor, false);
            // show.
            if (this.IsVisibleToPlayer(actor)) {
              this.AddMessage(this.MakeMessage(actor, `${this.Conjugate(actor, "turn")} into a Zombie!`));
              this.RedrawPlayScreen();
              await this.AnimDelay(DELAY_LONG);
            }
          }
        }
      }

      // 5. Check batteries : lights, trackers.
      for (const actor of map.actors) {
        const leftItem = actor.getEquippedItem(DollPart.LEFT_HAND);
        if (leftItem === null) continue;

        // light?
        if (leftItem instanceof ItemLight) {
          if (leftItem.batteries > 0) {
            --leftItem.batteries;
            if (leftItem.batteries <= 0) {
              if (this.IsVisibleToPlayer(actor)) {
                this.AddMessage(this.MakeMessage(actor, `: ${leftItem.theName} light goes off.`));
              }
            }
          }
          continue;
        }

        // tracker?
        if (leftItem instanceof ItemTracker) {
          if (leftItem.batteries > 0) {
            --leftItem.batteries;
            if (leftItem.batteries <= 0) {
              if (this.IsVisibleToPlayer(actor)) {
                this.AddMessage(this.MakeMessage(actor, `: ${leftItem.theName} goes off.`));
              }
            }
          }
          continue;
        }
      }

      // 6. Check explosives.
      // 6.1 Update fuses.
      let hasExplosivesToExplode = false;
      // on ground.
      for (const groundInv of map.groundInventories) {
        // update each explosive fuse there,
        // remember which should explode.
        for (const it of groundInv.items) {
          if (!(it instanceof ItemGrenadePrimed)) continue;

          // primed explosive, burn fuse.
          --it.fuseTimeLeft;
          if (it.fuseTimeLeft <= 0) hasExplosivesToExplode = true;
        }
      }

      // on actors.
      for (const actor of map.actors) {
        const inv = actor.inventory;
        if (inv === null || inv.isEmpty) continue;

        // update each explosive fuse there,
        // remember which should explode.
        for (const it of inv.items) {
          if (!(it instanceof ItemGrenadePrimed)) continue;

          // primed explosive, burn fuse.
          --it.fuseTimeLeft;
          if (it.fuseTimeLeft <= 0) hasExplosivesToExplode = true;
        }
      }

      // 6.2 Explode.
      if (hasExplosivesToExplode) {
        let hasExplodedSomething = false;
        do {
          // nothing exploded by default.
          hasExplodedSomething = false;

          // on ground.
          if (!hasExplodedSomething) {
            for (const groundInv of map.groundInventories) {
              const pos = map.getGroundInventoryPosition(groundInv);
              if (pos === null) throw new Error("explosives : GetGroundInventoryPosition returned null point");

              for (const it of groundInv.items) {
                if (!(it instanceof ItemGrenadePrimed)) continue;

                if (it.fuseTimeLeft <= 0) {
                  // boom!
                  map.removeItemAt(it, pos);
                  await this.DoBlast(new Location(map, pos), (it.model as ItemExplosiveModel).blastAttack);
                  hasExplodedSomething = true;
                  break;
                }
              }

              if (hasExplodedSomething) break;
            }
          }

          // on actors.
          if (!hasExplodedSomething) {
            for (const actor of map.actors) {
              const inv = actor.inventory;
              if (inv === null || inv.isEmpty) continue;

              for (const it of inv.items) {
                if (!(it instanceof ItemGrenadePrimed)) continue;

                if (it.fuseTimeLeft <= 0) {
                  // boom!
                  inv.removeAllQuantity(it);
                  await this.DoBlast(new Location(map, actor.location.position), (it.model as ItemExplosiveModel).blastAttack);
                  hasExplodedSomething = true;
                  break;
                }
              }
            }
          }
        } while (hasExplodedSomething);
      }

      // 7. Check fires.
      // 7.1 Rain has a chance to put out fires.
      // FIXME there still the weather bug when simulating = weather used is current world weather, not map weather.
      if (this.m_Rules.isWeatherRain(this.m_Session.weather) && this.m_Rules.rollChance(Rules.FIRE_RAIN_TEST_CHANCE)) {
        // 7.1.1 Burning objects?
        for (const obj of map.mapObjects) {
          if (obj.isOnFire && this.m_Rules.rollChance(Rules.FIRE_RAIN_PUT_OUT_CHANCE)) {
            // do it.
            this.UnapplyOnFire(obj);
            // tell.
            if (this.IsVisibleToPlayer(obj)) {
              this.AddMessage(new Message("The rain has put out a fire.", map.localTime.turnCounter));
            }
          }
        }
      }
    } // skipped in lodetail turns.

    // -- Check timers.
    if (map.countTimers > 0) {
      let timersGarbage: TimedTask[] | null = null;
      for (const t of map.timers) {
        t.tick(map);
        if (t.isCompleted) {
          if (timersGarbage === null) timersGarbage = [];
          timersGarbage.push(t);
        }
      }
      if (timersGarbage !== null) {
        for (const t of timersGarbage) map.removeTimer(t);
      }
    }

    // -- Advance local time.
    const wasLocalNight = map.localTime.isNight;
    ++map.localTime.turnCounter;
    const isLocalDay = !map.localTime.isNight;

    // -- Check for NPC upgrade.
    if (wasLocalNight && isLocalDay) {
      this.HandleLivingNPCsUpgrade(map);
    } else if (
      s_Options.zombifiedsUpgradeDays !== ZupDays.OFF &&
      !wasLocalNight &&
      !isLocalDay &&
      GameOptions.isZupDay(s_Options.zombifiedsUpgradeDays, map.localTime.day)
    ) {
      this.HandleUndeadNPCsUpgrade(map);
    }
  }

  // C# DropActorScents — RogueGame.cs:4009
  DropActorScents(actor: Actor): void {
    // alpha10 dont drop if odor suppressed
    if (actor.odorSuppressorCounter > 0) return;

    if (actor.model.abilities.isUndead) {
      // ZM scent?
      if (actor.model.abilities.isUndeadMaster) {
        actor.location.map!.refreshScentAt(Odor.UNDEAD_MASTER, Rules.UNDEAD_MASTER_SCENT_DROP, actor.location.position);
      }
    } else {
      // Living scent.
      actor.location.map!.refreshScentAt(Odor.LIVING, Rules.LIVING_SCENT_DROP, actor.location.position);
    }
  }

  // C# DecayActorScents — RogueGame.cs:4029
  DecayActorScents(actor: Actor): void {
    // decay suppressor
    if (actor.odorSuppressorCounter > 0) {
      const decay = this.m_Rules.odorsDecay(actor.location.map!, actor.location.position, this.m_Session.weather);
      actor.odorSuppressorCounter -= decay;
      if (actor.odorSuppressorCounter < 0) actor.odorSuppressorCounter = 0;
    }
  }

  // C# ModifyActorTrustInLeader — RogueGame.cs:4040
  ModifyActorTrustInLeader(a: Actor, mod: number, addMessage: boolean): void {
    // do it.
    a.trustInLeader += mod;
    if (a.trustInLeader > Rules.TRUST_MAX) {
      a.trustInLeader = Rules.TRUST_MAX;
    } else if (a.trustInLeader < Rules.TRUST_MIN) {
      a.trustInLeader = Rules.TRUST_MIN;
    }

    // if leader is player, message.
    if (addMessage && a.leader !== null && a.leader.isPlayer) {
      this.AddMessage(new Message(`(${mod} trust with ${a.theName})`, this.m_Session.worldTime.turnCounter, Color.White));
    }
  }

  // C# CountLivings — RogueGame.cs:4056
  CountLivings(map: Map): number {
    if (map == null) throw new TypeError("map");

    let count = 0;
    for (const a of map.actors) if (!a.model.abilities.isUndead) ++count;

    return count;
  }

  // C# CountActors — RogueGame.cs:4069
  CountActors(map: Map, predFn: (p0: Actor) => boolean): number {
    if (map == null) throw new TypeError("map");

    let count = 0;
    for (const a of map.actors) if (predFn(a)) ++count;

    return count;
  }

  // C# CountFaction — RogueGame.cs:4082
  CountFaction(map: Map, f: Faction): number {
    if (map == null) throw new TypeError("map");

    let count = 0;
    for (const a of map.actors) if (a.faction === f) ++count;

    return count;
  }

  // C# CountUndeads — RogueGame.cs:4095
  CountUndeads(map: Map): number {
    if (map == null) throw new TypeError("map");

    let count = 0;
    for (const a of map.actors) if (a.model.abilities.isUndead) ++count;

    return count;
  }

  // C# CountFoodItemsNutrition — RogueGame.cs:4108
  CountFoodItemsNutrition(map: Map): number {
    if (map == null) throw new TypeError("map");

    // food items on ground.
    let groundNutrition = 0;
    for (const inv of map.groundInventories) {
      if (inv.isEmpty) continue;
      for (const it of inv.items) {
        if (it instanceof ItemFood) groundNutrition += this.m_Rules.foodItemNutrition(it, map.localTime.turnCounter);
      }
    }
    // food items carried by actors.
    let carriedNutrition = 0;
    for (const a of map.actors) {
      const inv = a.inventory;
      if (inv === null || inv.isEmpty) continue;
      for (const it of inv.items) {
        if (it instanceof ItemFood) carriedNutrition += this.m_Rules.foodItemNutrition(it, map.localTime.turnCounter);
      }
    }

    return groundNutrition + carriedNutrition;
  }

  // C# HasActorOfModelID — RogueGame.cs:4142
  HasActorOfModelID(map: Map, actorModelID: ActorID): boolean {
    if (map == null) throw new TypeError("map");

    for (const a of map.actors) if (a.model.id === actorModelID) return true;

    return false;
  }

  // C# CheckForEvent_ZombieInvasion — RogueGame.cs:4157
  CheckForEvent_ZombieInvasion(map: Map): boolean {
    if (!map.localTime.isStrikeOfMidnight)
      return false;

    const undeads = this.CountUndeads(map);
    if (undeads >= s_Options.maxUndeads)
      return false;

    return true;
  }

  // C# FireEvent_ZombieInvasion — RogueGame.cs:4172
  async FireEvent_ZombieInvasion(map: Map): Promise<void> {
    if (map === this.m_Player.location.map && !this.m_Player.isSleeping && !this.m_Player.model.abilities.isUndead) {
      this.AddMessage(new Message("It is Midnight! Zombies are invading!", this.m_Session.worldTime.turnCounter, Color.Red));
      this.RedrawPlayScreen();
    }

    const undeads = this.CountUndeads(map);
    const invasionRatio = Math.min(1.0, (map.localTime.day * s_Options.zombieInvasionDailyIncrease + s_Options.dayZeroUndeadsPercent) / 100.0);
    const targetUndeadsCount = 1 + Math.floor(invasionRatio * s_Options.maxUndeads);
    const undeadsToSpawn = targetUndeadsCount - undeads;
    for (let i = 0; i < undeadsToSpawn; i++)
      this.SpawnNewUndead(map, map.localTime.day);
  }

  // C# CheckForEvent_SewersInvasion — RogueGame.cs:4194
  CheckForEvent_SewersInvasion(map: Map): boolean {
    if (!Rules.hasZombiesInSewers(this.m_Session.gameMode))
      return false;

    if (!this.m_Rules.rollChance(SEWERS_INVASION_CHANCE))
      return false;

    const undeads = this.CountUndeads(map);
    if (undeads >= s_Options.maxUndeads * SEWERS_UNDEADS_FACTOR)
      return false;

    return true;
  }

  // C# FireEvent_SewersInvasion — RogueGame.cs:4213
  FireEvent_SewersInvasion(map: Map): void {
    const undeads = this.CountUndeads(map);
    const invasionRatio = Math.min(1.0, (map.localTime.day * s_Options.zombieInvasionDailyIncrease + s_Options.dayZeroUndeadsPercent) / 100.0);
    const targetUndeadsCount = 1 + Math.floor(invasionRatio * s_Options.maxUndeads * SEWERS_UNDEADS_FACTOR);
    const undeadsToSpawn = targetUndeadsCount - undeads;
    for (let i = 0; i < undeadsToSpawn; i++)
      this.SpawnNewSewersUndead(map, map.localTime.day);
  }

  // C# CheckForEvent_SubwayInvasion — RogueGame.cs:4228
  CheckForEvent_SubwayInvasion(map: Map): boolean {
    if (!this.m_Rules.rollChance(SUBWAY_INVASION_CHANCE))
      return false;

    const undeads = this.CountUndeads(map);
    if (undeads >= s_Options.maxUndeads * SUBWAY_UNDEADS_FACTOR)
      return false;

    return true;
  }

  // C# FireEvent_SubwayInvasion — RogueGame.cs:4243
  FireEvent_SubwayInvasion(map: Map): void {
    const undeads = this.CountUndeads(map);
    const invasionRatio = Math.min(1.0, (map.localTime.day * s_Options.zombieInvasionDailyIncrease + s_Options.dayZeroUndeadsPercent) / 100.0);
    const targetUndeadsCount = 1 + Math.floor(invasionRatio * s_Options.maxUndeads * SUBWAY_UNDEADS_FACTOR);
    const undeadsToSpawn = targetUndeadsCount - undeads;
    for (let i = 0; i < undeadsToSpawn; i++)
      this.SpawnNewSubwayUndead(map, map.localTime.day);
  }

  // C# CheckForEvent_RefugeesWave — RogueGame.cs:4258
  CheckForEvent_RefugeesWave(map: Map): boolean {
    if (!map.localTime.isStrikeOfMidday)
      return false;

    return true;
  }

  // C# RefugeesEventDistrictFactor — RogueGame.cs:4280
  RefugeesEventDistrictFactor(d: District): number {
    const dx = d.worldPosition.x;
    const dy = d.worldPosition.y;
    const border = this.m_Session.world!.size - 1;
    const center = Math.floor(border / 2);

    return (dx === 0 || dy === 0 || dx === border || dy === border ? 2.0 :
      dx === center && dy === center ? 0.5 :
      1.0);
  }

  // C# FireEvent_RefugeesWave — RogueGame.cs:4292
  async FireEvent_RefugeesWave(district: District): Promise<void> {
    if (district === this.m_Player.location.map?.district && !this.m_Player.isSleeping && !this.m_Player.model.abilities.isUndead) {
      this.AddMessage(new Message("A new wave of refugees has arrived!", this.m_Session.worldTime.turnCounter, Color.Pink));
      this.RedrawPlayScreen();
    }

    const civilians = this.CountActors(district.entryMap!, (a) => a.faction === this.gameFactions.get(FactionID.TheCivilians) || a.faction === this.gameFactions.get(FactionID.ThePolice));
    const size = 1 + Math.floor(REFUGEES_WAVE_SIZE * this.RefugeesEventDistrictFactor(district) * s_Options.maxCivilians);
    const civiliansToSpawn = Math.min(size, s_Options.maxCivilians - civilians);
    let spawnMap: Map | null = null;
    for (let i = 0; i < civiliansToSpawn; i++) {
      if (this.m_Rules.rollChance(REFUGEE_SURFACE_SPAWN_CHANCE))
        spawnMap = district.entryMap;
      else {
        if (district.hasSubway)
          spawnMap = this.m_Rules.rollChance(50) ? district.subwayMap : district.sewersMap;
        else
          spawnMap = district.sewersMap;
      }
      if (spawnMap != null)
        this.SpawnNewRefugee(spawnMap);
    }

    if (this.m_Rules.rollChance(UNIQUE_REFUGEE_CHECK_CHANCE)) {
      const array = Array.from(this.m_Session.uniqueActors.toArray());
      const mayArrive = array.filter(
        (unique) => unique.isWithRefugees && !unique.isSpawned && !unique.theActor!.isDead
      );
      if (mayArrive.length > 0) {
        const iArrive = this.m_Rules.roll(0, mayArrive.length);
        this.FireEvent_UniqueActorArrive(district.entryMap!, mayArrive[iArrive]);
      }
    }
  }

  // C# FireEvent_UniqueActorArrive — RogueGame.cs:4344
  FireEvent_UniqueActorArrive(map: Map, unique: UniqueActor): void {
    const spawned = this.SpawnActorOnMapBorder(map, unique.theActor!, SPAWN_DISTANCE_TO_PLAYER, true);
    if (!spawned)
      return;

    unique.isSpawned = true;

    if (map === this.m_Player.location.map && !this.m_Player.isSleeping && !this.m_Player.model.abilities.isUndead) {
      this.PlayUniqueActorMusicAndMessage(unique, true);
      this.m_Session.scoring.addEvent(this.m_Session.worldTime.turnCounter, `${unique.theActor!.name} arrived.`);
    }
  }

  // C# PlayUniqueActorMusicAndMessage — RogueGame.cs:4382
  async PlayUniqueActorMusicAndMessage(unique: UniqueActor, hasArrived: boolean): Promise<void> {
    if (unique.eventMessage != null) {
      let highlightOverlay: Overlay | null = null;

      if (unique.eventThemeMusic != null) {
        this.m_MusicManager.stop();
        this.m_MusicManager.play(unique.eventThemeMusic);
      }

      this.ClearMessages();
      this.AddMessage(new Message(unique.eventMessage, this.m_Session.worldTime.turnCounter, Color.Pink));
      if (hasArrived)
        this.AddMessage(this.MakePlayerCentricMessage("Seems to come from", unique.theActor!.location.position));
      else {
        highlightOverlay = new OverlayRect(Color.Pink, new Rect(this.MapToScreen(unique.theActor!.location.position).x, this.MapToScreen(unique.theActor!.location.position).y, TILE_SIZE, TILE_SIZE));
        this.AddOverlay(highlightOverlay);
      }
      if (!this.m_Player.isBotPlayer) {
        await this.AddMessagePressEnter();
        this.ClearMessages();
      }
      if (highlightOverlay != null)
        this.RemoveOverlay(highlightOverlay);
    }
  }

  // C# CheckForEvent_NationalGuard — RogueGame.cs:4415
  CheckForEvent_NationalGuard(map: Map): boolean {
    if (s_Options.natGuardFactor === 0)
      return false;

    if (map.localTime.isNight)
      return false;

    if (map.localTime.day < NATGUARD_DAY)
      return false;
    if (map.localTime.day >= NATGUARD_END_DAY)
      return false;

    if (!this.m_Rules.rollChance(NATGUARD_INTERVENTION_CHANCE))
      return false;

    const livings = this.CountLivings(map) + this.CountFaction(map, this.gameFactions.get(FactionID.TheArmy));
    const undeads = this.CountUndeads(map);
    const undeadsPerLiving = undeads / (livings === 0 ? 1 : livings);
    if (undeadsPerLiving * (s_Options.natGuardFactor / 100.0) < NATGUARD_INTERVENTION_FACTOR)
      return false;

    return true;
  }

  // C# FireEvent_NationalGuard — RogueGame.cs:4446
  async FireEvent_NationalGuard(map: Map): Promise<void> {
    const squadLeader = this.SpawnNewNatGuardLeader(map);
    if (squadLeader != null) {
      for (let i = 0; i < NATGUARD_SQUAD_SIZE - 1; i++) {
        const trooper = this.SpawnNewNatGuardTrooper(map, squadLeader.location.position);
        if (trooper != null)
          squadLeader.addFollower(trooper);
      }
    }
    if (squadLeader == null)
      return;

    this.NotifyOrderablesAI(map, RaidType.NATGUARD, squadLeader.location.position);

    if (map === this.m_Player.location.map && !this.m_Player.isSleeping && !this.m_Player.model.abilities.isUndead) {
      this.m_MusicManager.stop();
      this.m_MusicManager.play(GameMusics.ARMY);

      this.ClearMessages();
      this.AddMessage(new Message("A National Guard squad has arrived!", this.m_Session.worldTime.turnCounter, Color.LightGreen));
      this.AddMessage(this.MakePlayerCentricMessage("Soldiers seem to come from", squadLeader.location.position));
      if (!this.m_Player.isBotPlayer) {
        await this.AddMessagePressEnter();
        this.ClearMessages();
      }
    }

    if (map === this.m_Player.location.map) {
      this.m_Session.scoring.addEvent(this.m_Session.worldTime.turnCounter, "A National Guard squad arrived.");
    }
  }

  // C# CheckForEvent_ArmySupplies — RogueGame.cs:4496
  CheckForEvent_ArmySupplies(map: Map): boolean {
    if (s_Options.suppliesDropFactor === 0)
      return false;

    if (map.localTime.isNight)
      return false;

    if (map.localTime.day < ARMY_SUPPLIES_DAY)
      return false;

    if (!this.m_Rules.rollChance(ARMY_SUPPLIES_CHANCE))
      return false;

    const livingsNeedFood = 1 + this.CountActors(map, (a) => !a.model.abilities.isUndead && a.model.abilities.hasToEat && a.faction === this.gameFactions.get(FactionID.TheCivilians));
    const food = 1 + this.CountFoodItemsNutrition(map);
    const foodPerLiving = food / livingsNeedFood;
    if (foodPerLiving >= (s_Options.suppliesDropFactor / 100.0) * ARMY_SUPPLIES_FACTOR)
      return false;

    return true;
  }

  // C# FireEvent_ArmySupplies — RogueGame.cs:4525
  async FireEvent_ArmySupplies(map: Map): Promise<void> {
    const dropPoint: Point = new Point(0, 0);
    const dropped = this.FindDropSuppliesPoint(map, dropPoint);
    if (!dropped)
      return;

    const xmin = dropPoint.x - ARMY_SUPPLIES_SCATTER;
    const xmax = dropPoint.x + ARMY_SUPPLIES_SCATTER;
    const ymin = dropPoint.y - ARMY_SUPPLIES_SCATTER;
    const ymax = dropPoint.y + ARMY_SUPPLIES_SCATTER;
    // trim to bounds
    for (let sx = xmin; sx <= xmax; sx++)
      for (let sy = ymin; sy <= ymax; sy++) {
        if (!map.isInBounds(sx, sy)) continue;
        if (!this.IsSuitableDropSuppliesPoint(map, sx, sy))
          continue;

        const it = this.m_Rules.rollChance(80) ? this.m_TownGenerator.makeItemArmyRation() : this.m_TownGenerator.makeItemMedikit();
        map.dropItemAt(it, new Point(sx, sy));
      }

    this.NotifyOrderablesAI(map, RaidType.ARMY_SUPLLIES, dropPoint);

    if (map === this.m_Player.location.map && !this.m_Player.isSleeping && !this.m_Player.model.abilities.isUndead) {
      this.m_MusicManager.stop();
      this.m_MusicManager.play(GameMusics.ARMY);

      this.ClearMessages();
      this.AddMessage(new Message("An Army chopper has dropped supplies!", this.m_Session.worldTime.turnCounter, Color.LightGreen));
      this.AddMessage(this.MakePlayerCentricMessage("The drop point seems to be", dropPoint));
      if (!this.m_Player.isBotPlayer) {
        await this.AddMessagePressEnter();
        this.ClearMessages();
      }
    }

    if (map === this.m_Player.location.map) {
      this.m_Session.scoring.addEvent(this.m_Session.worldTime.turnCounter, "An army chopper dropped supplies.");
    }
  }

  // C# IsSuitableDropSuppliesPoint — RogueGame.cs:4586
  IsSuitableDropSuppliesPoint(map: Map, x: number, y: number): boolean {
    if (!map.isInBounds(x, y))
      return false;

    const tile = map.getTileAt(x, y);
    if (tile!.isInside || !tile!.model.isWalkable)
      return false;

    if (map.getActorAt(x, y) != null || map.getMapObjectAt(x, y) != null)
      return false;

    if (this.DistanceToPlayer(map, x, y) < SPAWN_DISTANCE_TO_PLAYER)
      return false;

    return true;
  }

  // C# FindDropSuppliesPoint — RogueGame.cs:4617
  FindDropSuppliesPoint(map: Map, dropPoint: Point): boolean {
    const maxAttempts = 4 * map.width;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = this.m_Rules.rollX(map);
      const y = this.m_Rules.rollY(map);

      if (!this.IsSuitableDropSuppliesPoint(map, x, y))
        continue;

      // mutate dropPoint
      (dropPoint as any).x = x;
      (dropPoint as any).y = y;
      return true;
    }
    return false;
  }

  // C# HasRaidHappenedSince — RogueGame.cs:4643
  HasRaidHappenedSince(raid: RaidType, district: District, mapTime: WorldTime, sinceNTurns: number): boolean {
    return this.m_Session.hasRaidHappened(raid, district) && mapTime.turnCounter - this.m_Session.lastRaidTime(raid, district) < sinceNTurns;
  }

  // C# CheckForEvent_BikersRaid — RogueGame.cs:4649
  CheckForEvent_BikersRaid(map: Map): boolean {
    if (map.localTime.day < BIKERS_RAID_DAY)
      return false;
    if (map.localTime.day >= BIKERS_END_DAY)
      return false;

    if (this.HasRaidHappenedSince(RaidType.BIKERS, map.district!, map.localTime, BIKERS_RAID_DAYS_GAP * WorldTime.TURNS_PER_DAY))
      return false;

    if (!this.m_Rules.rollChance(BIKERS_RAID_CHANCE_PER_TURN))
      return false;

    return true;
  }

  // C# FireEvent_BikersRaid — RogueGame.cs:4676
  async FireEvent_BikersRaid(map: Map): Promise<void> {
    this.m_Session.setLastRaidTime(RaidType.BIKERS, map.district!, map.localTime.turnCounter);

    const gangId = GameGangs.BIKERS[this.m_Rules.roll(0, GameGangs.BIKERS.length)];

    const raidLeader = this.SpawnNewBikerLeader(map, gangId);
    if (raidLeader != null) {
      for (let i = 0; i < BIKERS_RAID_SIZE - 1; i++) {
        const squadie = this.SpawnNewBiker(map, gangId, raidLeader.location.position);
        if (squadie != null)
          raidLeader.addFollower(squadie);
      }
    }
    if (raidLeader == null)
      return;

    this.NotifyOrderablesAI(map, RaidType.BIKERS, raidLeader.location.position);

    if (map === this.m_Player.location.map && !this.m_Player.isSleeping && !this.m_Player.model.abilities.isUndead) {
      this.m_MusicManager.stop();
      this.m_MusicManager.play(GameMusics.BIKER);

      this.ClearMessages();
      this.AddMessage(new Message("You hear the sound of roaring engines!", this.m_Session.worldTime.turnCounter, Color.LightGreen));
      this.AddMessage(this.MakePlayerCentricMessage("Motorbikes seem to come from", raidLeader.location.position));
      if (!this.m_Player.isBotPlayer) {
        await this.AddMessagePressEnter();
        this.ClearMessages();
      }
    }

    if (map === this.m_Player.location.map) {
      this.m_Session.scoring.addEvent(this.m_Session.worldTime.turnCounter, "Bikers raided the district.");
    }
  }

  // C# CheckForEvent_GangstasRaid — RogueGame.cs:4731
  CheckForEvent_GangstasRaid(map: Map): boolean {
    if (map.localTime.day < GANGSTAS_RAID_DAY)
      return false;
    if (map.localTime.day >= GANGSTAS_END_DAY)
      return false;

    if (this.HasRaidHappenedSince(RaidType.GANGSTA, map.district!, map.localTime, GANGSTAS_RAID_DAYS_GAP * WorldTime.TURNS_PER_DAY))
      return false;

    if (!this.m_Rules.rollChance(GANGSTAS_RAID_CHANCE_PER_TURN))
      return false;

    return true;
  }

  // C# FireEvent_GangstasRaid — RogueGame.cs:4758
  async FireEvent_GangstasRaid(map: Map): Promise<void> {
    this.m_Session.setLastRaidTime(RaidType.GANGSTA, map.district!, map.localTime.turnCounter);

    const gangId = GameGangs.GANGSTAS[this.m_Rules.roll(0, GameGangs.GANGSTAS.length)];

    const raidLeader = this.SpawnNewGangstaLeader(map, gangId);
    if (raidLeader != null) {
      for (let i = 0; i < GANGSTAS_RAID_SIZE - 1; i++) {
        const squadie = this.SpawnNewGangsta(map, gangId, raidLeader.location.position);
        if (squadie != null)
          raidLeader.addFollower(squadie);
      }
    }
    if (raidLeader == null)
      return;

    this.NotifyOrderablesAI(map, RaidType.GANGSTA, raidLeader.location.position);

    if (map === this.m_Player.location.map && !this.m_Player.isSleeping && !this.m_Player.model.abilities.isUndead) {
      this.m_MusicManager.stop();
      this.m_MusicManager.play(GameMusics.GANGSTA);

      this.ClearMessages();
      this.AddMessage(new Message("You hear obnoxious loud music!", this.m_Session.worldTime.turnCounter, Color.LightGreen));
      this.AddMessage(this.MakePlayerCentricMessage("Cars seem to come from", raidLeader.location.position));
      if (!this.m_Player.isBotPlayer) {
        await this.AddMessagePressEnter();
        this.ClearMessages();
      }
    }

    if (map === this.m_Player.location.map) {
      this.m_Session.scoring.addEvent(this.m_Session.worldTime.turnCounter, "Gangstas raided the district.");
    }
  }

  // C# CheckForEvent_BlackOpsRaid — RogueGame.cs:4813
  CheckForEvent_BlackOpsRaid(map: Map): boolean {
    if (map.localTime.day < BLACKOPS_RAID_DAY)
      return false;

    if (this.HasRaidHappenedSince(RaidType.BLACKOPS, map.district!, map.localTime, BLACKOPS_RAID_DAY_GAP * WorldTime.TURNS_PER_DAY))
      return false;

    if (!this.m_Rules.rollChance(BLACKOPS_RAID_CHANCE_PER_TURN))
      return false;

    return true;
  }

  // C# FireEvent_BlackOpsRaid — RogueGame.cs:4831
  async FireEvent_BlackOpsRaid(map: Map): Promise<void> {
    this.m_Session.setLastRaidTime(RaidType.BLACKOPS, map.district!, map.localTime.turnCounter);

    const raidLeader = this.SpawnNewBlackOpsLeader(map);
    if (raidLeader != null) {
      for (let i = 0; i < BLACKOPS_RAID_SIZE - 1; i++) {
        const squadie = this.SpawnNewBlackOpsTrooper(map, raidLeader.location.position);
        if (squadie != null)
          raidLeader.addFollower(squadie);
      }
    }
    if (raidLeader == null)
      return;

    this.NotifyOrderablesAI(map, RaidType.BLACKOPS, raidLeader.location.position);

    if (map === this.m_Player.location.map && !this.m_Player.isSleeping && !this.m_Player.model.abilities.isUndead) {
      this.m_MusicManager.stop();
      this.m_MusicManager.play(GameMusics.ARMY);

      this.ClearMessages();
      this.AddMessage(new Message("You hear a chopper flying over the city!", this.m_Session.worldTime.turnCounter, Color.LightGreen));
      this.AddMessage(this.MakePlayerCentricMessage("The chopper has dropped something", raidLeader.location.position));
      if (!this.m_Player.isBotPlayer) {
        await this.AddMessagePressEnter();
        this.ClearMessages();
      }
    }

    if (map === this.m_Player.location.map) {
      this.m_Session.scoring.addEvent(this.m_Session.worldTime.turnCounter, "BlackOps raided the district.");
    }
  }

  // C# CheckForEvent_BandOfSurvivors — RogueGame.cs:4883
  CheckForEvent_BandOfSurvivors(map: Map): boolean {
    if (map.localTime.day < SURVIVORS_BAND_DAY)
      return false;

    if (this.HasRaidHappenedSince(RaidType.SURVIVORS, map.district!, map.localTime, SURVIVORS_BAND_DAY_GAP * WorldTime.TURNS_PER_DAY))
      return false;

    if (!this.m_Rules.rollChance(SURVIVORS_BAND_CHANCE_PER_TURN))
      return false;

    return true;
  }

  // C# FireEvent_BandOfSurvivors — RogueGame.cs:4901
  async FireEvent_BandOfSurvivors(map: Map): Promise<void> {
    this.m_Session.setLastRaidTime(RaidType.SURVIVORS, map.district!, map.localTime.turnCounter);

    const bandScout = this.SpawnNewSurvivor(map);
    if (bandScout != null) {
      for (let i = 0; i < SURVIVORS_BAND_SIZE - 1; i++)
        this.SpawnNewSurvivor(map, bandScout.location.position);
    }
    if (bandScout == null)
      return;

    this.NotifyOrderablesAI(map, RaidType.SURVIVORS, bandScout.location.position);

    if (map === this.m_Player.location.map && !this.m_Player.isSleeping && !this.m_Player.model.abilities.isUndead) {
      this.m_MusicManager.stop();
      this.m_MusicManager.play(GameMusics.SURVIVORS);

      this.ClearMessages();
      this.AddMessage(new Message("You hear shooting and honking in the distance.", this.m_Session.worldTime.turnCounter, Color.LightGreen));
      this.AddMessage(this.MakePlayerCentricMessage("A van has stopped", bandScout.location.position));
      if (!this.m_Player.isBotPlayer) {
        await this.AddMessagePressEnter();
        this.ClearMessages();
      }
    }

    if (map === this.m_Player.location.map) {
      this.m_Session.scoring.addEvent(this.m_Session.worldTime.turnCounter, "A Band of Survivors entered the district.");
    }
  }

  // C# DistanceToPlayer — RogueGame.cs:4951
  DistanceToPlayer(map: Map, posOrX: number | Point, y?: number): number {
    if (this.m_Player == null || this.m_Player.location.map !== map)
      return Number.MAX_SAFE_INTEGER;
    const pt = typeof posOrX === "number" ? new Point(posOrX, y!) : posOrX;
    return this.m_Rules.gridDistance(this.m_Player.location.position, pt);
  }

  // C# SpawnActorOnMapBorder — RogueGame.cs:4987
  SpawnActorOnMapBorder(map: Map, actorToSpawn: Actor, minDistToPlayer: number, mustBeOutside: boolean): boolean {
    const maxTries = 4 * (map.width + map.height);
    let i = 0;
    const pos = new Point(0, 0);
    do {
      ++i;
      let x = (this.m_Rules.rollChance(50) ? 0 : map.width - 1);
      let y = (this.m_Rules.rollChance(50) ? 0 : map.height - 1);
      if (this.m_Rules.rollChance(50))
        x = this.m_Rules.rollX(map);
      else
        y = this.m_Rules.rollY(map);

      (pos as any).x = x;
      (pos as any).y = y;

      if (mustBeOutside && map.getTileAt(pos.x, pos.y)!.isInside)
        continue;
      if (!this.m_Rules.isWalkableFor(actorToSpawn, map, pos.x, pos.y))
        continue;
      if (this.DistanceToPlayer(map, pos) < minDistToPlayer)
        continue;
      if (this.IsAdjacentToEnemy(map, pos, actorToSpawn))
        continue;

      map.placeActor(actorToSpawn, pos);
      this.OnActorEnterTile(actorToSpawn);
      return true;
    } while (i <= maxTries);

    return false;
  }

  // C# SpawnActorNear — RogueGame.cs:5030
  SpawnActorNear(map: Map, actorToSpawn: Actor, minDistToPlayer: number, nearPoint: Point, maxDistToPoint: number): boolean {
    const maxTries = 4 * (map.width + map.height);
    let i = 0;
    const pos = new Point(0, 0);
    do {
      ++i;
      const x = nearPoint.x + this.m_Rules.roll(1, maxDistToPoint + 1) - this.m_Rules.roll(1, maxDistToPoint + 1);
      const y = nearPoint.y + this.m_Rules.roll(1, maxDistToPoint + 1) - this.m_Rules.roll(1, maxDistToPoint + 1);

      (pos as any).x = x;
      (pos as any).y = y;
      /* trim */ (pos);

      if (map.getTileAt(pos.x, pos.y)!.isInside)
        continue;
      if (!this.m_Rules.isWalkableFor(actorToSpawn, map, pos.x, pos.y))
        continue;
      if (this.DistanceToPlayer(map, pos) < minDistToPlayer)
        continue;
      if (this.IsAdjacentToEnemy(map, pos, actorToSpawn))
        continue;

      map.placeActor(actorToSpawn, pos);
      return true;
    } while (i <= maxTries);

    return false;
  }

  // C# SpawnNewUndead — RogueGame.cs:5070
  SpawnNewUndead(map: Map, day: number): void {
    const newUndead = this.m_TownGenerator.createNewUndead(map.localTime.turnCounter);

    if (s_Options.allowUndeadsEvolution && Rules.hasEvolution(this.m_Session.gameMode)) {
      const levelupChance = Math.min(75, day * 2);
      let doLevelUp = false;
      let levelupID = newUndead.model.id as unknown as ActorID;
      if (this.m_Rules.rollChance(levelupChance)) {
        doLevelUp = true;
        levelupID = this.NextUndeadEvolution(newUndead.model.id as unknown as ActorID);
        if (this.m_Rules.rollChance(levelupChance))
          levelupID = this.NextUndeadEvolution(levelupID);
      }

      if (levelupID === ActorID.UNDEAD_ZOMBIE_LORD && day < ZOMBIE_LORD_EVOLUTION_MIN_DAY)
        doLevelUp = false;

      if (doLevelUp) {
        newUndead.model = this.gameActors.get(levelupID)!;
      }
    }

    this.SpawnActorOnMapBorder(map, newUndead, SPAWN_DISTANCE_TO_PLAYER, true);
  }

  // C# SpawnNewSewersUndead — RogueGame.cs:5111
  SpawnNewSewersUndead(map: Map, _day: number): void {
    const newUndead = this.m_TownGenerator.createNewSewersUndead(map.localTime.turnCounter);
    this.SpawnActorOnMapBorder(map, newUndead, SPAWN_DISTANCE_TO_PLAYER, false);
  }

  // C# SpawnNewSubwayUndead — RogueGame.cs:5124
  SpawnNewSubwayUndead(map: Map, _day: number): void {
    const newUndead = this.m_TownGenerator.createNewSubwayUndead(map.localTime.turnCounter);
    this.SpawnActorOnMapBorder(map, newUndead, SPAWN_DISTANCE_TO_PLAYER, false);
  }

  // C# SpawnNewRefugee — RogueGame.cs:5138
  SpawnNewRefugee(map: Map): void {
    const newCivilian = this.m_TownGenerator.createNewRefugee(map.localTime.turnCounter, REFUGEES_WAVE_ITEMS);
    this.SpawnActorOnMapBorder(map, newCivilian, SPAWN_DISTANCE_TO_PLAYER, true);
  }

  // C# SpawnNewSurvivor — RogueGame.cs:5151
  SpawnNewSurvivor(map: Map, bandPos?: Point): Actor | null {
    const newSurvivor = this.m_TownGenerator.createNewSurvivor(map.localTime.turnCounter);
    if (bandPos != null) {
      if (this.SpawnActorNear(map, newSurvivor, SPAWN_DISTANCE_TO_PLAYER, bandPos, 3))
        return newSurvivor;
      return null;
    } else {
      if (this.SpawnActorOnMapBorder(map, newSurvivor, SPAWN_DISTANCE_TO_PLAYER, true))
        return newSurvivor;
      return null;
    }
  }

  // C# SpawnNewNatGuardLeader — RogueGame.cs:5183
  SpawnNewNatGuardLeader(map: Map): Actor | null {
    const newNatLeader = this.m_TownGenerator.createNewArmyNationalGuard(map.localTime.turnCounter, "Sgt");
    this.m_TownGenerator.giveStartingSkillToActor(newNatLeader, SkillID.LEADERSHIP);

    if (map.localTime.day > NATGUARD_ZTRACKER_DAY) {
      newNatLeader.inventory!.addAll(this.m_TownGenerator.makeItemZTracker());
    }

    const spawned = this.SpawnActorOnMapBorder(map, newNatLeader, SPAWN_DISTANCE_TO_PLAYER, true);
    return spawned ? newNatLeader : null;
  }

  // C# SpawnNewNatGuardTrooper — RogueGame.cs:5208
  SpawnNewNatGuardTrooper(map: Map, leaderPos: Point): Actor | null {
    const newNatGuard = this.m_TownGenerator.createNewArmyNationalGuard(map.localTime.turnCounter, "Pvt");
    if (this.m_Rules.rollChance(50))
      newNatGuard.inventory!.addAll(this.m_TownGenerator.makeItemCombatKnife());
    else
      newNatGuard.inventory!.addAll(this.m_TownGenerator.makeItemGrenade());

    const spawned = this.SpawnActorNear(map, newNatGuard, SPAWN_DISTANCE_TO_PLAYER, leaderPos, 3);
    return spawned ? newNatGuard : null;
  }

  // C# SpawnNewBikerLeader — RogueGame.cs:5230
  SpawnNewBikerLeader(map: Map, gangId: GangID): Actor | null {
    const newBikerLeader = this.m_TownGenerator.createNewBikerMan(map.localTime.turnCounter, gangId);
    this.m_TownGenerator.giveStartingSkillToActor(newBikerLeader, SkillID.LEADERSHIP);
    this.m_TownGenerator.giveStartingSkillToActor(newBikerLeader, SkillID.TOUGH);
    this.m_TownGenerator.giveStartingSkillToActor(newBikerLeader, SkillID.TOUGH);
    this.m_TownGenerator.giveStartingSkillToActor(newBikerLeader, SkillID.TOUGH);
    this.m_TownGenerator.giveStartingSkillToActor(newBikerLeader, SkillID.STRONG);
    this.m_TownGenerator.giveStartingSkillToActor(newBikerLeader, SkillID.STRONG);
    this.m_TownGenerator.giveStartingSkillToActor(newBikerLeader, SkillID.STRONG);

    const spawned = this.SpawnActorOnMapBorder(map, newBikerLeader, SPAWN_DISTANCE_TO_PLAYER, true);
    return spawned ? newBikerLeader : null;
  }

  // C# SpawnNewBiker — RogueGame.cs:5255
  SpawnNewBiker(map: Map, gangId: GangID, leaderPos: Point): Actor | null {
    const newBiker = this.m_TownGenerator.createNewBikerMan(map.localTime.turnCounter, gangId);
    this.m_TownGenerator.giveStartingSkillToActor(newBiker, SkillID.TOUGH);
    this.m_TownGenerator.giveStartingSkillToActor(newBiker, SkillID.STRONG);

    const spawned = this.SpawnActorNear(map, newBiker, SPAWN_DISTANCE_TO_PLAYER, leaderPos, 3);
    return spawned ? newBiker : null;
  }

  // C# SpawnNewGangstaLeader — RogueGame.cs:5275
  SpawnNewGangstaLeader(map: Map, gangId: GangID): Actor | null {
    const newGangstaLeader = this.m_TownGenerator.createNewGangstaMan(map.localTime.turnCounter, gangId);
    this.m_TownGenerator.giveStartingSkillToActor(newGangstaLeader, SkillID.LEADERSHIP);
    this.m_TownGenerator.giveStartingSkillToActor(newGangstaLeader, SkillID.AGILE);
    this.m_TownGenerator.giveStartingSkillToActor(newGangstaLeader, SkillID.AGILE);
    this.m_TownGenerator.giveStartingSkillToActor(newGangstaLeader, SkillID.AGILE);
    this.m_TownGenerator.giveStartingSkillToActor(newGangstaLeader, SkillID.FIREARMS);

    const spawned = this.SpawnActorOnMapBorder(map, newGangstaLeader, SPAWN_DISTANCE_TO_PLAYER, true);
    return spawned ? newGangstaLeader : null;
  }

  // C# SpawnNewGangsta — RogueGame.cs:5298
  SpawnNewGangsta(map: Map, gangId: GangID, leaderPos: Point): Actor | null {
    const newGangsta = this.m_TownGenerator.createNewGangstaMan(map.localTime.turnCounter, gangId);
    this.m_TownGenerator.giveStartingSkillToActor(newGangsta, SkillID.AGILE);

    const spawned = this.SpawnActorNear(map, newGangsta, SPAWN_DISTANCE_TO_PLAYER, leaderPos, 3);
    return spawned ? newGangsta : null;
  }

  // C# SpawnNewBlackOpsLeader — RogueGame.cs:5317
  SpawnNewBlackOpsLeader(map: Map): Actor | null {
    const newBOLeader = this.m_TownGenerator.createNewBlackOps(map.localTime.turnCounter, "Officer");
    this.m_TownGenerator.giveStartingSkillToActor(newBOLeader, SkillID.LEADERSHIP);
    this.m_TownGenerator.giveStartingSkillToActor(newBOLeader, SkillID.AGILE);
    this.m_TownGenerator.giveStartingSkillToActor(newBOLeader, SkillID.AGILE);
    this.m_TownGenerator.giveStartingSkillToActor(newBOLeader, SkillID.AGILE);
    this.m_TownGenerator.giveStartingSkillToActor(newBOLeader, SkillID.FIREARMS);
    this.m_TownGenerator.giveStartingSkillToActor(newBOLeader, SkillID.FIREARMS);
    this.m_TownGenerator.giveStartingSkillToActor(newBOLeader, SkillID.FIREARMS);
    this.m_TownGenerator.giveStartingSkillToActor(newBOLeader, SkillID.TOUGH);
    this.m_TownGenerator.giveStartingSkillToActor(newBOLeader, SkillID.TOUGH);
    this.m_TownGenerator.giveStartingSkillToActor(newBOLeader, SkillID.TOUGH);

    const spawned = this.SpawnActorOnMapBorder(map, newBOLeader, SPAWN_DISTANCE_TO_PLAYER, true);
    return spawned ? newBOLeader : null;
  }

  // C# SpawnNewBlackOpsTrooper — RogueGame.cs:5345
  SpawnNewBlackOpsTrooper(map: Map, leaderPos: Point): Actor | null {
    const newBO = this.m_TownGenerator.createNewBlackOps(map.localTime.turnCounter, "Agent");
    this.m_TownGenerator.giveStartingSkillToActor(newBO, SkillID.AGILE);
    this.m_TownGenerator.giveStartingSkillToActor(newBO, SkillID.FIREARMS);
    this.m_TownGenerator.giveStartingSkillToActor(newBO, SkillID.TOUGH);

    const spawned = this.SpawnActorNear(map, newBO, SPAWN_DISTANCE_TO_PLAYER, leaderPos, 3);
    return spawned ? newBO : null;
  }

  // C# BotToggleControl — RogueGame.cs:5385
  // C# locks m_botLock (dev keys may fire from other threads); the browser is
  // single threaded here so no lock is needed.
  BotToggleControl(): void {
    if (this.m_isBotMode)
      this.BotReleaseControl();
    else
      this.BotTakeControl();
  }

  // C# BotTakeControl — RogueGame.cs:5396
  BotTakeControl(): void {
    // bot restrictions check
    if (this.m_Player == null || this.m_Player.isDead) {
      this.AddMessage(this.MakeErrorMessage("Bot cannot take control of null/dead player"));
      return;
    }

    if (this.m_botControl != null)
      this.m_botControl.leaveControl();

    try {
      const aiClass = this.m_Player.model.defaultControllerCtor;
      if (aiClass == null)
        throw new TypeError("actor model has null defaultcontroller");
      const aiController = new aiClass();
      if (!(aiController instanceof BaseAI))
        throw new TypeError("actor model defaultcontroller is not BaseAI");

      this.m_botControl = aiController;
      this.m_botControl.takeControl(this.m_Player);
      this.m_Player.isBotPlayer = true;
      this.m_isBotMode = true;
      this.AddMessage(this.MakeMessage(this.m_Player, `is now bot controlled by ${this.m_botControl.constructor.name}.`, Color.LightGreen));
    } catch (e) {
      this.ClearMessages();
      this.AddMessage(this.MakeErrorMessage("error while creating bot ai:"));
      this.AddMessage(this.MakeErrorMessage((e as Error).message));
      void this.AddMessagePressEnter();
    }
  }

  // C# BotReleaseControl — RogueGame.cs:5432
  BotReleaseControl(): void {
    if (this.m_botControl == null)
      return;
    if (this.m_Player != null)
      this.m_Player.isBotPlayer = false;
    this.m_botControl.leaveControl();
    this.m_botControl = null;
    this.m_isBotMode = false;
    if (this.m_Player != null)
      this.AddMessage(this.MakeMessage(this.m_Player, "is now human controlled.", Color.LightGreen));
  }

  // C# HandlePlayerActor — RogueGame.cs:5449
  // C# busy-loops on input peeks and calls UI_SetCursor(null); async here so
  // the browser can deliver input (WaitKeyOrMouse yields), no cursor API.
  async HandlePlayerActor(player: Actor): Promise<void> {
    // Upkeep.
    this.UpdatePlayerFOV(player); // make sure LOS is up to date.
    this.m_Player = player;       // remember player.
    this.ComputeViewRect(player.location.position);

    // Update survival scoring.
    this.m_Session.scoring.turnsSurvived = this.m_Session.worldTime.turnCounter;

    // Check if long wait.
    if (this.m_IsPlayerLongWait) {
      if (await this.CheckPlayerWaitLong(player)) {
        // continue waiting.
        this.DoWait(player);
        return;
      } else {
        // stop long wait.
        this.m_IsPlayerLongWait = false;
        this.m_IsPlayerLongWaitForcedStop = false;

        // wait ended or interrupted.
        if (this.m_Session.worldTime.turnCounter >= this.m_PlayerLongWaitEnd.turnCounter)
          this.AddMessage(new Message("Wait ended.", this.m_Session.worldTime.turnCounter, Color.Yellow));
        else
          this.AddMessage(new Message("Wait interrupted!", this.m_Session.worldTime.turnCounter, Color.Red));
      }
    }

    /////////////////////////////////////////////////
    // Loop until the player has made a valid choice
    /////////////////////////////////////////////////
    let loop = true;
    do {
      ///////////////////
      // 1. Redraw
      // 2. Get input.
      // 3. Handle input
      ///////////////////

      // 1. Redraw
      // alpha10.1 bot mode?
      if (this.m_isBotMode) {
        await new Promise<void>((r) => setTimeout(r, BOT_DELAY));
        this.RedrawPlayScreen();
        if (this.m_botControl != null) { // can become null even under C#'s lock.
          let botAction: ActorAction | null = this.m_botControl.getAction(this);
          if (botAction == null || !botAction.isLegal()) {
            this.AddMessage(this.MakeErrorMessage(`Bot issued ${botAction == null ? "NULL" : `illegal ${botAction.toString()}`} action`));
            botAction = new ActionWait(player, this);
          }
          botAction.perform();
          // copy-paste is bad
          this.UpdatePlayerFOV(player);
          this.ComputeViewRect(player.location.position);
          this.m_Session.lastTurnPlayerActed = this.m_Session.worldTime.turnCounter;
          this.RedrawPlayScreen();
        }
        return;
      }

      // hint available?
      // alpha10 no hint if undead
      if (this.m_Player != null && !this.m_Player.isDead && !this.m_Player.model.abilities.isUndead) {
        // alpha10 fix properly handle hint overlay
        let availableHint = -1;
        if (s_Options.isAdvisorEnabled && (availableHint = this.GetAdvisorFirstAvailableHint()) !== -1) {
          const overlayPos = this.MapToScreen(this.m_Player.location.position.x - 3, this.m_Player.location.position.y - 1);
          if (this.m_HintAvailableOverlay == null) {
            this.m_HintAvailableOverlay = new OverlayPopup(
              null,
              Color.White, Color.White, Color.Black,
              overlayPos);
            this.AddOverlay(this.m_HintAvailableOverlay);
          } else {
            this.m_HintAvailableOverlay.screenPosition = overlayPos;
            if (!this.HasOverlay(this.m_HintAvailableOverlay))
              this.AddOverlay(this.m_HintAvailableOverlay);
          }

          const { title: hintTitle } = this.GetAdvisorHintText(availableHint as AdvisorHint);
          this.m_HintAvailableOverlay.lines = [
            `HINT AVAILABLE PRESS <${s_KeyBindings.get(PlayerCommand.ADVISOR) ?? ""}>`,
            hintTitle];
        } else if (this.m_HintAvailableOverlay != null && this.HasOverlay(this.m_HintAvailableOverlay)) {
          this.RemoveOverlay(this.m_HintAvailableOverlay);
        }
      }
      this.RedrawPlayScreen();

      // 2. Get input.
      // Peek keyboard & mouse until we got an event. (C# busy-loops here;
      // WaitKeyOrMouse is the async equivalent.)
      const ev = await this.WaitKeyOrMouse();
      const inKey = ev.key;
      const mousePos = ev.mousePos;
      const mouseButtons = ev.mouseButtons;

      // 3. Handle input
      if (inKey != null) {
        //////////////
        // Handle key
        //////////////
        const command = InputTranslator.keyToCommand(
          RogueGame.KeyBindings(), inKey.key, inKey.ctrl, inKey.alt, inKey.shift);
        if (command === PlayerCommand.QUIT_GAME) { // quit game.
          if (await this.HandleQuitGame()) {
            // stop sim thread.
            this.StopSimThread(true); // alpha10 abort allowed when quitting
            // quit asap.
            this.RedrawPlayScreen();
            this.m_IsGameRunning = false;
            return;
          }
        } else {
          switch (command) {
            // options, menu etc...
            case PlayerCommand.ABANDON_GAME:
              if (await this.HandleAbandonGame()) {
                this.StopSimThread(true); // alpha10 abort allowed when quitting
                loop = false;
                this.KillActor(null, this.m_Player, "suicide");
              }
              break;

            case PlayerCommand.HELP_MODE:
              await this.HandleHelpMode();
              break;

            case PlayerCommand.HINTS_SCREEN_MODE:
              await this.HandleHintsScreen();
              break;

            case PlayerCommand.ADVISOR:
              await this.HandleAdvisor(player);
              break;

            case PlayerCommand.OPTIONS_MODE:
              await this.HandleOptions(true);
              this.ApplyOptions(true);
              break;

            case PlayerCommand.KEYBINDING_MODE:
              await this.HandleRedefineKeys();
              break;

            case PlayerCommand.MESSAGE_LOG:
              await this.HandleMessageLog();
              break;

            // alpha10.1 moved sim thread responsability out to DoLoadGame
            case PlayerCommand.LOAD_GAME:
              // load.
              this.HandleLoadGame();
              // refresh player local variable!!
              player = this.m_Player;
              // stop looping.
              loop = false;
              // stop the update loop!
              this.m_HasLoadedGame = true;
              break;
            // alpha10.1 moved sim thread responsability out to DoSaveGame
            case PlayerCommand.SAVE_GAME:
              this.HandleSaveGame();
              break;

            case PlayerCommand.SCREENSHOT:
              this.HandleScreenshot();
              break;

            case PlayerCommand.CITY_INFO:
              await this.HandleCityInfo();
              break;

            // actual game actions.
            case PlayerCommand.WAIT_OR_SELF:
              if (await this.TryPlayerInsanity()) {
                loop = false;
                break;
              }
              loop = false;
              this.DoWait(player);
              break;

            case PlayerCommand.WAIT_LONG:
              if (await this.TryPlayerInsanity()) {
                loop = false;
                break;
              }
              loop = false;
              this.StartPlayerWaitLong(player);
              break;

            case PlayerCommand.MOVE_N:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.DoPlayerBump(player, Direction.N);
              break;
            case PlayerCommand.MOVE_NE:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.DoPlayerBump(player, Direction.NE);
              break;
            case PlayerCommand.MOVE_E:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.DoPlayerBump(player, Direction.E);
              break;
            case PlayerCommand.MOVE_SE:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.DoPlayerBump(player, Direction.SE);
              break;
            case PlayerCommand.MOVE_S:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.DoPlayerBump(player, Direction.S);
              break;
            case PlayerCommand.MOVE_SW:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.DoPlayerBump(player, Direction.SW);
              break;
            case PlayerCommand.MOVE_W:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.DoPlayerBump(player, Direction.W);
              break;
            case PlayerCommand.MOVE_NW:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.DoPlayerBump(player, Direction.NW);
              break;
            case PlayerCommand.USE_EXIT:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.DoUseExit(player, player.location.position);
              break;

            case PlayerCommand.ITEM_SLOT_0:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.DoPlayerItemSlot(player, 0, inKey);
              break;
            case PlayerCommand.ITEM_SLOT_1:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.DoPlayerItemSlot(player, 1, inKey);
              break;
            case PlayerCommand.ITEM_SLOT_2:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.DoPlayerItemSlot(player, 2, inKey);
              break;
            case PlayerCommand.ITEM_SLOT_3:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.DoPlayerItemSlot(player, 3, inKey);
              break;
            case PlayerCommand.ITEM_SLOT_4:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.DoPlayerItemSlot(player, 4, inKey);
              break;
            case PlayerCommand.ITEM_SLOT_5:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.DoPlayerItemSlot(player, 5, inKey);
              break;
            case PlayerCommand.ITEM_SLOT_6:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.DoPlayerItemSlot(player, 6, inKey);
              break;
            case PlayerCommand.ITEM_SLOT_7:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.DoPlayerItemSlot(player, 7, inKey);
              break;
            case PlayerCommand.ITEM_SLOT_8:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.DoPlayerItemSlot(player, 8, inKey);
              break;
            case PlayerCommand.ITEM_SLOT_9:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.DoPlayerItemSlot(player, 9, inKey);
              break;

            case PlayerCommand.RUN_TOGGLE:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              this.HandlePlayerRunToggle(player);
              break;

            case PlayerCommand.CLOSE_DOOR:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.HandlePlayerCloseDoor(player);
              break;
            case PlayerCommand.BARRICADE_MODE:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.HandlePlayerBarricade(player);
              break;
            case PlayerCommand.BREAK_MODE:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.HandlePlayerBreak(player);
              break;
            case PlayerCommand.BUILD_LARGE_FORTIFICATION:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.HandlePlayerBuildFortification(player, true);
              break;
            case PlayerCommand.BUILD_SMALL_FORTIFICATION:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.HandlePlayerBuildFortification(player, false);
              break;
            case PlayerCommand.ORDER_MODE:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.HandlePlayerOrderMode(player);
              break;
            case PlayerCommand.PULL_MODE: // alpha10
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.HandlePlayerPull(player);
              break;
            case PlayerCommand.PUSH_MODE:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.HandlePlayerPush(player);
              break;
            case PlayerCommand.FIRE_MODE:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.HandlePlayerFireMode(player);
              break;

            case PlayerCommand.SHOUT:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.HandlePlayerShout(player, null);
              break;

            case PlayerCommand.SLEEP:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.HandlePlayerSleep(player);
              break;

            case PlayerCommand.SWITCH_PLACE:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.HandlePlayerSwitchPlace(player);
              break;

            case PlayerCommand.USE_SPRAY:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.HandlePlayerUseSpray(player);
              break;

            case PlayerCommand.LEAD_MODE:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.HandlePlayerTakeLead(player);
              break;

            case PlayerCommand.GIVE_ITEM:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.HandlePlayerGiveItem(player, mousePos);
              break;

            case PlayerCommand.NEGOCIATE_TRADE: // alpha10
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.HandlePlayerNegociateTrade(player); // alpha10
              break;

            case PlayerCommand.MARK_ENEMIES_MODE:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              this.HandlePlayerMarkEnemies(player);
              break;

            case PlayerCommand.EAT_CORPSE:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.HandlePlayerEatCorpse(player, mousePos);
              break;

            case PlayerCommand.REVIVE_CORPSE:
              if (await this.TryPlayerInsanity()) { loop = false; break; }
              loop = !this.HandlePlayerReviveCorpse(player, mousePos);
              break;

            case PlayerCommand.NONE:
              break;

            default:
              throw new TypeError("command unhandled");
          }
        }
      } else {
        ////////////////
        // Handle mouse
        ////////////////
        // Look?
        const isLooking = this.HandleMouseLook(mousePos);
        if (isLooking)
          continue;

        // Inventory?
        const invRes = this.HandleMouseInventory(mousePos, mouseButtons, false);
        if (invRes.ok) {
          if (invRes.hasDoneAction) {
            loop = false;
          } else
            continue;
        }

        // Corpses?
        const corRes = this.HandleMouseOverCorpses(mousePos, mouseButtons, false);
        if (corRes.ok) {
          if (corRes.hasDoneAction) {
            loop = false;
          } else
            continue;
        }

        // Neither look nor inventory nor corpses, cleanup.
        this.ClearOverlays();
      }
    } while (loop);

    // Upkeep.
    this.UpdatePlayerFOV(player); // make sure LOS is up to date.
    this.ComputeViewRect(player.location.position);
    this.m_Session.lastTurnPlayerActed = this.m_Session.worldTime.turnCounter;
  }

  // C# TryPlayerInsanity — RogueGame.cs:6090
  // C# blocks on AddMessagePressEnter; async here.
  async TryPlayerInsanity(): Promise<boolean> {
    if (!this.m_Rules.isActorInsane(this.m_Player))
      return false;
    if (!this.m_Rules.rollChance(Rules.SANITY_INSANE_ACTION_CHANCE))
      return false;

    const insaneAction = this.GenerateInsaneAction(this.m_Player);
    if (insaneAction == null)
      return false;
    if (!insaneAction.isLegal())
      return false;

    this.ClearMessages();
    this.AddMessage(new Message("(your insanity takes over)", this.m_Player.location.map!.localTime.turnCounter, Color.Orange));
    if (!this.m_Player.isBotPlayer)
      await this.AddMessagePressEnter();

    insaneAction.perform();

    return true;
  }

  // C# HandleQuitGame — RogueGame.cs:6113
  // C# blocks on WaitYesOrNo; async here.
  async HandleQuitGame(): Promise<boolean> {
    this.AddMessage(this.MakeYesNoMessage("REALLY QUIT GAME"));
    this.RedrawPlayScreen();

    const answer = await this.WaitYesOrNo();

    if (!answer)
      this.AddMessage(new Message("Good. Keep roguing!", this.m_Session.worldTime.turnCounter, Color.Yellow));
    else
      this.AddMessage(new Message("Bye!", this.m_Session.worldTime.turnCounter, Color.Yellow));

    return answer;
  }

  // C# HandleAbandonGame — RogueGame.cs:6128
  // C# blocks on WaitYesOrNo; async here.
  async HandleAbandonGame(): Promise<boolean> {
    this.AddMessage(this.MakeYesNoMessage("REALLY KILL YOURSELF"));
    this.RedrawPlayScreen();

    const answer = await this.WaitYesOrNo();

    if (!answer)
      this.AddMessage(new Message("Good. No reason to make the undeads life easier by removing yours!", this.m_Session.worldTime.turnCounter, Color.Yellow));
    else
      this.AddMessage(new Message("You can't bear the horror anymore...", this.m_Session.worldTime.turnCounter, Color.Yellow));

    return answer;
  }

  // C# HandleScreenshot — RogueGame.cs:6143
  HandleScreenshot(): void {
    // prepare.
    this.AddMessage(new Message("Taking screenshot...", this.m_Session.worldTime.turnCounter, Color.Yellow));
    this.RedrawPlayScreen();

    // shot it!
    const shotname = this.DoTakeScreenshot();
    if (shotname === null) {
      this.AddMessage(new Message("Could not save screenshot.", this.m_Session.worldTime.turnCounter, Color.Red));
    } else {
      this.AddMessage(new Message(`screenshot ${shotname} saved.`, this.m_Session.worldTime.turnCounter, Color.Yellow));
    }

    // refresh.
    this.RedrawPlayScreen();
  }

  // C# DoTakeScreenshot — RogueGame.cs:6164
  // C# returns `null` when the file cannot be written.
  DoTakeScreenshot(): string | null {
    const shotname = this.GetUserNewScreenshotName();
    if (this.m_UI.UI_SaveScreenshot(this.ScreenshotFilePath(shotname)) != null)
      return shotname;
    else
      return null;
  }

  // C# HandleHelpMode — RogueGame.cs:6173
  // C# blocks on WaitEnter/UI_WaitKey; async here.
  async HandleHelpMode(): Promise<void> {
    if (this.m_Manual == null) {
      this.m_UI.UI_Clear(Color.Black);
      let gy = 0;
      this.m_UI.UI_DrawStringBold(Color.Red, "Game manual not available ingame.", 0, gy);
      gy += BOLD_LINE_SPACING;
      this.DrawFootnote(Color.White, "press ENTER");
      this.m_UI.UI_Repaint();
      await this.WaitEnter();
      return;
    }

    let loop = true;
    const lines = this.m_Manual.formatedLines;
    do {
      // draw header.
      this.m_UI.UI_Clear(Color.Black);
      let gy = 0;
      this.DrawHeader();
      gy += BOLD_LINE_SPACING;
      this.m_UI.UI_DrawStringBold(Color.Yellow, "Game Manual", 0, gy);
      gy += BOLD_LINE_SPACING;
      this.m_UI.UI_DrawStringBold(Color.White, "---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+", 0, gy);
      gy += BOLD_LINE_SPACING;

      // draw manual.
      let iLine = this.m_ManualLine;
      do {
        // ignore commands
        const ignore = (lines[iLine] === "<SECTION>");

        if (!ignore) {
          this.m_UI.UI_DrawStringBold(Color.LightGray, lines[iLine], 0, gy);
          gy += BOLD_LINE_SPACING;
        }
        ++iLine;
      } while (iLine < lines.length && gy < CANVAS_HEIGHT - 2 * BOLD_LINE_SPACING);

      // draw foot.
      this.m_UI.UI_DrawStringBold(Color.White, "---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+", 0, gy);
      gy += BOLD_LINE_SPACING;
      this.DrawFootnote(Color.White, "cursor and PgUp/PgDn to move, numbers to jump to section, ESC to leave");

      this.m_UI.UI_Repaint();

      // get command.
      const key = await this.m_UI.UI_WaitKey();
      const choice = this.KeyToChoiceNumber(key);

      if (choice >= 0) {
        if (choice === 0) {
          this.m_ManualLine = 0;
        } else {
          // jump to Nth section.
          const prevLine = this.m_ManualLine;
          let sectionCount = 0;
          this.m_ManualLine = 0;
          while (sectionCount < choice && this.m_ManualLine < lines.length) {
            if (lines[this.m_ManualLine] === "<SECTION>") {
              ++sectionCount;
            }
            ++this.m_ManualLine;
          }

          // if section not found, don't move.
          if (this.m_ManualLine >= lines.length) {
            this.m_ManualLine = prevLine;
          }
        }
      } else {
        switch (key.key) {
          case "Escape":
            loop = false;
            break;

          case "ArrowUp":
            --this.m_ManualLine;
            break;
          case "ArrowDown":
            ++this.m_ManualLine;
            break;
          case "PageUp":
            this.m_ManualLine -= TEXTFILE_LINES_PER_PAGE;
            break;
          case "PageDown":
            this.m_ManualLine += TEXTFILE_LINES_PER_PAGE;
            break;
        }
      }

      if (this.m_ManualLine < 0) this.m_ManualLine = 0;
      if (this.m_ManualLine + TEXTFILE_LINES_PER_PAGE >= lines.length) this.m_ManualLine = Math.max(0, lines.length - TEXTFILE_LINES_PER_PAGE);
    } while (loop);
  }

  // C# HandleHintsScreen — RogueGame.cs:6286
  // C# blocks on UI_WaitKey/UI_Wait; async here.
  async HandleHintsScreen(): Promise<void> {
    // draw header.
    this.m_UI.UI_Clear(Color.Black);
    let gy = 0;
    this.DrawHeader();
    gy += BOLD_LINE_SPACING;
    this.m_UI.UI_DrawStringBold(Color.Yellow, "Advisor Hints", 0, gy);
    gy += BOLD_LINE_SPACING;

    // prepare : get all the hints text into one huuuuuge list of line :D
    this.m_UI.UI_DrawStringBold(Color.White, "preparing...", 0, gy);
    gy += BOLD_LINE_SPACING;
    this.m_UI.UI_Repaint();
    const lines: string[] = [];
    for (let i: number = AdvisorHint._FIRST; i < AdvisorHint._COUNT; i++) {
      const hint = i as AdvisorHint;
      const hintText = this.GetAdvisorHintText(hint);
      let title = hintText.title;
      if (s_Hints.isAdvisorHintGiven(hint)) title += " (hint already given)"; // alpha10

      lines.push(`HINT ${i} : ${title}`);
      lines.push(...hintText.body);
      lines.push("~~~~");
      lines.push("");
    }

    // display & handle loop.
    let currentLine = 0;
    let loop = true;
    do {
      // header.
      this.m_UI.UI_Clear(Color.Black);
      gy = 0;
      this.DrawHeader();
      gy += BOLD_LINE_SPACING;
      this.m_UI.UI_DrawStringBold(Color.Yellow, "Advisor Hints", 0, gy);
      gy += BOLD_LINE_SPACING;

      // display currently viewed lines.
      this.m_UI.UI_DrawStringBold(Color.White, "---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+", 0, gy);
      gy += BOLD_LINE_SPACING;
      let iLine = currentLine;
      do {
        this.m_UI.UI_DrawStringBold(Color.LightGray, lines[iLine], 0, gy);
        gy += BOLD_LINE_SPACING;
        ++iLine;
      } while (iLine < lines.length && gy < CANVAS_HEIGHT - 2 * BOLD_LINE_SPACING);

      // draw foot.
      this.m_UI.UI_DrawStringBold(Color.White, "---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+", 0, gy);
      gy += BOLD_LINE_SPACING;
      this.DrawFootnote(Color.White, "cursor and PgUp/PgDn to move, R to reset hints, ESC to leave");

      this.m_UI.UI_Repaint();

      // get command.
      const key = await this.m_UI.UI_WaitKey();
      switch (key.key) {
        case "Escape":
          loop = false;
          break;

        case "ArrowUp":
          --currentLine;
          break;
        case "ArrowDown":
          ++currentLine;
          break;
        case "PageUp":
          currentLine -= TEXTFILE_LINES_PER_PAGE;
          break;
        case "PageDown":
          currentLine += TEXTFILE_LINES_PER_PAGE;
          break;

        case "r":
        case "R":
          // do it.
          s_Hints.resetAllHints();

          // notify.
          this.m_UI.UI_Clear(Color.Black);
          gy = 0;
          this.DrawHeader();
          gy += BOLD_LINE_SPACING;
          this.m_UI.UI_DrawStringBold(Color.Yellow, "Advisor Hints", 0, gy);
          gy += BOLD_LINE_SPACING;
          this.m_UI.UI_DrawStringBold(Color.White, "Hints reset done.", 0, gy);
          this.m_UI.UI_Repaint();
          await this.m_UI.UI_Wait(DELAY_LONG);
          break;
      }

      if (currentLine < 0) currentLine = 0;
      if (currentLine + TEXTFILE_LINES_PER_PAGE >= lines.length) currentLine = Math.max(0, lines.length - TEXTFILE_LINES_PER_PAGE);
    } while (loop);

  }

  // C# HandleMessageLog — RogueGame.cs:6392
  // C# blocks on WaitEscape; async here.
  async HandleMessageLog(): Promise<void> {
    // draw header.
    this.m_UI.UI_Clear(Color.Black);
    let gy = 0;
    this.DrawHeader();
    gy += BOLD_LINE_SPACING;
    this.m_UI.UI_DrawStringBold(Color.Yellow, "Message Log", 0, gy);
    gy += BOLD_LINE_SPACING;
    this.m_UI.UI_DrawStringBold(Color.White, "---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+", 0, gy);
    gy += BOLD_LINE_SPACING;

    // log.
    for (const msg of this.m_MessageManager.history) {
      this.m_UI.UI_DrawString(msg.color, msg.text, 0, gy);
      gy += LINE_SPACING;
    }

    // foot.
    this.DrawFootnote(Color.White, "press ESC to leave");

    // wait.
    this.m_UI.UI_Repaint();
    await this.WaitEscape();
  }

  // C# HandleCityInfo — RogueGame.cs:6419
  // C# blocks on WaitEscape; async here.
  async HandleCityInfo(): Promise<void> {
    let gx = 0;
    let gy = 0;

    this.m_UI.UI_Clear(Color.Black);
    this.m_UI.UI_DrawStringBold(Color.White, "CITY INFORMATION", gy, gy);
    gy += 2 * BOLD_LINE_SPACING;

    /////////////////////
    // Undead : no info!
    // Living : normal.
    /////////////////////
    if (this.m_Player.model.abilities.isUndead) {
      // Undead : no info
      this.m_UI.UI_DrawStringBold(Color.Red, "You can't remember where you are...", gx, gy);
      gy += BOLD_LINE_SPACING;
      this.m_UI.UI_DrawStringBold(Color.Red, "Must be that rotting brain of yours...", gx, gy);
      gy += 2 * BOLD_LINE_SPACING;
    } else {
      const world = this.m_Session.world!;
      const curMap = this.m_Session.currentMap!;
      const playerDistrict = curMap.district!;

      // Living : show info
      // City map
      this.m_UI.UI_DrawStringBold(Color.White, "> DISTRICTS LAYOUT", gx, gy);
      gy += BOLD_LINE_SPACING;

      // coordinates.
      gy += BOLD_LINE_SPACING;
      for (let y = 0; y < world.size; y++) {
        const color = (y === playerDistrict.worldPosition.y ? Color.LightGreen : Color.White);
        this.m_UI.UI_DrawStringBold(color, String(y), 20, gy + y * 3 * BOLD_LINE_SPACING + BOLD_LINE_SPACING);
        this.m_UI.UI_DrawStringBold(color, ".", 20, gy + y * 3 * BOLD_LINE_SPACING);
        this.m_UI.UI_DrawStringBold(color, ".", 20, gy + y * 3 * BOLD_LINE_SPACING + 2 * BOLD_LINE_SPACING);
      }
      gy -= BOLD_LINE_SPACING;
      for (let x = 0; x < world.size; x++) {
        const color = (x === playerDistrict.worldPosition.x ? Color.LightGreen : Color.White);
        this.m_UI.UI_DrawStringBold(color, `..${String.fromCharCode(65 + x)}..`, 32 + x * 48, gy);
      }
      // districts.
      gy += BOLD_LINE_SPACING;
      const mx = 32;
      const my = gy;
      for (let y = 0; y < world.size; y++)
        for (let x = 0; x < world.size; x++) {
          const d = world.getDistrict(x, y);
          if (d == null) continue; // TS: grid starts null-filled; C# assumes populated
          const dStatus = d === playerDistrict ? "*" : this.m_Session.scoring.hasVisited(d.entryMap!) ? "-" : "?";
          let dColor: Color;
          let dChar: string;
          switch (d.kind) {
            case DistrictKind.BUSINESS: dColor = Color.Red; dChar = "Bus"; break;
            case DistrictKind.GENERAL: dColor = Color.Gray; dChar = "Gen"; break;
            case DistrictKind.GREEN: dColor = Color.Green; dChar = "Gre"; break;
            case DistrictKind.RESIDENTIAL: dColor = Color.Orange; dChar = "Res"; break;
            case DistrictKind.SHOPPING: dColor = Color.White; dChar = "Sho"; break;
            default:
              throw new RangeError("unhandled district kind");
          }

          let lchar = "";
          for (let i = 0; i < 5; i++)
            lchar += dStatus;
          const lColor = (d === playerDistrict ? Color.LightGreen : dColor);

          this.m_UI.UI_DrawStringBold(lColor, lchar, mx + x * 48, my + (y * 3) * BOLD_LINE_SPACING);
          this.m_UI.UI_DrawStringBold(lColor, dStatus, mx + x * 48, my + (y * 3 + 1) * BOLD_LINE_SPACING);
          this.m_UI.UI_DrawStringBold(dColor, dChar, mx + x * 48 + 8, my + (y * 3 + 1) * BOLD_LINE_SPACING);
          this.m_UI.UI_DrawStringBold(lColor, dStatus, mx + x * 48 + 4 * 8, my + (y * 3 + 1) * BOLD_LINE_SPACING);
          this.m_UI.UI_DrawStringBold(lColor, lchar, mx + x * 48, my + (y * 3 + 2) * BOLD_LINE_SPACING);
        }
      // subway line.
      const subwayChar = "=";
      const subwayY = Math.floor(world.size / 2);
      for (let x = 1; x < world.size; x++) {
        this.m_UI.UI_DrawStringBold(Color.White, subwayChar, mx + x * 48 - 8, my + (subwayY * 3) * BOLD_LINE_SPACING + BOLD_LINE_SPACING);
      }

      gy += (world.size * 3 + 1) * BOLD_LINE_SPACING;
      this.m_UI.UI_DrawStringBold(Color.White, "Legend", gx, gy);
      gy += BOLD_LINE_SPACING;
      this.m_UI.UI_DrawString(Color.White, "  *   - current     ?   - unvisited", gx, gy);
      gy += LINE_SPACING;
      this.m_UI.UI_DrawString(Color.White, "  Bus - Business    Gen - General    Gre - Green", gx, gy);
      gy += LINE_SPACING;
      this.m_UI.UI_DrawString(Color.White, "  Res - Residential Sho - Shopping", gx, gy);
      gy += LINE_SPACING;
      this.m_UI.UI_DrawString(Color.White, "  =   - Subway Line", gx, gy);
      gy += LINE_SPACING;

      // Notable locations
      gy += BOLD_LINE_SPACING;
      this.m_UI.UI_DrawStringBold(Color.White, "> NOTABLE LOCATIONS", gx, gy);
      gy += BOLD_LINE_SPACING;
      const buildingsY = gy;
      for (let y = 0; y < world.size; y++)
        for (let x = 0; x < world.size; x++) {
          const d = world.getDistrict(x, y);
          if (d == null) continue; // TS: grid starts null-filled; C# assumes populated
          const districtMap = d.entryMap;
          if (districtMap == null) continue; // TS: C# assumed non-null

          // Subway station?
          const subwayZone = districtMap.getZoneByPartialName(NAME_SUBWAY_STATION);
          if (subwayZone != null) {
            this.m_UI.UI_DrawStringBold(Color.Blue, `at ${World.CoordToString(x, y)} : ${subwayZone.name}.`, gx, gy);
            gy += BOLD_LINE_SPACING;
            if (gy >= CANVAS_HEIGHT - 2 * BOLD_LINE_SPACING) {
              gy = buildingsY;
              gx += 25 * BOLD_LINE_SPACING;
            }
          }

          // Police station?
          if (districtMap === this.m_Session.uniqueMaps.policeStation_OfficesLevel.theMap?.district?.entryMap) {
            this.m_UI.UI_DrawStringBold(Color.CadetBlue, `at ${World.CoordToString(x, y)} : Police Station.`, gx, gy);
            gy += BOLD_LINE_SPACING;
            if (gy >= CANVAS_HEIGHT - 2 * BOLD_LINE_SPACING) {
              gy = buildingsY;
              gx += 25 * BOLD_LINE_SPACING;
            }
          }

          // Hospital?
          if (districtMap === this.m_Session.uniqueMaps.hospital_Admissions.theMap?.district?.entryMap) {
            this.m_UI.UI_DrawStringBold(Color.White, `at ${World.CoordToString(x, y)} : Hospital.`, gx, gy);
            gy += BOLD_LINE_SPACING;
            if (gy >= CANVAS_HEIGHT - 2 * BOLD_LINE_SPACING) {
              gy = buildingsY;
              gx += 25 * BOLD_LINE_SPACING;
            }
          }

          // Secrets
          // - CHAR Underground Facility?
          if (this.m_Session.playerKnows_CHARUndergroundFacilityLocation &&
              districtMap === this.m_Session.uniqueMaps.charUndergroundFacility.theMap?.district?.entryMap) {
            this.m_UI.UI_DrawStringBold(Color.Red, `at ${World.CoordToString(x, y)} : ${this.m_Session.uniqueMaps.charUndergroundFacility.theMap?.name}.`, gx, gy);
            gy += BOLD_LINE_SPACING;
            if (gy >= CANVAS_HEIGHT - 2 * BOLD_LINE_SPACING) {
              gy = buildingsY;
              gx += 25 * BOLD_LINE_SPACING;
            }
          }
          // - The Sewers Thing?
          const sewersThing = this.m_Session.uniqueActors.theSewersThing.theActor;
          if (this.m_Session.playerKnows_TheSewersThingLocation &&
              sewersThing != null &&
              districtMap === sewersThing.location.map?.district?.entryMap &&
              !sewersThing.isDead) {
            this.m_UI.UI_DrawStringBold(Color.Red, `at ${World.CoordToString(x, y)} : The Sewers Thing lives down there.`, gx, gy);
            gy += BOLD_LINE_SPACING;
            if (gy >= CANVAS_HEIGHT - 2 * BOLD_LINE_SPACING) {
              gy = buildingsY;
              gx += 25 * BOLD_LINE_SPACING;
            }
          }
        }
    }

    this.DrawFootnote(Color.White, "press ESC to leave");
    this.m_UI.UI_Repaint();
    await this.WaitEscape();
  }

  // C# HandleMouseLook — RogueGame.cs:6622
  HandleMouseLook(mousePos: Point): boolean {
    const mouseMap = this.MouseToMap(mousePos);
    if (!this.IsInViewRect(mouseMap))
      return false;

    if (!this.m_Session.currentMap!.isInBoundsPoint(mouseMap))
      return true;

    this.ClearOverlays();
    if (this.IsVisibleToPlayer(this.m_Session.currentMap!, mouseMap)) {
      const tileScreenPos = this.MapToScreen(mouseMap);
      const description = this.DescribeStuffAt(this.m_Session.currentMap!, mouseMap);
      if (description != null) {
        const popupPos = new Point(tileScreenPos.x + TILE_SIZE, tileScreenPos.y);
        this.AddOverlay(new OverlayPopup(description, Color.White, Color.White, this.POPUP_FILLCOLOR, popupPos));
        if (s_Options.showTargets) {
          const actorThere = this.m_Session.currentMap!.getActorAtPoint(mouseMap);
          if (actorThere != null)
            this.DrawActorRelations(actorThere);
        }
      }
    }

    return true;
  }

  // C# HandleMouseInventory — RogueGame.cs:6656
  HandleMouseInventory(mousePos: Point, mouseButtons: MouseButton | null, _hasDoneAction: boolean): { ok: boolean; hasDoneAction: boolean } {
    const hit = this.MouseToInventoryItem(mousePos);
    const inv = hit.inv;
    if (inv == null) {
      return { ok: false, hasDoneAction: false };
    }

    const isPlayerInventory = (inv === this.m_Player.inventory);
    let hasDoneAction = false;
    this.ClearOverlays();
    const itemPos = hit.itemPos;
    this.AddOverlay(new OverlayRect(Color.Cyan, new Rect(itemPos.x, itemPos.y, 32, 32)));
    this.AddOverlay(new OverlayRect(Color.Cyan, new Rect(itemPos.x + 1, itemPos.y + 1, 30, 30)));
    const it = hit.result;
    if (it != null) {
      const lines = this.DescribeItemLong(it, isPlayerInventory, hit.iSlot);
      const longestLine = 1 + this.FindLongestLine(lines);
      const ovX = itemPos.x - 7 * longestLine;
      const ovY = itemPos.y + 32;

      this.AddOverlay(new OverlayPopup(lines, Color.White, Color.White, this.POPUP_FILLCOLOR, new Point(ovX, ovY)));

      if (mouseButtons != null) {
        if (mouseButtons === MouseButton.Left)
          hasDoneAction = this.OnLMBItem(inv, it);
        else if (mouseButtons === MouseButton.Right)
          hasDoneAction = this.OnRMBItem(inv, it);
      }
    }

    return { ok: true, hasDoneAction };
  }

  // C# MouseToInventoryItem — RogueGame.cs:6698
  MouseToInventoryItem(screen: Point): { result: Item | null; inv: Inventory | null; itemPos: Point; iSlot: number } {
    let inv: Inventory | null = null;
    let itemPos = Point.Zero;
    let iSlot = -1;

    if (this.m_Player == null)
      return { result: null, inv, itemPos, iSlot };

    const playerInv = this.m_Player.inventory!;
    const playerSlot = this.MouseToInventorySlot(INVENTORYPANEL_X, INVENTORYPANEL_Y, screen.x, screen.y);
    const playerItemIndex = playerSlot.x + playerSlot.y * INVENTORY_SLOTS_PER_LINE;
    if (playerItemIndex >= 0 && playerItemIndex < playerInv.maxCapacity) {
      inv = playerInv;
      itemPos = this.InventorySlotToScreen(INVENTORYPANEL_X, INVENTORYPANEL_Y, playerSlot.x, playerSlot.y);
      iSlot = playerItemIndex;
      return { result: playerInv.getItem(playerItemIndex), inv, itemPos, iSlot };
    }

    const groundInv = this.m_Player.location.map?.getItemsAt(this.m_Player.location.position) ?? null;
    const groundSlot = this.MouseToInventorySlot(INVENTORYPANEL_X, GROUNDINVENTORYPANEL_Y, screen.x, screen.y);
    itemPos = this.InventorySlotToScreen(INVENTORYPANEL_X, GROUNDINVENTORYPANEL_Y, groundSlot.x, groundSlot.y);
    if (groundInv == null)
      return { result: null, inv, itemPos, iSlot };
    const groundItemIndex = groundSlot.x + groundSlot.y * INVENTORY_SLOTS_PER_LINE;
    if (groundItemIndex >= 0 && groundItemIndex < groundInv.maxCapacity) {
      inv = groundInv;
      iSlot = groundItemIndex;
      return { result: groundInv.getItem(groundItemIndex), inv, itemPos, iSlot };
    }

    return { result: null, inv, itemPos, iSlot };
  }

  // C# OnLMBItem — RogueGame.cs:6734
  OnLMBItem(inv: Inventory, it: Item): boolean {
    if (inv === this.m_Player.inventory) {
      if (it.isEquipped) {
        const res = this.m_Rules.canActorUnequipItem(this.m_Player, it);
        if (res.ok) {
          this.DoUnequipItem(this.m_Player, it);
          return false;
        } else {
          this.AddMessage(this.MakeErrorMessage(`Cannot unequip ${it.theName} : ${res.reason}.`));
          return false;
        }
      } else if (it.model.isEquipable) {
        const res = this.m_Rules.canActorEquipItem(this.m_Player, it);
        if (res.ok) {
          this.DoEquipItem(this.m_Player, it);
          return false;
        } else {
          this.AddMessage(this.MakeErrorMessage(`Cannot equip ${it.theName} : ${res.reason}.`));
          return false;
        }
      } else {
        const res = this.m_Rules.canActorUseItem(this.m_Player, it);
        if (res.ok) {
          this.DoUseItem(this.m_Player, it);
          return true;
        } else {
          this.AddMessage(this.MakeErrorMessage(`Cannot use ${it.theName} : ${res.reason}.`));
        }
      }
    } else {
      const res = this.m_Rules.canActorGetItem(this.m_Player, it);
      if (res.ok) {
        this.DoTakeItem(this.m_Player, this.m_Player.location.position, it);
        return true;
      } else {
        this.AddMessage(this.MakeErrorMessage(`Cannot take ${it.theName} : ${res.reason}.`));
        return false;
      }
    }

    return false;
  }

  // C# OnRMBItem — RogueGame.cs:6801
  OnRMBItem(inv: Inventory, it: Item): boolean {
    if (inv === this.m_Player.inventory) {
      const res = this.m_Rules.canActorDropItem(this.m_Player, it);
      if (res.ok) {
        this.DoDropItem(this.m_Player, it);
        return true;
      } else {
        this.AddMessage(this.MakeErrorMessage(`Cannot drop ${it.theName} : ${res.reason}.`));
        return false;
      }
    }

    return false;
  }

  // C# HandleMouseOverCorpses — RogueGame.cs:6822
  HandleMouseOverCorpses(mousePos: Point, mouseButtons: MouseButton | null, _hasDoneAction: boolean): { ok: boolean; hasDoneAction: boolean } {
    const hit = this.MouseToCorpse(mousePos);
    const corpse = hit.result;
    if (corpse == null) {
      return { ok: false, hasDoneAction: false };
    }

    let hasDoneAction = false;
    this.ClearOverlays();
    const corpsePos = hit.corpsePos;
    this.AddOverlay(new OverlayRect(Color.Cyan, new Rect(corpsePos.x, corpsePos.y, 32, 32)));
    this.AddOverlay(new OverlayRect(Color.Cyan, new Rect(corpsePos.x + 1, corpsePos.y + 1, 30, 30)));
    if (corpse != null) {
      const lines = this.DescribeCorpseLong(corpse, true);
      const longestLine = 1 + this.FindLongestLine(lines);
      const ovX = corpsePos.x - 7 * longestLine;
      const ovY = corpsePos.y + 32;

      this.AddOverlay(new OverlayPopup(lines, Color.White, Color.White, this.POPUP_FILLCOLOR, new Point(ovX, ovY)));

      if (mouseButtons != null) {
        if (mouseButtons === MouseButton.Left)
          hasDoneAction = this.OnLMBCorpse(corpse);
        else if (mouseButtons === MouseButton.Right)
          hasDoneAction = this.OnRMBCorpse(corpse);
      }
    }

    return { ok: true, hasDoneAction };
  }

  // C# MouseToCorpse — RogueGame.cs:6861
  MouseToCorpse(screen: Point): { result: Corpse | null; corpsePos: Point } {
    let corpsePos = Point.Zero;

    if (this.m_Player == null)
      return { result: null, corpsePos };

    const corpsesList = this.m_Player.location.map?.getCorpsesAt(this.m_Player.location.position) ?? null;
    if (corpsesList == null)
      return { result: null, corpsePos };

    const corpseSlot = this.MouseToInventorySlot(INVENTORYPANEL_X, CORPSESPANEL_Y, screen.x, screen.y);
    corpsePos = this.InventorySlotToScreen(INVENTORYPANEL_X, CORPSESPANEL_Y, corpseSlot.x, corpseSlot.y);
    const corpseIndex = corpseSlot.x + corpseSlot.y * INVENTORY_SLOTS_PER_LINE;
    if (corpseIndex >= 0 && corpseIndex < corpsesList.length)
      return { result: corpsesList[corpseIndex], corpsePos };

    return { result: null, corpsePos };
  }

  // C# OnLMBCorpse — RogueGame.cs:6880
  OnLMBCorpse(c: Corpse): boolean {
    if (c.isDragged) {
      const res = this.m_Rules.canActorStopDragCorpse(this.m_Player, c);
      if (res.ok) {
        this.DoStopDragCorpse(this.m_Player, c);
        return false;
      } else {
        this.AddMessage(this.MakeErrorMessage(`Cannot stop dragging ${c.deadGuy.name} corpse : ${res.reason}.`));
        return false;
      }
    } else {
      const res = this.m_Rules.canActorStartDragCorpse(this.m_Player, c);
      if (res.ok) {
        this.DoStartDragCorpse(this.m_Player, c);
        return false;
      } else {
        this.AddMessage(this.MakeErrorMessage(`Cannot start dragging ${c.deadGuy.name} corpse : ${res.reason}.`));
        return false;
      }
    }
  }

  // C# OnRMBCorpse — RogueGame.cs:6912
  OnRMBCorpse(c: Corpse): boolean {
    if (this.m_Player.model.abilities.isUndead) {
      const res = this.m_Rules.canActorEatCorpse(this.m_Player, c);
      if (res.ok) {
        this.DoEatCorpse(this.m_Player, c);
        return true;
      } else {
        this.AddMessage(this.MakeErrorMessage(`Cannot eat ${c.deadGuy.name} corpse : ${res.reason}.`));
        return false;
      }
    } else {
      const res = this.m_Rules.canActorButcherCorpse(this.m_Player, c);
      if (res.ok) {
        this.DoButcherCorpse(this.m_Player, c);
        return true;
      } else {
        this.AddMessage(this.MakeErrorMessage(`Cannot butcher ${c.deadGuy.name} corpse : ${res.reason}.`));
        return false;
      }
    }
  }

  // C# HandlePlayerEatCorpse — RogueGame.cs:6943
  HandlePlayerEatCorpse(player: Actor, mousePos: Point): boolean {
    const hit = this.MouseToCorpse(mousePos);
    const corpse = hit.result;
    if (corpse == null)
      return false;

    const res = this.m_Rules.canActorEatCorpse(player, corpse);
    if (!res.ok) {
      this.AddMessage(this.MakeErrorMessage(`Cannot eat ${corpse.deadGuy.name} corpse : ${res.reason}.`));
      return false;
    }

    this.DoEatCorpse(player, corpse);
    return true;
  }

  // C# HandlePlayerReviveCorpse — RogueGame.cs:6964
  HandlePlayerReviveCorpse(player: Actor, mousePos: Point): boolean {
    const hit = this.MouseToCorpse(mousePos);
    const corpse = hit.result;
    if (corpse == null)
      return false;

    const res = this.m_Rules.canActorReviveCorpse(player, corpse);
    if (!res.ok) {
      this.AddMessage(this.MakeErrorMessage(`Cannot revive ${corpse.deadGuy.name} : ${res.reason}.`));
      return false;
    }

    this.DoReviveCorpse(player, corpse);
    return true;
  }

  // C# DoStartDragCorpse — RogueGame.cs:6985
  DoStartDragCorpse(a: Actor, c: Corpse): void {
    c.draggedBy = a;
    a.draggedCorpse = c;
    if (this.IsVisibleToPlayer(a))
      this.AddMessage(this.MakeMessage(a, `${this.Conjugate(a, this.VERB_START)} dragging ${c.deadGuy.name} corpse.`));
  }

  // C# DoStopDragCorpse — RogueGame.cs:6993
  DoStopDragCorpse(a: Actor, c: Corpse): void {
    c.draggedBy = null;
    a.draggedCorpse = null;
    if (this.IsVisibleToPlayer(a))
      this.AddMessage(this.MakeMessage(a, `${this.Conjugate(a, this.VERB_STOP)} dragging ${c.deadGuy.name} corpse.`));
  }

  // C# DoStopDraggingCorpses — RogueGame.cs:7001
  DoStopDraggingCorpses(a: Actor): void {
    if (a.draggedCorpse != null) {
      this.DoStopDragCorpse(a, a.draggedCorpse);
    }
  }

  // C# DoButcherCorpse — RogueGame.cs:7009
  DoButcherCorpse(a: Actor, c: Corpse): void {
    const isVisible = this.IsVisibleToPlayer(a);

    this.SpendActorActionPoints(a, Rules.BASE_ACTION_COST);

    this.SeeingCauseInsanity(a, a.location, Rules.SANITY_HIT_BUTCHERING_CORPSE, `${a.name} butchering ${c.deadGuy.name}`);

    const dmg = this.m_Rules.actorDamageVsCorpses(a);

    if (isVisible)
      this.AddMessage(this.MakeMessage(a, `${this.Conjugate(a, this.VERB_BUTCHER)} ${c.deadGuy.name} corpse for ${dmg} damage.`));

    this.InflictDamageToCorpse(c, dmg);

    if (c.hitPoints <= 0) {
      this.DestroyCorpse(c, a.location.map!);
      if (isVisible)
        this.AddMessage(new Message(`${c.deadGuy.name} corpse is no more.`, a.location.map!.localTime.turnCounter, Color.Purple));
    }
  }

  // C# DoEatCorpse — RogueGame.cs:7036
  DoEatCorpse(a: Actor, c: Corpse): void {
    const isVisible = this.IsVisibleToPlayer(a);

    this.SpendActorActionPoints(a, Rules.BASE_ACTION_COST);

    const dmg = this.m_Rules.actorDamageVsCorpses(a);

    if (isVisible) {
      this.AddMessage(this.MakeMessage(a, `${this.Conjugate(a, this.VERB_FEAST_ON)} ${c.deadGuy.name} corpse.`));
      this.m_MusicManager.stop();
      this.m_MusicManager.play(GameSounds.UNDEAD_EAT);
    }

    this.InflictDamageToCorpse(c, dmg);

    if (c.hitPoints <= 0) {
      this.DestroyCorpse(c, a.location.map!);
      if (isVisible)
        this.AddMessage(new Message(`${c.deadGuy.name} corpse is no more.`, a.location.map!.localTime.turnCounter, Color.Purple));
    }

    if (a.model.abilities.isUndead) {
      this.RegenActorHitPoints(a, this.m_Rules.actorBiteHpRegen(a, dmg));
      a.foodPoints = Math.min(a.foodPoints + this.m_Rules.actorBiteNutritionValue(a, dmg), this.m_Rules.actorMaxRot(a));
    } else {
      a.foodPoints = Math.min(a.foodPoints + this.m_Rules.actorBiteNutritionValue(a, dmg), this.m_Rules.actorMaxFood(a));
      this.InfectActor(a, this.m_Rules.corpseEeatingInfectionTransmission(c.deadGuy.infection));
    }

    this.SeeingCauseInsanity(
      a,
      a.location,
      a.model.abilities.isUndead ? Rules.SANITY_HIT_UNDEAD_EATING_CORPSE : Rules.SANITY_HIT_LIVING_EATING_CORPSE,
      `${a.name} eating ${c.deadGuy.name}`
    );
  }

  // C# DoReviveCorpse — RogueGame.cs:7085
  DoReviveCorpse(actor: Actor, corpse: Corpse): void {
    const visible = this.IsVisibleToPlayer(actor);

    this.SpendActorActionPoints(actor, Rules.BASE_ACTION_COST);

    const map = actor.location.map!;
    const revivePoints = map.filterAdjacentInMap(
      actor.location.position,
      (pt: Point) => {
        if (map.getActorAtPoint(pt) != null) return false;
        if (map.getMapObjectAt(pt.x, pt.y) != null) return false;
        return true;
      }
    );

    if (revivePoints == null || revivePoints.length === 0) {
      if (visible)
        this.AddMessage(this.MakeMessage(actor, `${this.Conjugate(actor, this.VERB_HAVE)} not enough room for reviving ${corpse.deadGuy.name}.`));
      return;
    }
    const revivePt = revivePoints[this.m_Rules.roll(0, revivePoints.length)];

    const medikit = actor.inventory!.getSmallestStackByModel(Models.items.get(ItemID.MEDICINE_MEDIKIT)!);
    if (medikit != null) {
      actor.inventory!.consume(medikit);
    }

    const chance = this.m_Rules.corpseReviveChance(actor, corpse);
    if (this.m_Rules.rollChance(chance)) {
      corpse.deadGuy.isDead = false;
      corpse.deadGuy.hitPoints = this.m_Rules.corpseReviveHPs(actor, corpse);
      corpse.deadGuy.doll.removeDecoration(GameImages.BLOODIED);
      corpse.deadGuy.activity = Activity.IDLE;
      corpse.deadGuy.targetActor = null;
      map.removeCorpse(corpse);
      map.placeActor(corpse.deadGuy, revivePt);

      if (visible)
        this.AddMessage(this.MakeMessage(actor, this.Conjugate(actor, this.VERB_REVIVE), corpse.deadGuy));

      if (!this.m_Rules.areEnemies(actor, corpse.deadGuy))
        this.DoSay(corpse.deadGuy, actor, "Thank you, you saved my life!", SayFlags.NONE);
    } else {
      if (visible)
        this.AddMessage(this.MakeMessage(actor, `${this.Conjugate(actor, this.VERB_FAIL)} to revive`, corpse.deadGuy));
    }
  }

  // C# InflictDamageToCorpse — RogueGame.cs:7141
  InflictDamageToCorpse(c: Corpse, dmg: number): void {
    c.hitPoints -= dmg;
  }

  // C# DestroyCorpse — RogueGame.cs:7146
  DestroyCorpse(c: Corpse, m: Map): void {
    if (c.draggedBy != null) {
      c.draggedBy.draggedCorpse = null;
      c.draggedBy = null;
    }
    m.removeCorpse(c);
  }

  // C# DoPlayerItemSlot — RogueGame.cs:7157
  DoPlayerItemSlot(player: Actor, slot: number, key: GameKeyEvent): boolean {
    if (key.ctrl)
      return this.DoPlayerItemSlotUse(player, slot);
    else if (key.shift)
      return this.DoPlayerItemSlotTake(player, slot);
    else if (key.alt)
      return this.DoPlayerItemSlotDrop(player, slot);

    return false;
  }

  // C# DoPlayerItemSlotUse — RogueGame.cs:7174
  DoPlayerItemSlotUse(player: Actor, slot: number): boolean {
    const inv = player.inventory!;
    const it = inv.getItem(slot);

    if (it == null) {
      this.AddMessage(this.MakeErrorMessage(`No item at inventory slot ${slot + 1}.`));
      return false;
    }

    if (it.isEquipped) {
      const res = this.m_Rules.canActorUnequipItem(player, it);
      if (res.ok) {
        this.DoUnequipItem(player, it);
        return false;
      } else {
        this.AddMessage(this.MakeErrorMessage(`Cannot unequip ${it.theName} : ${res.reason}.`));
        return false;
      }
    } else if (it.model.isEquipable) {
      const res = this.m_Rules.canActorEquipItem(player, it);
      if (res.ok) {
        this.DoEquipItem(player, it);
        return false;
      } else {
        this.AddMessage(this.MakeErrorMessage(`Cannot equip ${it.theName} : ${res.reason}.`));
        return false;
      }
    } else {
      const res = this.m_Rules.canActorUseItem(player, it);
      if (res.ok) {
        this.DoUseItem(player, it);
        return true;
      } else {
        this.AddMessage(this.MakeErrorMessage(`Cannot use ${it.theName} : ${res.reason}.`));
      }
    }

    return false;
  }

  // C# DoPlayerItemSlotTake — RogueGame.cs:7236
  DoPlayerItemSlotTake(player: Actor, slot: number): boolean {
    const inv = player.location.map?.getItemsAt(player.location.position) ?? null;

    if (inv == null || inv.isEmpty) {
      this.AddMessage(this.MakeErrorMessage("No items on ground."));
      return false;
    }

    const it = inv.getItem(slot);
    if (it == null) {
      this.AddMessage(this.MakeErrorMessage(`No item at ground slot ${slot + 1}.`));
      return false;
    }

    const res = this.m_Rules.canActorGetItem(player, it);
    if (res.ok) {
      this.DoTakeItem(player, player.location.position, it);
      return true;
    } else {
      this.AddMessage(this.MakeErrorMessage(`Cannot take ${it.theName} : ${res.reason}.`));
      return false;
    }
  }

  // C# DoPlayerItemSlotDrop — RogueGame.cs:7269
  DoPlayerItemSlotDrop(player: Actor, slot: number): boolean {
    const inv = player.inventory!;
    const it = inv.getItem(slot);

    if (it == null) {
      this.AddMessage(this.MakeErrorMessage(`No item at inventory slot ${slot + 1}.`));
      return false;
    }

    const res = this.m_Rules.canActorDropItem(player, it);
    if (res.ok) {
      this.DoDropItem(player, it);
      return true;
    } else {
      this.AddMessage(this.MakeErrorMessage(`Cannot drop ${it.theName} : ${res.reason}.`));
      return false;
    }
  }

  // C# HandlePlayerShout — RogueGame.cs:7295
  HandlePlayerShout(player: Actor, text: string | null): boolean {
    const res = this.m_Rules.canActorShout(player);
    if (!res.ok) {
      this.AddMessage(this.MakeErrorMessage(`Can't shout : ${res.reason}.`));
      return false;
    }

    this.DoShout(player, text);
    return true;
  }

  // C# HandlePlayerGiveItem — RogueGame.cs:7308
  async HandlePlayerGiveItem(player: Actor, screen: Point): Promise<boolean> {
    const hit = this.MouseToInventoryItem(screen);
    const inv = hit.inv;
    const gift = hit.result;
    if (inv == null || inv !== player.inventory || gift == null)
      return false;

    let loop = true;
    let actionDone = false;
    this.ClearOverlays();
    this.AddOverlay(new OverlayPopup(this.GIVE_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));
    do {
      this.AddMessage(new Message(`Giving ${gift.theName} to...`, this.m_Session.worldTime.turnCounter, Color.Yellow));
      this.RedrawPlayScreen();

      const dir = await this.WaitDirectionOrCancel();

      if (dir == null) {
        loop = false;
      } else if (dir !== Direction.NEUTRAL) {
        const pos = dir.applyTo(player.location.position);
        if (player.location.map!.isInBoundsPoint(pos)) {
          const other = player.location.map!.getActorAtPoint(pos);
          if (other != null) {
            const res = this.m_Rules.canActorGiveItemTo(player, other, gift);
            if (res.ok) {
              actionDone = true;
              loop = false;
              this.DoGiveItemTo(player, other, gift);
            } else {
              this.AddMessage(this.MakeErrorMessage(`Can't give ${gift.theName} to ${other.name} : ${res.reason}.`));
            }
          } else {
            this.AddMessage(this.MakeErrorMessage("Noone there."));
          }
        }
      }
    } while (loop);

    this.ClearOverlays();
    return actionDone;
  }

  // C# HandlePlayerTradeNegociation — RogueGame.cs:7379
  async HandlePlayerTradeNegociation(player: Actor, npc: Actor): Promise<boolean> {
    const npcAI = npc.controller as BaseAI;
    let isOnPlayerInventory = true;
    let iPlayerSelectedItem = -1;
    let iNpcSelectedItem = -1;
    let state = 0;

    const ratingPairs: TradeRating[][] = [];
    for (let i = 0; i < player.inventory!.countItems; i++) {
      ratingPairs[i] = [];
      const offered = player.inventory!.getItem(i)!;
      for (let j = 0; j < npc.inventory!.countItems; j++) {
        ratingPairs[i][j] = npcAI != null ? npcAI.rateTradeOffer(this, player, offered, npc.inventory!.getItem(j)!) : TradeRating.REFUSE;
      }
    }

    const charismaChance = this.m_Rules.actorCharismaticTradeChance(player);
    const charismaSuccess = this.m_Session.player_TurnCharismaRoll < charismaChance;

    const isTrustedLeader = (npc.leader === player) && this.m_Rules.isActorTrustingLeader(npc);

    let loop = true;
    let actionDone = false;
    const lines: string[] = [];
    const colors: Color[] = [];

    const tradeToColor = (r: TradeRating): Color => {
      if (r === TradeRating.ACCEPT) return this.TRADE_COLOR_ACCEPT;
      if (r === TradeRating.REFUSE) return this.TRADE_COLOR_REFUSE;
      if (charismaSuccess) return this.TRADE_COLOR_MAYBE_SUCCESS;
      return this.TRADE_COLOR_MAYBE_FAILED;
    };

    do {
      lines.length = 0;
      colors.length = 0;

      if (state === 2) {
        lines.push("Mode: Making the offer");
      } else {
        if (isOnPlayerInventory) {
          if (state === 0)
            lines.push("Mode: Proposing an item");
          else
            lines.push("Mode: Selecting your item to exchange");
        } else {
          if (state === 0)
            lines.push("Mode: Asking for an item");
          else
            lines.push("Mode: Selecting an item to exchange");
        }
      }
      colors.push(Color.Yellow);

      lines.push(" ");
      colors.push(Color.Black);

      if (isTrustedLeader) {
        lines.push(" "); colors.push(Color.White);
        lines.push(`You are ${this.HimOrHer(npc)} trusted leader, will accept all trades.`);
        colors.push(Color.LightGreen);
      }

      if (charismaSuccess) {
        lines.push(`Charisma roll success ${this.m_Session.player_TurnCharismaRoll}/${charismaChance}%`);
        colors.push(Color.LightGreen);
      } else {
        lines.push(`Charisma roll failed ${this.m_Session.player_TurnCharismaRoll}/${charismaChance}%`);
        colors.push(Color.Red);
      }

      const listTradeItems = (a: Actor, isActive: boolean) => {
        lines.push(`${a.name} items`);
        colors.push(Color.White);
        for (let i = 0; i < a.inventory!.countItems; i++) {
          const it = a.inventory!.getItem(i)!;
          if (isActive) {
            lines.push(`${i === 9 ? 0 : (i + 1)}. ${this.DescribeItemShort(it)}`);
            if (state === 0)
              colors.push(Color.Yellow);
            else {
              const r = (a === player && isActive ? ratingPairs[i][iNpcSelectedItem] : ratingPairs[iPlayerSelectedItem][i]);
              colors.push(tradeToColor(r));
            }
          } else {
            lines.push(`-. ${this.DescribeItemShort(it)}`);
            colors.push(i === (a === player ? iPlayerSelectedItem : iNpcSelectedItem) ? this.TRADE_COLOR_SELECTED_ITEM : Color.Gray);
          }
        }
      };

      lines.push(" "); colors.push(Color.Black);
      listTradeItems(player, isOnPlayerInventory && state !== 2);
      lines.push(" "); colors.push(Color.Black);
      listTradeItems(npc, !isOnPlayerInventory && state !== 2);

      if (state !== 0 && !isTrustedLeader) {
        lines.push(" "); colors.push(Color.White);
        lines.push("Trade color legend : "); colors.push(Color.White);
        lines.push("  asked/offered"); colors.push(this.TRADE_COLOR_SELECTED_ITEM);
        lines.push("  will accept"); colors.push(this.TRADE_COLOR_ACCEPT);
        lines.push("  will accept due to your charisma"); colors.push(this.TRADE_COLOR_MAYBE_SUCCESS);
        lines.push("  will refuse due to failed charisma"); colors.push(this.TRADE_COLOR_MAYBE_FAILED);
        lines.push("  will refuse"); colors.push(this.TRADE_COLOR_REFUSE);
      }

      this.ClearOverlays();
      this.AddOverlay(new OverlayPopup(this.TRADING_DIALOG_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));
      const ov = new OverlayPopupTitleColors(
        `Trading with ${npc.name}`, Color.White,
        lines, colors,
        Color.White, Color.Black, new Point(32, 32));
      this.AddOverlay(ov);
      this.RedrawPlayScreen();

      if (state === 2) {
        this.ClearMessages();
        const offered = player.inventory!.getItem(iPlayerSelectedItem)!;
        const asked = npc.inventory!.getItem(iNpcSelectedItem)!;
        this.AddMessage(this.MakeMessage(player, `${this.Conjugate(player, this.VERB_OFFER)} ${offered.theName} for ${asked.theName}.`));

        let r = ratingPairs[iPlayerSelectedItem][iNpcSelectedItem];
        if (r === TradeRating.MAYBE)
          r = (charismaSuccess ? TradeRating.ACCEPT : TradeRating.REFUSE);

        if (r === TradeRating.ACCEPT) {
          this.AddMessage(this.MakeMessage(npc, `${this.Conjugate(npc, this.VERB_ACCEPT_THE_DEAL)}.`));
          this.SwapActorItems(player, offered, npc, asked);
          loop = false;
          actionDone = true;
          if (player.model.abilities.hasSanity) {
            this.RegenActorSanity(player, Rules.SANITY_RECOVER_CHAT_OR_TRADE);
            this.AddMessage(this.MakeMessage(player, `${this.Conjugate(player, this.VERB_FEEL)} better after chatting with`, npc));
          }
          if (npc.model.abilities.hasSanity) {
            this.RegenActorSanity(npc, Rules.SANITY_RECOVER_CHAT_OR_TRADE);
            this.AddMessage(this.MakeMessage(npc, `${this.Conjugate(npc, this.VERB_FEEL)} better after chatting with`, player));
          }
        } else if (r === TradeRating.REFUSE) {
          this.AddMessage(this.MakeMessage(npc, `${this.Conjugate(npc, this.VERB_REFUSE_THE_DEAL)}.`));
          isOnPlayerInventory = !isOnPlayerInventory;
          iPlayerSelectedItem = iNpcSelectedItem = -1;
          state = 0;
        }

        await this.AddMessagePressEnter();
      } else {
        const inKey = await this.m_UI.UI_WaitKey();

        if (inKey.key === "Escape") {
          if (state === 0)
            loop = false;
          else {
            state = 0;
            if (isOnPlayerInventory)
              iPlayerSelectedItem = -1;
            else
              iNpcSelectedItem = -1;
            isOnPlayerInventory = !isOnPlayerInventory;
          }
        } else if (inKey.key === "Tab") {
          if (state === 0) {
            isOnPlayerInventory = !isOnPlayerInventory;
            iPlayerSelectedItem = iNpcSelectedItem = -1;
          }
        } else {
          const slot = this.KeyToChoiceNumber(inKey);
          if (slot !== -1) {
            const actualSlot = (slot === 0 ? 9 : slot - 1);

            if (isOnPlayerInventory) {
              if (actualSlot < player.inventory!.countItems) {
                iPlayerSelectedItem = actualSlot;
                if (state === 0) {
                  state = 1;
                  isOnPlayerInventory = false;
                } else {
                  state = 2;
                }
              }
            } else {
              if (actualSlot < npc.inventory!.countItems) {
                iNpcSelectedItem = actualSlot;
                if (state === 0) {
                  state = 1;
                  isOnPlayerInventory = true;
                } else {
                  state = 2;
                }
              }
            }
          }
        }
      }
    } while (loop);

    if (actionDone)
      this.SpendActorActionPoints(player, Rules.BASE_ACTION_COST);

    this.ClearOverlays();
    return actionDone;
  }

  // C# HandlePlayerNegociateTrade — RogueGame.cs:7663
  async HandlePlayerNegociateTrade(player: Actor): Promise<boolean> {
    let loop = true;
    let actionDone = false;
    this.ClearOverlays();
    this.AddOverlay(new OverlayPopup(this.NEGOCIATE_TRADE_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));
    do {
      this.RedrawPlayScreen();

      const dir = await this.WaitDirectionOrCancel();

      if (dir == null) {
        loop = false;
      } else if (dir !== Direction.NEUTRAL) {
        const pos = dir.applyTo(player.location.position);
        if (player.location.map!.isInBoundsPoint(pos)) {
          const other = player.location.map!.getActorAtPoint(pos);
          if (other != null) {
            const res = this.m_Rules.canActorInitiateTradeWith(player, other);
            if (res.ok) {
              actionDone = await this.HandlePlayerTradeNegociation(player, other);
              loop = false;
            } else {
              this.AddMessage(this.MakeErrorMessage(`Can't trade with ${other.name} : ${res.reason}.`));
            }
          } else {
            this.AddMessage(this.MakeErrorMessage("Noone there."));
          }
        }
      }
    } while (loop);

    this.ClearOverlays();
    return actionDone;
  }

  // C# HandlePlayerRunToggle — RogueGame.cs:7722
  HandlePlayerRunToggle(player: Actor): void {
    const res = this.m_Rules.canActorRun(player);
    if (!res.ok) {
      this.AddMessage(this.MakeErrorMessage(`Cannot run now : ${res.reason}.`));
      return;
    }

    player.isRunning = !player.isRunning;
    this.AddMessage(this.MakeMessage(player, `${this.Conjugate(player, player.isRunning ? this.VERB_START : this.VERB_STOP)} running.`));
  }

  // C# HandlePlayerCloseDoor — RogueGame.cs:7736
  async HandlePlayerCloseDoor(player: Actor): Promise<boolean> {
    let loop = true;
    let actionDone = false;

    this.ClearOverlays();
    this.AddOverlay(new OverlayPopup(this.CLOSE_DOOR_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));

    do {
      this.RedrawPlayScreen();
      const dir = await this.WaitDirectionOrCancel();

      if (dir == null) {
        loop = false;
      } else if (dir !== Direction.NEUTRAL) {
        const pos = player.location.position.add(new Point(dir.dx, dir.dy));
        if (player.location.map!.isInBoundsPoint(pos)) {
          const mapObj = player.location.map!.getMapObjectAt(pos.x, pos.y);
          if (mapObj != null && mapObj instanceof DoorWindow) {
            const door = mapObj as DoorWindow;
            const res = this.m_Rules.isClosableFor(player, door);
            if (res.ok) {
              this.DoCloseDoor(player, door);
              this.RedrawPlayScreen();
              loop = false;
              actionDone = true;
            } else {
              this.AddMessage(this.MakeErrorMessage(`Can't close ${door.theName} : ${res.reason}.`));
            }
          } else {
            this.AddMessage(this.MakeErrorMessage("Nothing to close there."));
          }
        }
      }
    } while (loop);

    this.ClearOverlays();
    return actionDone;
  }

  // C# HandlePlayerBarricade — RogueGame.cs:7799
  async HandlePlayerBarricade(player: Actor): Promise<boolean> {
    let loop = true;
    let actionDone = false;

    this.ClearOverlays();
    this.AddOverlay(new OverlayPopup(this.BARRICADE_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));

    do {
      this.RedrawPlayScreen();
      const dir = await this.WaitDirectionOrCancel();

      if (dir == null) {
        loop = false;
      } else if (dir !== Direction.NEUTRAL) {
        const pos = player.location.position.add(new Point(dir.dx, dir.dy));
        if (player.location.map!.isInBoundsPoint(pos)) {
          const mapObj = player.location.map!.getMapObjectAt(pos.x, pos.y);
          if (mapObj != null) {
            if (mapObj instanceof DoorWindow) {
              const door = mapObj as DoorWindow;
              const res = this.m_Rules.canActorBarricadeDoor(player, door);
              if (res.ok) {
                this.DoBarricadeDoor(player, door);
                this.RedrawPlayScreen();
                loop = false;
                actionDone = true;
              } else {
                this.AddMessage(this.MakeErrorMessage(`Cannot barricade ${door.theName} : ${res.reason}.`));
              }
            } else if (mapObj instanceof Fortification) {
              const fort = mapObj as Fortification;
              const res = this.m_Rules.canActorRepairFortification(player, fort);
              if (res.ok) {
                this.DoRepairFortification(player, fort);
                this.RedrawPlayScreen();
                loop = false;
                actionDone = true;
              } else {
                this.AddMessage(this.MakeErrorMessage(`Cannot repair ${fort.theName} : ${res.reason}.`));
              }
            } else {
              this.AddMessage(this.MakeErrorMessage(`${mapObj.theName} cannot be repaired or barricaded.`));
            }
          } else {
            this.AddMessage(this.MakeErrorMessage("Nothing to barricade there."));
          }
        }
      }
    } while (loop);

    this.ClearOverlays();
    return actionDone;
  }

  // C# HandlePlayerBreak — RogueGame.cs:7885
  async HandlePlayerBreak(player: Actor): Promise<boolean> {
    let loop = true;
    let actionDone = false;

    this.ClearOverlays();
    this.AddOverlay(new OverlayPopup(this.BREAK_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));

    do {
      this.RedrawPlayScreen();
      const dir = await this.WaitDirectionOrCancel();

      if (dir == null) {
        loop = false;
      } else {
        if (dir === Direction.NEUTRAL) {
          const exitThere = player.location.map!.getExitAt(player.location.position);
          if (exitThere == null) {
            this.AddMessage(this.MakeErrorMessage("No exit there."));
          } else {
            const mapTo = exitThere.toMap!;
            const actorTo = mapTo.getActorAtPoint(exitThere.toPosition);
            if (actorTo != null) {
              if (this.m_Rules.areEnemies(player, actorTo)) {
                const res = this.m_Rules.canActorMeleeAttack(player, actorTo);
                if (res.ok) {
                  this.DoMeleeAttack(player, actorTo);
                  loop = false;
                  actionDone = true;
                } else {
                  this.AddMessage(this.MakeErrorMessage(`Cannot attack ${actorTo.name} : ${res.reason}.`));
                }
              } else {
                this.AddMessage(this.MakeErrorMessage(`${actorTo.name} is not your enemy.`));
              }
            } else {
              const objTo = mapTo.getMapObjectAt(exitThere.toPosition.x, exitThere.toPosition.y);
              if (objTo != null) {
                const res = this.m_Rules.isBreakableFor(player, objTo);
                if (res.ok) {
                  this.DoBreak(player, objTo);
                  loop = false;
                  actionDone = true;
                } else {
                  this.AddMessage(this.MakeErrorMessage(`Cannot break ${objTo.theName} : ${res.reason}.`));
                }
              } else {
                this.AddMessage(this.MakeErrorMessage("Nothing to break or attack on the other side."));
              }
            }
          }
        } else {
          const pos = player.location.position.add(new Point(dir.dx, dir.dy));
          if (player.location.map!.isInBoundsPoint(pos)) {
            const mapObj = player.location.map!.getMapObjectAt(pos.x, pos.y);
            if (mapObj != null) {
              const res = this.m_Rules.isBreakableFor(player, mapObj);
              if (res.ok) {
                this.DoBreak(player, mapObj);
                this.RedrawPlayScreen();
                loop = false;
                actionDone = true;
              } else {
                this.AddMessage(this.MakeErrorMessage(`Cannot break ${mapObj.theName} : ${res.reason}.`));
              }
            } else {
              this.AddMessage(this.MakeErrorMessage("Nothing to break there."));
            }
          }
        }
      }
    } while (loop);

    this.ClearOverlays();
    return actionDone;
  }

  // C# HandlePlayerBuildFortification — RogueGame.cs:8003
  async HandlePlayerBuildFortification(player: Actor, isLarge: boolean): Promise<boolean> {
    if (player.sheet.skillTable.getSkillLevel(SkillID.CARPENTRY) === 0) {
      this.AddMessage(this.MakeErrorMessage("need carpentry skill."));
      return false;
    }
    const need = this.m_Rules.actorBarricadingMaterialNeedForFortification(player, isLarge);
    if (this.m_Rules.countBarricadingMaterial(player) < need) {
      this.AddMessage(this.MakeErrorMessage(`not enough barricading material, need ${need}.`));
      return false;
    }

    let loop = true;
    let actionDone = false;

    this.ClearOverlays();
    this.AddOverlay(new OverlayPopup(isLarge ? this.BUILD_LARGE_FORT_MODE_TEXT : this.BUILD_SMALL_FORT_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));

    do {
      this.RedrawPlayScreen();
      const dir = await this.WaitDirectionOrCancel();

      if (dir == null) {
        loop = false;
      } else if (dir !== Direction.NEUTRAL) {
        const pos = player.location.position.add(new Point(dir.dx, dir.dy));
        if (player.location.map!.isInBoundsPoint(pos)) {
          const res = this.m_Rules.canActorBuildFortification(player, pos, isLarge);
          if (res.ok) {
            this.DoBuildFortification(player, pos, isLarge);
            this.RedrawPlayScreen();
            loop = false;
            actionDone = true;
          } else {
            this.AddMessage(this.MakeErrorMessage(`Cannot build here : ${res.reason}.`));
          }
        }
      }
    } while (loop);

    this.ClearOverlays();
    return actionDone;
  }

  // C# HandlePlayerFireMode — RogueGame.cs:8074
  async HandlePlayerFireMode(player: Actor): Promise<boolean> {
    let loop = true;
    let actionDone = false;

    const grenade = player.getEquippedWeapon() instanceof ItemGrenade ? player.getEquippedWeapon() as ItemGrenade : null;
    const primedGrenade = player.getEquippedWeapon() instanceof ItemGrenadePrimed ? player.getEquippedWeapon() as ItemGrenadePrimed : null;
    if (grenade != null || primedGrenade != null)
      return await this.HandlePlayerThrowGrenade(player);

    const rangedWeapon = player.getEquippedWeapon() instanceof ItemRangedWeapon ? player.getEquippedWeapon() as ItemRangedWeapon : null;
    if (rangedWeapon == null) {
      this.AddMessage(this.MakeErrorMessage("No weapon ready to fire."));
      this.RedrawPlayScreen();
      return false;
    }
    if (rangedWeapon.ammo <= 0) {
      this.AddMessage(this.MakeErrorMessage("No ammo left."));
      this.RedrawPlayScreen();
      return false;
    }

    const fov = LOS.computeFOVFor(this.m_Rules, player, this.m_Session.worldTime, this.m_Session.world!.weather);
    const potentialTargets = this.m_Rules.getEnemiesInFov(player, fov);

    if (potentialTargets == null || potentialTargets.length === 0) {
      this.AddMessage(this.MakeErrorMessage("No targets to fire at."));
      this.RedrawPlayScreen();
      return false;
    }

    const rangedAttack = this.m_Rules.actorRangedAttack(player, player.currentRangedAttack!, 0, null);
    let iCurrentTarget = 0;
    const lof: Point[] = [];
    let mode = this.m_Session.player_CurrentFireMode;
    do {
      const currentTarget = potentialTargets[iCurrentTarget];
      lof.length = 0;
      const res = this.m_Rules.canActorFireAt(player, currentTarget, lof);
      const dToTarget = this.m_Rules.gridDistance(player.location.position, currentTarget.location.position);

      let modeDesc: string;
      if (mode === FireMode.RAPID)
        modeDesc = `RAPID fire average hit chances ${this.m_Rules.computeChancesRangedHit(player, currentTarget, 1)}% ${this.m_Rules.computeChancesRangedHit(player, currentTarget, 2)}%`;
      else
        modeDesc = `Normal fire average hit chance ${this.m_Rules.computeChancesRangedHit(player, currentTarget, 0)}%`;

      const overlayPopupText = [...this.FIRE_MODE_TEXT, modeDesc];
      this.ClearOverlays();
      this.AddOverlay(new OverlayPopup(overlayPopupText, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));
      const targetScreen = this.MapToScreen(currentTarget.location.position);
      this.AddOverlay(new OverlayImage(targetScreen, GameImages.ICON_TARGET));
      const lineImage = res.ok ? (dToTarget <= (rangedAttack?.efficientRange ?? 0) ? GameImages.ICON_LINE_CLEAR : GameImages.ICON_LINE_BAD) : GameImages.ICON_LINE_BLOCKED;
      for (const pt of lof) {
        const screenPt = this.MapToScreen(pt);
        this.AddOverlay(new OverlayImage(screenPt, lineImage));
      }
      this.RedrawPlayScreen();

      const key = await this.m_UI.UI_WaitKey();

      if (key.key === "Escape") {
        loop = false;
      } else if (key.key === "t" || key.key === "T") {
        iCurrentTarget = (iCurrentTarget + 1) % potentialTargets.length;
      } else if (key.key === "m" || key.key === "M") {
        mode = ((mode + 1) % FireMode._COUNT) as FireMode;
        this.AddMessage(new Message(`Switched to ${FireMode[mode]} fire mode.`, this.m_Session.worldTime.turnCounter, Color.Yellow));
        this.m_Session.player_CurrentFireMode = mode;
      } else if (key.key === "f" || key.key === "F") {
        if (res.ok) {
          this.DoRangedAttack(player, currentTarget, lof, mode);
          this.RedrawPlayScreen();
          loop = false;
          actionDone = true;
        } else {
          this.AddMessage(this.MakeErrorMessage(`Can't fire at ${currentTarget.theName} : ${res.reason}.`));
        }
      }
    } while (loop);

    this.ClearOverlays();
    return actionDone;
  }

  // C# HandlePlayerMarkEnemies — RogueGame.cs:8199
  async HandlePlayerMarkEnemies(player: Actor): Promise<void> {
    if (player.model.abilities.isUndead) {
      this.AddMessage(this.MakeErrorMessage("Undeads can't have personal enemies."));
      return;
    }

    const map = player.location.map!;
    const visibleActors: Actor[] = [];
    for (const p of this.m_PlayerFOV) {
      const a = map.getActorAtPoint(p);
      if (a == null || a.isPlayer)
        continue;
      visibleActors.push(a);
    }
    if (visibleActors.length === 0) {
      this.AddMessage(this.MakeErrorMessage("No visible actors to mark."));
      this.RedrawPlayScreen();
      return;
    }

    let loop = true;
    let iCurrentActor = 0;
    do {
      const currentActor = visibleActors[iCurrentActor];

      this.ClearOverlays();
      this.AddOverlay(new OverlayPopup(this.MARK_ENEMIES_MODE, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));
      const targetScreen = this.MapToScreen(currentActor.location.position);
      this.AddOverlay(new OverlayImage(targetScreen, GameImages.ICON_TARGET));
      this.RedrawPlayScreen();

      const key = await this.m_UI.UI_WaitKey();

      if (key.key === "Escape") {
        loop = false;
      } else if (key.key === "t" || key.key === "T") {
        iCurrentActor = (iCurrentActor + 1) % visibleActors.length;
      } else if (key.key === "e" || key.key === "E") {
        let allowed = true;
        if (currentActor.leader === player) {
          this.AddMessage(this.MakeErrorMessage("Can't make a follower your enemy."));
          allowed = false;
        } else if (player.leader === currentActor) {
          this.AddMessage(this.MakeErrorMessage("Can't make your leader your enemy."));
          allowed = false;
        } else if (this.m_Rules.areEnemies(this.m_Player, currentActor)) {
          this.AddMessage(this.MakeErrorMessage("Already enemies."));
          allowed = false;
        }

        if (allowed) {
          this.AddMessage(new Message(`${currentActor.theName} is now a personal enemy.`, this.m_Session.worldTime.turnCounter, Color.Orange));
          this.DoMakeAggression(player, currentActor);
        }
      }
    } while (loop);

    this.ClearOverlays();
  }

  // C# HandlePlayerThrowGrenade — RogueGame.cs:8297
  async HandlePlayerThrowGrenade(player: Actor): Promise<boolean> {
    let loop = true;
    let actionDone = false;

    const unprimedGrenade = player.getEquippedWeapon() instanceof ItemGrenade ? player.getEquippedWeapon() as ItemGrenade : null;
    const primedGrenade = player.getEquippedWeapon() instanceof ItemGrenadePrimed ? player.getEquippedWeapon() as ItemGrenadePrimed : null;
    if (unprimedGrenade == null && primedGrenade == null) {
      this.AddMessage(this.MakeErrorMessage("No grenade to throw."));
      this.RedrawPlayScreen();
      return false;
    }
    let grenadeModel: ItemGrenadeModel;
    if (unprimedGrenade != null)
      grenadeModel = unprimedGrenade.model as ItemGrenadeModel;
    else
      grenadeModel = ((primedGrenade!.model as ItemGrenadePrimedModel)).grenadeModel;

    const map = player.location.map!;
    let targetThrow = player.location.position;
    const maxThrowDist = this.m_Rules.actorMaxThrowRange(player, grenadeModel.maxThrowDistance);

    const lot: Point[] = [];
    do {
      lot.length = 0;
      const res = this.m_Rules.canActorThrowTo(player, targetThrow, lot);

      this.ClearOverlays();
      this.AddOverlay(new OverlayPopup(this.THROW_GRENADE_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));
      const lineImage = res.ok ? GameImages.ICON_LINE_CLEAR : GameImages.ICON_LINE_BLOCKED;
      for (const pt of lot) {
        const screenPt = this.MapToScreen(pt);
        this.AddOverlay(new OverlayImage(screenPt, lineImage));
      }
      this.RedrawPlayScreen();

      const key = await this.m_UI.UI_WaitKey();
      const command = InputTranslator.keyToCommand(RogueGame.KeyBindings(), key.key, key.ctrl, key.alt, key.shift);

      if (key.key === "Escape") {
        loop = false;
      } else if (key.key === "f" || key.key === "F") {
        if (res.ok) {
          let doIt = true;
          if (this.m_Rules.gridDistance(player.location.position, targetThrow) <= grenadeModel.blastAttack.radius) {
            this.ClearMessages();
            this.AddMessage(new Message("You are in the blast radius!", this.m_Session.worldTime.turnCounter, Color.Yellow));
            this.AddMessage(this.MakeYesNoMessage("Really throw there"));
            this.RedrawPlayScreen();
            doIt = await this.WaitYesOrNo();
            this.ClearMessages();
            this.RedrawPlayScreen();
          }

          if (doIt) {
            if (unprimedGrenade != null)
              this.DoThrowGrenadeUnprimed(player, targetThrow);
            else
              this.DoThrowGrenadePrimed(player, targetThrow);
            this.RedrawPlayScreen();
            loop = false;
            actionDone = true;
          }
        } else {
          this.AddMessage(this.MakeErrorMessage(`Can't throw there : ${res.reason}.`));
        }
      } else {
        const dir = this.CommandToDirection(command);
        if (dir != null) {
          const pos = targetThrow.add(new Point(dir.dx, dir.dy));
          if (map.isInBoundsPoint(pos) && this.m_Rules.gridDistance(player.location.position, pos) <= maxThrowDist)
            targetThrow = pos;
        }
      }
    } while (loop);

    this.ClearOverlays();
    return actionDone;
  }

  // C# HandlePlayerSleep — RogueGame.cs:8413
  async HandlePlayerSleep(player: Actor): Promise<boolean> {
    const res = this.m_Rules.canActorSleep(player);
    if (!res.ok) {
      this.AddMessage(this.MakeErrorMessage(`Cannot sleep now : ${res.reason}.`));
      return false;
    }

    this.AddMessage(this.MakeYesNoMessage("Really sleep there"));
    this.RedrawPlayScreen();
    const confirm = await this.WaitYesOrNo();
    if (!confirm) {
      this.AddMessage(new Message("Good, keep those eyes wide open.", this.m_Session.worldTime.turnCounter, Color.Yellow));
      return false;
    }

    this.CheckAutoSaveTime();

    this.AddMessage(new Message("Goodnight, happy nightmares!", this.m_Session.worldTime.turnCounter, Color.Yellow));
    this.DoStartSleeping(player);
    this.RedrawPlayScreen();
    this.m_MusicManager.stop();
    this.m_MusicManager.play(GameMusics.SLEEP);
    return true;
  }

  // C# HandlePlayerSwitchPlace — RogueGame.cs:8446
  async HandlePlayerSwitchPlace(player: Actor): Promise<boolean> {
    let loop = true;
    let actionDone = false;

    this.ClearOverlays();
    this.AddOverlay(new OverlayPopup(this.SWITCH_PLACE_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));

    do {
      this.RedrawPlayScreen();
      const dir = await this.WaitDirectionOrCancel();

      if (dir == null) {
        loop = false;
      } else if (dir !== Direction.NEUTRAL) {
        const pos = player.location.position.add(new Point(dir.dx, dir.dy));
        if (player.location.map!.isInBoundsPoint(pos)) {
          const other = player.location.map!.getActorAtPoint(pos);
          if (other != null) {
            const switchRes = this.m_Rules.canActorSwitchPlaceWith(player, other);
            if (switchRes.ok) {
              actionDone = true;
              loop = false;
              this.DoSwitchPlace(player, other);
            } else {
              this.AddMessage(this.MakeErrorMessage(`Can't switch place : ${switchRes.reason}`));
            }
          } else {
            this.AddMessage(this.MakeErrorMessage("Noone there."));
          }
        }
      }
    } while (loop);

    this.ClearOverlays();
    return actionDone;
  }

  // C# HandlePlayerTakeLead — RogueGame.cs:8508
  async HandlePlayerTakeLead(player: Actor): Promise<boolean> {
    let loop = true;
    let actionDone = false;

    this.ClearOverlays();
    this.AddOverlay(new OverlayPopup(this.TAKE_LEAD_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));

    do {
      this.RedrawPlayScreen();
      const dir = await this.WaitDirectionOrCancel();

      if (dir == null) {
        loop = false;
      } else if (dir !== Direction.NEUTRAL) {
        const pos = player.location.position.add(new Point(dir.dx, dir.dy));
        if (player.location.map!.isInBoundsPoint(pos)) {
          const other = player.location.map!.getActorAtPoint(pos);
          if (other != null) {
            const res = this.m_Rules.canActorTakeLead(player, other);
            if (res.ok) {
              actionDone = true;
              loop = false;

              if (other.hasLeader)
                this.DoStealLead(player, other);
              else
                this.DoTakeLead(player, other);

              this.m_Session.scoring.addEvent(this.m_Session.worldTime.turnCounter, `Recruited ${other.name}.`);

              this.AddMessage(new Message("(you can now set directives and orders for your new follower).", this.m_Session.worldTime.turnCounter, Color.White));
              this.AddMessage(new Message(`(to give order : press <${s_KeyBindings.get(PlayerCommand.ORDER_MODE)?.toString() ?? ""}>).`, this.m_Session.worldTime.turnCounter, Color.White));

            } else if (other.leader === player) {
              const cancelRes = this.m_Rules.canActorCancelLead(player, other);
              if (cancelRes.ok) {
                this.AddMessage(this.MakeYesNoMessage(`Really ask ${other.name} to leave`));
                this.RedrawPlayScreen();
                const confirm = await this.WaitYesOrNo();
                if (confirm) {
                  actionDone = true;
                  loop = false;
                  this.DoCancelLead(player, other);
                  this.m_Session.scoring.addEvent(this.m_Session.worldTime.turnCounter, `Fired ${other.name}.`);
                } else {
                  this.AddMessage(new Message("Good, together you are strong.", this.m_Session.worldTime.turnCounter, Color.Yellow));
                }
              } else {
                this.AddMessage(this.MakeErrorMessage(`${other.name} can't leave : ${cancelRes.reason}.`));
              }
            } else {
              this.AddMessage(this.MakeErrorMessage(`Can't lead ${other.name} : ${res.reason}.`));
            }
          } else {
            this.AddMessage(this.MakeErrorMessage("Noone there."));
          }
        }
      }
    } while (loop);

    this.ClearOverlays();
    return actionDone;
  }

  // C# HandlePlayerPush — RogueGame.cs:8609
  async HandlePlayerPush(player: Actor): Promise<boolean> {
    if (!this.m_Rules.hasActorPushAbility(player)) {
      this.AddMessage(this.MakeErrorMessage("Cannot push objects."));
      return false;
    }
    if (this.m_Rules.isActorTired(player)) {
      this.AddMessage(this.MakeErrorMessage("Too tired to push."));
      return false;
    }

    let loop = true;
    let actionDone = false;

    this.ClearOverlays();
    this.AddOverlay(new OverlayPopup(this.PUSH_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));

    do {
      this.RedrawPlayScreen();
      const dir = await this.WaitDirectionOrCancel();

      if (dir == null) {
        loop = false;
      } else if (dir !== Direction.NEUTRAL) {
        const pos = player.location.position.add(new Point(dir.dx, dir.dy));
        if (player.location.map!.isInBoundsPoint(pos)) {
          const other = player.location.map!.getActorAtPoint(pos);
          const mapObj = player.location.map!.getMapObjectAt(pos.x, pos.y);
          if (other != null) {
            const res = this.m_Rules.canActorShove(player, other);
            if (res.ok) {
              if (await this.HandlePlayerShoveActor(player, other)) {
                loop = false;
                actionDone = true;
              }
            } else {
              this.AddMessage(this.MakeErrorMessage(`Cannot shove ${other.name} : ${res.reason}.`));
            }
          } else if (mapObj != null) {
            const res = this.m_Rules.canActorPush(player, mapObj);
            if (res.ok) {
              if (await this.HandlePlayerPushObject(player, mapObj)) {
                loop = false;
                actionDone = true;
              }
            } else {
              this.AddMessage(this.MakeErrorMessage(`Cannot move ${mapObj.theName} : ${res.reason}.`));
            }
          } else {
            this.AddMessage(this.MakeErrorMessage("Nothing to push there."));
          }
        }
      }
    } while (loop);

    this.ClearOverlays();
    return actionDone;
  }

  // C# HandlePlayerPushObject — RogueGame.cs:8706
  async HandlePlayerPushObject(player: Actor, mapObj: MapObject): Promise<boolean> {
    let loop = true;
    let actionDone = false;

    this.ClearOverlays();
    this.AddOverlay(new OverlayPopup([`PUSHING ${mapObj.theName} - directions to push, ESC cancels`], this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));
    this.AddOverlay(new OverlayRect(Color.Yellow, new Rect(this.MapToScreen(mapObj.location.position).x, this.MapToScreen(mapObj.location.position).y, TILE_SIZE, TILE_SIZE)));

    do {
      this.RedrawPlayScreen();
      const dir = await this.WaitDirectionOrCancel();

      if (dir == null) {
        loop = false;
      } else if (dir !== Direction.NEUTRAL) {
        const movePos = mapObj.location.position.add(new Point(dir.dx, dir.dy));
        if (player.location.map!.isInBoundsPoint(movePos)) {
          const res = this.m_Rules.canPushObjectTo(mapObj, movePos);
          if (res.ok) {
            this.DoPush(player, mapObj, movePos);
            loop = false;
            actionDone = true;
          } else {
            this.AddMessage(this.MakeErrorMessage(`Cannot move ${mapObj.theName} there : ${res.reason}.`));
          }
        }
      }
    } while (loop);

    this.ClearOverlays();
    return actionDone;
  }

  // C# HandlePlayerShoveActor — RogueGame.cs:8762
  async HandlePlayerShoveActor(player: Actor, other: Actor): Promise<boolean> {
    let loop = true;
    let actionDone = false;

    this.ClearOverlays();
    this.AddOverlay(new OverlayPopup([`SHOVING ${other.name} - directions to shove, ESC cancels`], this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));
    this.AddOverlay(new OverlayRect(Color.Yellow, new Rect(this.MapToScreen(other.location.position).x, this.MapToScreen(other.location.position).y, TILE_SIZE, TILE_SIZE)));

    do {
      this.RedrawPlayScreen();
      const dir = await this.WaitDirectionOrCancel();

      if (dir == null) {
        loop = false;
      } else if (dir !== Direction.NEUTRAL) {
        const movePos = other.location.position.add(new Point(dir.dx, dir.dy));
        if (player.location.map!.isInBoundsPoint(movePos)) {
          const res = this.m_Rules.canShoveActorTo(other, movePos);
          if (res.ok) {
            this.DoShove(player, other, movePos);
            loop = false;
            actionDone = true;
          } else {
            this.AddMessage(this.MakeErrorMessage(`Cannot shove ${other.name} there : ${res.reason}.`));
          }
        }
      }
    } while (loop);

    this.ClearOverlays();
    return actionDone;
  }

  // C# HandlePlayerPull — RogueGame.cs:8819
  async HandlePlayerPull(player: Actor): Promise<boolean> {
    if (!this.m_Rules.hasActorPushAbility(player)) {
      this.AddMessage(this.MakeErrorMessage("Cannot pull objects."));
      return false;
    }
    if (this.m_Rules.isActorTired(player)) {
      this.AddMessage(this.MakeErrorMessage("Too tired to pull."));
      return false;
    }
    const otherMobj = player.location.map!.getMapObjectAt(player.location.position.x, player.location.position.y);
    if (otherMobj != null) {
      this.AddMessage(this.MakeErrorMessage(`Cannot pull : ${otherMobj.theName} is blocking.`));
      return false;
    }

    let loop = true;
    let actionDone = false;

    this.ClearOverlays();
    this.AddOverlay(new OverlayPopup(this.PULL_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));

    do {
      this.RedrawPlayScreen();
      const dir = await this.WaitDirectionOrCancel();

      if (dir == null) {
        loop = false;
      } else if (dir !== Direction.NEUTRAL) {
        const pos = player.location.position.add(new Point(dir.dx, dir.dy));
        if (player.location.map!.isInBoundsPoint(pos)) {
          const mapObj = player.location.map!.getMapObjectAt(pos.x, pos.y);
          const other = player.location.map!.getActorAtPoint(pos);
          if (other != null) {
            const res = this.m_Rules.canActorShove(player, other);
            if (res.ok) {
              if (await this.HandlePlayerPullActor(player, other)) {
                loop = false;
                actionDone = true;
              }
            } else {
              this.AddMessage(this.MakeErrorMessage(`Cannot pull ${other.name} : ${res.reason}.`));
            }
          } else if (mapObj != null) {
            const res = this.m_Rules.canActorPush(player, mapObj);
            if (res.ok) {
              if (await this.HandlePlayerPullObject(player, mapObj)) {
                loop = false;
                actionDone = true;
              }
            } else {
              this.AddMessage(this.MakeErrorMessage(`Cannot move ${mapObj.theName} : ${res.reason}.`));
            }
          } else {
            this.AddMessage(this.MakeErrorMessage("Nothing to pull there."));
          }
        }
      }
    } while (loop);

    this.ClearOverlays();
    return actionDone;
  }

  // C# HandlePlayerPullObject — RogueGame.cs:8921
  async HandlePlayerPullObject(player: Actor, mapObj: MapObject): Promise<boolean> {
    let loop = true;
    let actionDone = false;

    this.ClearOverlays();
    this.AddOverlay(new OverlayPopup([`PULLING ${mapObj.theName} - directions to walk to, ESC cancels`], this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));
    this.AddOverlay(new OverlayRect(Color.Yellow, new Rect(this.MapToScreen(mapObj.location.position).x, this.MapToScreen(mapObj.location.position).y, TILE_SIZE, TILE_SIZE)));

    do {
      this.RedrawPlayScreen();
      const dir = await this.WaitDirectionOrCancel();

      if (dir == null) {
        loop = false;
      } else if (dir !== Direction.NEUTRAL) {
        const moveToPos = player.location.position.add(new Point(dir.dx, dir.dy));
        if (player.location.map!.isInBoundsPoint(moveToPos)) {
          const res = this.m_Rules.canPullObject(player, mapObj, moveToPos);
          if (res.ok) {
            this.DoPull(player, mapObj, moveToPos);
            loop = false;
            actionDone = true;
          } else {
            this.AddMessage(this.MakeErrorMessage(`Cannot pull there : ${res.reason}.`));
          }
        }
      }
    } while (loop);

    this.ClearOverlays();
    return actionDone;
  }

  // C# HandlePlayerPullActor — RogueGame.cs:8978
  async HandlePlayerPullActor(player: Actor, other: Actor): Promise<boolean> {
    let loop = true;
    let actionDone = false;

    this.ClearOverlays();
    this.AddOverlay(new OverlayPopup([`PULLING ${other.name} - directions to walk to, ESC cancels`], this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));
    this.AddOverlay(new OverlayRect(Color.Yellow, new Rect(this.MapToScreen(other.location.position).x, this.MapToScreen(other.location.position).y, TILE_SIZE, TILE_SIZE)));

    do {
      this.RedrawPlayScreen();
      const dir = await this.WaitDirectionOrCancel();

      if (dir == null) {
        loop = false;
      } else if (dir !== Direction.NEUTRAL) {
        const moveToPos = player.location.position.add(new Point(dir.dx, dir.dy));
        if (player.location.map!.isInBoundsPoint(moveToPos)) {
          const res = this.m_Rules.canPullActor(player, other, moveToPos);
          if (res.ok) {
            this.DoPullActor(player, other, moveToPos);
            loop = false;
            actionDone = true;
          } else {
            this.AddMessage(this.MakeErrorMessage(`Cannot pull there : ${res.reason}.`));
          }
        }
      }
    } while (loop);

    this.ClearOverlays();
    return actionDone;
  }

  // C# HandlePlayerUseSpray — RogueGame.cs:9034
  async HandlePlayerUseSpray(player: Actor): Promise<boolean> {
    const it = player.getEquippedItem(DollPart.LEFT_HAND);
    if (it == null) {
      this.AddMessage(this.MakeErrorMessage("No spray equipped."));
      this.RedrawPlayScreen();
      return false;
    }

    const sprayPaint = it instanceof ItemSprayPaint ? it as ItemSprayPaint : null;
    if (sprayPaint != null)
      return await this.HandlePlayerTag(player);

    const sprayScent = it instanceof ItemSprayScent ? it as ItemSprayScent : null;
    if (sprayScent != null) {
      return await this.HandlePlayerSprayOdorSuppressor(player);
    }

    this.AddMessage(this.MakeErrorMessage("No spray equipped."));
    this.RedrawPlayScreen();
    return false;
  }

  // C# HandlePlayerTag — RogueGame.cs:9070
  async HandlePlayerTag(player: Actor): Promise<boolean> {
    let loop = true;
    let actionDone = false;

    const sprayPaint = player.getEquippedItem(DollPart.LEFT_HAND) instanceof ItemSprayPaint ? player.getEquippedItem(DollPart.LEFT_HAND) as ItemSprayPaint : null;
    if (sprayPaint == null) {
      this.AddMessage(this.MakeErrorMessage("No spray paint equipped."));
      this.RedrawPlayScreen();
      return false;
    }
    if (sprayPaint.paintQuantity <= 0) {
      this.AddMessage(this.MakeErrorMessage("No paint left."));
      this.RedrawPlayScreen();
      return false;
    }

    this.ClearOverlays();
    this.AddOverlay(new OverlayPopup(this.TAG_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));
    do {
      this.RedrawPlayScreen();
      const dir = await this.WaitDirectionOrCancel();

      if (dir == null) {
        loop = false;
      } else if (dir !== Direction.NEUTRAL) {
        const pos = player.location.position.add(new Point(dir.dx, dir.dy));
        if (player.location.map!.isInBoundsPoint(pos)) {
          const res = this.CanTag(player.location.map!, pos);
          if (res.ok) {
            this.DoTag(player, sprayPaint, pos);
            loop = false;
            actionDone = true;
          } else {
            this.AddMessage(this.MakeErrorMessage(`Can't tag there : ${res.reason}.`));
            this.RedrawPlayScreen();
          }
        }
      }
    } while (loop);

    this.ClearOverlays();
    return actionDone;
  }

  // C# CanTag — RogueGame.cs:9142
  CanTag(map: Map, pos: Point): { ok: boolean; reason: string } {
    if (!map.isInBoundsPoint(pos)) {
      return { ok: false, reason: "out of map" };
    }

    const other = map.getActorAtPoint(pos);
    if (other != null) {
      return { ok: false, reason: "someone there" };
    }

    const mapObj = map.getMapObjectAt(pos.x, pos.y);
    if (mapObj != null) {
      return { ok: false, reason: "something there" };
    }

    return { ok: true, reason: "" };
  }

  // C# HandlePlayerSprayOdorSuppressor — RogueGame.cs:9179
  async HandlePlayerSprayOdorSuppressor(player: Actor): Promise<boolean> {
    let loop = true;
    let actionDone = false;

    const spray = player.getEquippedItem(DollPart.LEFT_HAND) instanceof ItemSprayScent ? player.getEquippedItem(DollPart.LEFT_HAND) as ItemSprayScent : null;
    if (spray == null) {
      this.AddMessage(this.MakeErrorMessage("No spray equipped."));
      this.RedrawPlayScreen();
      return false;
    }
    if (spray.sprayQuantity <= 0) {
      this.AddMessage(this.MakeErrorMessage("No spray left."));
      this.RedrawPlayScreen();
      return false;
    }

    this.ClearOverlays();
    this.AddOverlay(new OverlayPopup(this.SPRAY_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));
    do {
      this.RedrawPlayScreen();
      const dir = await this.WaitDirectionOrCancel();

      if (dir == null) {
        loop = false;
      } else {
        let sprayOn: Actor | null = null;

        if (dir === Direction.NEUTRAL) {
          sprayOn = player;
        } else {
          const pos = player.location.position.add(new Point(dir.dx, dir.dy));
          if (player.location.map!.isInBoundsPoint(pos))
            sprayOn = player.location.map!.getActorAtPoint(pos);
        }

        if (sprayOn == null) {
          this.AddMessage(this.MakeErrorMessage("No one to spray on here."));
          this.RedrawPlayScreen();
        } else {
          const res = this.m_Rules.canActorSprayOdorSuppressor(player, spray, sprayOn);
          if (res.ok) {
            this.DoSprayOdorSuppressor(player, spray, sprayOn);
            loop = false;
            actionDone = true;
          } else {
            this.AddMessage(this.MakeErrorMessage(`Can't spray here : ${res.reason}.`));
            this.RedrawPlayScreen();
          }
        }
      }
    } while (loop);

    this.ClearOverlays();
    return actionDone;
  }

  // C# StartPlayerWaitLong — RogueGame.cs:9267
  StartPlayerWaitLong(player: Actor): void {
    this.CheckAutoSaveTime();

    this.m_IsPlayerLongWait = true;
    this.m_IsPlayerLongWaitForcedStop = false;
    this.m_PlayerLongWaitEnd = new WorldTime(this.m_Session.worldTime.turnCounter + WorldTime.TURNS_PER_HOUR);

    this.AddMessage(this.MakeMessage(player, `${this.Conjugate(player, this.VERB_START)} waiting.`));
    this.RedrawPlayScreen();
  }

  // C# CheckPlayerWaitLong — RogueGame.cs:9282
  async CheckPlayerWaitLong(player: Actor): Promise<boolean> {
    if (this.m_IsPlayerLongWaitForcedStop)
      return false;

    if (this.m_Session.worldTime.turnCounter >= this.m_PlayerLongWaitEnd.turnCounter)
      return false;

    if (this.m_Rules.isActorHungry(player) || this.m_Rules.isActorStarving(player) || this.m_Rules.isActorSleepy(player) || this.m_Rules.isActorExhausted(player))
      return false;

    for (const p of this.m_PlayerFOV) {
      const other = player.location.map!.getActorAtPoint(p);
      if (other != null && this.m_Rules.areEnemies(player, other))
        return false;
    }

    if (await this.TryPlayerInsanity())
      return false;

    return true;
  }
  // C# HandlePlayerOrderMode — RogueGame.cs:9322
  async HandlePlayerOrderMode(player: Actor): Promise<boolean> {
    if (player.countFollowers === 0) {
      this.AddMessage(this.MakeErrorMessage("No followers to give orders to."));
      return false;
    }

    const followers: Actor[] = [];
    const fovs: Set<string>[] = [];
    const hasLinkWith: boolean[] = [];
    for (const fo of (player.followers ?? [])) {
      followers.push(fo);
      const foFov = LOS.computeFOVFor(this.m_Rules, fo, this.m_Session.worldTime, this.m_Session.world!.weather);
      fovs.push(foFov);
      const inView = foFov.has(player.location.position.toString()) && this.m_PlayerFOV.has(fo.location.position);
      const linkedByPhone = this.AreLinkedByPhone(player, fo);
      hasLinkWith.push(inView || linkedByPhone);
    }

    if (player.countFollowers === 1 && hasLinkWith[0]) {
      const done = await await this.HandlePlayerOrderFollower(player, followers[0]);
      this.ClearOverlays();
      this.ClearMessages();
      return done;
    }

    let loop = true;
    let actionDone = false;
    const maxFoOnPage = MAX_MESSAGES - 2;
    let iFirstFollower = 0;
    do {
      this.ClearOverlays();
      this.AddOverlay(new OverlayPopup(this.ORDER_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));
      this.ClearMessages();
      this.AddMessage(new Message("Choose a follower.", this.m_Session.worldTime.turnCounter, Color.Yellow));
      let foShown: number;
      for (foShown = 0; foShown < maxFoOnPage && (iFirstFollower + foShown < followers.length); foShown++) {
        const iFo = foShown + iFirstFollower;
        const f = followers[iFo];
        const desc = this.DescribePlayerFollowerStatus(f);

        if (hasLinkWith[iFo])
          this.AddMessage(new Message(`${1 + foShown}. ${iFo + 1}/${followers.length} ${f.name} ... ${desc}.`, this.m_Session.worldTime.turnCounter, Color.LightGreen));
        else
          this.AddMessage(new Message(`${1 + foShown}. ${iFo + 1}/${followers.length} (${f.name}) ${desc}.`, this.m_Session.worldTime.turnCounter, Color.DarkGray));
      }
      if (foShown < followers.length) {
        this.AddMessage(new Message("9. next", this.m_Session.worldTime.turnCounter, Color.LightGreen));
      }
      this.RedrawPlayScreen();

      const key = await this.m_UI.UI_WaitKey();
      const choice = this.KeyToChoiceNumber(key);

      if (key.key === "Escape") {
        loop = false;
      } else if (choice === 9) {
        iFirstFollower += maxFoOnPage;
        if (iFirstFollower >= followers.length)
          iFirstFollower = 0;
      } else if (choice >= 1 && choice <= foShown) {
        const f = iFirstFollower + choice - 1;
        if (hasLinkWith[f]) {
          const selectedFollower = followers[f];
          if (await await this.HandlePlayerOrderFollower(player, selectedFollower)) {
            loop = false;
            actionDone = true;
          }
        }
      }
    } while (loop);

    this.ClearOverlays();
    this.ClearMessages();
    return actionDone;
  }

  // C# HandlePlayerDirectiveFollower — RogueGame.cs:9437
  async HandlePlayerDirectiveFollower(_player: Actor, follower: Actor): Promise<boolean> {
    let loop = true;
    const actionDone = false;

    do {
      const directives = (follower.controller as AIController).directives;

      this.ClearOverlays();
      this.AddOverlay(new OverlayPopup(this.ORDER_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));
      this.ClearMessages();
      this.AddMessage(new Message(`${follower.name} directives...`, this.m_Session.worldTime.turnCounter, Color.Yellow));
      this.AddMessage(new Message(`1. ${directives.canTakeItems ? "Take" : "Don't take"} items.`, this.m_Session.worldTime.turnCounter, Color.LightGreen));
      this.AddMessage(new Message(`2. ${directives.canFireWeapons ? "Fire" : "Don't fire"} weapons.`, this.m_Session.worldTime.turnCounter, Color.LightGreen));
      this.AddMessage(new Message(`3. ${directives.canThrowGrenades ? "Throw" : "Don't throw"} grenades.`, this.m_Session.worldTime.turnCounter, Color.LightGreen));
      this.AddMessage(new Message(`4. ${directives.canSleep ? "Sleep" : "Don't sleep"}.`, this.m_Session.worldTime.turnCounter, Color.LightGreen));
      this.AddMessage(new Message(`5. ${directives.canTrade ? "Trade" : "Don't trade"}.`, this.m_Session.worldTime.turnCounter, Color.LightGreen));
      this.AddMessage(new Message(`6. ${ActorDirective.courageString(directives.courage)}.`, this.m_Session.worldTime.turnCounter, Color.LightGreen));
      this.RedrawPlayScreen();

      const key = await this.m_UI.UI_WaitKey();
      const choice = this.KeyToChoiceNumber(key);

      if (key.key === "Escape") {
        loop = false;
      } else if (choice >= 1 && choice <= 6) {
        switch (choice) {
          case 1: directives.canTakeItems = !directives.canTakeItems; break;
          case 2: directives.canFireWeapons = !directives.canFireWeapons; break;
          case 3: directives.canThrowGrenades = !directives.canThrowGrenades; break;
          case 4: directives.canSleep = !directives.canSleep; break;
          case 5: directives.canTrade = !directives.canTrade; break;
          case 6:
            switch (directives.courage) {
              case ActorCourage.COWARD: directives.courage = ActorCourage.CAUTIOUS; break;
              case ActorCourage.CAUTIOUS: directives.courage = ActorCourage.COURAGEOUS; break;
              case ActorCourage.COURAGEOUS: directives.courage = ActorCourage.COWARD; break;
            }
            break;
        }
      }
    } while (loop);

    return actionDone;
  }

  // C# HandlePlayerOrderFollower — RogueGame.cs:9515
  async HandlePlayerOrderFollower(player: Actor, follower: Actor): Promise<boolean> {
    if (!this.m_Rules.isActorTrustingLeader(follower)) {
      if (this.IsVisibleToPlayer(follower))
        this.DoSay(follower, player, "Sorry, I don't trust you enough yet.", SayFlags.IS_FREE_ACTION | SayFlags.IS_IMPORTANT);
      else if (this.AreLinkedByPhone(follower, player)) {
        this.ClearMessages();
        this.AddMessage(this.MakeMessage(follower, "Sorry, I don't trust you enough yet."));
        await this.AddMessagePressEnter();
      }
      return false;
    }

    const desc = this.DescribePlayerFollowerStatus(follower);
    const followerFOV = LOS.computeFOVFor(this.m_Rules, follower, this.m_Session.worldTime, this.m_Session.world!.weather);

    let loop = true;
    let actionDone = false;
    do {
      const startStopFollow = (follower.controller as OrderableAI).dontFollowLeader ? "Start" : "Stop";
      this.ClearOverlays();
      this.AddOverlay(new OverlayPopup(this.ORDER_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));
      this.ClearMessages();
      this.AddMessage(new Message(`Order ${follower.name} to...`, this.m_Session.worldTime.turnCounter, Color.Yellow));
      this.AddMessage(new Message(`0. Cancel current order ${desc}.`, this.m_Session.worldTime.turnCounter, Color.Green));
      this.AddMessage(new Message("1. Set directives...", this.m_Session.worldTime.turnCounter, Color.Cyan));
      this.AddMessage(new Message("2. Barricade (one)...    6. Drop all items.      A. Give me...", this.m_Session.worldTime.turnCounter, Color.LightGreen));
      this.AddMessage(new Message("3. Barricade (max)...    7. Build small fort.    B. Sleep now.", this.m_Session.worldTime.turnCounter, Color.LightGreen));
      this.AddMessage(new Message(`4. Guard...              8. Build large fort.    C. ${startStopFollow} following me.   `, this.m_Session.worldTime.turnCounter, Color.LightGreen));
      this.AddMessage(new Message("5. Patrol...             9. Report events.       D. Where are you?", this.m_Session.worldTime.turnCounter, Color.LightGreen));
      this.RedrawPlayScreen();

      const key = await this.m_UI.UI_WaitKey();
      const choice = this.KeyToChoiceNumber(key);

      if (key.key === "Escape") {
        loop = false;
      } else if (choice >= 0 && choice <= 9) {
        switch (choice) {
          case 0:
            this.DoCancelOrder(player, follower);
            loop = false;
            actionDone = true;
            break;
          case 1:
            await this.HandlePlayerDirectiveFollower(player, follower);
            break;
          case 2:
            if (await this.HandlePlayerOrderFollowerToBarricade(player, follower, followerFOV, false)) {
              loop = false;
              actionDone = true;
            }
            break;
          case 3:
            if (await this.HandlePlayerOrderFollowerToBarricade(player, follower, followerFOV, true)) {
              loop = false;
              actionDone = true;
            }
            break;
          case 4:
            if (await this.HandlePlayerOrderFollowerToGuard(player, follower, followerFOV)) {
              loop = false;
              actionDone = true;
            }
            break;
          case 5:
            if (await this.HandlePlayerOrderFollowerToPatrol(player, follower, followerFOV)) {
              loop = false;
              actionDone = true;
            }
            break;
          case 6:
            if (this.HandlePlayerOrderFollowerToDropAllItems(player, follower)) {
              loop = false;
              actionDone = true;
            }
            break;
          case 7:
            if (await this.HandlePlayerOrderFollowerToBuildFortification(player, follower, followerFOV, false)) {
              loop = false;
              actionDone = true;
            }
            break;
          case 8:
            if (await this.HandlePlayerOrderFollowerToBuildFortification(player, follower, followerFOV, true)) {
              loop = false;
              actionDone = true;
            }
            break;
          case 9:
            if (this.HandlePlayerOrderFollowerToReport(player, follower)) {
              loop = false;
              actionDone = true;
            }
            break;
        }
      } else {
        switch (key.key) {
          case "a":
          case "A":
            if (await this.HandlePlayerOrderFollowerToGiveItems(player, follower)) {
              loop = false;
              actionDone = true;
            }
            break;
          case "b":
          case "B":
            if (this.HandlePlayerOrderFollowerToSleep(player, follower)) {
              loop = false;
              actionDone = true;
            }
            break;
          case "c":
          case "C":
            if (this.HandlePlayerOrderFollowerToToggleFollow(player, follower)) {
              loop = false;
              actionDone = true;
            }
            break;
          case "d":
          case "D":
            if (this.HandlePlayerOrderFollowerToReportPosition(player, follower)) {
              loop = false;
              actionDone = true;
            }
            break;
        }
      }
    } while (loop);

    return actionDone;
  }

  // C# HandlePlayerOrderFollowerToBuildFortification — RogueGame.cs:9704
  async HandlePlayerOrderFollowerToBuildFortification(player: Actor, follower: Actor, followerFOV: Set<string>, isLarge: boolean): Promise<boolean> {
    let loop = true;
    let actionDone = false;
    const map = player.location.map!;
    let highlightedTile: Point | null = null;
    let highlightColor = Color.White;

    do {
      this.ClearOverlays();
      this.AddOverlay(new OverlayPopup(this.ORDER_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));
      if (highlightedTile != null)
        this.AddOverlay(new OverlayRect(highlightColor, new Rect(this.MapToScreen(highlightedTile.x, highlightedTile.y).x, this.MapToScreen(highlightedTile.x, highlightedTile.y).y, TILE_SIZE, TILE_SIZE)));
      this.ClearMessages();
      this.AddMessage(new Message(`Ordering ${follower.name} to build ${isLarge ? "large" : "small"} fortification...`, this.m_Session.worldTime.turnCounter, Color.Yellow));
      this.AddMessage(new Message("<LMB> on a map object.", this.m_Session.worldTime.turnCounter, Color.LightGreen));
      this.RedrawPlayScreen();

      const ev = await this.WaitKeyOrMouse();
      const key = ev.key;
      const mousePos = ev.mousePos;
      const mouseButtons = ev.mouseButtons;

      if (key != null) {
        if (key.key === "Escape")
          loop = false;
      } else {
        const mapPos = this.MouseToMap(mousePos);
        if (map.isInBoundsPoint(mapPos) && this.IsInViewRect(mapPos)) {
          if (this.IsVisibleToPlayer(map, mapPos) && followerFOV.has(mapPos.toString())) {
            const res = this.m_Rules.canActorBuildFortification(follower, mapPos, isLarge);
            if (res.ok) {
              highlightedTile = mapPos;
              highlightColor = Color.LightGreen;
              if (mouseButtons === MouseButton.Left) {
                this.DoGiveOrderTo(player, follower, new ActorOrder(isLarge ? ActorTasks.BUILD_LARGE_FORTIFICATION : ActorTasks.BUILD_SMALL_FORTIFICATION, new Location(map, mapPos)));
                loop = false;
                actionDone = true;
              }
            } else {
              highlightedTile = mapPos;
              highlightColor = Color.Red;
              if (mouseButtons === MouseButton.Left) {
                this.AddMessage(this.MakeErrorMessage(`Can't build ${isLarge ? "large" : "small"} fortification : ${res.reason}.`));
                await this.AddMessagePressEnter();
              }
            }
          } else {
            highlightedTile = mapPos;
            highlightColor = Color.Red;
          }
        }
      }
    } while (loop);

    return actionDone;
  }

  // C# HandlePlayerOrderFollowerToBarricade — RogueGame.cs:9795
  async HandlePlayerOrderFollowerToBarricade(player: Actor, follower: Actor, followerFOV: Set<string>, toTheMax: boolean): Promise<boolean> {
    let loop = true;
    let actionDone = false;
    const map = player.location.map!;
    let highlightedTile: Point | null = null;
    let highlightColor = Color.White;

    do {
      this.ClearOverlays();
      this.AddOverlay(new OverlayPopup(this.ORDER_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));
      if (highlightedTile != null)
        this.AddOverlay(new OverlayRect(highlightColor, new Rect(this.MapToScreen(highlightedTile.x, highlightedTile.y).x, this.MapToScreen(highlightedTile.x, highlightedTile.y).y, TILE_SIZE, TILE_SIZE)));
      this.ClearMessages();
      this.AddMessage(new Message(`Ordering ${follower.name} to barricade...`, this.m_Session.worldTime.turnCounter, Color.Yellow));
      this.AddMessage(new Message("<LMB> on a map object.", this.m_Session.worldTime.turnCounter, Color.LightGreen));
      this.RedrawPlayScreen();

      const ev = await this.WaitKeyOrMouse();
      const key = ev.key;
      const mousePos = ev.mousePos;
      const mouseButtons = ev.mouseButtons;

      if (key != null) {
        if (key.key === "Escape")
          loop = false;
      } else {
        const mapPos = this.MouseToMap(mousePos);
        if (map.isInBoundsPoint(mapPos) && this.IsInViewRect(mapPos)) {
          if (this.IsVisibleToPlayer(map, mapPos) && followerFOV.has(mapPos.toString())) {
            const door = map.getMapObjectAt(mapPos.x, mapPos.y) instanceof DoorWindow ? map.getMapObjectAt(mapPos.x, mapPos.y) as DoorWindow : null;
            if (door != null) {
              const res = this.m_Rules.canActorBarricadeDoor(follower, door);
              if (res.ok) {
                highlightedTile = mapPos;
                highlightColor = Color.LightGreen;
                if (mouseButtons === MouseButton.Left) {
                  this.DoGiveOrderTo(player, follower, new ActorOrder(toTheMax ? ActorTasks.BARRICADE_MAX : ActorTasks.BARRICADE_ONE, door.location));
                  loop = false;
                  actionDone = true;
                }
              } else {
                highlightedTile = mapPos;
                highlightColor = Color.Red;
                if (mouseButtons === MouseButton.Left) {
                  this.AddMessage(this.MakeErrorMessage(`Can't barricade ${door.theName} : ${res.reason}.`));
                  await this.AddMessagePressEnter();
                }
              }
            } else {
              highlightedTile = mapPos;
              highlightColor = Color.Red;
            }
          }
        }
      }
    } while (loop);

    return actionDone;
  }

  // C# HandlePlayerOrderFollowerToGuard — RogueGame.cs:9897
  async HandlePlayerOrderFollowerToGuard(player: Actor, follower: Actor, followerFOV: Set<string>): Promise<boolean> {
    let loop = true;
    let actionDone = false;
    const map = player.location.map!;
    let highlightedTile: Point | null = null;
    let highlightColor = Color.White;

    do {
      this.ClearOverlays();
      this.AddOverlay(new OverlayPopup(this.ORDER_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));
      if (highlightedTile != null)
        this.AddOverlay(new OverlayRect(highlightColor, new Rect(this.MapToScreen(highlightedTile.x, highlightedTile.y).x, this.MapToScreen(highlightedTile.x, highlightedTile.y).y, TILE_SIZE, TILE_SIZE)));
      this.ClearMessages();
      this.AddMessage(new Message(`Ordering ${follower.name} to guard...`, this.m_Session.worldTime.turnCounter, Color.Yellow));
      this.AddMessage(new Message("<LMB> on a map position.", this.m_Session.worldTime.turnCounter, Color.LightGreen));
      this.RedrawPlayScreen();

      const ev = await this.WaitKeyOrMouse();
      const key = ev.key;
      const mousePos = ev.mousePos;
      const mouseButtons = ev.mouseButtons;

      if (key != null) {
        if (key.key === "Escape")
          loop = false;
      } else {
        const mapPos = this.MouseToMap(mousePos);
        if (map.isInBoundsPoint(mapPos) && this.IsInViewRect(mapPos)) {
          if (this.IsVisibleToPlayer(map, mapPos) && followerFOV.has(mapPos.toString())) {
            const res = this.m_Rules.isWalkableFor(follower, map, mapPos.x, mapPos.y);
            if (mapPos.equals(follower.location.position) || res.ok) {
              highlightedTile = mapPos;
              highlightColor = Color.LightGreen;
              if (mouseButtons === MouseButton.Left) {
                this.DoGiveOrderTo(player, follower, new ActorOrder(ActorTasks.GUARD, new Location(map, mapPos)));
                loop = false;
                actionDone = true;
              }
            } else {
              highlightedTile = mapPos;
              highlightColor = Color.Red;
              if (mouseButtons === MouseButton.Left) {
                this.AddMessage(this.MakeErrorMessage(`Can't guard here : ${res.reason}`));
                await this.AddMessagePressEnter();
              }
            }
          } else {
            highlightedTile = mapPos;
            highlightColor = Color.Red;
          }
        }
      }
    } while (loop);

    return actionDone;
  }

  // C# HandlePlayerOrderFollowerToPatrol — RogueGame.cs:9988
  async HandlePlayerOrderFollowerToPatrol(player: Actor, follower: Actor, followerFOV: Set<string>): Promise<boolean> {
    let loop = true;
    let actionDone = false;
    const map = player.location.map!;
    let highlightedTile: Point | null = null;
    let highlightColor = Color.White;

    do {
      this.ClearOverlays();
      this.AddOverlay(new OverlayPopup(this.ORDER_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));
      if (highlightedTile != null) {
        this.AddOverlay(new OverlayRect(highlightColor, new Rect(this.MapToScreen(highlightedTile.x, highlightedTile.y).x, this.MapToScreen(highlightedTile.x, highlightedTile.y).y, TILE_SIZE, TILE_SIZE)));
        const zonesHere = map.getZonesAt(highlightedTile.x, highlightedTile.y);
        if (zonesHere != null && zonesHere.length > 0) {
          const zonesNames: string[] = new Array(zonesHere.length + 1);
          zonesNames[0] = "Zone(s) here :";
          for (let i = 0; i < zonesHere.length; i++) {
            zonesNames[i + 1] = `- ${zonesHere[i].name}`;
          }
          this.AddOverlay(new OverlayPopup(zonesNames, Color.White, Color.White, this.POPUP_FILLCOLOR, this.MapToScreen(highlightedTile.x + 1, highlightedTile.y + 1)));
        }
      }
      this.ClearMessages();
      this.AddMessage(new Message(`Ordering ${follower.name} to patrol...`, this.m_Session.worldTime.turnCounter, Color.Yellow));
      this.AddMessage(new Message("<LMB> on a map position.", this.m_Session.worldTime.turnCounter, Color.LightGreen));
      this.RedrawPlayScreen();

      const ev = await this.WaitKeyOrMouse();
      const key = ev.key;
      const mousePos = ev.mousePos;
      const mouseButtons = ev.mouseButtons;

      if (key != null) {
        if (key.key === "Escape")
          loop = false;
      } else {
        const mapPos = this.MouseToMap(mousePos);
        if (map.isInBoundsPoint(mapPos) && this.IsInViewRect(mapPos)) {
          if (this.IsVisibleToPlayer(map, mapPos) && followerFOV.has(mapPos.toString())) {
            let validPatrol = true;
            let reason = "";

            if (map.getZonesAt(mapPos.x, mapPos.y) == null) {
              validPatrol = false;
              reason = "no zone here";
            } else {
              const res = this.m_Rules.isWalkableFor(follower, map, mapPos.x, mapPos.y);
              if (!(mapPos.equals(follower.location.position) || res.ok)) {
                validPatrol = false;
                reason = res.reason;
              }
            }

            if (validPatrol) {
              highlightedTile = mapPos;
              highlightColor = Color.LightGreen;
              if (mouseButtons === MouseButton.Left) {
                this.DoGiveOrderTo(player, follower, new ActorOrder(ActorTasks.PATROL, new Location(map, mapPos)));
                loop = false;
                actionDone = true;
              }
            } else {
              highlightedTile = mapPos;
              highlightColor = Color.Red;
              if (mouseButtons === MouseButton.Left) {
                this.AddMessage(this.MakeErrorMessage(`Can't patrol here : ${reason}`));
                await this.AddMessagePressEnter();
              }
            }
          }
        }
      }
    } while (loop);

    return actionDone;
  }

  // C# HandlePlayerOrderFollowerToDropAllItems — RogueGame.cs:10103
  HandlePlayerOrderFollowerToDropAllItems(player: Actor, follower: Actor): boolean {
    if (follower.inventory!.isEmpty)
      return false;

    this.DoGiveOrderTo(player, follower, new ActorOrder(ActorTasks.DROP_ALL_ITEMS, follower.location));
    this.DoSay(follower, player, "Well ok...", SayFlags.IS_FREE_ACTION);
    this.ModifyActorTrustInLeader(follower, follower.inventory!.countItems * Rules.TRUST_GIVE_ITEM_ORDER_PENALTY, true);
    return true;
  }

  // C# HandlePlayerOrderFollowerToReport — RogueGame.cs:10122
  HandlePlayerOrderFollowerToReport(player: Actor, follower: Actor): boolean {
    this.DoGiveOrderTo(player, follower, new ActorOrder(ActorTasks.REPORT_EVENTS, follower.location));
    return true;
  }

  // C# HandlePlayerOrderFollowerToSleep — RogueGame.cs:10131
  HandlePlayerOrderFollowerToSleep(player: Actor, follower: Actor): boolean {
    this.DoGiveOrderTo(player, follower, new ActorOrder(ActorTasks.SLEEP_NOW, follower.location));
    return true;
  }

  // C# HandlePlayerOrderFollowerToToggleFollow — RogueGame.cs:10140
  HandlePlayerOrderFollowerToToggleFollow(player: Actor, follower: Actor): boolean {
    this.DoGiveOrderTo(player, follower, new ActorOrder(ActorTasks.FOLLOW_TOGGLE, follower.location));
    return true;
  }

  // C# HandlePlayerOrderFollowerToReportPosition — RogueGame.cs:10149
  HandlePlayerOrderFollowerToReportPosition(player: Actor, follower: Actor): boolean {
    this.DoGiveOrderTo(player, follower, new ActorOrder(ActorTasks.WHERE_ARE_YOU, follower.location));
    return true;
  }

  // C# HandlePlayerOrderFollowerToGiveItems — RogueGame.cs:10158
  async HandlePlayerOrderFollowerToGiveItems(player: Actor, follower: Actor): Promise<boolean> {
    if (follower.inventory == null || follower.inventory.isEmpty) {
      this.ClearMessages();
      this.AddMessage(this.MakeErrorMessage(`${follower.name} has no items to give.`));
      await this.AddMessagePressEnter();
      return false;
    }
    if (player.location.map !== follower.location.map || !this.m_Rules.isAdjacent(player.location.position, follower.location.position)) {
      this.ClearMessages();
      this.AddMessage(this.MakeErrorMessage(`${follower.name} is not next to you.`));
      await this.AddMessagePressEnter();
      return false;
    }

    let loop = true;
    let actionDone = false;

    let iFirstItem = 0;
    const maxItOnPage = MAX_MESSAGES - 2;
    const foInventory = follower.inventory;
    do {
      this.ClearOverlays();
      this.AddOverlay(new OverlayPopup(this.ORDER_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0)));
      this.ClearMessages();
      this.AddMessage(new Message(`Ordering ${follower.name} to give...`, this.m_Session.worldTime.turnCounter, Color.Yellow));

      let itShown: number;
      for (itShown = 0; itShown < maxItOnPage && (iFirstItem + itShown < foInventory.countItems); itShown++) {
        const iIt = iFirstItem + itShown;
        this.AddMessage(new Message(`${1 + itShown}. ${iIt + 1}/${foInventory.countItems} ${this.DescribeItemShort(foInventory.getItem(iIt)!)}.`, this.m_Session.worldTime.turnCounter, Color.LightGreen));
      }
      if (itShown < foInventory.countItems) {
        this.AddMessage(new Message("9. next", this.m_Session.worldTime.turnCounter, Color.LightGreen));
      }
      this.RedrawPlayScreen();

      const key = await this.m_UI.UI_WaitKey();
      const choice = this.KeyToChoiceNumber(key);

      if (key.key === "Escape") {
        loop = false;
      } else if (choice === 9) {
        iFirstItem += maxItOnPage;
        if (iFirstItem >= foInventory.countItems)
          iFirstItem = 0;
      } else if (choice >= 1 && choice <= itShown) {
        const i = iFirstItem + choice - 1;
        const it = foInventory.getItem(i)!;

        const res = this.m_Rules.canActorGiveItemTo(follower, player, it);
        if (res.ok) {
          this.DoGiveItemTo(follower, this.m_Player, it);
          loop = false;
          actionDone = true;
        } else {
          this.ClearMessages();
          this.AddMessage(this.MakeErrorMessage(`${follower.name} cannot give ${this.DescribeItemShort(it)} : ${res.reason}.`));
          await this.AddMessagePressEnter();
        }
      }
    } while (loop);

    return actionDone;
  }
  // C# HandleAiActor — RogueGame.cs:10255
  HandleAiActor(aiActor: Actor): void {
    let desiredAction = aiActor.controller!.getAction(this);

    if (this.m_Rules.isActorInsane(aiActor) && this.m_Rules.rollChance(Rules.SANITY_INSANE_ACTION_CHANCE)) {
      const insaneAction = this.GenerateInsaneAction(aiActor);
      if (insaneAction != null && insaneAction.isLegal())
        desiredAction = insaneAction;
    }

    if (desiredAction != null) {
      if (desiredAction.isLegal())
        desiredAction.perform();
      else {
        this.SpendActorActionPoints(aiActor, Rules.BASE_ACTION_COST);
        this.DoWait(aiActor);
      }
    } else {
      throw new TypeError("AI returned null action.");
    }
  }

  // C# HandleAdvisor — RogueGame.cs:10296
  // C# ShowAdvisorMessage blocks on AddMessagePressEnter; async here.
  async HandleAdvisor(player: Actor): Promise<void> {
    void player; // C# takes the player but reads m_Player

    ///////////////////////////////
    // If all hints given, say so.
    ///////////////////////////////
    if (s_Hints.hasAdvisorGivenAllHints()) {
      await this.ShowAdvisorMessage("YOU KNOW THE BASICS!", [
        "The Advisor has given you all the hints.",
        "You can disable the advisor in the options.",
        "Read the manual or discover the rest of the game by yourself.",
        "Good luck and have fun!",
        `To REDEFINE THE KEYS : <${s_KeyBindings.get(PlayerCommand.KEYBINDING_MODE) ?? ""}>.`,
        `To CHANGE OPTIONS    : <${s_KeyBindings.get(PlayerCommand.OPTIONS_MODE) ?? ""}>.`,
        `To READ THE MANUAL   : <${s_KeyBindings.get(PlayerCommand.HELP_MODE) ?? ""}>.`
      ]);
      return;
    }

    /////////////////////////////////
    // Show the first appliable hint.
    /////////////////////////////////
    for (let i = AdvisorHint._FIRST; i < AdvisorHint._COUNT; i++) {
      if (s_Hints.isAdvisorHintGiven(i)) continue;
      if (this.IsAdvisorHintAppliable(i)) {
        await this.AdvisorGiveHint(i);
        return;
      }
    }

    // no hint.
    await this.ShowAdvisorMessage("No hint available.", [
      "The Advisor has now new hint for you in this situation.",
      "You will see a popup when he has something to say.",
      `To REDEFINE THE KEYS : <${s_KeyBindings.get(PlayerCommand.KEYBINDING_MODE) ?? ""}>.`,
      `To CHANGE OPTIONS    : <${s_KeyBindings.get(PlayerCommand.OPTIONS_MODE) ?? ""}>.`,
      `To READ THE MANUAL   : <${s_KeyBindings.get(PlayerCommand.HELP_MODE) ?? ""}>.`
    ]);
  }

  // C# GetAdvisorFirstAvailableHint — RogueGame.cs:10362 (-1 if none)
  GetAdvisorFirstAvailableHint(): number {
    for (let i = AdvisorHint._FIRST; i < AdvisorHint._COUNT; i++) {
      if (s_Hints.isAdvisorHintGiven(i)) continue;
      if (this.IsAdvisorHintAppliable(i)) return i;
    }
    return -1;
  }

  // C# AdvisorGiveHint — RogueGame.cs:10375
  async AdvisorGiveHint(hint: AdvisorHint): Promise<void> {
    // Mark as given
    s_Hints.setAdvisorHintAsGiven(hint);
    // Save status.
    this.SaveHints();
    // Show
    await this.ShowAdvisorHint(hint);
  }

  // C# IsAdvisorHintAppliable — RogueGame.cs:10393
  IsAdvisorHintAppliable(hint: AdvisorHint): boolean {
    const map = this.m_Player.location.map!;
    const pos = this.m_Player.location.position;
    const p = this.m_Player;

    switch (hint) {
      case AdvisorHint.ACTOR_MELEE:   // adjacent to an enemy.
        return this.IsAdjacentToEnemy(map, pos, p);

      case AdvisorHint.BARRICADE:  // barricading.
        return map.hasAnyAdjacentInMap(pos, (pt) => {
          const door = map.getMapObjectAt(pt.x, pt.y);
          if (!(door instanceof DoorWindow)) return false;
          return this.m_Rules.canActorBarricadeDoor(p, door).ok;
        });

      case AdvisorHint.BUILD_FORTIFICATION: // building fortifications.
        return map.hasAnyAdjacentInMap(pos, (pt) => this.m_Rules.canActorBuildFortification(p, pt, false).ok);

      case AdvisorHint.CELLPHONES:
        return p.inventory != null &&
          p.inventory.getFirstByModel(Models.items.get(ItemID.TRACKER_CELL_PHONE)) != null;

      case AdvisorHint.CITY_INFORMATION:  // city information, wait a bit...
        return map.localTime.hour >= 12;

      case AdvisorHint.CORPSE:
        return !p.model.abilities.isUndead && map.getCorpsesAt(pos) != null;

      case AdvisorHint.CORPSE_EAT:
        return p.model.abilities.isUndead && map.getCorpsesAt(pos) != null;

      case AdvisorHint.DOORWINDOW_OPEN:   // can open an adj door/window.
        return map.hasAnyAdjacentInMap(pos, (pt) => {
          const door = map.getMapObjectAt(pt.x, pt.y);
          if (!(door instanceof DoorWindow)) return false;
          return this.m_Rules.isOpenableFor(p, door).ok;
        });

      case AdvisorHint.DOORWINDOW_CLOSE:   // can close an open door/window.
        return map.hasAnyAdjacentInMap(pos, (pt) => {
          const door = map.getMapObjectAt(pt.x, pt.y);
          if (!(door instanceof DoorWindow)) return false;
          return this.m_Rules.isClosableFor(p, door).ok;
        });

      case AdvisorHint.EXIT_STAIRS_LADDERS:  // using stairs, ladders.
        return map.getExitAt(pos) != null;

      case AdvisorHint.EXIT_LEAVING_DISTRICT: { // leaving the district.
        for (const d of Direction.COMPASS) {
          const pt = d.applyTo(pos);
          if (map.isInBoundsPoint(pt)) continue;
          if (map.getExitAt(pt) != null) return true;
        }
        return false;
      }

      case AdvisorHint.FLASHLIGHT:
        return p.inventory != null && p.inventory.hasItemOfType(ItemLight);

      case AdvisorHint.GAME_SAVE_LOAD:    // saving/loading. wait a bit...
        return map.localTime.hour >= 7;

      case AdvisorHint.GRENADE: {
        const inv = p.inventory;
        if (inv == null || inv.isEmpty) return false;
        return inv.hasItemOfType(ItemGrenade);
      }

      case AdvisorHint.ITEM_GRAB_CONTAINER: // can take an item from an adjacent container.
        return map.hasAnyAdjacentInMap(pos, (pt) => this.m_Rules.canActorGetItemFromContainer(p, pt).ok);

      case AdvisorHint.ITEM_GRAB_FLOOR: {   // can take an item from the floor.
        const invThere = map.getItemsAt(pos);
        if (invThere == null) return false;
        for (const it of invThere.items)
          if (this.m_Rules.canActorGetItem(p, it).ok) return true;
        return false;
      }

      case AdvisorHint.ITEM_EQUIP: {  // equip an item.
        const inv = p.inventory;
        if (inv == null || inv.isEmpty) return false;
        for (const it of inv.items)
          if (!it.isEquipped && this.m_Rules.canActorEquipItem(p, it).ok) return true;
        return false;
      }

      case AdvisorHint.ITEM_UNEQUIP: {  // unequip an item.
        const inv = p.inventory;
        if (inv == null || inv.isEmpty) return false;
        for (const it of inv.items)
          if (this.m_Rules.canActorUnequipItem(p, it).ok) return true;
        return false;
      }

      case AdvisorHint.ITEM_DROP: { // dropping an item.
        const inv = p.inventory;
        if (inv == null || inv.isEmpty) return false;
        for (const it of inv.items)
          if (this.m_Rules.canActorDropItem(p, it).ok) return true;
        return false;
      }

      case AdvisorHint.ITEM_TYPE_BARRICADING: { // barricading material.
        const inv = p.inventory;
        if (inv == null || inv.isEmpty) return false;
        return inv.hasItemOfType(ItemBarricadeMaterial);
      }

      case AdvisorHint.ITEM_USE: { // using an item.
        const inv = p.inventory;
        if (inv == null || inv.isEmpty) return false;
        for (const it of inv.items)
          if (this.m_Rules.canActorUseItem(p, it).ok) return true;
        return false;
      }

      case AdvisorHint.KEYS_OPTIONS:  // redefining keys & options.
        return true;

      case AdvisorHint.LEADING_CAN_RECRUIT:   // can recruit follower.
        return map.hasAnyAdjacentInMap(pos, (pt) => {
          const other = map.getActorAt(pt.x, pt.y);
          if (other == null) return false;
          return this.m_Rules.canActorTakeLead(p, other).ok;
        });

      case AdvisorHint.LEADING_GIVE_ORDERS:   // give orders to followers.
        return p.countFollowers > 0;

      case AdvisorHint.LEADING_NEED_SKILL:    // could recruit...
        return map.hasAnyAdjacentInMap(pos, (pt) => {
          const other = map.getActorAt(pt.x, pt.y);
          if (other == null) return false;
          return !this.m_Rules.areEnemies(p, other);
        });

      case AdvisorHint.LEADING_SWITCH_PLACE:  // switch place.
        return map.hasAnyAdjacentInMap(pos, (pt) => {
          const other = map.getActorAt(pt.x, pt.y);
          if (other == null) return false;
          return this.m_Rules.canActorSwitchPlaceWith(p, other).ok;
        });

      case AdvisorHint.MOUSE_LOOK:    // always!
        return map.localTime.turnCounter >= 2;  // don't spam at turn 0.

      case AdvisorHint.MOVE_BASIC:    // always!
        return true;

      case AdvisorHint.MOVE_JUMP:  // can jump.
        return !this.m_Rules.isActorTired(p) &&
          map.hasAnyAdjacentInMap(pos, (pt) => {
            const obj = map.getMapObjectAt(pt.x, pt.y);
            if (obj == null) return false;
            return obj.isJumpable;
          });

      case AdvisorHint.MOVE_RUN:   // running.
        return map.localTime.turnCounter >= 5 && this.m_Rules.canActorRun(p).ok;  // don't spam at turn 0.

      case AdvisorHint.MOVE_RESTING: // resting.
        return this.m_Rules.isActorTired(p);

      case AdvisorHint.NIGHT: // night effects, wait a bit.
        return map.localTime.turnCounter >= 1 * WorldTime.TURNS_PER_HOUR;

      case AdvisorHint.NPC_TRADE: { // trading.
        return map.hasAnyAdjacentInMap(pos, (pt) => {
          const other = map.getActorAt(pt.x, pt.y);
          if (other == null) return false;
          return this.m_Rules.canActorInitiateTradeWith(p, other).ok;
        });
      }

      case AdvisorHint.NPC_GIVING_ITEM: { // giving items.
        const inv = p.inventory;
        if (inv == null || inv.isEmpty) return false;
        return map.hasAnyAdjacentInMap(pos, (pt) => {
          const other = map.getActorAt(pt.x, pt.y);
          if (other == null) return false;
          return !this.m_Rules.areEnemies(p, other);
        });
      }

      case AdvisorHint.NPC_SHOUTING:  // shouting.
        return map.hasAnyAdjacentInMap(pos, (pt) => {
          const other = map.getActorAt(pt.x, pt.y);
          if (other == null) return false;
          return other.isSleeping && !this.m_Rules.areEnemies(p, other);
        });

      case AdvisorHint.OBJECT_BREAK: // breaking around.
        return map.hasAnyAdjacentInMap(pos, (pt) => {
          const obj = map.getMapObjectAt(pt.x, pt.y);
          if (obj == null) return false;
          return this.m_Rules.isBreakableFor(p, obj).ok;
        });

      case AdvisorHint.OBJECT_PUSH:   // pushable around.
        return map.hasAnyAdjacentInMap(pos, (pt) => {
          const obj = map.getMapObjectAt(pt.x, pt.y);
          if (obj == null) return false;
          return this.m_Rules.canActorPush(p, obj).ok;
        });

      case AdvisorHint.RAIN:  // rainy weather, wait a bit.
        return this.m_Rules.isWeatherRain(this.m_Session.weather) &&
          map.localTime.turnCounter >= 2 * WorldTime.TURNS_PER_HOUR;

      case AdvisorHint.SPRAYS_PAINT:    // using spraypaint.
        return p.inventory != null && p.inventory.hasItemOfType(ItemSprayPaint);

      case AdvisorHint.SPRAYS_SCENT:    // using scent sprays.
        return p.inventory != null && p.inventory.hasItemOfType(ItemSprayScent);

      case AdvisorHint.STATE_HUNGRY:
        return this.m_Rules.isActorHungry(p);

      case AdvisorHint.STATE_SLEEPY:
        return this.m_Rules.isActorSleepy(p);

      case AdvisorHint.WEAPON_FIRE: { // can fire a weapon.
        const rw = p.getEquippedWeapon();
        if (!(rw instanceof ItemRangedWeapon)) return false;
        return rw.ammo >= 0;
      }

      case AdvisorHint.WEAPON_RELOAD: { // reloading a weapon.
        const rw = p.getEquippedWeapon();
        if (!(rw instanceof ItemRangedWeapon)) return false;
        const inv = p.inventory;
        if (inv == null || inv.isEmpty) return false;
        for (const it of inv.items)
          if (it instanceof ItemAmmo && this.m_Rules.canActorUseItem(p, it).ok) return true;
        return false;
      }

      // alpha10 new hints

      case AdvisorHint.SANITY:  // sanity
        return p.sanity < 0.80 * this.m_Rules.actorMaxSanity(p);

      case AdvisorHint.INFECTION:
        return p.infection > 0;

      case AdvisorHint.TRAPS:
        return p.inventory != null && p.inventory.hasItemOfType(ItemTrap);

      default:
        throw new RangeError("unhandled hint " + hint);
    }
  }

  // C# GetAdvisorHintText — RogueGame.cs:10705 (C# out-params become the return object)
  GetAdvisorHintText(hint: AdvisorHint): { title: string; body: string[] } {
    let title: string;
    let body: string[];
    const key = (cmd: PlayerCommand) => `<${s_KeyBindings.get(cmd) ?? ""}>`;
    switch (hint) {
      case AdvisorHint.ACTOR_MELEE:
        title = "ATTACK AN ENEMY IN MELEE";
        body = [
          "You are next to an enemy.",
          "To ATTACK him, try to MOVE on him."];
        break;

      case AdvisorHint.BARRICADE:
        title = "BARRICADING A DOOR/WINDOW";
        body = [
          "You can barricade an adjacent door or window.",
          "Barricading uses material such as planks.",
          `To BARRICADE : ${key(PlayerCommand.BARRICADE_MODE)}.`
        ];
        break;

      case AdvisorHint.BUILD_FORTIFICATION:
        title = "BUILDING FORTIFICATIONS";
        body = [
          "You can now build fortifications thanks to the carpentry skill.",
          "You need enough barricading materials.",
          `To BUILD SMALL FORTIFICATIONS : ${key(PlayerCommand.BUILD_SMALL_FORTIFICATION)}.`,
          `To BUILD LARGE FORTIFICATIONS : ${key(PlayerCommand.BUILD_LARGE_FORTIFICATION)}.`
        ];
        break;

      case AdvisorHint.CELLPHONES:
        title = "CELLPHONES";
        body = [
          "You have found a cellphone.",
          "Cellphones are useful to keep contact with your follower(s).",
          "You and your follower(s) must have a cellphone equipped.",
          "You can recharge cellphones at power generators."
        ];
        break;

      case AdvisorHint.CITY_INFORMATION:
        title = "CITY INFORMATION";
        body = [
          "You know the layout of your town.",
          "You aso know the most notable locations.",
          `To VIEW THE CITY INFORMATION : ${key(PlayerCommand.CITY_INFO)}.`
        ];
        break;

      // alpha10 merged corpses hints
      case AdvisorHint.CORPSE:
        title = "CORPSES";
        body = [
          "You are standing on a CORPSE.",
          "Corpses will slowly rot away but may resurrect as zombies.",
          "You can BUTCHER a corpse as a way to prevent that.",
          "You can also DRAG corpses to move them.",
          "You can try to REVIVE corpses if you have the medic skill and a medikit.",
          "If you are desperate and starving you can resort to cannibalism by EATING corpses.",
          "To act, hover the mouse on it in the corpse list and...",
          "TO BUTCHER the CORPSE : <RMB>",
          "TO DRAG the CORPSE : <LMB>",
          `TO REVIVE the CORPSE : ${key(PlayerCommand.REVIVE_CORPSE)}`,
          `TO EAT the CORPSE : ${key(PlayerCommand.EAT_CORPSE)}`
        ];
        break;

      case AdvisorHint.CORPSE_EAT:
        title = "EATING CORPSES";
        body = [
          "You can eat a corpse to regain health.",
          "TO EAT A CORPSE : <RMB> on it in the corpse list."
        ];
        break;

      case AdvisorHint.DOORWINDOW_OPEN:
        title = "OPENING A DOOR/WINDOW";
        body = [
          "You are next to a closed door or window.",
          "To OPEN it, try to MOVE on it."
        ];
        break;

      case AdvisorHint.DOORWINDOW_CLOSE:
        title = "CLOSING A DOOR/WINDOW";
        body = [
          "You are next to an open door or window.",
          `To CLOSE : ${key(PlayerCommand.CLOSE_DOOR)}.`
        ];
        break;

      case AdvisorHint.EXIT_STAIRS_LADDERS:
        title = "USING STAIRS & LADDERS";
        body = [
          "You are standing on stairs or a ladder.",
          "You can use this exit to go on another map.",
          `To USE THE EXIT : ${key(PlayerCommand.USE_EXIT)}.`
        ];
        break;

      case AdvisorHint.FLASHLIGHT:
        title = "LIGHTING";
        body = [
          "You have found a lighting item, such as a flashlight.",
          "Equip the item to increase your view distance (FoV).",
          "Standing next to someone with a light on has the same effect.",
          "You can recharge flashlights at power generators."
        ];
        break;

      case AdvisorHint.GAME_SAVE_LOAD:
        title = "SAVING AND LOADING GAME";
        body = [
          "Now could be a good time to save your game.",
          "You can have only one save game active.",
          `To SAVE THE GAME : ${key(PlayerCommand.SAVE_GAME)}.`,
          `To LOAD THE GAME : ${key(PlayerCommand.LOAD_GAME)}.`,
          "You can also load the game from the main menu.",
          "Saving or loading can take a bit of time, please be patient.",
          "Or consider turning some game options to lower settings."
        ];
        break;

      case AdvisorHint.EXIT_LEAVING_DISTRICT:
        title = "LEAVING THE DISTRICT";
        body = [
          "You are next to a district EXIT.",
          "You can leave this district by MOVING into the exit."
        ];
        break;

      case AdvisorHint.GRENADE:
        title = "GRENADES";
        body = [
          "You have found a grenade.",
          "To THROW a GRENADE, EQUIP it and FIRE it.",
          `To FIRE : ${key(PlayerCommand.FIRE_MODE)}.`
        ];
        break;

      case AdvisorHint.ITEM_GRAB_CONTAINER:
        title = "TAKING AN ITEM FROM A CONTAINER";
        body = [
          "You are next to a container, such as a wardrobe or a shelf.",
          "You can TAKE the item there by MOVING into the object."
        ];
        break;

      case AdvisorHint.ITEM_GRAB_FLOOR:
        title = "TAKING AN ITEM FROM THE FLOOR";
        body = [
          "You are standing on a stack of items.",
          "The items are listed on the right panel in the ground inventory.",
          "To TAKE an item, move your mouse on the item on the ground inventory and <LMB>.",
          "Shortcut : <Ctrl-item slot number>."
        ];
        break;

      case AdvisorHint.ITEM_DROP:
        title = "DROPPING AN ITEM";
        body = [
          "You can drop items from your inventory.",
          "To DROP an item, <RMB> on it.",
          "The item must be unequiped first."
        ];
        break;

      case AdvisorHint.ITEM_EQUIP:
        title = "EQUIPING AN ITEM";
        body = [
          "You have an equipable item in your inventory.",
          "Typical equipable items are weapons, lights and phones.",
          "To EQUIP the item, <LMB> on it in your inventory.",
          "Shortcut : <Ctrl-item slot number>"
        ];
        break;

      case AdvisorHint.ITEM_TYPE_BARRICADING:
        title = "ITEM - BARRICADING MATERIAL";
        body = [
          "You have some barricading materials, such as planks.",
          "Barricading material is used when you barricade doors/windows or build fortifications.",
          "To build fortifications you need the CARPENTRY skill."
        ];
        break;

      case AdvisorHint.ITEM_UNEQUIP:
        title = "UNEQUIPING AN ITEM";
        body = [
          "You have equiped an item.",
          "The item is displayed with a green background.",
          "To UNEQUIP the item, <LMB> on it in your inventory.",
          "Shortcut: <Ctrl-item slot number>"
        ];
        break;

      case AdvisorHint.ITEM_USE:
        title = "USING AN ITEM";
        body = [
          "You can use one of your item.",
          "Typical usable items are food, medecine and ammunition.",
          "To USE the item, <LMB> on it in your inventory.",
          "Shortcut: <Ctrl-item slot number>"
        ];
        break;

      case AdvisorHint.KEYS_OPTIONS:
        title = "KEYS & OPTIONS";
        body = [
          `You can view and redefine the KEYS by pressing ${key(PlayerCommand.KEYBINDING_MODE)}.`,
          `You can change OPTIONS by pressing ${key(PlayerCommand.OPTIONS_MODE)}.`,
          "Some option changes will only take effect when starting a new game.",
          "Keys and Options are saved."
        ];
        break;

      case AdvisorHint.LEADING_CAN_RECRUIT:
        title = "LEADING - RECRUITING";
        body = [
          "You can recruit a follower next to you!",
          `To RECRUIT : ${key(PlayerCommand.LEAD_MODE)}.`
        ];
        break;

      case AdvisorHint.LEADING_GIVE_ORDERS:
        title = "LEADING - GIVING ORDERS";
        body = [
          "You can give orders and directives to your follower.",
          "You can also fire your followers.",
          `To GIVE ORDERS : ${key(PlayerCommand.ORDER_MODE)}.`,
          `To FIRE YOUR FOLLOWER : ${key(PlayerCommand.LEAD_MODE)}.`
        ];
        break;

      case AdvisorHint.LEADING_NEED_SKILL:
        title = "LEADING - LEADERSHIP SKILL";
        body = [
          "You can try to recruit a follower if you have the LEADERSHIP skill.",
          "The higher the skill, the more followers you can recruit."
        ];
        break;

      case AdvisorHint.LEADING_SWITCH_PLACE:
        title = "LEADING - SWITCHING PLACE";
        body = [
          "You can switch place with followers next to you.",
          `To SWITCH PLACE : ${key(PlayerCommand.SWITCH_PLACE)}.`
        ];
        break;

      case AdvisorHint.MOUSE_LOOK:
        title = "LOOKING WITH THE MOUSE";
        body = [
          "You can LOOK at actors and objects on the map.",
          "Move the MOUSE over something interesting.",
          "You will get a detailed description of the actor or object.",
          "This is useful to learn the game or assessing the tactical situation."
        ];
        break;

      case AdvisorHint.MOVE_BASIC:
        title = "MOVEMENT - DIRECTIONS";
        body = [
          "MOVE your character around with the movements keys.",
          "The default keys are your NUMPAD numbers.",
          "",
          "7 8 9",
          "4 - 6",
          "1 2 3",
          "",
          "5 makes you WAIT one turn.",
          "The move keys are the most important ones.",
          "When asked for a DIRECTION, press a MOVE key.",
          "Be sure to remember that!",
          "...and remember to keep NumLock on!"
        ];
        break;

      case AdvisorHint.MOVE_JUMP:
        title = "MOVEMENT - JUMPING";
        body = [
          "You can JUMP on or over an obstacle next to you.",
          "Typical jumpable objects are cars, fences and furniture.",
          "The object is described with 'Can be jumped on'.",
          "Some enemies can't jump and won't be able to follow you.",
          "Jumping is tiring and spends stamina.",
          "To jump, just MOVE on the obstacle."
        ];
        break;

      case AdvisorHint.MOVE_RUN:
        title = "MOVEMENT - RUNNING";
        body = [
          "You can RUN to move faster.",
          "Running is tiring and spend stamina.",
          `To TOGGLE RUNNING : ${key(PlayerCommand.RUN_TOGGLE)}.`
        ];
        break;

      case AdvisorHint.MOVE_RESTING:
        title = "MOVEMENT - RESTING";
        body = [
          "You are TIRED because you lost too much STAMINA.",
          "Being tired is bad for you!",
          "You move slowly.",
          "You can't do tiring activities such as running, fighting and jumping.",
          "You always recover a bit of stamina each turn.",
          "But you can REST to recover stamina faster.",
          `To REST/WAIT : ${key(PlayerCommand.WAIT_OR_SELF)}.`
        ];
        break;

      case AdvisorHint.NIGHT:
        title = "NIGHT TIME";
        body = [
          "It is night. Night time is penalizing for livings.",
          "They tire faster (stamina and sleep) and don't see very far.",
          "Undeads are not penalized by night at all."
        ];
        break;

      case AdvisorHint.NPC_GIVING_ITEM:
        title = "GIVING ITEMS";
        body = [
          "You can GIVE ITEMS to other actors.",
          `To GIVE AN ITEM : move the mouse over your item and press ${key(PlayerCommand.GIVE_ITEM)}.`
        ];
        break;

      case AdvisorHint.NPC_SHOUTING:
        title = "SHOUTING";
        body = [
          "Someone is sleeping near you.",
          "You can SHOUT to try to wake him or her up.",
          "Other actors can also shout to wake their friends up when they see danger.",
          `To SHOUT : ${key(PlayerCommand.SHOUT)}.`
        ];
        break;

      case AdvisorHint.NPC_TRADE:
        title = "TRADING";
        body = [
          "You can TRADE with an actor next to you.",
          "Actor that can trade with you have a $ icon on the map.",
          "Trading means exhanging items.",
          "To ask for a TRADE offer, just try to MOVE into the actor and accept or refuse the offer.",
          "You can also initiate a more detailled trade negociation.",
          `To NEGOCIATE A TRADE : press ${key(PlayerCommand.NEGOCIATE_TRADE)} and select an npc with the directions.`
        ];
        break;

      case AdvisorHint.OBJECT_BREAK:
        title = "BREAKING OBJECTS";
        body = [
          "You can try to BREAK an object around you.",
          "Typical breakable objects are furnitures, doors and windows.",
          `To BREAK : ${key(PlayerCommand.BREAK_MODE)}.`
        ];
        break;

      // alpha10 also pulling and mention shoving actors
      case AdvisorHint.OBJECT_PUSH:
        title = "PUSHING/PULLING OBJECTS";
        body = [
          "You can PUSH/PULL an OBJECT around you.",
          "Only MOVABLE objects can be pushed/pulled.",
          "Movable objects will be described as 'Can be moved'",
          "You can also PUSH/PULL ACTORS around you.",
          `To PUSH : ${key(PlayerCommand.PUSH_MODE)}.`,
          `To PULL : ${key(PlayerCommand.PULL_MODE)}.`
        ];
        break;

      case AdvisorHint.RAIN:
        title = "RAIN";
        body = [
          "It is raining. Rain has various effects.",
          "Livings vision is reduced.",
          "Firearms have more chance to jam.",
          "Scents evaporate faster."
        ];
        break;

      case AdvisorHint.SPRAYS_PAINT:
        title = "SPRAYS - SPRAYPAINT";
        body = [
          "You have found a can of spraypaint.",
          "You can tag a symbol on walls and floors.",
          "This is useful to mark some places and locations.",
          `To SPRAY : equip the spray and press ${key(PlayerCommand.USE_SPRAY)}.`
        ];
        break;

      case AdvisorHint.SPRAYS_SCENT:
        title = "SPRAYS - SCENT SPRAY";
        body = [
          "You have found a scent spray.",
          "You can spray some perfurme on yourself or another adjacent actor.",
          "This is useful to confuse the undeads because they hunt using their smell.",
          `To SPRAY : equip the spray and press ${key(PlayerCommand.USE_SPRAY)}.`
        ];
        break;

      case AdvisorHint.STATE_HUNGRY:
        title = "STATE - HUNGRY";
        body = [
          "You are HUNGRY.",
          "If you become starved you can die!",
          "You should EAT soon.",
          "To eat, just USE a food item, such as groceries.",
          "Read the manual for more explanations on hunger."
        ];
        break;

      case AdvisorHint.STATE_SLEEPY:
        title = "STATE - SLEEPY";
        body = [
          "You are SLEEPY.",
          "This is bad for you!",
          "You have a number of penalties.",
          "You should find a place to SLEEP.",
          "Couches are good places to sleep.",
          `To SLEEP : ${key(PlayerCommand.SLEEP)}.`,
          "Read the manual for more explanations on sleep."
        ];
        break;

      case AdvisorHint.WEAPON_FIRE:
        title = "FIRING A WEAPON";
        body = [
          "You can fire your equiped ranged weapon.",
          "You need to have valid targets.",
          "To fire on a target you need ammunitions and a clear line of fine.",
          "The target must be within the weapon range.",
          "The closer the target is, the easier it is to hit and it does slightly more damage.",
          `To FIRE : ${key(PlayerCommand.FIRE_MODE)}.`,
          "When firing you can switch to rapid fire mode : you will shoot twice but at reduced accuracy.",
          "Remember you need to have visible enemies to fire at.",
          "Read the manual for more explanation about firing and ranged weapons."
        ];
        break;

      case AdvisorHint.WEAPON_RELOAD:
        title = "RELOADING A WEAPON";
        body = [
          "You can reload your equiped ranged weapon.",
          "To RELOAD, just USE a compatible ammo item."
        ];
        break;

      // alpha10 new hints

      case AdvisorHint.SANITY:  // sanity
        title = "SANITY";
        body = [
          "You should care about your SANITY.",
          "If it gets too low, you can go insane.",
          "Living in this horrible world and seing horrible things will lower your sanity.",
          "You can recover sanity by :",
          "- Talking to people.",
          "- Having followers you trust.",
          "- Killing undeads.",
          "- Using entertainment items.",
          "- Taking pills."
        ];
        break;

      case AdvisorHint.INFECTION:
        title = "INFECTION";
        body = [
          "You are INFECTED!",
          "Most undeads bites are infectious.",
          "A low infection value will make you sick.",
          "A full infection value is death.",
          "Infection only worsen when you are biten.",
          "Cure the infection with appropriate meds."
        ];
        break;

      case AdvisorHint.TRAPS:
        title = "TRAPS";
        body = [
          "You are carrying TRAPS.",
          "Traps are a good way to protect places.",
          "Drop activated traps on tiles.",
          "Some traps are activated by dropping them.",
          "Other traps need to be activated before being dropped.",
          "You are always safe from your own traps.",
          "Traps layed by your followers are also safe."
        ];
        break;

      default:
        throw new RangeError("unhandled hint " + hint);
    }
    return { title, body };
  }

  // C# ShowAdvisorHint — RogueGame.cs:11201
  async ShowAdvisorHint(hint: AdvisorHint): Promise<void> {
    const { title, body } = this.GetAdvisorHintText(hint);
    await this.ShowAdvisorMessage(title, body);
  }

  // C# ShowAdvisorMessage — RogueGame.cs:11210
  // C# blocks on AddMessagePressEnter; async here. The trailing RedrawPlayScreen
  // is a slice-8 stub (throws) — overlays are stored, drawing comes later.
  async ShowAdvisorMessage(title: string, lines: string[]): Promise<void> {
    // clear.
    this.ClearMessages();
    this.ClearOverlays();

    // tell.
    const text: string[] = new Array(lines.length + 2);
    text[0] = "HINT : " + title;
    for (let i = 0; i < lines.length; i++) text[i + 1] = lines[i];
    text[lines.length + 1] = `(hint ${s_Hints.countAdvisorHintsGiven()}/${AdvisorHint._COUNT})`;
    this.AddOverlay(new OverlayPopup(text, Color.White, Color.White, Color.Black, new Point(0, 0)));

    // wait.
    this.ClearMessages();
    this.AddMessage(new Message("You can disable the advisor in the options screen.", this.m_Session.worldTime.turnCounter, Color.White));
    this.AddMessage(new Message(`To show the options screen : <${s_KeyBindings.get(PlayerCommand.OPTIONS_MODE) ?? ""}>.`, this.m_Session.worldTime.turnCounter, Color.White));
    await this.AddMessagePressEnter();

    // clear.
    this.ClearMessages();
    this.ClearOverlays();
    this.RedrawPlayScreen();
  }

  // C# WaitKeyOrMouse — RogueGame.cs:11237
  // C# busy-loops on sync peeks; the browser must yield to the event loop so
  // DOM input can arrive, so this is async here. C# out-params become the
  // returned object (key is null when the mouse moved/changed buttons).
  async WaitKeyOrMouse(): Promise<{ key: GameKeyEvent | null; mousePos: Point; mouseButtons: MouseButton | null }> {
    this.m_UI.UI_PeekKey(); // consume keys to avoid repeats
    const prevMousePos = this.m_UI.UI_GetMousePosition();
    let mousePos = new Point(-1, -1);
    let mouseButtons: MouseButton | null = null;
    for (;;) {
      const inKey = this.m_UI.UI_PeekKey();
      if (inKey != null) return { key: inKey, mousePos, mouseButtons };
      mousePos = this.m_UI.UI_GetMousePosition();
      mouseButtons = this.m_UI.UI_PeekMouseButtons();
      if (!mousePos.equals(prevMousePos) || mouseButtons != null) return { key: null, mousePos, mouseButtons };
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  // C# WaitDirectionOrCancel — RogueGame.cs:11270
  // C# blocks on UI_WaitKey; async here (see WaitEnter). Returns null on Exit/Cancel.
  async WaitDirectionOrCancel(): Promise<Direction | null> {
    for (;;) {
      const inKey = await this.m_UI.UI_WaitKey();
      if (inKey.key === "Escape") return null;
      const command = InputTranslator.keyToCommand(
        RogueGame.KeyBindings(),
        inKey.key,
        inKey.ctrl,
        inKey.alt,
        inKey.shift
      );
      const dir = this.CommandToDirection(command);
      if (dir != null) return dir;
    }
  }

  // C# WaitEnter — RogueGame.cs:11284
  // Blocking in C#; async here.
  async WaitEnter(): Promise<void> {
    for (;;) {
      const key = await this.m_UI.UI_WaitKey();
      if (key.key === "Enter") return;
    }
  }

  // C# WaitEscape — RogueGame.cs:11294
  async WaitEscape(): Promise<void> {
    for (;;) {
      const key = await this.m_UI.UI_WaitKey();
      if (key.key === "Escape") return;
    }
  }

  // C# KeyToChoiceNumber — RogueGame.cs:11309
  KeyToChoiceNumber(key: GameKeyEvent): number {
    // C# maps Keys.D0-D9/NumPad0-NumPad9, default -1. Browser `event.key` is
    // already "0"-"9" for both the digit row and the numeric keypad.
    if (key.key.length === 1 && key.key >= "0" && key.key <= "9") return Number(key.key);
    return -1;
  }

  // C# WaitYesOrNo — RogueGame.cs:11358
  async WaitYesOrNo(): Promise<boolean> {
    for (;;) {
      const key = await this.m_UI.UI_WaitKey();
      if (key.key === "y" || key.key === "Y") return true;
      if (key.key === "n" || key.key === "N" || key.key === "Escape") return false;
    }
  }

  // C# DescribeStuffAt — RogueGame.cs:11372 (null when nothing to describe)
  DescribeStuffAt(map: Map, mapPos: Point): string[] | null {
    // Actor?
    const actor = map.getActorAtPoint(mapPos);
    if (actor != null) return this.DescribeActor(actor);

    // Object/Items?
    const obj = map.getMapObjectAtPoint(mapPos);
    if (obj != null) return this.DescribeMapObject(obj, map, mapPos);

    // Items?
    const inv = map.getItemsAt(mapPos);
    if (inv != null && !inv.isEmpty) return this.DescribeInventory(inv);

    // Corpses?
    const corpses = map.getCorpsesAt(mapPos);
    if (corpses != null) return this.DescribeCorpses(corpses);

    // Nothing to describe!
    return null;
  }

  // C# DescribeActor — RogueGame.cs:11406
  DescribeActor(actor: Actor): string[] {
    const lines: string[] = [];
    const rules = this.m_Rules;
    const p = this.m_Player;

    // 1. Name-Faction(Gang), Model, SpawnTime, Order & Leader(trust if player), (Murder counter if player law enforcer);
    //    Enemy & Self-Defence.
    if (actor.faction != null) {
      if (actor.isInAGang)
        lines.push(`${this.Capitalize(actor.name)}, ${actor.faction.memberName}-${GameGangs.NAMES[actor.gangId]}.`);
      else
        lines.push(`${this.Capitalize(actor.name)}, ${actor.faction.memberName}.`);
    } else
      lines.push(`${this.Capitalize(actor.name)}.`);
    lines.push(`${this.Capitalize(actor.model.name)}.`);

    lines.push(`${actor.model.abilities.isUndead ? "Undead" : "Staying alive"} since ${new WorldTime(actor.spawnTime).toString()}.`);
    const ai = actor.controller instanceof AIController ? actor.controller : null;
    if (ai != null && ai.order != null) {
      lines.push(`Order : ${ai.order.toString()}.`);
    }
    if (actor.hasLeader) {
      if (actor.leader!.isPlayer) {
        if (actor.trustInLeader >= Rules.TRUST_BOND_THRESHOLD)
          lines.push("Trust : BOND.");
        else if (actor.trustInLeader >= Rules.TRUST_MAX)
          lines.push("Trust : MAX.");
        else
          lines.push(`Trust : ${actor.trustInLeader}/T:${Rules.TRUST_TRUSTING_THRESHOLD}-B:${Rules.TRUST_BOND_THRESHOLD}.`);
        if (ai instanceof OrderableAI) {
          if (ai.dontFollowLeader) lines.push("Ordered to not follow you.");
        }
        // gauges.
        lines.push(`Foo : ${actor.foodPoints} ${this.FoodToHoursUntilHungry(actor.foodPoints)}h`);
        lines.push(`Slp : ${actor.sleepPoints} ${rules.sleepToHoursUntilSleepy(actor.sleepPoints, actor.location.map!.localTime.isNight)}h`);
        lines.push(`San : ${actor.sanity} ${rules.sanityToHoursUntilUnstable(actor)}h`);
        lines.push(`Inf : ${actor.infection} ${rules.actorInfectionPercent(actor)}%`);
      } else
        lines.push(`Leader : ${this.Capitalize(actor.leader!.name)}.`);
    }

    // show murder counter if trusting follower or player is a law enforcer.
    if (actor.murdersCounter > 0 && p.model.abilities.isLawEnforcer) {
      lines.push("WANTED FOR MURDER!");
      lines.push(`${actor.murdersCounter} murder${actor.murdersCounter > 1 ? "s" : ""}!`);
    } else if (actor.hasLeader && actor.leader!.isPlayer && rules.isActorTrustingLeader(actor)) {
      if (actor.murdersCounter > 0)
        lines.push(`* Confess ${actor.murdersCounter} murder${actor.murdersCounter > 1 ? "s" : ""}! *`);
      else
        lines.push("Has committed no murders.");
    }
    if (actor.isAggressorOf(p)) lines.push("Aggressed you.");
    if (p.isSelfDefenceFrom(actor)) lines.push(`You can kill ${this.HimOrHer(actor)} in self-defence.`);
    if (p.isAggressorOf(actor)) lines.push(`You aggressed ${this.HimOrHer(actor)}.`);
    if (actor.isSelfDefenceFrom(p)) lines.push("Killing you would be self-defence.");
    if (!p.faction.isEnemyOf(actor.faction) && rules.areGroupEnemies(p, actor)) // alpha10
      lines.push("You are enemies through groups.");

    lines.push("");

    // 2. Activity & Hunger/Sleep/Sanity
    const activityLine = this.DescribeActorActivity(actor);
    if (activityLine != null) lines.push(activityLine);
    else lines.push(" ");  // blank activity line
    if (actor.model.abilities.hasToSleep) {
      if (rules.isActorExhausted(actor)) lines.push("Exhausted!");
      else if (rules.isActorSleepy(actor)) lines.push("Sleepy.");
    }
    if (actor.model.abilities.hasToEat) {
      if (rules.isActorStarving(actor)) lines.push("Starving!");
      else if (rules.isActorHungry(actor)) lines.push("Hungry.");
    } else if (actor.model.abilities.isRotting) {
      if (rules.isRottingActorStarving(actor)) lines.push("Starving!");
      else if (rules.isRottingActorHungry(actor)) lines.push("Hungry.");
    }
    if (actor.model.abilities.hasSanity) {
      if (rules.isActorInsane(actor)) lines.push("Insane!");
      else if (rules.isActorDisturbed(actor)) lines.push("Disturbed.");
    }

    // 3. Speed
    lines.push((rules.actorSpeed(actor) / Rules.BASE_SPEED).toFixed(2));

    // 4. HP & STA.
    let hpLine: string;
    const maxHP = rules.actorMaxHPs(actor);
    if (actor.hitPoints !== maxHP)
      hpLine = `HP  : ${String(actor.hitPoints).padStart(2, "0")}/${String(maxHP).padStart(2, "0")}`;
    else
      hpLine = `HP  : ${String(actor.hitPoints).padStart(2, "0")} MAX`;
    if (actor.model.abilities.canTire) {
      const maxSTA = rules.actorMaxSTA(actor);
      if (actor.staminaPoints !== maxSTA)
        hpLine += `   STA : ${actor.staminaPoints}/${maxSTA}`;
      else
        hpLine += `   STA : ${actor.staminaPoints} MAX`;
    }
    lines.push(hpLine);

    // 5. Attack, Dmg, Defence.
    const attack = rules.actorMeleeAttack(actor, actor.currentMeleeAttack, null);
    lines.push(`Atk : ${String(attack.hitValue).padStart(2, "0")} Dmg : ${String(attack.damageValue).padStart(2, "0")}`);
    const defence = rules.actorDefence(actor, actor.currentDefence);
    lines.push(`Def : ${String(defence.value).padStart(2, "0")}`);
    lines.push(`Arm : ${defence.protectionHit}/${defence.protectionShot}`);
    lines.push(" ");

    // 6. Flavor
    lines.push(actor.model.flavorDescription);
    lines.push(" ");

    // 7. Skills
    const st = actor.sheet.skillTable;
    if (st != null && st.countSkills > 0) {
      for (const sk of st.skills!)
        lines.push(`${sk.level}-${Skills.name(sk.id)}`);
      lines.push(" ");
    }

    // alpha10
    // 8. Unusual abilities
    // unusual abilities for undeads
    if (actor.model.abilities.isUndead) {
      // fov
      lines.push(`- FOV : ${actor.model.startingSheet.baseViewRange}.`);

      // smell rating
      const smell = Math.floor(100 * rules.actorSmell(actor));  // applies z-tracker skill
      lines.push(
        smell === 0 ? "- Has no sense of smell." :
        smell < 50 ? "- Has poor sense of smell." :
        smell < 100 ? "- Has good sense of smell." :
        "- Has excellent sense of smell.");

      // grab?
      if (st != null && st.getSkillLevel(SkillID.Z_GRAB) > 0)
        lines.push("- Z-Grab : this undead can grab its victims.");

      if (actor.model.abilities.isUndeadMaster) lines.push("- Other undeads follow this undead tracks.");
      else if (smell > 0) lines.push("- This undead will follow zombie masters tracks.");
      if (actor.model.abilities.isIntelligent) lines.push("- This undead is intelligent.");
      if (actor.model.abilities.canDisarm) lines.push("- This undead can disarm.");
      if (actor.model.abilities.canJump) {
        if (actor.model.abilities.canJumpStumble) lines.push("- This undead can jump but may stumble.");
        else lines.push("- This undead can jump.");
      }
      if (rules.hasActorPushAbility(actor)) lines.push("- This undead can push.");
      if (actor.model.abilities.zombieAIExplore) lines.push("- This undead will explore.");

      // things some of them cannot do
      if (!actor.model.abilities.isRotting) lines.push("- This undead will not rot.");
      if (!actor.model.abilities.canBashDoors) lines.push("- This undead cannot bash doors.");
      if (!actor.model.abilities.canBreakObjects) lines.push("- This undead cannot break objects.");
      if (!actor.model.abilities.canZombifyKilled) lines.push("- This undead cannot infect livings.");
      if (!actor.model.abilities.aiCanUseAIExits) lines.push("- This undead live in this map.");
    }
    // misc unusual abilities
    if (actor.model.abilities.isLawEnforcer) lines.push("- Is a law enforcer.");
    if (actor.model.abilities.isSmall) lines.push("- Is small and can sneak through things.");

    // 9. Inventory.
    if (actor.inventory != null && !actor.inventory.isEmpty) {
      lines.push(`Items ${actor.inventory.countItems}/${rules.actorMaxInv(actor)} : `);
      lines.push(...this.DescribeInventory(actor.inventory));
    }

    // done.
    return lines;
  }

  // C# DescribeActorActivity — RogueGame.cs:11610 (null for player/idle)
  DescribeActorActivity(actor: Actor): string | null {
    if (actor.isPlayer) return null;

    switch (actor.activity) {
      case Activity.IDLE:
        return null;

      case Activity.CHASING:
        if (actor.targetActor == null) return "Chasing!";
        return `Chasing ${actor.targetActor.name}!`;

      case Activity.FIGHTING:
        if (actor.targetActor == null) return "Fighting!";
        return `Fighting ${actor.targetActor.name}!`;

      case Activity.TRACKING:
        return "Tracking!";

      case Activity.FLEEING:
        return "Fleeing!";

      case Activity.FLEEING_FROM_EXPLOSIVE:
        return "Fleeing from explosives!";

      case Activity.FOLLOWING:
        if (actor.targetActor == null) return "Following.";
        // alpha10
        if (actor.leader === actor.targetActor) return `Following ${this.HisOrHer(actor)} leader.`;
        return `Following ${actor.targetActor.name}.`;

      case Activity.FOLLOWING_ORDER:
        return "Following orders.";

      case Activity.SLEEPING:
        return "Sleeping.";

      default:
        throw new TypeError("unhandled activity " + actor.activity);
    }
  }

  // C# DescribePlayerFollowerStatus — RogueGame.cs:11663
  DescribePlayerFollowerStatus(follower: Actor): string {
    const foAI = follower.controller;
    if (!(foAI instanceof BaseAI)) throw new TypeError("DescribePlayerFollowerStatus: controller is not BaseAI");
    let desc: string;
    if (foAI.order == null) desc = "(no orders)";
    else desc = foAI.order.toString();
    desc += `(trust:${follower.trustInLeader})`;
    return desc;
  }

  // C# DescribeMapObject — RogueGame.cs:11677
  DescribeMapObject(obj: MapObject, map: Map, mapPos: Point): string[] {
    const lines: string[] = [];

    // 1. Name
    lines.push(`${obj.aName}.`);

    // 2. Special flags.
    if (obj.isJumpable) lines.push("Can be jumped on.");
    if (obj.isCouch) lines.push("Is a couch.");
    if (obj.givesWood) lines.push("Can be dismantled for wood.");
    if (obj.isMovable) lines.push("Can be moved.");
    if (obj.standOnFovBonus) lines.push("Increases view range.");

    // 3. Common Status: Break, Fire.
    //    Concrete MapObjects status.
    let status = "";
    if (obj.breakState === MapObjectBreak.BROKEN) status += "Broken! ";
    if (obj.fireState === MapObjectFire.ONFIRE) status += "On fire! ";
    else if (obj.fireState === MapObjectFire.ASHES) status += "Burnt to ashes! ";
    lines.push(status);
    if (obj instanceof PowerGenerator) {
      if (obj.isOn) lines.push("Currently ON.");
      else lines.push("Currently OFF.");
      const powerRatio = this.m_Rules.computeMapPowerRatio(obj.location.map!);
      lines.push(`The power gauge reads ${Math.floor(100 * powerRatio)}%.`);
    } else if (obj instanceof Board) {
      lines.push("The text reads : ");
      lines.push(...obj.text);
    }

    // 4. HitPoints & Barricade
    if (obj.maxHitPoints > 0) {
      if (obj.hitPoints < obj.maxHitPoints)
        lines.push(`HP        : ${obj.hitPoints}/${obj.maxHitPoints}`);
      else
        lines.push(`HP        : ${obj.hitPoints} MAX`);

      if (obj instanceof DoorWindow) {
        if (obj.barricadePoints < Rules.BARRICADING_MAX)
          lines.push(`Barricades: ${obj.barricadePoints}/${Rules.BARRICADING_MAX}`);
        else
          lines.push(`Barricades: ${obj.barricadePoints} MAX`);
      }
    }

    // 5. Weight?
    if (obj.weight > 0) {
      lines.push(`Weight    : ${obj.weight}`);
    }

    // 6. Items there
    const inv = map.getItemsAt(mapPos);
    if (inv != null && !inv.isEmpty) {
      lines.push(...this.DescribeInventory(inv));
    }

    return lines;
  }

  // C# DescribeInventory — RogueGame.cs:11756
  DescribeInventory(inv: Inventory): string[] {
    const lines: string[] = [];

    for (const it of inv.items) {
      if (it.isEquipped)
        lines.push(`- ${this.DescribeItemShort(it)} (equipped)`);
      else
        lines.push(`- ${this.DescribeItemShort(it)}`);
    }

    return lines;
  }

  // C# DescribeCorpses — RogueGame.cs:11771
  DescribeCorpses(corpses: readonly Corpse[]): string[] {
    const lines: string[] = [];

    if (corpses.length > 1)
      lines.push("There are corpses there...");
    else
      lines.push("There is a corpse here.");
    lines.push(" ");

    for (const c of corpses) {
      lines.push(`- Corpse of ${c.deadGuy.name}.`);
    }
    return lines;
  }

  // C# DescribeCorpseLong — RogueGame.cs:11788
  DescribeCorpseLong(c: Corpse, isInPlayerTile: boolean): string[] {
    const lines: string[] = [];

    // 1. Corpse of XXX
    lines.push(`Corpse of ${c.deadGuy.name}.`);
    lines.push(" ");

    // 2. Necrology infos.
    const necrology = this.m_Player.sheet.skillTable.getSkillLevel(SkillID.NECROLOGY);

    let deadSince = "???";
    if (necrology > 0)
      deadSince = WorldTime.makeTimeDurationMessage(this.m_Session.worldTime.turnCounter - c.turn);
    lines.push(`Death     : ${deadSince}.`);

    let infectionEst = "???";
    if (necrology >= Rules.SKILL_NECROLOGY_LEVEL_FOR_INFECTION) {
      const infectionP = this.m_Rules.actorInfectionPercent(c.deadGuy);
      if (infectionP === 0) infectionEst = "0/7 - none";
      else if (infectionP < 5) infectionEst = "1/7 - traces";
      else if (infectionP < 15) infectionEst = "2/7 - minor";
      else if (infectionP < 30) infectionEst = "3/7 - low";
      else if (infectionP < 55) infectionEst = "4/7 - average";
      else if (infectionP < 70) infectionEst = "5/7 - important";
      else if (infectionP < 99) infectionEst = "6/7 - great";
      else infectionEst = "7/7 - total";
    }
    lines.push(`Infection : ${infectionEst}.`);

    let riseEst = "???";
    if (necrology >= Rules.SKILL_NECROLOGY_LEVEL_FOR_RISE) {
      const riseP = 2 * this.m_Rules.corpseZombifyChance(c, c.deadGuy.location.map!.localTime, false);
      if (riseP < 5) riseEst = "0/6 - extremely unlikely";
      else if (riseP < 20) riseEst = "1/6 - unlikely";
      else if (riseP < 40) riseEst = "2/6 - possible";
      else if (riseP < 60) riseEst = "3/6 - likely";
      else if (riseP < 80) riseEst = "4/6 - very likely";
      else if (riseP < 99) riseEst = "5/6 - most likely";
      else riseEst = "6/6 - certain";
    }
    lines.push(`Rise      : ${riseEst}.`);
    lines.push(" ");

    // 3. Decay
    const rotLevel = this.m_Rules.corpseRotLevel(c);
    switch (rotLevel) {
      case 5: lines.push("The corpse is about to crumble to dust."); break;
      case 4: lines.push("The corpse is almost entirely rotten."); break;
      case 3: lines.push("The corpse is badly damaged."); break;
      case 2: lines.push("The corpse is damaged."); break;
      case 1: lines.push("The corpse is bruised and smells."); break;
      case 0: lines.push("The corpse looks fresh."); break;
      default: throw new RangeError("unhandled rot level");
    }

    // 4. Medic info.
    let reviveEst = "???";
    const medic = this.m_Player.sheet.skillTable.getSkillLevel(SkillID.MEDIC);
    if (medic >= Rules.SKILL_MEDIC_LEVEL_FOR_REVIVE_EST) {
      const reviveP = this.m_Rules.corpseReviveChance(this.m_Player, c);
      if (reviveP === 0) reviveEst = "impossible";
      else if (reviveP < 5) reviveEst = "0/6 - extremely unlikely";
      else if (reviveP < 20) reviveEst = "1/6 - unlikely";
      else if (reviveP < 40) reviveEst = "2/6 - possible";
      else if (reviveP < 60) reviveEst = "3/6 - likely";
      else if (reviveP < 80) reviveEst = "4/6 - very likely";
      else if (reviveP < 99) reviveEst = "5/6 - most likely";
      else reviveEst = "6/6 - certain";
    }
    lines.push(`Revive    : ${reviveEst}.`);

    // 5. Special keys.
    if (isInPlayerTile) {
      lines.push(" ");
      lines.push("----");
      lines.push("LBM to start/stop dragging.");
      lines.push(`RBM to ${this.m_Player.model.abilities.isUndead ? "eat" : "butcher"}.`);
      if (!this.m_Player.model.abilities.isUndead) {
        lines.push(`to eat: <${s_KeyBindings.get(PlayerCommand.EAT_CORPSE) ?? ""}>`);
        lines.push(`to revive : <${s_KeyBindings.get(PlayerCommand.REVIVE_CORPSE) ?? ""}>`);
      }
    }

    return lines;
  }

  // C# DescribeItemShort — RogueGame.cs:11881
  DescribeItemShort(it: Item): string {
    let name = it.quantity > 1 ? it.model.pluralName : it.aName;

    if (it instanceof ItemFood) {
      if (this.m_Rules.isFoodSpoiled(it, this.m_Session.worldTime.turnCounter))
        name += " (spoiled)";
      else if (this.m_Rules.isFoodExpired(it, this.m_Session.worldTime.turnCounter))
        name += " (expired)";
    } else if (it instanceof ItemRangedWeapon) {
      name += ` (${it.ammo}/${(it.model as ItemRangedWeaponModel).maxAmmo})`;
    } else if (it instanceof ItemTrap) {
      if (it.isActivated) name += "(activated)";
      if (it.isTriggered) name += "(triggered)";
      if (it.owner === this.m_Player) name += "(yours)";  // alpha10
    }

    if (it.quantity > 1) return `${it.quantity} ${name}`;
    else return name;
  }

  // C# DescribeItemLong — RogueGame.cs:11912
  DescribeItemLong(it: Item, isPlayerInventory: boolean, iSlot: number): string[] {
    const lines: string[] = [];
    let isDefaultUse = true; // alpha10
    const key = (cmd: PlayerCommand) => s_KeyBindings.get(cmd) ?? "";

    // 1. Name & stacking.
    if (it.model.isStackable) {
      lines.push(`${this.DescribeItemShort(it)} ${it.quantity}/${it.model.stackingLimit}`);
    } else
      lines.push(this.DescribeItemShort(it));

    // 2. Special flags.
    // unbreakable?
    if (it.model.isUnbreakable) {
      lines.push("Unbreakable.");
    }

    // 3. Item specific stuff...
    let inInvAdditionalDesc: string | null = null;
    if (it instanceof ItemWeapon) {
      lines.push(...this.DescribeItemWeapon(it));
      if (it instanceof ItemRangedWeapon) {
        isDefaultUse = false;
        inInvAdditionalDesc = `to fire : <${key(PlayerCommand.FIRE_MODE)}>`;
      }
    } else if (it instanceof ItemFood) {
      lines.push(...this.DescribeItemFood(it));
    } else if (it instanceof ItemMedicine) {
      lines.push(...this.DescribeItemMedicine(it));
    } else if (it instanceof ItemBarricadeMaterial) {
      lines.push(...this.DescribeItemBarricadeMaterial(it));
      isDefaultUse = false;
      inInvAdditionalDesc = `to build : <${key(PlayerCommand.BARRICADE_MODE)}>/<${key(PlayerCommand.BUILD_SMALL_FORTIFICATION)}>/<${key(PlayerCommand.BUILD_LARGE_FORTIFICATION)}>`;
    } else if (it instanceof ItemBodyArmor) {
      lines.push(...this.DescribeItemBodyArmor(it));
    } else if (it instanceof ItemSprayPaint) {
      lines.push(...this.DescribeItemSprayPaint(it));
      isDefaultUse = false;
      inInvAdditionalDesc = `to spray : <${key(PlayerCommand.USE_SPRAY)}>`;
    } else if (it instanceof ItemSprayScent) {
      lines.push(...this.DescribeItemSprayScent(it));
      isDefaultUse = false;
      inInvAdditionalDesc = `to spray : <${key(PlayerCommand.USE_SPRAY)}>`;
    } else if (it instanceof ItemLight) {
      lines.push(...this.DescribeItemLight(it));
    } else if (it instanceof ItemTracker) {
      lines.push(...this.DescribeItemTracker(it));
    } else if (it instanceof ItemAmmo) {
      lines.push(...this.DescribeItemAmmo(it));
      isDefaultUse = false;
      inInvAdditionalDesc = `to reload : <LMB> or <Ctrl-${iSlot + 1}>`;
    } else if (it instanceof ItemExplosive) {
      lines.push(...this.DescribeItemExplosive(it));
      inInvAdditionalDesc = `to throw : <${key(PlayerCommand.FIRE_MODE)}>`;
    } else if (it instanceof ItemTrap) {
      lines.push(...this.DescribeItemTrap(it));
      // alpha10
      if (it.trapModel.useToActivate)
        inInvAdditionalDesc = "to activate trap : use it";
      else
        inInvAdditionalDesc = "to activate trap : drop it";
    } else if (it instanceof ItemEntertainment) {
      lines.push(...this.DescribeItemEntertainment(it));
    }

    // 3. Flavor description
    lines.push(" ");
    lines.push(it.model.flavorDescription);

    // 4. Special keys.
    // alpha10 added more special keys very few players know about!
    if (isPlayerInventory) {
      lines.push(" ");
      lines.push("----");
      if (it.model.isEquipable)
        lines.push(`to ${it.isEquipped ? "unequip" : "equip"} : <LMB> or <Ctrl-${iSlot + 1}>`);
      else if (isDefaultUse)
        lines.push(`to use : <LMB> or <Ctrl-${iSlot + 1}>`);
      if (!it.isEquipped)
        lines.push("to drop : <RMB>");
      lines.push(`to give : <${key(PlayerCommand.GIVE_ITEM)}>`);
      if (inInvAdditionalDesc != null)
        lines.push(inInvAdditionalDesc);
    } else {
      lines.push(" ");
      lines.push("----");
      lines.push(`to take : <LMB> or <Shift-${iSlot + 1}>`);
    }

    // done.
    return lines;
  }

  // C# DescribeItemExplosive — RogueGame.cs:12039
  DescribeItemExplosive(ex: ItemExplosive): string[] {
    const lines: string[] = [];

    const m = ex.model as ItemExplosiveModel;
    const primed = ex instanceof ItemGrenadePrimed ? ex : null;

    lines.push("> explosive");

    // 1. Explosive attack.
    if (m.blastAttack.canDamageObjects) lines.push("Can damage objects.");
    if (m.blastAttack.canDestroyWalls) lines.push("Can destroy walls.");

    if (primed != null) lines.push(`Fuse          : ${primed.fuseTimeLeft} turn(s) left!`);
    else lines.push(`Fuse          : ${m.fuseDelay} turn(s)`);
    lines.push(`Blast radius  : ${m.blastAttack.radius}`);

    // 2. Damage for each distance.
    let damages = "";
    for (let blastRadius = 0; blastRadius <= m.blastAttack.radius; blastRadius++) {
      damages += `${this.m_Rules.blastDamage(blastRadius, m.blastAttack)};`;
    }
    lines.push(`Blast damages : ${damages}`);

    // 3. Specialized explosives.
    // grenade?
    if (ex instanceof ItemGrenade) {
      lines.push("> grenade");

      const greModel = ex.model as ItemGrenadeModel;
      const rng = this.m_Rules.actorMaxThrowRange(this.m_Player, greModel.maxThrowDistance);
      if (rng !== greModel.maxThrowDistance)
        lines.push(`Throwing rng  : ${rng} (${greModel.maxThrowDistance})`);
      else
        lines.push(`Throwing rng  : ${rng}`);
    }

    // 4. Primed?
    if (primed != null) {
      lines.push("PRIMED AND READY TO EXPLODE!");
    }

    return lines;
  }

  // C# DescribeItemWeapon — RogueGame.cs:12092
  DescribeItemWeapon(w: ItemWeapon): string[] {
    const lines: string[] = [];

    lines.push("> weapon");

    // 1. Attack
    const m = w.model as ItemWeaponModel;
    lines.push(`Atk : +${m.attack.hitValue}`);
    lines.push(`Dmg : +${m.attack.damageValue}`);
    // alpha10
    if (m.attack.staminaPenalty !== 0) lines.push(`Sta : -${m.attack.staminaPenalty}`);
    if (m.attack.disarmChance !== 0) lines.push(`Disarm : +${m.attack.disarmChance}%`);

    // 2. Melee vs Ranged items
    if (w instanceof ItemMeleeWeapon) {
      if (w.isFragile) lines.push("Breaks easily.");
      // alpha10 tool
      if (w.isTool) {
        lines.push("Is a tool.");
        const toolBashDmg = w.toolBashDamageBonus;
        if (toolBashDmg !== 0)
          lines.push(`Tool Dmg   : +${toolBashDmg} = +${toolBashDmg + m.attack.damageValue}`);
        const toolBuild = w.toolBuildBonus;
        if (toolBuild !== 0)
          lines.push(`Tool Build : +${Math.floor(100 * toolBuild)}%`);
      }
    } else if (w instanceof ItemRangedWeapon) {
      const rm = w.model as ItemRangedWeaponModel;
      if (rm.isFireArm) lines.push("> firearm");
      else if (rm.isBow) lines.push("> bow");
      else lines.push("> ranged weapon");

      // alpha10 (C# RapidFireHit1/2Value = Attack.Hit2/Hit3Value)
      lines.push(`Rapid Fire Atk: ${rm.attack.hit2Value} ${rm.attack.hit3Value}`);

      lines.push(`Rng  : ${rm.attack.range}-${rm.attack.efficientRange}`);
      if (w.ammo < rm.maxAmmo) lines.push(`Amo  : ${w.ammo}/${rm.maxAmmo}`);
      else lines.push(`Amo  : ${w.ammo} MAX`);
      lines.push(`Type : ${this.DescribeAmmoType(rm.ammoType)}`);
    }

    // done.
    return lines;
  }

  // C# DescribeAmmoType — RogueGame.cs:12156
  DescribeAmmoType(at: AmmoType): string {
    switch (at) {
      case AmmoType.BOLT: return "bolts";
      case AmmoType.HEAVY_PISTOL: return "heavy pistol bullets";
      case AmmoType.HEAVY_RIFLE: return "heavy rifle bullets";
      case AmmoType.LIGHT_PISTOL: return "light pistol bullets";
      case AmmoType.LIGHT_RIFLE: return "light rifle bullets";
      case AmmoType.SHOTGUN: return "shotgun cartridge";
      default:
        throw new RangeError("unhandled ammo type");
    }
  }

  // C# DescribeItemAmmo — RogueGame.cs:12171
  DescribeItemAmmo(am: ItemAmmo): string[] {
    const lines: string[] = [];

    lines.push("> ammo");

    // 1. Ammo type
    lines.push(`Type : ${this.DescribeAmmoType(am.ammoType)}`);

    return lines;
  }

  // C# DescribeItemFood — RogueGame.cs:12183
  DescribeItemFood(f: ItemFood): string[] {
    const lines: string[] = [];

    lines.push("> food");

    // 1. Fresh/Expired, Best-Before
    if (f.isPerishable) {
      if (this.m_Rules.isFoodStillFresh(f, this.m_Session.worldTime.turnCounter))
        lines.push("Fresh.");
      else if (this.m_Rules.isFoodExpired(f, this.m_Session.worldTime.turnCounter))
        lines.push("*Expired*");
      else if (this.m_Rules.isFoodSpoiled(f, this.m_Session.worldTime.turnCounter))
        lines.push("**SPOILED**");
      lines.push(`Best-Before : ${f.bestBefore?.toString() ?? "???"}`);
    } else
      lines.push("Always fresh.");

    // 2. Nutrition
    const nutrition = this.m_Rules.foodItemNutrition(f, this.m_Session.worldTime.turnCounter);
    const nutritionForPlayer = this.m_Player == null ? nutrition : this.m_Rules.actorItemNutritionValue(this.m_Player, nutrition);
    if (nutritionForPlayer === f.nutrition)
      lines.push(`Nutrition   : +${nutrition}`);
    else
      lines.push(`Nutrition   : +${nutritionForPlayer} (+${nutrition})`);

    return lines;
  }

  // C# DescribeItemMedicine — RogueGame.cs:12217
  DescribeItemMedicine(med: ItemMedicine): string[] {
    const lines: string[] = [];

    lines.push("> medicine");

    // alpha10 dont add lines for zero values

    const healingForPlayer = this.m_Player == null ? med.healing : this.m_Rules.actorMedicineEffect(this.m_Player, med.healing);
    if (med.healing !== 0) {
      if (healingForPlayer === med.healing)
        lines.push(`Healing : +${med.healing}`);
      else
        lines.push(`Healing : +${healingForPlayer} (+${med.healing})`);
    }

    const staminaForPlayer = this.m_Player == null ? med.staminaBoost : this.m_Rules.actorMedicineEffect(this.m_Player, med.staminaBoost);
    if (med.staminaBoost !== 0) {
      if (staminaForPlayer === med.staminaBoost)
        lines.push(`Stamina : +${med.staminaBoost}`);
      else
        lines.push(`Stamina : +${staminaForPlayer} (+${med.staminaBoost})`);
    }

    const sleepForPlayer = this.m_Player == null ? med.sleepBoost : this.m_Rules.actorMedicineEffect(this.m_Player, med.sleepBoost);
    if (med.sleepBoost !== 0) {
      if (sleepForPlayer === med.sleepBoost)
        lines.push(`Sleep   : +${med.sleepBoost}`);
      else
        lines.push(`Sleep   : +${sleepForPlayer} (+${med.sleepBoost})`);
    }

    const sanForPlayer = this.m_Player == null ? med.sanityCure : this.m_Rules.actorMedicineEffect(this.m_Player, med.sanityCure);
    if (med.sanityCure !== 0) {
      if (sanForPlayer === med.sanityCure)
        lines.push(`Sanity  : +${med.sanityCure}`);
      else
        lines.push(`Sanity  : +${sanForPlayer} (+${med.sanityCure})`);
    }

    if (Rules.hasInfection(this.m_Session.gameMode)) {
      const cureForPlayer = this.m_Player == null ? med.infectionCure : this.m_Rules.actorMedicineEffect(this.m_Player, med.infectionCure);
      if (med.infectionCure !== 0) {
        if (cureForPlayer === med.infectionCure)
          lines.push(`Cure    : +${med.infectionCure}`);
        else
          lines.push(`Cure    : +${cureForPlayer} (+${med.infectionCure})`);
      }
    }

    return lines;
  }

  // C# DescribeItemBarricadeMaterial — RogueGame.cs:12278
  DescribeItemBarricadeMaterial(bm: ItemBarricadeMaterial): string[] {
    const lines: string[] = [];

    const m = bm.barricadeModel;

    lines.push("> barricade material");

    // 1. Barricading value.
    const barForPlayer = this.m_Player == null ? m.barricadingValue : this.m_Rules.actorBarricadingPoints(this.m_Player, m.barricadingValue);
    if (barForPlayer === m.barricadingValue)
      lines.push(`Barricading : +${m.barricadingValue}`);
    else
      lines.push(`Barricading : +${barForPlayer} (+${m.barricadingValue})`);

    return lines;
  }

  // C# DescribeItemBodyArmor — RogueGame.cs:12296
  DescribeItemBodyArmor(b: ItemBodyArmor): string[] {
    const lines: string[] = [];

    lines.push("> body armor");

    // 1. Protection value.
    lines.push(`Protection vs Hits  : +${b.protectionHit}`);
    lines.push(`Protection vs Shots : +${b.protectionShot}`);
    lines.push(`Encumbrance         : -${b.encumbrance} DEF`);
    lines.push(`Weight              : -${(0.01 * b.weight).toFixed(2)} SPD`);

    // 2. Unsuspicious effects.
    const unsuspicious: string[] = [];
    const suspicious: string[] = [];
    if (b.isFriendlyForCops()) unsuspicious.push("Cops");
    if (b.isHostileForCops()) suspicious.push("Cops");
    for (const gang of GameGangs.BIKERS) {
      if (b.isHostileForBiker(gang)) suspicious.push(GameGangs.NAMES[gang]);
      if (b.isFriendlyForBiker(gang)) unsuspicious.push(GameGangs.NAMES[gang]);
    }
    // alpha10 fixed rule & desc mismatch (C# has the gangsta loop commented out)
    if (unsuspicious.length > 0) {
      lines.push("Unsuspicious to:");
      for (const s of unsuspicious) lines.push("- " + s);
    }
    if (suspicious.length > 0) {
      lines.push("Suspicious to:");
      for (const s of suspicious) lines.push("- " + s);
    }

    return lines;
  }

  // C# DescribeItemSprayPaint — RogueGame.cs:12340
  DescribeItemSprayPaint(sp: ItemSprayPaint): string[] {
    const lines: string[] = [];

    const m = sp.sprayPaintModel;

    lines.push("> spray paint");

    // 1. Paint
    if (sp.paintQuantity < m.maxPaintQuantity)
      lines.push(`Paint : ${sp.paintQuantity}/${m.maxPaintQuantity}`);
    else
      lines.push(`Paint : ${sp.paintQuantity} MAX`);

    return lines;
  }

  // C# DescribeItemSprayScent — RogueGame.cs:12357
  DescribeItemSprayScent(sp: ItemSprayScent): string[] {
    const lines: string[] = [];

    const m = sp.sprayScentModel;

    lines.push("> spray scent");

    // 1. Spray.
    if (sp.sprayQuantity < m.maxSprayQuantity)
      lines.push(`Spray    : ${sp.sprayQuantity}/${m.maxSprayQuantity}`);
    else
      lines.push(`Spray    : ${sp.sprayQuantity} MAX`);

    // alpha10
    // 2. Odor & Strength
    lines.push(`Odor     : ${this.Capitalize(Odor[sp.odor].toLowerCase())}`);
    lines.push(`Strength : ${Math.floor(sp.strength / WorldTime.TURNS_PER_HOUR)}h`);

    return lines;
  }

  // C# DescribeItemLight — RogueGame.cs:12380
  DescribeItemLight(lt: ItemLight): string[] {
    const lines: string[] = [];

    lines.push("> light");

    // 1. Batteries
    lines.push(this.DescribeBatteries(lt.batteries, lt.lightModel.maxBatteries));

    // 2. FoV
    lines.push(`FOV       : +${lt.fovBonus}`);

    return lines;
  }

  // C# DescribeItemTracker — RogueGame.cs:12397
  DescribeItemTracker(tr: ItemTracker): string[] {
    const lines: string[] = [];

    const m = tr.trackerModel;

    lines.push("> tracker");

    // 1. Batteries
    lines.push(this.DescribeBatteries(tr.batteries, m.maxBatteries));
    // alpha10 range if applicable
    // TODO -- should be an tracker item property, hardcoding is baaaad -_-
    if (tr.canTrackUndeads)
      lines.push(`Range: ${Rules.ZTRACKINGRADIUS}`);
    else
      lines.push("Range: whole map");

    // alpha10
    // 2. Clock
    if (tr.hasClock) {
      lines.push(" ");
      if (tr.batteries === 0)
        lines.push("Out of batteries, can't give the time.");
      else if (!tr.isEquipped)
        lines.push("Equip the item to read the time.");
      else
        lines.push(`The clock reads: ${this.m_Session.worldTime.hour}h, ${this.DescribeDayPhase(this.m_Session.worldTime.phase)}`);
    }

    return lines;
  }

  // C# DescribeItemTrap — RogueGame.cs:12430
  DescribeItemTrap(tr: ItemTrap): string[] {
    const lines: string[] = [];

    const m = tr.trapModel;

    lines.push("> trap");

    // 1. Status
    if (tr.isActivated) {
      lines.push("** Activated! **");
      // alpha10
      if (this.m_Rules.isSafeFromTrap(tr, this.m_Player)) {
        lines.push("You will safely avoid this trap.");
        const owner = tr.owner;
        if (owner != null) lines.push(`Trap setup by ${owner.name}.`);
      }
    } else if (tr.isTriggered) {
      // alpha10
      lines.push("** Triggered! **");
      if (this.m_Rules.isSafeFromTrap(tr, this.m_Player)) {
        lines.push("You will safely avoid this trap.");
        const owner = tr.owner;
        if (owner != null) lines.push(`Trap setup by ${owner.name}.`);
      }
    }
    // alpha10
    lines.push(`Trigger chance for you : ${this.m_Rules.getTrapTriggerChance(tr, this.m_Player)}%.`);

    // 2. Flags
    if (m.isOneTimeUse) lines.push("Desactives when triggered.");
    if (m.isNoisy) lines.push(`Makes ${m.noiseName} noise.`);
    if (m.useToActivate) lines.push("Use to activate.");

    // 3. Stats
    lines.push(`Damage  : ${m.damage} x${tr.quantity} = ${tr.quantity * m.damage}`);  // alpha10
    lines.push(`Trigger : ${m.triggerChance}% x${tr.quantity} = ${tr.quantity * m.triggerChance}%`);  // alpha10
    lines.push(`Break   : ${m.breakChance}%`);
    if (m.blockChance > 0) lines.push(`Block   : ${m.blockChance}%`);
    if (m.breakChanceWhenEscape > 0) lines.push(`${m.breakChanceWhenEscape}% to break on escape`);

    return lines;
  }

  // C# DescribeItemEntertainment — RogueGame.cs:12480
  DescribeItemEntertainment(ent: ItemEntertainment): string[] {
    const lines: string[] = [];

    const m = ent.entertainmentModel;

    lines.push("> entertainment");

    // player bored?
    if (this.m_Player != null && ent.isBoringFor(this.m_Player)) // alpha10 boring items item centric
      lines.push("* BORED OF IT! *");

    // San & Bore chance.
    lines.push(`Sanity : +${m.value}`);
    lines.push(`Boring : ${m.boreChance}%`);

    return lines;
  }

  // C# DescribeBatteries — RogueGame.cs:12499
  DescribeBatteries(batteries: number, maxBatteries: number): string {
    const hours = this.BatteriesToHours(batteries);
    if (batteries < maxBatteries)
      return `Batteries : ${batteries}/${maxBatteries} (${hours}h)`;
    else
      return `Batteries : ${batteries} MAX (${hours}h)`;
  }

  // C# DescribeSkillShort — RogueGame.cs:12509
  DescribeSkillShort(id: SkillID): string {
    switch (id) {
      case SkillID.AGILE:
        return `+${Rules.SKILL_AGILE_ATK_BONUS} melee ATK, +${Rules.SKILL_AGILE_DEF_BONUS} DEF`;
      case SkillID.AWAKE:
        return `+${Math.floor(100 * Rules.SKILL_AWAKE_SLEEP_BONUS)}% max SLP, +${Math.floor(100 * Rules.SKILL_AWAKE_SLEEP_REGEN_BONUS)}% SLP regen `;
      case SkillID.BOWS:
        return `bows +${Rules.SKILL_BOWS_ATK_BONUS} ATK, +${Rules.SKILL_BOWS_DMG_BONUS} DMG`;
      case SkillID.CARPENTRY:
        return `build, -${Rules.SKILL_CARPENTRY_LEVEL3_BUILD_BONUS} mat. at lvl 3, +${Math.floor(100 * Rules.SKILL_CARPENTRY_BARRICADING_BONUS)}% barricading`;
      case SkillID.CHARISMATIC:
        // alpha10.1 steal followers
        return `+${Rules.SKILL_CHARISMATIC_TRUST_BONUS} trust per turn, +${Rules.SKILL_CHARISMATIC_TRADE_BONUS}% trade rolls, steal followers`;
      case SkillID.FIREARMS:
        return `firearms +${Rules.SKILL_FIREARMS_ATK_BONUS} ATK, +${Rules.SKILL_FIREARMS_DMG_BONUS} DMG`;
      case SkillID.HARDY:
        return `sleeping anywhere heals, +${Rules.SKILL_HARDY_HEAL_CHANCE_BONUS}% chance to heal when sleeping`;
      case SkillID.HAULER:
        return `+${Rules.SKILL_HAULER_INV_BONUS} inventory slots`;
      case SkillID.HIGH_STAMINA:
        return `+${Rules.SKILL_HIGH_STAMINA_STA_BONUS} STA`;
      case SkillID.LEADERSHIP:
        return `+${Rules.SKILL_LEADERSHIP_FOLLOWER_BONUS} max Followers`;
      case SkillID.LIGHT_EATER:
        return `+${Math.floor(100 * Rules.SKILL_LIGHT_EATER_MAXFOOD_BONUS)}% max FOO, +${Math.floor(100 * Rules.SKILL_LIGHT_EATER_FOOD_BONUS)}% items food points`;
      case SkillID.LIGHT_FEET:
        return `+${Rules.SKILL_LIGHT_FEET_TRAP_BONUS}% to avoid and escape traps`;
      case SkillID.LIGHT_SLEEPER:
        return `+${Rules.SKILL_LIGHT_SLEEPER_WAKEUP_CHANCE_BONUS}% noise wake up chance`;
      case SkillID.MARTIAL_ARTS:
        return `unarmed only +${Rules.SKILL_MARTIAL_ARTS_ATK_BONUS} ATK, +${Rules.SKILL_MARTIAL_ARTS_DMG_BONUS} DMG, +${Rules.SKILL_MARTIAL_ARTS_DISARM_BONUS}% disarm`;
      case SkillID.MEDIC:
        return `+${Math.floor(100 * Rules.SKILL_MEDIC_BONUS)}% medicine items effects, +${Rules.SKILL_MEDIC_REVIVE_BONUS}% revive `;
      case SkillID.NECROLOGY:
        return `+${Rules.SKILL_NECROLOGY_UNDEAD_BONUS}/+${Rules.SKILL_NECROLOGY_CORPSE_BONUS} DMG vs undeads/corpses, data on corpses`;
      case SkillID.STRONG:
        return `+${Rules.SKILL_STRONG_DMG_BONUS} melee DMG, +${Rules.SKILL_STRONG_RESIST_DISARM_BONUS}% resist disarming, +${Rules.SKILL_STRONG_THROW_BONUS} throw range`;
      case SkillID.STRONG_PSYCHE:
        return `+${Math.floor(100 * Rules.SKILL_STRONG_PSYCHE_LEVEL_BONUS)}% SAN threshold`;
      case SkillID.TOUGH:
        return `+${Rules.SKILL_TOUGH_HP_BONUS} HP`;
      case SkillID.UNSUSPICIOUS:
        return `+${Rules.SKILL_UNSUSPICIOUS_BONUS}% unnoticed by law enforcers and gangs`;

      case SkillID.Z_AGILE:
        return `+${Rules.SKILL_ZAGILE_ATK_BONUS} melee ATK, +${Rules.SKILL_ZAGILE_DEF_BONUS} DEF, can jump`;
      case SkillID.Z_EATER:
        return `+${Math.floor(100 * Rules.SKILL_ZEATER_REGEN_BONUS)}% eating HP regen`;
      case SkillID.Z_GRAB:
        return `can grab enemies, +${Rules.SKILL_ZGRAB_CHANCE}% per level`;
      case SkillID.Z_INFECTOR:
        return `+${Math.floor(100 * Rules.SKILL_ZINFECTOR_BONUS)}% infection damage`;
      case SkillID.Z_LIGHT_EATER:
        return `+${Math.floor(100 * Rules.SKILL_ZLIGHT_EATER_MAXFOOD_BONUS)}% max ROT, +${Math.floor(100 * Rules.SKILL_ZLIGHT_EATER_FOOD_BONUS)}% from eating`;
      case SkillID.Z_LIGHT_FEET:
        return `+${Rules.SKILL_ZLIGHT_FEET_TRAP_BONUS}% to avoid traps`;
      case SkillID.Z_STRONG:
        return `+${Rules.SKILL_ZSTRONG_DMG_BONUS} melee DMG, can push`;
      case SkillID.Z_TOUGH:
        return `+${Rules.SKILL_ZTOUGH_HP_BONUS} HP`;
      case SkillID.Z_TRACKER:
        return `+${Math.floor(100 * Rules.SKILL_ZTRACKER_SMELL_BONUS)}% smell`;

      default:
        throw new RangeError("unhandled skill id");
    }
  }

  // C# DescribeDayPhase — RogueGame.cs:12578
  DescribeDayPhase(phase: DayPhase): string {
    switch (phase) {
      case DayPhase.SUNSET: return "Sunset";
      case DayPhase.EVENING: return "Evening";
      case DayPhase.MIDNIGHT: return "Midnight";
      case DayPhase.DEEP_NIGHT: return "Deep Night";
      case DayPhase.SUNRISE: return "Sunrise";
      case DayPhase.MORNING: return "Morning";
      case DayPhase.MIDDAY: return "Midday";
      case DayPhase.AFTERNOON: return "Afternoon";
      default: return "Unknown";
    }
  }

  // C# DescribeWeather — RogueGame.cs:12595
  DescribeWeather(weather: Weather): string {
    switch (weather) {
      case Weather.CLEAR: return "Clear";
      case Weather.CLOUDY: return "Cloudy";
      case Weather.RAIN: return "Rain";
      case Weather.HEAVY_RAIN: return "Heavy Rain";
      default: return "Unknown";
    }
  }

  // C# WeatherColor — RogueGame.cs:12609
  WeatherColor(weather: Weather): Color {
    switch (weather) {
      case Weather.CLOUDY: return Color.Gray;
      case Weather.HEAVY_RAIN: return Color.Blue;
      case Weather.RAIN: return Color.LightBlue;
      case Weather.CLEAR: return Color.Yellow;
      default: throw new RangeError("unhandled weather");
    }
  }

  // C# BatteriesToHours — RogueGame.cs:12623
  BatteriesToHours(batteries: number): number {
    return Math.floor(batteries / WorldTime.TURNS_PER_HOUR);
  }

  // C# FoodToHoursUntilHungry — RogueGame.cs:12628
  FoodToHoursUntilHungry(food: number): number {
    const left = food - Rules.FOOD_HUNGRY_LEVEL;
    if (left <= 0) return 0;
    return Math.floor(left / WorldTime.TURNS_PER_HOUR);
  }

  // C# FoodToHoursUntilRotHungry — RogueGame.cs:12636
  FoodToHoursUntilRotHungry(food: number): number {
    const left = food - Rules.ROT_HUNGRY_LEVEL;
    if (left <= 0) return 0;
    return Math.floor(left / WorldTime.TURNS_PER_HOUR);
  }

  // C# IsAlmostHungry — RogueGame.cs:12644
  IsAlmostHungry(actor: Actor): boolean {
    if (!actor.model.abilities.hasToEat) return false;
    return this.FoodToHoursUntilHungry(actor.foodPoints) <= 3;
  }

  // C# IsAlmostRotHungry — RogueGame.cs:12651
  IsAlmostRotHungry(actor: Actor): boolean {
    if (!actor.model.abilities.isRotting) return false;
    return this.FoodToHoursUntilRotHungry(actor.foodPoints) <= 3;
  }

  // C# CommandToDirection — RogueGame.cs:12660 (slice 6 borrow: WaitDirectionOrCancel needs it)
  CommandToDirection(cmd: PlayerCommand): Direction | null {
    switch (cmd) {
      case PlayerCommand.MOVE_N: return Direction.N;
      case PlayerCommand.MOVE_NE: return Direction.NE;
      case PlayerCommand.MOVE_E: return Direction.E;
      case PlayerCommand.MOVE_SE: return Direction.SE;
      case PlayerCommand.MOVE_S: return Direction.S;
      case PlayerCommand.MOVE_SW: return Direction.SW;
      case PlayerCommand.MOVE_W: return Direction.W;
      case PlayerCommand.MOVE_NW: return Direction.NW;
      case PlayerCommand.WAIT_OR_SELF: return Direction.NEUTRAL;
      default: return null;
    }
  }

  // C# DoMoveActor — RogueGame.cs:12692 (+1 overloads)
  DoMoveActor(actor: Actor, direction: Location | Direction): void {
    void actor;
    void direction;
    throw new Error("not yet ported: DoMoveActor (RogueGame.cs:12692)");
  }

  // C# OnActorEnterTile — RogueGame.cs:12804
  OnActorEnterTile(actor: Actor): void {
    void actor;
    throw new Error("not yet ported: OnActorEnterTile (RogueGame.cs:12804)");
  }

  // C# TryActorLeaveTile — RogueGame.cs:12840
  TryActorLeaveTile(actor: Actor): boolean {
    void actor;
    throw new Error("not yet ported: TryActorLeaveTile (RogueGame.cs:12840)");
  }

  // C# TryTriggerTrap — RogueGame.cs:12917
  TryTriggerTrap(trap: ItemTrap, victim: Actor): boolean {
    void trap;
    void victim;
    throw new Error("not yet ported: TryTriggerTrap (RogueGame.cs:12917)");
  }

  // C# TryEscapeTrap — RogueGame.cs:12938
  TryEscapeTrap(trap: ItemTrap, victim: Actor, isDestroyed: boolean): { ok: boolean; isDestroyed: boolean } {
    void trap;
    void victim;
    void isDestroyed;
    throw new Error("not yet ported: TryEscapeTrap (RogueGame.cs:12938)");
  }

  // C# UntriggerAllTrapsHere — RogueGame.cs:12981
  UntriggerAllTrapsHere(loc: Location): void {
    void loc;
    throw new Error("not yet ported: UntriggerAllTrapsHere (RogueGame.cs:12981)");
  }

  // C# CheckMapObjectTriggersTraps — RogueGame.cs:13000
  CheckMapObjectTriggersTraps(map: Map, pos: Point): void {
    void map;
    void pos;
    throw new Error("not yet ported: CheckMapObjectTriggersTraps (RogueGame.cs:13000)");
  }

  // C# DoTriggerTrap — RogueGame.cs:13038
  DoTriggerTrap(trap: ItemTrap, map: Map, pos: Point, victim: Actor, mobj: MapObject): void {
    void trap;
    void map;
    void pos;
    void victim;
    void mobj;
    throw new Error("not yet ported: DoTriggerTrap (RogueGame.cs:13038)");
  }

  // C# DoLeaveMap — RogueGame.cs:13095
  DoLeaveMap(actor: Actor, exitPoint: Point, askForConfirmation: boolean): boolean {
    void actor;
    void exitPoint;
    void askForConfirmation;
    throw new Error("not yet ported: DoLeaveMap (RogueGame.cs:13095)");
  }

  // C# DoFollowersEnterMap — RogueGame.cs:13237
  DoFollowersEnterMap(leader: Actor, fromMap: Map, fromPos: Point, toMap: Map, toPos: Point): void {
    void leader;
    void fromMap;
    void fromPos;
    void toMap;
    void toPos;
    throw new Error("not yet ported: DoFollowersEnterMap (RogueGame.cs:13237)");
  }

  // C# DoUseExit — RogueGame.cs:13318
  DoUseExit(actor: Actor, exitPoint: Point): boolean {
    void actor;
    void exitPoint;
    throw new Error("not yet ported: DoUseExit (RogueGame.cs:13318)");
  }

  // C# DoSwitchPlace — RogueGame.cs:13326
  DoSwitchPlace(actor: Actor, other: Actor): void {
    void actor;
    void other;
    throw new Error("not yet ported: DoSwitchPlace (RogueGame.cs:13326)");
  }

  // C# DoTakeLead — RogueGame.cs:13345
  DoTakeLead(actor: Actor, other: Actor): void {
    void actor;
    void other;
    throw new Error("not yet ported: DoTakeLead (RogueGame.cs:13345)");
  }

  // C# DoStealLead — RogueGame.cs:13369
  DoStealLead(actor: Actor, other: Actor): void {
    void actor;
    void other;
    throw new Error("not yet ported: DoStealLead (RogueGame.cs:13369)");
  }

  // C# DoCancelLead — RogueGame.cs:13397
  DoCancelLead(actor: Actor, follower: Actor): void {
    void actor;
    void follower;
    throw new Error("not yet ported: DoCancelLead (RogueGame.cs:13397)");
  }

  // C# DoWait — RogueGame.cs:13420
  DoWait(actor: Actor): void {
    void actor;
    throw new Error("not yet ported: DoWait (RogueGame.cs:13420)");
  }

  // C# DoPlayerBump — RogueGame.cs:13440
  DoPlayerBump(player: Actor, direction: Direction): boolean {
    void player;
    void direction;
    throw new Error("not yet ported: DoPlayerBump (RogueGame.cs:13440)");
  }

  // C# DoMakeAggression — RogueGame.cs:13520
  DoMakeAggression(aggressor: Actor, target: Actor): void {
    void aggressor;
    void target;
    throw new Error("not yet ported: DoMakeAggression (RogueGame.cs:13520)");
  }

  // C# OnMakeEnemyOfCop — RogueGame.cs:13562
  OnMakeEnemyOfCop(aggressor: Actor, cop: Actor, wasAlreadyEnemy: boolean): void {
    void aggressor;
    void cop;
    void wasAlreadyEnemy;
    throw new Error("not yet ported: OnMakeEnemyOfCop (RogueGame.cs:13562)");
  }

  // C# OnMakeEnemyOfSoldier — RogueGame.cs:13586
  OnMakeEnemyOfSoldier(aggressor: Actor, soldier: Actor, wasAlreadyEnemy: boolean): void {
    void aggressor;
    void soldier;
    void wasAlreadyEnemy;
    throw new Error("not yet ported: OnMakeEnemyOfSoldier (RogueGame.cs:13586)");
  }

  // C# MakeEnemyOfTargetFactionInDistrict — RogueGame.cs:13615
  MakeEnemyOfTargetFactionInDistrict(aggressor: Actor, target: Actor, fn: (p0: Actor) => void): void {
    void aggressor;
    void target;
    void fn;
    throw new Error("not yet ported: MakeEnemyOfTargetFactionInDistrict (RogueGame.cs:13615)");
  }

  // C# MakeEnemyOfGroup — RogueGame.cs:13642
  MakeEnemyOfGroup(a: Actor, group: Actor[]): void {
    void a;
    void group;
    throw new Error("not yet ported: MakeEnemyOfGroup (RogueGame.cs:13642)");
  }

  // C# MakeEnemiesGroupsSub — RogueGame.cs:13654
  MakeEnemiesGroupsSub(groupA: Actor[], groupB: Actor[]): void {
    void groupA;
    void groupB;
    throw new Error("not yet ported: MakeEnemiesGroupsSub (RogueGame.cs:13654)");
  }

  // C# DoMeleeAttack — RogueGame.cs:13669
  DoMeleeAttack(attacker: Actor, defender: Actor): void {
    void attacker;
    void defender;
    throw new Error("not yet ported: DoMeleeAttack (RogueGame.cs:13669)");
  }

  // C# DoRangedAttack — RogueGame.cs:13889
  DoRangedAttack(attacker: Actor, defender: Actor, LoF: Point[], mode: FireMode): void {
    void attacker;
    void defender;
    void LoF;
    void mode;
    throw new Error("not yet ported: DoRangedAttack (RogueGame.cs:13889)");
  }

  // C# DoSingleRangedAttack — RogueGame.cs:13950
  DoSingleRangedAttack(attacker: Actor, defender: Actor, LoF: Point[], shotCounter: number): void {
    void attacker;
    void defender;
    void LoF;
    void shotCounter;
    throw new Error("not yet ported: DoSingleRangedAttack (RogueGame.cs:13950)");
  }

  // C# DoCheckFireThrough — RogueGame.cs:14088
  DoCheckFireThrough(attacker: Actor, LoF: Point[]): boolean {
    void attacker;
    void LoF;
    throw new Error("not yet ported: DoCheckFireThrough (RogueGame.cs:14088)");
  }

  // C# DoThrowGrenadeUnprimed — RogueGame.cs:14128
  DoThrowGrenadeUnprimed(actor: Actor, targetPos: Point): void {
    void actor;
    void targetPos;
    throw new Error("not yet ported: DoThrowGrenadeUnprimed (RogueGame.cs:14128)");
  }

  // C# DoThrowGrenadePrimed — RogueGame.cs:14160
  DoThrowGrenadePrimed(actor: Actor, targetPos: Point): void {
    void actor;
    void targetPos;
    throw new Error("not yet ported: DoThrowGrenadePrimed (RogueGame.cs:14160)");
  }

  // C# ShowBlastImage — RogueGame.cs:14190
  ShowBlastImage(screenPos: Point, attack: BlastAttack, damage: number): void {
    void screenPos;
    void attack;
    void damage;
    throw new Error("not yet ported: ShowBlastImage (RogueGame.cs:14190)");
  }

  // C# DoBlast — RogueGame.cs:14198
  DoBlast(location: Location, blastAttack: BlastAttack): void {
    void location;
    void blastAttack;
    throw new Error("not yet ported: DoBlast (RogueGame.cs:14198)");
  }

  // C# ApplyExplosionWave — RogueGame.cs:14240
  ApplyExplosionWave(center: Location, waveDistance: number, blast: BlastAttack): boolean {
    void center;
    void waveDistance;
    void blast;
    throw new Error("not yet ported: ApplyExplosionWave (RogueGame.cs:14240)");
  }

  // C# ApplyExplosionWaveSub — RogueGame.cs:14303
  ApplyExplosionWaveSub(blastCenter: Location, pt: Point, waveDistance: number, blast: BlastAttack): boolean {
    void blastCenter;
    void pt;
    void waveDistance;
    void blast;
    throw new Error("not yet ported: ApplyExplosionWaveSub (RogueGame.cs:14303)");
  }

  // C# ApplyExplosionDamage — RogueGame.cs:14324
  ApplyExplosionDamage(location: Location, distanceFromBlast: number, blast: BlastAttack): number {
    void location;
    void distanceFromBlast;
    void blast;
    throw new Error("not yet ported: ApplyExplosionDamage (RogueGame.cs:14324)");
  }

  // C# ExplosionChainReaction — RogueGame.cs:14469
  ExplosionChainReaction(inv: Inventory, location: Location): void {
    void inv;
    void location;
    throw new Error("not yet ported: ExplosionChainReaction (RogueGame.cs:14469)");
  }

  // C# DoChat — RogueGame.cs:14525
  DoChat(speaker: Actor, target: Actor): void {
    void speaker;
    void target;
    throw new Error("not yet ported: DoChat (RogueGame.cs:14525)");
  }

  // C# DoTrade — RogueGame.cs:14562
  DoTrade(speaker: Actor, target: Actor): void {
    void speaker;
    void target;
    throw new Error("not yet ported: DoTrade (RogueGame.cs:14562)");
  }

  // C# SwapActorItems — RogueGame.cs:14766
  SwapActorItems(a: Actor, itA: Item, b: Actor, itB: Item): void {
    void a;
    void itA;
    void b;
    void itB;
    throw new Error("not yet ported: SwapActorItems (RogueGame.cs:14766)");
  }

  // C# DoSay — RogueGame.cs:14801
  DoSay(speaker: Actor, target: Actor, text: string, flags: SayFlags): void {
    void speaker;
    void target;
    void text;
    void flags;
    throw new Error("not yet ported: DoSay (RogueGame.cs:14801)");
  }

  // C# DoShout — RogueGame.cs:14835
  DoShout(speaker: Actor, text: string | null): void {
    void speaker;
    void text;
    throw new Error("not yet ported: DoShout (RogueGame.cs:14835)");
  }

  // C# DoEmote — RogueGame.cs:14868
  DoEmote(actor: Actor, text: string, isDanger?: boolean): void {
    void actor;
    void text;
    void isDanger;
    throw new Error("not yet ported: DoEmote (RogueGame.cs:14868)");
  }

  // C# DoTakeFromContainer — RogueGame.cs:14876
  DoTakeFromContainer(actor: Actor, position: Point): void {
    void actor;
    void position;
    throw new Error("not yet ported: DoTakeFromContainer (RogueGame.cs:14876)");
  }

  // C# DoTakeItem — RogueGame.cs:14887
  DoTakeItem(actor: Actor, position: Point, it: Item): void {
    void actor;
    void position;
    void it;
    throw new Error("not yet ported: DoTakeItem (RogueGame.cs:14887)");
  }

  // C# DoGiveItemTo — RogueGame.cs:14925
  DoGiveItemTo(actor: Actor, target: Actor, gift: Item): void {
    void actor;
    void target;
    void gift;
    throw new Error("not yet ported: DoGiveItemTo (RogueGame.cs:14925)");
  }

  // C# DoEquipItem — RogueGame.cs:14973
  DoEquipItem(actor: Actor, it: Item): void {
    void actor;
    void it;
    throw new Error("not yet ported: DoEquipItem (RogueGame.cs:14973)");
  }

  // C# DoUnequipItem — RogueGame.cs:14998
  DoUnequipItem(actor: Actor, it: Item, canMessage?: boolean): void {
    void actor;
    void it;
    void canMessage;
    throw new Error("not yet ported: DoUnequipItem (RogueGame.cs:14998)");
  }

  // C# OnEquipItem — RogueGame.cs:15011
  OnEquipItem(actor: Actor, it: Item): void {
    void actor;
    void it;
    throw new Error("not yet ported: OnEquipItem (RogueGame.cs:15011)");
  }

  // C# OnUnequipItem — RogueGame.cs:15058
  OnUnequipItem(actor: Actor, it: Item): void {
    void actor;
    void it;
    throw new Error("not yet ported: OnUnequipItem (RogueGame.cs:15058)");
  }

  // C# DoDropItem — RogueGame.cs:15078
  DoDropItem(actor: Actor, it: Item): void {
    void actor;
    void it;
    throw new Error("not yet ported: DoDropItem (RogueGame.cs:15078)");
  }

  // C# DiscardItem — RogueGame.cs:15147
  DiscardItem(actor: Actor, it: Item): void {
    void actor;
    void it;
    throw new Error("not yet ported: DiscardItem (RogueGame.cs:15147)");
  }

  // C# DropItem — RogueGame.cs:15156
  DropItem(actor: Actor, it: Item): void {
    void actor;
    void it;
    throw new Error("not yet ported: DropItem (RogueGame.cs:15156)");
  }

  // C# DropCloneItem — RogueGame.cs:15168
  DropCloneItem(actor: Actor, it: Item, clone: Item): void {
    void actor;
    void it;
    void clone;
    throw new Error("not yet ported: DropCloneItem (RogueGame.cs:15168)");
  }

  // C# DoUseItem — RogueGame.cs:15181
  DoUseItem(actor: Actor, it: Item): void {
    void actor;
    void it;
    throw new Error("not yet ported: DoUseItem (RogueGame.cs:15181)");
  }

  // C# DoEatFoodFromGround — RogueGame.cs:15205
  DoEatFoodFromGround(actor: Actor, it: Item): void {
    void actor;
    void it;
    throw new Error("not yet ported: DoEatFoodFromGround (RogueGame.cs:15205)");
  }

  // C# DoUseFoodItem — RogueGame.cs:15241
  DoUseFoodItem(actor: Actor, food: ItemFood): void {
    void actor;
    void food;
    throw new Error("not yet ported: DoUseFoodItem (RogueGame.cs:15241)");
  }

  // C# DoVomit — RogueGame.cs:15291
  DoVomit(actor: Actor): void {
    void actor;
    throw new Error("not yet ported: DoVomit (RogueGame.cs:15291)");
  }

  // C# DoUseMedicineItem — RogueGame.cs:15304
  DoUseMedicineItem(actor: Actor, med: ItemMedicine): void {
    void actor;
    void med;
    throw new Error("not yet ported: DoUseMedicineItem (RogueGame.cs:15304)");
  }

  // C# DoUseAmmoItem — RogueGame.cs:15348
  DoUseAmmoItem(actor: Actor, ammoItem: ItemAmmo): void {
    void actor;
    void ammoItem;
    throw new Error("not yet ported: DoUseAmmoItem (RogueGame.cs:15348)");
  }

  // C# DoUseSprayScentItem — RogueGame.cs:15379
  DoUseSprayScentItem(actor: Actor, spray: ItemSprayScent): void {
    void actor;
    void spray;
    throw new Error("not yet ported: DoUseSprayScentItem (RogueGame.cs:15379)");
  }

  // C# DoUseTrapItem — RogueGame.cs:15400
  DoUseTrapItem(actor: Actor, trap: ItemTrap): void {
    void actor;
    void trap;
    throw new Error("not yet ported: DoUseTrapItem (RogueGame.cs:15400)");
  }

  // C# DoUseEntertainmentItem — RogueGame.cs:15417
  DoUseEntertainmentItem(actor: Actor, ent: ItemEntertainment): void {
    void actor;
    void ent;
    throw new Error("not yet ported: DoUseEntertainmentItem (RogueGame.cs:15417)");
  }

  // C# DoRechargeItemBattery — RogueGame.cs:15459
  DoRechargeItemBattery(actor: Actor, it: Item): void {
    void actor;
    void it;
    throw new Error("not yet ported: DoRechargeItemBattery (RogueGame.cs:15459)");
  }

  // C# DoOpenDoor — RogueGame.cs:15486
  DoOpenDoor(actor: Actor, door: DoorWindow): void {
    void actor;
    void door;
    throw new Error("not yet ported: DoOpenDoor (RogueGame.cs:15486)");
  }

  // C# DoCloseDoor — RogueGame.cs:15503
  DoCloseDoor(actor: Actor, door: DoorWindow): void {
    void actor;
    void door;
    throw new Error("not yet ported: DoCloseDoor (RogueGame.cs:15503)");
  }

  // C# DoBarricadeDoor — RogueGame.cs:15520
  DoBarricadeDoor(actor: Actor, door: DoorWindow): void {
    void actor;
    void door;
    throw new Error("not yet ported: DoBarricadeDoor (RogueGame.cs:15520)");
  }

  // C# DoBuildFortification — RogueGame.cs:15544
  DoBuildFortification(actor: Actor, buildPos: Point, isLarge: boolean): void {
    void actor;
    void buildPos;
    void isLarge;
    throw new Error("not yet ported: DoBuildFortification (RogueGame.cs:15544)");
  }

  // C# DoRepairFortification — RogueGame.cs:15572
  DoRepairFortification(actor: Actor, fort: Fortification): void {
    void actor;
    void fort;
    throw new Error("not yet ported: DoRepairFortification (RogueGame.cs:15572)");
  }

  // C# DoSwitchPowerGenerator — RogueGame.cs:15597
  DoSwitchPowerGenerator(actor: Actor, powGen: PowerGenerator): void {
    void actor;
    void powGen;
    throw new Error("not yet ported: DoSwitchPowerGenerator (RogueGame.cs:15597)");
  }

  // C# DoDestroyObject — RogueGame.cs:15619
  DoDestroyObject(mapObj: MapObject): void {
    void mapObj;
    throw new Error("not yet ported: DoDestroyObject (RogueGame.cs:15619)");
  }

  // C# DoBreak — RogueGame.cs:15670
  DoBreak(actor: Actor, mapObj: MapObject): void {
    void actor;
    void mapObj;
    throw new Error("not yet ported: DoBreak (RogueGame.cs:15670)");
  }

  // C# DoPushPullFollowersHelp — RogueGame.cs:15810
  DoPushPullFollowersHelp(actor: Actor, mapObj: MapObject, isPulling: boolean, staCost: { value: number }): void {
    void actor;
    void mapObj;
    void isPulling;
    void staCost;
    throw new Error("not yet ported: DoPushPullFollowersHelp (RogueGame.cs:15810)");
  }

  // C# DoPush — RogueGame.cs:15841
  DoPush(actor: Actor, mapObj: MapObject, toPos: Point): void {
    void actor;
    void mapObj;
    void toPos;
    throw new Error("not yet ported: DoPush (RogueGame.cs:15841)");
  }

  // C# DoShove — RogueGame.cs:15892
  DoShove(actor: Actor, target: Actor, toPos: Point): void {
    void actor;
    void target;
    void toPos;
    throw new Error("not yet ported: DoShove (RogueGame.cs:15892)");
  }

  // C# DoPull — RogueGame.cs:15943
  DoPull(actor: Actor, mapObj: MapObject, moveActorToPos: Point): void {
    void actor;
    void mapObj;
    void moveActorToPos;
    throw new Error("not yet ported: DoPull (RogueGame.cs:15943)");
  }

  // C# DoPullActor — RogueGame.cs:15998
  DoPullActor(actor: Actor, target: Actor, moveActorToPos: Point): void {
    void actor;
    void target;
    void moveActorToPos;
    throw new Error("not yet ported: DoPullActor (RogueGame.cs:15998)");
  }

  // C# DoStartSleeping — RogueGame.cs:16051
  DoStartSleeping(actor: Actor): void {
    void actor;
    throw new Error("not yet ported: DoStartSleeping (RogueGame.cs:16051)");
  }

  // C# DoWakeUp — RogueGame.cs:16064
  DoWakeUp(actor: Actor): void {
    void actor;
    throw new Error("not yet ported: DoWakeUp (RogueGame.cs:16064)");
  }

  // C# DoTag — RogueGame.cs:16083
  DoTag(actor: Actor, spray: ItemSprayPaint, pos: Point): void {
    void actor;
    void spray;
    void pos;
    throw new Error("not yet ported: DoTag (RogueGame.cs:16083)");
  }

  // C# DoSprayOdorSuppressor — RogueGame.cs:16105
  DoSprayOdorSuppressor(actor: Actor, suppressor: ItemSprayScent, sprayOn: Actor): void {
    void actor;
    void suppressor;
    void sprayOn;
    throw new Error("not yet ported: DoSprayOdorSuppressor (RogueGame.cs:16105)");
  }

  // C# DoGiveOrderTo — RogueGame.cs:16126
  DoGiveOrderTo(master: Actor, slave: Actor, order: ActorOrder): void {
    void master;
    void slave;
    void order;
    throw new Error("not yet ported: DoGiveOrderTo (RogueGame.cs:16126)");
  }

  // C# DoCancelOrder — RogueGame.cs:16160
  DoCancelOrder(master: Actor, slave: Actor): void {
    void master;
    void slave;
    throw new Error("not yet ported: DoCancelOrder (RogueGame.cs:16160)");
  }

  // C# OnLoudNoise — RogueGame.cs:16184
  OnLoudNoise(map: Map, noisePosition: Point, noiseName: string): void {
    void map;
    void noisePosition;
    void noiseName;
    throw new Error("not yet ported: OnLoudNoise (RogueGame.cs:16184)");
  }

  // C# InflictDamage — RogueGame.cs:16241
  InflictDamage(actor: Actor, dmg: number): void {
    void actor;
    void dmg;
    throw new Error("not yet ported: InflictDamage (RogueGame.cs:16241)");
  }

  // C# KillActor — RogueGame.cs:16278
  KillActor(killer: Actor | null, deadGuy: Actor, reason: string, canDropCorpse?: boolean): void {
    void killer;
    void deadGuy;
    void reason;
    void canDropCorpse;
    throw new Error("not yet ported: KillActor (RogueGame.cs:16278)");
  }

  // C# Disarm — RogueGame.cs:16570
  Disarm(actor: Actor): Item {
    void actor;
    throw new Error("not yet ported: Disarm (RogueGame.cs:16570)");
  }

  // C# CheckUndeadEvolution — RogueGame.cs:16614
  CheckUndeadEvolution(undead: Actor): ActorModel {
    void undead;
    throw new Error("not yet ported: CheckUndeadEvolution (RogueGame.cs:16614)");
  }

  // C# NextUndeadEvolution — RogueGame.cs:16711
  NextUndeadEvolution(fromModelID: ActorID): ActorID {
    void fromModelID;
    throw new Error("not yet ported: NextUndeadEvolution (RogueGame.cs:16711)");
  }

  // C# SplatterBlood — RogueGame.cs:16735
  SplatterBlood(map: Map, position: Point): void {
    void map;
    void position;
    throw new Error("not yet ported: SplatterBlood (RogueGame.cs:16735)");
  }

  // C# UndeadRemains — RogueGame.cs:16763
  UndeadRemains(map: Map, position: Point): void {
    void map;
    void position;
    throw new Error("not yet ported: UndeadRemains (RogueGame.cs:16763)");
  }

  // C# DropCorpse — RogueGame.cs:16773
  DropCorpse(deadGuy: Actor): void {
    void deadGuy;
    throw new Error("not yet ported: DropCorpse (RogueGame.cs:16773)");
  }

  // C# PlayerDied — RogueGame.cs:16789
  async PlayerDied(killer: Actor | null, reason: string): Promise<void> {
    // stop sim thread.
    this.StopSimThread(true); // alpha10 abort allowed when dying

    // music.
    this.m_MusicManager.stop();
    this.m_MusicManager.play(GameMusics.PLAYER_DEATH);

    ///////////
    // Scoring
    ///////////
    this.m_Session.scoring.turnsSurvived = this.m_Session.worldTime.turnCounter;
    this.m_Session.scoring.setKiller(killer);
    if (this.m_Player.countFollowers > 0) {
      for (const fo of this.m_Player.followers ?? []) this.m_Session.scoring.addFollowerWhenDied(fo);
    }

    const zones = this.m_Player.location.map!.getZonesAt(this.m_Player.location.position.x, this.m_Player.location.position.y);
    if (zones.length === 0) {
      this.m_Session.scoring.deathPlace = this.m_Player.location.map!.name;
    } else {
      const zoneName = zones[0].name;
      this.m_Session.scoring.deathPlace = `${this.m_Player.location.map!.name} at ${zoneName}`;
    }
    if (killer != null)
      this.m_Session.scoring.deathReason = `${this.m_Rules.isMurder(killer, this.m_Player) ? "Murdered" : "Killed"} by ${killer.model.name} ${killer.theName}`;
    else this.m_Session.scoring.deathReason = `Death by ${reason}`;
    this.m_Session.scoring.addEvent(this.m_Session.worldTime.turnCounter, "Died.");

    /////////////////////////////////////////
    // Tip, Message, screenshot & permadeath.
    /////////////////////////////////////////
    const iTip = this.m_Rules.roll(0, GameTips.TIPS.length);
    this.AddOverlay(
      new OverlayPopup(
        ["TIP OF THE DEAD", "Did you know that...", GameTips.TIPS[iTip]],
        Color.White,
        Color.White,
        this.POPUP_FILLCOLOR,
        new Point(0, 0)
      )
    );

    this.ClearMessages();
    this.AddMessage(new Message("**** YOU DIED! ****", this.m_Session.worldTime.turnCounter, Color.Red));
    if (killer != null)
      this.AddMessage(
        new Message(`Killer : ${killer.theName}.`, this.m_Session.worldTime.turnCounter, Color.Red)
      );
    this.AddMessage(new Message(`Reason : ${reason}.`, this.m_Session.worldTime.turnCounter, Color.Red));
    if (this.m_Player.model.abilities.isUndead)
      this.AddMessage(
        new Message("You die one last time... Game over!", this.m_Session.worldTime.turnCounter, Color.Red)
      );
    else
      this.AddMessage(
        new Message("You join the realm of the undeads... Game over!", this.m_Session.worldTime.turnCounter, Color.Red)
      );

    // if permadeath on delete save file.
    if (s_Options.isPermadeathOn) await this.DeleteSavedGame(this.GetUserSave());

    // screenshot.
    if (s_Options.isDeathScreenshotOn) {
      this.RedrawPlayScreen();
      const shotname = this.DoTakeScreenshot();
      if (shotname === null) this.AddMessage(this.MakeErrorMessage("could not save death screenshot."));
      else
        this.AddMessage(
          new Message(`Death screenshot saved : ${shotname}.`, this.m_Session.worldTime.turnCounter, Color.Red)
        );
    }

    await this.AddMessagePressEnter();

    // post mortem.
    await this.HandlePostMortem();

    // music.
    this.m_MusicManager.stop();
  }

  // C# TimeSpanToString — RogueGame.cs:16878
  // `TimeSpan` here is seconds (`Scoring.RealLifePlayingTime` → `realLifePlayingTimeSeconds`).
  TimeSpanToString(rt: TimeSpan): string {
    const totalSeconds = Math.floor(rt);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor(totalSeconds / 3600) % 24;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const seconds = totalSeconds % 60;
    // alpha10 shortened
    const timeDays = days === 0 ? "" : `${days} d `;
    const timeHours = hours === 0 ? "" : `${String(hours).padStart(2, "0")} h `;
    const timeMinutes = minutes === 0 ? "" : `${String(minutes).padStart(2, "0")} m `;
    const timeSeconds = seconds === 0 ? "" : `${String(seconds).padStart(2, "0")} s`;
    return `${timeDays}${timeHours}${timeMinutes}${timeSeconds}`;
  }

  // C# HandlePostMortem — RogueGame.cs:16888
  async HandlePostMortem(): Promise<void> {
    ////////////////
    // Prepare data.
    ////////////////
    const deathTime = new WorldTime();
    deathTime.turnCounter = this.m_Session.scoring.turnsSurvived;
    const isMale = this.m_Player.model.dollBody.isMale;
    const heOrShe = isMale ? "He" : "She";
    const himOrHer = isMale ? "him" : "her";
    const name = this.m_Player.theName.replace("(YOU) ", "");
    const rt = this.m_Session.scoring.realLifePlayingTimeSeconds;
    const realTimeString = this.TimeSpanToString(rt);
    this.m_Session.scoring.side = this.m_Player.model.abilities.isUndead
      ? DifficultySide.FOR_UNDEAD
      : DifficultySide.FOR_SURVIVOR;
    this.m_Session.scoring.difficultyRating = Scoring.computeDifficultyRating(
      s_Options,
      this.m_Session.scoring.side,
      this.m_Session.scoring.reincarnationNumber
    );

    ////////////////////////////////////
    // Format scoring into a text file.
    ///////////////////////////////////
    const graveyard = new TextFile();

    graveyard.append(`ROGUE SURVIVOR ${GAME_VERSION}`);
    graveyard.append("POST MORTEM");

    // Summary
    graveyard.append(`${name} was ${this.AorAn(this.m_Player.model.name)} and ${this.AorAn(this.m_Player.faction.memberName)}.`);
    graveyard.append(`${heOrShe} survived to see ${deathTime.toString()}.`);
    graveyard.append(`${name}'s spirit guided ${himOrHer} for ${realTimeString}.`);
    if (this.m_Session.scoring.reincarnationNumber > 0)
      graveyard.append(`${heOrShe} was reincarnation ${this.m_Session.scoring.reincarnationNumber}.`);
    graveyard.append(" ");

    graveyard.append("> SCORING");
    graveyard.append(`${heOrShe} scored a total of ${this.m_Session.scoring.totalPoints} points.`);
    graveyard.append(`- difficulty rating of ${Math.floor(100 * this.m_Session.scoring.difficultyRating)}%.`);
    graveyard.append(`- ${this.m_Session.scoring.survivalPoints} base points for survival.`);
    graveyard.append(`- ${this.m_Session.scoring.killPoints} base points for kills.`);
    graveyard.append(`- ${this.m_Session.scoring.achievementPoints} base points for achievements.`);
    graveyard.append(" ");

    graveyard.append("> ACHIEVEMENTS");
    for (const ach of this.m_Session.scoring.achievements) {
      if (ach.isDone) graveyard.append(`- ${ach.name} for ${ach.scoreValue} points!`);
      else graveyard.append(`- Fail : ${ach.teaseName}.`);
    }
    if (this.m_Session.scoring.completedAchievementsCount === 0) {
      graveyard.append("Didn't achieve anything notable. And then died.");
      graveyard.append(`(unlock all the ${Scoring.MAX_ACHIEVEMENTS} achievements to win this game version)`);
    } else {
      graveyard.append(`Total : ${this.m_Session.scoring.completedAchievementsCount}/${Scoring.MAX_ACHIEVEMENTS}.`);
      if (this.m_Session.scoring.completedAchievementsCount >= Scoring.MAX_ACHIEVEMENTS)
        graveyard.append(
          "*** You achieved everything! You can consider having won this version of the game! CONGRATULATIONS! ***"
        );
      else graveyard.append("(unlock all the achievements to win this game version)");
      graveyard.append("(later versions of the game will feature real winning conditions and multiple endings...)");
    }
    graveyard.append(" ");

    graveyard.append("> DEATH");
    graveyard.append(`${this.m_Session.scoring.deathReason} in ${this.m_Session.scoring.deathPlace}.`);
    graveyard.append(" ");

    graveyard.append("> KILLS");
    if (this.m_Session.scoring.hasNoKills) {
      graveyard.append(`${heOrShe} was a pacifist. Or too scared to fight.`);
    } else {
      // models kill list.
      for (const killData of this.m_Session.scoring.kills) {
        const model = this.gameActors.get(killData.actorModelID);
        const modelName = killData.amount > 1 ? model.pluralName : model.name;
        graveyard.append(`${padLeft(killData.amount, 4)} ${modelName}.`);
      }
    }
    // murders? only livings.
    if (!this.m_Player.model.abilities.isUndead) {
      if (this.m_Player.murdersCounter > 0)
        graveyard.append(
          `${heOrShe} committed ${this.m_Player.murdersCounter} murder${this.m_Player.murdersCounter > 1 ? "s" : ""}!`
        );
    }

    graveyard.append(" ");

    graveyard.append("> FUN FACTS!");
    graveyard.append(`While ${name} has died, others are still having fun!`);
    const funFacts = this.CompileDistrictFunFacts(this.m_Player.location.map!.district!);
    for (const funFact of funFacts) graveyard.append(funFact);
    graveyard.append("");

    graveyard.append("> SKILLS");
    if (this.m_Player.sheet.skillTable.skills == null) {
      graveyard.append(`${heOrShe} was a jack of all trades. Or an incompetent.`);
    } else {
      for (const sk of this.m_Player.sheet.skillTable.skills) {
        graveyard.append(`${sk.level}-${Skills.name(sk.id as SkillID)}.`);
      }
    }
    graveyard.append(" ");

    graveyard.append("> INVENTORY");
    if (this.m_Player.inventory!.isEmpty) {
      graveyard.append(`${heOrShe} was humble. Or dirt poor.`);
    } else {
      for (const it of this.m_Player.inventory!.items) {
        const desc = this.DescribeItemShort(it);
        if (it.isEquipped) graveyard.append(`- ${desc} (equipped).`);
        else graveyard.append(`- ${desc}.`);
      }
    }
    graveyard.append(" ");

    graveyard.append("> FOLLOWERS");
    const followersWhenDied = this.m_Session.scoring.followersWhendDied;
    if (followersWhenDied == null || followersWhenDied.length === 0) {
      graveyard.append(`${heOrShe} was doing fine alone. Or everyone else was dead.`);
    } else {
      // names.
      let namesLine = `${heOrShe} was leading`;
      let firstFo = true;
      let i = 0;
      const count = followersWhenDied.length;
      for (const fo of followersWhenDied) {
        if (firstFo) namesLine += " ";
        else {
          if (i === count) namesLine += ".";
          else if (i === count - 1) namesLine += " and ";
          else namesLine += ", ";
        }
        namesLine += fo.theName;
        ++i;
        firstFo = false;
      }
      namesLine += ".";
      graveyard.append(namesLine);

      // skills.
      for (const fo of followersWhenDied) {
        graveyard.append(`${fo.name} skills : `);
        if (fo.sheet.skillTable != null && fo.sheet.skillTable.skills != null) {
          for (const sk of fo.sheet.skillTable.skills) {
            graveyard.append(`${sk.level}-${Skills.name(sk.id as SkillID)}.`);
          }
        }
      }
    }
    graveyard.append(" ");

    graveyard.append("> EVENTS");
    if (this.m_Session.scoring.hasNoEvents) {
      graveyard.append(`${heOrShe} had a quiet life. Or dull and boring.`);
    } else {
      for (const ev of this.m_Session.scoring.events) {
        const evTime = new WorldTime();
        evTime.turnCounter = ev.turn;
        graveyard.append(`- ${padLeft(evTime.toString(), 13)} : ${ev.text}`);
      }
    }
    graveyard.append(" ");

    graveyard.append("> CUSTOM OPTIONS");
    graveyard.append(`- difficulty rating of ${Math.floor(100 * this.m_Session.scoring.difficultyRating)}%.`);
    if (s_Options.isPermadeathOn)
      graveyard.append(`- ${GameOptions.optionName(OptionIDs.GAME_PERMADEATH)} : yes.`);
    if (!s_Options.allowUndeadsEvolution && Rules.hasEvolution(this.m_Session.gameMode))
      graveyard.append(
        `- ${GameOptions.optionName(OptionIDs.GAME_ALLOW_UNDEADS_EVOLUTION)} : ${s_Options.allowUndeadsEvolution ? "yes" : "no"}.`
      );
    if (s_Options.citySize !== GameOptions.DEFAULT_CITY_SIZE)
      graveyard.append(`- ${GameOptions.optionName(OptionIDs.GAME_CITY_SIZE)} : ${s_Options.citySize}.`);
    if (s_Options.dayZeroUndeadsPercent !== GameOptions.DEFAULT_DAY_ZERO_UNDEADS_PERCENT)
      graveyard.append(
        `- ${GameOptions.optionName(OptionIDs.GAME_DAY_ZERO_UNDEADS_PERCENT)} : ${s_Options.dayZeroUndeadsPercent}%.`
      );
    if (s_Options.districtSize !== GameOptions.DEFAULT_DISTRICT_SIZE)
      graveyard.append(`- ${GameOptions.optionName(OptionIDs.GAME_DISTRICT_SIZE)} : ${s_Options.districtSize}.`);
    if (s_Options.maxCivilians !== GameOptions.DEFAULT_MAX_CIVILIANS)
      graveyard.append(`- ${GameOptions.optionName(OptionIDs.GAME_MAX_CIVILIANS)} : ${s_Options.maxCivilians}.`);
    if (s_Options.maxUndeads !== GameOptions.DEFAULT_MAX_UNDEADS)
      graveyard.append(`- ${GameOptions.optionName(OptionIDs.GAME_MAX_UNDEADS)} : ${s_Options.maxUndeads}.`);
    if (!s_Options.nPCCanStarveToDeath)
      graveyard.append(
        `- ${GameOptions.optionName(OptionIDs.GAME_NPC_CAN_STARVE_TO_DEATH)} : ${s_Options.nPCCanStarveToDeath ? "yes" : "no"}.`
      );
    if (s_Options.starvedZombificationChance !== GameOptions.DEFAULT_STARVED_ZOMBIFICATION_CHANCE)
      graveyard.append(
        `- ${GameOptions.optionName(OptionIDs.GAME_STARVED_ZOMBIFICATION_CHANCE)} : ${s_Options.starvedZombificationChance}%.`
      );
    if (!s_Options.revealStartingDistrict)
      graveyard.append(
        `- ${GameOptions.optionName(OptionIDs.GAME_REVEAL_STARTING_DISTRICT)} : ${s_Options.revealStartingDistrict ? "yes" : "no"}.`
      );
    if (s_Options.simulateDistricts !== GameOptions.DEFAULT_SIM_DISTRICTS)
      graveyard.append(
        `- ${GameOptions.optionName(OptionIDs.GAME_SIMULATE_DISTRICTS)} : ${GameOptions.simRatioName(s_Options.simulateDistricts)}.`
      );
    if (s_Options.simulateWhenSleeping)
      graveyard.append(
        `- ${GameOptions.optionName(OptionIDs.GAME_SIMULATE_SLEEP)} : ${s_Options.simulateWhenSleeping ? "yes" : "no"}.`
      );
    if (s_Options.zombieInvasionDailyIncrease !== GameOptions.DEFAULT_ZOMBIE_INVASION_DAILY_INCREASE)
      graveyard.append(
        `- ${GameOptions.optionName(OptionIDs.GAME_ZOMBIE_INVASION_DAILY_INCREASE)} : ${s_Options.zombieInvasionDailyIncrease}%.`
      );
    if (s_Options.zombificationChance !== GameOptions.DEFAULT_ZOMBIFICATION_CHANCE)
      graveyard.append(
        `- ${GameOptions.optionName(OptionIDs.GAME_ZOMBIFICATION_CHANCE)} : ${s_Options.zombificationChance}%.`
      );
    if (s_Options.maxReincarnations !== GameOptions.DEFAULT_MAX_REINCARNATIONS)
      graveyard.append(
        `- ${GameOptions.optionName(OptionIDs.GAME_MAX_REINCARNATIONS)} : ${s_Options.maxReincarnations}.`
      );
    graveyard.append(" ");

    graveyard.append("> R.I.P");
    graveyard.append(`May ${this.HisOrHer(this.m_Player)} soul rest in peace.`);
    graveyard.append(`For ${this.HisOrHer(this.m_Player)} body is now a meal for evil.`);
    graveyard.append("The End.");

    /////////////////////
    // Save to graveyard
    /////////////////////
    let gx = 0;
    let gy = 0;
    this.m_UI.UI_Clear(Color.Black);
    this.m_UI.UI_DrawStringBold(Color.Yellow, "Saving post mortem to graveyard...", 0, 0);
    gy += BOLD_LINE_SPACING;
    this.m_UI.UI_Repaint();
    const graveName = this.GetUserNewGraveyardName();
    const graveFile = this.GraveFilePath(graveName);
    if (!graveyard.save(graveFile)) {
      this.m_UI.UI_DrawStringBold(Color.Red, "Could not save to graveyard.", 0, gy);
      gy += BOLD_LINE_SPACING;
    } else {
      this.m_UI.UI_DrawStringBold(Color.Yellow, "Grave saved to :", 0, gy);
      gy += BOLD_LINE_SPACING;
      this.m_UI.UI_DrawString(Color.White, graveFile, 0, gy);
      gy += BOLD_LINE_SPACING;
    }
    this.DrawFootnote(Color.White, "press ENTER");
    this.m_UI.UI_Repaint();
    await this.WaitEnter();

    ///////////////////////////////
    // Display grave as text file.
    ///////////////////////////////
    graveyard.formatLines(TEXTFILE_CHARS_PER_LINE);
    let iLine = 0;
    let loop = false;
    do {
      // header.
      this.m_UI.UI_Clear(Color.Black);
      gx = 0;
      gy = 0;
      this.DrawHeader();
      gy += BOLD_LINE_SPACING;

      // text.
      let linesThisPage = 0;
      this.m_UI.UI_DrawStringBold(
        Color.White,
        "---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+",
        0,
        gy
      );
      gy += BOLD_LINE_SPACING;
      while (linesThisPage < TEXTFILE_LINES_PER_PAGE && iLine < graveyard.formatedLines.length) {
        const line = graveyard.formatedLines[iLine];
        this.m_UI.UI_DrawStringBold(Color.White, line, gx, gy);
        gy += BOLD_LINE_SPACING;
        ++iLine;
        ++linesThisPage;
      }

      // foot.
      this.m_UI.UI_DrawStringBold(
        Color.White,
        "---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+---------+",
        0,
        CANVAS_HEIGHT - 2 * BOLD_LINE_SPACING
      );
      if (iLine < graveyard.formatedLines.length) this.DrawFootnote(Color.White, "press ENTER for more");
      else this.DrawFootnote(Color.White, "press ENTER to leave");

      // wait.
      this.m_UI.UI_Repaint();
      await this.WaitEnter();

      // loop?
      loop = iLine < graveyard.formatedLines.length;
    } while (loop);

    /////////////
    // Hi Score?
    /////////////
    let skillsDesc = "";
    if (this.m_Player.sheet.skillTable.skills != null) {
      for (const sk of this.m_Player.sheet.skillTable.skills) {
        skillsDesc += `${sk.level}-${Skills.name(sk.id as SkillID)} `;
      }
    }
    const newHiScore = HiScore.fromScoring(name, this.m_Session.scoring, skillsDesc);
    if (this.m_HiScoreTable.register(newHiScore)) {
      this.SaveHiScoreTable();
      await this.HandleHiScores(true);
    }
  }

  // C# OnNewNight — RogueGame.cs:17240
  async OnNewNight(): Promise<void> {
    this.UpdatePlayerFOV(this.m_Player);

    //----- Upgrade Player (undead only once every 2 nights)
    if (this.m_Player.model.abilities.isUndead && this.m_Player.location.map!.localTime.day % 2 === 1) {
      // Mode.
      this.ClearOverlays();
      this.AddOverlay(
        new OverlayPopup(this.UPGRADE_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0))
      );

      // music.
      this.m_MusicManager.stop();
      this.m_MusicManager.play(GameMusics.INTERLUDE);

      // Message.
      this.ClearMessages();
      this.AddMessage(new Message("You will hunt another day!", this.m_Session.worldTime.turnCounter, Color.Green));
      this.UpdatePlayerFOV(this.m_Player);
      if (!this.m_Player.isBotPlayer) await this.AddMessagePressEnter();

      // Upgrade time!
      // alpha10.1 handle bot skill upgrade, bot followers will upgrade as npcs
      if (this.m_Player.isBotPlayer) {
        this.HandleNPCSkillUpgrade(this.m_Player);
      } else {
        await this.HandlePlayerDecideUpgrade(this.m_Player);
        await this.HandlePlayerFollowersUpgrade();
      }

      // Resume play.
      this.ClearMessages();
      this.AddMessage(new Message("Welcome to the night.", this.m_Session.worldTime.turnCounter, Color.White));
      this.ClearOverlays();
      this.RedrawPlayScreen();

      // music
      this.m_MusicManager.stop();
    }
  }

  // C# OnNewDay — RogueGame.cs:17285
  async OnNewDay(): Promise<void> {
    /////////////////////////
    // Normal day processing
    /////////////////////////

    //----- Upgrade Player (living only)
    if (!this.m_Player.model.abilities.isUndead) {
      // Mode.
      this.ClearOverlays();
      this.AddOverlay(
        new OverlayPopup(this.UPGRADE_MODE_TEXT, this.MODE_TEXTCOLOR, this.MODE_BORDERCOLOR, this.MODE_FILLCOLOR, new Point(0, 0))
      );

      // music.
      this.m_MusicManager.stop();
      this.m_MusicManager.play(GameMusics.INTERLUDE);

      // Message.
      this.ClearMessages();
      this.AddMessage(new Message("You survived another night!", this.m_Session.worldTime.turnCounter, Color.Green));
      this.UpdatePlayerFOV(this.m_Player);
      if (!this.m_Player.isBotPlayer) await this.AddMessagePressEnter();

      // Upgrade time!
      // alpha10.1 handle bot skill upgrade, bot followers will upgrade as npcs
      if (this.m_Player.isBotPlayer) {
        this.HandleNPCSkillUpgrade(this.m_Player);
      } else {
        await this.HandlePlayerDecideUpgrade(this.m_Player);
        await this.HandlePlayerFollowersUpgrade();
      }

      // Resume play.
      this.ClearMessages();
      this.AddMessage(new Message("Welcome to tomorrow.", this.m_Session.worldTime.turnCounter, Color.White));
      this.ClearOverlays();
      this.RedrawPlayScreen();

      // music
      this.m_MusicManager.stop();
    }

    //////////////////////////////
    // New day achievements.
    // 1. Reached day X (living only)
    //////////////////////////////
    if (!this.m_Player.model.abilities.isUndead) {
      const day = this.m_Session.worldTime.day;
      if (day === 7) {
        this.m_Session.scoring.setCompletedAchievement(AchievementIDs.REACHED_DAY_07);
        await this.ShowNewAchievement(AchievementIDs.REACHED_DAY_07);
      } else if (day === 14) {
        this.m_Session.scoring.setCompletedAchievement(AchievementIDs.REACHED_DAY_14);
        await this.ShowNewAchievement(AchievementIDs.REACHED_DAY_14);
      } else if (day === 21) {
        this.m_Session.scoring.setCompletedAchievement(AchievementIDs.REACHED_DAY_21);
        await this.ShowNewAchievement(AchievementIDs.REACHED_DAY_21);
      } else if (day === 28) {
        this.m_Session.scoring.setCompletedAchievement(AchievementIDs.REACHED_DAY_28);
        await this.ShowNewAchievement(AchievementIDs.REACHED_DAY_28);
      }
    }
  }

  // C# HandlePlayerDecideUpgrade — RogueGame.cs:17377
  async HandlePlayerDecideUpgrade(upgradeActor: Actor): Promise<void> {
    // roll N skills to updgrade.
    const upgradeChoices = this.RollSkillsToUpgrade(upgradeActor, 3 * 100);

    // "you" vs follower name.
    const youName = upgradeActor === this.m_Player ? "You" : upgradeActor.name;

    // loop.
    let loop = true;
    do {
      let popup: OverlayPopupTitle | null = null;

      ///////////////////
      // 1. Redraw
      // 2. Read input
      // 3. Handle input
      ///////////////////

      // 1. Redraw
      this.ClearMessages();
      this.AddMessage(
        new Message(`${youName} can improve or learn one of these skills. Choose wisely.`, this.m_Session.worldTime.turnCounter, Color.Green)
      );

      if (upgradeChoices.length === 0) {
        this.AddMessage(this.MakeErrorMessage(`${youName} can't learn anything new!`));
      } else {
        const popupLines: string[] = [];
        popupLines.push(" ");

        for (let iChoice = 0; iChoice < upgradeChoices.length; iChoice++) {
          const sk = upgradeChoices[iChoice];
          const level = upgradeActor.sheet.skillTable.getSkillLevel(sk);
          const text = `${iChoice + 1}. ${Skills.name(sk)} ${level + 1}/${Skills.maxSkillLevel(sk)}`;
          this.AddMessage(new Message(text, this.m_Session.worldTime.turnCounter, Color.LightGreen));

          popupLines.push(text);
          popupLines.push(`    ${this.DescribeSkillShort(sk)}`);
          popupLines.push(" ");
        }

        popupLines.push("ESC. don't upgrade");

        if (upgradeActor !== this.m_Player) {
          popupLines.push(" ");
          popupLines.push(`${upgradeActor.name} current skills`);
          for (const sk of upgradeActor.sheet.skillTable.skills ?? []) {
            popupLines.push(`${Skills.name(sk.id as SkillID)} ${sk.level}`);
          }
        }

        popup = new OverlayPopupTitle(
          upgradeActor === this.m_Player ? "Select skill to upgrade" : `Select skill to upgrade for ${upgradeActor.name}`,
          Color.White,
          popupLines,
          Color.White,
          Color.White,
          Color.Black,
          new Point(64, 64)
        );
        this.AddOverlay(popup);
      }
      this.AddMessage(new Message("ESC if you don't want to upgrade.", this.m_Session.worldTime.turnCounter, Color.White));
      this.RedrawPlayScreen();

      // 2. Read input
      const inKey = await this.m_UI.UI_WaitKey();

      // 3. Handle input
      if (inKey.key === "Escape") {
        loop = false;
        if (popup !== null) this.RemoveOverlay(popup);
        this.RedrawPlayScreen();
      } else {
        // get choice.
        const choice = this.KeyToChoiceNumber(inKey);

        if (choice >= 1 && choice <= upgradeChoices.length) {
          // upgrade skill.
          const skID = upgradeChoices[choice - 1];
          const sk = this.SkillUpgrade(upgradeActor, skID);

          // message & scoring.
          if (sk.level === 1) {
            const msgText = `${upgradeActor.name} learned skill ${Skills.name(sk.id as SkillID)}.`;
            this.AddMessage(new Message(msgText, this.m_Session.worldTime.turnCounter, Color.LightGreen));
            this.m_Session.scoring.addEvent(this.m_Session.worldTime.turnCounter, msgText);
          } else {
            const msgText = `${upgradeActor.name} improved skill ${Skills.name(sk.id as SkillID)} to level ${sk.level}.`;
            this.AddMessage(new Message(msgText, this.m_Session.worldTime.turnCounter, Color.LightGreen));
            this.m_Session.scoring.addEvent(this.m_Session.worldTime.turnCounter, msgText);
          }
          await this.AddMessagePressEnter();
          if (popup !== null) this.RemoveOverlay(popup);
          this.RedrawPlayScreen();
          loop = false;
        }
      }
    } while (loop);
  }

  // C# HandlePlayerFollowersUpgrade — RogueGame.cs:17483
  async HandlePlayerFollowersUpgrade(): Promise<void> {
    // if no followers, nothing to do.
    if (this.m_Player.countFollowers === 0) return;

    // Message.
    this.ClearMessages();
    this.AddMessage(new Message("Your followers learned new skills at your side!", this.m_Session.worldTime.turnCounter, Color.Green));
    await this.AddMessagePressEnter();

    // Do it.
    for (const follower of this.m_Player.followers ?? []) {
      // player pick for the follower.
      await this.HandlePlayerDecideUpgrade(follower);
    }
  }

  // C# HandleLivingNPCsUpgrade — RogueGame.cs:17503
  HandleLivingNPCsUpgrade(map: Map): void {
    for (const a of map.actors) {
      // ignore player, we do it separatly.
      if (a === this.m_Player) continue;
      // ignore player followers (upgraded already)
      if (a.leader === this.m_Player) continue;
      // not undeads!
      if (a.model.abilities.isUndead) continue;

      // do it!
      this.HandleNPCSkillUpgrade(a); // alpha10.1
    }
  }

  // alpha10.1 factorized to handle bot skill upgrade
  // C# HandleNPCSkillUpgrade — RogueGame.cs:17523
  HandleNPCSkillUpgrade(a: Actor): void {
    const upgradeFrom = this.RollSkillsToUpgrade(a, 3 * 100);
    const chosenSkill = this.NPCPickSkillToUpgrade(a, upgradeFrom);
    if (chosenSkill === null) return;
    // upgrade it!
    this.SkillUpgrade(a, chosenSkill);
  }

  // C# HandleUndeadNPCsUpgrade — RogueGame.cs:17533
  HandleUndeadNPCsUpgrade(map: Map): void {
    for (const a of map.actors) {
      // ignore player, we do it separatly.
      if (a === this.m_Player) continue;
      // ignore player followers (upgraded already)
      if (a.leader === this.m_Player) continue;
      // undeads only, and some branches only.
      if (!a.model.abilities.isUndead) continue;
      if (!s_Options.skeletonsUpgrade && GameActors.isSkeletonBranch(a.model)) continue;
      if (!s_Options.ratsUpgrade && GameActors.isRatBranch(a.model)) continue;
      if (!s_Options.shamblersUpgrade && GameActors.isShamblerBranch(a.model)) continue;

      // do it!
      const upgradeFrom = this.RollSkillsToUpgrade(a, 3 * 100);
      const chosenSkill = this.NPCPickSkillToUpgrade(a, upgradeFrom);
      if (chosenSkill === null) continue;
      // upgrade it!
      this.SkillUpgrade(a, chosenSkill);
    }
  }

  // C# RollSkillsToUpgrade — RogueGame.cs:17563
  RollSkillsToUpgrade(actor: Actor, maxTries: number): SkillID[] {
    const count = actor.model.abilities.isUndead ? Rules.UNDEAD_UPGRADE_SKILLS_TO_CHOOSE_FROM : Rules.UPGRADE_SKILLS_TO_CHOOSE_FROM;
    const list: SkillID[] = [];

    for (let i = 0; i < count; i++) {
      let newSk: SkillID | null;
      let attempt = 0;
      do {
        ++attempt;
        newSk = this.RollRandomSkillToUpgrade(actor, maxTries);
        if (newSk === null) return list;
      } while (list.includes(newSk) && attempt < maxTries);

      list.push(newSk);
    }

    return list;
  }

  // C# NPCPickSkillToUpgrade — RogueGame.cs:17586
  NPCPickSkillToUpgrade(npc: Actor, chooseFrom: SkillID[]): SkillID | null {
    if (chooseFrom.length === 0) return null;

    // Compute skill utilities and get best utility.
    const N = chooseFrom.length;
    const utilities: number[] = new Array(N);
    let bestUtility = -1;
    for (let i = 0; i < N; i++) {
      utilities[i] = this.NPCSkillUtility(npc, chooseFrom[i]);
      if (utilities[i] > bestUtility) bestUtility = utilities[i];
    }

    // Randomly choose on of the best.
    const bestSkills: SkillID[] = [];
    for (let i = 0; i < N; i++) if (utilities[i] === bestUtility) bestSkills.push(chooseFrom[i]);
    return bestSkills[this.m_Rules.roll(0, bestSkills.length)];
  }

  // C# NPCSkillUtility — RogueGame.cs:17610
  NPCSkillUtility(actor: Actor, skID: SkillID): number {
    const USELESS_UTIL = 0;
    const LOW_UTIL = 1;
    const AVG_UTIL = 2;
    const HI_UTIL = 3;

    if (actor.model.abilities.isUndead) {
      // undeads.
      switch (skID) {
        // useful one.
        case SkillID.Z_GRAB:
        case SkillID.Z_INFECTOR:
        case SkillID.Z_LIGHT_EATER:
          return HI_UTIL;

        // ok ones.
        case SkillID.Z_AGILE:
        case SkillID.Z_STRONG:
        case SkillID.Z_TOUGH:
        case SkillID.Z_TRACKER:
          return AVG_UTIL;

        // meh ones.
        case SkillID.Z_EATER:
        case SkillID.Z_LIGHT_FEET:
          return LOW_UTIL;

        default:
          return USELESS_UTIL;
      }
    } else {
      switch (skID) {
        case SkillID.AGILE:
          return AVG_UTIL;

        case SkillID.AWAKE:
          // useful only if has to sleep.
          return actor.model.abilities.hasToSleep ? HI_UTIL : USELESS_UTIL;

        case SkillID.BOWS: {
          // useful only if has bow weapon.
          if (actor.inventory != null) {
            for (const it of actor.inventory.items)
              if (it instanceof ItemRangedWeapon) {
                if ((it.model as ItemRangedWeaponModel).isBow) return HI_UTIL;
              }
          }
          return USELESS_UTIL;
        }

        case SkillID.CARPENTRY:
          return LOW_UTIL;

        case SkillID.CHARISMATIC:
          // useful only if leader.
          return actor.countFollowers > 0 ? LOW_UTIL : USELESS_UTIL;

        case SkillID.FIREARMS: {
          // useful only if has firearm weapon.
          if (actor.inventory != null) {
            for (const it of actor.inventory.items)
              if (it instanceof ItemRangedWeapon) {
                if ((it.model as ItemRangedWeaponModel).isFireArm) return HI_UTIL;
              }
          }
          return USELESS_UTIL;
        }

        case SkillID.HARDY:
          // useful only if has to sleep.
          return actor.model.abilities.hasToSleep ? HI_UTIL : USELESS_UTIL;

        case SkillID.HAULER:
          return HI_UTIL;

        case SkillID.HIGH_STAMINA:
          return HI_UTIL; // alpha10; was previously rated as avg

        case SkillID.LEADERSHIP:
          // useful only if not follower.
          return actor.hasLeader ? USELESS_UTIL : LOW_UTIL;

        case SkillID.LIGHT_EATER:
          // useful only if has to eat.
          return actor.model.abilities.hasToEat ? HI_UTIL : USELESS_UTIL;

        case SkillID.LIGHT_FEET:
          return AVG_UTIL;

        case SkillID.LIGHT_SLEEPER:
          // useful only if has to sleep.
          return actor.model.abilities.hasToSleep ? AVG_UTIL : USELESS_UTIL;

        case SkillID.MARTIAL_ARTS: {
          // useless if any weapon in inventory.
          if (actor.inventory != null) {
            for (const it of actor.inventory.items) {
              if (it instanceof ItemWeapon) return LOW_UTIL;
            }
          }
          return AVG_UTIL;
        }

        case SkillID.MEDIC:
          return LOW_UTIL;

        case SkillID.NECROLOGY:
          return LOW_UTIL; // alpha10 ; was previously rated as useless

        case SkillID.STRONG:
          return AVG_UTIL;

        case SkillID.STRONG_PSYCHE:
          // useful only if has sanity.
          return actor.model.abilities.hasSanity ? HI_UTIL : USELESS_UTIL;

        case SkillID.TOUGH:
          return HI_UTIL;

        case SkillID.UNSUSPICIOUS:
          // useful only if murderer and not law enforcer.
          return actor.murdersCounter > 0 && !actor.model.abilities.isLawEnforcer ? LOW_UTIL : USELESS_UTIL;

        default:
          return USELESS_UTIL;
      }
    }
  }

  // C# RollRandomSkillToUpgrade — RogueGame.cs:17757
  RollRandomSkillToUpgrade(actor: Actor, maxTries: number): SkillID | null {
    let attempt = 0;
    let skID: SkillID;
    const isUndead = actor.model.abilities.isUndead;

    do {
      ++attempt;
      skID = isUndead ? Skills.rollUndead(this.m_Rules.diceRoller) : Skills.rollLiving(this.m_Rules.diceRoller);
    } while (actor.sheet.skillTable.getSkillLevel(skID) >= Skills.maxSkillLevel(skID) && attempt < maxTries);

    if (attempt >= maxTries) return null;
    else return skID;
  }

  // C# DoLooseRandomSkill — RogueGame.cs:17776
  DoLooseRandomSkill(actor: Actor): void {
    const skills = actor.sheet.skillTable.skillsList;
    if (skills == null) return;

    // pick a skill.
    const iSkill = this.m_Rules.roll(0, skills.length);
    const lostSkill = skills[iSkill] as SkillID;

    // regress.
    actor.sheet.skillTable.decOrRemoveSkill(lostSkill);

    // message.
    if (this.IsVisibleToPlayer(actor)) this.AddMessage(this.MakeMessage(actor, `regressed in ${Skills.name(lostSkill)}!`));
  }

  // C# SkillUpgrade — RogueGame.cs:17793
  SkillUpgrade(actor: Actor, id: SkillID): Skill {
    actor.sheet.skillTable.addOrIncreaseSkill(id);
    const sk = actor.sheet.skillTable.getSkill(id)!;
    this.OnSkillUpgrade(actor, id);

    return sk;
  }

  // C# OnSkillUpgrade — RogueGame.cs:17802
  OnSkillUpgrade(actor: Actor, id: SkillID): void {
    switch (id) {
      case SkillID.HAULER:
        if (actor.inventory != null) actor.inventory.maxCapacity = this.m_Rules.actorMaxInv(actor);
        break;

      default:
        // no special upkeep to do.
        break;
    }
  }

  // C# ChangeWeather — RogueGame.cs:17817
  ChangeWeather(): void {
    const canSeeWeather = this.m_Rules.canActorSeeSky(this.m_Player); // alpha10

    // roll & annouce new weather.
    let desc: string;
    let newWeather: Weather;
    switch (this.m_Session.weather) {
      case Weather.CLEAR:
        newWeather = Weather.CLOUDY;
        desc = "Clouds are covering the sun.";
        break;

      case Weather.CLOUDY:
        if (this.m_Rules.rollChance(50)) {
          newWeather = Weather.CLEAR;
          desc = "The sky is clear again.";
        } else {
          newWeather = Weather.RAIN;
          desc = "Rain is starting to fall.";
        }
        break;

      case Weather.RAIN:
        if (this.m_Rules.rollChance(50)) {
          newWeather = Weather.CLOUDY;
          desc = "The rain has stopped.";
        } else {
          newWeather = Weather.HEAVY_RAIN;
          desc = "The weather is getting worse!";
        }
        break;

      case Weather.HEAVY_RAIN:
        newWeather = Weather.RAIN;
        desc = "The rain is less heavy.";
        break;

      default:
        throw new RangeError("unhandled weather");
    }

    // change.
    this.m_Session.weather = newWeather;

    // message.
    if (canSeeWeather) this.AddMessage(new Message(desc, this.m_Session.worldTime.turnCounter, Color.White));

    // scoring.
    this.m_Session.scoring.addEvent(
      this.m_Session.worldTime.turnCounter,
      `The weather changed to ${this.DescribeWeather(this.m_Session.weather)}.`
    );
  }

  /// <summary>
  /// Add kill to scoring record.
  /// </summary>
  /// <param name="victim"></param>
  // C# PlayerKill — RogueGame.cs:17881
  PlayerKill(victim: Actor): void {
    // scoring.
    this.m_Session.scoring.addKill(this.m_Player, victim, this.m_Session.worldTime.turnCounter);
  }

  // C# InfectActor — RogueGame.cs:17889
  InfectActor(actor: Actor, addInfection: number): void {
    actor.infection = Math.min(this.m_Rules.actorInfectionHPs(actor), actor.infection + addInfection);
  }

  /// <summary>
  /// Zombify an actor during the game or zombify the player at game start.
  /// </summary>
  /// <param name="zombifier"></param>
  /// <param name="deadVictim"></param>
  /// <param name="isStartingGame"></param>
  /// <returns></returns>
  // C# Zombify — RogueGame.cs:17901
  Zombify(zombifier: Actor | null, deadVictim: Actor, isStartingGame: boolean): Actor {
    const newZombie = this.m_TownGenerator.makeZombified(
      zombifier,
      deadVictim,
      isStartingGame ? 0 : deadVictim.location.map!.localTime.turnCounter
    );

    // add to map.
    if (!isStartingGame) deadVictim.location.map!.placeActor(newZombie, deadVictim.location.position);

    // reset AP - dont act this turn.
    newZombie.actionPoints = 0;

    // if zombifying player, remember it!
    if (deadVictim === this.m_Player || deadVictim.isPlayer) this.m_Session.scoring.setZombifiedPlayer(newZombie);

    // keep half of the skills from living form at random.
    const livingSkills = deadVictim.sheet.skillTable;
    if (livingSkills != null && livingSkills.countSkills > 0) {
      const nbLivingSkills = livingSkills.countSkills;
      const nbSkillsToKeep = Math.floor(livingSkills.countTotalSkillLevels / 2);
      for (let i = 0; i < nbSkillsToKeep; i++) {
        const keepSkill = livingSkills.skillsList![this.m_Rules.roll(0, nbLivingSkills)] as SkillID;
        const zombiefiedSkill = this.ZombifySkill(keepSkill);
        if (zombiefiedSkill !== null) this.SkillUpgrade(newZombie, zombiefiedSkill);
      }
      this.m_TownGenerator.recomputeActorStartingStats(newZombie);
    }

    // cause insanity.
    if (!isStartingGame)
      this.SeeingCauseInsanity(
        newZombie,
        newZombie.location,
        Rules.SANITY_HIT_ZOMBIFY,
        `${deadVictim.name} turning into a zombie`
      );

    // done.
    return newZombie;
  }

  // C# ZombifySkill — RogueGame.cs:17942
  ZombifySkill(skill: SkillID): SkillID | null {
    switch (skill) {
      case SkillID.AGILE:
        return SkillID.Z_AGILE;
      case SkillID.LIGHT_EATER:
        return SkillID.Z_LIGHT_EATER;
      case SkillID.LIGHT_FEET:
        return SkillID.Z_LIGHT_FEET;
      case SkillID.MEDIC:
        return SkillID.Z_INFECTOR;
      case SkillID.STRONG:
        return SkillID.Z_STRONG;
      case SkillID.TOUGH:
        return SkillID.Z_TOUGH;
      default:
        return null;
    }
  }

  /// <summary>
  /// Put the object on fire : firestate = onfire, jump -1.
  /// </summary>
  /// <param name="mapObj"></param>
  // C# ApplyOnFire — RogueGame.cs:17963
  ApplyOnFire(mapObj: MapObject): void {
    // put object on fire.
    mapObj.fireState = MapObjectFire.ONFIRE;
    // can't jump on it.
    --mapObj.jumpLevel;
  }

  /// <summary>
  /// Unapply fire effects. FIXME: need to distinguish Unapply (burnable again) vs PutOutFire (ashes)?
  /// </summary>
  /// <param name="mapObj"></param>
  // C# UnapplyOnFire — RogueGame.cs:17975
  UnapplyOnFire(mapObj: MapObject): void {
    // restore jumpability.
    ++mapObj.jumpLevel;
    // extinguish fire, burnable again.
    mapObj.fireState = MapObjectFire.BURNABLE;
  }

  // C# ComputeViewRect — RogueGame.cs:17987
  ComputeViewRect(mapCenter: Point): void {
    void mapCenter;
    throw new Error("not yet ported: ComputeViewRect (RogueGame.cs:17987)");
  }

  // C# IsInViewRect — RogueGame.cs:17998
  IsInViewRect(mapPosition: Point): boolean {
    void mapPosition;
    throw new Error("not yet ported: IsInViewRect (RogueGame.cs:17998)");
  }

  // C# RedrawPlayScreen — RogueGame.cs:18004
  RedrawPlayScreen(): void {
    throw new Error("not yet ported: RedrawPlayScreen (RogueGame.cs:18004)");
  }

  // C# LocationText — RogueGame.cs:18154
  LocationText(map: Map, actor: Actor): string {
    void map;
    void actor;
    throw new Error("not yet ported: LocationText (RogueGame.cs:18154)");
  }

  // C# TintForDayPhase — RogueGame.cs:18176
  TintForDayPhase(phase: DayPhase): Color {
    void phase;
    throw new Error("not yet ported: TintForDayPhase (RogueGame.cs:18176)");
  }

  // C# DrawMap — RogueGame.cs:18205
  DrawMap(map: Map, tint: Color): void {
    void map;
    void tint;
    throw new Error("not yet ported: DrawMap (RogueGame.cs:18205)");
  }

  // C# MovingWaterImage — RogueGame.cs:18383
  MovingWaterImage(model: TileModel, turnCount: number): string {
    void model;
    void turnCount;
    throw new Error("not yet ported: MovingWaterImage (RogueGame.cs:18383)");
  }

  // C# DrawTile — RogueGame.cs:18399
  DrawTile(tile: Tile, screen: Point, tint: Color): void {
    void tile;
    void screen;
    void tint;
    throw new Error("not yet ported: DrawTile (RogueGame.cs:18399)");
  }

  // C# DrawTileWaterCover — RogueGame.cs:18433
  DrawTileWaterCover(tile: Tile, screen: Point, tint: Color): void {
    void tile;
    void screen;
    void tint;
    throw new Error("not yet ported: DrawTileWaterCover (RogueGame.cs:18433)");
  }

  // C# DrawExit — RogueGame.cs:18447
  DrawExit(screen: Point): void {
    void screen;
    throw new Error("not yet ported: DrawExit (RogueGame.cs:18447)");
  }

  // C# DrawTileRectangle — RogueGame.cs:18452
  DrawTileRectangle(mapPosition: Point, color: Color): void {
    void mapPosition;
    void color;
    throw new Error("not yet ported: DrawTileRectangle (RogueGame.cs:18452)");
  }

  // C# DrawMapObject — RogueGame.cs:18457 (+1 overloads)
  DrawMapObject(mapObj: MapObject, screen: Point, imageID: Color | string, drawFn: (p0: string, p1: number, p2: number) => void): void {
    void mapObj;
    void screen;
    void imageID;
    void drawFn;
    throw new Error("not yet ported: DrawMapObject (RogueGame.cs:18457)");
  }

  // C# DrawActorSprite — RogueGame.cs:18496
  DrawActorSprite(actor: Actor, screen: Point, tint: Color): void {
    void actor;
    void screen;
    void tint;
    throw new Error("not yet ported: DrawActorSprite (RogueGame.cs:18496)");
  }

  // C# ActorHasVitalItemForPlayer — RogueGame.cs:18726
  ActorHasVitalItemForPlayer(actor: Actor): boolean {
    void actor;
    throw new Error("not yet ported: ActorHasVitalItemForPlayer (RogueGame.cs:18726)");
  }

  // C# DrawActorDecoration — RogueGame.cs:18757 (+1 overloads)
  DrawActorDecoration(actor: Actor, gx: number, gy: number, part: DollPart, rotation: Color | number, scale?: number): void {
    void actor;
    void gx;
    void gy;
    void part;
    void rotation;
    void scale;
    throw new Error("not yet ported: DrawActorDecoration (RogueGame.cs:18757)");
  }

  // C# DrawActorEquipment — RogueGame.cs:18777
  DrawActorEquipment(actor: Actor, gx: number, gy: number, part: DollPart, tint: Color): void {
    void actor;
    void gx;
    void gy;
    void part;
    void tint;
    throw new Error("not yet ported: DrawActorEquipment (RogueGame.cs:18777)");
  }

  // C# DrawCorpse — RogueGame.cs:18786
  DrawCorpse(c: Corpse, gx: number, gy: number, tint: Color): void {
    void c;
    void gx;
    void gy;
    void tint;
    throw new Error("not yet ported: DrawCorpse (RogueGame.cs:18786)");
  }

  // C# DrawCorpsesList — RogueGame.cs:18837
  DrawCorpsesList(list: Corpse[], title: string, slots: number, gx: number, gy: number): void {
    void list;
    void title;
    void slots;
    void gx;
    void gy;
    throw new Error("not yet ported: DrawCorpsesList (RogueGame.cs:18837)");
  }

  // C# DrawActorRelations — RogueGame.cs:18882
  DrawActorRelations(actor: Actor): void {
    void actor;
    throw new Error("not yet ported: DrawActorRelations (RogueGame.cs:18882)");
  }

  // C# DrawPlayerActorTargets — RogueGame.cs:18918
  DrawPlayerActorTargets(player: Actor): void {
    void player;
    throw new Error("not yet ported: DrawPlayerActorTargets (RogueGame.cs:18918)");
  }

  // C# DrawItemsStack — RogueGame.cs:18940
  DrawItemsStack(inventory: Inventory, gx: number, gy: number, tint: Color): void {
    void inventory;
    void gx;
    void gy;
    void tint;
    throw new Error("not yet ported: DrawItemsStack (RogueGame.cs:18940)");
  }

  // C# DrawMapIcon — RogueGame.cs:18949
  DrawMapIcon(position: Point, imageID: string): void {
    void position;
    void imageID;
    throw new Error("not yet ported: DrawMapIcon (RogueGame.cs:18949)");
  }

  // C# DrawMapHealthBar — RogueGame.cs:18954 (+1 overloads)
  DrawMapHealthBar(hitPoints: number, maxHitPoints: number, gx: number, gy: number, barColor?: Color): void {
    void hitPoints;
    void maxHitPoints;
    void gx;
    void gy;
    void barColor;
    throw new Error("not yet ported: DrawMapHealthBar (RogueGame.cs:18954)");
  }

  // C# DrawBar — RogueGame.cs:18970
  DrawBar(value: number, previousValue: number, maxValue: number, refValue: number, maxWidth: number, height: number, gx: number, gy: number, fillColor: Color, lossFillColor: Color, gainFillColor: Color, emptyColor: Color): void {
    void value;
    void previousValue;
    void maxValue;
    void refValue;
    void maxWidth;
    void height;
    void gx;
    void gy;
    void fillColor;
    void lossFillColor;
    void gainFillColor;
    void emptyColor;
    throw new Error("not yet ported: DrawBar (RogueGame.cs:18970)");
  }

  // C# DrawMiniMap — RogueGame.cs:19006
  DrawMiniMap(map: Map): void {
    void map;
    throw new Error("not yet ported: DrawMiniMap (RogueGame.cs:19006)");
  }

  // C# DrawActorStatus — RogueGame.cs:19211
  DrawActorStatus(actor: Actor, gx: number, gy: number): void {
    void actor;
    void gx;
    void gy;
    throw new Error("not yet ported: DrawActorStatus (RogueGame.cs:19211)");
  }

  // C# DrawInventory — RogueGame.cs:19368
  DrawInventory(inventory: Inventory, title: string, drawSlotsNumbers: boolean, slotsPerLine: number, maxSlots: number, gx: number, gy: number): void {
    void inventory;
    void title;
    void drawSlotsNumbers;
    void slotsPerLine;
    void maxSlots;
    void gx;
    void gy;
    throw new Error("not yet ported: DrawInventory (RogueGame.cs:19368)");
  }

  // C# DrawItem — RogueGame.cs:19476 (+1 overloads)
  DrawItem(it: Item, gx: number, gy: number, tint?: Color): void {
    void it;
    void gx;
    void gy;
    void tint;
    throw new Error("not yet ported: DrawItem (RogueGame.cs:19476)");
  }

  // C# DrawTrapItem — RogueGame.cs:19503
  DrawTrapItem(trap: ItemTrap, gx: number, gy: number): void {
    void trap;
    void gx;
    void gy;
    throw new Error("not yet ported: DrawTrapItem (RogueGame.cs:19503)");
  }

  // C# DrawActorSkillTable — RogueGame.cs:19527
  DrawActorSkillTable(actor: Actor, gx: number, gy: number): void {
    void actor;
    void gx;
    void gy;
    throw new Error("not yet ported: DrawActorSkillTable (RogueGame.cs:19527)");
  }

  // C# AddOverlay — RogueGame.cs:19573
  AddOverlay(o: Overlay): void {
    this.m_Overlays.push(o);
  }

  // C# ClearOverlays — RogueGame.cs:19581
  ClearOverlays(): void {
    this.m_Overlays.length = 0;
  }

  // C# RemoveOverlay — RogueGame.cs:19589
  RemoveOverlay(o: Overlay): void {
    const i = this.m_Overlays.indexOf(o);
    if (i >= 0) this.m_Overlays.splice(i, 1);
  }

  // C# HasOverlay — RogueGame.cs:19598
  HasOverlay(o: Overlay): boolean {
    return this.m_Overlays.includes(o);
  }

  // C# MapToScreen — RogueGame.cs:19611 (+1 overloads)
  MapToScreen(mapPosition: Point | number, y?: number): Point {
    void mapPosition;
    void y;
    throw new Error("not yet ported: MapToScreen (RogueGame.cs:19611)");
  }

  // C# ScreenToMap — RogueGame.cs:19621 (+1 overloads)
  ScreenToMap(gx: Point | number, gy?: number): Point {
    void gx;
    void gy;
    throw new Error("not yet ported: ScreenToMap (RogueGame.cs:19621)");
  }

  // C# MouseToMap — RogueGame.cs:19631 (+1 overloads)
  MouseToMap(mousePosition: Point | number, mouseY?: number): Point {
    void mousePosition;
    void mouseY;
    throw new Error("not yet ported: MouseToMap (RogueGame.cs:19631)");
  }

  // C# MouseToInventorySlot — RogueGame.cs:19643
  MouseToInventorySlot(invX: number, invY: number, mouseX: number, mouseY: number): Point {
    void invX;
    void invY;
    void mouseX;
    void mouseY;
    throw new Error("not yet ported: MouseToInventorySlot (RogueGame.cs:19643)");
  }

  // C# InventorySlotToScreen — RogueGame.cs:19651
  InventorySlotToScreen(invX: number, invY: number, slotX: number, slotY: number): Point {
    void invX;
    void invY;
    void slotX;
    void slotY;
    throw new Error("not yet ported: InventorySlotToScreen (RogueGame.cs:19651)");
  }

  // C# IsVisibleToPlayer — RogueGame.cs:19658 (+3 overloads)
  // C# overloads: (Location), (Map, Point), (Actor), (MapObject).
  IsVisibleToPlayer(target: Location | Map | Actor | MapObject, position?: Point): boolean {
    if (target instanceof Map) {
      if (position == null) throw new TypeError("IsVisibleToPlayer(map, position): position is required");
      const map = target;
      return (
        this.m_Player != null &&
        map === this.m_Player.location.map &&
        map.isInBounds(position.x, position.y) &&
        (map.getTileAt(position.x, position.y)?.isInView ?? false)
      );
    }
    if (target instanceof Actor) return target === this.m_Player || this.IsVisibleToPlayer(target.location);
    if (target instanceof MapObject) return this.IsVisibleToPlayer(target.location);
    return this.IsVisibleToPlayer(target.map!, target.position);
  }

  // C# IsKnownToPlayer — RogueGame.cs:19680 (+2 overloads)
  IsKnownToPlayer(location: Map | Location | MapObject, position?: Point): boolean {
    void location;
    void position;
    throw new Error("not yet ported: IsKnownToPlayer (RogueGame.cs:19680)");
  }

  // C# IsPlayerSleeping — RogueGame.cs:19695
  IsPlayerSleeping(): boolean {
    throw new Error("not yet ported: IsPlayerSleeping (RogueGame.cs:19695)");
  }

  // C# FindLongestLine — RogueGame.cs:19702
  FindLongestLine(lines: readonly string[]): number {
    if (lines == null || lines.length === 0) return 0;

    let max = -2147483648; // Int32.MinValue

    for (const s of lines) {
      if (s == null) continue; // sanity check.
      if (s.length > max) max = s.length;
    }

    return max;
  }

  // C# HandleSaveGame — RogueGame.cs:19724
  HandleSaveGame(): void {
    throw new Error("not yet ported: HandleSaveGame (RogueGame.cs:19724)");
  }

  // C# CheckAutoSaveTime — RogueGame.cs:19734
  CheckAutoSaveTime(): void {
    throw new Error("not yet ported: CheckAutoSaveTime (RogueGame.cs:19734)");
  }

  // C# ScheduleNextAutoSave — RogueGame.cs:19758
  ScheduleNextAutoSave(): void {
    throw new Error("not yet ported: ScheduleNextAutoSave (RogueGame.cs:19758)");
  }

  // C# HandleLoadGame — RogueGame.cs:19763
  HandleLoadGame(): void {
    throw new Error("not yet ported: HandleLoadGame (RogueGame.cs:19763)");
  }

  // C# DoSaveGame — RogueGame.cs:19770
  DoSaveGame(saveName: string, isAutoSave?: boolean): void {
    void saveName;
    void isAutoSave;
    throw new Error("not yet ported: DoSaveGame (RogueGame.cs:19770)");
  }

  // C# DoLoadGame — RogueGame.cs:19792
  DoLoadGame(saveName: string): void {
    void saveName;
    throw new Error("not yet ported: DoLoadGame (RogueGame.cs:19792)");
  }

  // C# DeleteSavedGame — RogueGame.cs:19809
  // C# deletes the save file synchronously; saves live in IndexedDB/localStorage
  // so the browser equivalent is async.
  async DeleteSavedGame(saveName: string): Promise<void> {
    await GameSaveManager.deleteSave(Number(saveName));
  }

  // C# LoadGame — RogueGame.cs:19819
  async LoadGame(saveName: string): Promise<boolean> {
    void saveName;
    throw new Error("not yet ported: LoadGame (RogueGame.cs:19819)");
  }

  // C# LoadOptions — RogueGame.cs:19843
  async LoadOptions(): Promise<void> {
    // load. (C# `s_Options = GameOptions.Load(path)` — s_Options *is* the
    // shared Options singleton, so copy into it instead of replacing it.)
    s_Options.copyFrom(GameOptions.load());
  }

  // C# SaveOptions — RogueGame.cs:19849
  SaveOptions(): void {
    // save
    GameOptions.save(s_Options);
  }

  // C# ApplyOptions — RogueGame.cs:19855
  ApplyOptions(_ingame: boolean): void {
    // m_MusicManager.IsMusicEnabled = Options.PlayMusic;
    // m_MusicManager.Volume = Options.MusicVolume;   (C# volume is 0..100, WebAudio is 0..1)
    this.m_MusicManager.setVolume(s_Options.musicVolume / 100);

    // update difficulty.
    if (this.m_Session != null && this.m_Session.scoring != null) {
      this.m_Session.scoring.side =
        this.m_Player == null || !this.m_Player.model.abilities.isUndead
          ? DifficultySide.FOR_SURVIVOR
          : DifficultySide.FOR_UNDEAD;
      this.m_Session.scoring.difficultyRating = Scoring.computeDifficultyRating(
        s_Options,
        this.m_Session.scoring.side,
        this.m_Session.scoring.reincarnationNumber
      );
    }

    if (!s_Options.playMusic) this.m_MusicManager.stop();
  }

  // C# LoadKeybindings — RogueGame.cs:19873
  async LoadKeybindings(): Promise<void> {
    this.m_UI.UI_Clear(Color.Black);
    this.m_UI.UI_DrawStringBold(Color.White, "Loading keybindings...", 0, 0);
    this.m_UI.UI_Repaint();

    s_KeyBindings.loadFromStorage();

    this.m_UI.UI_Clear(Color.Black);
    this.m_UI.UI_DrawStringBold(Color.White, "Loading keybindings... done!", 0, 0);
    this.m_UI.UI_Repaint();
  }

  // C# SaveKeybindings — RogueGame.cs:19887
  SaveKeybindings(): void {
    this.m_UI.UI_Clear(Color.Black);
    this.m_UI.UI_DrawStringBold(Color.White, "Saving keybindings...", 0, 0);
    this.m_UI.UI_Repaint();

    s_KeyBindings.saveToStorage();

    this.m_UI.UI_Clear(Color.Black);
    this.m_UI.UI_DrawStringBold(Color.White, "Saving keybindings... done!", 0, 0);
    this.m_UI.UI_Repaint();
  }

  // C# LoadHints — RogueGame.cs:19902
  async LoadHints(): Promise<void> {
    this.m_UI.UI_Clear(Color.Black);
    this.m_UI.UI_DrawStringBold(Color.White, "Loading hints...", 0, 0);
    this.m_UI.UI_Repaint();

    s_Hints = GameHintsStatus.loadFromStorage();

    this.m_UI.UI_Clear(Color.Black);
    this.m_UI.UI_DrawStringBold(Color.White, "Loading hints... done!", 0, 0);
    this.m_UI.UI_Repaint();
  }

  // C# SaveHints — RogueGame.cs:19915
  SaveHints(): void {
    s_Hints.saveToStorage();
  }

  // C# DrawMenuOrOptions — RogueGame.cs:19932
  DrawMenuOrOptions(
    currentChoice: number,
    entriesColor: Color,
    entries: string[],
    valuesColor: Color,
    values: string[] | null,
    gx: number,
    gy: { value: number },
    valuesOnNewLine = false,
    rightPadding = 256
  ): void {
    const right = gx + rightPadding;

    if (values != null && entries.length !== values.length)
      throw new RangeError("values length!= choices length");

    // display.
    const entriesShadowColor = shadowColorOf(entriesColor);
    for (let i = 0; i < entries.length; i++) {
      const choiceStr = i === currentChoice ? `---> ${entries[i]}` : `     ${entries[i]}`;
      this.m_UI.UI_DrawStringBold(entriesColor, choiceStr, gx, gy.value, entriesShadowColor);

      if (values != null) {
        const valueStr = i === currentChoice && !valuesOnNewLine ? `${values[i]} <---` : values[i];

        if (valuesOnNewLine) {
          gy.value += BOLD_LINE_SPACING;
          this.m_UI.UI_DrawStringBold(valuesColor, valueStr, gx + right, gy.value);
        } else {
          this.m_UI.UI_DrawStringBold(valuesColor, valueStr, right, gy.value);
        }
      }

      gy.value += BOLD_LINE_SPACING;
    }
  }

  // C# DrawHeader — RogueGame.cs:19975
  DrawHeader(): void {
    this.m_UI.UI_DrawStringBold(Color.Red, `ROGUE SURVIVOR - ${GAME_VERSION}`, 0, 0, Color.DarkRed);
  }

  // C# DrawFootnote — RogueGame.cs:19980
  DrawFootnote(color: Color, text: string): void {
    this.m_UI.UI_DrawStringBold(
      color,
      `<${text}>`,
      0,
      CANVAS_HEIGHT - BOLD_LINE_SPACING,
      shadowColorOf(color)
    );
  }

  // C# GetUserBasePath — RogueGame.cs:19988
  GetUserBasePath(): string {
    throw new Error("not yet ported: GetUserBasePath (RogueGame.cs:19988)");
  }

  // C# GetUserSavesPath — RogueGame.cs:19997
  // The browser port has no filesystem; `HiScoreTable` stores into localStorage and
  // ignores the path, so these only matter as display/`TextFile` keys.
  GetUserSavesPath(): string {
    return "";
  }

  // C# GetUserSave — RogueGame.cs:20002
  // C# returns a filesystem path; the browser port keys saves by IndexedDB slot.
  GetUserSave(): string {
    return String(RogueGame.CURRENT_SAVE_SLOT);
  }

  // C# GetUserDocsPath — RogueGame.cs:20007
  GetUserDocsPath(): string {
    throw new Error("not yet ported: GetUserDocsPath (RogueGame.cs:20007)");
  }

  // C# GetUserGraveyardPath — RogueGame.cs:20012
  GetUserGraveyardPath(): string {
    throw new Error("not yet ported: GetUserGraveyardPath (RogueGame.cs:20012)");
  }

  // C# GetUserNewGraveyardName — RogueGame.cs:20021
  // C# loops until `!File.Exists(GraveFilePath(name))`; in the browser graves are
  // stored in localStorage under `textfile:` (see `TextFile.save`).
  GetUserNewGraveyardName(): string {
    let name = "";
    let i = 0;
    let isFreeID = false;
    do {
      name = `grave_${String(i).padStart(3, "0")}`;
      isFreeID = typeof localStorage === "undefined" || localStorage.getItem(`textfile:${this.GraveFilePath(name)}`) === null;
      ++i;
    } while (!isFreeID);

    return name;
  }

  // C# GraveFilePath — RogueGame.cs:20037
  // C# appends the user graveyard directory (`GetUserGraveyardPath()`, a filesystem
  // path); `TextFile.save` keys by file name alone, so the directory is dropped.
  GraveFilePath(graveName: string): string {
    return `${graveName}.txt`;
  }

  // C# GetUserConfigPath — RogueGame.cs:20042
  GetUserConfigPath(): string {
    throw new Error("not yet ported: GetUserConfigPath (RogueGame.cs:20042)");
  }

  // C# GetUserOptionsFilePath — RogueGame.cs:20047
  GetUserOptionsFilePath(): string {
    throw new Error("not yet ported: GetUserOptionsFilePath (RogueGame.cs:20047)");
  }

  // C# GetUserScreenshotsPath — RogueGame.cs:20052
  GetUserScreenshotsPath(): string {
    throw new Error("not yet ported: GetUserScreenshotsPath (RogueGame.cs:20052)");
  }

  // C# GetUserNewScreenshotName — RogueGame.cs:20061
  GetUserNewScreenshotName(): string {
    throw new Error("not yet ported: GetUserNewScreenshotName (RogueGame.cs:20061)");
  }

  // C# ScreenshotFilePath — RogueGame.cs:20077
  ScreenshotFilePath(shotname: string): string {
    void shotname;
    throw new Error("not yet ported: ScreenshotFilePath (RogueGame.cs:20077)");
  }

  // C# CreateDirectory — RogueGame.cs:20082
  CreateDirectory(path: string): boolean {
    void path;
    throw new Error("not yet ported: CreateDirectory (RogueGame.cs:20082)");
  }

  // C# CheckDirectory — RogueGame.cs:20093
  CheckDirectory(path: string, description: string, gy: { value: number }): boolean {
    void path;
    void description;
    void gy;
    throw new Error("not yet ported: CheckDirectory (RogueGame.cs:20093)");
  }

  // C# CheckCopyOfManual — RogueGame.cs:20106
  CheckCopyOfManual(): boolean {
    throw new Error("not yet ported: CheckCopyOfManual (RogueGame.cs:20106)");
  }

  // C# GetUserManualFilePath — RogueGame.cs:20127
  // Browser: the manual ships as a static asset (web/public/assets/manual.txt).
  GetUserManualFilePath(): string {
    return "assets/manual.txt";
  }

  // C# GetUserHiScorePath — RogueGame.cs:20132
  GetUserHiScorePath(): string {
    return this.GetUserSavesPath();
  }

  // C# GetUserHiScoreFilePath — RogueGame.cs:20137
  GetUserHiScoreFilePath(): string {
    return this.GetUserHiScorePath() + "hiscores.dat";
  }

  // C# GetUserHiScoreTextFilePath — RogueGame.cs:20142
  GetUserHiScoreTextFilePath(): string {
    return this.GetUserHiScorePath() + "hiscores.txt";
  }

  // C# GenerateWorld — RogueGame.cs:20149
  GenerateWorld(isVerbose: boolean, size: number): void {
    void isVerbose;
    void size;
    throw new Error("not yet ported: GenerateWorld (RogueGame.cs:20149)");
  }

  // C# CheckIfExitIsGood — RogueGame.cs:20494
  CheckIfExitIsGood(fromMap: Map, from: Point, toMap: Map, to: Point): boolean {
    void fromMap;
    void from;
    void toMap;
    void to;
    throw new Error("not yet ported: CheckIfExitIsGood (RogueGame.cs:20494)");
  }

  // C# GenerateExit — RogueGame.cs:20506
  GenerateExit(fromMap: Map, from: Point, toMap: Map, to: Point): void {
    void fromMap;
    void from;
    void toMap;
    void to;
    throw new Error("not yet ported: GenerateExit (RogueGame.cs:20506)");
  }

  // C# SpawnUniqueSewersThing — RogueGame.cs:20513
  SpawnUniqueSewersThing(world: World): UniqueActor {
    void world;
    throw new Error("not yet ported: SpawnUniqueSewersThing (RogueGame.cs:20513)");
  }

  // C# CreateUniqueBigBear — RogueGame.cs:20556
  CreateUniqueBigBear(world: World): UniqueActor {
    void world;
    throw new Error("not yet ported: CreateUniqueBigBear (RogueGame.cs:20556)");
  }

  // C# CreateUniqueFamuFataru — RogueGame.cs:20605
  CreateUniqueFamuFataru(world: World): UniqueActor {
    void world;
    throw new Error("not yet ported: CreateUniqueFamuFataru (RogueGame.cs:20605)");
  }

  // C# CreateUniqueSantaman — RogueGame.cs:20655
  CreateUniqueSantaman(world: World): UniqueActor {
    void world;
    throw new Error("not yet ported: CreateUniqueSantaman (RogueGame.cs:20655)");
  }

  // C# CreateUniqueRoguedjack — RogueGame.cs:20704
  CreateUniqueRoguedjack(world: World): UniqueActor {
    void world;
    throw new Error("not yet ported: CreateUniqueRoguedjack (RogueGame.cs:20704)");
  }

  // C# CreateUniqueDuckman — RogueGame.cs:20753
  CreateUniqueDuckman(world: World): UniqueActor {
    void world;
    throw new Error("not yet ported: CreateUniqueDuckman (RogueGame.cs:20753)");
  }

  // C# CreateUniqueHansVonHanz — RogueGame.cs:20804
  CreateUniqueHansVonHanz(world: World): UniqueActor {
    void world;
    throw new Error("not yet ported: CreateUniqueHansVonHanz (RogueGame.cs:20804)");
  }

  // C# SpawnUniqueSubwayWorkerBadge — RogueGame.cs:20853
  SpawnUniqueSubwayWorkerBadge(world: World): UniqueItem {
    void world;
    throw new Error("not yet ported: SpawnUniqueSubwayWorkerBadge (RogueGame.cs:20853)");
  }

  // C# CreateUniqueMap_CHARUndegroundFacility — RogueGame.cs:20887
  CreateUniqueMap_CHARUndegroundFacility(world: World): UniqueMap {
    void world;
    throw new Error("not yet ported: CreateUniqueMap_CHARUndegroundFacility (RogueGame.cs:20887)");
  }

  // C# GenerateDistrictKind — RogueGame.cs:20948
  GenerateDistrictKind(world: World, gridX: number, gridY: number): DistrictKind {
    void world;
    void gridX;
    void gridY;
    throw new Error("not yet ported: GenerateDistrictKind (RogueGame.cs:20948)");
  }

  // C# GenerateDistrictEntryMap — RogueGame.cs:20958
  GenerateDistrictEntryMap(world: World, district: District, policeStationDistrictPos: Point, hospitalDistrictPos: Point): Map {
    void world;
    void district;
    void policeStationDistrictPos;
    void hospitalDistrictPos;
    throw new Error("not yet ported: GenerateDistrictEntryMap (RogueGame.cs:20958)");
  }

  // C# GenerateDistrictSewersMap — RogueGame.cs:21033
  GenerateDistrictSewersMap(district: District): Map {
    void district;
    throw new Error("not yet ported: GenerateDistrictSewersMap (RogueGame.cs:21033)");
  }

  // C# GenerateDistrictSubwayMap — RogueGame.cs:21046
  GenerateDistrictSubwayMap(district: District): Map {
    void district;
    throw new Error("not yet ported: GenerateDistrictSubwayMap (RogueGame.cs:21046)");
  }

  // C# GeneratePlayerOnMap — RogueGame.cs:21060
  GeneratePlayerOnMap(map: Map, townGen: BaseTownGenerator): void {
    void map;
    void townGen;
    throw new Error("not yet ported: GeneratePlayerOnMap (RogueGame.cs:21060)");
  }

  // C# RefreshPlayer — RogueGame.cs:21177
  RefreshPlayer(): void {
    throw new Error("not yet ported: RefreshPlayer (RogueGame.cs:21177)");
  }

  // C# PrepareActorForPlayerControl — RogueGame.cs:21195
  PrepareActorForPlayerControl(newPlayerAvatar: Actor): void {
    void newPlayerAvatar;
    throw new Error("not yet ported: PrepareActorForPlayerControl (RogueGame.cs:21195)");
  }

  // C# SetCurrentMap — RogueGame.cs:21211
  SetCurrentMap(map: Map): void {
    void map;
    throw new Error("not yet ported: SetCurrentMap (RogueGame.cs:21211)");
  }

  // C# OnPlayerLeaveDistrict — RogueGame.cs:21220
  OnPlayerLeaveDistrict(): void {
    throw new Error("not yet ported: OnPlayerLeaveDistrict (RogueGame.cs:21220)");
  }

  // C# BeforePlayerEnterDistrict — RogueGame.cs:21226
  BeforePlayerEnterDistrict(district: District): void {
    void district;
    throw new Error("not yet ported: BeforePlayerEnterDistrict (RogueGame.cs:21226)");
  }

  // C# AfterPlayerEnterDistrict — RogueGame.cs:21368
  AfterPlayerEnterDistrict(): void {
    throw new Error("not yet ported: AfterPlayerEnterDistrict (RogueGame.cs:21368)");
  }

  // C# OnPlayerChangeMap — RogueGame.cs:21375
  OnPlayerChangeMap(): void {
    throw new Error("not yet ported: OnPlayerChangeMap (RogueGame.cs:21375)");
  }

  // C# ComputeSimFlagsForTurn — RogueGame.cs:21382
  ComputeSimFlagsForTurn(turn: number): SimFlags {
    void turn;
    throw new Error("not yet ported: ComputeSimFlagsForTurn (RogueGame.cs:21382)");
  }

  // C# SimulateDistrict — RogueGame.cs:21416
  SimulateDistrict(d: District): void {
    void d;
    throw new Error("not yet ported: SimulateDistrict (RogueGame.cs:21416)");
  }

  // C# SimulateNearbyDistricts — RogueGame.cs:21426
  SimulateNearbyDistricts(d: District): boolean {
    void d;
    throw new Error("not yet ported: SimulateNearbyDistricts (RogueGame.cs:21426)");
  }

  // C# StartSimThread — RogueGame.cs:21471
  StartSimThread(): void {
    throw new Error("not yet ported: StartSimThread (RogueGame.cs:21471)");
  }

  // C# StopSimThread — RogueGame.cs:21501
  // C# owns a dedicated sim thread (`m_SimThread.Abort()` / cooperative stop);
  // the browser port has no second thread — district simulation runs inside the
  // single async game loop — so there is nothing to stop or abort here.
  StopSimThread(abort: boolean): void {
    void abort;
  }

  // C# SimThreadProc — RogueGame.cs:21550
  SimThreadProc(): void {
    throw new Error("not yet ported: SimThreadProc (RogueGame.cs:21550)");
  }

  // C# ShowNewAchievement — RogueGame.cs:21597
  async ShowNewAchievement(id: AchievementIDs): Promise<void> {
    // one more achievement.
    ++this.m_Session.scoring.completedAchievementsCount;

    // get data.
    const ach = this.m_Session.scoring.getAchievement(id);
    const musicToPlay = ach.musicId;
    const title = ach.name;
    const text = ach.text;

    // add event.
    this.m_Session.scoring.addEvent(
      this.m_Session.worldTime.turnCounter,
      `** Achievement : ${title} for ${ach.scoreValue} points. **`
    );

    // music.
    this.m_MusicManager.stop();
    this.m_MusicManager.play(musicToPlay);

    // prepare banner.
    const longestLine = this.FindLongestLine(text);
    const starsLine = "*".repeat(Math.max(longestLine, 50));
    const lines: string[] = [];
    lines.push(starsLine);
    lines.push(`ACHIEVEMENT : ${title}`);
    lines.push("CONGRATULATIONS!");
    for (const line of text) lines.push(line);
    lines.push(`Achievements : ${this.m_Session.scoring.completedAchievementsCount}/${Scoring.MAX_ACHIEVEMENTS}.`);
    lines.push(starsLine);

    // banner.
    const pos = new Point(0, 0);
    this.AddOverlay(new OverlayPopup(lines, Color.Gold, Color.Gold, Color.DimGray, pos));
    this.ClearMessages();
    if (!this.m_Player.isBotPlayer) await this.AddMessagePressEnter();
    this.ClearOverlays();
  }

  // C# ShowSpecialDialogue — RogueGame.cs:21638
  ShowSpecialDialogue(speaker: Actor, text: string[]): void {
    void speaker;
    void text;
    throw new Error("not yet ported: ShowSpecialDialogue (RogueGame.cs:21638)");
  }

  // C# CheckSpecialPlayerEventsAfterAction — RogueGame.cs:21656
  CheckSpecialPlayerEventsAfterAction(player: Actor): void {
    void player;
    throw new Error("not yet ported: CheckSpecialPlayerEventsAfterAction (RogueGame.cs:21656)");
  }

  // C# HandleReincarnation — RogueGame.cs:22001
  HandleReincarnation(): void {
    throw new Error("not yet ported: HandleReincarnation (RogueGame.cs:22001)");
  }

  // C# DescribeAvatar — RogueGame.cs:22186
  DescribeAvatar(a: Actor): string {
    void a;
    throw new Error("not yet ported: DescribeAvatar (RogueGame.cs:22186)");
  }

  // C# AskForReincarnation — RogueGame.cs:22195
  AskForReincarnation(): boolean {
    throw new Error("not yet ported: AskForReincarnation (RogueGame.cs:22195)");
  }

  // C# IsSuitableReincarnation — RogueGame.cs:22243
  IsSuitableReincarnation(a: Actor, asLiving: boolean): boolean {
    void a;
    void asLiving;
    throw new Error("not yet ported: IsSuitableReincarnation (RogueGame.cs:22243)");
  }

  // C# FindReincarnationAvatar — RogueGame.cs:22298
  FindReincarnationAvatar(reincMode: ReincMode, matchingActors: number): { result: Actor; matchingActors: number } {
    void reincMode;
    void matchingActors;
    throw new Error("not yet ported: FindReincarnationAvatar (RogueGame.cs:22298)");
  }

  // C# GenerateInsaneAction — RogueGame.cs:22395
  GenerateInsaneAction(actor: Actor): ActorAction {
    void actor;
    throw new Error("not yet ported: GenerateInsaneAction (RogueGame.cs:22395)");
  }

  // C# SeeingCauseInsanity — RogueGame.cs:22454
  SeeingCauseInsanity(whoDoesTheAction: Actor, loc: Location, sanCost: number, what: string): void {
    const map = loc.map!;
    for (const a of map.actors) {
      if (!a.model.abilities.hasSanity) continue;

      // can't see if sleeping or out of fov.
      if (a.isSleeping) continue;
      const fov = this.m_Rules.actorFOV(a, map.localTime, this.m_Session.weather);
      if (!LOS.canTraceViewLine(map, loc.position, a.location.position, fov)) continue;

      // san hit.
      this.SpendActorSanity(a, sanCost);

      // msg.
      if (whoDoesTheAction === a) {
        if (a.isPlayer)
          this.AddMessage(
            new Message("That was a very disturbing thing to do...", map.localTime.turnCounter, Color.Orange)
          );
        else if (this.IsVisibleToPlayer(a))
          this.AddMessage(this.MakeMessage(a, `${this.Conjugate(a, this.VERB_HAVE)} done something very disturbing...`));
      } else {
        if (a.isPlayer)
          this.AddMessage(
            new Message(`Seeing ${what} is very disturbing...`, map.localTime.turnCounter, Color.Orange)
          );
        else if (this.IsVisibleToPlayer(a))
          this.AddMessage(this.MakeMessage(a, `${this.Conjugate(a, this.VERB_SEE)} something very disturbing...`));
      }
    }
  }

  // C# OnMapPowerGeneratorSwitch — RogueGame.cs:22488
  OnMapPowerGeneratorSwitch(location: Location, powGen: PowerGenerator): void {
    void location;
    void powGen;
    throw new Error("not yet ported: OnMapPowerGeneratorSwitch (RogueGame.cs:22488)");
  }

  // C# CheckForGateClosingCrush — RogueGame.cs:22702
  CheckForGateClosingCrush(gate: MapObject, crushingDamage: number): boolean {
    void gate;
    void crushingDamage;
    throw new Error("not yet ported: CheckForGateClosingCrush (RogueGame.cs:22702)");
  }

  // C# DoOpenSubwayGates — RogueGame.cs:22732
  DoOpenSubwayGates(map: Map): void {
    void map;
    throw new Error("not yet ported: DoOpenSubwayGates (RogueGame.cs:22732)");
  }

  // C# DoCloseSubwayGates — RogueGame.cs:22744
  DoCloseSubwayGates(map: Map): void {
    void map;
    throw new Error("not yet ported: DoCloseSubwayGates (RogueGame.cs:22744)");
  }

  // C# DoOpenPoliceJailCells — RogueGame.cs:22774
  DoOpenPoliceJailCells(map: Map): void {
    void map;
    throw new Error("not yet ported: DoOpenPoliceJailCells (RogueGame.cs:22774)");
  }

  // C# DoClosePoliceJailCells — RogueGame.cs:22786
  DoClosePoliceJailCells(map: Map): void {
    void map;
    throw new Error("not yet ported: DoClosePoliceJailCells (RogueGame.cs:22786)");
  }

  // C# DoHospitalPowerOn — RogueGame.cs:22816
  DoHospitalPowerOn(): void {
    throw new Error("not yet ported: DoHospitalPowerOn (RogueGame.cs:22816)");
  }

  // C# DoHospitalPowerOff — RogueGame.cs:22836
  DoHospitalPowerOff(): void {
    throw new Error("not yet ported: DoHospitalPowerOff (RogueGame.cs:22836)");
  }

  // C# DoTurnAllGeneratorsOn — RogueGame.cs:22875
  DoTurnAllGeneratorsOn(map: Map): void {
    void map;
    throw new Error("not yet ported: DoTurnAllGeneratorsOn (RogueGame.cs:22875)");
  }

  // C# IsInCHAROffice — RogueGame.cs:22892
  IsInCHAROffice(location: Location): boolean {
    void location;
    throw new Error("not yet ported: IsInCHAROffice (RogueGame.cs:22892)");
  }

  // C# IsInCHARProperty — RogueGame.cs:22905
  IsInCHARProperty(location: Location): boolean {
    void location;
    throw new Error("not yet ported: IsInCHARProperty (RogueGame.cs:22905)");
  }

  // C# AreLinkedByPhone — RogueGame.cs:22914
  AreLinkedByPhone(speaker: Actor, target: Actor): boolean {
    void speaker;
    void target;
    throw new Error("not yet ported: AreLinkedByPhone (RogueGame.cs:22914)");
  }

  // C# ListWorldActors — RogueGame.cs:22945
  ListWorldActors(pred: (p0: Actor) => boolean, flags: MapListFlags): Actor[] {
    void pred;
    void flags;
    throw new Error("not yet ported: ListWorldActors (RogueGame.cs:22945)");
  }

  // C# ListDistrictActors — RogueGame.cs:22956
  ListDistrictActors(d: District, flags: MapListFlags, pred: (p0: Actor) => boolean): Actor[] {
    void d;
    void flags;
    void pred;
    throw new Error("not yet ported: ListDistrictActors (RogueGame.cs:22956)");
  }

  // C# FunFactActorResume — RogueGame.cs:22972
  FunFactActorResume(a: Actor, info: string): string {
    void a;
    void info;
    throw new Error("not yet ported: FunFactActorResume (RogueGame.cs:22972)");
  }

  // C# CompileDistrictFunFacts — RogueGame.cs:22980
  CompileDistrictFunFacts(d: District): string[] {
    void d;
    throw new Error("not yet ported: CompileDistrictFunFacts (RogueGame.cs:22980)");
  }

  // C# DEV_ToggleShowActorsStats — RogueGame.cs:23074
  DEV_ToggleShowActorsStats(): void {
    throw new Error("not yet ported: DEV_ToggleShowActorsStats (RogueGame.cs:23074)");
  }

  // C# DEV_TogglePlayerInvincibility — RogueGame.cs:23080
  DEV_TogglePlayerInvincibility(): void {
    throw new Error("not yet ported: DEV_TogglePlayerInvincibility (RogueGame.cs:23080)");
  }

  // C# DEV_MaxTrust — RogueGame.cs:23090
  DEV_MaxTrust(): void {
    throw new Error("not yet ported: DEV_MaxTrust (RogueGame.cs:23090)");
  }

  // C# LoadData — RogueGame.cs:23104
  async LoadData(): Promise<void> {
    await this.LoadDataSkills();
    await this.LoadDataItems();
    await this.LoadDataActors();
  }

  // C# LoadDataActors — RogueGame.cs:23111
  // C# read the model tables from CSVs; the TS data classes build them in their
  // constructors (see GameActors/GameItems/Skills), so there is nothing to load.
  async LoadDataActors(): Promise<void> {
  }

  // C# LoadDataItems — RogueGame.cs:23116
  // C# read the model tables from CSVs; the TS data classes build them in their
  // constructors (see GameActors/GameItems/Skills), so there is nothing to load.
  async LoadDataItems(): Promise<void> {
  }

  // C# LoadDataSkills — RogueGame.cs:23137
  // C# read the model tables from CSVs; the TS data classes build them in their
  // constructors (see GameActors/GameItems/Skills), so there is nothing to load.
  async LoadDataSkills(): Promise<void> {
  }

  // C# UpdateBgMusic — RogueGame.cs:23145
  UpdateBgMusic(): void {
    throw new Error("not yet ported: UpdateBgMusic (RogueGame.cs:23145)");
  }

  // C# AddDevCheatItems — RogueGame.cs:23170
  AddDevCheatItems(): void {
    throw new Error("not yet ported: AddDevCheatItems (RogueGame.cs:23170)");
  }

  // C# AddDevCheatSkills — RogueGame.cs:23205
  AddDevCheatSkills(): void {
    throw new Error("not yet ported: AddDevCheatSkills (RogueGame.cs:23205)");
  }

  // C# AddDevMiscStuff — RogueGame.cs:23215
  AddDevMiscStuff(): void {
    throw new Error("not yet ported: AddDevMiscStuff (RogueGame.cs:23215)");
  }

  // C# DrawTileDev — RogueGame.cs:23226
  DrawTileDev(m: Map, t: Tile, x: number, y: number, toScreen: Point): void {
    void m;
    void t;
    void x;
    void y;
    void toScreen;
    throw new Error("not yet ported: DrawTileDev (RogueGame.cs:23226)");
  }

  // ── camelCase aliases for `game.doXxx()` call sites (Actions.ts) ──────────

  /** camelCase alias for `game.doBarricadeDoor()` — C# `DoBarricadeDoor`. */
  doBarricadeDoor(actor: Actor, door: DoorWindow): void {
    this.DoBarricadeDoor(actor, door);
  }

  /** camelCase alias for `game.doBreak()` — C# `DoBreak`. */
  doBreak(actor: Actor, mapObj: MapObject): void {
    this.DoBreak(actor, mapObj);
  }

  /** camelCase alias for `game.doBuildFortification()` — C# `DoBuildFortification`. */
  doBuildFortification(actor: Actor, buildPos: Point, isLarge: boolean): void {
    this.DoBuildFortification(actor, buildPos, isLarge);
  }

  /** camelCase alias for `game.doChat()` — C# `DoChat`. */
  doChat(speaker: Actor, target: Actor): void {
    this.DoChat(speaker, target);
  }

  /** camelCase alias for `game.doCloseDoor()` — C# `DoCloseDoor`. */
  doCloseDoor(actor: Actor, door: DoorWindow): void {
    this.DoCloseDoor(actor, door);
  }

  /** camelCase alias for `game.doDropItem()` — C# `DoDropItem`. */
  doDropItem(actor: Actor, it: Item): void {
    this.DoDropItem(actor, it);
  }

  /** camelCase alias for `game.doEatCorpse()` — C# `DoEatCorpse`. */
  doEatCorpse(a: Actor, c: Corpse): void {
    this.DoEatCorpse(a, c);
  }

  /** camelCase alias for `game.doEatFoodFromGround()` — C# `DoEatFoodFromGround`. */
  doEatFoodFromGround(actor: Actor, it: Item): void {
    this.DoEatFoodFromGround(actor, it);
  }

  /** camelCase alias for `game.doEquipItem()` — C# `DoEquipItem`. */
  doEquipItem(actor: Actor, it: Item): void {
    this.DoEquipItem(actor, it);
  }

  /** camelCase alias for `game.doLeaveMap()` — C# `DoLeaveMap`. */
  doLeaveMap(actor: Actor, exitPoint: Point, askForConfirmation: boolean): boolean {
    return this.DoLeaveMap(actor, exitPoint, askForConfirmation);
  }

  /** camelCase alias for `game.doMeleeAttack()` — C# `DoMeleeAttack`. */
  doMeleeAttack(attacker: Actor, defender: Actor): void {
    this.DoMeleeAttack(attacker, defender);
  }

  /** camelCase alias for `game.doMoveActor()` — C# `DoMoveActor`. */
  doMoveActor(actor: Actor, direction: Location | Direction): void {
    this.DoMoveActor(actor, direction);
  }

  /** camelCase alias for `game.doOpenDoor()` — C# `DoOpenDoor`. */
  doOpenDoor(actor: Actor, door: DoorWindow): void {
    this.DoOpenDoor(actor, door);
  }

  /** camelCase alias for `game.doPull()` — C# `DoPull`. */
  doPull(actor: Actor, mapObj: MapObject, moveActorToPos: Point): void {
    this.DoPull(actor, mapObj, moveActorToPos);
  }

  /** camelCase alias for `game.doPush()` — C# `DoPush`. */
  doPush(actor: Actor, mapObj: MapObject, toPos: Point): void {
    this.DoPush(actor, mapObj, toPos);
  }

  /** camelCase alias for `game.doRangedAttack()` — C# `DoRangedAttack`. */
  doRangedAttack(attacker: Actor, defender: Actor, LoF: Point[], mode: FireMode): void {
    this.DoRangedAttack(attacker, defender, LoF, mode);
  }

  /** camelCase alias for `game.doRechargeItemBattery()` — C# `DoRechargeItemBattery`. */
  doRechargeItemBattery(actor: Actor, it: Item): void {
    this.DoRechargeItemBattery(actor, it);
  }

  /** camelCase alias for `game.doRepairFortification()` — C# `DoRepairFortification`. */
  doRepairFortification(actor: Actor, fort: Fortification): void {
    this.DoRepairFortification(actor, fort);
  }

  /** camelCase alias for `game.doReviveCorpse()` — C# `DoReviveCorpse`. */
  doReviveCorpse(actor: Actor, corpse: Corpse): void {
    this.DoReviveCorpse(actor, corpse);
  }

  /** camelCase alias for `game.doSay()` — C# `DoSay`. */
  doSay(speaker: Actor, target: Actor, text: string, flags: SayFlags): void {
    this.DoSay(speaker, target, text, flags);
  }

  /** camelCase alias for `game.doShout()` — C# `DoShout`. */
  doShout(speaker: Actor, text: string): void {
    this.DoShout(speaker, text);
  }

  /** camelCase alias for `game.doSprayOdorSuppressor()` — C# `DoSprayOdorSuppressor`. */
  doSprayOdorSuppressor(actor: Actor, suppressor: ItemSprayScent, sprayOn: Actor): void {
    this.DoSprayOdorSuppressor(actor, suppressor, sprayOn);
  }

  /** camelCase alias for `game.doStartDragCorpse()` — C# `DoStartDragCorpse`. */
  doStartDragCorpse(a: Actor, c: Corpse): void {
    this.DoStartDragCorpse(a, c);
  }

  /** camelCase alias for `game.doStartSleeping()` — C# `DoStartSleeping`. */
  doStartSleeping(actor: Actor): void {
    this.DoStartSleeping(actor);
  }

  /** camelCase alias for `game.doStealLead()` — C# `DoStealLead`. */
  doStealLead(actor: Actor, other: Actor): void {
    this.DoStealLead(actor, other);
  }

  /** camelCase alias for `game.doStopDragCorpse()` — C# `DoStopDragCorpse`. */
  doStopDragCorpse(a: Actor, c: Corpse): void {
    this.DoStopDragCorpse(a, c);
  }

  /** camelCase alias for `game.doSwitchPlace()` — C# `DoSwitchPlace`. */
  doSwitchPlace(actor: Actor, other: Actor): void {
    this.DoSwitchPlace(actor, other);
  }

  /** camelCase alias for `game.doSwitchPowerGenerator()` — C# `DoSwitchPowerGenerator`. */
  doSwitchPowerGenerator(actor: Actor, powGen: PowerGenerator): void {
    this.DoSwitchPowerGenerator(actor, powGen);
  }

  /** camelCase alias for `game.doTakeFromContainer()` — C# `DoTakeFromContainer`. */
  doTakeFromContainer(actor: Actor, position: Point): void {
    this.DoTakeFromContainer(actor, position);
  }

  /** camelCase alias for `game.doTakeItem()` — C# `DoTakeItem`. */
  doTakeItem(actor: Actor, position: Point, it: Item): void {
    this.DoTakeItem(actor, position, it);
  }

  /** camelCase alias for `game.doTakeLead()` — C# `DoTakeLead`. */
  doTakeLead(actor: Actor, other: Actor): void {
    this.DoTakeLead(actor, other);
  }

  /** camelCase alias for `game.doThrowGrenadePrimed()` — C# `DoThrowGrenadePrimed`. */
  doThrowGrenadePrimed(actor: Actor, targetPos: Point): void {
    this.DoThrowGrenadePrimed(actor, targetPos);
  }

  /** camelCase alias for `game.doThrowGrenadeUnprimed()` — C# `DoThrowGrenadeUnprimed`. */
  doThrowGrenadeUnprimed(actor: Actor, targetPos: Point): void {
    this.DoThrowGrenadeUnprimed(actor, targetPos);
  }

  /** camelCase alias for `game.doTrade()` — C# `DoTrade`. */
  doTrade(speaker: Actor, target: Actor): void {
    this.DoTrade(speaker, target);
  }

  /** camelCase alias for `game.doUnequipItem()` — C# `DoUnequipItem`. */
  doUnequipItem(actor: Actor, it: Item, canMessage?: boolean): void {
    this.DoUnequipItem(actor, it, canMessage);
  }

  /** camelCase alias for `game.doUseExit()` — C# `DoUseExit`. */
  doUseExit(actor: Actor, exitPoint: Point): boolean {
    return this.DoUseExit(actor, exitPoint);
  }

  /** camelCase alias for `game.doUseItem()` — C# `DoUseItem`. */
  doUseItem(actor: Actor, it: Item): void {
    this.DoUseItem(actor, it);
  }

  /** camelCase alias for `game.doWait()` — C# `DoWait`. */
  doWait(actor: Actor): void {
    this.DoWait(actor);
  }

  UpdatePlayerFOV(player: Actor): void {
    const rawFov = LOS.computeFOVFor(this.m_Rules, player, this.m_Session.worldTime, this.m_Session.world!.weather);
    this.m_PlayerFOV = new Set<Point>();
    for (const key of rawFov) {
      // parse "x,y" to Point
      const parts = key.split(",");
      if (parts.length === 2) {
        this.m_PlayerFOV.add(new Point(parseInt(parts[0], 10), parseInt(parts[1], 10)));
      }
    }
  }

  IsAdjacentToEnemy(map: Map, pos: Point, actor: Actor): boolean {
    const xmin = Math.max(0, pos.x - 1);
    const xmax = Math.min(map.width - 1, pos.x + 1);
    const ymin = Math.max(0, pos.y - 1);
    const ymax = Math.min(map.height - 1, pos.y + 1);

    for (let x = xmin; x <= xmax; x++)
      for (let y = ymin; y <= ymax; y++) {
        if (x === pos.x && y === pos.y)
          continue;
        const other = map.getActorAt(x, y);
        if (other == null)
          continue;
        if (this.m_Rules.areEnemies(actor, other))
          return true;
      }
    return false;
  }
}
