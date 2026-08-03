#!/usr/bin/env node
/**
 * npx @clicade/solitaire
 *
 * Standalone entry. The wiring lives in src/main.js, which the arcade imports
 * too — this file exists only to own the process.
 */

import { start } from './src/main.js';

start({ standalone: true });
