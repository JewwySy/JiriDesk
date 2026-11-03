const { test } = require('node:test');
const assert = require('node:assert/strict');
const { adminTaskXml } = require('./elevation.js');

const task = (over = {}) => adminTaskXml({ exe: 'C:\\Apps\\JiriDesk.exe', args: ['--input-helper=C:\\data'], user: 'OFFICE\\jiri', ...over });

test('the task runs elevated in the signed-in session of that user', () => {
  const xml = task();
  assert.match(xml, /<RunLevel>HighestAvailable<\/RunLevel>/);
  assert.match(xml, /<LogonType>InteractiveToken<\/LogonType>/);
  assert.match(xml, /<UserId>OFFICE\\jiri<\/UserId>[\s\S]*<LogonType>/);
  assert.match(xml, /<Command>C:\\Apps\\JiriDesk\.exe<\/Command>/);
  assert.match(xml, /<Arguments>--input-helper=C:\\data<\/Arguments>/);
});

test('the task only starts when the app asks for it', () => {
  assert.match(task(), /<Triggers \/>/);
});

test('Windows task defaults that would stop the helper are turned off', () => {
  const xml = task();
  assert.match(xml, /<ExecutionTimeLimit>PT0S<\/ExecutionTimeLimit>/);
  assert.match(xml, /<DisallowStartIfOnBatteries>false<\/DisallowStartIfOnBatteries>/);
  assert.match(xml, /<StopIfGoingOnBatteries>false<\/StopIfGoingOnBatteries>/);
  assert.match(xml, /<MultipleInstancesPolicy>IgnoreNew<\/MultipleInstancesPolicy>/);
  assert.match(xml, /<Priority>4<\/Priority>/);
});

test('paths and arguments cannot break out of the task definition', () => {
  const xml = task({ exe: 'C:\\A&B <x>\\JiriDesk.exe', args: ['--input-helper=C:\\my data'] });
  assert.match(xml, /<Command>C:\\A&amp;B &lt;x&gt;\\JiriDesk\.exe<\/Command>/);
  assert.match(xml, /<Arguments>&quot;--input-helper=C:\\my data&quot;<\/Arguments>/);
});
