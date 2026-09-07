// Fixed-timestep requestAnimationFrame loop.
//
// Physics runs in fixed `stepDt` increments (default 1/120 s) with a capped
// catch-up so a long frame never triggers a spiral of death; rendering happens
// once per animation frame. When the document is hidden the loop notifies
// `onHidden` (the game pauses itself) and drops the elapsed gap on return.

/**
 * @typedef {object} Loop
 * @property {() => void} start
 * @property {() => void} stop
 * @property {boolean} running
 * @property {number} fps smoothed frames per second
 * @property {number} time total simulated seconds stepped
 * @property {number} stepDt fixed physics step in seconds
 */

/**
 * Create (but do not start) a game loop.
 * @param {object} opts
 * @param {(dt: number) => void} opts.step fixed-step simulation callback
 * @param {(alpha: number, fps: number) => void} opts.render per-frame draw callback; alpha = fraction of a step accumulated
 * @param {number} [opts.stepDt] physics step seconds (default 1/120)
 * @param {number} [opts.maxFrameDt] clamp for a single frame's elapsed time (default 0.25 s)
 * @param {number} [opts.maxSteps] max physics steps per frame before dropping the backlog (default 40)
 * @param {() => void} [opts.onHidden] called when the document becomes hidden
 * @param {() => void} [opts.onVisible] called when the document becomes visible again
 * @returns {Loop}
 */
export function createLoop({
  step,
  render,
  stepDt = 1 / 120,
  maxFrameDt = 0.25,
  maxSteps = 40,
  onHidden,
  onVisible,
} = {}) {
  if (typeof step !== 'function' || typeof render !== 'function') {
    throw new TypeError('createLoop: `step` and `render` callbacks are required');
  }
  const win = globalThis;
  const doc = globalThis.document;

  let rafId = 0;
  let running = false;
  let last = -1;
  let acc = 0;
  let fps = 0;
  let elapsed = 0;

  function frame(now) {
    if (!running) return;
    rafId = win.requestAnimationFrame(frame);

    if (last < 0) {
      // First frame after start/visibility change: establish the baseline only.
      last = now;
      render(acc / stepDt, fps);
      return;
    }
    let dt = (now - last) / 1000;
    last = now;
    if (dt <= 0) {
      render(acc / stepDt, fps);
      return;
    }
    const instant = 1 / dt;
    fps = fps === 0 ? instant : fps + (instant - fps) * 0.1;
    if (dt > maxFrameDt) dt = maxFrameDt;

    acc += dt;
    let n = 0;
    while (acc >= stepDt && n < maxSteps) {
      step(stepDt);
      acc -= stepDt;
      elapsed += stepDt;
      n++;
    }
    if (n >= maxSteps) acc = 0; // fell too far behind: drop the backlog rather than spiral

    render(acc / stepDt, fps);
  }

  function onVisibility() {
    if (doc.hidden) {
      onHidden?.();
    } else {
      last = -1; // skip the hidden interval instead of simulating it
      acc = 0;
      onVisible?.();
    }
  }

  function start() {
    if (running) return;
    running = true;
    last = -1;
    acc = 0;
    doc?.addEventListener('visibilitychange', onVisibility);
    rafId = win.requestAnimationFrame(frame);
  }

  function stop() {
    if (!running) return;
    running = false;
    win.cancelAnimationFrame(rafId);
    doc?.removeEventListener('visibilitychange', onVisibility);
  }

  return {
    start,
    stop,
    get running() { return running; },
    get fps() { return fps; },
    get time() { return elapsed; },
    stepDt,
  };
}
