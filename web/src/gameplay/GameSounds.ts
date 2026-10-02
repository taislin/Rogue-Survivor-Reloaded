import { BASE_URL } from "@engine/BaseUrl";

/**
 * The sound-effect ids: the fork's 181 `GameSounds.cs` pairs, less `NIGHTMARE`
 * (which both versions declare verbatim and the port already had), plus the two
 * Classic effects the fork replaced outright.
 *
 * The fork's block below is transcribed by `scripts/port-game-sounds.py` from the
 * C# and is not hand-edited; the two files are compared by
 * `tests/extended-audio.test.ts` against a committed fixture of the C#'s own text,
 * in both directions and in declaration order. The three Classic effects above the
 * block are the port's own and are deliberately *not* in the generated run --
 * `NIGHTMARE` because both versions declare it verbatim, `UNDEAD_EAT` and
 * `UNDEAD_RISE` because the fork replaced them with a per-distance-tier pair and
 * dropped them from the table entirely.
 *
 * ## A pair per id, and a call site wants the id
 *
 * The C# hands `m_SFXManager` an **id** and keeps the file name in a `*_FILE`
 * companion constant, loading both at startup (`RogueGame.cs:5278-5458`). The port
 * resolves the file at play time instead -- one fetch per effect, no preload
 * manifest -- so it declares both halves and `SOUND_FILES` is the map between them.
 * A call site should pass the **id**, never the `*_FILE`, and that is a correctness
 * rule rather than a style one.
 *
 * `AssetPaths.soundPath` answers an id out of `SOUND_FILES` and appends `.ogg`, but
 * its already-resolved pass-through calls `withOgg`, which only *replaces* an
 * extension and adds none. The C#'s `*_FILE` constants carry no extension, so a
 * `_FILE` comes back extension-less and the fetch 404s. `ambientPath` hit this
 * first and has a second helper for it -- `asOgg`, whose own comment says the
 * sibling helpers "have been fine" because a music id never arrives that way. A
 * sound id can: `RogueGame.ts:19274` and `:19276` are the two call sites in `src/`
 * that do, which is why the shield-block effect has been *wired and silent* since
 * it landed, and why `tests/extended-audio-soundfiles.test.ts` exists.
 *
 * ## The table is not a claim about wiring
 *
 * Every id the C# declares is declared, tabled and on disk. **68 of the fork's 180
 * are played**, and the other 112 are here because the reference declares them, not
 * because anything reaches them: two centralised methods in `RogueGame.ts` account
 * for 62 of the 68 -- `PlayRangedWeaponSFX` reads 46 and `PlayBashOrBreakSFX` 16 --
 * and six are individual call sites. Two of those six are also ungated, which is the
 * second half of what the same test pins.
 *
 * The distance model the `_nearby`/`_far` suffixes imply is the reason the feature
 * was built table-first rather than call-site-first
 * (plans/BROWSER_PORT_PLAN.md §5.6f item 4), and `tests/extended-audio.test.ts` is
 * where the remaining call sites are tracked.
 */
export class GameSounds {
  // Prefixed with the deployment base, not a literal: see engine/BaseUrl.ts.
  static readonly PATH = `${BASE_URL}assets/sfx/`;

  // The three vanilla ids, and the only three that still exist in the C#'s
  // table. The fork replaced two of them with a per-distance-tier matrix and left
  // `NIGHTMARE` alone, so these are Classic's sound set and the fork's is
  // everything below: `UNDEAD_EAT` is the fork's `UNDEAD_EAT_PLAYER` /
  // `UNDEAD_EAT_NEARBY` pair and `UNDEAD_RISE` is not in `GameSounds.cs` at all
  // (plans/BROWSER_PORT_PLAN §5.6f item 2).
  static readonly UNDEAD_EAT = "undead eat";
  static readonly UNDEAD_EAT_FILE = `${GameSounds.PATH}sfx - undead eat`;

  static readonly UNDEAD_RISE = "undead rise";
  static readonly UNDEAD_RISE_FILE = `${GameSounds.PATH}sfx - undead rise`;

  // C# spells the file "sfx - nightmare" for this id too, and both versions
  // carry the pair unchanged — but not the same *bytes*: the fork's copy is a
  // 132 kB encode of a 63 kB file, and Classic ships the smaller one, so
  // `scripts/port-game-sounds.py` skips the pair rather than re-encoding an
  // asset Classic already plays.
  static readonly NIGHTMARE = "nightmare";
  static readonly NIGHTMARE_FILE = `${GameSounds.PATH}sfx - nightmare`;

  // C# GameSounds.cs:14: vanilla SFX
  static readonly UNDEAD_EAT_PLAYER = "player undead eats";
  static readonly UNDEAD_EAT_PLAYER_FILE = `${GameSounds.PATH}sfx - undead eat player`;

