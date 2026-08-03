# @clicade/blackjack

## 0.2.0

### Minor Changes

- b720b98: Add mouse support, and make blackjack's actions clickable buttons.

  Blackjack now asks "What would you like to do?" above a row of buttons — hit, stand, double, split — each carrying the key that performs it. Click one, or press its key. The key is always on the face: the mouse is an addition to the keyboard, never a replacement.

  Unavailable actions are shown greyed rather than hidden, which is the opposite of the rule solitaire follows and is deliberate. In solitaire a missing hint is a key that does nothing. Here the four actions _are_ blackjack, and seeing that split exists — greyed, because this hand is not a pair — is how the table teaches the game.

  Reporting uses SGR mode (1006) rather than the original X10 encoding, which packs each coordinate into a single byte and therefore cannot address a column past 223, reachable on any maximised window. Hover is included so a button answers the pointer instead of looking like a picture of one.

  Turning the mouse on takes the terminal's own text selection away from the player, so **F3** switches it off and on and the choice is remembered.

  Two things this fixed on the way:

  - An SGR mouse report does not match the CSI pattern, because of its `<`. It fell through to "escape plus a character is alt" and sprayed `alt+[`, `<`, `0`, `;` … as keystrokes. Any terminal that volunteered mouse reports could play a card by being clicked. Reports are now recognised whether or not anything is listening for them.
  - Mouse reporting is disabled on every exit path, including a crash. A terminal left reporting prints coordinates into the shell on every mouse movement, which looks like the shell itself is broken.

  Buttons record their clickable region from the same numbers that drew them, in the same call, so a button cannot be drawn in one place and clickable in another. Bordered buttons appear where the window has spare height; below 26 rows the same buttons draw flat on the row the hints already used, so the minimum window does not grow and 80x24 still plays.

- e308d96: Add first-run setup, a settings screen, and motion to the arcade.

  The first `npx clicade` now walks through a short setup asking about contrast and background — the two things a terminal reports nothing useful about. Both are changeable afterwards from settings (`s` in the menu, or `--settings`), and setup can be run again with `r` there or `--setup`.

  **Background: Terminal** is the real fix for a dark-themed terminal. It paints no background at all rather than covering yours with ours, which on a dark terminal produced two near-identical blacks with a seam between them. Cards keep their faces.

  **Contrast: High** is derived from each palette rather than hand-authored, so all three stay in step, and it measurably improves the text-to-background ratio on every one.

  **Size** sets card size and spacing. Terminal font size belongs to the emulator; Compact exists so a deep solitaire pile fits a short window.

  Settings preview live — the screen redraws in the theme being edited, with real cards and text tones.

  The menu now animates: rows arrive in sequence, the highlight slides between them, and the detail panel fades when the selection changes. Motion is driven by delta time, so it takes the same wall-clock time at 30fps as at 60.

### Patch Changes

- 6113aab: Drop the `./` prefix from `bin` paths. npm normalised it away on publish and warned that the entry "was invalid and removed" — misleading wording for what is only a rewrite, but the warning is noise on every release.
- fef81f7: Tell the player whether their terminal fits.

  Contrast and background need a human eye. Size does not — how many columns you have is a number, so clicade now measures it. The settings screen and the Size question in setup both show the reading, and setup opens pre-set to whatever suits the window it measured. A saved choice always outranks a measured one, so a guess can never quietly undo a decision.

  `npx clicade --check` prints the full table and enters no screen, so the output survives being pasted into an issue.

  Every number comes from the game itself: each exports `minSize(scale)` and `recommendedSize(scale)`, and the launcher takes the maximum across the games and the shell. Whether a game honours Size at all is derived by asking it at both extremes rather than declared, so a stale flag cannot claim otherwise.

  Deriving those numbers corrected two things the docs had wrong:

  - Solitaire's minimum height was fixed at 24 for every size, so Compact never lowered the requirement it existed to lower. It is now derived per size from the opening deal fitting uncompressed — 21 rows at Compact, 23 at Normal.
  - Compact was described as fitting _short_ windows. It fits _narrow_ ones. A face-up card needs two rows for its rank at any size, so shrinking cards saves 20 columns and one row; short windows are handled by pile compression instead.

  Also fixed: the chosen option in setup was marked only by colour, so in monochrome nothing showed which was selected. It is now drawn with a doubled border. The settings header no longer claims settings apply everywhere — Size does not reach blackjack, and the fit report can now show that on screen.

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
