/**
 * Timed task: remove a decoration from a tile.
 * Ported from src/Engine/Tasks/TaskRemoveDecoration.cs
 */

import { Map as GameMap } from "@data/Map";
import { TimedTask } from "@data/TimedTask";

export class TaskRemoveDecoration extends TimedTask {
  private readonly m_X: number;
  private readonly m_Y: number;
  private readonly m_imageID: string;

  constructor(turns: number, x: number, y: number, imageID: string) {
    super(turns);
    this.m_X = x;
    this.m_Y = y;
    this.m_imageID = imageID;
  }

  override trigger(m: GameMap): void {
    m.getTileAt(this.m_X, this.m_Y)?.removeDecoration(this.m_imageID);
  }
}
