/**
 * Klondike state machine.
 *
 * Holds the table, the cursor, the selection and the undo stack. Every legality
 * question goes to rules.js; this file only decides what happens and when.
 *
 * Nothing here reads terminal dimensions. The cursor moves in pile indices, not
 * columns, so the layout can change without the game noticing.
 */

import { createRng, randomSeed, createDeck, createTimeline, ease } from '@clicade/kit';
import { createSave } from '@clicade/tui';
import {
  TABLEAU_PILES,
  DRAW_COUNT,
  canStackTableau,
  canStackFoundation,
  isMovableRun,
  firstFaceUp,
  top,
  foundationFor,
  isWon,
  isSafeToAutoplay,
  destinationsFor,
  TOP_SLOT_COLUMNS,
  nearestTopSlot,
} from './rules.js';

const DEAL_TIME = 0.16;
const DEAL_STAGGER = 0.022;
const FLIP_TIME = 0.18;
const MOVE_TIME = 0.13;

/** Top-row slots, left to right. The cursor walks this list. */
const TOP_SLOTS = ['stock', 'waste', 'foundation', 'foundation', 'foundation', 'foundation'];

const DEFAULT_SAVE = {
  games: 0,
  won: 0,
  bestMoves: null,
  bestSeconds: null,
  streak: 0,
};

