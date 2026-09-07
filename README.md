# Glider (homage)

A browser homage to **Glider**, John Calhoun's classic Macintosh game: a paper
airplane drifts through the rooms of a house, sinking slowly, while you steer it
left and right. Floor vents blow it upward, ceiling ducts push it down, candles
give a gentle lift — and every table, shelf, balloon, dart and drip in the house
wants to bring it down. Fly off the edge of a room to reach the next one and make
it to the last room to win.

Everything is drawn procedurally on a `<canvas>`; the only image assets are the
PWA icons. Vanilla HTML/CSS/JS (ES modules), Canvas 2D, Web Audio — no
frameworks, no build step, no npm dependencies.

## Run it locally

Service workers and ES modules need to be served over HTTP (not `file://`).
Any static server will do; from the repo root:

```sh
python3 -m http.server 8080
# or
npx serve
```

Then open <http://localhost:8080>.

## Controls

| Action        | Keyboard                          | Touch                     |
| ------------- | --------------------------------- | ------------------------- |
| Steer left    | `←` or `A`                        | left arrow button         |
| Steer right   | `→` or `D`                        | right arrow button        |
| Boost (climb) | `↑`, `W` or `Space` (needs charge) | `▲ boost` button          |
| Start / resume | `Enter`                          | Start / Resume buttons    |
| Pause         | `P` or `Esc`                      | pause button (top right)  |
| Mute          | `M`                               | speaker button (footer)   |
| Debug overlay | `` ` ``                           | —                         |

Pickups: **stars** (100 points), **clocks** (300), **extra gliders** (+1 life),
**batteries** (+2 boost charges) and **helium** (float upward for 8 seconds).
Crashing costs a glider and puts you back where you entered the room.

## PWA / offline

The app is an installable Progressive Web App:

* `manifest.webmanifest` declares the standalone, landscape app with 192/512
  PNG icons (plus a maskable variant) and an SVG icon.
* `sw.js` precaches the complete app shell on install and serves same-origin
  requests cache-first with a background refresh, so the game works fully
  offline after the first visit. Navigations fall back to `index.html`.
* `js/pwa.js` registers the worker (relative path, so it works under a
  sub-path), shows a **New version available — Reload** banner when an update is
  waiting, and reveals an **Install** button on the title screen where the
  browser supports `beforeinstallprompt`.

Bump `VERSION` in `sw.js` whenever shell files change so clients pick up the
new cache. High score and mute preference are stored in `localStorage`
(`glider.highScore`, `glider.muted`).

## Project structure

```
index.html                 app shell: HUD, canvas, overlay screens, touch controls
manifest.webmanifest       PWA manifest
sw.js                      service worker (precache, cache-first, versioned)
css/style.css              layout, HUD, overlays, touch controls, responsive canvas
icons/                     icon.svg + generated PNGs
js/main.js                 bootstrap, game state machine, main loop
js/config.js               shared geometry constants
js/pwa.js                  SW registration, update banner, install prompt
js/ui.js                   HUD / overlay DOM API
js/audio.js                procedural Web Audio sound effects
js/engine/                 loop, input, renderer
js/game/                   game, glider, physics, storage, objects, levels
js/render/sprites.js       procedural drawing of rooms, objects and the glider
scripts/make-icons.mjs     regenerates the PNG icons (node, no dependencies)
scripts/validate-levels.mjs validates rooms/links/object types
docs/ARCHITECTURE.md       module contract
```

Regenerate the icons with `node scripts/make-icons.mjs`.

## Credits & disclaimer

Glider was created by John Calhoun (Casady & Greene, later Soft Dorothy) and
is a beloved piece of Macintosh history. This project is a **fan homage** built
from scratch for fun; it is not affiliated with, endorsed by, or derived from
the original game's code or assets. All artwork and sounds here are generated
procedurally.
