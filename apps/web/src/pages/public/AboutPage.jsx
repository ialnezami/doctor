import { useNavigate } from 'react-router-dom';

const VALUES = [
  {
    icon: '🌱',
    title: 'Environmental Responsibility',
    body: 'Every digital prescription replaces paper. Every teleconsultation eliminates a commute. We track our platform\'s carbon footprint and invest in reducing it — because a healthier planet means healthier people. Our servers run on renewable-energy infrastructure, and we actively minimise data storage overhead to lower our energy draw.',
  },
  {
    icon: '🤝',
    title: 'Solidarity',
    body: 'Healthcare is a right, not a privilege. MediConnect is built with underserved communities in mind — low-bandwidth mobile-first design, Arabic-first localisation, and offline-capable tools for areas with unreliable connectivity. We partner with community clinics and NGOs to extend care to those who need it most.',
  },
  {
    icon: '🔒',
    title: 'Privacy & Dignity',
    body: 'Patient data is sacred. We encrypt all sensitive fields at rest (AES-256-GCM), enforce strict role-based access, and comply with HIPAA and GDPR standards. We will never sell, share, or monetise patient data. Transparency reports are published annually.',
  },
  {
    icon: '💡',
    title: 'Accessible Innovation',
    body: 'AI should serve patients, not intimidate them. Our AI features — symptom analysis, consultation summaries, smart scheduling — are designed to assist clinicians and help patients understand their own health, written in plain language anyone can follow.',
  },
  {
    icon: '⚖️',
    title: 'Equity',
    body: 'We build for diversity. The platform supports Arabic (RTL), English, and French. Accessibility standards guide every UI decision. Pricing models are designed to be viable for small independent clinics and solo practitioners, not just large hospital systems.',
  },
  {
    icon: '🏗️',
    title: 'Long-term Thinking',
    body: 'We optimise for the next decade, not the next quarter. That means open standards, interoperable data formats, and a commitment to never locking patients or doctors into proprietary systems they can\'t leave. Your data is yours.',
  },
];

const STATS = [
  { value: '100%', label: 'Open-standard data formats' },
  { value: '0',    label: 'Patient data sold to third parties' },
  { value: '3',    label: 'Languages supported at launch' },
  { value: '↓',    label: 'Paper waste per digital prescription' },
];

