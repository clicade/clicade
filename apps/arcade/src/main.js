/**
 * The arcade.
 *
 * A shell like any other app, running on the same engine the games do, with
 * three screens inside it: onboarding, the menu, and settings. They share one
 * app rather than one each so the theme can be rebuilt every frame from
 * whatever is being edited — which is what makes settings preview live instead
 * of applying on exit and leaving the player to guess.
 *
 * The shell launches embedded (`standalone: false`), which is what lets a game
 * quit back to the menu instead of ending the process.
 */

import {
  createApp,
  parseArgs,
  loadPrefs,
  savePrefs,
  needsOnboarding,
  ONBOARDING_VERSION,
  detectCaps,
} from '@clicade/tui';
import { resolveTheme } from '@clicade/kit';
import { CATALOG, findGame, playable } from './catalog.js';
import { createMenu } from './menu.js';
import { createSettings, effective } from './settings.js';
import { createOnboarding } from './onboarding.js';
import { render, MIN_W as MENU_W, MIN_H as MENU_H } from './render.js';
import { renderSettings, renderOnboarding, MIN_W as PANEL_W, MIN_H as PANEL_H } from './screens.js';
import { survey, report, recommend } from './fit.js';

const MIN_W = Math.max(MENU_W, PANEL_W);
const MIN_H = Math.max(MENU_H, PANEL_H);

const HELP = `clicade — terminal games that are actually good

  npx clicade              open the arcade
  npx clicade <game>       skip the menu
  npx clicade --settings   open settings
  npx clicade --setup      run first-time setup again
  npx clicade --check      what your terminal fits, and print nothing else

games:
${CATALOG.map((e) => `  ${e.id.padEnd(14)}${e.start ? e.blurb : 'not built yet'}`).join('\n')}

  --mono, --no-color   play in monochrome
  --color              force color on
  --theme <name>       felt | paper | noir
  --help               show this
`;

