import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKeys } from '../src/input.js';

const one = (s) => {
  const keys = parseKeys(s);
  assert.equal(keys.length, 1, `expected 1 key from ${JSON.stringify(s)}, got ${keys.length}`);
  return keys[0];
};

test('printable characters', () => {
  assert.equal(one('a').name, 'a');
  assert.equal(one('7').name, '7');
  const upper = one('A');
  assert.equal(upper.name, 'a');
  assert.equal(upper.shift, true);
});

test('control characters', () => {
  assert.equal(one('\r').name, 'enter');
  assert.equal(one('\n').name, 'enter');
  assert.equal(one('\t').name, 'tab');
  assert.equal(one(' ').name, 'space');
  assert.equal(one('\x7f').name, 'backspace');
});

test('ctrl combinations', () => {
  const c = one('\x03');
  assert.equal(c.name, 'c');
  assert.equal(c.ctrl, true);
  const z = one('\x1a');
  assert.equal(z.name, 'z');
  assert.equal(z.ctrl, true);
});

test('arrow keys', () => {
  assert.equal(one('\x1b[A').name, 'up');
  assert.equal(one('\x1b[B').name, 'down');
  assert.equal(one('\x1b[C').name, 'right');
  assert.equal(one('\x1b[D').name, 'left');
});

test('navigation keys via tilde sequences', () => {
  assert.equal(one('\x1b[5~').name, 'pageup');
  assert.equal(one('\x1b[6~').name, 'pagedown');
  assert.equal(one('\x1b[3~').name, 'delete');
});

test('modified arrows decode xterm modifier params', () => {
  const shiftUp = one('\x1b[1;2A');
  assert.equal(shiftUp.name, 'up');
  assert.equal(shiftUp.shift, true);

  const ctrlRight = one('\x1b[1;5C');
  assert.equal(ctrlRight.name, 'right');
  assert.equal(ctrlRight.ctrl, true);
});

test('function keys in both encodings', () => {
  assert.equal(one('\x1bOP').name, 'f1');
  assert.equal(one('\x1b[15~').name, 'f5');
});

test('bare escape', () => {
  assert.equal(one('\x1b').name, 'escape');
});

test('alt+key', () => {
  const k = one('\x1bx');
  assert.equal(k.name, 'x');
  assert.equal(k.alt, true);
});

test('a paste-sized chunk yields every key in order', () => {
  const keys = parseKeys('hi\x1b[Az');
  assert.deepEqual(
    keys.map((k) => k.name),
    ['h', 'i', 'up', 'z'],
  );
});

test('astral code points stay whole', () => {
  const keys = parseKeys('\u{1F600}');
  assert.equal(keys.length, 1);
  assert.equal(keys[0].sequence, '\u{1F600}');
});
