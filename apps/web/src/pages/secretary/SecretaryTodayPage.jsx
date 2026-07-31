import { useState, useEffect, useCallback } from 'react';
import { getAppointments } from '../../api/appointments';
import { groupTodayAppointments } from '../../utils/appointmentGroups';
import client from '../../api/client';

const STATUS_BADGE = {
  confirmed:   { label: 'مؤكد',        bg: 'var(--primary)', color: '#fff' },
  scheduled:   { label: 'مجدول',       bg: 'transparent',    color: 'var(--text2)', border: '1px solid var(--border2)' },
  attended:    { label: 'تم الحضور',   bg: '#16a34a',        color: '#fff' },
  completed:   { label: 'تم الحضور',   bg: '#16a34a',        color: '#fff' },
  in_progress: { label: 'جارٍ الكشف', bg: 'var(--primary)', color: '#fff' },
  cancelled:   { label: 'ملغى',        bg: 'transparent',    color: 'var(--rose)', border: '1px solid var(--rose)' },
  pending:     { label: 'معلق',        bg: 'transparent',    color: 'var(--text3)', border: '1px solid var(--border)' },
};

const VISIT_LABELS = {
  initial:      'كشف أولي',
  'follow-up':  'متابعة',
  'check-up':   'فحص دوري',
  urgent:       'طارئ',
};

function Badge({ cfg }) {
  if (!cfg) return null;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: cfg.bg, color: cfg.color, border: cfg.border,
      display: 'inline-block', whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

export default function SecretaryTodayPage() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error,   setError]             = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getAppointments()
      .then(setAppointments)
      .catch(() => setError('تعذّر تحميل المواعيد'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id, status) => {
    try {
      await client.patch(`/appointments/${id}/status`, { status });
      setAppointments(prev => prev.map(a => a._id === id ? { ...a, status } : a));
    } catch {
      alert('فشل تحديث الحالة');
    }
  };

  const { current, upcoming } = groupTodayAppointments(appointments);
  const todayCount = current.length + upcoming.length;
  const dateLabel = new Date().toLocaleDateString('ar-SA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const renderList = (list) => list.map((appt, i) => {
    const badge = STATUS_BADGE[appt.status] || STATUS_BADGE.pending;
    return (
      <div
        key={appt._id}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', background: '#fff',
          borderBottom: '1px solid var(--border)',
          borderInlineEnd: '3px solid var(--primary)',
        }}
      >
        <div style={{
          width: 22, height: 22, borderRadius: '50%', background: 'var(--bg)',
          display: 'grid', placeItems: 'center', fontSize: 11,
          color: 'var(--text3)', fontWeight: 600, flexShrink: 0,
        }}>
          {i + 1}
        </div>
        <div style={{ minWidth: 44, textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace' }}>
            {appt.timeSlot?.start}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>
            {appt.timeSlot?.end}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
            {appt.patientId?.name || 'مريض'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            {VISIT_LABELS[appt.visitType] || appt.visitType}
          </div>
        </div>
        <Badge cfg={badge} />
        <div style={{ display: 'flex', gap: 6 }}>
          {appt.status === 'pending' && (
            <button
              onClick={() => updateStatus(appt._id, 'confirmed')}
              style={{
                fontSize: 12, padding: '4px 10px', borderRadius: 6,
                background: 'var(--mint)', color: '#000', border: 'none',
                cursor: 'pointer', fontWeight: 600,
              }}
            >
              تأكيد
            </button>
          )}
          {!['cancelled', 'completed', 'archived'].includes(appt.status) && (
            <button
              onClick={() => updateStatus(appt._id, 'cancelled')}
              style={{
                fontSize: 12, padding: '4px 10px', borderRadius: 6,
                background: 'none', color: 'var(--rose)',
                border: '1px solid var(--rose)', cursor: 'pointer',
              }}
            >
              إلغاء
            </button>
          )}
        </div>
      </div>
    );
  });

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto' }} dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>مواعيد اليوم</h1>
          <p style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 0' }}>{dateLabel}</p>
        </div>
        {todayCount > 0 && (
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '2px 10px',
            borderRadius: 12, background: 'var(--primary)', color: '#fff',
          }}>
            {todayCount}
          </span>
        )}
      </div>

      {loading && (
        <p style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>جاري التحميل...</p>
      )}
      {error && (
        <p style={{ color: 'var(--rose)', fontSize: 13, marginBottom: 12 }}>{error}</p>
      )}
      {!loading && todayCount === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>لا توجد مواعيد اليوم</p>
      )}

      {current.length > 0 && (
        <div style={{
          background: '#fff', border: '1px solid var(--border)',
          borderRadius: 10, marginBottom: 16, overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 16px 8px', fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>
            🟢 الآن ({current.length})
          </div>
          {renderList(current)}
        </div>
      )}

      {upcoming.length > 0 && (
        <div style={{
          background: '#fff', border: '1px solid var(--border)',
          borderRadius: 10, overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 16px 8px', fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>
            📅 القادم ({upcoming.length})
          </div>
          {renderList(upcoming)}
        </div>
      )}
    </div>
  );
}
