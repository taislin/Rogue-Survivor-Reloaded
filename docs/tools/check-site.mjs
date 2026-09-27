#!/usr/bin/env node
/**
 * Validates the docs/ site. Run from anywhere:
 *
 *   node docs/tools/check-site.mjs
 *
 * Checks, per page:
 *   - every local href/src resolves to a file that exists
 *   - every in-page #fragment resolves to an id on that page
 *   - tags are balanced
 *   - the <head> has charset, viewport, title, description and the stylesheet
 *   - exactly one <h1>, a skip link, and the navigation bar
 *   - exactly one nav item marked aria-current (except 404.html, which has
 *     no current page)
 *   - every <img> has an alt attribute
 *   - the nav links to all four real pages
 *   - GPL attribution appears in the footer
 *
 * Plus: every class used in the HTML is defined in the stylesheet, and the
 * stylesheet contains no rules for classes the site never uses (excluding the
 * two that manual.js applies at runtime).
 *
 * Exits non-zero if anything fails, so it can be used as a gate.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** Classes manual.js toggles at runtime, so they are not in the static HTML. */
const RUNTIME_ONLY = new Set(['is-active', 'is-hidden']);

const PAGES = readdirSync(DOCS).filter((f) => f.endsWith('.html'));
const LOCAL_NAV = ['index.html', 'manual.html', 'controls.html', 'info.html'];

const fails = [];
const fail = (page, msg) => fails.push(`${page}: ${msg}`);

for (const page of PAGES) {
  const html = readFileSync(join(DOCS, page), 'utf8');
  const is404 = page === '404.html';

  // --- links, assets and in-page fragments --------------------------------
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));

  for (const [, ref] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:)/.test(ref)) continue;

    if (ref.startsWith('#')) {
      if (ref.length > 1 && !ids.has(decodeURIComponent(ref.slice(1)))) {
        fail(page, `fragment has no target: ${ref}`);
      }
      continue;
    }

    // A reference must not escape docs/ - Pages only serves what is inside it.
    if (ref.split('#')[0].startsWith('..')) {
      fail(page, `reference escapes docs/ (will 404 on Pages): ${ref}`);
    }

    if (!existsSync(join(DOCS, ref.split('#')[0]))) {
      fail(page, `missing target: ${ref}`);
    }
  }

  // --- tag balance --------------------------------------------------------
  const stack = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|[^>"])*?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(html))) {
    const tag = m[2].toLowerCase();
    if (VOID.has(tag) || m[4] === '/') continue;
    if (!m[1]) stack.push(tag);
    else {
      const open = stack.pop();
      if (open !== tag) fail(page, `</${tag}> closes <${open}>`);
    }
  }
  if (stack.length) fail(page, `unclosed tags: ${stack.join(', ')}`);

  // --- head and document essentials ---------------------------------------
  const required = [
    ['doctype', /^<!DOCTYPE html>/i],
    ['lang', /<html lang="[a-z]+">/],
    ['charset', /<meta charset="utf-8">/i],
    ['viewport', /name="viewport"/],
    ['title', /<title>[^<]+<\/title>/],
    ['description', /name="description"/],
    ['stylesheet', /rel="stylesheet"/],
    ['h1', /<h1[ >]/],
    ['skip-link', /class="skip-link"/],
    ['nav', /aria-label="Main"/],
  ];
  for (const [name, re] of required) {
    // A 404 is noindex and describes no content, so it carries robots instead.
    if (is404 && (name === 'description' || name === 'viewport')) continue;
    if (!re.test(html)) fail(page, `head missing ${name}`);
  }

  if ((html.match(/<h1[ >]/g) || []).length !== 1) fail(page, 'not exactly one <h1>');

  const current = (html.match(/aria-current="page"/g) || []).length;
  if (is404 ? current !== 0 : current !== 1) {
    fail(page, `expected ${is404 ? 0 : 1} aria-current="page", found ${current}`);
  }

  for (const [, tag] of html.matchAll(/<img(?![^>]*\balt=)[^>]*>/g)) fail(page, `<img> without alt`);

  for (const target of LOCAL_NAV) {
    if (!html.includes(`href="${target}"`)) fail(page, `nav does not link to ${target}`);
  }

  if (!/GNU General Public License/.test(html)) fail(page, 'no GPL attribution in the footer');
}

/* --- stylesheet coverage -------------------------------------------------- */

const css = readFileSync(join(DOCS, 'assets/css/site.css'), 'utf8');

// Scan a copy of the stylesheet with comments and url() bodies removed, so
// neither can contribute a phantom "class". Both of these were real false
// positives found the hard way:
//
//   - `@font-face` reported a class named `woff2`, from
//     `url("../fonts/JetBrainsMono-Regular.woff2")`.
//   - a comment mentioning `check-site.mjs` reported a class named `mjs`.
//
// The old detector only ever saw `assets/img/...` paths, which contain no dot,
// so neither could happen until the self-hosted web fonts arrived. Blanking
// comments and url() bodies is the blunt fix, and deliberately so: a false
// "class defined but never used" fails the gate, and a gate that cries wolf
// gets ignored.
const cssScannable = css
  .replace(/\/\*[\s\S]*?\*\//g, '')                                  // comments
  .replace(/url\(\s*['"]?[^)]*['"]?\s*\)/g, 'url()');                 // url() bodies
const cssClasses = new Set([...cssScannable.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map((m) => m[1]));
const used = new Set();

for (const page of PAGES) {
  const html = readFileSync(join(DOCS, page), 'utf8');
  for (const [, cls] of html.matchAll(/class="([^"]+)"/g)) {
    for (const c of cls.split(/\s+/)) if (c) used.add(c);
  }
}

for (const c of used) {
  if (!cssClasses.has(c)) fail('site.css', `class used in HTML but not defined: .${c}`);
}

const dead = [...cssClasses].filter((c) => !used.has(c) && !RUNTIME_ONLY.has(c));
if (dead.length) fail('site.css', `classes defined but never used: ${dead.map((c) => '.' + c).join(', ')}`);

/* --- stylesheet asset references ------------------------------------------ */

// The per-page check above resolves href/src against DOCS, which is wrong for
// the stylesheet: a `url()` in CSS is relative to the *stylesheet*, not the
// page, so the self-hosted fonts are at "../fonts/..." from assets/css/. Left
// unchecked, a typo in a font path fails silently -- the browser just falls back
// to the next family in the stack and nothing looks broken.
const CSS_DIR = join(DOCS, 'assets/css');
for (const [, ref] of css.matchAll(/url\(\s*['"]?([^)'"]*)['"]?\s*\)/g)) {
  if (/^(https?:|data:|\/\/)/.test(ref)) continue;
  const target = join(CSS_DIR, ref.split(/[?#]/)[0]);
  if (ref.split(/[?#]/)[0].startsWith('..') && !target.startsWith(DOCS)) {
    fail('site.css', `url() escapes docs/ (will 404 on Pages): ${ref}`);
    continue;
  }
  if (!existsSync(target)) fail('site.css', `url() target missing: ${ref}`);
}

/* --- report --------------------------------------------------------------- */

if (fails.length) {
  console.error(`FAIL - ${fails.length} problem(s):`);
  for (const f of fails) console.error(`  ${f}`);
  process.exit(1);
}

console.log(
  `OK - ${PAGES.length} pages, ${used.size} classes, all links/assets/fragments resolve, tags balanced`
);
