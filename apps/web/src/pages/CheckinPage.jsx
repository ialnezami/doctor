import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import client from '../api/client';

export default function CheckinPage() {
  const [params]              = useSearchParams();
  const [state,    setState]  = useState('loading'); // 'loading' | 'success' | 'error'
  const [message,  setMessage] = useState('');
  const [name,     setName]   = useState('');
  const [time,     setTime]   = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) { setState('error'); setMessage('رابط غير صالح'); return; }

    // client interceptor already unwraps res.data
    client.post('/appointments/checkin', { token })
      .then(data => {
        setName(data.patientName);
        setTime(data.appointmentTime);
        setState('success');
      })
      .catch(err => {
        setMessage(err?.message || 'حدث خطأ، حاول مجدداً');
        setState('error');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: 'var(--bg)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 40, maxWidth: 360, width: '100%', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,.1)' }}>
        {state === 'loading' && (
          <p style={{ color: 'var(--text2)', fontSize: 15 }}>جاري التحقق...</p>
        )}
        {state === 'success' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#16a34a', margin: '0 0 8px' }}>تم تسجيل حضورك بنجاح</h2>
            <p style={{ fontSize: 15, color: 'var(--text2)', margin: 0 }}>مرحباً {name}، موعدك الساعة {time}</p>
            <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 16 }}>توجه إلى غرفة الانتظار</p>
          </>
        )}
        {state === 'error' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>❌</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--rose)', margin: '0 0 8px' }}>تعذر التسجيل</h2>
            <p style={{ fontSize: 14, color: 'var(--text2)', margin: 0 }}>{message}</p>
          </>
        )}
      </div>
    </div>
  );
}
