import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

// SVG Flag Components
const GBFlag: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
    <path fill="#012169" d="M0 0h640v480H0z"/>
    <path fill="#FFF" d="m75 0 244 181L562 0h78v62L400 241l240 178v61h-80L320 301 81 480H0v-60l239-178L0 64V0h75z"/>
    <path fill="#C8102E" d="m424 281 216 159v40L369 281h55zm-184 20 6 35L54 480H0l240-179zM640 0v3L391 191l2-44L590 0h50zM0 0l239 176h-60L0 42V0z"/>
    <path fill="#FFF" d="M241 0v480h160V0H241zM0 160v160h640V160H0z"/>
    <path fill="#C8102E" d="M0 193v96h640v-96H0zM273 0v480h96V0h-96z"/>
  </svg>
);

const DEFlag: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
    <path fill="#000" d="M0 0h640v160H0z"/>
    <path fill="#D00" d="M0 160h640v160H0z"/>
    <path fill="#FFCE00" d="M0 320h640v160H0z"/>
  </svg>
);

// The star is a pentagram on the flag's own centre (320 240) with the
// circumscribed radius the flag spec gives it, one fifth of the height (96 of
// 480). The previous path put its centroid at y 196 and gave it a radius of
// 76, so the star floated in the upper third of a field it is supposed to sit
// in the middle of, and read as too small: the only flag in this set with a
// centred device, and the only one where that was visible.
const VNFlag: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
    <path fill="#DA251D" d="M0 0h640v480H0z"/>
    <path fill="#FF0" d="m320 144 56.4 173.7-147.7-107.4h182.6l-147.7 107.4z"/>
  </svg>
);

/**
 * The languages this install offers, everywhere: the guest and admin
 * switchers, the email-template editor, contract blocks, reminder templates
 * and the per-customer language.
 *
 * Only the three kept at full key parity are listed. es, fr, nl, pt, ru and sl
 * are still shipped as resources, so a session or a stored row that already
 * names one keeps rendering in it and falls back to English per key, but they
 * are no longer offered: half-translated options made the template editors
 * demand nine translations for surfaces nobody here maintains.
 */
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', Flag: GBFlag },
  { code: 'de', name: 'Deutsch', Flag: DEFlag },
  { code: 'vi', name: 'Tiếng Việt', Flag: VNFlag },
];

export const LanguageSelector: React.FC = () => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);

  const currentLanguage = SUPPORTED_LANGUAGES.find(lang => lang.code === i18n.language) || SUPPORTED_LANGUAGES[0];

  const handleLanguageChange = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2 sm:px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
        // On <sm the language *name* is hidden — the Globe + flag pair
        // is enough recognition on its own and stops this control from
        // pushing into the company-name title on narrow mobile widths
        // (#523). Full name stays on sm+ where there's room.
        aria-label={currentLanguage.name}
        title={currentLanguage.name}
      >
        <Globe className="w-4 h-4" />
        <currentLanguage.Flag className="w-5 h-5" />
        <span className="hidden sm:inline">{currentLanguage.name}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 py-1 z-50">
          {SUPPORTED_LANGUAGES.map((language) => (
            <button
              key={language.code}
              onClick={() => handleLanguageChange(language.code)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-700 flex items-center gap-3 ${
                language.code === i18n.language
                  ? 'text-accent bg-accent-dark/15'
                  : 'text-neutral-700 dark:text-neutral-300'
              }`}
            >
              <language.Flag className="w-5 h-5" />
              <span>{language.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

LanguageSelector.displayName = 'LanguageSelector';