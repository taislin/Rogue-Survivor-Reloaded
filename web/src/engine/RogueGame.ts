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
import { GameMusics } from "@gameplay/GameSounds";
import { OptionsScreen } from "@ui/OptionsScreen";
import { HiScoreTable } from "@engine/HiScoreTable";
import { Keybindings } from "@engine/Keybindings";
import { GameHintsStatus, AdvisorHint } from "@engine/GameHints";
import { GameOptions, Options, ReincMode } from "@engine/GameOptions";
import { PlayerCommand } from "@engine/PlayerCommand";
import { IRogueUI, GameKeyEvent, MouseButton } from "@engine/IRogueUI";
import { TextFile } from "@engine/TextFile";
import { SayFlags } from "@engine/actions/Actions";
import { Item } from "@data/Item";
import { ItemBodyArmor } from "@engine/items/ItemBodyArmor";
import { ItemExplosive } from "@engine/items/ItemExplosive";
import { ItemFood } from "@engine/items/ItemFood";
import { ItemLight } from "@engine/items/ItemLight";
import { ItemMedicine } from "@engine/items/ItemMedicine";
import { ItemTrap } from "@engine/items/ItemTrap";
import { AmmoType, ItemAmmo, ItemWeapon } from "@engine/items/ItemWeapon";
import { ItemBarricadeMaterial, ItemEntertainment, ItemSprayPaint, ItemSprayScent } from "@engine/items/ItemMisc";
import { ItemTracker } from "@engine/items/ItemTracker";
import { MapObject } from "@data/MapObject";
import { DoorWindow, Fortification, PowerGenerator } from "@engine/mapobjects/MapObjects";
import { Actor } from "@data/Actor";
import { ActorModel } from "@data/ActorModel";
import { ActorOrder } from "@data/ActorOrder";
import { FireMode } from "@data/Attack";
import { BlastAttack } from "@data/BlastAttack";
import { ActorAction } from "@data/ActorAction";
import { Corpse } from "@data/Corpse";
import { District, DistrictKind } from "@data/District";
import { DollPart } from "@data/Doll";
import { Faction } from "@data/Faction";
import { Inventory } from "@data/Inventory";
import { Location } from "@data/Location";
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
import { GangID } from "@gameplay/GameGangs";
import { GameItems } from "@gameplay/GameItems";
import { GameTiles } from "@gameplay/GameTiles";
import { SkillID, Skills } from "@gameplay/Skills";
import { BaseTownGenerator, Parameters as TownParameters } from "@gameplay/generators/BaseTownGenerator";
import { StdTownGenerator } from "@gameplay/generators/StdTownGenerator";
import { BaseAI } from "@gameplay/ai/BaseAI";
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
  void width;
  return String(s);
}

