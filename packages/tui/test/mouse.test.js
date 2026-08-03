import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { parseMouse, parseInput, parseKeys, mouseOn, MOUSE_OFF, createInput } from '../src/index.js';

const CAPS = { rawInput: true, mouse: true };

function fakeStdin() {
  const stream = new EventEmitter();
  stream.isTTY = true;
  stream.resume = () => {};
  stream.pause = () => {};
  stream.setEncoding = () => {};
  stream.setRawMode = () => {};
  stream.off = stream.removeListener;
  return stream;
}

function harness(caps = CAPS) {
  const written = [];
  const stdin = fakeStdin();
  const input = createInput({ caps, input: stdin, output: { write: (s) => written.push(s) } });
  return { input, stdin, written, out: () => written.join('') };
}

// --- decoding --------------------------------------------------------------

test('a press decodes to a button and a zero-based cell', () => {
  // Terminals count from one. Everything else in this engine counts from zero,
  // and an off-by-one here puts every click one cell down and right.
  const event = parseMouse('0', '12', '4', 'M');
  assert.equal(event.type, 'down');
  assert.equal(event.button, 'left');
  assert.deepEqual([event.x, event.y], [11, 3]);
});

test('a release is a release, not another press', () => {
  assert.equal(parseMouse('0', '12', '4', 'm').type, 'up');
});

test('the middle and right buttons are told apart', () => {
  assert.equal(parseMouse('1', '1', '1', 'M').button, 'middle');
  assert.equal(parseMouse('2', '1', '1', 'M').button, 'right');
});

test('modifiers ride along with the click', () => {
  const event = parseMouse(String(0 + 4 + 8 + 16), '1', '1', 'M');
  assert.deepEqual(
    { shift: event.shift, alt: event.alt, ctrl: event.ctrl },
    { shift: true, alt: true, ctrl: true },
  );
});

test('motion is a move, never a click', () => {
  // Hover reports arrive with the motion bit set and a button in the low bits.
  // Treating one as a press would fire a button by pointing at it.
  const event = parseMouse('32', '5', '5', 'M');
  assert.equal(event.type, 'move');
});

test('the wheel is a wheel, not a click on whatever is underneath', () => {
  const up = parseMouse('64', '5', '5', 'M');
  const down = parseMouse('65', '5', '5', 'M');
  assert.equal(up.type, 'wheel');
  assert.equal(up.wheel, -1);
  assert.equal(down.wheel, 1);
  assert.equal(up.button, null);
});

test('a column past 223 survives, which the legacy encoding could not', () => {
  // The whole reason for SGR mode: X10 packs a coordinate into one byte.
  assert.equal(parseMouse('0', '400', '5', 'M').x, 399);
});

test('nonsense decodes to nothing rather than a click at NaN', () => {
  assert.equal(parseMouse('x', '1', '1', 'M'), null);
});

// --- keeping mouse reports out of the keyboard -----------------------------

test('a mouse report never becomes keystrokes', () => {
  // Before mouse parsing existed, `ESC [ < 0 ; 12 ; 4 M` did not match the CSI
  // pattern because of the `<`, fell through to "escape plus a char is alt",
  // and sprayed alt+[ < 0 ; 1 2 4 M as keys. A stray click played a card.
  const { keys, mouse } = parseInput('\x1b[<0;12;4M');
  assert.deepEqual(keys, []);
  assert.equal(mouse.length, 1);
});

test('the legacy encoding is swallowed rather than typed', () => {
  // We never ask for it, but a terminal that ignores the SGR request may send
  // it anyway, and three junk keys is worse than nothing.
  assert.deepEqual(parseInput('\x1b[M\x20\x30\x30').keys, []);
});

test('keys and clicks in one chunk are both recovered, in order', () => {
  const { keys, mouse } = parseInput('a\x1b[<0;3;3Mb');
  assert.deepEqual(keys.map((k) => k.name), ['a', 'b']);
  assert.equal(mouse.length, 1);
});

test('ordinary key parsing is untouched', () => {
  assert.deepEqual(parseKeys('a\x1b[Ab\r').map((k) => k.name), ['a', 'up', 'b', 'enter']);
});

// --- turning it on and off -------------------------------------------------

test('enabling asks for SGR encoding, not just click reporting', () => {
  assert.match(mouseOn(), /\x1b\[\?1006h/, 'without 1006 the coordinates are byte-packed');
  assert.match(mouseOn(), /\x1b\[\?1000h/);
});

test('hover is opt-in, because it costs an event per cell moved', () => {
  assert.match(mouseOn(true), /\x1b\[\?1003h/);
  assert.doesNotMatch(mouseOn(false), /\x1b\[\?1003h/);
});

test('stopping always disables reporting', () => {
  // A terminal left reporting prints coordinates into the shell on every mouse
  // move. That looks like the shell itself is broken.
  const { input, written } = harness();
  input.start();
  input.setMouse(true);
  written.length = 0;
  input.stop();
  assert.equal(written.join(''), MOUSE_OFF);
});

test('the disable sequence turns off modes we never turned on', () => {
  // Belt and braces for a previous run that died without cleaning up.
  for (const mode of ['1000', '1002', '1003', '1006', '1015']) {
    assert.ok(MOUSE_OFF.includes(`?${mode}l`), `${mode} is left on`);
  }
});

test('a terminal that cannot report mouse is never asked to', () => {
  const { input, out } = harness({ rawInput: true, mouse: false });
  input.start();
  assert.equal(input.setMouse(true), false);
  assert.equal(out(), '', 'sequences were written to a terminal that cannot use them');
});

test('enabling twice writes the sequence once', () => {
  const { input, written } = harness();
  input.start();
  input.setMouse(true);
  const after = written.length;
  input.setMouse(true);
  assert.equal(written.length, after);
});

// --- delivery --------------------------------------------------------------

test('clicks reach a handler once reporting is on', () => {
  const { input, stdin } = harness();
  const seen = [];
  input.onMouse((e) => seen.push(e));
  input.start();
  input.setMouse(true);

  stdin.emit('data', '\x1b[<0;4;2M');
  assert.equal(seen.length, 1);
  assert.deepEqual([seen[0].x, seen[0].y], [3, 1]);
});

test('reports arriving after it is switched off are dropped', () => {
  // Terminals keep sending for a moment after being told to stop. Delivering
  // those would fire a button the player has already opted out of.
  const { input, stdin } = harness();
  const seen = [];
  input.onMouse((e) => seen.push(e));
  input.start();
  input.setMouse(true);
  input.setMouse(false);

  stdin.emit('data', '\x1b[<0;4;2M');
  assert.equal(seen.length, 0);
});

test('a click does not also arrive as a keypress', () => {
  const { input, stdin } = harness();
  const keys = [];
  input.onKey((k) => keys.push(k));
  input.start();
  input.setMouse(true);

  stdin.emit('data', '\x1b[<0;4;2M');
  assert.deepEqual(keys, []);
});
