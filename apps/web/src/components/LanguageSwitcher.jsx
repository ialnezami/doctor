import { useTranslation } from 'react-i18next';
import { setLanguage } from '../i18n';

const LANGS = ['ar', 'en', 'fr'];

export default function LanguageSwitcher({ style }) {
  const { i18n, t } = useTranslation();
  return (
    <div style={{ display: 'flex', gap: 4, ...style }}>
      {LANGS.map(l => (
        <button key={l} onClick={() => setLanguage(l)}
          style={{
            padding: '4px 10px', borderRadius: 6, border: '1px solid',
            fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all .15s',
            background: i18n.language === l ? 'var(--mint-dim)' : 'transparent',
            borderColor: i18n.language === l ? 'rgba(15,227,176,0.3)' : 'var(--border)',
            color: i18n.language === l ? 'var(--mint)' : 'var(--text2)',
          }}>
          {t(`language.${l}`)}
        </button>
      ))}
    </div>
  );
}
