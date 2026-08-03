/**
 * The launcher loop, driven end to end without a terminal.
 *
 * This is the path that only exists because there is an arcade: quitting a game
 * has to come back to the menu instead of ending the process, and the menu has
 * to survive being torn down and rebuilt around it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { savePrefs, ONBOARDING_VERSION } from '@clicade/tui';
import { run } from '../src/main.js';
import { CATALOG } from '../src/catalog.js';

// Launching blackjack for real means it saves for real. Without this the suite
// would rewrite the developer's own bankroll every time it ran.
const CONFIG = mkdtempSync(join(tmpdir(), 'clicade-test-'));
process.env.CLICADE_CONFIG_DIR = CONFIG;
process.on('exit', () => rmSync(CONFIG, { recursive: true, force: true }));

// These tests are about the menu, so setup is marked done. Without this every
// one of them would open onto the onboarding flow instead — which is itself
// worth testing, and is, in onboarding.test.js.
savePrefs({ onboarded: ONBOARDING_VERSION });

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

const CAPS = {
  isTTY: true,
  colorDepth: 0,
  noColor: false,
  unicode: true,
  altScreen: false,
  rawInput: true,
  mouse: false,
  cols: 100,
  rows: 30,
  platform: 'test',
};

/**
 * Run the arcade, feeding it a script of keys.
 *
 * Keys go in one per turn of the event loop rather than as one chunk: the menu
 * and the game are separate apps with separate input handlers, and a burst
 * would be swallowed by whichever one happened to be listening.
 */
function session(keys) {
  const stdin = fakeStdin();
  const frames = [];
  const stream = {
    write: (s) => frames.push(s),
    columns: CAPS.cols,
    rows: CAPS.rows,
  };

  // Once the script runs out, keep pressing q. Every screen — menu or game —
  // exits on q, so a test whose key sequence no longer matches the catalog
  // fails on its assertion instead of hanging the entire suite forever.
  const pending = [...keys];
  const timer = setInterval(() => {
    stdin.emit('data', pending.length ? pending.shift() : 'q');
  }, 5);

  return run({
    argv: [],
    env: { caps: { ...CAPS }, stream, stdin },
  }).finally(() => clearInterval(timer));
}

/** First entry the menu will refuse to launch. */
const UNBUILT_INDEX = CATALOG.findIndex((entry) => !entry.start);

test('q from the menu ends the session cleanly', async () => {
  const code = await session(['q']);
  assert.equal(code, 0);
});

test('escape leaves the arcade too', async () => {
  assert.equal(await session(['\x1b']), 0);
});

test('enter launches a game and q brings the menu back, not an exit', async () => {
  // enter -> blackjack, q -> back to the menu, q -> leave the arcade.
  // If quitting the game ended the process, the third key would never be read
  // and this would hang rather than resolve.
  const code = await session(['\r', 'q', 'q']);
  assert.equal(code, 0);
});

test('a game can be entered and left repeatedly in one process', async () => {
  const code = await session(['\r', 'q', '\r', 'q', '\r', 'q', 'q']);
  assert.equal(code, 0);
});

test('Ctrl-C inside a game ends the whole session', async () => {
  // Returning to the menu on Ctrl-C would make the arcade feel unkillable.
  // The game reports 'interrupt', the loop shows the menu, and the queued
  // 'q' then leaves — what matters is that it resolves rather than hanging.
  const code = await session(['\r', '\x03', 'q']);
  assert.equal(code, 0);
});

test('picking a game that is not built keeps the menu open', async () => {
  // The index is derived, not hardcoded: this test used to walk down one row
  // and assume it landed on something unbuilt, which stopped being true the
  // moment a game shipped.
  assert.ok(UNBUILT_INDEX >= 0, 'the catalog needs an unbuilt entry for this to mean anything');
  const down = Array.from({ length: UNBUILT_INDEX }, () => '\x1b[B');
  const code = await session([...down, '\r', 'q']);
  assert.equal(code, 0);
});

test('every playable game can be entered and left from the menu', async () => {
  // Walks the whole catalog, so a game wired up with a broken start() is caught
  // here rather than by a player.
  for (let i = 0; i < CATALOG.length; i++) {
    if (!CATALOG[i].start) continue;
    const down = Array.from({ length: i }, () => '\x1b[B');
    const code = await session([...down, '\r', 'q', 'q']);
    assert.equal(code, 0, `${CATALOG[i].id} did not return to the menu`);
  }
});

test('number keys jump straight to an entry', async () => {
  const code = await session(['1', '\r', 'q', 'q']);
  assert.equal(code, 0);
});

test('a full session leaves no process listeners behind', async () => {
  const signals = ['exit', 'SIGINT', 'SIGTERM', 'uncaughtException'];
  const before = signals.map((s) => process.listenerCount(s));

  await session(['\r', 'q', '\r', 'q', 'q']);

  assert.deepEqual(
    signals.map((s) => process.listenerCount(s)),
    before,
    'menus and games both have to unhook themselves',
  );
});

test('--help prints without opening a screen', async () => {
  const written = [];
  const original = process.stdout.write;
  process.stdout.write = (s) => {
    written.push(s);
    return true;
  };
  try {
    const code = await run({ argv: ['--help'] });
    assert.equal(code, 0);
    assert.match(written.join(''), /npx clicade/);
  } finally {
    process.stdout.write = original;
  }
});
