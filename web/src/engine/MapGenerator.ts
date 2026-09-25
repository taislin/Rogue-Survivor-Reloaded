/**
 * MapGenerator.
 * Ported from src/Engine/MapGenerator.cs
 *
 * Abstract base for all map generators: tile filling, actor/object placement
 * and small geometry helpers shared by BaseMapGenerator / town generators.
 */

import type { Actor } from '@data/Actor';
import type { Item } from '@data/Item';
import { Map as GameMap } from '@data/Map';
import type { MapObject } from '@data/MapObject';
import type { Tile } from '@data/Tile';
import type { TileModel } from '@data/TileModel';
import { Direction } from '@engine/Direction';
import { DiceRoller } from '@engine/DiceRoller';
import { Point } from '@engine/Point';
import { Rect } from '@engine/Rect';
import { Rules } from '@engine/Rules';
import { DoorWindow } from '@engine/mapobjects/MapObjects';

/** Decorator callback invoked by the Tile* helpers (C# `Action<Tile, TileModel, int, int>`). */
export type TileDecoratorFn = (tile: Tile, prevModel: TileModel, x: number, y: number) => void;

export abstract class MapGenerator {
  protected readonly m_Rules: Rules;

  constructor(rules: Rules) {
    if (!rules) throw new Error('rules');
    this.m_Rules = rules;
  }

  // ── Generating a new map ──────────────────────────────────────────────────
  abstract generate(seed: number): GameMap;

  // ── Tile filling ──────────────────────────────────────────────────────────

  tileFill(map: GameMap, model: TileModel): void;
  tileFill(map: GameMap, model: TileModel, decoratorFn: TileDecoratorFn): void;
  tileFill(map: GameMap, model: TileModel, rect: Rect): void;
  tileFill(map: GameMap, model: TileModel, rect: Rect, decoratorFn: TileDecoratorFn): void;
  tileFill(map: GameMap, model: TileModel, left: number, top: number, width: number, height: number): void;
  tileFill(
    map: GameMap,
    model: TileModel,
    left: number,
    top: number,
    width: number,
    height: number,
    decoratorFn: TileDecoratorFn
  ): void;
  tileFill(
    map: GameMap,
    model: TileModel,
    rectOrLeft?: Rect | number | TileDecoratorFn,
    topOrDecorator?: number | TileDecoratorFn,
    width?: number,
    height?: number,
    decoratorFn?: TileDecoratorFn
  ): void {
    let left: number;
    let top: number;
    let w: number;
    let h: number;
    let deco: TileDecoratorFn | undefined;
    if (rectOrLeft instanceof Rect) {
      left = rectOrLeft.left;
      top = rectOrLeft.top;
      w = rectOrLeft.width;
      h = rectOrLeft.height;
      deco = topOrDecorator as TileDecoratorFn | undefined;
    } else if (typeof rectOrLeft === 'number') {
      left = rectOrLeft;
      top = topOrDecorator as number;
      w = width!;
      h = height!;
      deco = decoratorFn;
    } else if (typeof rectOrLeft === 'function') {
      left = 0;
      top = 0;
      w = map.width;
      h = map.height;
      deco = rectOrLeft;
    } else {
      left = 0;
      top = 0;
      w = map.width;
      h = map.height;
      deco = undefined;
    }
    for (let x = left; x < left + w; x++) {
      for (let y = top; y < top + h; y++) {
        const tile = map.getTileAt(x, y);
        if (!tile) continue;
        const prevModel = tile.model;
        map.setTileModelAt(x, y, model);
        if (deco) deco(tile, prevModel, x, y);
      }
    }
  }

