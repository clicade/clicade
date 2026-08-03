# @clicade/blackjack

## 0.1.0

### Minor Changes

- 5364a45: First release. Blackjack with a real table: animated deals, a hole card that
  flips, fanned hands, hit/stand/double/split, persistent bankroll, and a seeded
  shoe so any round can be replayed.
- a0d18ff: Add the arcade launcher: `npx clicade` opens a menu of games, `npx clicade blackjack` skips it.

  Games are bundled into the launcher rather than spawned, so picking one starts instantly instead of costing a second network round trip. Quitting a game returns to the menu; Ctrl-C ends the session.

  Also:

  - `app.run()` now resolves with `{ code, reason }` instead of ending the process unconditionally. Apps declare `standalone`; embedded ones hand control back to their caller.
  - Apps remove the process listeners they add, so a long session of launching games no longer leaks handlers.
  - New `onQuit` hook runs on every exit path, including Ctrl-C — blackjack's stats are now saved when you interrupt it, which they previously were not.
  - Arrow hints in the footer come from the glyph set, so ASCII-only terminals show `<>` and `^v` rather than replacement boxes.
  - Saves and preferences honour `CLICADE_CONFIG_DIR`, and resolve their path per call rather than at import.

- 2350f5d: The table now fills the terminal, sized once at launch and frozen so zoom
  still cannot change the game. Added `--mono`, `--color` and `--theme` flags
  plus a live F2 colour toggle whose choice is remembered across games.

### Patch Changes

- 55de52c: Fix the table rendering at minimum size in a maximised terminal. The stage
  read the screen's dimensions before they existed, so every game locked to the
  smallest playable world regardless of window size.
