/**
 * Preferences shared by every clicade game.
 *
 * Stored once, globally, rather than per game: a player who wants monochrome
 * wants it everywhere, and being asked again by each game would be worse than
 * not asking at all.
 */

import { createSave } from './save.js';

const DEFAULTS = { mono: null, theme: null };

const store = createSave('prefs', DEFAULTS);

export function loadPrefs() {
  return store.load();
}

export function savePrefs(prefs) {
  return store.save({ ...DEFAULTS, ...prefs });
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
