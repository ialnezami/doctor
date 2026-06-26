import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './ar.json';
import en from './en.json';
import fr from './fr.json';

const STORAGE_KEY = 'mediconnect_lang';
const DEFAULT_LANG = 'ar';

export function getSavedLanguage() {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
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

const savedLang = getSavedLanguage();
applyDocumentDir(savedLang);

i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar }, en: { translation: en }, fr: { translation: fr } },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
