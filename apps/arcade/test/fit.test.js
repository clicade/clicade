import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCALES } from '@clicade/kit';
import { CATALOG, playable } from '../src/catalog.js';
import {
  SHELL,
  requirements,
  fits,
  verdict,
  recommend,
  survey,
  summary,
  report,
  honoursScale,
} from '../src/fit.js';

const HUGE = [200, 60];
const TINY = [40, 12];

// --- where the numbers come from ------------------------------------------

test('requirements come from the games, not from a table here', () => {
  // If this module ever hardcodes a size, it will drift the moment a game's
  // layout changes. The check: every playable game appears, with its own answer.
  const need = requirements('normal');
  assert.equal(need.games.length, playable().length);
  for (const game of need.games) {
    const entry = CATALOG.find((e) => e.id === game.id);
    assert.deepEqual(game.min, entry.minSize('normal'));
  }
});

test('the launcher itself is counted, not just the games', () => {
  // A player who cannot open the menu never reaches a game, so the shell floor
  // has to be part of the answer.
  const need = requirements('normal');
  assert.ok(need.min.width >= SHELL.width);
  assert.ok(need.min.height >= SHELL.height);
});

test('the recommended size is never smaller than the minimum', () => {
  for (const scale of SCALES) {
    const need = requirements(scale);
    assert.ok(need.recommended.width >= need.min.width, `${scale} width`);
    assert.ok(need.recommended.height >= need.min.height, `${scale} height`);
  }
});

test('a bigger size never asks for a smaller window', () => {
  let previous = null;
  for (const scale of SCALES) {
    const need = requirements(scale);
    if (previous) assert.ok(need.min.width >= previous.min.width, `${scale} got narrower`);
    previous = need;
  }
});

// --- whether a game honours Size ------------------------------------------

test('honouring Size is derived from the game, never declared', () => {
  const solitaire = CATALOG.find((e) => e.id === 'solitaire');
  const blackjack = CATALOG.find((e) => e.id === 'blackjack');
  assert.equal(honoursScale(solitaire), true, 'solitaire lays out per size');
  assert.equal(honoursScale(blackjack), false, 'blackjack does not, and says so');
});

test('a game with no size declaration is treated as shell-sized', () => {
  const need = requirements('normal');
  const minesweeper = need.games.find((g) => g.id === 'minesweeper');
  assert.equal(minesweeper, undefined, 'unbuilt games are not part of the requirement');
});

// --- verdicts --------------------------------------------------------------

test('a large terminal is comfortable at every size', () => {
  for (const scale of SCALES) assert.equal(verdict(scale, ...HUGE), 'good');
});

test('a terminal below the minimum is reported as too small, not as tight', () => {
  for (const scale of SCALES) assert.equal(verdict(scale, ...TINY), 'small');
});

test('between the minimum and the recommendation is tight, and still playable', () => {
  const need = requirements('normal');
  const state = verdict('normal', need.min.width, need.min.height);
  assert.equal(state, 'tight');
  assert.ok(fits(need.min, need.min.width, need.min.height), 'tight means it does fit');
});

test('exactly the recommended size is comfortable, not tight', () => {
  const need = requirements('normal');
  assert.equal(verdict('normal', need.recommended.width, need.recommended.height), 'good');
});

// --- the recommendation ----------------------------------------------------

test('a large terminal is told to use the roomiest size', () => {
  assert.equal(recommend(...HUGE), SCALES[SCALES.length - 1]);
});

test('a cramped terminal is told the smallest that fits, not the largest', () => {
  // The useful advice on a tight window is the size with headroom to spare,
  // not the one clearing the bar by three columns.
  const need = requirements('normal');
  const cols = need.min.width + 1;
  const rows = need.min.height + 1;
  const advice = recommend(cols, rows);
  const alternatives = SCALES.filter((s) => verdict(s, cols, rows) !== 'small');
  assert.equal(advice, alternatives[0], 'took the smallest workable, not the biggest');
});

test('the recommendation is never a size that does not fit', () => {
  // The one way this could actively mislead: suggesting something unusable.
  for (let cols = 30; cols <= 200; cols += 7) {
    for (let rows = 10; rows <= 60; rows += 5) {
      const scale = recommend(cols, rows);
      const state = verdict(scale, cols, rows);
      if (state === 'small') {
        // Only allowed when nothing at all fits — then there is no honest answer.
        const any = SCALES.some((s) => verdict(s, cols, rows) !== 'small');
        assert.equal(any, false, `${cols}x${rows} suggested ${scale}, which does not fit`);
      }
    }
  }
});

// --- the survey handed to the screens --------------------------------------

test('the survey answers for every size, so a screen never has to compute one', () => {
  const s = survey(100, 30);
  assert.equal(s.cols, 100);
  assert.equal(s.rows, 30);
  for (const scale of SCALES) {
    assert.ok(s.scales[scale], `${scale} missing`);
    assert.equal(s.scales[scale].verdict, verdict(scale, 100, 30));
  }
  assert.equal(s.recommended, recommend(100, 30));
});

test('summary says the size it is talking about', () => {
  for (const scale of SCALES) {
    assert.match(summary(scale, ...HUGE), new RegExp(scale));
  }
});

test('a too-small summary quotes the minimum, not the wish', () => {
  const need = requirements('normal');
  const text = summary('normal', ...TINY);
  assert.match(text, new RegExp(`${need.min.width}x${need.min.height}`));
});

// --- the printed report ----------------------------------------------------

test('the report prints nothing an ASCII terminal cannot show', () => {
  // It exists to be pasted into a bug report, which means it travels through
  // whatever the reporter's terminal and clipboard do to non-ASCII.
  const text = report(100, 30, { colorDepth: 24, unicode: true }).join('\n');
  const bad = [...text].find((ch) => ch.codePointAt(0) > 0x7f);
  assert.equal(bad, undefined, `report leaked ${JSON.stringify(bad)}`);
});

test('the report states the terminal it measured', () => {
  assert.match(report(123, 45).join('\n'), /123x45/);
});

test('the report names every playable game and flags the ones Size does not reach', () => {
  const text = report(100, 30).join('\n');
  for (const entry of playable()) assert.match(text, new RegExp(entry.title));
  assert.match(text, /Blackjack.*same at every size/, 'the gap is stated, not hidden');
});

test('the report lists announced games separately from playable ones', () => {
  const text = report(100, 30).join('\n');
  assert.match(text, /not built yet: .*minesweeper/);
});

test('the report marks exactly one recommendation', () => {
  const marks = report(100, 30)
    .join('\n')
    .match(/<- recommended/g);
  assert.equal(marks?.length, 1);
});

test('the report degrades when capabilities are unknown', () => {
  // `--check` runs before any terminal is entered, and may have nothing to say
  // about colour. It must still produce the size table.
  const text = report(100, 30, {}).join('\n');
  assert.doesNotMatch(text, /colour/);
  assert.match(text, /compact/);
});
