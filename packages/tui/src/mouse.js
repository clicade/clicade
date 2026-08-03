/**
 * Mouse reporting.
 *
 * SGR mode (1006) rather than the original X10 encoding, which packs each
 * coordinate into a single byte and therefore cannot address a column past 223
 * — reachable on any maximised window — and cannot say which button was
 * released. SGR has neither limit and is understood by every terminal that has
 * supported mouse input this decade.
 *
 * Turning this on takes the terminal's own text selection away from the user:
 * a drag becomes our event instead of a highlight. That is a real cost, so it
 * is opt-in per game, switchable at runtime, and remembered. Most terminals let
 * a player hold Shift to get native selection back while it is on.
 *
 * The sequences must be undone on every exit path. A terminal left in reporting
 * mode prints `<35;40;12M` into the shell on every mouse move — worse than a
 * cursor left hidden, because it looks like the shell itself is broken.
 */

/** Click reporting, in SGR encoding. */
const REPORT_CLICKS = '\x1b[?1000h';
/** Report motion even with no button held, so buttons can highlight on hover. */
const REPORT_MOTION = '\x1b[?1003h';
const SGR_ENCODING = '\x1b[?1006h';

/**
 * @param {boolean} [motion] include hover, at the cost of an event per cell moved
 */
export function mouseOn(motion = true) {
  return REPORT_CLICKS + (motion ? REPORT_MOTION : '') + SGR_ENCODING;
}

/**
 * Every mode we might have set, in reverse order, plus the two we never set.
 *
 * Disabling a mode that was never enabled is harmless, and being thorough here
 * is what stops a crash mid-frame from leaving the shell unusable.
 */
export const MOUSE_OFF = '\x1b[?1006l\x1b[?1003l\x1b[?1002l\x1b[?1000l\x1b[?1015l';

const BUTTONS = ['left', 'middle', 'right'];

/**
 * Decode one SGR mouse report.
 *
 * `ESC [ < Cb ; Cx ; Cy M` for a press, lowercase `m` for a release. Cb carries
 * the button in its low two bits and modifiers, motion and wheel above them.
 *
 * @returns {{type:'down'|'up'|'move', button:string|null, x:number, y:number,
 *            shift:boolean, alt:boolean, ctrl:boolean, wheel:number}|null}
 */
export function parseMouse(cb, x, y, final) {
  const code = Number(cb);
  if (!Number.isFinite(code)) return null;

  const wheelBit = Boolean(code & 64);
  const motion = Boolean(code & 32);
  const low = code & 3;

  // Wheel arrives as a press with bit 64 set; 0 is up, 1 is down. It is never
  // a click, so it must not be reported as one.
  const wheel = wheelBit ? (low === 0 ? -1 : low === 1 ? 1 : 0) : 0;

  const type = wheelBit ? 'wheel' : motion ? 'move' : final === 'M' ? 'down' : 'up';

  return {
    type,
    // Release reports carry a button in SGR mode, unlike the legacy encoding.
    button: wheelBit || low === 3 ? null : BUTTONS[low] ?? null,
    // Terminals count from one; everything else in this engine counts from zero.
    x: Number(x) - 1,
    y: Number(y) - 1,
    shift: Boolean(code & 4),
    alt: Boolean(code & 8),
    ctrl: Boolean(code & 16),
    wheel,
  };
}
