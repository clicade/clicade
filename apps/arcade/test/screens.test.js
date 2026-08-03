import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScreen, createStage, glyphs } from '@clicade/tui';
import { resolveTheme } from '@clicade/kit';
import { createSettings, SETTINGS } from '../src/settings.js';
import { createOnboarding, STEPS } from '../src/onboarding.js';
import { renderSettings, renderOnboarding, MIN_W, MIN_H } from '../src/screens.js';
import { createMenu } from '../src/menu.js';
import { CATALOG } from '../src/catalog.js';
import { render as renderMenu, MIN_W as MENU_W, MIN_H as MENU_H } from '../src/render.js';
import { survey, requirements } from '../src/fit.js';

const W = Math.max(MIN_W, MENU_W);
const H = Math.max(MIN_H, MENU_H);

function surface(cols, rows, unicode = true) {
  const caps = { colorDepth: 0, unicode, altScreen: false, isTTY: true, cols, rows };
  const screen = createScreen({ caps, stream: { write: () => {}, columns: cols, rows } });
  screen.enter();
  const stage = createStage({ screen, fill: true, minWidth: W, minHeight: H });
  stage.measure();
  return { screen, stage, g: glyphs(caps) };
}

const THEME = resolveTheme({ theme: 'noir' });
const VIEW = { colorAvailable: true, mono: false, scale: 'normal' };

function settingsFrame(
  cols = 90,
  rows = 30,
  { index = 0, unicode = true, scale = 'normal', fit = survey(cols, rows) } = {},
) {
  const { screen, stage, g } = surface(cols, rows, unicode);
  const settings = createSettings({ onboarded: 1, scale });
  for (let i = 0; i < index; i++) settings.move(1);
  for (let i = 0; i < 200; i++) settings.update(1 / 60);
  renderSettings(stage, g, settings, THEME, { ...VIEW, scale, fit });
  return screen.toText();
}

function onboardingFrame(step, cols = 90, rows = 30, unicode = true, fit = survey(cols, rows)) {
  const { screen, stage, g } = surface(cols, rows, unicode);
  const flow = createOnboarding({});
  for (let i = 0; i < step; i++) flow.next();
  for (let i = 0; i < 100; i++) flow.update(1 / 60);
  renderOnboarding(stage, g, flow, THEME, { ...VIEW, fit });
  return screen.toText();
}

/** Which step asks about Size, found rather than counted. */
const SCALE_STEP = STEPS.findIndex((s) => s.key === 'scale');

function menuFrame(cols = 90, rows = 30, { unicode = true, scale = 'normal' } = {}) {
  const { screen, stage, g } = surface(cols, rows, unicode);
  const menu = createMenu(CATALOG, 0);
  for (let i = 0; i < 200; i++) menu.update(1 / 60);
  renderMenu(stage, g, menu, THEME, { ...VIEW, scale });
  return screen.toText();
}

// --- the ASCII floor -------------------------------------------------------

const nonAscii = (text) => [...text].find((ch) => ch.codePointAt(0) > 0x7f);

test('settings draws nothing an ASCII terminal cannot render', () => {
  // The copy on these screens is prose, and prose is where an em dash or a
  // curly apostrophe sneaks in and renders as a replacement box.
  for (let i = 0; i < SETTINGS.length; i++) {
    const bad = nonAscii(settingsFrame(90, 30, { index: i, unicode: false }));
    assert.equal(bad, undefined, `setting ${i} leaked ${JSON.stringify(bad)}`);
  }
});

test('every onboarding step draws nothing an ASCII terminal cannot render', () => {
  for (let step = 0; step < STEPS.length; step++) {
    const bad = nonAscii(onboardingFrame(step, 90, 30, false));
    assert.equal(bad, undefined, `step ${step} leaked ${JSON.stringify(bad)}`);
  }
});

test('the menu draws nothing an ASCII terminal cannot render', () => {
  assert.equal(nonAscii(menuFrame(90, 30, { unicode: false })), undefined);
});

// --- fitting ---------------------------------------------------------------

test('every screen fits the smallest supported window', () => {
  const frames = [
    settingsFrame(W, H),
    menuFrame(W, H),
    ...STEPS.map((_, i) => onboardingFrame(i, W, H)),
  ];
  for (const text of frames) {
    for (const line of text.split('\n')) {
      assert.ok(line.length <= W, `line ${line.length} wide in a ${W} window: ${line}`);
    }
  }
});

test('every scale fits the smallest window too', () => {
  for (const scale of ['compact', 'normal', 'roomy']) {
    for (const line of menuFrame(W, H, { scale }).split('\n')) {
      assert.ok(line.length <= W, `${scale}: line ${line.length} wide`);
    }
  }
});

