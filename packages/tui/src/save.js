/**
 * Persistent save data.
 *
 * Writes are atomic (temp file + rename) because a game that corrupts a save on
 * a mistimed Ctrl-C loses the player's whole meta-progression.
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Config dir, following XDG on unix and APPDATA on Windows.
 *
 * `CLICADE_CONFIG_DIR` overrides both. Tests need somewhere disposable to write,
 * and without it running the suite would quietly edit the developer's own saved
 * bankroll and preferences.
 */
export function configDir() {
  if (process.env.CLICADE_CONFIG_DIR) return process.env.CLICADE_CONFIG_DIR;
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'clicade');
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'clicade');
}

export function createSave(name, defaults = {}) {
  // Resolved per call, not captured here. Preferences are constructed when the
  // module is first imported, and baking the path in at that moment makes the
  // location impossible to change afterwards.
  const path = () => join(configDir(), `${name}.json`);

  function load() {
    const file = path();
    try {
      const raw = readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      return { ...structuredClone(defaults), ...parsed };
    } catch {
      // Missing or corrupt save is not an error worth interrupting play for.
      return structuredClone(defaults);
    }
  }

  function save(data) {
    const file = path();
    const tmp = `${file}.${process.pid}.tmp`;
    try {
      mkdirSync(configDir(), { recursive: true });
      writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      renameSync(tmp, file);
      return true;
    } catch {
      try {
        rmSync(tmp, { force: true });
      } catch {
        /* best effort */
      }
      return false;
    }
  }

  return {
    load,
    save,
    get file() {
      return path();
    },
  };
}
