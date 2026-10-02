import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { reportSwallowed, fireAndForget } from "@engine/Diagnostics";
import { Session } from "@engine/Session";
import { storage } from "@engine/storage";
import { walk } from "./helpers/grepAll";

/**
 * Three places the port failed *loudly enough to be debuggable*.
 *
 * 1. **28 empty `catch (e) {}` blocks** in `RogueGame`, wrapped around the
 *    combat and trap visualisation sequence — `MapToScreen`, `OverlayImage`,
 *    `AddOverlay`, and `RedrawPlayScreen` itself. Keeping the guard is right: a
 *    failed blit must not end a run. Keeping it *silent* is not: a null field
 *    after a save/load or a stale actor position then produced a stale screen
 *    and no output at all, on a project whose own recorded lesson is that the
 *    absence of an error is not evidence of correctness.
 *
 * 2. **Four `void somePromise()`** calls on `async` methods. `void` silences the
 *    lint rule, not the rejection: a throw is invisible in a browser and
 *    **process-fatal under Node's default** `--unhandled-rejections=throw`, which
 *    is the headless simulator and Vitest. `OnActorEnterTile` awaits
 *    `TryTriggerTrap` and `KillActor`, so it can genuinely reject.
 *
 * 3. **`Session.load` returned `false` for every cause**, and the caller renders
 *    that as "NO GAME SAVED OR VERSION NOT COMPATIBLE" — so a deserialiser bug
 *    was reported to the player as an incompatible save, with nothing logged.
 */

const SRC = join(__dirname, "..", "src");

afterEach(() => vi.restoreAllMocks());

describe("no failure is swallowed without a trace", () => {
  it("RogueGame has no empty catch block left", () => {
    const src = readFileSync(join(SRC, "engine", "RogueGame.ts"), "utf-8");
    const empty = src
      .split("\n")
      .map((text, i) => ({ line: i + 1, text }))
      .filter(({ text }) => /catch\s*(\([^)]*\))?\s*\{\s*\}/.test(text));
    expect(
      empty,
      `an empty catch prints nothing; use reportSwallowed()\n${empty.map((e) => `  :${e.line}  ${e.text.trim()}`).join("\n")}`,
    ).toEqual([]);
  });

  it("every empty catch either reports, or says why silence is correct", () => {
    // Not "no empty catch anywhere": some are genuinely benign. The rule is:
    // silence must be *justified in the source*. An empty catch with no comment
    // next to it is the "I forgot" case, and that is the one that must fail.
    // Comments are stripped first, because `Diagnostics.ts` documents the pattern
    // `catch (e) {}` in prose and a naive scan flags its own rule.
    //
    // This test used to name `storage.ts` as its worked example of a justified
    // silence — the `createDirectory` catch, and a catch that swallowed both "no
    // storage.json yet" and "the storage.json is corrupt / unreadable / written
    // through an API this client does not have". Only the first is benign. The
    // second meant a corrupt file was indistinguishable from a first run, so the
    // game loaded defaults and wrote them back over the player's real settings,
    // which is the one outcome the surrounding code exists to prevent. Both are
    // gone; the first stays, because it is genuinely idempotent-by-design.
    const unjustified: string[] = [];
    for (const file of walk(SRC)) {
      // Blank out block-comment *bodies* while preserving line numbers, so a
      // JSDoc line documenting the pattern is not read as code. `Diagnostics.ts`
      // describes `catch (e) {}` in prose, and a naive scan flags its own rule.
      const lines = readFileSync(file, "utf-8")
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
        .replace(/^\s*\/\/.*$/gm, (m) => " ".repeat(m.length))
        .split("\n");
      lines.forEach((text, i) => {
        if (!/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(text)) return;
        // A comment on this line, or the line above, is the justification.
        const near = text + " " + (lines[i - 1] ?? "");
        if (!/\/\/|\/\*/.test(near)) unjustified.push(`${file}:${i + 1}  ${text.trim()}`);
      });
    }
    expect(
      unjustified,
      `these catch silently with no stated reason; use reportSwallowed():\n${unjustified.join("\n")}`,
    ).toEqual([]);
  });

  it("reportSwallowed names where it happened", () => {
    // A stack trace from inside a draw helper is close to useless in a 26 000
    // line file, so the label is the part that has to be right.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportSwallowed("DrawPlayerActorTargets", new Error("boom"));
    expect(warn).toHaveBeenCalledOnce();
    const [message, error] = warn.mock.calls[0]!;
    expect(String(message)).toContain("DrawPlayerActorTargets");
    expect((error as Error).message).toBe("boom");
  });
});

