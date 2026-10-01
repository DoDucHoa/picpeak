/**
 * Reveal mode is removed (event form redesign P3, spec 5.12). A gallery whose
 * stored reveal_mode is still on behaves like any other: guests see the
 * photos, no gate answers GALLERY_HIDDEN, the admin API no longer arms or
 * reveals anything, and no scheduler runs. The columns keep their values.
 */

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { bootCrmDb, seedMinimal } = require('./helpers/crmDb');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'reveal-test-secret';

const SLUG = 'reveal-test-event';

describe('reveal mode removed (P3)', () => {
  let db;
  let cleanup;
  let app;
  let eventId;
  let photoIds;
  let adminToken;
  const { isGalleryHidden } = require('../../src/utils/revealMode');

  const galleryToken = (extra = {}) => jwt.sign(
    { eventId, eventSlug: SLUG, type: 'gallery', ...extra },
    process.env.JWT_SECRET,
    { expiresIn: '1h', issuer: 'picpeak-auth' }
  );
  const admin = (req) => req.set('Cookie', [`admin_token=${adminToken}`]).set('Authorization', `Bearer ${adminToken}`);

  beforeAll(async () => {
    ({ db, cleanup } = await bootCrmDb());
    await seedMinimal(db);

    const inserted = await db('events').insert({
      slug: SLUG,
      event_type: 'wedding',
      event_name: 'Reveal Test',
      event_date: '2026-08-01',
      host_email: 'host@example.com',
      admin_email: 'admin@example.com',
      password_hash: 'x',
      share_link: `/gallery/${SLUG}/share`,
      share_token: 'reveal-test-share',
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      is_active: 1,
      is_archived: 0,
      is_draft: 0,
      allow_user_uploads: 1,
      reveal_mode: 1,
      reveal_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    }).returning('id');
    eventId = inserted[0]?.id ?? inserted[0];

    photoIds = [];
    for (let i = 0; i < 2; i++) {
      const p = await db('photos').insert({
        event_id: eventId,
        filename: `photo-${i}.jpg`,
        path: `events/reveal/${i}.jpg`,
        type: 'individual',
        uploaded_at: new Date().toISOString(),
      }).returning('id');
      photoIds.push(p[0]?.id ?? p[0]);
    }

    const superRole = await db('roles').where({ name: 'super_admin' }).first();
    const [rootId] = await db('admin_users').insert({
      username: 'reveal-admin',
      email: 'reveal-admin@example.com',
      password_hash: await bcrypt.hash('RevealAdmin123', 4),
      role_id: superRole.id,
      is_active: 1,
      created_at: new Date(),
      updated_at: new Date(),
    }).returning('id').then((r) => [r[0]?.id || r[0]]);
    adminToken = jwt.sign(
      { id: rootId, username: 'reveal-admin', type: 'admin', role: 'super_admin', loginTime: Date.now() },
      process.env.JWT_SECRET,
      { expiresIn: '1h', issuer: 'picpeak-auth' }
    );

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/gallery', require('../../src/routes/gallery'));
    app.use('/api/gallery', require('../../src/routes/galleryFeedback'));
    app.use('/api/admin/events', require('../../src/routes/adminEvents'));
  }, 120000);

  afterAll(async () => {
    if (cleanup) await cleanup();
  });

  it('never reports a gallery as hidden, whatever its stored columns say', () => {
    expect(isGalleryHidden({ reveal_mode: true, revealed_at: null, reveal_at: null })).toBe(false);
    expect(isGalleryHidden({ reveal_mode: 1, revealed_at: null, reveal_at: new Date(Date.now() + 60_000) })).toBe(false);
  });

  it('gives plain guests the photos of an armed, unrevealed gallery', async () => {
    const res = await request(app)
      .get(`/api/gallery/${SLUG}/photos`)
      .set('Authorization', `Bearer ${galleryToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.hidden_until_reveal).toBe(false);
    expect(res.body.photos).toHaveLength(2);
    expect(res.body.event.reveal_armed).toBe(false);
  });

  it('lets no image, download or stats endpoint answer GALLERY_HIDDEN', async () => {
    for (const url of [
      `/api/gallery/${SLUG}/thumbnail/${photoIds[0]}`,
      `/api/gallery/${SLUG}/photo/${photoIds[0]}`,
      `/api/gallery/${SLUG}/download/${photoIds[0]}`,
      `/api/gallery/${SLUG}/download-all`,
      `/api/gallery/${SLUG}/stats`,
      `/api/gallery/${SLUG}/hero/${photoIds[0]}`,
    ]) {
      const res = await request(app).get(url).set('Authorization', `Bearer ${galleryToken()}`);
      // The seeded files do not exist on disk, so anything but the gate is fine.
      expect(`${url}:${res.body.code}`).not.toBe(`${url}:GALLERY_HIDDEN`);
    }
  });

  it('reports the gallery as visible on /info', async () => {
    const res = await request(app).get(`/api/gallery/${SLUG}/info`);
    expect(res.status).toBe(200);
    expect(res.body.hidden_until_reveal).toBe(false);
    expect(res.body.reveal_at).toBeNull();
  });

  it('leaves the stored reveal columns untouched on the event PUT', async () => {
    await db('events').where({ id: eventId }).update({ reveal_mode: 0, reveal_at: null });
    const res = await admin(request(app).put(`/api/admin/events/${eventId}`))
      .send({ reveal_mode: true, reveal_at: new Date(Date.now() + 3600_000).toISOString() });
    expect(res.status).toBe(200);
    const row = await db('events').where({ id: eventId }).first();
    expect(Boolean(row.reveal_mode)).toBe(false);
    expect(row.reveal_at).toBeNull();
  });

  it('has no reveal action any more', async () => {
    const res = await admin(request(app).post(`/api/admin/events/${eventId}/reveal`)).send({});
    expect(res.status).toBe(404);
  });

  it('starts no reveal scheduler', () => {
    const backend = path.resolve(__dirname, '../..');
    expect(fs.existsSync(path.join(backend, 'src/services/revealScheduler.js'))).toBe(false);
    expect(fs.readFileSync(path.join(backend, 'server.js'), 'utf8')).not.toMatch(/revealScheduler/);
    expect(fs.readFileSync(path.join(backend, 'src/services/serviceShutdown.js'), 'utf8')).not.toMatch(/revealScheduler/);
  });
});
