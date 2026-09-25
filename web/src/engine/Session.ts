/**
 * Session-level enums.
 *
 * Ported from src/Engine/Session.cs (the Session class itself is ported later).
 */

export enum GameMode {
  GM_STANDARD,
  GM_CORPSES_INFECTION,
  GM_VINTAGE,
}

export enum ScriptStage {
  STAGE_0,
  STAGE_1,
  STAGE_2,
  STAGE_3,
  STAGE_4,
  STAGE_5,
}

export enum RaidType {
  RAID_BUGS,
  RAID_PRISONERS,
  RAID_BLACKOPS,
  RAID_ARMY,
  _COUNT,
}
