import { useSearchParams, useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';

export default function BookConfirmedPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const status = params.get('status');
  const confirmed = status === 'confirmed';

  return (
    <div style={{ padding:40, maxWidth:480, margin:'0 auto', textAlign:'center' }}>
      <div style={{ fontSize:56, marginBottom:16 }}>{confirmed ? '✅' : '⏳'}</div>
      <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:500, marginBottom:8 }}>
        {confirmed ? 'Appointment Confirmed!' : 'Request Sent'}
      </div>
      <div style={{ fontSize:14, color:'var(--text2)', marginBottom:32 }}>
        {confirmed
          ? 'Your appointment has been confirmed. You will receive a reminder before the visit.'
          : 'Your request is pending doctor approval. You will be notified once it is confirmed.'}
      </div>
      <Button onClick={() => navigate('/my-appointments')} style={{ padding:'12px 28px' }}>
        View My Appointments
      </Button>
    </div>
  );
}
