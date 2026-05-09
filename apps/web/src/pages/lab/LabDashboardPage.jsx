import { useState, useEffect } from 'react';
import client from '../../api/client';
import Button from '../../components/ui/Button';

export default function LabDashboardPage() {
  const [uploads, setUploads] = useState([]);
  const [form, setForm] = useState({ patientId:'', labName:'', testName:'', result:'' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [approved, setApproved] = useState(true);

  useEffect(() => {
    client.get('/lab-results/my-uploads')
      .then(data => { setUploads(data); setApproved(true); })
      .catch(e => { if (e?.message?.includes('pending approval')) setApproved(false); });
  }, []);

  const submit = async () => {
    if (!form.patientId || !form.labName || !form.testName) {
      setError('Patient ID, lab name and test name are required');
      return;
    }
    setSubmitting(true); setError('');
    try {
      const result = await client.post('/lab-results', {
        patientId: form.patientId,
        labName: form.labName,
        tests: [{ name: form.testName, value: form.result, flag: 'normal' }],
        status: 'ready',
      });
      setUploads(u => [result, ...u]);
      setForm(f => ({ ...f, patientId:'', labName:'', testName:'', result:'' }));
    } catch (e) {
      setError(e.message || 'Upload failed');
    } finally { setSubmitting(false); }
  };

  if (!approved) {
    return (
      <div style={{ padding:40, textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>⏳</div>
        <div style={{ fontSize:18, fontWeight:500, marginBottom:8 }}>Account Pending Approval</div>
        <div style={{ fontSize:13, color:'var(--text2)' }}>An administrator needs to approve your lab account before you can upload results.</div>
      </div>
    );
  }

  return (
    <div style={{ padding:26, maxWidth:700 }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500, marginBottom:24 }}>Upload Lab Result</div>

      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:22, marginBottom:28 }}>
        {[['patientId','Patient ID (MongoDB ObjectId)'],['labName','Lab Name'],['testName','Test Name'],['result','Result Value']].map(([k,l]) => (
          <div key={k} style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', marginBottom:6 }}>{l}</label>
            <input value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
              style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'10px 13px', color:'var(--text)', fontSize:13, outline:'none', boxSizing:'border-box' }} />
          </div>
        ))}
        {error && <p style={{ color:'var(--rose)', fontSize:13, marginBottom:12 }}>{error}</p>}
        <Button onClick={submit} disabled={submitting} style={{ padding:'10px 24px' }}>
          {submitting ? 'Uploading…' : 'Upload Result'}
        </Button>
      </div>

      <div style={{ fontSize:14, fontWeight:600, marginBottom:12 }}>My Uploads</div>
      {uploads.length === 0 && <p style={{ fontSize:13, color:'var(--text3)' }}>No uploads yet.</p>}
      {uploads.map(u => (
        <div key={u._id} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', padding:'12px 16px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:500 }}>{u.labName}</div>
            <div style={{ fontSize:11.5, color:'var(--text2)', marginTop:2 }}>{u.tests?.map(t => t.name).join(', ')}</div>
          </div>
          <div style={{ fontSize:11, color:'var(--text3)' }}>{new Date(u.createdAt).toLocaleDateString()}</div>
        </div>
      ))}
    </div>
  );
}
