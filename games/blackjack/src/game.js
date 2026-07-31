/**
 * Blackjack state machine.
 *
 * Holds no rendering and no terminal knowledge — it exposes state plus actions,
 * and the renderer reads it. That separation is what lets the whole game be
 * driven from tests without a terminal.
 *
 * Animation lives here rather than in the renderer because it gates play: while
 * the timeline is busy, input is ignored. A card that is still travelling has
 * not been dealt yet, and letting a player act mid-deal is how a game starts
 * feeling loose.
 */

import { createDeck, createRng, randomSeed, createTimeline, ease } from '@clicade/kit';
import { createSave } from '@clicade/tui';
import {
  handValue,
  isBust,
  isBlackjack,
  canDouble,
  canSplit,
  dealerShouldHit,
  settleHand,
  payout,
} from './rules.js';

export const DECKS = 6;
export const START_BANKROLL = 500;
export const MIN_BET = 5;
export const BET_STEP = 5;
export const MAX_HANDS = 2;

const DEAL_TIME = 0.22;
const DEAL_STAGGER = 0.13;
const FLIP_TIME = 0.26;
const BEAT = 0.42;

const DEFAULT_SAVE = {
  bankroll: START_BANKROLL,
  lastBet: 25,
  stats: { rounds: 0, won: 0, lost: 0, pushed: 0, blackjacks: 0, peak: START_BANKROLL },
};

function makeHand(cards, bet, extra = {}) {
  return {
    cards,
    bet,
    stood: false,
    doubled: false,
    fromSplit: false,
    fromSplitAce: false,
    outcome: null,
    ...extra,
  };
}

