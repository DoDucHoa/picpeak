/**
 * End to end check of the quota gate on a real download route, against real
 * Postgres. Gated on PICPEAK_PG_TEST_URL pointing at a THROWAWAY database.
 *
 * Every other suite proves a piece in isolation: the service computes the right
 * numbers, the gate shapes the right response, the route file parses. None of
 * them proves the gate is actually reached when a request arrives, which is
 * precisely where a wiring mistake hides, and the mistake would be invisible:
 * downloads simply keep working and nobody is ever charged.
 *
 * The request stops at the gate, before any file is touched, so the fixture
 * needs database rows only and no photo files on disk.
 */

const knex = require('knex');
const express = require('express');
const request = require('supertest');

const PG_URL = process.env.PICPEAK_PG_TEST_URL;
const maybe = PG_URL ? describe : describe.skip;

maybe('download quota gate on the real route', () => {
  let pgDb;
  let app;
  const EVENT_ID = 1;

  beforeAll(async () => {
    const admin = knex({ client: 'pg', connection: PG_URL, pool: { min: 0, max: 2 } });
    await admin.raw('DROP SCHEMA IF EXISTS quota_route_test CASCADE');
    await admin.raw('CREATE SCHEMA quota_route_test');
    await admin.destroy();

    pgDb = knex({
      client: 'pg', connection: PG_URL, searchPath: ['quota_route_test'], pool: { min: 0, max: 5 },
    });

    await pgDb.schema.createTable('events', (t) => {
      t.increments('id').primary();
      t.string('slug');
      t.boolean('allow_downloads').defaultTo(true);
      t.boolean('watermark_downloads').defaultTo(false);
    });
    await pgDb.schema.createTable('admin_users', (t) => t.increments('id').primary());
    await pgDb.schema.createTable('photo_categories', (t) => {
      t.increments('id').primary();
      t.boolean('allow_downloads').defaultTo(true);
    });
    await pgDb.schema.createTable('photos', (t) => {
      t.increments('id').primary();
      t.integer('event_id');
      t.integer('category_id').nullable();
      t.string('visibility').defaultTo('visible');
      t.string('type').defaultTo('individual');
      t.string('filename');
      t.string('path');
      t.integer('download_count').defaultTo(0);
      t.timestamp('uploaded_at').defaultTo(pgDb.fn.now());
    });
    await pgDb.schema.createTable('app_settings', (t) => {
      t.increments('id').primary();
      t.string('setting_key').notNullable();
      t.text('setting_value');
      t.string('setting_type');
    });
    await pgDb.schema.createTable('activity_logs', (t) => {
      t.increments('id').primary();
      t.integer('event_id').nullable();
      t.string('activity_type');
      t.jsonb('metadata').nullable();
      t.timestamp('created_at').defaultTo(pgDb.fn.now());
    });

    await require('../../migrations/core/214_download_quota').up(pgDb);

    await pgDb('events').insert({ id: EVENT_ID, slug: 'wedding', allow_downloads: true });
    await pgDb('photos').insert([
      { id: 11, event_id: EVENT_ID, filename: 'a.jpg', path: 'a.jpg' },
      { id: 12, event_id: EVENT_ID, filename: 'b.jpg', path: 'b.jpg' },
      { id: 13, event_id: EVENT_ID, filename: 'c.jpg', path: 'c.jpg' },
    ]);

    jest.resetModules();
    jest.doMock('../../src/database/db', () => ({
      db: pgDb,
      logActivity: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock('../../src/middleware/gallery', () => ({
      verifyGalleryAccess: (req, _res, next) => {
        req.event = { id: EVENT_ID, slug: 'wedding', allow_downloads: true };
        req.accessLevel = global.__routeAccessLevel || 'client';
        next();
      },
      denySlideshowToken: (_req, _res, next) => next(),
    }));
    jest.doMock('../../src/utils/revealMode', () => ({
      blockHiddenGallery: (_req, _res, next) => next(),
    }));

    app = express();
    app.use(express.json());
    app.use(require('../../src/routes/gallery/downloads'));
  }, 60000);

  afterAll(async () => {
    jest.dontMock('../../src/database/db');
    if (pgDb) await pgDb.destroy();
  });

  beforeEach(async () => {
    global.__routeAccessLevel = 'client';
    await pgDb('event_photo_downloads').delete();
    await pgDb('download_quota_orders').delete();
    await pgDb('event_download_quota_settings').delete();
  });

  async function enableQuota(freeLimit) {
    await pgDb('event_download_quota_settings').insert({
      event_id: EVENT_ID, quota_enabled: true, free_limit: freeLimit, enabled_at: new Date(),
    });
  }

  test('refuses the whole request and names what is missing when the allowance is short', async () => {
    await enableQuota(2);

    const res = await request(app)
      .post('/wedding/download-selected')
      .send({ photo_ids: [11, 12, 13] });

    expect(res.status).toBe(402);
    expect(res.body).toEqual({
      code: 'DOWNLOAD_QUOTA_EXCEEDED',
      quota: { total: 2, used: 0, remaining: 2 },
      requested_new: 3,
      missing_slots: 1,
    });
  });

  test('charges nothing for a refused request', async () => {
    await enableQuota(2);

    await request(app).post('/wedding/download-selected').send({ photo_ids: [11, 12, 13] });

    const rows = await pgDb('event_photo_downloads');
    expect(rows).toHaveLength(0);
  });

  test('a request that fits is not refused by the gate', async () => {
    await enableQuota(3);

    const res = await request(app)
      .post('/wedding/download-selected')
      .send({ photo_ids: [11, 12, 13] });

    // The archive itself fails later: the fixture writes no files to disk. What
    // matters here is that the gate did not turn it away.
    expect(res.status).not.toBe(402);
  });

  test('photos already delivered do not consume the allowance twice', async () => {
    await enableQuota(2);
    await pgDb('event_photo_downloads').insert([
      { event_id: EVENT_ID, photo_id: 11 },
      { event_id: EVENT_ID, photo_id: 12 },
    ]);

    const res = await request(app)
      .post('/wedding/download-selected')
      .send({ photo_ids: [11, 12] });

    expect(res.status).not.toBe(402);
  });

  test('a viewer who is not the paying client is turned away once the feature is on', async () => {
    await enableQuota(50);
    global.__routeAccessLevel = 'guest';

    const res = await request(app)
      .post('/wedding/download-selected')
      .send({ photo_ids: [11] });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DOWNLOAD_NOT_ALLOWED_FOR_GUEST');
  });

  test('a gallery with the feature off behaves exactly as before for a guest', async () => {
    global.__routeAccessLevel = 'guest';

    const res = await request(app)
      .post('/wedding/download-selected')
      .send({ photo_ids: [11, 12, 13] });

    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(402);
  });
});
