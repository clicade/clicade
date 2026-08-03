/**
 * Does this terminal fit?
 *
 * The Size preference is the one setting whose right answer depends on
 * something we can actually measure. Contrast and background need a human eye;
 * how many columns you have is a number. So this module answers it, and the
 * settings and setup screens show the answer next to the choice instead of
 * making the player pick blind and find out when a pile compresses.
 *
 * Requirements come from the games themselves — each one exports `minSize` and
 * `recommendedSize` from its meta. Nothing here knows what a tableau is.
 *
 * Pure: no terminal, no rendering. Callers pass the size they measured.
 */

import { SCALES } from '@clicade/kit';
import { CATALOG, playable } from './catalog.js';
import { MIN_W as MENU_W, MIN_H as MENU_H } from './render.js';

// The panel screens set the shell's real floor; kept here rather than imported
// so `screens.js` can render a fit report without importing this back.
const PANEL_W = 66;
const PANEL_H = 22;

/** What the launcher itself needs, before any game is opened. */
export const SHELL = {
  width: Math.max(MENU_W, PANEL_W),
  height: Math.max(MENU_H, PANEL_H),
};

function ask(entry, kind, scale) {
  const fn = entry?.[kind];
  if (typeof fn !== 'function') return null;
  const size = fn(scale);
  return size && Number.isFinite(size.width) && Number.isFinite(size.height) ? size : null;
}

/**
 * Whether a game's window requirement actually changes with the Size setting.
 *
 * Derived by asking at both extremes rather than declared, so a game that
 * gains or loses scale support can never leave a stale flag behind.
 */
export function honoursScale(entry) {
  const small = ask(entry, 'minSize', SCALES[0]);
  const large = ask(entry, 'minSize', SCALES[SCALES.length - 1]);
  if (!small || !large) return false;
  return small.width !== large.width || small.height !== large.height;
}

const bigger = (a, b) => ({
  width: Math.max(a.width, b.width),
  height: Math.max(a.height, b.height),
});

/**
 * Window sizes needed at a given Size setting.
 *
 * @returns {{scale:string, min:{width:number,height:number},
 *            recommended:{width:number,height:number}, games:object[]}}
 */
export function requirements(scale = 'normal') {
  const games = playable().map((entry) => {
    const min = ask(entry, 'minSize', scale) ?? SHELL;
    return {
      id: entry.id,
      title: entry.title,
      min,
      recommended: ask(entry, 'recommendedSize', scale) ?? min,
      scales: honoursScale(entry),
    };
  });

  // The launcher has to fit too — a player who cannot open the menu never
  // reaches a game at all.
  let min = SHELL;
  let recommended = SHELL;
  for (const game of games) {
    min = bigger(min, game.min);
    recommended = bigger(recommended, game.recommended);
  }

  return { scale, min, recommended, games };
}

export function fits(size, cols, rows) {
  return cols >= size.width && rows >= size.height;
}

/**
 * How well a terminal suits a Size setting.
 *
 * 'small' means a game will suspend and ask for a resize; 'tight' means it
 * plays but deep piles compress; 'good' means it has the room it wants.
 */
export function verdict(scale, cols, rows) {
  const need = requirements(scale);
  if (!fits(need.min, cols, rows)) return 'small';
  if (!fits(need.recommended, cols, rows)) return 'tight';
  return 'good';
}

/**
 * The Size that suits this terminal best.
 *
 * Largest that is comfortable — but if nothing is comfortable, the *smallest*
 * that fits rather than the largest. On a cramped terminal the useful advice is
 * the one with headroom to spare, not the one clearing the bar by three
 * columns.
 */
export function recommend(cols, rows) {
  const largestFirst = [...SCALES].reverse();
  return (
    largestFirst.find((scale) => verdict(scale, cols, rows) === 'good') ??
    SCALES.find((scale) => verdict(scale, cols, rows) !== 'small') ??
    SCALES[0]
  );
}

/**
 * Everything a screen needs to talk about fit, measured once.
 *
 * Handed to the renderers rather than computed inside them, so drawing stays
 * free of policy and the whole report can be asserted without a terminal.
 */
export function survey(cols, rows) {
  const scales = {};
  for (const scale of SCALES) {
    const need = requirements(scale);
    scales[scale] = { ...need, verdict: verdict(scale, cols, rows) };
  }
  return { cols, rows, scales, recommended: recommend(cols, rows) };
}

/** One line summarising a size against the terminal, for the settings screen. */
export function summary(scale, cols, rows) {
  const need = requirements(scale);
  const state = verdict(scale, cols, rows);
  const want = `${need.recommended.width}x${need.recommended.height}`;
  if (state === 'good') return `fits - ${scale} wants ${want}`;
  if (state === 'tight') return `plays, but tight - ${scale} wants ${want}`;
  return `too small - ${scale} needs ${need.min.width}x${need.min.height}`;
}

/**
 * The full report, as lines. Used by `--check`, which prints without ever
 * entering the alt screen so the output survives to be pasted into an issue.
 */
export function report(cols, rows, caps = {}) {
  const lines = [];
  lines.push(`terminal   ${cols}x${rows}`);
  if (caps.colorDepth !== undefined) lines.push(`colour     ${describeColor(caps.colorDepth)}`);
  if (caps.unicode !== undefined) lines.push(`glyphs     ${caps.unicode ? 'unicode' : 'ascii'}`);
  lines.push('');

  const survey_ = survey(cols, rows);
  lines.push('size        needs    wants');
  for (const scale of SCALES) {
    const s = survey_.scales[scale];
    const mark = { good: 'fits', tight: 'tight', small: 'too small' }[s.verdict];
    const star = scale === survey_.recommended ? ' <- recommended' : '';
    lines.push(
      `${scale.padEnd(11)} ${`${s.min.width}x${s.min.height}`.padEnd(8)} ` +
        `${`${s.recommended.width}x${s.recommended.height}`.padEnd(8)} ${mark}${star}`,
    );
  }

  lines.push('');
  lines.push('per game, at each size:');
  for (const entry of playable()) {
    const sizes = SCALES.map((scale) => {
      const size = ask(entry, 'minSize', scale) ?? SHELL;
      return `${scale} ${size.width}x${size.height}`;
    });
    const note = honoursScale(entry) ? '' : '  (same at every size)';
    lines.push(`  ${entry.title.padEnd(12)} ${sizes.join('   ')}${note}`);
  }

  const unbuilt = CATALOG.filter((entry) => !entry.start);
  if (unbuilt.length) {
    lines.push('');
    lines.push(`not built yet: ${unbuilt.map((e) => e.id).join(', ')}`);
  }

  return lines;
}

function describeColor(depth) {
  if (depth >= 24) return 'truecolor';
  if (depth >= 8) return '256';
  if (depth >= 4) return '16';
  return 'none';
}