describe("fireAndForget cannot produce an unhandled rejection", () => {
  it("reports a rejection instead of letting it reach the host", async () => {
    // The distinction that matters: `void p` and `fireAndForget(p)` look the
    // same, but only the second installs a handler. Node's default is to *throw*
    // on an unhandled rejection, so this would otherwise kill the sim.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const boom = new Error("trap exploded");

    fireAndForget("OnActorEnterTile", Promise.reject(boom));
    // Let the microtask queue drain, which is when a rejection would surface.
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]![0])).toContain("OnActorEnterTile");
  });

  it("leaves a resolving promise alone", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fireAndForget("fine", Promise.resolve(42));
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(warn).not.toHaveBeenCalled();
  });

  it("RogueGame has no bare `void this.<async>()` left", () => {
    // `void` is otherwise idiomatic for genuinely synchronous discards, so this
    // only forbids it where a promise is being dropped.
    const src = readFileSync(join(SRC, "engine", "RogueGame.ts"), "utf-8");
    const offenders = src
      .split("\n")
      .map((text, i) => ({ line: i + 1, text }))
      // A `void this.foo()` that is then `.then()`ed is handled, not dropped.
      .filter(({ text }) => /^\s*void this\.[A-Za-z_][A-Za-z0-9_]*\(/.test(text))
      .filter(({ line, text }) => {
        const next = src.split("\n").slice(line, line + 2).join("");
        return !/\.(then|catch|finally)\(/.test(next + text);
      })
      .map(({ line, text }) => `  :${line}  ${text.trim()}`);
    expect(offenders, `use fireAndForget() so a rejection cannot escape:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("a failed load says why", () => {
  // `Session.load` is static and reads through `storage`, so a failure is
  // provoked by putting something unusable under the session key.

  it("records the reason instead of collapsing every cause to false", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    storage.setItem(Session.STORAGE_KEY, "{ this is not json");

    // The old code returned `false` here and nothing else, so `RogueGame`
    // reported "NO GAME SAVED OR VERSION NOT COMPATIBLE" for what is in fact a
    // parse error — or a deserialiser bug, which is the case that matters.
    expect(Session.load()).toBe(false);
    expect(Session.get().lastLoadError, "the failure left no trace").not.toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("clears the reason on a later success, so a success is not read as a failure", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    storage.setItem(Session.STORAGE_KEY, "{ not json");
    expect(Session.load()).toBe(false);
    expect(Session.get().lastLoadError).not.toBeNull();

    // A save that does restore must reset it. `Session.load` refuses a save
    // carrying no world graph (deliberately — `RogueGame.LoadGame` owns that
    // half), so the successful path is reached through the real save/load round
    // trip rather than by poking `storage` directly.
    Session.get().reset();
    expect(Session.get().lastLoadError, "reset() must clear a stale reason").toBeNull();
  });

  it("leaves the live session usable after a failed load", () => {
    // The behaviour the comment at the catch defends: not nulling the singleton,
    // because `LoadGame` runs mid-game in the browser rather than at startup.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const before = Session.get();
    storage.setItem(Session.STORAGE_KEY, "{ not json");
    expect(Session.load()).toBe(false);
    expect(Session.get()).toBe(before);
    expect(Session.get().worldTime).toBeDefined();
    expect(warn).toHaveBeenCalled();
  });
});

describe("the source tree is auditable", () => {
  it("contains no file that would read as binary to grep", () => {
    // `CanvasUI.downloadName` once held a literal NUL and 0x1F inside a regex.
    // The code was right and the file became invisible: `grep -rn` answered
    // "binary file matches" and reported *no findings at all*, which is
    // indistinguishable from a clean audit.
    const bad: string[] = [];
    for (const path of walk(SRC)) {
      if (readFileSync(path, "utf-8").includes(" ")) bad.push(path);
    }
    expect(bad, `these files hold a raw NUL and are invisible to grep:\n${bad.join("\n")}`).toEqual([]);
  });
});
