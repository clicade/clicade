import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/args.js';
import { resolveMono } from '../src/prefs.js';

test('monochrome flags', () => {
  assert.equal(parseArgs(['--mono']).mono, true);
  assert.equal(parseArgs(['--monochrome']).mono, true);
  assert.equal(parseArgs(['--no-color']).mono, true);
  assert.equal(parseArgs(['--color']).mono, false);
  assert.equal(parseArgs([]).mono, null, 'unspecified stays null so preferences can apply');
});

test('theme flag in both spellings', () => {
  assert.equal(parseArgs(['--theme', 'noir']).theme, 'noir');
  assert.equal(parseArgs(['--theme=paper']).theme, 'paper');
  assert.equal(parseArgs([]).theme, null);
});

test('help flag', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-h']).help, true);
  assert.equal(parseArgs([]).help, false);
});

test('unknown arguments are collected, not rejected', () => {
  assert.deepEqual(parseArgs(['--mono', 'extra']).rest, ['extra']);
});

test('NO_COLOR beats an explicit --color flag', () => {
  assert.equal(resolveMono({ envNoColor: true, flag: false, saved: false }), true);
});

test('a flag beats a saved preference', () => {
  assert.equal(resolveMono({ envNoColor: false, flag: true, saved: false }), true);
  assert.equal(resolveMono({ envNoColor: false, flag: false, saved: true }), false);
});

test('a saved preference applies when no flag is given', () => {
  assert.equal(resolveMono({ envNoColor: false, flag: null, saved: true }), true);
  assert.equal(resolveMono({ envNoColor: false, flag: null, saved: false }), false);
});

test('colour is the default when nothing is specified', () => {
  assert.equal(resolveMono({ envNoColor: false, flag: null, saved: null }), false);
});
