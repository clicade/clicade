/**
 * Solitaire, as a module.
 *
 * Nothing is built at import time: the arcade imports this once and calls
 * `start()` every time the player picks solitaire from the menu.
 */

import { createApp, parseArgs, loadPrefs } from '@clicade/tui';
import { getTheme } from '@clicade/kit';
import { createGame } from './game.js';
import { render, MIN_W, MIN_H } from './render.js';

export const meta = {
  id: 'solitaire',
  title: 'Solitaire',
  blurb: 'Klondike, draw three. Keyboard-driven piles, unlimited undo, and a real deal.',
  players: '1 player',
  tags: ['cards', 'classic'],
};

export function start(opts = {}) {
  const args = opts.args ?? parseArgs(opts.argv);
  const prefs = opts.prefs ?? loadPrefs();
  const game = createGame({ seed: opts.seed });
  const theme = getTheme(args.theme || prefs.theme || process.env.CLICADE_THEME || 'felt');

  const app = createApp({
    name: 'solitaire — clicade',
    args,
    prefs,
    fps: 60,
    standalone: opts.standalone !== false,
    stage: { fill: true, minWidth: MIN_W, minHeight: MIN_H },
    caps: opts.caps,
    stream: opts.stream,
    stdin: opts.stdin,
    update: (dt) => game.update(dt),
    render: (_alpha, ctx) => render(ctx.stage, ctx.glyphs, game, theme, ctx),
    onKey: (key, ctx) => onKey(key, ctx, game),
    onQuit: () => game.persist(),
  });

  if (app.blocked) return Promise.resolve({ code: 1, reason: app.blocked });
  return app.run();
}

export function onKey(key, ctx, game) {
  if (key.name === 'q') {
    ctx.quit(0, 'quit');
    return;
  }

  // The opening deal is 28 cards in flight. Accepting input through it would
  // let a fast player act on a table that isn't on screen yet.
  if (game.busy()) return;

  const { state } = game;

  switch (key.name) {
    case 'left':
    case 'h':
      game.moveCursor(-1);
      return;
    case 'right':
    case 'l':
      game.moveCursor(1);
      return;

    // With cards in hand, up and down resize the run being carried; with empty
    // hands they switch between the top row and the tableau.
    case 'up':
    case 'k':
      if (state.selection) game.adjustRun(1);
      else game.switchRow();
      return;
    case 'down':
    case 'j':
      if (state.selection) game.adjustRun(-1);
      else game.switchRow();
      return;

    case 'space':
    case 'enter':
      if (state.selection) game.drop();
      else game.select();
      return;

    case 'escape':
      game.cancel();
      return;

    case 'd':
      game.draw();
      return;

    case 'a':
      if (key.shift) game.autoplay();
      else game.autoLift();
      return;

    case 'u':
    case 'z':
      game.undo();
      return;

    case '?':
    case '/':
      game.hint();
      return;

    case 'n':
      game.deal();
      return;

    default:
      // Digits jump straight to a tableau column.
      if (/^[1-7]$/.test(key.name)) {
        game.moveCursor(0);
        state.cursor.row = 'tableau';
        state.cursor.col = Number(key.name) - 1;
      }
  }
}
