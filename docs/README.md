# docs/ — the project website

Static site for **Rogue Survivor Reloaded**, published with GitHub Pages.

## Pages

| File           | What it is                                                        |
|----------------|-------------------------------------------------------------------|
| `index.html`   | Landing page: the pitch, how to play, game modes, bestiary, how to run it |
| `manual.html`  | The complete game manual (original text by the game's author)     |
| `controls.html`| Every default keybinding, grouped and annotated                   |
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

The site's own assets are about 240 KB in total. Sprites are displayed with
`image-rendering: pixelated` so they stay crisp when scaled up.

## Conventions

- No framework, no bundler, no build step, no analytics. Plain HTML, one
  stylesheet (`assets/css/site.css`), and one small script on the manual page
  only. Every page is fully readable with JavaScript disabled.
- All URLs are **relative**, so the site works at a domain root and under a
  `/<repo>/` project subpath.
- The header and footer markup is duplicated across the four hand-written pages
  on purpose: there is no templating, and keeping it literal means the pages
  work with no tooling at all. If you change one, change all four.
- Colours, spacing and breakpoints are CSS custom properties at the top of
  `site.css`. Change them there, not inline.
