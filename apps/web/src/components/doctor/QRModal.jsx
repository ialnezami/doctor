import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function QRModal({ appt, onClose }) {
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    const url = `${window.location.origin}/checkin?token=${appt.qrToken}`;
    QRCode.toDataURL(url, { width: 220, margin: 2 })
      .then(setDataUrl)
      .catch(console.error);
  }, [appt.qrToken]);

  const url = `${window.location.origin}/checkin?token=${appt.qrToken}`;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', zIndex: 1000 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 320, width: '90%', textAlign: 'center' }}
        dir="rtl"
      >
        <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>رمز الحضور</p>
        <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 16px' }}>
          {appt.patientId?.name || 'المريض'} — {appt.timeSlot?.start}
        </p>
        {dataUrl && <img src={dataUrl} alt="QR check-in" style={{ width: 220, height: 220, display: 'block', margin: '0 auto 16px' }} />}
        <p style={{ fontSize: 11, color: 'var(--text3)', wordBreak: 'break-all', margin: '0 0 16px', direction: 'ltr' }}>{url}</p>
        <button
          onClick={onClose}
          style={{ background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 13 }}
        >
          إغلاق
        </button>
      </div>
    </div>
  );
}
