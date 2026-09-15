/**
 * PostgreSQL checks for the order lifecycle (migration 214 + downloadOrderService).
 * Gated: runs only when PICPEAK_PG_TEST_URL points at a THROWAWAY database, e.g.
 *   PICPEAK_PG_TEST_URL="postgres://picpeak:<pw>@127.0.0.1:5432/picpeak_quota_test" \
 *     npx jest __tests__/integration/downloadOrderPg.test.js
 *
 * Why this cannot live in the mocked unit suite: the "only one pending order per
 * gallery" rule is a partial unique index, not code, and createOrder deliberately
 * lets the database raise it instead of checking first. A mock can be told to
 * throw whatever the test wants, so it proves nothing about the real index, the
 * real error code, or the real constraint name. The same goes for the insert
 * itself: without `.returning('*')` knex hands back no rows on Postgres and the
 * caller gets nothing, which no mock ever reproduces.
 *
 * The service takes its connection as a parameter, so no module mocking is
 * needed: the test knex IS the database under test.
 */

const knex = require('knex');

const PG_URL = process.env.PICPEAK_PG_TEST_URL;
const maybe = PG_URL ? describe : describe.skip;

maybe('download quota orders on Postgres', () => {
  let pgDb;
  let orderService;
  let quotaService;
  let eventId;
  let otherEventId;
  let adminId;
  let quantityPackageId;
  let unlimitedPackageId;

  async function nextFreeId(table) {
    const [{ max }] = await pgDb(table).max('id as max');
    return Number(max || 0) + 1;
  }

  async function resyncSequence(table) {
    await pgDb.raw(
      'SELECT setval(pg_get_serial_sequence(?, \'id\'), COALESCE((SELECT MAX(id) FROM ??), 1))',
      [table, table]
    );
  }

  beforeAll(async () => {
    // Own schema, because jest runs suites in parallel workers and the other
    // quota suites create the same four tables. Sharing the public schema meant
    // whichever suite started second dropped the tables the first was using.
    const admin = knex({ client: 'pg', connection: PG_URL, pool: { min: 0, max: 2 } });
    await admin.raw('DROP SCHEMA IF EXISTS quota_order_test CASCADE');
    await admin.raw('CREATE SCHEMA quota_order_test');
    await admin.destroy();

    pgDb = knex({
      client: 'pg', connection: PG_URL, searchPath: ['quota_order_test'], pool: { min: 0, max: 5 },
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
    // Only the columns getProfile() touches. The currency frozen into a snapshot
    // comes from here, so a stub that always answers CHF would hide a wrong read.
    if (!(await pgDb.schema.hasTable('business_profile'))) {
      await pgDb.schema.createTable('business_profile', (t) => {
        t.increments('id').primary();
        t.string('default_currency', 3).defaultTo('CHF');
      });
    }
    if (!(await pgDb.schema.hasTable('business_bank_accounts'))) {
      await pgDb.schema.createTable('business_bank_accounts', (t) => {
        t.increments('id').primary();
        t.integer('business_profile_id');
        t.integer('display_order').defaultTo(0);
      });
    }
    await pgDb('business_profile').del();
    await pgDb('business_profile').insert({ id: 1, default_currency: 'EUR' });

    await require('../../migrations/core/214_download_quota').up(pgDb);

    // The throwaway database is shared with the other quota suites, and a row
    // inserted there with an explicit id leaves the serial behind the table.
    // Pick ids from MAX(id) and put the sequence back in step afterwards, so
    // neither this suite nor the next one hits a primary key clash.
    eventId = await nextFreeId('events');
    otherEventId = eventId + 1;
    await pgDb('events').insert([{ id: eventId }, { id: otherEventId }]);
    await resyncSequence('events');

    adminId = await nextFreeId('admin_users');
    const adminColumns = await pgDb('admin_users').columnInfo();
    const adminRow = { id: adminId };
    if (adminColumns.username) adminRow.username = `quota-test-${adminId}`;
    if (adminColumns.email) adminRow.email = `quota-test-${adminId}@example.test`;
    await pgDb('admin_users').insert(adminRow);
    await resyncSequence('admin_users');

    const [quantity] = await pgDb('download_packages').insert({
      event_id: eventId, kind: 'quantity', photo_count: 20, price: '18.00',
      name_i18n: JSON.stringify({ en: 'Twenty more' }), sort_order: 1, is_active: true,
    }).returning('id');
    quantityPackageId = quantity.id ?? quantity;

    const [unlimited] = await pgDb('download_packages').insert({
      event_id: eventId, kind: 'unlimited', photo_count: null, price: '300.00',
      sort_order: 2, is_active: true,
    }).returning('id');
    unlimitedPackageId = unlimited.id ?? unlimited;

    orderService = require('../../src/services/downloadOrderService');
    quotaService = require('../../src/services/downloadQuotaService');
  }, 60000);

  afterAll(async () => {
    if (pgDb) await pgDb.destroy();
  });

  beforeEach(async () => {
    await pgDb('download_quota_orders').whereIn('event_id', [eventId, otherEventId]).delete();
    await pgDb('event_photo_downloads').where({ event_id: eventId }).delete();
    await pgDb('event_download_quota_settings').where({ event_id: eventId }).delete();
    await pgDb('event_download_quota_settings').insert({
      event_id: eventId, quota_enabled: true, free_limit: 10,
    });
  });

  const client = { accessLevel: 'client' };

  function place(packageId = quantityPackageId) {
    return orderService.createOrder({
      eventId, packageId, req: client, origin: 'client', conn: pgDb,
    });
  }

  test('the created order comes back with its generated id, which proves the insert returned rows', async () => {
    const order = await place();

    expect(order.id).toEqual(expect.any(Number));
    expect(order.status).toBe('pending');
    expect(order.requested_photo_count).toBe(20);
    expect(order.expires_at).toBeInstanceOf(Date);
  });

  test('the frozen snapshot survives a later price edit on the package', async () => {
    const order = await place();
    await pgDb('download_packages').where({ id: quantityPackageId }).update({ price: '99.00' });

    const stored = await pgDb('download_quota_orders').where({ id: order.id }).first();
    expect(stored.package_snapshot).toEqual({
      kind: 'quantity',
      photo_count: 20,
      price: 18,
      currency: 'EUR',
      name_i18n: { en: 'Twenty more' },
    });

    await pgDb('download_packages').where({ id: quantityPackageId }).update({ price: '18.00' });
  });

  test('a second pending order is blocked by the database, not by a read-then-insert check', async () => {
    await place();
    await expect(place()).rejects.toBeInstanceOf(orderService.PendingOrderExistsError);
    const rows = await pgDb('download_quota_orders').where({ event_id: eventId });
    expect(rows).toHaveLength(1);
  });

  test('a rejected order does not block the next one', async () => {
    const first = await place();
    await orderService.rejectOrder({
      orderId: first.id, adminId, reason: 'fully booked', conn: pgDb,
    });

    const second = await place();
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe('pending');
  });

  test('an expired order does not block the next one either', async () => {
    const first = await place();
    await pgDb('download_quota_orders').where({ id: first.id })
      .update({ expires_at: new Date(Date.now() - 60000) });
    await orderService.expireStaleOrders(new Date(), pgDb);

    const second = await place();
    expect(second.status).toBe('pending');
  });

  test('approving an order raises the gallery total by exactly the granted count', async () => {
    const before = await quotaService.getQuotaState(eventId, pgDb);
    const order = await place();
    await orderService.approveOrder({ orderId: order.id, adminId, conn: pgDb });

    const after = await quotaService.getQuotaState(eventId, pgDb);
    expect(before.total).toBe(10);
    expect(after.total).toBe(30);
    expect(after.remaining).toBe(30);
  });

  test('an override typed by the photographer is what gets added', async () => {
    const order = await place();
    await orderService.approveOrder({
      orderId: order.id, adminId, grantedPhotoCount: 5, conn: pgDb,
    });

    const state = await quotaService.getQuotaState(eventId, pgDb);
    expect(state.total).toBe(15);
  });

  test('approving an unlimited package makes the gallery unlimited', async () => {
    const order = await place(unlimitedPackageId);
    const approved = await orderService.approveOrder({ orderId: order.id, adminId, conn: pgDb });

    expect(approved.grants_unlimited).toBe(true);
    expect(approved.granted_photo_count).toBeNull();
    const state = await quotaService.getQuotaState(eventId, pgDb);
    expect(state.unlimited).toBe(true);
    expect(state.remaining).toBeNull();
  });

  test('approving the same order twice is refused', async () => {
    const order = await place();
    await orderService.approveOrder({ orderId: order.id, adminId, conn: pgDb });

    await expect(orderService.approveOrder({ orderId: order.id, adminId, conn: pgDb }))
      .rejects.toBeInstanceOf(orderService.InvalidTransitionError);
  });

  test('expiry moves a lapsed order and leaves one still in date alone', async () => {
    // Two galleries, because the partial unique index allows only one pending
    // order per event and this test needs a lapsed one next to a live one.
    const lapsed = await place();
    await pgDb('download_quota_orders').where({ id: lapsed.id })
      .update({ expires_at: new Date(Date.now() - 60000) });
    const [live] = await pgDb('download_quota_orders').insert({
      event_id: otherEventId, status: 'pending', expires_at: new Date(Date.now() + 60000),
    }).returning('*');

    const touched = await orderService.expireStaleOrders(new Date(), pgDb);

    expect(touched).toBe(1);
    expect((await pgDb('download_quota_orders').where({ id: lapsed.id }).first()).status)
      .toBe('expired');
    expect((await pgDb('download_quota_orders').where({ id: live.id }).first()).status)
      .toBe('pending');
  });

  test('an order whose deadline has not arrived is left pending', async () => {
    const order = await place();

    const touched = await orderService.expireStaleOrders(new Date(), pgDb);

    expect(touched).toBe(0);
    const stored = await pgDb('download_quota_orders').where({ id: order.id }).first();
    expect(stored.status).toBe('pending');
  });

  test('getPendingOrder finds the waiting order and nothing else', async () => {
    expect(await orderService.getPendingOrder(eventId, pgDb)).toBeNull();

    const order = await place();
    const pending = await orderService.getPendingOrder(eventId, pgDb);
    expect(pending.id).toBe(order.id);

    await orderService.approveOrder({ orderId: order.id, adminId, conn: pgDb });
    expect(await orderService.getPendingOrder(eventId, pgDb)).toBeNull();
  });
});
