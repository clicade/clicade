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
 *   - live dimensions, to verify resize handling
 *
 * Quit with q or Ctrl-C, then check the shell still echoes and the cursor is
 * back. That last part is the whole point.
 */

import { createApp, box, labelledBox, putCenter, pad, mix } from '@clicade/tui';

const BG = '#0d1117';
const PANEL = '#161b22';
const ACCENT = '#58a6ff';
const TEXT = '#c9d1d9';
const MUTED = '#6e7681';
const GOOD = '#3fb950';
const WARN = '#d29922';

const app = createApp({
  fps: 60,
  setup,
  update,
  render,
  onKey,
});

const state = {
  x: 10,
  y: 6,
  vx: 22,
  vy: 11,
  lastKey: '(none)',
  elapsed: 0,
  resizes: 0,
};

function setup(ctx) {
  state.cols = ctx.screen.cols;
  state.rows = ctx.screen.rows;
}

function update(dt, ctx) {
  state.elapsed += dt;
  const { screen } = ctx;

  const fieldX = 2;
  const fieldY = 9;
  const fieldW = screen.cols - 4;
  const fieldH = screen.rows - fieldY - 3;
  const boxW = 8;
  const boxH = 3;

  state.x += state.vx * dt;
  state.y += state.vy * dt;

  if (state.x < fieldX + 1) {
    state.x = fieldX + 1;
    state.vx = Math.abs(state.vx);
  }
  if (state.x + boxW > fieldX + fieldW - 1) {
    state.x = fieldX + fieldW - 1 - boxW;
    state.vx = -Math.abs(state.vx);
  }
  if (state.y < fieldY + 1) {
    state.y = fieldY + 1;
    state.vy = Math.abs(state.vy);
  }
  if (state.y + boxH > fieldY + fieldH - 1) {
    state.y = fieldY + fieldH - 1 - boxH;
    state.vy = -Math.abs(state.vy);
  }
}

function render(_alpha, ctx) {
  const { screen, glyphs: g, caps } = ctx;
  screen.clear({ bg: BG });

  // --- header ---
  labelledBox(screen, g, 0, 0, screen.cols, 8, 'clicade engine // phase 0', { fg: MUTED, bg: BG }, { fg: ACCENT, bg: BG }, 'round');

  const depthName = ['none', '16', '256', 'truecolor'][caps.colorDepth];
  const rows = [
    ['tty', yes(caps.isTTY), caps.isTTY],
    ['raw input', yes(caps.rawInput), caps.rawInput],
    ['alt screen', yes(caps.altScreen), caps.altScreen],
    ['unicode', yes(caps.unicode), caps.unicode],
    ['color', depthName, caps.colorDepth > 0],
  ];

  rows.forEach(([label, value, ok], i) => {
    const y = 1 + i;
    screen.put(3, y, pad(label, 12), { fg: MUTED, bg: BG });
    screen.put(15, y, pad(value, 12), { fg: ok ? GOOD : WARN, bg: BG, bold: true });
  });

  screen.put(32, 1, pad(`size    ${screen.cols}x${screen.rows}`, 24), { fg: TEXT, bg: BG });
  screen.put(32, 2, pad(`fps     ${ctx.fps}`, 24), { fg: TEXT, bg: BG });
  screen.put(32, 3, pad(`resizes ${state.resizes}`, 24), { fg: TEXT, bg: BG });
  screen.put(32, 4, pad(`uptime  ${state.elapsed.toFixed(1)}s`, 24), { fg: TEXT, bg: BG });
  screen.put(32, 5, pad(`key     ${state.lastKey}`, 24), { fg: ACCENT, bg: BG });

  // Gradient strip — on a 16-color terminal this collapses to bands, which is
  // exactly the degradation we want to see rather than a crash.
  const stripX = 58;
  if (screen.cols > stripX + 18) {
    screen.put(stripX, 1, 'color ladder', { fg: MUTED, bg: BG });
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      screen.put(stripX + i, 2, g.block, { fg: mix('#58a6ff', '#f778ba', t), bg: BG });
      screen.put(stripX + i, 3, g.shadeDark, { fg: mix('#3fb950', '#d29922', t), bg: BG });
      screen.put(stripX + i, 4, g.shadeMed, { fg: mix('#f778ba', '#ffa657', t), bg: BG });
    }
  }

  // --- play field ---
  const fieldY = 9;
  const fieldH = screen.rows - fieldY - 3;
  if (fieldH > 3) {
    box(screen, g, 2, fieldY, screen.cols - 4, fieldH, { fg: MUTED, bg: BG });

    const bx = Math.round(state.x);
    const by = Math.round(state.y);
    screen.fill(bx, by, 8, 3, ' ', { bg: ACCENT });
    screen.put(bx + 1, by + 1, '60fps', { fg: PANEL, bg: ACCENT, bold: true });

    // Shadow proves per-cell styling and layering both work.
    if (by + 3 < fieldY + fieldH - 1) {
      screen.fill(bx + 1, by + 3, 8, 1, g.shadeLight, { fg: MUTED, bg: BG });
    }
  }

  putCenter(screen, screen.rows - 2, ' q quit   r reset   arrows nudge ', { fg: MUTED, bg: BG });
}

function onKey(key, ctx) {
  const mods = [key.ctrl && 'ctrl', key.alt && 'alt', key.shift && 'shift'].filter(Boolean);
  state.lastKey = [...mods, key.name].join('+');

  if (key.name === 'q') ctx.quit(0);
  if (key.name === 'r') {
    state.x = 10;
    state.y = 6;
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
  const ctx = app.run();
  process.stdout.on('resize', () => {
    state.resizes++;
    state.x = Math.min(state.x, ctx.screen.cols - 12);
    state.y = Math.min(state.y, ctx.screen.rows - 6);
  });
}
