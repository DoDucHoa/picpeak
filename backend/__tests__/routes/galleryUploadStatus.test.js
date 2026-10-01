/**
 * Cache headers on the gallery router (testplan REPORT.md B6), and the guest
 * upload routes that P3 of the event form redesign removed (spec 5.12).
 *
 * B6: the private per-guest JSON on this router carried no Cache-Control at
 * all and fell back to heuristic freshness. The media routes must keep their
 * own caching: the point of the change is that it is per route, not global.
 */

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const { bootCrmDb, seedMinimal } = require('../integration/helpers/crmDb');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'upload-status-test-secret';

const SLUG_A = 'upload-status-a';
const SLUG_B = 'upload-status-b';

describe('gallery cache headers, and guest uploads removed', () => {
  let db;
  let cleanup;
  let app;
  let eventA;
  let eventB;

  const galleryToken = (eventId, slug, extra = {}) => jwt.sign(
    { eventId, eventSlug: slug, type: 'gallery', ...extra },
    process.env.JWT_SECRET,
    { expiresIn: '1h', issuer: 'picpeak-auth' }
  );

  const createEvent = async (slug, name) => {
    const inserted = await db('events').insert({
      slug,
      event_type: 'wedding',
      event_name: name,
      event_date: '2026-08-01',
      host_email: 'host@example.com',
      admin_email: 'admin@example.com',
      password_hash: 'x',
      share_link: `/gallery/${slug}/share`,
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      is_active: 1,
      is_archived: 0,
      is_draft: 0,
      allow_user_uploads: 1,
      created_at: new Date().toISOString(),
    }).returning('id');
    return inserted[0]?.id ?? inserted[0];
  };

  beforeAll(async () => {
    ({ db, cleanup } = await bootCrmDb());
    await seedMinimal(db);

    eventA = await createEvent(SLUG_A, 'Upload Status A');
    eventB = await createEvent(SLUG_B, 'Upload Status B');

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/gallery', require('../../src/routes/gallery'));
  }, 180000);

  afterAll(async () => {
    if (cleanup) await cleanup();
  });

  describe('guest uploads removed (P3)', () => {
    it('refuses an upload even on an event whose stored flag is still on', async () => {
      const res = await request(app)
        .post(`/api/gallery/${eventA}/upload`)
        .set('Authorization', `Bearer ${galleryToken(eventA, SLUG_A)}`)
        .attach('photos', Buffer.from('not really a photo'), { filename: 'guest.jpg', contentType: 'image/jpeg' });
      expect(res.status).toBe(403);
      const count = await db('photos').where({ event_id: eventA }).count('id as c').first();
      expect(Number(count.c)).toBe(0);
    });

    it('has no upload status route', async () => {
      const res = await request(app)
        .get(`/api/gallery/${SLUG_A}/uploads/status`)
        .query({ ids: 'a1b2c3d4e5f60718293a4b5c6d7e8f90' })
        .set('Authorization', `Bearer ${galleryToken(eventA, SLUG_A)}`);
      expect(res.status).toBe(404);
    });

    it('tells the gallery that uploads are off', async () => {
      const photos = await request(app)
        .get(`/api/gallery/${SLUG_A}/photos`)
        .set('Authorization', `Bearer ${galleryToken(eventA, SLUG_A)}`);
      expect(photos.body.event.allow_user_uploads).toBe(false);
      const info = await request(app).get(`/api/gallery/${SLUG_A}/info`);
      expect(info.body.allow_user_uploads).toBe(false);
    });
  });

  describe('B6 — cache headers', () => {
    const noStore = (res) => {
      expect(res.headers['cache-control']).toBe('no-store, no-cache, must-revalidate, private');
      expect(res.headers.pragma).toBe('no-cache');
    };

    it('marks the private per-guest JSON routes no-store', async () => {
      const token = galleryToken(eventA, SLUG_A);
      const photos = await request(app)
        .get(`/api/gallery/${SLUG_A}/photos`)
        .set('Authorization', `Bearer ${token}`);
      expect(photos.status).toBe(200);
      noStore(photos);

      const stats = await request(app)
        .get(`/api/gallery/${SLUG_A}/stats`)
        .set('Authorization', `Bearer ${token}`);
      expect(stats.status).toBe(200);
      noStore(stats);

      const people = await request(app)
        .get(`/api/gallery/${SLUG_A}/people`)
        .set('Authorization', `Bearer ${token}`);
      expect(people.status).toBe(200);
      noStore(people);
    });

    it('still lets /photos answer a conditional request with a 304', async () => {
      // The post-upload poll depends on revalidation staying correct: no-store
      // stops the browser retaining the body, it must not stop express from
      // agreeing that an unchanged payload is unchanged.
      const token = galleryToken(eventA, SLUG_A);
      const first = await request(app)
        .get(`/api/gallery/${SLUG_A}/photos`)
        .set('Authorization', `Bearer ${token}`);
      expect(first.headers.etag).toBeTruthy();

      const second = await request(app)
        .get(`/api/gallery/${SLUG_A}/photos`)
        .set('Authorization', `Bearer ${token}`)
        .set('If-None-Match', first.headers.etag);
      expect(second.status).toBe(304);
    });
  });
});
