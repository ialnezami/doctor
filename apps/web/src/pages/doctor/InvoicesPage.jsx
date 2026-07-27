import { useState, useEffect, useCallback } from 'react';
import { getInvoices, markInvoicePaid } from '../../api/invoices';
import client from '../../api/client';

const STATUS_TABS = [
  { key: 'all',    label: 'الكل' },
  { key: 'unpaid', label: 'غير مدفوع' },
  { key: 'paid',   label: 'مدفوع' },
];

const VISIT_LABELS = {
  initial:     'كشف أولي',
  'follow-up': 'متابعة',
  'check-up':  'فحص دوري',
  urgent:      'طارئ',
};

function fmt(amount, currency = 'SAR') {
  return new Intl.NumberFormat('ar-SA', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount || 0);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function InvoicesPage() {
  const [tab, setTab]           = useState('all');
  const [page, setPage]         = useState(1);
  const [invoices, setInvoices] = useState([]);
  const [summary, setSummary]   = useState({ total: 0, collected: 0, outstanding: 0 });
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [paying, setPaying]     = useState(null); // appointmentId being marked paid
  const [currency, setCurrency] = useState('SAR');

  // Fetch doctor currency once
  useEffect(() => {
    client.get('/doctors/me').then(d => setCurrency(d.currency || 'SAR')).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getInvoices({ status: tab, page, limit: 20 });
      setInvoices(res.invoices || []);
      setSummary(res.summary || { total: 0, collected: 0, outstanding: 0 });
      setTotalPages(res.totalPages || 1);
    } catch {
      setError('تعذر تحميل الفواتير. حاول مجدداً.');
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => { load(); }, [load]);

  // Reset page when tab changes
  useEffect(() => { setPage(1); }, [tab]);

  const handleMarkPaid = async (id) => {
    if (paying) return;
    setPaying(id);
    try {
      const res = await markInvoicePaid(id);
      setInvoices(prev =>
        prev.map(inv => inv._id === id ? { ...inv, ...res.invoice } : inv)
      );
      // Refresh summary in background
      getInvoices({ status: tab, page, limit: 20 })
        .then(r => setSummary(prev => r.summary || prev))
        .catch(() => {});
    } catch {
      setError('تعذر تحديث حالة الدفع.');
    } finally {
      setPaying(null);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }} dir="rtl">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>الفواتير</h1>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>
          متابعة مدفوعات المرضى وحالة الفواتير
        </p>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'إجمالي الفواتير',   value: summary.total,       color: 'var(--primary)' },
          { label: 'المبالغ المحصّلة',  value: summary.collected,   color: 'var(--mint)' },
          { label: 'المبالغ المستحقة',  value: summary.outstanding, color: 'var(--rose)' },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}
          >
            <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 6px' }}>{label}</p>
            <p style={{ fontSize: 22, fontWeight: 700, color, margin: 0, fontFamily: 'var(--font-mono, monospace)' }}>
              {fmt(value, currency)}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg2)', borderRadius: 8, padding: 4, width: 'fit-content' }}>
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: tab === t.key ? 600 : 400,
              background: tab === t.key ? 'var(--bg)' : 'transparent',
              color: tab === t.key ? 'var(--text)' : 'var(--text2)',
              boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,.12)' : 'none',
              transition: 'all .15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p style={{ color: 'var(--rose)', fontSize: 13, marginBottom: 12 }}>{error}</p>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
          جاري التحميل...
        </div>
      ) : invoices.length === 0 ? (
        <div style={{ padding: 56, textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
          لا توجد فواتير في هذه الفئة
        </div>
      ) : (
        <>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {/* Table head */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 110px 120px 110px 110px 90px',
                gap: 0,
                padding: '10px 16px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg3)',
              }}
            >
              {['المريض', 'التاريخ', 'نوع الزيارة', 'المبلغ', 'الحالة', ''].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {h}
                </span>
              ))}
            </div>

            {/* Table rows */}
            {invoices.map((inv, idx) => {
              const isPaid   = inv.paymentStatus === 'paid';
              const isLast   = idx === invoices.length - 1;
              const isBusy   = paying === inv._id;
              return (
                <div
                  key={inv._id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 110px 120px 110px 110px 90px',
                    gap: 0,
                    padding: '12px 16px',
                    borderBottom: isLast ? 'none' : '1px solid var(--border)',
                    alignItems: 'center',
                    background: isBusy ? 'var(--bg3)' : 'transparent',
                    transition: 'background .15s',
                  }}
                >
                  {/* Patient */}
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                    {inv.patientName}
                    {inv.locationName ? (
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>
                        {inv.locationName}
                      </span>
                    ) : null}
                  </span>

                  {/* Date */}
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>{fmtDate(inv.date)}</span>

                  {/* Visit type */}
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                    {VISIT_LABELS[inv.visitType] || inv.visitType || '—'}
                  </span>

                  {/* Amount */}
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary)', fontFamily: 'var(--font-mono, monospace)' }}>
                    {fmt(inv.invoiceAmount, currency)}
                  </span>

                  {/* Status */}
                  {isPaid ? (
                    <span
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 12, fontWeight: 600,
                        color: 'var(--mint)', background: 'rgba(0,200,150,.1)',
                        borderRadius: 20, padding: '3px 10px', width: 'fit-content',
                      }}
                    >
                      ✓ مدفوع
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>غير مدفوع</span>
                  )}

                  {/* Action */}
                  {!isPaid && (
                    <button
                      onClick={() => handleMarkPaid(inv._id)}
                      disabled={!!paying}
                      style={{
                        fontSize: 12, fontWeight: 600,
                        color: isBusy ? 'var(--text3)' : 'var(--primary)',
                        background: isBusy ? 'var(--bg3)' : 'rgba(var(--primary-rgb, 0,120,200),.08)',
                        border: '1px solid currentColor',
                        borderRadius: 20, padding: '3px 10px',
                        cursor: paying ? 'not-allowed' : 'pointer',
                        transition: 'all .15s',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isBusy ? '...' : 'تحصيل'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 20 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border)',
                  background: 'var(--bg2)', color: 'var(--text2)', cursor: page === 1 ? 'not-allowed' : 'pointer',
                  opacity: page === 1 ? 0.4 : 1, fontSize: 13,
                }}
              >
                السابق
              </button>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border)',
                  background: 'var(--bg2)', color: 'var(--text2)', cursor: page === totalPages ? 'not-allowed' : 'pointer',
                  opacity: page === totalPages ? 0.4 : 1, fontSize: 13,
                }}
              >
                التالي
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
