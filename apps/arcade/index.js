#!/usr/bin/env node
/**
 * npx clicade
 *
 * Owns the process; everything else lives in src/main.js.
 */

import { run } from './src/main.js';

run().then(
  (code) => process.exit(code ?? 0),
  (err) => {
    process.stderr.write(`\n${err?.stack ?? err}\n`);
    process.exit(1);
  },
);
