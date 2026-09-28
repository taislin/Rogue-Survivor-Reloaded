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

/**
 * `MemoryStorage` plus a flat JSON mirror in the desktop app's data directory.
 *
 * ## The race that was here
 *
 * `initAsync()` was called from the constructor and filled `m_Map` from
 * `storage.json` asynchronously, while `setItem` called `persist()` immediately.
 * So on **every cold desktop start** the sequence was: construct, read options
 * and keybindings from an empty map, `setItem` the defaults back, and
 * `persist()` — which serialised that near-empty map over the player's real
 * `storage.json` — and only *then* did the read land, merging into a file that had
 * already been overwritten. The player's options, keybindings and hiscores were
 * destroyed by starting the game.
 *
 * The fix has two parts, and both are load-bearing:
 *
 * 1. **Never write before the initial read has finished.** `setItem` before
 *    readiness records that a write is owed rather than performing one, and the
 *    read's completion flushes it — by which point the map holds both the loaded
 *    values and the new ones, so the write is a superset rather than a
 *    replacement.
 * 2. **Serialise and coalesce writes.** They were fire-and-forget, so two
 *    snapshots could land out of order and an older one win. Every write now
 *    queues behind the previous one, and writes requested in the same tick
 *    collapse into one.
 *
 * Coalescing is not only tidiness: `Session.adopt` pushes a ~4.6 MB save string
 * through `setItem`, and the old code serialised the *whole* storage —
 * save, options, keybindings, hiscores — pretty-printed, on the keypress that
 * saved the game.
 */
class NeutralinoStorage extends MemoryStorage {
  private m_FilePath: string | null = null;

  /** Resolves once the initial read has been merged in (or has failed). */
  private m_Ready: Promise<void>;

  private m_ResolveReady!: () => void;
  private m_ReadyResolved = false;

  /** A write is owed: either because we are not ready yet, or one is queued. */
  private m_WriteOwed = false;
  private m_WriteScheduled = false;
  /** Tail of the write chain; each write waits for the one before it. */
  private m_WriteChain: Promise<void> = Promise.resolve();

  constructor() {
    super();
    this.m_ResolveReady = () => {
      this.m_ReadyResolved = true;
      // The values that arrived from disk are now in the map, so a write owed
      // during the read is safe to perform — it is a merge, not a replacement.
      if (this.m_WriteOwed) this.schedulePersist();
    };
    this.m_Ready = this.initAsync();
  }

  /** Resolves when the on-disk state has been read, so a caller can be sure. */
  whenReady(): Promise<void> {
    return this.m_Ready;
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
          // Benign and expected: `createDirectory` is not idempotent, so this
          // throws on every run after the first. Warning would be pure noise.
        }

        try {
          const content = await win.Neutralino.filesystem.readFileData(this.m_FilePath);
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed === "object") {
            for (const [k, v] of Object.entries(parsed)) {
              // Only adopt a value the caller has not already supplied. A
              // setItem that landed while the read was in flight is newer than
              // what is on disk, and must not be clobbered by it.
              if (typeof v === "string" && this.m_Map.get(k) === undefined) {
                this.m_Map.set(k, v);
              }
            }
          }
        } catch {
          // Benign on a first run: the file does not exist yet. A corrupt file
          // lands here too, and is treated the same way — the alternative is
          // refusing to start, and the defaults are recoverable where the
          // player's settings are not.
        }
      }
    } catch (e) {
      console.warn("[NeutralinoStorage] failed to initialize AppData persistence:", e);
    } finally {
      this.m_ResolveReady();
    }
  }

  /**
   * Records that a write is owed, and performs it as soon as it is safe.
   *
   * Deferred to a microtask so a run of `setItem` calls in one tick becomes one
   * write. That is the difference between serialising a 4.6 MB save once and
   * serialising the whole storage once per keypress.
   */
  private schedulePersist(): void {
    this.m_WriteOwed = true;
    if (this.m_WriteScheduled) return;
    this.m_WriteScheduled = true;

    // A microtask, not a timer: still collapses a synchronous burst, and does
    // not add a frame of latency to a save the player just made.
    void Promise.resolve().then(() => {
      this.m_WriteScheduled = false;
      if (!this.m_ReadyResolved) return; // the read will flush it
      this.flush();
    });
  }

  private flush(): void {
    this.m_WriteOwed = false;
    const path = this.m_FilePath;
    if (!path) return;

    let payload: string;
    try {
      const win = window as any;
      if (!(win.Neutralino && win.Neutralino.filesystem)) return;
      const obj: Record<string, string> = {};
      for (const [k, v] of this.m_Map.entries()) obj[k] = v;
      // Not pretty-printed: this file is machine state, not something a player
      // reads, and the indentation was pure bytes on a multi-megabyte save.
      payload = JSON.stringify(obj);
    } catch (e) {
      console.warn("[NeutralinoStorage] error serialising storage:", e);
      return;
    }

    // Chained so two snapshots can never land out of order and let the older win.
    this.m_WriteChain = this.m_WriteChain
      .then(async () => {
        try {
          const win = window as any;
          await win.Neutralino.filesystem.writeFileData(path, payload);
        } catch (err) {
          console.warn("[NeutralinoStorage] failed to write storage.json:", err);
        }
      });
  }

  override setItem(key: string, value: string): void {
    super.setItem(key, value);
    this.schedulePersist();
  }

  override removeItem(key: string): void {
    super.removeItem(key);
    this.schedulePersist();
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
