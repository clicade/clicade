#!/usr/bin/env node
/**
 * Phase 0 harness.
 *
 * Not a game — a proof that the engine holds up. On screen at once:
 *   - a box bouncing at 60fps, to expose flicker or tearing
 *   - live FPS, to expose loop drift
 *   - the detected capability ladder, to verify degradation
 *   - a truecolor gradient, to verify the color downgrade path
 *   - the last key pressed, to verify raw input and escape parsing
 *   - a resize counter, to prove resize does NOT move the box
 *
 * Zoom in and out while it runs. The box keeps its position and velocity in
 * world units; only the letterbox around it changes. Simulation must never
 * read terminal size — see packages/tui/src/stage.js.
 *
 * Quit with q or Ctrl-C, then check the shell still echoes and the cursor is
 * back. That last part is the whole point.
 */

import { createApp, box, labelledBox, pad, mix } from '@clicade/tui';

const BG = '#0d1117';
const PANEL = '#161b22';
const ACCENT = '#58a6ff';
const TEXT = '#c9d1d9';
const MUTED = '#6e7681';
const GOOD = '#3fb950';
const WARN = '#d29922';

/** Fixed logical playfield. Every coordinate below is in these units. */
const WORLD_W = 72;
const WORLD_H = 22;

/** The bouncing area inside the world, in world units. */
const FIELD = { x: 1, y: 9, w: WORLD_W - 2, h: WORLD_H - 11 };
const BOX_W = 8;
const BOX_H = 3;

const state = {
  x: 10,
  y: 11,
  vx: 22,
  vy: 11,
  lastKey: '(none)',
  elapsed: 0,
  resizes: 0,
};

const app = createApp({
  fps: 60,
  stage: { width: WORLD_W, height: WORLD_H },
  update,
  render,
  onKey,
});

function update(dt) {
  state.elapsed += dt;

  state.x += state.vx * dt;
  state.y += state.vy * dt;

  // Bounds come from the fixed world, never from the terminal.
  const minX = FIELD.x + 1;
  const maxX = FIELD.x + FIELD.w - 1 - BOX_W;
  const minY = FIELD.y + 1;
  const maxY = FIELD.y + FIELD.h - 1 - BOX_H;

  if (state.x < minX) {
    state.x = minX;
    state.vx = Math.abs(state.vx);
  }
  if (state.x > maxX) {
    state.x = maxX;
    state.vx = -Math.abs(state.vx);
  }
  if (state.y < minY) {
    state.y = minY;
    state.vy = Math.abs(state.vy);
  }
  if (state.y > maxY) {
    state.y = maxY;
    state.vy = -Math.abs(state.vy);
  }
}

function render(_alpha, ctx) {
  const { stage, screen, glyphs: g, caps } = ctx;
  screen.clear({ bg: BG });

  // --- header ---
  labelledBox(
    stage,
    g,
    0,
    0,
    WORLD_W,
    8,
    'clicade engine // phase 0',
    { fg: MUTED, bg: BG },
    { fg: ACCENT, bg: BG },
    'round',
  );

  const depthName = ['none', '16', '256', 'truecolor'][caps.colorDepth];
  const rows = [
    ['tty', yes(caps.isTTY), caps.isTTY],
    ['raw input', yes(caps.rawInput), caps.rawInput],
    ['alt screen', yes(caps.altScreen), caps.altScreen],
    ['unicode', yes(caps.unicode), caps.unicode],
    ['color', depthName, caps.colorDepth > 0],
  ];

  rows.forEach(([label, value, ok], i) => {
    stage.put(3, 1 + i, pad(label, 12), { fg: MUTED, bg: BG });
    stage.put(15, 1 + i, pad(value, 11), { fg: ok ? GOOD : WARN, bg: BG, bold: true });
  });

  stage.put(29, 1, pad(`world   ${WORLD_W}x${WORLD_H} fixed`, 22), { fg: TEXT, bg: BG });
  stage.put(29, 2, pad(`term    ${screen.cols}x${screen.rows}`, 22), { fg: TEXT, bg: BG });
  stage.put(29, 3, pad(`fps     ${ctx.fps}`, 22), { fg: TEXT, bg: BG });
  stage.put(29, 4, pad(`resizes ${state.resizes}`, 22), { fg: TEXT, bg: BG });
  stage.put(29, 5, pad(`key     ${state.lastKey}`, 22), { fg: ACCENT, bg: BG });

  // Gradient strip — on a 16-color terminal this collapses to bands, which is
  // exactly the degradation we want to see rather than a crash.
  const stripX = 53;
  stage.put(stripX, 1, 'color ladder', { fg: MUTED, bg: BG });
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    stage.put(stripX + i, 2, g.block, { fg: mix('#58a6ff', '#f778ba', t), bg: BG });
    stage.put(stripX + i, 3, g.shadeDark, { fg: mix('#3fb950', '#d29922', t), bg: BG });
    stage.put(stripX + i, 4, g.shadeMed, { fg: mix('#f778ba', '#ffa657', t), bg: BG });
  }

  // --- play field ---
  box(stage, g, FIELD.x, FIELD.y, FIELD.w, FIELD.h, { fg: MUTED, bg: BG });

  const bx = Math.round(state.x);
  const by = Math.round(state.y);
  stage.fill(bx, by, BOX_W, BOX_H, ' ', { bg: ACCENT });
  stage.put(bx + 1, by + 1, '60fps', { fg: PANEL, bg: ACCENT, bold: true });

  // Shadow proves per-cell styling and layering both work.
  if (by + BOX_H < FIELD.y + FIELD.h - 1) {
    stage.fill(bx + 1, by + BOX_H, BOX_W, 1, g.shadeLight, { fg: MUTED, bg: BG });
  }

  const hint = ' q quit   r reset   arrows nudge   zoom freely, nothing moves ';
  stage.put(Math.max(0, Math.floor((WORLD_W - hint.length) / 2)), WORLD_H - 1, hint, {
    fg: MUTED,
    bg: BG,
  });
}

function onKey(key, ctx) {
  const mods = [key.ctrl && 'ctrl', key.alt && 'alt', key.shift && 'shift'].filter(Boolean);
  state.lastKey = [...mods, key.name].join('+');

  if (key.name === 'q') ctx.quit(0);
  if (key.name === 'r') {
    state.x = 10;
    state.y = 11;
    state.elapsed = 0;
  }
  if (key.name === 'left') state.vx = -Math.abs(state.vx);
  if (key.name === 'right') state.vx = Math.abs(state.vx);
  if (key.name === 'up') state.vy = -Math.abs(state.vy);
  if (key.name === 'down') state.vy = Math.abs(state.vy);
}

function yes(v) {
  return v ? 'yes' : 'no';
}

if (!app.blocked) {
  app.run();
  // Counts resizes only. Deliberately does not touch game state — that was the
  // bug this whole stage abstraction exists to prevent.
  process.stdout.on('resize', () => {
    state.resizes++;
  });
}
