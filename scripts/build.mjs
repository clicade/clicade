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

// Private packages (the demo harness) are normally skipped, but CI bundles them
// so the runtime-floor job has something dependency-free to run on old Node.
const includePrivate = process.argv.includes('--include-private');

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
      if (pkg.private && !includePrivate) continue;
      found.push({ dir, pkg });
    }
  }
  return found;
}

/**
 * Published packages point `bin` and `main` at dist/cli.js — the file this
 * script produces — so neither can be the entry. Source comes from an explicit
 * `source` field, falling back to index.js.
 */
function entryFor(pkg, dir) {
  const rel = (pkg.source ?? 'index.js').replace(/^\.\//, '');
  const entry = join(dir, rel);
  if (!existsSync(entry)) {
    throw new Error(`${pkg.name}: entry ${rel} not found — set "source" in its package.json`);
  }
  return entry;
}

const targets = await publishablePackages();

if (targets.length === 0) {
  console.log('no publishable packages yet — nothing to build');
  process.exit(0);
}

for (const { dir, pkg } of targets) {
  const entry = entryFor(pkg, dir);
  const outfile = join(dir, 'dist', 'cli.mjs');
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
    // No shebang banner here: esbuild hoists the entry file's own shebang, and
    // adding one produces a second `#!` on line 2, which is a syntax error.
  });

  const built = await readFile(outfile, 'utf8');
  if (!built.startsWith('#!')) {
    throw new Error(`${pkg.name}: entry ${entry} is missing a shebang, so the bin would not be executable`);
  }

  await chmod(outfile, 0o755);
  console.log(`built ${pkg.name}`);
}
