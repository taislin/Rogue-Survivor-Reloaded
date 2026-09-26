import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Direction } from "@engine/Direction";
import { WorldTime } from "@engine/WorldTime";
import { Tile } from "./Tile";
import type { TileModel } from "./TileModel";
import type { Zone } from "./Zone";
import type { District } from "./District";
import type { Actor } from "./Actor";
import type { MapObject } from "./MapObject";
import { Inventory } from "./Inventory";
import type { Corpse } from "./Corpse";
import { Odor, OdorScent } from "./Odor";
import type { TimedTask } from "./TimedTask";
import { Location } from "./Location";
import type { Item } from "./Item";

export enum Lighting {
  DARKNESS = 0,
  OUTSIDE = 1,
  LIT = 2,
}

export class Exit {
  toMap: Map | null;
  toPosition: Point;
  isAnAIExit: boolean = false;

  constructor(toMap: Map | null, toPosition: Point) {
    this.toMap = toMap;
    this.toPosition = toPosition;
  }
}

export class Map {
  static readonly GROUND_INVENTORY_SLOTS = 10;

  readonly seed: number;
  district: District | null = null;
  name: string = "";
  bgMusic: string = "";
  isSecret: boolean = false;
  lighting: Lighting = Lighting.OUTSIDE;
  readonly localTime: WorldTime;

  readonly width: number;
  readonly height: number;
  readonly rect: Rect;

  private readonly tilesGrid: Tile[][];
  private readonly exitsMap = new window.Map<string, Exit>();
  private readonly zonesList: Zone[] = [];
  private readonly actorsList: Actor[] = [];
  private readonly mapObjectsList: MapObject[] = [];
  private readonly groundItemsMap = new window.Map<string, Inventory>();
  private readonly corpsesList: Corpse[] = [];
  private readonly scentsList: OdorScent[] = [];
  private readonly timersList: TimedTask[] = [];

  // Spatial lookups
  private readonly actorsByPos = new window.Map<string, Actor>();
  private readonly mapObjectsByPos = new window.Map<string, MapObject>();
  private readonly corpsesByPos = new window.Map<string, Corpse[]>();
  private readonly scentsByPos = new window.Map<string, OdorScent[]>();
  private m_checkNextActorIndex = 0;

  constructor(seed: number, name: string, width: number, height: number) {
    this.seed = seed;
    this.name = name;
    this.width = width;
    this.height = height;
    this.rect = new Rect(0, 0, width, height);
    this.localTime = new WorldTime(0);

    this.tilesGrid = [];
    for (let x = 0; x < width; x++) {
      this.tilesGrid.push(new Array(height));
    }
  }

  private static key(x: number, y: number): string {
    return `${x},${y}`;
  }

  isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  isInBoundsPoint(p: Point): boolean {
    return this.isInBounds(p.x, p.y);
  }

  /** C# `Map.IsOnMapBorder(int, int)`. */
  isOnMapBorder(x: number, y: number): boolean {
    return x === 0 || x === this.width - 1 || y === 0 || y === this.height - 1;
  }

  getTileAt(x: number, y: number): Tile | null {
    if (!this.isInBounds(x, y)) return null;
    return this.tilesGrid[x][y] ?? null;
  }

  setTileAt(x: number, y: number, tile: Tile): void {
    if (this.isInBounds(x, y)) {
      this.tilesGrid[x][y] = tile;
    }
  }

  /** C# `Map.SetTileModelAt(int, int, TileModel)`. */
  setTileModelAt(x: number, y: number, model: TileModel): void {
    if (!this.isInBounds(x, y)) throw new RangeError(`position out of map bounds (${x},${y})`);
    if (!model) throw new Error('model');
    this.tilesGrid[x][y].model = model;
  }

  // ── Exits ─────────────────────────────────────────────────────────────────

  get exits(): IterableIterator<Exit> {
    return this.exitsMap.values();
  }

  get countExits(): number {
    return this.exitsMap.size;
  }

  getExitAt(pos: Point): Exit | null {
    return this.exitsMap.get(Map.key(pos.x, pos.y)) ?? null;
  }

  addExit(pos: Point, exit: Exit): void {
    this.exitsMap.set(Map.key(pos.x, pos.y), exit);
  }

  // ── Zones ─────────────────────────────────────────────────────────────────

  get zones(): readonly Zone[] {
    return this.zonesList;
  }

  addZone(zone: Zone): void {
    this.zonesList.push(zone);
  }

  getZoneAt(pos: Point): Zone | null {
    for (const z of this.zonesList) {
      if (z.bounds.contains(pos)) return z;
    }
    return null;
  }

