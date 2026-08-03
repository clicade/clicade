/**
 * Table rendering.
 *
 * Reads game state, draws a table. Holds no rules and mutates nothing, so the
 * same state always produces the same frame — which is what makes the golden
 * frame tests meaningful.
 *
 * Layout is derived from the stage, which is locked to the terminal size at
 * launch and never changes afterwards. Reading stage dimensions is therefore
 * safe here; reading *terminal* dimensions would not be, and neither the rules
 * nor `update()` touch either.
 */

import { strWidth } from '@clicade/tui';
import { renderCard, handWidth, lerp, SIZES, drawRow, rowWidth } from '@clicade/kit';
import { OUTCOME_LABEL, handValue } from './rules.js';

/** Smallest table that stays readable. Below this the game pauses. */
export const MIN_W = 72;
export const MIN_H = 22;

const HAND_GAP = 4;

/**
 * Row positions for a given world.
 *
 * The seats sit near the top and the status bar is pinned to the bottom; extra
 * height is absorbed between them, capped so a very tall terminal doesn't strand
 * the table at the ceiling.
 */
export function layout(w, h) {
  // Centre the seats between the header rule and the status bar. The block runs
  // from row 2 to the message row, 18 rows deep; the space left over after the
  // bottom two rows is split evenly above and below it.
  const BLOCK_ROWS = 18;
  const offset = Math.max(0, Math.floor((h - 3 - BLOCK_ROWS) / 2));
  const stakeY = 16 + offset;

  return {
    w,
    h,
    dealerLabelY: 2 + offset,
    dealerY: 3 + offset,
    playerLabelY: 9 + offset,
    playerY: 10 + offset,
    badgeY: 15 + offset,
    stakeY,
    // Keep the message near the table rather than pinned to the bottom, or it
    // drifts far away on a tall terminal.
    messageY: Math.min(h - 4, stakeY + 2),
    controlsY: h - 2,
    rulesY: h - 1,
    shoe: { x: w - 9, y: 0 },
    // Bordered buttons need three rows instead of one. A 24-row terminal is
    // still the commonest size there is, so they only appear where the height
    // is genuinely spare — below that the same buttons draw flat, on the row
    // the hints already used. Either way they are clickable, and the minimum
    // window does not move.
    buttonsBoxed: h >= 26,
    buttonsY: h >= 26 ? h - 4 : h - 2,
  };
}

/**
 * The actions available right now, as buttons.
 *
 * Unavailable ones are shown disabled rather than hidden — the opposite of the
 * rule solitaire follows, and deliberately. In solitaire a missing hint is a
 * key that does nothing. Here the four actions *are* blackjack: seeing that
 * double and split exist, and that they are greyed because this hand is not a
 * pair, is how somebody learns the game from the table instead of from a book.
 *
 * `id` is the key the action dispatches, so a click and a keypress cannot drift
 * apart. `key` is only what the face shows.
 */
export function actionsFor(game, ctx = {}, g = {}) {
  const { state } = game;
  const list = [];

  if (state.phase === 'betting') {
    list.push(
      { id: 'left', key: g.arrowL ?? '<', label: 'less' },
      { id: 'right', key: g.arrowR ?? '>', label: 'more' },
      { id: 'enter', key: 'enter', label: 'deal' },
    );
  } else if (state.phase === 'player') {
    const hand = state.hands[state.active] ?? { cards: [], bet: 0 };
    list.push(
      { id: 'h', key: 'h', label: 'hit' },
      { id: 's', key: 's', label: 'stand' },
      { id: 'd', key: 'd', label: 'double', enabled: game.canDouble() && state.bankroll >= hand.bet },
      { id: 'p', key: 'p', label: 'split', enabled: game.canSplit() },
    );
  } else if (state.phase === 'settle') {
    list.push({ id: 'enter', key: 'enter', label: 'next hand' });
  } else if (state.phase === 'broke') {
    list.push({ id: 'r', key: 'r', label: 'buy back in' });
  }

  if (ctx.colorAvailable) list.push({ id: 'f2', key: 'F2', label: ctx.mono ? 'color' : 'mono' });
  list.push({ id: 'q', key: 'q', label: 'quit' });
  return list;
}