  tileHLine(map: GameMap, model: TileModel, left: number, top: number, width: number): void;
  tileHLine(
    map: GameMap,
    model: TileModel,
    left: number,
    top: number,
    width: number,
    decoratorFn: TileDecoratorFn
  ): void;
  tileHLine(
    map: GameMap,
    model: TileModel,
    left: number,
    top: number,
    width: number,
    decoratorFn?: TileDecoratorFn
  ): void {
    for (let x = left; x < left + width; x++) {
      const tile = map.getTileAt(x, top);
      if (!tile) continue;
      const prevModel = tile.model;
      map.setTileModelAt(x, top, model);
      if (decoratorFn) decoratorFn(tile, prevModel, x, top);
    }
  }

  tileVLine(map: GameMap, model: TileModel, left: number, top: number, height: number): void;
  tileVLine(
    map: GameMap,
    model: TileModel,
    left: number,
    top: number,
    height: number,
    decoratorFn: TileDecoratorFn
  ): void;
  tileVLine(
    map: GameMap,
    model: TileModel,
    left: number,
    top: number,
    height: number,
    decoratorFn?: TileDecoratorFn
  ): void {
    for (let y = top; y < top + height; y++) {
      const tile = map.getTileAt(left, y);
      if (!tile) continue;
      const prevModel = tile.model;
      map.setTileModelAt(left, y, model);
      if (decoratorFn) decoratorFn(tile, prevModel, left, y);
    }
  }

  tileRectangle(map: GameMap, model: TileModel, rect: Rect): void;
  tileRectangle(
    map: GameMap,
    model: TileModel,
    rect: Rect,
    decoratorFn: TileDecoratorFn
  ): void;
  tileRectangle(map: GameMap, model: TileModel, left: number, top: number, width: number, height: number): void;
  tileRectangle(
    map: GameMap,
    model: TileModel,
    left: number,
    top: number,
    width: number,
    height: number,
    decoratorFn: TileDecoratorFn
  ): void;
  tileRectangle(
    map: GameMap,
    model: TileModel,
    rectOrLeft: Rect | number,
    topOrDecorator?: number | TileDecoratorFn,
    width?: number,
    height?: number,
    decoratorFn?: TileDecoratorFn
  ): void {
    let left: number;
    let top: number;
    let w: number;
    let h: number;
    let deco: TileDecoratorFn | undefined;
    if (rectOrLeft instanceof Rect) {
      left = rectOrLeft.left;
      top = rectOrLeft.top;
      w = rectOrLeft.width;
      h = rectOrLeft.height;
      deco = topOrDecorator as TileDecoratorFn | undefined;
    } else {
      left = rectOrLeft;
      top = topOrDecorator as number;
      w = width!;
      h = height!;
      deco = decoratorFn;
    }
    this.tileHLine(map, model, left, top, w, deco!);
    this.tileHLine(map, model, left, top + h - 1, w, deco!);
    this.tileVLine(map, model, left, top, h, deco!);
    this.tileVLine(map, model, left + w - 1, top, h, deco!);
  }

  digUntil(
    map: GameMap,
    model: TileModel,
    startPos: Point,
    digDirection: Direction,
    stopFn: (p: Point) => boolean
  ): Point {
    let digPos = digDirection.applyTo(startPos);
    while (map.isInBoundsPoint(digPos) && !stopFn(digPos)) {
      // set tile.
      map.setTileModelAt(digPos.x, digPos.y, model);
      // continue digging.
      digPos = digDirection.applyTo(digPos);
    }
    return digPos;
  }

  doForEachTile(map: GameMap, rect: Rect, doFn: (p: Point) => void): void {
    if (!doFn) throw new Error('doFn');
    void map;
    for (let x = rect.left; x < rect.right; x++) {
      for (let y = rect.top; y < rect.bottom; y++) {
        doFn(new Point(x, y));
      }
    }
  }

  checkForEachTile(map: GameMap, rect: Rect, predFn: (p: Point) => boolean): boolean {
    if (!predFn) throw new Error('predFn');
    void map;
    for (let x = rect.left; x < rect.right; x++) {
      for (let y = rect.top; y < rect.bottom; y++) {
        if (!predFn(new Point(x, y))) return false;
      }
    }
    return true;
  }

