/**
 * Table rendering.
 *
 * Reads game state, draws a table. Holds no rules and mutates nothing, so the
 * same state always produces the same frame.
 *
 * Layout is derived from the stage, which is locked to the terminal at launch
 * and never changes afterwards. Reading stage dimensions here is therefore
 * safe; reading terminal dimensions would not be.
 */

import { strWidth, box } from '@clicade/tui';
import { renderCard, renderPile, pileOffsets, lerp, SIZES } from '@clicade/kit';
import { TABLEAU_PILES, top } from './rules.js';

const CARD_W = SIZES.full.w;
const CARD_H = SIZES.full.h;
const GAP = 2;
const PITCH = CARD_W + GAP;
const BOARD_W = TABLEAU_PILES * PITCH - GAP;

/** Column each top-row slot sits above, so the two rows line up. */
const STOCK_COL = 0;
const WASTE_COL = 1;
const FOUNDATION_COL = 3;

export const MIN_W = BOARD_W + 4;
export const MIN_H = 24;

export function layout(w, h) {
  const x0 = Math.max(0, Math.floor((w - BOARD_W) / 2));
  const topY = 2;
  // Three rows of clearance, not two: the card shadow takes one, the stock
  // count takes the next, and the tableau cursor bar needs the third.
  const tableauY = topY + CARD_H + 3;

  return {
    w,
    h,
    x0,
    topY,
    tableauY,
    // Everything below the tableau start, minus the two footer rows.
    tableauH: Math.max(CARD_H, h - tableauY - 2),
    controlsY: h - 2,
    statusY: h - 1,
    colX: (i) => x0 + i * PITCH,
  };
}

export function render(stage, g, game, theme, ctx = {}) {
  const { state } = game;
  const L = layout(stage.width, stage.height);

  stage.fill(0, 0, L.w, L.h, ' ', { bg: theme.table });

  drawHeader(stage, g, state, theme, L);
  drawStock(stage, g, state, theme, L);
  drawWaste(stage, g, state, theme, L);
  drawFoundations(stage, g, state, theme, L);
  drawTableau(stage, g, state, theme, L);
  drawCursor(stage, g, state, theme, L);
  drawFooter(stage, g, game, theme, L, ctx);

  if (state.won) drawWinBanner(stage, g, state, theme, L);
}

// --- chrome ----------------------------------------------------------------

function drawHeader(stage, g, state, theme, L) {
  stage.put(0, 0, g.hDouble.repeat(L.w), { fg: theme.tableDark, bg: theme.table });
  stage.put(2, 0, ' SOLITAIRE ', { fg: theme.accent, bg: theme.table, bold: true });

  const right = ` ${state.moves} moves   ${clock(state.elapsed)} `;
  stage.put(L.w - strWidth(right) - 1, 0, right, {
    fg: theme.text,
    bg: theme.table,
    bold: true,
  });
}

function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** An empty slot: where a card goes, drawn so the board never looks broken. */
function drawSlot(stage, g, x, y, theme, label) {
  box(stage, g, x, y, CARD_W, CARD_H, { fg: theme.tableDark, bg: theme.table }, 'round');
  if (label) {
    stage.put(x + Math.floor((CARD_W - strWidth(label)) / 2), y + 2, label, {
      fg: theme.tableDark,
      bg: theme.table,
    });
  }
}

// --- piles -----------------------------------------------------------------

function drawStock(stage, g, state, theme, L) {
  const x = L.colX(STOCK_COL);

  if (state.stock.length === 0) {
    drawSlot(stage, g, x, L.topY, theme, state.waste.length ? g.arrowL : g.cross2);
  } else {
    renderCard(stage, g, x, L.topY, null, { theme, faceUp: false, shadow: true });
  }

  const count = String(state.stock.length);
  stage.put(x + CARD_W - strWidth(count), L.topY + CARD_H + 1, count, {
    fg: theme.textMuted,
    bg: theme.table,
  });
}

