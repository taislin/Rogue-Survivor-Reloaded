import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * A `RuleResult` must never be tested for truthiness.
 *
 * The bug: the C# has `bool IsWalkableFor(actor, map, x, y)` *and*
 * `IsWalkableFor(..., out string reason)`. The port has only the second shape,
 * returning a `RuleResult` object -- and `!someObject` is `false` in
 * JavaScript, always. So a call site translated from the C#'s bool overload as
 * `if (!rules.isWalkableFor(...))` type-checks perfectly and silently never
 * fires.
 *
 * It fired in four places:
 *   - `SpawnActorOnMapBorder` and `SpawnActorNear` -- the check was dead, so
 *     spawns landed on occupied tiles and threw from `Map.placeActor`
 *     ("another actor already at position"), ending the run mid-invasion.
 *   - two HUD call sites, so the "can't run" icon never drew and "TIRED" never
 *     showed.
 *
 * Nothing in the type system catches this, and a human reading the code sees a
 * perfectly ordinary-looking guard. So it is checked mechanically here instead:
 * every call to a `RuleResult`-returning `Rules` method must be followed by
 * `.ok` (or be assigned to a variable that is later read via `.ok`).
 */

const SRC = join(__dirname, "../src");
const RULES = join(SRC, "engine/Rules.ts");

/** Method names on Rules whose return type is RuleResult. */
function ruleResultMethods(): Set<string> {
  const src = readFileSync(RULES, "utf-8");
  const out = new Set<string>();
  const re = /^\s{2}(\w+)\([^)]*\)\s*:\s*RuleResult\s*\{/gm;
  for (const m of src.matchAll(re)) out.add(m[1]!);
  return out;
}

/** Every .ts under dir, recursively. */
function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

/**
 * Index just past the closing paren of the call starting at `from`.
 * Returns -1 if the parens do not balance on the line.
 */
function callEnd(line: string, from: number): number {
  let depth = 1;
  let i = from;
  while (i < line.length && depth > 0) {
    if (line[i] === "(") depth++;
    else if (line[i] === ")") depth--;
    i++;
  }
  return depth === 0 ? i : -1;
}

describe("RuleResult is never used as a boolean", () => {
  const methods = ruleResultMethods();

  it("the scan found the RuleResult methods (guard against a silent no-op)", () => {
    // If this ever returns 0 the test below would pass vacuously.
    expect(methods.size).toBeGreaterThan(30);
  });

  it("no call site omits .ok", () => {
    const offenders: string[] = [];
    const pattern = new RegExp(
      `(?:this\\.)?(?:m_Rules|game\\.rules|rules)\\.(${[...methods].join("|")})\\s*\\(`,
      "g"
    );

    for (const file of tsFiles(SRC)) {
      if (file === RULES) continue;
      const lines = readFileSync(file, "utf-8").split("\n");
      for (let n = 0; n < lines.length; n++) {
        const code = lines[n].split("//")[0];
        // `const x = rules.foo(...)` is fine: x is read via .ok elsewhere.
        if (/\b(?:const|let|var)\s+\w+\s*(?::[^=]+)?=\s*[^=]*$/.test(code)) continue;
        for (const m of code.matchAll(pattern)) {
          const end = callEnd(code, m.index! + m[0].length);
          if (end < 0) continue;
          const after = code.slice(end, end + 8).trimStart();
          if (after.startsWith(".ok") || after.startsWith("?.")) continue;
          // The `.ok` may sit on the next line, which a formatter will do to any
          // call that gets long. That is still a correct call site, and a guard
          // that reports a line break as a truthiness bug trains people to ignore
          // it — which is the one thing this test cannot afford.
          const nextLine = (lines[n + 1] ?? "").trim();
          if (nextLine.startsWith(".ok") || nextLine.startsWith("?.")) continue;
          offenders.push(
            `${relative(join(__dirname, ".."), file)}:${n + 1}  ${m[1]}()\n      ${lines[n].trim()}`
          );
        }
      }
    }

    expect(offenders, "these call sites test a RuleResult for truthiness").toEqual([]);
  });

  it("the two spawners and the two HUD sites now use .ok", () => {
    // Named explicitly so the intent survives a refactor of the scanner.
    const rg = readFileSync(join(SRC, "engine/RogueGame.ts"), "utf-8");
    expect(rg).not.toMatch(/!\s*this\.m_Rules\.isWalkableFor\([^)]*\)\s*\)/);
    expect(rg).not.toMatch(/!\s*this\.m_Rules\.canActorRun\([^)]*\)\s*\{/);
    expect(rg).toMatch(/canActorRun\(actor\)\.ok/);
    expect(rg).toMatch(/canActorInitiateTradeWith\(this\.m_Player, actor\)\.ok/);
  });
});
