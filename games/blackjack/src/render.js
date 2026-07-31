/**
 * Table rendering.
 *
 * Reads game state, draws a table. Holds no rules and mutates nothing, so the
 * same state always produces the same frame — which is what makes the golden
 * frame tests meaningful.
 *
 * All coordinates are logical stage units. Nothing here reads terminal size:
 * resizing or zooming must not move a card.
 */

import { strWidth } from '@clicade/tui';
import { renderCard, handWidth, lerp, SIZES } from '@clicade/kit';
import { OUTCOME_LABEL, handValue } from './rules.js';

export const WORLD_W = 72;
export const WORLD_H = 22;

/** Cards fly in from here — the shoe, top right. */
const SHOE = { x: WORLD_W - 9, y: 0 };

// Explicit rows rather than arithmetic off the card height: two derived values
// previously landed on the same line and overprinted each other.
const DEALER_Y = 3; // cards occupy 3..7
const PLAYER_Y = 10; // cards occupy 10..14
const BADGE_Y = 15;
const STAKE_Y = 16;
const MESSAGE_Y = 18;
const CONTROLS_Y = 20;
const RULES_Y = 21;

export function render(stage, g, game, theme) {
  const { state } = game;

  stage.fill(0, 0, WORLD_W, WORLD_H, ' ', { bg: theme.table });

  drawHeader(stage, g, state, theme);
  drawShoe(stage, g, state, theme);

  if (state.phase === 'betting') drawBetting(stage, state, theme);
  else drawSeats(stage, g, state, theme);

  drawMessage(stage, state, theme);
  drawControls(stage, game, theme);
  drawRules(stage, theme);
}

function drawHeader(stage, g, state, theme) {
  stage.put(0, 0, g.hDouble.repeat(WORLD_W), { fg: theme.tableDark, bg: theme.table });
  stage.put(2, 0, ' BLACKJACK ', { fg: theme.accent, bg: theme.table, bold: true });

  const chips = `chips ${state.bankroll}`;
  const bet = state.hands.length
    ? `bet ${state.hands.reduce((sum, h) => sum + h.bet, 0)}`
    : `bet ${state.bet}`;
  const right = ` ${bet}   ${chips} `;
  stage.put(WORLD_W - strWidth(right) - 1, 0, right, {
    fg: theme.text,
    bg: theme.table,
    bold: true,
  });
}

function drawShoe(stage, g, state, theme) {
  if (state.shoeSize === 0) return;
  // A stub of card backs, so the deal has a visible source.
  for (let i = 0; i < 3; i++) {
    stage.put(SHOE.x + i, SHOE.y + 2, g.shadeDark, { fg: theme.cardBack, bg: theme.table });
  }
}

function drawBetting(stage, state, theme) {
  const centre = Math.floor(WORLD_W / 2);
  const lines = [
    ['Place your bet', theme.text, true],
    ['', null, false],
    [`${state.bet}`, theme.accent, true],
    ['', null, false],
    ['left / right  adjust      enter  deal', theme.textMuted, false],
    ['1 2 3  bet 25 / 50 / 100', theme.textMuted, false],
  ];

  lines.forEach(([text, color, bold], i) => {
    if (!text) return;
    const y = DEALER_Y + 2 + i;
    const size = text === `${state.bet}` ? 3 : 1;
    const display = size === 3 ? ` ${text} chips ` : text;
    stage.put(centre - Math.floor(strWidth(display) / 2), y, display, {
      fg: color,
      bg: theme.table,
      bold,
    });
  });

  if (state.stats.rounds > 0) {
    const s = state.stats;
    const summary = `${s.rounds} rounds   ${s.won}W ${s.lost}L ${s.pushed}P   ${s.blackjacks} blackjacks   peak ${s.peak}`;
    stage.put(centre - Math.floor(strWidth(summary) / 2), PLAYER_Y + 4, summary, {
      fg: theme.textMuted,
      bg: theme.table,
    });
  }
}

