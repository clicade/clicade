import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';

/** A save that lives only for the test, so no real profile is touched. */
function memorySave() {
  let data = { games: 0, won: 0, bestMoves: null, bestSeconds: null, streak: 0 };
  return { load: () => ({ ...data }), save: (d) => ((data = d), true) };
}

/** A dealt game with the opening animation already run out. */
function settled(seed = 1) {
  const game = createGame({ seed, save: memorySave() });
  for (let i = 0; i < 300; i++) game.update(1 / 60);
  return game;
}

const c = (rank, suit, faceUp = true) => ({ rank, suit, faceUp });

test('the deal is a Klondike deal', () => {
  const game = settled();
  assert.deepEqual(
    game.state.tableau.map((p) => p.length),
    [1, 2, 3, 4, 5, 6, 7],
  );
  assert.deepEqual(
    game.state.tableau.map((p) => p.filter((card) => card.faceUp).length),
    [1, 1, 1, 1, 1, 1, 1],
    'exactly one card face up per column',
  );
  assert.equal(game.state.stock.length, 24);
  assert.equal(game.state.waste.length, 0);
});

test('only the last card of each column is the face-up one', () => {
  for (const pile of settled().state.tableau) {
    assert.equal(pile[pile.length - 1].faceUp, true);
    assert.equal(pile.slice(0, -1).every((card) => !card.faceUp), true);
  }
});

test('the same seed deals the same game', () => {
  const a = settled(4242).state.tableau.flat().map((x) => x.rank + x.suit);
  const b = settled(4242).state.tableau.flat().map((x) => x.rank + x.suit);
  assert.deepEqual(a, b);
});

test('all 52 cards are dealt exactly once', () => {
  const game = settled();
  const all = [...game.state.stock, ...game.state.tableau.flat()];
  assert.equal(all.length, 52);
  assert.equal(new Set(all.map((x) => x.rank + x.suit)).size, 52);
});

test('input is refused while the deal is still in flight', () => {
  const game = createGame({ seed: 7, save: memorySave() });
  assert.equal(game.busy(), true);
  game.update(2);
  assert.equal(game.busy(), false);
});

// --- stock -----------------------------------------------------------------

test('drawing turns three cards face up onto the waste', () => {
  const game = settled();
  game.draw();
  assert.equal(game.state.waste.length, 3);
  assert.equal(game.state.stock.length, 21);
  assert.equal(game.state.waste.every((card) => card.faceUp), true);
});

test('the last draw takes whatever is left', () => {
  const game = settled();
  for (let i = 0; i < 8; i++) game.draw();
  assert.equal(game.state.stock.length, 0);
  assert.equal(game.state.waste.length, 24);
});

test('recycling preserves order so the deal stays solvable', () => {
  const game = settled();
  for (let i = 0; i < 8; i++) game.draw();
  const before = game.state.waste.map((x) => x.rank + x.suit);

  game.draw(); // recycle
  assert.equal(game.state.waste.length, 0);
  assert.equal(game.state.stock.length, 24);
  assert.equal(game.state.passes, 1);

  // Drawing again must hand back the same sequence it did the first time.
  game.draw();
  const redrawn = game.state.waste.map((x) => x.rank + x.suit);
  assert.deepEqual(redrawn, before.slice(0, 3));
});

test('drawing with nothing anywhere is refused, not crashed', () => {
  const game = settled();
  game.state.stock = [];
  game.state.waste = [];
  assert.equal(game.draw(), false);
  assert.match(game.state.message, /empty/);
});

// --- selection and moves ---------------------------------------------------

test('picking up a tableau pile takes the whole ordered run', () => {
  const game = settled();
  game.state.tableau[0] = [c('K', 's', false), c('J', 's'), c('10', 'h'), c('9', 'c')];
  game.state.cursor = { row: 'tableau', col: 0 };
  game.select();
  assert.equal(game.state.selection.from, 1, 'grabs from the top of the run, not the pile');
  assert.equal(game.selectedRun().length, 3);
});

test('a broken sequence yields only the cards that legally move together', () => {
  const game = settled();
  game.state.tableau[0] = [c('K', 's'), c('4', 'h'), c('9', 'c')];
  game.state.cursor = { row: 'tableau', col: 0 };
  game.select();
  assert.equal(game.selectedRun().length, 1, 'only the bottom card can travel');
});

test('a legal move relocates the run and turns over what it uncovered', () => {
  const game = settled();
  game.state.tableau[0] = [c('7', 'd', false), c('9', 'c')];
  game.state.tableau[1] = [c('10', 'h')];
  game.state.cursor = { row: 'tableau', col: 0 };
  game.select();
  game.state.cursor = { row: 'tableau', col: 1 };
  assert.equal(game.drop(), true);

  assert.deepEqual(game.state.tableau[1].map((x) => x.rank), ['10', '9']);
  assert.equal(game.state.tableau[0].length, 1);
  assert.equal(game.state.tableau[0][0].faceUp, true, 'the uncovered card turns over');
  assert.equal(game.state.moves, 1);
});

