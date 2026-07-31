---
"@clicade/blackjack": patch
---

Fix the table rendering at minimum size in a maximised terminal. The stage
read the screen's dimensions before they existed, so every game locked to the
smallest playable world regardless of window size.
