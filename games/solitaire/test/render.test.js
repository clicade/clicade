import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScreen, createStage, glyphs } from '@clicade/tui';
import { getTheme } from '@clicade/kit';
import { createGame } from '../src/game.js';
import { pileOffsets } from '@clicade/kit';
import {
  render,
  layout,
  controlsFor,
  controlsWidth,
  minSize,
  recommendedSize,
  MIN_W,
  MIN_H,
} from '../src/render.js';

function memorySave() {
  let data = { games: 0, won: 0, bestMoves: null, bestSeconds: null, streak: 0 };
  return { load: () => ({ ...data }), save: (d) => ((data = d), true) };
}

function frame(cols, rows, { unicode = true, seed = 20260803, act } = {}) {
  const caps = { colorDepth: 0, unicode, altScreen: false, isTTY: true, cols, rows };
  const screen = createScreen({ caps, stream: { write: () => {}, columns: cols, rows } });
  screen.enter();

  const stage = createStage({ screen, fill: true, minWidth: MIN_W, minHeight: MIN_H });
  stage.measure();

  const game = createGame({ seed, save: memorySave() });
  for (let i = 0; i < 300; i++) game.update(1 / 60);
  act?.(game);
  for (let i = 0; i < 60; i++) game.update(1 / 60);

  const g = glyphs(caps);
  render(stage, g, game, getTheme('felt'), { colorAvailable: true, mono: false, glyphs: g });
  return { text: screen.toText(), game, stage };
}

test('the table draws at the smallest supported window', () => {
  const { text } = frame(MIN_W, MIN_H);
  assert.match(text, /SOLITAIRE/);
  assert.match(text, /moves/);
  assert.match(text, /quit/);
});

test('nothing overflows the smallest window', () => {
  for (const line of frame(MIN_W, MIN_H).text.split('\n')) {
    assert.ok(line.length <= MIN_W, `line ${line.length} wide in a ${MIN_W} window`);
  }
});

test('an ASCII terminal gets no characters it cannot draw', () => {
  const { text } = frame(MIN_W, MIN_H, { unicode: false });
  const exotic = [...text].find((ch) => ch.codePointAt(0) > 0x7f);
  assert.equal(exotic, undefined, `non-ASCII character ${JSON.stringify(exotic)} leaked through`);
});

test('the stock count never lands on the tableau cursor row', () => {
  // Both used to occupy the row below the top card, and the count won.
  const L = layout(MIN_W, MIN_H);
  const countRow = L.topY + 5 + 1;
  assert.notEqual(countRow, L.tableauY - 1);
});

test('the layout keeps the footer inside the window at every height', () => {
  for (let h = MIN_H; h <= 60; h++) {
    const L = layout(MIN_W, h);
    assert.ok(L.statusY < h);
    assert.ok(L.tableauY + L.tableauH <= L.controlsY, `tableau runs into the footer at h=${h}`);
  }
});

test('a wide terminal centres the board instead of stretching it', () => {
  const narrow = layout(MIN_W, 30);
  const wide = layout(200, 30);
  assert.equal(wide.colX(1) - wide.colX(0), narrow.colX(1) - narrow.colX(0));
  assert.ok(wide.x0 > narrow.x0);
});

test('held cards are offset, not merely recoloured', () => {
  // Colour alone would make the selection invisible in monochrome.
  const plain = frame(90, 32).text;
  const held = frame(90, 32, {
    act: (game) => {
      game.state.cursor = { row: 'tableau', col: 6 };
      game.select();
    },
  }).text;
  assert.notEqual(plain, held, 'picking a card must change the frame without colour');
});

test('face-down cards in a pile are not drawn as empty slots', () => {
  const { text } = frame(90, 32);
  // A compressed face-down card shows its back pattern, not a bare border.
  assert.match(text, /╭▒+╮/, 'covered face-down cards keep their pattern');
});

test('the win banner appears once the foundations are full', () => {
  const { text } = frame(90, 32, {
    act: (game) => {
      const suits = ['s', 'h', 'd', 'c'];
      game.state.foundations = suits.map((suit) =>
        ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map((rank) => ({
          rank,
          suit,
          faceUp: true,
        })),
      );
      game.state.won = true;
    },
  });
  assert.match(text, /YOU WIN/);
});

// --- footer trimming -------------------------------------------------------

// Carries a stock and a waste because the real one does, and the footer now
// asks about them. A double thin enough to omit them would only prove that the
// footer runs against a table that cannot exist.
const fakeGame = (held, canUndo, { stock = 10, waste = 0 } = {}) => ({
  state: {
    selection: held ? { zone: 'tableau', index: 0, from: 0 } : null,
    stock: new Array(stock).fill(null),
    waste: new Array(waste).fill(null),
  },
  canUndo,
});

test('the footer fits the window it is given', () => {
  for (const width of [MIN_W, 70, 80, 100, 200]) {
    const keys = controlsFor(fakeGame(true, true), { colorAvailable: true }, width);
    assert.ok(controlsWidth(keys) <= width, `footer ${controlsWidth(keys)} wide in ${width}`);
  }
});

test('trimming drops the optional hints and keeps the essential ones', () => {
  const keys = controlsFor(fakeGame(true, true), { colorAvailable: true }, MIN_W);
  const labels = keys.map(([, label]) => label);
  assert.ok(labels.includes('quit'), 'quit is never the one that falls off');
  assert.ok(labels.includes('move'));
  assert.ok(labels.includes('drop'));
});

test('quit stays last however much is trimmed', () => {
  for (const width of [MIN_W, 80, 200]) {
    const keys = controlsFor(fakeGame(true, true), { colorAvailable: true }, width);
    assert.equal(keys[keys.length - 1][1], 'quit');
  }
});

