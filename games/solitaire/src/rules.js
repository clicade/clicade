/**
 * Klondike rules. Pure functions over plain data — no state, no rendering.
 *
 * Everything a player is allowed to do is decided here, so the state machine
 * never has to ask "is this legal" in two places and get two answers.
 */

import { RANKS, isRed } from '@clicade/kit';

export const TABLEAU_PILES = 7;
export const FOUNDATIONS = 4;
/**
 * How many cards a draw turns over.
 *
 * Draw-three is the classic deal and the harder one: two of every three cards
 * stay buried until the pass comes round again. Draw-one exposes every card in
 * order, which is a different game rather than an easier setting of the same
 * one, so it is a choice the player makes and keeps.
 */
export const DRAW_COUNTS = [1, 3];
export const DEFAULT_DRAW = 1;

/** Coerce anything stored, typed or passed in to a count we actually support. */
export function drawCount(value) {
  const n = Number(value);
  return DRAW_COUNTS.includes(n) ? n : DEFAULT_DRAW;
}

/**
 * Which board column each top-row slot sits above: stock, waste, then the four
 * foundations pushed right to leave column 2 as the gap the waste fans into.
 *
 * This is the Klondike table arrangement, not a drawing detail, so the cursor
 * and the renderer both read it from here. When they each had their own copy,
 * moving between rows sent the cursor diagonally.
 */
export const TOP_SLOT_COLUMNS = [0, 1, 3, 4, 5, 6];

/** The top-row slot sitting nearest a given board column. */
export function nearestTopSlot(column) {
  let best = 0;
  for (let i = 1; i < TOP_SLOT_COLUMNS.length; i++) {
    if (Math.abs(TOP_SLOT_COLUMNS[i] - column) < Math.abs(TOP_SLOT_COLUMNS[best] - column)) {
      best = i;
    }
  }
  return best;
}

/** 1-based: A=1 … K=13. */
export function rankValue(rank) {
  return RANKS.indexOf(rank) + 1;
}

export function sameColor(a, b) {
  return isRed(a.suit) === isRed(b.suit);
}

/**
 * Can `card` land on `onto` in the tableau?
 *
 * Descending rank, alternating colour. An empty pile takes a King and nothing
 * else — the rule that makes emptying a column a real decision rather than a
 * free parking space.
 */
export function canStackTableau(card, onto) {
  if (!card) return false;
  if (!onto) return rankValue(card.rank) === 13;
  if (onto.faceUp === false) return false;
  return !sameColor(card, onto) && rankValue(card.rank) === rankValue(onto.rank) - 1;
}

/** Ascending from Ace, one suit per foundation. */
export function canStackFoundation(card, onto) {
  if (!card) return false;
  if (!onto) return rankValue(card.rank) === 1;
  return card.suit === onto.suit && rankValue(card.rank) === rankValue(onto.rank) + 1;
}

/**
 * Is a run of cards movable as one unit?
 *
 * Klondike only lets you carry a sequence that is already ordered — descending
 * and alternating — and every card in it must be face up.
 */
export function isMovableRun(cards) {
  if (!cards || cards.length === 0) return false;
  if (cards.some((card) => card.faceUp === false)) return false;

  for (let i = 1; i < cards.length; i++) {
    const above = cards[i - 1];
    const below = cards[i];
    if (sameColor(above, below)) return false;
    if (rankValue(below.rank) !== rankValue(above.rank) - 1) return false;
  }
  return true;
}

/** Index of the first face-up card in a pile, or -1 when there is none. */
export function firstFaceUp(pile) {
  return pile.findIndex((card) => card.faceUp);
}

export function top(pile) {
  return pile.length ? pile[pile.length - 1] : null;
}

/** Which foundation index a card belongs on, given the current foundations. */
export function foundationFor(card, foundations) {
  if (!card) return -1;
  for (let i = 0; i < foundations.length; i++) {
    if (canStackFoundation(card, top(foundations[i]))) return i;
  }
  return -1;
}

export function isWon(state) {
  return state.foundations.every((pile) => pile.length === 13);
}

/**
 * Is a card safe to send to a foundation without thinking?
 *
 * Aces and twos always are. Beyond that, a card is only safe once both
 * opposite-colour foundations have climbed high enough that nothing still in
 * play could need it as a landing spot. Autoplay uses this so it can never take
 * a card the player still wanted — an autoplay that loses you the game is worse
 * than no autoplay.
 */
export function isSafeToAutoplay(card, foundations) {
  const value = rankValue(card.rank);
  if (value <= 2) return true;

  const heights = {};
  for (const pile of foundations) {
    const t = top(pile);
    if (t) heights[t.suit] = rankValue(t.rank);
  }

  const oppositeMin = ['s', 'h', 'd', 'c']
    .filter((suit) => isRed(suit) !== isRed(card.suit))
    .reduce((min, suit) => Math.min(min, heights[suit] ?? 0), Infinity);

  return oppositeMin >= value - 1;
}

/**
 * Every legal destination for a run, as `{zone, index}`.
 * Used for the hint key and to detect a dead game.
 */
export function destinationsFor(state, run, from) {
  if (!isMovableRun(run)) return [];
  const out = [];
  const card = run[0];

  if (run.length === 1) {
    const f = foundationFor(card, state.foundations);
    if (f >= 0 && !(from?.zone === 'foundation' && from.index === f)) {
      out.push({ zone: 'foundation', index: f });
    }
  }

  state.tableau.forEach((pile, i) => {
    if (from?.zone === 'tableau' && from.index === i) return;
    // Moving a lone King between empty columns achieves nothing and would let
    // a hint list churn forever.
    if (pile.length === 0 && from?.zone === 'tableau' && state.tableau[from.index].length === run.length) {
      return;
    }
    if (canStackTableau(card, top(pile))) out.push({ zone: 'tableau', index: i });
  });

  return out;
}
