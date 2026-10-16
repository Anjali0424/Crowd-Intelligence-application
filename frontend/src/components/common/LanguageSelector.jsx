import { useTranslation } from "react-i18next";

import { changeLanguage } from "../../i18n";

// The three languages surfaced in the home header, in the order devotees are
// most likely to need. `short` keeps the button compact on small screens while
// `name` (the English name) is used for accessibility labels/tooltips.
export const HEADER_LANGUAGES = [
  { code: "en", icon: "🌐", short: "EN", name: "English" },
  { code: "te", icon: "🗣️", short: "తెలుగు", name: "Telugu" },
  { code: "hi", icon: "🙏", short: "हिन्दी", name: "Hindi" },
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
            title={`${language.icon} ${language.name}`}
            onClick={() => changeLanguage(language.code)}
          >
            <span className="lang-icon" aria-hidden="true">
              {language.icon}
            </span>
            <span className="lang-text">{language.short}</span>
          </button>
        );
      })}
    </div>
  );
}

export default LanguageSelector;
