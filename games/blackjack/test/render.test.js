/**
 * The table, and the buttons on it.
 *
 * Buttons are the one thing here that can be wrong in a way the eye cannot
 * catch: drawn in one place and clickable in another looks perfect in a
 * screenshot. So these assert the drawing and the hit region together.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScreen, createStage, glyphs } from '@clicade/tui';
import { resolveTheme, createButtons } from '@clicade/kit';
import { createGame } from '../src/game.js';
import { render, layout, actionsFor, MIN_W, MIN_H } from '../src/render.js';

function memorySave(bankroll = 500) {
  let data = { bankroll, rounds: 0, won: 0, lost: 0, pushed: 0, blackjacks: 0, peak: bankroll };
  return { load: () => ({ ...data }), save: (d) => ((data = d), true) };
}

const card = (rank, suit = 's') => ({ rank, suit, faceUp: true });

/** A game parked in the player phase with a hand we choose. */
function playing({ cards = ['5', '9'], bet = 25, bankroll = 500 } = {}) {
  const game = createGame({ save: memorySave(bankroll) });
  for (let i = 0; i < 200; i++) game.update(1 / 60);

  const { state } = game;
  state.phase = 'player';
  state.active = 0;
  state.bankroll = bankroll;
  state.hands = [
    { cards: cards.map((r, i) => card(r, i === 0 ? 's' : 'h')), bet, outcome: null, done: false },
  ];
  state.dealer = { cards: [card('K', 'd'), card('7', 'c')], revealed: false, flip: 0 };
  return game;
}

function frameWithButtons(cols, rows, opts = {}) {
  const caps = {
    colorDepth: 0,
    unicode: opts.unicode ?? true,
    altScreen: false,
    isTTY: true,
    cols,
    rows,
  };
  const screen = createScreen({ caps, stream: { write: () => {}, columns: cols, rows } });
  screen.enter();
  const stage = createStage({ screen, fill: true, minWidth: MIN_W, minHeight: MIN_H });
  stage.measure();

  const game = opts.game ?? playing(opts.hand);
  const buttons = createButtons();
  const g = glyphs(caps);
  render(stage, g, game, resolveTheme({ theme: 'noir' }), {
    glyphs: g,
    colorAvailable: true,
    mono: false,
    buttons,
  });

  return { text: screen.toText(), buttons, game, L: layout(stage.width, stage.height) };
}

// --- what is offered -------------------------------------------------------

test('every action is shown while playing, including the ones not available', () => {
  // Deliberately the opposite of solitaire's rule that inapplicable hints are
  // hidden. The four actions *are* blackjack: seeing that double and split
  // exist, greyed because this hand is not a pair, is how the table teaches
  // the game.
  const ids = actionsFor(playing({ cards: ['5', '9'] }), {}, {}).map((a) => a.id);
  for (const id of ['h', 's', 'd', 'p']) {
    assert.ok(ids.includes(id), `${id} is missing while playing`);
  }
});

test('split is offered on a pair and disabled otherwise', () => {
  const pair = actionsFor(playing({ cards: ['8', '8'] }), {}, {}).find((a) => a.id === 'p');
  const notPair = actionsFor(playing({ cards: ['8', '9'] }), {}, {}).find((a) => a.id === 'p');
  assert.equal(pair.enabled, true);
  assert.equal(notPair.enabled, false);
});

test('double is disabled when the chips are not there', () => {
  const broke = playing({ cards: ['5', '6'], bet: 100, bankroll: 10 });
  assert.equal(actionsFor(broke, {}, {}).find((a) => a.id === 'd').enabled, false);
});

test('every action carries the key that performs it and a label', () => {
  // The id is the key a click dispatches, so the mouse cannot do something the
  // keyboard cannot.
  for (const action of actionsFor(playing(), {}, {})) {
    assert.ok(action.id, 'an action with no key could only ever be clicked');
    assert.ok(action.label, `${action.id} has no label`);
  }
});

test('the colour button only appears where there is colour to toggle', () => {
  const withColor = actionsFor(playing(), { colorAvailable: true }, {}).map((a) => a.id);
  const without = actionsFor(playing(), { colorAvailable: false }, {}).map((a) => a.id);
  assert.ok(withColor.includes('f2'));
  assert.ok(!without.includes('f2'));
});

