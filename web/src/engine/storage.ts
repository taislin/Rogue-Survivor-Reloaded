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
 *
 * The desktop build is the third backend, not the second — see
 * `NeutralinoStorage` below, which is where the real work is.
 */

import { reportSwallowed } from "./Diagnostics";

/** The subset of the DOM `Storage` interface the engine actually uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /**
   * Resolves when every write issued so far has reached the disk.
   *
   * Absent on the synchronous backends, where `setItem` *is* the write and there
   * is nothing to wait for. Present on the desktop one, where `setItem` only
   * records that a write is owed — so a caller that reports success has to await
   * this, or "saved" would mean "queued" and a failing write would be invisible.
   *
   * Rejects if the write failed, so an existing `try { ... } catch { fallback }`
   * around a `setItem` keeps working unchanged.
   */
  flush?(): Promise<void>;
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
 *
 * ## The four defects that made the desktop build lose everything
 *
 * The race above was already fixed. What was left meant the class was never
 * constructed at all, so none of its careful behaviour ever ran:
 *
 * 1. **`hasNeutralino` was `false` in the packaged app.** It tested
 *    `window.NL_OS`, and Neutralino 6.x serves those globals from a generated
 *    `__neutralino_globals.js` that `index.html` never loaded and
 *    `neutralino.config.json` never asked to be injected. The check is now
 *    "is the Neutralino client library there", with `NL_OS` kept as an
 *    alternative, because the client library is the thing this class actually
 *    calls.
 * 2. **The client library is loaded `defer`, and the built HTML puts the module
 *    script first** — Vite hoists `<script type="module">` into `<head>` — so
 *    `window.Neutralino` did not exist yet when this module evaluated. The
 *    constructor therefore *waited* for the library instead of testing once.
 * 3. **`readFileData` and `writeFileData` are Neutralino 5.x names.** The
 *    shipped 6.9.0 client has `readFile`/`writeFile` and neither 5.x method, so
 *    both calls were `TypeError: … is not a function` — the read swallowed by an
 *    empty `catch` (indistinguishable from a first run) and the write swallowed
 *    by a `console.warn`. Both spellings are now supported, so the class is
 *    right on either client.
 * 4. **`enableNativeAPI` was never set in `neutralino.config.json`**, and its
 *    default is false, so every `Neutralino.*` call would have been refused with
 *    `NE_RT_APIPRME` anyway.
 *
 * And underneath all four: `initAsync` bailed with `m_FilePath` still null and
 * every later `flush()` returned silently at `if (!path) return;`. That is not a
 * `catch`, so the repo's own silent-failure scan could not see it, and the class
 * looked like a working fallback. It now reports.
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
  /** The last write's failure, so `flush()` can reject rather than shrug. */
  private m_LastWriteError: unknown = null;

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

  /**
   * Resolves once the Neutralino client library is callable.
   *
   * The library arrives as a `defer`red classic script and the engine as a
   * module script, and a built page has the module first — so testing for
   * `window.Neutralino` once, from this module's top level, was a race that the
   * packaged build won. Polling for a short while is the honest fix; the timeout
   * is what turns "the library never arrives" into a reported failure rather than
   * a hang.
   */
  private static async awaitClientLibrary(ms = 2_000): Promise<boolean> {
    const deadline = Date.now() + ms;
    for (;;) {
      const win = window as any;
      if (win && win.Neutralino && win.Neutralino.os && win.Neutralino.filesystem) {
        return true;
      }
      if (Date.now() >= deadline) return false;
      await new Promise<void>((r) => setTimeout(r, 10));
    }
  }

  /**
   * `filesystem.writeFile`, under whichever name this client has.
   *
   * 5.x called it `writeFileData`; 6.x calls it `writeFile` and has no `*Data`
   * variant at all. The shipped 6.9.0 library is what the app runs against, but a
   * property test is cheaper than a version pin, and a client that happens to
   * expose neither is a reported failure rather than a `TypeError`.
   */
  private static async writeFile(
    fs: any,
    path: string,
    data: string,
  ): Promise<void> {
    if (typeof fs.writeFile === "function") return await fs.writeFile(path, data);
    if (typeof fs.writeFileData === "function") return await fs.writeFileData(path, data);
    throw new TypeError("Neutralino.filesystem has neither writeFile nor writeFileData");
  }

  /** `filesystem.readFile`, under whichever name this client has. */
  private static async readFile(fs: any, path: string): Promise<string> {
    if (typeof fs.readFile === "function") return await fs.readFile(path);
    if (typeof fs.readFileData === "function") return await fs.readFileData(path);
    throw new TypeError("Neutralino.filesystem has neither readFile nor readFileData");
  }

  private async initAsync(): Promise<void> {
    try {
      if (!(await NeutralinoStorage.awaitClientLibrary())) {
        throw new Error(
          "the Neutralino client library never became available (window.Neutralino)",
        );
      }
      const win = window as any;
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
        const content = await NeutralinoStorage.readFile(
          win.Neutralino.filesystem,
          this.m_FilePath,
        );
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
      } catch (e) {
        // A missing file is the first run and is not an error. Anything else —
        // a corrupt file, a `TypeError` from an API name this client does not
        // have, a permissions problem — means the game is about to run on
        // defaults and *write them back over the player's real file*, which is
        // the destruction this class exists to prevent. It has to be said out
        // loud rather than swallowed, because "benign" and "I destroyed your
        // settings" look identical from here.
        if (!(e instanceof Error && /ENOENT|not found|no such file/i.test(e.message))) {
          reportSwallowed("NeutralinoStorage.init (read storage.json)", e);
        }
      }
    } catch (e) {
      // The path is unset, so every later write is discarded. Reported here
      // because this is the last place the cause is still visible: past it, the
      // game runs perfectly and silently keeps nothing.
      //
      // Also *recorded*, not just reported. This is the case the bug report is
      // really about — a desktop build with no usable AppData directory — and it
      // is the case where `flush()` has no write to reject on, so without this
      // `GameSaveManager.saveGame` would return `true` for a save that went
      // nowhere. `m_LastWriteError` is what a caller awaits.
      this.m_LastWriteError = e;
      reportSwallowed("NeutralinoStorage.init (AppData persistence unavailable)", e);
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
      this.performFlush();
    });
  }

  private performFlush(): void {
    this.m_WriteOwed = false;
    const path = this.m_FilePath;
    if (!path) {
      // Recorded as well as reported, for the same reason as the init failure: a
      // discarded write has to make `flush()` reject, or `saveGame` reports a
      // success for it.
      //
      // This used to be a bare `return` — and a bare `return` is not a `catch`,
      // so the repo's own silent-failure scan could not see it. It is the single
      // worst line in the file: it makes `setItem` accept-and-discard, so a game
      // with no writable data directory looks exactly like a game that is saving.
      const e = new Error("m_FilePath is unset: writes are being discarded");
      this.m_LastWriteError = e;
      reportSwallowed(
        "NeutralinoStorage.flush (no storage.json path; writes are being discarded)",
        e,
      );
      return;
    }

    let payload: string;
    try {
      const win = window as any;
      if (!(win.Neutralino && win.Neutralino.filesystem)) {
        const e = new Error("client library gone");
        this.m_LastWriteError = e;
        reportSwallowed("NeutralinoStorage.flush (no Neutralino.filesystem)", e);
        return;
      }
      const obj: Record<string, string> = {};
      for (const [k, v] of this.m_Map.entries()) obj[k] = v;
      // Not pretty-printed: this file is machine state, not something a player
      // reads, and the indentation was pure bytes on a multi-megabyte save.
      payload = JSON.stringify(obj);
    } catch (e) {
      this.m_LastWriteError = e;
      reportSwallowed("NeutralinoStorage.flush (serialise storage)", e);
      return;
    }

    // Chained so two snapshots can never land out of order and let the older win.
    this.m_WriteChain = this.m_WriteChain.then(async () => {
      try {
        const win = window as any;
        await NeutralinoStorage.writeFile(
          win.Neutralino.filesystem,
          path,
          payload,
        );
        this.m_LastWriteError = null;
      } catch (err) {
        this.m_LastWriteError = err;
        reportSwallowed("NeutralinoStorage.flush (write storage.json)", err);
      }
    });
  }

  /**
   * Waits for every write so far, and rejects if the last one failed.
   *
   * This is what turns "saved" from a claim into a fact. `setItem` on this
   * backend cannot throw — it records a write and returns — so `GameSaveManager`
   * was returning `true` for a write that had not happened, and `RogueGame` was
   * discarding even that with a bare `void`.
   */
  async flush(): Promise<void> {
    // After the read, not before: a save pressed during boot must not be flushed
    // over a `storage.json` that has not been read yet.
    await this.m_Ready;
    await this.m_WriteChain;
    if (this.m_WriteOwed) {
      this.performFlush();
      await this.m_WriteChain;
    }
    if (this.m_LastWriteError !== null) throw this.m_LastWriteError;
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
 *
 * **Not `window.NL_OS` alone.** That was the whole desktop persistence bug: the
 * `NL_*` globals are served by a `__neutralino_globals.js` that `index.html`
 * never loaded and `neutralino.config.json` never asked to be injected, so
 * `NL_OS` was `undefined` in the packaged app, this was `false`, and the
 * neutralino backend was skipped *silently* — no warning, because the class that
 * would have warned was never constructed. Everything then fell through to the
 * webview's `localStorage` on `http://localhost:<random port>` (`"port": 0` in
 * `neutralino.config.json`), which is a different origin on every launch and so a
 * different keyspace every launch: works, and is gone on restart.
 *
 * The client library is the better test, because it is the thing
 * `NeutralinoStorage` actually calls. `NL_OS` is kept as an alternative for a
 * configuration that injects the globals but serves the library some other way.
 */
