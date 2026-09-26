import { storage } from "@engine/storage";

export interface SaveFile {
  version: string;
  timestamp: number;
  sessionData: any;
  optionsData: any;
  keybindingsData: any;
}

export class GameSaveManager {
  private static readonly VERSION = "alpha10.1-ts-port";
  private static readonly SLOT_PREFIX = "rogueSurvivor_save_";
  private static readonly MAX_SLOTS = 10;

  public static async saveGame(slot: number, sessionData: any, optionsData?: any, keybindingsData?: any): Promise<boolean> {
    if (slot < 0 || slot >= this.MAX_SLOTS) return false;

    const saveFile: SaveFile = {
      version: this.VERSION,
      timestamp: Date.now(),
      sessionData,
      optionsData,
      keybindingsData
    };

    const json = JSON.stringify(saveFile);
    const key = `${this.SLOT_PREFIX}${slot}`;

    try {
      // Try localStorage first
      storage.setItem(key, json);
      return true;
    } catch (e) {
      // If localStorage is full (> 5MB or quota exceeded), fall back to IndexedDB
      try {
        await this.saveToIndexedDB(key, json);
        return true;
      } catch (idbErr) {
        console.error("Failed to save game to localStorage and IndexedDB", idbErr);
        return false;
      }
    }
  }

  public static async loadGame(slot: number): Promise<SaveFile | null> {
    if (slot < 0 || slot >= this.MAX_SLOTS) return null;
    const key = `${this.SLOT_PREFIX}${slot}`;

    try {
      const json = storage.getItem(key);
      if (json) {
        return JSON.parse(json) as SaveFile;
      }

      // Check IndexedDB fallback
      const idbJson = await this.loadFromIndexedDB(key);
      if (idbJson) {
        return JSON.parse(idbJson) as SaveFile;
      }
    } catch (e) {
      console.error(`Failed to load save slot ${slot}`, e);
    }
    return null;
  }

  public static async hasSave(slot: number): Promise<boolean> {
    if (slot < 0 || slot >= this.MAX_SLOTS) return false;
    const key = `${this.SLOT_PREFIX}${slot}`;
    if (storage.getItem(key) !== null) return true;

    try {
      const idbJson = await this.loadFromIndexedDB(key);
      return idbJson !== null;
    } catch (e) {
      return false;
    }
  }

  public static async deleteSave(slot: number): Promise<void> {
    if (slot < 0 || slot >= this.MAX_SLOTS) return;
    const key = `${this.SLOT_PREFIX}${slot}`;
    storage.removeItem(key);
    try {
      await this.deleteFromIndexedDB(key);
    } catch (e) {}
  }

  // IndexedDB helpers for large saves
  private static async openIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("RogueSurvivorDB", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("saves")) {
          db.createObjectStore("saves");
        }
      };
    });
  }

  private static async saveToIndexedDB(key: string, value: string): Promise<void> {
    const db = await this.openIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("saves", "readwrite");
      const store = transaction.objectStore("saves");
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private static async loadFromIndexedDB(key: string): Promise<string | null> {
    const db = await this.openIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("saves", "readonly");
      const store = transaction.objectStore("saves");
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  private static async deleteFromIndexedDB(key: string): Promise<void> {
    const db = await this.openIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("saves", "readwrite");
      const store = transaction.objectStore("saves");
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
