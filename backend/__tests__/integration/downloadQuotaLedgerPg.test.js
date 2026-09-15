/**
 * PostgreSQL checks for the download ledger (migration 214 + downloadQuotaService).
 * Gated: runs only when PICPEAK_PG_TEST_URL points at a THROWAWAY database, e.g.
 *   PICPEAK_PG_TEST_URL="postgres://picpeak:<pw>@127.0.0.1:5432/picpeak_quota_test" \
 *     npx jest __tests__/integration/downloadQuotaLedgerPg.test.js
 *
 * Why this cannot live in the mocked unit suite: recordDelivered reports how
 * many photos it newly charged for, and that number comes out of a real
 * INSERT ... ON CONFLICT DO NOTHING. A mock can be told to return anything, so
 * a unit test proves nothing about the count. Getting it wrong means the
 * gallery silently under-reports what the client consumed.
 *
 * The service takes its connection as a parameter, so no module mocking is
 * needed: the test knex IS the database under test.
 */

const knex = require('knex');

const PG_URL = process.env.PICPEAK_PG_TEST_URL;
const maybe = PG_URL ? describe : describe.skip;

maybe('download ledger on Postgres', () => {
  let pgDb;
  let quotaService;
  let eventId;

  beforeAll(async () => {
    pgDb = knex({ client: 'pg', connection: PG_URL, pool: { min: 0, max: 5 } });

    await pgDb.raw('DROP TABLE IF EXISTS download_quota_orders');
    await pgDb.raw('DROP TABLE IF EXISTS event_photo_downloads');
    await pgDb.raw('DROP TABLE IF EXISTS download_packages');
    await pgDb.raw('DROP TABLE IF EXISTS event_download_quota_settings');

    for (const [table, build] of [
      ['events', (t) => t.increments('id').primary()],
      ['admin_users', (t) => t.increments('id').primary()],
    ]) {
      if (!(await pgDb.schema.hasTable(table))) await pgDb.schema.createTable(table, build);
    }
    if (!(await pgDb.schema.hasTable('app_settings'))) {
      await pgDb.schema.createTable('app_settings', (t) => {
        t.increments('id').primary();
        t.string('setting_key').notNullable();
        t.text('setting_value');
        t.string('setting_type');
      });
    }

    await require('../../migrations/core/214_download_quota').up(pgDb);

    const [event] = await pgDb('events').insert({}).returning('id');
    eventId = event.id ?? event;

    quotaService = require('../../src/services/downloadQuotaService');
  }, 60000);

  afterAll(async () => {
    if (pgDb) await pgDb.destroy();
  });

  beforeEach(async () => {
    await pgDb('event_photo_downloads').where({ event_id: eventId }).delete();
    await pgDb('event_download_quota_settings').where({ event_id: eventId }).delete();
    await pgDb('event_download_quota_settings').insert({
      event_id: eventId, quota_enabled: true, free_limit: 10,
    });
  });

  const client = { accessLevel: 'client' };

  test('reports how many photos it newly charged for', async () => {
    const written = await quotaService.recordDelivered(eventId, [1, 2, 3], client, pgDb);
    expect(written).toBe(3);
  });

  test('a photo delivered twice is charged once and reported as zero the second time', async () => {
    await quotaService.recordDelivered(eventId, [1, 2], client, pgDb);
    const written = await quotaService.recordDelivered(eventId, [1, 2], client, pgDb);

    expect(written).toBe(0);
    const rows = await pgDb('event_photo_downloads').where({ event_id: eventId });
    expect(rows).toHaveLength(2);
  });

  test('a mixed batch charges only the photos that are new', async () => {
    await quotaService.recordDelivered(eventId, [1, 2], client, pgDb);
    const written = await quotaService.recordDelivered(eventId, [2, 3, 4], client, pgDb);

    expect(written).toBe(2);
    const rows = await pgDb('event_photo_downloads').where({ event_id: eventId });
    expect(rows).toHaveLength(4);
  });

  test('the used figure the client sees matches the rows actually written', async () => {
    await quotaService.recordDelivered(eventId, [1, 2, 3], client, pgDb);
    const state = await quotaService.getQuotaState(eventId, pgDb);

    expect(state.used).toBe(3);
    expect(state.remaining).toBe(7);
  });

  test('a gallery with the feature off records nothing at all', async () => {
    await pgDb('event_download_quota_settings').where({ event_id: eventId })
      .update({ quota_enabled: false });

    const written = await quotaService.recordDelivered(eventId, [1, 2], client, pgDb);

    expect(written).toBe(0);
    const rows = await pgDb('event_photo_downloads').where({ event_id: eventId });
    expect(rows).toHaveLength(0);
  });

  test('turning the feature off and on again keeps what was already delivered', async () => {
    await quotaService.recordDelivered(eventId, [1, 2], client, pgDb);
    await pgDb('event_download_quota_settings').where({ event_id: eventId })
      .update({ quota_enabled: false });
    await pgDb('event_download_quota_settings').where({ event_id: eventId })
      .update({ quota_enabled: true });

    const state = await quotaService.getQuotaState(eventId, pgDb);
    expect(state.used).toBe(2);
  });
});
