/**
 * Persistent save data.
 *
 * Writes are atomic (temp file + rename) because a game that corrupts a save on
 * a mistimed Ctrl-C loses the player's whole meta-progression.
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Config dir, following XDG on unix and APPDATA on Windows. */
export function configDir() {
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'clicade');
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'clicade');
}

export function createSave(name, defaults = {}) {
  const dir = configDir();
  const file = join(dir, `${name}.json`);

  function load() {
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
    const tmp = `${file}.${process.pid}.tmp`;
    try {
      mkdirSync(dir, { recursive: true });
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

  return { load, save, file };
}
