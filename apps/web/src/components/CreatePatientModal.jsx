import { useState } from 'react';
import { createPatient } from '../api/auth';

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'grid', placeItems:'center', zIndex:1000 },
  modal:   { background:'var(--bg2,#0d1a2b)', border:'1px solid var(--border,#1e2d3d)', borderRadius:14, padding:28, width:'min(440px, 92vw)', display:'flex', flexDirection:'column', gap:18 },
  title:   { fontFamily:'var(--font-display)', fontSize:18, fontWeight:600, marginBottom:2 },
  label:   { display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2,#94a3b8)', marginBottom:6 },
  input:   { width:'100%', padding:'9px 12px', background:'var(--bg3,#1e293b)', border:'1px solid var(--border,#1e2d3d)', borderRadius:8, color:'var(--text,#e2e8f0)', fontSize:13, outline:'none', boxSizing:'border-box' },
  error:   { fontSize:12, color:'#f43f5e', marginTop:4 },
  row:     { display:'flex', gap:10, justifyContent:'flex-end', marginTop:4 },
  btnMint: { padding:'9px 20px', borderRadius:8, border:'none', cursor:'pointer', background:'var(--mint,#0fe3b0)', color:'#000', fontWeight:600, fontSize:13 },
  btnGray: { padding:'9px 20px', borderRadius:8, border:'1px solid var(--border,#1e2d3d)', cursor:'pointer', background:'transparent', color:'var(--text2,#94a3b8)', fontSize:13 },
};

export default function CreatePatientModal({ onClose, onCreated }) {
  const [form, setForm]       = useState({ name: '', phone: '', password: '', email: '' });
  const [errors, setErrors]   = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [showPw, setShowPw]   = useState(false);

  const set = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.name.trim())         e.name     = 'Name is required';
    if (!form.phone.trim())        e.phone    = 'Phone is required';
    if (form.password.length < 8)  e.password = 'Minimum 8 characters';
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email format';
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setLoading(true);
    try {
      const payload = { name: form.name.trim(), phone: form.phone.trim(), password: form.password };
      if (form.email.trim()) payload.email = form.email.trim();
      const patient = await createPatient(payload);
      setSuccess(patient);
      onCreated?.(patient);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to create patient';
      if (msg.toLowerCase().includes('phone')) setErrors({ phone: msg });
      else if (msg.toLowerCase().includes('email')) setErrors({ email: msg });
      else setErrors({ form: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.title}>Add Patient Account</div>

        {success ? (
          <>
            <div style={{ fontSize:14, color:'var(--mint,#0fe3b0)' }}>
              Patient created — <strong>{success.name}</strong> ({success.phone})
            </div>
            <div style={{ fontSize:12, color:'var(--text2)' }}>
              Share the temporary password with them so they can log in.
            </div>
            <div style={S.row}>
              <button style={S.btnMint} onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {errors.form && <div style={S.error}>{errors.form}</div>}

            <div>
              <label style={S.label}>Full Name *</label>
              <input style={S.input} value={form.name} onChange={set('name')} placeholder="Fatima Al-Zahra" />
              {errors.name && <div style={S.error}>{errors.name}</div>}
            </div>

            <div>
              <label style={S.label}>
                Phone Number *{' '}
                <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0 }}>(international format: +966…)</span>
              </label>
              <input style={S.input} value={form.phone} onChange={set('phone')} placeholder="+966501234567" type="tel" />
              {errors.phone && <div style={S.error}>{errors.phone}</div>}
            </div>

            <div>
              <label style={S.label}>Temporary Password *</label>
              <div style={{ position: 'relative' }}>
                <input
                  style={{ ...S.input, paddingRight: 40 }}
                  value={form.password}
                  onChange={set('password')}
                  type={showPw ? 'text' : 'password'}
                  placeholder="Min 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  title={showPw ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text2)', padding: 2, lineHeight: 1, fontSize: 16,
                  }}
                >
                  {showPw ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
              {errors.password && <div style={S.error}>{errors.password}</div>}
            </div>

            <div>
              <label style={S.label}>
                Email{' '}
                <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0 }}>(optional)</span>
              </label>
              <input style={S.input} value={form.email} onChange={set('email')} type="email" placeholder="patient@example.com" />
              {errors.email && <div style={S.error}>{errors.email}</div>}
            </div>

            <div style={S.row}>
              <button type="button" style={S.btnGray} onClick={onClose}>Cancel</button>
              <button type="submit" style={{ ...S.btnMint, opacity: loading ? 0.6 : 1 }} disabled={loading}>
                {loading ? 'Creating…' : 'Create Patient'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
