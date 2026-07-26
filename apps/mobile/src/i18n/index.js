import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';
import ar from './ar.json';
import en from './en.json';
import fr from './fr.json';

export const LANGUAGES = ['ar', 'en', 'fr'];
export const DEFAULT_LANG = 'ar';
const STORAGE_KEY = '@mediconnect_lang';

export async function getSavedLanguage() {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) || DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

export async function saveLanguage(lang) {
  try { await AsyncStorage.setItem(STORAGE_KEY, lang); } catch {}
}

export function applyRTL(lang) {
  const shouldBeRTL = lang === 'ar';
  if (I18nManager.isRTL !== shouldBeRTL) {
    I18nManager.allowRTL(shouldBeRTL);
    I18nManager.forceRTL(shouldBeRTL);
    return true; // needs reload
  }
  return false;
}

i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar }, en: { translation: en }, fr: { translation: fr } },
  lng: DEFAULT_LANG,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

export default i18n;
