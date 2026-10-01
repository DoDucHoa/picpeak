/**
 * The Branding save stores the download watermark switch, and clears the
 * cached guest zips exactly when a downloaded file would now look different.
 * A save that changes nothing about it keeps them: a rebuild is expensive.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'download-watermark-route-secret-32';
process.env.STORAGE_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'picpeak-dlwm-storage-'));

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const { bootCrmDb, seedMinimal, assignAdminRole, mintAdminToken } = require('../integration/helpers/crmDb');

let db; let cleanup; let app; let token; let invalidateAll;

beforeAll(async () => {
  ({ db, cleanup } = await bootCrmDb());
  const { adminId } = await seedMinimal(db);
  await assignAdminRole(db, adminId, 'super_admin');
  token = mintAdminToken(adminId);
  const zips = require('../../src/services/downloadZipService');
  invalidateAll = jest.spyOn(zips, 'invalidateAll').mockResolvedValue(undefined);
  app = express(); app.use(express.json()); app.use(cookieParser());
  app.use('/api/admin/settings', require('../../src/routes/adminSettings'));
}, 120000);
afterAll(async () => { invalidateAll.mockRestore(); await cleanup(); });
beforeEach(() => invalidateAll.mockClear());

const save = (body) => request(app).put('/api/admin/settings/branding')
  .set('Authorization', `Bearer ${token}`)
  .send({ company_name: 'Studio', watermark_enabled: false, ...body });

it('stores the download watermark switch', async () => {
  const res = await save({ watermark_downloads_enabled: true });
  expect(res.status).toBe(200);
  const row = await db('app_settings').where({ setting_key: 'branding_watermark_downloads_enabled' }).first();
  expect(JSON.parse(row.setting_value)).toBe(true);
});

it('invalidates the cached zips when the switch flips', async () => {
  await save({ watermark_downloads_enabled: false });
  invalidateAll.mockClear();
  await save({ watermark_downloads_enabled: true });
  expect(invalidateAll).toHaveBeenCalledTimes(1);
});

it('keeps the cached zips on a save that changes nothing about downloads', async () => {
  await save({ watermark_downloads_enabled: true });
  invalidateAll.mockClear();
  await save({ watermark_downloads_enabled: true, company_tagline: 'New tagline' });
  expect(invalidateAll).not.toHaveBeenCalled();
});

it('keeps the cached zips when the company name changes while downloads are clean', async () => {
  await save({ watermark_downloads_enabled: false, company_name: 'Studio' });
  invalidateAll.mockClear();
  await save({ watermark_downloads_enabled: false, company_name: 'Studio Renamed' });
  expect(invalidateAll).not.toHaveBeenCalled();
});

it('invalidates when the company name changes while downloads are watermarked', async () => {
  await save({ watermark_downloads_enabled: true, company_name: 'Studio' });
  invalidateAll.mockClear();
  await save({ watermark_downloads_enabled: true, company_name: 'Studio Two' });
  expect(invalidateAll).toHaveBeenCalledTimes(1);
});

describe('a new watermark logo', () => {
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const upload = () => request(app).post('/api/admin/settings/branding/watermark-logo')
    .set('Authorization', `Bearer ${token}`)
    .attach('watermarkLogo', PNG, { filename: 'mark.png', contentType: 'image/png' });

  it('invalidates the cached zips while downloads are watermarked', async () => {
    await save({ watermark_downloads_enabled: true });
    invalidateAll.mockClear();
    const res = await upload();
    expect(res.status).toBe(200);
    expect(invalidateAll).toHaveBeenCalledTimes(1);
  });

  it('keeps the cached zips while downloads are clean', async () => {
    await save({ watermark_downloads_enabled: false });
    invalidateAll.mockClear();
    const res = await upload();
    expect(res.status).toBe(200);
    expect(invalidateAll).not.toHaveBeenCalled();
  });
});

describe('hero logo globals (P3, spec 5.10)', () => {
  const read = async (key) => JSON.parse((await db('app_settings').where({ setting_key: key }).first()).setting_value);

  it('stores the hero logo position and the password page logo switch', async () => {
    expect((await save({ hero_logo_position: 'center', gallery_password_logo_visible: false })).status).toBe(200);
    expect(await read('branding_hero_logo_position')).toBe('center');
    expect(await read('branding_gallery_password_logo_visible')).toBe(false);
  });

  it('ignores an unknown hero logo position and leaves the stored one', async () => {
    expect((await save({ hero_logo_position: 'center' })).status).toBe(200);
    expect((await save({ hero_logo_position: 'sideways' })).status).toBe(200);
    expect(await read('branding_hero_logo_position')).toBe('center');
  });
});
