/**
 * Menu state and motion.
 *
 * Nothing here reads the terminal, so the menu behaves identically at every
 * size — the same rule the games follow.
 *
 * Motion is exponential smoothing driven by the loop's dt rather than a step
 * per frame, so a slide takes the same wall-clock time at 30fps as at 60 and
 * stays deterministic for tests.
 */

const CURSOR_SPEED = 20;
const PANEL_SPEED = 9;

export function createMenu(entries, startIndex = 0) {
  const state = {
    entries,
    index: clamp(startIndex, entries.length),
    /** Eased position of the highlight. Fractional while it travels. */
    cursorY: clamp(startIndex, entries.length),
    /** 0..1 while the detail panel swaps to a new game. */
    panel: 1,
    /** 0..1 entrance progress, driving the staggered reveal. */
    enter: 0,
    /** 0..1 sawtooth for the marker. */
    pulse: 0,
    /** Counts down after a rejected pick, to flash the "not yet" notice. */
    nudge: 0,
  };

  function clamp(i, len) {
    if (len === 0) return 0;
    return ((i % len) + len) % len;
  }

  function go(index) {
    const next = clamp(index, entries.length);
    if (next !== state.index) state.panel = 0;
    state.index = next;
    state.nudge = 0;
  }

  return {
    state,

    move(delta) {
      go(state.index + delta);
    },

    to(index) {
      go(index);
    },

    current() {
      return entries[state.index] ?? null;
    },

    /**
     * Returns the entry to launch, or null when the pick isn't playable yet.
     * Rejecting sets a short-lived nudge so the UI can say why.
     */
    pick() {
      const entry = entries[state.index];
      if (entry?.start) return entry;
      state.nudge = 1.6;
      return null;
    },

    /**
     * How far a row has arrived, 0..1.
     *
     * Rows land in sequence rather than together — a list that assembles reads
     * as a place opening, where everything appearing at once reads as a redraw.
     */
    rowEnter(i) {
      const delay = i * 0.12;
      return Math.max(0, Math.min(1, (state.enter - delay) / 0.35));
    },

    update(dt) {
      state.pulse = (state.pulse + dt * 0.6) % 1;
      state.enter = Math.min(1.5, state.enter + dt);

      state.cursorY += (state.index - state.cursorY) * (1 - Math.exp(-CURSOR_SPEED * dt));
      if (Math.abs(state.cursorY - state.index) < 0.001) state.cursorY = state.index;

      state.panel = Math.min(1, state.panel + dt * PANEL_SPEED);
      if (state.nudge > 0) state.nudge = Math.max(0, state.nudge - dt);
    },

    /** Replay the entrance, for when the menu is returned to from a game. */
    replay() {
      state.enter = 0;
      state.panel = 0;
    },
  };
}