export default function AboutPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #070f1a)', color: 'var(--text, #e2e8f0)', fontFamily: 'inherit' }}>

      {/* Nav */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 32px', borderBottom: '1px solid var(--border, #1e2d3d)', position: 'sticky', top: 0, background: 'rgba(7,15,26,0.92)', backdropFilter: 'blur(10px)', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => navigate('/')}>
          <div style={{ width: 30, height: 30, background: 'var(--mint, #0fe3b0)', borderRadius: 7, display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 800, color: '#000' }}>M</div>
          <span style={{ fontSize: 18, fontWeight: 600 }}>Medi<span style={{ color: 'var(--mint, #0fe3b0)' }}>Connect</span></span>
        </div>
        <button
          onClick={() => navigate('/login')}
          style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--mint, #0fe3b0)', background: 'transparent', color: 'var(--mint, #0fe3b0)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Sign In
        </button>
      </header>

      {/* Hero */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '80px 24px 60px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', padding: '5px 16px', borderRadius: 20, background: 'rgba(15,227,176,0.1)', border: '1px solid rgba(15,227,176,0.25)', fontSize: 12, fontWeight: 600, color: 'var(--mint, #0fe3b0)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 28 }}>
          Our Mission
        </div>
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 700, lineHeight: 1.2, margin: '0 0 24px', letterSpacing: '-0.02em' }}>
          Healthcare technology that{' '}
          <span style={{ color: 'var(--mint, #0fe3b0)' }}>respects people</span>{' '}
          and{' '}
          <span style={{ color: 'var(--mint, #0fe3b0)' }}>the planet</span>
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.75, color: 'var(--text2, #94a3b8)', maxWidth: 620, margin: '0 auto 40px' }}>
          MediConnect is a platform built on the belief that technology should make healthcare
          more accessible, more sustainable, and more human — not more complicated.
          We connect doctors, patients, pharmacies, and laboratories through a single
          secure ecosystem grounded in our core values.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/register')} style={{ padding: '12px 28px', borderRadius: 10, background: 'var(--mint, #0fe3b0)', border: 'none', color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Get Started
          </button>
          <button onClick={() => navigate('/download')} style={{ padding: '12px 28px', borderRadius: 10, background: 'transparent', border: '1px solid var(--border2, #334155)', color: 'var(--text2, #94a3b8)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Download App
          </button>
        </div>
      </section>

      {/* Stats */}
      <section style={{ background: 'var(--bg2, #0d1a2b)', borderTop: '1px solid var(--border, #1e2d3d)', borderBottom: '1px solid var(--border, #1e2d3d)' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', padding: '32px 24px' }}>
          {STATS.map(s => (
            <div key={s.label} style={{ textAlign: 'center', padding: '12px 8px' }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--mint, #0fe3b0)', marginBottom: 6 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text3, #64748b)', lineHeight: 1.4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Values */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '72px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text3, #64748b)', marginBottom: 14 }}>What We Stand For</div>
          <h2 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Our Values</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
          {VALUES.map(v => (
            <div key={v.title} style={{ background: 'var(--bg2, #0d1a2b)', border: '1px solid var(--border, #1e2d3d)', borderRadius: 14, padding: 24, transition: 'border-color .2s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(15,227,176,0.3)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border, #1e2d3d)'}
            >
              <div style={{ fontSize: 28, marginBottom: 14 }}>{v.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{v.title}</div>
              <p style={{ fontSize: 13, color: 'var(--text2, #94a3b8)', lineHeight: 1.7, margin: 0 }}>{v.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Environment deep-dive */}
      <section style={{ background: 'var(--bg2, #0d1a2b)', borderTop: '1px solid var(--border, #1e2d3d)', borderBottom: '1px solid var(--border, #1e2d3d)' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '72px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 48, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--mint, #0fe3b0)', marginBottom: 14 }}>Planet First</div>
            <h2 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 18px', lineHeight: 1.3 }}>Digital healthcare has a smaller footprint</h2>
            <p style={{ fontSize: 13.5, color: 'var(--text2, #94a3b8)', lineHeight: 1.75, margin: '0 0 16px' }}>
              The traditional healthcare system generates tonnes of paper waste annually — prescriptions, referrals, lab orders, patient records. MediConnect digitises every one of these touchpoints.
            </p>
            <p style={{ fontSize: 13.5, color: 'var(--text2, #94a3b8)', lineHeight: 1.75, margin: 0 }}>
              Our offline-first mobile and desktop apps mean patients in rural or low-connectivity areas can access care without repeated in-person trips. Less travel, lower emissions, same quality of care.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              ['📄', 'Paperless prescriptions', 'QR-verified digital Rx replaces printed prescriptions'],
              ['🚗', 'Fewer unnecessary trips', 'Teleconsultation and remote lab result delivery'],
              ['🌐', 'Low-bandwidth design', 'Optimised for 2G/3G — accessible to remote communities'],
              ['♻️', 'Lean infrastructure', 'Minimal data footprint; no unnecessary data retention'],
            ].map(([icon, title, desc]) => (
              <div key={title} style={{ display: 'flex', gap: 14, padding: '14px 16px', background: 'var(--bg3, #1e293b)', borderRadius: 10, border: '1px solid var(--border, #1e2d3d)' }}>
                <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>{icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3, #64748b)' }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solidarity */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '72px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text3, #64748b)', marginBottom: 14 }}>Community</div>
        <h2 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 18px', letterSpacing: '-0.01em' }}>Built for everyone, not just the privileged few</h2>
        <p style={{ fontSize: 14, color: 'var(--text2, #94a3b8)', lineHeight: 1.8, maxWidth: 620, margin: '0 auto 48px' }}>
          We actively design against the digital divide. MediConnect is available in Arabic, English, and French. Our mobile app works offline. Our pricing supports small clinics. And we reserve a portion of every subscription fee to fund free access for community health workers in underserved regions.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, maxWidth: 700, margin: '0 auto' }}>
          {[
            ['🌍', 'Arabic-first, RTL support'],
            ['📵', 'Offline-capable mobile app'],
            ['🏥', 'Priced for independent clinics'],
            ['❤️', 'Free tier for community health workers'],
          ].map(([icon, label]) => (
            <div key={label} style={{ padding: '18px 16px', background: 'var(--bg2, #0d1a2b)', border: '1px solid var(--border, #1e2d3d)', borderRadius: 10, fontSize: 13, color: 'var(--text2, #94a3b8)' }}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>{icon}</div>
              {label}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: 'linear-gradient(135deg, rgba(15,227,176,0.07), rgba(8,145,178,0.05))', borderTop: '1px solid rgba(15,227,176,0.15)', padding: '64px 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 14px' }}>Join a healthcare platform you can trust</h2>
        <p style={{ fontSize: 14, color: 'var(--text2, #94a3b8)', margin: '0 auto 32px', maxWidth: 480, lineHeight: 1.7 }}>
          Whether you are a doctor, a patient, a pharmacist, or a lab technician — MediConnect is built with your dignity and your community in mind.
        </p>
        <button onClick={() => navigate('/register')} style={{ padding: '13px 36px', borderRadius: 10, background: 'var(--mint, #0fe3b0)', border: 'none', color: '#000', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          Create your account
        </button>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border, #1e2d3d)', padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--text3, #64748b)' }}>© {new Date().getFullYear()} MediConnect. All rights reserved.</span>
        <div style={{ display: 'flex', gap: 24 }}>
          {[['Privacy', '/privacy'], ['Terms', '/terms'], ['Download', '/download']].map(([label, path]) => (
            <span key={label} onClick={() => navigate(path)} style={{ fontSize: 12, color: 'var(--text3, #64748b)', cursor: 'pointer' }}>{label}</span>
          ))}
        </div>
      </footer>
    </div>
  );
}
