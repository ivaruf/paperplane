// js/audio.js — procedural Web Audio SFX (Agent C). See docs/ARCHITECTURE.md.
//
// Every sound is synthesised from oscillators and filtered noise; there are no
// audio files. `init()` must be called from a user gesture (creates/resumes the
// AudioContext); `play()` is a safe no-op before that or while muted.
// Mute state persists in localStorage 'glider.muted' and every change dispatches
// `glider:mute` { detail: { muted } } on window (ui.js listens to sync buttons).

const STORAGE_KEY = 'glider.muted';
const MASTER_GAIN = 0.25;

let ctx = null;
let master = null;
let noiseBuffer = null;
let muted = loadMuted();

function loadMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMuted(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* storage unavailable — keep in-memory state only */
  }
}

function emitMute() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('glider:mute', { detail: { muted } }));
}

/* ------------------------------------------------------------ helpers -- */

function getNoiseBuffer() {
  if (noiseBuffer) return noiseBuffer;
  const len = ctx.sampleRate; // 1 s of white noise
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

function envelope(gainNode, t, { gain = 0.5, attack = 0.005, hold = 0, release = 0.1 }) {
  const g = gainNode.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(gain, t + attack);
  if (hold > 0) g.setValueAtTime(gain, t + attack + hold);
  g.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
}

/**
 * Play a single oscillator tone.
 * opts: type, gain, attack, hold, release, endFreq (glide target), vibrato {rate, depth}
 */
function tone(t, freq, opts = {}) {
  const {
    type = 'sine', gain = 0.5, attack = 0.005, hold = 0, release = 0.12,
    endFreq = null, vibrato = null, detune = 0,
  } = opts;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(freq, t);
  const dur = attack + hold + release;
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + dur);

  let lfo = null;
  if (vibrato) {
    lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = vibrato.rate;
    lfoGain.gain.value = vibrato.depth;
    lfo.connect(lfoGain).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }

  envelope(g, t, { gain, attack, hold, release });
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  return osc;
}

/**
 * Play a burst of filtered noise.
 * opts: filter ('bandpass'|'lowpass'|'highpass'), freq, endFreq, Q, gain, attack, hold, release
 */
function noise(t, opts = {}) {
  const {
    filter = 'bandpass', freq = 1000, endFreq = null, Q = 1,
    gain = 0.5, attack = 0.005, hold = 0, release = 0.2,
  } = opts;
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer();
  src.loop = true;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = Q;
  f.frequency.setValueAtTime(freq, t);
  const dur = attack + hold + release;
  if (endFreq) f.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
  const g = ctx.createGain();
  envelope(g, t, { gain, attack, hold, release });
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
  return src;
}

/* ------------------------------------------------------------- sounds -- */

