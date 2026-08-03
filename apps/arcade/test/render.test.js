import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScreen, createStage, glyphs } from '@clicade/tui';
import { getTheme } from '@clicade/kit';
import { createMenu } from '../src/menu.js';
import { CATALOG } from '../src/catalog.js';
import { render, wrap, layout, MIN_W, MIN_H } from '../src/render.js';

function frame(cols, rows, { index = 0, unicode = true } = {}) {
  const caps = { colorDepth: 0, unicode, altScreen: false, isTTY: true, cols, rows };
  const screen = createScreen({ caps, stream: { write: () => {}, columns: cols, rows } });
  screen.enter();

  const stage = createStage({ screen, fill: true, minWidth: MIN_W, minHeight: MIN_H });
  stage.measure();

  const menu = createMenu(CATALOG, index);
  // The menu animates in, so a single frame at t=0 is a blank screen. These
  // tests are about the settled layout; the entrance itself is covered in
  // screens.test.js.
  for (let i = 0; i < 200; i++) menu.update(1 / 60);

  const g = glyphs(caps);
  render(stage, g, menu, getTheme('noir'), { colorAvailable: true, mono: false, glyphs: g });
  return screen.toText();
}

test('the menu draws at the smallest supported window', () => {
  const text = frame(MIN_W, MIN_H);
  assert.match(text, /C L I C A D E/);
  assert.match(text, /Blackjack/);
  assert.match(text, /enter play/);
});

test('nothing overflows the smallest window', () => {
  for (const line of frame(MIN_W, MIN_H).split('\n')) {
    assert.ok(line.length <= MIN_W, `line ${line.length} wide in a ${MIN_W} window: ${line}`);
  }
});

test('an ASCII terminal gets no box-drawing or arrow characters', () => {
  const text = frame(MIN_W, MIN_H, { unicode: false });
  const exotic = [...text].find((ch) => ch.codePointAt(0) > 0x7f);
  assert.equal(exotic, undefined, `non-ASCII character ${JSON.stringify(exotic)} leaked through`);
  assert.match(text, /\^v choose/, 'navigation hint falls back to ^v');
});

test('the panel follows the selection', () => {
  assert.match(frame(90, 28, { index: 0 }), /Beat the dealer/);
  assert.match(frame(90, 28, { index: 1 }), /Klondike/);
});

test('unbuilt games are labelled rather than hidden', () => {
  // Derived, not hardcoded: this pointed at a fixed row and started failing the
  // moment the game on that row shipped.
  const index = CATALOG.findIndex((entry) => !entry.start);
  assert.ok(index >= 0, 'the catalog needs an unbuilt entry for this to mean anything');

  const text = frame(90, 28, { index });
  assert.match(text, /soon/);
  assert.match(text, /not built yet/);
});

test('playable games are never labelled soon', () => {
  const index = CATALOG.findIndex((entry) => entry.start);
  assert.match(frame(90, 28, { index }), /ready/);
});

test('layout keeps the footer inside the window at every size', () => {
  for (let h = MIN_H; h <= 80; h++) {
    const L = layout(MIN_W, h, 'normal');
    assert.ok(L.hintY < h, `hint row ${L.hintY} outside a ${h}-row window`);
    assert.ok(L.controlsY > L.by, 'footer must sit below the block');
  }
});

test('a very wide terminal does not stretch the content', () => {
  const wide = frame(200, 40);
  const narrow = frame(90, 40);
  const rule = (text) => text.split('\n').find((line) => line.includes('───'))?.trim().length;
  assert.equal(rule(wide), rule(narrow), 'the block is a fixed width, only the margins grow');
});

test('wrap breaks on words and never loses one', () => {
  const lines = wrap('the quick brown fox jumps', 11);
  assert.deepEqual(lines, ['the quick', 'brown fox', 'jumps']);
  assert.equal(lines.join(' ').split(' ').length, 5);
});

test('wrap leaves an over-long word alone rather than splitting it', () => {
  assert.deepEqual(wrap('supercalifragilistic', 5), ['supercalifragilistic']);
});

test('wrap on empty input returns nothing to draw', () => {
  assert.deepEqual(wrap('', 10), []);
  assert.deepEqual(wrap('   ', 10), []);
});
