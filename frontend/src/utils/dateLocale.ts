import { de, enUS, ptBR, fr, vi } from 'date-fns/locale';
import type { Locale } from 'date-fns';

/** Maps an i18n language code to the date-fns locale used for formatting. */
export function getDateFnsLocale(language: string): Locale {
  switch (language) {
    case 'de':
      return de;
    case 'pt':
    case 'pt-BR':
      return ptBR;
    case 'fr':
      return fr;
    case 'vi':
      return vi;
    default:
      return enUS;
  }
}
