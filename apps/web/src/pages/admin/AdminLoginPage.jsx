import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [secret, setSecret] = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/admin/auth`, { secret });
      sessionStorage.setItem('admin-secret', secret);
      navigate('/admin');
    } catch {
      setError('Invalid admin secret');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg, #060d18)' }}>
      <div style={{ width: 360, padding: 32, background: 'var(--bg2, #0d1a2b)', border: '1px solid var(--border, #1e2d3d)', borderRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{ width: 32, height: 32, background: 'var(--mint, #0fe3b0)', borderRadius: 8, display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 800, color: '#000' }}>M</div>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--text, #e2e8f0)' }}>Admin Panel</span>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text2, #94a3b8)', display: 'block', marginBottom: 6 }}>Admin Secret</label>
            <input
              type="password"
              value={secret}
              onChange={e => setSecret(e.target.value)}
              autoFocus
              required
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', background: 'var(--bg3, #1e293b)', border: '1px solid var(--border, #1e2d3d)', borderRadius: 8, color: 'var(--text, #e2e8f0)', fontSize: 14, outline: 'none' }}
            />
          </div>
          {error && <div style={{ fontSize: 13, color: '#f43f5e' }}>{error}</div>}
          <button
            type="submit"
            disabled={loading || !secret}
            style={{ padding: '11px 0', background: 'var(--mint, #0fe3b0)', border: 'none', borderRadius: 8, color: '#000', fontWeight: 700, fontSize: 14, cursor: loading || !secret ? 'not-allowed' : 'pointer', opacity: loading || !secret ? 0.6 : 1 }}
          >
            {loading ? 'Verifying…' : 'Access Admin Panel'}
          </button>
        </form>
      </div>
    </div>
  );
}