export function render(stage, g, game, theme, ctx = {}) {
  const { state } = game;
  const L = layout(stage.width, stage.height);

  // Regions are rebuilt every frame from the draw itself, so a button that
  // stops being drawn stops being clickable in the same tick.
  ctx.buttons?.clear();

  stage.fill(0, 0, L.w, L.h, ' ', { bg: theme.table });

  drawHeader(stage, g, state, theme, L);
  drawShoe(stage, g, state, theme, L);

  if (state.phase === 'betting') drawBetting(stage, state, theme, L);
  else drawSeats(stage, g, state, theme, L);

  drawMessage(stage, state, theme, L, ctx);
  drawControls(stage, g, game, theme, L, ctx);
  drawRules(stage, theme, L);
}

function centred(L, text) {
  return Math.max(0, Math.floor((L.w - strWidth(text)) / 2));
}

function drawHeader(stage, g, state, theme, L) {
  stage.put(0, 0, g.hDouble.repeat(L.w), { fg: theme.tableDark, bg: theme.table });
  stage.put(2, 0, ' BLACKJACK ', { fg: theme.accent, bg: theme.table, bold: true });

  const chips = `chips ${state.bankroll}`;
  const bet = state.hands.length
    ? `bet ${state.hands.reduce((sum, h) => sum + h.bet, 0)}`
    : `bet ${state.bet}`;
  const right = ` ${bet}   ${chips} `;
  stage.put(L.w - strWidth(right) - 1, 0, right, {
    fg: theme.text,
    bg: theme.table,
    bold: true,
  });
}

function drawShoe(stage, g, state, theme, L) {
  if (state.shoeSize === 0) return;
  for (let i = 0; i < 3; i++) {
    stage.put(L.shoe.x + i, L.shoe.y + 2, g.shadeDark, { fg: theme.cardBack, bg: theme.table });
  }
}

function drawBetting(stage, state, theme, L) {
  const lines = [
    ['Place your bet', theme.text, true],
    ['', null, false],
    [` ${state.bet} chips `, theme.accent, true],
    ['', null, false],
    ['left / right  adjust      enter  deal', theme.textMuted, false],
    ['1 2 3  bet 25 / 50 / 100', theme.textMuted, false],
  ];

  lines.forEach(([text, color, bold], i) => {
    if (!text) return;
    stage.put(centred(L, text), L.dealerY + 2 + i, text, { fg: color, bg: theme.table, bold });
  });

  if (state.stats.rounds > 0) {
    const s = state.stats;
    const summary = `${s.rounds} rounds   ${s.won}W ${s.lost}L ${s.pushed}P   ${s.blackjacks} blackjacks   peak ${s.peak}`;
    stage.put(centred(L, summary), L.stakeY, summary, { fg: theme.textMuted, bg: theme.table });
  }
}

function drawSeats(stage, g, state, theme, L) {
  const dealerTotal = state.dealer.revealed
    ? totalLabel(state.dealer.cards)
    : upcardLabel(state.dealer.cards);
  drawSeatLabel(stage, 'DEALER', dealerTotal, L.dealerLabelY, theme);

  const dealerX = Math.floor((L.w - handWidth(state.dealer.cards.length)) / 2);
  drawHand(stage, g, state.dealer.cards, dealerX, L.dealerY, theme, L, {
    flipIndex: state.dealer.revealed ? -1 : 1,
    flip: state.dealer.flip,
  });

  const hands = state.hands;
  const totalWidth =
    hands.reduce((sum, h) => sum + handWidth(h.cards.length), 0) + (hands.length - 1) * HAND_GAP;
  let x = Math.floor((L.w - totalWidth) / 2);

  hands.forEach((hand, i) => {
    const active = i === state.active && state.phase === 'player';
    const w = handWidth(hand.cards.length);

    if (hands.length > 1) {
      stage.put(x + 1, L.playerLabelY, `${i + 1}`, {
        fg: active ? theme.accent : theme.textMuted,
        bg: theme.table,
        bold: active,
      });
    }

    drawHand(stage, g, hand.cards, x, L.playerY, theme, L, { highlight: active });

    const badge = hand.outcome ? OUTCOME_LABEL[hand.outcome] : totalLabel(hand.cards);
    const badgeColor = hand.outcome
      ? hand.outcome === 'lose'
        ? theme.bad
        : hand.outcome === 'push'
          ? theme.textMuted
          : theme.good
      : active
        ? theme.accent
        : theme.text;

    stage.put(x + Math.floor((w - strWidth(badge)) / 2), L.badgeY, badge, {
      fg: badgeColor,
      bg: theme.table,
      bold: true,
    });

    const stake = `${hand.bet}${hand.doubled ? ' x2' : ''}`;
    stage.put(x + Math.floor((w - strWidth(stake)) / 2), L.stakeY, stake, {
      fg: theme.textMuted,
      bg: theme.table,
    });

    x += w + HAND_GAP;
  });

  drawSeatLabel(stage, 'YOU', '', L.playerLabelY, theme, hands.length > 1);
}

