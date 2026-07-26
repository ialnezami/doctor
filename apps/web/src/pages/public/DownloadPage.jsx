export default function DownloadPage() {
  const apkUrl = import.meta.env.VITE_APK_URL || null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #060d18)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>

        {/* Logo / App name */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg, #0fe3b0, #0ea5e9)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#060d18" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: 0 }}>Salamtak</h1>
          <p style={{ fontSize: 14, color: '#94a3b8', marginTop: 6 }}>Your healthcare, connected</p>
        </div>

        {/* Download card */}
        <div style={{ background: '#0d1829', border: '1px solid #1e293b', borderRadius: 16, padding: '32px 28px', marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0fe3b0', marginBottom: 12 }}>Android App</div>
          <div style={{ fontSize: 15, color: '#cbd5e1', marginBottom: 24, lineHeight: 1.6 }}>
            Book appointments, chat with your doctor, and access your medical records — all from your Android device.
          </div>

          {apkUrl ? (
            <a
              href={apkUrl}
              download
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                background: '#0fe3b0', color: '#060d18', fontWeight: 700, fontSize: 15,
                padding: '13px 28px', borderRadius: 12, textDecoration: 'none',
                transition: 'opacity .2s',
              }}
              onMouseOver={e => e.currentTarget.style.opacity = '0.88'}
              onMouseOut={e => e.currentTarget.style.opacity = '1'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download APK
            </a>
          ) : (
            <div style={{ background: '#1e293b', borderRadius: 10, padding: '14px 18px', color: '#64748b', fontSize: 13 }}>
              APK download link coming soon.
            </div>
          )}

          <div style={{ marginTop: 20, fontSize: 12, color: '#475569' }}>
            Version 1.0.0 · Android 8.0+<br />
            Enable "Install unknown apps" in your Android settings to install.
          </div>
        </div>

        {/* iOS note */}
        <div style={{ fontSize: 13, color: '#475569' }}>
          iOS app coming soon.{' '}
          <a href="/login" style={{ color: '#0fe3b0', textDecoration: 'none' }}>Use the web app →</a>
        </div>
      </div>
    </div>
  );
}