function drawWaste(stage, g, state, theme, L) {
  const x = L.colX(WASTE_COL);
  if (state.waste.length === 0) {
    drawSlot(stage, g, x, L.topY, theme, '');
    return;
  }

  // Only the last three are visible, which is exactly what draw-three exposes.
  // They step by three columns so the two underneath still show a rank and a
  // suit — at two, a covered card shows one character and reads as noise. The
  // fan runs into the empty column left of the foundations, which is why that
  // gap is in the layout at all.
  const shown = state.waste.slice(-3);
  const stockX = L.colX(STOCK_COL);

  shown.forEach((card, i) => {
    const last = i === shown.length - 1;
    const slotX = x + i * 3;
    const t = card.anim ? card.anim.t : 1;

    renderCard(stage, g, Math.round(lerp(stockX, slotX, t)), L.topY, card, {
      theme,
      faceUp: true,
      shadow: last,
      highlight: isSelected(state, 'waste', 0) && last,
    });
  });
}

function drawFoundations(stage, g, state, theme, L) {
  state.foundations.forEach((pile, i) => {
    const x = L.colX(FOUNDATION_COL + i);
    const card = top(pile);

    if (!card) {
      drawSlot(stage, g, x, L.topY, theme, 'A');
      return;
    }
    renderCard(stage, g, x, L.topY, card, {
      theme,
      faceUp: true,
      shadow: true,
      highlight: isSelected(state, 'foundation', i),
      });
  });
}

function drawTableau(stage, g, state, theme, L) {
  const stockX = L.colX(STOCK_COL);

  state.tableau.forEach((pile, col) => {
    const x = L.colX(col);

    if (pile.length === 0) {
      drawSlot(stage, g, x, L.tableauY, theme, 'K');
      return;
    }

    const dealing = pile.some((card) => card.anim);
    const selectedFrom =
      state.selection && state.selection.zone === 'tableau' && state.selection.index === col
        ? state.selection.from
        : null;

    if (!dealing) {
      renderPile(stage, g, x, L.tableauY, pile, {
        theme,
        maxHeight: L.tableauH,
        selectedFrom,
      });
      drawFlip(stage, g, pile, x, L.tableauY, theme, L);
      return;
    }

    // Mid-deal each card travels from the stock corner to its own row, so the
    // pile is drawn card by card rather than as a settled stack.
    const { offsets } = pileOffsets(pile, { maxHeight: L.tableauH });
    pile.forEach((card, i) => {
      const t = card.anim ? card.anim.t : 1;
      renderCard(
        stage,
        g,
        Math.round(lerp(stockX, x, t)),
        Math.round(lerp(L.topY, L.tableauY + offsets[i], t)),
        card,
        { theme, faceUp: card.faceUp, shadow: i === pile.length - 1 },
      );
    });
  });
}

/** Redraw the top card mid-flip, narrowing to an edge and opening face up. */
function drawFlip(stage, g, pile, x, y, theme, L) {
  const card = top(pile);
  if (!card || card.flip == null) return;
  const { offsets } = pileOffsets(pile, { maxHeight: L.tableauH });
  renderCard(stage, g, x, y + offsets[pile.length - 1], card, {
    theme,
    faceUp: true,
    squash: card.flip,
    shadow: true,
  });
}

function isSelected(state, zone, index) {
  return Boolean(state.selection && state.selection.zone === zone && state.selection.index === index);
}

// --- cursor ----------------------------------------------------------------

function drawCursor(stage, g, state, theme, L) {
  // Hints first, so the cursor still wins on a pile that is both.
  // Dotted for a hint, solid for the cursor: the two stay distinguishable on a
  // terminal with no colour to tell them apart with.
  for (const dest of state.hints ?? []) {
    const hx = L.colX(dest.zone === 'foundation' ? FOUNDATION_COL + dest.index : dest.index);
    const hy = (dest.zone === 'foundation' ? L.topY : L.tableauY) - 1;
    stage.put(hx, hy, `${g.dot} `.repeat(Math.floor(CARD_W / 2)), {
      fg: theme.good,
      bg: theme.table,
    });
  }

  const { row, col } = state.cursor;
  const isTop = row === 'top';
  const x = L.colX(isTop ? topSlotColumn(col) : col);
  const y = (isTop ? L.topY : L.tableauY) - 1;

  stage.put(x, y, g.hDouble.repeat(CARD_W), {
    fg: state.selection ? theme.good : theme.accent,
    bg: theme.table,
    bold: true,
  });
}

/** Top-row slot index to board column. */
function topSlotColumn(slot) {
  if (slot === 0) return STOCK_COL;
  if (slot === 1) return WASTE_COL;
  return FOUNDATION_COL + (slot - 2);
}

