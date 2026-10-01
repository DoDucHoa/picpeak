/**
 * The right-click switch round-trips through the Image security tab. The PUT
 * only updates rows that exist, so this also pins the seed from migration 260.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'image-security-right-click-secret-32';

const request = require('supertest');
const { bootCrmDb, seedMinimal, assignAdminRole, mintAdminToken, buildRouteApp } = require('../integration/helpers/crmDb');

let cleanup; let app; let token;
beforeAll(async () => {
  let db;
  ({ db, cleanup } = await bootCrmDb());
  const { adminId } = await seedMinimal(db);
  await assignAdminRole(db, adminId, 'super_admin');
  token = mintAdminToken(adminId);
  require('../../src/middleware/permissions').clearPermissionCache();
  app = buildRouteApp('/security', require('../../src/routes/adminImageSecurity'));
}, 120000);
afterAll(async () => { await cleanup(); });

const get = () => request(app).get('/security/settings').set('Authorization', `Bearer ${token}`);
const put = (body) => request(app).put('/security/settings').set('Authorization', `Bearer ${token}`).send(body);

it('reports the seeded switch', async () => {
  const res = await get();
  expect(res.status).toBe(200);
  expect(res.body.disable_right_click).toBe(true);
});

it('keeps a saved choice across a reload', async () => {
  expect((await put({ disable_right_click: false })).status).toBe(200);
  expect((await get()).body.disable_right_click).toBe(false);
});
