// Bootstrap: wire canvas, input, UI, audio and the game together, then start
// the fixed-timestep loop. `window.__glider` exposes the Game for debugging.

import { ui } from './ui.js';
import { audio } from './audio.js';
import { createInput } from './engine/input.js';
import { createRenderer } from './engine/renderer.js';
import { createLoop } from './engine/loop.js';
import { Game } from './game/game.js';

/**
 * Create and start the game. Called once the DOM is ready.
 * @returns {Game}
 */
function boot() {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Glider: <canvas id="game"> not found');
  }

  ui.init();
  const input = createInput(window);
  const renderer = createRenderer(canvas);
  const game = new Game({ input, ui, audio });

  input.onAction((action) => {
    if (action === 'debug') {
      const on = renderer.toggleDebug();
      ui.toast(on ? 'Debug overlay on' : 'Debug overlay off', 1200);
      return;
    }
    game.handleAction(action);
  });

  const loop = createLoop({
    step: (dt) => game.update(dt),
    render: (_alpha, fps) => renderer.draw(game.getScene(), fps),
    onHidden: () => game.onHidden(),
  });

  game.showTitle();
  loop.start();

  window.__glider = game; // debugging aid only
  return game;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
