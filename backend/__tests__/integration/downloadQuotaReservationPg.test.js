/**
 * PostgreSQL checks for atomic download-slot reservation (downloadQuotaService).
 * Gated: runs only when PICPEAK_PG_TEST_URL points at a THROWAWAY database, e.g.
 *   PICPEAK_PG_TEST_URL="postgres://picpeak:<pw>@127.0.0.1:5432/picpeak_quota_test" \
 *     npx jest __tests__/integration/downloadQuotaReservationPg.test.js
 *
 * Why this cannot live in the mocked unit suite: the whole point of the
 * reservation is what happens when two requests read the allowance at the same
 * instant. That is a property of the database's locking, not of the JavaScript,
 * and a mocked connection has no locking to exercise. The old gate checked the
 * allowance and charged it later, so a client with one slot left could fire
 * twenty parallel downloads and take all twenty.
 *
 * The service takes its connection as a parameter, so no module mocking is
 * needed: the test knex IS the database under test.
 */

const knex = require('knex');

const PG_URL = process.env.PICPEAK_PG_TEST_URL;
const maybe = PG_URL ? describe : describe.skip;

/** How many claims race each other, and how many pooled connections carry them. */
const CONCURRENCY = 20;

maybe('download slot reservation on Postgres', () => {
  let pgDb;
  let quotaService;
  let eventId;

  beforeAll(async () => {
    // Own schema, because jest runs suites in parallel workers and the other
    // quota suites create the same four tables. Sharing the public schema meant
    // whichever suite started second dropped the tables the first was using.
    const admin = knex({ client: 'pg', connection: PG_URL, pool: { min: 0, max: 2 } });
    await admin.raw('DROP SCHEMA IF EXISTS quota_reservation_test CASCADE');
    await admin.raw('CREATE SCHEMA quota_reservation_test');
    await admin.destroy();

    // `min` matters as much as `max`, and this is the line the contention test
    // lives or dies by. With the usual `min: 0` the pool opens connections
    // lazily, each one taking longer to establish than a reservation takes to
    // run, so tarn keeps handing the first freed connection to the next waiting
    // claim and twenty "concurrent" reservations execute strictly one after
    // another. The suite then passes against an implementation with no locking
    // at all, which is the one thing it exists to catch. Opening every
    // connection up front is what makes the claims genuinely overlap.
    pgDb = knex({
      client: 'pg',
      connection: PG_URL,
      searchPath: ['quota_reservation_test'],
      pool: { min: CONCURRENCY, max: CONCURRENCY },
    });

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

  async function setFreeLimit(freeLimit) {
    await pgDb('event_photo_downloads').where({ event_id: eventId }).delete();
    await pgDb('event_download_quota_settings').where({ event_id: eventId }).delete();
    await pgDb('event_download_quota_settings').insert({
      event_id: eventId, quota_enabled: true, free_limit: freeLimit,
    });
  }

  const client = { accessLevel: 'client' };

  test('twenty simultaneous claims on a single free slot hand out exactly one', async () => {
    await setFreeLimit(1);
    // Force every pooled connection open before the race, so the claims contend
    // in the database instead of queueing politely for a connection.
    await Promise.all(Array.from({ length: CONCURRENCY }, () => pgDb.raw('SELECT 1')));

    // Twenty DISTINCT photos: the cheat is taking twenty different photos on one
    // slot, not taking the same photo twice (which the unique index alone stops).
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        quotaService.reserveSlots(eventId, [100 + i], client, pgDb))
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(1);
    const rows = await pgDb('event_photo_downloads').where({ event_id: eventId });
    expect(rows).toHaveLength(1);
  }, 30000);

  test('releasing a claim that delivered nothing gives the slots back', async () => {
    await setFreeLimit(5);

    const claim = await quotaService.reserveSlots(eventId, [1, 2, 3], client, pgDb);
    const released = await quotaService.releaseReservation(claim.reserved, [], pgDb);

    expect(released).toBe(3);
    expect((await quotaService.getQuotaState(eventId, pgDb)).used).toBe(0);
  });

  test('releasing keeps the photos that were delivered and drops only the rest', async () => {
    await setFreeLimit(5);

    const claim = await quotaService.reserveSlots(eventId, [1, 2, 3], client, pgDb);
    await quotaService.releaseReservation(claim.reserved, [1, 3], pgDb);

    const kept = await pgDb('event_photo_downloads').where({ event_id: eventId }).pluck('photo_id');
    expect(kept.map(Number).sort()).toEqual([1, 3]);
  });

  /**
   * The regression this guards: a client re-downloads a photo they already own
   * together with a new one, and the transfer breaks. Releasing must not strip
   * the old photo out of the ledger, or a second failed re-download would keep
   * refunding a slot that was spent weeks ago and the allowance would drift
   * upwards every time.
   */
  test('a photo already in the ledger survives a release that refunds the rest', async () => {
    await setFreeLimit(5);
    await quotaService.reserveSlots(eventId, [1], client, pgDb);

    const claim = await quotaService.reserveSlots(eventId, [1, 2], client, pgDb);
    await quotaService.releaseReservation(claim.reserved, [], pgDb);

    const kept = await pgDb('event_photo_downloads').where({ event_id: eventId }).pluck('photo_id');
    expect(kept.map(Number)).toEqual([1]);
  });

  test('a claim the allowance cannot cover writes nothing at all', async () => {
    await setFreeLimit(2);

    const claim = await quotaService.reserveSlots(eventId, [1, 2, 3], client, pgDb);

    expect(claim.allowed).toBe(false);
    expect(claim.missingSlots).toBe(1);
    expect(await pgDb('event_photo_downloads').where({ event_id: eventId })).toHaveLength(0);
  });

  test('a gallery with the feature off claims nothing and refuses nobody', async () => {
    await pgDb('event_photo_downloads').where({ event_id: eventId }).delete();
    await pgDb('event_download_quota_settings').where({ event_id: eventId }).delete();
    await pgDb('event_download_quota_settings').insert({
      event_id: eventId, quota_enabled: false, free_limit: 1,
    });

    const claim = await quotaService.reserveSlots(eventId, [1, 2, 3], client, pgDb);

    expect(claim.allowed).toBe(true);
    expect(claim.reserved).toEqual([]);
    expect(await pgDb('event_photo_downloads').where({ event_id: eventId })).toHaveLength(0);
  });

  test('the used figure the client sees matches the rows actually written', async () => {
    await setFreeLimit(10);

    await quotaService.reserveSlots(eventId, [1, 2, 3], client, pgDb);
    const state = await quotaService.getQuotaState(eventId, pgDb);

    expect(state.used).toBe(3);
    expect(state.remaining).toBe(7);
  });

  test('turning the feature off and on again keeps what was already delivered', async () => {
    await setFreeLimit(10);
    await quotaService.reserveSlots(eventId, [1, 2], client, pgDb);

    await pgDb('event_download_quota_settings').where({ event_id: eventId })
      .update({ quota_enabled: false });
    await pgDb('event_download_quota_settings').where({ event_id: eventId })
      .update({ quota_enabled: true });

    expect((await quotaService.getQuotaState(eventId, pgDb)).used).toBe(2);
  });

  test('a photo claimed twice costs one slot and comes back free the second time', async () => {
    await setFreeLimit(10);

    await quotaService.reserveSlots(eventId, [1, 2], client, pgDb);
    const again = await quotaService.reserveSlots(eventId, [1, 2], client, pgDb);

    expect(again.allowed).toBe(true);
    expect(again.reserved).toEqual([]);
    expect((await quotaService.getQuotaState(eventId, pgDb)).used).toBe(2);
  });

  test('a mixed claim charges only the photos that are new', async () => {
    await setFreeLimit(10);

    await quotaService.reserveSlots(eventId, [1, 2], client, pgDb);
    const mixed = await quotaService.reserveSlots(eventId, [2, 3, 4], client, pgDb);

    expect(mixed.reserved).toHaveLength(2);
    expect((await quotaService.getQuotaState(eventId, pgDb)).used).toBe(4);
  });

  test('an admin preview streams without ever touching the ledger', async () => {
    await setFreeLimit(5);

    const claim = await quotaService.reserveSlots(
      eventId, [1, 2], { accessLevel: 'client', isAdminPreview: true }, pgDb
    );

    expect(claim.allowed).toBe(true);
    expect(claim.reserved).toEqual([]);
    expect(await pgDb('event_photo_downloads').where({ event_id: eventId })).toHaveLength(0);
  });
});
