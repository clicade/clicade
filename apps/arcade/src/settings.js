/**
 * The settings model.
 *
 * One list of definitions, used by both the settings screen and the onboarding
 * flow. Onboarding is not a second copy of these choices — it walks this same
 * list, so a setting can never exist in one place and not the other.
 *
 * Pure: no rendering, no terminal, no persistence. The shell decides when to
 * write, which is what lets every change preview live before it is saved.
 */

export const SETTINGS = [
  {
    key: 'contrast',
    label: 'Contrast',
    help: 'How far text is pushed from its background.',
    options: [
      { value: 'normal', label: 'Normal', note: 'The designed palette.' },
      { value: 'high', label: 'High', note: 'Brighter text, stronger edges.' },
    ],
  },
  {
    key: 'surface',
    label: 'Background',
    help: 'Whether clicade paints a background or uses your terminal.',
    options: [
      { value: 'themed', label: 'Themed', note: 'Green felt, dark noir - our colours.' },
      { value: 'terminal', label: 'Terminal', note: 'Keep your own background showing.' },
    ],
  },
  {
    key: 'scale',
    label: 'Size',
    help: 'Card size and spacing. Terminal font size belongs to your emulator.',
    options: [
      { value: 'compact', label: 'Compact', note: 'Smaller cards, tighter. Fits short windows.' },
      { value: 'normal', label: 'Normal', note: 'Full-size cards.' },
      { value: 'roomy', label: 'Roomy', note: 'Full-size cards, more air between them.' },
    ],
  },
  {
    key: 'mono',
    label: 'Colour',
    help: 'Monochrome uses no colour at all. F2 toggles this anywhere.',
    options: [
      { value: false, label: 'Colour', note: 'Use the palette.' },
      { value: true, label: 'Monochrome', note: 'Shape and weight only.' },
    ],
  },
  {
    key: 'theme',
    label: 'Palette',
    help: 'Which set of colours the games use.',
    options: [
      { value: 'felt', label: 'Felt', note: 'Casino green.' },
      { value: 'paper', label: 'Paper', note: 'Light, for pale terminals.' },
      { value: 'noir', label: 'Noir', note: 'Near-black and gold.' },
    ],
  },
];

/** What each setting is when the player has never chosen. */
export const FALLBACKS = {
  contrast: 'normal',
  surface: 'themed',
  scale: 'normal',
  mono: false,
  theme: 'felt',
};

export function settingByKey(key) {
  return SETTINGS.find((s) => s.key === key) ?? null;
}

/** Effective values, with anything unchosen filled in from the fallbacks. */
export function effective(prefs = {}) {
  const out = {};
  for (const { key } of SETTINGS) {
    const value = prefs[key];
    out[key] = value === null || value === undefined ? FALLBACKS[key] : value;
  }
  return out;
}

/** Index of the currently selected option for a setting. */
export function optionIndex(definition, value) {
  const i = definition.options.findIndex((o) => o.value === value);
  return i < 0 ? definition.options.findIndex((o) => o.value === FALLBACKS[definition.key]) : i;
}

/**
 * Editable settings state.
 *
 * `values` starts from the saved preferences and is mutated in place; the shell
 * previews from it every frame and saves on the way out.
 */
export function createSettings(prefs = {}, startIndex = 0) {
  const state = {
    index: clamp(startIndex, SETTINGS.length),
    values: effective(prefs),
    /** Eased position of the highlight, so it slides rather than jumps. */
    cursorY: clamp(startIndex, SETTINGS.length),
    changed: false,
  };

  function clamp(i, len) {
    if (len === 0) return 0;
    return ((i % len) + len) % len;
  }

  return {
    state,
    definitions: SETTINGS,

    move(delta) {
      state.index = clamp(state.index + delta, SETTINGS.length);
    },

    current() {
      return SETTINGS[state.index];
    },

    /** Step the highlighted setting through its options, wrapping. */
    cycle(delta) {
      const definition = SETTINGS[state.index];
      if (!definition) return null;
      const at = optionIndex(definition, state.values[definition.key]);
      const next = clamp(at + delta, definition.options.length);
      state.values[definition.key] = definition.options[next].value;
      state.changed = true;
      return definition.options[next];
    },

    set(key, value) {
      state.values[key] = value;
      state.changed = true;
    },

    /** Settings merged over the saved preferences, ready to persist. */
    merged(base = prefs) {
      return { ...base, ...state.values };
    },

    update(dt) {
      // Exponential smoothing rather than a fixed step per frame, so the slide
      // takes the same wall-clock time at 30fps and at 60.
      state.cursorY += (state.index - state.cursorY) * (1 - Math.exp(-18 * dt));
      if (Math.abs(state.cursorY - state.index) < 0.001) state.cursorY = state.index;
    },
  };
}
