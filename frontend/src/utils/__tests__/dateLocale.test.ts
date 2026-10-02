import { it, expect } from 'vitest';
import { de, enUS, vi, fr, ptBR } from 'date-fns/locale';
import { getDateFnsLocale } from '../dateLocale';

it('maps language codes to date-fns locales', () => {
  expect(getDateFnsLocale('en')).toBe(enUS);
  expect(getDateFnsLocale('de')).toBe(de);
  expect(getDateFnsLocale('vi')).toBe(vi);
  expect(getDateFnsLocale('fr')).toBe(fr);
  expect(getDateFnsLocale('pt-BR')).toBe(ptBR);
  expect(getDateFnsLocale('xx')).toBe(enUS);
});
