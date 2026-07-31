#!/usr/bin/env node
/**
 * Enforces the zero-runtime-dependency rule on everything we publish.
 *
 * Engine packages are bundled at build time, so a published game listing any
 * `dependencies` means something leaked into the install path — extra tarballs
 * to fetch, extra cold-start time, extra supply-chain surface. Engine packages
 * belong in devDependencies.
 */

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let failed = false;
let checked = 0;

for (const scope of ['games', 'apps']) {
  const base = join(root, scope);
  if (!existsSync(base)) continue;

  for (const name of await readdir(base)) {
    const manifest = join(base, name, 'package.json');
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(await readFile(manifest, 'utf8'));
    if (pkg.private) continue;
    checked++;

    const deps = Object.keys(pkg.dependencies ?? {});
    if (deps.length > 0) {
      console.error(`FAIL  ${pkg.name} declares runtime dependencies: ${deps.join(', ')}`);
      failed = true;
    } else {
      console.log(`ok    ${pkg.name} has zero runtime dependencies`);
    }

    if (pkg.publishConfig?.access !== 'public') {
      console.error(`FAIL  ${pkg.name} is missing publishConfig.access = "public"`);
      failed = true;
    }
  }
}

if (checked === 0 && !failed) console.log('no published packages to check yet');
if (failed) process.exit(1);
