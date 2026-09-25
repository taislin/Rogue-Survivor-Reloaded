/**
 * Message feed - port of src/Engine/MessageManager.cs
 */

import { Message } from "@data/Message";
import { Color } from "@engine/Color";
import { IRogueUI } from "@engine/IRogueUI";

export class MessageManager {
  private readonly m_Messages: Message[] = [];
  private readonly m_LinesSpacing: number;
  private readonly m_FadeoutFactor: number;
  private readonly m_History: Message[];
  private readonly m_HistorySize: number;

  get count(): number {
    return this.m_Messages.length;
  }

  get history(): readonly Message[] {
    return this.m_History;
  }

  constructor(linesSpacing: number, fadeoutFactor: number, historySize: number) {
    if (linesSpacing < 0) throw new Error("linesSpacing < 0");
    if (fadeoutFactor < 0) throw new Error("fadeoutFactor < 0");

    this.m_LinesSpacing = linesSpacing;
    this.m_FadeoutFactor = fadeoutFactor;
    this.m_HistorySize = historySize;
    this.m_History = [];
  }

  // ── Managing messages ───────────────────────────────────────────────────
  clear(): void {
    this.m_Messages.length = 0;
  }

  clearHistory(): void {
    this.m_History.length = 0;
  }

  add(msg: Message): void {
    this.m_Messages.push(msg);
    this.m_History.push(msg);
    if (this.m_History.length > this.m_HistorySize) {
      this.m_History.splice(0, 1);
    }
  }

  removeLastMessage(): void {
    if (this.m_Messages.length === 0) return;
    this.m_Messages.splice(this.m_Messages.length - 1, 1);
  }

  // ── Drawing ─────────────────────────────────────────────────────────────
  draw(ui: IRogueUI, freshMessagesTurn: number, gx: number, gy: number): void {
    for (let i = 0; i < this.m_Messages.length; i++) {
      const msg = this.m_Messages[i];

      const alpha = Math.max(64, 255 - this.m_FadeoutFactor * (this.m_Messages.length - 1 - i));
      const isLatest = msg.turn >= freshMessagesTurn;
      const dimmedColor = Color.withAlpha(alpha, msg.color);

      if (isLatest) ui.UI_DrawStringBold(dimmedColor, msg.text, gx, gy);
      else ui.UI_DrawString(dimmedColor, msg.text, gx, gy);

      gy += this.m_LinesSpacing;
    }
  }
}
