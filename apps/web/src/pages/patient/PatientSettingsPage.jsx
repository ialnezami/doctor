import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getNotificationPrefs, updateNotificationPrefs } from '../../api/users';
import { useIsMobile } from '../../hooks/useIsMobile';

function Toggle({ label, value, onToggle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 14, color: 'var(--text)' }}>{label}</span>
      <button
        onClick={onToggle}
        style={{ width: 38, height: 20, borderRadius: 10, background: value ? 'var(--mint)' : 'var(--border2)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .2s' }}
      >
        <span style={{ position: 'absolute', top: 2, left: value ? 20 : 2, width: 16, height: 16, borderRadius: 8, background: '#fff', transition: 'left .2s', display: 'block' }} />
      </button>
    </div>
  );
}

export default function PatientSettingsPage() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);

  useEffect(() => {
    getNotificationPrefs().then(data => {
      if (data?.notificationPrefs) {
        setPushEnabled(data.notificationPrefs.pushEnabled);
        setEmailEnabled(data.notificationPrefs.emailEnabled);
      }
    }).catch(() => {});
  }, []);

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: isMobile ? 14 : 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, color: 'var(--text)' }}>{t('patientSettings.title')}</h2>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12, color: 'var(--text)' }}>{t('patientSettings.notificationChannels')}</div>
        <Toggle
          label={t('patientSettings.pushNotifications')}
          value={pushEnabled}
          onToggle={async () => {
            const next = !pushEnabled;
            setPushEnabled(next);
            await updateNotificationPrefs({ pushEnabled: next }).catch(() => setPushEnabled(!next));
          }}
        />
        <Toggle
          label={t('patientSettings.emailNotifications')}
          value={emailEnabled}
          onToggle={async () => {
            const next = !emailEnabled;
            setEmailEnabled(next);
            await updateNotificationPrefs({ emailEnabled: next }).catch(() => setEmailEnabled(!next));
          }}
        />
      </div>
    </div>
  );
}
