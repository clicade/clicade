/**
 * Palettes, contrast and density.
 *
 * Colors live here rather than in games so a table looks like a table
 * everywhere, and so a single edit reskins everything. Values are full-fidelity
 * hex; the tui color layer downgrades them per terminal.
 *
 * Two axes sit on top of the palettes:
 *
 *   contrast  how far text is pushed from its background
 *   surface   whether we paint a background at all
 *
 * The second matters more than it looks. Painting `#1a1a1a` across the screen
 * overrides a terminal the player has already themed to their liking, and on a
 * dark terminal the result is two nearly-identical blacks with a visible seam.
 * `surface: 'terminal'` sets those fields to null, which the color layer emits
 * as no background sequence at all — so the game sits on whatever the terminal
 * already is.
 */

import { mix, toRgb } from '@clicade/tui';

export const THEMES = {
  /** Casino felt. The default for card games. */
  felt: {
    name: 'felt',
    table: '#1d5c3f',
    tableDark: '#16452f',
    highlight: '#16452f',
    cardFace: '#f4f1e8',
    cardBack: '#8c2f39',
    cardBackPattern: '#a94450',
    cardEdge: '#d6d1c2',
    ink: '#1b1b1b',
    red: '#c0392b',
    black: '#22303c',
    shadow: '#123725',
    text: '#e8f0ea',
    textMuted: '#8fae9c',
    accent: '#f2c14e',
    good: '#5dd39e',
    bad: '#e15554',
  },

  /** Low-chroma alternative for terminals with light backgrounds. */
  paper: {
    name: 'paper',
    table: '#e8e4d9',
    tableDark: '#d8d3c4',
    highlight: '#d8d3c4',
    cardFace: '#fffdf7',
    cardBack: '#3d5a80',
    cardBackPattern: '#5878a0',
    cardEdge: '#b9b3a3',
    ink: '#1b1b1b',
    red: '#b3261e',
    black: '#22303c',
    shadow: '#c2bcab',
    text: '#2b2b2b',
    textMuted: '#7a7568',
    accent: '#9c6f19',
    good: '#2f7d54',
    bad: '#b3261e',
  },

  /** Monochrome-friendly, for 16-color and no-color terminals. */
  noir: {
    name: 'noir',
    table: '#1a1a1a',
    tableDark: '#0f0f0f',
    highlight: '#0f0f0f',
    cardFace: '#e6e6e6',
    cardBack: '#333333',
    cardBackPattern: '#4d4d4d',
    cardEdge: '#999999',
    ink: '#111111',
    red: '#d64545',
    black: '#111111',
    shadow: '#000000',
    text: '#e6e6e6',
    textMuted: '#8a8a8a',
    accent: '#e6c34a',
    good: '#7ac07a',
    bad: '#d64545',
  },
};

export const THEME_NAMES = Object.keys(THEMES);
export const CONTRASTS = ['normal', 'high'];
export const SURFACES = ['themed', 'terminal'];
export const SCALES = ['compact', 'normal', 'roomy'];

/**
 * Layout density.
 *
 * Terminal font size belongs to the emulator and no escape sequence changes it,
 * so "bigger" here means bigger in cells: larger cards and more room between
 * them. `compact` exists for the opposite reason — a tall solitaire pile fits a
 * short window at four rows a card where it would not at five.
 */
export const SCALE_METRICS = {
  compact: { card: 'compact', gap: 1, rowStep: 1, pad: 1 },
  normal: { card: 'full', gap: 2, rowStep: 2, pad: 2 },
  roomy: { card: 'full', gap: 4, rowStep: 3, pad: 3 },
};

export function getScale(name) {
  return SCALE_METRICS[name] ?? SCALE_METRICS.normal;
}

export function getTheme(name = 'felt') {
  return THEMES[name] ?? THEMES.felt;
}

/** Perceived brightness, 0..1. Used to decide which way to push contrast. */
export function luminance(color) {
  const rgb = toRgb(color);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isDark(theme) {
  return luminance(theme.table ?? '#000000') < 0.5;
}

/**
 * Push foregrounds away from the background.
 *
 * Derived rather than hand-authored: three palettes times two contrast levels
 * is six palettes to keep in step, and the pair that drifts is always the one
 * nobody is looking at.
 */
export function applyContrast(theme, level) {
  if (level !== 'high') return theme;

  const dark = isDark(theme);
  const far = dark ? '#ffffff' : '#000000';
  const near = dark ? '#000000' : '#ffffff';

  return {
    ...theme,
    contrast: 'high',
    text: far,
    // The muted tone is the first thing to become unreadable, so it moves
    // furthest — most of the way to full text rather than most of the way out.
    textMuted: mix(theme.textMuted, far, 0.55),
    tableDark: mix(theme.tableDark, near, 0.4),
    highlight: mix(theme.highlight ?? theme.tableDark, near, 0.4),
    cardEdge: mix(theme.cardEdge, far, 0.5),
    accent: mix(theme.accent, far, 0.3),
    good: mix(theme.good, far, 0.25),
    bad: mix(theme.bad, far, 0.25),
    ink: dark ? theme.ink : '#000000',
  };
}

/**
 * Drop the painted background so the terminal's own shows through.
 *
 * Only the surface fields go: cards keep their faces, or they would stop
 * reading as objects sitting on something.
 */
export function applySurface(theme, surface) {
  if (surface !== 'terminal') return theme;
  return {
    ...theme,
    surface: 'terminal',
    table: null,
    // Nothing is painted, so the "darker table" tone becomes a foreground-only
    // hairline color. Keeping the old value would draw invisible rules.
    tableDark: theme.textMuted,
    // Raised surfaces stop tinting too. Spaces still occlude what is behind
    // them, so a panel keeps working — it just does not paint a colour over a
    // background the player chose.
    highlight: null,
    shadow: null,
  };
}

/**
 * The single entry point games use. Flags beat saved preferences, which beat
 * the defaults — the same precedence the colour toggle already follows.
 *
 * @param {object} [opts]
 * @param {string} [opts.theme]
 * @param {string} [opts.contrast] 'normal' | 'high'
 * @param {string} [opts.surface] 'themed' | 'terminal'
 */
export function resolveTheme(opts = {}) {
  const base = getTheme(opts.theme ?? 'felt');
  return applySurface(applyContrast(base, opts.contrast), opts.surface);
}

/** Build the theme a game should use from its args and saved preferences. */
export function themeFor(args = {}, prefs = {}) {
  return resolveTheme({
    theme: args.theme || prefs.theme || process.env.CLICADE_THEME || 'felt',
    contrast: prefs.contrast ?? 'normal',
    surface: prefs.surface ?? 'themed',
  });
}
