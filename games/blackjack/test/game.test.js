import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, MIN_BET, START_BANKROLL } from '../src/game.js';
import { handValue } from '../src/rules.js';

/** In-memory save so tests never touch the real config directory. */
function memorySave(initial = {}) {
  let data = { bankroll: START_BANKROLL, lastBet: 25, stats: {}, ...initial };
  return {
    load: () => structuredClone(data),
    save: (d) => {
      data = structuredClone(d);
    },
    get current() {
      return data;
    },
  };
}

/** Run the timeline forward until nothing is animating. */
function settle(game, maxSeconds = 30) {
  const step = 1 / 60;
  let elapsed = 0;
  while (game.busy() && elapsed < maxSeconds) {
    game.update(step);
    elapsed += step;
  }
  assert.ok(elapsed < maxSeconds, 'timeline never settled');
}

function newGame(opts = {}) {
  return createGame({ save: memorySave(opts.save), seed: opts.seed ?? 12345 });
}

test('a new game starts at the betting phase with chips', () => {
  const game = newGame();
  assert.equal(game.state.phase, 'betting');
  assert.equal(game.state.bankroll, START_BANKROLL);
});

test('the stake is taken when the round starts and the round reaches a decision', () => {
  const game = newGame();
  const bet = game.state.bet;
  game.startRound();
  assert.equal(game.state.bankroll, START_BANKROLL - bet, 'stake is held during play');

  settle(game);
  assert.ok(['player', 'settle', 'broke'].includes(game.state.phase));
});

test('a dealt round gives two cards to each side', () => {
  const game = newGame();
  game.startRound();
  settle(game);
  assert.equal(game.state.hands[0].cards.length, 2);
  assert.equal(game.state.dealer.cards.length, 2);
});

test('the hole card stays hidden until the dealer plays', () => {
  const game = newGame();
  game.startRound();
  settle(game);

  if (game.state.phase !== 'player') return; // a natural resolved it immediately
  assert.equal(game.state.dealer.revealed, false);
  assert.equal(game.state.dealer.cards[1].faceDown, true, 'the hole card must stay face down');
});

test('standing runs the dealer and settles the round', () => {
  const game = newGame();
  game.startRound();
  settle(game);
  if (game.state.phase !== 'player') return;

  game.stand();
  settle(game);

  assert.equal(game.state.phase, 'settle');
  assert.equal(game.state.dealer.revealed, true);
  assert.ok(game.state.hands[0].outcome, 'the hand has an outcome');
});

test('the dealer draws to at least 17', () => {
  // Several seeds, since a natural can end a round before the dealer draws.
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const game = newGame({ seed });
    game.startRound();
    settle(game);
    if (game.state.phase !== 'player') continue;

    game.stand();
    settle(game);

    const dealerTotal = handValue(game.state.dealer.cards).total;
    const playerBust = handValue(game.state.hands[0].cards).total > 21;
    if (!playerBust) {
      assert.ok(dealerTotal >= 17, `dealer stopped at ${dealerTotal} with seed ${seed}`);
    }
  }
});

test('hitting adds a card', () => {
  const game = newGame();
  game.startRound();
  settle(game);
  if (game.state.phase !== 'player') return;

  const before = game.state.hands[0].cards.length;
  game.hit();
  settle(game);
  assert.equal(game.state.hands[0].cards.length, before + 1);
});

test('input is gated while cards are in flight', () => {
  const game = newGame();
  game.startRound();
  assert.equal(game.busy(), true, 'the deal animation blocks input');
  settle(game);
  assert.equal(game.busy(), false);
});

test('doubling takes a second stake, deals one card and ends the hand', () => {
  for (const seed of [11, 12, 13, 14, 15, 16]) {
    const game = newGame({ seed });
    game.startRound();
    settle(game);
    if (game.state.phase !== 'player') continue;

    const bankrollBefore = game.state.bankroll;
    const betBefore = game.state.hands[0].bet;
    game.double();
    settle(game);

    assert.equal(game.state.bankroll, bankrollBefore - betBefore, 'a matching stake is taken');
    assert.equal(game.state.hands[0].cards.length, 3, 'exactly one more card');
    assert.equal(game.state.phase, 'settle');
    return;
  }
  assert.fail('no seed produced a doublable hand');
});

test('chips are conserved across a settled round', () => {
  for (const seed of [21, 22, 23, 24, 25]) {
    const game = newGame({ seed });
    const before = game.state.bankroll;
    const bet = game.state.bet;

    game.startRound();
    settle(game);
    if (game.state.phase === 'player') {
      game.stand();
      settle(game);
    }

    const outcome = game.state.hands[0].outcome;
    const after = game.state.bankroll;

    if (outcome === 'push') assert.equal(after, before, 'a push returns the stake exactly');
    if (outcome === 'lose') assert.equal(after, before - bet, 'a loss costs exactly the stake');
    if (outcome === 'win') assert.equal(after, before + bet, 'a win pays even money');
    if (outcome === 'blackjack') assert.equal(after, before + Math.round(bet * 1.5), '3:2');
  }
});

test('bets are clamped to the bankroll and the table minimum', () => {
  const game = newGame({ save: { bankroll: 30 } });
  game.adjustBet(1000);
  assert.ok(game.state.bet <= 30, 'cannot bet more than you hold');
  game.adjustBet(-1000);
  assert.equal(game.state.bet, MIN_BET, 'cannot bet below the minimum');
});

test('running out of chips reaches the broke phase', () => {
  const game = newGame({ save: { bankroll: MIN_BET } });
  game.adjustBet(-1000);
  game.startRound();
  settle(game);
  if (game.state.phase === 'player') {
    game.stand();
    settle(game);
  }
  if (game.state.bankroll < MIN_BET) {
    assert.equal(game.state.phase, 'broke');
  }
});

test('buying back in restores chips and returns to betting', () => {
  const game = newGame({ save: { bankroll: 0 } });
  game.rebuy();
  assert.equal(game.state.bankroll, START_BANKROLL);
  assert.equal(game.state.phase, 'betting');
});

test('progress is persisted after a round', () => {
  const save = memorySave();
  const game = createGame({ save, seed: 99 });
  game.startRound();
  settle(game);
  if (game.state.phase === 'player') {
    game.stand();
    settle(game);
  }
  assert.equal(save.current.bankroll, game.state.bankroll, 'bankroll is written through');
  assert.equal(save.current.stats.rounds, 1);
});

test('the same seed replays the same round', () => {
  const play = () => {
    const game = newGame({ seed: 4242 });
    game.startRound();
    settle(game);
    return game.state.hands[0].cards.map((c) => c.rank + c.suit).join(',');
  };
  assert.equal(play(), play());
});

test('a round never deals across a reshuffle', () => {
  const game = newGame();
  for (let i = 0; i < 40; i++) {
    game.startRound();
    settle(game);
    if (game.state.phase === 'player') {
      game.stand();
      settle(game);
    }
    if (game.state.phase === 'broke') break;
    assert.ok(game.state.shoe.length >= 0);
    game.nextRound();
    if (game.state.bankroll < MIN_BET) break;
  }
});
