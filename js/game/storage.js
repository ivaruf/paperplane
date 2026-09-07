// High score persistence. DOM-free: tolerates environments without
// localStorage (Node, sandboxed iframes, storage disabled) by degrading to 0 /
// no-op instead of throwing.

/** localStorage key under which the high score is persisted. */
export const HIGH_SCORE_KEY = 'glider.highScore';

/** @returns {Storage | null} the localStorage object when it is usable, else null */
function getStore() {
  try {
    const store = globalThis.localStorage;
    return store && typeof store.getItem === 'function' ? store : null;
  } catch {
    return null;
  }
}

/**
 * Read the persisted high score.
 * @returns {number} non-negative integer; 0 when nothing valid is stored or storage is unavailable
 */
export function loadHighScore() {
  try {
    const store = getStore();
    if (!store) return 0;
    const n = Number.parseInt(store.getItem(HIGH_SCORE_KEY) ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Persist a high score (floored, clamped to >= 0).
 * @param {number} score
 * @returns {boolean} true when the value was written
 */
export function saveHighScore(score) {
  const value = Math.max(0, Math.floor(Number(score) || 0));
  try {
    const store = getStore();
    if (!store) return false;
    store.setItem(HIGH_SCORE_KEY, String(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Compare a finished game's score with the stored high score and persist it if higher.
 * @param {number} score
 * @returns {{ highScore: number, isNew: boolean }} the resulting high score and whether it changed
 */
export function updateHighScore(score) {
  const previous = loadHighScore();
  if (score > previous) {
    saveHighScore(score);
    return { highScore: score, isNew: true };
  }
  return { highScore: previous, isNew: false };
}
