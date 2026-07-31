import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import client from '../../api/client';

export default function AcceptInvitePage() {
  const [params]                = useSearchParams();
  const navigate                = useNavigate();
  const { login }               = useAuthStore();
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const token = params.get('token');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('كلمتا المرور غير متطابقتين'); return; }
    if (password.length < 8)  { setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل'); return; }
    if (!token)               { setError('رابط الدعوة غير صالح'); return; }

    setLoading(true); setError('');
    try {
      // client already unwraps res.data via interceptor
      const data = await client.post('/auth/accept-invite', { token, password });
      login(data.user, data.token);
      navigate('/secretary/waiting-room', { replace: true });
    } catch (err) {
      setError(err?.message || 'حدث خطأ، حاول مجدداً');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: 'var(--bg)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: '100%', maxWidth: 400, boxShadow: '0 2px 12px rgba(0,0,0,.08)' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px', color: 'var(--primary)' }}>تفعيل الحساب</h1>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 24px' }}>أدخل كلمة مرور لتفعيل حسابك</p>

        {error && <p style={{ fontSize: 13, color: 'var(--rose)', marginBottom: 16 }}>{error}</p>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            type="password"
            placeholder="كلمة المرور (8 أحرف على الأقل)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)' }}
          />
          <input
            type="password"
            placeholder="تأكيد كلمة المرور"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)' }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{ padding: '11px', borderRadius: 8, background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'جاري التفعيل...' : 'تفعيل الحساب'}
          </button>
        </form>
      </div>
    </div>
  );
}
