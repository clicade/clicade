/**
 * Display width of code points.
 *
 * Grid math breaks if a glyph occupies a different number of cells than we
 * assumed, and terminals disagree about emoji. Games should stay in the
 * single-width range; this exists so that when they don't, layout degrades
 * predictably instead of smearing.
 */

/** Ranges that terminals render two cells wide. Deliberately conservative. */
const WIDE_RANGES = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2e80, 0x303e], // CJK radicals, Kangxi
  [0x3041, 0x33ff], // Hiragana, Katakana, CJK compat
  [0x3400, 0x4dbf], // CJK Ext A
  [0x4e00, 0x9fff], // CJK Unified
  [0xa000, 0xa4cf], // Yi
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compat ideographs
  [0xfe30, 0xfe6f], // CJK compat forms
  [0xff00, 0xff60], // Fullwidth forms
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f], // Emoji, pictographs
  [0x1f900, 0x1f9ff],
  [0x20000, 0x2fffd],
  [0x30000, 0x3fffd],
];

/** Zero-width: combining marks and joiners. */
function isZeroWidth(cp) {
  return (
    cp === 0x200b ||
    cp === 0x200d ||
    cp === 0xfeff ||
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0xfe00 && cp <= 0xfe0f)
  );
}

/** @returns {0|1|2} cells occupied by a single code point */
export function charWidth(cp) {
  if (cp === 0) return 0;
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0; // control chars never render
  if (isZeroWidth(cp)) return 0;
  for (const [lo, hi] of WIDE_RANGES) {
    if (cp >= lo && cp <= hi) return 2;
    if (cp < lo) break; // ranges are sorted
  }
  return 1;
}

/** Total display width of a string. */
export function strWidth(str) {
  let w = 0;
  for (const ch of str) w += charWidth(ch.codePointAt(0));
  return w;
}

/** Truncate to `max` cells, never splitting a wide glyph in half. */
export function truncate(str, max) {
  if (max <= 0) return '';
  let w = 0;
  let out = '';
  for (const ch of str) {
    const cw = charWidth(ch.codePointAt(0));
    if (w + cw > max) break;
    out += ch;
    w += cw;
  }
  return out;
}

/** Pad to exactly `width` cells (truncating if too long). */
export function pad(str, width, align = 'left') {
  const t = truncate(str, width);
  const gap = width - strWidth(t);
  if (gap <= 0) return t;
  if (align === 'right') return ' '.repeat(gap) + t;
  if (align === 'center') {
    const l = Math.floor(gap / 2);
    return ' '.repeat(l) + t + ' '.repeat(gap - l);
  }
  return t + ' '.repeat(gap);
}