  // @@MP (Release 2), added rapid-fire (Release 6-6) (GameSounds.cs:23)
  static readonly PISTOL_SINGLE_SHOT_PLAYER = "player fires pistol";
  static readonly PISTOL_SINGLE_SHOT_PLAYER_FILE = `${GameSounds.PATH}pistol_single-shot_player`;
  static readonly PISTOL_RAPID_FIRE_PLAYER = "player fires pistol burst";
  static readonly PISTOL_RAPID_FIRE_PLAYER_FILE = `${GameSounds.PATH}pistol_rapid-fire_player`;
  static readonly HUNTING_RIFLE_FIRE_PLAYER = "player fires hunting rifle";
  static readonly HUNTING_RIFLE_FIRE_PLAYER_FILE = `${GameSounds.PATH}huntingrifle_player`;
  static readonly SHOTGUN_FIRE_PLAYER = "player fires shotgun";
  static readonly SHOTGUN_FIRE_PLAYER_FILE = `${GameSounds.PATH}shotgun-a2_player`;
  static readonly CROSSBOW_FIRE_PLAYER = "player fires crossbow";
  static readonly CROSSBOW_FIRE_PLAYER_FILE = `${GameSounds.PATH}crossbow_player`;
  static readonly REVOLVER_SINGLE_SHOT_PLAYER = "player fires revolver";
  static readonly REVOLVER_SINGLE_SHOT_PLAYER_FILE = `${GameSounds.PATH}revolver_single-shot_player`;
  static readonly REVOLVER_RAPID_FIRE_PLAYER = "player fires revolver rounds";
  static readonly REVOLVER_RAPID_FIRE_PLAYER_FILE = `${GameSounds.PATH}revolver_rapid-fire_player`;
  static readonly PRECISION_RIFLE_FIRE_PLAYER = "player fires precision rifle";
  static readonly PRECISION_RIFLE_FIRE_PLAYER_FILE = `${GameSounds.PATH}precision_rifle_player`;
  static readonly ARMY_RIFLE_SINGLE_SHOT_PLAYER = "player fires army rifle";
  static readonly ARMY_RIFLE_SINGLE_SHOT_PLAYER_FILE = `${GameSounds.PATH}army_rifle_single-shot_player`;
  static readonly ARMY_RIFLE_RAPID_FIRE_PLAYER = "player fires army rifle burst";
  static readonly ARMY_RIFLE_RAPID_FIRE_PLAYER_FILE = `${GameSounds.PATH}army_rifle_rapid-fire_player`;
  static readonly SMG_SINGLE_SHOT_PLAYER = "player fires SMG";
  static readonly SMG_SINGLE_SHOT_PLAYER_FILE = `${GameSounds.PATH}SMG_single-shot_player`;
  static readonly SMG_RAPID_FIRE_PLAYER = "player fires SMG burst";
  static readonly SMG_RAPID_FIRE_PLAYER_FILE = `${GameSounds.PATH}SMG_rapid-fire_player`;
  static readonly MINIGUN_RAPID_FIRE_PLAYER = "player fires minigun burst";
  static readonly MINIGUN_RAPID_FIRE_PLAYER_FILE = `${GameSounds.PATH}minigun_rapid-fire_player`;
  static readonly GRENADE_LAUNCHER_SINGLE_SHOT_PLAYER = "player fires grenade launcher";
  static readonly GRENADE_LAUNCHER_SINGLE_SHOT_PLAYER_FILE = `${GameSounds.PATH}grenade_launcher_single-shot_player`;
  static readonly BIO_FORCE_GUN_PLAYER = "player fires bio force gun";
  static readonly BIO_FORCE_GUN_PLAYER_FILE = `${GameSounds.PATH}bio_force_gun_player`;
  static readonly PISTOL_SINGLE_SHOT_NEARBY = "pistol firing nearby";
  static readonly PISTOL_SINGLE_SHOT_NEARBY_FILE = `${GameSounds.PATH}pistol_single-shot_nearby`;
  static readonly PISTOL_RAPID_FIRE_NEARBY = "pistol shots nearby";
  static readonly PISTOL_RAPID_FIRE_NEARBY_FILE = `${GameSounds.PATH}pistol_rapid-fire_nearby`;
  static readonly HUNTING_RIFLE_FIRE_NEARBY = "hunting rifle firing nearby";
  static readonly HUNTING_RIFLE_FIRE_NEARBY_FILE = `${GameSounds.PATH}huntingrifle_nearby`;
  static readonly SHOTGUN_FIRE_NEARBY = "shotgun firing nearby";
  static readonly SHOTGUN_FIRE_NEARBY_FILE = `${GameSounds.PATH}shotgun-a2_nearby`;
  static readonly CROSSBOW_FIRE_NEARBY = "crossbow firing nearby";
  static readonly CROSSBOW_FIRE_NEARBY_FILE = `${GameSounds.PATH}crossbow_nearby`;
  static readonly REVOLVER_SINGLE_SHOT_NEARBY = "revolver firing nearby";
  static readonly REVOLVER_SINGLE_SHOT_NEARBY_FILE = `${GameSounds.PATH}revolver_single-shot_nearby`;
  static readonly REVOLVER_RAPID_FIRE_NEARBY = "revolver shots nearby";
  static readonly REVOLVER_RAPID_FIRE_NEARBY_FILE = `${GameSounds.PATH}revolver_rapid-fire_nearby`;
  static readonly PRECISION_RIFLE_FIRE_NEARBY = "precision rifle firing nearby";
  static readonly PRECISION_RIFLE_FIRE_NEARBY_FILE = `${GameSounds.PATH}precision_rifle_nearby`;
  static readonly ARMY_RIFLE_SINGLE_SHOT_NEARBY = "army rifle firing nearby";
  static readonly ARMY_RIFLE_SINGLE_SHOT_NEARBY_FILE = `${GameSounds.PATH}army_rifle_single-shot_nearby`;
  static readonly ARMY_RIFLE_RAPID_FIRE_NEARBY = "army rifle burst nearby";
  static readonly ARMY_RIFLE_RAPID_FIRE_NEARBY_FILE = `${GameSounds.PATH}army_rifle_rapid-fire_nearby`;
  static readonly SMG_SINGLE_SHOT_NEARBY = "SMG firing nearby";
  static readonly SMG_SINGLE_SHOT_NEARBY_FILE = `${GameSounds.PATH}SMG_single-shot_nearby`;
  static readonly SMG_RAPID_FIRE_NEARBY = "SMG burst nearby";
  static readonly SMG_RAPID_FIRE_NEARBY_FILE = `${GameSounds.PATH}SMG_rapid-fire_nearby`;
  static readonly MINIGUN_RAPID_FIRE_NEARBY = "minigun burst nearby";
  static readonly MINIGUN_RAPID_FIRE_NEARBY_FILE = `${GameSounds.PATH}minigun_rapid-fire_nearby`;
  static readonly GRENADE_LAUNCHER_SINGLE_SHOT_NEARBY = "grenade launcher firing nearby";
  static readonly GRENADE_LAUNCHER_SINGLE_SHOT_NEARBY_FILE = `${GameSounds.PATH}grenade_launcher_single-shot_nearby`;
  static readonly PISTOL_SINGLE_SHOT_FAR = "pistol firing somewhere";
  static readonly PISTOL_SINGLE_SHOT_FAR_FILE = `${GameSounds.PATH}pistol_single-shot_far`;
  static readonly PISTOL_RAPID_FIRE_FAR = "pistol shots somewhere";
  static readonly PISTOL_RAPID_FIRE_FAR_FILE = `${GameSounds.PATH}pistol_rapid-fire_far`;
  static readonly HUNTING_RIFLE_FIRE_FAR = "hunting rifle firing somewhere";
  static readonly HUNTING_RIFLE_FIRE_FAR_FILE = `${GameSounds.PATH}huntingrifle_far`;
  static readonly SHOTGUN_FIRE_FAR = "shotgun firing somewhere";
  static readonly SHOTGUN_FIRE_FAR_FILE = `${GameSounds.PATH}shotgun-a2_far`;
  static readonly REVOLVER_SINGLE_SHOT_FAR = "revolver firing somewhere";
  static readonly REVOLVER_SINGLE_SHOT_FAR_FILE = `${GameSounds.PATH}revolver_single-shot_far`;
  static readonly REVOLVER_RAPID_FIRE_FAR = "revolver shots somewhere";
  static readonly REVOLVER_RAPID_FIRE_FAR_FILE = `${GameSounds.PATH}revolver_rapid-fire_far`;
  static readonly PRECISION_RIFLE_FIRE_FAR = "precision rifle firing somewhere";
  static readonly PRECISION_RIFLE_FIRE_FAR_FILE = `${GameSounds.PATH}precision_rifle_far`;
  static readonly ARMY_RIFLE_SINGLE_SHOT_FAR = "army rifle firing somewhere";
  static readonly ARMY_RIFLE_SINGLE_SHOT_FAR_FILE = `${GameSounds.PATH}army_rifle_single-shot_far`;
  static readonly ARMY_RIFLE_RAPID_FIRE_FAR = "army rifle burst somewhere";
  static readonly ARMY_RIFLE_RAPID_FIRE_FAR_FILE = `${GameSounds.PATH}army_rifle_rapid-fire_far`;
  static readonly SMG_SINGLE_SHOT_FAR = "SMG firing somewhere";
  static readonly SMG_SINGLE_SHOT_FAR_FILE = `${GameSounds.PATH}SMG_single-shot_far`;
  static readonly SMG_RAPID_FIRE_FAR = "SMG burst somewhere";
  static readonly SMG_RAPID_FIRE_FAR_FILE = `${GameSounds.PATH}SMG_rapid-fire_far`;
  static readonly MINIGUN_RAPID_FIRE_FAR = "minigun burst somewhere";
  static readonly MINIGUN_RAPID_FIRE_FAR_FILE = `${GameSounds.PATH}minigun_rapid-fire_far`;
  static readonly MELEE_ATTACK_PLAYER = "player does melee attack";
  static readonly MELEE_ATTACK_PLAYER_FILE = `${GameSounds.PATH}melee_attack_player`;
  static readonly MELEE_ATTACK_NEARBY = "melee attack nearby";
  static readonly MELEE_ATTACK_NEARBY_FILE = `${GameSounds.PATH}melee_attack_nearby`;
  static readonly MELEE_ATTACK_MISS_PLAYER = "player misses melee attack";
  static readonly MELEE_ATTACK_MISS_PLAYER_FILE = `${GameSounds.PATH}melee_attack_miss_player`;
  static readonly MELEE_ATTACK_MISS_NEARBY = "missed melee attack nearby";
  static readonly MELEE_ATTACK_MISS_NEARBY_FILE = `${GameSounds.PATH}melee_attack_miss_nearby`;
  static readonly ARMOR_ZIPPER = "zips armor";
  static readonly ARMOR_ZIPPER_FILE = `${GameSounds.PATH}zipper`;
  static readonly EQUIP_GUN_PLAYER = "equips gun";
  static readonly EQUIP_GUN_PLAYER_FILE = `${GameSounds.PATH}equip_gun_player`;
  static readonly TORCH_CLICK_PLAYER = "clicks torch";
  static readonly TORCH_CLICK_PLAYER_FILE = `${GameSounds.PATH}torch_click_player`;
  static readonly CLIMB_FENCE_PLAYER = "climbing fence";
  static readonly CLIMB_FENCE_PLAYER_FILE = `${GameSounds.PATH}climb_fence_player`;
  static readonly CLIMB_FENCE_NEARBY = "climbing fence nearby";
  static readonly CLIMB_FENCE_NEARBY_FILE = `${GameSounds.PATH}climb_fence_nearby`;
  static readonly CLIMB_CAR_PLAYER = "climbing on car";
  static readonly CLIMB_CAR_PLAYER_FILE = `${GameSounds.PATH}jump_on_car_player`;
  static readonly CLIMB_CAR_NEARBY = "climbing on car nearby";
  static readonly CLIMB_CAR_NEARBY_FILE = `${GameSounds.PATH}jump_on_car_nearby`;
  static readonly SPRAY_SCENT = "sprays scent";
  static readonly SPRAY_SCENT_FILE = `${GameSounds.PATH}spray_scent`;
  static readonly SPRAY_TAG = "sprays tag";
  static readonly SPRAY_TAG_FILE = `${GameSounds.PATH}spray_tag`;
  static readonly EAT_FOOD = "eats food";
  static readonly EAT_FOOD_FILE = `${GameSounds.PATH}eat_food`;
  static readonly VOMIT_PLAYER = "vomits";
  static readonly VOMIT_PLAYER_FILE = `${GameSounds.PATH}vomit_player`;
  static readonly GLASS_DOOR = "opening glass door";
  static readonly GLASS_DOOR_FILE = `${GameSounds.PATH}glass_door`;
  static readonly WOODEN_DOOR_OPEN = "opening wooden door";
  static readonly WOODEN_DOOR_OPEN_FILE = `${GameSounds.PATH}wooden_door_open`;
  static readonly WOODEN_DOOR_CLOSE = "closing wooden door";
  static readonly WOODEN_DOOR_CLOSE_FILE = `${GameSounds.PATH}wooden_door_close`;
  static readonly USE_MEDICINE = "uses medicine";
  static readonly USE_MEDICINE_FILE = `${GameSounds.PATH}medicine`;
  static readonly USE_PILLS = "uses pills";
  static readonly USE_PILLS_FILE = `${GameSounds.PATH}pills`;
  static readonly SCREAM_NEARBY_01 = "scream nearby 01";
  static readonly SCREAM_NEARBY_01_FILE = `${GameSounds.PATH}scream_nearby_01`;
  static readonly SCREAM_NEARBY_02 = "scream nearby 02";
  static readonly SCREAM_NEARBY_02_FILE = `${GameSounds.PATH}scream_nearby_02`;
  static readonly SCREAM_NEARBY_03 = "scream nearby 03";
  static readonly SCREAM_NEARBY_03_FILE = `${GameSounds.PATH}scream_nearby_03`;
  static readonly SCREAM_NEARBY_04 = "scream nearby 04";
  static readonly SCREAM_NEARBY_04_FILE = `${GameSounds.PATH}scream_nearby_04`;
  static readonly SCREAM_NEARBY_05 = "scream nearby 05";
  static readonly SCREAM_NEARBY_05_FILE = `${GameSounds.PATH}scream_nearby_05`;

