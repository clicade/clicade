/**
 * The arcade.
 *
 * A menu is an app like any other, so it runs on the same engine the games do.
 * The difference is that it launches embedded — `standalone: false` — which is
 * what lets a game quit back to the menu instead of ending the process.
 *
 * The session is a plain loop: show the menu, run whatever was picked, show the
 * menu again. Each pass builds a fresh app, so a game that changed the colour
 * preference or a terminal that changed size is picked up on the way back.
 */

import { createApp, parseArgs, loadPrefs } from '@clicade/tui';
import { getTheme } from '@clicade/kit';
import { CATALOG, findGame, playable } from './catalog.js';
import { createMenu } from './menu.js';
import { render, MIN_W, MIN_H } from './render.js';

const HELP = `clicade — terminal games that are actually good

  npx clicade              open the arcade
  npx clicade <game>       skip the menu

games:
${CATALOG.map((e) => `  ${e.id.padEnd(14)}${e.start ? e.blurb : 'not built yet'}`).join('\n')}

  --mono, --no-color   play in monochrome
  --color              force color on
  --theme <name>       felt | paper | noir
  --help               show this
`;

/**
 * @param {object} [opts]
 * @param {string[]} [opts.argv]
 * @returns {Promise<number>} process exit code
 */
export async function run(opts = {}) {
  const args = opts.args ?? parseArgs(opts.argv);
  // Test seam: lets the whole menu → game → menu loop run without a terminal.
  // Nothing in normal use passes it.
  const env = opts.env ?? {};

  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }

  // `npx clicade blackjack` goes straight in. The menu is the front door, not
  // a toll booth — anybody who already knows what they want should skip it.
  const requested = args.rest.find((token) => !token.startsWith('-'));
  if (requested) {
    const entry = findGame(requested);
    if (!entry) {
      process.stderr.write(
        `unknown game: ${requested}\navailable: ${CATALOG.map((e) => e.id).join(', ')}\n`,
      );
      return 1;
    }
    if (!entry.start) {
      process.stderr.write(`${entry.title} is not built yet\n`);
      return 1;
    }
    const result = await entry.start({ ...env, standalone: false, args, prefs: loadPrefs() });
    return result?.code ?? 0;
  }

  let index = 0;

  for (;;) {
    const outcome = await showMenu({ args, index, env });
    index = outcome.index;

    if (outcome.reason !== 'play') return outcome.code ?? 0;

    // Preferences are re-read per launch so an F2 press in the menu carries
    // into the game, and one in the game carries back out.
    await outcome.entry.start({ ...env, standalone: false, args, prefs: loadPrefs() });
  }
}

/**
 * Run one pass of the menu.
 * @returns {Promise<{reason:string, index:number, entry?:object, code?:number}>}
 */
function showMenu({ args, index, env = {} }) {
  const prefs = loadPrefs();
  const theme = getTheme(args.theme || prefs.theme || process.env.CLICADE_THEME || 'noir');
  const menu = createMenu(CATALOG, index);

  let chosen = null;

  const app = createApp({
    ...env,
    name: 'clicade',
    args,
    prefs,
    fps: 30,
    standalone: false,
    stage: { fill: true, minWidth: MIN_W, minHeight: MIN_H },
    update: (dt) => menu.update(dt),
    render: (_alpha, ctx) => render(ctx.stage, ctx.glyphs, menu, theme, ctx),
    onKey: (key, ctx) => {
      if (key.name === 'q' || key.name === 'escape') {
        ctx.quit(0, 'quit');
        return;
      }
      if (key.name === 'up' || key.name === 'k') menu.move(-1);
      if (key.name === 'down' || key.name === 'j') menu.move(1);
      if (key.name === 'home') menu.to(0);
      if (key.name === 'end') menu.to(CATALOG.length - 1);

      // Number keys jump straight to an entry, so a returning player never
      // has to arrow past anything.
      const digit = Number(key.name);
      if (Number.isInteger(digit) && digit >= 1 && digit <= CATALOG.length) menu.to(digit - 1);

      if (key.name === 'enter' || key.name === 'space' || key.name === 'right') {
        const entry = menu.pick();
        if (entry) {
          chosen = entry;
          ctx.quit(0, 'play');
        }
      }
    },
  });

  if (app.blocked) {
    return Promise.resolve({ reason: 'blocked', index, code: 1 });
  }

  return app.run().then((result) => ({
    reason: result.reason === 'play' ? 'play' : result.reason,
    index: menu.state.index,
    entry: chosen,
    code: result.code,
  }));
}

export { CATALOG, playable, HELP };