// --- content ---------------------------------------------------------------

test('settings shows every option, not just the chosen one', () => {
  // Cycling blind through hidden options is what makes a settings screen
  // feel like a guessing game.
  const text = settingsFrame();
  for (const definition of SETTINGS) {
    for (const option of definition.options) {
      assert.match(text, new RegExp(option.label), `${definition.key}/${option.label} is not shown`);
    }
  }
});

test('the chosen option is marked in a way that survives monochrome', () => {
  const text = settingsFrame(90, 30, { unicode: false });
  assert.match(text, /\[Normal\]/, 'brackets, not colour, are what mark the choice');
});

test('setup marks its chosen option by shape, not only by colour', () => {
  // These frames are rendered at colorDepth 0, so anything relying on an accent
  // colour is simply absent — which is exactly what a monochrome player sees.
  for (const unicode of [true, false]) {
    const text = onboardingFrame(SCALE_STEP, 90, 30, unicode);
    const heavy = unicode ? '═' : '=';
    assert.ok(text.includes(heavy), `no shape marks the choice (unicode: ${unicode})`);

    // And exactly one option is marked, or the mark means nothing.
    const marked = text.split('\n').filter((line) => line.includes(heavy));
    assert.ok(marked.length > 0 && marked.length <= 3, 'the mark spans one box');
  }
});

test('the highlighted setting shows its help and the note for its value', () => {
  const text = settingsFrame(90, 30, { index: 2 });
  assert.match(text, /Card size and spacing/);
  assert.match(text, /Full-size cards\./);
});

test('the preview shows real cards and real text tones', () => {
  const text = settingsFrame();
  assert.match(text, /normal text/);
  assert.match(text, /muted text/);
  assert.match(text, /A/, 'a real card is drawn, not a colour bar');
});

test('the preview follows the size being chosen', () => {
  assert.notEqual(settingsFrame(90, 30, { scale: 'compact' }), settingsFrame(90, 30, { scale: 'normal' }));
});

test('onboarding opens on the welcome and ends on a confirmation', () => {
  assert.match(onboardingFrame(0), /Two quick questions/);
  assert.match(onboardingFrame(STEPS.length - 1), /You are set/);
});

test('onboarding shows progress so the end is visible from the start', () => {
  assert.match(onboardingFrame(0), /1 of \d/);
});

test('every onboarding question offers a way out', () => {
  for (let step = 0; step < STEPS.length; step++) {
    const text = onboardingFrame(step);
    assert.match(text, /skip setup/, `step ${step} traps the player`);
    assert.match(text, /q quit/, `step ${step} has no way to leave`);
  }
});

test('the menu advertises settings', () => {
  assert.match(menuFrame(), /s settings/);
});

test('every help line and note fits the block it is drawn in', () => {
  // Settings gives help one row, unwrapped. A string longer than the block is
  // silently clipped by the stage — which is how "belongs to your emulator."
  // lost its full stop at 70 columns.
  for (const definition of SETTINGS) {
    assert.ok(
      definition.help.length <= 62,
      `${definition.key} help is ${definition.help.length} chars, block is 62`,
    );
    for (const option of definition.options) {
      assert.ok(option.note.length <= 62, `${definition.key}/${option.label} note is too long`);
    }
  }
});

test('no text is clipped at the narrowest window the screen supports', () => {
  const text = settingsFrame(MIN_W, MIN_H, { index: 2 });
  assert.match(text, /emulator\./, 'the help line lost its ending');
});

// --- the fit reading -------------------------------------------------------

test('settings shows the terminal it measured', () => {
  assert.match(settingsFrame(103, 41), /103x41/);
});

test('a roomy terminal is told it has room, with the number it wants', () => {
  const text = settingsFrame(200, 60);
  assert.match(text, /room to spare/);
  const want = requirements('normal').recommended;
  assert.match(text, new RegExp(`${want.width}x${want.height}`));
});

test('a terminal below the minimum is told so, and told the minimum', () => {
  // Rendered at a workable size but reporting on a small one, so the message
  // is what is under test rather than the layout collapsing.
  const need = requirements('normal').min;
  const text = settingsFrame(90, 30, { fit: survey(need.width - 10, need.height - 5) });
  assert.match(text, /too small/);
  assert.match(text, new RegExp(`${need.width}x${need.height}`));
});

test('a size that suits the window better is suggested, and only then', () => {
  const roomy = settingsFrame(90, 30, { scale: 'roomy', fit: survey(200, 60) });
  assert.doesNotMatch(roomy, /try /, 'already on the best size, so no advice');

  const text = settingsFrame(90, 30, { scale: 'compact', fit: survey(200, 60) });
  assert.match(text, /try roomy/);
});