function drawSeatLabel(stage, name, total, y, theme, skipName = false) {
  if (!skipName) stage.put(2, y, name, { fg: theme.textMuted, bg: theme.table, bold: true });
  if (total) stage.put(2 + name.length + 2, y, total, { fg: theme.text, bg: theme.table });
}

function totalLabel(cards) {
  if (cards.length === 0) return '';
  const { total, soft } = handValue(cards);
  if (total > 21) return `${total} BUST`;
  return soft ? `soft ${total}` : `${total}`;
}

/** Before the hole card turns, only the upcard is public information. */
function upcardLabel(cards) {
  const up = cards.filter((card) => !card.faceDown);
  if (up.length === 0) return '';
  return `showing ${handValue(up).total}`;
}

function drawHand(stage, g, cards, x, y, theme, L, opts = {}) {
  cards.forEach((card, i) => {
    const last = i === cards.length - 1;
    const slotX = x + i * SIZES.spine.w;

    // In-flight cards interpolate from the shoe to their slot.
    const t = card.anim ? card.anim.t : 1;
    const drawX = Math.round(lerp(L.shoe.x, slotX, t));
    const drawY = Math.round(lerp(L.shoe.y, y, t));

    // A card still travelling is drawn whole, so it reads as a single card
    // moving rather than a spine that suddenly becomes a face on landing.
    const size = t < 1 ? 'full' : last ? 'full' : 'spine';

    renderCard(stage, g, drawX, drawY, card, {
      size,
      theme,
      faceUp: !card.faceDown,
      squash: i === opts.flipIndex ? opts.flip : 1,
      highlight: opts.highlight && last && t >= 1,
    });
  });
}

function drawMessage(stage, state, theme, L, ctx = {}) {
  // With nothing to report, ask the question the buttons answer. A row of
  // controls with no prompt above it reads as decoration; a player who does
  // not know the game needs telling that it is their turn.
  const prompt =
    state.phase === 'player'
      ? ctx.mouseEnabled
        ? 'What would you like to do? Click, or press the key.'
        : 'What would you like to do?'
      : '';
  const text = state.message || prompt;
  if (!text) return;

  const color = state.lastResult > 0 ? theme.good : state.lastResult < 0 ? theme.bad : theme.text;
  const settling = state.phase === 'settle' && state.message;

  stage.put(centred(L, text), L.messageY, text, {
    fg: settling ? color : state.message ? theme.text : theme.textMuted,
    bg: theme.table,
    bold: Boolean(settling),
  });
}

function drawControls(stage, g, game, theme, L, ctx) {
  const items = actionsFor(game, ctx, g);
  const buttons = ctx.buttons;
  const style = L.buttonsBoxed ? 'boxed' : 'flat';
  const gap = L.buttonsBoxed ? 1 : 3;

  // Without a button set — a golden-frame test, say — the row still draws.
  // Only the clicking needs one.
  const sink = buttons ?? { add: () => {}, hovered: null, pressed: null };
  const width = rowWidth(items, { gap, style });
  const x = Math.max(0, Math.floor((L.w - width) / 2));

  drawRow(stage, g, sink, x, L.buttonsY, items, { theme, gap, style });
}

function drawRules(stage, theme, L) {
  // Must fit the world or centring goes negative and the left end is clipped.
  const text = 'dealer stands on 17   blackjack pays 3:2   6 decks   one split';
  stage.put(centred(L, text), L.rulesY, text, { fg: theme.tableDark, bg: theme.table });
}
