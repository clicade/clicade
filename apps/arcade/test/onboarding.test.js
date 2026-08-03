import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPrefs, savePrefs, needsOnboarding, ONBOARDING_VERSION } from '@clicade/tui';
import { createOnboarding, STEPS } from '../src/onboarding.js';
import { createSettings, SETTINGS, effective, FALLBACKS, optionIndex } from '../src/settings.js';
import { run } from '../src/main.js';

const CONFIG = mkdtempSync(join(tmpdir(), 'clicade-onboard-'));
process.env.CLICADE_CONFIG_DIR = CONFIG;
process.on('exit', () => rmSync(CONFIG, { recursive: true, force: true }));

// --- the flow, as data -----------------------------------------------------

test('the flow opens on a welcome and closes on a confirmation', () => {
  assert.equal(STEPS[0].kind, 'welcome');
  assert.equal(STEPS[STEPS.length - 1].kind, 'done');
});

test('every question it asks is a real setting', () => {
  // Onboarding walking its own copy of the choices is how the two screens
  // drift apart, so it may only reference keys settings.js defines.
  for (const step of STEPS.filter((s) => s.kind === 'choice')) {
    assert.ok(
      SETTINGS.some((s) => s.key === step.key),
      `${step.key} is asked about but is not a setting`,
    );
  }
});

test('it asks about the two things a terminal cannot report', () => {
  const asked = STEPS.filter((s) => s.kind === 'choice').map((s) => s.key);
  assert.ok(asked.includes('contrast'));
  assert.ok(asked.includes('surface'));
});

// --- measured suggestions --------------------------------------------------

test('setup opens on the measured suggestion, not the generic default', () => {
  // Size is the one question with a measurable answer. Asking someone to guess
  // at it when we can count the columns ourselves is a wasted question.
  const flow = createOnboarding({}, { scale: 'compact' });
  assert.equal(flow.state.values.scale, 'compact');
  assert.notEqual(flow.state.values.scale, FALLBACKS.scale);
});

test('a saved choice outranks anything measured', () => {
  // A detected value is a guess; a saved one is an answer. Letting the guess
  // win would silently undo a decision the player made on purpose.
  const flow = createOnboarding({ scale: 'roomy' }, { scale: 'compact' });
  assert.equal(flow.state.values.scale, 'roomy');
});

test('a suggestion for a setting the player never touched still applies', () => {
  const flow = createOnboarding({ contrast: 'high' }, { scale: 'compact' });
  assert.equal(flow.state.values.contrast, 'high', 'their answer kept');
  assert.equal(flow.state.values.scale, 'compact', 'our guess used');
});

test('no suggestion at all leaves the flow exactly as it was', () => {
  assert.deepEqual(createOnboarding({}).state.values, createOnboarding({}, {}).state.values);
});

test('stepping forward reaches the end and then stops', () => {
  const flow = createOnboarding({});
  for (let i = 0; i < STEPS.length - 1; i++) assert.equal(flow.next(), true);
  assert.equal(flow.next(), false, 'the last step finishes rather than overrunning');
  assert.equal(flow.state.finished, true);
});

test('stepping back stops at the first step', () => {
  const flow = createOnboarding({});
  flow.next();
  assert.equal(flow.back(), true);
  assert.equal(flow.back(), false);
  assert.equal(flow.state.step, 0);
});

test('choices wrap and only apply on a question step', () => {
  const flow = createOnboarding({});
  assert.equal(flow.cycle(1), null, 'the welcome step has nothing to choose');

  flow.next();
  const definition = flow.definition();
  const first = flow.state.values[definition.key];
  flow.cycle(1);
  assert.notEqual(flow.state.values[definition.key], first);

  for (let i = 1; i < definition.options.length; i++) flow.cycle(1);
  assert.equal(flow.state.values[definition.key], first, 'wraps back around');
});

test('finishing records the version so it is not asked again', () => {
  const flow = createOnboarding({});
  const merged = flow.merged({}, ONBOARDING_VERSION);
  assert.equal(merged.onboarded, ONBOARDING_VERSION);
  assert.equal(needsOnboarding(merged), false);
});

test('skipping still counts as answered', () => {
  // Re-asking every launch is the nagging this flow exists to avoid.
  const flow = createOnboarding({});
  flow.skip();
  assert.equal(needsOnboarding(flow.merged({}, ONBOARDING_VERSION)), false);
});

test('choices made before skipping are kept', () => {
  const flow = createOnboarding({});
  flow.next();
  flow.cycle(1);
  const chosen = flow.state.values[flow.definition().key];
  flow.skip();
  assert.equal(flow.merged({}, ONBOARDING_VERSION)[STEPS[1].key], chosen);
});

test('existing preferences are the starting point, not the defaults', () => {
  const flow = createOnboarding({ contrast: 'high', theme: 'noir' });
  assert.equal(flow.state.values.contrast, 'high');
  assert.equal(flow.state.values.theme, 'noir');
});

test('a bumped version re-offers setup to someone who finished an older one', () => {
  assert.equal(needsOnboarding({ onboarded: ONBOARDING_VERSION - 1 }), true);
  assert.equal(needsOnboarding({ onboarded: ONBOARDING_VERSION }), false);
  assert.equal(needsOnboarding({}), true);
  assert.equal(needsOnboarding(null), true);
});

// --- settings --------------------------------------------------------------

