/**
 * Preferences shared by every clicade game.
 *
 * Stored once, globally, rather than per game: a player who wants monochrome
 * wants it everywhere, and being asked again by each game would be worse than
 * not asking at all.
 *
 * Every value defaults to null rather than to its effective value. Null means
 * "never chosen", which is what lets a flag, a later change of default, and the
 * onboarding flow all tell a deliberate choice apart from an absent one.
 */

import { createSave } from './save.js';

/**
 * Bumped when onboarding gains a step worth showing existing players. A stored
 * number below this means they completed an older version of the flow.
 */
export const ONBOARDING_VERSION = 1;

const DEFAULTS = {
  mono: null,
  theme: null,
  /** 'normal' | 'high' */
  contrast: null,
  /** 'themed' | 'terminal' — whether a background is painted at all */
  surface: null,
  /** 'compact' | 'normal' | 'roomy' */
  scale: null,
  /** Version of the onboarding flow the player finished, or null */
  onboarded: null,
};

const store = createSave('prefs', DEFAULTS);

export function loadPrefs() {
  return store.load();
}

export function savePrefs(prefs) {
  return store.save({ ...DEFAULTS, ...prefs });
}

/** True when the player has never been walked through setup. */
export function needsOnboarding(prefs) {
  return !prefs || prefs.onboarded == null || prefs.onboarded < ONBOARDING_VERSION;
}

/**
 * Decide the colour mode from every source, in priority order.
 *
 * NO_COLOR wins outright — people set it globally for a reason, and a game
 * overriding it would be the kind of thing that gets uninstalled. After that,
 * an explicit flag beats a remembered preference, which beats auto-detection.
 *
 * @returns {boolean} true if monochrome
 */
export function resolveMono({ envNoColor, flag, saved }) {
  if (envNoColor) return true;
  if (flag !== null && flag !== undefined) return flag;
  if (saved !== null && saved !== undefined) return saved;
  return false;
}

/** Effective value of a preference, falling back when it was never set. */
export function setting(prefs, key, fallback) {
  const value = prefs?.[key];
  return value === null || value === undefined ? fallback : value;
}
