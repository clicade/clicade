import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRgb, rgbTo256, rgbTo16, styleToSgr, mix } from '../src/color.js';
import { COLOR_NONE, COLOR_16, COLOR_256, COLOR_TRUE } from '../src/caps.js';
import { strWidth, truncate, pad, charWidth } from '../src/width.js';

test('hex parsing in both lengths', () => {
  assert.deepEqual(toRgb('#ff0000'), [255, 0, 0]);
  assert.deepEqual(toRgb('#f00'), [255, 0, 0]);
  assert.deepEqual(toRgb('58a6ff'), [88, 166, 255]);
  assert.deepEqual(toRgb([1, 2, 3]), [1, 2, 3]);
  assert.equal(toRgb('nonsense'), null);
  assert.equal(toRgb(null), null);
});

test('truecolor emits 24-bit parameters', () => {
  assert.equal(styleToSgr({ fg: '#ff0000' }, COLOR_TRUE), '\x1b[38;2;255;0;0m');
});

test('256-color downgrade', () => {
  const sgr = styleToSgr({ fg: '#ff0000' }, COLOR_256);
  assert.match(sgr, /^\x1b\[38;5;\d+m$/);
});

test('16-color downgrade picks the nearest basic color', () => {
  assert.equal(rgbTo16([255, 0, 0]), 9); // bright red
  assert.equal(rgbTo16([0, 0, 0]), 0);
  assert.equal(rgbTo16([255, 255, 255]), 15);
  assert.equal(styleToSgr({ fg: '#ff0000' }, COLOR_16), '\x1b[91m');
  assert.equal(styleToSgr({ bg: '#000000' }, COLOR_16), '\x1b[40m');
});

test('no-color depth drops colors but keeps attributes', () => {
  assert.equal(styleToSgr({ fg: '#ff0000' }, COLOR_NONE), '');
  assert.equal(styleToSgr({ fg: '#ff0000', bold: true }, COLOR_NONE), '\x1b[1m');
});

test('grayscale maps into the 256 ramp, not the color cube', () => {
  const idx = rgbTo256([128, 128, 128]);
  assert.ok(idx >= 232 && idx <= 255, `expected grayscale ramp, got ${idx}`);
});

test('empty style is empty output', () => {
  assert.equal(styleToSgr(null, COLOR_TRUE), '');
  assert.equal(styleToSgr({}, COLOR_TRUE), '');
});

test('mix interpolates endpoints exactly', () => {
  assert.deepEqual(mix('#000000', '#ffffff', 0), [0, 0, 0]);
  assert.deepEqual(mix('#000000', '#ffffff', 1), [255, 255, 255]);
  assert.deepEqual(mix('#000000', '#ffffff', 0.5), [128, 128, 128]);
});

test('display width', () => {
  assert.equal(strWidth('abc'), 3);
  assert.equal(strWidth('日本'), 4);
  assert.equal(charWidth('́'.codePointAt(0)), 0, 'combining marks take no cells');
  assert.equal(strWidth('\x1b'), 0, 'control chars take no cells');
});

test('truncate never splits a wide glyph', () => {
  assert.equal(truncate('日本語', 3), '日');
  assert.equal(truncate('日本語', 4), '日本');
  assert.equal(truncate('abcdef', 3), 'abc');
});

test('pad aligns to exact cell counts', () => {
  assert.equal(pad('ab', 5), 'ab   ');
  assert.equal(pad('ab', 5, 'right'), '   ab');
  assert.equal(pad('ab', 6, 'center'), '  ab  ');
  assert.equal(pad('abcdef', 3), 'abc');
});
