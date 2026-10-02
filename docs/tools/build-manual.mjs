#!/usr/bin/env node
/**
 * Generates docs/manual.html from the original game manual.
 *
 * Source : src/Resources/Manual/RS Manual.txt   (CRLF, plain text)
 * Output : docs/manual.html
 *
 * The manual is the authoritative game documentation written by the original
 * author, so this script only *reformats* it - it never rewrites a word. It
 * runs in two passes:
 *
 *   1. tokenise the plain text into typed tokens, recognising the conventions
 *      the manual actually uses (see MARKERS below);
 *   2. render the tokens to HTML, levelling the headings on the way.
 *
 * Two passes are needed because a heading's level depends on the *next* line
 * (underlined titles) or on its neighbours ("> " vs "* "), which is not known
 * while tokenising.
 *
 * MARKERS
 *   <SECTION>              section delimiter
 *   TITLE + -----          underlined title: section title (h2) or sub heading
 *   > TITLE                nests one level under an underlined heading
 *   * TITLE  (ALL CAPS)    group heading, nests one level under a ">" heading
 *   * text     (not caps)  ordinary bullet
 *   - text                 bullet; leading spaces indent one level
 *   1. "Quoted name"       opens an indented block, rendered as a "build" card
 *   LABEL   : description  rendered with the label emphasised
 *   *** note ***           rendered as a callout
 *   (blank line)           closes the current paragraph / list
 *
 * Usage:  node docs/tools/build-manual.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = join(HERE, '..');
const REPO = join(DOCS, '..');

const SOURCE = join(REPO, 'src', 'Resources', 'Manual', 'RS Manual.txt');
const TARGET = join(DOCS, 'manual.html');

/* --- html helpers --------------------------------------------------------- */

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Double-quoted spans become <q>. */
const inline = (s) => esc(s).replace(/&quot;([^&]+)&quot;/g, '<q>$1</q>');

/**
 * "Ammo items   : reload weapons" -> <b>Ammo items</b> : reload weapons
 *
 * The manual uses two layouts for this: label columns padded with several
 * spaces, and a single space in running prose. Two guards keep the single-space
 * case honest. A word cap stops prose like "You have to find ways to survive :
 * food, shelter, weapons and companions" from bolding a whole clause, and a
 * minimum length stops the emoticons in the opening dialogue ("-Brains! :D")
 * from being read as a label at all.
 */
function withLabel(text) {
  const m = /^(\S.*?)(\s+):\s*([\s\S]+)$/.exec(text);
  if (!m) return inline(text);

  const label = m[1].trim();
  const desc = m[3].trim();
  const padded = /\s{2,}/.test(m[2]); // m[2] is the gap before the colon

  if (label.split(/\s+/).length > (padded ? 6 : 4)) return inline(text);
  if (!padded && desc.length < 10) return inline(text);

  return `<b>${esc(label)}</b> : ${inline(desc)}`;
}

/**
 * "SHOOTING  (default Shift-E, Shift-Q)" ->
 *   'SHOOTING <span class="h-key"><span class="h-src">default</span> <kbd>Shift</kbd>-<kbd>E</kbd> …</span>'
 *
 * The parenthetical is free text in the source ("mouse, then default G",
 * "mouse, default shortcuts Control-<number>"), so filler words are dropped and
 * the few real spellings normalised before the remainder is turned into keys.
 */
const FILLER = new Set(['default', 'defaults', 'shortcut', 'shortcuts', 'then', 'and', 'key', 'keys', 'or']);

