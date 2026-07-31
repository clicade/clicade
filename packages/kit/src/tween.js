/**
 * Tweening and timelines.
 *
 * Nothing in a clicade game teleports. A card that appears in a hand reads as a
 * state dump; a card that travels there over 180ms reads as a deal. This is the
 * cheapest possible machinery for that: a list of tweens advanced by delta
 * time, driven from the same fixed-timestep loop as everything else.
 *
 * Deliberately not time-of-day based — it advances by the dt the loop hands it,
 * so animation stays in lockstep with simulation and replays identically.
 */

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  /** Overshoots then settles — good for a card landing in a slot. */
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  /** Bounces to rest — for chips and dice. */
  outBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * A single value animating from `from` to `to`.
 * @param {object} opts
 * @param {number} [opts.from]
 * @param {number} [opts.to]
 * @param {number} opts.duration seconds
 * @param {number} [opts.delay] seconds
 * @param {(t:number)=>number} [opts.ease]
 * @param {(v:number, tween:object)=>void} [opts.onUpdate]
 * @param {()=>void} [opts.onComplete]
 */
export function createTween(opts) {
  const from = opts.from ?? 0;
  const to = opts.to ?? 1;
  const duration = Math.max(0, opts.duration ?? 0);
  const delay = Math.max(0, opts.delay ?? 0);
  const easing = opts.ease ?? ease.outCubic;

  let elapsed = 0;
  let done = false;
  let fired = false;

  function update(dt) {
    if (done) return true;
    elapsed += dt;

    const active = elapsed - delay;
    if (active < 0) return false;

    const raw = duration === 0 ? 1 : Math.min(1, active / duration);
    const value = lerp(from, to, easing(raw));
    opts.onUpdate?.(value, api);

    if (raw >= 1) {
      done = true;
      if (!fired) {
        fired = true;
        opts.onComplete?.();
      }
    }
    return done;
  }

  /** Jump to the end. Used when a player skips an animation. */
  function finish() {
    if (done) return;
    done = true;
    opts.onUpdate?.(to, api);
    if (!fired) {
      fired = true;
      opts.onComplete?.();
    }
  }

  const api = {
    update,
    finish,
    get done() {
      return done;
    },
    get progress() {
      return duration === 0 ? 1 : Math.min(1, Math.max(0, (elapsed - delay) / duration));
    },
  };
  return api;
}

/**
 * A bag of tweens advanced together.
 *
 * Tweens are removed once complete, so `timeline.idle` is a reliable "is the
 * table settled" check — which is what gates accepting input during a deal.
 */
export function createTimeline() {
  let tweens = [];

  function add(opts) {
    const t = createTween(opts);
    tweens.push(t);
    return t;
  }

  function update(dt) {
    if (tweens.length === 0) return;
    for (const t of tweens) t.update(dt);
    tweens = tweens.filter((t) => !t.done);
  }

  /** Complete everything immediately, in order. */
  function finishAll() {
    for (const t of tweens) t.finish();
    tweens = [];
  }

  function clear() {
    tweens = [];
  }

  return {
    add,
    update,
    finishAll,
    clear,
    get idle() {
      return tweens.length === 0;
    },
    get count() {
      return tweens.length;
    },
  };
}
