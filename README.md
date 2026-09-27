# Rogue Survivor Reloaded — Browser Port

A browser-playable TypeScript port of **Rogue Survivor** by
[Jacques Ruiz (roguedjack)](http://roguesurvivor.blogspot.com/), whose original
2012 C#/Windows Forms source is preserved in [`src/`](src/) and used as the
reference for every line of the port.

The game is a turn-based, real-time survival roguelike: you play a survivor
(or an undead) in a procedurally generated city, scavenging while the district
behind you floods with the dead. Survive the nights.

**Website** — the manual, controls and project notes live in
[`docs/`](docs/), published with GitHub Pages. See [`docs/README.md`](docs/README.md)
for how to enable it.

## Why This Port?

Basically, I love the original game but it is quite dated in its infrastructure. The fonts are tiny in bigger screens, and they stretch and become blurry. Maintenance is hard as it has "god files", code files with 250,000 lines (!) and 1 MB in size, for example.

I also hate C# :( and Typescript makes it run on more systems natively, and enables the game to be played on browser and (in the future, maybe) on mobile.

For now, the game will be as close to a 1:1 port as possible; the only changes will be QOL ones, like adding zoom, larger and more readable text on the UI and menus, and so forth.

Feel free to submit PRs/suggestions!

**See the [web port README](./web/README.md) for setup, architecture, and project
overview.**

---

## Contents

- [Rogue Survivor Reloaded — Browser Port](#rogue-survivor-reloaded--browser-port)
  - [Why This Port?](#why-this-port)
  - [Contents](#contents)
  - [Running it](#running-it)
    - [Development](#development)
    - [Production](#production)
    - [Offline play](#offline-play)
  - [Scripts](#scripts)
  - [Layout](#layout)
  - [How the port is organised](#how-the-port-is-organised)
  - [Assets](#assets)
  - [Display](#display)
  - [Testing and the headless simulator](#testing-and-the-headless-simulator)
  - [Known issues](#known-issues)
  - [Porting notes](#porting-notes)
  - [Website](#website)
  - [License](#license)

---

## License

GPLv3, inherited from the original project — see [`LICENSE.txt`](LICENSE.txt).

The original game and source are by Jacques Ruiz (roguedjack). This repository
is a port of that work and is covered by the same license.
