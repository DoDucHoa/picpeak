/**
 * Hero logo position and the gallery password page logo become Branding
 * settings (P3, spec 5.10), seeded with the values every event had by default.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'migration-259-secret-at-least-32-chars';

const { bootCrmDb } = require('../integration/helpers/crmDb');
const migration = require('../../migrations/core/261_branding_hero_logo_globals');

let db; let cleanup;
beforeAll(async () => { ({ db, cleanup } = await bootCrmDb()); }, 120000);
afterAll(async () => { await cleanup(); });

const row = (key) => db('app_settings').where({ setting_key: key }).first();

it('seeds both keys as Branding settings', async () => {
  const position = await row('branding_hero_logo_position');
  const passwordLogo = await row('branding_gallery_password_logo_visible');
  expect(JSON.parse(position.setting_value)).toBe('top');
  expect(position.setting_type).toBe('branding');
  expect(JSON.parse(passwordLogo.setting_value)).toBe(true);
  expect(passwordLogo.setting_type).toBe('branding');
});

it('keeps an admin choice when it runs again', async () => {
  await db('app_settings').where({ setting_key: 'branding_hero_logo_position' })
    .update({ setting_value: JSON.stringify('bottom') });
  await migration.up(db);
  expect(JSON.parse((await row('branding_hero_logo_position')).setting_value)).toBe('bottom');
});