test('the fit reading never claims a size fits when it does not', () => {
  // The one failure that would actively mislead: a green reading on a window
  // the game will refuse to start in.
  const need = requirements('roomy').min;
  const text = settingsFrame(90, 30, {
    scale: 'roomy',
    fit: survey(need.width - 1, need.height),
  });
  assert.match(text, /too small/);
  assert.doesNotMatch(text, /room to spare/);
});

test('setup shows the fit reading on the Size question and nowhere else', () => {
  assert.ok(SCALE_STEP > 0, 'setup needs to ask about size for this to mean anything');
  assert.match(onboardingFrame(SCALE_STEP, 111, 34), /111x34/);

  for (let step = 0; step < STEPS.length; step++) {
    if (step === SCALE_STEP) continue;
    assert.doesNotMatch(
      onboardingFrame(step, 111, 34),
      /111x34/,
      `step ${step} shows a measurement for a question no measurement answers`,
    );
  }
});

test('the fit reading survives an ASCII terminal', () => {
  const bad = [...settingsFrame(90, 30, { unicode: false })].find((ch) => ch.codePointAt(0) > 0x7f);
  assert.equal(bad, undefined);
});

test('screens draw without a fit reading at all', () => {
  // `fit` is passed by the shell; a caller that omits it must not crash, or a
  // missing measurement takes down the settings screen.
  assert.doesNotThrow(() => settingsFrame(90, 30, { fit: undefined }));
  assert.doesNotThrow(() => onboardingFrame(SCALE_STEP, 90, 30, true, undefined));
});

// --- motion ----------------------------------------------------------------

test('the menu animates in rather than appearing whole', () => {
  const { screen, stage, g } = surface(90, 30);
  const menu = createMenu(CATALOG, 0);
  menu.update(1 / 60);
  renderMenu(stage, g, menu, THEME, VIEW);
  const early = screen.toText();

  for (let i = 0; i < 200; i++) menu.update(1 / 60);
  renderMenu(stage, g, menu, THEME, VIEW);
  assert.notEqual(early, screen.toText());
});

test('the entrance finishes and then holds still', () => {
  const { screen, stage, g } = surface(90, 30);
  const menu = createMenu(CATALOG, 0);
  for (let i = 0; i < 200; i++) menu.update(1 / 60);
  renderMenu(stage, g, menu, THEME, VIEW);
  const settled = screen.toText();

  // Only the marker pulse should still be moving, and it is one cell.
  for (let i = 0; i < 10; i++) menu.update(1 / 60);
  renderMenu(stage, g, menu, THEME, VIEW);
  const diff = [...settled].filter((ch, i) => ch !== screen.toText()[i]).length;
  assert.ok(diff <= 1, `${diff} cells still moving after the entrance`);
});

test('the highlight slides between rows and settles exactly', () => {
  const menu = createMenu(CATALOG, 0);
  for (let i = 0; i < 200; i++) menu.update(1 / 60);
  menu.move(1);
  assert.equal(menu.state.cursorY, 0, 'it has not moved yet');
  menu.update(1 / 60);
  assert.ok(menu.state.cursorY > 0 && menu.state.cursorY < 1, 'mid-slide');
  for (let i = 0; i < 200; i++) menu.update(1 / 60);
  assert.equal(menu.state.cursorY, 1, 'and lands exactly');
});

test('motion is frame-rate independent', () => {
  // Driven by dt, not by a step per frame, or the menu would feel different
  // over ssh than it does locally.
  const at60 = createMenu(CATALOG, 0);
  const at30 = createMenu(CATALOG, 0);
  at60.move(2);
  at30.move(2);
  for (let i = 0; i < 30; i++) at60.update(1 / 60);
  for (let i = 0; i < 15; i++) at30.update(1 / 30);
  assert.ok(Math.abs(at60.state.cursorY - at30.state.cursorY) < 0.02);
});

test('changing selection restarts the panel fade', () => {
  const menu = createMenu(CATALOG, 0);
  for (let i = 0; i < 200; i++) menu.update(1 / 60);
  assert.equal(menu.state.panel, 1);
  menu.move(1);
  assert.equal(menu.state.panel, 0, 'the panel answers rather than flickering');
});

test('re-selecting the same row does not restart the fade', () => {
  const menu = createMenu(CATALOG, 0);
  for (let i = 0; i < 200; i++) menu.update(1 / 60);
  menu.to(0);
  assert.equal(menu.state.panel, 1);
});