test('unset preferences resolve to the documented fallbacks', () => {
  assert.deepEqual(effective({}), FALLBACKS);
  assert.deepEqual(effective({ contrast: null }).contrast, FALLBACKS.contrast);
});

test('a stored value beats the fallback, including a falsy one', () => {
  // `mono: false` is a real choice and must not be mistaken for unset.
  assert.equal(effective({ mono: false }).mono, false);
  assert.equal(effective({ mono: true }).mono, true);
});

test('cycling a setting wraps through every option', () => {
  const settings = createSettings({});
  const definition = settings.current();
  const seen = new Set();
  for (let i = 0; i < definition.options.length; i++) {
    seen.add(settings.state.values[definition.key]);
    settings.cycle(1);
  }
  assert.equal(seen.size, definition.options.length);
});

test('cycling backwards is the inverse of forwards', () => {
  const settings = createSettings({});
  const key = settings.current().key;
  const before = settings.state.values[key];
  settings.cycle(1);
  settings.cycle(-1);
  assert.equal(settings.state.values[key], before);
});

test('the setting cursor wraps at both ends', () => {
  const settings = createSettings({});
  settings.move(-1);
  assert.equal(settings.state.index, SETTINGS.length - 1);
  settings.move(1);
  assert.equal(settings.state.index, 0);
});

test('the highlight eases toward its target and settles exactly', () => {
  const settings = createSettings({});
  settings.move(1);
  assert.equal(settings.state.cursorY, 0, 'it has not moved yet');
  settings.update(1 / 60);
  assert.ok(settings.state.cursorY > 0 && settings.state.cursorY < 1, 'mid-slide');
  for (let i = 0; i < 120; i++) settings.update(1 / 60);
  assert.equal(settings.state.cursorY, 1, 'and lands exactly, not near enough');
});

test('merged values sit on top of the untouched preferences', () => {
  const settings = createSettings({ theme: 'noir', onboarded: 1 });
  settings.set('contrast', 'high');
  const merged = settings.merged({ theme: 'noir', onboarded: 1 });
  assert.equal(merged.contrast, 'high');
  assert.equal(merged.onboarded, 1, 'unrelated preferences survive a settings edit');
});

test('every option list has a fallback that is actually in it', () => {
  for (const definition of SETTINGS) {
    assert.ok(
      definition.options.some((o) => o.value === FALLBACKS[definition.key]),
      `${definition.key} falls back to a value it does not offer`,
    );
    assert.ok(optionIndex(definition, FALLBACKS[definition.key]) >= 0);
  }
});

test('an unrecognised stored value falls back instead of showing nothing', () => {
  const definition = SETTINGS[0];
  assert.equal(optionIndex(definition, 'nonsense'), optionIndex(definition, FALLBACKS[definition.key]));
});

test('every setting has help text and every option a note', () => {
  for (const definition of SETTINGS) {
    assert.ok(definition.help?.length > 0, `${definition.key} has no help`);
    for (const option of definition.options) {
      assert.ok(option.note?.length > 0, `${definition.key}/${option.label} has no note`);
    }
  }
});

// --- wired up --------------------------------------------------------------

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
  rows: 32,
  platform: 'test',
};

function session(keys, argv = []) {
  const stdin = fakeStdin();
  const pending = [...keys];
  const timer = setInterval(() => {
    stdin.emit('data', pending.length ? pending.shift() : 'q');
  }, 5);

  return run({
    argv,
    env: { caps: { ...CAPS }, stream: { write: () => {}, columns: 100, rows: 32 }, stdin },
  }).finally(() => clearInterval(timer));
}

test('a first run opens onto setup and remembers finishing it', async () => {
  savePrefs({});
  assert.equal(needsOnboarding(loadPrefs()), true);

  // enter through every step, then q out of the menu it lands on.
  await session([...STEPS.map(() => '\r'), 'q']);

  assert.equal(needsOnboarding(loadPrefs()), false, 'a second launch must not ask again');
});

test('setup can be reopened on demand after it was completed', async () => {
  savePrefs({ onboarded: ONBOARDING_VERSION });
  const code = await session(['\x1b', 'q'], ['--setup']);
  assert.equal(code, 0);
});

test('choices made during setup are persisted', async () => {
  savePrefs({});
  // Step past welcome, change the first question, then run to the end.
  await session(['\r', '\x1b[C', ...STEPS.map(() => '\r'), 'q']);

  const prefs = loadPrefs();
  const first = SETTINGS.find((s) => s.key === STEPS[1].key);
  assert.notEqual(prefs[first.key], null, 'the choice was never written');
  assert.ok(first.options.some((o) => o.value === prefs[first.key]));
});

test('quitting during setup leaves rather than trapping the player', async () => {
  // q used to do nothing here, which left Ctrl-C as the only way out.
  savePrefs({});
  const code = await session(['q']);
  assert.equal(code, 0);
});

test('--settings opens settings directly', async () => {
  savePrefs({ onboarded: ONBOARDING_VERSION });
  const code = await session(['\x1b', 'q'], ['--settings']);
  assert.equal(code, 0);
});

test('a change made in settings is saved', async () => {
  savePrefs({ onboarded: ONBOARDING_VERSION, contrast: 'normal' });
  // right cycles the first setting (contrast), esc returns, q quits.
  await session(['\x1b[C', '\x1b', 'q'], ['--settings']);
  assert.equal(loadPrefs().contrast, 'high');
});
