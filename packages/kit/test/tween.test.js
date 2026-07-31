import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTween, createTimeline, ease, lerp } from '../src/tween.js';

test('a tween reaches its endpoints exactly', () => {
  const seen = [];
  const t = createTween({ from: 0, to: 10, duration: 1, ease: ease.linear, onUpdate: (v) => seen.push(v) });
  t.update(0);
  t.update(0.5);
  t.update(0.5);
  assert.equal(seen[0], 0);
  assert.equal(seen.at(-1), 10);
  assert.equal(t.done, true);
});

test('delay holds the value before starting', () => {
  const seen = [];
  const t = createTween({ from: 0, to: 1, duration: 1, delay: 0.5, onUpdate: (v) => seen.push(v) });
  t.update(0.25);
  assert.equal(seen.length, 0, 'nothing emitted during the delay');
  t.update(0.5);
  assert.ok(seen.length > 0);
});

test('onComplete fires exactly once', () => {
  let calls = 0;
  const t = createTween({ duration: 0.1, onComplete: () => calls++ });
  t.update(0.2);
  t.update(0.2);
  t.update(0.2);
  assert.equal(calls, 1);
});

test('finish jumps to the end and still fires onComplete once', () => {
  let calls = 0;
  let value = null;
  const t = createTween({
    from: 0,
    to: 99,
    duration: 5,
    onUpdate: (v) => (value = v),
    onComplete: () => calls++,
  });
  t.update(0.1);
  t.finish();
  assert.equal(value, 99);
  assert.equal(calls, 1);
  t.finish();
  assert.equal(calls, 1, 'finishing twice does not re-fire');
});

test('a zero-duration tween completes on the first update', () => {
  let value = null;
  const t = createTween({ from: 0, to: 5, duration: 0, onUpdate: (v) => (value = v) });
  t.update(0);
  assert.equal(value, 5);
  assert.equal(t.done, true);
});

test('easing functions are anchored at 0 and 1', () => {
  for (const [name, fn] of Object.entries(ease)) {
    assert.ok(Math.abs(fn(0)) < 1e-6, `${name}(0) should be 0, got ${fn(0)}`);
    assert.ok(Math.abs(fn(1) - 1) < 1e-6, `${name}(1) should be 1, got ${fn(1)}`);
  }
});

test('outBack overshoots, which is the point of it', () => {
  const peak = Math.max(...Array.from({ length: 100 }, (_, i) => ease.outBack(i / 99)));
  assert.ok(peak > 1, 'outBack should exceed 1 before settling');
});

test('lerp', () => {
  assert.equal(lerp(0, 10, 0.5), 5);
  assert.equal(lerp(10, 20, 0), 10);
  assert.equal(lerp(10, 20, 1), 20);
});

test('a timeline drops tweens as they complete', () => {
  const tl = createTimeline();
  tl.add({ duration: 1 });
  tl.add({ duration: 2 });
  assert.equal(tl.count, 2);
  assert.equal(tl.idle, false);

  tl.update(1);
  assert.equal(tl.count, 1, 'the finished tween is removed');

  tl.update(1);
  assert.equal(tl.idle, true);
});

test('idle gates input while the table is still moving', () => {
  const tl = createTimeline();
  assert.equal(tl.idle, true, 'an empty timeline is idle');
  tl.add({ duration: 0.5 });
  assert.equal(tl.idle, false);
  tl.finishAll();
  assert.equal(tl.idle, true);
});

test('animation advances by dt, not wall clock, so replays are identical', () => {
  const runs = [0, 1].map(() => {
    const seen = [];
    const tl = createTimeline();
    tl.add({ from: 0, to: 1, duration: 1, onUpdate: (v) => seen.push(v.toFixed(6)) });
    // Deliberately uneven steps — the result must depend only on their sum.
    [0.1, 0.3, 0.05, 0.4, 0.15].forEach((dt) => tl.update(dt));
    return seen;
  });
  assert.deepEqual(runs[0], runs[1]);
});
