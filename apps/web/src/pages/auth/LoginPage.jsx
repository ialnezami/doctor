import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login } from '../../api/auth';
import useAuthStore from '../../store/authStore';
import Button from '../../components/ui/Button';

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore(s => s.login);
  const [role, setRole] = useState('doctor');
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { token, user } = await login(form);
      setAuth(user, token);
      navigate(user.role === 'doctor' ? '/dashboard' : '/find-doctor');
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display:'flex', height:'100vh' }}>
      {/* Left panel */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', padding:56, background:'var(--bg2)', borderRight:'1px solid var(--border)', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 65% 55% at 20% 30%, rgba(15,227,176,0.08) 0%, transparent 60%), radial-gradient(ellipse 45% 40% at 80% 70%, rgba(96,165,250,0.06) 0%, transparent 60%)', pointerEvents:'none' }} />
        <div style={{ textAlign:'center', marginBottom:52 }}>
          <div style={{ width:60, height:60, background:'var(--mint)', borderRadius:18, display:'grid', placeItems:'center', fontSize:26, fontWeight:800, color:'#000', margin:'0 auto 18px', boxShadow:'0 0 50px rgba(15,227,176,0.25)' }}>M</div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:40, fontWeight:600, lineHeight:1.2 }}>Healthcare<br /><em style={{ color:'var(--mint)' }}>reimagined.</em></h1>
          <p style={{ fontSize:14, color:'var(--text2)', marginTop:10 }}>Connect doctors and patients seamlessly.</p>
        </div>
        {[
          { icon:'🩺', title:'Smart Scheduling', desc:'Manage appointments with zero conflicts' },
          { icon:'📋', title:'Digital Prescriptions', desc:'Create & export PDF ordonnances instantly' },
          { icon:'📍', title:'Location-based Search', desc:'Find nearby doctors by specialty' },
        ].map(f => (
          <div key={f.title} style={{ display:'flex', alignItems:'center', gap:13, padding:'14px 16px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r)', marginBottom:12, width:'100%', maxWidth:340 }}>
            <div style={{ width:34, height:34, borderRadius:9, background:'var(--mint-dim)', display:'grid', placeItems:'center', fontSize:17, flexShrink:0 }}>{f.icon}</div>
            <div><div style={{ fontSize:13.5, fontWeight:600 }}>{f.title}</div><div style={{ fontSize:11.5, color:'var(--text2)', marginTop:2 }}>{f.desc}</div></div>
          </div>
        ))}
      </div>

      {/* Right panel - form */}
      <div style={{ width:420, display:'flex', flexDirection:'column', justifyContent:'center', padding:'56px 46px' }}>
        <h2 style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:500, marginBottom:7 }}>Welcome back</h2>
        <p style={{ fontSize:13, color:'var(--text2)', marginBottom:26 }}>Sign in to your MediConnect account</p>

        {/* Role toggle */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:3, marginBottom:22 }}>
          {['doctor','patient'].map(r => (
            <button key={r} onClick={() => setRole(r)}
              style={{ padding:11, border: role===r ? '1px solid var(--border2)' : 'none', borderRadius:7, background: role===r ? 'var(--bg3)' : 'transparent', color: role===r ? 'var(--text)' : 'var(--text2)', fontWeight: role===r ? 600 : 500, fontSize:13.5, textTransform:'capitalize', transition:'all .18s' }}>
              {r === 'doctor' ? '👨‍⚕️' : '🧑‍🤝‍🧑'} {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          {[['email','Email','email'],['password','Password','password']].map(([name, label, type]) => (
            <div key={name} style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', marginBottom:7 }}>{label}</label>
              <input type={type} required value={form[name]} onChange={e => setForm(p => ({ ...p, [name]: e.target.value }))}
                style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'10px 13px', color:'var(--text)', fontSize:13.5, outline:'none' }} />
            </div>
          ))}
          {error && <p style={{ color:'var(--rose)', fontSize:13, marginBottom:12 }}>{error}</p>}
          <Button type="submit" full disabled={loading} style={{ padding:13, fontSize:14, marginTop:8 }}>
            {loading ? 'Signing in…' : 'Sign in →'}
          </Button>
        </form>

        <p style={{ fontSize:12.5, color:'var(--text2)', textAlign:'center', marginTop:22 }}>
          No account? <Link to="/register" style={{ color:'var(--mint)' }}>Create one free</Link>
        </p>
      </div>
    </div>
  );
}