  doForEachAdjacentInMap(map: GameMap, pt: Point, doFn: (p: Point) => void): void {
    if (!doFn) throw new Error('doFn');
    for (const d of Direction.COMPASS) {
      const adjPt = d.applyTo(pt);
      if (!map.isInBoundsPoint(adjPt)) continue;
      doFn(adjPt);
    }
  }

  // ── Placing actors ────────────────────────────────────────────────────────

  actorPlace(roller: DiceRoller, maxTries: number, map: GameMap, actor: Actor): boolean;
  actorPlace(
    roller: DiceRoller,
    maxTries: number,
    map: GameMap,
    actor: Actor,
    left: number,
    top: number,
    width: number,
    height: number
  ): boolean;
  actorPlace(
    roller: DiceRoller,
    maxTries: number,
    map: GameMap,
    actor: Actor,
    goodPositionFn: (p: Point) => boolean
  ): boolean;
  actorPlace(
    roller: DiceRoller,
    maxTries: number,
    map: GameMap,
    actor: Actor,
    left: number,
    top: number,
    width: number,
    height: number,
    goodPositionFn: (p: Point) => boolean
  ): boolean;
  actorPlace(
    roller: DiceRoller,
    maxTries: number,
    map: GameMap,
    actor: Actor,
    leftOrFn?: number | ((p: Point) => boolean),
    top?: number,
    width?: number,
    height?: number,
    goodPositionFn?: (p: Point) => boolean
  ): boolean {
    if (!map) throw new Error('map');
    if (!actor) throw new Error('actor');

    let left = 0;
    let topPos = 0;
    let w = map.width;
    let h = map.height;
    let goodFn: ((p: Point) => boolean) | null = null;
    if (typeof leftOrFn === 'function') {
      goodFn = leftOrFn;
    } else if (typeof leftOrFn === 'number') {
      left = leftOrFn;
      topPos = top!;
      w = width!;
      h = height!;
      goodFn = goodPositionFn ?? null;
    }

    // try <maxTries> times to find a walkable position and place the actor there.
    for (let i = 0; i < maxTries; i++) {
      const position = new Point(
        roller.roll(left, left + w),
        roller.roll(topPos, topPos + h)
      );
      if (
        this.m_Rules.isWalkableFor(actor, map, position.x, position.y).ok &&
        (!goodFn || goodFn(position))
      ) {
        map.placeActor(actor, position);
        return true;
      }
    }

    // failed.
    return false;
  }

  // ── Map objects ───────────────────────────────────────────────────────────

  mapObjectPlace(map: GameMap, x: number, y: number, mapObj: MapObject): void {
    if (!map.getMapObjectAt(x, y)) map.placeMapObject(mapObj, new Point(x, y));
  }

  mapObjectFill(map: GameMap, rect: Rect, createFn: (p: Point) => MapObject | null): void;
  mapObjectFill(
    map: GameMap,
    left: number,
    top: number,
    width: number,
    height: number,
    createFn: (p: Point) => MapObject | null
  ): void;
  mapObjectFill(
    map: GameMap,
    rectOrLeft: Rect | number,
    topOrFn?: number | ((p: Point) => MapObject | null),
    width?: number,
    height?: number,
    createFn?: (p: Point) => MapObject | null
  ): void {
    let left: number;
    let top: number;
    let w: number;
    let h: number;
    let fn: (p: Point) => MapObject | null;
    if (rectOrLeft instanceof Rect) {
      left = rectOrLeft.left;
      top = rectOrLeft.top;
      w = rectOrLeft.width;
      h = rectOrLeft.height;
      fn = topOrFn as (p: Point) => MapObject | null;
    } else {
      left = rectOrLeft;
      top = topOrFn as number;
      w = width!;
      h = height!;
      fn = createFn!;
    }
    for (let x = left; x < left + w; x++) {
      for (let y = top; y < top + h; y++) {
        const p = new Point(x, y);
        const newMapObject = fn(p);
        if (newMapObject && !map.getMapObjectAt(x, y)) {
          map.placeMapObject(newMapObject, new Point(x, y));
        }
      }
    }
  }

