/**
 * The create page asks for no admin email: one global notification email
 * decides where admin mail goes (P3, spec 5.10, 5.11).
 */
import fs from 'fs';
import path from 'path';
import { expect, it } from 'vitest';
import { createSources } from './createSources';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

it('the create page has no admin email field, picker or requirement', () => {
  expect(createSources()).not.toMatch(/admin_email|adminEmail|requireAdminEmail|admin-email-picker/);
});

it('the event Overview shows no admin email', () => {
  expect(read('event-details/EventInformationCard.tsx')).not.toMatch(/admin_email/);
});

it('Settings > Events has no "require admin email" switch', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../../features/settings/tabs/EventsTab.tsx'), 'utf8');
  expect(src).not.toMatch(/event_require_admin_email/);
});
