/**
 * The public gallery warning used to suggest enabling download watermarks on
 * the event, an option that no longer exists there: downloads are
 * watermarked from Branding. The copy has to send the admin to Branding.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import en from '../../../../i18n/locales/en.json';
import de from '../../../../i18n/locales/de.json';
import vi from '../../../../i18n/locales/vi.json';

const FRONTEND = path.resolve(__dirname, '../../../../..');

describe('public gallery warning', () => {
  it.each([
    ['en', en.events.publicGalleryWarning, /Branding/],
    // Each names the menu entry as that locale's navigation labels it.
    ['de', de.events.publicGalleryWarning, /Markenidentität/],
    ['vi', vi.events.publicGalleryWarning, /Thương hiệu/],
  ])('%s points to Branding for download watermarks', (_l, text, re) => {
    expect(text).toMatch(re);
  });

  it.each([
    'src/pages/admin/event-details/settings/AccessSection.tsx',
    'src/pages/admin/CreateEventPage.tsx',
  ])('%s falls back to the English copy', (rel) => {
    const src = fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
    expect(src).toContain(`t('events.publicGalleryWarning', '${en.events.publicGalleryWarning}')`);
  });
});
