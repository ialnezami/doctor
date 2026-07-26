'use strict';

const path    = require('path');
const { app } = require('electron');
const crypto  = require('./crypto');

let _db = null;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  _id         TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT,
  price       REAL NOT NULL DEFAULT 0,
  stock       INTEGER NOT NULL DEFAULT 0,
  unit        TEXT,
  updatedAt   TEXT,
  deletedAt   TEXT
);

CREATE TABLE IF NOT EXISTS sales (
  _id         TEXT PRIMARY KEY,
  items       TEXT NOT NULL,
  totalAmount REAL NOT NULL DEFAULT 0,
  patientName TEXT,
  paymentMethod TEXT,
  createdAt   TEXT NOT NULL,
  syncedAt    TEXT
);

CREATE TABLE IF NOT EXISTS appointments (
  _id         TEXT PRIMARY KEY,
  patientId   TEXT,
  patientName TEXT,
  date        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'scheduled',
  notes       TEXT,
  updatedAt   TEXT
);

CREATE TABLE IF NOT EXISTS patients (
  _id         TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT,
  allergies   TEXT,
  conditions  TEXT,
  updatedAt   TEXT
);

CREATE TABLE IF NOT EXISTS prescriptions (
  _id         TEXT PRIMARY KEY,
  patientId   TEXT,
  patientName TEXT,
  medications TEXT NOT NULL,
  instructions TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  qrToken     TEXT,
  dispensedAt TEXT,
  createdAt   TEXT NOT NULL,
  updatedAt   TEXT
);

