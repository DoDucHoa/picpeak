/**
 * PostgreSQL checks for the one query that decides which photos a download
 * would actually deliver (`downloadablePhotosQuery` in utils/photoVisibility).
 * Gated: runs only when PICPEAK_PG_TEST_URL points at a THROWAWAY database, e.g.
 *   PICPEAK_PG_TEST_URL="postgres://picpeak:<pw>@127.0.0.1:5432/picpeak_quota_test" \
 *     npx jest __tests__/integration/downloadablePhotosQueryPg.test.js
 *
 * This predicate used to exist twice: once in the quota gate, to decide what a
 * whole-gallery download costs, and once in the archive builder, to decide what
 * it contains. The comment above the copy in the gate asked whoever changed one
 * to change the other, because a mismatch charges the client for photos they
 * never receive. A comment is not a mechanism, so the two now share this
 * function and this suite pins what it filters.
 *
 * It has to run against a real database because the rule is three-way SQL: a
 * LEFT JOIN whose NULL means "included", a tri-state boolean column, and a
 * visibility filter that applies to guests but not to clients. Every one of
 * those is a place a rewrite silently changes the result set.
 */

const knex = require('knex');

const PG_URL = process.env.PICPEAK_PG_TEST_URL;
const maybe = PG_URL ? describe : describe.skip;

maybe('downloadablePhotosQuery on Postgres', () => {
  let pgDb;
  let downloadablePhotosQuery;
  let eventId;
  const photoIds = {};

  beforeAll(async () => {
    const admin = knex({ client: 'pg', connection: PG_URL, pool: { min: 0, max: 2 } });
    await admin.raw('DROP SCHEMA IF EXISTS downloadable_photos_test CASCADE');
    await admin.raw('CREATE SCHEMA downloadable_photos_test');
    await admin.destroy();

    pgDb = knex({
      client: 'pg',
      connection: PG_URL,
      searchPath: ['downloadable_photos_test'],
      pool: { min: 0, max: 5 },
    });

    await pgDb.schema.createTable('events', (t) => t.increments('id').primary());
    await pgDb.schema.createTable('photo_categories', (t) => {
      t.increments('id').primary();
      // Nullable on purpose: a category row created before migration 135 has no
      // answer here, and the rule counts that as "downloads allowed".
      t.boolean('allow_downloads').nullable();
    });
    await pgDb.schema.createTable('photos', (t) => {
      t.increments('id').primary();
      t.integer('event_id').notNullable();
      t.integer('category_id').nullable();
      t.string('visibility', 20).nullable();
    });

    const [event] = await pgDb('events').insert({}).returning('id');
    eventId = event.id ?? event;

    const [allowed] = await pgDb('photo_categories').insert({ allow_downloads: true }).returning('id');
    const [refused] = await pgDb('photo_categories').insert({ allow_downloads: false }).returning('id');
    const [legacy] = await pgDb('photo_categories').insert({ allow_downloads: null }).returning('id');

    const rows = {
      uncategorised: { event_id: eventId, category_id: null, visibility: 'visible' },
      inAllowedCategory: { event_id: eventId, category_id: allowed.id ?? allowed, visibility: 'visible' },
      inRefusedCategory: { event_id: eventId, category_id: refused.id ?? refused, visibility: 'visible' },
      inLegacyCategory: { event_id: eventId, category_id: legacy.id ?? legacy, visibility: 'visible' },
      hidden: { event_id: eventId, category_id: null, visibility: 'hidden' },
      preMigrationVisibility: { event_id: eventId, category_id: null, visibility: null },
      otherEvent: { event_id: eventId + 1000, category_id: null, visibility: 'visible' },
    };
    for (const [name, row] of Object.entries(rows)) {
      const [inserted] = await pgDb('photos').insert(row).returning('id');
      photoIds[name] = Number(inserted.id ?? inserted);
    }

    ({ downloadablePhotosQuery } = require('../../src/utils/photoVisibility'));
  }, 60000);

  afterAll(async () => {
    if (pgDb) await pgDb.destroy();
  });

  const idsFor = async (accessLevel) => {
    const rows = await downloadablePhotosQuery(eventId, accessLevel, pgDb).select('photos.id');
    return rows.map((row) => Number(row.id)).sort((a, b) => a - b);
  };

  const sorted = (...names) => names.map((n) => photoIds[n]).sort((a, b) => a - b);

  test('a guest gets everything downloadable except the hidden photo', async () => {
    expect(await idsFor('guest')).toEqual(
      sorted('uncategorised', 'inAllowedCategory', 'inLegacyCategory', 'preMigrationVisibility')
    );
  });

  test('a client gets the hidden photo as well', async () => {
    expect(await idsFor('client')).toEqual(
      sorted('uncategorised', 'inAllowedCategory', 'inLegacyCategory', 'preMigrationVisibility', 'hidden')
    );
  });

  test('a category that switched downloads off is excluded from both', async () => {
    expect(await idsFor('guest')).not.toContain(photoIds.inRefusedCategory);
    expect(await idsFor('client')).not.toContain(photoIds.inRefusedCategory);
  });

  test('another gallery never leaks in', async () => {
    expect(await idsFor('client')).not.toContain(photoIds.otherEvent);
  });

  /**
   * The mismatch this whole function exists to prevent: the gate prices the
   * download off `photos.id` and the builder fills the archive off `photos.*`.
   * Selecting different columns must never select different rows.
   */
  test('pricing the download and filling it see the same photos', async () => {
    const priced = await downloadablePhotosQuery(eventId, 'guest', pgDb).select('photos.id');
    const filled = await downloadablePhotosQuery(eventId, 'guest', pgDb)
      .select('photos.*')
      .orderBy('photos.id', 'desc');

    expect(filled.map((row) => Number(row.id)).sort((a, b) => a - b))
      .toEqual(priced.map((row) => Number(row.id)).sort((a, b) => a - b));
  });
});
