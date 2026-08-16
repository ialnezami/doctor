import { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function ScanModal({ onScan, onClose }) {
  const scannerRef = useRef(null);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );
    scannerRef.current = scanner;

    scanner.render(
      (decodedText) => {
        scanner.clear().catch(() => {});
        onScan(decodedText);
      },
      () => {}
    );

    return () => {
      scanner.clear().catch(() => {});
    };
  }, [onScan]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)',
        display: 'grid', placeItems: 'center', zIndex: 1200,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        dir="rtl"
        style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 14, padding: 24, maxWidth: 400, width: '90%',
        }}
      >
        <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 16px', textAlign: 'center' }}>
          امسح رمز QR للوصفة
        </p>
        <div id="qr-reader" />
        <button
          onClick={onClose}
          style={{
            marginTop: 16, width: '100%', background: 'var(--bg3)',
            border: '1px solid var(--border)', borderRadius: 8,
            padding: '8px 0', cursor: 'pointer', fontSize: 13,
          }}
        >
          إلغاء
        </button>
      </div>
    </div>
  );
}
