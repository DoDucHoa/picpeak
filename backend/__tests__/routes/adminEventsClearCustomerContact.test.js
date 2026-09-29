/**
 * The customer name and email could never be cleared: the page only sent a
 * non-empty email, the validator rejected an empty one, and the handler
 * dropped an empty name (spec finding 14). A required field stays required.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'clear-customer-contact-secret-32-chars';

const request = require('supertest');
const { bootCrmDb, seedMinimal, assignAdminRole, mintAdminToken, buildRouteApp } = require('../integration/helpers/crmDb');

let db; let cleanup; let app; let token; let eventId;
const setRequirement = (key, value) => db('app_settings')
  .insert({ setting_key: key, setting_value: JSON.stringify(value), setting_type: 'boolean' })
  .onConflict('setting_key').merge();

beforeAll(async () => {
  ({ db, cleanup } = await bootCrmDb());
  const { adminId } = await seedMinimal(db);
  await assignAdminRole(db, adminId, 'super_admin');
  token = mintAdminToken(adminId);
  require('../../src/middleware/permissions').clearPermissionCache();
  app = buildRouteApp('/events', require('../../src/routes/adminEvents'));
  const r = await db('events').insert({
    slug: 'clear-contact', event_type: 'wedding', event_name: 'Clear Contact', event_date: '2026-09-01',
    customer_name: 'Anna', customer_email: 'anna@example.com', host_name: 'Anna', host_email: 'anna@example.com',
    admin_email: 'a@example.com', password_hash: 'x', share_link: '/gallery/share-clear-contact',
    share_token: 'st-clear-contact', expires_at: new Date(Date.now() + 86400000).toISOString(),
    is_active: 1, is_archived: 0, is_draft: 0, created_by: adminId, created_at: new Date().toISOString(),
  }).returning('id');
  eventId = r[0]?.id ?? r[0];
}, 120000);
afterAll(async () => { await cleanup(); });

const put = (body) => request(app).put(`/events/${eventId}`).set('Authorization', `Bearer ${token}`).send(body);
const row = () => db('events').where({ id: eventId }).first('customer_name', 'customer_email', 'host_email');

describe('when Settings do not require them', () => {
  beforeAll(async () => {
    await setRequirement('event_require_customer_name', false);
    await setRequirement('event_require_customer_email', false);
  });

  it('clears the customer name', async () => {
    expect((await put({ customer_name: '' })).status).toBe(200);
    expect((await row()).customer_name).toBeNull();
  });

  it('clears the customer email', async () => {
    expect((await put({ customer_email: null })).status).toBe(200);
    const r = await row();
    expect(r.customer_email).toBeNull();
    expect(r.host_email).toBe('');
  });
});

describe('when Settings require them', () => {
  beforeAll(async () => {
    await setRequirement('event_require_customer_name', true);
    await setRequirement('event_require_customer_email', true);
    await put({ customer_name: 'Anna', customer_email: 'anna@example.com' });
  });

  it('refuses to clear a required name', async () => {
    expect((await put({ customer_name: '' })).status).toBe(400);
    expect((await row()).customer_name).toBe('Anna');
  });

  it('refuses to clear a required email', async () => {
    expect((await put({ customer_email: '' })).status).toBe(400);
    expect((await row()).customer_email).toBe('anna@example.com');
  });
});
