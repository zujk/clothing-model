// Smoke test: node test.js   (starts its own server on a random port)
'use strict';
const { spawn } = require('node:child_process');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const port = 3900 + Math.floor(Math.random() * 90);
const dataFile = path.join(os.tmpdir(), `lsm-test-${process.pid}.json`);
const KEY = 'test-key-1234';
const base = `http://127.0.0.1:${port}`;
const call = (p, opts = {}, key = KEY) =>
  fetch(base + p, { ...opts, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' } });
const sync = async (body) => (await call('/api/sync', { method: 'POST', body: JSON.stringify(body) })).json();

(async () => {
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname, stdio: 'inherit',
    env: { ...process.env, PORT: String(port), HOUSEHOLD_KEY: KEY, DATA_FILE: dataFile },
  });
  await new Promise((r) => setTimeout(r, 500));
  try {
    assert.equal((await call('/api/sync', { method: 'POST', body: '{}' }, 'wrong')).status, 401);

    let a = await sync({ since: 0, who: 'Ziv', changes: [{ id: 'd1', type: 'dish', data: { name: 'Risotto' }, updated: 100 }] });
    assert.equal(a.records.length, 1);
    let b = await sync({ since: 0, who: 'Anna' });
    assert.equal(b.records[0].data.name, 'Risotto');

    // older write loses, newer wins
    await sync({ since: 0, changes: [{ id: 'd1', type: 'dish', data: { name: 'OLD' }, updated: 50 }] });
    await sync({ since: 0, changes: [{ id: 'd1', type: 'dish', data: { name: 'Ramen' }, updated: 200 }] });
    b = await sync({ since: b.rev });
    assert.equal(b.records.length, 1);
    assert.equal(b.records[0].data.name, 'Ramen');

    // delete = tombstone that propagates
    await sync({ since: 0, changes: [{ id: 'd1', type: 'dish', updated: 300, deleted: true }] });
    b = await sync({ since: b.rev });
    assert.equal(b.records[0].deleted, true);

    // presence + long-poll wake-up
    a = await sync({ since: 0, who: 'Ziv', shopping: false });
    const waiting = call(`/api/wait?version=${a.version}`).then((r) => r.json());
    await new Promise((r) => setTimeout(r, 100));
    await sync({ since: 0, who: 'Ziv', shopping: true });
    const woke = await waiting;
    assert.ok(woke.version > a.version);
    b = await sync({ since: 0, who: 'Anna' });
    assert.deepEqual(b.shopping, ['Ziv']);
    a = await sync({ since: 0, who: 'Ziv', shopping: true });
    assert.deepEqual(a.shopping, []); // you never see yourself

    // persistence across restart
    srv.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(JSON.parse(fs.readFileSync(dataFile, 'utf8')).records.d1.deleted);
    console.log('server tests passed');
  } finally {
    srv.kill();
    fs.rmSync(dataFile, { force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
