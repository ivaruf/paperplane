// The house: room definitions consumed by game.js via objects.js.
// Importable in Node (plain data only).
//
// Coordinates are room pixels (1024 x 640, floor surface at y = 570).
// Objects omit w/h to take the type defaults from objects.js; floor-standing
// furniture omits y to sit on the floor. See docs/ARCHITECTURE.md.
//
// Design rules used throughout:
//  * A floor vent sits within ~100 px of every entrance edge so a low entry
//    can always be rescued (the glider sinks 55 px/s, a vent climbs ~85 px/s).
//  * The strips x < 100 and x > 924 contain no solids or hazards in rooms that
//    can be entered from that side.
//  * The top ~120 px stays mostly clear, but lamps / high cabinets / dart lanes
//    make the "over the top" route cost something.

export const HOUSE_NAME = 'The Slumber House';
export const START_ROOM = 'foyer';
export const START_POS = { x: 40, y: 200 };
export const FINAL_ROOM = 'trophy-room';

export const ROOMS = {
  // 1 ─────────────────────────────────────────────────────────────────────
  'foyer': {
    id: 'foyer', name: 'Foyer', left: null, right: 'living-room',
    wallpaper: 'plain',
    objects: [
      { type: 'sign', x: 90, y: 40, text: 'Fly right →' },
      { type: 'switch', x: 40, y: 290 },
      { type: 'window', x: 300, y: 110, variant: 'day' },
      { type: 'picture', x: 780, y: 90, variant: 'boat' },
      { type: 'rug', x: 120 },
      { type: 'outlet', x: 900, y: 530 },
      { type: 'table', x: 520, y: 470 },
      { type: 'books', x: 560, y: 380, variant: 'warm' },
      { type: 'vent', x: 330 },
      { type: 'vent', x: 880 },
      { type: 'star', x: 260, y: 200 },
      { type: 'star', x: 610, y: 300 },
    ],
  },

  // 2 ─────────────────────────────────────────────────────────────────────
  'living-room': {
    id: 'living-room', name: 'Living Room', left: 'foyer', right: 'hallway',
    wallpaper: 'floral',
    objects: [
      { type: 'picture', x: 10, y: 30, variant: 'landscape' },
      { type: 'picture', x: 470, y: 60, variant: 'wave' },
      { type: 'rug', x: 520 },
      { type: 'outlet', x: 600, y: 530 },
      { type: 'switch', x: 150, y: 290 },
      { type: 'shelf', x: 200, y: 90, variant: 'pink' },
      { type: 'filing', x: 200 },
      { type: 'books', x: 205, y: 350, h: 70, variant: 'cool' },
      { type: 'teddy', x: 420 },
      { type: 'shelf', x: 430, y: 380, variant: 'orange' },
      { type: 'cabinet', x: 700, y: 150 },
      { type: 'vase', x: 750, y: 50 },
      { type: 'vent', x: 40 },
      { type: 'vent', x: 900 },
      { type: 'star', x: 260, y: 260 },
      { type: 'star', x: 540, y: 300 },
      { type: 'clock', x: 970, y: 30 },
    ],
  },

  // 3 ─────────────────────────────────────────────────────────────────────
  'hallway': {
    id: 'hallway', name: 'Hallway', left: 'living-room', right: 'library',
    wallpaper: 'stripes',
    objects: [
      { type: 'picture', x: 120, y: 80, variant: 'portrait' },
      { type: 'picture', x: 440, y: 80, variant: 'abstract' },
      { type: 'picture', x: 760, y: 80, variant: 'boat' },
      { type: 'clock-wall', x: 660, y: 30 },
      { type: 'rug', x: 360, w: 320 },
      { type: 'duct', x: 460 },
      { type: 'bracket-shelf', x: 300, y: 250 },
      { type: 'bracket-shelf', x: 660, y: 250 },
      { type: 'table', x: 400, y: 470 },
      { type: 'books', x: 470, y: 380, variant: 'warm' },
      { type: 'vent', x: 120 },
      { type: 'vent', x: 820 },
      { type: 'star', x: 500, y: 200 },
      { type: 'star', x: 150, y: 400 },
      { type: 'clock', x: 700, y: 460 },
      { type: 'battery', x: 320, y: 160 },
    ],
  },

  // 4 ─────────────────────────────────────────────────────────────────────
  'library': {
    id: 'library', name: 'Library', left: 'hallway', right: 'kitchen',
    wallpaper: 'diamonds',
    objects: [
      { type: 'picture', x: 380, y: 40, variant: 'portrait' },
      { type: 'picture', x: 800, y: 160, variant: 'landscape' },
      { type: 'rug', x: 330, w: 220 },
      { type: 'bookcase', x: 150 },
      { type: 'bookcase', x: 560, h: 220 },
      { type: 'books', x: 580, y: 260, variant: 'cool' },
      { type: 'lamp', x: 700 },
      { type: 'balloon-spawner', x: 380, interval: 4, delay: 1.5 },
      { type: 'vent', x: 40 },
      { type: 'vent', x: 440 },
      { type: 'vent', x: 880 },
      { type: 'star', x: 350, y: 500 },
      { type: 'star', x: 620, y: 200 },
      { type: 'clock', x: 470, y: 150 },
      { type: 'life', x: 240, y: 100 },
    ],
  },

  // 5 ─────────────────────────────────────────────────────────────────────
  'kitchen': {
    id: 'kitchen', name: 'Kitchen', left: 'library', right: 'dining-room',
    wallpaper: 'tiles', wallColor: '#f1ecdc',
    objects: [
      { type: 'window', x: 680, y: 60, variant: 'day' },
      { type: 'outlet', x: 420, y: 520 },
      { type: 'table', x: 150, y: 470 },
      { type: 'toaster', x: 230, y: 410, interval: 3, delay: 0.8 },
      { type: 'cabinet', x: 460, y: 20 },
      { type: 'fan', x: 500, dir: 1 },
      { type: 'toaster', x: 700, interval: 3.5, delay: 2 },
      { type: 'vent', x: 40 },
      { type: 'vent', x: 900 },
      { type: 'star', x: 340, y: 300 },
      { type: 'star', x: 820, y: 380 },
      { type: 'clock', x: 520, y: 300 },
      { type: 'battery', x: 640, y: 200 },
    ],
  },

  // 6 ─────────────────────────────────────────────────────────────────────
  'dining-room': {
    id: 'dining-room', name: 'Dining Room', left: 'kitchen', right: 'study',
    wallpaper: 'dots',
    objects: [
      { type: 'picture', x: 420, y: 60, variant: 'portrait' },
      { type: 'picture', x: 760, y: 140, variant: 'landscape' },
      { type: 'rug', x: 360, w: 340 },
      { type: 'shelf', x: 150, y: 100, variant: 'green' },
      { type: 'table', x: 380, y: 460, w: 300 },
      { type: 'candle', x: 430, y: 390 },
      { type: 'candle', x: 620, y: 390 },
      { type: 'lamp', x: 720 },
      { type: 'vent', x: 40 },
      { type: 'vent', x: 880 },
      { type: 'star', x: 300, y: 400 },
      { type: 'star', x: 760, y: 300 },
      { type: 'clock', x: 540, y: 320 },
    ],
  },

  // 7 ─────────────────────────────────────────────────────────────────────
  'study': {
    id: 'study', name: 'Study', left: 'dining-room', right: 'bathroom',
    wallpaper: 'stripes', wallColor: '#eee3cc',
    objects: [
      { type: 'window', x: 780, y: 60, variant: 'night' },
      { type: 'picture', x: 420, y: 40, variant: 'abstract' },
      { type: 'clock-wall', x: 640, y: 40 },
      { type: 'rug', x: 540, w: 280 },
      { type: 'bookcase', x: 200 },
      { type: 'bracket-shelf', x: 420, y: 190 },
      { type: 'table', x: 560, y: 470 },
      { type: 'books', x: 600, y: 380, variant: 'warm' },
      { type: 'dart-spawner', side: 'right', y: 170, interval: 3, delay: 1 },
      { type: 'dart-spawner', side: 'left', y: 230, interval: 3.5, delay: 2.5 },
      { type: 'vent', x: 40 },
      { type: 'vent', x: 880 },
      { type: 'star', x: 300, y: 200 },
      { type: 'star', x: 850, y: 450 },
      { type: 'clock', x: 720, y: 300 },
      { type: 'battery', x: 150, y: 420 },
    ],
  },

  // 8 ─────────────────────────────────────────────────────────────────────
  'bathroom': {
    id: 'bathroom', name: 'Bathroom', left: 'study', right: 'nursery',
    wallpaper: 'tiles', wallColor: '#e4eef0',
    objects: [
      { type: 'window', x: 150, y: 60, variant: 'day' },
      { type: 'rug', x: 560, w: 200, variant: 'blue' },
      { type: 'bracket-shelf', x: 400, y: 150 },
      { type: 'filing', x: 230 },
      { type: 'table', x: 600, y: 470 },
      { type: 'fishbowl', x: 680, y: 400, interval: 3.5, delay: 1.5 },
      { type: 'drip-spawner', x: 300, interval: 2.2, delay: 0.5 },
      { type: 'drip-spawner', x: 500, interval: 2.8, delay: 1.4 },
      { type: 'drip-spawner', x: 820, interval: 2.0, delay: 1.0 },
      { type: 'vent', x: 40 },
      { type: 'vent', x: 880 },
      { type: 'star', x: 320, y: 300 },
      { type: 'star', x: 760, y: 300 },
      { type: 'life', x: 470, y: 500 },
    ],
  },

  // 9 ─────────────────────────────────────────────────────────────────────
  'nursery': {
    id: 'nursery', name: 'Nursery', left: 'bathroom', right: 'attic-stairs',
    wallpaper: 'dots', wallColor: '#f6e8ec',
    objects: [
      { type: 'window', x: 120, y: 60, variant: 'night' },
      { type: 'picture', x: 380, y: 70, variant: 'boat' },
      { type: 'rug', x: 300, w: 300, variant: 'blue' },
      { type: 'teddy', x: 160 },
      { type: 'bracket-shelf', x: 200, y: 330 },
      { type: 'balloon-spawner', x: 300, interval: 4, delay: 0.5 },
      { type: 'table', x: 400, y: 470, w: 200 },
      { type: 'shelf', x: 600, y: 300, variant: 'green' },
      { type: 'books', x: 640, y: 210, variant: 'cool' },
      { type: 'copter-spawner', x: 300, interval: 3.5, delay: 1 },
      { type: 'copter-spawner', x: 700, interval: 4, delay: 2.5 },
      { type: 'vent', x: 40 },
      { type: 'vent', x: 880 },
      { type: 'helium', x: 500, y: 120 },
      { type: 'star', x: 320, y: 380 },
      { type: 'star', x: 700, y: 500 },
      { type: 'clock', x: 950, y: 60 },
    ],
  },

  // 10 ────────────────────────────────────────────────────────────────────
  'attic-stairs': {
    id: 'attic-stairs', name: 'Attic Stairs', left: 'nursery', right: 'attic',
    wallpaper: 'plain', wallColor: '#e9dfcb',
    objects: [
      { type: 'picture', x: 100, y: 200, variant: 'abstract' },
      { type: 'lamp', x: 200 },
      { type: 'lamp', x: 620 },
      { type: 'duct', x: 400, fieldH: 300 },
      { type: 'duct', x: 760 },
      { type: 'table', x: 300, y: 500, w: 120 },
      { type: 'table', x: 420, y: 440, w: 120 },
      { type: 'table', x: 540, y: 380, w: 120 },
      { type: 'vent', x: 40 },
      { type: 'vent', x: 880 },
      { type: 'battery', x: 480, y: 200 },
      { type: 'clock', x: 590, y: 300 },
      { type: 'star', x: 150, y: 450 },
      { type: 'star', x: 720, y: 200 },
    ],
  },

  // 11 ────────────────────────────────────────────────────────────────────
  'attic': {
    id: 'attic', name: 'Attic', left: 'attic-stairs', right: 'trophy-room',
    wallpaper: 'planks', wallColor: '#e6d3b3',
    objects: [
      { type: 'window', x: 560, y: 40, variant: 'night', w: 140, h: 140 },
      { type: 'bookcase', x: 160 },
      { type: 'candle', x: 235, y: 200 },
      { type: 'teddy', x: 360 },
      { type: 'lamp', x: 400 },
      { type: 'balloon-spawner', x: 470, interval: 5, delay: 2 },
      { type: 'filing', x: 560 },
      { type: 'books', x: 565, y: 330, variant: 'warm' },
      { type: 'drip-spawner', x: 620, interval: 3, delay: 1 },
      { type: 'dart-spawner', side: 'right', y: 130, interval: 4, delay: 2.5 },
      { type: 'cabinet', x: 860, y: 340 },
      { type: 'lamp', x: 900 },
      { type: 'vent', x: 40 },
      { type: 'vent', x: 740 },
      { type: 'helium', x: 290, y: 120 },
      { type: 'life', x: 520, y: 200 },
      { type: 'star', x: 380, y: 380 },
      { type: 'star', x: 760, y: 250 },
      { type: 'clock', x: 950, y: 250 },
    ],
  },

  // 12 ────────────────────────────────────────────────────────────────────
  'trophy-room': {
    id: 'trophy-room', name: 'Trophy Room', left: 'attic', right: null,
    wallpaper: 'plain', wallColor: '#dfe9f3',
    objects: [
      { type: 'sign', x: 412, y: 40, text: 'You made it!' },
      { type: 'window', x: 100, y: 120, variant: 'day' },
      { type: 'window', x: 724, y: 120, variant: 'day' },
      { type: 'picture', x: 422, y: 130, variant: 'wave' },
      { type: 'rug', x: 362, w: 300, variant: 'blue' },
      { type: 'trophy', x: 472 },
      { type: 'vent', x: 40 },
      { type: 'vent', x: 880 },
      { type: 'star', x: 300, y: 320 },
      { type: 'star', x: 690, y: 320 },
      { type: 'star', x: 494, y: 300 },
      { type: 'clock', x: 490, y: 380 },
    ],
  },
};
