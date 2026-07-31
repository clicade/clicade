import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScreen } from '../src/screen.js';
import { detectCaps } from '../src/caps.js';
import { box, glyphs } from '../src/layout.js';

/** Collects writes instead of touching a real terminal. */
function fakeStream(columns = 40, rows = 10) {
  return {
    isTTY: true,
    columns,
    rows,
    written: [],
    write(s) {
      this.written.push(s);
      return true;
    },
    on() {},
  };
}

function harness(columns = 40, rows = 10, env = { TERM: 'xterm-256color' }) {
  const stream = fakeStream(columns, rows);
  const caps = detectCaps({ env, stream, input: { setRawMode() {} }, platform: 'linux' });
  const screen = createScreen({ stream, caps });
  return { stream, screen, caps };
}

test('enter and exit restore the terminal', () => {
  const { stream, screen } = harness();
  screen.enter();
  const entered = stream.written.join('');
  assert.ok(entered.includes('\x1b[?1049h'), 'enters alt screen');
  assert.ok(entered.includes('\x1b[?25l'), 'hides cursor');

  stream.written.length = 0;
  screen.exit();
  const exited = stream.written.join('');
  assert.ok(exited.includes('\x1b[?25h'), 'shows cursor');
  assert.ok(exited.includes('\x1b[?1049l'), 'leaves alt screen');
});

test('exit is idempotent', () => {
  const { stream, screen } = harness();
  screen.enter();
  screen.exit();
  stream.written.length = 0;
  screen.exit();
  assert.equal(stream.written.length, 0);
});

test('flush writes nothing when nothing changed', () => {
  const { stream, screen } = harness();
  screen.enter();
  screen.clear();
  screen.put(2, 2, 'hello');
  screen.flush();

  stream.written.length = 0;
  screen.clear();
  screen.put(2, 2, 'hello');
  const out = screen.flush();
  assert.equal(out, '', 'identical frame produces no output');
  assert.equal(stream.written.length, 0);
});

test('flush emits only the changed run', () => {
  const { screen } = harness();
  screen.enter();
  screen.clear();
  screen.put(0, 0, 'aaaaa');
  screen.flush();

  screen.clear();
  screen.put(0, 0, 'aaXaa');
  const out = screen.flush();

  assert.ok(out.includes('X'), 'contains the changed cell');
  assert.ok(!out.includes('aaXaa'), 'does not repaint the whole string');
  // Cursor addressed to row 1, column 3 (1-indexed).
  assert.ok(out.includes('\x1b[1;3H'), `expected a cursor jump to the diff, got ${JSON.stringify(out)}`);
});

test('text is clipped at the right edge instead of wrapping', () => {
  const { screen } = harness(10, 4);
  screen.enter();
  screen.clear();
  screen.put(6, 1, 'abcdefghij');
  const lines = screen.toText().split('\n');
  assert.equal(lines[1], '      abcd');
  assert.equal(lines[2] ?? '', '', 'nothing bled onto the next row');
});

test('negative x clips the left side', () => {
  const { screen } = harness(10, 3);
  screen.enter();
  screen.clear();
  screen.put(-2, 0, 'abcdef');
  assert.equal(screen.toText().split('\n')[0], 'cdef');
});

test('out-of-range rows are dropped silently', () => {
  const { screen } = harness(10, 3);
  screen.enter();
  screen.clear();
  screen.put(0, 99, 'nope');
  screen.put(0, -1, 'nope');
  assert.equal(screen.toText().trim(), '');
});

test('golden frame: a labelled box renders identically every time', () => {
  const { screen, caps } = harness(20, 6);
  const g = glyphs(caps);
  screen.enter();
  screen.clear();
  box(screen, g, 0, 0, 12, 4, { fg: '#ffffff' });
  screen.put(2, 1, 'hi');

  assert.equal(
    screen.toText(),
    ['┌──────────┐', '│ hi       │', '│          │', '└──────────┘'].join('\n'),
  );
});

test('ASCII fallback renders the same layout without unicode', () => {
  const { screen, caps } = harness(20, 6, { TERM: 'xterm', CLICADE_ASCII: '1' });
  const g = glyphs(caps);
  screen.enter();
  screen.clear();
  box(screen, g, 0, 0, 12, 4, { fg: '#ffffff' });

  assert.equal(
    screen.toText(),
    ['+----------+', '|          |', '|          |', '+----------+'].join('\n'),
  );
});

test('wide glyphs occupy two cells and do not corrupt the row', () => {
  const { screen } = harness(10, 3);
  screen.enter();
  screen.clear();
  screen.put(0, 0, '日本語');
  screen.put(6, 0, 'ok');
  assert.equal(screen.toText().split('\n')[0], '日本語ok');
});

test('resize reallocates and forces a full repaint', () => {
  const { stream, screen } = harness(20, 5);
  screen.enter();
  screen.clear();
  screen.put(0, 0, 'x');
  screen.flush();

  stream.columns = 30;
  stream.rows = 8;
  screen.resize();
  assert.equal(screen.cols, 30);
  assert.equal(screen.rows, 8);

  screen.clear();
  screen.put(0, 0, 'x');
  assert.notEqual(screen.flush(), '', 'repaints everything after a resize');
});

test('no color depth emits no SGR color parameters', () => {
  const { screen } = harness(20, 3, { NO_COLOR: '1', TERM: 'xterm-256color' });
  screen.enter();
  screen.clear();
  screen.put(0, 0, 'hi', { fg: '#ff0000', bg: '#00ff00' });
  const out = screen.flush();
  assert.ok(!out.includes('38;'), 'no foreground color');
  assert.ok(!out.includes('48;'), 'no background color');
});
