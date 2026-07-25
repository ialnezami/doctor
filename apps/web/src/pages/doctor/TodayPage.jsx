import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Search, Eye, X, Check, UserPlus, Calendar } from 'lucide-react';
import axios from 'axios';
import { getAppointments } from '../../api/appointments';
import { groupTodayAppointments } from '../../utils/appointmentGroups';
import PatientSearchModal from '../../components/doctor/PatientSearchModal';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const STATUS_BADGE = {
  confirmed:  { label: 'مؤكد',      bg: 'var(--primary)',  color: '#fff' },
  scheduled:  { label: 'مجدول',     bg: 'transparent',     color: 'var(--text2)', border: '1px solid var(--border2)' },
  attended:   { label: 'تم الحضور', bg: '#16a34a',         color: '#fff' },
  completed:  { label: 'تم الحضور', bg: '#16a34a',         color: '#fff' },
  cancelled:  { label: 'ملغى',      bg: 'transparent',     color: 'var(--rose)', border: '1px solid var(--rose)' },
  pending:    { label: 'معلق',      bg: 'transparent',     color: 'var(--text3)', border: '1px solid var(--border)' },
};

const URGENCY_BADGE = {
  high:   { label: 'عالي',  bg: 'var(--amber)', color: '#fff' },
  medium: { label: 'متوسط', bg: 'var(--blue)',  color: '#fff' },
  low:    { label: 'منخفض', bg: 'var(--text3)', color: '#fff' },
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

function ActionBtn({ icon: Icon, title, onClick, color }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
        background: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer',
        color: color || 'var(--text2)', transition: 'all .13s', flexShrink: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary-dim)'; e.currentTarget.style.color = 'var(--primary)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = color || 'var(--text2)'; }}
    >
      <Icon size={14} />
    </button>
  );
}

function AppointmentCard({ appt, index, isCurrent, onStatusChange }) {
  const navigate = useNavigate();
  const status = STATUS_BADGE[appt.status] || STATUS_BADGE.scheduled;
  const urgency = URGENCY_BADGE[appt.urgency];

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '12px 16px', background: '#fff',
      borderBottom: '1px solid var(--border)',
      borderInlineEnd: `3px solid ${urgency ? 'var(--amber)' : 'var(--primary)'}`,
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%', background: 'var(--bg)',
        display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--text3)',
        fontWeight: 600, flexShrink: 0, marginTop: 2,
      }}>
        {index}
      </div>

      <div style={{ minWidth: 44, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace' }}>
          {appt.timeSlot?.start}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>
          {appt.timeSlot?.end}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            {appt.patientId?.name || 'مريض'}
          </span>
          {urgency && <Badge cfg={urgency} />}
          <Badge cfg={status} />
        </div>
        {appt.status === 'pending' && (
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>معلق ⊘</span>
        )}
        {appt.chiefComplaint && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {appt.chiefComplaint}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
        <ActionBtn icon={Eye} title="عرض" onClick={() => navigate(`/appointments/${appt._id}`)} />
        <ActionBtn icon={X} title="إلغاء" color="var(--rose)" onClick={() => onStatusChange(appt._id, 'cancelled')} />
        {isCurrent
          ? <ActionBtn icon={Check} title="تم الحضور" color="var(--primary)" onClick={() => onStatusChange(appt._id, 'attended')} />
          : <ActionBtn icon={UserPlus} title="غرفة الانتظار" onClick={() => {}} />
        }
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px 10px' }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
      <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 12, background: 'var(--primary)', color: '#fff' }}>
        {count}
      </span>
    </div>
  );
}

export default function TodayPage() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [showSearch, setShowSearch]     = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getAppointments()
      .then(setAppointments)
      .catch(() => setError('تعذّر تحميل المواعيد'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const updateStatus = async (id, status) => {
    try {
      const token = localStorage.getItem('token');
      await axios.patch(`${API_BASE}/api/appointments/${id}/status`, { status }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAppointments(prev => prev.map(a => a._id === id ? { ...a, status } : a));
    } catch {
      alert('فشل تحديث الحالة، حاول مجدداً');
    }
  };

  const { current, upcoming } = groupTodayAppointments(appointments);
  const todayCount = current.length + upcoming.length;
  const dateLabel = new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Topbar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, background: '#fff',
        borderBottom: '1px solid var(--border)', padding: '12px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4 }}>
          <Bell size={20} />
        </button>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          <span style={{ color: 'var(--text3)' }}>الرئيسية</span>
          <span style={{ margin: '0 6px', color: 'var(--text3)' }}>›</span>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>اليوم</span>
        </div>
        <div style={{ width: 28 }} />
      </div>

      <div style={{ padding: '20px 20px 40px' }}>
        {/* Patient search bar */}
        <div
          onClick={() => setShowSearch(true)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', background: '#fff', border: '1px solid var(--border)',
            borderRadius: 10, marginBottom: 20, cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>البحث عن مريض</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>ابحث عن مريض في شبكة نبض العيادات أو في...</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '3px 7px', borderRadius: 5,
              background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text3)', fontFamily: 'monospace',
            }}>
              Ctrl K
            </span>
            <Search size={18} color="var(--text3)" />
          </div>
        </div>

        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={18} color="var(--primary)" />
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>مواعيد اليوم</span>
            {todayCount > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, padding: '1px 8px', borderRadius: 12, background: 'var(--primary)', color: '#fff' }}>
                {todayCount}
              </span>
            )}
          </div>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>{dateLabel}</span>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>جاري التحميل...</div>}

        {error && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ color: 'var(--rose)', marginBottom: 12 }}>{error}</div>
            <button onClick={load} style={{ padding: '8px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
              إعادة المحاولة
            </button>
          </div>
        )}

        {!loading && !error && todayCount === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>لا توجد مواعيد اليوم</div>
        )}

        {!loading && current.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 16, overflow: 'hidden' }}>
            <SectionHeader icon="🟢" title="الآن" count={current.length} />
            {current.map((a, i) => (
              <AppointmentCard key={a._id} appt={a} index={i + 1} isCurrent onStatusChange={updateStatus} />
            ))}
          </div>
        )}

        {!loading && upcoming.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <SectionHeader icon="📅" title="القادم" count={upcoming.length} />
            {upcoming.map((a, i) => (
              <AppointmentCard key={a._id} appt={a} index={i + 1} isCurrent={false} onStatusChange={updateStatus} />
            ))}
          </div>
        )}
      </div>

      {showSearch && <PatientSearchModal onClose={() => setShowSearch(false)} />}
    </div>
  );
}