  // @@MP (Release 7-4) (GameSounds.cs:173)
  // C# GameSounds.cs:172: 06 was removed. too low quality
  static readonly SCREAM_NEARBY_07 = "scream nearby 07";
  static readonly SCREAM_NEARBY_07_FILE = `${GameSounds.PATH}scream_nearby_07`;
  static readonly SCREAM_NEARBY_08 = "scream nearby 08";
  static readonly SCREAM_NEARBY_08_FILE = `${GameSounds.PATH}scream_nearby_08`;
  static readonly SCREAM_NEARBY_09 = "scream nearby 09";
  static readonly SCREAM_NEARBY_09_FILE = `${GameSounds.PATH}scream_nearby_09`;
  static readonly SCREAM_FAR_01 = "scream far 01";
  static readonly SCREAM_FAR_01_FILE = `${GameSounds.PATH}scream_far_01`;
  static readonly SCREAM_FAR_02 = "scream far 02";
  static readonly SCREAM_FAR_02_FILE = `${GameSounds.PATH}scream_far_02`;
  static readonly SCREAM_FAR_03 = "scream far 03";
  static readonly SCREAM_FAR_03_FILE = `${GameSounds.PATH}scream_far_03`;
  static readonly SCREAM_FAR_04 = "scream far 04";
  static readonly SCREAM_FAR_04_FILE = `${GameSounds.PATH}scream_far_04`;
  static readonly SCREAM_FAR_05 = "scream far 05";
  static readonly SCREAM_FAR_05_FILE = `${GameSounds.PATH}scream_far_05`;
  // C# GameSounds.cs:190: 06 was removed. too low quality
  static readonly SCREAM_FAR_07 = "scream far 07";
  static readonly SCREAM_FAR_07_FILE = `${GameSounds.PATH}scream_far_07`;
  static readonly SCREAM_FAR_08 = "scream far 08";
  static readonly SCREAM_FAR_08_FILE = `${GameSounds.PATH}scream_far_08`;
  static readonly SCREAM_FAR_09 = "scream far 09";
  static readonly SCREAM_FAR_09_FILE = `${GameSounds.PATH}scream_far_09`;

  // @@MP (Release 3) (GameSounds.cs:199)
  static readonly BASH_WOOD_PLAYER = "bash something wooden";
  static readonly BASH_WOOD_PLAYER_FILE = `${GameSounds.PATH}bash_wood_player`;
  static readonly BASH_WOOD_NEARBY = "something wooden bashed nearby";
  static readonly BASH_WOOD_NEARBY_FILE = `${GameSounds.PATH}bash_wood_nearby`;
  static readonly TURN_PAGE = "turns page";
  static readonly TURN_PAGE_FILE = `${GameSounds.PATH}turn_page`;
  static readonly UNDEAD_EAT_NEARBY = "nearby undead eats";
  static readonly UNDEAD_EAT_NEARBY_FILE = `${GameSounds.PATH}sfx - undead eat nearby`;
  static readonly VOMIT_NEARBY = "vomits nearby";
  static readonly VOMIT_NEARBY_FILE = `${GameSounds.PATH}vomit_nearby`;
  static readonly SHOVE_PLAYER = "shoves actor";
  static readonly SHOVE_PLAYER_FILE = `${GameSounds.PATH}shove_player`;
  static readonly SHOVE_NEARBY = "actor shoved nearby";
  static readonly SHOVE_NEARBY_FILE = `${GameSounds.PATH}shove_nearby`;
  static readonly PUSH_METAL_OBJECT_VISIBLE = "pushes visible metal object";
  static readonly PUSH_METAL_OBJECT_VISIBLE_FILE = `${GameSounds.PATH}push_metal_object_visible`;
  static readonly PUSH_METAL_OBJECT_AUDIBLE = "pushes audible metal object";
  static readonly PUSH_METAL_OBJECT_AUDIBLE_FILE = `${GameSounds.PATH}push_metal_object_audible`;
  static readonly BUILDING_PLAYER = "player constructs something";
  static readonly BUILDING_PLAYER_FILE = `${GameSounds.PATH}building_player`;
  static readonly BUILDING_NEARBY = "nearby construction";
  static readonly BUILDING_NEARBY_FILE = `${GameSounds.PATH}building_nearby`;
  static readonly CAN_TRAP_PLAYER = "player steps on can";
  static readonly CAN_TRAP_PLAYER_FILE = `${GameSounds.PATH}can_trap_player`;
  static readonly BEAR_TRAP_PLAYER = "player triggers bear trap";
  static readonly BEAR_TRAP_PLAYER_FILE = `${GameSounds.PATH}bear_trap_player`;
  static readonly SPIKE_TRAP = "player steps on spikes";
  static readonly SPIKE_TRAP_FILE = `${GameSounds.PATH}spike_trap`;
  static readonly BARBED_WIRE_TRAP_PLAYER = "player in barbed wire";
  static readonly BARBED_WIRE_TRAP_PLAYER_FILE = `${GameSounds.PATH}barbed_wire_player`;
  static readonly CAN_TRAP_NEARBY = "can trap nearby";
  static readonly CAN_TRAP_NEARBY_FILE = `${GameSounds.PATH}can_trap_nearby`;
  static readonly BEAR_TRAP_NEARBY = "bear trap nearby";
  static readonly BEAR_TRAP_NEARBY_FILE = `${GameSounds.PATH}bear_trap_nearby`;
  static readonly CAN_TRAP_FAR = "can trap somewhere";
  static readonly CAN_TRAP_FAR_FILE = `${GameSounds.PATH}can_trap_far`;
  static readonly BEAR_TRAP_FAR = "bear trap somewhere";
  static readonly BEAR_TRAP_FAR_FILE = `${GameSounds.PATH}bear_trap_far`;

