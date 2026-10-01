/**
 * One global notification email decides every admin address tied to an event
 * (P3, spec 5.11): the global value when set, otherwise the event's own
 * admin_email, otherwise nothing is sent.
 */
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const { bootCrmDb, seedMinimal } = require('../integration/helpers/crmDb');

let db; let cleanup; let adminId;
let getNotificationEmail; let resolveAdminEmail; let sendGalleryExpiredEmails; let createEvent;

const setGlobal = (raw) => db('app_settings')
  .insert({ setting_key: 'general_notification_email', setting_value: raw, setting_type: 'general' })
  .onConflict('setting_key').merge();
const clearGlobal = () => db('app_settings').where({ setting_key: 'general_notification_email' }).delete();

beforeAll(async () => {
  ({ db, cleanup } = await bootCrmDb());
  ({ adminId } = await seedMinimal(db));
  ({ getNotificationEmail, resolveAdminEmail } = require('../../src/services/notificationEmail'));
  ({ sendGalleryExpiredEmails } = require('../../src/services/expirationChecker'));
  ({ createEvent } = require('../../src/services/eventCreationService'));
}, 120000);
afterAll(async () => { if (cleanup) await cleanup(); });
beforeEach(async () => { await clearGlobal(); await db('email_queue').delete(); });

describe('reading the global address', () => {
  it('is null when unset or invalid', async () => {
    expect(await getNotificationEmail()).toBeNull();
    await setGlobal(JSON.stringify('not an address'));
    expect(await getNotificationEmail()).toBeNull();
  });

  it('reads a value stored JSON encoded twice, trimmed', async () => {
    await setGlobal(JSON.stringify(JSON.stringify('  ops@example.com ')));
    expect(await getNotificationEmail()).toBe('ops@example.com');
  });

  it('prefers the global, then the event, then nothing', async () => {
    expect(await resolveAdminEmail({ admin_email: 'own@example.com' })).toBe('own@example.com');
    expect(await resolveAdminEmail({ admin_email: '' })).toBeNull();
    await setGlobal(JSON.stringify('ops@example.com'));
    expect(await resolveAdminEmail({ admin_email: 'own@example.com' })).toBe('ops@example.com');
  });
});

describe('gallery expired mail', () => {
  const event = { id: 1, slug: 's', event_name: 'E', customer_email: 'c@example.com', admin_email: 'own@example.com' };
  const queued = () => db('email_queue').where({ email_type: 'gallery_expired' }).orderBy('id');

  it('sends the admin copy and {{admin_email}} to the global address', async () => {
    await setGlobal(JSON.stringify('ops@example.com'));
    await sendGalleryExpiredEmails(event);
    const rows = await queued();
    expect(rows.map((r) => r.recipient_email)).toEqual(['c@example.com', 'ops@example.com']);
    expect(JSON.parse(rows[0].email_data).admin_email).toBe('ops@example.com');
  });

  it('sends one mail when the global address is the customer\'s', async () => {
    await setGlobal(JSON.stringify('c@example.com'));
    await sendGalleryExpiredEmails(event);
    expect((await queued()).map((r) => r.recipient_email)).toEqual(['c@example.com']);
  });
});

describe('create paths', () => {
  const base = {
    event_type: 'wedding', event_date: '2026-09-01', customer_name: 'C', customer_email: 'c@example.com',
    require_password: false, expiration_days: 30,
  };

  it('stores the global address in admin_email when set', async () => {
    await setGlobal(JSON.stringify('ops@example.com'));
    const created = await createEvent({ ...base, event_name: 'Global A', admin_email: 'typed@example.com' }, { actor: { id: adminId } });
    expect((await db('events').where({ id: created.id }).first()).admin_email).toBe('ops@example.com');
  });

  it('succeeds with no admin email and no global address', async () => {
    const created = await createEvent({ ...base, event_name: 'Global C' }, { actor: { id: adminId }, source: 'v1' });
    expect((await db('events').where({ id: created.id }).first()).admin_email).toBeNull();
  });

  it('falls back to the acting admin on the create page, as the old prefill did', async () => {
    const own = (await db('admin_users').where({ id: adminId }).first()).email;
    const created = await createEvent({ ...base, event_name: 'Global D' }, { actor: { id: adminId } });
    expect((await db('events').where({ id: created.id }).first()).admin_email).toBe(own);
  });

  it('keeps the typed address when no global address is set', async () => {
    const created = await createEvent({ ...base, event_name: 'Global B', admin_email: 'typed@example.com' }, { actor: { id: adminId } });
    expect((await db('events').where({ id: created.id }).first()).admin_email).toBe('typed@example.com');
  });
});

it('leaves no direct read of event.admin_email in the mail senders and payload builders', () => {
  const src = (rel) => fs.readFileSync(path.resolve(__dirname, '../../src', rel), 'utf8');
  for (const rel of ['services/archiveService.js', 'services/expirationChecker.js']) {
    expect(`${rel}:${/\bevent\.admin_email\b/.test(src(rel))}`).toBe(`${rel}:false`);
  }
  expect(src('services/eventCreationService.js')).not.toMatch(/adminEmail:\s*admin_email\b/);
  for (const rel of ['services/quoteService.js', 'services/contract/conversions.js']) {
    expect(src(rel)).not.toMatch(/customer\.email\s*\|\|\s*'admin@picpeak\.local'/);
  }
});
