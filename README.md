# clicade

Terminal games that are actually good. Run one with `npx`, play it in two minutes, close it and get your shell back exactly as you left it.

```bash
npx clicade                # the arcade launcher
npx @clicade/blackjack     # or go straight to a game
npx @clicade/solitaire
```

## Why

Most `npx` games fail the same way: they prompt with `readline` so you type an answer and press Enter (a form, not a game), they pull a heavy TUI framework so cold start is five seconds, and they scroll the terminal into garbage instead of drawing a screen. clicade fixes those first and treats presentation as the actual product — the rules of blackjack are eighty lines; making it *feel* like a table is the work.

## Design rules

| Rule | Enforced by |
|---|---|
| Zero runtime dependencies | `scripts/dep-check.mjs` in CI |
| Under 150 KB per game | `scripts/size-check.mjs` in CI |
| Starts in under a second | consequence of the two above |
| Works on every terminal | capability ladder in `packages/tui/src/caps.js` |
| Never leaves your shell broken | single idempotent cleanup path in `packages/tui/src/app.js` |
| Playable at 80×24 | golden-frame tests |
| Terminal size can't change outcomes | fixed logical stage in `packages/tui/src/stage.js` |

## Setup, colour and contrast

The first `npx clicade` opens a short setup flow. It asks about **contrast** and **background** because those are the two things a terminal genuinely will not tell us: it reports its size and its colour depth, but not that you run a dark theme our green felt fights. Guessing wrong there makes the first launch — the one that counts — look broken.

Everything is changeable afterwards, and setup can be run again:

```bash
npx clicade --settings   # settings directly
npx clicade --setup      # run first-time setup again
npx clicade --check      # what your terminal fits, printed and nothing else
```

Press **s** in the menu for settings, **r** in settings to redo setup.

| Setting | Options | What it does |
|---|---|---|
| Contrast | Normal · High | Pushes text away from its background. Derived from the palette, not hand-authored, so all three stay in step. |
| Background | Themed · **Terminal** | Terminal paints **no background at all** — your own shows through, untouched. |
| Size | Compact · Normal · Roomy | Card size and spacing. Reaches solitaire and the launcher; **not** blackjack, whose table is built around full-size cards. |
| Colour | Colour · Monochrome | Same as `--mono` and F2. |
| Palette | Felt · Paper · Noir | |

Settings preview live: the screen redraws in the theme being edited, with real cards and real text tones, so a contrast choice is visible while the cursor is still on it.

**Background: Terminal** is the answer to a dark-themed terminal. `styleToSgr` emits nothing for a null background, so we send no `48;…` sequence and your terminal keeps whatever it already was. Cards keep their faces — without one a card stops reading as an object sitting on something.

### Does your terminal fit?

Contrast and background need a human eye. Size does not — how many columns you have is a number, so clicade measures it and says so rather than asking you to guess and find out when a pile compresses:

```
100x30  room to spare - wants 77x30
70x24   too small - needs 72x22            try compact
```

That reading sits under the settings screen and beside the Size question in setup, which opens pre-set to whatever suits the window it measured. A saved choice always outranks a measured one — a guess must never quietly undo a decision.

`npx clicade --check` prints the whole thing and enters no screen, so it survives being pasted into an issue:

```
size        needs    wants
compact     72x22    72x28    fits
normal      72x23    72x30    fits
roomy       77x23    77x30    fits <- recommended

per game, at each size:
  Blackjack    compact 72x22   normal 72x22   roomy 72x22  (same at every size)
  Solitaire    compact 45x21   normal 65x23   roomy 77x23
```

Every number there comes from the game itself — each exports `minSize(scale)` and `recommendedSize(scale)`, and the launcher only takes the maximum. Whether a game honours Size at all is *derived*, by asking it at both extremes and seeing whether the answer moves, so a stale flag can never claim otherwise.

