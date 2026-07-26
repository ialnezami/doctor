import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../store/authStore.js';
import SyncBadge from '../../components/SyncBadge.jsx';

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = {
  layout:  { minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  header:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10 },
  nav:     { display: 'flex', gap: 2, padding: '0 24px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' },
  content: { padding: 24, flex: 1 },
  card:    { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 },
  input:   { width: '100%', padding: '9px 12px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' },
  textarea:{ width: '100%', padding: '9px 12px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical', minHeight: 80, fontFamily: 'inherit' },
  btn:     (variant = 'primary') => ({
    padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
    background: variant === 'primary' ? 'var(--mint)' : variant === 'danger' ? '#ef4444' : 'var(--bg3)',
    color:      variant === 'primary' ? '#0a0f0d'     : variant === 'danger' ? '#fff'    : 'var(--text)',
  }),
  tabBtn: (active) => ({
    padding: '10px 16px', fontSize: 13, fontWeight: 500, border: 'none', borderBottom: active ? '2px solid var(--mint)' : '2px solid transparent',
    background: 'transparent', color: active ? 'var(--mint)' : 'var(--text2)', cursor: 'pointer',
  }),
  badge: (color) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: `${color}22`, color }),
  grid: { display: 'grid', gap: 16 },
  row:  { display: 'flex', gap: 12, alignItems: 'flex-start' },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
};

const STATUS_COLOR = { pending: '#f59e0b', processing: '#3b82f6', ready: '#0fe3b0' };
const TABS = ['All', 'Pending', 'Processing', 'Ready'];

