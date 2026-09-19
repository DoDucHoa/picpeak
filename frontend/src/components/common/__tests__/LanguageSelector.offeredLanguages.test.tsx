/**
 * SUPPORTED_LANGUAGES is not just the guest switcher: the admin header, the
 * email-template editor, contract blocks, reminder templates and the
 * per-customer language all drive their option lists off it. Six of the nine
 * entries were half-translated locales, so those editors demanded nine
 * translations for surfaces nobody maintains here.
 *
 * Only the three locales kept at full key parity are offered. The other files
 * are still shipped, so a session already running in one keeps working and
 * falls back to English per key — this guards the offered list, not the
 * resources.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { SUPPORTED_LANGUAGES } from '../LanguageSelector';

const LOCALES = path.resolve(__dirname, '../../../i18n/locales');

describe('the languages this install offers', () => {
  it('offers exactly the three locales kept at full key parity', () => {
    expect(SUPPORTED_LANGUAGES.map((l) => l.code)).toEqual(['en', 'de', 'vi']);
  });

  it('gives every offered language a name and a flag', () => {
    SUPPORTED_LANGUAGES.forEach((lang) => {
      expect(lang.name.trim().length).toBeGreaterThan(0);
      expect(typeof lang.Flag).toBe('function');
    });
  });

  it('still ships the retired locale files, so a stored language keeps rendering', () => {
    ['es', 'fr', 'nl', 'pt', 'ru', 'sl'].forEach((code) => {
      expect(fs.existsSync(path.join(LOCALES, `${code}.json`))).toBe(true);
    });
  });
});