export function createGame(opts = {}) {
  const store = opts.save ?? createSave('solitaire', DEFAULT_SAVE);
  const timeline = createTimeline();

  const state = {
    stock: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: [],
    /** `{row:'top'|'tableau', col:number}` */
    cursor: { row: 'tableau', col: 0 },
    /** `{row, col, from}` — `from` is the index the lifted run starts at. */
    selection: null,
    /** Destinations shown by the hint key. Cleared by anything that moves. */
    hints: [],
    seed: 0,
    moves: 0,
    passes: 0,
    elapsed: 0,
    dealing: false,
    won: false,
    message: '',
    stats: store.load(),
  };

  const undoStack = [];

  // --- setup ---------------------------------------------------------------

  function deal(seed = opts.seed ?? randomSeed()) {
    const rng = createRng(seed);
    const deck = rng.shuffle(createDeck(1)).map((card) => ({ ...card, faceUp: false }));

    state.seed = seed;
    state.stock = [];
    state.waste = [];
    state.foundations = [[], [], [], []];
    state.tableau = Array.from({ length: TABLEAU_PILES }, () => []);
    state.cursor = { row: 'tableau', col: 0 };
    state.selection = null;
    state.moves = 0;
    state.passes = 0;
    state.elapsed = 0;
    state.won = false;
    state.message = '';
    undoStack.length = 0;
    timeline.clear();

    let n = 0;
    for (let col = 0; col < TABLEAU_PILES; col++) {
      for (let row = col; row < TABLEAU_PILES; row++) {
        const card = deck.pop();
        card.faceUp = row === col;
        // Cards fly in from the stock corner; `anim.t` is read by the renderer.
        card.anim = { t: 0 };
        state.tableau[row].push(card);

        timeline.add({
          duration: DEAL_TIME,
          delay: n * DEAL_STAGGER,
          ease: ease.outCubic,
          onUpdate: (v) => {
            card.anim.t = v;
          },
          onComplete: () => {
            delete card.anim;
          },
        });
        n++;
      }
    }

    state.stock = deck;
    state.dealing = true;
    state.stats.games++;
    persist();
  }

  function persist() {
    store.save(state.stats);
  }

  // --- undo ----------------------------------------------------------------

  function snapshot() {
    undoStack.push({
      stock: state.stock.map(clone),
      waste: state.waste.map(clone),
      foundations: state.foundations.map((p) => p.map(clone)),
      tableau: state.tableau.map((p) => p.map(clone)),
      moves: state.moves,
      passes: state.passes,
    });
    // A whole game is at most a few hundred moves; keeping them all costs
    // nothing and unlimited undo is the difference between Klondike being
    // relaxing and being a memory test.
  }

  function clone(card) {
    // Deliberately drops `anim`: an undone move should land instantly rather
    // than replay the animation of the move being taken back.
    return { rank: card.rank, suit: card.suit, faceUp: card.faceUp };
  }

  function undo() {
    if (state.dealing || undoStack.length === 0) {
      state.message = undoStack.length === 0 ? 'nothing to undo' : '';
      return false;
    }
    const prev = undoStack.pop();
    state.stock = prev.stock;
    state.waste = prev.waste;
    state.foundations = prev.foundations;
    state.tableau = prev.tableau;
    state.moves = prev.moves;
    state.passes = prev.passes;
    state.selection = null;
    state.won = false;
    state.message = '';
    timeline.clear();
    return true;
  }

  // --- cursor --------------------------------------------------------------

  function rowLength(row) {
    return row === 'top' ? TOP_SLOTS.length : TABLEAU_PILES;
  }

  function moveCursor(delta) {
    const len = rowLength(state.cursor.row);
    state.cursor.col = (((state.cursor.col + delta) % len) + len) % len;
    state.message = '';
  }

  function switchRow() {
    // Cross to the slot that is visually above or below, not to the slot with
    // the same index. Foundation 0 is the third top-row slot but sits over the
    // fourth column, so index-matching sent the cursor sideways.
    if (state.cursor.row === 'top') {
      state.cursor = { row: 'tableau', col: TOP_SLOT_COLUMNS[state.cursor.col] ?? 0 };
    } else {
      state.cursor = { row: 'top', col: nearestTopSlot(state.cursor.col) };
    }
    state.message = '';
  }

  /** What the cursor is pointing at, as a zone descriptor. */
  function cursorTarget() {
    const { row, col } = state.cursor;
    if (row === 'tableau') return { zone: 'tableau', index: col };
    const slot = TOP_SLOTS[col];
    if (slot === 'foundation') return { zone: 'foundation', index: col - 2 };
    return { zone: slot, index: 0 };
  }

  function pileAt(target) {
    if (target.zone === 'tableau') return state.tableau[target.index];
    if (target.zone === 'foundation') return state.foundations[target.index];
    if (target.zone === 'waste') return state.waste;
    if (target.zone === 'stock') return state.stock;
    return [];
  }

  // --- stock ---------------------------------------------------------------

  function draw() {
    if (state.stock.length === 0) {
      if (state.waste.length === 0) {
        state.message = 'stock and waste are both empty';
        return false;
      }
      snapshot();
      // Recycling reverses the waste so the order is preserved across passes,
      // which is what makes a draw-three deal solvable rather than random.
      state.stock = state.waste.reverse().map((card) => ({ ...card, faceUp: false }));
      state.waste = [];
      state.passes++;
      state.selection = null;
      state.message = `pass ${state.passes + 1}`;
      return true;
    }

    snapshot();
    const n = Math.min(DRAW_COUNT, state.stock.length);
    for (let i = 0; i < n; i++) {
      const card = state.stock.pop();
      card.faceUp = true;
      card.anim = { t: 0 };
      timeline.add({
        duration: MOVE_TIME,
        delay: i * 0.04,
        onUpdate: (v) => {
          card.anim.t = v;
        },
        onComplete: () => delete card.anim,
      });
      state.waste.push(card);
    }
    state.selection = null;
    state.message = '';
    return true;
  }

  // --- selection and moves -------------------------------------------------

  /** The cards currently lifted, or an empty array. */
  function selectedRun() {
    if (!state.selection) return [];
    const pile = pileAt(state.selection);
    return pile.slice(state.selection.from);
  }

  function select() {
    const target = cursorTarget();

    if (target.zone === 'stock') return draw();

    const pile = pileAt(target);
    if (pile.length === 0) {
      state.message = 'nothing to pick up';
      return false;
    }

    if (target.zone === 'tableau') {
      const start = firstFaceUp(pile);
      if (start < 0) {
        state.message = 'no face-up cards in that pile';
        return false;
      }
      // Default to the largest legal run. Adjusting down with up/down is the
      // exception; taking the whole ordered sequence is what you want almost
      // every time, and making the common case free is the whole point.
      let from = start;
      while (from < pile.length && !isMovableRun(pile.slice(from))) from++;
      if (from >= pile.length) from = pile.length - 1;
      state.selection = { ...target, from };
    } else {
      state.selection = { ...target, from: pile.length - 1 };
    }

    state.message = '';
    return true;
  }

  /** Grow or shrink a lifted tableau run. */
  function adjustRun(delta) {
    if (!state.selection || state.selection.zone !== 'tableau') return false;
    const pile = pileAt(state.selection);
    const start = firstFaceUp(pile);
    if (start < 0) return false;

    const next = state.selection.from - delta;
    if (next < start || next > pile.length - 1) return false;
    if (!isMovableRun(pile.slice(next))) return false;

    state.selection.from = next;
    return true;
  }

  function cancel() {
    if (!state.selection) return false;
    state.selection = null;
    state.message = '';
    return true;
  }

  /**
   * Move the lifted run onto whatever the cursor points at.
   * Returns false and leaves the selection alone when the move is illegal, so
   * a mistaken drop doesn't cost the player their grip on the cards.
   */
  function drop() {
    const run = selectedRun();
    if (run.length === 0) return false;

    const target = cursorTarget();
    if (target.zone === 'stock' || target.zone === 'waste') {
      state.message = 'cards cannot go back there';
      return false;
    }
    if (target.zone === state.selection.zone && target.index === state.selection.index) {
      return cancel();
    }

    const destination = pileAt(target);

    if (target.zone === 'foundation') {
      if (run.length > 1) {
        state.message = 'foundations take one card at a time';
        return false;
      }
      if (!canStackFoundation(run[0], top(destination))) {
        state.message = 'that card does not go there';
        return false;
      }
    } else if (!canStackTableau(run[0], top(destination))) {
      state.message = top(destination) ? 'that card does not go there' : 'only a King starts a column';
      return false;
    }

    snapshot();
    const source = pileAt(state.selection);
    source.splice(state.selection.from, run.length);
    for (const card of run) destination.push(card);

    state.selection = null;
    state.moves++;
    state.message = '';
    revealIfNeeded(source);
    checkWin();
    return true;
  }

  /** Turn the newly exposed card of a tableau pile face up. */
  function revealIfNeeded(pile) {
    if (pile === state.stock || pile === state.waste) return;
    const card = top(pile);
    if (!card || card.faceUp) return;

    card.faceUp = true;
    card.flip = 0;
    timeline.add({
      duration: FLIP_TIME,
      ease: ease.inOutQuad,
      onUpdate: (v) => {
        // 1 → 0 → 1: the card narrows to an edge, then opens face up.
        card.flip = Math.abs(v * 2 - 1);
      },
      onComplete: () => delete card.flip,
    });
  }

  /** Send the card under the cursor to a foundation, if one will take it. */
  function autoLift() {
    const target = state.selection ?? cursorTarget();
    if (target.zone === 'foundation') return false;

    const pile = pileAt(target);
    const card = top(pile);
    if (!card || !card.faceUp) {
      state.message = 'nothing to play there';
      return false;
    }

    const index = foundationFor(card, state.foundations);
    if (index < 0) {
      state.message = 'no foundation wants that card';
      return false;
    }

    snapshot();
    pile.pop();
    state.foundations[index].push(card);
    state.selection = null;
    state.moves++;
    state.message = '';
    revealIfNeeded(pile);
    checkWin();
    return true;
  }

  /**
   * Play every card that is unambiguously safe.
   *
   * Bounded by a move counter rather than "until nothing changes" so a rules
   * bug can never spin the loop forever inside a frame.
   */
  function autoplay() {
    let played = 0;
    let progress = true;

    while (progress && played < 52) {
      progress = false;
      const sources = [state.waste, ...state.tableau];

      for (const pile of sources) {
        const card = top(pile);
        if (!card || !card.faceUp) continue;
        const index = foundationFor(card, state.foundations);
        if (index < 0 || !isSafeToAutoplay(card, state.foundations)) continue;

        if (played === 0) snapshot();
        pile.pop();
        state.foundations[index].push(card);
        state.moves++;
        played++;
        progress = true;
        revealIfNeeded(pile);
        break;
      }
    }

    state.message = played ? `played ${played}` : 'nothing safe to play';
    if (played) {
      state.selection = null;
      checkWin();
    }
    return played > 0;
  }

  function checkWin() {
    if (!isWon(state)) return false;
    state.won = true;
    state.message = 'you win';
    state.stats.won++;
    state.stats.streak++;
    const seconds = Math.round(state.elapsed);
    if (state.stats.bestMoves == null || state.moves < state.stats.bestMoves) {
      state.stats.bestMoves = state.moves;
    }
    if (state.stats.bestSeconds == null || seconds < state.stats.bestSeconds) {
      state.stats.bestSeconds = seconds;
    }
    persist();
    return true;
  }

  /** Legal destinations for whatever is under the cursor — the hint key. */
  function hint() {
    const target = state.selection ?? cursorTarget();
    const pile = pileAt(target);
    if (pile.length === 0) return [];

    const from = state.selection
      ? state.selection.from
      : target.zone === 'tableau'
        ? Math.max(firstFaceUp(pile), pile.length - 1)
        : pile.length - 1;

    state.hints = destinationsFor(state, pile.slice(from), target);
    if (state.hints.length === 0) state.message = 'no move for that card';
    return state.hints;
  }

  // --- loop ----------------------------------------------------------------

  function update(dt) {
    timeline.update(dt);
    if (state.dealing && timeline.idle) state.dealing = false;
    if (!state.dealing && !state.won) state.elapsed += dt;
  }

  /** True while the table is still settling and input should be ignored. */
  function busy() {
    return state.dealing;
  }

  deal();

  const api = {
    state,
    update,
    busy,
    deal,
    draw,
    select,
    drop,
    cancel,
    adjustRun,
    autoLift,
    autoplay,
    undo,
    hint,
    persist,
    moveCursor,
    switchRow,
    cursorTarget,
    pileAt,
    selectedRun,
    get canUndo() {
      return undoStack.length > 0;
    },
  };

  // Any action invalidates the hints on screen — they were computed for a table
  // that no longer exists. Wrapping once here rather than clearing inside each
  // action means a new action cannot forget to do it.
  for (const name of ['deal', 'draw', 'select', 'drop', 'cancel', 'adjustRun',
    'autoLift', 'autoplay', 'undo', 'moveCursor', 'switchRow']) {
    const fn = api[name];
    api[name] = (...args) => {
      state.hints = [];
      return fn(...args);
    };
  }

  return api;
}
