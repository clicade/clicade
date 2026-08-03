/**
 * Blackjack, as a module.
 *
 * The entry point (`index.js`) and the arcade launcher both come through here.
 * Nothing is built at import time: state, theme and preferences are created
 * inside `start()`, so launching the game twice in one process — quit to the
 * menu, come back — gets a genuinely fresh table and re-reads a colour
 * preference the player may have changed in between.
 */

import { createApp, parseArgs, loadPrefs } from '@clicade/tui';
import { themeFor, createButtons } from '@clicade/kit';
import { createGame, MIN_BET, BET_STEP } from './game.js';
import { render, MIN_W, MIN_H } from './render.js';

/** Catalogue entry. The launcher reads this; the game itself never does. */
export const meta = {
  id: 'blackjack',
  title: 'Blackjack',
  blurb: 'Beat the dealer to 21. Six decks, 3:2, double and split.',
  players: '1 player',
  tags: ['cards', 'classic'],
  // Takes no scale argument on purpose: the table is one row of hands laid out
  // around full-size cards, so the Size preference does not reach it. The
  // launcher derives that from these returning the same answer at every scale,
  // and says so rather than implying otherwise.
  minSize: () => ({ width: MIN_W, height: MIN_H }),
  recommendedSize: () => ({ width: MIN_W, height: MIN_H }),
};

/**
 * @param {object} [opts]
 * @param {boolean} [opts.standalone] false when launched from the arcade
 * @param {string[]} [opts.argv]
 * @returns {Promise<{code:number, reason:string}>}
 */
export function start(opts = {}) {
  const args = opts.args ?? parseArgs(opts.argv);
  const prefs = opts.prefs ?? loadPrefs();
  const game = createGame();
  const theme = themeFor(args, prefs);
  const buttons = createButtons();

  const app = createApp({
    name: 'blackjack — clicade',
    args,
    prefs,
    fps: 60,
    standalone: opts.standalone !== false,
    // Test seams. Nothing in normal use passes these.
    caps: opts.caps,
    stream: opts.stream,
    stdin: opts.stdin,
    // Take the terminal's size once, at launch, then freeze it. The table fills
    // the window, and zooming afterwards cannot resize the world.
    stage: { fill: true, minWidth: MIN_W, minHeight: MIN_H },
    // Hover as well as clicks: a button that does not answer the pointer reads
    // as a picture of a button.
    mouse: true,
    update: (dt) => game.update(dt),
    render: (_alpha, ctx) => render(ctx.stage, ctx.glyphs, game, theme, { ...ctx, buttons }),
    onKey: (key, ctx) => onKey(key, ctx, game),
    onMouse: (event, ctx) => {
      const id = buttons.handle(event);
      // A click is dispatched as the key it names, so the mouse can never do
      // something the keyboard cannot, or do it differently.
      if (id) onKey({ name: id, ctrl: false, alt: false, shift: false }, ctx, game);
    },
    // Runs on every exit path, including Ctrl-C, which the engine intercepts
    // before any game handler sees it.
    onQuit: () => game.persist(),
  });

  if (app.blocked) return Promise.resolve({ code: 1, reason: app.blocked });

  if (game.state.bankroll < MIN_BET) game.state.phase = 'broke';
  return app.run();
}

function onKey(key, ctx, game) {
  if (key.name === 'q') {
    ctx.quit(0, 'quit');
    return;
  }

  // Clicking the colour button has to do what pressing F2 does. The engine
  // intercepts the real keypress before any game sees it, so the click — which
  // arrives here as a synthetic key — has to be routed by hand.
  if (key.name === 'f2') {
    ctx.toggleMono?.();
    return;
  }

  // Cards in flight mean the round hasn't caught up with the player yet.
  // Accepting input here is what makes a game feel loose.
  if (game.busy()) return;

  const { state } = game;

  switch (state.phase) {
    case 'betting':
      if (key.name === 'left') game.adjustBet(-BET_STEP);
      if (key.name === 'right') game.adjustBet(BET_STEP);
      if (key.name === 'up') game.adjustBet(BET_STEP * 5);
      if (key.name === 'down') game.adjustBet(-BET_STEP * 5);
      if (key.name === '1') game.adjustBet(25 - state.bet);
      if (key.name === '2') game.adjustBet(50 - state.bet);
      if (key.name === '3') game.adjustBet(100 - state.bet);
      if (key.name === 'enter' || key.name === 'space') game.startRound();
      break;

    case 'player':
      if (key.name === 'h') game.hit();
      if (key.name === 's') game.stand();
      if (key.name === 'd') game.double();
      if (key.name === 'p') game.split();
      break;

    case 'settle':
      if (key.name === 'enter' || key.name === 'space') game.nextRound();
      break;

    case 'broke':
      if (key.name === 'r') game.rebuy();
      break;
  }
}
