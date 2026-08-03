---
'@clicade/solitaire': minor
'clicade': minor
---

Add Klondike solitaire — `npx @clicade/solitaire`, or pick it from the arcade.

Draw three, unlimited undo, hints, and an autoplay that only takes cards it can prove are safe. Cards deal in, uncovered cards flip, and a held run is drawn lifted so the selection is visible without colour.

This is the second caller for the card kit, which until now had only ever rendered blackjack. It needed one thing the kit could not do: piles that overlap downward. `renderPile` and `pileOffsets` are the addition — face-up cards take two rows, face-down take one, and a pile too tall for the window compresses uniformly rather than dropping its bottom card, which is the only one you can play.