test('a wide window shows everything', () => {
  const labels = controlsFor(fakeGame(true, true), { colorAvailable: true }, 200).map((k) => k[1]);
  assert.deepEqual(labels, [
    'move',
    'take more',
    'drop',
    'row',
    'cancel',
    'foundation',
    'undo',
    'hint',
    'mono',
    'quit',
  ]);
});

// --- turning the stock over ------------------------------------------------

test('the footer says how to draw', () => {
  // It said nothing at all, which is how a player ends up believing the pile
  // is stuck: every other move can be found by pointing at a card, this one
  // cannot.
  const keys = controlsFor(fakeGame(false, false), {}, 200);
  assert.ok(
    keys.some(([key, label]) => key === 'd' && label === 'draw'),
    `no draw hint in: ${keys.map(([k, l]) => `${k} ${l}`).join(', ')}`,
  );
});

test('an empty stock offers to recycle rather than to draw', () => {
  const keys = controlsFor(fakeGame(false, false, { stock: 0, waste: 12 }), {}, 200);
  assert.ok(keys.some(([key, label]) => key === 'd' && label === 'recycle'));
  assert.ok(!keys.some(([, label]) => label === 'draw'));
});

test('with nothing left to turn over, the hint goes away', () => {
  // The rule this game already follows: hints that do not apply are absent,
  // not greyed out.
  const keys = controlsFor(fakeGame(false, false, { stock: 0, waste: 0 }), {}, 200);
  assert.ok(!keys.some(([key]) => key === 'd'));
});

test('the draw hint survives a window narrow enough to trim the others', () => {
  for (let w = MIN_W; w <= 120; w += 4) {
    const keys = controlsFor(fakeGame(false, false), {}, w);
    assert.ok(
      keys.some(([key]) => key === 'd'),
      `the draw hint was trimmed away at ${w} columns`,
    );
  }
});

test('an empty stock is marked as recyclable, not as a way back', () => {
  const { text } = frame(90, 32, {
    act: (game) => {
      while (game.state.stock.length) {
        game.draw();
        game.update(1);
      }
    },
  });

  // Only the board, not the footer — `◂▸ move` legitimately lives down there.
  const L = layout(90, 32);
  const board = text
    .split('\n')
    .slice(L.topY, L.topY + L.cardH)
    .join('\n');

  assert.ok(board.includes('↻'), 'no recycle mark on a stock that can be turned over');
  assert.ok(!board.includes('◂'), 'a left arrow reads as "go back", and there is no back');
});

test('a stock and waste that are both empty is not offered as recyclable', () => {
  const { text } = frame(90, 32, {
    act: (game) => {
      game.state.stock = [];
      game.state.waste = [];
    },
  });
  assert.ok(!text.includes('↻'), 'offered a recycle with nothing to recycle');
});

test('hints that do not apply are absent rather than greyed out', () => {
  const labels = controlsFor(fakeGame(false, false), { colorAvailable: false }, 200).map((k) => k[1]);
  assert.equal(labels.includes('cancel'), false, 'nothing held, nothing to cancel');
  assert.equal(labels.includes('undo'), false, 'no history yet');
  assert.equal(labels.includes('mono'), false, 'no colour to toggle');
  assert.equal(labels.includes('pick up'), true);
});

// --- window requirements ---------------------------------------------------

test('the minimum is derived per size, not fixed at the widest', () => {
  // A single fixed minimum would make every player's requirement as wide as
  // Roomy, penalising exactly the people who chose Compact to avoid that.
  assert.ok(minSize('compact').width < minSize('normal').width);
  assert.ok(minSize('normal').width < minSize('roomy').width);
});

test('the minimum is the initial deal fitting uncompressed', () => {
  // Below this the deepest pile is a stripe before a card has been moved.
  for (const scale of ['compact', 'normal', 'roomy']) {
    const min = minSize(scale);
    const L = layout(min.width, min.height, scale);
    const deal = Array.from({ length: 7 }, (_, i) => ({
      rank: 'A',
      suit: 's',
      faceUp: i === 6,
    }));
    const { compressed } = pileOffsets(deal, { size: L.card, maxHeight: L.tableauH });
    assert.equal(compressed, false, `${scale} compresses the opening deal`);
  }
});

test('one row short of the minimum does compress, so the floor is not padding', () => {
  const min = minSize('normal');
  const L = layout(min.width, min.height - 1, 'normal');
  const deal = Array.from({ length: 7 }, (_, i) => ({ rank: 'A', suit: 's', faceUp: i === 6 }));
  assert.equal(pileOffsets(deal, { size: L.card, maxHeight: L.tableauH }).compressed, true);
});

test('the recommended window is taller than the minimum, and no wider', () => {
  // Extra width is only margin around a centred board; extra height is the
  // room a mid-game pile actually needs.
  for (const scale of ['compact', 'normal', 'roomy']) {
    assert.equal(recommendedSize(scale).width, minSize(scale).width, scale);
    assert.ok(recommendedSize(scale).height > minSize(scale).height, scale);
  }
});

test('compact buys width, and barely any height', () => {
  // The honest claim, asserted so the copy cannot drift back to promising
  // that Compact rescues short windows.
  const saved = {
    width: minSize('normal').width - minSize('compact').width,
    height: minSize('normal').height - minSize('compact').height,
  };
  assert.ok(saved.width >= 15, `only ${saved.width} columns saved`);
  assert.ok(saved.height <= 2, `${saved.height} rows saved — the copy should say so`);
});

