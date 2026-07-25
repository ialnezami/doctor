import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './ar.json';
import en from './en.json';
import fr from './fr.json';

const STORAGE_KEY = 'mediconnect_lang';
const FALLBACK_LANG = 'ar';

export function getSavedLanguage() {
  return localStorage.getItem(STORAGE_KEY) || null;
}

export function applyDocumentDir(lang) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = lang;
}

export function setLanguage(lang) {
  localStorage.setItem(STORAGE_KEY, lang);
  i18n.changeLanguage(lang);
  applyDocumentDir(lang);
}

const userPref = getSavedLanguage();
const initLang = userPref || FALLBACK_LANG;
applyDocumentDir(initLang);

i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar }, en: { translation: en }, fr: { translation: fr } },
  lng: initLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

// If no user preference yet, fetch platform default and apply it once
if (!userPref) {
  fetch('/api/admin/platform-settings/public')
    .then(r => r.ok ? r.json() : null)
    .then(d => {
      if (d?.defaultLanguage && d.defaultLanguage !== initLang) {
        i18n.changeLanguage(d.defaultLanguage);
        applyDocumentDir(d.defaultLanguage);
      }
    })
    .catch(() => {});
}

export default i18n;