function drawSeats(stage, g, state, theme) {
  // --- dealer ---
  const dealerTotal = state.dealer.revealed
    ? totalLabel(state.dealer.cards)
    : upcardLabel(state.dealer.cards);
  drawSeatLabel(stage, 'DEALER', dealerTotal, DEALER_Y - 1, theme);

  const dealerX = Math.floor((WORLD_W - handWidth(state.dealer.cards.length)) / 2);
  drawHand(stage, g, state.dealer.cards, dealerX, DEALER_Y, theme, {
    flipIndex: state.dealer.revealed ? -1 : 1,
    flip: state.dealer.flip,
  });

  // --- player hands ---
  const hands = state.hands;
  const totalWidth = hands.reduce((sum, h) => sum + handWidth(h.cards.length), 0) + (hands.length - 1) * 4;
  let x = Math.floor((WORLD_W - totalWidth) / 2);

  hands.forEach((hand, i) => {
    const active = i === state.active && state.phase === 'player';
    const w = handWidth(hand.cards.length);

    if (hands.length > 1) {
      const tag = `${i + 1}`;
      stage.put(x + 1, PLAYER_Y - 1, tag, {
        fg: active ? theme.accent : theme.textMuted,
        bg: theme.table,
        bold: active,
      });
    }

    drawHand(stage, g, hand.cards, x, PLAYER_Y, theme, { highlight: active });

    const label = totalLabel(hand.cards);
    const badge = hand.outcome ? OUTCOME_LABEL[hand.outcome] : label;
    const badgeColor = hand.outcome
      ? hand.outcome === 'lose'
        ? theme.bad
        : hand.outcome === 'push'
          ? theme.textMuted
          : theme.good
      : active
        ? theme.accent
        : theme.text;

    stage.put(x + Math.floor((w - strWidth(badge)) / 2), BADGE_Y, badge, {
      fg: badgeColor,
      bg: theme.table,
      bold: true,
    });

    const stake = `${hand.bet}${hand.doubled ? ' x2' : ''}`;
    stage.put(x + Math.floor((w - strWidth(stake)) / 2), STAKE_Y, stake, {
      fg: theme.textMuted,
      bg: theme.table,
    });

    x += w + 4;
  });

  drawSeatLabel(stage, 'YOU', '', PLAYER_Y - 1, theme, hands.length > 1);
}

function drawSeatLabel(stage, name, total, y, theme, skipName = false) {
  if (!skipName) {
    stage.put(2, y, name, { fg: theme.textMuted, bg: theme.table, bold: true });
  }
  if (total) {
    stage.put(2 + name.length + 2, y, total, { fg: theme.text, bg: theme.table });
  }
}

function totalLabel(cards) {
  if (cards.length === 0) return '';
  const { total, soft } = handValue(cards);
  if (total > 21) return `${total} BUST`;
  return soft ? `soft ${total}` : `${total}`;
}

/** Before the hole card turns, only the upcard is public information. */
function upcardLabel(cards) {
  const up = cards.filter((c) => !c.faceDown);
  if (up.length === 0) return '';
  return `showing ${handValue(up).total}`;
}

function drawHand(stage, g, cards, x, y, theme, opts = {}) {
  cards.forEach((card, i) => {
    const last = i === cards.length - 1;
    const slotX = x + i * SIZES.spine.w;

    // In-flight cards interpolate from the shoe to their slot.
    const t = card.anim ? card.anim.t : 1;
    const drawX = Math.round(lerp(SHOE.x, slotX, t));
    const drawY = Math.round(lerp(SHOE.y, y, t));

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

function drawMessage(stage, state, theme) {
  const y = MESSAGE_Y;
  if (!state.message) return;

  const color =
    state.lastResult > 0 ? theme.good : state.lastResult < 0 ? theme.bad : theme.text;

  stage.put(Math.floor((WORLD_W - strWidth(state.message)) / 2), y, state.message, {
    fg: state.phase === 'settle' ? color : theme.text,
    bg: theme.table,
    bold: state.phase === 'settle',
  });
}

function drawControls(stage, game, theme) {
  const { state } = game;
  const y = CONTROLS_Y;
  let keys = [];

  if (state.phase === 'betting') {
    keys = [['←→', 'bet'], ['enter', 'deal'], ['q', 'quit']];
  } else if (state.phase === 'player') {
    keys = [['h', 'hit'], ['s', 'stand']];
    if (game.canDouble() && state.bankroll >= state.hands[state.active].bet) {
      keys.push(['d', 'double']);
    }
    if (game.canSplit()) keys.push(['p', 'split']);
    keys.push(['q', 'quit']);
  } else if (state.phase === 'settle') {
    keys = [['enter', 'next hand'], ['q', 'quit']];
  } else if (state.phase === 'broke') {
    keys = [['r', 'buy back in'], ['q', 'quit']];
  }

  if (keys.length === 0) return;

  const text = keys.map(([k, label]) => `${k} ${label}`).join('    ');
  let x = Math.floor((WORLD_W - strWidth(text)) / 2);

  for (const [key, label] of keys) {
    stage.put(x, y, key, { fg: theme.accent, bg: theme.table, bold: true });
    x += strWidth(key) + 1;
    stage.put(x, y, label, { fg: theme.textMuted, bg: theme.table });
    x += strWidth(label) + 4;
  }
}

function drawRules(stage, theme) {
  // Must fit WORLD_W or centring goes negative and the left end is clipped —
  // which silently turned "dealer stands" into "stands".
  const text = 'dealer stands on 17   blackjack pays 3:2   6 decks   one split';
  stage.put(Math.floor((WORLD_W - strWidth(text)) / 2), RULES_Y, text, {
    fg: theme.tableDark,
    bg: theme.table,
  });
}