function headingInner(text) {
  const m = /^(.*?)\s*\((default|mouse)([^)]*)\)\s*$/i.exec(text);
  if (!m) return esc(text);

  const kbd = (s) => `<kbd>${esc(s)}</kbd>`;

  // "Control-<number>" is the item-slot shortcut: Ctrl plus 1..0.
  if (/control\s*-\s*<number>/i.test(m[3])) {
    return (
      `${esc(m[1].trim())} <span class="h-key"><span class="h-src">${esc(
        m[2].toLowerCase()
      )}</span> ${kbd('Ctrl')}<span class="h-plus">+</span>${kbd('1')}&hellip;${kbd('0')}</span>`
    );
  }

  const joiner = /\bthen\b/i.test(m[3]) ? '<span class="h-then">then</span>' : ' ';
  const parts = m[3]
    .split(/[,\s]+/)
    .filter((s) => s && !FILLER.has(s.toLowerCase()))
    .map((s) => {
      // Keep "Ctrl-E" and "Shift-N" as one key so they are not read as two.
      const combo = /^(ctrl|control|shift|alt)([-+])(.+)$/i.exec(s);
      if (combo) {
        const mod = /^c/i.test(combo[1]) ? 'Ctrl' : /^s/i.test(combo[1]) ? 'Shift' : 'Alt';
        return kbd(mod) + `<span class="h-plus">${combo[2]}</span>` + kbd(combo[3]);
      }
      return s === '+' ? '<span class="h-plus">+</span>' : kbd(s);
    })
    .join(' ');

  const src = `<span class="h-src">${esc(m[2].toLowerCase())}</span>`;
  return `${esc(m[1].trim())} <span class="h-key">${src}${parts ? joiner + parts : ''}</span>`;
}

/* --- 1. tokenise ---------------------------------------------------------- */

const raw = readFileSync(SOURCE, 'latin1').replace(/\r\n?/g, '\n');
const lines = raw.split('\n');

const RE_UNDERLINE = /^[-=]{3,}\s*$/;
const RE_ARROW = /^>\s*(.*)$/;
const RE_STAR = /^(\s*)\*\s+(.*)$/;
const RE_BULLET = /^(\s*)-\s+(.*)$/;
const RE_ORDERED = /^(\s*)(\d+)\.\s+(.*)$/;

const isUpper = (s) => /[A-Z]/.test(s) && s === s.toUpperCase();
const indentOf = (l) => l.match(/^\s*/)[0].length;

const tokens = [];
let inPreamble = true;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const t = line.trim();

  if (t === '<end of manual>') break;

  if (t === '<SECTION>') {
    tokens.push({ t: 'sec' });
    inPreamble = false;
    continue;
  }

  if (!t) {
    tokens.push({ t: 'blank' });
    continue;
  }

  // An underlined title: the dashes are on the following line.
  if (i + 1 < lines.length && RE_UNDERLINE.test(lines[i + 1]) && !RE_UNDERLINE.test(line)) {
    tokens.push({ t: 'h', marker: 'underline', text: t });
    i += 1; // consume the dashes
    continue;
  }
  if (RE_UNDERLINE.test(line)) continue; // stray dashes

  const arrow = RE_ARROW.exec(t);
  if (arrow) {
    tokens.push({ t: 'h', marker: '>', text: arrow[1].trim() });
    continue;
  }

  const star = RE_STAR.exec(line);
  if (star && !star[1] && isUpper(star[2])) {
    tokens.push({ t: 'h', marker: '*', text: star[2].trim() });
    continue;
  }

  if (inPreamble) {
    // "0. CONTENTS" is the manual's own table of contents, not a chapter.
    const num = /^(\d+)\.\s+/.exec(t);
    if (num && Number(num[1]) > 0) tokens.push({ t: 'contents', text: t });
    else tokens.push({ t: 'pre', text: t });
    continue;
  }

  if (/^\*{3}.+\*{3}$/.test(t)) {
    tokens.push({ t: 'callout', text: t });
    continue;
  }

  /*
   * A handful of sub-headings carry no marker at all - a bare "Orders" or
   * "Small fortification :" sitting directly above a list. Promote them so the
   * structure reads properly and they reach the contents sidebar.
   *
   * The rule is deliberately narrow: short, no closing full stop, immediately
   * followed by a list item, and no " - " separator (which marks the game mode
   * names in chapter 1 - content, not structure).
   */
  if (
    t.length <= 24 &&
    !/\.$/.test(t) &&
    !/ - /.test(t) &&
    /^(\s*)-\s+/.test(lines[i + 1] || '')
  ) {
    tokens.push({ t: 'h', marker: 'underline', text: t.replace(/:$/, '') });
    continue;
  }

  // A quoted numbered block opens a "build" card; its indented lines follow.
  if (/^\s*\d+\.\s+".*"\s*$/.test(line)) {
    const [, num, title] = /^\s*(\d+)\.\s+"(.*)"\s*$/.exec(line);
    tokens.push({ t: 'build', num, title });
    const meta = (lines[i + 1] || '').trim();
    if (meta && !RE_UNDERLINE.test(lines[i + 1] || '')) {
      tokens.push({ t: 'buildmeta', text: meta });
      i += 1;
    }
    continue;
  }

  const bullet = RE_BULLET.exec(line);
  if (bullet) {
    tokens.push({ t: 'li', indent: indentOf(line), text: bullet[2] });
    continue;
  }

  const ordered = RE_ORDERED.exec(line);
  if (ordered) {
    tokens.push({ t: 'ol', indent: indentOf(line), text: ordered[3] });
    continue;
  }

  if (star) {
    tokens.push({ t: 'li', indent: indentOf(line), text: star[2] });
    continue;
  }

  tokens.push({ t: 'p', indent: indentOf(line), text: t });
}

