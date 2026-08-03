/**
 * The keyboard, driven the way a player drives it.
 *
 * game.test.js sets `state.cursor` directly, which is why it never noticed that
 * holding a card made the other row unreachable. These tests only ever press
 * keys, so a move that cannot be *navigated* fails here even when the
 * underlying rule is fine.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { onKey } from '../src/main.js';

function memorySave() {
  let data = { games: 0, won: 0, bestMoves: null, bestSeconds: null, streak: 0 };
  return { load: () => ({ ...data }), save: (d) => ((data = d), true) };
}

function table(setup) {
  const game = createGame({ seed: 5, save: memorySave() });
  game.update(2);
  setup?.(game);

  const ctx = { quit: () => {}, quits: 0 };
  const press = (...names) => {
    for (const name of names) {
      onKey({ name, shift: false, ctrl: false, alt: false }, ctx, game);
      game.update(0.5);
    }
  };
  return { game, press, ctx };
}

const c = (rank, suit, faceUp = true) => ({ rank, suit, faceUp });

/** Bare table: nothing to distract the cursor. */
function clear(game) {
  game.state.stock = [];
  game.state.waste = [];
  game.state.foundations = [[], [], [], []];
  game.state.tableau = [[], [], [], [], [], [], []];
}

test('a card from the waste can be navigated down onto the tableau', () => {
  // The reported bug: a Jack sat on the waste with a black Queen waiting, and
  // there was no key sequence that would bring it down.
  const { game, press } = table((g) => {
    clear(g);
    g.state.waste = [c('J', 'h')];
    g.state.tableau[1] = [c('Q', 's')];
    g.state.cursor = { row: 'top', col: 1 };
  });

  press('space', 'down', 'space');

  assert.equal(game.state.cursor.col, 1, 'the waste sits over column 1');
  assert.deepEqual(game.state.tableau[1].map((x) => x.rank + x.suit), ['Qs', 'Jh']);
  assert.equal(game.state.waste.length, 0);
});

test('tab crosses rows while holding a card', () => {
  const { game, press } = table((g) => {
    clear(g);
    g.state.waste = [c('J', 'h')];
    g.state.tableau[1] = [c('Q', 's')];
    g.state.cursor = { row: 'top', col: 1 };
  });

  press('space', 'tab', 'space');
  assert.equal(game.state.tableau[1].length, 2);
});

test('a tableau card can be navigated up to a foundation', () => {
  const { game, press } = table((g) => {
    clear(g);
    g.state.tableau[0] = [c('A', 'd')];
    g.state.cursor = { row: 'tableau', col: 0 };
  });

  // up: the run cannot grow, so it crosses to the top row.
  press('space', 'up');
  assert.equal(game.state.cursor.row, 'top');

  // Walk to the first foundation and drop.
  while (game.cursorTarget().zone !== 'foundation') press('right');
  press('space');

  assert.equal(game.state.foundations.flat().length, 1);
  assert.equal(game.state.tableau[0].length, 0);
});

test('up resizes the run before it changes rows', () => {
  const { game, press } = table((g) => {
    clear(g);
    g.state.tableau[0] = [c('K', 's', false), c('J', 's'), c('10', 'h')];
    g.state.cursor = { row: 'tableau', col: 0 };
  });

  press('space');
  assert.equal(game.selectedRun().length, 2, 'the whole run is picked up by default');

  press('down');
  assert.equal(game.selectedRun().length, 1, 'down shrinks it first');
  assert.equal(game.state.cursor.row, 'tableau', 'and does not leave the row yet');

  press('down');
  assert.equal(game.state.cursor.row, 'top', 'only once it cannot shrink further');
});

test('a card can be pulled back off a foundation onto the tableau', () => {
  const { game, press } = table((g) => {
    clear(g);
    g.state.foundations[0] = [c('A', 's'), c('2', 's')];
    g.state.tableau[3] = [c('3', 'h')];
    g.state.cursor = { row: 'top', col: 2 };
  });

  press('space', 'down', 'space');

  assert.equal(game.state.cursor.col, 3, 'foundation 0 sits over column 3');
  assert.deepEqual(game.state.tableau[3].map((x) => x.rank + x.suit), ['3h', '2s']);
  assert.equal(game.state.foundations[0].length, 1);
});

