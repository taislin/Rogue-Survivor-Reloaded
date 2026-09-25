import { Faction } from "@data/Faction";
import { FactionDB, Models } from "@data/Models";

export enum FactionID {
  TheCHARCorporation = 0,
  TheCivilians = 1,
  TheUndeads = 2,
  TheArmy = 3,
  TheBikers = 4,
  TheGangstas = 5,
  ThePolice = 6,
  TheBlackOps = 7,
  ThePsychopaths = 8,
  TheSurvivors = 9,
  TheFerals = 10,
  _COUNT = 11,
}

export class GameFactions implements FactionDB {
  private readonly factions: Faction[] = new Array(FactionID._COUNT);

  // ItemID values are inlined (not imported) to avoid a
  // GameFactions -> GameItems -> ItemBodyArmor -> GameFactions import cycle.
  static readonly BAD_POLICE_OUTFITS: readonly number[] = [
    36, // ItemID.ARMOR_FREE_ANGELS_JACKET
    35, // ItemID.ARMOR_HELLS_SOULS_JACKET
  ];

  static readonly GOOD_POLICE_OUTFITS: readonly number[] = [
    37, // ItemID.ARMOR_POLICE_JACKET
    38, // ItemID.ARMOR_POLICE_RIOT
  ];

  constructor() {
    Models.factions = this;

    this.setFaction(FactionID.TheArmy, new Faction("Army", "soldier"));
    this.factions[FactionID.TheArmy].leadOnlyBySameFaction = true;

    this.setFaction(FactionID.TheBikers, new Faction("Bikers", "biker"));
    this.factions[FactionID.TheBikers].leadOnlyBySameFaction = true;

    this.setFaction(FactionID.TheBlackOps, new Faction("BlackOps", "blackOp"));
    this.factions[FactionID.TheBlackOps].leadOnlyBySameFaction = true;

    this.setFaction(FactionID.TheCHARCorporation, new Faction("CHAR Corp.", "CHAR employee"));
    this.factions[FactionID.TheCHARCorporation].leadOnlyBySameFaction = true;

    this.setFaction(FactionID.TheCivilians, new Faction("Civilians", "civilian"));

    this.setFaction(FactionID.TheGangstas, new Faction("Gangstas", "gangsta"));
    this.factions[FactionID.TheGangstas].leadOnlyBySameFaction = true;

    this.setFaction(FactionID.ThePolice, new Faction("Police", "police officer"));
    this.factions[FactionID.ThePolice].leadOnlyBySameFaction = true;

    this.setFaction(FactionID.TheUndeads, new Faction("Undeads", "undead"));
    this.setFaction(FactionID.ThePsychopaths, new Faction("Psychopaths", "psychopath"));
    this.setFaction(FactionID.TheSurvivors, new Faction("Survivors", "survivor"));

    this.setFaction(FactionID.TheFerals, new Faction("Ferals", "feral"));
    this.factions[FactionID.TheFerals].leadOnlyBySameFaction = true;

    // Relations
    const army = this.factions[FactionID.TheArmy];
    const bikers = this.factions[FactionID.TheBikers];
    const blackOps = this.factions[FactionID.TheBlackOps];
    const charCorp = this.factions[FactionID.TheCHARCorporation];
    const civilians = this.factions[FactionID.TheCivilians];
    const gangstas = this.factions[FactionID.TheGangstas];
    const police = this.factions[FactionID.ThePolice];
    const undeads = this.factions[FactionID.TheUndeads];
    const psychos = this.factions[FactionID.ThePsychopaths];
    const survivors = this.factions[FactionID.TheSurvivors];
    const ferals = this.factions[FactionID.TheFerals];

    army.addEnemy(bikers);
    army.addEnemy(blackOps);
    army.addEnemy(gangstas);
    army.addEnemy(undeads);
    army.addEnemy(psychos);

    bikers.addEnemy(army);
    bikers.addEnemy(blackOps);
    bikers.addEnemy(charCorp);
    bikers.addEnemy(gangstas);
    bikers.addEnemy(police);
    bikers.addEnemy(undeads);
    bikers.addEnemy(psychos);

    blackOps.addEnemy(army);
    blackOps.addEnemy(bikers);
    blackOps.addEnemy(charCorp);
    blackOps.addEnemy(civilians);
    blackOps.addEnemy(gangstas);
    blackOps.addEnemy(police);
    blackOps.addEnemy(undeads);
    blackOps.addEnemy(psychos);
    blackOps.addEnemy(survivors);

    charCorp.addEnemy(army);
    charCorp.addEnemy(blackOps);
    charCorp.addEnemy(bikers);
    charCorp.addEnemy(gangstas);
    charCorp.addEnemy(undeads);
    charCorp.addEnemy(psychos);

    civilians.addEnemy(blackOps);
    civilians.addEnemy(undeads);
    civilians.addEnemy(psychos);

    gangstas.addEnemy(army);
    gangstas.addEnemy(bikers);
    gangstas.addEnemy(blackOps);
    gangstas.addEnemy(charCorp);
    gangstas.addEnemy(police);
    gangstas.addEnemy(undeads);
    gangstas.addEnemy(psychos);

    police.addEnemy(bikers);
    police.addEnemy(blackOps);
    police.addEnemy(gangstas);
    police.addEnemy(undeads);
    police.addEnemy(psychos);

    undeads.addEnemy(army);
    undeads.addEnemy(bikers);
    undeads.addEnemy(blackOps);
    undeads.addEnemy(charCorp);
    undeads.addEnemy(civilians);
    undeads.addEnemy(gangstas);
    undeads.addEnemy(police);
    undeads.addEnemy(psychos);
    undeads.addEnemy(survivors);
    undeads.addEnemy(ferals);

    psychos.addEnemy(army);
    psychos.addEnemy(bikers);
    psychos.addEnemy(blackOps);
    psychos.addEnemy(charCorp);
    psychos.addEnemy(civilians);
    psychos.addEnemy(gangstas);
    psychos.addEnemy(police);
    psychos.addEnemy(undeads);
    psychos.addEnemy(survivors);

    survivors.addEnemy(blackOps);
    survivors.addEnemy(undeads);
    survivors.addEnemy(psychos);

    ferals.addEnemy(undeads);

    // Ensure symmetry
    for (const f of this.factions) {
      for (const enemy of f.enemyList) {
        if (!enemy.isEnemyOf(f)) {
          enemy.addEnemy(f);
        }
      }
    }
  }

  private setFaction(id: FactionID, faction: Faction): void {
    faction.id = id;
    this.factions[id] = faction;
  }

  get(id: number): Faction {
    return this.factions[id];
  }
}