The two sizes mean different things. **Needs** is the floor: below it the opening deal is already compressed into stripes, and play suspends rather than cropping. **Wants** is where a mid-game pile still fits uncompressed.

Terminal *font size* belongs to your emulator; no escape sequence changes it. Size here means cells. And Compact buys **width, not height** — a face-up card needs two rows for its rank whatever size it is, so shrinking cards saves 20 columns and a single row. Short windows are handled by pile compression instead. (The docs used to claim the opposite; the derivation above is what caught it.)

Flags still work and still win over saved preferences:

```bash
npx @clicade/blackjack --mono        # monochrome
npx @clicade/blackjack --color       # force colour on
npx @clicade/blackjack --theme noir  # felt | paper | noir
```

`NO_COLOR` overrides everything and cannot be undone by a flag or a keypress. F2 is reserved engine-wide for the colour toggle — a function key, deliberately, so every letter stays available as a gameplay binding.

## Resize and zoom must not change the game

Terminal zoom cannot be blocked — font size belongs to the emulator, and no escape sequence locks it. Zooming simply changes `cols`/`rows` and fires a resize, exactly like dragging the window.

So games take the terminal's size **once, at launch, and then freeze it**. You get the whole window, and zoom afterwards can't resize the world:

```js
createApp({
  // Locked to the terminal at startup. Never changes again.
  stage: { fill: true, minWidth: 72, minHeight: 22 },
  update() { /* only logical coords — never screen.cols */ },
  render(_alpha, { stage }) { stage.put(3, 1, 'x') },
})
```

After launch:

| Player does | Result |
|---|---|
| Zooms out / enlarges the window | World stays put; the extra space becomes letterbox |
| Zooms in / shrinks below the locked size | **Play pauses** with a resize prompt, then resumes exactly where it left off |
| Anything else | Nothing. The world is fixed. |

Cropping is never an option — a cropped view is unplayable and, in anything with hidden information, an unfair advantage.

The rule: **if `update()` reads terminal dimensions, it's a bug.** A player pressing Ctrl+`-` must never be able to move a piece, reveal a cell, or change a spawn. Reading the *stage* is fine, because the stage is frozen.

## Layout

```
packages/tui     terminal engine — screen, input, loop, capabilities   (never published)
packages/kit     presentation — cards, boards, tweens, themes          (never published)
packages/ai      opponents — minimax, alpha-beta, MCTS, heuristics     (never published)
games/*          one npm package each, published as @clicade/<name>
apps/arcade      the launcher, published as `clicade`
apps/demo        phase 0 harness — proves the engine, never published
```

Engine packages are bundled into each game at build time rather than published. Games therefore have no dependency tree, and internal refactors never break a published contract.

## The arcade

```bash
npx clicade              # the menu
npx clicade blackjack    # skip it
```

Every game is bundled *into* the launcher too. Spawning `npx @clicade/<game>` per pick would mean a network round trip and a second cold start each time somebody chose from the menu — the exact sluggishness this project exists to avoid. One download, everything plays instantly.

Quitting a game returns to the menu; Ctrl-C ends the session. That distinction is the whole reason `run()` resolves with a reason:

```js
const result = await app.run();   // { code, reason }
```

An app declares whether it owns the process. Standalone apps (`npx @clicade/blackjack`) end it; embedded ones hand control back. A game never knows which it is.

## The mouse

Blackjack's actions are buttons. Click them, or press the key printed on the face — the key is always shown, because the mouse is an addition to the keyboard and never a replacement. A terminal game that can only be played with a mouse has given up the thing that made it worth writing.

```
  What would you like to do? Click, or press the key.

  ╭───────╮ ╭─────────╮ ╭──────────╮ ╭─────────╮
  │ h hit │ │ s stand │ │ d double │ │ p split │
  ╰───────╯ ╰─────────╯ ╰──────────╯ ╰─────────╯
```

