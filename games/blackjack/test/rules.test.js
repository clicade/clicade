import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  handValue,
  isBust,
  isBlackjack,
  canDouble,
  canSplit,
  dealerShouldHit,
  settleHand,
  payout,
} from '../src/rules.js';

const c = (rank, suit = 's') => ({ rank, suit });
const hand = (...ranks) => ranks.map((r) => c(r));

test('number cards add up', () => {
  assert.equal(handValue(hand('2', '3', '4')).total, 9);
});

test('face cards are worth ten', () => {
  assert.equal(handValue(hand('J', 'Q')).total, 20);
  assert.equal(handValue(hand('K', '10')).total, 20);
});

test('an ace counts as eleven when it fits', () => {
  const v = handValue(hand('A', '9'));
  assert.equal(v.total, 20);
  assert.equal(v.soft, true);
});

test('an ace demotes to one rather than busting', () => {
  const v = handValue(hand('A', '9', '5'));
  assert.equal(v.total, 15);
  assert.equal(v.soft, false);
});

test('multiple aces demote one at a time', () => {
  assert.equal(handValue(hand('A', 'A')).total, 12);
  assert.equal(handValue(hand('A', 'A', 'A')).total, 13);
  assert.equal(handValue(hand('A', 'A', '9')).total, 21);
  assert.equal(handValue(hand('A', 'A', 'A', '8')).total, 21);
});

test('soft becomes hard once every ace is demoted', () => {
  assert.equal(handValue(hand('A', '6')).soft, true);
  assert.equal(handValue(hand('A', '6', '10')).soft, false);
});

test('bust detection', () => {
  assert.equal(isBust(hand('K', 'Q', '5')), true);
  assert.equal(isBust(hand('K', 'Q')), false);
  assert.equal(isBust(hand('A', 'K', 'K')), false, 'aces save this hand at 21');
});

test('blackjack is 21 on exactly two cards', () => {
  assert.equal(isBlackjack(hand('A', 'K')), true);
  assert.equal(isBlackjack(hand('A', '10')), true);
  assert.equal(isBlackjack(hand('7', '7', '7')), false, '21 on three cards is not a natural');
});

test('dealer stands on all 17s, including soft', () => {
  assert.equal(dealerShouldHit(hand('10', '6')), true);
  assert.equal(dealerShouldHit(hand('10', '7')), false);
  assert.equal(dealerShouldHit(hand('A', '6')), false, 'soft 17 stands under these house rules');
  assert.equal(dealerShouldHit(hand('A', '5')), true);
});

test('double is offered only on the first two cards', () => {
  assert.equal(canDouble({ cards: hand('5', '6') }), true);
  assert.equal(canDouble({ cards: hand('5', '6', '2') }), false);
  assert.equal(canDouble({ cards: hand('5', '6'), doubled: true }), false);
});

test('split needs a matching rank, not just matching value', () => {
  assert.equal(canSplit({ cards: hand('8', '8') }, 1), true);
  assert.equal(canSplit({ cards: [c('K'), c('Q')] }, 1), false, 'K-Q is not a pair');
  assert.equal(canSplit({ cards: hand('8', '8') }, 2), false, 'one split per round');
  assert.equal(canSplit({ cards: hand('A', 'A'), fromSplitAce: true }, 1), false);
});

test('settlement: player bust always loses, even against a bust dealer', () => {
  assert.equal(settleHand(hand('K', 'Q', '5'), hand('K', 'Q', '5')), 'lose');
});

test('settlement: dealer bust wins for a standing player', () => {
  assert.equal(settleHand(hand('10', '8'), hand('K', 'Q', '5')), 'win');
});

test('settlement: higher total wins', () => {
  assert.equal(settleHand(hand('10', '9'), hand('10', '8')), 'win');
  assert.equal(settleHand(hand('10', '7'), hand('10', '8')), 'lose');
  assert.equal(settleHand(hand('10', '8'), hand('10', '8')), 'push');
});

test('settlement: natural blackjack', () => {
  assert.equal(settleHand(hand('A', 'K'), hand('10', '8')), 'blackjack');
  assert.equal(settleHand(hand('A', 'K'), hand('A', 'Q')), 'push', 'two naturals push');
  assert.equal(settleHand(hand('10', '9'), hand('A', 'Q')), 'lose');
});

test('settlement: a dealer natural beats a non-natural 21', () => {
  assert.equal(settleHand(hand('7', '7', '7'), hand('A', 'K')), 'lose');
});

test('settlement: 21 after a split pays as a normal win, not 3:2', () => {
  assert.equal(settleHand(hand('A', 'K'), hand('10', '9'), { fromSplit: true }), 'win');
});

test('payouts', () => {
  assert.equal(payout('blackjack', 100), 150);
  assert.equal(payout('blackjack', 25), 38, 'rounds to whole chips');
  assert.equal(payout('win', 100), 100);
  assert.equal(payout('push', 100), 0);
  assert.equal(payout('lose', 100), -100);
});

test('a natural is worth more than an ordinary win', () => {
  assert.ok(payout('blackjack', 50) > payout('win', 50));
});