test('holding a card never traps the cursor in one row', () => {
  // The general form of the bug: whatever is held, both rows stay reachable.
  for (const start of [
    { row: 'top', col: 1 },
    { row: 'tableau', col: 0 },
  ]) {
    const { game, press } = table((g) => {
      clear(g);
      g.state.waste = [c('9', 'h')];
      g.state.tableau[0] = [c('K', 'c')];
      g.state.cursor = { ...start };
    });

    press('space');
    assert.ok(game.state.selection, 'something must be held for this to mean anything');

    const before = game.state.cursor.row;
    press('down', 'down', 'down');
    press('up', 'up', 'up');
    const reached = new Set([before, game.state.cursor.row]);

    press('tab');
    reached.add(game.state.cursor.row);
    assert.equal(reached.size, 2, `stuck in the ${before} row while holding a card`);
  }
});

test('escape puts the cards back and frees the cursor', () => {
  const { game, press } = table((g) => {
    clear(g);
    g.state.tableau[0] = [c('K', 's')];
    g.state.cursor = { row: 'tableau', col: 0 };
  });

  press('space');
  assert.ok(game.state.selection);
  press('escape');
  assert.equal(game.state.selection, null);

  press('up');
  assert.equal(game.state.cursor.row, 'top');
});

test('digits jump to a tableau column from either row', () => {
  const { game, press } = table((g) => {
    g.state.cursor = { row: 'top', col: 0 };
  });

  press('5');
  assert.deepEqual(game.state.cursor, { row: 'tableau', col: 4 });
});

test('keys are ignored while the deal is still in flight', () => {
  const game = createGame({ seed: 5, save: memorySave() });
  const ctx = { quit: () => {} };
  onKey({ name: 'space', shift: false, ctrl: false, alt: false }, ctx, game);
  assert.equal(game.state.selection, null);
  assert.equal(game.state.waste.length, 0, 'the stock must not be drawn mid-deal');
});

test('q quits and shift+a autoplays', () => {
  let quits = 0;
  const game = createGame({ seed: 5, save: memorySave() });
  game.update(2);
  game.state.tableau = [[c('A', 's')], [], [], [], [], [], []];
  game.state.waste = [];

  onKey({ name: 'a', shift: true, ctrl: false, alt: false }, { quit: () => quits++ }, game);
  assert.equal(game.state.foundations.flat().length, 1);

  onKey({ name: 'q', shift: false, ctrl: false, alt: false }, { quit: () => quits++ }, game);
  assert.equal(quits, 1);
});

// --- turning the stock over ------------------------------------------------

test('d cycles the whole stock and comes back round', () => {
  // Reported as "I can't cycle through the card pile". The mechanism was fine;
  // nothing on screen said the key existed. This asserts the cycle itself so a
  // regression in the mechanism cannot hide behind that.
  const { game, press } = table();
  const { state } = game;
  const total = state.stock.length;
  assert.ok(total > 0, 'the deal left nothing in the stock');

  while (state.stock.length) press('d');
  assert.equal(state.waste.length, total, 'the whole stock reached the waste');

  press('d');
  assert.equal(state.stock.length, total, 'the waste did not go back to the stock');
  assert.equal(state.waste.length, 0);
  assert.equal(state.passes, 1);
});

test('the pile can be cycled again and again', () => {
  const { game, press } = table();
  const { state } = game;
  for (let pass = 0; pass < 3; pass++) {
    while (state.stock.length) press('d');
    press('d');
  }
  assert.equal(state.passes, 3, 'cycling stopped working after a pass or two');
});

test('space on the stock turns it over, so the cursor alone is enough', () => {
  // A player who never discovers `d` still has to be able to play.
  const { game, press } = table((g) => {
    g.state.cursor = { row: 'tableau', col: 0 };
  });
  const { state } = game;

  press('up');
  assert.deepEqual(state.cursor, { row: 'top', col: 0 }, 'up from column 0 lands on the stock');

  const before = state.stock.length;
  press('space');
  assert.ok(state.stock.length < before, 'space on the stock drew nothing');
  assert.equal(state.selection, null, 'drawing must not leave a card in hand');
});

test('space recycles once the stock is empty', () => {
  const { game, press } = table((g) => {
    g.state.cursor = { row: 'top', col: 0 };
  });
  const { state } = game;
  while (state.stock.length) press('space');
  assert.equal(state.waste.length > 0, true);

  press('space');
  assert.ok(state.stock.length > 0, 'the empty stock refused to recycle');
});

test('recycling can be undone like any other move', () => {
  const { game, press } = table();
  const { state } = game;
  while (state.stock.length) press('d');
  press('d');
  assert.equal(state.passes, 1);

  press('u');
  assert.equal(state.passes, 0, 'undo left the pass count wrong');
  assert.equal(state.stock.length, 0, 'undo did not put the waste back');
});
