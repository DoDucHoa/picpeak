process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'migration-258-secret-at-least-32-chars';

const { bootCrmDb } = require('../integration/helpers/crmDb');
const migration = require('../../migrations/core/258_global_right_click');

let db; let cleanup;
beforeAll(async () => { ({ db, cleanup } = await bootCrmDb()); }, 120000);
afterAll(async () => { await cleanup(); });

const row = (key) => db('app_settings').where({ setting_key: key }).first();

it('seeds the global right-click switch on', async () => {
  const r = await row('disable_right_click');
  expect(JSON.parse(r.setting_value)).toBe(true);
  expect(r.setting_type).toBe('security');
});

it('keeps a value an admin already chose when it runs again', async () => {
  await db('app_settings').where({ setting_key: 'disable_right_click' })
    .update({ setting_value: JSON.stringify(false) });
  await migration.up(db);
  expect(JSON.parse((await row('disable_right_click')).setting_value)).toBe(false);
});

it('deletes the two creation defaults nothing reads', async () => {
  await db('app_settings').insert([
    { setting_key: 'default_disable_right_click', setting_value: 'false', setting_type: 'gallery' },
    { setting_key: 'default_watermark_downloads', setting_value: 'false', setting_type: 'gallery' },
  ]).onConflict('setting_key').ignore();
  await migration.up(db);
  expect(await row('default_disable_right_click')).toBeUndefined();
  expect(await row('default_watermark_downloads')).toBeUndefined();
});
