import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectCaps, unplayableReason, COLOR_NONE, COLOR_16, COLOR_256, COLOR_TRUE } from '../src/caps.js';

const tty = { isTTY: true, columns: 100, rows: 30 };
const pipe = { isTTY: false };
const rawIn = { setRawMode() {} };

function caps(env, stream = tty, platform = 'linux') {
  return detectCaps({ env, stream, input: rawIn, platform });
}

test('NO_COLOR wins over every other signal', () => {
  const c = caps({ NO_COLOR: '1', COLORTERM: 'truecolor', FORCE_COLOR: '3' });
  assert.equal(c.colorDepth, COLOR_NONE);
});

test('empty NO_COLOR is ignored, per the spec', () => {
  const c = caps({ NO_COLOR: '', COLORTERM: 'truecolor' });
  assert.equal(c.colorDepth, COLOR_TRUE);
});

test('FORCE_COLOR pins each depth', () => {
  assert.equal(caps({ FORCE_COLOR: '0' }).colorDepth, COLOR_NONE);
  assert.equal(caps({ FORCE_COLOR: '1' }).colorDepth, COLOR_16);
  assert.equal(caps({ FORCE_COLOR: '2' }).colorDepth, COLOR_256);
  assert.equal(caps({ FORCE_COLOR: '3' }).colorDepth, COLOR_TRUE);
});

test('non-tty gets no color regardless of TERM', () => {
  assert.equal(caps({ COLORTERM: 'truecolor', TERM: 'xterm-256color' }, pipe).colorDepth, COLOR_NONE);
});

test('TERM=dumb disables color and alt screen', () => {
  const c = caps({ TERM: 'dumb' });
  assert.equal(c.colorDepth, COLOR_NONE);
  assert.equal(c.altScreen, false);
});

test('256-color TERM detected', () => {
  assert.equal(caps({ TERM: 'xterm-256color' }).colorDepth, COLOR_256);
  assert.equal(caps({ TERM: 'screen-256color' }).colorDepth, COLOR_256);
});

test('plain xterm falls back to 16 colors', () => {
  assert.equal(caps({ TERM: 'xterm' }).colorDepth, COLOR_16);
});

test('Windows Terminal gets truecolor even with TERM unset', () => {
  const c = caps({ WT_SESSION: 'abc' }, tty, 'win32');
  assert.equal(c.colorDepth, COLOR_TRUE);
  assert.equal(c.unicode, true);
});

test('legacy Windows console degrades to 16 colors and ASCII', () => {
  const c = caps({}, tty, 'win32');
  assert.equal(c.colorDepth, COLOR_16);
  assert.equal(c.unicode, false);
});

test('CLICADE_ASCII forces the ASCII floor on a capable terminal', () => {
  const c = caps({ COLORTERM: 'truecolor', CLICADE_ASCII: '1' });
  assert.equal(c.unicode, false);
  assert.equal(c.colorDepth, COLOR_TRUE);
});

test('non-UTF8 locale disables unicode', () => {
  assert.equal(caps({ TERM: 'xterm', LANG: 'en_US.ISO-8859-1' }).unicode, false);
  assert.equal(caps({ TERM: 'xterm', LANG: 'en_US.UTF-8' }).unicode, true);
});

test('linux virtual console disables unicode', () => {
  assert.equal(caps({ TERM: 'linux' }).unicode, false);
});

test('pipes are reported unplayable rather than hanging', () => {
  const c = detectCaps({ env: {}, stream: pipe, input: rawIn, platform: 'linux' });
  assert.match(unplayableReason(c), /interactive terminal/);
});

test('a terminal without setRawMode is unplayable', () => {
  const c = detectCaps({ env: {}, stream: tty, input: {}, platform: 'linux' });
  assert.match(unplayableReason(c), /raw keyboard input/);
});

test('a normal terminal is playable', () => {
  assert.equal(unplayableReason(caps({ TERM: 'xterm-256color' })), null);
});