  // @@MP (Release 4) (GameSounds.cs:248)
  static readonly DYNAMITE_VISIBLE = "dynamite explosion";
  static readonly DYNAMITE_VISIBLE_FILE = `${GameSounds.PATH}dynamite_visible`;
  static readonly DYNAMITE_AUDIBLE = "dynamite explosion nearby";
  static readonly DYNAMITE_AUDIBLE_FILE = `${GameSounds.PATH}dynamite_audible`;
  static readonly GRENADE_VISIBLE = "grenade explosion";
  static readonly GRENADE_VISIBLE_FILE = `${GameSounds.PATH}grenade_visible`;
  static readonly GRENADE_AUDIBLE = "grenade explosion nearby";
  static readonly GRENADE_AUDIBLE_FILE = `${GameSounds.PATH}grenade_audible`;
  static readonly MOLOTOV_VISIBLE = "molotov explosion";
  static readonly MOLOTOV_VISIBLE_FILE = `${GameSounds.PATH}molotov_visible`;
  static readonly MOLOTOV_AUDIBLE = "molotov explosion nearby";
  static readonly MOLOTOV_AUDIBLE_FILE = `${GameSounds.PATH}molotov_audible`;
  static readonly SMOKING = "player smokes";
  static readonly SMOKING_FILE = `${GameSounds.PATH}smoking`;
  static readonly ROLLER_DOOR = "roller door";
  static readonly ROLLER_DOOR_FILE = `${GameSounds.PATH}roller_door`;

  // @@MP (Release 5-1) (GameSounds.cs:270)
  static readonly NAIL_GUN = "player fires nail gun";
  static readonly NAIL_GUN_FILE = `${GameSounds.PATH}nail_gun`;

  // @@MP (Release 5-3) (GameSounds.cs:274)
  static readonly BREAK_WOODENDOOR_PLAYER = "break wooden door";
  static readonly BREAK_WOODENDOOR_PLAYER_FILE = `${GameSounds.PATH}break_woodendoor_player`;
  static readonly BREAK_WOODENDOOR_NEARBY = "wooden door breaks nearby";
  static readonly BREAK_WOODENDOOR_NEARBY_FILE = `${GameSounds.PATH}break_woodendoor_nearby`;
  static readonly BREAK_GLASSDOOR_PLAYER = "break glass door";
  static readonly BREAK_GLASSDOOR_PLAYER_FILE = `${GameSounds.PATH}break_glassdoor_player`;
  static readonly BREAK_GLASSDOOR_NEARBY = "glass door breaks nearby";
  static readonly BREAK_GLASSDOOR_NEARBY_FILE = `${GameSounds.PATH}break_glassdoor_nearby`;

  // @@MP (Release 5-4) (GameSounds.cs:284)
  static readonly BREAK_METALDOOR_PLAYER = "break metal door";
  static readonly BREAK_METALDOOR_PLAYER_FILE = `${GameSounds.PATH}break_metaldoor_player`;
  static readonly BREAK_METALDOOR_NEARBY = "metal door breaks nearby";
  static readonly BREAK_METALDOOR_NEARBY_FILE = `${GameSounds.PATH}break_metaldoor_nearby`;
  static readonly BREAK_CERAMIC_VISIBLE = "something ceramic breaks";
  static readonly BREAK_CERAMIC_VISIBLE_FILE = `${GameSounds.PATH}break_ceramic_visible`;
  static readonly BASH_OTHER_OBJECTS_PLAYER = "player bashes other object";
  static readonly BASH_OTHER_OBJECTS_PLAYER_FILE = `${GameSounds.PATH}bash_other_objects_player`;
  static readonly BASH_OTHER_OBJECTS_NEARBY = "bash other objects nearby";
  static readonly BASH_OTHER_OBJECTS_NEARBY_FILE = `${GameSounds.PATH}bash_other_objects_nearby`;
  static readonly BASH_CERAMIC_VISIBLE = "something ceramic is bashed";
  static readonly BASH_CERAMIC_VISIBLE_FILE = `${GameSounds.PATH}bash_ceramic_visible`;
  static readonly BASH_METALDOOR_PLAYER = "bash metal door";
  static readonly BASH_METALDOOR_PLAYER_FILE = `${GameSounds.PATH}bash_metaldoor_player`;
  static readonly BASH_METALDOOR_NEARBY = "metal door bashed nearby";
  static readonly BASH_METALDOOR_NEARBY_FILE = `${GameSounds.PATH}bash_metaldoor_nearby`;
  static readonly PUSH_WOODEN_OBJECT_VISIBLE = "pushes visible wooden object";
  static readonly PUSH_WOODEN_OBJECT_VISIBLE_FILE = `${GameSounds.PATH}push_wooden_object_visible`;
  static readonly PUSH_WOODEN_OBJECT_AUDIBLE = "pushes audible wooden object";
  static readonly PUSH_WOODEN_OBJECT_AUDIBLE_FILE = `${GameSounds.PATH}push_wooden_object_audible`;

  // @@MP relocated from music to sfx (Release 6-1) (GameSounds.cs:306)
  static readonly REINCARNATE = "reincarnate";
  static readonly REINCARNATE_FILE = `${GameSounds.PATH}RS - Reincarnate`;

  // @@MP (Release 6-2) (GameSounds.cs:310)
  static readonly NIGHT_VISION = "night vision";
  static readonly NIGHT_VISION_FILE = `${GameSounds.PATH}night_vision`;

  // @@MP (Release 6-3) (GameSounds.cs:314)
  static readonly ACCESS_DENIED = "access denied";
  static readonly ACCESS_DENIED_FILE = `${GameSounds.PATH}access_denied`;
  static readonly ACCESS_GRANTED = "access granted";
  static readonly ACCESS_GRANTED_FILE = `${GameSounds.PATH}access_granted`;

  // @@MP (Release 6-4) (GameSounds.cs:320)
  static readonly ACHIEVEMENT = "achievement";
  static readonly ACHIEVEMENT_FILE = `${GameSounds.PATH}achievement`;

  // @@MP (Release 6-6) (GameSounds.cs:324)
  static readonly FLASHBANG_VISIBLE = "flashbang explosion";
  static readonly FLASHBANG_VISIBLE_FILE = `${GameSounds.PATH}flashbang_visible`;
  static readonly FLASHBANG_AUDIBLE = "flashbang explosion nearby";
  static readonly FLASHBANG_AUDIBLE_FILE = `${GameSounds.PATH}flashbang_audible`;
  static readonly DRINK = "drinks";
  static readonly DRINK_FILE = `${GameSounds.PATH}drink`;
  static readonly DIG_GROUND = "dig ground";
  static readonly DIG_GROUND_FILE = `${GameSounds.PATH}dig_ground`;
  static readonly PLACE_TRAP = "places trap";
  static readonly PLACE_TRAP_FILE = `${GameSounds.PATH}place_trap`;
  static readonly MAKE_MOLOTOV = "makes molotov";
  static readonly MAKE_MOLOTOV_FILE = `${GameSounds.PATH}make_molotov`;
  static readonly MALE_HURT = "male hurt";
  static readonly MALE_HURT_FILE = `${GameSounds.PATH}male_hurt`;
  static readonly FEMALE_HURT = "female hurt";
  static readonly FEMALE_HURT_FILE = `${GameSounds.PATH}female_hurt`;

