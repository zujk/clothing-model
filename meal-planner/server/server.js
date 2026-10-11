// Lista Spesa & Menù — sync server.
// Zero dependencies (Node 18+). Stores everything in one JSON file.
//
//   HOUSEHOLD_KEY=some-long-secret PORT=3000 DATA_FILE=./data.json node server.js
//
// Records are opaque {id, type, data, updated, deleted} blobs; the newest `updated`
// (client clock, ms) wins. The server stamps each accepted change with a rising `rev`
// so clients can ask "what changed since rev N".

'use strict';
const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const KEY = process.env.HOUSEHOLD_KEY || '';
const DATA_FILE = process.env.DATA_FILE || './data.json';
const MAX_BODY = 1024 * 1024;
const WAIT_MS = 25000;
const PRESENCE_MS = 60000;

if (!KEY || KEY.length < 8) {
  console.error('Set HOUSEHOLD_KEY to a secret of at least 8 characters.');
  process.exit(1);
}

// ---- storage ----------------------------------------------------------------
let db = { rev: 0, records: {} };
try {
  db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}

let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DATA_FILE);
  }, 200);
}
function flush() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify(db));
  fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
}
process.on('SIGTERM', () => { flush(); process.exit(0); });
process.on('SIGINT', () => { flush(); process.exit(0); });

// ---- change notification & presence ------------------------------------------
let version = Date.now(); // bumps on any change (data or presence); never persisted
let waiters = [];
const presence = {}; // name -> { at, shopping }

function bump() {
  version++;
  const ready = waiters;
  waiters = [];
  for (const w of ready) w();
}

function shoppingNow(exceptName) {
  const cutoff = Date.now() - PRESENCE_MS;
  return Object.keys(presence).filter(
    (n) => n !== exceptName && presence[n].shopping && presence[n].at > cutoff
  );
}

// ---- helpers ---------------------------------------------------------------
function authorized(req) {
  const h = req.headers['authorization'] || '';
  const given = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '');
  const want = Buffer.from(KEY);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function validChange(c) {
  return c && typeof c.id === 'string' && c.id.length > 0 && c.id.length <= 64 &&
    typeof c.type === 'string' && c.type.length <= 32 &&
    typeof c.updated === 'number' && Number.isFinite(c.updated) &&
    (c.data === undefined || (typeof c.data === 'object' && c.data !== null));
}

function applyChanges(changes) {
  for (const c of changes) {
    if (!validChange(c)) continue;
    const cur = db.records[c.id];
    if (cur && cur.updated > c.updated) continue; // ours is newer
    if (cur && cur.updated === c.updated && !!cur.deleted === !!c.deleted &&
        JSON.stringify(cur.data) === JSON.stringify(c.data || {})) continue; // no-op echo
    db.records[c.id] = {
      id: c.id, type: c.type, data: c.data || {},
      updated: c.updated, deleted: !!c.deleted, rev: ++db.rev,
    };
  }
}

function recordsSince(since) {
  const out = [];
  for (const id in db.records) if (db.records[id].rev > since) out.push(db.records[id]);
  return out;
}

// ---- routes ----------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/health') return send(res, 200, { ok: true });
    if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'not found' });
    if (!authorized(req)) return send(res, 401, { error: 'bad key' });

    // POST /api/sync  {since, who, shopping, changes:[...]}
    if (url.pathname === '/api/sync' && req.method === 'POST') {
      const b = await readJson(req);
      const since = Number.isInteger(b.since) ? b.since : 0;
      const changes = Array.isArray(b.changes) ? b.changes : [];
      const before = db.rev;
      applyChanges(changes);
      if (db.rev !== before) save();

      const who = typeof b.who === 'string' ? b.who.slice(0, 40) : '';
      let presenceChanged = false;
      if (who) {
        const was = presence[who];
        const now = !!b.shopping;
        presenceChanged = !was || was.shopping !== now;
        presence[who] = { at: Date.now(), shopping: now };
      }
      if (db.rev !== before || presenceChanged) bump();

      return send(res, 200, {
        rev: db.rev,
        version,
        records: recordsSince(since),
        shopping: shoppingNow(who),
      });
    }

    // GET /api/wait?version=N  — returns when something changed (or after ~25 s)
    if (url.pathname === '/api/wait' && req.method === 'GET') {
      const v = Number(url.searchParams.get('version') || 0);
      if (version > v) return send(res, 200, { version });
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        waiters = waiters.filter((w) => w !== finish);
        send(res, 200, { version });
      };
      const timer = setTimeout(finish, WAIT_MS);
      waiters.push(finish);
      req.on('close', () => { done = true; clearTimeout(timer); waiters = waiters.filter((w) => w !== finish); });
      return;
    }

    return send(res, 404, { error: 'not found' });
  } catch (e) {
    return send(res, 400, { error: String(e.message || e) });
  }
});

server.keepAliveTimeout = 65000;
server.listen(PORT, HOST, () => console.log(`listening on http://${HOST}:${PORT}`));
