import { Rect } from "@engine/Rect";

export class Zone {
  name: string;
  bounds: Rect;
  private attributes: Map<string, any> | null = null;

  constructor(name: string, bounds: Rect) {
    this.name = name;
    this.bounds = bounds;
  }

  hasGameAttribute(key: string): boolean {
    if (!this.attributes) return false;
    return this.attributes.has(key);
  }

  setGameAttribute<T>(key: string, value: T): void {
    if (!this.attributes) {
      this.attributes = new Map<string, any>();
    }
    this.attributes.set(key, value);
  }

  getGameAttribute<T>(key: string): T | undefined {
    if (!this.attributes) return undefined;
    return this.attributes.get(key) as T;
  }
}