  getZonesAt(x: number, y: number): Zone[] {
    const pt = new Point(x, y);
    const list: Zone[] = [];
    for (const z of this.zonesList) {
      if (z.bounds.contains(pt)) {
        list.push(z);
      }
    }
    return list;
  }

  getZonesAtPoint(pos: Point): Zone[] {
    return this.getZonesAt(pos.x, pos.y);
  }

  /** C# `Map.RemoveAllZonesAt(int, int)`. */
  removeAllZonesAt(x: number, y: number): void {
    const zones = this.getZonesAt(x, y);
    for (const z of zones) this.removeZone(z);
  }

  /** C# `Map.RemoveZone(Zone)`. */
  removeZone(zone: Zone): void {
    const idx = this.zonesList.indexOf(zone);
    if (idx !== -1) this.zonesList.splice(idx, 1);
  }

  isWalkable(x: number, y: number): boolean {
    if (!this.isInBounds(x, y)) return false;
    const tile = this.getTileAt(x, y);
    if (!tile || !tile.model.isWalkable) return false;
    const obj = this.getMapObjectAt(x, y);
    if (!obj) return true;
    return obj.isWalkable;
  }

  isWalkablePoint(pos: Point): boolean {
    return this.isWalkable(pos.x, pos.y);
  }

  isTransparent(x: number, y: number): boolean {
    if (!this.isInBounds(x, y)) return false;
    const tile = this.getTileAt(x, y);
    if (!tile || !tile.model.isTransparent) return false;
    const obj = this.getMapObjectAt(x, y);
    if (!obj) return true;
    return obj.isTransparent;
  }

  isTransparentPoint(pos: Point): boolean {
    return this.isTransparent(pos.x, pos.y);
  }

  isBlockingFire(x: number, y: number): boolean {
    if (!this.isInBounds(x, y)) return true;
    const tile = this.getTileAt(x, y);
    if (!tile || !tile.model.isTransparent) return true;
    const obj = this.getMapObjectAt(x, y);
    if (obj && !obj.isTransparent) return true;
    const actor = this.getActorAt(x, y);
    if (actor) return true;
    return false;
  }

  isBlockingFirePoint(pos: Point): boolean {
    return this.isBlockingFire(pos.x, pos.y);
  }

  isBlockingThrow(x: number, y: number): boolean {
    if (!this.isInBounds(x, y)) return true;
    const tile = this.getTileAt(x, y);
    if (!tile || !tile.model.isWalkable) return true;
    const obj = this.getMapObjectAt(x, y);
    if (obj && !obj.isWalkable && !obj.isJumpable) return true;
    return false;
  }

  isBlockingThrowPoint(pos: Point): boolean {
    return this.isBlockingThrow(pos.x, pos.y);
  }

  filterAdjacentInMap(pos: Point, predicateFn: (pt: Point) => boolean): Point[] | null {
    if (!this.isInBoundsPoint(pos)) return null;
    let list: Point[] | null = null;
    for (const d of Direction.COMPASS) {
      const next = d.applyTo(pos);
      if (this.isInBoundsPoint(next) && predicateFn(next)) {
        if (!list) list = [];
        list.push(next);
      }
    }
    return list;
  }

  /** C# HasAnyAdjacentInMap – true if any compass-adjacent tile satisfies the predicate. */
  hasAnyAdjacentInMap(pos: Point, predicateFn: (pt: Point) => boolean): boolean {
    if (!this.isInBoundsPoint(pos)) return false;
    for (const d of Direction.COMPASS) {
      const next = d.applyTo(pos);
      if (this.isInBoundsPoint(next) && predicateFn(next)) return true;
    }
    return false;
  }

  // ── Actors ────────────────────────────────────────────────────────────────

  get actors(): readonly Actor[] {
    return this.actorsList;
  }

  get countActors(): number {
    return this.actorsList.length;
  }

  /** C# CheckNextActorIndex – cached start index for turn ordering. */
  get checkNextActorIndex(): number {
    return this.m_checkNextActorIndex;
  }
  set checkNextActorIndex(v: number) {
    this.m_checkNextActorIndex = v;
  }

  /** C# GetActor – actor by list index (for turn-order scanning). */
  getActor(index: number): Actor {
    return this.actorsList[index];
  }

  getActorAt(x: number, y: number): Actor | null {
    return this.actorsByPos.get(Map.key(x, y)) ?? null;
  }

  getActorAtPoint(p: Point): Actor | null {
    return this.getActorAt(p.x, p.y);
  }

  placeActor(actor: Actor, pos: Point): void {
    const k = Map.key(pos.x, pos.y);
    if (this.actorsByPos.has(k)) {
      throw new Error(`Tile ${pos.toString()} already has an actor`);
    }
    actor.location = new Location(this, pos);
    this.actorsList.push(actor);
    this.actorsByPos.set(k, actor);
    this.m_checkNextActorIndex = 0; // invalidated
  }

