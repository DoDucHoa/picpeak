/**
 * Hero logo size and position and the password page logo are Branding
 * settings for every gallery (P3, spec 5.10). The event page must not offer
 * per-event copies that do nothing. Logo visibility stays per event.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const FRONTEND = path.resolve(__dirname, '../../../../..');

describe.each([
  'src/pages/admin/event-details/settings/AppearanceSection.tsx',
  'src/pages/admin/event-details/settings/sectionFields.ts',
  'src/pages/admin/event-details/draft/serverValues.ts',
  'src/pages/admin/event-details/types.ts',
  'src/pages/admin/event-details/EventInformationCard.tsx',
])('%s', (rel) => {
  const src = fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
  it.each(['hero_logo_size', 'hero_logo_position', 'login_logo_visible'])('has no per-event %s', (key) => {
    expect(src).not.toMatch(new RegExp(`\\b${key}\\b`));
  });
});

it('keeps the per-event hero logo visibility', () => {
  const src = fs.readFileSync(path.join(FRONTEND, 'src/pages/admin/event-details/settings/AppearanceSection.tsx'), 'utf8');
  expect(src).toMatch(/hero_logo_visible/);
});
