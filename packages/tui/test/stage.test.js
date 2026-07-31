import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStage } from '../src/stage.js';
import { createScreen } from '../src/screen.js';
import { detectCaps } from '../src/caps.js';

function harness(cols, rows, world = { width: 20, height: 8 }) {
  const stream = {
    isTTY: true,
    columns: cols,
    rows,
    write() {},
    on() {},
  };
  const caps = detectCaps({
    env: { TERM: 'xterm-256color' },
    stream,
    input: { setRawMode() {} },
    platform: 'linux',
  });
  const screen = createScreen({ stream, caps });
  screen.enter();
  const stage = createStage({ screen, ...world });
  stage.measure();
  return { screen, stage, stream };
}

test('stage centers itself in the terminal', () => {
  const { stage } = harness(30, 12); // world 20x8 -> 5 spare cols, 4 spare rows
  assert.equal(stage.originX, 5);
  assert.equal(stage.originY, 2);
});

test('logical coordinates map through the letterbox offset', () => {
  const { screen, stage } = harness(30, 12);
  screen.clear();
  stage.put(0, 0, 'X');
  const line = screen.toText().split('\n')[2];
  assert.equal(line.indexOf('X'), 5, 'logical 0,0 lands at the stage origin');
});

test('a resize moves the letterbox but not logical positions', () => {
  const { screen, stage, stream } = harness(30, 12);

  screen.clear();
  stage.put(3, 1, 'BOX');
  const before = screen.toText();
  const beforeCol = before.split('\n')[3].indexOf('BOX');

  // Simulate the player zooming out: more cells, same world.
  stream.columns = 60;
  stream.rows = 20;
  screen.resize();
  stage.measure();

  screen.clear();
  stage.put(3, 1, 'BOX'); // identical logical call
  const afterCol = screen.toText().split('\n')[7].indexOf('BOX');

  // The box moved on screen because the letterbox recentred...
  assert.notEqual(beforeCol, afterCol);
  // ...but its offset from the stage origin — its actual game position — is
  // unchanged. This is the invariant that stops zoom from altering outcomes.
  assert.equal(beforeCol - 5, 3);
  assert.equal(afterCol - stage.originX, 3);
});

test('stage dimensions never change with the terminal', () => {
  const { stage, screen, stream } = harness(30, 12);
  assert.equal(stage.width, 20);
  assert.equal(stage.height, 8);

  stream.columns = 200;
  stream.rows = 60;
  screen.resize();
  stage.measure();

  assert.equal(stage.width, 20, 'world width is fixed');
  assert.equal(stage.height, 8, 'world height is fixed');
});

test('drawing past the right edge is clipped, not spilled', () => {
  const { screen, stage } = harness(40, 10); // 10 spare cols of letterbox
  screen.clear();
  stage.put(18, 0, 'ABCDEFGH'); // starts 2 cells from the world's right edge
  const line = screen.toText().split('\n')[1];
  assert.ok(line.includes('AB'), 'the part inside the stage renders');
  assert.ok(!line.includes('ABC'), 'nothing bleeds into the letterbox');
});

test('drawing past the left edge is clipped', () => {
  const { screen, stage } = harness(40, 10);
  screen.clear();
  stage.put(-3, 0, 'ABCDEF');
  const line = screen.toText().split('\n')[1];
  assert.ok(line.includes('DEF'));
  assert.ok(!line.includes('CDEF'));
});

test('rows outside the world are dropped', () => {
  const { screen, stage } = harness(40, 20);
  screen.clear();
  stage.put(0, 8, 'below'); // world height is 8, so row 8 is out
  stage.put(0, -1, 'above');
  assert.equal(screen.toText().trim(), '');
});

test('a terminal smaller than the world reports tooSmall', () => {
  const { stage } = harness(15, 5);
  assert.equal(stage.tooSmall, true);
});

test('tooSmall clears once the terminal is big enough again', () => {
  const { stage, screen, stream } = harness(15, 5);
  assert.equal(stage.tooSmall, true);

  stream.columns = 25;
  stream.rows = 10;
  screen.resize();
  stage.measure();
  assert.equal(stage.tooSmall, false);
});

test('an exactly-sized terminal is not tooSmall', () => {
  const { stage } = harness(20, 8);
  assert.equal(stage.tooSmall, false);
  assert.equal(stage.originX, 0);
  assert.equal(stage.originY, 0);
});

test('fill respects stage bounds', () => {
  const { screen, stage } = harness(40, 10);
  screen.clear();
  stage.fill(16, 0, 10, 2, '#'); // runs off the right edge of the world
  const lines = screen.toText().split('\n');
  assert.equal(lines[1].trim(), '####', 'clipped to the 4 remaining columns');
});