  // @@MP (Release 7-1) (GameSounds.cs:343)
  static readonly CHAINSAW_PLAYER = "player uses chainsaw";
  static readonly CHAINSAW_PLAYER_FILE = `${GameSounds.PATH}chainsaw_player`;
  static readonly CHAINSAW_NEARBY = "chainsaw used nearby";
  static readonly CHAINSAW_NEARBY_FILE = `${GameSounds.PATH}chainsaw_nearby`;
  static readonly CHAINSAW_FAR = "chainsaw used somewhere";
  static readonly CHAINSAW_FAR_FILE = `${GameSounds.PATH}chainsaw_far`;
  static readonly FLAMETHROWER_VISIBLE = "flamethrower burst";
  static readonly FLAMETHROWER_VISIBLE_FILE = `${GameSounds.PATH}flamethrower_visible`;
  static readonly FLAMETHROWER_AUDIBLE = "flamethrower burst nearby";
  static readonly FLAMETHROWER_AUDIBLE_FILE = `${GameSounds.PATH}flamethrower_audible`;
  static readonly FUEL_CAN_VISIBLE = "fuel can explosion";
  static readonly FUEL_CAN_VISIBLE_FILE = `${GameSounds.PATH}fuel_can_visible`;
  static readonly FUEL_CAN_AUDIBLE = "fuel can explosion nearby";
  static readonly FUEL_CAN_AUDIBLE_FILE = `${GameSounds.PATH}fuel_can_audible`;
  static readonly FUEL_PUMP_VISIBLE = "fuel pump explosion";
  static readonly FUEL_PUMP_VISIBLE_FILE = `${GameSounds.PATH}fuel_pump_visible`;
  static readonly FUEL_PUMP_AUDIBLE = "fuel pump explosion nearby";
  static readonly FUEL_PUMP_AUDIBLE_FILE = `${GameSounds.PATH}fuel_pump_audible`;
  static readonly GLOWSTICK = "lights glowstick";
  static readonly GLOWSTICK_FILE = `${GameSounds.PATH}glowstick`;
  static readonly FLARE = "lights flare";
  static readonly FLARE_FILE = `${GameSounds.PATH}flare`;
  static readonly EQUIP = "equips";
  static readonly EQUIP_FILE = `${GameSounds.PATH}equip`;

  // @@MP (Release 7-2) (GameSounds.cs:374)
  static readonly SHIELD_BLOCK_PLAYER = "player uses shield";
  static readonly SHIELD_BLOCK_PLAYER_FILE = `${GameSounds.PATH}shield_block_player`;
  static readonly SHIELD_BLOCK_NEARBY = "shield used nearby";
  static readonly SHIELD_BLOCK_NEARBY_FILE = `${GameSounds.PATH}shield_block_nearby`;
  static readonly SMOKE_GRENADE = "smoke grenade burst";
  static readonly SMOKE_GRENADE_FILE = `${GameSounds.PATH}smoke_grenade`;
  static readonly STUN_GUN_PLAYER = "player fires stun gun";
  static readonly STUN_GUN_PLAYER_FILE = `${GameSounds.PATH}stun_gun_player`;
  static readonly STUN_GUN_NEARBY = "stun gun fired nearby";
  static readonly STUN_GUN_NEARBY_FILE = `${GameSounds.PATH}stun_gun_nearby`;
  static readonly DOG_BARK_NEARBY = "dog barks nearby";
  static readonly DOG_BARK_NEARBY_FILE = `${GameSounds.PATH}dog_bark_nearby`;
  static readonly DOG_BARK_FAR = "dog barks somewhere";
  static readonly DOG_BARK_FAR_FILE = `${GameSounds.PATH}dog_bark_far`;
  static readonly DOG_FLEE = "dog flees";
  static readonly DOG_FLEE_FILE = `${GameSounds.PATH}dog_yips`;
  static readonly DOG_GROWL = "dog growls";
  static readonly DOG_GROWL_FILE = `${GameSounds.PATH}dog_growl`;
  static readonly RAT_SCREECH = "rat screeches";
  static readonly RAT_SCREECH_FILE = `${GameSounds.PATH}rat_screech`;
  static readonly SEWERS_THING_GROWL = "sewers thing growl";
  static readonly SEWERS_THING_GROWL_FILE = `${GameSounds.PATH}sewers_thing_growl`;
  static readonly SKELETON_GROWL = "skeleton growls";
  static readonly SKELETON_GROWL_FILE = `${GameSounds.PATH}skeleton_growl`;
  static readonly SHAMBLER_GROWL = "shambler growls";
  static readonly SHAMBLER_GROWL_FILE = `${GameSounds.PATH}shambler_growl`;
  static readonly ZOMBIE_MASTER_GROWL = "zombie master growls";
  static readonly ZOMBIE_MASTER_GROWL_FILE = `${GameSounds.PATH}zombie_master_growl`;
  static readonly ZOMBIFIED_GROAN = "zombified groans";
  static readonly ZOMBIFIED_GROAN_FILE = `${GameSounds.PATH}zombified_groan`;
  static readonly PSST_WHISPER = "whisper";
  static readonly PSST_WHISPER_FILE = `${GameSounds.PATH}psst2`;
  static readonly MALE_SHOUT_PLAYER = "male player shouts";
  static readonly MALE_SHOUT_PLAYER_FILE = `${GameSounds.PATH}male_shout_player`;
  static readonly MALE_SHOUT_NEARBY = "man nearby shouts";
  static readonly MALE_SHOUT_NEARBY_FILE = `${GameSounds.PATH}male_shout_nearby`;
  static readonly FEMALE_SHOUT_PLAYER = "female player shouts";
  static readonly FEMALE_SHOUT_PLAYER_FILE = `${GameSounds.PATH}female_shout_player`;
  static readonly FEMALE_SHOUT_NEARBY = "woman nearby shouts";
  static readonly FEMALE_SHOUT_NEARBY_FILE = `${GameSounds.PATH}female_shout_nearby`;

  // @@MP (Release 7-4) (GameSounds.cs:418)
  static readonly METAL_DOOR_OPEN = "opening metal door";
  static readonly METAL_DOOR_OPEN_FILE = `${GameSounds.PATH}metal_door_open`;
  static readonly METAL_DOOR_CLOSE = "closing metal door";
  static readonly METAL_DOOR_CLOSE_FILE = `${GameSounds.PATH}metal_door_close`;

  // @@MP (Release 7-6) (GameSounds.cs:424)
  static readonly FISHING_CAST_PLAYER = "fishing cast";
  static readonly FISHING_CAST_PLAYER_FILE = `${GameSounds.PATH}fishing_cast_player`;
  static readonly FISHING_CAST_NEARBY = "fishing cast nearby";
  static readonly FISHING_CAST_NEARBY_FILE = `${GameSounds.PATH}fishing_cast_nearby`;
  static readonly FISHING_REEL_PLAYER = "fishing reel";
  static readonly FISHING_REEL_PLAYER_FILE = `${GameSounds.PATH}fishing_reel_player`;
  static readonly FISHING_REEL_NEARBY = "fishing reel nearby";
  static readonly FISHING_REEL_NEARBY_FILE = `${GameSounds.PATH}fishing_reel_nearby`;
  static readonly COOKING_SIZZLE_PLAYER = "cooking sizzle";
  static readonly COOKING_SIZZLE_PLAYER_FILE = `${GameSounds.PATH}cooking_sizzle_player`;
  static readonly COOKING_SIZZLE_NEARBY = "cooking sizzle nearby";
  static readonly COOKING_SIZZLE_NEARBY_FILE = `${GameSounds.PATH}cooking_sizzle_nearby`;
  static readonly FIRE_EXTINGUISHER_PLAYER = "fire extinguisher";
  static readonly FIRE_EXTINGUISHER_PLAYER_FILE = `${GameSounds.PATH}fire_extinguisher_player`;
  static readonly FIRE_EXTINGUISHER_NEARBY = "fire extinguisher nearby";
  static readonly FIRE_EXTINGUISHER_NEARBY_FILE = `${GameSounds.PATH}fire_extinguisher_nearby`;
  static readonly MATCH_STRIKE_START_FIRE_PLAYER = "matches start fire";
  static readonly MATCH_STRIKE_START_FIRE_PLAYER_FILE = `${GameSounds.PATH}match_strike_start_fire_player`;
  static readonly EQUIP_BFG_PLAYER = "equips BFG";
  static readonly EQUIP_BFG_PLAYER_FILE = `${GameSounds.PATH}equip_BFG_player`;
  static readonly PLASMA_BURST_VISIBLE = "plasma burst";
  static readonly PLASMA_BURST_VISIBLE_FILE = `${GameSounds.PATH}plasma_burst_visible`;
  static readonly PLASMA_BURST_AUDIBLE = "plasma burst nearby";
  static readonly PLASMA_BURST_AUDIBLE_FILE = `${GameSounds.PATH}plasma_burst_audible`;

  // @@MP (Release 8-2) (GameSounds.cs:450)
  static readonly OPEN_BACKPACK = "opens backpack";
  static readonly OPEN_BACKPACK_FILE = `${GameSounds.PATH}open_backpack`;
}

