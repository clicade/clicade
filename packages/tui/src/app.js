/**
 * Application lifecycle.
 *
 * The one rule this file exists to enforce: whatever happens — clean quit,
 * Ctrl-C, SIGTERM, an uncaught throw in game code — the terminal is restored.
 * A game that leaves the cursor hidden or the shell in raw mode gets deleted
 * and never run again, so cleanup is idempotent and wired to every exit path.
 *
 * An app can run standalone (its own process, `npx @clicade/blackjack`) or
 * embedded inside another one (the arcade launcher). Embedded apps hand control
 * back to their caller instead of ending the process, so `run()` resolves with
 * a result rather than never returning. Everything else is identical — a game
 * has no idea which mode it is in.
 */

import { detectCaps, unplayableReason, COLOR_NONE } from './caps.js';
import { createScreen } from './screen.js';
import { createInput } from './input.js';
import { createLoop } from './loop.js';
import { createStage } from './stage.js';
import { glyphs, centerX } from './layout.js';
import { strWidth } from './width.js';
import { parseArgs, FLAG_HELP } from './args.js';
import { loadPrefs, savePrefs, resolveMono } from './prefs.js';

/**
 * @param {object} opts
 * @param {(ctx: any) => void} [opts.setup]
 * @param {(dt: number) => void} [opts.update]
 * @param {(alpha: number) => void} [opts.render]
 * @param {(key: object) => void} [opts.onKey]
 * @param {() => void} [opts.onResize]
 * @param {() => void} [opts.onQuit] runs on every exit path, before teardown
 * @param {number} [opts.fps]
 * @param {boolean} [opts.exitOnCtrlC]
 * @param {boolean} [opts.standalone] false when embedded in a launcher
 */
