/**
 * PUT /admin/settings/theme keeps brand styling only.
 *
 * Gallery theming is gone (migration 263), so the gallery keys an older admin
 * screen may still post (layout, custom CSS, header style) must not land in
 * theme_config. The brand keys the admin, the customer portal and the public
 * site read must survive untouched.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'picpeak-themekeys-')), 'db.sqlite',
);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'themekeys-test-secret';
process.env.STORAGE_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'picpeak-themekeys-storage-'));

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const {
  bootCrmDb, seedMinimal, assignAdminRole, mintAdminToken,
} = require('../integration/helpers/crmDb');
const { clearPermissionCache } = require('../../src/middleware/permissions');

describe('PUT /admin/settings/theme', () => {
  let db; let cleanup; let app; let token;

  beforeAll(async () => {
    ({ db, cleanup } = await bootCrmDb());
    const { adminId } = await seedMinimal(db);
    await assignAdminRole(db, adminId, 'super_admin');
    token = mintAdminToken(adminId);
    clearPermissionCache();

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/admin/settings', require('../../src/routes/adminSettings'));
  }, 120000);

  afterAll(async () => { if (cleanup) await cleanup(); });

  it('stores brand keys only', async () => {
    const res = await request(app)
      .put('/api/admin/settings/theme')
      .set('Authorization', `Bearer ${token}`)
      .send({
        primaryColor: '#123456',
        surfaceColor: '#fafafa',
        galleryLayout: 'masonry',
        customCss: '.x{}',
        headerStyle: 'hero',
        logoUrl: '/l.png',
      });
    expect(res.status).toBe(200);
    const row = await db('app_settings').where({ setting_key: 'theme_config' }).first();
    expect(JSON.parse(row.setting_value)).toEqual({
      primaryColor: '#123456',
      surfaceColor: '#fafafa',
      logoUrl: '/l.png',
    });
  });
});
