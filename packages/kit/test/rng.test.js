import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';

test('the same seed replays exactly', () => {
  const a = createRng(12345);
  const b = createRng(12345);
  const seqA = Array.from({ length: 50 }, () => a.next());
  const seqB = Array.from({ length: 50 }, () => b.next());
  assert.deepEqual(seqA, seqB);
});

test('different seeds diverge', () => {
  const a = createRng(1);
  const b = createRng(2);
  assert.notEqual(a.next(), b.next());
});

test('a zero seed still generates', () => {
  const r = createRng(0);
  const values = Array.from({ length: 10 }, () => r.next());
  assert.ok(new Set(values).size > 1, 'a zero seed must not lock the generator');
});

test('output stays in [0, 1)', () => {
  const r = createRng(99);
  for (let i = 0; i < 5000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('int and range stay in bounds', () => {
  const r = createRng(7);
  for (let i = 0; i < 2000; i++) {
    const v = r.int(10);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 10);
    const w = r.range(5, 8);
    assert.ok(Number.isInteger(w) && w >= 5 && w <= 8);
  }
});

test('shuffle keeps every element exactly once', () => {
  const r = createRng(42);
  const source = Array.from({ length: 52 }, (_, i) => i);
  const shuffled = r.shuffle([...source]);
  assert.equal(shuffled.length, 52);
  assert.deepEqual([...shuffled].sort((a, b) => a - b), source);
});

test('shuffle actually reorders', () => {
  const r = createRng(42);
  const source = Array.from({ length: 52 }, (_, i) => i);
  const shuffled = r.shuffle([...source]);
  assert.notDeepEqual(shuffled, source);
});

test('shuffle is unbiased across positions', () => {
  // Every element should reach every position roughly equally. A sort-based
  // shuffle fails this badly, which is why Fisher-Yates is used.
  const N = 6;
  const trials = 12000;
  const counts = Array.from({ length: N }, () => new Array(N).fill(0));
  const r = createRng(2024);

  for (let t = 0; t < trials; t++) {
    const arr = r.shuffle(Array.from({ length: N }, (_, i) => i));
    arr.forEach((value, pos) => counts[value][pos]++);
  }

  const expected = trials / N;
  for (let v = 0; v < N; v++) {
    for (let p = 0; p < N; p++) {
      const deviation = Math.abs(counts[v][p] - expected) / expected;
      assert.ok(deviation < 0.15, `value ${v} at position ${p} deviates ${(deviation * 100).toFixed(1)}%`);
    }
  }
});

test('state can be saved and restored mid-run', () => {
  const r = createRng(500);
  r.next();
  r.next();
  const snapshot = r.state;
  const expected = [r.next(), r.next(), r.next()];

  const restored = createRng(500);
  restored.state = snapshot;
  assert.deepEqual([restored.next(), restored.next(), restored.next()], expected);
});
