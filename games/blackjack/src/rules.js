/**
 * Blackjack rules. Pure functions, no rendering, no state.
 *
 * House rules implemented:
 *   - 6-deck shoe, reshuffled when it runs below a quarter
 *   - dealer stands on all 17s, including soft 17
 *   - blackjack pays 3:2
 *   - double on any two cards
 *   - split on any equal-rank pair, one split per round, one card to split aces
 *   - no insurance and no surrender
 *
 * These are stated in-game too. A player who can't see the rules can't judge
 * whether they were treated fairly, and that's the whole trust question with a
 * gambling game a stranger installed from npm.
 */

export const BLACKJACK_PAYOUT = 1.5;
export const DEALER_STANDS_ON = 17;

/**
 * Best total for a hand, plus whether it's soft (holding an ace still counted
 * as 11, so the next card can't bust it).
 * @param {Array<{rank:string}>} cards
 */
export function handValue(cards) {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    if (card.rank === 'A') {
      aces++;
      total += 11;
    } else if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }

  // Demote aces from 11 to 1 only as far as needed to survive.
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return { total, soft: aces > 0 };
}

export function isBust(cards) {
  return handValue(cards).total > 21;
}

/** A natural: 21 on the first two cards. A split hand reaching 21 is not one. */
export function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function canDouble(hand) {
  return hand.cards.length === 2 && !hand.stood && !hand.doubled;
}

/** Pairs split by rank, so K-Q is not a pair even though both are worth ten. */
export function canSplit(hand, handCount, maxHands = 2) {
  return (
    hand.cards.length === 2 &&
    hand.cards[0].rank === hand.cards[1].rank &&
    handCount < maxHands &&
    !hand.fromSplitAce
  );
}

export function dealerShouldHit(cards) {
  return handValue(cards).total < DEALER_STANDS_ON;
}

/**
 * Outcome of one player hand against the dealer.
 * @returns {'blackjack'|'win'|'push'|'lose'}
 */
export function settleHand(playerCards, dealerCards, { fromSplit = false } = {}) {
  const player = handValue(playerCards).total;
  const dealer = handValue(dealerCards).total;

  if (player > 21) return 'lose';

  // A 21 made after splitting pays as an ordinary win, not 3:2 — the usual
  // house rule, and the one players are surprised by if it isn't stated.
  const playerNatural = isBlackjack(playerCards) && !fromSplit;
  const dealerNatural = isBlackjack(dealerCards);

  if (playerNatural && dealerNatural) return 'push';
  if (playerNatural) return 'blackjack';
  if (dealerNatural) return 'lose';

  if (dealer > 21) return 'win';
  if (player > dealer) return 'win';
  if (player < dealer) return 'lose';
  return 'push';
}

/** Net chips won or lost for a hand, given its bet. */
export function payout(outcome, bet) {
  switch (outcome) {
    case 'blackjack':
      return Math.round(bet * BLACKJACK_PAYOUT);
    case 'win':
      return bet;
    case 'push':
      return 0;
    default:
      return -bet;
  }
}

export const OUTCOME_LABEL = {
  blackjack: 'BLACKJACK',
  win: 'WIN',
  push: 'PUSH',
  lose: 'LOSE',
};
