'use strict';
const { net, BrowserWindow } = require('electron');
const db = require('./db');

const API_BASE = 'https://web-production-1d93d.up.railway.app';

let _status     = 'idle';
let _lastSyncAt = null;
let _interval   = null;
let _token      = null;

function setToken(token) { _token = token; }
function getToken()      { return _token; }

function broadcast(status) {
  _status = status;
  const data = { status, lastSyncAt: _lastSyncAt };
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send('sync:status', data); } catch {}
  }
}

function getStatus() {
  return { status: _status, lastSyncAt: _lastSyncAt };
}

async function apiFetch(path, opts = {}) {
  if (!_token) throw new Error('No auth token');
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${_token}`,
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const err = new Error(`API ${res.status}: ${path}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function pull() {
  const since = _lastSyncAt ?? 0;

  await Promise.allSettled([
    apiFetch(`/api/products?since=${since}`)
      .then(d => { const rows = d.products ?? d ?? []; if (rows.length) db.products.upsert(rows); }),
    apiFetch(`/api/appointments?since=${since}`)
      .then(d => { const rows = d.appointments ?? d ?? []; if (rows.length) db.appointments.upsert(rows); }),
    apiFetch(`/api/patients?since=${since}`)
      .then(d => { const rows = d.patients ?? d ?? []; if (rows.length) db.patients.upsert(rows); }),
    apiFetch(`/api/prescriptions?since=${since}`)
      .then(d => { const rows = d.prescriptions ?? d ?? []; if (rows.length) db.prescriptions.upsert(rows); }),
    apiFetch(`/api/lab-results?since=${since}`)
      .then(d => { const rows = d.labResults ?? d ?? []; if (rows.length) db.labOrders.upsert(rows); }),
  ]);

  _lastSyncAt = Date.now();
  db.meta.set('lastSyncAt', String(_lastSyncAt));
}

async function pushQueue() {
  const queue = db.syncQueue.list();
  for (const item of queue) {
    try {
      await apiFetch(item.url, { method: item.method, body: item.payload });
      db.syncQueue.remove(item.id);
    } catch (err) {
      if (err.status === 409) {
        db.syncQueue.remove(item.id);
      } else {
        break;
      }
    }
  }
}

async function triggerSync() {
  if (_status === 'syncing') return;
  if (!net.isOnline()) { broadcast('offline'); return; }
  if (!_token) { broadcast('offline'); return; }

  broadcast('syncing');
  try {
    await pull();
    await pushQueue();
    broadcast('synced');
  } catch (err) {
    console.error('[sync] error:', err.message);
    broadcast(net.isOnline() ? 'error' : 'offline');
  }
}

function start() {
  try {
    const saved = db.meta.get('lastSyncAt');
    if (saved) _lastSyncAt = Number(saved);
  } catch {}

  net.on('online',  () => { broadcast('syncing'); triggerSync(); });
  net.on('offline', () => broadcast('offline'));

  _interval = setInterval(() => { triggerSync(); }, 5 * 60 * 1000);
}

function stop() {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

module.exports = { start, stop, triggerSync, getStatus, setToken, getToken };
