'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let db         = null;
let syncEngine = null;
let printMod   = null;
let store      = null; // CR-01: initialized inside whenReady after crypto.initKey()

// CR-04: only these entity types may be pushed to the sync queue from the renderer
const ALLOWED_SYNC_ENTITIES = new Set(['products', 'appointments', 'patients', 'prescriptions', 'labOrders']);
// CR-07: lab order status allowlist
const ALLOWED_LAB_STATUSES  = new Set(['pending', 'in_progress', 'completed', 'cancelled']);

// CR-02: JWT lives in the OS keychain, not electron-store
const JWT_SERVICE = 'Salamtak-Desktop';
const JWT_ACCOUNT = 'jwt-token';

function _keytar() {
  try { return require('keytar'); } catch { return null; }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload.js'),
    },
  });
  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }
  return win;
}

app.whenReady().then(async () => {
  // CR-03: initKey FIRST — db.initialize() calls encrypt/decrypt immediately on open
  const cryptoMod = require('./crypto');
  try {
    await cryptoMod.initKey();
  } catch (e) {
    console.error('[main] crypto.initKey failed:', e.message);
  }

  // CR-01: derive electron-store encryption key from the same keytar/machine-id key
  //        material — never a hardcoded string
  const Store = (() => { try { return require('electron-store'); } catch { return null; } })();
  if (Store) {
    try {
      store = new Store({ encryptionKey: cryptoMod.getKeyHex() });
    } catch (e) {
      console.error('[main] store init failed:', e.message);
    }
  }

  try { db = require('./db'); await db.initialize(); } catch (e) { console.error('[main] db:', e.message); }

  try {
    syncEngine = require('./sync');
    syncEngine.start();
    // CR-02: read startup token from OS keychain, not electron-store
    const kt = _keytar();
    const savedToken = kt ? await kt.getPassword(JWT_SERVICE, JWT_ACCOUNT) : null;
    if (savedToken) syncEngine.setToken(savedToken);
  } catch (e) { console.error('[main] sync:', e.message); }

  try { printMod = require('./print'); } catch {}
  try { require('./autoUpdate'); } catch {}

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ── Auth — CR-02: JWT in keytar, user metadata in electron-store ───────────
ipcMain.handle('auth:getToken', async () => {
  const kt = _keytar();
  return kt ? (await kt.getPassword(JWT_SERVICE, JWT_ACCOUNT)) : null;
});
ipcMain.handle('auth:getUser',  () => store?.get('user') ?? null);
ipcMain.handle('auth:setToken', async (_, t) => {
  const kt = _keytar();
  if (kt && t) await kt.setPassword(JWT_SERVICE, JWT_ACCOUNT, t);
  if (syncEngine) syncEngine.setToken(t);
});
ipcMain.handle('auth:setUser',  (_, u) => { store?.set('user', u); });
ipcMain.handle('auth:clearToken', async () => {
  const kt = _keytar();
  if (kt) await kt.deletePassword(JWT_SERVICE, JWT_ACCOUNT).catch(() => {});
  store?.delete('user');
  if (syncEngine) syncEngine.setToken(null);
});

// ── DB ────────────────────────────────────────────────────────────────────
ipcMain.handle('db:products:list',        () => db?.products.list() ?? []);
// CR-07: validate delta is a safe integer before passing to DB
ipcMain.handle('db:products:adjustStock', (_, id, delta) => {
  if (typeof id !== 'string' || !id.trim()) return;
  const d = Number(delta);
  if (!Number.isSafeInteger(d) || d === 0) return;
  return db?.products.adjustStock(id, d);
});
ipcMain.handle('db:products:upsert',      (_, rows) => db?.products.upsert(rows));
ipcMain.handle('db:products:remove',      (_, id)  => db?.products.remove(id));

ipcMain.handle('db:sales:list',           () => db?.sales.list() ?? []);
ipcMain.handle('db:sales:create',         (_, sale) => db?.sales.create(sale));
// CR-05: atomic checkout — sale + stock adjustments in one SQLite transaction
ipcMain.handle('db:sales:checkout',       (_, sale, cartItems) => db?.sales.checkout(sale, cartItems));

ipcMain.handle('db:appointments:list',       () => db?.appointments.list()           ?? []);
ipcMain.handle('db:appointments:listByDate', (_, date) => db?.appointments.listByDate(date) ?? []);
ipcMain.handle('db:appointments:upsert',     (_, rows) => db?.appointments.upsert(rows));

ipcMain.handle('db:patients:list',   () => db?.patients.list()   ?? []);
ipcMain.handle('db:patients:get',    (_, id) => db?.patients.get(id));
ipcMain.handle('db:patients:upsert', (_, rows) => db?.patients.upsert(rows));

ipcMain.handle('db:prescriptions:list',   () => db?.prescriptions.list() ?? []);
ipcMain.handle('db:prescriptions:create', (_, rx) => db?.prescriptions.create(rx));

ipcMain.handle('db:labOrders:list',         () => db?.labOrders.list() ?? []);
// CR-07: validate status against allowlist before updating
ipcMain.handle('db:labOrders:updateStatus', (_, id, status, tests) => {
  if (typeof id !== 'string' || !id.trim()) return;
  if (!ALLOWED_LAB_STATUSES.has(status)) return;
  return db?.labOrders.updateStatus(id, status, tests);
});

// CR-04: entity type validated here; URL constructed in sync.js, never from renderer
ipcMain.handle('db:syncQueue:enqueue', (_, entity, entityId, operation, payload) => {
  if (!ALLOWED_SYNC_ENTITIES.has(entity)) return;
  if (typeof entityId !== 'string' || !entityId.trim()) return;
  return db?.syncQueue.push(entity, entityId, operation, payload);
});
ipcMain.handle('db:syncQueue:list',    () => db?.syncQueue.list()   ?? []);
ipcMain.handle('db:syncQueue:remove',  (_, id) => db?.syncQueue.remove(id));

// ── Sync ──────────────────────────────────────────────────────────────────
ipcMain.handle('sync:trigger', () => syncEngine?.triggerSync() ?? null);
ipcMain.handle('sync:status',  () => syncEngine?.getStatus()  ?? { status: 'offline', lastSyncAt: null });

// ── Print ─────────────────────────────────────────────────────────────────
ipcMain.handle('print:receipt', (e, args) => printMod?.printReceipt(e, args));
ipcMain.handle('print:pdf',     (e, args) => printMod?.savePDF(e, args));

// ── App ───────────────────────────────────────────────────────────────────
ipcMain.handle('app:getVersion', () => app.getVersion());
