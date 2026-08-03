import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScreen, createStage, glyphs } from '@clicade/tui';
import { createButtons, drawRow, buttonWidth, rowWidth, getTheme } from '../src/index.js';

const CAPS = (unicode = true) => ({
  colorDepth: 0,
  unicode,
  altScreen: false,
  isTTY: true,
  cols: 80,
  rows: 24,
});

function surface(unicode = true) {
  const caps = CAPS(unicode);
  const screen = createScreen({ caps, stream: { write: () => {}, columns: 80, rows: 24 } });
  screen.enter();
  const stage = createStage({ screen, fill: true, minWidth: 40, minHeight: 10 });
  stage.measure();
  return { screen, stage, g: glyphs(caps) };
}

const ITEMS = [
  { id: 'h', key: 'h', label: 'hit' },
  { id: 's', key: 's', label: 'stand' },
  { id: 'd', key: 'd', label: 'double', enabled: false },
];

function drawn(opts = {}) {
  const { screen, stage, g } = surface(opts.unicode);
  const buttons = createButtons();
  drawRow(stage, g, buttons, 2, 2, opts.items ?? ITEMS, { theme: getTheme('noir'), ...opts });
  return { buttons, text: screen.toText(), stage, g };
}

const click = (buttons, region, at = {}) => {
  const x = at.x ?? region.x + 1;
  const y = at.y ?? region.y + 1;
  buttons.handle({ type: 'down', button: 'left', x, y });
  return buttons.handle({ type: 'up', button: 'left', x, y });
};

// --- the region comes from the drawing -------------------------------------

test('a button is clickable exactly where it was drawn', () => {
  // The failure this guards against: drawn in one place, clickable in another.
  // Recording the region from the same numbers that drew it is the only way to
  // keep those from drifting.
  const { buttons, text } = drawn();
  const region = buttons.regions.find((r) => r.id === 's');
  const row = text.split('\n')[region.y + 1];

  assert.ok(row.slice(region.x, region.x + region.w).includes('stand'));
  assert.equal(buttons.at(region.x, region.y)?.id, 's');
  assert.equal(buttons.at(region.x + region.w - 1, region.y + region.h - 1)?.id, 's');
});

test('just outside a button is not the button', () => {
  const { buttons } = drawn();
  const region = buttons.regions.find((r) => r.id === 'h');
  assert.equal(buttons.at(region.x - 1, region.y), null);
  assert.equal(buttons.at(region.x, region.y - 1), null);
  assert.equal(buttons.at(region.x + region.w, region.y), null);
  assert.equal(buttons.at(region.x, region.y + region.h), null);
});

test('redrawing forgets where a button used to be', () => {
  // Split stops being offered the moment the hand is no longer a pair. If the
  // old region lingered, the empty space would still deal a card.
  const { stage, g } = surface();
  const buttons = createButtons();
  drawRow(stage, g, buttons, 2, 2, ITEMS, { theme: getTheme('noir') });
  assert.ok(buttons.at(3, 3));

  buttons.clear();
  drawRow(stage, g, buttons, 2, 2, [ITEMS[0]], { theme: getTheme('noir') });
  const ids = buttons.regions.map((r) => r.id);
  assert.deepEqual(ids, ['h'], 'stale regions survived a redraw');
});

// --- click semantics -------------------------------------------------------

test('press and release on the same button is a click', () => {
  const { buttons } = drawn();
  assert.equal(click(buttons, buttons.regions[0]), 'h');
});

test('pressing one button and releasing on another does nothing', () => {
  // Every other interface behaves this way, and it is what lets a misclick be
  // taken back by moving away before letting go.
  const { buttons } = drawn();
  const [first, second] = buttons.regions;
  buttons.handle({ type: 'down', button: 'left', x: first.x + 1, y: first.y + 1 });
  assert.equal(buttons.handle({ type: 'up', button: 'left', x: second.x + 1, y: second.y + 1 }), null);
});

test('releasing without a press does nothing', () => {
  const { buttons } = drawn();
  const region = buttons.regions[0];
  assert.equal(buttons.handle({ type: 'up', button: 'left', x: region.x + 1, y: region.y + 1 }), null);
});

