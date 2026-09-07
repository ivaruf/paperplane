# Glider homage — architecture & module contract

Vanilla HTML/CSS/JS (ES modules), Canvas 2D, no frameworks, no build step.
Installable PWA with a service worker. Everything is drawn procedurally on the
canvas — there are no image assets except the PWA icons.

## Gameplay summary (what we are cloning)

A paper airplane glides through the rooms of a house, viewed from the side.
It sinks slowly and constantly; the player only steers left/right. Floor vents
blow air upward (updraft columns), ceiling ducts blow downward, candles create
weaker updrafts above their flames. Touching furniture (tables, shelves,
cabinets), the floor, or a hazard (candle flame, balloon, copter, dart, toast,
water drip) destroys the glider; the player loses a life and restarts at the
point where they entered the current room. Flying off the left/right edge of a
room moves to the neighbouring room. Pickups: stars (points), clocks (more
points), extra gliders (extra life), batteries (boost charges: hold Up/Space to
climb briefly), helium (temporary float upward). Reaching the final room wins.

## Directory layout & ownership

```
index.html                 C   app shell: HUD bar, <canvas id="game">, overlay screens, touch controls
manifest.webmanifest       C
sw.js                      C   service worker (precache app shell, cache-first, versioned)
icons/                     C   PNG icons 192/512 (+ maskable) and icon.svg, apple-touch-icon
css/style.css              C   layout, HUD, overlays, touch controls, responsive canvas scaling
js/pwa.js                  C   SW registration, install prompt, update toast
js/ui.js                   C   DOM HUD / overlay API (see below)
js/audio.js                C   Web Audio procedural SFX (see below)
js/config.js               shared, read-only  geometry constants
js/main.js                 A   bootstrap, game state machine, main loop
js/engine/loop.js          A   fixed-timestep rAF loop
js/engine/input.js         A   keyboard + `glider:input` virtual events
js/engine/renderer.js      A   canvas sizing/DPR, frame composition, debug overlay
js/game/game.js            A   Game class: lives/score/room transitions/respawn/pickups/win
js/game/glider.js          A   glider physics & crash animation state
js/game/physics.js         A   rect intersection, field application, collision resolution
js/game/storage.js         A   localStorage high score
js/game/objects.js         B   object type registry: createObject / updateObject
js/game/levels.js          B   the house: ROOMS, START_ROOM, START_POS, FINAL_ROOM
js/render/sprites.js       B   drawObject / drawGlider / drawRoomBackground (procedural)
scripts/validate-levels.mjs B  node script validating rooms/links/object types
README.md                  C   how to run locally (python3 -m http.server / npx serve)
```

Rules:
* Only edit files you own. If you need something from another module, code
  against the contract below — do not implement it yourself.
* `js/game/objects.js`, `js/game/levels.js` and `js/config.js` must be
  importable in Node (no `window`/`document`/canvas access at module top level).
  `sprites.js` may only touch the `ctx` it is handed.
* Coordinates: room space is `ROOM_W x ROOM_H` logical pixels (see config).
  Top-left origin, y grows downward. All object rects are top-left based.

## Shared constants — `js/config.js`

```js
export const ROOM_W = 1024;      // logical playfield width
export const ROOM_H = 640;       // logical playfield height (canvas is exactly this)
export const FLOOR_Y = 570;      // y of the floor surface; y >= FLOOR_Y is floor/baseboard
export const CEILING_Y = 0;
export const GLIDER_W = 48;
export const GLIDER_H = 22;
```

## Object instances (produced by B, consumed by A)

`levels.js` describes rooms with plain *definitions*; `objects.js` turns each
definition into an *instance* with `createObject(def)`.

```js
// Room definition (levels.js)
{
  id: 'living-room',            // unique string
  name: 'Living Room',          // shown in HUD
  left:  'hallway' | null,      // room id reached by flying off the left edge; null = solid wall
  right: 'kitchen' | null,
  wallpaper: 'floral' | 'dots' | 'stripes' | 'plain',   // background style key (B may add more)
  wallColor?: '#f3ead6',        // optional tint override
  objects: [ ObjectDef, ... ]
}

// ObjectDef (levels.js) — everything except `type` is optional; objects.js fills defaults
{ type: 'table', x: 640, y: 490, w: 240, ...typeSpecific }

// Object instance (objects.js → createObject(def))
{
  id: number,                   // unique within the room
  type: string,                 // e.g. 'table'
  x, y, w, h: number,           // draw rect AND default collision rect (top-left based, room coords)
  category: 'solid' | 'hazard' | 'pickup' | 'decor',
  z?: number,                   // draw order, lower first, default 0 (pictures = -1, effects = 1)
  hitbox?: { x, y, w, h },      // optional absolute-room-coords override for collision
  field?: { x, y, w, h, fx, fy }, // optional force region in room coords; fx/fy in px/s added to glider velocity
                                // (vent: fy ≈ -140 in a column from the vent to the ceiling; duct: fy ≈ +120; candle: fy ≈ -70)
  pickup?: { kind: 'star' | 'clock' | 'life' | 'battery' | 'helium', points: number },
  vx?, vy?: number,             // for moving objects (informational; objects.js moves them itself)
  dead?: boolean,               // set true to be removed by the room next frame
  ...typeSpecificState
}
```

Contact semantics handled by A (`physics.js` / `game.js`):
* `solid`, `hazard` → glider crashes on rect intersection with `hitbox ?? rect`.
* `pickup` → A applies `pickup.kind`, adds `pickup.points`, sets `dead = true`, plays a sound.
* `decor` → no contact effect.
* `field` (any category) → while the glider rect intersects `field`, add `fx, fy` to its velocity.