test('an illegal drop keeps the cards in hand', () => {
  const game = settled();
  game.state.tableau[0] = [c('9', 'c')];
  game.state.tableau[1] = [c('10', 'c')];
  game.state.cursor = { row: 'tableau', col: 0 };
  game.select();
  game.state.cursor = { row: 'tableau', col: 1 };

  assert.equal(game.drop(), false);
  assert.ok(game.state.selection, 'a misdrop must not cost the player their grip');
  assert.equal(game.state.moves, 0);
});

test('dropping onto the source pile cancels instead of moving', () => {
  const game = settled();
  game.state.cursor = { row: 'tableau', col: 3 };
  game.select();
  game.drop();
  assert.equal(game.state.selection, null);
  assert.equal(game.state.moves, 0);
});

test('foundations refuse a multi-card run', () => {
  const game = settled();
  game.state.tableau[0] = [c('2', 's'), c('A', 'h')];
  game.state.cursor = { row: 'tableau', col: 0 };
  game.select();
  assert.equal(game.selectedRun().length, 2);

  game.state.cursor = { row: 'top', col: 2 };
  assert.equal(game.drop(), false);
  assert.match(game.state.message, /one card at a time/);
});

test('cards cannot be put back on the stock or waste', () => {
  const game = settled();
  game.state.cursor = { row: 'tableau', col: 0 };
  game.select();
  game.state.cursor = { row: 'top', col: 1 };
  assert.equal(game.drop(), false);
});

test('adjusting the run cannot exceed the movable sequence', () => {
  const game = settled();
  game.state.tableau[0] = [c('K', 's', false), c('J', 's'), c('10', 'h')];
  game.state.cursor = { row: 'tableau', col: 0 };
  game.select();
  assert.equal(game.state.selection.from, 1);
  assert.equal(game.adjustRun(1), false, 'cannot reach past the face-down card');
  assert.equal(game.adjustRun(-1), true);
  assert.equal(game.selectedRun().length, 1);
  assert.equal(game.adjustRun(-1), false, 'cannot shrink below one card');
});

// --- foundation shortcuts --------------------------------------------------

test('the foundation shortcut sends the top card up', () => {
  const game = settled();
  game.state.tableau[2] = [c('4', 'h', false), c('A', 'd')];
  game.state.cursor = { row: 'tableau', col: 2 };

  assert.equal(game.autoLift(), true);
  assert.equal(game.state.foundations.some((p) => p.length === 1), true);
  assert.equal(game.state.tableau[2][0].faceUp, true);
});

test('the foundation shortcut refuses a card no pile wants', () => {
  const game = settled();
  game.state.tableau[2] = [c('9', 'c')];
  game.state.cursor = { row: 'tableau', col: 2 };
  assert.equal(game.autoLift(), false);
  assert.match(game.state.message, /no foundation/);
});

test('autoplay takes every safe card and leaves the rest', () => {
  const game = settled();
  game.state.stock = [];
  game.state.waste = [];
  game.state.foundations = [[], [], [], []];
  game.state.tableau = [
    [c('A', 's')],
    [c('A', 'h')],
    [c('A', 'd')],
    [c('A', 'c')],
    [c('2', 's')],
    [c('K', 'h')],
    [],
  ];

  assert.equal(game.autoplay(), true);
  assert.equal(game.state.foundations.flat().length, 5, 'four aces and the safe two');
  assert.deepEqual(game.state.tableau[5].map((x) => x.rank), ['K'], 'the King stays put');
});

test('autoplay reports honestly when there is nothing to do', () => {
  const game = settled();
  game.state.tableau = [[c('9', 'c')], [], [], [], [], [], []];
  game.state.waste = [];
  assert.equal(game.autoplay(), false);
  assert.match(game.state.message, /nothing safe/);
});

// --- undo ------------------------------------------------------------------

test('undo restores the table exactly', () => {
  const game = settled();
  const before = JSON.stringify(game.state.tableau);
  game.draw();
  assert.equal(game.state.waste.length, 3);

  assert.equal(game.undo(), true);
  assert.equal(game.state.waste.length, 0);
  assert.equal(game.state.stock.length, 24);
  assert.equal(JSON.stringify(game.state.tableau), before);
});

