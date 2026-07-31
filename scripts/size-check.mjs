#!/usr/bin/env node
/**
 * Fails the build if any published bundle exceeds the budget.
 *
 * "Lightweight" needs a machine enforcing it. Without this, a convenience
 * dependency sneaks in during month three and npx start time doubles with
 * nobody noticing.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIMIT_KB = 150;

let failed = false;
let checked = 0;

for (const scope of ['games', 'apps']) {
  const base = join(root, scope);
  if (!existsSync(base)) continue;

  for (const name of await readdir(base)) {
    const dir = join(base, name);
    const manifest = join(dir, 'package.json');
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(await readFile(manifest, 'utf8'));
    if (pkg.private) continue;

    const bundle = join(dir, 'dist', 'cli.js');
    if (!existsSync(bundle)) {
      console.error(`MISSING  ${pkg.name} has no dist/cli.js — run the build first`);
      failed = true;
      continue;
    }

    const kb = (await stat(bundle)).size / 1024;
    checked++;
    const label = kb > LIMIT_KB ? 'TOO BIG ' : 'ok      ';
    console.log(`${label} ${pkg.name.padEnd(28)} ${kb.toFixed(1)} KB`);
    if (kb > LIMIT_KB) failed = true;
  }
}

if (checked === 0 && !failed) console.log('no published bundles to size-check yet');
if (failed) {
  console.error(`\nbudget is ${LIMIT_KB} KB per bundle`);
  process.exit(1);
}