### `js/game/objects.js` API (B)

```js
export const OBJECT_TYPES;                 // { [type]: { category, defaults:{w,h}, ... } } — for validation/debug
export function createObject(def, idGen?)  // → instance (fills id, w, h, category, hitbox/field/pickup)
export function createRoomObjects(roomDef) // → instance[] (convenience: maps createObject over roomDef.objects)
export function updateObject(inst, dt, env)
   // dt seconds. env = { time, roomW, roomH, floorY, spawn(inst), glider: {x,y,w,h} }
   // Moves balloons/copters/darts/toast/drips, animates flames, runs spawners via env.spawn(createObject({...})).
   // Sets inst.dead = true when it leaves the room. Must be side-effect free apart from inst and env.spawn.
export function resetObject(inst)          // restore spawn-time state (used when the glider respawns in a room)
```

Required object types (B may add more): `table`, `shelf`, `cabinet`, `bookcase`, `picture`,
`vase`, `teddy`, `books`, `vent`, `duct`, `candle`, `balloon-spawner`/`balloon`,
`copter-spawner`/`copter`, `dart-spawner`/`dart`, `toaster`/`toast`, `drip-spawner`/`drip`,
`star`, `clock`, `life`, `battery`, `helium`, `lamp`, `trophy` (win marker in the final room, pickup kind `'trophy'`
is NOT used — win is triggered by room id; trophy is decor).

### `js/game/levels.js` API (B)

```js
export const ROOMS;        // { [id]: RoomDef }  (10–14 rooms, difficulty ramps left→right)
export const START_ROOM;   // room id
export const START_POS;    // { x, y } glider top-left in START_ROOM
export const FINAL_ROOM;   // entering this room wins the game
export const HOUSE_NAME;   // 'The Fredriksen House' style title string
```

### `js/render/sprites.js` API (B)

```js
export function drawRoomBackground(ctx, roomDef, time)  // wallpaper, ceiling moulding, baseboard, floor; fills whole ROOM_W x ROOM_H
export function drawObject(ctx, inst, time)             // one object; must not depend on draw order side-effects
export function drawGlider(ctx, glider, time)
   // glider = { x, y, w, h, facing: 1 | -1, state: 'flying' | 'crashing' | 'burning' | 'spawning', stateTime, boostActive, helium }
export function drawFieldHint(ctx, field, time)         // faint animated air-flow lines (renderer calls for every field)
```

Visual style: match Glider Classic — cream wallpaper (#f3ead6) with a subtle
pattern, light grey baseboard, thin darker line at floor surface, warm wood
furniture with dark outlines, pastel paintings in grey frames, white paper
airplane with light grey fold lines. Clean flat shapes, 2px dark outlines.

## UI API — `js/ui.js` (C)

```js
export const ui = {
  init(),
  setScore(n), setLives(n), setRoom(name), setBoost(n), setHelium(seconds|0),
  showScreen(name, data),   // name: 'title' | 'paused' | 'gameover' | 'win' | null (hide)
                            // data: { score, highScore, houseName, rooms, lives, newHighScore }
  toast(message, ms = 2000),
  flash(),                  // brief white flash on crash (CSS animation)
};
```
Overlay buttons dispatch: `window.dispatchEvent(new CustomEvent('glider:action', { detail: { action } }))`
with `action` in `'start' | 'resume' | 'restart' | 'pause' | 'mute'`.
Touch/virtual controls dispatch: `CustomEvent('glider:input', { detail: { action: 'left'|'right'|'boost', pressed: boolean } })`.
The HUD must show: glider icon + lives count (left), score + star icon (right), room name (centre), boost charges.

## Audio API — `js/audio.js` (C)

```js
export const audio = {
  init(),                    // create AudioContext lazily on first user gesture
  play(name),                // 'start' | 'pickup' | 'star' | 'clock' | 'life' | 'battery' | 'helium'
                             // 'crash' | 'burn' | 'roomchange' | 'gameover' | 'win' | 'boost' | 'pause'
  setMuted(bool), toggleMute() → bool, isMuted()
};
```
All sounds are synthesised with oscillators/noise — no audio files.

## Input (A) — `js/engine/input.js`

Keyboard: ArrowLeft/A, ArrowRight/D, ArrowUp/W/Space = boost, Enter = start/resume, P/Escape = pause,
M = mute, backtick = debug overlay. Also listens to `glider:input` and `glider:action` events.

## Game flow (A)

title → playing → (crash → respawn at room entry point, lives-1) → gameover when lives < 0
→ win when entering FINAL_ROOM. Score: star 100, clock 300, life +1 life (+50), battery +2 boosts,
helium 8 s. High score persisted in localStorage key `glider.highScore`. Room transitions carry the
glider's y across; entering a room resets its objects (`resetObject`) and records the entry point.
Pickups collected in a room stay collected for the rest of the game (tracked per room by type + position in
`game.js`), so dying or re-entering a room cannot be used to farm points.
Edges without a neighbouring room are solid walls (clamp x). Ceiling clamps y. Floor kills.

## Canvas

`index.html` has `<canvas id="game"></canvas>`. A sets `canvas.width/height = ROOM_W/H * devicePixelRatio`
and scales the context; C controls only the CSS size (`aspect-ratio: 1024 / 640`, fit within viewport
below the HUD). C must not set the width/height attributes.

## Running

`python3 -m http.server 8080` in the repo root (or `npx serve`), open http://localhost:8080.
Service workers need localhost or https.
