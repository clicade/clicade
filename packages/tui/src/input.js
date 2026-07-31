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
  const keys = [];
  let i = 0;

  while (i < str.length) {
    const ch = str[i];

    // --- escape-prefixed sequences ---
    if (ch === '\x1b') {
      const rest = str.slice(i);

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

  return keys;
}

export function createInput(opts = {}) {
  const stdin = opts.input ?? process.stdin;
  const caps = opts.caps;
  const handlers = new Set();
  let started = false;

  function onData(chunk) {
    const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    for (const k of parseKeys(str)) {
      for (const h of handlers) h(k);
    }
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

  return { start, stop, onKey };
}
