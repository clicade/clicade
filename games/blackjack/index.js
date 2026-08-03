#!/usr/bin/env node
/**
 * npx @clicade/blackjack
 *
 * Standalone entry. All the wiring lives in src/main.js, which the arcade
 * launcher imports too — this file exists only to own the process.
 */

import { start } from './src/main.js';

start({ standalone: true });
