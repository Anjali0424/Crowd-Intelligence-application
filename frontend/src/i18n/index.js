import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import hi from "./locales/hi.json";
import te from "./locales/te.json";
import mr from "./locales/mr.json";
import ta from "./locales/ta.json";
import kn from "./locales/kn.json";

// Languages bundled with the app. `code` is the BCP-47 tag (also used for Intl
// number/date formatting); `label` is the native name. The header shows all of
// these (see LanguageSelector).
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "te", label: "తెలుగు" },
  { code: "hi", label: "हिन्दी" },
  { code: "mr", label: "मराठी" },
  { code: "ta", label: "தமிழ்" },
  { code: "kn", label: "ಕನ್ನಡ" },
];

export const STORAGE_KEY = "tcs.language";
export const DEFAULT_LANGUAGE = "en";

const LANGUAGE_CODES = LANGUAGES.map((language) => language.code);

export function isSupportedLanguage(code) {
  return Boolean(code) && LANGUAGE_CODES.includes(code);
}

function readStoredLanguage() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isSupportedLanguage(stored)) return stored;
  } catch {
    /* localStorage can be unavailable (private mode / SSR) */
  }
  return null;
}

export function getInitialLanguage() {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  return readStoredLanguage() || DEFAULT_LANGUAGE;
}

const resources = {
  en: { translation: en },
  hi: { translation: hi },
  te: { translation: te },
  mr: { translation: mr },
  ta: { translation: ta },
  kn: { translation: kn },
};

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: LANGUAGE_CODES,
  interpolation: {
    escapeValue: false,
  },
  returnEmptyString: false,
});

function syncDocumentLanguage(language) {
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.setAttribute("lang", language);
    document.title = i18n.t("common.appName");
  }
}

function persistLanguage(language) {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    /* ignore (private mode / storage disabled) */
  }
}

i18n.on("languageChanged", (language) => {
  syncDocumentLanguage(language);
  persistLanguage(language);
});

syncDocumentLanguage(i18n.language);

export function changeLanguage(language) {
  if (!isSupportedLanguage(language)) {
    return Promise.resolve();
  }
  return i18n.changeLanguage(language);
}

export function getCurrentLanguage() {
  return i18n.language || DEFAULT_LANGUAGE;
}

// Locale-aware number formatting for the current language.
export function formatNumber(value, options) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "");
  try {
    return new Intl.NumberFormat(i18n.language, options).format(number);
  } catch {
    return number.toLocaleString();
  }
}

// Locale-aware time formatting for the current language (accepts a Date, an
// epoch-seconds number, or a Date-parsable value).
export function formatTime(value, options) {
  const date =
    value instanceof Date
      ? value
      : typeof value === "number"
      ? new Date(value * 1000)
      : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(date);
}

// Look up a display string that originates from mock/data files, falling back
// to the English source string if it has not been translated.
export function translateData(t, value) {
  if (typeof value !== "string" || !value) return value;
  return t(`data.${value}`, { defaultValue: value });
}

export default i18n;
