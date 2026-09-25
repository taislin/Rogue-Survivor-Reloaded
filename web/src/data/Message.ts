import { Color } from "@engine/Color";

export class Message {
  text: string;
  color: Color;
  readonly turn: number;

  constructor(text: string, turn: number, color: Color = Color.White) {
    this.text = text;
    this.turn = turn;
    this.color = color;
  }
}