/* --- 2. render ------------------------------------------------------------ */

const out = [];
const headings = [];
let stack = [{ marker: '#section', level: 2 }];

const levelFor = (marker) => {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].marker === marker) {
      const lvl = stack[i].level;
      while (stack.length > i + 1) stack.pop();
      return lvl;
    }
  }
  return stack[stack.length - 1].level + 1;
};

let para = [];
let lists = []; // [{ indent, cls }]
let buildDepth = null;
let sectionNo = 0;
let awaitingSectionTitle = false;

const flushPara = () => {
  if (!para.length) return;
  out.push(`<p>${para.map(withLabel).join(' ')}</p>`);
  para = [];
};

/**
 * Closes every list deeper than `toIndent`.
 *
 * Each entry in `lists` is an open <ul>; `open` records whether an <li> is
 * currently open inside it, so a pop emits </li> only when there is one.
 */
const closeLists = (toIndent = -1) => {
  flushPara();
  while (lists.length && lists[lists.length - 1].indent > toIndent) {
    const l = lists.pop();
    out.push(l.open ? '</li></ul>' : '</ul>');
  }
};

const ul = (cls) => (cls ? `<ul class="${cls}">` : '<ul>');

const newList = (indent, cls) => {
  out.push(ul(cls));
  const l = { indent, cls, open: false };
  lists.push(l);
  return l;
};

const openList = (indent, cls) => {
  const top = lists[lists.length - 1];
  if (top && top.indent === indent) return top;
  if (top && top.indent < indent) return newList(indent, cls);
  closeLists(indent);
  return newList(indent, cls);
};

/**
 * Adds a list item at `indent`.
 *
 * Lists strictly deeper than `indent` are closed first (we are stepping out of
 * them); a list already open at exactly `indent` is reused, so consecutive
 * bullets at the same level stay in one <ul> rather than becoming a run of
 * one-item lists. Siblings are closed explicitly rather than left to the
 * parser's implied end tags.
 */
const addItem = (indent, cls, text) => {
  closeLists(indent);
  const l = openList(indent, cls);
  if (l.open) out.push('</li>');
  out.push(`<li>${withLabel(text)}`);
  l.open = true;
};

const closeBuild = () => {
  if (buildDepth === null) return;
  closeLists(-1);
  out.push('</div>');
  buildDepth = null;
};

