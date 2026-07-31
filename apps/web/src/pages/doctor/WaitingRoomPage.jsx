import { useState, useEffect, useCallback } from 'react';
import { getWaitingRoom, callPatient } from '../../api/waitingRoom';

const VISIT_LABELS = {
  initial:     'كشف أولي',
  'follow-up': 'متابعة',
  'check-up':  'فحص دوري',
  urgent:      'طارئ',
};

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
}

export default function WaitingRoomPage() {
  const [queue,   setQueue]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [calling, setCalling] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError('');
    getWaitingRoom()
      .then(d => setQueue(d.queue || []))
      .catch(() => setError('تعذر تحميل القائمة'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const handleCall = async (id) => {
    if (calling) return;
    setCalling(id);
    try {
      const { appointment } = await callPatient(id);
      setQueue(prev => prev.map(a => a._id === id ? { ...a, status: appointment.status } : a));
    } catch {
      setError('تعذر تحديث الحالة');
    } finally {
      setCalling(null);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto' }} dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>غرفة الانتظار</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>المرضى الذين سجلوا حضورهم</p>
        </div>
        <button onClick={load} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--text2)' }}>
          تحديث
        </button>
      </div>

      {error && <p style={{ color: 'var(--rose)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {loading && <p style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>جاري التحميل...</p>}

      {!loading && queue.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)', fontSize: 14 }}>
          لا يوجد مرضى في قائمة الانتظار حالياً
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {queue.map((item, i) => (
          <div key={item._id} style={{
            background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14,
            opacity: item.status === 'in_progress' ? 0.6 : 1,
          }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
              {i + 1}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{item.patientName}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                {item.appointmentTime} · {VISIT_LABELS[item.visitType] || item.visitType} · وصل {fmtTime(item.checkedInAt)}
              </div>
            </div>
            {item.status !== 'in_progress' && (
              <button
                onClick={() => handleCall(item._id)}
                disabled={!!calling}
                style={{
                  background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: calling ? 'not-allowed' : 'pointer',
                  opacity: calling === item._id ? 0.7 : 1,
                }}
              >
                {calling === item._id ? '...' : 'استدعاء'}
              </button>
            )}
            {item.status === 'in_progress' && (
              <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>جارٍ الكشف</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
