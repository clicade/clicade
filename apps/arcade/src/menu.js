/**
 * Menu state.
 *
 * Pure state plus a cosmetic pulse. Nothing here reads the terminal, so the
 * menu behaves identically at every size — same rule the games follow.
 */

export function createMenu(entries, startIndex = 0) {
  const state = {
    entries,
    index: clamp(startIndex, entries.length),
    /** 0..1 sawtooth used to breathe the selection marker. */
    pulse: 0,
    /** Counts down after a rejected pick, to flash the "not yet" notice. */
    nudge: 0,
  };

  function clamp(i, len) {
    if (len === 0) return 0;
    return ((i % len) + len) % len;
  }

  return {
    state,

    move(delta) {
      state.index = clamp(state.index + delta, entries.length);
      state.nudge = 0;
    },

    to(index) {
      state.index = clamp(index, entries.length);
      state.nudge = 0;
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

    update(dt) {
      state.pulse = (state.pulse + dt * 0.6) % 1;
      if (state.nudge > 0) state.nudge = Math.max(0, state.nudge - dt);
    },
  };
}
