/**
 * Vertical piles — the solitaire tableau.
 *
 * The packing is the whole risk here: a tableau pile can grow past any
 * terminal, and the card that must never fall off the bottom is the only one
 * you can actually play.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScreen, glyphs } from '@clicade/tui';
import { pileOffsets, renderPile, SIZES } from '../src/card.js';

const CAPS = { colorDepth: 0, unicode: true, altScreen: false, isTTY: true, cols: 40, rows: 40 };
const G = glyphs(CAPS);
const H = SIZES.full.h;

const up = (rank = 'A', suit = 's') => ({ rank, suit, faceUp: true });
const down = (rank = 'A', suit = 's') => ({ rank, suit, faceUp: false });

function screen(cols = 40, rows = 40) {
  const s = createScreen({ caps: CAPS, stream: { write: () => {}, columns: cols, rows } });
  s.enter();
  return s;
}

test('an empty pile occupies one card of space', () => {
  const { offsets, height } = pileOffsets([]);
  assert.deepEqual(offsets, []);
  assert.equal(height, H);
});

test('a single card sits at the top and is exactly one card tall', () => {
  const { offsets, height } = pileOffsets([up()]);
  assert.deepEqual(offsets, [0]);
  assert.equal(height, H);
});

test('face-up cards take two rows and face-down cards take one', () => {
  const { offsets } = pileOffsets([down(), down(), up(), up()]);
  assert.deepEqual(offsets, [0, 1, 2, 4]);
});

test('height reaches past the last offset by a full card', () => {
  const cards = [down(), up(), up()];
  const { offsets, height } = pileOffsets(cards);
  assert.equal(height, offsets[offsets.length - 1] + H);
});

test('steps are configurable', () => {
  const { offsets } = pileOffsets([down(), up(), up()], { stepDown: 2, stepUp: 3 });
  assert.deepEqual(offsets, [0, 2, 5]);
});

test('a pile that fits is left alone', () => {
  const cards = [down(), up(), up()];
  const { compressed, offsets } = pileOffsets(cards, { maxHeight: 40 });
  assert.equal(compressed, false);
  assert.deepEqual(offsets, [0, 1, 3]);
});

test('a pile too tall for the space is compressed to fit', () => {
  const cards = Array.from({ length: 14 }, () => up());
  const { offsets, height, compressed } = pileOffsets(cards, { maxHeight: 20 });

  assert.equal(compressed, true);
  assert.ok(height <= 20, `compressed pile is still ${height} rows`);
  assert.equal(offsets[0], 0);
});

test('compression keeps every card on a distinct row', () => {
  const cards = Array.from({ length: 24 }, () => up());
  const { offsets } = pileOffsets(cards, { maxHeight: 12 });
  assert.equal(new Set(offsets).size, offsets.length, 'cards must not collapse onto one row');
  for (let i = 1; i < offsets.length; i++) {
    assert.ok(offsets[i] > offsets[i - 1], 'order must stay monotonic');
  }
});

test('a pile longer than the space allows still never overlaps itself', () => {
  // Beyond this the pile genuinely cannot fit, and one row per card is the
  // floor — better to run past the edge than to stack cards on each other.
  const cards = Array.from({ length: 40 }, () => up());
  const { offsets } = pileOffsets(cards, { maxHeight: 10 });
  assert.deepEqual(offsets.slice(0, 3), [0, 1, 2]);
});

test('a single card is never compressed, whatever the space', () => {
  const { compressed, offsets } = pileOffsets([up()], { maxHeight: 1 });
  assert.equal(compressed, false);
  assert.deepEqual(offsets, [0]);
});

// --- drawing ---------------------------------------------------------------

test('renderPile reports where it put every card', () => {
  const s = screen();
  const cards = [down(), down(), up('K', 'h')];
  const { offsets } = renderPile(s, G, 0, 0, cards, {});
  assert.deepEqual(offsets, [0, 1, 2]);
});

test('a covered face-down card shows its back, not a bare outline', () => {
  const s = screen();
  renderPile(s, G, 0, 0, [down(), up('K', 'h')], {});
  const first = s.toText().split('\n')[0];
  assert.match(first, /▒/, 'an empty slot draws the same border — the pattern is the difference');
});

test('the bottom card of a pile is drawn in full', () => {
  const s = screen();
  renderPile(s, G, 0, 0, [down(), down(), up('K', 'h')], {});
  assert.match(s.toText(), /K♥/);
});

test('held cards are drawn offset so the lift shows without colour', () => {
  const plain = screen();
  renderPile(plain, G, 0, 0, [down(), up('K', 'h')], {});

  const held = screen();
  renderPile(held, G, 0, 0, [down(), up('K', 'h')], { selectedFrom: 1 });

  assert.notEqual(plain.toText(), held.toText());
});

test('an empty pile draws nothing at all', () => {
  const s = screen();
  renderPile(s, G, 0, 0, [], {});
  assert.equal(s.toText().trim(), '');
});
