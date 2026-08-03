import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRgb, styleToSgr, COLOR_TRUE } from '@clicade/tui';
import {
  THEMES,
  getTheme,
  getScale,
  resolveTheme,
  themeFor,
  applyContrast,
  applySurface,
  luminance,
  isDark,
  SCALES,
} from '../src/theme.js';

/** Contrast ratio in the WCAG sense, for asserting legibility improved. */
function ratio(a, b) {
  const rel = (color) => {
    const [r, g, bl] = (toRgb(color) ?? [0, 0, 0]).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [rel(a), rel(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('every palette has the fields the games draw with', () => {
  const required = ['table', 'text', 'textMuted', 'accent', 'good', 'bad', 'cardFace', 'cardEdge'];
  for (const [name, theme] of Object.entries(THEMES)) {
    for (const key of required) {
      assert.ok(theme[key] !== undefined, `${name} is missing ${key}`);
    }
  }
});

test('dark and light palettes are classified correctly', () => {
  assert.equal(isDark(THEMES.noir), true);
  assert.equal(isDark(THEMES.felt), true);
  assert.equal(isDark(THEMES.paper), false);
});

test('luminance runs from black to white', () => {
  assert.equal(luminance('#000000'), 0);
  assert.equal(luminance('#ffffff'), 1);
  assert.ok(luminance('#808080') > 0 && luminance('#808080') < 1);
});

// --- contrast --------------------------------------------------------------

test('normal contrast leaves a palette untouched', () => {
  assert.equal(applyContrast(THEMES.felt, 'normal'), THEMES.felt);
  assert.equal(applyContrast(THEMES.felt, undefined), THEMES.felt);
});

test('high contrast measurably improves legibility on every palette', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    const high = applyContrast(theme, 'high');
    assert.ok(
      ratio(high.text, high.table) >= ratio(theme.text, theme.table),
      `${name}: body text got no clearer`,
    );
    assert.ok(
      ratio(high.textMuted, high.table) > ratio(theme.textMuted, theme.table),
      `${name}: muted text is the first to become unreadable and must improve`,
    );
  }
});

test('high contrast pushes text the right way for dark and light alike', () => {
  assert.deepEqual(toRgb(applyContrast(THEMES.noir, 'high').text), [255, 255, 255]);
  assert.deepEqual(toRgb(applyContrast(THEMES.paper, 'high').text), [0, 0, 0]);
});

test('high contrast keeps the background it started from', () => {
  // Only foregrounds move; changing the surface is the other axis.
  assert.equal(applyContrast(THEMES.felt, 'high').table, THEMES.felt.table);
});

// --- surface ---------------------------------------------------------------

test('the themed surface is the palette unchanged', () => {
  assert.equal(applySurface(THEMES.noir, 'themed'), THEMES.noir);
});

test('the terminal surface paints no background at all', () => {
  const theme = applySurface(THEMES.felt, 'terminal');
  assert.equal(theme.table, null);
  assert.equal(theme.shadow, null);
});

test('a null background really does emit no colour sequence', () => {
  // This is the whole mechanism: the colour layer skips a null, so the
  // terminal keeps whatever background the player already chose.
  const sgr = styleToSgr({ fg: '#ffffff', bg: null }, COLOR_TRUE);
  assert.doesNotMatch(sgr, /48;/, 'a background sequence would overwrite their terminal');
  assert.match(sgr, /38;/, 'the foreground still has to be set');
});

test('cards keep their faces when the surface is the terminal', () => {
  // Without a face a card stops reading as an object sitting on something.
  const theme = applySurface(THEMES.felt, 'terminal');
  assert.equal(theme.cardFace, THEMES.felt.cardFace);
  assert.equal(theme.cardBack, THEMES.felt.cardBack);
});

test('the darker table tone becomes visible ink rather than an invisible rule', () => {
  const theme = applySurface(THEMES.noir, 'terminal');
  assert.notEqual(theme.tableDark, THEMES.noir.tableDark);
});

// --- resolution ------------------------------------------------------------

test('resolveTheme composes both axes', () => {
  const theme = resolveTheme({ theme: 'noir', contrast: 'high', surface: 'terminal' });
  assert.equal(theme.table, null);
  assert.deepEqual(toRgb(theme.text), [255, 255, 255]);
});

test('an unknown palette name falls back rather than throwing', () => {
  assert.equal(getTheme('nonsense').name, 'felt');
  assert.ok(resolveTheme({ theme: 'nonsense' }).text);
});

test('themeFor prefers a flag over a saved preference', () => {
  const theme = themeFor({ theme: 'paper' }, { theme: 'noir' });
  assert.equal(theme.name, 'paper');
});

test('themeFor applies saved contrast and surface', () => {
  const theme = themeFor({}, { theme: 'noir', contrast: 'high', surface: 'terminal' });
  assert.equal(theme.table, null);
  assert.deepEqual(toRgb(theme.text), [255, 255, 255]);
});

test('themeFor with nothing saved is the plain default', () => {
  const theme = themeFor({}, {});
  assert.equal(theme.name, 'felt');
  assert.equal(theme.table, THEMES.felt.table);
});

// --- scale -----------------------------------------------------------------

test('every scale names a real card size and grows monotonically', () => {
  let lastGap = -1;
  for (const name of SCALES) {
    const metrics = getScale(name);
    assert.ok(['compact', 'full'].includes(metrics.card), `${name} names an unknown card size`);
    assert.ok(metrics.gap > lastGap, `${name} does not give more room than the size below it`);
    lastGap = metrics.gap;
  }
});

test('an unknown scale falls back to normal', () => {
  assert.deepEqual(getScale('enormous'), getScale('normal'));
  assert.deepEqual(getScale(), getScale('normal'));
});