export function createGame(opts = {}) {
  const save = opts.save ?? createSave('blackjack', DEFAULT_SAVE);
  const persisted = save.load();
  const timeline = createTimeline();
  let rng = createRng(opts.seed ?? randomSeed());

  const state = {
    phase: 'betting',
    bankroll: persisted.bankroll ?? START_BANKROLL,
    bet: 25,
    stats: { ...DEFAULT_SAVE.stats, ...persisted.stats },
    shoe: [],
    shoeSize: 0,
    dealer: { cards: [], revealed: false, flip: 1 },
    hands: [],
    active: 0,
    message: 'Place your bet.',
    lastResult: null,
  };

  state.bet = clampBet(persisted.lastBet ?? 25);

  function clampBet(value) {
    const max = Math.max(MIN_BET, state.bankroll);
    return Math.max(MIN_BET, Math.min(max, Math.round(value / BET_STEP) * BET_STEP));
  }

  function persist() {
    save.save({ bankroll: state.bankroll, lastBet: state.bet, stats: state.stats });
  }

  /** Schedule a callback. Keeps the timeline busy, which keeps input gated. */
  function after(delay, fn) {
    timeline.add({ duration: 0.0001, delay, onComplete: fn });
  }

  function reshuffle() {
    state.shoe = rng.shuffle(createDeck(DECKS));
    state.shoeSize = state.shoe.length;
  }

  function draw() {
    // Reshuffle at a quarter of the shoe rather than at empty, so a round can
    // never be dealt across a shuffle boundary.
    if (state.shoe.length < state.shoeSize * 0.25) reshuffle();
    return state.shoe.pop();
  }

  /** Deal one card into a hand, animating it in from the shoe. */
  function dealTo(target, { delay = 0, faceDown = false } = {}) {
    const card = { ...draw(), anim: { t: 0 }, faceDown };
    target.push(card);
    timeline.add({
      from: 0,
      to: 1,
      duration: DEAL_TIME,
      delay,
      ease: ease.outCubic,
      onUpdate: (v) => {
        card.anim.t = v;
      },
    });
    return card;
  }

  // --- phases -------------------------------------------------------------

  function startRound() {
    if (state.bankroll < MIN_BET) {
      state.phase = 'broke';
      state.message = 'Out of chips.';
      return;
    }
    if (state.shoe.length === 0) reshuffle();

    state.bet = clampBet(state.bet);
    state.bankroll -= state.bet;
    state.phase = 'dealing';
    state.dealer = { cards: [], revealed: false, flip: 1 };
    state.hands = [makeHand([], state.bet)];
    state.active = 0;
    state.lastResult = null;
    state.message = '';

    // Real dealing order: player, dealer, player, dealer hole.
    dealTo(state.hands[0].cards, { delay: 0 });
    dealTo(state.dealer.cards, { delay: DEAL_STAGGER });
    dealTo(state.hands[0].cards, { delay: DEAL_STAGGER * 2 });
    dealTo(state.dealer.cards, { delay: DEAL_STAGGER * 3, faceDown: true });

    after(DEAL_STAGGER * 3 + DEAL_TIME, afterDeal);
  }

  function afterDeal() {
    const player = state.hands[0];
    const playerNatural = isBlackjack(player.cards);
    const dealerNatural = isBlackjack(state.dealer.cards);

    if (playerNatural || dealerNatural) {
      revealHole(() => finishRound());
      return;
    }

    state.phase = 'player';
    state.message = handPrompt();
  }

  function handPrompt() {
    const hand = state.hands[state.active];
    const { total, soft } = handValue(hand.cards);
    const label = soft ? `soft ${total}` : `${total}`;
    return state.hands.length > 1
      ? `Hand ${state.active + 1} of ${state.hands.length} — ${label}`
      : `You have ${label}.`;
  }

  function revealHole(then) {
    const hole = state.dealer.cards[1];
    if (!hole) {
      then?.();
      return;
    }
    // Squash to edge-on, swap the face at the midpoint, then open out again.
    timeline.add({
      from: 1,
      to: 0,
      duration: FLIP_TIME / 2,
      ease: ease.inOutQuad,
      onUpdate: (v) => {
        state.dealer.flip = v;
      },
      onComplete: () => {
        state.dealer.revealed = true;
        hole.faceDown = false;
        timeline.add({
          from: 0,
          to: 1,
          duration: FLIP_TIME / 2,
          ease: ease.inOutQuad,
          onUpdate: (v) => {
            state.dealer.flip = v;
          },
          onComplete: () => then?.(),
        });
      },
    });
  }

  function advanceHand() {
    const next = state.hands.findIndex((h, i) => i > state.active && !h.stood && !isBust(h.cards));
    if (next !== -1) {
      state.active = next;
      state.message = handPrompt();
      return;
    }
    dealerTurn();
  }

  function dealerTurn() {
    state.phase = 'dealer';
    state.message = '';

    const everyoneBust = state.hands.every((h) => isBust(h.cards));
    revealHole(() => {
      if (everyoneBust) {
        after(BEAT, finishRound);
        return;
      }
      drawDealer();
    });
  }

  function drawDealer() {
    if (!dealerShouldHit(state.dealer.cards)) {
      after(BEAT, finishRound);
      return;
    }
    dealTo(state.dealer.cards);
    after(DEAL_TIME + 0.3, drawDealer);
  }

  function finishRound() {
    state.phase = 'settle';
    state.dealer.revealed = true;

    let net = 0;
    for (const hand of state.hands) {
      hand.outcome = settleHand(hand.cards, state.dealer.cards, { fromSplit: hand.fromSplit });
      const delta = payout(hand.outcome, hand.bet);
      net += delta;
      // The stake was taken up front, so returning it happens here.
      state.bankroll += hand.bet + delta;

      if (hand.outcome === 'blackjack') state.stats.blackjacks++;
      if (hand.outcome === 'win' || hand.outcome === 'blackjack') state.stats.won++;
      else if (hand.outcome === 'push') state.stats.pushed++;
      else state.stats.lost++;
    }

    state.stats.rounds++;
    state.stats.peak = Math.max(state.stats.peak, state.bankroll);
    state.lastResult = net;
    state.message =
      net > 0 ? `You win ${net} chips.` : net < 0 ? `You lose ${-net} chips.` : 'Push.';
    persist();

    if (state.bankroll < MIN_BET) {
      after(BEAT, () => {
        state.phase = 'broke';
        state.message = 'Out of chips.';
      });
    }
  }

  // --- player actions -----------------------------------------------------

  function hit() {
    const hand = state.hands[state.active];
    dealTo(hand.cards);
    after(DEAL_TIME, () => {
      if (isBust(hand.cards)) {
        hand.stood = true;
        state.message = 'Bust.';
        after(BEAT, advanceHand);
      } else if (handValue(hand.cards).total === 21) {
        hand.stood = true;
        after(BEAT * 0.6, advanceHand);
      } else {
        state.message = handPrompt();
      }
    });
  }

  function stand() {
    state.hands[state.active].stood = true;
    advanceHand();
  }

  function double() {
    const hand = state.hands[state.active];
    if (!canDouble(hand) || state.bankroll < hand.bet) return;

    state.bankroll -= hand.bet;
    hand.bet *= 2;
    hand.doubled = true;
    dealTo(hand.cards);

    after(DEAL_TIME + 0.2, () => {
      hand.stood = true;
      if (isBust(hand.cards)) state.message = 'Bust.';
      after(BEAT * 0.7, advanceHand);
    });
  }

  function split() {
    const hand = state.hands[state.active];
    if (!canSplit(hand, state.hands.length, MAX_HANDS) || state.bankroll < hand.bet) return;

    const moved = hand.cards.pop();
    const splittingAces = moved.rank === 'A';
    state.bankroll -= hand.bet;

    hand.fromSplit = true;
    hand.fromSplitAce = splittingAces;

    const second = makeHand([moved], hand.bet, {
      fromSplit: true,
      fromSplitAce: splittingAces,
    });
    state.hands.push(second);

    dealTo(hand.cards, { delay: 0 });
    dealTo(second.cards, { delay: DEAL_STAGGER });

    after(DEAL_STAGGER + DEAL_TIME, () => {
      // Split aces get exactly one card each and are done.
      if (splittingAces) {
        for (const h of state.hands) h.stood = true;
        after(BEAT, dealerTurn);
        return;
      }
      state.message = handPrompt();
    });
  }

  function adjustBet(delta) {
    state.bet = clampBet(state.bet + delta);
  }

  function nextRound() {
    state.phase = 'betting';
    state.message = 'Place your bet.';
    state.hands = [];
    state.dealer = { cards: [], revealed: false, flip: 1 };
  }

  function rebuy() {
    state.bankroll = START_BANKROLL;
    state.bet = 25;
    state.stats = { ...DEFAULT_SAVE.stats };
    persist();
    nextRound();
  }

  function update(dt) {
    timeline.update(dt);
  }

  /** Input is ignored while cards are moving. */
  function busy() {
    return !timeline.idle;
  }

  return {
    state,
    update,
    busy,
    startRound,
    hit,
    stand,
    double,
    split,
    adjustBet,
    nextRound,
    rebuy,
    persist,
    // exposed for tests
    canDouble: () => canDouble(state.hands[state.active] ?? { cards: [] }),
    canSplit: () =>
      state.hands[state.active]
        ? canSplit(state.hands[state.active], state.hands.length, MAX_HANDS) &&
          state.bankroll >= state.hands[state.active].bet
        : false,
    get timeline() {
      return timeline;
    },
    setRng(r) {
      rng = r;
    },
  };
}
