import { useState, useEffect } from 'react';
import useAuthStore from '../../store/authStore';
import { updateDoctorSettings } from '../../api/doctors';
import client from '../../api/client';

const VISIT_TYPES = ['initial', 'follow-up', 'check-up', 'urgent'];
const VISIT_LABELS = { initial: 'كشف أولي', 'follow-up': 'متابعة', 'check-up': 'فحص دوري', urgent: 'طارئ' };

export default function ServicesPage() {
  const user = useAuthStore(s => s.user);
  const [services, setServices]   = useState([]);
  const [currency, setCurrency]   = useState('SAR');
  const [doctorId, setDoctorId]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [showAdd, setShowAdd]     = useState(false);
  const [deleteIdx, setDeleteIdx] = useState(null);
  const [newSvc, setNewSvc]       = useState({ key: '', label: '', duration: 30, fee: 0, enabled: true });

  useEffect(() => {
    client.get('/doctors/me')
      .then(data => {
        const types = (data.appointmentTypes || []).map(t => ({
          ...t,
          label: t.label || VISIT_LABELS[t.key] || t.key,
        }));
        setServices(types);
        setCurrency(data.currency || 'SAR');
        setDoctorId(data._id);
      })
      .catch(() => setError('تعذر تحميل الخدمات'))
      .finally(() => setLoading(false));
  }, []);

  const save = async (updated) => {
    if (!doctorId) return;
    setSaving(true); setError('');
    try {
      await updateDoctorSettings(doctorId, { appointmentTypes: updated });
      setServices(updated);
    } catch { setError('تعذر الحفظ'); }
    finally { setSaving(false); }
  };

  const toggle = (i) => {
    const updated = services.map((s, idx) => idx === i ? { ...s, enabled: !s.enabled } : s);
    save(updated);
  };

  const update = (i, field, val) =>
    setServices(s => s.map((svc, idx) => idx === i ? { ...svc, [field]: val } : svc));

  const saveEdit = () => save([...services]);

  const remove = (i) => {
    const updated = services.filter((_, idx) => idx !== i);
    save(updated);
    setDeleteIdx(null);
  };

  const addService = () => {
    if (!newSvc.label.trim()) return;
    const key = newSvc.key || `custom_${Date.now()}`;
    const updated = [...services, { ...newSvc, key }];
    save(updated);
    setNewSvc({ key: '', label: '', duration: 30, fee: 0, enabled: true });
    setShowAdd(false);
  };

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>جاري التحميل...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }} dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>خدمات العيادة</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>أضف خدماتك وأسعارها ليراها المرضى عند الحجز</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{ background: 'var(--mint)', color: '#000', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
        >
          + إضافة خدمة
        </button>
      </div>

      {error && <p style={{ color: 'var(--rose)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {showAdd && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px' }}>خدمة جديدة</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: 10 }}>
            <input
              placeholder="اسم الخدمة"
              value={newSvc.label}
              onChange={e => setNewSvc(s => ({ ...s, label: e.target.value }))}
              style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
            />
            <input
              type="number" placeholder="مدة (دق)" min={5}
              value={newSvc.duration}
              onChange={e => setNewSvc(s => ({ ...s, duration: parseInt(e.target.value) || 30 }))}
              style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
            />
            <input
              type="number" placeholder={`سعر (${currency})`} min={0}
              value={newSvc.fee}
              onChange={e => setNewSvc(s => ({ ...s, fee: parseFloat(e.target.value) || 0 }))}
              style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={addService} style={{ background: 'var(--mint)', color: '#000', border: 'none', borderRadius: 7, padding: '7px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>حفظ</button>
            <button onClick={() => setShowAdd(false)} style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>إلغاء</button>
          </div>
        </div>
      )}

      {services.length === 0 && !showAdd && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)', fontSize: 14 }}>
          لا توجد خدمات بعد — أضف خدمتك الأولى
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {services.map((svc, i) => (
          <div key={svc.key || i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'flex', gap: 12, alignItems: 'center', opacity: svc.enabled ? 1 : 0.55 }}>
            <button
              onClick={() => toggle(i)}
              title={svc.enabled ? 'إلغاء التفعيل' : 'تفعيل'}
              style={{ width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', background: svc.enabled ? 'var(--mint)' : 'var(--bg3)', flexShrink: 0, position: 'relative', transition: 'background .2s' }}
            >
              <span style={{ position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'right .2s, left .2s', [svc.enabled ? 'right' : 'left']: 2 }} />
            </button>
            <div style={{ flex: 1 }}>
              <input
                value={svc.label}
                onChange={e => update(i, 'label', e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => e.key === 'Enter' && saveEdit()}
                style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', background: 'transparent', border: 'none', outline: 'none', width: '100%' }}
              />
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
              <input
                type="number" min={5}
                value={svc.duration}
                onChange={e => update(i, 'duration', parseInt(e.target.value) || 30)}
                onBlur={saveEdit}
                onKeyDown={e => e.key === 'Enter' && saveEdit()}
                style={{ width: 48, fontSize: 13, color: 'var(--text2)', background: 'transparent', border: 'none', outline: 'none', textAlign: 'center' }}
              /> دق
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary)', whiteSpace: 'nowrap' }}>
              <input
                type="number" min={0}
                value={svc.fee}
                onChange={e => update(i, 'fee', parseFloat(e.target.value) || 0)}
                onBlur={saveEdit}
                onKeyDown={e => e.key === 'Enter' && saveEdit()}
                style={{ width: 64, fontSize: 14, fontWeight: 600, color: 'var(--primary)', background: 'transparent', border: 'none', outline: 'none', textAlign: 'center' }}
              /> {currency}
            </div>
            <button
              onClick={() => setDeleteIdx(i)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rose)', fontSize: 18, padding: '0 4px', lineHeight: 1 }}
            >×</button>
          </div>
        ))}
      </div>

      {deleteIdx !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, maxWidth: 360, width: '90%', textAlign: 'center' }} dir="rtl">
            <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 8px' }}>حذف الخدمة؟</p>
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 20px' }}>سيتم حذف "{services[deleteIdx]?.label}" نهائياً</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => remove(deleteIdx)} style={{ background: 'var(--rose)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 600, cursor: 'pointer' }}>حذف</button>
              <button onClick={() => setDeleteIdx(null)} style={{ background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 20px', cursor: 'pointer' }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {saving && <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 12, textAlign: 'center' }}>جاري الحفظ...</p>}
    </div>
  );
}
