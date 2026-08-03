/**
 * The arcade front door.
 *
 * Reads menu state, draws a screen. Holds no behaviour and mutates nothing.
 *
 * The content sits in a fixed-width block centred in the stage rather than
 * stretching to fill it. A menu spread across a 200-column terminal is harder
 * to read, not more impressive; the extra space becomes quiet margin.
 *
 * Motion is done in colour rather than in characters wherever it can be. A
 * terminal has no alpha, but `mix` gives us a real fade between two colours,
 * and fading toward the background reads far better than swapping glyphs.
 */

import { strWidth, box, mix } from '@clicade/tui';
import { getScale } from '@clicade/kit';

const LIST_W = 26;
const PANEL_W = 36;
const PANEL_H = 9;

const WORDMARK = 'C L I C A D E';
const TAGLINE = 'terminal games that are actually good';

/** Smallest window that fits the block plus margins and the footer. */
export const MIN_W = LIST_W + 2 + PANEL_W + 2;
export const MIN_H = 3 + PANEL_H + 5;

export function layout(w, h, scale = 'normal') {
  const metrics = getScale(scale);
  const gap = metrics.gap;
  const blockW = LIST_W + gap + PANEL_W;
  const rowStep = 1 + metrics.rowStep;
  const blockH = 3 + Math.max(PANEL_H, 1);

  const bx = Math.max(0, Math.floor((w - blockW) / 2));
  const by = Math.max(1, Math.floor((h - blockH - 3) / 2));
  const controlsY = Math.min(h - 2, by + blockH + 2);

  return {
    w,
    h,
    bx,
    by,
    blockW,
    rowStep,
    listX: bx,
    panelX: bx + LIST_W + gap,
    bodyY: by + 4,
    controlsY,
    hintY: controlsY + 1,
  };
}

export function render(stage, g, menu, theme, ctx = {}) {
  const { state } = menu;
  const L = layout(stage.width, stage.height, ctx.scale);

  stage.fill(0, 0, L.w, L.h, ' ', { bg: theme.table });

  drawMasthead(stage, g, state, theme, L, menu);
  drawList(stage, g, menu, theme, L);
  drawPanel(stage, g, menu, theme, L);
  drawFooter(stage, g, menu, theme, L, ctx);
}

/** Fade a colour toward the background as a row arrives. */
function arriving(color, theme, t) {
  if (t >= 1) return color;
  return mix(theme.table ?? theme.tableDark, color, t);
}

function drawMasthead(stage, g, state, theme, L, menu) {
  const t = menu.rowEnter(0);
  stage.put(L.bx, L.by, WORDMARK, {
    fg: arriving(theme.accent, theme, t),
    bg: theme.table,
    bold: true,
  });

  const suits = `${g.spade} ${g.heart} ${g.diamond} ${g.club}`;
  stage.put(L.bx + strWidth(WORDMARK) + 3, L.by, suits, {
    fg: arriving(theme.textMuted, theme, menu.rowEnter(1)),
    bg: theme.table,
  });

  const count = `${state.entries.filter((e) => e.start).length} of ${state.entries.length} playable`;
  stage.put(L.bx + L.blockW - strWidth(count), L.by, count, {
    fg: arriving(theme.textMuted, theme, menu.rowEnter(1)),
    bg: theme.table,
  });

  stage.put(L.bx, L.by + 1, TAGLINE, {
    fg: arriving(theme.textMuted, theme, menu.rowEnter(1)),
    bg: theme.table,
  });

  // The rule draws itself in as the screen arrives.
  const ruleT = menu.rowEnter(1);
  const width = Math.round(L.blockW * Math.min(1, ruleT));
  if (width > 0) {
    stage.put(L.bx, L.by + 2, g.h.repeat(width), { fg: theme.tableDark, bg: theme.table });
  }
}

