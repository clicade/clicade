import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMenu } from '../src/menu.js';
import { CATALOG, findGame, playable } from '../src/catalog.js';

const ENTRIES = [
  { id: 'a', title: 'A', blurb: '', players: '', tags: [], start: () => {} },
  { id: 'b', title: 'B', blurb: '', players: '', tags: [], start: null },
  { id: 'c', title: 'C', blurb: '', players: '', tags: [], start: () => {} },
];

test('selection wraps at both ends', () => {
  const menu = createMenu(ENTRIES);
  menu.move(-1);
  assert.equal(menu.state.index, 2, 'up from the first entry lands on the last');
  menu.move(1);
  assert.equal(menu.state.index, 0);
});

test('to() clamps into range instead of throwing', () => {
  const menu = createMenu(ENTRIES);
  menu.to(99);
  assert.equal(menu.state.index, 0);
  menu.to(-1);
  assert.equal(menu.state.index, 2);
});

test('picking a built game returns it', () => {
  const menu = createMenu(ENTRIES, 0);
  assert.equal(menu.pick(), ENTRIES[0]);
  assert.equal(menu.state.nudge, 0, 'no complaint when the pick is valid');
});

test('picking an unbuilt game is refused and explains itself', () => {
  const menu = createMenu(ENTRIES, 1);
  assert.equal(menu.pick(), null);
  assert.ok(menu.state.nudge > 0, 'sets a nudge so the UI can say why');
});

test('the nudge decays and does not go negative', () => {
  const menu = createMenu(ENTRIES, 1);
  menu.pick();
  menu.update(10);
  assert.equal(menu.state.nudge, 0);
});

test('moving clears a pending complaint', () => {
  const menu = createMenu(ENTRIES, 1);
  menu.pick();
  menu.move(1);
  assert.equal(menu.state.nudge, 0);
});

test('pulse stays in range and never depends on wall clock', () => {
  const menu = createMenu(ENTRIES);
  for (let i = 0; i < 500; i++) menu.update(1 / 30);
  assert.ok(menu.state.pulse >= 0 && menu.state.pulse < 1);
});

test('an empty catalog does not crash the menu', () => {
  const menu = createMenu([]);
  assert.equal(menu.current(), null);
  menu.move(1);
  assert.equal(menu.state.index, 0);
  assert.equal(menu.pick(), null);
});

test('catalog ids are unique and lowercase', () => {
  const ids = CATALOG.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.equal(id, id.toLowerCase());
});

test('every catalog entry carries what the panel draws', () => {
  for (const entry of CATALOG) {
    assert.equal(typeof entry.title, 'string');
    assert.ok(entry.blurb.length > 0, `${entry.id} needs a blurb`);
    assert.equal(typeof entry.players, 'string');
    assert.ok(Array.isArray(entry.tags));
  }
});

test('findGame is case-insensitive and safe on junk', () => {
  assert.equal(findGame('BlackJack')?.id, 'blackjack');
  assert.equal(findGame('nope'), null);
  assert.equal(findGame(''), null);
  assert.equal(findGame(undefined), null);
});

test('at least one game is actually playable', () => {
  assert.ok(playable().length >= 1);
  for (const entry of playable()) assert.equal(typeof entry.start, 'function');
});
