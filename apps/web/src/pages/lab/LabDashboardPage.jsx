import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import client from '../../api/client';
import Button from '../../components/ui/Button';
import CreatePatientModal from '../../components/CreatePatientModal';
import ScanModal from '../../components/ScanModal';

const LAB_FIELD_KEYS = ['patientId','labName','testName','result'];

export default function LabDashboardPage() {
  const { t } = useTranslation();
  const [tab, setTab]             = useState('upload');
  const [uploads, setUploads]     = useState([]);
  const [form, setForm]           = useState({ patientId:'', labName:'', testName:'', result:'' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');
  const [approved, setApproved]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [scanning, setScanning]   = useState(false);
  const [scanError, setScanError] = useState('');
  const [orders, setOrders]       = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [activeResultId, setActiveResultId] = useState(null);
  const [draftTests, setDraftTests] = useState([]);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    client.get('/lab-results/my-uploads')
      .then(data => { setUploads(data); setApproved(true); })
      .catch(e => { if (e?.message?.includes('pending approval')) setApproved(false); });
  }, []);

  const loadOrders = () => {
    setOrdersLoading(true);
    client.get('/lab-results/my-uploads')
      .then(data => setOrders((data.uploads || data).filter(r => r.prescriptionId)))
      .catch(() => {})
      .finally(() => setOrdersLoading(false));
  };

  useEffect(() => { loadOrders(); }, []);

  const handleOrderScan = async (decodedText) => {
    setScanning(false); setScanError('');
    try {
      const url = new URL(decodedText);
      const shareToken = url.pathname.split('/s/')[1];
      if (!shareToken) throw new Error('invalid');
      await client.post('/lab-results/from-prescription', { shareToken });
      loadOrders();
    } catch (err) {
      setScanError(err?.message || 'تعذر قبول الطلب — تحقق من رمز QR');
    }
  };

  const handleStart = async (id) => {
    await client.patch(`/lab-results/${id}/status`, { status: 'processing' });
    loadOrders();
  };

  const handlePublish = async (id) => {
    if (draftTests.some(t => !t.value.trim())) return;
    setPublishing(true);
    try {
      await client.patch(`/lab-results/${id}/status`, { status: 'ready', tests: draftTests });
      setActiveResultId(null);
      setDraftTests([]);
      loadOrders();
    } catch (err) {
      setScanError(err?.message || 'تعذر نشر النتائج');
    } finally {
      setPublishing(false);
    }
  };

  const submit = async () => {
    if (!form.patientId || !form.labName || !form.testName) {
      setError(t('lab.fields.patientId') + ', ' + t('lab.fields.labName') + ', ' + t('lab.fields.testName'));
      return;
    }
    setSubmitting(true); setError('');
    try {
      const result = await client.post('/lab-results', {
        patientId: form.patientId,
        labName: form.labName,
        tests: [{ name: form.testName, value: form.result, flag: 'normal' }],
        status: 'ready',
      });
      setUploads(u => [result, ...u]);
      setForm(f => ({ ...f, patientId:'', labName:'', testName:'', result:'' }));
    } catch (e) {
      setError(e.message || 'Upload failed');
    } finally { setSubmitting(false); }
  };

  if (!approved) {
    return (
      <div style={{ padding:40, textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>⏳</div>
        <div style={{ fontSize:18, fontWeight:500, marginBottom:8 }}>{t('lab.pendingTitle')}</div>
        <div style={{ fontSize:13, color:'var(--text2)' }}>{t('lab.pendingDesc')}</div>
      </div>
    );
  }

  return (
    <div style={{ padding:26, maxWidth:700 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500 }}>{t('lab.uploadTitle')}</div>
        <button
          onClick={() => setShowModal(true)}
          style={{ padding:'8px 16px', borderRadius:8, border:'none', cursor:'pointer', background:'var(--mint,#0fe3b0)', color:'#000', fontWeight:600, fontSize:13 }}
        >
          + Add Patient
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:'1px solid var(--border)' }}>
        {[['upload', t('lab.uploadTitle')], ['orders', 'الطلبات']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{
              padding:'7px 18px', borderRadius:'8px 8px 0 0', border:'none', cursor:'pointer',
              fontSize:13, fontWeight:500, background:'none',
              color: tab === key ? 'var(--mint)' : 'var(--text2)',
              borderBottom: tab === key ? '2px solid var(--mint)' : '2px solid transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'upload' && (
        <>
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:22, marginBottom:28 }}>
            {LAB_FIELD_KEYS.map(k => (
              <div key={k} style={{ marginBottom:14 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', marginBottom:6 }}>
                  {t(`lab.fields.${k}`)}
                </label>
                <input value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                  style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'10px 13px', color:'var(--text)', fontSize:13, outline:'none', boxSizing:'border-box' }} />
              </div>
            ))}
            {error && <p style={{ color:'var(--rose)', fontSize:13, marginBottom:12 }}>{error}</p>}
            <Button onClick={submit} disabled={submitting} style={{ padding:'10px 24px' }}>
              {submitting ? t('lab.uploading') : t('lab.upload')}
            </Button>
          </div>

          <div style={{ fontSize:14, fontWeight:600, marginBottom:12 }}>{t('lab.myUploads')}</div>
          {uploads.length === 0 && <p style={{ fontSize:13, color:'var(--text3)' }}>{t('lab.noUploads')}</p>}
          {uploads.map(u => (
            <div key={u._id} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', padding:'12px 16px', marginBottom:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:500 }}>{u.labName}</div>
                  {u.tests?.map((test, i) => (
                    <div key={i} style={{ fontSize:12, color:'var(--text2)', marginTop:4 }}>
                      <span style={{ fontWeight:500 }}>{test.name}</span>
                      {test.value && <span style={{ marginLeft:8, color:'var(--text)' }}>{test.value}</span>}
                      {test.flag && test.flag !== 'normal' && (
                        <span style={{ marginLeft:6, color:'var(--rose)', fontWeight:600, fontSize:11 }}>{test.flag.toUpperCase()}</span>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ textAlign:'right', flexShrink:0, marginLeft:16 }}>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>{new Date(u.createdAt).toLocaleDateString()}</div>
                  {u.status && <div style={{ fontSize:10, color:'var(--text3)', marginTop:2, textTransform:'uppercase' }}>{u.status}</div>}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === 'orders' && (
        <div dir="rtl">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <h2 style={{ fontSize:16, fontWeight:700, margin:0 }}>طلبات التحليل</h2>
            <button
              onClick={() => { setScanError(''); setScanning(true); }}
              style={{
                background:'var(--primary)', color:'#fff', border:'none',
                borderRadius:8, padding:'7px 16px', cursor:'pointer', fontSize:13, fontWeight:600,
              }}
            >
              مسح وصفة طبية
            </button>
          </div>

          {scanError && <p style={{ color:'var(--rose)', fontSize:13, marginBottom:8 }}>{scanError}</p>}
          {ordersLoading && <p style={{ color:'var(--text2)', fontSize:13 }}>جاري التحميل...</p>}

          {orders.length === 0 && !ordersLoading && (
            <p style={{ color:'var(--text3)', fontSize:13, textAlign:'center', marginTop:32 }}>
              لا توجد طلبات بعد — امسح وصفة طبية لبدء التحليل
            </p>
          )}

          <div style={{ display:'grid', gap:12 }}>
            {orders.map(order => (
              <div key={order._id} style={{
                background:'var(--bg2)', border:'1px solid var(--border)',
                borderRadius:10, padding:16,
              }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontWeight:600, fontSize:14 }}>{order.labName}</span>
                  <span style={{
                    fontSize:11, padding:'2px 8px', borderRadius:12,
                    background: order.status === 'ready' ? 'rgba(22,163,74,.15)' : order.status === 'processing' ? 'rgba(245,158,11,.15)' : 'rgba(99,102,241,.15)',
                    color: order.status === 'ready' ? 'var(--mint)' : order.status === 'processing' ? '#f59e0b' : 'var(--primary)',
                  }}>
                    {order.status === 'ready' ? 'تم النشر ✓' : order.status === 'processing' ? 'قيد التحليل' : 'معلق'}
                  </span>
                </div>

                <div style={{ fontSize:12, color:'var(--text2)', marginBottom:10 }}>
                  {order.tests?.map((t, i) => (
                    <span key={i} style={{ marginLeft:8 }}>{t.name}{t.value ? `: ${t.value}` : ''}</span>
                  ))}
                </div>

                {order.status === 'pending' && (
                  <button
                    onClick={() => handleStart(order._id)}
                    style={{
                      background:'var(--primary)', color:'#fff', border:'none',
                      borderRadius:7, padding:'6px 14px', cursor:'pointer', fontSize:13,
                    }}
                  >
                    بدء التحليل
                  </button>
                )}

                {order.status === 'processing' && activeResultId !== order._id && (
                  <button
                    onClick={() => {
                      setActiveResultId(order._id);
                      setDraftTests(order.tests.map(t => ({ ...t, value: t.value || '', flag: t.flag || 'normal' })));
                    }}
                    style={{
                      background:'var(--mint)', color:'#000', border:'none',
                      borderRadius:7, padding:'6px 14px', cursor:'pointer', fontSize:13, fontWeight:600,
                    }}
                  >
                    إدخال النتائج
                  </button>
                )}

                {order.status === 'processing' && activeResultId === order._id && (
                  <div style={{ marginTop:10 }}>
                    {draftTests.map((t, i) => (
                      <div key={i} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
                        <span style={{ fontSize:13, flex:1 }}>{t.name}</span>
                        <input
                          value={t.value}
                          onChange={e => setDraftTests(d => d.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                          placeholder="النتيجة"
                          style={{
                            flex:1, padding:'5px 8px', borderRadius:6,
                            border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:13,
                          }}
                        />
                        <select
                          value={t.flag}
                          onChange={e => setDraftTests(d => d.map((x, j) => j === i ? { ...x, flag: e.target.value } : x))}
                          style={{ padding:'5px 6px', borderRadius:6, border:'1px solid var(--border)', fontSize:12 }}
                        >
                          <option value="normal">طبيعي</option>
                          <option value="high">مرتفع</option>
                          <option value="low">منخفض</option>
                          <option value="critical">حرج</option>
                        </select>
                      </div>
                    ))}
                    <div style={{ display:'flex', gap:8, marginTop:8 }}>
                      <button
                        onClick={() => handlePublish(order._id)}
                        disabled={publishing || draftTests.some(t => !t.value.trim())}
                        style={{
                          background:'var(--mint)', color:'#000', border:'none',
                          borderRadius:7, padding:'6px 16px', cursor:'pointer', fontSize:13, fontWeight:600,
                        }}
                      >
                        {publishing ? 'جاري النشر...' : 'نشر النتائج'}
                      </button>
                      <button
                        onClick={() => { setActiveResultId(null); setDraftTests([]); }}
                        style={{
                          background:'none', border:'1px solid var(--border)',
                          borderRadius:7, padding:'6px 14px', cursor:'pointer', fontSize:13,
                        }}
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showModal && (
        <CreatePatientModal
          onClose={() => setShowModal(false)}
          onCreated={() => setShowModal(false)}
        />
      )}

      {scanning && <ScanModal onScan={handleOrderScan} onClose={() => setScanning(false)} />}
    </div>
  );
}
