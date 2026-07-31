/**
 * Color handling with automatic downgrade.
 *
 * Callers always describe color at full fidelity (hex or [r,g,b]); this module
 * renders it at whatever depth the terminal actually supports. Games never
 * branch on color depth themselves.
 */

import { COLOR_NONE, COLOR_16, COLOR_256, COLOR_TRUE } from './caps.js';

export const RESET = '\x1b[0m';

/**
 * Parse a color into [r,g,b]. Accepts '#rgb', '#rrggbb', [r,g,b], or null.
 * @returns {[number,number,number]|null}
 */
export function toRgb(color) {
  if (color == null) return null;
  if (Array.isArray(color)) return [clamp8(color[0]), clamp8(color[1]), clamp8(color[2])];
  if (typeof color === 'string') {
    let hex = color.trim().replace(/^#/, '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length !== 6 || !/^[0-9a-f]{6}$/i.test(hex)) return null;
    const n = parseInt(hex, 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  }
  return null;
}

function clamp8(n) {
  return Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
}

/** Nearest xterm-256 index for an rgb triple. */
export function rgbTo256([r, g, b]) {
  // Grayscale ramp is denser than the color cube for near-gray values.
  if (Math.abs(r - g) < 8 && Math.abs(g - b) < 8) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return 232 + Math.round(((r - 8) / 247) * 24);
  }
  const q = (v) => Math.round((v / 255) * 5);
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

/**
 * Basic-16 index for an rgb triple.
 *
 * Deliberately not a nearest-RGB match: users retheme all sixteen slots, so
 * their nominal values are fiction. Quantising each channel against the
 * brightest one preserves hue, and HSV value picks the bright variant — the
 * same approach the rest of the terminal ecosystem uses, so our red looks like
 * everyone else's red.
 */
export function rgbTo16([r, g, b]) {
  const value = Math.max(r, g, b);
  if (value < 32) return 0; // near-black collapses to black
  const threshold = value / 2;
  const index = (r > threshold ? 1 : 0) | (g > threshold ? 2 : 0) | (b > threshold ? 4 : 0);
  return value > 178 ? index + 8 : index;
}

function colorParams(color, depth, isBg) {
  const rgb = toRgb(color);
  if (!rgb || depth === COLOR_NONE) return '';
  if (depth === COLOR_TRUE) return `${isBg ? 48 : 38};2;${rgb[0]};${rgb[1]};${rgb[2]}`;
  if (depth === COLOR_256) return `${isBg ? 48 : 38};5;${rgbTo256(rgb)}`;
  const i = rgbTo16(rgb);
  // 0-7 map to 30-37 / 40-47; 8-15 are the bright variants at 90-97 / 100-107.
  const base = i < 8 ? (isBg ? 40 : 30) + i : (isBg ? 100 : 90) + (i - 8);
  return String(base);
}

/**
 * Render a style object to an SGR escape sequence.
 * @param {{fg?:any,bg?:any,bold?:boolean,dim?:boolean,italic?:boolean,underline?:boolean,reverse?:boolean}} [style]
 * @param {number} depth
 * @returns {string} SGR sequence, or '' for default styling
 */
export function styleToSgr(style, depth) {
  if (!style) return '';
  const parts = [];

  if (style.bold) parts.push('1');
  if (style.dim) parts.push('2');
  if (style.italic) parts.push('3');
  if (style.underline) parts.push('4');
  if (style.reverse) parts.push('7');

  if (depth !== COLOR_NONE) {
    const f = colorParams(style.fg, depth, false);
    if (f) parts.push(f);
    const b = colorParams(style.bg, depth, true);
    if (b) parts.push(b);
  }

  return parts.length ? `\x1b[${parts.join(';')}m` : '';
}

/** Blend two colors. `t` of 0 returns `a`, 1 returns `b`. Used for fades and shadows. */
export function mix(a, b, t) {
  const ca = toRgb(a) ?? [0, 0, 0];
  const cb = toRgb(b) ?? [0, 0, 0];
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(ca[0] + (cb[0] - ca[0]) * k),
    Math.round(ca[1] + (cb[1] - ca[1]) * k),
    Math.round(ca[2] + (cb[2] - ca[2]) * k),
  ];
}
