# @clicade/solitaire

## 0.1.0

### Minor Changes

- e308d96: Add first-run setup, a settings screen, and motion to the arcade.

  The first `npx clicade` now walks through a short setup asking about contrast and background — the two things a terminal reports nothing useful about. Both are changeable afterwards from settings (`s` in the menu, or `--settings`), and setup can be run again with `r` there or `--setup`.

  **Background: Terminal** is the real fix for a dark-themed terminal. It paints no background at all rather than covering yours with ours, which on a dark terminal produced two near-identical blacks with a seam between them. Cards keep their faces.

  **Contrast: High** is derived from each palette rather than hand-authored, so all three stay in step, and it measurably improves the text-to-background ratio on every one.

  **Size** sets card size and spacing. Terminal font size belongs to the emulator; Compact exists so a deep solitaire pile fits a short window.

  Settings preview live — the screen redraws in the theme being edited, with real cards and text tones.

  The menu now animates: rows arrive in sequence, the highlight slides between them, and the detail panel fades when the selection changes. Motion is driven by delta time, so it takes the same wall-clock time at 30fps as at 60.

- c4df605: Add Klondike solitaire — `npx @clicade/solitaire`, or pick it from the arcade.

  Draw three, unlimited undo, hints, and an autoplay that only takes cards it can prove are safe. Cards deal in, uncovered cards flip, and a held run is drawn lifted so the selection is visible without colour.

  This is the second caller for the card kit, which until now had only ever rendered blackjack. It needed one thing the kit could not do: piles that overlap downward. `renderPile` and `pileOffsets` are the addition — face-up cards take two rows, face-down take one, and a pile too tall for the window compresses uniformly rather than dropping its bottom card, which is the only one you can play.

- fef81f7: Tell the player whether their terminal fits.

  Contrast and background need a human eye. Size does not — how many columns you have is a number, so clicade now measures it. The settings screen and the Size question in setup both show the reading, and setup opens pre-set to whatever suits the window it measured. A saved choice always outranks a measured one, so a guess can never quietly undo a decision.

  `npx clicade --check` prints the full table and enters no screen, so the output survives being pasted into an issue.

  Every number comes from the game itself: each exports `minSize(scale)` and `recommendedSize(scale)`, and the launcher takes the maximum across the games and the shell. Whether a game honours Size at all is derived by asking it at both extremes rather than declared, so a stale flag cannot claim otherwise.

  Deriving those numbers corrected two things the docs had wrong:

  - Solitaire's minimum height was fixed at 24 for every size, so Compact never lowered the requirement it existed to lower. It is now derived per size from the opening deal fitting uncompressed — 21 rows at Compact, 23 at Normal.
  - Compact was described as fitting _short_ windows. It fits _narrow_ ones. A face-up card needs two rows for its rank at any size, so shrinking cards saves 20 columns and one row; short windows are handled by pile compression instead.

  Also fixed: the chosen option in setup was marked only by colour, so in monochrome nothing showed which was selected. It is now drawn with a doubled border. The settings header no longer claims settings apply everywhere — Size does not reach blackjack, and the fit report can now show that on screen.

- 4d97bed: Turn one card at a time, or three.

  Reported as "it shows 3 cards at once but I can only pick the top card". That is genuinely how draw-three Klondike works — two of every three stay buried until the pass comes round again — but the screen was showing three cards while only one of them could be picked up, which reads as broken rather than as a rule.

  Both halves are fixed. Solitaire now turns **one** card by default, so every card in the stock becomes reachable in order. And the waste fan now shows only what the current draw actually exposed, so it never puts a card on screen that cannot be picked up.

  Press `t` for three, or launch with `--draw 3`. The choice is remembered. Changing it applies to the next draw rather than forcing a new deal — throwing away a game in progress to change a rule is the worse outcome.

  The footer names what the key will do (`t turn three` while turning one) rather than what is currently set, since a hint reading "turn one" while already turning one is the kind of label people press twice to decode.

### Patch Changes

- 088b9da: Fix cards picked up from the waste being impossible to play onto the tableau.

  Once anything was held, up and down were consumed by resizing the run being carried, so the cursor could never cross to the other row. A card taken from the waste could only ever reach a foundation, and a tableau card could only reach a foundation via the `a` shortcut. Up and down now resize the run first and change rows once it cannot resize further, and `tab` always crosses rows.

  Crossing rows also landed on the wrong column: the cursor moved by slot index while the board draws by column, so leaving a foundation put the cursor one column to its left. Both now read the same layout constant.

- 259d459: Say how to turn the stock over.

  Reported as "I can't cycle through the card pile". The mechanism was never broken — `d` drew, space on the stock drew, and an empty stock recycled the waste. Nothing on screen said so.

  The footer listed nine hints and not one of them was the stock. That matters more here than for any other verb: every other move can be found by pointing the cursor at a card and pressing space, but a pile that will not move looks like a pile that is finished. The footer now shows `d draw`, switching to `d recycle` once the stock empties, and disappearing only when there is genuinely nothing left to turn over. It is ranked so a narrow window trims something else first.

  An empty stock was also marked with a left arrow, which reads as "go back" on a pile with no back to go to. It is now a recycle mark (`↻`, or `O` where Unicode is unavailable).