const SOUNDS = {
  // rising arpeggio C5 E5 G5 C6
  start(t) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(t + i * 0.09, f, { type: 'triangle', gain: 0.45, hold: 0.06, release: 0.22 });
    });
  },

  // short bright blip
  pickup(t) {
    tone(t, 880, { type: 'sine', gain: 0.4, hold: 0.02, release: 0.09, endFreq: 1320 });
    tone(t, 1760, { type: 'triangle', gain: 0.15, hold: 0.01, release: 0.07 });
  },

  // bright two-note chime
  star(t) {
    tone(t, 1318.5, { type: 'sine', gain: 0.45, hold: 0.04, release: 0.3 });
    tone(t, 2637, { type: 'sine', gain: 0.12, hold: 0.02, release: 0.2 });
    tone(t + 0.11, 1760, { type: 'sine', gain: 0.45, hold: 0.05, release: 0.42 });
    tone(t + 0.11, 3520, { type: 'sine', gain: 0.1, hold: 0.02, release: 0.25 });
  },

  // tick-tick + ding
  clock(t) {
    for (const dt of [0, 0.12]) {
      tone(t + dt, 2400, { type: 'square', gain: 0.18, attack: 0.001, hold: 0.008, release: 0.03 });
      noise(t + dt, { filter: 'highpass', freq: 3000, gain: 0.15, attack: 0.001, release: 0.03 });
    }
    tone(t + 0.3, 1567.98, { type: 'sine', gain: 0.45, hold: 0.05, release: 0.6 });
    tone(t + 0.3, 3135.96, { type: 'sine', gain: 0.12, hold: 0.02, release: 0.35 });
    tone(t + 0.3, 783.99, { type: 'triangle', gain: 0.12, hold: 0.05, release: 0.5 });
  },

  // happy major triad
  life(t) {
    [523.25, 659.25, 783.99].forEach((f, i) => {
      tone(t + i * 0.04, f, { type: 'triangle', gain: 0.35, hold: 0.25, release: 0.35 });
    });
    tone(t + 0.16, 1046.5, { type: 'sine', gain: 0.25, hold: 0.2, release: 0.4 });
  },

  // electric zap
  battery(t) {
    tone(t, 180, { type: 'sawtooth', gain: 0.35, attack: 0.002, hold: 0.05, release: 0.12, endFreq: 1400 });
    tone(t + 0.06, 1200, {
      type: 'square', gain: 0.18, attack: 0.002, hold: 0.06, release: 0.08,
      endFreq: 300, vibrato: { rate: 60, depth: 300 },
    });
    noise(t, { filter: 'highpass', freq: 2500, gain: 0.25, attack: 0.002, hold: 0.03, release: 0.1 });
  },

  // rising squeak
  helium(t) {
    tone(t, 600, {
      type: 'sine', gain: 0.4, attack: 0.01, hold: 0.15, release: 0.25,
      endFreq: 1900, vibrato: { rate: 14, depth: 25 },
    });
    tone(t + 0.05, 1200, { type: 'triangle', gain: 0.12, hold: 0.1, release: 0.2, endFreq: 3000 });
  },

  // paper crumple: filtered noise burst with ragged amplitude + low thud
  crash(t) {
    tone(t, 130, { type: 'sine', gain: 0.6, attack: 0.003, hold: 0.04, release: 0.28, endFreq: 38 });
    noise(t, { filter: 'bandpass', freq: 1800, endFreq: 900, Q: 0.7, gain: 0.55, attack: 0.003, hold: 0.04, release: 0.25 });
    // a few crinkles
    let dt = 0.03;
    for (let i = 0; i < 6; i++) {
      dt += 0.02 + Math.random() * 0.05;
      noise(t + dt, {
        filter: 'bandpass', freq: 1500 + Math.random() * 2500, Q: 2,
        gain: 0.2 + Math.random() * 0.2, attack: 0.001, hold: 0.004, release: 0.03,
      });
    }
  },

  // fire crackle
  burn(t) {
    noise(t, { filter: 'lowpass', freq: 500, gain: 0.35, attack: 0.02, hold: 0.25, release: 0.3 });
    let dt = 0;
    for (let i = 0; i < 10; i++) {
      dt += 0.015 + Math.random() * 0.045;
      noise(t + dt, {
        filter: 'highpass', freq: 2500 + Math.random() * 3000,
        gain: 0.15 + Math.random() * 0.25, attack: 0.001, hold: 0.003, release: 0.02 + Math.random() * 0.03,
      });
    }
    tone(t, 90, { type: 'triangle', gain: 0.18, attack: 0.02, hold: 0.2, release: 0.3, endFreq: 60 });
  },

  // soft whoosh
  roomchange(t) {
    noise(t, { filter: 'bandpass', freq: 400, endFreq: 2400, Q: 1.2, gain: 0.4, attack: 0.08, hold: 0.06, release: 0.28 });
    noise(t + 0.12, { filter: 'bandpass', freq: 2400, endFreq: 700, Q: 1.2, gain: 0.25, attack: 0.05, hold: 0.02, release: 0.25 });
  },

  // descending notes
  gameover(t) {
    [392, 329.63, 261.63, 220].forEach((f, i) => {
      const lastNote = i === 3;
      tone(t + i * 0.19, f, { type: 'triangle', gain: 0.4, hold: lastNote ? 0.3 : 0.1, release: lastNote ? 0.7 : 0.18 });
      tone(t + i * 0.19, f / 2, { type: 'sine', gain: 0.2, hold: lastNote ? 0.3 : 0.1, release: lastNote ? 0.7 : 0.18 });
    });
  },

  // fanfare: short-short-short-long, then up
  win(t) {
    const seq = [
      [0, 523.25, 0.08], [0.13, 523.25, 0.08], [0.26, 523.25, 0.08], [0.39, 659.25, 0.28],
      [0.72, 783.99, 0.14], [0.9, 1046.5, 0.55],
    ];
    for (const [dt, f, hold] of seq) {
      tone(t + dt, f, { type: 'square', gain: 0.22, hold, release: 0.12 });
      tone(t + dt, f, { type: 'triangle', gain: 0.35, hold, release: 0.18 });
      tone(t + dt, f / 2, { type: 'sine', gain: 0.18, hold, release: 0.18 });
    }
    tone(t + 0.9, 1318.5, { type: 'sine', gain: 0.18, hold: 0.5, release: 0.4 });
  },

  // whoosh up
  boost(t) {
    noise(t, { filter: 'bandpass', freq: 300, endFreq: 3000, Q: 1.5, gain: 0.35, attack: 0.02, hold: 0.05, release: 0.2 });
    tone(t, 220, { type: 'sine', gain: 0.22, attack: 0.01, hold: 0.06, release: 0.18, endFreq: 660 });
  },

  // soft click
  pause(t) {
    tone(t, 700, { type: 'sine', gain: 0.3, attack: 0.002, hold: 0.01, release: 0.05, endFreq: 500 });
    noise(t, { filter: 'bandpass', freq: 1500, Q: 1, gain: 0.12, attack: 0.001, hold: 0.005, release: 0.03 });
  },
};

/* ------------------------------------------------------------- the API -- */

export const audio = {
  /** Create (or resume) the AudioContext. Call from a user gesture. */
  init() {
    if (typeof window === 'undefined') return;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
      } catch {
        ctx = null;
        return;
      }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_GAIN;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  },

  /** Play a named sound. Safe no-op before init() or while muted. */
  play(name) {
    if (!ctx || muted) return;
    const fn = SOUNDS[name];
    if (!fn) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    try {
      fn(ctx.currentTime + 0.002);
    } catch {
      /* never let a synth failure break the game loop */
    }
  },

  setMuted(value) {
    const next = Boolean(value);
    const changed = next !== muted;
    muted = next;
    saveMuted(muted);
    if (ctx && master) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(muted ? 0 : MASTER_GAIN, ctx.currentTime, 0.015);
    }
    if (changed) emitMute();
  },

  toggleMute() {
    this.setMuted(!muted);
    return muted;
  },

  isMuted() {
    return muted;
  },

  /** Sound names accepted by play() — handy for debugging. */
  get names() {
    return Object.keys(SOUNDS);
  },
};

export default audio;
