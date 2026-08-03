---
'@clicade/solitaire': patch
---

Fix cards picked up from the waste being impossible to play onto the tableau.

Once anything was held, up and down were consumed by resizing the run being carried, so the cursor could never cross to the other row. A card taken from the waste could only ever reach a foundation, and a tableau card could only reach a foundation via the `a` shortcut. Up and down now resize the run first and change rows once it cannot resize further, and `tab` always crosses rows.

Crossing rows also landed on the wrong column: the cursor moved by slot index while the board draws by column, so leaving a foundation put the cursor one column to its left. Both now read the same layout constant.
