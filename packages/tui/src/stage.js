/**
 * Fixed logical playfield.
 *
 * Terminal zoom cannot be blocked — font size belongs to the emulator, and no
 * escape sequence locks it. So instead of fighting resize, games are built to
 * be invariant to it: simulation runs in fixed logical units, and the terminal
 * is only a camera looking at that world.
 *
 * This matters beyond tidiness. If a game derives bounds, spawn positions or
 * visibility from `screen.cols`, then zooming out changes the game — more board
 * revealed, different physics, different outcomes. Anything a player can do
 * from a keyboard shortcut that alters state is an exploit.
 *
 * Rules this enforces:
 *   - logical coordinates never depend on terminal size
 *   - drawing outside the stage is clipped, not spilled into the letterbox
 *   - a terminal too small to show the whole stage pauses play rather than
 *     showing a cropped, advantaged view
 */

import { charWidth } from './width.js';

export function createStage(opts = {}) {
  const screen = opts.screen;

  // `fill` takes the terminal's size once, at launch, then freezes it. That is
  // what lets a game use the whole window without handing the player a resize
  // handle on the rules: after this moment the world never changes size again.
  const minWidth = opts.minWidth ?? opts.width ?? 1;
  const minHeight = opts.minHeight ?? opts.height ?? 1;

  const width = opts.fill ? Math.max(minWidth, screen.cols) : opts.width;
  const height = opts.fill ? Math.max(minHeight, screen.rows) : opts.height;

  let ox = 0;
  let oy = 0;
  let tooSmall = false;

  /** Recompute letterbox offsets. Call once per frame, before drawing. */
  function measure() {
    tooSmall = screen.cols < width || screen.rows < height;
    ox = Math.max(0, Math.floor((screen.cols - width) / 2));
    oy = Math.max(0, Math.floor((screen.rows - height) / 2));
  }

  /** Draw at logical (lx, ly), clipped to the stage rect. */
  function put(lx, ly, text, style) {
    if (ly < 0 || ly >= height) return;

    let col = Math.floor(lx);
    let buf = '';
    let bufCol = null;

    const flush = () => {
      if (bufCol !== null) screen.put(ox + bufCol, oy + ly, buf, style);
      buf = '';
      bufCol = null;
    };

    for (const ch of String(text)) {
      const w = charWidth(ch.codePointAt(0));
      if (w === 0) continue;
      if (col >= 0 && col + w <= width) {
        if (bufCol === null) bufCol = col;
        buf += ch;
      } else {
        flush();
        if (col + w > width) break; // past the right edge; nothing more fits
      }
      col += w;
    }
    flush();
  }

  function fill(lx, ly, w, h, ch, style) {
    const line = String(ch).repeat(Math.max(0, w));
    for (let i = 0; i < h; i++) put(lx, ly + i, line, style);
  }

  return {
    measure,
    put,
    fill,
    width,
    height,
    get tooSmall() {
      return tooSmall;
    },
    /** Screen-space origin of the stage, for effects that need to escape it. */
    get originX() {
      return ox;
    },
    get originY() {
      return oy;
    },
  };
}
