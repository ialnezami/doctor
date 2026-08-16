import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ScanModal            from '../../components/ScanModal';
import PrescriptionCheckView from '../../components/PrescriptionCheckView';
import client               from '../../api/client';
import {
  getPharmacyProfile, updatePharmacyProfile,
  getProducts, createProduct, deleteProduct, adjustStock,
  createSale, getSales,
} from '../../api/pharmacies';

const UNIT_OPTIONS = ['tablet', 'capsule', 'ml', 'mg', 'box', 'sachet', 'other'];
const CURRENCIES   = ['SAR', 'USD', 'EUR', 'AED', 'GBP', 'KWD', 'QAR'];

const S = {
  input: {
    width: '100%', background: 'var(--bg3,#1e293b)', border: '1px solid var(--border2,#334155)',
    borderRadius: 8, padding: '9px 12px', color: 'var(--text,#e2e8f0)',
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
  },
  label: {
    display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.07em', color: 'var(--text2,#94a3b8)', marginBottom: 6,
  },
  card: {
    background: 'var(--bg2,#0d1a2b)', border: '1px solid var(--border,#1e2d3d)',
    borderRadius: 12, padding: 20,
  },
  btn: (v) => ({
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: 600,
    background: v === 'mint'  ? 'var(--mint,#0fe3b0)'         :
                v === 'red'   ? 'rgba(244,63,94,0.15)'        :
                v === 'ghost' ? 'var(--bg3,#1e293b)'          : 'transparent',
    color:      v === 'mint'  ? '#000'                         :
                v === 'red'   ? '#f43f5e'                     : 'var(--text2,#94a3b8)',
    border:     v === 'red'   ? '1px solid rgba(244,63,94,0.3)' :
                v === 'ghost' ? '1px solid var(--border2,#334155)' : '1px solid transparent',
  }),
  th: {
    textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text2,#94a3b8)',
    borderBottom: '1px solid var(--border,#1e2d3d)',
  },
  td: { padding: '11px 14px', borderBottom: '1px solid rgba(30,45,61,0.5)', verticalAlign: 'middle' },
};

// ── Draggable Sale Modal ──────────────────────────────────────────────────────
function SaleModal({ sale, products, onClose, onComplete }) {
  const [items,   setItems]   = useState([{ productId: '', name: '', qty: 1, unitPrice: 0 }]);
  const [meta,    setMeta]    = useState({ paymentMethod: 'cash', currency: 'SAR', patientId: '', prescriptionId: '' });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(null);
  const [pos,     setPos]     = useState({ x: 60 + sale.index * 36, y: 60 + sale.index * 36 });
  const dragging   = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const startDrag = (e) => {
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  };

  const total = items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0), 0);

  const pickProduct = (idx, productId) => {
    const p = products.find(p => p._id === productId);
    setItems(prev => prev.map((it, i) => i === idx
      ? { ...it, productId, name: p?.name || '', unitPrice: p?.price || 0 }
      : it));
  };

  const submit = async () => {
    setError('');
    const valid = items.filter(i => i.name.trim());
    if (!valid.length) { setError('Add at least one item'); return; }
    setLoading(true);
    try {
      const result = await createSale({
        items: valid.map(i => ({ name: i.name, qty: parseInt(i.qty), unitPrice: parseFloat(i.unitPrice) })),
        paymentMethod: meta.paymentMethod,
        totalAmount: total,
        currency: meta.currency,
        ...(meta.patientId      && { patientId:      meta.patientId }),
        ...(meta.prescriptionId && { prescriptionId: meta.prescriptionId }),
      });
      setDone(result);
      onComplete(result);
    } catch (e) {
      setError(e?.message || 'Sale failed');
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', left: pos.x, top: pos.y, zIndex: 1000,
      width: 500, background: 'var(--bg2,#0d1a2b)',
      border: '1px solid var(--border,#1e2d3d)', borderRadius: 14,
      boxShadow: '0 12px 48px rgba(0,0,0,0.6)', overflow: 'hidden',
      userSelect: 'none',
    }}>
      {/* Drag handle header */}
      <div onMouseDown={startDrag} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '11px 16px', background: 'var(--bg3,#1e293b)',
        borderBottom: '1px solid var(--border,#1e2d3d)', cursor: 'grab',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>💊 Sale #{sale.id}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
      </div>

      <div style={{ padding: 16, maxHeight: '72vh', overflowY: 'auto' }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Sale Complete</div>
            <div style={{ fontSize: 13, color: 'var(--mint,#0fe3b0)', marginBottom: 4 }}>
              {done.totalAmount?.toFixed(2)} {done.currency}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 20 }}>Receipt #{done.receiptNumber}</div>
            <button style={{ ...S.btn('mint'), padding: '8px 24px' }} onClick={onClose}>Close</button>
          </div>
        ) : (
          <>
            {/* Product rows */}
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text2)', marginBottom: 8 }}>Items</div>
            {items.map((item, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 90px 30px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <select style={S.input} value={item.productId} onChange={e => pickProduct(idx, e.target.value)}>
                  <option value="">— pick product —</option>
                  {products.map(p => (
                    <option key={p._id} value={p._id}>{p.name} ({p.stockQty} left)</option>
                  ))}
                </select>
                <input placeholder="Qty" type="number" min="1" style={S.input} value={item.qty}
                  onChange={e => setItems(ps => ps.map((p, i) => i === idx ? { ...p, qty: e.target.value } : p))} />
                <input placeholder="Price" type="number" min="0" step="0.01" style={S.input} value={item.unitPrice}
                  onChange={e => setItems(ps => ps.map((p, i) => i === idx ? { ...p, unitPrice: e.target.value } : p))} />
                <button onClick={() => setItems(ps => ps.filter((_, i) => i !== idx))}
                  style={{ ...S.btn('red'), padding: '7px 8px' }}>✕</button>
              </div>
            ))}
            <button onClick={() => setItems(ps => [...ps, { productId: '', name: '', qty: 1, unitPrice: 0 }])}
              style={{ ...S.btn('ghost'), fontSize: 12, marginBottom: 14 }}>+ Add Item</button>

            {/* Meta */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label style={S.label}>Payment</label>
                <select style={S.input} value={meta.paymentMethod} onChange={e => setMeta(m => ({ ...m, paymentMethod: e.target.value }))}>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                </select>
              </div>
              <div>
                <label style={S.label}>Currency</label>
                <select style={S.input} value={meta.currency} onChange={e => setMeta(m => ({ ...m, currency: e.target.value }))}>
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Patient ID <span style={{ fontWeight: 400, textTransform: 'none' }}>(opt.)</span></label>
                <input style={S.input} value={meta.patientId} onChange={e => setMeta(m => ({ ...m, patientId: e.target.value }))} />
              </div>
              <div>
                <label style={S.label}>Rx ID <span style={{ fontWeight: 400, textTransform: 'none' }}>(opt.)</span></label>
                <input style={S.input} value={meta.prescriptionId} onChange={e => setMeta(m => ({ ...m, prescriptionId: e.target.value }))} />
              </div>
            </div>

            {/* Total */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg3,#1e293b)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>Total</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--mint,#0fe3b0)' }}>{total.toFixed(2)} {meta.currency}</span>
            </div>

            {error && <div style={{ color: '#f43f5e', fontSize: 12, marginBottom: 10 }}>{error}</div>}
            <button style={{ ...S.btn('mint'), width: '100%', padding: '11px', opacity: loading ? 0.6 : 1 }}
              disabled={loading} onClick={submit}>
              {loading ? 'Processing…' : 'Complete Sale'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Add Product Modal ─────────────────────────────────────────────────────────
function AddProductModal({ onClose, onAdded }) {
  const [form,    setForm]    = useState({ name: '', barcode: '', unit: 'tablet', price: '', stockQty: 0, lowStockThreshold: 10, description: '', currency: 'SAR' });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (ev) => {
    ev.preventDefault();
    if (!form.name || !form.barcode || form.price === '') { setError('Name, barcode and price are required'); return; }
    setLoading(true);
    try {
      const p = await createProduct({ ...form, price: parseFloat(form.price), stockQty: parseInt(form.stockQty) || 0 });
      onAdded(p);
    } catch (e) {
      setError(e?.message || 'Failed to add product');
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'grid', placeItems: 'center', zIndex: 900 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...S.card, width: 'min(540px, 94vw)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Add Product</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={S.label}>Name *</label>
              <input style={S.input} value={form.name} onChange={set('name')} placeholder="Paracetamol 500mg" />
            </div>
            <div>
              <label style={S.label}>Barcode *</label>
              <input style={S.input} value={form.barcode} onChange={set('barcode')} placeholder="1234567890" />
            </div>
            <div>
              <label style={S.label}>Price *</label>
              <input type="number" min="0" step="0.01" style={S.input} value={form.price} onChange={set('price')} placeholder="12.50" />
            </div>
            <div>
              <label style={S.label}>Currency</label>
              <select style={S.input} value={form.currency} onChange={set('currency')}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Unit</label>
              <select style={S.input} value={form.unit} onChange={set('unit')}>
                {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Initial Stock</label>
              <input type="number" min="0" style={S.input} value={form.stockQty} onChange={set('stockQty')} />
            </div>
            <div>
              <label style={S.label}>Low Stock Alert</label>
              <input type="number" min="0" style={S.input} value={form.lowStockThreshold} onChange={set('lowStockThreshold')} />
            </div>
            <div>
              <label style={S.label}>Description</label>
              <input style={S.input} value={form.description} onChange={set('description')} placeholder="Optional" />
            </div>
          </div>
          {error && <div style={{ color: '#f43f5e', fontSize: 12, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={S.btn('ghost')}>Cancel</button>
            <button type="submit" style={{ ...S.btn('mint'), opacity: loading ? 0.6 : 1 }} disabled={loading}>
              {loading ? 'Adding…' : 'Add Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function PharmacyDashboardPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'pos';
  const setActiveTab = (tab) => setSearchParams({ tab });
  const [approved,       setApproved]       = useState(null);
  const [profile,        setProfile]        = useState({ pharmacyName: '', licenseNumber: '', address: '' });
  const [products,       setProducts]       = useState([]);
  const [sales,          setSales]          = useState([]);
  const [openSales,      setOpenSales]      = useState([]);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [profForm,       setProfForm]       = useState({ pharmacyName: '', licenseNumber: '', address: '' });
  const [profSaving,     setProfSaving]     = useState(false);
  const [profMsg,        setProfMsg]        = useState('');
  const [scanning,    setScanning]    = useState(false);
  const [scanResult,  setScanResult]  = useState(null);
  const [scanError,   setScanError]   = useState('');
  const saleCounter = useRef(1);

  const handleScan = async (decodedText) => {
    setScanning(false);
    setScanError('');
    try {
      const url = new URL(decodedText);
      const token = url.pathname.split('/s/')[1];
      if (!token) throw new Error('invalid');
      const data = await client.get(`/share/${token}`);
      if (data.resourceType !== 'prescription') throw new Error('not a prescription');
      setScanResult({ prescription: data.resource });
    } catch {
      setScanError('رمز QR غير صالح أو لا يشير إلى وصفة طبية');
    }
  };

  useEffect(() => {
    getPharmacyProfile()
      .then(p => {
        setApproved(p.isApproved);
        setProfile(p);
        setProfForm({ pharmacyName: p.pharmacyName || '', licenseNumber: p.licenseNumber || '', address: p.address || '' });
      })
      .catch(() => setApproved(false));
  }, []);

  useEffect(() => {
    if (!approved) return;
    getProducts().then(r => setProducts(r.products || [])).catch(() => {});
    getSales().then(r => setSales(r.sales || [])).catch(() => {});
  }, [approved]);

  const openNewSale = () => {
    const id = saleCounter.current++;
    setOpenSales(prev => [...prev, { id, index: prev.length }]);
  };

  const closeSale    = (id) => setOpenSales(prev => prev.filter(s => s.id !== id));
  const completeSale = (id, sale) => { setSales(prev => [sale, ...prev]); closeSale(id); };

  const handleAdjustStock = async (id, delta) => {
    try {
      const updated = await adjustStock(id, delta);
      setProducts(ps => ps.map(p => p._id === id ? updated : p));
    } catch (e) { alert(e?.message || 'Stock adjust failed'); }
  };

  const handleDeleteProduct = async (id) => {
    if (!confirm(t('pharmacy.inventory.deleteConfirm'))) return;
    try {
      await deleteProduct(id);
      setProducts(ps => ps.filter(p => p._id !== id));
    } catch (e) { alert(e?.message || 'Delete failed'); }
  };

  const saveProfile = async () => {
    setProfMsg(''); setProfSaving(true);
    try {
      const updated = await updatePharmacyProfile(profForm);
      setProfile(updated);
      setProfMsg(t('pharmacy.settings.saved'));
    } catch (e) {
      setProfMsg(e?.message || 'Save failed');
    } finally { setProfSaving(false); }
  };

  if (approved === null) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Loading…</div>;

  if (!approved) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
      <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>{t('pharmacy.pendingTitle')}</div>
      <div style={{ fontSize: 13, color: 'var(--text2)' }}>{t('pharmacy.pendingMessage')}</div>
    </div>
  );

  const lowStock = products.filter(p => p.stockQty <= p.lowStockThreshold);

  const TABS = [
    { key: 'pos',       label: t('pharmacy.tabs.pos') },
    { key: 'inventory', label: t('pharmacy.tabs.inventory') },
    { key: 'sales',     label: t('pharmacy.tabs.sales') },
    { key: 'profile',   label: t('pharmacy.tabs.settings') },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      {/* Draggable sale modals */}
      {openSales.map(sale => (
        <SaleModal
          key={sale.id}
          sale={sale}
          products={products}
          onClose={() => closeSale(sale.id)}
          onComplete={(s) => completeSale(sale.id, s)}
        />
      ))}

      {/* Add product modal */}
      {showAddProduct && (
        <AddProductModal
          onClose={() => setShowAddProduct(false)}
          onAdded={(p) => { setProducts(prev => [p, ...prev]); setShowAddProduct(false); }}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 600 }}>
            {profile.pharmacyName || t('pharmacy.dashboard')}
          </div>
          {lowStock.length > 0 && (
            <div style={{ fontSize: 12, color: '#f43f5e', marginTop: 4 }}>
              {t('pharmacy.lowStock', { count: lowStock.length })}
            </div>
          )}
        </div>
        {activeTab === 'pos' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={openNewSale} style={{ ...S.btn('mint'), padding: '9px 22px' }}>
              {t('pharmacy.pos.newSale')}
            </button>
            <button
              onClick={() => { setScanResult(null); setScanError(''); setScanning(true); }}
              style={{ ...S.btn('ghost'), padding: '9px 22px' }}
            >
              مسح وصفة طبية
            </button>
            {scanError && <p style={{ color: 'var(--rose)', fontSize: 12, margin: 0 }}>{scanError}</p>}
          </div>
        )}
        {activeTab === 'inventory' && (
          <button onClick={() => setShowAddProduct(true)} style={{ ...S.btn('mint'), padding: '9px 22px' }}>
            {t('pharmacy.inventory.add')}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid var(--border,#1e2d3d)' }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            border: 'none', background: 'none', marginBottom: -1,
            color:        activeTab === tab.key ? 'var(--mint,#0fe3b0)' : 'var(--text2,#94a3b8)',
            borderBottom: activeTab === tab.key ? '2px solid var(--mint,#0fe3b0)' : '2px solid transparent',
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* POS Tab */}
      {activeTab === 'pos' && (
        openSales.length === 0 ? (
          <div style={{ ...S.card, textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>🛒</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{t('pharmacy.pos.empty')}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>
              {t('pharmacy.pos.emptyHint')}
            </div>
            <button onClick={openNewSale} style={{ ...S.btn('mint'), padding: '10px 28px' }}>{t('pharmacy.pos.newSale')}</button>
          </div>
        ) : (
          <div style={{ ...S.card, padding: '14px 18px' }}>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>
              {t('pharmacy.pos.windows', { count: openSales.length })}
              <span style={{ fontSize: 12, marginLeft: 8, opacity: 0.6 }}>{t('pharmacy.pos.dragHint')}</span>
            </div>
            <button onClick={openNewSale} style={{ ...S.btn('ghost'), fontSize: 12, marginTop: 10 }}>{t('pharmacy.pos.anotherSale')}</button>
          </div>
        )
      )}

      {/* Inventory Tab */}
      {activeTab === 'inventory' && (
        products.length === 0 ? (
          <div style={{ ...S.card, textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>{t('pharmacy.inventory.empty')}</div>
            <button onClick={() => setShowAddProduct(true)} style={{ ...S.btn('mint'), padding: '9px 22px' }}>{t('pharmacy.inventory.addFirst')}</button>
          </div>
        ) : (
          <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {[
                    t('pharmacy.inventory.colProduct'),
                    t('pharmacy.inventory.colBarcode'),
                    t('pharmacy.inventory.colUnit'),
                    t('pharmacy.inventory.colPrice'),
                    t('pharmacy.inventory.colStock'),
                    t('pharmacy.inventory.colActions'),
                  ].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map(p => {
                  const low = p.stockQty <= p.lowStockThreshold;
                  return (
                    <tr key={p._id}>
                      <td style={S.td}>
                        <div style={{ fontWeight: 500 }}>{p.name}</div>
                        {p.description && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{p.description}</div>}
                      </td>
                      <td style={{ ...S.td, fontSize: 12, color: 'var(--text2)' }}>#{p.barcode}</td>
                      <td style={{ ...S.td, fontSize: 12, color: 'var(--text2)' }}>{p.unit}</td>
                      <td style={{ ...S.td, fontWeight: 500 }}>{p.price} {p.currency}</td>
                      <td style={S.td}>
                        <span style={{ color: low ? '#f43f5e' : 'var(--mint,#0fe3b0)', fontWeight: 700 }}>{p.stockQty}</span>
                        {low && <span style={{ fontSize: 10, fontWeight: 700, color: '#f43f5e', marginLeft: 6, background: 'rgba(244,63,94,0.12)', padding: '1px 5px', borderRadius: 4 }}>{t('pharmacy.inventory.low')}</span>}
                      </td>
                      <td style={S.td}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button onClick={() => handleAdjustStock(p._id, -1)} style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 15 }}>−</button>
                          <button onClick={() => handleAdjustStock(p._id,  1)} style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 15 }}>+</button>
                          <button onClick={() => handleDeleteProduct(p._id)} style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{t('pharmacy.inventory.delete')}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Sales History Tab */}
      {activeTab === 'sales' && (
        sales.length === 0 ? (
          <div style={{ ...S.card, textAlign: 'center', padding: 40, color: 'var(--text2)', fontSize: 13 }}>{t('pharmacy.sales.empty')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sales.map(s => (
              <div key={s._id} style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t('pharmacy.sales.receipt', { number: s.receiptNumber })}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>
                    {t('pharmacy.sales.items', { count: s.items?.length || 0 })} · {s.paymentMethod}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--mint,#0fe3b0)' }}>{s.totalAmount?.toFixed(2)} {s.currency}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{new Date(s.createdAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Settings Tab */}
      {activeTab === 'profile' && (
        <div style={S.card}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>{t('pharmacy.settings.title')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 480 }}>
            {[
              ['pharmacyName', t('pharmacy.settings.name')],
              ['licenseNumber', t('pharmacy.settings.license')],
              ['address',       t('pharmacy.settings.address')],
            ].map(([k, l]) => (
              <div key={k}>
                <label style={S.label}>{l}</label>
                <input style={S.input} value={profForm[k]} onChange={e => setProfForm(f => ({ ...f, [k]: e.target.value }))} />
              </div>
            ))}
            {profMsg && (
              <p style={{ fontSize: 13, color: profMsg === t('pharmacy.settings.saved') ? 'var(--mint)' : '#f43f5e', margin: 0 }}>
                {profMsg}
              </p>
            )}
            <div>
              <button style={{ ...S.btn('mint'), padding: '10px 24px', opacity: profSaving ? 0.6 : 1 }} disabled={profSaving} onClick={saveProfile}>
                {profSaving ? t('pharmacy.settings.saving') : t('pharmacy.settings.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {scanning && (
        <ScanModal onScan={handleScan} onClose={() => setScanning(false)} />
      )}

      {scanResult && (
        <div
          onClick={() => setScanResult(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
            display: 'grid', placeItems: 'center', zIndex: 1100,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            dir="rtl"
            style={{
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 14, padding: 24, maxWidth: 420, width: '90%',
            }}
          >
            <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 16px' }}>الوصفة الطبية</p>
            <PrescriptionCheckView
              prescription={scanResult.prescription}
              products={products}
              onDispense={() => setScanResult(null)}
            />
            <button
              onClick={() => setScanResult(null)}
              style={{
                marginTop: 12, width: '100%', background: 'var(--bg3)',
                border: '1px solid var(--border)', borderRadius: 8,
                padding: '7px 0', cursor: 'pointer', fontSize: 13,
              }}
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