export class GameMusics {
  static readonly PATH = `${BASE_URL}assets/music/`;

  static readonly ARMY = "army";
  static readonly ARMY_FILE = `${GameMusics.PATH}RS - Army`;

  static readonly BIGBEAR_THEME_SONG = "big bear theme song";
  static readonly BIGBEAR_THEME_SONG_FILE = `${GameMusics.PATH}RS - Big Bear Theme Song`;

  static readonly BIKER = "biker";
  static readonly BIKER_FILE = `${GameMusics.PATH}RS - Biker`;

  // Still Alive, Release 8-1. `Feature.CHARResearchRaid`'s two raid tracks.
  // Unlike every other entry, these file names carry no "RS - " prefix: the fork
  // ships them under their bare names and they are copied in as-is.
  static readonly BLACK_OPS = "black ops";
  static readonly BLACK_OPS_FILE = `${GameMusics.PATH}Black Ops`;

  static readonly CHAR_RESEARCHERS = "char researchers";
  static readonly CHAR_RESEARCHERS_FILE = `${GameMusics.PATH}RS - CHAR researchers`;

  static readonly CHAR_UNDERGROUND_FACILITY = "char underground facility";
  static readonly CHAR_UNDERGROUND_FACILITY_FILE = `${GameMusics.PATH}RS - CUF`;

  static readonly DUCKMAN_THEME_SONG = "duckman theme song";
  static readonly DUCKMAN_THEME_SONG_FILE = `${GameMusics.PATH}RS - Duckman Theme Song`;

  static readonly FAMU_FATARU_THEME_SONG = "famu fataru theme song";
  static readonly FAMU_FATARU_THEME_SONG_FILE = `${GameMusics.PATH}RS - Famu Fataru Theme Song`;

  static readonly FIGHT = "fight";
  static readonly FIGHT_FILE = `${GameMusics.PATH}RS - Fight`;

  static readonly GANGSTA = "gangsta";
  static readonly GANGSTA_FILE = `${GameMusics.PATH}RS - Gangsta`;

  static readonly HANS_VON_HANZ_THEME_SONG = "hans von hanz theme song";
  static readonly HANS_VON_HANZ_THEME_SONG_FILE = `${GameMusics.PATH}RS - Hans von Hanz Theme Song`;

  static readonly HEYTHERE = "heythere";
  static readonly HEYTHERE_FILE = `${GameMusics.PATH}RS - Hey There`;

  static readonly HOSPITAL = "hospital";
  static readonly HOSPITAL_FILE = `${GameMusics.PATH}RS - Hospital`;

  static readonly INSANE = "insane";
  static readonly INSANE_FILE = `${GameMusics.PATH}RS - Insane`;

  static readonly INTERLUDE = "interlude";
  static readonly INTERLUDE_FILE = `${GameMusics.PATH}RS - Interlude - Loop`;

  static readonly INTRO = "intro";
  static readonly INTRO_FILE = `${GameMusics.PATH}RS - Intro`;

  static readonly LIMBO = "limbo";
  static readonly LIMBO_FILE = `${GameMusics.PATH}RS - Limbo`;

  static readonly PLAYER_DEATH = "playerdeath";
  // C# GameMusics.cs spells it "RS - Post Mortem"; the shipped file is "RS - Post mortem".
  static readonly PLAYER_DEATH_FILE = `${GameMusics.PATH}RS - Post mortem`;

  static readonly REINCARNATE = "reincarnate";
  static readonly REINCARNATE_FILE = `${GameMusics.PATH}RS - Reincarnate`;

  static readonly ROGUEDJACK_THEME_SONG = "roguedjack theme song";
  static readonly ROGUEDJACK_THEME_SONG_FILE = `${GameMusics.PATH}RS - Roguedjack Theme Song`;

  static readonly SANTAMAN_THEME_SONG = "santaman theme song";
  static readonly SANTAMAN_THEME_SONG_FILE = `${GameMusics.PATH}RS - Santaman Theme Song`;

  static readonly SEWERS = "sewers";
  static readonly SEWERS_FILE = `${GameMusics.PATH}RS - Sewers`;

  // Still Alive, Release 8-1. The mall the CHAR research raid lands in, alongside
  // `BLACK_OPS`. No "RS - " prefix here either.
  static readonly SHOPPING_MALL = "shopping mall";
  static readonly SHOPPING_MALL_FILE = `${GameMusics.PATH}Shopping Mall`;

  static readonly SLEEP = "sleep";
  static readonly SLEEP_FILE = `${GameMusics.PATH}RS - Sleep - Loop`;

  static readonly SUBWAY = "subway";
  static readonly SUBWAY_FILE = `${GameMusics.PATH}RS - Subway`;

  static readonly SURVIVORS = "survivors";
  static readonly SURVIVORS_FILE = `${GameMusics.PATH}RS - Survivors`;

  // alpha10
  static readonly SURFACE = "surface";
  static readonly SURFACE_FILE = `${GameMusics.PATH}RS - Surface`;
}

/**
 * id -> file base name, mirroring the C# `*_FILE` constants. The web port resolves
 * the file at play time (`AssetPaths.musicPath`) instead of pre-loading it, so the
 * manager needs the map rather than the caller passing both halves.
 */
export const MUSIC_FILES: Readonly<Record<string, string>> = {
  [GameMusics.ARMY]: "RS - Army",
  [GameMusics.BIGBEAR_THEME_SONG]: "RS - Big Bear Theme Song",
  [GameMusics.BIKER]: "RS - Biker",
  [GameMusics.BLACK_OPS]: "Black Ops",
  [GameMusics.CHAR_RESEARCHERS]: "RS - CHAR researchers",
  [GameMusics.CHAR_UNDERGROUND_FACILITY]: "RS - CUF",
  [GameMusics.DUCKMAN_THEME_SONG]: "RS - Duckman Theme Song",
  [GameMusics.FAMU_FATARU_THEME_SONG]: "RS - Famu Fataru Theme Song",
  [GameMusics.FIGHT]: "RS - Fight",
  [GameMusics.GANGSTA]: "RS - Gangsta",
  [GameMusics.HANS_VON_HANZ_THEME_SONG]: "RS - Hans von Hanz Theme Song",
  [GameMusics.HEYTHERE]: "RS - Hey There",
  [GameMusics.HOSPITAL]: "RS - Hospital",
  [GameMusics.INSANE]: "RS - Insane",
  [GameMusics.INTERLUDE]: "RS - Interlude - Loop",
  [GameMusics.INTRO]: "RS - Intro",
  [GameMusics.LIMBO]: "RS - Limbo",
  [GameMusics.PLAYER_DEATH]: "RS - Post mortem",
  [GameMusics.REINCARNATE]: "RS - Reincarnate",
  [GameMusics.ROGUEDJACK_THEME_SONG]: "RS - Roguedjack Theme Song",
  [GameMusics.SANTAMAN_THEME_SONG]: "RS - Santaman Theme Song",
  [GameMusics.SEWERS]: "RS - Sewers",
  [GameMusics.SHOPPING_MALL]: "Shopping Mall",
  [GameMusics.SLEEP]: "RS - Sleep - Loop",
  [GameMusics.SUBWAY]: "RS - Subway",
  [GameMusics.SURVIVORS]: "RS - Survivors",
  [GameMusics.SURFACE]: "RS - Surface",
};

/**
 * The three Classic effects, then the fork's 180 in `GameSounds.cs` order.
 *
 * `AssetPaths.soundPath` resolves an id through this table and appends `.ogg`,
 * so a key's value is the *file's* base name and nothing else -- which is why
 * the fork's files were copied under exactly the names its `*_FILE` constants
 * spell (`scripts/port-game-sounds.py`) rather than renamed to the port's
 * `sfx - ` prefix. A row whose value is not on disk is a silent sound, so
 * `tests/extended-audio.test.ts` stats every one of them.
 *
 * `REINCARNATE` is in here *and* in `MUSIC_FILES`, with the same value
 * ("reincarnate" -> "RS - Reincarnate"): the fork moved that track from music
 * to sfx in Release 6-1 and so has no `GameMusics.REINCARNATE` at all, while the
 * port still does. `audioPath` consults the music table first, so the id plays
 * the port's music encode and the sfx copy is unreferenced. Both resolve to a
 * file that exists, which is the property that matters; the duplication is
 * recorded rather than resolved, because removing either is a Classic change.
 */