  removeActor(actor: Actor): void {
    const idx = this.actorsList.indexOf(actor);
    if (idx !== -1) {
      this.actorsList.splice(idx, 1);
    }
    const pos = actor.location.position;
    this.actorsByPos.delete(Map.key(pos.x, pos.y));
    this.m_checkNextActorIndex = 0; // invalidated
  }

  moveActor(actor: Actor, newPos: Point): void {
    const oldKey = Map.key(actor.location.position.x, actor.location.position.y);
    const newKey = Map.key(newPos.x, newPos.y);

    this.actorsByPos.delete(oldKey);
    actor.location = new Location(this, newPos);
    this.actorsByPos.set(newKey, actor);
    this.m_checkNextActorIndex = 0; // invalidated
  }

  // ── Map Objects ───────────────────────────────────────────────────────────

  get mapObjects(): readonly MapObject[] {
    return this.mapObjectsList;
  }

  getMapObjectAt(x: number, y: number): MapObject | null {
    return this.mapObjectsByPos.get(Map.key(x, y)) ?? null;
  }

  getMapObjectAtPoint(p: Point): MapObject | null {
    return this.getMapObjectAt(p.x, p.y);
  }

  placeMapObject(obj: MapObject, pos: Point): void {
    const k = Map.key(pos.x, pos.y);
    obj.location = new Location(this, pos);
    this.mapObjectsList.push(obj);
    this.mapObjectsByPos.set(k, obj);
  }

  removeMapObject(obj: MapObject): void {
    const idx = this.mapObjectsList.indexOf(obj);
    if (idx !== -1) {
      this.mapObjectsList.splice(idx, 1);
    }
    const pos = obj.location.position;
    this.mapObjectsByPos.delete(Map.key(pos.x, pos.y));
  }

  // ── Ground Items ──────────────────────────────────────────────────────────

  /** C# `Map.GroundInventories`. */
  get groundInventories(): IterableIterator<Inventory> {
    return this.groundItemsMap.values();
  }

  /** C# `Map.GetGroundInventoryPosition(Inventory)`. */
  getGroundInventoryPosition(groundInv: Inventory): Point | null {
    for (const [k, inv] of this.groundItemsMap) {
      if (inv === groundInv) {
        const [x, y] = k.split(",").map(Number);
        return new Point(x, y);
      }
    }
    return null;
  }

  getItemsAt(pos: Point): Inventory | null {
    return this.groundItemsMap.get(Map.key(pos.x, pos.y)) ?? null;
  }

  getOrCreateItemsAt(pos: Point): Inventory {
    const k = Map.key(pos.x, pos.y);
    let inv = this.groundItemsMap.get(k);
    if (!inv) {
      inv = new Inventory(Map.GROUND_INVENTORY_SLOTS);
      this.groundItemsMap.set(k, inv);
    }
    return inv;
  }

  dropItemAt(it: Item, pos: Point): boolean {
    const inv = this.getOrCreateItemsAt(pos);
    return inv.addAll(it);
  }

  removeItemsAtIfEmpty(pos: Point): void {
    const k = Map.key(pos.x, pos.y);
    const inv = this.groundItemsMap.get(k);
    if (inv && inv.isEmpty) {
      this.groundItemsMap.delete(k);
    }
  }

  /** C# `Map.RemoveItemAt(Item, Point)`. */
  removeItemAt(it: Item, pos: Point): void {
    if (!it) throw new Error('item');
    if (!this.isInBoundsPoint(pos)) throw new RangeError('position out of map bounds');
    const invThere = this.groundItemsMap.get(Map.key(pos.x, pos.y));
    if (!invThere) throw new Error('no items at this position');
    if (!invThere.contains(it)) throw new Error('item not at this position');
    invThere.removeAllQuantity(it);
    this.removeItemsAtIfEmpty(pos);
  }

  // ── Corpses ───────────────────────────────────────────────────────────────

  get corpses(): readonly Corpse[] {
    return this.corpsesList;
  }

  /** C# HasCorpse – true if this exact corpse instance is on the map. */
  hasCorpse(corpse: Corpse): boolean {
    return this.corpsesList.includes(corpse);
  }

  getCorpsesAt(pos: Point): readonly Corpse[] | null {
    return this.corpsesByPos.get(Map.key(pos.x, pos.y)) ?? null;
  }

  addCorpse(corpse: Corpse): void {
    this.corpsesList.push(corpse);
    const k = Map.key(corpse.position.x, corpse.position.y);
    let list = this.corpsesByPos.get(k);
    if (!list) {
      list = [];
      this.corpsesByPos.set(k, list);
    }
    list.push(corpse);
  }

