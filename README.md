# clicade

Terminal games that are actually good. Run one with `npx`, play it in two minutes, close it and get your shell back exactly as you left it.

```bash
npx clicade                # the arcade launcher
npx @clicade/blackjack     # or go straight to a game
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

## Resize and zoom must not change the game

Terminal zoom cannot be blocked — font size belongs to the emulator, and no escape sequence locks it. Zooming simply changes `cols`/`rows` and fires a resize, exactly like dragging the window.

So games are built to be invariant to it. Simulation runs in **fixed logical units**; the terminal is only a camera:

```js
createApp({
  stage: { width: 72, height: 22 },   // the world. never changes.
  update() { /* only logical coords — never screen.cols */ },
  render(_alpha, { stage }) { stage.put(3, 1, 'x') },
})
```

- `stage.put` / `stage.fill` take logical coordinates and clip to the world
- resize only re-centres the letterbox; logical positions are untouched
- a terminal too small to show the whole stage **pauses play** rather than cropping — a cropped view is unplayable and, in anything with hidden information, an unfair advantage

The rule: **if `update()` reads terminal dimensions, it's a bug.** A player pressing Ctrl+`-` must never be able to move a piece, reveal a cell, or change a spawn.

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

## Development

```bash
pnpm install
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

Before any release, play one game for real in: Windows Terminal, legacy `cmd.exe`, PowerShell 5.1, VS Code's integrated terminal, WSL, macOS Terminal.app, and one `ssh` session. Automated tests cover layout; only a human notices flicker.

## Releasing

Changesets drives versioning. Record intent when you make a change:

```bash
pnpm changeset   # pick packages, pick bump, write one line
```

Merging that PR queues a release. The workflow then opens a "version packages" PR; merging *that* publishes to npm with provenance via GitHub OIDC — no stored npm token.

## License

MIT