  mapObjectPlaceInGoodPosition(
    map: GameMap,
    rect: Rect,
    isGoodPosFn: (p: Point) => boolean,
    roller: DiceRoller,
    createFn: (p: Point) => MapObject | null
  ): void;
  mapObjectPlaceInGoodPosition(
    map: GameMap,
    left: number,
    top: number,
    width: number,
    height: number,
    isGoodPosFn: (p: Point) => boolean,
    roller: DiceRoller,
    createFn: (p: Point) => MapObject | null
  ): void;
  mapObjectPlaceInGoodPosition(
    map: GameMap,
    rectOrLeft: Rect | number,
    topOrFn?: number | ((p: Point) => boolean),
    widthOrRoller?: number | DiceRoller,
    heightOrFn?: number | ((p: Point) => MapObject | null),
    isGoodPosFn?: (p: Point) => boolean,
    roller?: DiceRoller,
    createFn?: (p: Point) => MapObject | null
  ): void {
    let left: number;
    let top: number;
    let w: number;
    let h: number;
    let goodFn: (p: Point) => boolean;
    let roll: DiceRoller;
    let fn: (p: Point) => MapObject | null;
    if (rectOrLeft instanceof Rect) {
      left = rectOrLeft.left;
      top = rectOrLeft.top;
      w = rectOrLeft.width;
      h = rectOrLeft.height;
      goodFn = topOrFn as (p: Point) => boolean;
      roll = widthOrRoller as DiceRoller;
      fn = heightOrFn as (p: Point) => MapObject | null;
    } else {
      left = rectOrLeft;
      top = topOrFn as number;
      w = widthOrRoller as number;
      h = heightOrFn as number;
      goodFn = isGoodPosFn!;
      roll = roller!;
      fn = createFn!;
    }

    // find all good positions.
    let goodList: Point[] | null = null;
    for (let x = left; x < left + w; x++) {
      for (let y = top; y < top + h; y++) {
        const p = new Point(x, y);
        if (goodFn(p) && !map.getMapObjectAt(x, y)) {
          if (!goodList) goodList = [];
          goodList.push(p);
        }
      }
    }

    // pick a good position at random and put the object there.
    if (!goodList) return;
    const iValid = roll.roll(0, goodList.length);
    const mapObj = fn(goodList[iValid]);
    if (mapObj) map.placeMapObject(mapObj, goodList[iValid]);
  }

  // ── Items ─────────────────────────────────────────────────────────────────

  itemsDrop(
    map: GameMap,
    rect: Rect,
    isGoodPositionFn: (p: Point) => boolean,
    createFn: (p: Point) => Item | null
  ): void {
    for (let x = rect.left; x < rect.left + rect.width; x++) {
      for (let y = rect.top; y < rect.top + rect.height; y++) {
        const p = new Point(x, y);
        if (isGoodPositionFn(p)) {
          const it = createFn(p);
          if (it) map.dropItemAt(it, p);
        }
      }
    }
  }

  // ── Clearing whole areas ──────────────────────────────────────────────────

  /**
   * Remove all Actors, MapObjects, Items, Decorations and Zones in a rect.
   * @param clearZones alpha10
   */
  protected clearRectangle(map: GameMap, rect: Rect, clearZones: boolean = true): void {
    for (let x = rect.left; x < rect.right; x++) {
      for (let y = rect.top; y < rect.bottom; y++) {
        const mapObj = map.getMapObjectAt(x, y);
        if (mapObj) map.removeMapObject(mapObj);

        const stack = map.getItemsAt(new Point(x, y));
        if (stack) {
          while (!stack.isEmpty) {
            const first = stack.getItem(0);
            if (!first) break;
            map.removeItemAt(first, new Point(x, y));
          }
        }

        map.getTileAt(x, y)?.removeAllDecorations();

        if (clearZones) map.removeAllZonesAt(x, y);

        const actorThere = map.getActorAt(x, y);
        if (actorThere) map.removeActor(actorThere);
      }
    }
  }

