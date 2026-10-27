import { useTranslation } from "react-i18next";

import { changeLanguage } from "../../i18n";

// Native short names stay readable on a phone. English names are for labels.
export const HEADER_LANGUAGES = [
  { code: "en", short: "EN", name: "English" },
  { code: "hi", short: "हि", name: "Hindi" },
  { code: "mr", short: "मर", name: "Marathi" },
  { code: "te", short: "తె", name: "Telugu" },
  { code: "kn", short: "ಕನ್ನಡ", name: "Kannada" },
  { code: "ta", short: "தமிழ்", name: "Tamil" },
];

function LanguageSelector() {
  const { i18n, t } = useTranslation();
  const current = (i18n.language || "en").split("-")[0];

  return (
    <div
      className="language-selector"
      role="group"
      aria-label={t("common.selectLanguage")}
    >
      {HEADER_LANGUAGES.map((language) => {
        const selected = current === language.code;

        return (
          <button
            key={language.code}
            type="button"
            className={selected ? "lang-option selected" : "lang-option"}
            aria-pressed={selected}
            aria-label={language.name}
            title={language.name}
            onClick={() => changeLanguage(language.code)}
          >
            <span className="lang-text">{language.short}</span>
          </button>
        );
      })}
    </div>
  );
}

export default LanguageSelector;
