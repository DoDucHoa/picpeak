/**
 * "Require admin email" is removed (P3, spec 5.10) and the notification email
 * stays private (spec 5.11).
 */
process.env.NODE_ENV = 'test';
const request = require('supertest');
const { bootCrmDb, seedMinimal, buildRouteApp } = require('../integration/helpers/crmDb');

let db; let cleanup; let app;
beforeAll(async () => {
  ({ db, cleanup } = await bootCrmDb());
  await seedMinimal(db);
  await db('app_settings').insert({
    setting_key: 'general_notification_email', setting_value: JSON.stringify('ops@example.com'), setting_type: 'general',
  }).onConflict('setting_key').merge();
  app = buildRouteApp('/public/settings', require('../../src/routes/publicSettings'));
}, 120000);
afterAll(async () => { if (cleanup) await cleanup(); });

it('sends neither the removed requirement nor the notification email', async () => {
  const res = await request(app).get('/public/settings');
  expect(res.status).toBe(200);
  expect(res.body).not.toHaveProperty('event_require_admin_email');
  expect(JSON.stringify(res.body)).not.toContain('ops@example.com');
});

it('no longer requires an admin email on create', async () => {
  const { getEventFieldRequirements } = require('../../src/services/eventSettings');
  expect(await getEventFieldRequirements()).not.toHaveProperty('require_admin_email');
});

it('deletes the stored requirement, and down restores it', async () => {
  const migration = require('../../migrations/core/260_drop_require_admin_email');
  await migration.up(db);
  expect(await db('app_settings').where({ setting_key: 'event_require_admin_email' }).first()).toBeUndefined();
  await migration.down(db);
  expect(await db('app_settings').where({ setting_key: 'event_require_admin_email' }).first()).toBeDefined();
  await migration.up(db);
});
