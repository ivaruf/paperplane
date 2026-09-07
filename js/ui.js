// js/ui.js — DOM HUD / overlay API (Agent C). See docs/ARCHITECTURE.md.
//
// Dispatches on `window`:
//   glider:action  { detail: { action: 'start'|'resume'|'restart'|'pause'|'mute' } }
//   glider:input   { detail: { action: 'left'|'right'|'boost', pressed: boolean } }
// Listens on `window`:
//   glider:mute    { detail: { muted } }   (sent by audio.js) → syncs the mute buttons

import { audio } from './audio.js';

const ACTIONS = new Set(['start', 'resume', 'restart', 'pause', 'mute']);
const SCREENS = ['title', 'paused', 'gameover', 'win'];

const els = {};
let inited = false;
let currentRoom = '';
const last = { score: null, lives: null, boost: null, helium: null };
let toastTimer = 0;
let flashTimer = 0;
const releaseFns = [];

// Mark the document as touch-driven as soon as the first touch arrives so the
// virtual controls appear even where `(pointer: coarse)` does not match.
if (typeof window !== 'undefined') {
  window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });
}

function $(id) {
  return document.getElementById(id);
}

function dispatchAction(action) {
  window.dispatchEvent(new CustomEvent('glider:action', { detail: { action } }));
}

function dispatchInput(action, pressed) {
  window.dispatchEvent(new CustomEvent('glider:input', { detail: { action, pressed } }));
}

function toInt(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v) : 0;
}

function formatNumber(n) {
  return String(toInt(n));
}

// Restart a CSS animation class on an element (remove → reflow → add).
function pop(el) {
  if (!el) return;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

function onceAnimationEnd(el, cls) {
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

function roomCount(rooms) {
  if (rooms == null) return 0;
  if (typeof rooms === 'number') return rooms;
  if (Array.isArray(rooms)) return rooms.length;
  if (typeof rooms === 'object') return Object.keys(rooms).length;
  return toInt(rooms);
}

/* ------------------------------------------------------------ bindings -- */

function bindActions() {
  // Event delegation: every element with data-action (overlay buttons, footer
  // mute button, touch pause button) dispatches a glider:action.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const action = btn.dataset.action;
    if (!ACTIONS.has(action)) return;
    e.preventDefault();
    dispatchAction(action);
  });

  // Keyboard activation of a focused overlay button must not ALSO reach the
  // game's global key handler (Enter = start/resume, Space = boost), otherwise a
  // single key press would trigger two actions. Stop the keydown here and let
  // the resulting click dispatch exactly the button's own action.
  els.overlay.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('button')) {
      e.stopPropagation();
    }
  });
}

function bindTouch() {
  const buttons = document.querySelectorAll('.touch-btn[data-input]');

  for (const btn of buttons) {
    const action = btn.dataset.input;
    const pointers = new Set(); // pointerIds currently down on this button

    const press = (e) => {
      e.preventDefault(); // no focus steal, no synthetic mouse events
      if (pointers.size === 0) {
        btn.classList.add('is-pressed');
        dispatchInput(action, true);
      }
      pointers.add(e.pointerId);
      try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    };

    const release = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        btn.classList.remove('is-pressed');
        dispatchInput(action, false);
      }
    };

    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('lostpointercapture', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => e.preventDefault());

    releaseFns.push(() => {
      if (pointers.size === 0) return;
      pointers.clear();
      btn.classList.remove('is-pressed');
      dispatchInput(action, false);
    });
  }

  const releaseAll = () => releaseFns.forEach((fn) => fn());
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
}

function bindMute() {
  window.addEventListener('glider:mute', (e) => {
    ui.setMuted(Boolean(e.detail && e.detail.muted));
  });
  ui.setMuted(audio.isMuted());
}

/* -------------------------------------------------------- screen fill -- */

function fillScreen(name, data) {
  const score = toInt(data.score);
  const highScore = toInt(data.highScore);
  const newHigh = Boolean(data.newHighScore);

  switch (name) {
    case 'title': {
      const parts = [];
      if (data.houseName) parts.push(String(data.houseName));
      const n = roomCount(data.rooms);
      if (n > 0) parts.push(`${n} rooms`);
      els.titleSub.textContent = parts.join(' · ');
      if (highScore > 0) {
        els.titleHigh.textContent = `High score ★ ${formatNumber(highScore)}`;
        els.titleHigh.hidden = false;
      } else {
        els.titleHigh.hidden = true;
      }
      break;
    }
    case 'gameover': {
      els.goScore.textContent = formatNumber(score);
      els.goHigh.textContent = formatNumber(highScore);
      els.goBadge.hidden = !newHigh;
      break;
    }
    case 'win': {
      const room = data.room || data.roomName || currentRoom;
      els.winTitle.textContent = room ? `You made it to the ${room}!` : 'You made it!';
      els.winScore.textContent = formatNumber(score);
      els.winHigh.textContent = formatNumber(highScore);
      els.winBadge.hidden = !newHigh;
      break;
    }
    default:
      break;
  }
}

