const { test } = require('node:test');
const assert = require('node:assert/strict');
const { coalesceInput, safeFileName, chunkRanges, isLanPath, qualityFor, heldKeysTracker, displayPoint, wheelAmount } = require('./session.js');

test('one wheel notch scrolls one real notch on the remote computer', () => {
  assert.equal(wheelAmount(100, 'win32'), 120);
  assert.equal(wheelAmount(-100, 'win32'), 120);
  assert.equal(wheelAmount(1, 'win32'), 2);
  assert.equal(wheelAmount(100, 'darwin'), 1);
  assert.equal(wheelAmount(250, 'linux'), 3);
});

test('a position on the video lands on the chosen monitor and never spills onto the next one', () => {
  const second = { x: 1920, y: 0, width: 1920, height: 1080 };
  assert.deepEqual(displayPoint(second, 0.25, 0.5), { x: 2400, y: 540 });
  assert.deepEqual(displayPoint(second, 0, 0), { x: 1920, y: 0 });
  assert.deepEqual(displayPoint(second, 1, 1), { x: 3839, y: 1079 });
  assert.deepEqual(displayPoint({ x: -1920, y: -200, width: 1920, height: 1080 }, 1, 0), { x: -1, y: -200 });
});

test('queued mouse moves collapse to the newest, clicks and keys keep their order', () => {
  const m = (x) => ({ type: 'move', x, y: 0 });
  const down = { type: 'down', button: 0, x: 0.5, y: 0 };
  const key = { type: 'keydown', code: 'KeyA' };
  assert.deepEqual(coalesceInput([m(0.1), m(0.2), down, m(0.3), m(0.4), key, m(0.5)]), [m(0.2), down, m(0.4), key, m(0.5)]);
});

test('a received file name can never leave the save folder', () => {
  assert.equal(safeFileName('report.pdf'), 'report.pdf');
  assert.equal(safeFileName('..\\..\\Windows\\evil.exe'), 'evil.exe');
  assert.equal(safeFileName('../../etc/passwd'), 'passwd');
  assert.equal(safeFileName('C:\\Users\\me\\a.txt'), 'a.txt');
  assert.equal(safeFileName('a<b>:c?.txt'), 'a_b__c_.txt');
  assert.equal(safeFileName('CON.txt'), '_CON.txt');
  assert.equal(safeFileName('..'), 'file');
  assert.equal(safeFileName(''), 'file');
  assert.equal(safeFileName('trailing. '), 'trailing');
});

test('a file is split into ranges that cover every byte exactly once', () => {
  assert.deepEqual(chunkRanges(10, 4), [[0, 4], [4, 8], [8, 10]]);
  assert.deepEqual(chunkRanges(8, 4), [[0, 4], [4, 8]]);
  assert.deepEqual(chunkRanges(0, 4), []);
});

test('same-network paths are recognised from the selected candidate pair', () => {
  assert.equal(isLanPath({ candidateType: 'host' }, { candidateType: 'host' }), true);
  assert.equal(isLanPath({ candidateType: 'host' }, { candidateType: 'prflx' }), true);
  assert.equal(isLanPath({ candidateType: 'srflx' }, { candidateType: 'host' }), false);
  assert.equal(isLanPath({ candidateType: 'relay' }, { candidateType: 'host' }), false);
  assert.equal(isLanPath(undefined, undefined), false);
  assert.equal(isLanPath({ candidateType: 'host', address: '100.81.71.70' }, { candidateType: 'host' }), false);
  assert.equal(isLanPath({ candidateType: 'host', address: '192.168.1.133' }, { candidateType: 'host', address: 'abc.local' }), true);
});

test('the same network gets a higher bitrate, other paths keep the chosen setting', () => {
  assert.equal(qualityFor(true, 4000000), 30000000);
  assert.equal(qualityFor(false, 4000000), 4000000);
});

test('every key still held is released when focus is lost, once', () => {
  const held = heldKeysTracker();
  held.down('ControlLeft'); held.down('KeyC'); held.down('KeyC'); held.up('KeyC');
  assert.deepEqual(held.releaseAll(), ['ControlLeft']);
  assert.deepEqual(held.releaseAll(), []);
});
