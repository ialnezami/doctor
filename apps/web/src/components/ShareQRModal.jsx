import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import client from '../api/client';

export default function ShareQRModal({ prescription, onClose }) {
  const [dataUrl, setDataUrl]     = useState('');
  const [token, setToken]         = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [revoked, setRevoked]     = useState(false);
  const [revoking, setRevoking]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    client.post('/share', {
      resourceType: 'prescription',
      resourceId:   prescription._id,
      expiry:       '24h',
    })
      .then(data => {
        if (cancelled) return;
        const url = `${window.location.origin}/s/${data.token}`;
        setToken(data.token);
        setExpiresAt(data.expiresAt);
        return QRCode.toDataURL(url, { width: 280 });
      })
      .then(du => { if (!cancelled) setDataUrl(du); })
      .catch(() => { if (!cancelled) setError('تعذر إنشاء رمز المشاركة'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [prescription._id]);

  const handleRevoke = async () => {
    if (!token) return;
    setRevoking(true);
    try {
      await client.delete(`/share/${token}`);
      setRevoked(true);
    } catch {
      setError('تعذر إلغاء رمز المشاركة');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div
      onClick={onClose}
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
          borderRadius: 14, padding: 28, maxWidth: 360, width: '90%', textAlign: 'center',
        }}
      >
        <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>مشاركة الوصفة الطبية</p>
        <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 20px' }}>
          أرِ هذا الرمز للصيدلاني أو المختبر
        </p>

        {loading && <p style={{ color: 'var(--text2)', fontSize: 13 }}>جاري الإنشاء...</p>}
        {error   && <p style={{ color: 'var(--rose)', fontSize: 13 }}>{error}</p>}
        {revoked && <p style={{ color: 'var(--mint)', fontSize: 13 }}>تم إلغاء رمز المشاركة</p>}

        {!loading && !error && !revoked && dataUrl && (
          <>
            <img src={dataUrl} alt="QR" style={{ width: 200, height: 200, margin: '0 auto 12px' }} />
            {expiresAt && (
              <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 16px' }}>
                صالح حتى: {new Date(expiresAt).toLocaleString('ar-SA')}
              </p>
            )}
            <button
              onClick={handleRevoke}
              disabled={revoking}
              style={{
                background: 'none', border: '1px solid var(--rose)',
                color: 'var(--rose)', borderRadius: 8, padding: '6px 18px',
                cursor: 'pointer', fontSize: 13, marginBottom: 12,
              }}
            >
              {revoking ? 'جاري الإلغاء...' : 'إلغاء الرمز'}
            </button>
          </>
        )}

        <button
          onClick={onClose}
          style={{
            display: 'block', width: '100%', background: 'var(--bg3)',
            border: '1px solid var(--border)', borderRadius: 8,
            padding: '8px 0', cursor: 'pointer', fontSize: 13,
          }}
        >
          إغلاق
        </button>
      </div>
    </div>
  );
}