for (const tok of tokens) {
  switch (tok.t) {
    case 'sec': {
      closeBuild();
      closeLists(-1);
      if (sectionNo) out.push('</section>');
      sectionNo += 1;
      out.push(`<section id="section-${sectionNo}">`);
      stack = [{ marker: '#section', level: 2 }];
      awaitingSectionTitle = true;
      break;
    }

    case 'h': {
      closeBuild();
      closeLists(-1);
      // The first heading after a <SECTION> marker is the chapter title.
      const isSectionTitle = awaitingSectionTitle;
      awaitingSectionTitle = false;
      const level = isSectionTitle ? 2 : Math.min(levelFor(tok.marker), 4);
      if (!isSectionTitle) stack.push({ marker: tok.marker, level });
      const id = `s${sectionNo}-${slug(tok.text)}`;
      headings.push({ level, id, text: tok.text });
      out.push(`<h${level} id="${id}">${headingInner(tok.text)}</h${level}>`);
      break;
    }

    case 'p': {
      if (buildDepth !== null) {
        // Inside a build card the body sits at the base indent and anything
        // deeper is a list of options (the "2nd skill:" choices).
        if (tok.indent > buildDepth + 2) addItem(tok.indent, 'sublist', tok.text);
        else para.push(tok.text);
      } else {
        closeLists(-1);
        para.push(tok.text);
      }
      break;
    }

    case 'li':
    case 'ol': {
      const indent = buildDepth !== null ? Math.max(tok.indent, buildDepth + 3) : tok.indent;
      addItem(indent, indent && indent > 2 ? 'sublist' : indent ? 'nested' : '', tok.text);
      break;
    }

    case 'build': {
      closeBuild();
      closeLists(-1);
      out.push('<div class="build">');
      out.push(`<p class="build__title">${tok.num}. <q>${esc(tok.title)}</q></p>`);
      buildDepth = indentOf(`  ${tok.num}. "${tok.title}"`);
      break;
    }

    case 'buildmeta': {
      out.push(`<p class="build__meta">${withLabel(tok.text)}</p>`);
      break;
    }

    case 'callout': {
      closeBuild();
      closeLists(-1);
      out.push(
        `<div class="callout callout--note"><span class="callout__label">Note</span>` +
          `<p>${inline(tok.text.replace(/\*{3}/g, '').trim())}</p></div>`
      );
      break;
    }

    case 'blank':
      flushPara();
      closeLists(buildDepth !== null ? buildDepth : -1);
      break;

    default:
      break;
  }
}

closeBuild();
closeLists(-1);
if (sectionNo) out.push('</section>');

/* --- page assembly -------------------------------------------------------- */

const contentsList = tokens
  .filter((t) => t.t === 'contents')
  .map((t) => `<li>${inline(t.text.replace(/^\d+\.\s*/, ''))}</li>`)
  .join('\n          ');

const toc = headings
  .filter((h) => h.level <= 3)
  .map((h) => `        <li><a href="#${h.id}">${esc(h.text)}</a></li>`)
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Game Manual &middot; Rogue Survivor Reloaded</title>
<meta name="description" content="The complete Rogue Survivor manual: the game, the city, the player sheet, every action and command, skills, items, followers, friends and foes.">
<link rel="icon" href="assets/img/icon-192.png">
<link rel="stylesheet" href="assets/css/site.css">
<meta property="og:title" content="Rogue Survivor Reloaded &mdash; Game Manual">
<meta property="og:description" content="The complete Rogue Survivor manual: actions, commands, skills, items and followers.">
<meta property="og:type" content="website">
<meta property="og:image" content="assets/img/icon-512.png">
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>

