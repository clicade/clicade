/**
 * First-run setup.
 *
 * Shown once, because the two things it asks about — contrast and background —
 * are the two we genuinely cannot detect. A terminal reports its size and
 * whether it supports colour; it does not report that the player has a dark
 * theme, or that our green felt fights it. Guessing wrong there makes the whole
 * thing look broken on first launch, which is the one launch that counts.
 *
 * It walks the same definitions the settings screen does, so the flow can never
 * offer a choice the settings screen lacks. Skippable at any point, and
 * repeatable from settings.
 */

import { SETTINGS, effective, optionIndex, settingByKey } from './settings.js';

/** Which settings are worth asking about up front, in order. */
const ASKED = ['contrast', 'surface', 'scale'];

/**
 * Start from what was measured, but never overwrite a real choice.
 *
 * A detected value is a good guess; a saved one is an answer. Letting the
 * first beat the second would silently undo a decision the player made.
 */
function seeded(values, prefs, seed) {
  const out = { ...values };
  for (const [key, value] of Object.entries(seed)) {
    const saved = prefs?.[key];
    if (value !== undefined && (saved === null || saved === undefined)) out[key] = value;
  }
  return out;
}

export const STEPS = [
  { kind: 'welcome' },
  ...ASKED.map((key) => ({ kind: 'choice', key })),
  { kind: 'done' },
];

/**
 * @param {object} [prefs] saved preferences
 * @param {object} [seed] measured suggestions, used only where the player has
 *   not already chosen — a setting they set by hand outranks anything detected
 */
export function createOnboarding(prefs = {}, seed = {}) {
  const state = {
    step: 0,
    values: seeded(effective(prefs), prefs, seed),
    /** 0..1 entry progress for the current step, for the slide-in. */
    enter: 0,
    finished: false,
    skipped: false,
  };

  function definition() {
    const step = STEPS[state.step];
    return step?.kind === 'choice' ? settingByKey(step.key) : null;
  }

  return {
    state,
    steps: STEPS,

    current() {
      return STEPS[state.step];
    },

    definition,

    /** Move to the next step, finishing at the end. */
    next() {
      if (state.step >= STEPS.length - 1) {
        state.finished = true;
        return false;
      }
      state.step++;
      state.enter = 0;
      return true;
    },

    back() {
      if (state.step === 0) return false;
      state.step--;
      state.enter = 0;
      return true;
    },

    /** Change the choice on a choice step. Does nothing elsewhere. */
    cycle(delta) {
      const d = definition();
      if (!d) return null;
      const at = optionIndex(d, state.values[d.key]);
      const len = d.options.length;
      const next = (((at + delta) % len) + len) % len;
      state.values[d.key] = d.options[next].value;
      return d.options[next];
    },

    /** Abandon setup. Whatever was already chosen still counts. */
    skip() {
      state.skipped = true;
      state.finished = true;
    },

    /**
     * Preferences to persist. Marked as onboarded either way — someone who
     * skipped has made their choice, and asking again next launch would be
     * the exact nagging this flow exists to avoid.
     */
    merged(base = prefs, version = 1) {
      return { ...base, ...state.values, onboarded: version };
    },

    update(dt) {
      state.enter = Math.min(1, state.enter + dt * 3.5);
    },

    get progress() {
      return `${state.step + 1} of ${STEPS.length}`;
    },
  };
}

export { SETTINGS };
