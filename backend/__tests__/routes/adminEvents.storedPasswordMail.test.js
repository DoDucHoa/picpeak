/**
 * Event form redesign P4 (spec 5.4, ruling 1): publish and send-gallery-email
 * carry the stored password when the admin types none, the way resend does,
 * and the event API says whether a password is set or stored, as booleans.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'picpeak-stored-mail-')), 'db.sqlite');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'stored-mail-test-secret';
process.env.STORAGE_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'picpeak-stored-mail-storage-'));

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { bootCrmDb, seedMinimal, assignAdminRole, mintAdminToken } = require('../integration/helpers/crmDb');
const vault = require('../../src/utils/galleryPasswordVault');

const PASSWORD = 'Meadow-Lark-77!';
const PIN = '432100';

describe('stored passwords in gallery mails', () => {
  let db; let cleanup; let app; let token; let adminId;
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const setSetting = (value) => db('app_settings').insert({
    setting_key: vault.SETTING_KEY, setting_value: JSON.stringify(value), setting_type: 'security',
  }).onConflict('setting_key').merge({ setting_value: JSON.stringify(value) });
  const createDraft = async (over = {}) => {
    const res = await auth(request(app).post('/api/admin/events')).send({
      event_type: 'wedding', event_name: 'Stored Mail', event_date: '2026-09-07',
      customer_name: 'Ada', customer_email: 'ada@example.com',
      require_password: true, password: PASSWORD, expiration_days: 30,
      client_access_enabled: true, client_password: PIN, ...over,
    });
    expect([200, 201]).toContain(res.status);
    return res.body.id;
  };
  const lastMail = async (id) => JSON.parse((await db('email_queue')
    .where({ event_id: id, email_type: 'gallery_created' }).orderBy('id', 'desc').first()).email_data);

  beforeAll(async () => {
    ({ db, cleanup } = await bootCrmDb());
    ({ adminId } = await seedMinimal(db));
    await assignAdminRole(db, adminId, 'super_admin');
    token = mintAdminToken(adminId);
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/admin/events', require('../../src/routes/adminEvents'));
  }, 120000);
  afterAll(async () => { if (cleanup) await cleanup(); });
  beforeEach(async () => { await db('email_queue').del(); });

  it('says whether a client password is set, never the hash', async () => {
    await setSetting(false);
    const withPin = await createDraft();
    const withoutPin = await createDraft({ client_access_enabled: false, client_password: undefined });
    const a = await auth(request(app).get(`/api/admin/events/${withPin}`));
    const b = await auth(request(app).get(`/api/admin/events/${withoutPin}`));
    expect(a.body.has_client_password).toBe(true);
    expect(b.body.has_client_password).toBe(false);
    expect(a.body.client_password_hash).toBeUndefined();
  });

  it('reports stored copies in the password status', async () => {
    await setSetting(false);
    const before = await createDraft();
    await setSetting(true);
    const after = await createDraft();
    const off = await auth(request(app).get(`/api/admin/events/${before}/password-status`));
    const on = await auth(request(app).get(`/api/admin/events/${after}/password-status`));
    expect(off.body).toEqual({ enabled: true, password_stored: false, client_password_stored: false });
    expect(on.body).toEqual({ enabled: true, password_stored: true, client_password_stored: true });
    await setSetting(false);
    const disabled = await auth(request(app).get(`/api/admin/events/${after}/password-status`));
    expect(disabled.body).toEqual({ enabled: false, password_stored: false, client_password_stored: false });
  });

  it('publish without a typed password mails the stored one and keeps the hash', async () => {
    await setSetting(true);
    const id = await createDraft();
    const hashBefore = (await db('events').where({ id }).first()).password_hash;
    const res = await auth(request(app).post(`/api/admin/events/${id}/publish`)).send({});
    expect(res.status).toBe(200);
    expect(res.body.usedStoredPassword).toBe(true);
    expect((await lastMail(id)).gallery_password).toBe(PASSWORD);
    expect((await db('events').where({ id }).first()).password_hash).toBe(hashBefore);
  });

  it('publish of a gallery made before storage was on keeps the sentinel', async () => {
    await setSetting(false);
    const id = await createDraft();
    await setSetting(true);
    const res = await auth(request(app).post(`/api/admin/events/${id}/publish`)).send({});
    expect(res.status).toBe(200);
    expect(res.body.usedStoredPassword).toBe(false);
    expect((await lastMail(id)).gallery_password).toBe('(set at creation)');
  });

  it('a typed password still wins over the stored one', async () => {
    await setSetting(true);
    const id = await createDraft();
    const res = await auth(request(app).post(`/api/admin/events/${id}/publish`)).send({ password: 'Harbour-Light-91!' });
    expect(res.status).toBe(200);
    expect(res.body.usedStoredPassword).toBe(false);
    expect((await lastMail(id)).gallery_password).toBe('Harbour-Light-91!');
  });

  it('publish without a typed password gives the stored one to WhatsApp too', async () => {
    const whatsapp = require('../../src/services/whatsappProcessor');
    const config = jest.spyOn(whatsapp, 'getWhatsAppConfig').mockResolvedValue({ enabled: true });
    const queue = jest.spyOn(whatsapp, 'queueWhatsapp').mockResolvedValue(undefined);
    try {
      await setSetting(true);
      const id = await createDraft();
      // The phone field is off by default on create; set the stored column directly.
      await db('events').where({ id }).update({ customer_phone: '+491701234567' });
      const res = await auth(request(app).post(`/api/admin/events/${id}/publish`)).send({});
      expect(res.status).toBe(200);
      expect(queue).toHaveBeenCalledTimes(1);
      expect(queue.mock.calls[0][3].gallery_password).toBe(PASSWORD);
    } finally {
      config.mockRestore();
      queue.mockRestore();
    }
  });

  it('send-gallery-email without a typed password mails the stored one', async () => {
    await setSetting(true);
    const id = await createDraft();
    await auth(request(app).post(`/api/admin/events/${id}/publish`)).send({ notify_customer: false });
    const res = await auth(request(app).post(`/api/admin/events/${id}/send-gallery-email`)).send({});
    expect(res.status).toBe(200);
    expect(res.body.usedStoredPassword).toBe(true);
    expect((await lastMail(id)).gallery_password).toBe(PASSWORD);
  });
});
