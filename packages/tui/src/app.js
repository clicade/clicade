/**
 * Application lifecycle.
 *
 * The one rule this file exists to enforce: whatever happens — clean quit,
 * Ctrl-C, SIGTERM, an uncaught throw in game code — the terminal is restored.
 * A game that leaves the cursor hidden or the shell in raw mode gets deleted
 * and never run again, so cleanup is idempotent and wired to every exit path.
 */

import { detectCaps, unplayableReason } from './caps.js';
import { createScreen } from './screen.js';
import { createInput } from './input.js';
import { createLoop } from './loop.js';
import { glyphs } from './layout.js';

/**
 * @param {object} opts
 * @param {(ctx: any) => void} [opts.setup]
 * @param {(dt: number) => void} [opts.update]
 * @param {(alpha: number) => void} [opts.render]
 * @param {(key: object) => void} [opts.onKey]
 * @param {() => void} [opts.onResize]
 * @param {number} [opts.fps]
 * @param {boolean} [opts.exitOnCtrlC]
 */
export function createApp(opts = {}) {
  const caps = opts.caps ?? detectCaps();

  const blocked = unplayableReason(caps);
  if (blocked) {
    process.stderr.write(`${blocked}\n`);
    process.exitCode = 1;
    return { run: () => {}, caps, blocked };
  }

  const screen = createScreen({ caps });
  const input = createInput({ caps });
  const g = glyphs(caps);

  let cleanedUp = false;
  let loop = null;

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
  }

  function quit(code = 0) {
    cleanup();
    process.exitCode = code;
    // Let stdout drain before the process ends, or the restore sequences can
    // be truncated and the terminal stays broken.
    setImmediate(() => process.exit(code));
  }

  const ctx = {
    caps,
    screen,
    input,
    glyphs: g,
    quit,
    get fps() {
      return loop?.fps ?? 0;
    },
  };

  function onResize() {
    screen.resize();
    opts.onResize?.(ctx);
  }

  function run() {
    process.on('exit', cleanup);
    process.on('SIGINT', () => quit(0));
    process.on('SIGTERM', () => quit(0));
    process.on('uncaughtException', (err) => {
      cleanup();
      process.stderr.write(`\n${err?.stack ?? err}\n`);
      process.exit(1);
    });
    process.stdout.on('resize', onResize);

    screen.enter();
    input.start();

    input.onKey((key) => {
      // Ctrl-C is not delivered as a signal in raw mode, so it has to be
      // handled here or the game becomes unkillable.
      if (opts.exitOnCtrlC !== false && key.ctrl && key.name === 'c') {
        quit(0);
        return;
      }
      opts.onKey?.(key, ctx);
    });

    opts.setup?.(ctx);

    loop = createLoop({
      fps: opts.fps ?? 60,
      update: (dt) => opts.update?.(dt, ctx),
      render: (alpha) => {
        opts.render?.(alpha, ctx);
        screen.flush();
      },
    });
    loop.start();

    return ctx;
  }

  return { run, cleanup, quit, caps, screen, input, glyphs: g };
}