/* ------------------------------------------------------------- the API -- */

export const ui = {
  init() {
    if (inited) return;
    inited = true;

    els.hud = $('hud');
    els.lives = $('hud-lives');
    els.score = $('hud-score');
    els.room = $('hud-room');
    els.boost = $('hud-boost');
    els.boostN = $('hud-boost-n');
    els.helium = $('hud-helium');
    els.heliumN = $('hud-helium-n');

    els.stage = $('stage');
    els.overlay = $('overlay');
    els.toast = $('toast');
    els.flash = $('flash');

    els.screens = {};
    for (const s of SCREENS) els.screens[s] = $(`screen-${s}`);

    els.titleSub = $('title-subtitle');
    els.titleHigh = $('title-highscore');
    els.goScore = $('gameover-score');
    els.goHigh = $('gameover-highscore');
    els.goBadge = $('gameover-badge');
    els.winTitle = $('win-title');
    els.winScore = $('win-score');
    els.winHigh = $('win-highscore');
    els.winBadge = $('win-badge');

    els.muteButtons = Array.from(document.querySelectorAll('[data-action="mute"]'));

    bindActions();
    bindTouch();
    bindMute();
  },

  setScore(n) {
    const v = toInt(n);
    if (v === last.score) return;
    const changed = last.score !== null;
    last.score = v;
    els.score.textContent = formatNumber(v);
    if (changed) pop(els.score);
  },

  setLives(n) {
    const v = Math.max(0, toInt(n));
    if (v === last.lives) return;
    const changed = last.lives !== null;
    last.lives = v;
    els.lives.textContent = formatNumber(v);
    if (changed) pop(els.lives);
  },

  setRoom(name) {
    const text = name == null ? '' : String(name);
    if (text === currentRoom && els.room.textContent === text) return;
    currentRoom = text;
    els.room.textContent = text;
    els.room.classList.remove('room-in');
    void els.room.offsetWidth;
    els.room.classList.add('room-in');
    onceAnimationEnd(els.room, 'room-in');
  },

  setBoost(n) {
    const v = Math.max(0, toInt(n));
    if (v === last.boost) return;
    const wasVisible = last.boost !== null && last.boost > 0;
    last.boost = v;
    els.boostN.textContent = formatNumber(v);
    els.boost.hidden = v <= 0;
    if (v > 0 && wasVisible) pop(els.boost);
  },

  setHelium(seconds) {
    const s = Math.max(0, Math.ceil(Number(seconds) || 0));
    if (s === last.helium) return;
    last.helium = s;
    els.heliumN.textContent = `${s}s`;
    els.helium.hidden = s <= 0;
    els.helium.classList.toggle('is-low', s > 0 && s <= 2);
  },

  showScreen(name, data = {}) {
    const valid = name && els.screens[name];
    for (const s of SCREENS) els.screens[s].hidden = s !== name;

    if (!valid) {
      els.overlay.hidden = true;
      delete els.stage.dataset.screen;
      // Drop focus from any (now hidden) overlay button so keys go to the game.
      if (document.activeElement && els.overlay.contains(document.activeElement)) {
        document.activeElement.blur();
      }
      return;
    }

    fillScreen(name, data || {});
    els.overlay.hidden = false;
    els.stage.dataset.screen = name;

    const primary = els.screens[name].querySelector('[data-primary]')
      || els.screens[name].querySelector('button:not([hidden])');
    if (primary) {
      requestAnimationFrame(() => {
        if (!els.overlay.hidden) primary.focus({ preventScroll: true });
      });
    }
  },

  toast(message, ms = 2000) {
    const el = els.toast;
    clearTimeout(toastTimer);
    el.textContent = String(message ?? '');
    el.hidden = true;
    void el.offsetWidth; // restart the enter animation
    el.hidden = false;
    toastTimer = setTimeout(() => { el.hidden = true; }, Math.max(300, Number(ms) || 2000));
  },

  flash() {
    const el = els.flash;
    clearTimeout(flashTimer);
    el.classList.remove('is-on');
    el.hidden = false;
    void el.offsetWidth;
    el.classList.add('is-on');
    flashTimer = setTimeout(() => {
      el.classList.remove('is-on');
      el.hidden = true;
    }, 300);
  },

  // Extension (not in the contract): reflect mute state on every mute button.
  // Called automatically via the `glider:mute` event from audio.js.
  setMuted(muted) {
    const on = !muted;
    for (const btn of els.muteButtons || []) {
      btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
      const icon = btn.querySelector('.mute-icon');
      const text = btn.querySelector('.mute-text');
      if (icon) icon.textContent = on ? '🔊' : '🔇';
      if (text) text.textContent = on ? 'Sound on' : 'Sound off';
    }
  },
};

export default ui;