test('a disabled button cannot be clicked', () => {
  const { buttons } = drawn();
  const disabled = buttons.regions.find((r) => r.id === 'd');
  assert.equal(disabled.enabled, false);
  assert.equal(click(buttons, disabled), null);
});

test('a press is only a press, so nothing fires on the way down', () => {
  const { buttons } = drawn();
  const region = buttons.regions[0];
  assert.equal(buttons.handle({ type: 'down', button: 'left', x: region.x + 1, y: region.y + 1 }), null);
});

test('the right button does not activate anything', () => {
  const { buttons } = drawn();
  const region = buttons.regions[0];
  buttons.handle({ type: 'down', button: 'right', x: region.x + 1, y: region.y + 1 });
  assert.equal(buttons.handle({ type: 'up', button: 'right', x: region.x + 1, y: region.y + 1 }), null);
});

test('a click in empty space is not a click on anything', () => {
  const { buttons } = drawn();
  buttons.handle({ type: 'down', button: 'left', x: 70, y: 20 });
  assert.equal(buttons.handle({ type: 'up', button: 'left', x: 70, y: 20 }), null);
});

// --- hover -----------------------------------------------------------------

test('hovering marks a button without activating it', () => {
  const { buttons } = drawn();
  const region = buttons.regions[1];
  assert.equal(buttons.handle({ type: 'move', x: region.x + 1, y: region.y + 1 }), null);
  assert.equal(buttons.hovered, 's');
});

test('hovering a disabled button marks nothing', () => {
  const { buttons } = drawn();
  const region = buttons.regions.find((r) => r.id === 'd');
  buttons.handle({ type: 'move', x: region.x + 1, y: region.y + 1 });
  assert.equal(buttons.hovered, null);
});

test('moving off clears the mark', () => {
  const { buttons } = drawn();
  buttons.handle({ type: 'move', x: buttons.regions[0].x + 1, y: buttons.regions[0].y + 1 });
  buttons.handle({ type: 'move', x: 70, y: 20 });
  assert.equal(buttons.hovered, null);
});

// --- how it looks ----------------------------------------------------------

test('the key is on the face, so the keyboard is never a secret', () => {
  // The mouse is an addition. A player who cannot see the key has been given a
  // worse game, not a better one.
  const { text } = drawn();
  assert.match(text, /h hit/);
  assert.match(text, /s stand/);
});

test('a hovered button changes shape, not only colour', () => {
  // Rendered at colorDepth 0, so anything carried by an accent colour is
  // simply absent — which is what a monochrome player sees.
  const { screen, stage, g } = surface();
  const buttons = createButtons();
  const draw = () => {
    buttons.clear();
    drawRow(stage, g, buttons, 2, 2, ITEMS, { theme: getTheme('noir') });
    return screen.toText();
  };

  const plain = draw();
  buttons.handle({ type: 'move', x: 3, y: 3 });
  assert.equal(buttons.hovered, 'h', 'the hover did not land on a button');
  assert.notEqual(plain, draw(), 'hover is invisible without colour');
});

test('buttons draw with nothing an ASCII terminal cannot render', () => {
  const bad = [...drawn({ unicode: false }).text].find((ch) => ch.codePointAt(0) > 0x7f);
  assert.equal(bad, undefined, `leaked ${JSON.stringify(bad)}`);
});

test('a flat row is one tall and still clickable', () => {
  // A 24-row terminal has no spare rows for borders, and losing the mouse
  // there would mean losing it on the commonest size there is.
  const { buttons } = drawn({ style: 'flat' });
  const region = buttons.regions[0];
  assert.equal(region.h, 1);
  assert.equal(click(buttons, region, { y: region.y }), 'h');
});

// --- measuring -------------------------------------------------------------

test('a row measures what it actually draws', () => {
  const { buttons } = drawn();
  const last = buttons.regions[buttons.regions.length - 1];
  const measured = rowWidth(ITEMS, { gap: 1 });
  assert.equal(last.x + last.w - buttons.regions[0].x, measured);
});

test('a flat button is narrower than a boxed one by its border', () => {
  const item = { id: 'h', key: 'h', label: 'hit' };
  assert.equal(buttonWidth(item, 'boxed') - buttonWidth(item, 'flat'), 4);
});
