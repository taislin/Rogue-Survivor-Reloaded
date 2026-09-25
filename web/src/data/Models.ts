import type { TileModel } from "./TileModel";
import type { ItemModel } from "./ItemModel";
import type { ActorModel } from "./ActorModel";
import type { Faction } from "./Faction";

export interface TileModelDB {
  get(id: number): TileModel;
}

export interface ItemModelDB {
  get(id: number): ItemModel;
}

export interface ActorModelDB {
  get(id: number): ActorModel;
}

export interface FactionDB {
  get(id: number): Faction;
}

export class Models {
  static actors: ActorModelDB;
  static factions: FactionDB;
  static items: ItemModelDB;
  static tiles: TileModelDB;
}
