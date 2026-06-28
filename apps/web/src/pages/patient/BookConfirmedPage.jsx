import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '../../components/ui/Button';

export default function BookConfirmedPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const status = params.get('status');
  const confirmed = status === 'confirmed';

  return (
    <div style={{ padding:40, maxWidth:480, margin:'0 auto', textAlign:'center' }}>
      <div style={{ fontSize:56, marginBottom:16 }}>{confirmed ? '✅' : '⏳'}</div>
      <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:500, marginBottom:8 }}>
        {confirmed ? t('bookConfirmed.confirmed.title') : t('bookConfirmed.pending.title')}
      </div>
      <div style={{ fontSize:14, color:'var(--text2)', marginBottom:32 }}>
        {confirmed ? t('bookConfirmed.confirmed.desc') : t('bookConfirmed.pending.desc')}
      </div>
      <Button onClick={() => navigate('/my-appointments')} style={{ padding:'12px 28px' }}>
        {t('bookConfirmed.viewAppointments')}
      </Button>
    </div>
  );
}
