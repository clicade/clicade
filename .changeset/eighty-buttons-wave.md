---
'@clicade/blackjack': patch
'clicade': patch
---

Drop the `./` prefix from `bin` paths. npm normalised it away on publish and warned that the entry "was invalid and removed" — misleading wording for what is only a rewrite, but the warning is noise on every release.
