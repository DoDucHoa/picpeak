process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'migration-257-secret-at-least-32-chars';

const { bootCrmDb } = require('../integration/helpers/crmDb');
const migration = require('../../migrations/core/257_download_watermark_switch');

let db; let cleanup;
beforeAll(async () => { ({ db, cleanup } = await bootCrmDb()); }, 120000);
afterAll(async () => { await cleanup(); });

it('seeds the download watermark switch off', async () => {
  const row = await db('app_settings').where({ setting_key: 'branding_watermark_downloads_enabled' }).first();
  expect(JSON.parse(row.setting_value)).toBe(false);
  expect(row.setting_type).toBe('branding');
});

it('keeps a value an admin already chose when it runs again', async () => {
  await db('app_settings').where({ setting_key: 'branding_watermark_downloads_enabled' })
    .update({ setting_value: JSON.stringify(true) });
  await migration.up(db);
  const row = await db('app_settings').where({ setting_key: 'branding_watermark_downloads_enabled' }).first();
  expect(JSON.parse(row.setting_value)).toBe(true);
});

it('forgets every pre-built zip so none built under the old rule is served', async () => {
  const [id] = await db('events').insert({
    slug: 'zip-257', event_type: 'wedding', event_name: 'Zip', event_date: '2026-09-01',
    customer_name: 'C', customer_email: 'c@example.com', admin_email: 'a@example.com',
    password_hash: 'x', share_link: 'https://example.com/gallery/zip-257',
    expires_at: new Date(Date.now() + 86400000),
    download_zip_path: 'zips/zip-257.zip', download_zip_generated_at: new Date(),
  }).returning('id').then((r) => r.map((x) => (typeof x === 'object' ? x.id : x)));
  await migration.up(db);
  const ev = await db('events').where({ id }).first('download_zip_path', 'download_zip_generated_at');
  expect(ev.download_zip_path).toBeNull();
  expect(ev.download_zip_generated_at).toBeNull();
});
