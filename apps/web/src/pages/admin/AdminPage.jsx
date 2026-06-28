import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import adminClient from '../../api/admin';

const TABS = ['Overview', 'Users', 'Doctors', 'Labs', 'Reviews', 'Reports'];

const REASON_LABELS = {
  harassment:            'Harassment',
  fraud:                 'Fraud',
  spam:                  'Spam',
  inappropriate_content: 'Inappropriate Content',
  fake_profile:          'Fake Profile',
  other:                 'Other',
};

const S = {
  page:    { minHeight: '100vh', background: 'var(--bg, #060d18)', color: 'var(--text, #e2e8f0)' },
  header:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', background: 'var(--bg2, #0d1a2b)', borderBottom: '1px solid var(--border, #1e2d3d)', position: 'sticky', top: 0, zIndex: 10 },
  logo:    { display: 'flex', alignItems: 'center', gap: 10 },
  tabs:    { display: 'flex', gap: 4, padding: '10px 28px', borderBottom: '1px solid var(--border, #1e2d3d)', background: 'var(--bg2, #0d1a2b)' },
  content: { padding: 28, maxWidth: 1100, margin: '0 auto' },
  card:    { background: 'var(--bg2, #0d1a2b)', border: '1px solid var(--border, #1e2d3d)', borderRadius: 10, padding: 20 },
  table:   { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:      { textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text2, #94a3b8)', borderBottom: '1px solid var(--border, #1e2d3d)' },
  td:      { padding: '10px 12px', borderBottom: '1px solid rgba(30,45,61,0.5)', verticalAlign: 'middle' },
  btn:     (variant) => ({
    padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
    background: variant === 'mint'  ? 'var(--mint, #0fe3b0)'       :
                variant === 'red'   ? 'rgba(244,63,94,0.15)'       :
                variant === 'amber' ? 'rgba(245,158,11,0.15)'      : 'rgba(255,255,255,0.07)',
    color:      variant === 'mint'  ? '#000'                        :
                variant === 'red'   ? '#f43f5e'                    :
                variant === 'amber' ? '#f59e0b'                    : 'var(--text2, #94a3b8)',
    border:     variant === 'red'   ? '1px solid rgba(244,63,94,0.3)' :
                variant === 'amber' ? '1px solid rgba(245,158,11,0.3)' : '1px solid transparent',
  }),
  badge:   (color) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: color === 'green' ? 'rgba(15,227,176,0.12)' : color === 'red' ? 'rgba(244,63,94,0.12)' : 'rgba(148,163,184,0.12)', color: color === 'green' ? 'var(--mint, #0fe3b0)' : color === 'red' ? '#f43f5e' : 'var(--text2, #94a3b8)' }),
  input:   { padding: '8px 12px', background: 'var(--bg3, #1e293b)', border: '1px solid var(--border, #1e2d3d)', borderRadius: 8, color: 'var(--text, #e2e8f0)', fontSize: 13, outline: 'none' },
};

// ── Overview ──────────────────────────────────────────────────────────────────
function OverviewTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminClient.get('/admin/stats')
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: 'var(--text2)', fontSize: 13 }}>Loading stats…</div>;
  if (!stats)  return <div style={{ color: '#f43f5e', fontSize: 13 }}>Failed to load stats</div>;

  const cards = [
    { label: 'Total Users',       value: stats.totalUsers,     color: 'var(--mint)' },
    { label: 'Doctors',           value: stats.doctors,         color: 'var(--mint)' },
    { label: 'Patients',          value: stats.patients,        color: 'var(--mint)' },
    { label: 'Labs',              value: stats.labs,            color: 'var(--mint)' },
    { label: 'Appointments',      value: stats.appointments,    color: 'var(--mint)' },
    { label: 'Flagged Reviews',   value: stats.flaggedReviews,  color: stats.flaggedReviews  > 0 ? '#f43f5e' : 'var(--mint)' },
    { label: 'Pending Doctors',   value: stats.pendingDoctors,  color: stats.pendingDoctors  > 0 ? '#f59e0b' : 'var(--mint)' },
    { label: 'Pending Labs',      value: stats.pendingLabs,     color: stats.pendingLabs     > 0 ? '#f59e0b' : 'var(--mint)' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
      {cards.map(c => (
        <div key={c.label} style={{ ...S.card, textAlign: 'center' }}>
          <div style={{ fontSize: 34, fontWeight: 700, color: c.color, marginBottom: 6 }}>{c.value}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Users ─────────────────────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers]   = useState([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [pages, setPages]   = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole]     = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (search) params.set('search', search);
      if (role)   params.set('role', role);
      const data = await adminClient.get(`/admin/users?${params}`);
      setUsers(data.users);
      setTotal(data.total);
      setPages(data.pages);
    } catch {}
    setLoading(false);
  }, [page, search, role]);

  useEffect(() => { load(); }, [load]);

  const toggleSuspend = async (user) => {
    if (!window.confirm(`${user.isSuspended ? 'Unsuspend' : 'Suspend'} ${user.name}?`)) return;
    try {
      const res = await adminClient.patch(`/admin/users/${user._id}/suspend`);
      setUsers(prev => prev.map(u => u._id === user._id ? { ...u, isSuspended: res.isSuspended } : u));
    } catch {}
  };

  const deleteUser = async (user) => {
    if (!window.confirm(`Permanently delete ${user.name}? This cannot be undone.`)) return;
    try {
      await adminClient.delete(`/admin/users/${user._id}`);
      setUsers(prev => prev.filter(u => u._id !== user._id));
      setTotal(t => t - 1);
    } catch {}
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input style={{ ...S.input, width: 240 }} placeholder="Search name or email…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <select value={role} onChange={e => { setRole(e.target.value); setPage(1); }} style={{ ...S.input }}>
          <option value="">All roles</option>
          <option value="doctor">Doctor</option>
          <option value="patient">Patient</option>
          <option value="laboratory">Laboratory</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--text2)', alignSelf: 'center' }}>{total} users</span>
      </div>

      <div style={S.card}>
        {loading ? <div style={{ fontSize: 13, color: 'var(--text2)', padding: 12 }}>Loading…</div> : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Name</th>
                <th style={S.th}>Email</th>
                <th style={S.th}>Role</th>
                <th style={S.th}>Status</th>
                <th style={S.th}>Joined</th>
                <th style={S.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id}>
                  <td style={S.td}>{u.name}</td>
                  <td style={{ ...S.td, color: 'var(--text2)', fontSize: 12 }}>{u.email}</td>
                  <td style={S.td}><span style={S.badge('default')}>{u.role}</span></td>
                  <td style={S.td}>
                    <span style={S.badge(u.isSuspended ? 'red' : 'green')}>
                      {u.isSuspended ? 'Suspended' : 'Active'}
                    </span>
                  </td>
                  <td style={{ ...S.td, color: 'var(--text2)', fontSize: 12 }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td style={S.td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={S.btn(u.isSuspended ? 'mint' : 'amber')} onClick={() => toggleSuspend(u)}>
                        {u.isSuspended ? 'Unsuspend' : 'Suspend'}
                      </button>
                      <button style={S.btn('red')} onClick={() => deleteUser(u)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!users.length && !loading && (
                <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: 'var(--text2)' }}>No users found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
          <button style={S.btn('default')} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>Page {page} of {pages}</span>
          <button style={S.btn('default')} disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ── Doctors ───────────────────────────────────────────────────────────────────
function DoctorsTab() {
  const [pending, setPending] = useState([]);
  const [all, setAll]         = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, a] = await Promise.all([
        adminClient.get('/admin/doctors/pending'),
        adminClient.get('/admin/doctors'),
      ]);
      setPending(p.doctors || []);
      setAll(a.doctors || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const verify = async (doctorId, verified) => {
    try {
      await adminClient.patch(`/admin/doctors/${doctorId}/${verified ? 'verify' : 'unverify'}`);
      load();
    } catch {}
  };

  if (loading) return <div style={{ fontSize: 13, color: 'var(--text2)' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {pending.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f59e0b', marginBottom: 12 }}>
            Pending Verification ({pending.length})
          </div>
          <div style={S.card}>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Doctor</th>
                <th style={S.th}>Specialty</th>
                <th style={S.th}>Registered</th>
                <th style={S.th}>Action</th>
              </tr></thead>
              <tbody>
                {pending.map(d => (
                  <tr key={d._id}>
                    <td style={S.td}>
                      <div>{d.userId?.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>{d.userId?.email}</div>
                    </td>
                    <td style={S.td}>{d.specialty}</td>
                    <td style={{ ...S.td, fontSize: 12, color: 'var(--text2)' }}>{new Date(d.userId?.createdAt).toLocaleDateString()}</td>
                    <td style={S.td}>
                      <button style={S.btn('mint')} onClick={() => verify(d._id, true)}>Verify</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text2)', marginBottom: 12 }}>
          All Doctors ({all.length})
        </div>
        <div style={S.card}>
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>Doctor</th>
              <th style={S.th}>Specialty</th>
              <th style={S.th}>Rating</th>
              <th style={S.th}>Status</th>
              <th style={S.th}>Action</th>
            </tr></thead>
            <tbody>
              {all.map(d => (
                <tr key={d._id}>
                  <td style={S.td}>
                    <div>{d.userId?.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>{d.userId?.email}</div>
                  </td>
                  <td style={S.td}>{d.specialty}</td>
                  <td style={S.td}>{d.averageRating?.toFixed(1) || '—'} ({d.reviewCount})</td>
                  <td style={S.td}>
                    <span style={S.badge(d.isVerified ? 'green' : 'default')}>
                      {d.isVerified ? 'Verified' : 'Unverified'}
                    </span>
                  </td>
                  <td style={S.td}>
                    <button
                      style={S.btn(d.isVerified ? 'red' : 'mint')}
                      onClick={() => verify(d._id, !d.isVerified)}
                    >
                      {d.isVerified ? 'Unverify' : 'Verify'}
                    </button>
                  </td>
                </tr>
              ))}
              {!all.length && <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: 'var(--text2)' }}>No doctors</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Labs ──────────────────────────────────────────────────────────────────────
function LabsTab() {
  const [labs, setLabs]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminClient.get('/admin/labs')
      .then(data => setLabs(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const approve = async (id) => {
    try {
      await adminClient.patch(`/admin/labs/${id}/approve`);
      setLabs(prev => prev.filter(l => l._id !== id));
    } catch {}
  };

  if (loading) return <div style={{ fontSize: 13, color: 'var(--text2)' }}>Loading…</div>;

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text2)', marginBottom: 12 }}>
        Pending Lab Approvals ({labs.length})
      </div>
      {labs.length === 0 ? (
        <div style={{ ...S.card, color: 'var(--text2)', fontSize: 13 }}>No pending lab approvals</div>
      ) : (
        <div style={S.card}>
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>Lab Name</th>
              <th style={S.th}>Email</th>
              <th style={S.th}>Registered</th>
              <th style={S.th}>Action</th>
            </tr></thead>
            <tbody>
              {labs.map(l => (
                <tr key={l._id}>
                  <td style={S.td}>{l.userId?.name || l.name}</td>
                  <td style={{ ...S.td, fontSize: 12, color: 'var(--text2)' }}>{l.userId?.email}</td>
                  <td style={{ ...S.td, fontSize: 12, color: 'var(--text2)' }}>{new Date(l.userId?.createdAt || l.createdAt).toLocaleDateString()}</td>
                  <td style={S.td}>
                    <button style={S.btn('mint')} onClick={() => approve(l._id)}>Approve</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Reviews ───────────────────────────────────────────────────────────────────
function ReviewsTab() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminClient.get('/admin/reviews/flagged')
      .then(data => setReviews(data.reviews || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const deleteReview = async (id) => {
    if (!window.confirm('Permanently delete this review?')) return;
    try {
      await adminClient.delete(`/admin/reviews/${id}`);
      setReviews(prev => prev.filter(r => r._id !== id));
    } catch {}
  };

  if (loading) return <div style={{ fontSize: 13, color: 'var(--text2)' }}>Loading…</div>;

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text2)', marginBottom: 12 }}>
        Flagged Reviews ({reviews.length})
      </div>
      {reviews.length === 0 ? (
        <div style={{ ...S.card, color: 'var(--text2)', fontSize: 13 }}>No flagged reviews</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reviews.map(r => (
            <div key={r._id} style={S.card}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{r.patientId?.name || 'Patient'}</span>
                    <span style={{ color: '#f59e0b', fontSize: 13 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                    <span style={S.badge('red')}>Flagged</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{r.comment}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3, #64748b)', marginTop: 6 }}>{new Date(r.createdAt).toLocaleDateString()}</div>
                </div>
                <button style={S.btn('red')} onClick={() => deleteReview(r._id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reports ───────────────────────────────────────────────────────────────────
function ReportsTab() {
  const [reports, setReports]   = useState([]);
  const [filter, setFilter]     = useState('pending');
  const [loading, setLoading]   = useState(true);
  const [pending, setPending]   = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    adminClient.get(`/admin/reports?status=${filter}`)
      .then(d => { setReports(d.reports || []); setPending(d.pending || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const act = async (id, action) => {
    try {
      await adminClient.patch(`/admin/reports/${id}/${action}`);
      setReports(prev => prev.filter(r => r._id !== id));
      if (action === 'resolve' || action === 'dismiss') setPending(p => Math.max(0, p - 1));
    } catch {}
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text2)' }}>
          Abuse & Misconduct Reports
        </div>
        {pending > 0 && <span style={S.badge('red')}>{pending} pending</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {['pending','resolved','dismissed'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              style={{ ...S.btn(filter === s ? 'mint' : 'default'), padding: '4px 12px', textTransform: 'capitalize' }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div style={{ fontSize: 13, color: 'var(--text2)' }}>Loading…</div> :
       reports.length === 0 ? <div style={{ ...S.card, color: 'var(--text2)', fontSize: 13 }}>No {filter} reports</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reports.map(r => (
            <div key={r._id} style={S.card}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{r.reporterId?.name || 'User'}</span>
                    <span style={{ fontSize: 11, color: 'var(--text2)' }}>{r.reporterId?.role}</span>
                    <span style={S.badge('red')}>{REASON_LABELS[r.reason] || r.reason}</span>
                    <span style={S.badge('default')}>{r.targetType}</span>
                  </div>
                  {r.description && <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 6 }}>{r.description}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text3, #64748b)' }}>{new Date(r.createdAt).toLocaleString()}</div>
                </div>
                {filter === 'pending' && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button style={S.btn('mint')} onClick={() => act(r._id, 'resolve')}>Resolve</button>
                    <button style={S.btn('default')} onClick={() => act(r._id, 'dismiss')}>Dismiss</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('Overview');

  useEffect(() => {
    if (!sessionStorage.getItem('admin-secret')) navigate('/admin/login', { replace: true });
  }, []);

  const logout = () => {
    sessionStorage.removeItem('admin-secret');
    navigate('/admin/login');
  };

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={S.logo}>
          <div style={{ width: 30, height: 30, background: 'var(--mint, #0fe3b0)', borderRadius: 7, display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 800, color: '#000' }}>M</div>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600 }}>MediConnect <span style={{ color: 'var(--mint, #0fe3b0)' }}>Admin</span></span>
        </div>
        <button onClick={logout} style={{ ...S.btn('red'), padding: '6px 14px', fontSize: 13 }}>Logout</button>
      </header>

      <nav style={S.tabs}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 600 : 400, background: tab === t ? 'var(--mint-dim, rgba(15,227,176,0.1))' : 'transparent', color: tab === t ? 'var(--mint, #0fe3b0)' : 'var(--text2, #94a3b8)' }}
          >
            {t}
          </button>
        ))}
      </nav>

      <div style={S.content}>
        {tab === 'Overview' && <OverviewTab />}
        {tab === 'Users'    && <UsersTab />}
        {tab === 'Doctors'  && <DoctorsTab />}
        {tab === 'Labs'     && <LabsTab />}
        {tab === 'Reviews'  && <ReviewsTab />}
        {tab === 'Reports'  && <ReportsTab />}
      </div>
    </div>
  );
}
