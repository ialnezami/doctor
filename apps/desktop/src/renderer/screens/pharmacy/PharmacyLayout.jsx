import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../store/authStore.js';
import SyncBadge from '../../components/SyncBadge.jsx';

const S = {
  layout:  { minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  header:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10 },
  nav:     { display: 'flex', gap: 2, padding: '0 24px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' },
  content: { padding: 24, flex: 1 },
  card:    { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 },
  input:   { width: '100%', padding: '9px 12px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' },
  btn: (v = 'primary') => ({
    padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
    background: v === 'primary' ? 'var(--mint)' : v === 'danger' ? '#ef4444' : 'var(--bg3)',
    color:      v === 'primary' ? '#0a0f0d'     : v === 'danger' ? '#fff'    : 'var(--text)',
  }),
  tabBtn: (a) => ({
    padding: '10px 16px', fontSize: 13, fontWeight: 500, border: 'none',
    borderBottom: a ? '2px solid var(--mint)' : '2px solid transparent',
    background: 'transparent', color: a ? 'var(--mint)' : 'var(--text2)', cursor: 'pointer',
  }),
  badge: (c) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: `${c}22`, color: c }),
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function buildReceiptHtml(sale, items) {
  const lines = items.map((item) =>
    `<tr><td>${item.name}</td><td style="text-align:center">${item.qty}</td><td style="text-align:right">${(item.price * item.qty).toFixed(2)}</td></tr>`
  ).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    body { font-family: monospace; font-size: 13px; max-width: 300px; margin: 0 auto; padding: 16px; }
    h2 { text-align: center; margin: 0 0 8px; font-size: 16px; }
    p  { text-align: center; margin: 2px 0; font-size: 11px; color: #555; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { padding: 4px 2px; font-size: 12px; }
    th { border-bottom: 1px solid #000; }
    tfoot td { border-top: 1px solid #000; font-weight: bold; }
    .footer { text-align: center; margin-top: 16px; font-size: 11px; color: #555; }
  </style></head><body>
  <h2>MediConnect Pharmacy</h2>
  <p>${new Date(sale.createdAt).toLocaleString()}</p>
  ${sale.patientName ? `<p>Patient: ${sale.patientName}</p>` : ''}
  <table>
    <thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead>
    <tbody>${lines}</tbody>
    <tfoot><tr><td colspan="2">Total</td><td style="text-align:right">${sale.totalAmount.toFixed(2)}</td></tr></tfoot>
  </table>
  <p style="margin-top:8px">Payment: ${sale.paymentMethod || 'Cash'}</p>
  <p class="footer">Thank you!</p>
  </body></html>`;
}

// ── POS Tab ─────────────────────────────────────────────────────────────────────
function POSTab() {
  const [products,  setProducts]  = useState([]);
  const [search,    setSearch]    = useState('');
  const [cart,      setCart]      = useState([]);
  const [payment,   setPayment]   = useState('cash');
  const [patient,   setPatient]   = useState('');
  const [checking,  setChecking]  = useState(false);
  const [receipt,   setReceipt]   = useState(null);
  const [err,       setErr]       = useState(null);

  useEffect(() => {
    window.api.db.products.list().then((rows) => setProducts(Array.isArray(rows) ? rows : [])).catch(console.error);
  }, []);

  const filtered = products.filter((p) =>
    p.stock > 0 && (!search || p.name.toLowerCase().includes(search.toLowerCase()))
  );

  function addToCart(product) {
    setCart((prev) => {
      const existing = prev.find((i) => i._id === product._id);
      if (existing) {
        if (existing.qty >= product.stock) return prev;
        return prev.map((i) => i._id === product._id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { _id: product._id, name: product.name, price: product.price, qty: 1, stock: product.stock }];
    });
  }

  function removeFromCart(id) { setCart((prev) => prev.filter((i) => i._id !== id)); }

  function updateQty(id, qty) {
    const n = parseInt(qty, 10);
    if (isNaN(n) || n < 1) return;
    setCart((prev) => prev.map((i) => i._id === id ? { ...i, qty: Math.min(n, i.stock) } : i));
  }

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  async function checkout() {
    if (!cart.length) return;
    setChecking(true); setErr(null);
    try {
      const now  = new Date().toISOString();
      const sale = {
        _id:           uid(),
        items:         cart,
        totalAmount:   total,
        patientName:   patient || null,
        paymentMethod: payment,
        createdAt:     now,
      };
      await window.api.db.sales.create(sale);
      for (const item of cart) {
        await window.api.db.products.adjustStock(item._id, -item.qty);
      }
      setReceipt({ sale, items: cart });
      setCart([]); setPatient('');
      // Refresh product stock
      const updated = await window.api.db.products.list();
      setProducts(Array.isArray(updated) ? updated : []);
    } catch (e) { setErr(e.message); }
    finally    { setChecking(false); }
  }

  async function printAndClose() {
    const html = buildReceiptHtml(receipt.sale, receipt.items);
    await window.api.print.receipt(html, receipt.sale._id).catch(console.error);
    setReceipt(null);
  }

  async function saveAndClose() {
    const html = buildReceiptHtml(receipt.sale, receipt.items);
    await window.api.print.pdf(html, `receipt-${receipt.sale._id}.pdf`).catch(console.error);
    setReceipt(null);
  }

  if (receipt) {
    return (
      <div style={{ maxWidth: 480, margin: '40px auto', textAlign: 'center' }}>
        <div style={{ ...S.card, marginBottom: 16 }}>
          <p style={{ fontSize: 28, margin: '0 0 8px' }}>✓</p>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--mint)' }}>Sale Complete</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>Total: <strong>{total.toFixed(2)}</strong></p>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button onClick={printAndClose} style={S.btn()}>Print Receipt</button>
          <button onClick={saveAndClose}  style={S.btn('secondary')}>Save PDF</button>
          <button onClick={() => setReceipt(null)} style={S.btn('secondary')}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, height: 'calc(100vh - 110px)' }}>
      {/* Product grid */}
      <div style={{ overflow: 'auto' }}>
        <input placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ ...S.input, marginBottom: 16 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
          {filtered.map((p) => (
            <div key={p._id} onClick={() => addToCart(p)}
              style={{ ...S.card, cursor: 'pointer', padding: 14, transition: 'border-color 0.15s' }}>
              <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{p.name}</p>
              {p.category && <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--text3)' }}>{p.category}</p>}
              <p style={{ margin: 0, fontSize: 13, color: 'var(--mint)', fontWeight: 600 }}>{p.price.toFixed(2)}</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: p.stock <= 5 ? '#f59e0b' : 'var(--text3)' }}>
                Stock: {p.stock}
              </p>
            </div>
          ))}
          {filtered.length === 0 && (
            <p style={{ color: 'var(--text3)', fontSize: 13, gridColumn: '1/-1' }}>
              {search ? 'No products match' : 'No products in stock'}
            </p>
          )}
        </div>
      </div>

      {/* Cart */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%', overflow: 'hidden' }}>
        <div style={{ ...S.card, flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
          <p style={{ margin: '0 0 12px', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
            Cart {cart.length > 0 && `(${cart.length})`}
          </p>

          {cart.length === 0 && (
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>Add products from the grid</p>
          )}

          {cart.map((item) => (
            <div key={item._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.name}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--text3)' }}>{item.price.toFixed(2)} each</p>
              </div>
              <input type="number" min={1} max={item.stock} value={item.qty}
                onChange={(e) => updateQty(item._id, e.target.value)}
                style={{ ...S.input, width: 54, padding: '6px 8px', textAlign: 'center' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 56, textAlign: 'right' }}>
                {(item.price * item.qty).toFixed(2)}
              </span>
              <button onClick={() => removeFromCart(item._id)} style={{ ...S.btn('danger'), padding: '4px 8px', fontSize: 12 }}>✕</button>
            </div>
          ))}

          <div style={{ marginTop: 'auto', paddingTop: 16 }}>
            <input placeholder="Patient name (optional)" value={patient} onChange={(e) => setPatient(e.target.value)}
              style={{ ...S.input, marginBottom: 10 }} />
            <select value={payment} onChange={(e) => setPayment(e.target.value)} style={{ ...S.input, marginBottom: 10 }}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="insurance">Insurance</option>
            </select>
          </div>
        </div>

        <div style={{ padding: '14px 0 0' }}>
          {err && <p style={{ color: '#ef4444', fontSize: 12, margin: '0 0 8px' }}>{err}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Total</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--mint)' }}>{total.toFixed(2)}</span>
          </div>
          <button onClick={checkout} disabled={!cart.length || checking}
            style={{ ...S.btn(), width: '100%', padding: '12px 0', fontSize: 15, opacity: !cart.length ? 0.5 : 1 }}>
            {checking ? 'Processing…' : 'Checkout'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inventory Tab ───────────────────────────────────────────────────────────────
const EMPTY_PRODUCT = () => ({ name: '', category: '', price: '', stock: '', unit: '' });

function InventoryTab() {
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState(null);
  const [modal,    setModal]    = useState(null); // null | 'add' | product obj
  const [form,     setForm]     = useState(EMPTY_PRODUCT());
  const [saving,   setSaving]   = useState(false);
  const [formErr,  setFormErr]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setProducts(Array.isArray(await window.api.db.products.list()) ? await window.api.db.products.list() : []); }
    catch (e) { setErr(e.message); }
    finally   { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() { setForm(EMPTY_PRODUCT()); setModal('add'); setFormErr(null); }
  function openEdit(p) { setForm({ name: p.name, category: p.category || '', price: String(p.price), stock: String(p.stock), unit: p.unit || '' }); setModal(p); setFormErr(null); }

  async function handleSave() {
    if (!form.name.trim())          { setFormErr('Name is required');     return; }
    if (isNaN(parseFloat(form.price))) { setFormErr('Invalid price');        return; }
    if (isNaN(parseInt(form.stock)))   { setFormErr('Invalid stock number'); return; }
    setSaving(true); setFormErr(null);
    try {
      const now = new Date().toISOString();
      await window.api.db.products.upsert({
        _id:       modal === 'add' ? uid() : modal._id,
        name:      form.name.trim(),
        category:  form.category.trim() || null,
        price:     parseFloat(form.price),
        stock:     parseInt(form.stock, 10),
        unit:      form.unit.trim() || null,
        updatedAt: now,
      });
      setModal(null);
      load();
    } catch (e) { setFormErr(e.message); }
    finally    { setSaving(false); }
  }

  async function handleRemove(id) {
    await window.api.db.products.remove(id).catch(console.error);
    load();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={openAdd} style={S.btn()}>+ Add Product</button>
      </div>

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ ...S.card, width: 440, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              {modal === 'add' ? 'Add Product' : 'Edit Product'}
            </h3>
            {[
              { field: 'name',     label: 'Name *',     type: 'text' },
              { field: 'category', label: 'Category',   type: 'text' },
              { field: 'price',    label: 'Price *',    type: 'number' },
              { field: 'stock',    label: 'Stock *',    type: 'number' },
              { field: 'unit',     label: 'Unit',       type: 'text' },
            ].map(({ field, label, type }) => (
              <div key={field} style={{ marginBottom: 12 }}>
                <label style={S.label}>{label}</label>
                <input type={type} style={S.input} value={form[field]}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} />
              </div>
            ))}
            {formErr && <p style={{ color: '#ef4444', fontSize: 12, margin: '0 0 10px' }}>{formErr}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={S.btn()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setModal(null)} style={S.btn('secondary')}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading && <p style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</p>}
      {err     && <p style={{ color: '#ef4444', fontSize: 13 }}>Error: {err}</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Name', 'Category', 'Price', 'Stock', 'Unit', ''].map((h) => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p._id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{p.name}</td>
              <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text2)' }}>{p.category || '—'}</td>
              <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text)' }}>{p.price.toFixed(2)}</td>
              <td style={{ padding: '10px 12px', fontSize: 13 }}>
                <span style={S.badge(p.stock === 0 ? '#ef4444' : p.stock <= 5 ? '#f59e0b' : '#0fe3b0')}>
                  {p.stock}
                </span>
              </td>
              <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text2)' }}>{p.unit || '—'}</td>
              <td style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => openEdit(p)} style={{ ...S.btn('secondary'), padding: '4px 10px', fontSize: 12 }}>Edit</button>
                  <button onClick={() => handleRemove(p._id)} style={{ ...S.btn('danger'), padding: '4px 10px', fontSize: 12 }}>Remove</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && !err && products.length === 0 && (
        <p style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>No products yet</p>
      )}
    </div>
  );
}

// ── Sales History Tab ───────────────────────────────────────────────────────────
function SalesTab() {
  const [sales,   setSales]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null);
      try { setSales(Array.isArray(await window.api.db.sales.list()) ? await window.api.db.sales.list() : []); }
      catch (e) { setErr(e.message); }
      finally   { setLoading(false); }
    })();
  }, []);

  return (
    <div>
      {loading && <p style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</p>}
      {err     && <p style={{ color: '#ef4444', fontSize: 13 }}>Error: {err}</p>}
      {!loading && !err && sales.length === 0 && (
        <p style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>No sales yet</p>
      )}

      {sales.map((s) => {
        const items = Array.isArray(s.items) ? s.items : [];
        return (
          <div key={s._id} style={{ ...S.card, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--mint)' }}>{s.totalAmount.toFixed(2)}</span>
                  <span style={S.badge('#3b82f6')}>{s.paymentMethod || 'cash'}</span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text2)' }}>
                  {items.map((i) => `${i.name} ×${i.qty}`).join(', ')}
                </p>
                {s.patientName && (
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text3)' }}>Patient: {s.patientName}</p>
                )}
              </div>
              <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
                {new Date(s.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Settings Tab ────────────────────────────────────────────────────────────────
function SettingsTab() {
  return (
    <div style={{ maxWidth: 480 }}>
      <div style={S.card}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Pharmacy Settings</h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>
          Settings sync is managed by the server admin. Contact your administrator to update pharmacy details.
        </p>
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'pos',       label: 'Point of Sale' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'sales',     label: 'Sales History' },
  { id: 'settings',  label: 'Settings' },
];

export default function PharmacyLayout() {
  const { user, logout } = useAuthStore();
  const [tab, setTab] = useState('pos');

  return (
    <div style={S.layout}>
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--mint)' }}>MediConnect</span>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>Pharmacy</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SyncBadge />
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{user?.name || user?.email}</span>
          <button onClick={logout} style={S.btn('secondary')}>Log out</button>
        </div>
      </header>

      <nav style={S.nav}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={S.tabBtn(tab === t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main style={{ ...S.content, padding: tab === 'pos' ? '16px 24px' : 24 }}>
        {tab === 'pos'       && <POSTab />}
        {tab === 'inventory' && <InventoryTab />}
        {tab === 'sales'     && <SalesTab />}
        {tab === 'settings'  && <SettingsTab />}
      </main>
    </div>
  );
}
