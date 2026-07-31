#!/usr/bin/env node
/**
 * Bundles every publishable package to a single self-contained dist/cli.js.
 *
 * The engine packages (@clicade/tui, kit, ai) are never published — they get
 * inlined here. That's what makes `npx @clicade/<game>` fetch one small tarball
 * with zero dependencies and start in well under a second.
 */

import { build } from 'esbuild';
import { readdir, readFile, mkdir, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['games', 'apps'];

/** @returns {Promise<Array<{dir:string,pkg:object}>>} */
async function publishablePackages() {
  const found = [];
  for (const scope of SCAN_DIRS) {
    const base = join(root, scope);
    if (!existsSync(base)) continue;
    for (const name of await readdir(base)) {
      const dir = join(base, name);
      const manifest = join(dir, 'package.json');
      if (!existsSync(manifest)) continue;
      const pkg = JSON.parse(await readFile(manifest, 'utf8'));
      if (pkg.private) continue;
      found.push({ dir, pkg });
    }
  }
  return found;
}

function entryFor(pkg, dir) {
  const bin = typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin ?? {})[0];
  const rel = bin ?? pkg.main ?? 'index.js';
  return join(dir, rel.replace(/^\.\//, ''));
}

const targets = await publishablePackages();

if (targets.length === 0) {
  console.log('no publishable packages yet — nothing to build');
  process.exit(0);
}

for (const { dir, pkg } of targets) {
  const entry = entryFor(pkg, dir);
  const outfile = join(dir, 'dist', 'cli.js');
  await mkdir(dirname(outfile), { recursive: true });

  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    minify: true,
    legalComments: 'none',
    banner: { js: '#!/usr/bin/env node' },
  });

  await chmod(outfile, 0o755);
  console.log(`built ${pkg.name}`);
}
