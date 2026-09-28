/**
 * The single-photo download route after the upstream sync. The fork's
 * allowance gate and upstream's grant both run on this path, and the grant is
 * what records the download: keeping only one side of the merge either left
 * the grant undefined (every single download answered 500) or counted twice.
 */
process.env.JWT_SECRET = 'single-download-secret-at-least-32-characters';
process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { bootCrmDb } = require('../integration/helpers/crmDb');

const EVENT_SLUG = 'single-download-wedding';
const PHOTO_BYTES = Buffer.from('not really a jpeg, but bytes the route streams back');

let db, cleanup, app, eventId, photoId;

beforeAll(async () => {
  ({ db, cleanup } = await bootCrmDb());

  [eventId] = await db('events').insert({
    slug: EVENT_SLUG, event_type: 'wedding', event_name: 'Single Download', event_date: '2026-09-01',
    customer_name: 'Client', customer_email: 'client@example.com', admin_email: 'admin@example.com',
    password_hash: 'x', share_link: `https://example.com/gallery/${EVENT_SLUG}`,
    expires_at: new Date(Date.now() + 86400000), allow_downloads: true, is_draft: false,
  }).returning('id').then((rows) => rows.map((r) => (typeof r === 'object' ? r.id : r)));

  const rel = `${EVENT_SLUG}/a.jpg`;
  const abs = path.join(process.env.STORAGE_PATH, 'events', 'active', rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, PHOTO_BYTES);
  [photoId] = await db('photos').insert({
    event_id: eventId, filename: 'a.jpg', path: rel, type: 'individual', size_bytes: PHOTO_BYTES.length,
  }).returning('id').then((rows) => rows.map((r) => (typeof r === 'object' ? r.id : r)));

  jest.doMock('../../src/middleware/gallery', () => ({
    verifyGalleryAccess: async (req, _res, next) => {
      req.event = await db('events').where({ id: eventId }).first();
      req.accessLevel = 'client';
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
}, 120000);

afterAll(async () => {
  jest.dontMock('../../src/middleware/gallery');
  jest.dontMock('../../src/utils/revealMode');
  await cleanup();
});

it('serves a single photo and records the download once', async () => {
  const res = await request(app)
    .get(`/${EVENT_SLUG}/download/${photoId}`)
    .buffer(true)
    .parse((r, cb) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });

  expect(res.status).toBe(200);
  expect(Buffer.compare(res.body, PHOTO_BYTES)).toBe(0);
  const photo = await db('photos').where({ id: photoId }).first('download_count');
  expect(Number(photo.download_count)).toBe(1);
});
