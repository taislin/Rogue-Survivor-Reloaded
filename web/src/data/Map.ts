import { Point } from "@engine/Point";
import { coordKey, coordKeyToPoint } from "@engine/CoordKey";
import { Rect } from "@engine/Rect";
import { Direction } from "@engine/Direction";
import { WorldTime } from "@engine/WorldTime";
import { Tile } from "./Tile";
import { TileModel } from "./TileModel";
import type { Zone } from "./Zone";
import type { District } from "./District";
import type { Actor } from "./Actor";
import type { MapObject } from "./MapObject";
import { Inventory } from "./Inventory";
import { GameImages } from "@gameplay/GameImages";
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
  /**
   * Does this map have somewhere to fish? Still Alive, Release 7-6.
   *
   * C# `Data/Map.cs:144` over `m_HasFishing`, and the port keeps the property
   * over a backing field for one reason: the graph reader builds a map with
   * `Object.create(Map.prototype)`, so **class field initialisers never run** and
   * a save written before this flag existed has no `_hasFishing` key to assign.
   * A plain field would read `undefined` on such a map, and `!hasFishing` is the
   * test the AI arm will make — `undefined` happens to be falsy, so it would
   * work, but only by accident and only until somebody wrote `hasFishing === true`.
   * Defaulting in the getter is what makes "a missing key reads as false" a
   * property of the class rather than of the code that happens to test it, and it
   * matches the C#'s own constructor default at `Data/Map.cs:273`.
   */
  private _hasFishing: boolean = false;

  get hasFishing(): boolean {
    return this._hasFishing ?? false;
  }

  set hasFishing(value: boolean) {
    this._hasFishing = value;
  }

  /**
   * Does this map have a church on it? Still Alive, Release 6-6.
   *
   * C# `Data/Map.cs:138` over `m_HasChurch`, and shaped exactly like
   * {@link hasFishing} above for the same reason: the graph reader builds maps
   * with `Object.create(Map.prototype)`, so a save written before this flag
   * existed has no `_hasChurch` key and the getter has to supply the default.
   *
   * The only writer is `MakeChurchBuilding` (`BaseTownGenerator.cs:2379`), so
   * unlike the fishing flag this one is only ever true on a surface map the
   * town generator put a church on. The only reader -- the C#'s two church-bell
   * ambients at sunset (`RogueGame.cs:5637`) -- is not wired yet; see
   * `RogueGame.CheckAmbientAudio`.
   */
  private _hasChurch: boolean = false;

  get hasChurch(): boolean {
    return this._hasChurch ?? false;
  }

  set hasChurch(value: boolean) {
    this._hasChurch = value;
  }

  readonly localTime: WorldTime;

  readonly width: number;
  readonly height: number;
  readonly rect: Rect;

  private readonly tilesGrid: Tile[][];
  private readonly exitsMap = new globalThis.Map<number, Exit>();
  private readonly zonesList: Zone[] = [];
  private readonly actorsList: Actor[] = [];
  private readonly mapObjectsList: MapObject[] = [];
  private readonly groundItemsMap = new globalThis.Map<number, Inventory>();
  private readonly corpsesList: Corpse[] = [];
  private readonly scentsList: OdorScent[] = [];
  private readonly timersList: TimedTask[] = [];

  // Spatial lookups
  private readonly actorsByPos = new globalThis.Map<number, Actor>();
  private readonly mapObjectsByPos = new globalThis.Map<number, MapObject>();
  private readonly corpsesByPos = new globalThis.Map<number, Corpse[]>();
  private readonly scentsByPos = new globalThis.Map<number, OdorScent[]>();
  private m_checkNextActorIndex = 0;

  constructor(seed: number, name: string, width: number, height: number) {
    this.seed = seed;
    this.name = name;
    this.width = width;
    this.height = height;
    this.rect = new Rect(0, 0, width, height);
    this.localTime = new WorldTime(0);

    // C# `Map` ctor: `m_Tiles[x, y] = new Tile(TileModel.UNDEF)` for every cell.
    // Pre-filling matters — `GetTileAt`/`SetTileModelAt` dereference the tile
    // directly, so a sparse grid would leave the whole map unusable.
    this.tilesGrid = [];
    for (let x = 0; x < width; x++) {
      const column: Tile[] = [];
      for (let y = 0; y < height; y++) {
        column.push(new Tile(TileModel.UNDEF));
      }
      this.tilesGrid.push(column);
    }
  }

  /**
   * Positional key for the six spatial lookup tables above.
   *
   * Delegates to {@link coordKey} rather than carrying its own copy of the
   * formula. The reasoning — why a number, why this stride, and why there is
   * deliberately no `isInBounds` guard — lives there, because the Field Of View
   * uses the identical key and two copies of one formula is how they drift.
   */
  private static key(x: number, y: number): number {
    return coordKey(x, y);
  }

  /** Inverse of `key`, for the one caller that has a key and needs a tile. */
  private static keyToPoint(k: number): Point {
    return coordKeyToPoint(k);
  }

  isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  isInBoundsPoint(p: Point): boolean {
    return this.isInBounds(p.x, p.y);
  }

  /**
   * C# `Map.IsOnMapBorder(int, int)` — the ring of tiles *on* the map's edge,
   * i.e. coordinates that are still in bounds.
   */
  isOnMapBorder(x: number, y: number): boolean {
    return x === 0 || x === this.width - 1 || y === 0 || y === this.height - 1;
  }

  /**
   * C# `Map.AnyAdjacentOutOfBounds` — `Map.cs:1607-1620`, Release 7-3.
   * "Used when checking if we'll allow a wall to be destructed (don't if OOB eg
   * basement)": true when any of the eight compass neighbours is off the map.
   *
   * Distinct from `isOnMapBorder`, which asks about the tile itself. `AnyAdjacent…`
   * asks about its ring, which is what stops a blast replacing a district's
   * *boundary* wall with walkable floor and punching a hole out of the world.
   *
   * Pure geometry, and it stays that way: the C#'s other half,
   * `IsDestructibleWallAt` (`:1622-1640`), asks `GameTiles` about the tile *model*,
   * and `data/` has no business importing `gameplay/`. That half is done at the call
   * site in `ApplyExplosionDamage`, with the same `Models.tiles as GameTiles` cast
   * `LOS.ts:454` uses to reach a `GameTiles`-only method off the base-typed registry.
   */
  anyAdjacentOutOfBounds(p: Point): boolean {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        if (!this.isInBounds(p.x + dx, p.y + dy)) return true;
      }
    }
    return false;
  }

  /**
   * C# `Map.IsMapBoundary(int, int)` — the ring immediately *outside* the map.
   *
   * Distinct from `isOnMapBorder` above, and the two names in the C# are close
   * enough to invite swapping. This one is the out-of-bounds ring, and it is
   * the only test `DrawMap` uses to decide whether to draw an exit marker:
   * exits are stored one tile beyond the edge (`x === -1`, `x === width`, ...)
   * rather than on it, so the label has to be tested against this ring to be
   * found at all. Testing the in-bounds ring instead finds nothing except the
   * two corner-adjacent cases, and the district-exit labels silently never
   * appear.
   */
  isMapBoundary(x: number, y: number): boolean {
    return x === -1 || x === this.width || y === -1 || y === this.height;
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
    // A tile's model carries its minimap colour, so this is minimap-relevant
    // state. Today every caller is world generation, before anything is drawn,
    // but bumping here means a future runtime tile change cannot silently leave
    // a cached minimap stale.
    this.bumpMinimapRevision();
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

  /**
   * `getExitAt` without allocating a `Point`.
   *
   * The minimap rebuild walks every tile of the map, and the obvious
   * `getExitAt(new Point(x, y))` allocates once per tile — 10 000 short-lived
   * objects per rebuild, which is pure GC pressure for a value that is only
   * read and discarded.
   */
  getExitAtXY(x: number, y: number): Exit | null {
    return this.exitsMap.get(Map.key(x, y)) ?? null;
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

  /** C# GetZoneByPartialName – first zone whose name contains `partOfName`. */
  getZoneByPartialName(partOfName: string): Zone | null {
    for (const zone of this.zonesList) {
      if (zone.name.includes(partOfName)) return zone;
    }
    return null;
  }

  /** C# `Map.HasZonePartiallyNamedAt` – true if any zone *at that tile* matches. */
  hasZonePartiallyNamedAt(pos: Point, partOfName: string): boolean {
    for (const z of this.getZonesAt(pos.x, pos.y)) {
      if (z.name.includes(partOfName)) return true;
    }
    return false;
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

  /** C# `Map.TrimToBounds(ref int x, ref int y)` - clamp a tile coord into the map. */
  trimToBounds(x: number, y: number): Point {
    const cx = x < 0 ? 0 : x > this.width - 1 ? this.width - 1 : x;
    const cy = y < 0 ? 0 : y > this.height - 1 ? this.height - 1 : y;
    return new Point(cx, cy);
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

  /** C# `Map.FindFirstInMap` – first tile in row-major order matching the predicate. */
  findFirstInMap(predicateFn: (pt: Point) => boolean): Point | null {
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const p = new Point(x, y);
        if (predicateFn(p)) return p;
      }
    }
    return null;
  }

  /** C# `Map.SetAllAsUnvisited` – forget the whole map (used on reincarnation). */
  setAllAsUnvisited(): void {
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const tile = this.getTileAt(x, y);
        if (tile) tile.isVisited = false;
      }
    }
    this.bumpMinimapRevision();
  }

  /**
   * C# `Map.ClearView` – drop the current view, keeping the visited set.
   *
   * The view is what the player can see *right now*; the visited set is what
   * they have ever seen. Only the former is cleared, so previously-memorised
   * tiles stay drawn in their desaturated form.
   */
  clearView(): void {
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const tile = this.getTileAt(x, y);
        if (tile) tile.isInView = false;
      }
    }
  }

  /**
   * C# `Map.SetViewAndMarkVisited` – replace the view, and remember it.
   *
   * Called once per FOV recomputation. This is what makes actors, items and
   * corpses drawable at all: `RogueGame.IsVisibleToPlayer` reads
   * `tile.isInView`, and `DrawTile` picks its lit or memorised sprite from the
   * same two flags. Without it the whole map stays unvisited and empty.
   */
  setViewAndMarkVisited(visiblePositions: Iterable<Point>): void {
    this.clearView();
    for (const pt of visiblePositions) {
      const tile = this.getTileAt(pt.x, pt.y);
      if (tile === null) continue;
      tile.isInView = true;
      // Through markVisited, so the minimap revision tracks the visited set —
      // DrawMiniMap caches on it and would otherwise go stale.
      this.markVisited(pt.x, pt.y);
    }
  }

  // ── Minimap-relevant revision ─────────────────────────────────────────────

  /**
   * Bumped whenever anything the minimap raster derives from changes.
   *
   * The minimap is a pure function of the visited set, each visited tile's
   * minimap colour, and the exits. It was nevertheless rebuilt from scratch on
   * every frame, walking all 10 000 tiles of a 100x100 map ~60 times a second
   * — measured at 2 429 `UI_SetMinimapColor` calls per frame, 79% of the whole
   * frame. Callers that cache the raster (see `RogueGame.DrawMiniMap`) compare
   * against this to know when it has gone stale.
   *
   * It covers the visited set (`markVisited`, `setAllAsUnvisited`) and tile
   * models (`setTileModelAt`, which carries the minimap colour). Exits are
   * static after generation, so they are deliberately not tracked.
   *
   * Not a C# field: the original rebuilt a GDIBitmap every frame too, but on a
   * retained-mode surface that was cheap.
   */
  private m_MinimapRevision = 0;

  get minimapRevision(): number {
    return this.m_MinimapRevision;
  }

  bumpMinimapRevision(): void {
    this.m_MinimapRevision++;
  }

  /**
   * Marks a tile visited, bumping the revision only on an actual change.
   *
   * Tiles must be marked through this (or `setAllAsUnvisited`) rather than by
   * assigning `tile.isVisited` directly, or the revision will not track the
   * visited set and a cached minimap will go stale.
   */
  markVisited(x: number, y: number): void {
    const tile = this.getTileAt(x, y);
    if (tile === null || tile.isVisited) return;
    tile.isVisited = true;
    this.bumpMinimapRevision();
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

  /** C# `HasActor` — is this actor currently in *this* map? */
  hasActor(actor: Actor): boolean {
    return this.actorsList.includes(actor);
  }

  /**
   * C# `PlaceActorAt` — **add or move** an actor to a position.
   *
   * The add-or-move distinction is load-bearing and this method used to get it
   * wrong: it always pushed onto `actorsList`, so every call made for an actor
   * already on the map left a permanent duplicate behind. `DoMoveActor` routes
   * all movement through here (as C# does), so the player accumulated two
   * duplicate entries per step taken. Nothing crashed — the per-turn gauge loop
   * just iterated the duplicates, so the player starved to death on turn 9 and
   * the actor count only ever grew.
   *
   * Note the ordering: an actor moving to an occupied tile is rejected, so
   * callers that swap two actors must `removeActor` the occupant first (which
   * `DoSwitchPlace` and `DoShoveActor` already do).
   */
  placeActor(actor: Actor, pos: Point): void {
    const other = this.getActorAt(pos.x, pos.y);
    if (other === actor) throw new Error("actor already at position");
    if (other !== null) throw new Error(`another actor already at position (${pos.toString()})`);
    if (!this.isInBounds(pos.x, pos.y))
      throw new RangeError(`position out of map bounds (${pos.x},${pos.y})`);

    if (this.hasActor(actor)) {
      // Moving: reindex, but keep the single list entry.
      this.actorsByPos.delete(Map.key(actor.location.position.x, actor.location.position.y));
    } else {
      this.actorsList.push(actor);
    }
    this.actorsByPos.set(Map.key(pos.x, pos.y), actor);
    actor.location = new Location(this, pos);
    this.m_checkNextActorIndex = 0; // invalidated
  }

  /**
   * Throws if the actor list and the position index have drifted apart.
   *
   * Not a C# method: C# gets this consistency for free from
   * `List.Contains` + a dictionary, and a duplicate there is a silent
   * performance bug rather than a correctness one. In TypeScript the same
   * mistake is silent *and* corrupts the simulation, as `placeActor` above
   * did. The headless sim calls this once per turn so the next regression of
   * this class fails loudly at the turn it starts, rather than as a strange
   * death 40 turns later. O(n); a turn costs far more than that.
   */
  assertActorIntegrity(): void {
    const seen = new Set<Actor>();
    for (const actor of this.actorsList) {
      if (seen.has(actor))
        throw new Error(
          `Map "${this.name}": actor "${actor.theName}" appears ${this.actorsList.filter((a) => a === actor).length}x in the actor list`
        );
      seen.add(actor);

      const pos = actor.location.position;
      if (actor.location.map !== this)
        throw new Error(`Map "${this.name}": actor "${actor.theName}" is listed here but located on another map`);
      if (this.getActorAt(pos.x, pos.y) !== actor)
        throw new Error(
          `Map "${this.name}": actor "${actor.theName}" is at ${pos.toString()} but the index has ${this.getActorAt(pos.x, pos.y)?.theName ?? "nothing"}`
        );
    }
    if (this.actorsByPos.size !== this.actorsList.length)
      throw new Error(
        `Map "${this.name}": ${this.actorsList.length} actors listed but ${this.actorsByPos.size} indexed by position`
      );
  }

  removeActor(actor: Actor): void {
    // C# returns early if the actor is not in this map's list, and crucially
    // does *not* touch the position index. Deleting unconditionally (as this
    // once did) would evict whichever unrelated actor stands at that point.
    if (!this.hasActor(actor)) return;

    const idx = this.actorsList.indexOf(actor);
    this.actorsList.splice(idx, 1);
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
        return Map.keyToPoint(k);
      }
    }
    return null;
  }

  /**
   * Is there a fire on this tile? Still Alive, Release 6-1.
   *
   * A property of the *tile*, not a scan of decorations, which is why the flag
   * exists at all: the spread loop asks this of every tile on the map every turn.
   */
  isAnyTileFireThere(pos: Point): boolean {
    return this.getTileAt(pos.x, pos.y)?.isOnFire ?? false;
  }

  /**
   * Can a fire spread to this tile? Still Alive, Release 5-2, with Release 6-1.
   *
   * Three ways to be in inflammable, and all three are load-bearing:
   *
   * - not a flammable model (5 tiles out of 143, so this is the common case)
   * - already burnt, when `checkForScorching` -- nothing left to burn
   * - already alight, when `checkForScorching` -- the caller is asking "could this
   *   *catch*, not "is this lit"
   *
   * The parameter is the C#'s, and it is a parameter because two callers want
   * different things: the spread loop passes `true`, and a flame weapon's splash
   * passes `false` so it can deliberately land on an already-burnt tile.
   */
  isInflammableTile(pos: Point, checkForScorching: boolean): boolean {
    const tile = this.getTileAt(pos.x, pos.y);
    if (tile === null || !tile.model.isFlammable) return true;
    if (checkForScorching && (tile.isScorched || tile.isOnFire)) return true;
    return false;
  }

  /** Is this a water tile? Still Alive, Release 6-1 -- water does not burn. */
  isAnyTileWaterThere(pos: Point): boolean {
    return this.getTileAt(pos.x, pos.y)?.model.isWater ?? false;
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
    this.indexScent(scent);
  }

  /**
   * Put an already-listed scent into the position index, without touching
   * `scentsList`.
   *
   * Separate from `addScent` purely so the save loader can rebuild the index
   * from a list it has already restored. It used to hand-roll the key:
   * `` const key = `${scent.position.x},${scent.position.y}` `` in
   * `serialization/specs.ts`, which is a second definition of a format this
   * file owns and did not track. The loader's copy was the only thing that
   * failed when the key encoding changed, and it failed as "a restored scent
   * cannot be found at its own position" rather than as a type error.
   */
  indexScent(scent: OdorScent): void {
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

  /**
   * C# `Map.TileAlreadyHasScorchDecoration` -- `Data/Map.cs:406-416`, Release 6-3.
   *
   * Is there already a scorch mark on this tile? A `ScorchBurntTile` call with
   * `damage > 0` that answers yes does nothing at all -- not even the
   * `IsScorched` flag -- which is the point: Release 5-2 added it so a spreading
   * tile fire cannot stack marks on a tile an explosion already blackened.
   *
   * All five marks are listed, including the centre one, so "already scorched"
   * means scorched by *any* of the tiers rather than by this one. A tile that took
   * a 200-damage blast and later a 10-damage one keeps the big mark.
   *
   * This imports `GameImages` into `data/`, which nothing else here does. That is
   * safe rather than merely convenient: `GameImages` is 700+ lines of string
   * constants with **no imports at all**, so the edge cannot close a cycle. It is
   * the one place the layering is crossed, and it is crossed to keep the C#'s
   * signature instead of threading five image ids through every caller.
   */
  tileAlreadyHasScorchDecoration(x: number, y: number): boolean {
    const tile = this.getTileAt(x, y);
    if (tile === null) return false;
    return (
      tile.hasDecoration(GameImages.DECO_SCORCH_MARK_OUTER_WALL) ||
      tile.hasDecoration(GameImages.DECO_SCORCH_MARK_INNER_WALL) ||
      tile.hasDecoration(GameImages.DECO_SCORCH_MARK_OUTER_FLOOR) ||
      tile.hasDecoration(GameImages.DECO_SCORCH_MARK_INNER_FLOOR) ||
      tile.hasDecoration(GameImages.DECO_SCORCH_MARK_CENTER_FLOOR)
    );
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
