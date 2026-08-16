import { useState } from 'react';
import client from '../api/client';

export default function PrescriptionCheckView({ prescription, products, onDispense }) {
  const [dispensing, setDispensing]       = useState(false);
  const [dispensed, setDispensed]         = useState(!!prescription.dispensedAt);
  const [dispensedMeds, setDispensedMeds] = useState([]);
  const [error, setError]                 = useState('');

  const patientFirstName = prescription.patientId?.name?.split(' ')[0] || 'المريض';

  const getMedStatus = (medName) => {
    const p = products.find(pr => pr.name.toLowerCase() === medName.toLowerCase());
    if (!p)             return { label: 'غير متوفر',        color: 'var(--text3)' };
    if (p.stockQty > 0) return { label: `متوفر (${p.stockQty})`, color: 'var(--mint)' };
    return                     { label: 'نفذ من المخزن',    color: 'var(--rose)' };
  };

  const handleDispense = async () => {
    setDispensing(true); setError('');
    try {
      const data = await client.post(`/prescriptions/${prescription._id}/dispense`);
      setDispensedMeds(data.dispensedMedications);
      setDispensed(true);
      if (onDispense) onDispense(data);
    } catch (err) {
      setError(err?.message || 'تعذر صرف الوصفة');
    } finally {
      setDispensing(false);
    }
  };

  return (
    <div dir="rtl">
      <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 12px' }}>
        المريض: <strong>{patientFirstName}</strong>
        {prescription.doctorId?.name && ` — الطبيب: ${prescription.doctorId.name}`}
      </p>

      {dispensed && !dispensedMeds.length && (
        <div style={{
          background: 'rgba(22,163,74,.12)', borderRadius: 8,
          padding: '10px 14px', fontSize: 13, color: 'var(--mint)', marginBottom: 12,
        }}>
          تم صرف هذه الوصفة بتاريخ {new Date(prescription.dispensedAt).toLocaleDateString('ar-SA')}
        </div>
      )}

      <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        {prescription.medications?.map((med, i) => {
          const status = getMedStatus(med.name);
          return (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{med.name}</span>
              <span style={{ fontSize: 12, color: status.color }}>{status.label}</span>
            </div>
          );
        })}
      </div>

      {dispensedMeds.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--mint)', margin: '0 0 6px' }}>
            تم الصرف
          </p>
          {dispensedMeds.map((m, i) => (
            <p key={i} style={{ fontSize: 12, color: 'var(--text2)', margin: '2px 0' }}>
              {m.name}: {m.matched ? `${m.stockBefore} → ${m.stockAfter}` : 'غير متطابق'}
            </p>
          ))}
        </div>
      )}

      {error && <p style={{ color: 'var(--rose)', fontSize: 13, marginBottom: 8 }}>{error}</p>}

      {!dispensed && (
        <button
          onClick={handleDispense}
          disabled={dispensing}
          style={{
            width: '100%', background: 'var(--mint)', color: '#000',
            border: 'none', borderRadius: 8, padding: '9px 0',
            fontWeight: 700, cursor: 'pointer', fontSize: 14,
          }}
        >
          {dispensing ? 'جاري الصرف...' : 'تأكيد الصرف'}
        </button>
      )}
    </div>
  );
}
