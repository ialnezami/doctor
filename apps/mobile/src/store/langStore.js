import { create } from 'zustand';
import i18n from '../i18n';
import { saveLanguage, applyRTL } from '../i18n';

const useLangStore = create((set) => ({
  lang: 'ar',
  setLang: (lang) => {
    i18n.changeLanguage(lang);
    saveLanguage(lang);
    applyRTL(lang);
    set({ lang });
  },
}));

export default useLangStore;
