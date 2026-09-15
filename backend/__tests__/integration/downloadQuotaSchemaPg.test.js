/**
 * PostgreSQL checks for the download quota schema (migration 214).
 * Gated: runs only when PICPEAK_PG_TEST_URL points at a THROWAWAY database, e.g.
 *   PICPEAK_PG_TEST_URL="postgres://picpeak:<pw>@127.0.0.1:5432/picpeak_quota_test" \
 *     npx jest __tests__/integration/downloadQuotaSchemaPg.test.js
 *
 * What SQLite cannot answer: both guarantees under test are Postgres-only.
 * The ledger's protection against double-charging a photo is a UNIQUE
 * constraint, and "only one pending order per gallery" is a PARTIAL unique
 * index, which SQLite expresses differently. Asserting them anywhere but on
 * real Postgres would prove nothing about production.
 */

const knex = require('knex');

const PG_URL = process.env.PICPEAK_PG_TEST_URL;
const maybe = PG_URL ? describe : describe.skip;

maybe('download quota schema on Postgres', () => {
  let pgDb;

  beforeAll(async () => {
    // Own schema, because jest runs suites in parallel workers and the other
    // quota suites create the same four tables. Sharing the public schema meant
    // whichever suite started second dropped the tables the first was using.
    const admin = knex({ client: 'pg', connection: PG_URL, pool: { min: 0, max: 2 } });
    await admin.raw('DROP SCHEMA IF EXISTS quota_schema_test CASCADE');
    await admin.raw('CREATE SCHEMA quota_schema_test');
    await admin.destroy();

    pgDb = knex({
      client: 'pg', connection: PG_URL, searchPath: ['quota_schema_test'], pool: { min: 0, max: 5 },
    });

    // Migration 214 carries foreign keys into events, admin_users and seeds
    // app_settings. A throwaway database has none of them, so stand up the
    // minimum the migration needs rather than weakening the migration itself.
    if (!(await pgDb.schema.hasTable('events'))) {
      await pgDb.schema.createTable('events', (t) => t.increments('id').primary());
    }
    if (!(await pgDb.schema.hasTable('admin_users'))) {
      await pgDb.schema.createTable('admin_users', (t) => t.increments('id').primary());
    }
    if (!(await pgDb.schema.hasTable('app_settings'))) {
      await pgDb.schema.createTable('app_settings', (t) => {
        t.increments('id').primary();
        t.string('setting_key').notNullable();
        t.text('setting_value');
        t.string('setting_type');
      });
    }
    await pgDb('events').insert({}).onConflict().ignore();

    await require('../../migrations/core/214_download_quota').up(pgDb);
  }, 60000);

  afterAll(async () => {
    if (pgDb) await pgDb.destroy();
  });

  test('creates the four tables', async () => {
    for (const name of ['event_download_quota_settings', 'download_packages',
      'event_photo_downloads', 'download_quota_orders']) {
      expect(await pgDb.schema.hasTable(name)).toBe(true);
    }
  });

  test('running it a second time changes nothing and does not throw', async () => {
    await expect(require('../../migrations/core/214_download_quota').up(pgDb)).resolves.not.toThrow();
    const settings = await pgDb('app_settings').where('setting_key', 'like', 'download_quota%');
    expect(settings).toHaveLength(4);
  });

  test('photo_id carries no foreign key, so a deleted photo never refunds a slot', async () => {
    const { rows } = await pgDb.raw(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'event_photo_downloads'::regclass AND contype = 'f'
    `);
    const columns = rows.map((r) => r.conname).join(' ');
    expect(columns).toContain('event_id');
    expect(columns).not.toContain('photo_id');
  });

  test('the ledger refuses to record the same photo twice for one gallery', async () => {
    const [event] = await pgDb('events').select('id').limit(1);
    await pgDb('event_photo_downloads').insert({ event_id: event.id, photo_id: 7 });
    await expect(
      pgDb('event_photo_downloads').insert({ event_id: event.id, photo_id: 7 })
    ).rejects.toThrow();
    await pgDb('event_photo_downloads').where({ event_id: event.id, photo_id: 7 }).delete();
  });

  test('a gallery can hold only one pending order at a time', async () => {
    const [event] = await pgDb('events').select('id').limit(1);
    await pgDb('download_quota_orders').insert({ event_id: event.id, status: 'pending' });
    await expect(
      pgDb('download_quota_orders').insert({ event_id: event.id, status: 'pending' })
    ).rejects.toThrow();

    // A settled order must not block the next one, otherwise a client whose
    // order was rejected could never order again.
    await expect(
      pgDb('download_quota_orders').insert({ event_id: event.id, status: 'rejected' })
    ).resolves.toBeDefined();

    await pgDb('download_quota_orders').where({ event_id: event.id }).delete();
  });
});
