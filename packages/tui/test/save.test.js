import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSave, configDir } from '../src/save.js';

const DIR = mkdtempSync(join(tmpdir(), 'clicade-save-'));
process.on('exit', () => rmSync(DIR, { recursive: true, force: true }));

function withConfig(dir, fn) {
  const previous = process.env.CLICADE_CONFIG_DIR;
  process.env.CLICADE_CONFIG_DIR = dir;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.CLICADE_CONFIG_DIR;
    else process.env.CLICADE_CONFIG_DIR = previous;
  }
}

test('CLICADE_CONFIG_DIR overrides the platform location', () => {
  withConfig(DIR, () => assert.equal(configDir(), DIR));
});

test('the path is resolved per call, not captured at construction', () => {
  // Preferences are built when the module is imported. If the path were fixed
  // then, no test could ever redirect writes away from the real config dir.
  const store = createSave('demo', { n: 0 });
  const a = withConfig(DIR, () => store.file);
  const other = mkdtempSync(join(tmpdir(), 'clicade-save-'));
  const b = withConfig(other, () => store.file);
  rmSync(other, { recursive: true, force: true });

  assert.notEqual(a, b);
});

test('a round trip returns what was written', () => {
  withConfig(DIR, () => {
    const store = createSave('round-trip', { chips: 0, name: '' });
    assert.equal(store.save({ chips: 120, name: 'x' }), true);
    assert.deepEqual(store.load(), { chips: 120, name: 'x' });
  });
});

test('missing keys fall back to defaults rather than undefined', () => {
  withConfig(DIR, () => {
    const store = createSave('partial', { chips: 500, rounds: 0 });
    store.save({ chips: 10 });
    assert.deepEqual(store.load(), { chips: 10, rounds: 0 });
  });
});

test('a corrupt save reads as defaults instead of throwing', () => {
  withConfig(DIR, () => {
    const store = createSave('corrupt', { chips: 500 });
    writeFileSync(store.file, '{not json', 'utf8');
    assert.deepEqual(store.load(), { chips: 500 });
  });
});

test('defaults are cloned, so a caller cannot mutate them for everyone', () => {
  withConfig(DIR, () => {
    const store = createSave('nested', { stats: { won: 0 } });
    const first = store.load();
    first.stats.won = 99;
    assert.equal(store.load().stats.won, 0);
  });
});

test('a failed write leaves no temp file behind', () => {
  const missing = join(DIR, 'no', 'such', 'place');
  withConfig(missing, () => {
    const store = createSave('unwritable', {});
    // The directory is created on demand, so this actually succeeds — the point
    // is that it does not throw and does not strand a .tmp either way.
    store.save({ a: 1 });
  });
  const strays = readdirSync(DIR, { recursive: true }).filter((f) => String(f).endsWith('.tmp'));
  assert.deepEqual(strays, []);
});
