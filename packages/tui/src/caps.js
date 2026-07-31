/**
 * Terminal capability detection.
 *
 * Every capability degrades to something that still works. Nothing here throws,
 * and nothing assumes a modern terminal. The rule: detect once at startup, hand
 * the result to everything else, never re-sniff mid-frame.
 *
 * Overrides (useful for testing the floor cases on a nice terminal):
 *   NO_COLOR=1          disable color entirely (respected unconditionally)
 *   FORCE_COLOR=0..3    pin color depth
 *   CLICADE_ASCII=1     force ASCII box-drawing / card pips
 *   CLICADE_UNICODE=1   force Unicode even where we'd guess otherwise
 */

/** Terminals known to handle 24-bit color regardless of what TERM claims. */
const TRUECOLOR_PROGRAMS = new Set([
  'vscode',
  'iTerm.app',
  'WezTerm',
  'Hyper',
  'ghostty',
  'rio',
  'Apple_Terminal',
]);

/** Color depth constants. Higher is better; each renderer must handle all four. */
export const COLOR_NONE = 0;
export const COLOR_16 = 1;
export const COLOR_256 = 2;
export const COLOR_TRUE = 3;

/**
 * @param {object} [opts]
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {NodeJS.WriteStream} [opts.stream]
 * @param {NodeJS.ReadStream} [opts.input]
 * @param {string} [opts.platform]
 */
export function detectCaps(opts = {}) {
  const env = opts.env ?? process.env;
  const stream = opts.stream ?? process.stdout;
  const input = opts.input ?? process.stdin;
  const platform = opts.platform ?? process.platform;

  const isTTY = Boolean(stream && stream.isTTY);
  const term = String(env.TERM ?? '');
  const termProgram = String(env.TERM_PROGRAM ?? '');
  const isWindows = platform === 'win32';
  const isDumb = term === 'dumb';

  // Windows leaves TERM unset even on terminals that handle full ANSI, so it
  // needs its own signal rather than the TERM sniffing used everywhere else.
  const winModern =
    isWindows &&
    Boolean(env.WT_SESSION || termProgram || env.ConEmuANSI === 'ON' || env.TERMINAL_EMULATOR);

  const ctx = { env, term, termProgram, isWindows, winModern, isDumb, isTTY };

  const colorDepth = detectColor(ctx);
  const unicode = detectUnicode(ctx);

  return {
    isTTY,
    colorDepth,
    /** NO_COLOR was set explicitly, which no flag or preference may override. */
    noColor: Boolean(env.NO_COLOR != null && env.NO_COLOR !== ''),
    unicode,
    /** Alt-screen buffer: safe anywhere we have a real terminal that isn't `dumb`. */
    altScreen: isTTY && !isDumb,
    /** Per-keypress input. Falls back to line-buffered reads when false. */
    rawInput: isTTY && typeof input?.setRawMode === 'function',
    /** Mouse reporting is opt-in per game; this only says whether it's possible. */
    mouse: isTTY && !isDumb,
    cols: Math.max(1, stream?.columns || 80),
    rows: Math.max(1, stream?.rows || 24),
    platform,
  };
}

function detectColor(c) {
  // NO_COLOR is a de-facto standard and users set it globally on purpose.
  // Honour it above every other signal, including FORCE_COLOR.
  const noColor = c.env.NO_COLOR;
  if (noColor != null && noColor !== '') return COLOR_NONE;

  const force = c.env.FORCE_COLOR;
  if (force != null) {
    if (force === '0' || force === 'false') return COLOR_NONE;
    if (force === '1') return COLOR_16;
    if (force === '2') return COLOR_256;
    return COLOR_TRUE;
  }

  if (!c.isTTY || c.isDumb) return COLOR_NONE;

  if (/truecolor|24bit/i.test(String(c.env.COLORTERM ?? ''))) return COLOR_TRUE;
  if (TRUECOLOR_PROGRAMS.has(c.termProgram)) return COLOR_TRUE;
  if (c.env.WT_SESSION) return COLOR_TRUE;
  if (/-256(color)?\b/.test(c.term)) return COLOR_256;
  if (c.isWindows) return c.winModern ? COLOR_TRUE : COLOR_16;
  if (c.term === '') return COLOR_NONE;
  return COLOR_16;
}

function detectUnicode(c) {
  if (c.env.CLICADE_ASCII === '1') return false;
  if (c.env.CLICADE_UNICODE === '1') return true;

  // Legacy conhost renders box-drawing as `?` often enough that ASCII is the
  // safer default; modern Windows hosts are fine.
  if (c.isWindows) return c.winModern;

  // Linux virtual console has a limited glyph set.
  if (c.term === 'linux') return false;

  const locale = `${c.env.LC_ALL ?? ''}${c.env.LC_CTYPE ?? ''}${c.env.LANG ?? ''}`;
  if (locale && !/UTF-?8/i.test(locale)) return false;

  return true;
}

/**
 * Reason a non-interactive run should bail instead of hanging on input that
 * will never arrive (pipes, CI logs, `npx game > out.txt`).
 * @returns {string|null} message to print, or null if the terminal is playable
 */
export function unplayableReason(caps) {
  if (!caps.isTTY) {
    return 'clicade needs an interactive terminal (stdout is not a TTY).';
  }
  if (!caps.rawInput) {
    return 'clicade needs raw keyboard input, which this terminal does not provide.';
  }
  return null;
}
