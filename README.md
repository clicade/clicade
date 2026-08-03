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

## Colour

Every game accepts the same flags:

```bash
npx @clicade/blackjack --mono        # monochrome
npx @clicade/blackjack --color       # force colour on
npx @clicade/blackjack --theme noir  # felt | paper | noir
```

Press **F2** in any game to switch between colour and monochrome live. The choice is saved globally, so it applies to every clicade game from then on — a player who wants monochrome shouldn't have to tell each game separately. `NO_COLOR` overrides everything and cannot be undone by a flag or a keypress.

F2 is reserved engine-wide for this. Function keys, deliberately: every letter stays available as a gameplay binding.

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

### Games

| Game | Package | Notes |
|---|---|---|
| Blackjack | `@clicade/blackjack` | 6 decks, 3:2, double and split |
| Solitaire | `@clicade/solitaire` | Klondike draw-three, unlimited undo, safe autoplay |

### Adding a game

A game is a module with a catalogue entry and a `start()`:

```js
// games/<name>/src/main.js
export const meta = { id, title, blurb, players, tags };
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
