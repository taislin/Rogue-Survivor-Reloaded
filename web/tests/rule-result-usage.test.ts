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

  it("names the two regression sites the C# bool overloads used to break", () => {
    // These four are named explicitly so the *intent* survives a refactor of the
    // scanner above. They were `file:line` assertions against `RogueGame.ts`, and
    // §6 of the port plan flags exactly that shape as the thing to remove before
    // any region moves: a source scan "either fails for the wrong reason or —
    // worse — stops matching and guards nothing" once the text it reads is
    // relocated.
    //
    // They now scan `src` rather than one file, so a region that moves takes them
    // along. And the redundancy is deliberate rather than accidental: the general
    // scan above already catches both of these, because it walks every `.ts` under
    // `src` and matches `m_Rules.<RuleResult method>(`. Checked by mutation —
    // deleting `.ok` from either site makes *that* test fail on its own — so
    // nothing is guarded here that is not guarded there, and these two assertions
    // are here to name the sites, not to be the mechanism.
    //
    // The two `not.toMatch` halves stay because they guard a *shape* rather than a
    // site: a negated call with no `.ok` anywhere after it is the truthiness bug
    // this whole file exists to prevent.
    const rg = readFileSync(join(SRC, "engine/RogueGame.ts"), "utf-8");
    expect(rg).not.toMatch(/!\s*this\.m_Rules\.isWalkableFor\([^)]*\)\s*\)/);
    expect(rg).not.toMatch(/!\s*this\.m_Rules\.canActorRun\([^)]*\)\s*\{/);

    // What the four original assertions actually guarded was "these call sites
    // read `.ok`", and the general scan above already proves that for every
    // `RuleResult` method at every call site in `src`. So rather than pin a list
    // of them — there are eleven across `RogueGame` *and* `MapGenerator`, and a
    // pinned list is exactly the churn magnet §6 warns about — assert the two
    // specific facts the scan cannot see.
    //
    // **Per-site, not a floor.** A `toBeGreaterThanOrEqual` was tried here and it
    // guards nothing: `isWalkableFor` has five `.ok` sites, so deleting both
    // spawner guards still leaves three and the count holds. Verified by mutation.
    // What has to survive a move is *which* call and *which method*, so that is
    // what is recorded — and only for the two regions the C# bool overloads
    // actually broke, since a site-by-site list for all eleven is churn again.
    const spawnerGuards: string[] = [];
    const tradeAndHud: string[] = [];
    for (const file of tsFiles(SRC)) {
      if (file === RULES) continue;
      const where = relative(join(__dirname, ".."), file);
      // Whole file, comments stripped per line. Truncating to the first line here
      // counted nothing at all, which is the sort of quiet no-op the scan above
      // has a guard against.
      const text = readFileSync(file, "utf-8")
        .split("\n")
        .map((l) => l.split("//")[0]!)
        .join("\n");
      // The spawner guard is recognisable by shape: `actorToSpawn` is the only
      // variable any `isWalkableFor` call uses, so this names the two sites
      // without pinning their line numbers.
      for (const m of text.matchAll(/isWalkableFor\(actorToSpawn\b[^)]*\)\s*\.ok/g)) {
        spawnerGuards.push(`${where}  ${m[0]!.trim()}`);
      }
      for (const m of text.matchAll(
        /\.\s*(canActorRun|canActorInitiateTradeWith)\([^)]*\)\s*\.ok/g
      )) {
        tradeAndHud.push(`${where}  ${m[1]}`);
      }
    }
    // Both spawners read `.ok` on `isWalkableFor` — that pair was the bug that
    // threw "another actor already at position" out of `Map.placeActor` and
    // ended a run mid-invasion. Counted, not compared: the two guards are
    // character-for-character identical (`isWalkableFor(actorToSpawn, map, pos.x,
    // pos.y)`), so any "these are two distinct sites" check collapses them to one.
    // Verified by mutation — deleting both makes this fail.
    expect(spawnerGuards, "the two spawner guards must both read .ok").toHaveLength(2);
    // Two `canActorRun` HUD sites (the "can't run" icon and "TIRED") and the
    // trade gate. Kept as a count because these are unrelated call sites with
    // nothing to recognise them by but their method name.
    expect(
      tradeAndHud.filter((s) => s.endsWith("canActorRun")).length,
      "canActorRun .ok sites"
    ).toBeGreaterThanOrEqual(2);
    expect(
      tradeAndHud.filter((s) => s.endsWith("canActorInitiateTradeWith")).length,
      "trade gate .ok sites"
    ).toBeGreaterThanOrEqual(1);
  });
});
