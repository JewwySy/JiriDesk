const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_SERVERS, parseServers, serversToTry, migrateServers } = require('./servers.js');

test('addresses can be separated by commas or new lines and duplicates are dropped', () => {
  assert.deepEqual(parseServers(' ws://a:3001, wss://b\nws://a:3001 '), ['ws://a:3001', 'wss://b']);
});

test('anything that is not a ws or wss address invalidates the list', () => {
  assert.equal(parseServers('ws://a:3001, http://b'), null);
  assert.equal(parseServers('   '), null);
});

test('the same-network address is tried before the remote one, in the saved order', () => {
  assert.deepEqual(serversToTry('ws://lan:3001, ws://remote:3001', ''), ['ws://lan:3001', 'ws://remote:3001']);
});

test('an access key is never offered to an unencrypted address', () => {
  assert.deepEqual(serversToTry('ws://lan:3001, wss://remote', 'secret'), ['wss://remote']);
  assert.deepEqual(serversToTry('ws://lan:3001', 'secret'), []);
});

test('a saved old default moves to the automatic list, a custom address is kept', () => {
  assert.equal(migrateServers('ws://localhost:3001'), DEFAULT_SERVERS);
  assert.equal(migrateServers('wss://mine.example'), 'wss://mine.example');
});
