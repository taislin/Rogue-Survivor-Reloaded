# docs/ — the project website

Static site for **Rogue Survivor Reloaded**, published with GitHub Pages.

## Pages

| File           | What it is                                                        |
|----------------|-------------------------------------------------------------------|
| `index.html`   | Landing page: the pitch, how to play, game modes, how to run it    |
| `manual.html`  | The complete game manual (original text by the game's author)     |
| `controls.html`| Every default keybinding, grouped and annotated                   |
| `guide.html`   | Field guide: every undead type, and every place worth looting      |
| `info.html`    | How the port works, project status, credits, licensing            |
| `404.html`     | Not-found page                                                     |

## Publishing

This is the **"deploy from a branch"** layout: `docs/` on `master` is the site root.
To turn it on, in the repository settings set **Pages → Source → Deploy from a
branch**, branch `master`, folder `/docs`. No workflow and no build step is
involved — GitHub serves the files as they are committed.

`.nojekyll` is present, so Jekyll is bypassed entirely. That matters: without it,
Jekyll would ignore any path beginning with an underscore and refuse to process
files it does not recognise.

## Regenerating the manual

`manual.html` is **generated** — do not edit it by hand. It is built from the
original manual, which is the single source of truth for that text:

```bash
node docs/tools/build-manual.mjs
```

Source: `src/Resources/Manual/RS Manual.txt`
(an identical copy ships to the game as `web/public/assets/manual.txt`).

The script only reformats. It recognises the plain-text conventions the manual
uses — `<SECTION>` markers, underlined titles, `>` and `*` headings, `-` bullets,
`1. "Quoted"` build blocks, `LABEL   : description` pairs — and emits semantic
HTML. It rewrites no words. If you change the manual, re-run the script.

The two-pass design (tokenise, then render) exists because a heading's level
depends on its neighbours: the source mixes two conventions, underlined titles
and `>` titles, and either can nest under the other.

## Adding an image

Sprites are copied in from `web/public/assets/images/classic/`, converted to
lossless WebP, 32×32. The site uses a curated subset in `assets/img/` — copy new
files in rather than symlinking or referencing `../web/`, because Pages only
serves what is inside `docs/`.

Sprites are displayed with `image-rendering: pixelated` so they stay crisp when
scaled up. The gameplay screenshots in `assets/img/screens/` are the exception:
they are already 1:1 canvas output, so they are *not* pixelated, and they are
1562×867 rather than 32×32.

The site's own served assets are about **220 KB** across 54 files — roughly 16 KB
of sprites, 152 KB of screenshots, 28 KB of icons and 22 KB of CSS/JS.

`assets/img/screens/screens.psd` is the layered source for those screenshots.
Only the flattened WebP is published. The PSD is a 5.3 MB working file that
nothing references, so it is untracked and listed in the root `.gitignore` —
Pages never sees it, and no visitor downloads it. Keep it locally if you want to
keep editing the artwork.

## Checking the site

```bash
node docs/tools/check-site.mjs
```

Exits non-zero on anything broken, so it works as a gate. It verifies that every
local `href`/`src` resolves, every in-page `#fragment` has a target, tags balance,
the `<head>` essentials are present, each page has exactly one `<h1>` and one
`aria-current`, every `<img>` has `alt`, and the GPL attribution is in the
footer.

It also enforces both directions of stylesheet coverage: a class used in the HTML
but missing from `site.css` fails, **and** a class defined in `site.css` that no
page uses fails. The second rule is the one to watch when editing the CSS — add a
rule and a matching usage in the same change, or drop the rule.

## Conventions

- No framework, no bundler, no build step, no analytics. Plain HTML, one
  stylesheet (`assets/css/site.css`), and one small script on the manual page
  only. Every page is fully readable with JavaScript disabled.
- All URLs are **relative**, so the site works at a domain root and under a
  `/<repo>/` project subpath.
- The header and footer markup is duplicated across the hand-written pages on
  purpose: there is no templating, and keeping it literal means the pages work
  with no tooling at all. If you change one, change all of them — a nav change
  is a five-file change (`index`, `manual`, `controls`, `guide`, `info`, plus the
  nav in `404`), and `check-site.mjs` requires every page to link to every other
  real page, so a missed one fails the gate.
- Colours, spacing and breakpoints are CSS custom properties at the top of
  `site.css`. Change them there, not inline.
