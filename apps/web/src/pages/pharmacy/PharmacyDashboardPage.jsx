import { useState, useEffect } from 'react';
import {
  getPharmacyProfile, updatePharmacyProfile,
  getProducts, createProduct, deleteProduct, adjustStock,
  createSale, getSales,
} from '../../api/pharmacies';

const UNIT_OPTIONS = ['tablet', 'capsule', 'ml', 'mg', 'box', 'sachet', 'other'];

const inputStyle = {
  width: '100%', background: 'var(--bg3)', border: '1px solid var(--border2)',
  borderRadius: 'var(--r-sm)', padding: '10px 13px', color: 'var(--text)',
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
};
const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.07em', color: 'var(--text2)', marginBottom: 6,
};
const btnStyle = {
  background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)',
  padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const cardStyle = {
  background: 'var(--card)', border: '1px solid var(--border)',
  borderRadius: 'var(--r)', padding: 20, marginBottom: 16,
};

export default function PharmacyDashboardPage() {
  const [activeTab, setActiveTab] = useState('pos');
  const [approved,  setApproved]  = useState(null);
  const [profile,   setProfile]   = useState({ pharmacyName: '', licenseNumber: '', address: '' });
  const [products,  setProducts]  = useState([]);
  const [sales,     setSales]     = useState([]);

  // POS state
  const [posItems,   setPosItems]   = useState([{ name: '', qty: 1, unitPrice: 0 }]);
  const [posMeta,    setPosMeta]    = useState({ patientId: '', prescriptionId: '', paymentMethod: 'cash', currency: 'SAR' });
  const [posError,   setPosError]   = useState('');
  const [posLoading, setPosLoading] = useState(false);

  // Inventory form state
  const [invForm,    setInvForm]    = useState({ name: '', barcode: '', unit: 'tablet', price: '', stockQty: 0, lowStockThreshold: 10, description: '', currency: 'SAR' });
  const [invError,   setInvError]   = useState('');
  const [invLoading, setInvLoading] = useState(false);

  // Profile form state
  const [profForm,    setProfForm]    = useState({ pharmacyName: '', licenseNumber: '', address: '' });
  const [profSaving,  setProfSaving]  = useState(false);
  const [profMsg,     setProfMsg]     = useState('');

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

  if (approved === null) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Loading…</div>;

  if (!approved) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
      <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>Pending Admin Approval</div>
      <div style={{ fontSize: 13, color: 'var(--text2)' }}>Your pharmacy account is under review. You can use all features once approved.</div>
    </div>
  );

  const totalAmount = posItems.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0), 0);

  const submitSale = async () => {
    setPosError('');
    const items = posItems.filter(i => i.name.trim());
    if (!items.length) { setPosError('Add at least one item'); return; }
    setPosLoading(true);
    try {
      const sale = await createSale({
        items: items.map(i => ({ name: i.name, qty: parseInt(i.qty), unitPrice: parseFloat(i.unitPrice) })),
        paymentMethod: posMeta.paymentMethod,
        totalAmount,
        currency: posMeta.currency,
        ...(posMeta.patientId      && { patientId:      posMeta.patientId }),
        ...(posMeta.prescriptionId && { prescriptionId: posMeta.prescriptionId }),
      });
      setSales(s => [sale, ...s]);
      setPosItems([{ name: '', qty: 1, unitPrice: 0 }]);
      setPosMeta(m => ({ ...m, patientId: '', prescriptionId: '' }));
    } catch (e) {
      setPosError(e?.message || 'Sale failed');
    } finally { setPosLoading(false); }
  };

  const submitProduct = async () => {
    setInvError('');
    if (!invForm.name || !invForm.barcode || invForm.price === '') { setInvError('Name, barcode and price are required'); return; }
    setInvLoading(true);
    try {
      const p = await createProduct({ ...invForm, price: parseFloat(invForm.price), stockQty: parseInt(invForm.stockQty) || 0 });
      setProducts(ps => [p, ...ps]);
      setInvForm({ name: '', barcode: '', unit: 'tablet', price: '', stockQty: 0, lowStockThreshold: 10, description: '', currency: 'SAR' });
    } catch (e) {
      setInvError(e?.message || 'Failed to add product');
    } finally { setInvLoading(false); }
  };

  const handleAdjustStock = async (id, delta) => {
    try {
      const updated = await adjustStock(id, delta);
      setProducts(ps => ps.map(p => p._id === id ? updated : p));
    } catch (e) { alert(e?.message || 'Stock adjust failed'); }
  };

  const handleDeleteProduct = async (id) => {
    if (!confirm('Delete this product?')) return;
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
      setProfMsg('Profile saved.');
    } catch (e) {
      setProfMsg(e?.message || 'Save failed');
    } finally { setProfSaving(false); }
  };

  const tabs = [
    { key: 'pos',       label: '💊 POS' },
    { key: 'inventory', label: '📦 Inventory' },
    { key: 'profile',   label: '👤 Profile' },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 780 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, marginBottom: 20 }}>
        {profile.pharmacyName || 'Pharmacy Dashboard'}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
            background: 'none', color: activeTab === tab.key ? 'var(--accent)' : 'var(--text2)',
            borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1,
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* POS Tab */}
      {activeTab === 'pos' && (
        <div>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>New Sale</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Patient ID (optional)</label>
                <input style={inputStyle} value={posMeta.patientId} onChange={e => setPosMeta(m => ({ ...m, patientId: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Prescription ID (optional)</label>
                <input style={inputStyle} value={posMeta.prescriptionId} onChange={e => setPosMeta(m => ({ ...m, prescriptionId: e.target.value }))} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Payment Method</label>
              <select style={{ ...inputStyle, width: 'auto' }} value={posMeta.paymentMethod} onChange={e => setPosMeta(m => ({ ...m, paymentMethod: e.target.value }))}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
              </select>
            </div>

            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text2)', marginBottom: 8 }}>Items</div>
            {posItems.map((item, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 36px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input placeholder="Name" style={inputStyle} value={item.name} onChange={e => setPosItems(ps => ps.map((p, i) => i === idx ? { ...p, name: e.target.value } : p))} />
                <input placeholder="Qty" type="number" min="1" style={inputStyle} value={item.qty} onChange={e => setPosItems(ps => ps.map((p, i) => i === idx ? { ...p, qty: e.target.value } : p))} />
                <input placeholder="Unit price" type="number" min="0" step="0.01" style={inputStyle} value={item.unitPrice} onChange={e => setPosItems(ps => ps.map((p, i) => i === idx ? { ...p, unitPrice: e.target.value } : p))} />
                <button onClick={() => setPosItems(ps => ps.filter((_, i) => i !== idx))} style={{ background: 'var(--rose)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px', cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
            ))}
            <button onClick={() => setPosItems(ps => [...ps, { name: '', qty: 1, unitPrice: 0 }])} style={{ ...btnStyle, background: 'var(--bg3)', color: 'var(--text)', marginBottom: 14 }}>+ Add Item</button>

            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Total: {totalAmount.toFixed(2)} {posMeta.currency}</div>

            {posError && <p style={{ color: 'var(--rose)', fontSize: 13, marginBottom: 10 }}>{posError}</p>}
            <button style={{ ...btnStyle, opacity: posLoading ? 0.6 : 1 }} disabled={posLoading} onClick={submitSale}>
              {posLoading ? 'Processing…' : 'Complete Sale'}
            </button>
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Recent Sales</div>
          {sales.length === 0 && <p style={{ fontSize: 12, color: 'var(--text3)' }}>No sales yet.</p>}
          {sales.map(s => (
            <div key={s._id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '12px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>#{s.receiptNumber}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{s.items?.length} item(s) · {s.paymentMethod}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.totalAmount?.toFixed(2)} {s.currency}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{new Date(s.createdAt).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inventory Tab */}
      {activeTab === 'inventory' && (
        <div>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Add Product</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              {[['name', 'Name'], ['barcode', 'Barcode'], ['price', 'Price'], ['currency', 'Currency']].map(([k, l]) => (
                <div key={k}>
                  <label style={labelStyle}>{l}</label>
                  <input style={inputStyle} value={invForm[k]} onChange={e => setInvForm(f => ({ ...f, [k]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label style={labelStyle}>Unit</label>
                <select style={{ ...inputStyle }} value={invForm.unit} onChange={e => setInvForm(f => ({ ...f, unit: e.target.value }))}>
                  {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Initial Stock</label>
                <input type="number" min="0" style={inputStyle} value={invForm.stockQty} onChange={e => setInvForm(f => ({ ...f, stockQty: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Low Stock Threshold</label>
                <input type="number" min="0" style={inputStyle} value={invForm.lowStockThreshold} onChange={e => setInvForm(f => ({ ...f, lowStockThreshold: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <input style={inputStyle} value={invForm.description} onChange={e => setInvForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            {invError && <p style={{ color: 'var(--rose)', fontSize: 13, marginBottom: 10 }}>{invError}</p>}
            <button style={{ ...btnStyle, opacity: invLoading ? 0.6 : 1 }} disabled={invLoading} onClick={submitProduct}>
              {invLoading ? 'Adding…' : 'Add Product'}
            </button>
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Inventory ({products.length})</div>
          {products.length === 0 && <p style={{ fontSize: 12, color: 'var(--text3)' }}>No products yet.</p>}
          {products.map(p => (
            <div key={p._id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '12px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>#{p.barcode} · {p.unit} · {p.price} {p.currency}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: p.stockQty <= p.lowStockThreshold ? 'var(--rose)' : 'var(--text)' }}>
                  {p.stockQty} left
                </span>
                <button onClick={() => handleAdjustStock(p._id, -1)} style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13 }}>−</button>
                <button onClick={() => handleAdjustStock(p._id,  1)} style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13 }}>+</button>
                <button onClick={() => handleDeleteProduct(p._id)} style={{ background: 'none', border: 'none', color: 'var(--rose)', cursor: 'pointer', fontSize: 13 }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Pharmacy Profile</div>
          {[['pharmacyName', 'Pharmacy Name'], ['licenseNumber', 'License Number'], ['address', 'Address']].map(([k, l]) => (
            <div key={k} style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{l}</label>
              <input style={inputStyle} value={profForm[k]} onChange={e => setProfForm(f => ({ ...f, [k]: e.target.value }))} />
            </div>
          ))}
          {profMsg && <p style={{ fontSize: 13, marginBottom: 10, color: profMsg.includes('saved') ? 'var(--mint)' : 'var(--rose)' }}>{profMsg}</p>}
          <button style={{ ...btnStyle, opacity: profSaving ? 0.6 : 1 }} disabled={profSaving} onClick={saveProfile}>
            {profSaving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      )}
    </div>
  );
}
