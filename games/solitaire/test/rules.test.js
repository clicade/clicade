import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rankValue,
  canStackTableau,
  canStackFoundation,
  isMovableRun,
  firstFaceUp,
  foundationFor,
  isWon,
  isSafeToAutoplay,
  destinationsFor,
} from '../src/rules.js';

const c = (rank, suit, faceUp = true) => ({ rank, suit, faceUp });

test('rank values run Ace low to King high', () => {
  assert.equal(rankValue('A'), 1);
  assert.equal(rankValue('10'), 10);
  assert.equal(rankValue('K'), 13);
});

// --- tableau ---------------------------------------------------------------

test('tableau stacking is descending and alternating colour', () => {
  assert.equal(canStackTableau(c('9', 'h'), c('10', 's')), true);
  assert.equal(canStackTableau(c('9', 'd'), c('10', 'c')), true);
});

test('same colour never stacks, however the ranks line up', () => {
  assert.equal(canStackTableau(c('9', 'h'), c('10', 'd')), false);
  assert.equal(canStackTableau(c('9', 's'), c('10', 'c')), false);
});

test('rank must descend by exactly one', () => {
  assert.equal(canStackTableau(c('8', 'h'), c('10', 's')), false);
  assert.equal(canStackTableau(c('J', 'h'), c('10', 's')), false);
});

test('an empty column takes a King and nothing else', () => {
  assert.equal(canStackTableau(c('K', 's'), null), true);
  assert.equal(canStackTableau(c('Q', 's'), null), false);
  assert.equal(canStackTableau(c('A', 's'), null), false);
});

test('nothing stacks on a face-down card', () => {
  assert.equal(canStackTableau(c('9', 'h'), c('10', 's', false)), false);
});

// --- foundations -----------------------------------------------------------

test('foundations start at an Ace and climb one suit', () => {
  assert.equal(canStackFoundation(c('A', 's'), null), true);
  assert.equal(canStackFoundation(c('2', 's'), null), false);
  assert.equal(canStackFoundation(c('2', 's'), c('A', 's')), true);
});

test('a foundation refuses another suit', () => {
  assert.equal(canStackFoundation(c('2', 'h'), c('A', 's')), false);
});

test('a foundation refuses a rank that skips or repeats', () => {
  assert.equal(canStackFoundation(c('3', 's'), c('A', 's')), false);
  assert.equal(canStackFoundation(c('A', 's'), c('A', 's')), false);
});

test('foundationFor picks the pile that will take the card', () => {
  const foundations = [[c('A', 's')], [], [], []];
  assert.equal(foundationFor(c('2', 's'), foundations), 0);
  assert.equal(foundationFor(c('A', 'h'), foundations), 1, 'an Ace goes to the first empty pile');
  assert.equal(foundationFor(c('5', 'd'), foundations), -1);
});

// --- runs ------------------------------------------------------------------

test('an ordered alternating run moves as one', () => {
  assert.equal(isMovableRun([c('J', 's'), c('10', 'h'), c('9', 'c')]), true);
});

test('a single face-up card is a run', () => {
  assert.equal(isMovableRun([c('7', 'd')]), true);
});

test('a run broken by colour or rank does not move', () => {
  assert.equal(isMovableRun([c('J', 's'), c('10', 'c')]), false, 'same colour');
  assert.equal(isMovableRun([c('J', 's'), c('9', 'h')]), false, 'rank gap');
});

test('a run containing a face-down card never moves', () => {
  assert.equal(isMovableRun([c('J', 's', false), c('10', 'h')]), false);
});

test('an empty run is not movable', () => {
  assert.equal(isMovableRun([]), false);
  assert.equal(isMovableRun(null), false);
});

test('firstFaceUp finds the boundary, or reports none', () => {
  assert.equal(firstFaceUp([c('K', 's', false), c('Q', 's', false), c('J', 'h')]), 2);
  assert.equal(firstFaceUp([c('K', 's', false)]), -1);
  assert.equal(firstFaceUp([]), -1);
});

// --- autoplay safety -------------------------------------------------------

test('Aces and twos are always safe to send up', () => {
  assert.equal(isSafeToAutoplay(c('A', 's'), [[], [], [], []]), true);
  assert.equal(isSafeToAutoplay(c('2', 'h'), [[], [], [], []]), true);
});

test('a card is unsafe while the opposite colour still needs it', () => {
  // Playing the black 5 would strand a red 4 with nowhere to land.
  const foundations = [[c('A', 's'), c('2', 's'), c('3', 's'), c('4', 's')], [], [], []];
  assert.equal(isSafeToAutoplay(c('5', 's'), foundations), false);
});

test('a card becomes safe once both opposite foundations have caught up', () => {
  const foundations = [
    [c('A', 's'), c('2', 's'), c('3', 's'), c('4', 's')],
    [c('A', 'h'), c('2', 'h'), c('3', 'h'), c('4', 'h')],
    [c('A', 'd'), c('2', 'd'), c('3', 'd'), c('4', 'd')],
    [],
  ];
  assert.equal(isSafeToAutoplay(c('5', 's'), foundations), true);
});

// --- destinations and win --------------------------------------------------

test('destinationsFor lists both foundation and tableau landings', () => {
  const state = {
    foundations: [[c('A', 's')], [], [], []],
    tableau: [[c('3', 'h')], [], [c('K', 'c')]],
  };
  const dests = destinationsFor(state, [c('2', 's')], { zone: 'waste', index: 0 });
  assert.deepEqual(dests, [
    { zone: 'foundation', index: 0 },
    { zone: 'tableau', index: 0 },
  ]);
});

test('a run longer than one card is never offered a foundation', () => {
  const state = {
    foundations: [[c('A', 's')], [], [], []],
    tableau: [[c('3', 'h')], []],
  };
  const dests = destinationsFor(state, [c('2', 's'), c('A', 'h')], { zone: 'tableau', index: 1 });
  assert.equal(dests.some((d) => d.zone === 'foundation'), false);
});

test('a pile is never offered as a destination for its own cards', () => {
  const state = { foundations: [[], [], [], []], tableau: [[c('K', 's'), c('Q', 'h')]] };
  const dests = destinationsFor(state, [c('Q', 'h')], { zone: 'tableau', index: 0 });
  assert.deepEqual(dests, []);
});

test('shuffling a lone King between empty columns is not offered', () => {
  // Otherwise a hint would list a move that changes nothing, forever.
  const state = { foundations: [[], [], [], []], tableau: [[c('K', 's')], []] };
  const dests = destinationsFor(state, [c('K', 's')], { zone: 'tableau', index: 0 });
  assert.deepEqual(dests, []);
});

test('an unmovable run has no destinations at all', () => {
  const state = { foundations: [[], [], [], []], tableau: [[], []] };
  assert.deepEqual(destinationsFor(state, [c('K', 's'), c('Q', 'c')], null), []);
});

test('isWon requires all four foundations complete', () => {
  const full = () => Array.from({ length: 13 }, (_, i) => c(String(i), 's'));
  assert.equal(isWon({ foundations: [full(), full(), full(), full()] }), true);
  assert.equal(isWon({ foundations: [full(), full(), full(), full().slice(1)] }), false);
});
