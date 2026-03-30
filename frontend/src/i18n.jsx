import { createContext, useContext, useState } from 'react';
import en from './locales/en';
import de from './locales/de';
import { getPluginLocales } from './plugins';

export { SUPPORTED_LANGS } from './utils/config';

const LOCALES = {
  en: { ...en, ...getPluginLocales('en') },
  de: { ...de, ...getPluginLocales('de') },
};
const LS_KEY = 'buzzer-lang';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const stored = sessionStorage.getItem(LS_KEY);
    return stored && LOCALES[stored] ? stored : 'en';
  });

  const switchLang = (l) => {
    if (!LOCALES[l]) return;
    sessionStorage.setItem(LS_KEY, l);
    setLang(l);
  };

  // t(key) or t(key, ...args) where locale[key] can be a string or a function
  const t = (key, ...args) => {
    const dict = LOCALES[lang];
    const val = dict[key] ?? LOCALES.en[key];
    if (val === undefined) return key;
    return typeof val === 'function' ? val(...args) : val;
  };

  return (
    <I18nContext.Provider value={{ t, lang, switchLang }}>
      {children}
    </I18nContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n() {
  return useContext(I18nContext);
}