export const SOUND_FILES: Readonly<Record<string, string>> = {
  [GameSounds.UNDEAD_EAT]: "sfx - undead eat",
  [GameSounds.UNDEAD_RISE]: "sfx - undead rise",
  [GameSounds.NIGHTMARE]: "sfx - nightmare",
  [GameSounds.UNDEAD_EAT_PLAYER]: "sfx - undead eat player",
  [GameSounds.PISTOL_SINGLE_SHOT_PLAYER]: "pistol_single-shot_player",
  [GameSounds.PISTOL_RAPID_FIRE_PLAYER]: "pistol_rapid-fire_player",
  [GameSounds.HUNTING_RIFLE_FIRE_PLAYER]: "huntingrifle_player",
  [GameSounds.SHOTGUN_FIRE_PLAYER]: "shotgun-a2_player",
  [GameSounds.CROSSBOW_FIRE_PLAYER]: "crossbow_player",
  [GameSounds.REVOLVER_SINGLE_SHOT_PLAYER]: "revolver_single-shot_player",
  [GameSounds.REVOLVER_RAPID_FIRE_PLAYER]: "revolver_rapid-fire_player",
  [GameSounds.PRECISION_RIFLE_FIRE_PLAYER]: "precision_rifle_player",
  [GameSounds.ARMY_RIFLE_SINGLE_SHOT_PLAYER]: "army_rifle_single-shot_player",
  [GameSounds.ARMY_RIFLE_RAPID_FIRE_PLAYER]: "army_rifle_rapid-fire_player",
  [GameSounds.SMG_SINGLE_SHOT_PLAYER]: "SMG_single-shot_player",
  [GameSounds.SMG_RAPID_FIRE_PLAYER]: "SMG_rapid-fire_player",
  [GameSounds.MINIGUN_RAPID_FIRE_PLAYER]: "minigun_rapid-fire_player",
  [GameSounds.GRENADE_LAUNCHER_SINGLE_SHOT_PLAYER]: "grenade_launcher_single-shot_player",
  [GameSounds.BIO_FORCE_GUN_PLAYER]: "bio_force_gun_player",
  [GameSounds.PISTOL_SINGLE_SHOT_NEARBY]: "pistol_single-shot_nearby",
  [GameSounds.PISTOL_RAPID_FIRE_NEARBY]: "pistol_rapid-fire_nearby",
  [GameSounds.HUNTING_RIFLE_FIRE_NEARBY]: "huntingrifle_nearby",
  [GameSounds.SHOTGUN_FIRE_NEARBY]: "shotgun-a2_nearby",
  [GameSounds.CROSSBOW_FIRE_NEARBY]: "crossbow_nearby",
  [GameSounds.REVOLVER_SINGLE_SHOT_NEARBY]: "revolver_single-shot_nearby",
  [GameSounds.REVOLVER_RAPID_FIRE_NEARBY]: "revolver_rapid-fire_nearby",
  [GameSounds.PRECISION_RIFLE_FIRE_NEARBY]: "precision_rifle_nearby",
  [GameSounds.ARMY_RIFLE_SINGLE_SHOT_NEARBY]: "army_rifle_single-shot_nearby",
  [GameSounds.ARMY_RIFLE_RAPID_FIRE_NEARBY]: "army_rifle_rapid-fire_nearby",
  [GameSounds.SMG_SINGLE_SHOT_NEARBY]: "SMG_single-shot_nearby",
  [GameSounds.SMG_RAPID_FIRE_NEARBY]: "SMG_rapid-fire_nearby",
  [GameSounds.MINIGUN_RAPID_FIRE_NEARBY]: "minigun_rapid-fire_nearby",
  [GameSounds.GRENADE_LAUNCHER_SINGLE_SHOT_NEARBY]: "grenade_launcher_single-shot_nearby",
  [GameSounds.PISTOL_SINGLE_SHOT_FAR]: "pistol_single-shot_far",
  [GameSounds.PISTOL_RAPID_FIRE_FAR]: "pistol_rapid-fire_far",
  [GameSounds.HUNTING_RIFLE_FIRE_FAR]: "huntingrifle_far",
  [GameSounds.SHOTGUN_FIRE_FAR]: "shotgun-a2_far",
  [GameSounds.REVOLVER_SINGLE_SHOT_FAR]: "revolver_single-shot_far",
  [GameSounds.REVOLVER_RAPID_FIRE_FAR]: "revolver_rapid-fire_far",
  [GameSounds.PRECISION_RIFLE_FIRE_FAR]: "precision_rifle_far",
  [GameSounds.ARMY_RIFLE_SINGLE_SHOT_FAR]: "army_rifle_single-shot_far",
  [GameSounds.ARMY_RIFLE_RAPID_FIRE_FAR]: "army_rifle_rapid-fire_far",
  [GameSounds.SMG_SINGLE_SHOT_FAR]: "SMG_single-shot_far",
  [GameSounds.SMG_RAPID_FIRE_FAR]: "SMG_rapid-fire_far",
  [GameSounds.MINIGUN_RAPID_FIRE_FAR]: "minigun_rapid-fire_far",
  [GameSounds.MELEE_ATTACK_PLAYER]: "melee_attack_player",
  [GameSounds.MELEE_ATTACK_NEARBY]: "melee_attack_nearby",
  [GameSounds.MELEE_ATTACK_MISS_PLAYER]: "melee_attack_miss_player",
  [GameSounds.MELEE_ATTACK_MISS_NEARBY]: "melee_attack_miss_nearby",
  [GameSounds.ARMOR_ZIPPER]: "zipper",
  [GameSounds.EQUIP_GUN_PLAYER]: "equip_gun_player",
  [GameSounds.TORCH_CLICK_PLAYER]: "torch_click_player",
  [GameSounds.CLIMB_FENCE_PLAYER]: "climb_fence_player",
  [GameSounds.CLIMB_FENCE_NEARBY]: "climb_fence_nearby",
  [GameSounds.CLIMB_CAR_PLAYER]: "jump_on_car_player",
  [GameSounds.CLIMB_CAR_NEARBY]: "jump_on_car_nearby",
  [GameSounds.SPRAY_SCENT]: "spray_scent",
  [GameSounds.SPRAY_TAG]: "spray_tag",
  [GameSounds.EAT_FOOD]: "eat_food",
  [GameSounds.VOMIT_PLAYER]: "vomit_player",
  [GameSounds.GLASS_DOOR]: "glass_door",
  [GameSounds.WOODEN_DOOR_OPEN]: "wooden_door_open",
  [GameSounds.WOODEN_DOOR_CLOSE]: "wooden_door_close",
  [GameSounds.USE_MEDICINE]: "medicine",
  [GameSounds.USE_PILLS]: "pills",
  [GameSounds.SCREAM_NEARBY_01]: "scream_nearby_01",
  [GameSounds.SCREAM_NEARBY_02]: "scream_nearby_02",
  [GameSounds.SCREAM_NEARBY_03]: "scream_nearby_03",
  [GameSounds.SCREAM_NEARBY_04]: "scream_nearby_04",
  [GameSounds.SCREAM_NEARBY_05]: "scream_nearby_05",
  [GameSounds.SCREAM_NEARBY_07]: "scream_nearby_07",
  [GameSounds.SCREAM_NEARBY_08]: "scream_nearby_08",
  [GameSounds.SCREAM_NEARBY_09]: "scream_nearby_09",
  [GameSounds.SCREAM_FAR_01]: "scream_far_01",
  [GameSounds.SCREAM_FAR_02]: "scream_far_02",
  [GameSounds.SCREAM_FAR_03]: "scream_far_03",
  [GameSounds.SCREAM_FAR_04]: "scream_far_04",
  [GameSounds.SCREAM_FAR_05]: "scream_far_05",
  [GameSounds.SCREAM_FAR_07]: "scream_far_07",
  [GameSounds.SCREAM_FAR_08]: "scream_far_08",
  [GameSounds.SCREAM_FAR_09]: "scream_far_09",
  [GameSounds.BASH_WOOD_PLAYER]: "bash_wood_player",
  [GameSounds.BASH_WOOD_NEARBY]: "bash_wood_nearby",
  [GameSounds.TURN_PAGE]: "turn_page",
  [GameSounds.UNDEAD_EAT_NEARBY]: "sfx - undead eat nearby",
  [GameSounds.VOMIT_NEARBY]: "vomit_nearby",
  [GameSounds.SHOVE_PLAYER]: "shove_player",
  [GameSounds.SHOVE_NEARBY]: "shove_nearby",
  [GameSounds.PUSH_METAL_OBJECT_VISIBLE]: "push_metal_object_visible",
  [GameSounds.PUSH_METAL_OBJECT_AUDIBLE]: "push_metal_object_audible",
  [GameSounds.BUILDING_PLAYER]: "building_player",
  [GameSounds.BUILDING_NEARBY]: "building_nearby",
  [GameSounds.CAN_TRAP_PLAYER]: "can_trap_player",
  [GameSounds.BEAR_TRAP_PLAYER]: "bear_trap_player",
  [GameSounds.SPIKE_TRAP]: "spike_trap",
  [GameSounds.BARBED_WIRE_TRAP_PLAYER]: "barbed_wire_player",
  [GameSounds.CAN_TRAP_NEARBY]: "can_trap_nearby",
  [GameSounds.BEAR_TRAP_NEARBY]: "bear_trap_nearby",
  [GameSounds.CAN_TRAP_FAR]: "can_trap_far",
  [GameSounds.BEAR_TRAP_FAR]: "bear_trap_far",
  [GameSounds.DYNAMITE_VISIBLE]: "dynamite_visible",
  [GameSounds.DYNAMITE_AUDIBLE]: "dynamite_audible",
  [GameSounds.GRENADE_VISIBLE]: "grenade_visible",
  [GameSounds.GRENADE_AUDIBLE]: "grenade_audible",
  [GameSounds.MOLOTOV_VISIBLE]: "molotov_visible",
  [GameSounds.MOLOTOV_AUDIBLE]: "molotov_audible",
  [GameSounds.SMOKING]: "smoking",
  [GameSounds.ROLLER_DOOR]: "roller_door",
  [GameSounds.NAIL_GUN]: "nail_gun",
  [GameSounds.BREAK_WOODENDOOR_PLAYER]: "break_woodendoor_player",
  [GameSounds.BREAK_WOODENDOOR_NEARBY]: "break_woodendoor_nearby",
  [GameSounds.BREAK_GLASSDOOR_PLAYER]: "break_glassdoor_player",
  [GameSounds.BREAK_GLASSDOOR_NEARBY]: "break_glassdoor_nearby",
  [GameSounds.BREAK_METALDOOR_PLAYER]: "break_metaldoor_player",
  [GameSounds.BREAK_METALDOOR_NEARBY]: "break_metaldoor_nearby",
  [GameSounds.BREAK_CERAMIC_VISIBLE]: "break_ceramic_visible",
  [GameSounds.BASH_OTHER_OBJECTS_PLAYER]: "bash_other_objects_player",
  [GameSounds.BASH_OTHER_OBJECTS_NEARBY]: "bash_other_objects_nearby",
  [GameSounds.BASH_CERAMIC_VISIBLE]: "bash_ceramic_visible",
  [GameSounds.BASH_METALDOOR_PLAYER]: "bash_metaldoor_player",
  [GameSounds.BASH_METALDOOR_NEARBY]: "bash_metaldoor_nearby",
  [GameSounds.PUSH_WOODEN_OBJECT_VISIBLE]: "push_wooden_object_visible",
  [GameSounds.PUSH_WOODEN_OBJECT_AUDIBLE]: "push_wooden_object_audible",
  [GameSounds.REINCARNATE]: "RS - Reincarnate",
  [GameSounds.NIGHT_VISION]: "night_vision",
  [GameSounds.ACCESS_DENIED]: "access_denied",
  [GameSounds.ACCESS_GRANTED]: "access_granted",
  [GameSounds.ACHIEVEMENT]: "achievement",
  [GameSounds.FLASHBANG_VISIBLE]: "flashbang_visible",
  [GameSounds.FLASHBANG_AUDIBLE]: "flashbang_audible",
  [GameSounds.DRINK]: "drink",
  [GameSounds.DIG_GROUND]: "dig_ground",
  [GameSounds.PLACE_TRAP]: "place_trap",
  [GameSounds.MAKE_MOLOTOV]: "make_molotov",
  [GameSounds.MALE_HURT]: "male_hurt",
  [GameSounds.FEMALE_HURT]: "female_hurt",
  [GameSounds.CHAINSAW_PLAYER]: "chainsaw_player",
  [GameSounds.CHAINSAW_NEARBY]: "chainsaw_nearby",
  [GameSounds.CHAINSAW_FAR]: "chainsaw_far",
  [GameSounds.FLAMETHROWER_VISIBLE]: "flamethrower_visible",
  [GameSounds.FLAMETHROWER_AUDIBLE]: "flamethrower_audible",
  [GameSounds.FUEL_CAN_VISIBLE]: "fuel_can_visible",
  [GameSounds.FUEL_CAN_AUDIBLE]: "fuel_can_audible",
  [GameSounds.FUEL_PUMP_VISIBLE]: "fuel_pump_visible",
  [GameSounds.FUEL_PUMP_AUDIBLE]: "fuel_pump_audible",
  [GameSounds.GLOWSTICK]: "glowstick",
  [GameSounds.FLARE]: "flare",
  [GameSounds.EQUIP]: "equip",
  [GameSounds.SHIELD_BLOCK_PLAYER]: "shield_block_player",
  [GameSounds.SHIELD_BLOCK_NEARBY]: "shield_block_nearby",
  [GameSounds.SMOKE_GRENADE]: "smoke_grenade",
  [GameSounds.STUN_GUN_PLAYER]: "stun_gun_player",
  [GameSounds.STUN_GUN_NEARBY]: "stun_gun_nearby",
  [GameSounds.DOG_BARK_NEARBY]: "dog_bark_nearby",
  [GameSounds.DOG_BARK_FAR]: "dog_bark_far",
  [GameSounds.DOG_FLEE]: "dog_yips",
  [GameSounds.DOG_GROWL]: "dog_growl",
  [GameSounds.RAT_SCREECH]: "rat_screech",
  [GameSounds.SEWERS_THING_GROWL]: "sewers_thing_growl",
  [GameSounds.SKELETON_GROWL]: "skeleton_growl",
  [GameSounds.SHAMBLER_GROWL]: "shambler_growl",
  [GameSounds.ZOMBIE_MASTER_GROWL]: "zombie_master_growl",
  [GameSounds.ZOMBIFIED_GROAN]: "zombified_groan",
  [GameSounds.PSST_WHISPER]: "psst2",
  [GameSounds.MALE_SHOUT_PLAYER]: "male_shout_player",
  [GameSounds.MALE_SHOUT_NEARBY]: "male_shout_nearby",
  [GameSounds.FEMALE_SHOUT_PLAYER]: "female_shout_player",
  [GameSounds.FEMALE_SHOUT_NEARBY]: "female_shout_nearby",
  [GameSounds.METAL_DOOR_OPEN]: "metal_door_open",
  [GameSounds.METAL_DOOR_CLOSE]: "metal_door_close",
  [GameSounds.FISHING_CAST_PLAYER]: "fishing_cast_player",
  [GameSounds.FISHING_CAST_NEARBY]: "fishing_cast_nearby",
  [GameSounds.FISHING_REEL_PLAYER]: "fishing_reel_player",
  [GameSounds.FISHING_REEL_NEARBY]: "fishing_reel_nearby",
  [GameSounds.COOKING_SIZZLE_PLAYER]: "cooking_sizzle_player",
  [GameSounds.COOKING_SIZZLE_NEARBY]: "cooking_sizzle_nearby",
  [GameSounds.FIRE_EXTINGUISHER_PLAYER]: "fire_extinguisher_player",
  [GameSounds.FIRE_EXTINGUISHER_NEARBY]: "fire_extinguisher_nearby",
  [GameSounds.MATCH_STRIKE_START_FIRE_PLAYER]: "match_strike_start_fire_player",
  [GameSounds.EQUIP_BFG_PLAYER]: "equip_BFG_player",
  [GameSounds.PLASMA_BURST_VISIBLE]: "plasma_burst_visible",
  [GameSounds.PLASMA_BURST_AUDIBLE]: "plasma_burst_audible",
  [GameSounds.OPEN_BACKPACK]: "open_backpack",
};
