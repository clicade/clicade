/**
 * Settings and onboarding, drawn.
 *
 * Both screens preview live: the theme they draw with is rebuilt every frame
 * from the values being edited, so choosing "High contrast" shows high contrast
 * while the cursor is still on it. A settings screen that only applies on exit
 * makes the player guess, and guessing is the thing onboarding exists to stop.
 */

import { strWidth, box, mix } from '@clicade/tui';
import { renderCard, getScale } from '@clicade/kit';
import { optionIndex } from './settings.js';
import { wrap } from './render.js';

const BLOCK_W = 62;
const LABEL_W = 13;

export const MIN_W = BLOCK_W + 4;
export const MIN_H = 22;

function centred(w, text) {
  return Math.max(0, Math.floor((w - strWidth(text)) / 2));
}

function arriving(color, theme, t) {
  if (t >= 1) return color;
  return mix(theme.table ?? theme.tableDark, color, t);
}

/**
 * A row of swatches plus a card.
 *
 * This is the whole point of the preview: contrast and background are
 * judgements about legibility that only mean something when you can see text
 * and a card drawn the way the games will draw them.
 */
export function drawPreview(stage, g, x, y, theme, scale, t = 1) {
  const metrics = getScale(scale);
  const size = metrics.card;

  renderCard(stage, g, x, y, { rank: 'A', suit: 's' }, { theme, faceUp: true, size, shadow: true });
  renderCard(stage, g, x + 9, y, { rank: 'K', suit: 'h' }, { theme, faceUp: true, size, shadow: true });
  renderCard(stage, g, x + 18, y, null, { theme, faceUp: false, size, shadow: true });

  const rows = [
    ['normal text', theme.text],
    ['muted text', theme.textMuted],
    ['accent', theme.accent],
    ['win / lose', theme.good],
  ];
  rows.forEach(([label, color], i) => {
    stage.put(x + 28, y + i, label, { fg: arriving(color, theme, t), bg: theme.table });
  });
}

// --- settings --------------------------------------------------------------

export function renderSettings(stage, g, settings, theme, ctx = {}) {
  const { state } = settings;
  const w = stage.width;
  const h = stage.height;
  const bx = Math.max(0, Math.floor((w - BLOCK_W) / 2));
  const by = Math.max(1, Math.floor((h - 20) / 2));

  stage.fill(0, 0, w, h, ' ', { bg: theme.table });

  stage.put(bx, by, 'SETTINGS', { fg: theme.accent, bg: theme.table, bold: true });
  stage.put(bx + BLOCK_W - strWidth('applies everywhere'), by, 'applies everywhere', {
    fg: theme.textMuted,
    bg: theme.table,
  });
  stage.put(bx, by + 1, g.h.repeat(BLOCK_W), { fg: theme.tableDark, bg: theme.table });

  const listY = by + 3;

  // The highlight slides between rows rather than jumping.
  const barY = listY + Math.round(state.cursorY);
  stage.fill(bx, barY, BLOCK_W, 1, ' ', { bg: theme.highlight });

  settings.definitions.forEach((definition, i) => {
    const y = listY + i;
    const selected = i === state.index;
    const onBar = y === barY;
    const bg = onBar ? theme.highlight : theme.table;
    const value = state.values[definition.key];
    const at = optionIndex(definition, value);

    stage.put(bx, y, selected ? g.arrowR : ' ', { fg: theme.accent, bg, bold: true });
    stage.put(bx + 2, y, definition.label, {
      fg: selected ? theme.text : theme.textMuted,
      bg,
      bold: selected,
    });

    // Every option is shown, with the chosen one marked, so the range of the
    // setting is visible without cycling through it blind.
    let x = bx + 2 + LABEL_W;
    definition.options.forEach((option, oi) => {
      const active = oi === at;
      stage.put(x, y, active ? `[${option.label}]` : ` ${option.label} `, {
        fg: active ? theme.accent : theme.textMuted,
        bg,
        bold: active,
      });
      x += strWidth(option.label) + 4;
    });
  });

  const definition = settings.current();
  const helpY = listY + settings.definitions.length + 1;
  if (definition) {
    const at = optionIndex(definition, state.values[definition.key]);
    stage.put(bx, helpY, definition.help, { fg: theme.textMuted, bg: theme.table });
    stage.put(bx, helpY + 1, definition.options[at]?.note ?? '', {
      fg: theme.text,
      bg: theme.table,
    });
  }

  drawPreview(stage, g, bx, helpY + 3, theme, state.values.scale);

  const footer = [
    [`${g.arrowU}${g.arrowD}`, 'setting'],
    [`${g.arrowL}${g.arrowR}`, 'change'],
    ['r', 'redo setup'],
    ['esc', 'back'],
  ];
  drawKeys(stage, footer, theme, h - 2, w);

  const note = state.changed ? 'saved automatically' : '';
  if (note) stage.put(centred(w, note), h - 1, note, { fg: theme.tableDark, bg: theme.table });
}

