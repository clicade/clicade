---
'@clicade/solitaire': patch
---

Say how to turn the stock over.

Reported as "I can't cycle through the card pile". The mechanism was never broken — `d` drew, space on the stock drew, and an empty stock recycled the waste. Nothing on screen said so.

The footer listed nine hints and not one of them was the stock. That matters more here than for any other verb: every other move can be found by pointing the cursor at a card and pressing space, but a pile that will not move looks like a pile that is finished. The footer now shows `d draw`, switching to `d recycle` once the stock empties, and disappearing only when there is genuinely nothing left to turn over. It is ranked so a narrow window trims something else first.

An empty stock was also marked with a left arrow, which reads as "go back" on a pile with no back to go to. It is now a recycle mark (`↻`, or `O` where Unicode is unavailable).
