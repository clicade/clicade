/**
 * Playing cards: model, deck, and rendering.
 *
 * Every existing npx blackjack prints `Your hand: A♠ K♦ (21)`. That line is why
 * they aren't fun — the rules are eighty lines and already solved, so the game
 * *is* the presentation. Cards here are drawn as objects with edges, faces,
 * shadows and a flip, at three sizes so a seven-card hand still fits an 80x24
 * terminal.
 *
 * Sizes:
 *   full     7x5  the table. What a dealt card looks like.
 *   compact  5x4  long hands, split hands, tight layouts.
 *   spine    3x5  overlapped fans — only the left edge shows, like real cards.
 */

import { pad } from '@clicade/tui';
import { getTheme } from './theme.js';

export const SUITS = ['s', 'h', 'd', 'c'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const SIZES = {
  full: { w: 7, h: 5, inner: 5, rows: 3 },
  compact: { w: 5, h: 4, inner: 3, rows: 2 },
  // `open` omits the right border: the next card in a fan covers it, which is
  // what makes overlapped cards read as a stack rather than as separate tiles.
  // The 3-cell interior is set by '10' plus a suit — the widest label.
  spine: { w: 4, h: 5, inner: 3, rows: 1, open: true },
};

/** @param {string} suit @param {object} g glyph set */
export function suitGlyph(suit, g) {
  return { s: g.spade, h: g.heart, d: g.diamond, c: g.club }[suit] ?? '?';
}

export function isRed(suit) {
  return suit === 'h' || suit === 'd';
}

/** `{rank:'A', suit:'s'}` -> `'A♠'` (or `'AS'` without Unicode). */
export function cardLabel(card, g) {
  if (!card) return '??';
  return card.rank + suitGlyph(card.suit, g);
}

/** A fresh 52-card deck in canonical order. Shuffle it with an rng. */
export function createDeck(decks = 1) {
  const cards = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ rank, suit });
      }
    }
  }
  return cards;
}

/**
 * Interior rows of a face-up card, already padded to the interior width.
 * Kept separate from drawing so it can be asserted in golden-frame tests.
 */
function faceRows(card, size, g) {
  const label = cardLabel(card, g);
  const pip = suitGlyph(card.suit, g);

  if (size.rows === 3 && size.inner === 5) {
    // full: label top-left, pip centred, label bottom-right
    return [pad(label, 5, 'left'), pad(pip, 5, 'center'), pad(label, 5, 'right')];
  }
  if (size.open) {
    // spine: only the left sliver shows, so the label goes on the top row and
    // the rest stays blank — the card beneath is what fills the eye.
    return [pad(label, 3, 'left'), pad('', 3), pad('', 3)];
  }
  // compact: label top-left, pip bottom-right
  return [pad(label, 3, 'left'), pad(pip, 3, 'right')];
}

/**
 * Draw a card.
 *
 * @param {{put:Function, fill:Function}} target screen or stage
 * @param {object} g glyph set
 * @param {number} x left, in target coordinates
 * @param {number} y top
 * @param {{rank:string,suit:string}|null} card null renders a back
 * @param {object} [opts]
 * @param {'full'|'compact'|'spine'} [opts.size]
 * @param {boolean} [opts.faceUp]
 * @param {object} [opts.theme]
 * @param {number} [opts.squash] 0..1 horizontal scale, for the flip animation
 * @param {boolean} [opts.shadow]
 * @param {boolean} [opts.highlight] draw the edge in the accent color
 */
export function renderCard(target, g, x, y, card, opts = {}) {
  const size = SIZES[opts.size ?? 'full'] ?? SIZES.full;
  const theme = opts.theme ?? getTheme();
  const squash = Math.max(0, Math.min(1, opts.squash ?? 1));
  const faceUp = opts.faceUp !== false && card != null;

  const w = Math.max(1, Math.round(size.w * squash));
  const h = size.h;
  // Squash toward the card's own centre so a flip pivots in place.
  const cx = x + Math.round((size.w - w) / 2);

  const edge = opts.highlight ? theme.accent : theme.cardEdge;
  const bg = faceUp ? theme.cardFace : theme.cardBack;

  if (opts.shadow !== false && w > 1) {
    // One row below and one column right, the way a card lifted off felt sits.
    target.fill(cx + 1, y + h, w, 1, ' ', { bg: theme.shadow });
  }

  // Mid-flip the card is edge-on: a sliver, no face at all.
  if (w < 3) {
    target.fill(cx, y, w, h, g.v, { fg: edge, bg: theme.table });
    return;
  }

  // An open card has no right border, so its interior runs one cell wider.
  const open = Boolean(size.open);
  const span = g.hRound.repeat(open ? w - 1 : w - 2);
  target.put(cx, y, g.tlRound + span + (open ? '' : g.trRound), { fg: edge, bg });
  target.put(cx, y + h - 1, g.blRound + span + (open ? '' : g.brRound), { fg: edge, bg });

  const innerW = open ? w - 1 : w - 2;
  const rows = faceUp ? faceRows(card, size, g) : null;
  const inkColor = faceUp ? (isRed(card.suit) ? theme.red : theme.black) : theme.cardBackPattern;

  for (let i = 0; i < h - 2; i++) {
    const y2 = y + 1 + i;
    target.put(cx, y2, g.v, { fg: edge, bg });
    if (!open) target.put(cx + w - 1, y2, g.v, { fg: edge, bg });

    let content;
    if (!faceUp) {
      content = g.shadeMed.repeat(innerW);
    } else {
      // Squashing narrows the interior, so the face is truncated from the
      // right rather than reflowed — it reads as the card turning.
      content = pad(rows[i] ?? '', size.inner).slice(0, innerW);
      if (content.length < innerW) content = pad(content, innerW);
    }
    target.put(cx + 1, y2, content, { fg: inkColor, bg });
  }
}

/**
 * Draw a hand as an overlapped fan.
 *
 * All but the last card show only their spine, so a seven-card hand occupies
 * 3*(n-1)+7 columns instead of 7n — the difference between fitting an 80-column
 * terminal and not.
 *
 * @returns {number} total width drawn
 */
export function renderHand(target, g, x, y, cards, opts = {}) {
  // Default step equals the spine width, so each card's open right edge is
  // closed by the next card's left border and the fan reads continuous.
  const overlap = opts.overlap ?? SIZES.spine.w;
  const size = opts.size ?? 'full';
  const faceDownIndices = new Set(opts.faceDown ?? []);

  cards.forEach((card, i) => {
    const last = i === cards.length - 1;
    renderCard(target, g, x + i * overlap, y, card, {
      ...opts,
      size: last ? size : 'spine',
      faceUp: !faceDownIndices.has(i),
      highlight: opts.highlight && last,
    });
  });

  return cards.length === 0 ? 0 : (cards.length - 1) * overlap + SIZES[size].w;
}

/** Width a fan will occupy, for centring a hand before drawing it. */
export function handWidth(count, opts = {}) {
  if (count <= 0) return 0;
  const overlap = opts.overlap ?? SIZES.spine.w;
  return (count - 1) * overlap + SIZES[opts.size ?? 'full'].w;
}