// --- onboarding ------------------------------------------------------------

export function renderOnboarding(stage, g, flow, theme, ctx = {}) {
  const { state } = flow;
  const w = stage.width;
  const h = stage.height;
  const bx = Math.max(0, Math.floor((w - BLOCK_W) / 2));
  const by = Math.max(1, Math.floor((h - 20) / 2));
  const t = state.enter;

  stage.fill(0, 0, w, h, ' ', { bg: theme.table });

  const step = flow.current();
  const definition = flow.definition();

  // Steps slide in from the right, so moving forward feels like moving forward.
  const slide = Math.round((1 - t) * 4);

  stage.put(bx + slide, by, 'C L I C A D E', {
    fg: arriving(theme.accent, theme, t),
    bg: theme.table,
    bold: true,
  });
  const progress = flow.progress;
  stage.put(bx + BLOCK_W - strWidth(progress), by, progress, {
    fg: theme.tableDark,
    bg: theme.table,
  });
  stage.put(bx, by + 1, g.h.repeat(BLOCK_W), { fg: theme.tableDark, bg: theme.table });

  const bodyY = by + 3;

  if (step?.kind === 'welcome') {
    const lines = [
      'Two quick questions before you play.',
      '',
      'Terminals differ more than they look. A palette that reads',
      'well on one is unreadable on another, and we cannot detect',
      'which yours is. So it is worth thirty seconds now.',
      '',
      'You can change any of this later, and run this again, from',
      'the settings screen.',
    ];
    lines.forEach((line, i) => {
      stage.put(bx + slide, bodyY + i, line, {
        fg: arriving(i === 0 ? theme.text : theme.textMuted, theme, t),
        bg: theme.table,
        bold: i === 0,
      });
    });
    drawPreview(stage, g, bx, bodyY + lines.length + 1, theme, state.values.scale, t);
  } else if (step?.kind === 'done') {
    const lines = [
      'You are set.',
      '',
      'Press s in the menu to change any of this.',
      'F2 switches colour and monochrome in any game.',
    ];
    lines.forEach((line, i) => {
      stage.put(bx + slide, bodyY + i, line, {
        fg: arriving(i === 0 ? theme.accent : theme.textMuted, theme, t),
        bg: theme.table,
        bold: i === 0,
      });
    });
    drawPreview(stage, g, bx, bodyY + lines.length + 1, theme, state.values.scale, t);
  } else if (definition) {
    const at = optionIndex(definition, state.values[definition.key]);

    stage.put(bx + slide, bodyY, definition.label, {
      fg: arriving(theme.text, theme, t),
      bg: theme.table,
      bold: true,
    });
    wrap(definition.help, BLOCK_W).forEach((line, i) => {
      stage.put(bx + slide, bodyY + 1 + i, line, {
        fg: arriving(theme.textMuted, theme, t),
        bg: theme.table,
      });
    });

    // Options are laid out as cards rather than a single cycling value: seeing
    // what else is on offer is most of what makes a choice feel safe.
    const optionsY = bodyY + 4;
    let x = bx;
    definition.options.forEach((option, i) => {
      const active = i === at;
      const label = ` ${option.label} `;
      const width = strWidth(label) + 2;
      box(stage, g, x, optionsY, width, 3, {
        fg: active ? theme.accent : theme.tableDark,
        bg: theme.table,
      }, 'round');
      stage.put(x + 1, optionsY + 1, label, {
        fg: active ? theme.accent : theme.textMuted,
        bg: theme.table,
        bold: active,
      });
      x += width + 2;
    });

    stage.put(bx, optionsY + 4, definition.options[at]?.note ?? '', {
      fg: theme.text,
      bg: theme.table,
    });

    drawPreview(stage, g, bx, optionsY + 6, theme, state.values.scale, t);
  }

  const keys =
    step?.kind === 'choice'
      ? [
          [`${g.arrowL}${g.arrowR}`, 'choose'],
          ['enter', 'next'],
          ['esc', 'skip setup'],
          ['q', 'quit'],
        ]
      : [
          ['enter', step?.kind === 'done' ? 'start playing' : 'begin'],
          ['esc', 'skip setup'],
          ['q', 'quit'],
        ];
  drawKeys(stage, keys, theme, h - 2, w);
}

function drawKeys(stage, keys, theme, y, w) {
  const text = keys.map(([k, label]) => `${k} ${label}`).join('    ');
  let x = centred(w, text);
  for (const [key, label] of keys) {
    stage.put(x, y, key, { fg: theme.accent, bg: theme.table, bold: true });
    x += strWidth(key) + 1;
    stage.put(x, y, label, { fg: theme.textMuted, bg: theme.table });
    x += strWidth(label) + 4;
  }
}
