import { useState } from 'react';
import { useAuthStore } from '../store/authStore.js';

const S = {
  page:    { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' },
  card:    { width: 380, padding: 40, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16 },
  logo:    { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 },
  icon:    { width: 40, height: 40, background: 'var(--mint)', borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 800, color: '#000' },
  input:   { width: '100%', padding: '10px 14px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none', marginBottom: 14 },
  btn:     { width: '100%', padding: 12, background: 'var(--mint)', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#000', cursor: 'pointer' },
  error:   { color: '#f43f5e', fontSize: 13, marginBottom: 12 },
  hint:    { marginTop: 20, fontSize: 11, color: 'var(--text3)', textAlign: 'center' },
};

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password,   setPassword]   = useState('');
  const { login, loading, error } = useAuthStore();

  const submit = async (e) => {
    e.preventDefault();
    await login(identifier, password);
  };

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>
          <div style={S.icon}>M</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>MediConnect</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Desktop</div>
          </div>
        </div>
        <form onSubmit={submit}>
          {error && <div style={S.error}>{error}</div>}
          <input style={S.input} type="text" placeholder="Email or phone number"
            value={identifier} onChange={e => setIdentifier(e.target.value)} required autoFocus />
          <input style={S.input} type="password" placeholder="Password"
            value={password} onChange={e => setPassword(e.target.value)} required />
          <button style={{ ...S.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <div style={S.hint}>Pharmacy · Doctor · Laboratory</div>
      </div>
    </div>
  );
}