Unavailable actions are shown greyed rather than hidden — the opposite of the rule solitaire follows, and on purpose. In solitaire a missing hint is a key that does nothing. Here the four actions *are* blackjack, and seeing that split exists, greyed because this hand is not a pair, is how the table teaches the game.

Reporting uses SGR mode (`1006`) rather than the original X10 encoding, which packs each coordinate into a single byte and so cannot address a column past 223 — reachable on any maximised window.

**Turning the mouse on takes away your terminal's own text selection**: a drag becomes the game's event instead of a highlight. So **F3** switches it off and on, and the choice is remembered. Most terminals also let you hold Shift for native selection while it is on.

Buttons record their clickable region *from the same numbers that drew them*, in the same call. Drawn in one place and clickable in another is the classic failure here, and it looks perfect in a screenshot.

### Games

| Game | Package | Notes |
|---|---|---|
| Blackjack | `@clicade/blackjack` | 6 decks, 3:2, double and split — clickable |
| Solitaire | `@clicade/solitaire` | Klondike, turn one or three, unlimited undo, safe autoplay |

Solitaire turns **one** card by default. Press `t` for three — the classic, harder deal, where two of every three cards stay buried until the pass comes round again. The choice is remembered, takes effect on the next draw rather than discarding the game in progress, and can be set at launch:

```bash
npx @clicade/solitaire --draw 3
```

### Adding a game

A game is a module with a catalogue entry and a `start()`:

```js
// games/<name>/src/main.js
export const meta = {
  id, title, blurb, players, tags,
  // What window it needs, and what it would rather have. The launcher reports
  // these; a game owns its own requirement because nothing else can know it.
  minSize: (scale) => ({ width, height }),
  recommendedSize: (scale) => ({ width, height }),
};
export function start(opts = {}) {
  /* build state here, not at import time — the launcher calls this repeatedly */
  return createApp({ standalone: opts.standalone !== false, ... }).run();
}
```

Then `index.js` calls `start({ standalone: true })` and `apps/arcade/src/catalog.js` gets one line. Nothing may run at import time: the launcher imports every game once and calls `start()` many times, so anything built at module scope goes stale the moment a player quits and comes back.

## Development

```bash
pnpm install
pnpm arcade      # the launcher, from source
pnpm blackjack   # one game, from source
pnpm solitaire
pnpm demo        # run the engine harness — bouncing box, live caps, fps
pnpm test        # unit + golden-frame tests (node:test, no test framework)
pnpm build       # esbuild every publishable package to dist/cli.js
pnpm check:deps  # zero-runtime-dependency rule
pnpm check:size  # bundle budget
```

### Testing the degradation ladder

The engine downgrades rather than breaking. Force each floor case without hunting for an old terminal:

```bash
NO_COLOR=1 pnpm demo        # monochrome
FORCE_COLOR=1 pnpm demo     # 16 colors
CLICADE_ASCII=1 pnpm demo   # ASCII box-drawing instead of Unicode
TERM=dumb pnpm demo         # no alt screen, no color
pnpm demo | cat             # non-TTY: must exit cleanly, never hang
```

Saves and preferences go to `CLICADE_CONFIG_DIR` when it is set, which is how the suite avoids rewriting your own bankroll:

```bash
CLICADE_CONFIG_DIR=/tmp/clicade pnpm arcade   # a throwaway profile
```

Before any release, play one game for real in: Windows Terminal, legacy `cmd.exe`, PowerShell 5.1, VS Code's integrated terminal, WSL, macOS Terminal.app, and one `ssh` session. Automated tests cover layout; only a human notices flicker.

## Releasing

Changesets drives versioning. Record intent when you make a change:

```bash
pnpm changeset   # pick packages, pick bump, write one line
```

Merging that PR queues a release. The workflow then opens a "version packages" PR; merging *that* publishes to npm with provenance via GitHub OIDC — no stored npm token.

## License

MIT
