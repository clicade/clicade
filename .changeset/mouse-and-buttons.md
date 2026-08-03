---
'clicade': minor
'@clicade/blackjack': minor
---

Add mouse support, and make blackjack's actions clickable buttons.

Blackjack now asks "What would you like to do?" above a row of buttons — hit, stand, double, split — each carrying the key that performs it. Click one, or press its key. The key is always on the face: the mouse is an addition to the keyboard, never a replacement.

Unavailable actions are shown greyed rather than hidden, which is the opposite of the rule solitaire follows and is deliberate. In solitaire a missing hint is a key that does nothing. Here the four actions *are* blackjack, and seeing that split exists — greyed, because this hand is not a pair — is how the table teaches the game.

Reporting uses SGR mode (1006) rather than the original X10 encoding, which packs each coordinate into a single byte and therefore cannot address a column past 223, reachable on any maximised window. Hover is included so a button answers the pointer instead of looking like a picture of one.

Turning the mouse on takes the terminal's own text selection away from the player, so **F3** switches it off and on and the choice is remembered.

Two things this fixed on the way:

- An SGR mouse report does not match the CSI pattern, because of its `<`. It fell through to "escape plus a character is alt" and sprayed `alt+[`, `<`, `0`, `;` … as keystrokes. Any terminal that volunteered mouse reports could play a card by being clicked. Reports are now recognised whether or not anything is listening for them.
- Mouse reporting is disabled on every exit path, including a crash. A terminal left reporting prints coordinates into the shell on every mouse movement, which looks like the shell itself is broken.

Buttons record their clickable region from the same numbers that drew them, in the same call, so a button cannot be drawn in one place and clickable in another. Bordered buttons appear where the window has spare height; below 26 rows the same buttons draw flat on the row the hints already used, so the minimum window does not grow and 80x24 still plays.
