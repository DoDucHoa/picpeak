/**
 * The single-photo download route after the upstream sync. The fork's
 * allowance gate claims the slot before a byte is sent and settles it when the
 * response ends; the route itself bumps the download counter. A merge that
 * kept the wrong side of this handler either broke every single download or
 * charged the allowance twice, and these cases pin both.
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

let db, cleanup, app, eventId, photoId, secondPhotoId, missingPhotoId;

const idOf = (rows) => rows.map((r) => (typeof r === 'object' ? r.id : r))[0];

async function addPhoto(name, { onDisk = true } = {}) {
  const rel = `${EVENT_SLUG}/${name}`;
  if (onDisk) {
    const abs = path.join(process.env.STORAGE_PATH, 'events', 'active', rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, PHOTO_BYTES);
  }
  return idOf(await db('photos').insert({
    event_id: eventId, filename: name, path: rel, type: 'individual', size_bytes: PHOTO_BYTES.length,
  }).returning('id'));
}

const download = (id) => request(app)
  .get(`/${EVENT_SLUG}/download/${id}`)
  .buffer(true)
  .parse((r, cb) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });

const ledgerRows = () => db('event_photo_downloads').where({ event_id: eventId });

async function enableAllowance(freeLimit) {
  await db('event_download_quota_settings').insert({
    event_id: eventId, quota_enabled: true, free_limit: freeLimit, enabled_at: new Date(),
  });
}

beforeAll(async () => {
  ({ db, cleanup } = await bootCrmDb());

  eventId = idOf(await db('events').insert({
    slug: EVENT_SLUG, event_type: 'wedding', event_name: 'Single Download', event_date: '2026-09-01',
    customer_name: 'Client', customer_email: 'client@example.com', admin_email: 'admin@example.com',
    password_hash: 'x', share_link: `https://example.com/gallery/${EVENT_SLUG}`,
    expires_at: new Date(Date.now() + 86400000), allow_downloads: true, is_draft: false,
  }).returning('id'));

  photoId = await addPhoto('a.jpg');
  secondPhotoId = await addPhoto('b.jpg');
  missingPhotoId = await addPhoto('gone.jpg', { onDisk: false });

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

beforeEach(async () => {
  await db('event_photo_downloads').where({ event_id: eventId }).delete();
  await db('event_download_quota_settings').where({ event_id: eventId }).delete();
  await db('photos').where({ event_id: eventId }).update({ download_count: 0 });
});

it('serves a single photo and records the download once', async () => {
  const res = await download(photoId);

  expect(res.status).toBe(200);
  expect(Buffer.compare(res.body, PHOTO_BYTES)).toBe(0);
  const photo = await db('photos').where({ id: photoId }).first('download_count');
  expect(Number(photo.download_count)).toBe(1);
});

describe('with the download allowance on', () => {
  it('charges a delivered photo exactly once', async () => {
    await enableAllowance(1);

    const res = await download(photoId);

    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body, PHOTO_BYTES)).toBe(0);
    expect((await ledgerRows()).map((r) => Number(r.photo_id))).toEqual([photoId]);
  });

  it('does not charge a photo already delivered a second time', async () => {
    await enableAllowance(1);
    await download(photoId);

    const again = await download(photoId);

    expect(again.status).toBe(200);
    expect(await ledgerRows()).toHaveLength(1);
  });

  it('refuses a new photo once the allowance is spent', async () => {
    await enableAllowance(1);
    await download(photoId);

    const res = await request(app).get(`/${EVENT_SLUG}/download/${secondPhotoId}`);

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('DOWNLOAD_QUOTA_EXCEEDED');
    expect(await ledgerRows()).toHaveLength(1);
  });

  it('gives the slot back when the file cannot be delivered', async () => {
    await enableAllowance(5);

    const res = await request(app).get(`/${EVENT_SLUG}/download/${missingPhotoId}`);

    expect(res.status).toBeGreaterThanOrEqual(400);
    // Settling runs when the response finishes; give it a tick to land.
    await new Promise((r) => setTimeout(r, 50));
    expect(await ledgerRows()).toHaveLength(0);
  });
});

describe('download watermark', () => {
  const setSetting = (key, value) => db('app_settings')
    .insert({ setting_key: key, setting_value: JSON.stringify(value), setting_type: 'branding' })
    .onConflict('setting_key').merge();
  afterEach(async () => {
    await setSetting('branding_watermark_enabled', false);
    await setSetting('branding_watermark_downloads_enabled', false);
    require('../../src/services/watermarkService').clearCache();
  });

  // A real JPEG: on the fake bytes above the watermark step fails and quietly
  // hands back the original, so a watermarked download would look clean.
  async function addRealJpeg(name) {
    const sharp = require('sharp');
    const bytes = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#808080' } })
      .jpeg().toBuffer();
    const rel = `${EVENT_SLUG}/${name}`;
    const abs = path.join(process.env.STORAGE_PATH, 'events', 'active', rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, bytes);
    const id = idOf(await db('photos').insert({
      event_id: eventId, filename: name, path: rel, type: 'individual', size_bytes: bytes.length,
    }).returning('id'));
    return { id, bytes };
  }

  it('serves the untouched file when only the view watermark is on', async () => {
    const jpeg = await addRealJpeg('real.jpg');
    await setSetting('branding_watermark_enabled', true);
    await db('events').where({ id: eventId }).update({ watermark_downloads: true });
    require('../../src/services/watermarkService').clearCache();
    try {
      const res = await download(jpeg.id);
      expect(res.status).toBe(200);
      expect(Buffer.compare(res.body, jpeg.bytes)).toBe(0);
    } finally {
      await db('events').where({ id: eventId }).update({ watermark_downloads: false });
    }
  });

  it('serves a watermarked file when the Branding download switch is on', async () => {
    const jpeg = await addRealJpeg('marked.jpg');
    await setSetting('branding_watermark_downloads_enabled', true);
    require('../../src/services/watermarkService').clearCache();
    const res = await download(jpeg.id);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(Buffer.compare(res.body, jpeg.bytes)).not.toBe(0);
  });
});
