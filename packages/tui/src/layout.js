/**
 * Layout primitives: glyph sets, boxes, centering.
 *
 * Every glyph has an ASCII fallback so the whole UI survives a terminal that
 * can't render box-drawing. Games ask for `glyphs(caps)` once and draw with
 * whatever comes back.
 */

import { strWidth, pad } from './width.js';

const UNICODE = {
  h: '─',
  v: '│',
  tl: '┌',
  tr: '┐',
  bl: '└',
  br: '┘',
  cross: '┼',
  teeL: '├',
  teeR: '┤',
  teeT: '┬',
  teeB: '┴',
  hDouble: '═',
  vDouble: '║',
  tlDouble: '╔',
  trDouble: '╗',
  blDouble: '╚',
  brDouble: '╝',
  hRound: '─',
  tlRound: '╭',
  trRound: '╮',
  blRound: '╰',
  brRound: '╯',
  block: '█',
  shadeLight: '░',
  shadeMed: '▒',
  shadeDark: '▓',
  halfTop: '▀',
  halfBottom: '▄',
  dot: '•',
  arrowR: '▸',
  arrowL: '◂',
  arrowU: '▴',
  arrowD: '▾',
  recycle: '↻',
  check: '✓',
  cross2: '✗',
  spade: '♠',
  heart: '♥',
  diamond: '♦',
  club: '♣',
};

const ASCII = {
  h: '-',
  v: '|',
  tl: '+',
  tr: '+',
  bl: '+',
  br: '+',
  cross: '+',
  teeL: '+',
  teeR: '+',
  teeT: '+',
  teeB: '+',
  hDouble: '=',
  vDouble: '|',
  tlDouble: '+',
  trDouble: '+',
  blDouble: '+',
  brDouble: '+',
  hRound: '-',
  tlRound: '+',
  trRound: '+',
  blRound: '+',
  brRound: '+',
  block: '#',
  shadeLight: '.',
  shadeMed: ':',
  shadeDark: '%',
  halfTop: '"',
  halfBottom: '_',
  dot: '*',
  arrowR: '>',
  arrowL: '<',
  arrowU: '^',
  arrowD: 'v',
  recycle: 'O',
  check: 'y',
  cross2: 'x',
  spade: 'S',
  heart: 'H',
  diamond: 'D',
  club: 'C',
};

/** @param {{unicode:boolean}} caps */
export function glyphs(caps) {
  return caps?.unicode ? UNICODE : ASCII;
}

/**
 * Draw a box outline. Does not clear the interior — callers fill first if they
 * want it opaque, which keeps layered UI cheap.
 */
export function box(screen, g, x, y, w, h, style, variant = 'sharp') {
  if (w < 2 || h < 2) return;
  const set =
    variant === 'double'
      ? { tl: g.tlDouble, tr: g.trDouble, bl: g.blDouble, br: g.brDouble, h: g.hDouble, v: g.vDouble }
      : variant === 'round'
        ? { tl: g.tlRound, tr: g.trRound, bl: g.blRound, br: g.brRound, h: g.hRound, v: g.v }
        : { tl: g.tl, tr: g.tr, bl: g.bl, br: g.br, h: g.h, v: g.v };

  const span = set.h.repeat(w - 2);
  screen.put(x, y, set.tl + span + set.tr, style);
  screen.put(x, y + h - 1, set.bl + span + set.br, style);
  for (let i = 1; i < h - 1; i++) {
    screen.put(x, y + i, set.v, style);
    screen.put(x + w - 1, y + i, set.v, style);
  }
}

/** Box with a label sitting in the top border. */
export function labelledBox(screen, g, x, y, w, h, label, style, labelStyle, variant = 'sharp') {
  box(screen, g, x, y, w, h, style, variant);
  if (label && w > 4) {
    const text = ` ${label} `;
    screen.put(x + 2, y, text.slice(0, w - 4), labelStyle ?? style);
  }
}

/** Left x for centering `width` cells inside `total`. */
export function centerX(total, width) {
  return Math.max(0, Math.floor((total - width) / 2));
}

/** Write text horizontally centered on a row. */
export function putCenter(screen, y, text, style) {
  screen.put(centerX(screen.cols, strWidth(text)), y, text, style);
}

export { pad, strWidth };
