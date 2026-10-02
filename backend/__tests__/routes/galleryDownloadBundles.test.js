/**
 * Download bundles: a selection of any size, split by stored file size into
 * ZIP parts the browser collects one by one.
 *
 * Storage is mocked as S3 so every photo has a body. The part limit is set
 * low through DOWNLOAD_BUNDLE_PART_BYTES so a handful of small photos already
 * splits.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'picpeak-bundles-')), 'db.sqlite',
);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'bundles-test-secret';
// Two 40 KB photos fit in a part, a third does not.
process.env.DOWNLOAD_BUNDLE_PART_BYTES = String(100 * 1024);

const SLUG = 'bundles';
const OTHER_SLUG = 'bundles-other';
const PHOTO_BYTES = 40 * 1024;
const mockBodies = new Map();

const mockStorage = {
  kind: () => 's3',
  stat: jest.fn(async (key) => (mockBodies.has(key) ? { size: mockBodies.get(key).length, mtime: new Date() } : null)),
  get: jest.fn(async (key) => require('stream').Readable.from([mockBodies.get(key)])),
  exists: jest.fn(async () => true),
  delete: jest.fn(async () => undefined),
};

jest.mock('../../src/services/storage', () => ({
  getStorage: () => mockStorage,
  initStorage: async () => mockStorage,
}));

jest.mock('../../src/services/downloadZipService', () => ({
  getZipInfo: async () => null,
  generateZip: async () => ({ success: false }),
  invalidate: () => {},
  invalidateAll: () => {},
}));

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { bootCrmDb, seedMinimal } = require('../integration/helpers/crmDb');
const downloadBundleService = require('../../src/services/downloadBundleService');

// Collect a binary response body, so the ZIP's own entry names can be read.
const binary = (res, done) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

describe('download bundles', () => {
  let db; let cleanup; let app; const photoIds = []; let otherPhotoId;

  async function insertEvent(slug) {
    const ev = await db('events').insert({
      slug, event_type: 'wedding', event_name: slug, event_date: '2026-08-01',
      host_email: 'h@example.com', admin_email: 'a@example.com', password_hash: 'x',
      share_link: `/gallery/${slug}/s`, share_token: `${slug}-share`,
      expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
      is_active: 1, is_archived: 0, is_draft: 0, require_password: 0, allow_downloads: 1,
      created_at: new Date().toISOString(),
    }).returning('id');
    return ev[0]?.id ?? ev[0];
  }

  async function insertPhoto(eventId, slug, filename, ageMs) {
    mockBodies.set(`events/active/${slug}/${filename}`, crypto.randomBytes(PHOTO_BYTES));
    const r = await db('photos').insert({
      event_id: eventId, filename, path: `${slug}/${filename}`, type: 'individual',
      source_origin: 'managed', mime_type: 'image/jpeg', size_bytes: PHOTO_BYTES,
      uploaded_at: new Date(Date.now() - ageMs).toISOString(),
    }).returning('id');
    return r[0]?.id ?? r[0];
  }

  beforeAll(async () => {
    ({ db, cleanup } = await bootCrmDb());
    await seedMinimal(db);

    const eventId = await insertEvent(SLUG);
    // Newest first is the archive order, so p1 is the newest.
    for (let i = 1; i <= 5; i += 1) {
      photoIds.push(await insertPhoto(eventId, SLUG, `p${i}.jpg`, i * 1000));
    }
    const otherId = await insertEvent(OTHER_SLUG);
    otherPhotoId = await insertPhoto(otherId, OTHER_SLUG, 'x.jpg', 1000);

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/gallery', require('../../src/routes/gallery'));
  }, 120000);

  afterAll(async () => { if (cleanup) await cleanup(); });
  beforeEach(() => downloadBundleService._reset());

  const plan = (body, slug = SLUG) => request(app).post(`/api/gallery/${slug}/download-bundles`).send(body);

  it('splits a selection into parts by stored size, newest first', async () => {
    const res = await plan({ photo_ids: photoIds });
    expect(res.status).toBe(200);
    expect(res.body.parts.map((p) => p.photo_count)).toEqual([2, 2, 1]);
    expect(res.body.parts.map((p) => p.size_bytes)).toEqual([2 * PHOTO_BYTES, 2 * PHOTO_BYTES, PHOTO_BYTES]);
    expect(new Set(res.body.parts.map((p) => p.token)).size).toBe(3);
  });

  it('streams each part as a ZIP holding exactly that part', async () => {
    const { body } = await plan({ photo_ids: photoIds });
    const first = await request(app)
      .get(`/api/gallery/${SLUG}/download-bundles/${body.parts[0].token}`)
      .buffer(true).parse(binary);
    expect(first.status).toBe(200);
    expect(first.headers['content-type']).toBe('application/zip');
    expect(first.headers['content-disposition']).toContain(`${SLUG}-selected-part1of3.zip`);
    const names = first.body.toString('latin1');
    expect(names).toContain('p1.jpg');
    expect(names).toContain('p2.jpg');
    expect(names).not.toContain('p3.jpg');

    const last = await request(app)
      .get(`/api/gallery/${SLUG}/download-bundles/${body.parts[2].token}`)
      .buffer(true).parse(binary);
    expect(last.status).toBe(200);
    expect(last.body.toString('latin1')).toContain('p5.jpg');
  });

  it('names a single-part bundle without a part suffix', async () => {
    const { body } = await plan({ photo_ids: photoIds.slice(0, 2) });
    expect(body.parts).toHaveLength(1);
    const res = await request(app).get(`/api/gallery/${SLUG}/download-bundles/${body.parts[0].token}`)
      .buffer(true).parse(binary);
    expect(res.headers['content-disposition']).toContain(`${SLUG}-selected.zip`);
  });

  it('answers a HEAD probe without sending an archive', async () => {
    const { body } = await plan({ photo_ids: photoIds });
    const res = await request(app).head(`/api/gallery/${SLUG}/download-bundles/${body.parts[0].token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBeUndefined();
  });

  it('accepts more than 500 photos in one request', async () => {
    // Ids that do not exist are dropped by the deliverable-photos query, so
    // this proves only that the request is not truncated before that query.
    const ids = [...Array.from({ length: 700 }, (_, i) => 1_000_000 + i), photoIds[4]];
    const res = await plan({ photo_ids: ids });
    expect(res.status).toBe(200);
    expect(res.body.parts).toHaveLength(1);
    expect(res.body.parts[0].photo_count).toBe(1);
  });

  it('never packs a photo from another gallery', async () => {
    const res = await plan({ photo_ids: [photoIds[0], otherPhotoId] });
    expect(res.body.parts.reduce((n, p) => n + p.photo_count, 0)).toBe(1);
  });

  it('refuses a part token on another gallery, and an unknown token', async () => {
    const { body } = await plan({ photo_ids: photoIds });
    // Refused at the token, not merely because the other gallery's query
    // finds none of these photos further down.
    const foreign = await request(app).get(`/api/gallery/${OTHER_SLUG}/download-bundles/${body.parts[0].token}`);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error).toMatch(/no longer available/);
    const unknown = await request(app).get(`/api/gallery/${SLUG}/download-bundles/not-a-token`);
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toMatch(/no longer available/);
  });

  it('refuses a part planned for a client to a guest of the same gallery', async () => {
    const parts = downloadBundleService.createBundle({
      eventId: (await db('events').where({ slug: SLUG }).first()).id,
      scope: 'hidden',
      photos: [{ id: photoIds[0], size_bytes: PHOTO_BYTES }],
    });
    const res = await request(app).get(`/api/gallery/${SLUG}/download-bundles/${parts[0].token}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no longer available/);
  });

  it('rejects an empty or invalid selection', async () => {
    expect((await plan({ photo_ids: [] })).status).toBe(400);
    expect((await plan({ photo_ids: ['abc'] })).status).toBe(400);
    expect((await plan({})).status).toBe(400);
  });
});

describe('splitBySize', () => {
  const { splitBySize } = downloadBundleService;

  it('gives a photo larger than the limit a part of its own', () => {
    const groups = splitBySize([
      { id: 1, size_bytes: 10 }, { id: 2, size_bytes: 500 }, { id: 3, size_bytes: 10 },
    ], 100);
    expect(groups.map((g) => g.photoIds)).toEqual([[1], [2], [3]]);
  });

  it('counts a photo with no recorded size as zero', () => {
    const groups = splitBySize([{ id: 1, size_bytes: null }, { id: 2, size_bytes: 90 }], 100);
    expect(groups.map((g) => g.photoIds)).toEqual([[1, 2]]);
  });
});
