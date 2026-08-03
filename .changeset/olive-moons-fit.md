---
'clicade': minor
'@clicade/blackjack': patch
'@clicade/solitaire': minor
---

Tell the player whether their terminal fits.

Contrast and background need a human eye. Size does not — how many columns you have is a number, so clicade now measures it. The settings screen and the Size question in setup both show the reading, and setup opens pre-set to whatever suits the window it measured. A saved choice always outranks a measured one, so a guess can never quietly undo a decision.

`npx clicade --check` prints the full table and enters no screen, so the output survives being pasted into an issue.

Every number comes from the game itself: each exports `minSize(scale)` and `recommendedSize(scale)`, and the launcher takes the maximum across the games and the shell. Whether a game honours Size at all is derived by asking it at both extremes rather than declared, so a stale flag cannot claim otherwise.

Deriving those numbers corrected two things the docs had wrong:

- Solitaire's minimum height was fixed at 24 for every size, so Compact never lowered the requirement it existed to lower. It is now derived per size from the opening deal fitting uncompressed — 21 rows at Compact, 23 at Normal.
- Compact was described as fitting *short* windows. It fits *narrow* ones. A face-up card needs two rows for its rank at any size, so shrinking cards saves 20 columns and one row; short windows are handled by pile compression instead.

Also fixed: the chosen option in setup was marked only by colour, so in monochrome nothing showed which was selected. It is now drawn with a doubled border. The settings header no longer claims settings apply everywhere — Size does not reach blackjack, and the fit report can now show that on screen.
