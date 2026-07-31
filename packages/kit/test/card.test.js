import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScreen, detectCaps, glyphs } from '@clicade/tui';
import { createDeck, renderCard, renderHand, handWidth, cardLabel, isRed, SIZES } from '../src/card.js';
import { createRng } from '../src/rng.js';

function harness(cols = 40, rows = 12, env = { TERM: 'xterm-256color' }) {
  const stream = { isTTY: true, columns: cols, rows, write() {}, on() {} };
  const caps = detectCaps({ env, stream, input: { setRawMode() {} }, platform: 'linux' });
  const screen = createScreen({ stream, caps });
  screen.enter();
  screen.clear();
  return { screen, g: glyphs(caps) };
}

const lines = (screen) => screen.toText().split('\n');

test('a deck has 52 unique cards', () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((c) => c.rank + c.suit)).size, 52);
});

test('multi-deck shoes multiply correctly', () => {
  assert.equal(createDeck(6).length, 312);
});

test('suit colors', () => {
  assert.equal(isRed('h'), true);
  assert.equal(isRed('d'), true);
  assert.equal(isRed('s'), false);
  assert.equal(isRed('c'), false);
});

test('golden frame: a full face-up card', () => {
  const { screen, g } = harness();
  renderCard(screen, g, 0, 0, { rank: 'A', suit: 's' }, { shadow: false });
  assert.deepEqual(lines(screen).slice(0, 5), [
    '╭─────╮',
    '│A♠   │',
    '│  ♠  │',
    '│   A♠│',
    '╰─────╯',
  ]);
});

test('golden frame: a ten keeps its two-character rank', () => {
  const { screen, g } = harness();
  renderCard(screen, g, 0, 0, { rank: '10', suit: 'd' }, { shadow: false });
  const out = lines(screen);
  assert.equal(out[1], '│10♦  │');
  assert.equal(out[3], '│  10♦│');
});

test('golden frame: a face-down card shows a back, not a face', () => {
  const { screen, g } = harness();
  renderCard(screen, g, 0, 0, { rank: 'A', suit: 's' }, { faceUp: false, shadow: false });
  const out = lines(screen);
  assert.equal(out[1], '│▒▒▒▒▒│');
  assert.ok(!screen.toText().includes('A'), 'a face-down card must not leak its rank');
});

test('golden frame: a null card renders a back', () => {
  const { screen, g } = harness();
  renderCard(screen, g, 0, 0, null, { shadow: false });
  assert.equal(lines(screen)[2], '│▒▒▒▒▒│');
});

test('golden frame: compact size', () => {
  const { screen, g } = harness();
  renderCard(screen, g, 0, 0, { rank: 'K', suit: 'h' }, { size: 'compact', shadow: false });
  assert.deepEqual(lines(screen).slice(0, 4), ['╭───╮', '│K♥ │', '│  ♥│', '╰───╯']);
});

test('golden frame: ASCII fallback still renders a recognisable card', () => {
  const { screen, g } = harness(40, 12, { TERM: 'xterm', CLICADE_ASCII: '1' });
  renderCard(screen, g, 0, 0, { rank: 'Q', suit: 'h' }, { shadow: false });
  assert.deepEqual(lines(screen).slice(0, 5), [
    '+-----+',
    '|QH   |',
    '|  H  |',
    '|   QH|',
    '+-----+',
  ]);
});

test('mid-flip the card is an edge-on sliver with no face', () => {
  const { screen, g } = harness();
  renderCard(screen, g, 2, 0, { rank: 'A', suit: 's' }, { squash: 0.2, shadow: false });
  const text = screen.toText();
  assert.ok(!text.includes('A'), 'no rank is visible edge-on');
  assert.ok(!text.includes('╭'), 'no card face is drawn');
});

test('a squashed card stays centred on its slot', () => {
  const { screen, g } = harness();
  renderCard(screen, g, 10, 0, { rank: 'A', suit: 's' }, { squash: 0.6, shadow: false });
  const row = lines(screen)[0];
  const start = row.search(/\S/);
  const end = row.length;
  const centre = (start + end - 1) / 2;
  // Slot spans 10..16, so its centre is 13.
  assert.ok(Math.abs(centre - 13) <= 1, `flip should pivot in place, centred at ${centre}`);
});

test('a full-squash card is identical to an unsquashed one', () => {
  const a = harness();
  renderCard(a.screen, a.g, 0, 0, { rank: '7', suit: 'c' }, { squash: 1, shadow: false });
  const b = harness();
  renderCard(b.screen, b.g, 0, 0, { rank: '7', suit: 'c' }, { shadow: false });
  assert.equal(a.screen.toText(), b.screen.toText());
});

test('golden frame: a hand fans as overlapping cards', () => {
  const { screen, g } = harness(40, 12);
  const cards = [
    { rank: 'A', suit: 's' },
    { rank: '10', suit: 'h' },
    { rank: '9', suit: 'd' },
  ];
  const width = renderHand(screen, g, 0, 0, cards, { shadow: false });

  assert.equal(width, handWidth(3));
  assert.equal(width, 15, '2 spines at 4 columns plus a 7-column card');

  // Spines have no right border, so each card's left edge closes the previous
  // one and the fan reads as a continuous stack.
  assert.deepEqual(lines(screen).slice(0, 5), [
    '╭───╭───╭─────╮',
    '│A♠ │10♥│9♦   │',
    '│   │   │  ♦  │',
    '│   │   │   9♦│',
    '╰───╰───╰─────╯',
  ]);
});

test('fanning saves columns over laying cards out flat', () => {
  assert.equal(handWidth(7), 31);
  assert.ok(handWidth(7) < 7 * SIZES.full.w, 'a 7-card hand must fit an 80-column terminal');
  assert.ok(handWidth(7) <= 80, 'even a 7-card hand fits the narrowest supported terminal');
});

test('an empty hand draws nothing and takes no width', () => {
  const { screen, g } = harness();
  assert.equal(renderHand(screen, g, 0, 0, []), 0);
  assert.equal(screen.toText().trim(), '');
});

test('a face-down card in a fan hides its rank', () => {
  const { screen, g } = harness(40, 12);
  renderHand(
    screen,
    g,
    0,
    0,
    [
      { rank: 'A', suit: 's' },
      { rank: 'K', suit: 'h' },
    ],
    { faceDown: [1], shadow: false },
  );
  assert.ok(!screen.toText().includes('K'), 'the hole card must not leak');
});

test('shuffled deals are reproducible from a seed', () => {
  const deal = (seed) => createRng(seed).shuffle(createDeck()).slice(0, 5).map((c) => c.rank + c.suit);
  assert.deepEqual(deal(777), deal(777));
  assert.notDeepEqual(deal(777), deal(778));
});

test('cardLabel', () => {
  const { g } = harness();
  assert.equal(cardLabel({ rank: 'A', suit: 's' }, g), 'A♠');
  assert.equal(cardLabel(null, g), '??');
});
