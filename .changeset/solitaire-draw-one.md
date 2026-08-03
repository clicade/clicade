---
'@clicade/solitaire': minor
---

Turn one card at a time, or three.

Reported as "it shows 3 cards at once but I can only pick the top card". That is genuinely how draw-three Klondike works — two of every three stay buried until the pass comes round again — but the screen was showing three cards while only one of them could be picked up, which reads as broken rather than as a rule.

Both halves are fixed. Solitaire now turns **one** card by default, so every card in the stock becomes reachable in order. And the waste fan now shows only what the current draw actually exposed, so it never puts a card on screen that cannot be picked up.

Press `t` for three, or launch with `--draw 3`. The choice is remembered. Changing it applies to the next draw rather than forcing a new deal — throwing away a game in progress to change a rule is the worse outcome.

The footer names what the key will do (`t turn three` while turning one) rather than what is currently set, since a hint reading "turn one" while already turning one is the kind of label people press twice to decode.
