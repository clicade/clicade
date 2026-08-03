/**
 * Raw-mode keyboard input.
 *
 * Line-buffered `readline` prompts are the single biggest reason terminal games
 * feel like forms instead of games, so this reads keys the instant they're
 * pressed and never waits for Enter.
 *
 * Handlers receive:
 *   { name, ctrl, alt, shift, sequence }
 * where `name` is 'a'..'z', '0'..'9', 'up', 'down', 'left', 'right', 'enter',
 * 'escape', 'space', 'tab', 'backspace', 'delete', 'home', 'end', 'pageup',
 * 'pagedown', 'f1'..'f12', or the literal character for anything else.
 */

import { parseMouse, mouseOn, MOUSE_OFF } from './mouse.js';

const CSI_NAMES = {
  A: 'up',
  B: 'down',
  C: 'right',
  D: 'left',
  H: 'home',
  F: 'end',
  P: 'f1',
  Q: 'f2',
  R: 'f3',
  S: 'f4',
};

const TILDE_NAMES = {
  1: 'home',
  2: 'insert',
  3: 'delete',
  4: 'end',
  5: 'pageup',
  6: 'pagedown',
  11: 'f1',
  12: 'f2',
  13: 'f3',
  14: 'f4',
  15: 'f5',
  17: 'f6',
  18: 'f7',
  19: 'f8',
  20: 'f9',
  21: 'f10',
  23: 'f11',
  24: 'f12',
};

function key(name, extra = {}) {
  return { name, ctrl: false, alt: false, shift: false, sequence: '', ...extra };
}

/**
 * Decode one chunk into key events.
 * Exported for tests — parsing escape sequences is the fiddliest part here.
 * @param {string} str
 */
export function parseKeys(str) {
  return parseInput(str).keys;
}

/**
 * Decode one chunk into keys and mouse reports.
 *
 * Both arrive on the same stream, interleaved, so they have to be scanned
 * together. Mouse reports must be recognised even when nobody is listening for
 * them: `ESC [ < 0 ; 12 ; 4 M` does not match the CSI pattern because of the
 * `<`, so without this it falls through to "escape plus a character is alt" and
 * sprays alt+[, <, 0, ;, 1, 2 … as keystrokes. A stray click would play a card.
 *
 * @param {string} str
 * @returns {{keys: object[], mouse: object[]}}
 */
