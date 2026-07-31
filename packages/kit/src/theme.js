/**
 * Palettes.
 *
 * Colors live here rather than in games so a table looks like a table
 * everywhere, and so a single edit reskins everything. Values are full-fidelity
 * hex; the tui color layer downgrades them per terminal.
 */

export const THEMES = {
  /** Casino felt. The default for card games. */
  felt: {
    name: 'felt',
    table: '#1d5c3f',
    tableDark: '#16452f',
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

export function getTheme(name = 'felt') {
  return THEMES[name] ?? THEMES.felt;
}