<header class="site-header">
  <div class="wrap site-header__inner">
    <a class="brand" href="index.html">
      <img src="assets/img/icon-192.png" alt="" width="28" height="28">
      <span>Rogue Survivor <em>Reloaded</em></span>
    </a>
    <nav class="site-nav" aria-label="Main">
      <a href="index.html">Home</a>
      <a href="manual.html" aria-current="page">Manual</a>
      <a href="controls.html">Controls</a>
      <a href="guide.html">Guide</a>
      <a href="info.html">About</a>
      <a href="game/index.html">Play</a>
      <a href="https://github.com/taislin/Rogue-Survivor-Reloaded">GitHub</a>
    </nav>
  </div>
</header>

<main id="main" class="wrap">
  <div class="page-head">
    <p class="eyebrow">Reference</p>
    <h1>Game Manual</h1>
    <p>The complete manual for <em>Rogue Survivor</em>, by roguedjack. This is the
    original text, reformatted for the web &mdash; not a word has been changed.</p>
  </div>

  <div class="manual-layout">
    <aside class="toc" aria-label="Manual contents">
      <p class="toc__label">Contents</p>
      <ol>
${toc}
      </ol>
    </aside>

    <article class="manual">
      <input class="manual-filter" type="search" id="manual-filter"
             placeholder="Filter the manual&hellip;" aria-label="Filter the manual">

      <div class="callout callout--note">
        <span class="callout__label">About this text</span>
        <p>The manual was written for alpha 10 of the original game and is
        slightly out of date. Parts of the game have changed since. Where this
        page and the running game disagree, the game is right.</p>
      </div>

      <div class="card" style="margin-bottom:2.5rem">
        <p class="toc__label">The nine chapters</p>
        <ol style="columns:2;column-gap:2rem;margin-bottom:0">
          ${contentsList}
        </ol>
      </div>

${out.join('\n')}
    </article>
  </div>
</main>

<footer class="site-footer">
  <div class="wrap">
    <div class="site-footer__grid">
      <div>
        <h4>Pages</h4>
        <ul>
          <li><a href="index.html">Home</a></li>
          <li><a href="manual.html">Manual</a></li>
          <li><a href="controls.html">Controls</a></li>
          <li><a href="guide.html">Guide</a></li>
          <li><a href="info.html">About the port</a></li>
        </ul>
      </div>
      <div>
        <h4>Project</h4>
        <ul>
          <li><a href="https://github.com/taislin/Rogue-Survivor-Reloaded">Source on GitHub</a></li>
          <li><a href="https://github.com/taislin/Rogue-Survivor-Reloaded/issues">Report an issue</a></li>
          <li><a href="https://github.com/taislin/Rogue-Survivor-Reloaded/blob/master/plans/BROWSER_PORT_PLAN.md">Porting plan</a></li>
        </ul>
      </div>
      <div>
        <h4>Original game</h4>
        <ul>
          <li><a href="http://roguesurvivor.blogspot.com/">roguedjack's blog</a></li>
          <li><a href="http://roguesurvivor.proboards.com/">Original forum</a></li>
        </ul>
      </div>
    </div>
    <div class="site-footer__legal">
      <p><em>Rogue Survivor</em> was created by Jacques Ruiz (roguedjack) in 2012.
      This site and the browser port are reimplementations of that work and are
      distributed under the GNU General Public License v3.0 &mdash; see
      <a href="https://github.com/taislin/Rogue-Survivor-Reloaded/blob/master/LICENSE.txt">LICENSE.txt</a>.</p>
      <p>Game text, manual and artwork &copy; Jacques Ruiz. Rogue Survivor Reloaded
      is not affiliated with or endorsed by the original author.</p>
    </div>
  </div>
</footer>

<script src="assets/js/manual.js"></script>
</body>
</html>
`;

writeFileSync(TARGET, html, 'utf8');

const count = (l) => headings.filter((h) => h.level === l).length;
console.log(
  `manual.html: ${headings.length} headings (h2:${count(2)} h3:${count(3)} h4:${count(4)}), ` +
    `${out.length} blocks, ${(html.length / 1024).toFixed(1)} KB`
);