/** C# numeric/string format alignment: `{0,-25}` (left aligned). */
export function padRight(s: string | number, width: number): string {
  void width;
  return String(s);
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
  m_DEBUG_prevAiActor!: Actor;
  m_DEBUG_sameAiActorCount!: number;
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

  constructor(UI: IRogueUI) {
    logInit("RogueGame()");

    this.m_UI = UI;
    logInit("creating MusicManager");
    // C# picks MDX/SFML/NullSoundManager (the C# Null implements both sound+music).
    this.m_MusicManager = new NullMusicManager();

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
      this.AdvancePlay(this.m_Session.currentMap!.district!, SimFlags.NOT_SIMULATING);

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
    const maleModel = this.m_GameActors.get(ActorID.MALE_CIVILIAN);
    const femaleModel = this.m_GameActors.get(ActorID.FEMALE_CIVILIAN);

    const menuEntries: string[] = ["*Random*", "Male", "Female"];
    const descs: string[] = [
      "(picks a gender at random for you)",
      `HP:${padLeft(maleModel.startingSheet.baseHitPoints, 2)}  Def:${padLeft(maleModel.startingSheet.baseDefence.value, 2)}  Dmg:${padLeft(maleModel.startingSheet.unarmedAttack.damageValue, 1)}`,
      `HP:${padLeft(femaleModel.startingSheet.baseHitPoints, 2)}  Def:${padLeft(femaleModel.startingSheet.baseDefence.value, 2)}  Dmg:${padLeft(femaleModel.startingSheet.unarmedAttack.damageValue, 1)}`,
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
      `HP:${padLeft(sheet.baseHitPoints, 3)}  Spd:${(m.dollBody.speed / 100).toFixed(2)}` +
      `  Atk:${padLeft(sheet.unarmedAttack.hitValue, 2)}  Def:${padLeft(sheet.baseDefence.value, 2)}` +
      `  Dmg:${padLeft(sheet.unarmedAttack.damageValue, 2)}  FoV:${sheet.baseViewRange.toFixed(1)}` +
      `  Sml:${sheet.baseSmellRating.toFixed(2)}`
    );
  }

  // C# HandleNewCharacterUndeadType — RogueGame.cs:1820
  async HandleNewCharacterUndeadType(
    roller: DiceRoller,
    modelID: ActorID
  ): Promise<{ ok: boolean; modelID: ActorID }> {
    const skeletonModel = this.m_GameActors.get(ActorID.UNDEAD_SKELETON);
    const shamblerModel = this.m_GameActors.get(ActorID.UNDEAD_ZOMBIE);
    const maleModel = this.m_GameActors.get(ActorID.UNDEAD_MALE_ZOMBIFIED);
    const femaleModel = this.m_GameActors.get(ActorID.UNDEAD_FEMALE_ZOMBIFIED);
    const masterModel = this.m_GameActors.get(ActorID.UNDEAD_ZOMBIE_MASTER);

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

    // C# `out GameActors.IDs modelID` — seeded with the caller's value (C# assigns UNDEAD_MALE_ZOMBIFIED).
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
              this.m_UI.UI_DrawStringBold(Color.White, `Type : ${this.m_GameActors.get(model).name}.`, gx, gy);
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
  AdvancePlay(district: District | Map, sim: SimFlags): void {
    void district;
    void sim;
    throw new Error("not yet ported: AdvancePlay (RogueGame.cs:2877)");
  }

  // C# NotifyOrderablesAI — RogueGame.cs:3027
  NotifyOrderablesAI(map: Map, raid: RaidType, position: Point): void {
    void map;
    void raid;
    void position;
    throw new Error("not yet ported: NotifyOrderablesAI (RogueGame.cs:3027)");
  }

  // C# SpendActorActionPoints — RogueGame.cs:3124
  SpendActorActionPoints(actor: Actor, actionCost: number): void {
    void actor;
    void actionCost;
    throw new Error("not yet ported: SpendActorActionPoints (RogueGame.cs:3124)");
  }

  // C# SpendActorStaminaPoints — RogueGame.cs:3130
  SpendActorStaminaPoints(actor: Actor, staminaCost: number): void {
    void actor;
    void staminaCost;
    throw new Error("not yet ported: SpendActorStaminaPoints (RogueGame.cs:3130)");
  }

  // C# RegenActorStaminaPoints — RogueGame.cs:3149
  RegenActorStaminaPoints(actor: Actor, staminaRegen: number): void {
    void actor;
    void staminaRegen;
    throw new Error("not yet ported: RegenActorStaminaPoints (RogueGame.cs:3149)");
  }

  // C# RegenActorHitPoints — RogueGame.cs:3157
  RegenActorHitPoints(actor: Actor, hpRegen: number): void {
    void actor;
    void hpRegen;
    throw new Error("not yet ported: RegenActorHitPoints (RogueGame.cs:3157)");
  }

  // C# RegenActorSleep — RogueGame.cs:3162
  RegenActorSleep(actor: Actor, sleepRegen: number): void {
    void actor;
    void sleepRegen;
    throw new Error("not yet ported: RegenActorSleep (RogueGame.cs:3162)");
  }

  // C# SpendActorSanity — RogueGame.cs:3167
  SpendActorSanity(actor: Actor, sanCost: number): void {
    void actor;
    void sanCost;
    throw new Error("not yet ported: SpendActorSanity (RogueGame.cs:3167)");
  }

  // C# RegenActorSanity — RogueGame.cs:3173
  RegenActorSanity(actor: Actor, sanRegen: number): void {
    void actor;
    void sanRegen;
    throw new Error("not yet ported: RegenActorSanity (RogueGame.cs:3173)");
  }

  // C# NextMapTurn — RogueGame.cs:3178
  NextMapTurn(map: Map, sim: SimFlags): void {
    void map;
    void sim;
    throw new Error("not yet ported: NextMapTurn (RogueGame.cs:3178)");
  }

  // C# DropActorScents — RogueGame.cs:4009
  DropActorScents(actor: Actor): void {
    void actor;
    throw new Error("not yet ported: DropActorScents (RogueGame.cs:4009)");
  }

  // C# DecayActorScents — RogueGame.cs:4029
  DecayActorScents(actor: Actor): void {
    void actor;
    throw new Error("not yet ported: DecayActorScents (RogueGame.cs:4029)");
  }

  // C# ModifyActorTrustInLeader — RogueGame.cs:4040
  ModifyActorTrustInLeader(a: Actor, mod: number, addMessage: boolean): void {
    void a;
    void mod;
    void addMessage;
    throw new Error("not yet ported: ModifyActorTrustInLeader (RogueGame.cs:4040)");
  }

  // C# CountLivings — RogueGame.cs:4056
  CountLivings(map: Map): number {
    void map;
    throw new Error("not yet ported: CountLivings (RogueGame.cs:4056)");
  }

  // C# CountActors — RogueGame.cs:4069
  CountActors(map: Map, predFn: (p0: Actor) => boolean): number {
    void map;
    void predFn;
    throw new Error("not yet ported: CountActors (RogueGame.cs:4069)");
  }

  // C# CountFaction — RogueGame.cs:4082
  CountFaction(map: Map, f: Faction): number {
    void map;
    void f;
    throw new Error("not yet ported: CountFaction (RogueGame.cs:4082)");
  }

  // C# CountUndeads — RogueGame.cs:4095
  CountUndeads(map: Map): number {
    void map;
    throw new Error("not yet ported: CountUndeads (RogueGame.cs:4095)");
  }

  // C# CountFoodItemsNutrition — RogueGame.cs:4108
  CountFoodItemsNutrition(map: Map): number {
    void map;
    throw new Error("not yet ported: CountFoodItemsNutrition (RogueGame.cs:4108)");
  }

  // C# HasActorOfModelID — RogueGame.cs:4142
  HasActorOfModelID(map: Map, actorModelID: ActorID): boolean {
    void map;
    void actorModelID;
    throw new Error("not yet ported: HasActorOfModelID (RogueGame.cs:4142)");
  }

  // C# CheckForEvent_ZombieInvasion — RogueGame.cs:4157
  CheckForEvent_ZombieInvasion(map: Map): boolean {
    void map;
    throw new Error("not yet ported: CheckForEvent_ZombieInvasion (RogueGame.cs:4157)");
  }

  // C# FireEvent_ZombieInvasion — RogueGame.cs:4172
  FireEvent_ZombieInvasion(map: Map): void {
    void map;
    throw new Error("not yet ported: FireEvent_ZombieInvasion (RogueGame.cs:4172)");
  }

  // C# CheckForEvent_SewersInvasion — RogueGame.cs:4194
  CheckForEvent_SewersInvasion(map: Map): boolean {
    void map;
    throw new Error("not yet ported: CheckForEvent_SewersInvasion (RogueGame.cs:4194)");
  }

  // C# FireEvent_SewersInvasion — RogueGame.cs:4213
  FireEvent_SewersInvasion(map: Map): void {
    void map;
    throw new Error("not yet ported: FireEvent_SewersInvasion (RogueGame.cs:4213)");
  }

  // C# CheckForEvent_SubwayInvasion — RogueGame.cs:4228
  CheckForEvent_SubwayInvasion(map: Map): boolean {
    void map;
    throw new Error("not yet ported: CheckForEvent_SubwayInvasion (RogueGame.cs:4228)");
  }

  // C# FireEvent_SubwayInvasion — RogueGame.cs:4243
  FireEvent_SubwayInvasion(map: Map): void {
    void map;
    throw new Error("not yet ported: FireEvent_SubwayInvasion (RogueGame.cs:4243)");
  }

  // C# CheckForEvent_RefugeesWave — RogueGame.cs:4258
  CheckForEvent_RefugeesWave(map: Map): boolean {
    void map;
    throw new Error("not yet ported: CheckForEvent_RefugeesWave (RogueGame.cs:4258)");
  }

  // C# RefugeesEventDistrictFactor — RogueGame.cs:4280
  RefugeesEventDistrictFactor(d: District): number {
    void d;
    throw new Error("not yet ported: RefugeesEventDistrictFactor (RogueGame.cs:4280)");
  }

  // C# FireEvent_RefugeesWave — RogueGame.cs:4292
  FireEvent_RefugeesWave(district: District): void {
    void district;
    throw new Error("not yet ported: FireEvent_RefugeesWave (RogueGame.cs:4292)");
  }

  // C# FireEvent_UniqueActorArrive — RogueGame.cs:4344
  FireEvent_UniqueActorArrive(map: Map, unique: UniqueActor): void {
    void map;
    void unique;
    throw new Error("not yet ported: FireEvent_UniqueActorArrive (RogueGame.cs:4344)");
  }

  // C# PlayUniqueActorMusicAndMessage — RogueGame.cs:4382
  PlayUniqueActorMusicAndMessage(unique: UniqueActor, hasArrived: boolean): void {
    void unique;
    void hasArrived;
    throw new Error("not yet ported: PlayUniqueActorMusicAndMessage (RogueGame.cs:4382)");
  }

  // C# CheckForEvent_NationalGuard — RogueGame.cs:4415
  CheckForEvent_NationalGuard(map: Map): boolean {
    void map;
    throw new Error("not yet ported: CheckForEvent_NationalGuard (RogueGame.cs:4415)");
  }

  // C# FireEvent_NationalGuard — RogueGame.cs:4446
  FireEvent_NationalGuard(map: Map): void {
    void map;
    throw new Error("not yet ported: FireEvent_NationalGuard (RogueGame.cs:4446)");
  }

  // C# CheckForEvent_ArmySupplies — RogueGame.cs:4496
  CheckForEvent_ArmySupplies(map: Map): boolean {
    void map;
    throw new Error("not yet ported: CheckForEvent_ArmySupplies (RogueGame.cs:4496)");
  }

  // C# FireEvent_ArmySupplies — RogueGame.cs:4525
  FireEvent_ArmySupplies(map: Map): void {
    void map;
    throw new Error("not yet ported: FireEvent_ArmySupplies (RogueGame.cs:4525)");
  }

  // C# IsSuitableDropSuppliesPoint — RogueGame.cs:4586
  IsSuitableDropSuppliesPoint(map: Map, x: number, y: number): boolean {
    void map;
    void x;
    void y;
    throw new Error("not yet ported: IsSuitableDropSuppliesPoint (RogueGame.cs:4586)");
  }

  // C# FindDropSuppliesPoint — RogueGame.cs:4617
  FindDropSuppliesPoint(map: Map, dropPoint: Point): { ok: boolean; dropPoint: Point } {
    void map;
    void dropPoint;
    throw new Error("not yet ported: FindDropSuppliesPoint (RogueGame.cs:4617)");
  }

  // C# HasRaidHappenedSince — RogueGame.cs:4643
  HasRaidHappenedSince(raid: RaidType, district: District, mapTime: WorldTime, sinceNTurns: number): boolean {
    void raid;
    void district;
    void mapTime;
    void sinceNTurns;
    throw new Error("not yet ported: HasRaidHappenedSince (RogueGame.cs:4643)");
  }

  // C# CheckForEvent_BikersRaid — RogueGame.cs:4649
  CheckForEvent_BikersRaid(map: Map): boolean {
    void map;
    throw new Error("not yet ported: CheckForEvent_BikersRaid (RogueGame.cs:4649)");
  }

  // C# FireEvent_BikersRaid — RogueGame.cs:4676
  FireEvent_BikersRaid(map: Map): void {
    void map;
    throw new Error("not yet ported: FireEvent_BikersRaid (RogueGame.cs:4676)");
  }

  // C# CheckForEvent_GangstasRaid — RogueGame.cs:4731
  CheckForEvent_GangstasRaid(map: Map): boolean {
    void map;
    throw new Error("not yet ported: CheckForEvent_GangstasRaid (RogueGame.cs:4731)");
  }

  // C# FireEvent_GangstasRaid — RogueGame.cs:4758
  FireEvent_GangstasRaid(map: Map): void {
    void map;
    throw new Error("not yet ported: FireEvent_GangstasRaid (RogueGame.cs:4758)");
  }

  // C# CheckForEvent_BlackOpsRaid — RogueGame.cs:4813
  CheckForEvent_BlackOpsRaid(map: Map): boolean {
    void map;
    throw new Error("not yet ported: CheckForEvent_BlackOpsRaid (RogueGame.cs:4813)");
  }

  // C# FireEvent_BlackOpsRaid — RogueGame.cs:4831
  FireEvent_BlackOpsRaid(map: Map): void {
    void map;
    throw new Error("not yet ported: FireEvent_BlackOpsRaid (RogueGame.cs:4831)");
  }

  // C# CheckForEvent_BandOfSurvivors — RogueGame.cs:4883
  CheckForEvent_BandOfSurvivors(map: Map): boolean {
    void map;
    throw new Error("not yet ported: CheckForEvent_BandOfSurvivors (RogueGame.cs:4883)");
  }

  // C# FireEvent_BandOfSurvivors — RogueGame.cs:4901
  FireEvent_BandOfSurvivors(map: Map): void {
    void map;
    throw new Error("not yet ported: FireEvent_BandOfSurvivors (RogueGame.cs:4901)");
  }

  // C# DistanceToPlayer — RogueGame.cs:4951 (+1 overloads)
  DistanceToPlayer(map: Map, pos: number | Point, y?: number): number {
    void map;
    void pos;
    void y;
    throw new Error("not yet ported: DistanceToPlayer (RogueGame.cs:4951)");
  }

  // C# IsAdjacentToEnemy — RogueGame.cs:4963
  IsAdjacentToEnemy(map: Map, pos: Point, actor: Actor): boolean {
    void map;
    void pos;
    void actor;
    throw new Error("not yet ported: IsAdjacentToEnemy (RogueGame.cs:4963)");
  }

  // C# SpawnActorOnMapBorder — RogueGame.cs:4987
  SpawnActorOnMapBorder(map: Map, actorToSpawn: Actor, minDistToPlayer: number, mustBeOutside: boolean): boolean {
    void map;
    void actorToSpawn;
    void minDistToPlayer;
    void mustBeOutside;
    throw new Error("not yet ported: SpawnActorOnMapBorder (RogueGame.cs:4987)");
  }

  // C# SpawnActorNear — RogueGame.cs:5030
  SpawnActorNear(map: Map, actorToSpawn: Actor, minDistToPlayer: number, nearPoint: Point, maxDistToPoint: number): boolean {
    void map;
    void actorToSpawn;
    void minDistToPlayer;
    void nearPoint;
    void maxDistToPoint;
    throw new Error("not yet ported: SpawnActorNear (RogueGame.cs:5030)");
  }

  // C# SpawnNewUndead — RogueGame.cs:5070
  SpawnNewUndead(map: Map, day: number): void {
    void map;
    void day;
    throw new Error("not yet ported: SpawnNewUndead (RogueGame.cs:5070)");
  }

  // C# SpawnNewSewersUndead — RogueGame.cs:5111
  SpawnNewSewersUndead(map: Map, day: number): void {
    void map;
    void day;
    throw new Error("not yet ported: SpawnNewSewersUndead (RogueGame.cs:5111)");
  }

  // C# SpawnNewSubwayUndead — RogueGame.cs:5124
  SpawnNewSubwayUndead(map: Map, day: number): void {
    void map;
    void day;
    throw new Error("not yet ported: SpawnNewSubwayUndead (RogueGame.cs:5124)");
  }

  // C# SpawnNewRefugee — RogueGame.cs:5138
  SpawnNewRefugee(map: Map): void {
    void map;
    throw new Error("not yet ported: SpawnNewRefugee (RogueGame.cs:5138)");
  }

  // C# SpawnNewSurvivor — RogueGame.cs:5151 (+1 overloads)
  SpawnNewSurvivor(map: Map, bandPos?: Point): Actor {
    void map;
    void bandPos;
    throw new Error("not yet ported: SpawnNewSurvivor (RogueGame.cs:5151)");
  }

  // C# SpawnNewNatGuardLeader — RogueGame.cs:5183
  SpawnNewNatGuardLeader(map: Map): Actor {
    void map;
    throw new Error("not yet ported: SpawnNewNatGuardLeader (RogueGame.cs:5183)");
  }

  // C# SpawnNewNatGuardTrooper — RogueGame.cs:5208
  SpawnNewNatGuardTrooper(map: Map, leaderPos: Point): Actor {
    void map;
    void leaderPos;
    throw new Error("not yet ported: SpawnNewNatGuardTrooper (RogueGame.cs:5208)");
  }

  // C# SpawnNewBikerLeader — RogueGame.cs:5230
  SpawnNewBikerLeader(map: Map, gangId: GangID): Actor {
    void map;
    void gangId;
    throw new Error("not yet ported: SpawnNewBikerLeader (RogueGame.cs:5230)");
  }

  // C# SpawnNewBiker — RogueGame.cs:5255
  SpawnNewBiker(map: Map, gangId: GangID, leaderPos: Point): Actor {
    void map;
    void gangId;
    void leaderPos;
    throw new Error("not yet ported: SpawnNewBiker (RogueGame.cs:5255)");
  }

  // C# SpawnNewGangstaLeader — RogueGame.cs:5275
  SpawnNewGangstaLeader(map: Map, gangId: GangID): Actor {
    void map;
    void gangId;
    throw new Error("not yet ported: SpawnNewGangstaLeader (RogueGame.cs:5275)");
  }

  // C# SpawnNewGangsta — RogueGame.cs:5298
  SpawnNewGangsta(map: Map, gangId: GangID, leaderPos: Point): Actor {
    void map;
    void gangId;
    void leaderPos;
    throw new Error("not yet ported: SpawnNewGangsta (RogueGame.cs:5298)");
  }

  // C# SpawnNewBlackOpsLeader — RogueGame.cs:5317
  SpawnNewBlackOpsLeader(map: Map): Actor {
    void map;
    throw new Error("not yet ported: SpawnNewBlackOpsLeader (RogueGame.cs:5317)");
  }

  // C# SpawnNewBlackOpsTrooper — RogueGame.cs:5345
  SpawnNewBlackOpsTrooper(map: Map, leaderPos: Point): Actor {
    void map;
    void leaderPos;
    throw new Error("not yet ported: SpawnNewBlackOpsTrooper (RogueGame.cs:5345)");
  }

  // C# UpdatePlayerFOV — RogueGame.cs:5368
  UpdatePlayerFOV(player: Actor): void {
    const map = player.location.map;
    if (!map) return;
    const fovKeys = this.m_Rules.computeFOVFor(player, map.localTime, this.m_Session.weather);
    this.m_PlayerFOV.clear();
    for (const key of fovKeys) {
      const parts = key.split(",");
      if (parts.length === 2) {
        this.m_PlayerFOV.add(new Point(parseInt(parts[0], 10), parseInt(parts[1], 10)));
      }
    }
  }

  // C# BotToggleControl — RogueGame.cs:5385
  BotToggleControl(): void {
    throw new Error("not yet ported: BotToggleControl (RogueGame.cs:5385)");
  }

  // C# BotTakeControl — RogueGame.cs:5396
  BotTakeControl(): void {
    throw new Error("not yet ported: BotTakeControl (RogueGame.cs:5396)");
  }

  // C# BotReleaseControl — RogueGame.cs:5432
  BotReleaseControl(): void {
    throw new Error("not yet ported: BotReleaseControl (RogueGame.cs:5432)");
  }

  // C# HandlePlayerActor — RogueGame.cs:5449
  HandlePlayerActor(player: Actor): void {
    void player;
    throw new Error("not yet ported: HandlePlayerActor (RogueGame.cs:5449)");
  }

  // C# TryPlayerInsanity — RogueGame.cs:6090
  TryPlayerInsanity(): boolean {
    throw new Error("not yet ported: TryPlayerInsanity (RogueGame.cs:6090)");
  }

  // C# HandleQuitGame — RogueGame.cs:6113
  HandleQuitGame(): boolean {
    throw new Error("not yet ported: HandleQuitGame (RogueGame.cs:6113)");
  }

  // C# HandleAbandonGame — RogueGame.cs:6128
  HandleAbandonGame(): boolean {
    throw new Error("not yet ported: HandleAbandonGame (RogueGame.cs:6128)");
  }

  // C# HandleScreenshot — RogueGame.cs:6143
  HandleScreenshot(): void {
    throw new Error("not yet ported: HandleScreenshot (RogueGame.cs:6143)");
  }

  // C# DoTakeScreenshot — RogueGame.cs:6164
  DoTakeScreenshot(): string {
    throw new Error("not yet ported: DoTakeScreenshot (RogueGame.cs:6164)");
  }

  // C# HandleHelpMode — RogueGame.cs:6173
  async HandleHelpMode(): Promise<void> {
    throw new Error("not yet ported: HandleHelpMode (RogueGame.cs:6173)");
  }

  // C# HandleHintsScreen — RogueGame.cs:6286
  async HandleHintsScreen(): Promise<void> {
    throw new Error("not yet ported: HandleHintsScreen (RogueGame.cs:6286)");
  }

  // C# HandleMessageLog — RogueGame.cs:6392
  HandleMessageLog(): void {
    throw new Error("not yet ported: HandleMessageLog (RogueGame.cs:6392)");
  }

  // C# HandleCityInfo — RogueGame.cs:6419
  HandleCityInfo(): void {
    throw new Error("not yet ported: HandleCityInfo (RogueGame.cs:6419)");
  }

  // C# HandleMouseLook — RogueGame.cs:6622
  HandleMouseLook(mousePos: Point): boolean {
    void mousePos;
    throw new Error("not yet ported: HandleMouseLook (RogueGame.cs:6622)");
  }

  // C# HandleMouseInventory — RogueGame.cs:6656
  HandleMouseInventory(mousePos: Point, mouseButtons: MouseButton | null, hasDoneAction: boolean): { ok: boolean; hasDoneAction: boolean } {
    void mousePos;
    void mouseButtons;
    void hasDoneAction;
    throw new Error("not yet ported: HandleMouseInventory (RogueGame.cs:6656)");
  }

  // C# MouseToInventoryItem — RogueGame.cs:6698
  MouseToInventoryItem(screen: Point, inv: Inventory, itemPos: Point, iSlot: number): { result: Item; inv: Inventory; itemPos: Point; iSlot: number } {
    void screen;
    void inv;
    void itemPos;
    void iSlot;
    throw new Error("not yet ported: MouseToInventoryItem (RogueGame.cs:6698)");
  }

  // C# OnLMBItem — RogueGame.cs:6734
  OnLMBItem(inv: Inventory, it: Item): boolean {
    void inv;
    void it;
    throw new Error("not yet ported: OnLMBItem (RogueGame.cs:6734)");
  }

  // C# OnRMBItem — RogueGame.cs:6801
  OnRMBItem(inv: Inventory, it: Item): boolean {
    void inv;
    void it;
    throw new Error("not yet ported: OnRMBItem (RogueGame.cs:6801)");
  }

  // C# HandleMouseOverCorpses — RogueGame.cs:6822
  HandleMouseOverCorpses(mousePos: Point, mouseButtons: MouseButton | null, hasDoneAction: boolean): { ok: boolean; hasDoneAction: boolean } {
    void mousePos;
    void mouseButtons;
    void hasDoneAction;
    throw new Error("not yet ported: HandleMouseOverCorpses (RogueGame.cs:6822)");
  }

  // C# MouseToCorpse — RogueGame.cs:6861
  MouseToCorpse(screen: Point, corpsePos: Point): { result: Corpse; corpsePos: Point } {
    void screen;
    void corpsePos;
    throw new Error("not yet ported: MouseToCorpse (RogueGame.cs:6861)");
  }

  // C# OnLMBCorpse — RogueGame.cs:6880
  OnLMBCorpse(c: Corpse): boolean {
    void c;
    throw new Error("not yet ported: OnLMBCorpse (RogueGame.cs:6880)");
  }

  // C# OnRMBCorpse — RogueGame.cs:6912
  OnRMBCorpse(c: Corpse): boolean {
    void c;
    throw new Error("not yet ported: OnRMBCorpse (RogueGame.cs:6912)");
  }

  // C# HandlePlayerEatCorpse — RogueGame.cs:6943
  HandlePlayerEatCorpse(player: Actor, mousePos: Point): boolean {
    void player;
    void mousePos;
    throw new Error("not yet ported: HandlePlayerEatCorpse (RogueGame.cs:6943)");
  }

  // C# HandlePlayerReviveCorpse — RogueGame.cs:6964
  HandlePlayerReviveCorpse(player: Actor, mousePos: Point): boolean {
    void player;
    void mousePos;
    throw new Error("not yet ported: HandlePlayerReviveCorpse (RogueGame.cs:6964)");
  }

  // C# DoStartDragCorpse — RogueGame.cs:6985
  DoStartDragCorpse(a: Actor, c: Corpse): void {
    void a;
    void c;
    throw new Error("not yet ported: DoStartDragCorpse (RogueGame.cs:6985)");
  }

  // C# DoStopDragCorpse — RogueGame.cs:6993
  DoStopDragCorpse(a: Actor, c: Corpse): void {
    void a;
    void c;
    throw new Error("not yet ported: DoStopDragCorpse (RogueGame.cs:6993)");
  }

  // C# DoStopDraggingCorpses — RogueGame.cs:7001
  DoStopDraggingCorpses(a: Actor): void {
    void a;
    throw new Error("not yet ported: DoStopDraggingCorpses (RogueGame.cs:7001)");
  }

  // C# DoButcherCorpse — RogueGame.cs:7009
  DoButcherCorpse(a: Actor, c: Corpse): void {
    void a;
    void c;
    throw new Error("not yet ported: DoButcherCorpse (RogueGame.cs:7009)");
  }

  // C# DoEatCorpse — RogueGame.cs:7036
  DoEatCorpse(a: Actor, c: Corpse): void {
    void a;
    void c;
    throw new Error("not yet ported: DoEatCorpse (RogueGame.cs:7036)");
  }

  // C# DoReviveCorpse — RogueGame.cs:7085
  DoReviveCorpse(actor: Actor, corpse: Corpse): void {
    void actor;
    void corpse;
    throw new Error("not yet ported: DoReviveCorpse (RogueGame.cs:7085)");
  }

  // C# InflictDamageToCorpse — RogueGame.cs:7141
  InflictDamageToCorpse(c: Corpse, dmg: number): void {
    void c;
    void dmg;
    throw new Error("not yet ported: InflictDamageToCorpse (RogueGame.cs:7141)");
  }

  // C# DestroyCorpse — RogueGame.cs:7146
  DestroyCorpse(c: Corpse, m: Map): void {
    void c;
    void m;
    throw new Error("not yet ported: DestroyCorpse (RogueGame.cs:7146)");
  }

  // C# DoPlayerItemSlot — RogueGame.cs:7157
  DoPlayerItemSlot(player: Actor, slot: number, key: GameKeyEvent): boolean {
    void player;
    void slot;
    void key;
    throw new Error("not yet ported: DoPlayerItemSlot (RogueGame.cs:7157)");
  }

  // C# DoPlayerItemSlotUse — RogueGame.cs:7174
  DoPlayerItemSlotUse(player: Actor, slot: number): boolean {
    void player;
    void slot;
    throw new Error("not yet ported: DoPlayerItemSlotUse (RogueGame.cs:7174)");
  }

  // C# DoPlayerItemSlotTake — RogueGame.cs:7236
  DoPlayerItemSlotTake(player: Actor, slot: number): boolean {
    void player;
    void slot;
    throw new Error("not yet ported: DoPlayerItemSlotTake (RogueGame.cs:7236)");
  }

  // C# DoPlayerItemSlotDrop — RogueGame.cs:7269
  DoPlayerItemSlotDrop(player: Actor, slot: number): boolean {
    void player;
    void slot;
    throw new Error("not yet ported: DoPlayerItemSlotDrop (RogueGame.cs:7269)");
  }

  // C# HandlePlayerShout — RogueGame.cs:7295
  HandlePlayerShout(player: Actor, text: string): boolean {
    void player;
    void text;
    throw new Error("not yet ported: HandlePlayerShout (RogueGame.cs:7295)");
  }

  // C# HandlePlayerGiveItem — RogueGame.cs:7308
  HandlePlayerGiveItem(player: Actor, screen: Point): boolean {
    void player;
    void screen;
    throw new Error("not yet ported: HandlePlayerGiveItem (RogueGame.cs:7308)");
  }

  // C# HandlePlayerTradeNegociation — RogueGame.cs:7379
  HandlePlayerTradeNegociation(player: Actor, npc: Actor): boolean {
    void player;
    void npc;
    throw new Error("not yet ported: HandlePlayerTradeNegociation (RogueGame.cs:7379)");
  }

  // C# HandlePlayerNegociateTrade — RogueGame.cs:7663
  HandlePlayerNegociateTrade(player: Actor): boolean {
    void player;
    throw new Error("not yet ported: HandlePlayerNegociateTrade (RogueGame.cs:7663)");
  }

  // C# HandlePlayerRunToggle — RogueGame.cs:7722
  HandlePlayerRunToggle(player: Actor): void {
    void player;
    throw new Error("not yet ported: HandlePlayerRunToggle (RogueGame.cs:7722)");
  }

  // C# HandlePlayerCloseDoor — RogueGame.cs:7736
  HandlePlayerCloseDoor(player: Actor): boolean {
    void player;
    throw new Error("not yet ported: HandlePlayerCloseDoor (RogueGame.cs:7736)");
  }

  // C# HandlePlayerBarricade — RogueGame.cs:7799
  HandlePlayerBarricade(player: Actor): boolean {
    void player;
    throw new Error("not yet ported: HandlePlayerBarricade (RogueGame.cs:7799)");
  }

  // C# HandlePlayerBreak — RogueGame.cs:7885
  HandlePlayerBreak(player: Actor): boolean {
    void player;
    throw new Error("not yet ported: HandlePlayerBreak (RogueGame.cs:7885)");
  }

  // C# HandlePlayerBuildFortification — RogueGame.cs:8003
  HandlePlayerBuildFortification(player: Actor, isLarge: boolean): boolean {
    void player;
    void isLarge;
    throw new Error("not yet ported: HandlePlayerBuildFortification (RogueGame.cs:8003)");
  }

  // C# HandlePlayerFireMode — RogueGame.cs:8074
  HandlePlayerFireMode(player: Actor): boolean {
    void player;
    throw new Error("not yet ported: HandlePlayerFireMode (RogueGame.cs:8074)");
  }

  // C# HandlePlayerMarkEnemies — RogueGame.cs:8199
  HandlePlayerMarkEnemies(player: Actor): void {
    void player;
    throw new Error("not yet ported: HandlePlayerMarkEnemies (RogueGame.cs:8199)");
  }

  // C# HandlePlayerThrowGrenade — RogueGame.cs:8297
  HandlePlayerThrowGrenade(player: Actor): boolean {
    void player;
    throw new Error("not yet ported: HandlePlayerThrowGrenade (RogueGame.cs:8297)");
  }

  // C# HandlePlayerSleep — RogueGame.cs:8413
  HandlePlayerSleep(player: Actor): boolean {
    void player;
    throw new Error("not yet ported: HandlePlayerSleep (RogueGame.cs:8413)");
  }

  // C# HandlePlayerSwitchPlace — RogueGame.cs:8446
  HandlePlayerSwitchPlace(player: Actor): boolean {
    void player;
    throw new Error("not yet ported: HandlePlayerSwitchPlace (RogueGame.cs:8446)");
  }

  // C# HandlePlayerTakeLead — RogueGame.cs:8508
  HandlePlayerTakeLead(player: Actor): boolean {
    void player;
    throw new Error("not yet ported: HandlePlayerTakeLead (RogueGame.cs:8508)");
  }

  // C# HandlePlayerPush — RogueGame.cs:8609
  HandlePlayerPush(player: Actor): boolean {
    void player;
    throw new Error("not yet ported: HandlePlayerPush (RogueGame.cs:8609)");
  }

  // C# HandlePlayerPushObject — RogueGame.cs:8706
  HandlePlayerPushObject(player: Actor, mapObj: MapObject): boolean {
    void player;
    void mapObj;
    throw new Error("not yet ported: HandlePlayerPushObject (RogueGame.cs:8706)");
  }

  // C# HandlePlayerShoveActor — RogueGame.cs:8762
  HandlePlayerShoveActor(player: Actor, other: Actor): boolean {
    void player;
    void other;
    throw new Error("not yet ported: HandlePlayerShoveActor (RogueGame.cs:8762)");
  }

  // C# HandlePlayerPull — RogueGame.cs:8819
  HandlePlayerPull(player: Actor): boolean {
    void player;
    throw new Error("not yet ported: HandlePlayerPull (RogueGame.cs:8819)");
  }

  // C# HandlePlayerPullObject — RogueGame.cs:8921
  HandlePlayerPullObject(player: Actor, mapObj: MapObject): boolean {
    void player;
    void mapObj;
    throw new Error("not yet ported: HandlePlayerPullObject (RogueGame.cs:8921)");
  }

  // C# HandlePlayerPullActor — RogueGame.cs:8978
  HandlePlayerPullActor(player: Actor, other: Actor): boolean {
    void player;
    void other;
    throw new Error("not yet ported: HandlePlayerPullActor (RogueGame.cs:8978)");
  }

  // C# HandlePlayerUseSpray — RogueGame.cs:9034
  HandlePlayerUseSpray(player: Actor): boolean {
    void player;
    throw new Error("not yet ported: HandlePlayerUseSpray (RogueGame.cs:9034)");
  }

  // C# HandlePlayerTag — RogueGame.cs:9070
  HandlePlayerTag(player: Actor): boolean {
    void player;
    throw new Error("not yet ported: HandlePlayerTag (RogueGame.cs:9070)");
  }

  // C# CanTag — RogueGame.cs:9142
  CanTag(map: Map, pos: Point, reason: string): { ok: boolean; reason: string } {
    void map;
    void pos;
    void reason;
    throw new Error("not yet ported: CanTag (RogueGame.cs:9142)");
  }

  // C# HandlePlayerSprayOdorSuppressor — RogueGame.cs:9179
  HandlePlayerSprayOdorSuppressor(player: Actor): boolean {
    void player;
    throw new Error("not yet ported: HandlePlayerSprayOdorSuppressor (RogueGame.cs:9179)");
  }

  // C# StartPlayerWaitLong — RogueGame.cs:9267
  StartPlayerWaitLong(player: Actor): void {
    void player;
    throw new Error("not yet ported: StartPlayerWaitLong (RogueGame.cs:9267)");
  }

  // C# CheckPlayerWaitLong — RogueGame.cs:9282
  CheckPlayerWaitLong(player: Actor): boolean {
    void player;
    throw new Error("not yet ported: CheckPlayerWaitLong (RogueGame.cs:9282)");
  }

  // C# HandlePlayerOrderMode — RogueGame.cs:9322
  HandlePlayerOrderMode(player: Actor): boolean {
    void player;
    throw new Error("not yet ported: HandlePlayerOrderMode (RogueGame.cs:9322)");
  }

  // C# HandlePlayerDirectiveFollower — RogueGame.cs:9437
  HandlePlayerDirectiveFollower(player: Actor, follower: Actor): boolean {
    void player;
    void follower;
    throw new Error("not yet ported: HandlePlayerDirectiveFollower (RogueGame.cs:9437)");
  }

  // C# HandlePlayerOrderFollower — RogueGame.cs:9515
  HandlePlayerOrderFollower(player: Actor, follower: Actor): boolean {
    void player;
    void follower;
    throw new Error("not yet ported: HandlePlayerOrderFollower (RogueGame.cs:9515)");
  }

  // C# HandlePlayerOrderFollowerToBuildFortification — RogueGame.cs:9704
  HandlePlayerOrderFollowerToBuildFortification(player: Actor, follower: Actor, followerFOV: Set<Point>, isLarge: boolean): boolean {
    void player;
    void follower;
    void followerFOV;
    void isLarge;
    throw new Error("not yet ported: HandlePlayerOrderFollowerToBuildFortification (RogueGame.cs:9704)");
  }

  // C# HandlePlayerOrderFollowerToBarricade — RogueGame.cs:9795
  HandlePlayerOrderFollowerToBarricade(player: Actor, follower: Actor, followerFOV: Set<Point>, toTheMax: boolean): boolean {
    void player;
    void follower;
    void followerFOV;
    void toTheMax;
    throw new Error("not yet ported: HandlePlayerOrderFollowerToBarricade (RogueGame.cs:9795)");
  }

  // C# HandlePlayerOrderFollowerToGuard — RogueGame.cs:9897
  HandlePlayerOrderFollowerToGuard(player: Actor, follower: Actor, followerFOV: Set<Point>): boolean {
    void player;
    void follower;
    void followerFOV;
    throw new Error("not yet ported: HandlePlayerOrderFollowerToGuard (RogueGame.cs:9897)");
  }

  // C# HandlePlayerOrderFollowerToPatrol — RogueGame.cs:9988
  HandlePlayerOrderFollowerToPatrol(player: Actor, follower: Actor, followerFOV: Set<Point>): boolean {
    void player;
    void follower;
    void followerFOV;
    throw new Error("not yet ported: HandlePlayerOrderFollowerToPatrol (RogueGame.cs:9988)");
  }

  // C# HandlePlayerOrderFollowerToDropAllItems — RogueGame.cs:10103
  HandlePlayerOrderFollowerToDropAllItems(player: Actor, follower: Actor): boolean {
    void player;
    void follower;
    throw new Error("not yet ported: HandlePlayerOrderFollowerToDropAllItems (RogueGame.cs:10103)");
  }

  // C# HandlePlayerOrderFollowerToReport — RogueGame.cs:10122
  HandlePlayerOrderFollowerToReport(player: Actor, follower: Actor): boolean {
    void player;
    void follower;
    throw new Error("not yet ported: HandlePlayerOrderFollowerToReport (RogueGame.cs:10122)");
  }

  // C# HandlePlayerOrderFollowerToSleep — RogueGame.cs:10131
  HandlePlayerOrderFollowerToSleep(player: Actor, follower: Actor): boolean {
    void player;
    void follower;
    throw new Error("not yet ported: HandlePlayerOrderFollowerToSleep (RogueGame.cs:10131)");
  }

  // C# HandlePlayerOrderFollowerToToggleFollow — RogueGame.cs:10140
  HandlePlayerOrderFollowerToToggleFollow(player: Actor, follower: Actor): boolean {
    void player;
    void follower;
    throw new Error("not yet ported: HandlePlayerOrderFollowerToToggleFollow (RogueGame.cs:10140)");
  }

  // C# HandlePlayerOrderFollowerToReportPosition — RogueGame.cs:10149
  HandlePlayerOrderFollowerToReportPosition(player: Actor, follower: Actor): boolean {
    void player;
    void follower;
    throw new Error("not yet ported: HandlePlayerOrderFollowerToReportPosition (RogueGame.cs:10149)");
  }

  // C# HandlePlayerOrderFollowerToGiveItems — RogueGame.cs:10158
  HandlePlayerOrderFollowerToGiveItems(player: Actor, follower: Actor): boolean {
    void player;
    void follower;
    throw new Error("not yet ported: HandlePlayerOrderFollowerToGiveItems (RogueGame.cs:10158)");
  }

  // C# HandleAiActor — RogueGame.cs:10255
  HandleAiActor(aiActor: Actor): void {
    void aiActor;
    throw new Error("not yet ported: HandleAiActor (RogueGame.cs:10255)");
  }

  // C# HandleAdvisor — RogueGame.cs:10296
  HandleAdvisor(player: Actor): void {
    void player;
    throw new Error("not yet ported: HandleAdvisor (RogueGame.cs:10296)");
  }

  // C# GetAdvisorFirstAvailableHint — RogueGame.cs:10362
  GetAdvisorFirstAvailableHint(): number {
    throw new Error("not yet ported: GetAdvisorFirstAvailableHint (RogueGame.cs:10362)");
  }

  // C# AdvisorGiveHint — RogueGame.cs:10375
  AdvisorGiveHint(hint: AdvisorHint): void {
    void hint;
    throw new Error("not yet ported: AdvisorGiveHint (RogueGame.cs:10375)");
  }

  // C# IsAdvisorHintAppliable — RogueGame.cs:10393
  IsAdvisorHintAppliable(hint: AdvisorHint): boolean {
    void hint;
    throw new Error("not yet ported: IsAdvisorHintAppliable (RogueGame.cs:10393)");
  }

  // C# GetAdvisorHintText — RogueGame.cs:10705
  GetAdvisorHintText(hint: AdvisorHint, title: string, body: string[]): { title: string; body: string[] } {
    void hint;
    void title;
    void body;
    throw new Error("not yet ported: GetAdvisorHintText (RogueGame.cs:10705)");
  }

  // C# ShowAdvisorHint — RogueGame.cs:11201
  ShowAdvisorHint(hint: AdvisorHint): void {
    void hint;
    throw new Error("not yet ported: ShowAdvisorHint (RogueGame.cs:11201)");
  }

  // C# ShowAdvisorMessage — RogueGame.cs:11210
  ShowAdvisorMessage(title: string, lines: string[]): void {
    void title;
    void lines;
    throw new Error("not yet ported: ShowAdvisorMessage (RogueGame.cs:11210)");
  }

  // C# WaitKeyOrMouse — RogueGame.cs:11237
  WaitKeyOrMouse(key: GameKeyEvent, mousePos: Point, mouseButtons: MouseButton | null): { key: GameKeyEvent; mousePos: Point; mouseButtons: MouseButton | null } {
    void key;
    void mousePos;
    void mouseButtons;
    throw new Error("not yet ported: WaitKeyOrMouse (RogueGame.cs:11237)");
  }

  // C# WaitDirectionOrCancel — RogueGame.cs:11270
  WaitDirectionOrCancel(): Direction {
    throw new Error("not yet ported: WaitDirectionOrCancel (RogueGame.cs:11270)");
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
    void key;
    throw new Error("not yet ported: KeyToChoiceNumber (RogueGame.cs:11309)");
  }

  // C# WaitYesOrNo — RogueGame.cs:11358
  async WaitYesOrNo(): Promise<boolean> {
    for (;;) {
      const key = await this.m_UI.UI_WaitKey();
      if (key.key === "y" || key.key === "Y") return true;
      if (key.key === "n" || key.key === "N" || key.key === "Escape") return false;
    }
  }

  // C# DescribeStuffAt — RogueGame.cs:11372
  DescribeStuffAt(map: Map, mapPos: Point): string[] {
    void map;
    void mapPos;
    throw new Error("not yet ported: DescribeStuffAt (RogueGame.cs:11372)");
  }

  // C# DescribeActor — RogueGame.cs:11406
  DescribeActor(actor: Actor): string[] {
    void actor;
    throw new Error("not yet ported: DescribeActor (RogueGame.cs:11406)");
  }

  // C# DescribeActorActivity — RogueGame.cs:11610
  DescribeActorActivity(actor: Actor): string {
    void actor;
    throw new Error("not yet ported: DescribeActorActivity (RogueGame.cs:11610)");
  }

  // C# DescribePlayerFollowerStatus — RogueGame.cs:11663
  DescribePlayerFollowerStatus(follower: Actor): string {
    void follower;
    throw new Error("not yet ported: DescribePlayerFollowerStatus (RogueGame.cs:11663)");
  }

  // C# DescribeMapObject — RogueGame.cs:11677
  DescribeMapObject(obj: MapObject, map: Map, mapPos: Point): string[] {
    void obj;
    void map;
    void mapPos;
    throw new Error("not yet ported: DescribeMapObject (RogueGame.cs:11677)");
  }

  // C# DescribeInventory — RogueGame.cs:11756
  DescribeInventory(inv: Inventory): string[] {
    void inv;
    throw new Error("not yet ported: DescribeInventory (RogueGame.cs:11756)");
  }

  // C# DescribeCorpses — RogueGame.cs:11771
  DescribeCorpses(corpses: Corpse[]): string[] {
    void corpses;
    throw new Error("not yet ported: DescribeCorpses (RogueGame.cs:11771)");
  }

  // C# DescribeCorpseLong — RogueGame.cs:11788
  DescribeCorpseLong(c: Corpse, isInPlayerTile: boolean): string[] {
    void c;
    void isInPlayerTile;
    throw new Error("not yet ported: DescribeCorpseLong (RogueGame.cs:11788)");
  }

  // C# DescribeItemShort — RogueGame.cs:11881
  DescribeItemShort(it: Item): string {
    void it;
    throw new Error("not yet ported: DescribeItemShort (RogueGame.cs:11881)");
  }

  // C# DescribeItemLong — RogueGame.cs:11912
  DescribeItemLong(it: Item, isPlayerInventory: boolean, iSlot: number): string[] {
    void it;
    void isPlayerInventory;
    void iSlot;
    throw new Error("not yet ported: DescribeItemLong (RogueGame.cs:11912)");
  }

  // C# DescribeItemExplosive — RogueGame.cs:12039
  DescribeItemExplosive(ex: ItemExplosive): string[] {
    void ex;
    throw new Error("not yet ported: DescribeItemExplosive (RogueGame.cs:12039)");
  }

  // C# DescribeItemWeapon — RogueGame.cs:12092
  DescribeItemWeapon(w: ItemWeapon): string[] {
    void w;
    throw new Error("not yet ported: DescribeItemWeapon (RogueGame.cs:12092)");
  }

  // C# DescribeAmmoType — RogueGame.cs:12156
  DescribeAmmoType(at: AmmoType): string {
    void at;
    throw new Error("not yet ported: DescribeAmmoType (RogueGame.cs:12156)");
  }

  // C# DescribeItemAmmo — RogueGame.cs:12171
  DescribeItemAmmo(am: ItemAmmo): string[] {
    void am;
    throw new Error("not yet ported: DescribeItemAmmo (RogueGame.cs:12171)");
  }

  // C# DescribeItemFood — RogueGame.cs:12183
  DescribeItemFood(f: ItemFood): string[] {
    void f;
    throw new Error("not yet ported: DescribeItemFood (RogueGame.cs:12183)");
  }

  // C# DescribeItemMedicine — RogueGame.cs:12217
  DescribeItemMedicine(med: ItemMedicine): string[] {
    void med;
    throw new Error("not yet ported: DescribeItemMedicine (RogueGame.cs:12217)");
  }

  // C# DescribeItemBarricadeMaterial — RogueGame.cs:12278
  DescribeItemBarricadeMaterial(bm: ItemBarricadeMaterial): string[] {
    void bm;
    throw new Error("not yet ported: DescribeItemBarricadeMaterial (RogueGame.cs:12278)");
  }

  // C# DescribeItemBodyArmor — RogueGame.cs:12296
  DescribeItemBodyArmor(b: ItemBodyArmor): string[] {
    void b;
    throw new Error("not yet ported: DescribeItemBodyArmor (RogueGame.cs:12296)");
  }

  // C# DescribeItemSprayPaint — RogueGame.cs:12340
  DescribeItemSprayPaint(sp: ItemSprayPaint): string[] {
    void sp;
    throw new Error("not yet ported: DescribeItemSprayPaint (RogueGame.cs:12340)");
  }

  // C# DescribeItemSprayScent — RogueGame.cs:12357
  DescribeItemSprayScent(sp: ItemSprayScent): string[] {
    void sp;
    throw new Error("not yet ported: DescribeItemSprayScent (RogueGame.cs:12357)");
  }

  // C# DescribeItemLight — RogueGame.cs:12380
  DescribeItemLight(lt: ItemLight): string[] {
    void lt;
    throw new Error("not yet ported: DescribeItemLight (RogueGame.cs:12380)");
  }

  // C# DescribeItemTracker — RogueGame.cs:12397
  DescribeItemTracker(tr: ItemTracker): string[] {
    void tr;
    throw new Error("not yet ported: DescribeItemTracker (RogueGame.cs:12397)");
  }

  // C# DescribeItemTrap — RogueGame.cs:12430
  DescribeItemTrap(tr: ItemTrap): string[] {
    void tr;
    throw new Error("not yet ported: DescribeItemTrap (RogueGame.cs:12430)");
  }

  // C# DescribeItemEntertainment — RogueGame.cs:12480
  DescribeItemEntertainment(ent: ItemEntertainment): string[] {
    void ent;
    throw new Error("not yet ported: DescribeItemEntertainment (RogueGame.cs:12480)");
  }

  // C# DescribeBatteries — RogueGame.cs:12499
  DescribeBatteries(batteries: number, maxBatteries: number): string {
    void batteries;
    void maxBatteries;
    throw new Error("not yet ported: DescribeBatteries (RogueGame.cs:12499)");
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
      case Weather.CLEAR: return Color.Yellow;
      case Weather.CLOUDY: return Color.Gray;
      case Weather.RAIN: return Color.Cyan;
      case Weather.HEAVY_RAIN: return Color.Blue;
      default: return Color.White;
    }
  }

  // C# BatteriesToHours — RogueGame.cs:12623
  BatteriesToHours(batteries: number): number {
    return Math.floor(batteries / WorldTime.TURNS_PER_HOUR);
  }

  // C# FoodToHoursUntilHungry — RogueGame.cs:12628
  FoodToHoursUntilHungry(food: number): number {
    return Math.floor(food / (Rules.FOOD_BASE_POINTS / 24));
  }

  // C# FoodToHoursUntilRotHungry — RogueGame.cs:12636
  FoodToHoursUntilRotHungry(food: number): number {
    return Math.floor(food / (Rules.FOOD_BASE_POINTS / 24));
  }

  // C# IsAlmostHungry — RogueGame.cs:12644
  IsAlmostHungry(actor: Actor): boolean {
    return actor.foodPoints < Rules.FOOD_HUNGRY_LEVEL;
  }

  // C# IsAlmostRotHungry — RogueGame.cs:12651
  IsAlmostRotHungry(actor: Actor): boolean {
    return actor.foodPoints < Rules.ROT_HUNGRY_LEVEL;
  }

  // C# CommandToDirection — RogueGame.cs:12660
  CommandToDirection(cmd: PlayerCommand): Direction {
    void cmd;
    throw new Error("not yet ported: CommandToDirection (RogueGame.cs:12660)");
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
  DoShout(speaker: Actor, text: string): void {
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
  KillActor(killer: Actor, deadGuy: Actor, reason: string, canDropCorpse?: boolean): void {
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
  PlayerDied(killer: Actor, reason: string): void {
    void killer;
    void reason;
    throw new Error("not yet ported: PlayerDied (RogueGame.cs:16789)");
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
  HandlePostMortem(): void {
    throw new Error("not yet ported: HandlePostMortem (RogueGame.cs:16888)");
  }

  // C# OnNewNight — RogueGame.cs:17240
  OnNewNight(): void {
    throw new Error("not yet ported: OnNewNight (RogueGame.cs:17240)");
  }

  // C# OnNewDay — RogueGame.cs:17285
  OnNewDay(): void {
    throw new Error("not yet ported: OnNewDay (RogueGame.cs:17285)");
  }

  // C# HandlePlayerDecideUpgrade — RogueGame.cs:17377
  HandlePlayerDecideUpgrade(upgradeActor: Actor): void {
    void upgradeActor;
    throw new Error("not yet ported: HandlePlayerDecideUpgrade (RogueGame.cs:17377)");
  }

  // C# HandlePlayerFollowersUpgrade — RogueGame.cs:17483
  HandlePlayerFollowersUpgrade(): void {
    throw new Error("not yet ported: HandlePlayerFollowersUpgrade (RogueGame.cs:17483)");
  }

  // C# HandleLivingNPCsUpgrade — RogueGame.cs:17503
  HandleLivingNPCsUpgrade(map: Map): void {
    void map;
    throw new Error("not yet ported: HandleLivingNPCsUpgrade (RogueGame.cs:17503)");
  }

  // C# HandleNPCSkillUpgrade — RogueGame.cs:17523
  HandleNPCSkillUpgrade(a: Actor): void {
    void a;
    throw new Error("not yet ported: HandleNPCSkillUpgrade (RogueGame.cs:17523)");
  }

  // C# HandleUndeadNPCsUpgrade — RogueGame.cs:17533
  HandleUndeadNPCsUpgrade(map: Map): void {
    void map;
    throw new Error("not yet ported: HandleUndeadNPCsUpgrade (RogueGame.cs:17533)");
  }

  // C# RollSkillsToUpgrade — RogueGame.cs:17563
  RollSkillsToUpgrade(actor: Actor, maxTries: number): SkillID[] {
    void actor;
    void maxTries;
    throw new Error("not yet ported: RollSkillsToUpgrade (RogueGame.cs:17563)");
  }

  // C# NPCPickSkillToUpgrade — RogueGame.cs:17586
  NPCPickSkillToUpgrade(npc: Actor, chooseFrom: SkillID[]): SkillID | null {
    void npc;
    void chooseFrom;
    throw new Error("not yet ported: NPCPickSkillToUpgrade (RogueGame.cs:17586)");
  }

  // C# NPCSkillUtility — RogueGame.cs:17610
  NPCSkillUtility(actor: Actor, skID: SkillID): number {
    void actor;
    void skID;
    throw new Error("not yet ported: NPCSkillUtility (RogueGame.cs:17610)");
  }

  // C# RollRandomSkillToUpgrade — RogueGame.cs:17757
  RollRandomSkillToUpgrade(actor: Actor, maxTries: number): SkillID | null {
    void actor;
    void maxTries;
    throw new Error("not yet ported: RollRandomSkillToUpgrade (RogueGame.cs:17757)");
  }

  // C# DoLooseRandomSkill — RogueGame.cs:17776
  DoLooseRandomSkill(actor: Actor): void {
    void actor;
    throw new Error("not yet ported: DoLooseRandomSkill (RogueGame.cs:17776)");
  }

  // C# SkillUpgrade — RogueGame.cs:17793
  SkillUpgrade(actor: Actor, id: SkillID): Skill {
    void actor;
    void id;
    throw new Error("not yet ported: SkillUpgrade (RogueGame.cs:17793)");
  }

  // C# OnSkillUpgrade — RogueGame.cs:17802
  OnSkillUpgrade(actor: Actor, id: SkillID): void {
    void actor;
    void id;
    throw new Error("not yet ported: OnSkillUpgrade (RogueGame.cs:17802)");
  }

  // C# ChangeWeather — RogueGame.cs:17817
  ChangeWeather(): void {
    throw new Error("not yet ported: ChangeWeather (RogueGame.cs:17817)");
  }

  // C# PlayerKill — RogueGame.cs:17881
  PlayerKill(victim: Actor): void {
    void victim;
    throw new Error("not yet ported: PlayerKill (RogueGame.cs:17881)");
  }

  // C# InfectActor — RogueGame.cs:17889
  InfectActor(actor: Actor, addInfection: number): void {
    void actor;
    void addInfection;
    throw new Error("not yet ported: InfectActor (RogueGame.cs:17889)");
  }

  // C# Zombify — RogueGame.cs:17901
  Zombify(zombifier: Actor, deadVictim: Actor, isStartingGame: boolean): Actor {
    void zombifier;
    void deadVictim;
    void isStartingGame;
    throw new Error("not yet ported: Zombify (RogueGame.cs:17901)");
  }

  // C# ZombifySkill — RogueGame.cs:17942
  ZombifySkill(skill: SkillID): SkillID | null {
    void skill;
    throw new Error("not yet ported: ZombifySkill (RogueGame.cs:17942)");
  }

  // C# ApplyOnFire — RogueGame.cs:17963
  ApplyOnFire(mapObj: MapObject): void {
    void mapObj;
    throw new Error("not yet ported: ApplyOnFire (RogueGame.cs:17963)");
  }

  // C# UnapplyOnFire — RogueGame.cs:17975
  UnapplyOnFire(mapObj: MapObject): void {
    void mapObj;
    throw new Error("not yet ported: UnapplyOnFire (RogueGame.cs:17975)");
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
    void o;
    throw new Error("not yet ported: AddOverlay (RogueGame.cs:19573)");
  }

  // C# ClearOverlays — RogueGame.cs:19581
  ClearOverlays(): void {
    throw new Error("not yet ported: ClearOverlays (RogueGame.cs:19581)");
  }

  // C# RemoveOverlay — RogueGame.cs:19589
  RemoveOverlay(o: Overlay): void {
    void o;
    throw new Error("not yet ported: RemoveOverlay (RogueGame.cs:19589)");
  }

  // C# HasOverlay — RogueGame.cs:19598
  HasOverlay(o: Overlay): boolean {
    void o;
    throw new Error("not yet ported: HasOverlay (RogueGame.cs:19598)");
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
  IsVisibleToPlayer(actor: Location | Map | Actor | MapObject, position?: Point): boolean {
    void actor;
    void position;
    throw new Error("not yet ported: IsVisibleToPlayer (RogueGame.cs:19658)");
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
  FindLongestLine(lines: string[]): number {
    void lines;
    throw new Error("not yet ported: FindLongestLine (RogueGame.cs:19702)");
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
  DeleteSavedGame(saveName: string): void {
    void saveName;
    throw new Error("not yet ported: DeleteSavedGame (RogueGame.cs:19809)");
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
  GetUserNewGraveyardName(): string {
    throw new Error("not yet ported: GetUserNewGraveyardName (RogueGame.cs:20021)");
  }

  // C# GraveFilePath — RogueGame.cs:20037
  GraveFilePath(graveName: string): string {
    void graveName;
    throw new Error("not yet ported: GraveFilePath (RogueGame.cs:20037)");
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
  StopSimThread(abort: boolean): void {
    void abort;
    throw new Error("not yet ported: StopSimThread (RogueGame.cs:21501)");
  }

  // C# SimThreadProc — RogueGame.cs:21550
  SimThreadProc(): void {
    throw new Error("not yet ported: SimThreadProc (RogueGame.cs:21550)");
  }

  // C# ShowNewAchievement — RogueGame.cs:21597
  ShowNewAchievement(id: AchievementIDs): void {
    void id;
    throw new Error("not yet ported: ShowNewAchievement (RogueGame.cs:21597)");
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
    void whoDoesTheAction;
    void loc;
    void sanCost;
    void what;
    throw new Error("not yet ported: SeeingCauseInsanity (RogueGame.cs:22454)");
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
}