export async function run(opts = {}) {
  const args = opts.args ?? parseArgs(opts.argv);
  // Test seam: lets the whole shell run without a terminal.
  const env = opts.env ?? {};

  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const flags = new Set(args.rest.filter((token) => token.startsWith('-')));

  // Printed rather than drawn, deliberately: someone running this is about to
  // paste the answer into an issue, and alt-screen output does not survive.
  if (flags.has('--check')) {
    const out = opts.stdout ?? process.stdout;
    const cols = out.columns ?? 80;
    const rows = out.rows ?? 24;
    out.write(`${report(cols, rows, detectCaps()).join('\n')}\n`);
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
  let screen = 'menu';
  if (flags.has('--setup')) screen = 'onboarding';
  else if (flags.has('--settings')) screen = 'settings';
  else if (needsOnboarding(loadPrefs())) screen = 'onboarding';

  for (;;) {
    const outcome = await showShell({ args, index, env, screen });
    index = outcome.index;
    screen = 'menu';

    if (outcome.reason !== 'play') return outcome.code ?? 0;

    // Preferences are re-read per launch so a change made in settings carries
    // into the game, and an F2 press in the game carries back out.
    await outcome.entry.start({ ...env, standalone: false, args, prefs: loadPrefs() });
  }
}

/**
 * Run the shell until it quits or a game is picked.
 * @returns {Promise<{reason:string, index:number, entry?:object, code?:number}>}
 */
function showShell({ args, index, env = {}, screen: startScreen = 'menu' }) {
  let prefs = loadPrefs();
  let screen = startScreen;
  let chosen = null;

  const menu = createMenu(CATALOG, index);
  let settings = null;
  let flow = null;

  // Setup opens on a suggestion rather than a default. Size is the one question
  // with a measurable answer, so measuring it and pre-selecting beats asking
  // someone to guess at a number they would have to count columns to know.
  function suggestions() {
    const out = env.stream ?? process.stdout;
    return { scale: recommend(out.columns ?? 80, out.rows ?? 24) };
  }

  if (screen === 'settings') settings = createSettings(prefs);
  if (screen === 'onboarding') flow = createOnboarding(prefs, suggestions());

  /** Values currently in force, taking whichever screen is editing them. */
  function values() {
    if (screen === 'settings') return settings.state.values;
    if (screen === 'onboarding') return flow.state.values;
    return effective(prefs);
  }

  function theme() {
    const v = values();
    return resolveTheme({
      theme: args.theme || v.theme,
      contrast: v.contrast,
      surface: v.surface,
    });
  }

  function persist(next) {
    prefs = { ...prefs, ...next };
    savePrefs(prefs);
  }

  const app = createApp({
    ...env,
    name: 'clicade',
    args,
    prefs,
    fps: 60,
    standalone: false,
    stage: { fill: true, minWidth: MIN_W, minHeight: MIN_H },

    update: (dt, ctx) => {
      // Colour mode is owned by the engine, so a live preview has to push the
      // edited value into it each frame rather than waiting for a save.
      const wanted = values().mono;
      if (typeof wanted === 'boolean' && ctx.setMono) ctx.setMono(wanted);

      if (screen === 'menu') menu.update(dt);
      else if (screen === 'settings') settings.update(dt);
      else flow.update(dt);
    },

    render: (_alpha, ctx) => {
      const view = {
        mono: ctx.mono,
        colorAvailable: ctx.colorAvailable,
        scale: values().scale,
        // Read from the screen, not the stage: the stage is frozen at launch by
        // design, and a fit report that ignores the window the player just
        // resized would be telling them about a terminal they no longer have.
        // Safe here because nothing about the simulation reads it — only text.
        fit: survey(ctx.screen.cols, ctx.screen.rows),
      };
      if (screen === 'menu') render(ctx.stage, ctx.glyphs, menu, theme(), view);
      else if (screen === 'settings') renderSettings(ctx.stage, ctx.glyphs, settings, theme(), view);
      else renderOnboarding(ctx.stage, ctx.glyphs, flow, theme(), view);
    },

    onKey: (key, ctx) => onKey(key, ctx),
  });

  function openSettings() {
    settings = createSettings(prefs);
    screen = 'settings';
  }

  function openOnboarding() {
    flow = createOnboarding(prefs, suggestions());
    screen = 'onboarding';
  }

  function closeToMenu() {
    screen = 'menu';
    menu.replay();
  }

  function onKey(key, ctx) {
    if (screen === 'onboarding') return onboardingKey(key, ctx);
    if (screen === 'settings') return settingsKey(key);
    return menuKey(key, ctx);
  }

  function menuKey(key, ctx) {
    if (key.name === 'q' || key.name === 'escape') {
      ctx.quit(0, 'quit');
      return;
    }
    if (key.name === 's') {
      openSettings();
      return;
    }
    if (key.name === 'up' || key.name === 'k') menu.move(-1);
    if (key.name === 'down' || key.name === 'j') menu.move(1);
    if (key.name === 'home') menu.to(0);
    if (key.name === 'end') menu.to(CATALOG.length - 1);

    // Number keys jump straight to an entry, so a returning player never has
    // to arrow past anything.
    const digit = Number(key.name);
    if (Number.isInteger(digit) && digit >= 1 && digit <= CATALOG.length) menu.to(digit - 1);

    if (key.name === 'enter' || key.name === 'space' || key.name === 'right') {
      const entry = menu.pick();
      if (entry) {
        chosen = entry;
        ctx.quit(0, 'play');
      }
    }
  }

  function settingsKey(key) {
    if (key.name === 'escape' || key.name === 'q' || key.name === 'enter') {
      closeToMenu();
      return;
    }
    if (key.name === 'r') {
      openOnboarding();
      return;
    }
    if (key.name === 'up' || key.name === 'k') settings.move(-1);
    if (key.name === 'down' || key.name === 'j') settings.move(1);
    if (key.name === 'left' || key.name === 'h') {
      settings.cycle(-1);
      persist(settings.state.values);
    }
    if (key.name === 'right' || key.name === 'l' || key.name === 'space') {
      settings.cycle(1);
      persist(settings.state.values);
    }
  }

  function onboardingKey(key, ctx) {
    // Both exits record what was chosen and mark setup as done. Leaving is an
    // answer, and re-asking on every launch is the nagging this flow exists to
    // avoid — it can always be run again from settings.
    if (key.name === 'escape') {
      flow.skip();
      persist(flow.merged(prefs, ONBOARDING_VERSION));
      closeToMenu();
      return;
    }
    if (key.name === 'q') {
      flow.skip();
      persist(flow.merged(prefs, ONBOARDING_VERSION));
      ctx.quit(0, 'quit');
      return;
    }
    if (key.name === 'left' || key.name === 'h') flow.cycle(-1);
    if (key.name === 'right' || key.name === 'l') flow.cycle(1);
    if (key.name === 'up') flow.back();

    if (key.name === 'enter' || key.name === 'space' || key.name === 'down') {
      const advanced = flow.next();
      if (!advanced) {
        persist(flow.merged(prefs, ONBOARDING_VERSION));
        closeToMenu();
      }
    }
  }

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
