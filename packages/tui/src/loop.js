/**
 * Fixed-timestep game loop.
 *
 * Simulation advances in fixed steps regardless of render rate, so game logic
 * is deterministic and behaves the same on a fast desktop and over a laggy ssh
 * session. Render runs once per frame with an interpolation factor.
 *
 * The accumulator is clamped so a stalled process (laptop sleep, a long GC)
 * doesn't produce a burst of catch-up steps that teleport everything.
 */

const MAX_ACCUM_MS = 250;

export function createLoop(opts = {}) {
  const fps = opts.fps ?? 60;
  const stepMs = 1000 / (opts.tickRate ?? fps);
  const frameMs = 1000 / fps;
  const update = opts.update ?? (() => {});
  const render = opts.render ?? (() => {});
  const now = opts.now ?? (() => performance.now());

  let timer = null;
  let running = false;
  let last = 0;
  let accum = 0;
  let frames = 0;
  let fpsWindowStart = 0;
  let measuredFps = 0;

  function tick() {
    if (!running) return;

    const t = now();
    let delta = t - last;
    last = t;
    if (delta > MAX_ACCUM_MS) delta = MAX_ACCUM_MS;
    accum += delta;

    while (accum >= stepMs) {
      update(stepMs / 1000);
      accum -= stepMs;
    }

    render(accum / stepMs, t);

    frames++;
    if (t - fpsWindowStart >= 1000) {
      measuredFps = Math.round((frames * 1000) / (t - fpsWindowStart));
      frames = 0;
      fpsWindowStart = t;
    }

    // Drift correction: aim at the next frame boundary rather than sleeping a
    // flat interval, which would slowly fall behind by the cost of each frame.
    const elapsed = now() - t;
    timer = setTimeout(tick, Math.max(0, frameMs - elapsed));
  }

  function start() {
    if (running) return;
    running = true;
    last = now();
    fpsWindowStart = last;
    accum = 0;
    frames = 0;
    tick();
  }

  function stop() {
    running = false;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  return {
    start,
    stop,
    get running() {
      return running;
    },
    get fps() {
      return measuredFps;
    },
  };
}