  // ── Predicates and actions ────────────────────────────────────────────────

  /** Apply an action on each adjacent tiles within map bounds. */
  forEachAdjacent(map: GameMap, x: number, y: number, doFn: (p: Point) => void): void {
    const p = new Point(x, y);
    for (const d of Direction.COMPASS) {
      const adj = d.applyTo(p);
      if (!map.isInBoundsPoint(adj)) continue;
      doFn(adj);
    }
  }

  /** Count how many adjacent tiles within map bounds match a predicate. */
  countForEachAdjacent(
    map: GameMap,
    x: number,
    y: number,
    checkFn: (p: Point) => boolean
  ): number {
    let count = 0;
    const p = new Point(x, y);
    for (const d of Direction.COMPASS) {
      const adj = d.applyTo(p);
      if (!map.isInBoundsPoint(adj)) continue;
      if (checkFn(adj)) ++count;
    }
    return count;
  }

  countAdjWalls(map: GameMap, x: number, y: number): number;
  countAdjWalls(map: GameMap, p: Point): number;
  countAdjWalls(map: GameMap, xOrP: number | Point, y?: number): number {
    const x = typeof xOrP === 'number' ? xOrP : xOrP.x;
    const yy = typeof xOrP === 'number' ? y! : xOrP.y;
    return this.countForEachAdjacent(map, x, yy, pt => {
      const tile = map.getTileAt(pt.x, pt.y);
      return !tile || !tile.model.isWalkable;
    });
  }

  countAdjWalkables(map: GameMap, x: number, y: number): number {
    return this.countForEachAdjacent(map, x, y, pt => {
      const tile = map.getTileAt(pt.x, pt.y);
      return !!tile && tile.model.isWalkable;
    });
  }

  countAdjDoors(map: GameMap, x: number, y: number): number {
    return this.countForEachAdjacent(
      map,
      x,
      y,
      pt => map.getMapObjectAt(pt.x, pt.y) instanceof DoorWindow
    );
  }

  // alpha10.1
  countAdjMapObjects(map: GameMap, x: number, y: number): number {
    return this.countForEachAdjacent(map, x, y, pt => map.getMapObjectAt(pt.x, pt.y) !== null);
  }

  placeIf(
    map: GameMap,
    x: number,
    y: number,
    floor: TileModel,
    predicateFn: (x: number, y: number) => boolean,
    createFn: (x: number, y: number) => MapObject | null
  ): void {
    if (predicateFn(x, y)) {
      const mapObj = createFn(x, y);
      if (mapObj === null) return;
      map.setTileModelAt(x, y, floor);
      this.mapObjectPlace(map, x, y, mapObj);
    }
  }

  isAccessible(map: GameMap, x: number, y: number): boolean {
    return this.countForEachAdjacent(map, x, y, pt => map.isWalkable(pt.x, pt.y)) >= 6;
  }

  hasNoObjectAt(map: GameMap, x: number, y: number): boolean {
    return map.getMapObjectAt(x, y) === null;
  }

  isInside(map: GameMap, x: number, y: number): boolean {
    return !!map.getTileAt(x, y)?.isInside;
  }

  hasInRange(map: GameMap, from: Point, maxDistance: number, predFn: (p: Point) => boolean): boolean {
    const xmin = Math.max(0, from.x - maxDistance);
    const ymin = Math.max(0, from.y - maxDistance);
    const xmax = Math.min(map.width - 1, from.x + maxDistance);
    const ymax = Math.min(map.height - 1, from.y + maxDistance);
    for (let x = xmin; x <= xmax; x++) {
      for (let y = ymin; y <= ymax; y++) {
        if (x === from.x && y === from.y) continue;
        if (predFn(new Point(x, y))) return true;
      }
    }
    return false;
  }
}