// --- footer ----------------------------------------------------------------

function drawFooter(stage, g, game, theme, L, ctx) {
  const keys = controlsFor(game, ctx, L.w);
  let x = Math.max(0, Math.floor((L.w - controlsWidth(keys)) / 2));

  for (const [key, label] of keys) {
    stage.put(x, L.controlsY, key, { fg: theme.accent, bg: theme.table, bold: true });
    x += strWidth(key) + 1;
    stage.put(x, L.controlsY, label, { fg: theme.textMuted, bg: theme.table });
    x += strWidth(label) + 3;
  }

  const { state } = game;

  const status = state.message || defaultStatus(state);
  stage.put(Math.max(0, Math.floor((L.w - strWidth(status)) / 2)), L.statusY, status, {
    fg: state.message ? theme.text : theme.tableDark,
    bg: theme.table,
  });
}

export function controlsWidth(keys) {
  if (keys.length === 0) return 0;
  return keys.reduce((sum, [k, label]) => sum + strWidth(k) + 1 + strWidth(label) + 3, 0) - 3;
}

/**
 * The control hints, trimmed to fit.
 *
 * Solitaire has more verbs than blackjack and the footer is the first thing to
 * overflow a narrow window — where it silently loses whichever hint happens to
 * be last, usually `quit`. So entries carry a rank and the least useful ones
 * are dropped deliberately until the row fits, leaving the essentials intact.
 */
export function controlsFor(game, ctx = {}, width = Infinity) {
  const { state } = game;
  const held = Boolean(state.selection);

  // Array order is display order; `rank` only decides what gets dropped first.
  const g = g_(ctx);
  const entries = [
    { rank: 0, key: `${g.arrowL}${g.arrowR}`, label: 'move' },
    { rank: 0, key: `${g.arrowU}${g.arrowD}`, label: held ? 'take more' : 'row' },
    { rank: 0, key: 'space', label: held ? 'drop' : 'pick up' },
    { rank: 1, key: 'esc', label: 'cancel', when: held },
    { rank: 2, key: 'a', label: 'foundation' },
    { rank: 3, key: 'u', label: 'undo', when: game.canUndo },
    { rank: 4, key: '?', label: 'hint' },
    { rank: 5, key: 'F2', label: ctx.mono ? 'color' : 'mono', when: ctx.colorAvailable },
    { rank: 0, key: 'q', label: 'quit' },
  ].filter((e) => e.when !== false);

  // Highest rank goes first; rank 0 is never dropped.
  for (let cut = 5; cut >= 1; cut--) {
    const keys = entries.filter((e) => e.rank <= cut).map((e) => [e.key, e.label]);
    if (controlsWidth(keys) <= width) return keys;
  }
  return entries.filter((e) => e.rank === 0).map((e) => [e.key, e.label]);
}

/** Glyphs come through ctx during a render and are stubbed in tests. */
function g_(ctx) {
  return ctx.glyphs ?? { arrowL: '<', arrowR: '>', arrowU: '^', arrowD: 'v' };
}

function defaultStatus(state) {
  const s = state.stats;
  if (!s.games) return 'A to autoplay safe cards   n for a new deal';
  const rate = s.games ? Math.round((s.won / s.games) * 100) : 0;
  return `${s.won}/${s.games} won (${rate}%)   A autoplay   n new deal`;
}

function drawWinBanner(stage, g, state, theme, L) {
  const lines = [
    'YOU WIN',
    '',
    `${state.moves} moves in ${clock(state.elapsed)}`,
    '',
    'n  deal again',
  ];
  const w = Math.max(...lines.map(strWidth)) + 8;
  const h = lines.length + 4;
  const x = Math.floor((L.w - w) / 2);
  const y = Math.floor((L.h - h) / 2);

  stage.fill(x, y, w, h, ' ', { bg: theme.tableDark });
  box(stage, g, x, y, w, h, { fg: theme.accent, bg: theme.tableDark }, 'double');

  lines.forEach((line, i) => {
    if (!line) return;
    stage.put(x + Math.floor((w - strWidth(line)) / 2), y + 2 + i, line, {
      fg: i === 0 ? theme.accent : theme.text,
      bg: theme.tableDark,
      bold: i === 0,
    });
  });
}
