/**
 * PostgreSQL checks for resetting a gallery's download allowance
 * (downloadQuotaService.resetLedger). Gated: runs only when PICPEAK_PG_TEST_URL
 * points at a THROWAWAY database, e.g.
 *   PICPEAK_PG_TEST_URL="postgres://picpeak:<pw>@127.0.0.1:5432/picpeak_quota_test" \
 *     npx jest __tests__/integration/downloadQuotaResetPg.test.js
 *
 * A reset empties the delivery ledger and nothing else. The free limit and the
 * packages the client paid for are money and configuration, so they have to
 * survive it: a reset that also dropped approved orders would take away photos
 * the client already bought.
 */

const knex = require('knex');

const PG_URL = process.env.PICPEAK_PG_TEST_URL;
const maybe = PG_URL ? describe : describe.skip;

maybe('download allowance reset on Postgres', () => {
  let pgDb;
  let quotaService;
  let eventId;
  let otherEventId;

  beforeAll(async () => {
    // Own schema, because jest runs suites in parallel workers and the other
    // quota suites create the same tables.
    const admin = knex({ client: 'pg', connection: PG_URL, pool: { min: 0, max: 2 } });
    await admin.raw('DROP SCHEMA IF EXISTS quota_reset_test CASCADE');
    await admin.raw('CREATE SCHEMA quota_reset_test');
    await admin.destroy();

    pgDb = knex({
      client: 'pg', connection: PG_URL, searchPath: ['quota_reset_test'], pool: { min: 0, max: 5 },
    });

    await pgDb.schema.createTable('events', (t) => t.increments('id').primary());
    await pgDb.schema.createTable('admin_users', (t) => t.increments('id').primary());
    await pgDb.schema.createTable('app_settings', (t) => {
      t.increments('id').primary();
      t.string('setting_key').notNullable();
      t.text('setting_value');
      t.string('setting_type');
    });

    await require('../../migrations/core/214_download_quota').up(pgDb);

    const [first] = await pgDb('events').insert({}).returning('id');
    const [second] = await pgDb('events').insert({}).returning('id');
    eventId = first.id ?? first;
    otherEventId = second.id ?? second;

    quotaService = require('../../src/services/downloadQuotaService');
  }, 60000);

  afterAll(async () => {
    if (pgDb) await pgDb.destroy();
  });

  const client = { accessLevel: 'client' };

  async function setUp(targetEventId, freeLimit, grantedPhotoCount = 0) {
    await pgDb('event_photo_downloads').where({ event_id: targetEventId }).delete();
    await pgDb('download_quota_orders').where({ event_id: targetEventId }).delete();
    await pgDb('event_download_quota_settings').where({ event_id: targetEventId }).delete();
    await pgDb('event_download_quota_settings').insert({
      event_id: targetEventId, quota_enabled: true, free_limit: freeLimit,
    });
    if (grantedPhotoCount > 0) {
      await pgDb('download_quota_orders').insert({
        event_id: targetEventId, status: 'approved', granted_photo_count: grantedPhotoCount,
      });
    }
  }

  test('a reset gives every spent slot back and keeps the purchased ones', async () => {
    await setUp(eventId, 2, 3);
    await quotaService.reserveSlots(eventId, [1, 2, 3, 4, 5], client, pgDb);
    expect((await quotaService.getQuotaState(eventId, pgDb)).remaining).toBe(0);

    const cleared = await quotaService.resetLedger(eventId, pgDb);

    expect(cleared).toBe(5);
    const state = await quotaService.getQuotaState(eventId, pgDb);
    expect(state.used).toBe(0);
    expect(state.total).toBe(5);
    expect(state.remaining).toBe(5);
  });

  test('a reset leaves every other gallery untouched', async () => {
    await setUp(eventId, 5);
    await setUp(otherEventId, 5);
    await quotaService.reserveSlots(eventId, [1], client, pgDb);
    await quotaService.reserveSlots(otherEventId, [7, 8], client, pgDb);

    await quotaService.resetLedger(eventId, pgDb);

    expect((await quotaService.getQuotaState(otherEventId, pgDb)).used).toBe(2);
  });

  test('a photo delivered before the reset costs a slot again afterwards', async () => {
    await setUp(eventId, 1);
    await quotaService.reserveSlots(eventId, [1], client, pgDb);
    await quotaService.resetLedger(eventId, pgDb);

    const claim = await quotaService.reserveSlots(eventId, [1], client, pgDb);

    expect(claim.allowed).toBe(true);
    expect(claim.reserved).toHaveLength(1);
    expect((await quotaService.getQuotaState(eventId, pgDb)).remaining).toBe(0);
  });

  test('resetting an empty ledger reports nothing cleared', async () => {
    await setUp(eventId, 1);
    expect(await quotaService.resetLedger(eventId, pgDb)).toBe(0);
  });
});