// ── Result Entry Form ───────────────────────────────────────────────────────────
function ResultEntryForm({ order, onDone }) {
  const [tests, setTests] = useState(() => {
    try {
      const parsed = typeof order.tests === 'string' ? JSON.parse(order.tests) : order.tests;
      return Array.isArray(parsed)
        ? parsed.map((t) => ({ name: typeof t === 'string' ? t : t.name, result: t.result || '', unit: t.unit || '', normalRange: t.normalRange || '' }))
        : [{ name: '', result: '', unit: '', normalRange: '' }];
    } catch {
      return [{ name: String(order.tests), result: '', unit: '', normalRange: '' }];
    }
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState(null);

  function updateTest(idx, field, value) {
    setTests((prev) => prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  }

  function addTest() {
    setTests((prev) => [...prev, { name: '', result: '', unit: '', normalRange: '' }]);
  }

  function removeTest(idx) {
    setTests((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handlePublish() {
    const incomplete = tests.filter((t) => !t.name.trim() || !t.result.trim());
    if (incomplete.length > 0) { setErr('All tests must have a name and result.'); return; }
    setSaving(true);
    setErr(null);
    try {
      const updatedAt = new Date().toISOString();
      await window.api.db.labOrders.updateStatus(order._id, 'ready', JSON.stringify(tests), updatedAt);
      // Queue for server sync — server will send FCM notification to patient
      window.api.db.syncQueue.push('lab_orders', order._id, 'update', {
        _id: order._id,
        status: 'ready',
        results: JSON.stringify(tests),
        updatedAt,
      });
      onDone();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 16, padding: 16, background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Enter Results</span>
        <button onClick={addTest} style={S.btn('secondary')}>+ Add Test</button>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {tests.map((test, idx) => (
          <div key={idx} style={{ background: 'var(--bg2)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 120px auto', gap: 8, alignItems: 'end' }}>
              <div>
                <label style={S.label}>Test Name</label>
                <input style={S.input} value={test.name} onChange={(e) => updateTest(idx, 'name', e.target.value)} placeholder="e.g. Hemoglobin" />
              </div>
              <div>
                <label style={S.label}>Result</label>
                <input style={S.input} value={test.result} onChange={(e) => updateTest(idx, 'result', e.target.value)} placeholder="e.g. 14.5" />
              </div>
              <div>
                <label style={S.label}>Unit</label>
                <input style={S.input} value={test.unit} onChange={(e) => updateTest(idx, 'unit', e.target.value)} placeholder="g/dL" />
              </div>
              <div>
                <label style={S.label}>Normal Range</label>
                <input style={S.input} value={test.normalRange} onChange={(e) => updateTest(idx, 'normalRange', e.target.value)} placeholder="12–16" />
              </div>
              <button
                onClick={() => removeTest(idx)}
                disabled={tests.length === 1}
                style={{ ...S.btn('danger'), alignSelf: 'flex-end', opacity: tests.length === 1 ? 0.4 : 1 }}
              >✕</button>
            </div>
          </div>
        ))}
      </div>

      {err && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>{err}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={handlePublish} disabled={saving} style={S.btn()}>
          {saving ? 'Publishing…' : 'Publish Results'}
        </button>
        <button onClick={onDone} style={S.btn('secondary')}>Cancel</button>
      </div>
    </div>
  );
}

// ── Order Card ──────────────────────────────────────────────────────────────────
function OrderCard({ order, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [starting, setStarting] = useState(false);

  const tests = (() => {
    try {
      return typeof order.tests === 'string' ? JSON.parse(order.tests) : order.tests;
    } catch { return []; }
  })();

  const testList = Array.isArray(tests)
    ? tests.map((t) => typeof t === 'object' ? t.name : t).join(', ')
    : String(tests);

  async function handleStart() {
    setStarting(true);
    try {
      const updatedAt = new Date().toISOString();
      await window.api.db.labOrders.updateStatus(order._id, 'processing', null, updatedAt);
      window.api.db.syncQueue.push('lab_orders', order._id, 'update', {
        _id: order._id,
        status: 'processing',
        updatedAt,
      });
      onRefresh();
    } catch (e) {
      console.error('[LabLayout] start error:', e);
    } finally {
      setStarting(false);
    }
  }

  function handleDone() {
    setShowForm(false);
    onRefresh();
  }

  const hasPendingSync = !order.syncedAt;

  return (
    <div style={{ ...S.card, position: 'relative' }}>
      {hasPendingSync && (
        <span style={{ position: 'absolute', top: 12, right: 12, width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'block' }} title="Pending sync" />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{order.patientName || '—'}</span>
            <span style={S.badge(STATUS_COLOR[order.status] || '#6b7280')}>
              {order.status}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text2)' }}>
            <strong>Tests:</strong> {testList || '—'}
          </p>
          {order.results && order.status === 'ready' && (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text3)' }}>Results entered</p>
          )}
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text3)' }}>
            {new Date(order.createdAt).toLocaleDateString()} {new Date(order.createdAt).toLocaleTimeString()}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          {order.status === 'pending' && (
            <button onClick={handleStart} disabled={starting} style={S.btn('secondary')}>
              {starting ? 'Starting…' : 'Start Processing'}
            </button>
          )}
          {order.status === 'processing' && !showForm && (
            <button onClick={() => setShowForm(true)} style={S.btn()}>Enter Results</button>
          )}
        </div>
      </div>

      {showForm && (
        <ResultEntryForm order={order} onDone={handleDone} />
      )}
    </div>
  );
}

// ── Main Layout ─────────────────────────────────────────────────────────────────
export default function LabLayout() {
  const { user, logout } = useAuthStore();
  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState(null);
  const [tab, setTab]         = useState('All');

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await window.api.db.labOrders.list();
      setOrders(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = orders.filter((o) => {
    if (tab === 'All') return true;
    return o.status === tab.toLowerCase();
  });

  const counts = {
    All:        orders.length,
    Pending:    orders.filter((o) => o.status === 'pending').length,
    Processing: orders.filter((o) => o.status === 'processing').length,
    Ready:      orders.filter((o) => o.status === 'ready').length,
  };

  return (
    <div style={S.layout}>
      {/* Header */}
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--mint)' }}>Salamtak</span>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>Laboratory</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SyncBadge />
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{user?.name || user?.email}</span>
          <button onClick={logout} style={S.btn('secondary')}>Log out</button>
        </div>
      </header>

      {/* Filter tabs */}
      <nav style={S.nav}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={S.tabBtn(tab === t)}>
            {t}
            <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>({counts[t]})</span>
          </button>
        ))}
      </nav>

      {/* Content */}
      <main style={S.content}>
        {loading && (
          <p style={{ color: 'var(--text3)', fontSize: 13 }}>Loading orders…</p>
        )}
        {err && (
          <div style={{ ...S.card, border: '1px solid #ef4444', color: '#ef4444', fontSize: 13 }}>
            Error: {err} <button onClick={load} style={{ ...S.btn('secondary'), marginLeft: 8, padding: '4px 10px' }}>Retry</button>
          </div>
        )}
        {!loading && !err && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)', fontSize: 13 }}>
            No {tab !== 'All' ? tab.toLowerCase() : ''} lab orders
          </div>
        )}
        <div style={{ ...S.grid, gridTemplateColumns: '1fr' }}>
          {filtered.map((order) => (
            <OrderCard key={order._id} order={order} onRefresh={load} />
          ))}
        </div>
      </main>
    </div>
  );
}