test('quit is available in every phase', () => {
  const game = playing();
  for (const phase of ['betting', 'player', 'settle', 'broke']) {
    game.state.phase = phase;
    assert.ok(
      actionsFor(game, {}, {}).some((a) => a.id === 'q'),
      `no way out during ${phase}`,
    );
  }
});

// --- drawn where they are clickable ----------------------------------------

test('buttons land where they are drawn, at both layouts', () => {
  for (const rows of [24, 30]) {
    const { text, buttons, L } = frameWithButtons(80, rows);
    const hit = buttons.regions.find((r) => r.id === 'h');
    assert.ok(hit, `no hit button at ${rows} rows`);

    const line = text.split('\n')[hit.y + (L.buttonsBoxed ? 1 : 0)] ?? '';
    assert.ok(
      line.slice(hit.x, hit.x + hit.w).includes('hit'),
      `at ${rows} rows the hit button is not drawn where it is clickable`,
    );
  }
});

test('a disabled button is drawn but refuses the click', () => {
  const { buttons } = frameWithButtons(80, 30, { hand: { cards: ['5', '9'] } });
  const split = buttons.regions.find((r) => r.id === 'p');
  assert.ok(split, 'split was hidden rather than disabled');
  assert.equal(split.enabled, false);

  buttons.handle({ type: 'down', button: 'left', x: split.x + 1, y: split.y + 1 });
  assert.equal(buttons.handle({ type: 'up', button: 'left', x: split.x + 1, y: split.y + 1 }), null);
});

test('clicking hit returns the key hit is bound to', () => {
  const { buttons } = frameWithButtons(80, 30);
  const region = buttons.regions.find((r) => r.id === 'h');
  buttons.handle({ type: 'down', button: 'left', x: region.x + 1, y: region.y + 1 });
  assert.equal(buttons.handle({ type: 'up', button: 'left', x: region.x + 1, y: region.y + 1 }), 'h');
});

test('the buttons follow the phase', () => {
  const game = playing();
  game.state.phase = 'betting';
  const { buttons } = frameWithButtons(80, 30, { game });
  const ids = buttons.regions.map((r) => r.id);
  assert.ok(ids.includes('enter'), 'no way to deal');
  assert.ok(!ids.includes('h'), 'hit is offered before any cards are dealt');
});

// --- fitting ---------------------------------------------------------------

test('a short window keeps the buttons without growing the minimum', () => {
  // 80x24 is still the commonest terminal there is. Buttons must not cost
  // anyone the ability to play.
  const { L, buttons } = frameWithButtons(80, MIN_H);
  assert.equal(L.buttonsBoxed, false, 'bordered buttons do not fit a short window');
  assert.ok(L.buttonsY < L.rulesY, 'the buttons sit on top of the rules line');
  assert.ok(buttons.regions.length > 0, 'the short layout lost its buttons entirely');
  assert.equal(MIN_H, 22, 'the minimum window grew');
});

test('nothing overflows the smallest window', () => {
  for (const line of frameWithButtons(MIN_W, MIN_H).text.split('\n')) {
    assert.ok(line.length <= MIN_W, `line ${line.length} wide in a ${MIN_W} window: ${line}`);
  }
});

test('buttons draw nothing an ASCII terminal cannot render', () => {
  const { text } = frameWithButtons(80, 30, { unicode: false });
  const bad = [...text].find((ch) => ch.codePointAt(0) > 0x7f);
  assert.equal(bad, undefined, `leaked ${JSON.stringify(bad)}`);
});

test('the table still draws with no button set at all', () => {
  // Golden-frame tests, and any caller that does not want the mouse, must not
  // have to provide one.
  const caps = { colorDepth: 0, unicode: true, altScreen: false, isTTY: true, cols: 80, rows: 30 };
  const screen = createScreen({ caps, stream: { write: () => {}, columns: 80, rows: 30 } });
  screen.enter();
  const stage = createStage({ screen, fill: true, minWidth: MIN_W, minHeight: MIN_H });
  stage.measure();
  const g = glyphs(caps);

  assert.doesNotThrow(() =>
    render(stage, g, playing(), resolveTheme({ theme: 'noir' }), { glyphs: g }),
  );
  assert.match(screen.toText(), /hit/, 'the actions vanished without a button set');
});
