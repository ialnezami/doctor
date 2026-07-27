import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { getAnalyticsSummary } from '../../api/analytics';

const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const VISIT_LABELS = { initial: 'كشف أولي', 'follow-up': 'متابعة', 'check-up': 'فحص دوري', urgent: 'طارئ' };
const STATUS_LABELS = { completed: 'مكتمل', cancelled: 'ملغي', pending: 'معلق' };
const COLORS = ['#0fe3b0', '#3b82f6', '#f59e0b', '#ef4444'];

function isoDate(d) { return d.toISOString().slice(0, 10); }

export default function ReportsPage() {
  const now      = new Date();
  const [from, setFrom] = useState(isoDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))));
  const [to,   setTo]   = useState(isoDate(new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0))));
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    setLoading(true); setError('');
    getAnalyticsSummary({ from, to })
      .then(setData)
      .catch(() => setError('تعذر تحميل التقارير'))
      .finally(() => setLoading(false));
  }, [from, to]);

  const currency = 'SAR';

  const statusPieData = data ? [
    { name: STATUS_LABELS.completed, value: data.appointments.completed },
    { name: STATUS_LABELS.pending,   value: data.appointments.pending },
    { name: STATUS_LABELS.cancelled, value: data.appointments.cancelled },
  ].filter(d => d.value > 0) : [];

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }} dir="rtl">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>التقارير</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'var(--text2)' }}>من</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 13 }} />
          <label style={{ fontSize: 12, color: 'var(--text2)' }}>إلى</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 13 }} />
        </div>
      </div>

      {error && <p style={{ color: 'var(--rose)', fontSize: 13 }}>{error}</p>}
      {loading && <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)' }}>جاري التحميل...</div>}

      {!loading && data && (
        <>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 28 }}>
            {[
              { label: 'إجمالي الإيرادات', value: data.revenue.total,       color: 'var(--text)' },
              { label: 'المحصّل',            value: data.revenue.collected,   color: 'var(--mint)' },
              { label: 'المتبقي',             value: data.revenue.outstanding, color: 'var(--rose)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color }}>{value.toLocaleString('ar-SA')} <span style={{ fontSize: 13, fontWeight: 400 }}>{currency}</span></div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
            {/* Monthly revenue bar */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 16px' }}>الإيرادات الشهرية</p>
              {data.byMonth.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '24px 0' }}>لا توجد بيانات</p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={data.byMonth} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text3)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} />
                    <Tooltip formatter={(v) => `${v} ${currency}`} />
                    <Bar dataKey="invoiced"  name="مفوتر"   fill="#3b82f6" radius={[3,3,0,0]} />
                    <Bar dataKey="collected" name="محصّل"   fill="#0fe3b0" radius={[3,3,0,0]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Appointments donut */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 16px' }}>المواعيد حسب الحالة — الإجمالي: {data.appointments.total}</p>
              {statusPieData.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '24px 0' }}>لا توجد بيانات</p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={statusPieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={75} paddingAngle={3}>
                      {statusPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Tables row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Visit type breakdown */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px' }}>حسب نوع الزيارة</p>
              {data.byVisitType.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text3)' }}>لا توجد بيانات</p>
              ) : (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--text3)', fontWeight: 500 }}>النوع</th>
                    <th style={{ textAlign: 'center', padding: '6px 0', color: 'var(--text3)', fontWeight: 500 }}>العدد</th>
                    <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--text3)', fontWeight: 500 }}>الإيراد</th>
                  </tr></thead>
                  <tbody>
                    {data.byVisitType.map(row => (
                      <tr key={row.type} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 0' }}>{VISIT_LABELS[row.type] || row.type}</td>
                        <td style={{ padding: '8px 0', textAlign: 'center', color: 'var(--text2)' }}>{row.count}</td>
                        <td style={{ padding: '8px 0', textAlign: 'left', fontWeight: 600 }}>{row.revenue} {currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Busiest days */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px' }}>أكثر الأيام ازدحاماً</p>
              {data.busiestDays.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text3)' }}>لا توجد بيانات</p>
              ) : (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--text3)', fontWeight: 500 }}>اليوم</th>
                    <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--text3)', fontWeight: 500 }}>عدد المواعيد</th>
                  </tr></thead>
                  <tbody>
                    {data.busiestDays.map(row => (
                      <tr key={row.day} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 0' }}>{DAY_NAMES[row.day] || row.day}</td>
                        <td style={{ padding: '8px 0', textAlign: 'left', fontWeight: 600 }}>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
