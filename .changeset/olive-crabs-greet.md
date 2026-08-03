---
'clicade': minor
'@clicade/blackjack': minor
'@clicade/solitaire': minor
---

Add first-run setup, a settings screen, and motion to the arcade.

The first `npx clicade` now walks through a short setup asking about contrast and background — the two things a terminal reports nothing useful about. Both are changeable afterwards from settings (`s` in the menu, or `--settings`), and setup can be run again with `r` there or `--setup`.

**Background: Terminal** is the real fix for a dark-themed terminal. It paints no background at all rather than covering yours with ours, which on a dark terminal produced two near-identical blacks with a seam between them. Cards keep their faces.

**Contrast: High** is derived from each palette rather than hand-authored, so all three stay in step, and it measurably improves the text-to-background ratio on every one.

**Size** sets card size and spacing. Terminal font size belongs to the emulator; Compact exists so a deep solitaire pile fits a short window.

Settings preview live — the screen redraws in the theme being edited, with real cards and text tones.

The menu now animates: rows arrive in sequence, the highlight slides between them, and the detail panel fades when the selection changes. Motion is driven by delta time, so it takes the same wall-clock time at 30fps as at 60.
