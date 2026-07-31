/**
 * Seeded random number generation.
 *
 * Games never call Math.random directly. A seeded generator means a hand can be
 * replayed exactly, tests are deterministic, and a shuffle can be audited — the
 * seed is stored with the game state, so "was that deal rigged" has an answer.
 *
 * mulberry32: 32-bit state, passes gjrand, and is about as short as a decent
 * PRNG gets. Quality here only needs to beat human pattern detection.
 */

/** @param {number} seed */
export function createRng(seed = 1) {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9; // a zero seed would lock the generator

  /** Float in [0, 1). */
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, max). */
  function int(max) {
    return Math.floor(next() * max);
  }

  /** Integer in [min, max] inclusive. */
  function range(min, max) {
    return min + int(max - min + 1);
  }

  function pick(arr) {
    return arr[int(arr.length)];
  }

  /**
   * Fisher-Yates, in place. Unbiased, unlike the sort(() => rand - 0.5) trick
   * that shows up everywhere and skews badly.
   */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  return {
    next,
    int,
    range,
    pick,
    shuffle,
    get seed() {
      return seed;
    },
    /** Current internal state, so a game can be saved mid-run and resumed. */
    get state() {
      return state;
    },
    set state(v) {
      state = v >>> 0;
    },
  };
}

/** A seed for a fresh run. Explicit, so nothing depends on a hidden global. */
export function randomSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}
