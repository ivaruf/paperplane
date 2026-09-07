// Keyboard + virtual-control input.
//
// Continuous controls (left/right/boost) are exposed as a held-`state` object
// plus rising-edge press counters (`consumePress`), so a tap shorter than one
// physics step is never lost. Discrete commands are delivered to `onAction`
// subscribers. Also consumes the `glider:input` / `glider:action` CustomEvents
// dispatched by the touch controls and overlay buttons (see ARCHITECTURE.md).

/** CustomEvent name for held virtual controls: detail = { action: 'left'|'right'|'boost', pressed }. */
export const INPUT_EVENT = 'glider:input';
/** CustomEvent name for overlay actions: detail = { action: 'start'|'resume'|'restart'|'pause'|'mute' }. */
export const ACTION_EVENT = 'glider:action';

/** Continuous controls, in the order they are reported. */
export const CONTROLS = Object.freeze(['left', 'right', 'boost']);

/**
 * Actions emitted to onAction subscribers:
 *  - from keyboard: 'enter' (Enter: start/resume/restart depending on game state),
 *    'pause' (P/Escape toggle), 'mute' (M), 'debug' (backtick)
 *  - forwarded from `glider:action` events: 'start' | 'resume' | 'restart' | 'pause' | 'mute'
 */
export const ACTIONS = Object.freeze(['enter', 'start', 'resume', 'restart', 'pause', 'mute', 'debug']);

const CODE_TO_CONTROL = Object.freeze({
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'boost', KeyW: 'boost', Space: 'boost',
});
const KEY_TO_CONTROL = Object.freeze({
  arrowleft: 'left', a: 'left',
  arrowright: 'right', d: 'right',
  arrowup: 'boost', w: 'boost', ' ': 'boost', spacebar: 'boost',
});
const CODE_TO_ACTION = Object.freeze({
  Enter: 'enter', NumpadEnter: 'enter',
  KeyP: 'pause', Escape: 'pause',
  KeyM: 'mute',
  Backquote: 'debug',
});
const KEY_TO_ACTION = Object.freeze({
  enter: 'enter', p: 'pause', escape: 'pause', esc: 'pause', m: 'mute', '`': 'debug',
});
const EVENT_ACTIONS = new Set(['start', 'resume', 'restart', 'pause', 'mute']);

/**
 * @typedef {object} Input
 * @property {{ left: boolean, right: boolean, boost: boolean }} state held controls (keyboard OR virtual)
 * @property {(cb: (action: string) => void) => () => void} onAction subscribe; returns an unsubscribe function
 * @property {(control: string) => boolean} consumePress true if the control was pressed (rising edge) since the last call; clears the counter
 * @property {(control: string) => number} pressCount pending rising edges without clearing
 * @property {() => void} clearPresses drop all pending rising edges
 * @property {() => void} releaseAll release every held key/virtual control
 * @property {() => void} reset releaseAll + clearPresses
 * @property {() => void} attach add DOM listeners (done by createInput)
 * @property {() => void} detach remove DOM listeners
 */

/**
 * Create the input controller and attach its listeners.
 * @param {EventTarget & { document?: Document }} [target] usually `window`
 * @returns {Input}
 */
export function createInput(target = globalThis.window) {
  const state = { left: false, right: false, boost: false };
  const presses = { left: 0, right: 0, boost: 0 };
  const virtual = { left: false, right: false, boost: false };
  /** @type {Map<string, string>} physical key id → control */
  const heldKeys = new Map();
  /** @type {Set<(action: string) => void>} */
  const listeners = new Set();
  let attached = false;

  function recompute(control) {
    let held = virtual[control];
    if (!held) {
      for (const c of heldKeys.values()) {
        if (c === control) { held = true; break; }
      }
    }
    if (held && !state[control]) presses[control] += 1;
    state[control] = held;
  }

  function emit(action) {
    for (const cb of listeners) cb(action);
  }

  function isTextTarget(el) {
    if (!el || typeof el !== 'object') return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
  }

  function controlFor(e) {
    return CODE_TO_CONTROL[e.code] ?? KEY_TO_CONTROL[String(e.key).toLowerCase()] ?? null;
  }
  function actionFor(e) {
    return CODE_TO_ACTION[e.code] ?? KEY_TO_ACTION[String(e.key).toLowerCase()] ?? null;
  }
  function keyId(e) {
    return e.code || e.key;
  }

  function onKeyDown(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTextTarget(e.target)) return;
    const control = controlFor(e);
    if (control) {
      e.preventDefault(); // arrows/space must not scroll the page
      // Register on repeats too (idempotent) so a key held across a focus loss re-registers.
      heldKeys.set(keyId(e), control);
      recompute(control);
      return;
    }
    const action = actionFor(e);
    if (action) {
      e.preventDefault(); // also stops Enter/Space from re-activating a focused overlay button
      if (!e.repeat) emit(action);
    }
  }

  function onKeyUp(e) {
    const id = keyId(e);
    const control = heldKeys.get(id);
    if (control !== undefined) {
      heldKeys.delete(id);
      recompute(control);
      e.preventDefault();
      return;
    }
    if (!isTextTarget(e.target) && (controlFor(e) || actionFor(e))) e.preventDefault();
  }

  function onVirtualInput(e) {
    const d = e.detail;
    if (!d || !Object.hasOwn(virtual, d.action)) return;
    virtual[d.action] = Boolean(d.pressed);
    recompute(d.action);
  }

  function onVirtualAction(e) {
    const action = e.detail?.action;
    if (typeof action === 'string' && EVENT_ACTIONS.has(action)) emit(action);
  }

  function releaseAll() {
    heldKeys.clear();
    for (const c of CONTROLS) {
      virtual[c] = false;
      recompute(c);
    }
  }

  function clearPresses() {
    for (const c of CONTROLS) presses[c] = 0;
  }

  function attach() {
    if (attached || !target) return;
    attached = true;
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('blur', releaseAll);
    target.addEventListener(INPUT_EVENT, onVirtualInput);
    target.addEventListener(ACTION_EVENT, onVirtualAction);
  }

  function detach() {
    if (!attached) return;
    attached = false;
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('blur', releaseAll);
    target.removeEventListener(INPUT_EVENT, onVirtualInput);
    target.removeEventListener(ACTION_EVENT, onVirtualAction);
    releaseAll();
  }

  attach();

  return {
    state,
    onAction(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    consumePress(control) {
      const n = presses[control] ?? 0;
      presses[control] = 0;
      return n > 0;
    },
    pressCount(control) {
      return presses[control] ?? 0;
    },
    clearPresses,
    releaseAll,
    reset() {
      releaseAll();
      clearPresses();
    },
    attach,
    detach,
  };
}