export function createApp(opts = {}) {
  const args = opts.args ?? parseArgs();
  // Standalone apps own the process and end it. Embedded ones must not, or
  // launching a game from the arcade would take the arcade down with it.
  const standalone = opts.standalone !== false;

  if (args.help) {
    process.stdout.write(`${opts.name ?? 'clicade'}\n${FLAG_HELP}\n`);
    return { run: async () => ({ code: 0, reason: 'help' }), blocked: 'help' };
  }

  const caps = opts.caps ?? detectCaps();
  const prefs = opts.prefs ?? loadPrefs();

  // Full colour depth is remembered so the monochrome toggle can restore it
  // rather than re-detecting, which would lose a `--color` override.
  const fullDepth = caps.colorDepth;
  let mono = resolveMono({
    envNoColor: caps.noColor,
    flag: args.mono,
    saved: prefs.mono,
  });
  if (mono) caps.colorDepth = COLOR_NONE;
  else if (args.mono === false) caps.colorDepth = fullDepth;

  const blocked = unplayableReason(caps);
  if (blocked) {
    process.stderr.write(`${blocked}\n`);
    process.exitCode = 1;
    return { run: async () => ({ code: 1, reason: 'blocked' }), caps, blocked };
  }

  // Streams are injectable so the whole lifecycle can be exercised in a test
  // without a real terminal. Games never pass them.
  const screen = createScreen({ caps, stream: opts.stream });
  const input = createInput({ caps, input: opts.stdin });
  const g = glyphs(caps);

  // A fixed logical playfield, if the game declares one. Games that use it can
  // never have their simulation influenced by terminal size — including by the
  // player zooming mid-game.
  const stage = opts.stage ? createStage({ screen, ...opts.stage }) : null;

  let cleanedUp = false;
  let loop = null;
  let settle = null;
  let result = { code: 0, reason: 'quit' };

  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      loop?.stop();
    } catch {
      /* nothing useful to do while tearing down */
    }
    try {
      input.stop();
    } catch {
      /* ditto */
    }
    try {
      screen.exit();
    } catch {
      /* ditto */
    }
    detach();
  }

  // --- process wiring -------------------------------------------------------
  // Named so they can be removed again. An embedded app runs many times in one
  // process, and listeners that accumulate would leak until Node starts warning
  // about a possible memory leak partway through a session.

  const onExitSignal = () => cleanup();
  const onSigint = () => quit(0, 'interrupt');
  const onSigterm = () => quit(0, 'interrupt');
  const onUncaught = (err) => {
    cleanup();
    process.stderr.write(`\n${err?.stack ?? err}\n`);
    process.exit(1);
  };

  function onResize() {
    screen.resize();
    opts.onResize?.(ctx);
  }

  function attach() {
    process.on('exit', onExitSignal);
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
    process.on('uncaughtException', onUncaught);
    process.stdout.on('resize', onResize);
  }

  function detach() {
    process.off('exit', onExitSignal);
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    process.off('uncaughtException', onUncaught);
    process.stdout.off('resize', onResize);
  }

  /**
   * End this app.
   *
   * `reason` travels back to whoever called `run()`. The launcher uses it to
   * tell "the player quit this game" from "the player hit Ctrl-C" — the first
   * returns to the menu, the second ends the session.
   *
   * @param {number} [code]
   * @param {string} [reason] 'quit' | 'interrupt' | anything a game defines
   */
  function quit(code = 0, reason = 'quit') {
    if (cleanedUp) return;
    result = { code, reason };
    try {
      opts.onQuit?.(ctx, result);
    } catch {
      // A failing save must not stop the terminal being restored.
    }
    cleanup();

    const done = settle;
    settle = null;
    done?.(result);

    if (standalone) {
      process.exitCode = code;
      // Let stdout drain before the process ends, or the restore sequences can
      // be truncated and the terminal stays broken.
      setImmediate(() => process.exit(code));
    }
  }

  /**
   * Flip between colour and monochrome mid-game and remember the choice.
   * The screen diffs on rendered style strings, so it has to be invalidated —
   * the cells are otherwise identical and nothing would be rewritten.
   */
  function setMono(value) {
    if (mono === value) return;
    mono = value;
    caps.colorDepth = mono ? COLOR_NONE : fullDepth;
    screen.invalidate();
  }

  function toggleMono() {
    setMono(!mono);
    savePrefs({ ...prefs, mono });
  }

  const ctx = {
    caps,
    screen,
    stage,
    input,
    glyphs: g,
    quit,
    toggleMono,
    // Changes the colour mode without persisting. The settings screen previews
    // with this and owns the write itself, so editing one setting cannot save a
    // half-finished version of the others.
    setMono,
    get mono() {
      return mono;
    },
    /** Whether colour is even available, so games can hide the hint if not. */
    get colorAvailable() {
      return fullDepth !== COLOR_NONE;
    },
    get fps() {
      return loop?.fps ?? 0;
    },
    /** True while play is suspended because the terminal cannot show the stage. */
    get paused() {
      return Boolean(stage?.tooSmall);
    },
  };

  /**
   * Shown instead of the game when the window is too small. Play is suspended
   * rather than cropped — a cropped view is both unplayable and an unfair
   * advantage in anything with hidden information.
   */
  function renderTooSmall() {
    screen.clear();
    const lines = [
      'terminal too small',
      `needs ${stage.width}x${stage.height}`,
      `have  ${screen.cols}x${screen.rows}`,
      '',
      'resize or zoom out to continue',
    ];
    const top = Math.max(0, Math.floor((screen.rows - lines.length) / 2));
    lines.forEach((line, i) => {
      if (top + i < screen.rows) {
        screen.put(centerX(screen.cols, strWidth(line)), top + i, line, { bold: i === 0 });
      }
    });
  }

  /**
   * Start the app. Resolves when it quits, with `{ code, reason }`.
   *
   * A standalone app ends the process before the promise is useful; an embedded
   * one uses it to hand control back.
   */
  function run() {
    return new Promise((resolve) => {
      settle = resolve;
      attach();

      screen.enter();
      // Measure before the first update, or one tick runs against stale offsets.
      stage?.measure();
      input.start();

      input.onKey((key) => {
        // Ctrl-C is not delivered as a signal in raw mode, so it has to be
        // handled here or the game becomes unkillable.
        if (opts.exitOnCtrlC !== false && key.ctrl && key.name === 'c') {
          quit(0, 'interrupt');
          return;
        }
        // F2 is reserved engine-wide for the colour toggle. A function key,
        // deliberately: every letter is fair game as a gameplay binding.
        if (key.name === 'f2') {
          toggleMono();
          return;
        }
        opts.onKey?.(key, ctx);
      });

      opts.setup?.(ctx);

      loop = createLoop({
        fps: opts.fps ?? 60,
        update: (dt) => {
          // Suspended while the stage doesn't fit, so time doesn't advance
          // behind a screen the player can't see.
          if (stage?.tooSmall) return;
          opts.update?.(dt, ctx);
        },
        render: (alpha) => {
          stage?.measure();
          if (stage?.tooSmall) renderTooSmall();
          else opts.render?.(alpha, ctx);
          screen.flush();
        },
      });
      loop.start();
    });
  }

  return { run, cleanup, quit, ctx, caps, screen, input, glyphs: g };
}
