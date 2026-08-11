import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './resources.js';

const browserLanguage = typeof navigator === 'undefined' ? 'en' : navigator.language;
const language = browserLanguage.toLowerCase().startsWith('ru') ? 'ru' : 'en';

if (typeof document !== 'undefined') {
  document.documentElement.lang = language;
  document.documentElement.dir = 'ltr';
}

void i18n.use(initReactI18next).init({
  resources,
  lng: language,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: true,
  },
});

export { i18n };
