/**
 * The arcade front door.
 *
 * Reads menu state, draws a screen. Holds no behaviour and mutates nothing, so
 * the same state always produces the same frame.
 *
 * The content sits in a fixed-width block centred in the stage rather than
 * stretching to fill it. A menu spread across a 200-column terminal is harder
 * to read, not more impressive; the extra space becomes quiet margin.
 */

import { strWidth, box } from '@clicade/tui';

const BLOCK_W = 64;
const LIST_W = 26;
const GAP = 2;
const PANEL_W = BLOCK_W - LIST_W - GAP;
const PANEL_H = 9;
// Masthead (3 rows) plus the panel, which starts one row above the list and is
// always the taller of the two columns.
const BLOCK_H = 3 + PANEL_H;

/** Smallest window that fits the block plus margins and the footer. */
export const MIN_W = BLOCK_W + 2;
export const MIN_H = BLOCK_H + 5;

const WORDMARK = 'C L I C A D E';
const TAGLINE = 'terminal games that are actually good';

export function layout(w, h) {
  const bx = Math.max(0, Math.floor((w - BLOCK_W) / 2));
  // Sit the block a little above true centre: the footer occupies the bottom
  // rows, and optical centre reads higher than arithmetic centre anyway.
  const by = Math.max(1, Math.floor((h - BLOCK_H - 3) / 2));

  // The footer follows the block rather than pinning to the last row. On a tall
  // window a pinned footer drifts a long way from the thing it describes, which
  // reads as two unrelated screens.
  const controlsY = Math.min(h - 2, by + BLOCK_H + 2);

  return {
    w,
    h,
    bx,
    by,
    listX: bx,
    panelX: bx + LIST_W + GAP,
    bodyY: by + 4,
    controlsY,
    hintY: controlsY + 1,
  };
}

export function render(stage, g, menu, theme, ctx = {}) {
  const { state } = menu;
  const L = layout(stage.width, stage.height);

  stage.fill(0, 0, L.w, L.h, ' ', { bg: theme.table });

  drawMasthead(stage, g, state, theme, L);
  drawList(stage, g, state, theme, L);
  drawPanel(stage, g, menu.current(), theme, L);
  drawFooter(stage, g, menu, theme, L, ctx);
}

function drawMasthead(stage, g, state, theme, L) {
  stage.put(L.bx, L.by, WORDMARK, { fg: theme.accent, bg: theme.table, bold: true });

  const suits = `${g.spade} ${g.heart} ${g.diamond} ${g.club}`;
  stage.put(L.bx + strWidth(WORDMARK) + 3, L.by, suits, { fg: theme.textMuted, bg: theme.table });

  const count = `${state.entries.filter((e) => e.start).length} of ${state.entries.length} playable`;
  stage.put(L.bx + BLOCK_W - strWidth(count), L.by, count, {
    fg: theme.textMuted,
    bg: theme.table,
  });

  stage.put(L.bx, L.by + 1, TAGLINE, { fg: theme.textMuted, bg: theme.table });
  stage.put(L.bx, L.by + 2, g.h.repeat(BLOCK_W), { fg: theme.tableDark, bg: theme.table });
}

function drawList(stage, g, state, theme, L) {
  state.entries.forEach((entry, i) => {
    const y = L.bodyY + i * 2;
    const selected = i === state.index;
    const ready = Boolean(entry.start);

    if (selected) {
      // A filled bar rather than reverse video: reverse inverts the foreground
      // too, which makes a dimmed "soon" entry jump out instead of staying back.
      stage.fill(L.listX, y, LIST_W, 1, ' ', { bg: theme.tableDark });
    }

    // The marker breathes so a static screenshot still reads as a live screen.
    const marker = selected ? (state.pulse < 0.5 ? g.arrowR : g.dot) : ' ';
    stage.put(L.listX, y, marker, {
      fg: theme.accent,
      bg: selected ? theme.tableDark : theme.table,
      bold: true,
    });

    stage.put(L.listX + 2, y, entry.title, {
      fg: ready ? (selected ? theme.text : theme.textMuted) : theme.tableDark,
      bg: selected ? theme.tableDark : theme.table,
      bold: selected && ready,
    });

    if (!ready) {
      const badge = 'soon';
      stage.put(L.listX + LIST_W - strWidth(badge), y, badge, {
        fg: theme.tableDark,
        bg: selected ? theme.tableDark : theme.table,
      });
    }
  });
}

function drawPanel(stage, g, entry, theme, L) {
  const x = L.panelX;
  const y = L.bodyY - 1;

  box(stage, g, x, y, PANEL_W, PANEL_H, { fg: theme.tableDark, bg: theme.table }, 'round');
  if (!entry) return;

  const innerX = x + 3;
  const innerW = PANEL_W - 6;

  stage.put(x + 2, y, ` ${entry.title} `, { fg: theme.accent, bg: theme.table, bold: true });

  wrap(entry.blurb, innerW).forEach((line, i) => {
    if (i < 4) stage.put(innerX, y + 2 + i, line, { fg: theme.text, bg: theme.table });
  });

  const meta = [entry.players, ...entry.tags].join(`  ${g.dot}  `);
  stage.put(innerX, y + PANEL_H - 3, meta, { fg: theme.textMuted, bg: theme.table });

  const status = entry.start ? 'ready' : 'not built yet';
  stage.put(innerX, y + PANEL_H - 2, status, {
    fg: entry.start ? theme.good : theme.textMuted,
    bg: theme.table,
  });
}

function drawFooter(stage, g, menu, theme, L, ctx) {
  const { state } = menu;

  if (state.nudge > 0) {
    const text = `${menu.current()?.title ?? 'that one'} is not built yet - pick another`;
    stage.put(centred(L, text), L.controlsY - 2, text, { fg: theme.bad, bg: theme.table });
  }

  // Arrows come from the glyph set: a terminal without Unicode gets ^v, not
  // two replacement boxes where the only navigation hint should be.
  const keys = [
    [`${g.arrowU}${g.arrowD}`, 'choose'],
    ['enter', 'play'],
  ];
  if (ctx.colorAvailable) keys.push(['F2', ctx.mono ? 'color' : 'mono']);
  keys.push(['q', 'quit']);

  const text = keys.map(([k, label]) => `${k} ${label}`).join('    ');
  let x = centred(L, text);

  for (const [key, label] of keys) {
    stage.put(x, L.controlsY, key, { fg: theme.accent, bg: theme.table, bold: true });
    x += strWidth(key) + 1;
    stage.put(x, L.controlsY, label, { fg: theme.textMuted, bg: theme.table });
    x += strWidth(label) + 4;
  }

  const hint = 'or run one directly:  npx clicade blackjack';
  stage.put(centred(L, hint), L.hintY, hint, { fg: theme.tableDark, bg: theme.table });
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
