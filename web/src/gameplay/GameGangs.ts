export enum GangID {
  NONE = 0,
  BIKER_HELLS_SOULS = 1,
  BIKER_FREE_ANGELS = 2,
  GANGSTA_CRAPS = 3,
  GANGSTA_FLOODS = 4,
}

export class GameGangs {
  static readonly GANGSTAS: readonly GangID[] = [
    GangID.GANGSTA_CRAPS,
    GangID.GANGSTA_FLOODS,
  ];

  static readonly BIKERS: readonly GangID[] = [
    GangID.BIKER_HELLS_SOULS,
    GangID.BIKER_FREE_ANGELS,
  ];

  static readonly NAMES: readonly string[] = [
    "(no gang)",
    "Hell's Souls",
    "Free Angels",
    "Craps",
    "Floods",
  ];

  // ItemID values are inlined (not imported) to avoid a
  // GameGangs -> GameItems -> ItemBodyArmor -> GameGangs import cycle.
  // Index by GangID; index 0 is the "no gang" entry.
  static readonly BAD_GANG_OUTFITS: readonly (readonly number[])[] = [
    [], // none
    [36, 37, 38], // Hells Souls: FREE_ANGELS_JACKET, POLICE_JACKET, POLICE_RIOT
    [35, 37, 38], // Free Angels: HELLS_SOULS_JACKET, POLICE_JACKET, POLICE_RIOT
    [36, 35, 37, 38], // Craps
    [36, 35, 37, 38], // Floods
  ];

  static readonly GOOD_GANG_OUTFITS: readonly (readonly number[])[] = [
    [], // none
    [35], // Hells Souls: HELLS_SOULS_JACKET
    [36], // Free Angels: FREE_ANGELS_JACKET
    [], // Craps
    [], // Floods
  ];
}
