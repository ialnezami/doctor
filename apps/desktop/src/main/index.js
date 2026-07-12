'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let db         = null;
let syncEngine = null;
let printMod   = null;

const Store = (() => { try { return require('electron-store'); } catch { return null; } })();
const store = Store ? new Store({ encryptionKey: 'mc-desktop-secure-key' }) : null;

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
  try { db = require('./db'); await db.initialize(); } catch (e) { console.error('[main] db:', e.message); }
  try { syncEngine = require('./sync'); syncEngine.start(); } catch (e) { console.error('[main] sync:', e.message); }
  try { printMod = require('./print'); } catch {}
  try { require('./autoUpdate'); } catch {}

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ── Auth ──────────────────────────────────────────────────────────────────
ipcMain.handle('auth:getToken', () => store?.get('token') ?? null);
ipcMain.handle('auth:getUser',  () => store?.get('user')  ?? null);
ipcMain.handle('auth:setToken', (_, t) => { store?.set('token', t); });
ipcMain.handle('auth:setUser',  (_, u) => { store?.set('user',  u); });
ipcMain.handle('auth:clearToken', () => { store?.delete('token'); store?.delete('user'); });

// ── DB ────────────────────────────────────────────────────────────────────
ipcMain.handle('db:products:list',        () => db?.products.list()                      ?? []);
ipcMain.handle('db:products:adjustStock', (_, id, delta) => db?.products.adjustStock(id, delta));
ipcMain.handle('db:products:upsert',      (_, rows) => db?.products.upsert(rows));
ipcMain.handle('db:products:remove',      (_, id) => db?.products.remove(id));

ipcMain.handle('db:sales:list',   () => db?.sales.list() ?? []);
ipcMain.handle('db:sales:create', (_, sale) => db?.sales.create(sale));

ipcMain.handle('db:appointments:list',       () => db?.appointments.list()              ?? []);
ipcMain.handle('db:appointments:listByDate', (_, date) => db?.appointments.listByDate(date) ?? []);
ipcMain.handle('db:appointments:upsert',     (_, rows) => db?.appointments.upsert(rows));

ipcMain.handle('db:patients:list',   () => db?.patients.list()   ?? []);
ipcMain.handle('db:patients:get',    (_, id) => db?.patients.get(id));
ipcMain.handle('db:patients:upsert', (_, rows) => db?.patients.upsert(rows));

ipcMain.handle('db:prescriptions:list',   () => db?.prescriptions.list() ?? []);
ipcMain.handle('db:prescriptions:create', (_, rx) => db?.prescriptions.create(rx));

ipcMain.handle('db:labOrders:list',         () => db?.labOrders.list() ?? []);
ipcMain.handle('db:labOrders:updateStatus', (_, id, status, tests) => db?.labOrders.updateStatus(id, status, tests));

ipcMain.handle('db:syncQueue:push',   (_, method, url, payload) => db?.syncQueue.push(method, url, payload));
ipcMain.handle('db:syncQueue:list',   () => db?.syncQueue.list()   ?? []);
ipcMain.handle('db:syncQueue:remove', (_, id) => db?.syncQueue.remove(id));

// ── Sync ──────────────────────────────────────────────────────────────────
ipcMain.handle('sync:trigger', () => syncEngine?.triggerSync() ?? null);
ipcMain.handle('sync:status',  () => syncEngine?.getStatus()  ?? { status: 'offline', lastSyncAt: null });

// ── Print ─────────────────────────────────────────────────────────────────
ipcMain.handle('print:receipt', (e, args) => printMod?.printReceipt(e, args));
ipcMain.handle('print:pdf',     (e, args) => printMod?.savePDF(e, args));

// ── App ───────────────────────────────────────────────────────────────────
ipcMain.handle('app:getVersion', () => app.getVersion());
