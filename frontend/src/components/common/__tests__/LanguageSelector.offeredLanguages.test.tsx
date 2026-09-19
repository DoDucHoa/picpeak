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

  it('has no second list of offered languages hiding in a component', () => {
    // InlineCustomerCreate hardcoded six <option> rows of its own, so trimming
    // SUPPORTED_LANGUAGES left it offering three languages nothing else did.
    // A retired language name inside an <option> is the shape that mistake
    // takes, so it is the shape this looks for.
    const SRC = path.resolve(__dirname, '../../..');
    const RETIRED = ['Nederlands', 'Português', 'Русский', 'Français', 'Español', 'Slovenščina'];

    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          return ['__tests__', 'i18n'].includes(entry.name) ? [] : walk(full);
        }
        return entry.name.endsWith('.tsx') ? [full] : [];
      });

    const offenders = walk(SRC).filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return RETIRED.some((name) => source.includes(`>${name}</option>`));
    });

    expect(offenders).toEqual([]);
  });
});