export const hasNeutralino: boolean =
  typeof window !== "undefined" &&
  (typeof (window as any).NL_OS !== "undefined" ||
    typeof (window as any).Neutralino !== "undefined");

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
 *
 * **Both fallbacks are reported.** Reaching `memory` means the player's options
 * and scores are gone the moment the process exits, and it used to be reached
 * silently: the game ran perfectly and kept nothing, which is the hardest kind of
 * bug to notice from the inside. `hasLocalStorage` was exported for exactly this
 * and nothing ever tested it.
 */
export const storage: StorageLike = (() => {
  if (hasNeutralino) {
    return new NeutralinoStorage();
  }
  try {
    if (typeof localStorage === "undefined") {
      reportSwallowed(
        "storage backend selection (no localStorage; progress will not be saved)",
        new Error("localStorage is not defined"),
      );
      return memory;
    }
    // Probe it: a browser with storage disabled throws on access, not on decl.
    localStorage.getItem("__rs_probe__");
    return localStorage;
  } catch (e) {
    reportSwallowed(
      "storage backend selection (localStorage unusable; progress will not be saved)",
      e,
    );
    return memory;
  }
})();

/**
 * Resolves once whatever is on disk has been read.
 *
 * Immediate on every backend but the desktop one, where it is the read half of
 * the race that class documents. Call it before reading persisted state, or the
 * first read of a cold desktop start returns the defaults and the write-back
 * destroys the player's real ones.
 */
export function whenStorageReady(): Promise<void> {
  const s = storage as StorageLike & { whenReady?: () => Promise<void> };
  return typeof s.whenReady === "function" ? s.whenReady() : Promise.resolve();
}
