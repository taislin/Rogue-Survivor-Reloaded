/**
 * `localStorage` access that is safe outside a browser.
 *
 * The C# original persisted `Session`, `GameOptions`, `Keybindings`,
 * `HiScoreTable` and the manual/graveyard text files to disk. The port targets
 * the browser, so those became `localStorage` JSON — but the engine also has to
 * run in Node (the headless simulator in `sim/`, and any future Vitest run).
 * In Node the bare identifier `localStorage` does not exist at all, and merely
 * *naming* it throws a `ReferenceError`. That is not a hypothetical: the sim's
 * first crash after this module landed was `m_HiScoreTable` being undefined
 * because `Run()` — which initialises the table — is bypassed by the runner.
 *
 * Every module therefore goes through `storage` instead of touching the global.
 * When there is no real `localStorage` we fall back to an in-memory `Map`, so a
 * save → load round-trip still works *within one process* rather than throwing.
 * Note this fallback is not persistence: a Node process that exits loses it,
 * which is what the simulator wants (each run starts clean).
 */

/** The subset of the DOM `Storage` interface the engine actually uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** An in-process stand-in for `localStorage`. */
class MemoryStorage implements StorageLike {
  protected readonly m_Map = new Map<string, string>();

  getItem(key: string): string | null {
    const v = this.m_Map.get(key);
    return v === undefined ? null : v;
  }

  setItem(key: string, value: string): void {
    this.m_Map.set(key, value);
  }

  removeItem(key: string): void {
    this.m_Map.delete(key);
  }
}

class NeutralinoStorage extends MemoryStorage {
  private m_FilePath: string | null = null;

  constructor() {
    super();
    this.initAsync();
  }

  private async initAsync(): Promise<void> {
    try {
      const win = window as any;
      if (win.Neutralino && win.Neutralino.os && win.Neutralino.filesystem) {
        const dataPath = await win.Neutralino.os.getPath("data");
        const dirPath = `${dataPath}/rogue-survivor-reloaded`;
        this.m_FilePath = `${dirPath}/storage.json`;
        
        try {
          await win.Neutralino.filesystem.createDirectory(dirPath);
        } catch {
          // directory might already exist
        }

        try {
          const content = await win.Neutralino.filesystem.readFileData(this.m_FilePath);
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed === "object") {
            for (const [k, v] of Object.entries(parsed)) {
              if (typeof v === "string") {
                this.m_Map.set(k, v);
              }
            }
          }
        } catch {
          // file doesn't exist yet or invalid JSON
        }
      }
    } catch (e) {
      console.warn("[NeutralinoStorage] failed to initialize AppData persistence:", e);
    }
  }

  private persist(): void {
    if (!this.m_FilePath) return;
    try {
      const win = window as any;
      if (win.Neutralino && win.Neutralino.filesystem) {
        const obj: Record<string, string> = {};
        for (const [k, v] of this.m_Map.entries()) {
          obj[k] = v;
        }
        win.Neutralino.filesystem.writeFileData(this.m_FilePath, JSON.stringify(obj, null, 2)).catch((err: any) => {
          console.warn("[NeutralinoStorage] failed to write storage.json:", err);
        });
      }
    } catch (e) {
      console.warn("[NeutralinoStorage] error writing storage:", e);
    }
  }

  override setItem(key: string, value: string): void {
    super.setItem(key, value);
    this.persist();
  }

  override removeItem(key: string): void {
    super.removeItem(key);
    this.persist();
  }
}

const memory = new MemoryStorage();

/**
 * `true` when running inside a NeutralinoJS desktop container.
 */
export const hasNeutralino: boolean = typeof window !== "undefined" && typeof (window as any).NL_OS !== "undefined";

/**
 * `true` when a real `localStorage` is present, i.e. we are in a browser.
 * Callers that must warn the player ("your progress will not be saved") can
 * test this; pure persistence code should not bother.
 */
export const hasLocalStorage: boolean = typeof localStorage !== "undefined";

/**
 * The storage the engine should use. Always safe to call.
 *
 * Wrapped in a try/catch because merely *accessing* `localStorage` throws in
 * some sandboxes (and a browser with site data blocked can throw on use), and
 * because `typeof` alone does not prove the global is usable.
 */
export const storage: StorageLike = (() => {
  if (hasNeutralino) {
    return new NeutralinoStorage();
  }
  try {
    if (typeof localStorage === "undefined") return memory;
    // Probe it: a browser with storage disabled throws on access, not on decl.
    localStorage.getItem("__rs_probe__");
    return localStorage;
  } catch {
    return memory;
  }
})();
