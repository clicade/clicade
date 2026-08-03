/**
 * The games the arcade knows about.
 *
 * Every playable game is imported statically so esbuild bundles it into the
 * launcher. That is deliberate: spawning `npx @clicade/<game>` per launch would
 * mean a network round trip and a second cold start every time somebody picks
 * from the menu, which is exactly the sluggishness this project exists to
 * avoid. One download, everything plays instantly.
 *
 * Games are imported by deep path rather than package name. They publish a
 * bundled `dist/cli.mjs` as their entry, and importing *that* would run the
 * game on import; the source module is the part worth linking to. The
 * dependency is a devDependency, so nothing leaks into a published tree.
 */

import * as blackjack from '@clicade/blackjack/src/main.js';

/**
 * @typedef {object} Entry
 * @property {string} id
 * @property {string} title
 * @property {string} blurb
 * @property {string} players
 * @property {string[]} tags
 * @property {((opts:object) => Promise<any>) | null} start null means announced, not built
 */

/** @type {Entry[]} */
export const CATALOG = [
  { ...blackjack.meta, start: blackjack.start },

  // Announced, not yet built. Listed so the menu reads as a place that is going
  // somewhere; `start: null` is the single switch that keeps them unplayable.
  {
    id: 'solitaire',
    title: 'Solitaire',
    blurb: 'Klondike, draw three. Keyboard-driven piles, undo, and a real deal.',
    players: '1 player',
    tags: ['cards', 'classic'],
    start: null,
  },
  {
    id: 'minesweeper',
    title: 'Minesweeper',
    blurb: 'Clear the field without guessing. Fixed board, honest first click.',
    players: '1 player',
    tags: ['grid', 'classic'],
    start: null,
  },
];

export const playable = () => CATALOG.filter((entry) => entry.start);

/** Look up by id, for `npx clicade blackjack`. */
export function findGame(id) {
  if (!id) return null;
  const key = String(id).toLowerCase();
  return CATALOG.find((entry) => entry.id === key) ?? null;
}
