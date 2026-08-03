/**
 * App lifecycle, exercised without a terminal.
 *
 * The launcher runs many apps in one process, so the things that only matter
 * once — process listeners, whether quit ends the world — become the things
 * that matter most.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createApp } from '../src/app.js';

function fakeCaps(over = {}) {
  return {
    isTTY: true,
    colorDepth: 0,
    noColor: false,
    unicode: true,
    altScreen: false,
    rawInput: true,
    mouse: false,
    cols: 80,
    rows: 24,
    platform: 'test',
    ...over,
  };
}

/** A stdin stand-in that can push keypresses on demand. */
function fakeStdin() {
  const stream = new EventEmitter();
  stream.isTTY = false;
  stream.resume = () => {};
  stream.pause = () => {};
  stream.setEncoding = () => {};
  stream.setRawMode = () => {};
  stream.off = stream.removeListener;
  stream.press = (seq) => stream.emit('data', seq);
  return stream;
}

function harness(opts = {}) {
  const written = [];
  return {
    written,
    stdin: opts.stdin ?? fakeStdin(),
    stream: { write: (s) => written.push(s), columns: 80, rows: 24 },
  };
}

const noPrefs = { mono: null, theme: null };
const noArgs = { mono: null, theme: null, help: false, rest: [] };

test('an embedded app resolves instead of ending the process', async () => {
  const h = harness();
  const app = createApp({
    caps: fakeCaps(),
    args: noArgs,
    prefs: noPrefs,
    standalone: false,
    stream: h.stream,
    stdin: h.stdin,
    setup: (ctx) => setImmediate(() => ctx.quit(0, 'done')),
  });

  const result = await app.run();
  assert.deepEqual(result, { code: 0, reason: 'done' });
});

test('the quit reason travels back to the caller', async () => {
  const h = harness();
  const app = createApp({
    caps: fakeCaps(),
    args: noArgs,
    prefs: noPrefs,
    standalone: false,
    stream: h.stream,
    stdin: h.stdin,
    setup: (ctx) => setImmediate(() => ctx.quit(3, 'play')),
  });

  assert.deepEqual(await app.run(), { code: 3, reason: 'play' });
});

test('Ctrl-C is reported as an interrupt, not an ordinary quit', async () => {
  const h = harness();
  const app = createApp({
    caps: fakeCaps(),
    args: noArgs,
    prefs: noPrefs,
    standalone: false,
    stream: h.stream,
    stdin: h.stdin,
    setup: () => setImmediate(() => h.stdin.press('\x03')),
  });

  const result = await app.run();
  assert.equal(result.reason, 'interrupt', 'the launcher needs to tell these apart');
});

test('onQuit runs on every exit path, including Ctrl-C', async () => {
  const h = harness();
  let saved = 0;
  const app = createApp({
    caps: fakeCaps(),
    args: noArgs,
    prefs: noPrefs,
    standalone: false,
    stream: h.stream,
    stdin: h.stdin,
    onQuit: () => saved++,
    setup: () => setImmediate(() => h.stdin.press('\x03')),
  });

  await app.run();
  assert.equal(saved, 1, 'a game gets to persist before the terminal is restored');
});

test('a throwing onQuit still restores the terminal', async () => {
  const h = harness();
  const app = createApp({
    caps: fakeCaps({ altScreen: true }),
    args: noArgs,
    prefs: noPrefs,
    standalone: false,
    stream: h.stream,
    stdin: h.stdin,
    onQuit: () => {
      throw new Error('save failed');
    },
    setup: (ctx) => setImmediate(() => ctx.quit(0)),
  });

  await app.run();
  assert.match(h.written.join(''), /\x1b\[\?1049l/, 'alt screen left despite the failed save');
});

test('quitting twice settles once and keeps the first result', async () => {
  const h = harness();
  const app = createApp({
    caps: fakeCaps(),
    args: noArgs,
    prefs: noPrefs,
    standalone: false,
    stream: h.stream,
    stdin: h.stdin,
    setup: (ctx) =>
      setImmediate(() => {
        ctx.quit(0, 'first');
        ctx.quit(9, 'second');
      }),
  });

  assert.deepEqual(await app.run(), { code: 0, reason: 'first' });
});

test('running many apps in one process leaks no listeners', async () => {
  const signals = ['exit', 'SIGINT', 'SIGTERM', 'uncaughtException'];
  const before = signals.map((s) => process.listenerCount(s));
  const resizeBefore = process.stdout.listenerCount('resize');

  for (let i = 0; i < 12; i++) {
    const h = harness();
    const app = createApp({
      caps: fakeCaps(),
      args: noArgs,
      prefs: noPrefs,
      standalone: false,
      stream: h.stream,
      stdin: h.stdin,
      setup: (ctx) => setImmediate(() => ctx.quit(0)),
    });
    await app.run();
  }

  assert.deepEqual(
    signals.map((s) => process.listenerCount(s)),
    before,
    'process listeners must come off with the app that added them',
  );
  assert.equal(process.stdout.listenerCount('resize'), resizeBefore);
});

test('a non-interactive terminal is refused without touching the screen', async () => {
  const app = createApp({
    caps: fakeCaps({ isTTY: false }),
    args: noArgs,
    prefs: noPrefs,
    standalone: false,
  });

  assert.ok(app.blocked, 'refuses rather than rendering into a pipe');
  const result = await app.run();
  assert.equal(result.code, 1);
  process.exitCode = 0;
});