test('undo puts back a card that was turned over', () => {
  const game = settled();
  game.state.tableau[0] = [c('7', 'd', false), c('9', 'c')];
  game.state.tableau[1] = [c('10', 'h')];
  game.state.cursor = { row: 'tableau', col: 0 };
  game.select();
  game.state.cursor = { row: 'tableau', col: 1 };
  game.drop();
  assert.equal(game.state.tableau[0][0].faceUp, true);

  game.undo();
  assert.equal(game.state.tableau[0][0].faceUp, false, 'the reveal is undone too');
  assert.equal(game.state.moves, 0);
});

test('undo unwinds many moves in order', () => {
  const game = settled();
  game.draw();
  game.draw();
  game.draw();
  assert.equal(game.state.stock.length, 15);
  game.undo();
  assert.equal(game.state.stock.length, 18);
  game.undo();
  assert.equal(game.state.stock.length, 21);
  game.undo();
  assert.equal(game.state.stock.length, 24);
  assert.equal(game.canUndo, false);
});

test('undo with an empty history says so rather than throwing', () => {
  const game = settled();
  assert.equal(game.undo(), false);
  assert.match(game.state.message, /nothing to undo/);
});

// --- cursor ----------------------------------------------------------------

test('the cursor wraps within its row', () => {
  const game = settled();
  game.state.cursor = { row: 'tableau', col: 0 };
  game.moveCursor(-1);
  assert.equal(game.state.cursor.col, 6);
  game.moveCursor(1);
  assert.equal(game.state.cursor.col, 0);
});

test('switching rows clamps rather than pointing at nothing', () => {
  const game = settled();
  game.state.cursor = { row: 'tableau', col: 6 };
  game.switchRow();
  assert.equal(game.state.cursor.row, 'top');
  assert.equal(game.state.cursor.col, 5, 'the top row is shorter, so it clamps');
});

test('the cursor maps to the right zone', () => {
  const game = settled();
  game.state.cursor = { row: 'top', col: 0 };
  assert.deepEqual(game.cursorTarget(), { zone: 'stock', index: 0 });
  game.state.cursor = { row: 'top', col: 1 };
  assert.deepEqual(game.cursorTarget(), { zone: 'waste', index: 0 });
  game.state.cursor = { row: 'top', col: 5 };
  assert.deepEqual(game.cursorTarget(), { zone: 'foundation', index: 3 });
  game.state.cursor = { row: 'tableau', col: 4 };
  assert.deepEqual(game.cursorTarget(), { zone: 'tableau', index: 4 });
});

test('selecting the stock draws instead of picking up a face-down card', () => {
  const game = settled();
  game.state.cursor = { row: 'top', col: 0 };
  game.select();
  assert.equal(game.state.waste.length, 3);
  assert.equal(game.state.selection, null);
});

// --- hints and winning -----------------------------------------------------

test('hints list the legal landings and clear on the next action', () => {
  const game = settled();
  game.state.tableau[0] = [c('9', 'c')];
  game.state.tableau[1] = [c('10', 'h')];
  game.state.cursor = { row: 'tableau', col: 0 };

  const hints = game.hint();
  assert.deepEqual(hints, [{ zone: 'tableau', index: 1 }]);
  assert.deepEqual(game.state.hints, hints);

  game.moveCursor(1);
  assert.deepEqual(game.state.hints, [], 'stale hints must not survive a move');
});

test('completing the foundations wins and records the result', () => {
  const save = memorySave();
  const game = createGame({ seed: 3, save });
  game.update(2);

  const full = (suit) =>
    ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q'].map((r) => c(r, suit));
  game.state.foundations = [full('s'), full('h'), full('d'), full('c')];
  game.state.tableau = [[c('K', 's')], [], [], [], [], [], []];
  game.state.waste = [];
  game.state.stock = [];
  game.state.cursor = { row: 'tableau', col: 0 };

  // Three Kings placed directly, the fourth played through the real path.
  game.state.foundations[1].push(c('K', 'h'));
  game.state.foundations[2].push(c('K', 'd'));
  game.state.foundations[3].push(c('K', 'c'));
  assert.equal(game.autoLift(), true);

  assert.equal(game.state.won, true);
  assert.match(game.state.message, /win/);
  assert.equal(save.load().won, 1);
  assert.equal(save.load().bestMoves, game.state.moves);
});

test('the clock stops once the game is won', () => {
  const game = settled();
  game.state.won = true;
  const at = game.state.elapsed;
  game.update(1);
  assert.equal(game.state.elapsed, at);
});

test('a new deal resets the table but keeps lifetime stats', () => {
  const save = memorySave();
  const game = createGame({ seed: 9, save });
  game.update(2);
  game.draw();
  game.deal(11);
  game.update(2);

  assert.equal(game.state.moves, 0);
  assert.equal(game.state.waste.length, 0);
  assert.equal(game.canUndo, false);
  assert.equal(game.state.stats.games, 2, 'both deals counted');
});