  removeCorpse(corpse: Corpse): void {
    const idx = this.corpsesList.indexOf(corpse);
    if (idx !== -1) {
      this.corpsesList.splice(idx, 1);
    }
    const k = Map.key(corpse.position.x, corpse.position.y);
    const list = this.corpsesByPos.get(k);
    if (list) {
      const cIdx = list.indexOf(corpse);
      if (cIdx !== -1) list.splice(cIdx, 1);
      if (list.length === 0) this.corpsesByPos.delete(k);
    }
  }

  /** C# `Map.CountCorpses`. */
  get countCorpses(): number {
    return this.corpsesList.length;
  }

  /** C# `Map.TryRemoveCorpseOf(Actor)`. */
  tryRemoveCorpseOf(a: Actor): boolean {
    for (const c of this.corpsesList) {
      if (c.deadGuy === a) {
        this.removeCorpse(c);
        return true;
      }
    }
    return false;
  }

  // ── Scents ────────────────────────────────────────────────────────────────

  get scents(): readonly OdorScent[] {
    return this.scentsList;
  }

  getScentsAt(pos: Point): readonly OdorScent[] | null {
    return this.scentsByPos.get(Map.key(pos.x, pos.y)) ?? null;
  }

  addScent(scent: OdorScent): void {
    this.scentsList.push(scent);
    const k = Map.key(scent.position.x, scent.position.y);
    let list = this.scentsByPos.get(k);
    if (!list) {
      list = [];
      this.scentsByPos.set(k, list);
    }
    list.push(scent);
  }

  getScentByOdor(odor: Odor, pos: Point): OdorScent | null {
    const list = this.getScentsAt(pos);
    if (!list) return null;
    for (const s of list) {
      if (s.odor === odor) return s;
    }
    return null;
  }

  getScentByOdorAt(odor: Odor, position: Point): number {
    if (!this.isInBoundsPoint(position)) return 0;
    const scent = this.getScentByOdor(odor, position);
    return scent ? scent.strength : 0;
  }

  /** C# `Map.ModifyScentAt(Odor, int, Point)` — merge or create. */
  modifyScentAt(odor: Odor, strengthChange: number, position: Point): void {
    if (!this.isInBoundsPoint(position)) throw new RangeError("position");
    const oldScent = this.getScentByOdor(odor, position);
    if (oldScent === null) {
      // new odor there.
      this.addScent(new OdorScent(odor, strengthChange, position));
    } else {
      // existing odor here.
      oldScent.change(strengthChange);
    }
  }

  /** C# `Map.RefreshScentAt(Odor, int, Point)` — set odor strength if it is stronger (more "fresh"). */
  refreshScentAt(odor: Odor, freshStrength: number, position: Point): void {
    if (!this.isInBoundsPoint(position)) {
      throw new RangeError(`position; (${position.x},${position.y}) map ${this.name} odor ${Odor[odor] ?? odor}`);
    }
    const oldScent = this.getScentByOdor(odor, position);
    if (oldScent === null) {
      // new odor there.
      this.addScent(new OdorScent(odor, freshStrength, position));
    } else {
      // existing odor here.
      if (oldScent.strength < freshStrength) oldScent.set(freshStrength);
    }
  }

  /** C# `Map.RemoveScent(OdorScent)`. */
  removeScent(scent: OdorScent): void {
    const idx = this.scentsList.indexOf(scent);
    if (idx !== -1) this.scentsList.splice(idx, 1);
    const k = Map.key(scent.position.x, scent.position.y);
    const list = this.scentsByPos.get(k);
    if (list) {
      const sIdx = list.indexOf(scent);
      if (sIdx !== -1) list.splice(sIdx, 1);
      if (list.length === 0) this.scentsByPos.delete(k);
    }
  }

  // ── Timers ────────────────────────────────────────────────────────────────

  get timers(): readonly TimedTask[] {
    return this.timersList;
  }

  /** C# `Map.CountTimers`. */
  get countTimers(): number {
    return this.timersList.length;
  }

  addTimer(timer: TimedTask): void {
    this.timersList.push(timer);
  }

  removeTimer(timer: TimedTask): void {
    const idx = this.timersList.indexOf(timer);
    if (idx !== -1) {
      this.timersList.splice(idx, 1);
    }
  }

  tickTimers(): void {
    for (let i = this.timersList.length - 1; i >= 0; i--) {
      const t = this.timersList[i];
      t.tick(this);
      if (t.isCompleted) {
        this.timersList.splice(i, 1);
      }
    }
  }
}