CREATE TABLE IF NOT EXISTS lab_orders (
  _id         TEXT PRIMARY KEY,
  patientId   TEXT,
  patientName TEXT,
  tests       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  results     TEXT,
  createdAt   TEXT NOT NULL,
  updatedAt   TEXT
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity      TEXT NOT NULL,
  entityId    TEXT NOT NULL,
  operation   TEXT NOT NULL,
  payload     TEXT NOT NULL,
  createdAt   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_meta (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL
);
`;

// ---------------------------------------------------------------------------
// Row mappers — decrypt PHI on read
// ---------------------------------------------------------------------------

function rowToAppointment(r) {
  if (!r) return null;
  return {
    ...r,
    patientName: crypto.decrypt(r.patientName),
    notes:       crypto.decrypt(r.notes),
  };
}

function rowToPatient(r) {
  if (!r) return null;
  return {
    ...r,
    name:       crypto.decrypt(r.name),
    allergies:  crypto.decrypt(r.allergies),
    conditions: crypto.decrypt(r.conditions),
  };
}

function rowToPrescription(r) {
  if (!r) return null;
  return {
    ...r,
    patientName:  crypto.decrypt(r.patientName),
    medications:  crypto.decrypt(r.medications),
    instructions: crypto.decrypt(r.instructions),
  };
}

function rowToLabOrder(r) {
  if (!r) return null;
  return {
    ...r,
    patientName: crypto.decrypt(r.patientName),
    tests:       crypto.decrypt(r.tests),
  };
}

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

async function initialize() {
  const Database = require('better-sqlite3');
  const dbPath   = path.join(app.getPath('userData'), 'mediconnect.db');
  _db = new Database(dbPath);
  _db.exec(SCHEMA);
}

// ---------------------------------------------------------------------------
// products
// ---------------------------------------------------------------------------

const products = {
  list(since) {
    const sql = since
      ? 'SELECT * FROM products WHERE updatedAt > ? AND deletedAt IS NULL ORDER BY name'
      : 'SELECT * FROM products WHERE deletedAt IS NULL ORDER BY name';
    return since ? _db.prepare(sql).all(since) : _db.prepare(sql).all();
  },

  upsert(p) {
    _db.prepare(`
      INSERT INTO products (_id, name, category, price, stock, unit, updatedAt)
      VALUES (@_id, @name, @category, @price, @stock, @unit, @updatedAt)
      ON CONFLICT(_id) DO UPDATE SET
        name=excluded.name, category=excluded.category, price=excluded.price,
        stock=excluded.stock, unit=excluded.unit, updatedAt=excluded.updatedAt
    `).run(p);
  },

  adjustStock(_id, delta) {
    _db.prepare('UPDATE products SET stock = stock + ? WHERE _id = ?').run(delta, _id);
  },

  remove(_id) {
    _db.prepare("UPDATE products SET deletedAt = datetime('now') WHERE _id = ?").run(_id);
  },
};

// ---------------------------------------------------------------------------
// sales
// ---------------------------------------------------------------------------

const sales = {
  list(since) {
    const sql = since
      ? 'SELECT * FROM sales WHERE createdAt > ? ORDER BY createdAt DESC'
      : 'SELECT * FROM sales ORDER BY createdAt DESC';
    const rows = since ? _db.prepare(sql).all(since) : _db.prepare(sql).all();
    return rows.map(r => ({ ...r, items: JSON.parse(r.items) }));
  },

  create(s) {
    _db.prepare(`
      INSERT INTO sales (_id, items, totalAmount, patientName, paymentMethod, createdAt)
      VALUES (@_id, @items, @totalAmount, @patientName, @paymentMethod, @createdAt)
    `).run({ ...s, items: JSON.stringify(s.items) });
  },

  // CR-05: atomic checkout — sale insert + all stock adjustments in one transaction
  checkout(sale, cartItems) {
    return _db.transaction(() => {
      _db.prepare(`
        INSERT INTO sales (_id, items, totalAmount, patientName, paymentMethod, createdAt)
        VALUES (@_id, @items, @totalAmount, @patientName, @paymentMethod, @createdAt)
      `).run({ ...sale, items: JSON.stringify(sale.items) });
      const adjustStmt = _db.prepare('UPDATE products SET stock = stock + ? WHERE _id = ?');
      for (const item of cartItems) {
        adjustStmt.run(-item.qty, item._id);
      }
    })();
  },
};

// ---------------------------------------------------------------------------
// appointments
// ---------------------------------------------------------------------------

const appointments = {
  list(since) {
    const sql = since
      ? 'SELECT * FROM appointments WHERE updatedAt > ? ORDER BY date DESC'
      : 'SELECT * FROM appointments ORDER BY date DESC';
    const rows = since ? _db.prepare(sql).all(since) : _db.prepare(sql).all();
    return rows.map(rowToAppointment);
  },

  listByDate(date) {
    return _db.prepare("SELECT * FROM appointments WHERE date LIKE ? ORDER BY date")
      .all(`${date}%`)
      .map(rowToAppointment);
  },

  upsert(a) {
    _db.prepare(`
      INSERT INTO appointments (_id, patientId, patientName, date, status, notes, updatedAt)
      VALUES (@_id, @patientId, @patientName, @date, @status, @notes, @updatedAt)
      ON CONFLICT(_id) DO UPDATE SET
        patientId=excluded.patientId, patientName=excluded.patientName,
        date=excluded.date, status=excluded.status,
        notes=excluded.notes, updatedAt=excluded.updatedAt
    `).run({
      ...a,
      patientName: crypto.encrypt(a.patientName),
      notes:       crypto.encrypt(a.notes),
    });
  },
};

// ---------------------------------------------------------------------------
// patients
// ---------------------------------------------------------------------------

const patients = {
  list(since) {
    // CR-06: ORDER BY name sorts ciphertext, not plaintext — sort in JS after decryption
    const sql = since
      ? 'SELECT * FROM patients WHERE updatedAt > ?'
      : 'SELECT * FROM patients';
    const rows = since ? _db.prepare(sql).all(since) : _db.prepare(sql).all();
    return rows.map(rowToPatient).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  },

  get(_id) {
    return rowToPatient(_db.prepare('SELECT * FROM patients WHERE _id = ?').get(_id));
  },

  upsert(p) {
    _db.prepare(`
      INSERT INTO patients (_id, name, phone, allergies, conditions, updatedAt)
      VALUES (@_id, @name, @phone, @allergies, @conditions, @updatedAt)
      ON CONFLICT(_id) DO UPDATE SET
        name=excluded.name, phone=excluded.phone,
        allergies=excluded.allergies, conditions=excluded.conditions,
        updatedAt=excluded.updatedAt
    `).run({
      ...p,
      name:       crypto.encrypt(p.name),
      allergies:  crypto.encrypt(p.allergies),
      conditions: crypto.encrypt(p.conditions),
    });
  },
};

// ---------------------------------------------------------------------------
// prescriptions
// ---------------------------------------------------------------------------

const prescriptions = {
  list(since) {
    const sql = since
      ? 'SELECT * FROM prescriptions WHERE updatedAt > ? ORDER BY createdAt DESC'
      : 'SELECT * FROM prescriptions ORDER BY createdAt DESC';
    const rows = since ? _db.prepare(sql).all(since) : _db.prepare(sql).all();
    return rows.map(rowToPrescription);
  },

  create(p) {
    _db.prepare(`
      INSERT INTO prescriptions
        (_id, patientId, patientName, medications, instructions, status, qrToken, createdAt, updatedAt)
      VALUES
        (@_id, @patientId, @patientName, @medications, @instructions, @status, @qrToken, @createdAt, @updatedAt)
      ON CONFLICT(_id) DO UPDATE SET
        patientName=excluded.patientName, medications=excluded.medications,
        instructions=excluded.instructions, status=excluded.status,
        qrToken=excluded.qrToken, dispensedAt=excluded.dispensedAt, updatedAt=excluded.updatedAt
    `).run({
      ...p,
      patientName:  crypto.encrypt(p.patientName),
      medications:  crypto.encrypt(
        typeof p.medications === 'string' ? p.medications : JSON.stringify(p.medications)
      ),
      instructions: crypto.encrypt(p.instructions),
    });
  },
};

// ---------------------------------------------------------------------------
// labOrders
// ---------------------------------------------------------------------------

const labOrders = {
  list(since) {
    const sql = since
      ? 'SELECT * FROM lab_orders WHERE updatedAt > ? ORDER BY createdAt DESC'
      : 'SELECT * FROM lab_orders ORDER BY createdAt DESC';
    const rows = since ? _db.prepare(sql).all(since) : _db.prepare(sql).all();
    return rows.map(rowToLabOrder);
  },

  upsert(o) {
    _db.prepare(`
      INSERT INTO lab_orders (_id, patientId, patientName, tests, status, results, createdAt, updatedAt)
      VALUES (@_id, @patientId, @patientName, @tests, @status, @results, @createdAt, @updatedAt)
      ON CONFLICT(_id) DO UPDATE SET
        patientName=excluded.patientName, tests=excluded.tests,
        status=excluded.status, results=excluded.results, updatedAt=excluded.updatedAt
    `).run({
      ...o,
      patientName: crypto.encrypt(o.patientName),
      tests: crypto.encrypt(
        typeof o.tests === 'string' ? o.tests : JSON.stringify(o.tests)
      ),
    });
  },

  updateStatus(_id, status, results, updatedAt) {
    _db.prepare(
      'UPDATE lab_orders SET status=?, results=?, updatedAt=? WHERE _id=?'
    ).run(status, results ?? null, updatedAt, _id);
  },
};

// ---------------------------------------------------------------------------
// syncQueue
// ---------------------------------------------------------------------------

const syncQueue = {
  push(entity, entityId, operation, payload) {
    _db.prepare(`
      INSERT INTO sync_queue (entity, entityId, operation, payload, createdAt)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(entity, entityId, operation, JSON.stringify(payload));
  },

  list() {
    return _db.prepare('SELECT * FROM sync_queue ORDER BY id').all()
      .map(r => ({ ...r, payload: JSON.parse(r.payload) }));
  },

  remove(id) {
    _db.prepare('DELETE FROM sync_queue WHERE id = ?').run(id);
  },
};

// ---------------------------------------------------------------------------
// meta (used by sync.js for lastSyncAt and schema version)
// ---------------------------------------------------------------------------

const meta = {
  get(key) {
    const row = _db.prepare('SELECT value FROM sync_meta WHERE key = ?').get(key);
    return row ? row.value : null;
  },

  set(key, value) {
    _db.prepare(`
      INSERT INTO sync_meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `).run(key, String(value));
  },
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  initialize,
  products,
  sales,
  appointments,
  patients,
  prescriptions,
  labOrders,
  syncQueue,
  meta,
};
