import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../store/authStore.js';
import SyncBadge from '../../components/SyncBadge.jsx';

const S = {
  layout:  { minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  header:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10 },
  nav:     { display: 'flex', gap: 2, padding: '0 24px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' },
  content: { padding: 24, flex: 1 },
  card:    { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 12 },
  input:   { width: '100%', padding: '9px 12px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' },
  textarea:{ width: '100%', padding: '9px 12px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical', minHeight: 72, fontFamily: 'inherit' },
  btn: (v = 'primary') => ({
    padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
    background: v === 'primary' ? 'var(--mint)' : v === 'danger' ? '#ef4444' : 'var(--bg3)',
    color:      v === 'primary' ? '#0a0f0d'     : v === 'danger' ? '#fff'    : 'var(--text)',
  }),
  tabBtn: (a) => ({
    padding: '10px 16px', fontSize: 13, fontWeight: 500, border: 'none',
    borderBottom: a ? '2px solid var(--mint)' : '2px solid transparent',
    background: 'transparent', color: a ? 'var(--mint)' : 'var(--text2)', cursor: 'pointer',
  }),
  badge: (c) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: `${c}22`, color: c }),
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
};

const STATUS_COLOR = { scheduled: '#3b82f6', completed: '#0fe3b0', cancelled: '#ef4444' };

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Appointments ────────────────────────────────────────────────────────────────
function AppointmentsTab() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate]  = useState(today);
  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const rows = await window.api.db.appointments.listByDate(date);
      setAppts(Array.isArray(rows) ? rows : []);
    } catch (e) { setErr(e.message); }
    finally    { setLoading(false); }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(appt, status) {
    const now = new Date().toISOString();
    await window.api.db.appointments.upsert({ ...appt, status, updatedAt: now });
    load();
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <label style={{ ...S.label, margin: 0 }}>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          style={{ ...S.input, width: 160 }} />
        <button onClick={load} style={S.btn('secondary')}>Refresh</button>
      </div>

      {loading && <p style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</p>}
      {err     && <p style={{ color: '#ef4444', fontSize: 13 }}>Error: {err}</p>}
      {!loading && !err && appts.length === 0 && (
        <p style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>No appointments for this date</p>
      )}

      {appts.map((a) => (
        <div key={a._id} style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{a.patientName || '—'}</span>
                <span style={S.badge(STATUS_COLOR[a.status] || '#6b7280')}>{a.status}</span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text2)' }}>
                {new Date(a.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {a.notes && <> · {a.notes}</>}
              </p>
            </div>
            {a.status === 'scheduled' && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => updateStatus(a, 'completed')} style={{ ...S.btn('primary'), padding: '6px 12px' }}>Complete</button>
                <button onClick={() => updateStatus(a, 'cancelled')} style={{ ...S.btn('danger'),  padding: '6px 12px' }}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Patients ────────────────────────────────────────────────────────────────────
function PatientsTab() {
  const [patients,  setPatients] = useState([]);
  const [search,    setSearch]   = useState('');
  const [selected,  setSelected] = useState(null);
  const [loading,   setLoading]  = useState(true);
  const [err,       setErr]      = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null);
      try {
        const rows = await window.api.db.patients.list();
        setPatients(Array.isArray(rows) ? rows : []);
      } catch (e) { setErr(e.message); }
      finally    { setLoading(false); }
    })();
  }, []);

  const filtered = patients.filter((p) =>
    !search || (p.name || '').toLowerCase().includes(search.toLowerCase())
  );

  if (selected) {
    return (
      <div>
        <button onClick={() => setSelected(null)} style={{ ...S.btn('secondary'), marginBottom: 16 }}>← Back</button>
        <div style={S.card}>
          <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{selected.name}</h2>
          {selected.phone && (
            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>Phone</label>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>{selected.phone}</p>
            </div>
          )}
          {selected.allergies && (
            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>Allergies</label>
              <p style={{ margin: 0, fontSize: 13, color: '#ef4444' }}>{selected.allergies}</p>
            </div>
          )}
          {selected.conditions && (
            <div>
              <label style={S.label}>Conditions</label>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>{selected.conditions}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <input placeholder="Search patients…" value={search} onChange={(e) => setSearch(e.target.value)}
        style={{ ...S.input, maxWidth: 320, marginBottom: 16 }} />

      {loading && <p style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</p>}
      {err     && <p style={{ color: '#ef4444', fontSize: 13 }}>Error: {err}</p>}
      {!loading && !err && filtered.length === 0 && (
        <p style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>No patients found</p>
      )}

      {filtered.map((p) => (
        <div key={p._id} style={{ ...S.card, cursor: 'pointer' }} onClick={() => setSelected(p)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{p.name}</p>
              {p.phone && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text2)' }}>{p.phone}</p>}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>View →</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Prescriptions ───────────────────────────────────────────────────────────────
const EMPTY_MED = () => ({ name: '', dosage: '', frequency: '', duration: '' });

function PrescriptionsTab() {
  const [prescriptions, setRxList]   = useState([]);
  const [patients,      setPatients] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [err,      setErr]      = useState(null);

  const [patientId,    setPatientId]    = useState('');
  const [instructions, setInstructions] = useState('');
  const [meds,         setMeds]         = useState([EMPTY_MED()]);
  const [saving,       setSaving]       = useState(false);
  const [formErr,      setFormErr]      = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [rxRows, patRows] = await Promise.all([
        window.api.db.prescriptions.list(),
        window.api.db.patients.list(),
      ]);
      setRxList(Array.isArray(rxRows) ? rxRows : []);
      setPatients(Array.isArray(patRows) ? patRows : []);
    } catch (e) { setErr(e.message); }
    finally    { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateMed(i, field, val) {
    setMeds((prev) => prev.map((m, idx) => (idx === i ? { ...m, [field]: val } : m)));
  }

  async function handleCreate() {
    if (!patientId) { setFormErr('Select a patient'); return; }
    if (meds.some((m) => !m.name.trim())) { setFormErr('All medications need a name'); return; }
    setSaving(true); setFormErr(null);
    try {
      const patient = patients.find((p) => p._id === patientId);
      const now = new Date().toISOString();
      await window.api.db.prescriptions.create({
        _id:         uid(),
        patientId,
        patientName: patient?.name ?? '',
        medications: JSON.stringify(meds),
        instructions,
        status:      'pending',
        qrToken:     null,
        createdAt:   now,
        updatedAt:   now,
      });
      setShowForm(false);
      setPatientId(''); setInstructions(''); setMeds([EMPTY_MED()]);
      load();
    } catch (e) { setFormErr(e.message); }
    finally    { setSaving(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={() => setShowForm((v) => !v)} style={S.btn()}>
          {showForm ? 'Cancel' : '+ New Prescription'}
        </button>
      </div>

      {showForm && (
        <div style={{ ...S.card, marginBottom: 20, border: '1px solid var(--mint)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>New Prescription</h3>

          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>Patient</label>
            <select value={patientId} onChange={(e) => setPatientId(e.target.value)} style={S.input}>
              <option value="">— Select patient —</option>
              {patients.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>

          <label style={{ ...S.label, marginBottom: 8 }}>Medications</label>
          {meds.map((m, i) => (
            <div key={i} style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                {['name', 'dosage', 'frequency', 'duration'].map((field) => (
                  <div key={field}>
                    <label style={S.label}>{field}</label>
                    <input style={S.input} value={m[field]} placeholder={field}
                      onChange={(e) => updateMed(i, field, e.target.value)} />
                  </div>
                ))}
                <button onClick={() => setMeds((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={meds.length === 1}
                  style={{ ...S.btn('danger'), padding: '9px 12px', alignSelf: 'flex-end', opacity: meds.length === 1 ? 0.4 : 1 }}>
                  ✕
                </button>
              </div>
            </div>
          ))}
          <button onClick={() => setMeds((prev) => [...prev, EMPTY_MED()])}
            style={{ ...S.btn('secondary'), marginBottom: 16 }}>+ Add medication</button>

          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>Instructions</label>
            <textarea style={S.textarea} value={instructions} placeholder="Special instructions…"
              onChange={(e) => setInstructions(e.target.value)} />
          </div>

          {formErr && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{formErr}</p>}
          <button onClick={handleCreate} disabled={saving} style={S.btn()}>
            {saving ? 'Saving…' : 'Create Prescription'}
          </button>
        </div>
      )}

      {loading && <p style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</p>}
      {err     && <p style={{ color: '#ef4444', fontSize: 13 }}>Error: {err}</p>}
      {!loading && !err && prescriptions.length === 0 && !showForm && (
        <p style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>No prescriptions yet</p>
      )}

      {prescriptions.map((rx) => {
        const parsedMeds = (() => { try { return JSON.parse(rx.medications); } catch { return []; } })();
        const medNames = Array.isArray(parsedMeds)
          ? parsedMeds.map((m) => m.name).filter(Boolean).join(', ')
          : rx.medications;
        return (
          <div key={rx._id} style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{rx.patientName || '—'}</span>
                  <span style={S.badge(rx.status === 'dispensed' ? '#0fe3b0' : '#f59e0b')}>{rx.status}</span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text2)' }}>{medNames}</p>
                {rx.instructions && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text3)' }}>{rx.instructions}</p>
                )}
              </div>
              <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
                {new Date(rx.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'appointments',  label: 'Appointments' },
  { id: 'patients',      label: 'Patients' },
  { id: 'prescriptions', label: 'Prescriptions' },
];

export default function DoctorLayout() {
  const { user, logout } = useAuthStore();
  const [tab, setTab] = useState('appointments');

  return (
    <div style={S.layout}>
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--mint)' }}>Salamtak</span>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>Doctor</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SyncBadge />
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{user?.name || user?.email}</span>
          <button onClick={logout} style={S.btn('secondary')}>Log out</button>
        </div>
      </header>

      <nav style={S.nav}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={S.tabBtn(tab === t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main style={S.content}>
        {tab === 'appointments'  && <AppointmentsTab />}
        {tab === 'patients'      && <PatientsTab />}
        {tab === 'prescriptions' && <PrescriptionsTab />}
      </main>
    </div>
  );
}
