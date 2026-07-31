#!/usr/bin/env node
/**
 * npx @clicade/blackjack
 *
 * Wiring only: keys in, state out, table drawn. The rules live in src/rules.js,
 * the state machine in src/game.js, the table in src/render.js.
 */

import { createApp, parseArgs, loadPrefs } from '@clicade/tui';
import { getTheme } from '@clicade/kit';
import { createGame, MIN_BET, BET_STEP } from './src/game.js';
import { render, MIN_W, MIN_H } from './src/render.js';

const args = parseArgs();
const prefs = loadPrefs();
const game = createGame();
const theme = getTheme(args.theme || prefs.theme || process.env.CLICADE_THEME || 'felt');

const app = createApp({
  name: 'blackjack — clicade',
  args,
  prefs,
  fps: 60,
  // Take the terminal's size once, at launch, then freeze it. The table fills
  // the window, and zooming afterwards cannot resize the world.
  stage: { fill: true, minWidth: MIN_W, minHeight: MIN_H },
  update: (dt) => game.update(dt),
  render: (_alpha, ctx) => render(ctx.stage, ctx.glyphs, game, theme, ctx),
  onKey,
});

function onKey(key, ctx) {
  if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
    game.persist();
    ctx.quit(0);
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

if (!app.blocked) {
  if (game.state.bankroll < MIN_BET) game.state.phase = 'broke';
  app.run();
}