export function parseInput(str) {
  const keys = [];
  const mouse = [];
  let i = 0;

  while (i < str.length) {
    const ch = str[i];

    // --- escape-prefixed sequences ---
    if (ch === '\x1b') {
      const rest = str.slice(i);

      // SGR mouse: ESC [ < b ; x ; y M|m — checked before the CSI pattern,
      // which its `<` would otherwise fall past.
      const sgr = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(rest);
      if (sgr) {
        const event = parseMouse(sgr[1], sgr[2], sgr[3], sgr[4]);
        if (event) mouse.push({ ...event, sequence: sgr[0] });
        i += sgr[0].length;
        continue;
      }

      // Legacy X10 mouse: ESC [ M then three bytes. We never ask for this
      // encoding, but a terminal that ignores our SGR request may send it
      // anyway, and swallowing it beats emitting three junk keys.
      if (/^\x1b\[M/.test(rest) && rest.length >= 6) {
        i += 6;
        continue;
      }

      // CSI: ESC [ ... final
      const csi = /^\x1b\[([0-9;]*)([A-Za-z~])/.exec(rest);
      if (csi) {
        const [seq, params, final] = csi;
        const parts = params.split(';');
        // xterm encodes modifiers as a second parameter: 1=none, 2=shift,
        // 3=alt, 5=ctrl, and sums for combinations.
        const mod = parts.length > 1 ? Number(parts[1]) - 1 : 0;
        const mods = {
          shift: Boolean(mod & 1),
          alt: Boolean(mod & 2),
          ctrl: Boolean(mod & 4),
          sequence: seq,
        };

        if (final === '~') {
          const name = TILDE_NAMES[Number(parts[0])];
          if (name) keys.push(key(name, mods));
        } else if (CSI_NAMES[final]) {
          keys.push(key(CSI_NAMES[final], mods));
        }
        i += seq.length;
        continue;
      }

      // SS3: ESC O <final> — F1-F4 on some terminals
      const ss3 = /^\x1bO([A-Za-z])/.exec(rest);
      if (ss3) {
        const name = CSI_NAMES[ss3[1]];
        if (name) keys.push(key(name, { sequence: ss3[0] }));
        i += ss3[0].length;
        continue;
      }

      // ESC followed by a character is alt+char.
      if (i + 1 < str.length) {
        const next = str[i + 1];
        keys.push(key(next.toLowerCase(), { alt: true, sequence: str.slice(i, i + 2) }));
        i += 2;
        continue;
      }

      keys.push(key('escape', { sequence: '\x1b' }));
      i += 1;
      continue;
    }

    // --- control characters ---
    const code = ch.charCodeAt(0);

    if (ch === '\r' || ch === '\n') {
      keys.push(key('enter', { sequence: ch }));
      i++;
      continue;
    }
    if (ch === '\t') {
      keys.push(key('tab', { sequence: ch }));
      i++;
      continue;
    }
    if (ch === '\x7f' || ch === '\b') {
      keys.push(key('backspace', { sequence: ch }));
      i++;
      continue;
    }
    if (ch === ' ') {
      keys.push(key('space', { sequence: ch }));
      i++;
      continue;
    }
    if (code < 32) {
      // 0x01-0x1a are ctrl+a .. ctrl+z
      const letter = String.fromCharCode(code + 96);
      keys.push(key(letter, { ctrl: true, sequence: ch }));
      i++;
      continue;
    }

    // --- printable, including astral code points ---
    const cp = str.codePointAt(i);
    const full = String.fromCodePoint(cp);
    const lower = full.toLowerCase();
    keys.push(
      key(lower, {
        shift: full !== lower && full === full.toUpperCase(),
        sequence: full,
      }),
    );
    i += full.length;
  }

  return { keys, mouse };
}

export function createInput(opts = {}) {
  const stdin = opts.input ?? process.stdin;
  const caps = opts.caps;
  const out = opts.output ?? process.stdout;
  const handlers = new Set();
  const mouseHandlers = new Set();
  let started = false;
  let mouseOnNow = false;

  function onData(chunk) {
    const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    const { keys, mouse } = parseInput(str);
    for (const k of keys) for (const h of handlers) h(k);
    // Reports can still arrive after we ask the terminal to stop, so they are
    // dropped here rather than delivered to a game that has stopped expecting
    // them.
    if (mouseOnNow) for (const m of mouse) for (const h of mouseHandlers) h(m);
  }

  /**
   * Ask the terminal to report mouse events, or to stop.
   *
   * Writing the disable sequence unconditionally on stop is deliberate: if a
   * previous run died without cleaning up, this is what puts the terminal
   * right rather than leaving it printing coordinates into the shell.
   */
  function setMouse(on, motion = true) {
    const want = Boolean(on) && Boolean(caps?.mouse);
    if (want === mouseOnNow) return mouseOnNow;
    mouseOnNow = want;
    out.write(want ? mouseOn(motion) : MOUSE_OFF);
    return mouseOnNow;
  }

  function start() {
    if (started) return;
    started = true;
    if (caps?.rawInput) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
  }

  function stop() {
    if (!started) return;
    started = false;
    stdin.off('data', onData);
    if (mouseOnNow) {
      mouseOnNow = false;
      out.write(MOUSE_OFF);
    }
    // Raw mode must come off before pausing, or the shell inherits a terminal
    // that doesn't echo — the classic "your game broke my prompt" bug.
    if (caps?.rawInput && stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
  }

  /** @param {(k: {name:string,ctrl:boolean,alt:boolean,shift:boolean,sequence:string}) => void} fn */
  function onKey(fn) {
    handlers.add(fn);
    return () => handlers.delete(fn);
  }

  /** @param {(m: {type:string,button:string|null,x:number,y:number}) => void} fn */
  function onMouse(fn) {
    mouseHandlers.add(fn);
    return () => mouseHandlers.delete(fn);
  }

  return {
    start,
    stop,
    onKey,
    onMouse,
    setMouse,
    get mouseEnabled() {
      return mouseOnNow;
    },
  };
}