function drawList(stage, g, menu, theme, L) {
  const { state } = menu;

  // The highlight is drawn at the eased position, so it slides between rows
  // instead of teleporting. Rounding to the nearest cell keeps it crisp.
  const barY = L.bodyY + Math.round(state.cursorY * L.rowStep);
  stage.fill(L.listX, barY, LIST_W, 1, ' ', { bg: theme.highlight });

  state.entries.forEach((entry, i) => {
    const t = menu.rowEnter(i + 2);
    if (t <= 0) return;

    const y = L.bodyY + i * L.rowStep;
    const selected = i === state.index;
    const ready = Boolean(entry.start);
    const onBar = y === barY;
    const bg = onBar ? theme.highlight : theme.table;

    // Rows slide in from the left as they arrive.
    const x = L.listX + Math.round((1 - t) * 3);

    const marker = selected ? (state.pulse < 0.5 ? g.arrowR : g.dot) : ' ';
    stage.put(x, y, marker, {
      fg: arriving(theme.accent, theme, t),
      bg,
      bold: true,
    });

    const base = ready ? (selected ? theme.text : theme.textMuted) : theme.tableDark;
    stage.put(x + 2, y, entry.title, {
      fg: arriving(base, theme, t),
      bg,
      bold: selected && ready,
    });

    if (!ready) {
      const badge = 'soon';
      stage.put(L.listX + LIST_W - strWidth(badge), y, badge, {
        fg: arriving(theme.tableDark, theme, t),
        bg,
      });
    }
  });
}

function drawPanel(stage, g, menu, theme, L) {
  const entry = menu.current();
  const x = L.panelX;
  const y = L.bodyY - 1;
  const t = menu.rowEnter(2);
  if (t <= 0) return;

  box(stage, g, x, y, PANEL_W, PANEL_H, {
    fg: arriving(theme.tableDark, theme, t),
    bg: theme.table,
  }, 'round');
  if (!entry) return;

  // Panel contents fade in on every selection change, not just on entry, so
  // moving down the list reads as the panel answering rather than flickering.
  const fade = Math.min(t, menu.state.panel);
  const innerX = x + 3;
  const innerW = PANEL_W - 6;

  stage.put(x + 2, y, ` ${entry.title} `, {
    fg: arriving(theme.accent, theme, fade),
    bg: theme.table,
    bold: true,
  });

  wrap(entry.blurb, innerW).forEach((line, i) => {
    if (i < 4) {
      stage.put(innerX, y + 2 + i, line, {
        fg: arriving(theme.text, theme, fade),
        bg: theme.table,
      });
    }
  });

  const meta = [entry.players, ...entry.tags].join(`  ${g.dot}  `);
  stage.put(innerX, y + PANEL_H - 3, meta, {
    fg: arriving(theme.textMuted, theme, fade),
    bg: theme.table,
  });

  const status = entry.start ? 'ready' : 'not built yet';
  stage.put(innerX, y + PANEL_H - 2, status, {
    fg: arriving(entry.start ? theme.good : theme.textMuted, theme, fade),
    bg: theme.table,
  });
}

function drawFooter(stage, g, menu, theme, L, ctx) {
  const { state } = menu;
  const t = menu.rowEnter(3);

  if (state.nudge > 0) {
    const text = `${menu.current()?.title ?? 'that one'} is not built yet - pick another`;
    stage.put(centred(L, text), L.controlsY - 2, text, { fg: theme.bad, bg: theme.table });
  }

  const keys = [
    [`${g.arrowU}${g.arrowD}`, 'choose'],
    ['enter', 'play'],
    ['s', 'settings'],
  ];
  if (ctx.colorAvailable) keys.push(['F2', ctx.mono ? 'color' : 'mono']);
  keys.push(['q', 'quit']);

  const text = keys.map(([k, label]) => `${k} ${label}`).join('    ');
  let x = centred(L, text);

  for (const [key, label] of keys) {
    stage.put(x, L.controlsY, key, {
      fg: arriving(theme.accent, theme, t),
      bg: theme.table,
      bold: true,
    });
    x += strWidth(key) + 1;
    stage.put(x, L.controlsY, label, { fg: arriving(theme.textMuted, theme, t), bg: theme.table });
    x += strWidth(label) + 4;
  }

  const hint = 'or run one directly:  npx clicade blackjack';
  stage.put(centred(L, hint), L.hintY, hint, {
    fg: arriving(theme.tableDark, theme, t),
    bg: theme.table,
  });
}

function centred(L, text) {
  return Math.max(0, Math.floor((L.w - strWidth(text)) / 2));
}

/** Greedy word wrap. Long single words are left to overflow rather than split. */
export function wrap(text, width) {
  const lines = [];
  let line = '';

  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (strWidth(candidate) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}
