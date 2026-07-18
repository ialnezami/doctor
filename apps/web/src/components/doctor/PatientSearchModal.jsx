import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function PatientSearchModal({ onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_BASE}/api/patients`, {
          params: { search: query.trim() },
          headers: { Authorization: `Bearer ${token}` },
        });
        setResults(res.data?.patients || res.data || []);
      } catch {
        setError('فشل البحث، حاول مجدداً');
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const goToPatient = (id) => { navigate(`/patients/${id}`); onClose(); };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 100 }} />
      <div style={{
        position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)',
        width: '90%', maxWidth: 560, background: '#fff', borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)', zIndex: 101, overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border)', gap: 10 }}>
          <Search size={18} color="var(--text3)" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ابحث عن مريض بالاسم أو الهاتف..."
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, color: 'var(--text)', background: 'transparent', direction: 'rtl' }}
          />
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {loading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>جاري البحث...</div>}
          {error && <div style={{ padding: 20, textAlign: 'center', color: 'var(--rose)', fontSize: 13 }}>{error}</div>}
          {!loading && !error && results.length === 0 && query.trim() && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>لا توجد نتائج</div>
          )}
          {!loading && results.map(p => (
            <div
              key={p._id}
              onClick={() => goToPatient(p._id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background .1s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-dim)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--primary-dim)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>
                {p.name?.[0] || '؟'}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                {p.phone && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{p.phone}</div>}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '10px 16px', background: 'var(--bg)', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', display: 'flex', gap: 16 }}>
          <span>↵ للفتح</span>
          <span>Esc للإغلاق</span>
        </div>
      </div>
    </>
  );
}
