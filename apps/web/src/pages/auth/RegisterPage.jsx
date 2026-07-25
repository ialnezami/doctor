import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { register } from '../../api/auth';
import useAuthStore from '../../store/authStore';
import Button from '../../components/ui/Button';
// import GoogleSignInButton from '../../components/GoogleSignInButton';

const SPECIALTIES = [
  { key: 'general',            en: 'General Medicine' },
  { key: 'dentistry',          en: 'Dentistry' },
  { key: 'ophthalmology',      en: 'Ophthalmology' },
  { key: 'pediatrics',         en: 'Pediatrics' },
  { key: 'obstetrics',         en: 'OB/GYN' },
  { key: 'internal_medicine',  en: 'Internal Medicine' },
  { key: 'ent',                en: 'ENT' },
  { key: 'cardiology',         en: 'Cardiology' },
  { key: 'orthopedics',        en: 'Orthopedics' },
  { key: 'general_surgery',    en: 'General Surgery' },
  { key: 'psychiatry',         en: 'Psychiatry' },
  { key: 'dermatology',        en: 'Dermatology' },
  { key: 'aesthetics',         en: 'Aesthetics' },
  { key: 'neurology',          en: 'Neurology' },
  { key: 'vascular',           en: 'Vascular' },
  { key: 'oncology',           en: 'Oncology' },
  { key: 'nutrition',          en: 'Nutrition' },
  { key: 'endocrinology',      en: 'Endocrinology & Diabetes' },
  { key: 'urology',            en: 'Urology' },
  { key: 'gastroenterology',   en: 'Gastroenterology' },
  { key: 'physical_therapy',   en: 'Physical Therapy' },
  { key: 'thoracic_surgery',   en: 'Thoracic Surgery' },
  { key: 'neurosurgery',       en: 'Neurosurgery' },
  { key: 'orthopedic_surgery', en: 'Orthopedic Surgery' },
  { key: 'vascular_surgery',   en: 'Vascular Surgery' },
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore(s => s.login);
  const [form, setForm] = useState({ name:'', email:'', password:'', role:'patient', specialty:'', labName:'', consentAccepted: true });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { token, user } = await register(form);
      setAuth(user, token);
      navigate(user.role === 'doctor' ? '/dashboard' : user.role === 'laboratory' ? '/lab' : user.role === 'pharmacy' ? '/pharmacy' : '/find-doctor');
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:24 }}>
      <div style={{ width:'100%', maxWidth:440, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'32px 24px' }}>
        <div style={{ marginBottom:28, textAlign:'center' }}>
          <div style={{ width:48, height:48, background:'var(--mint)', borderRadius:14, display:'grid', placeItems:'center', fontSize:22, fontWeight:800, color:'#000', margin:'0 auto 14px' }}>M</div>
          <h2 style={{ fontFamily:'var(--font-display)', fontSize:26, fontWeight:500 }}>Create account</h2>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:3, marginBottom:22 }}>
          {['patient','doctor','laboratory','pharmacy'].map(r => (
            <button key={r} onClick={() => setForm(p => ({ ...p, role: r }))}
              style={{ padding:10, border: form.role===r ? '1px solid var(--border2)' : 'none', borderRadius:7, background: form.role===r ? 'var(--bg2)' : 'transparent', color: form.role===r ? 'var(--mint)' : 'var(--text2)', fontWeight: form.role===r ? 600 : 500, fontSize:13, textTransform:'capitalize', transition:'all .18s' }}>
              {r === 'doctor' ? '👨‍⚕️ Doctor' : r === 'patient' ? '🧑 Patient' : r === 'laboratory' ? '🧪 Lab' : '💊 Pharmacy'}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          {[['name','Full Name','text'],['email','Email','email'],['password','Password (min 8 chars)','password']].map(([name,label,type]) => (
            <div key={name} style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', marginBottom:6 }}>{label}</label>
              <input type={type} required value={form[name]} onChange={e => setForm(p => ({ ...p, [name]: e.target.value }))}
                style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'10px 13px', color:'var(--text)', fontSize:13, outline:'none' }} />
            </div>
          ))}
          {form.role === 'doctor' && (
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', marginBottom:6 }}>Specialty</label>
              <select value={form.specialty} onChange={e => setForm(p => ({ ...p, specialty: e.target.value }))}
                style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'10px 13px', color: form.specialty ? 'var(--text)' : 'var(--text3)', fontSize:13, outline:'none', cursor:'pointer' }}>
                <option value="" disabled>Select specialty</option>
                {SPECIALTIES.map(s => <option key={s.key} value={s.en}>{s.en}</option>)}
              </select>
            </div>
          )}
          {form.role === 'laboratory' && (
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', marginBottom:6 }}>Lab Name</label>
              <input value={form.labName} onChange={e => setForm(p => ({ ...p, labName: e.target.value }))}
                placeholder="e.g. City Diagnostics Lab"
                style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'10px 13px', color:'var(--text)', fontSize:13, outline:'none' }} />
            </div>
          )}
          {error && <p style={{ color:'var(--rose)', fontSize:13, marginBottom:12 }}>{error}</p>}
          <Button type="submit" full disabled={loading} style={{ padding:12, fontSize:14 }}>
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        {/* Google sign-up — note reflects selected role */}
        {/* Google sign-in — disabled until VITE_GOOGLE_CLIENT_ID is configured
        <div style={{ display:'flex', alignItems:'center', gap:12, margin:'20px 0 16px' }}>
          <div style={{ flex:1, height:1, background:'var(--border)' }} />
          <span style={{ color:'var(--text2)', fontSize:12 }}>or</span>
          <div style={{ flex:1, height:1, background:'var(--border)' }} />
        </div>
        <GoogleSignInButton />
        <p style={{ color:'var(--text2)', fontSize:12, textAlign:'center', margin:'8px 0 0' }}>
          Google sign-up creates a{form.role === 'doctor' ? ' doctor' : form.role === 'laboratory' ? ' lab' : form.role === 'pharmacy' ? ' pharmacy' : ' patient'} account
        </p>
        */}

        <p style={{ fontSize:12.5, color:'var(--text2)', textAlign:'center', marginTop:20 }}>
          Already have an account? <Link to="/login" style={{ color:'var(--mint)' }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
