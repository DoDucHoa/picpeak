/**
 * A customer's email can be cleared (finding 14), and events may be created
 * without one, so `customer_email || host_email` can be ''. A mail queued to
 * an empty address never sends and retries forever; nothing is queued instead.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

process.env.STORAGE_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'picpeak-empty-recipient-'));
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'empty-recipient-secret-long-enough-32';

const { bootCrmDb } = require('../integration/helpers/crmDb');

let db; let cleanup; let queueEmail;
beforeAll(async () => {
  ({ db, cleanup } = await bootCrmDb());
  ({ queueEmail } = require('../../src/services/emailProcessor'));
}, 120000);
afterAll(async () => { await cleanup(); });

it.each([[''], [null], [undefined], ['   ']])('queues nothing for the recipient %p', async (recipient) => {
  await db('email_queue').del();
  await queueEmail(null, recipient, 'gallery_created', { event_name: 'X' });
  expect(await db('email_queue').count({ n: '*' }).first()).toEqual({ n: 0 });
});

it('still queues a real address', async () => {
  await db('email_queue').del();
  await queueEmail(null, 'anna@example.com', 'gallery_created', { event_name: 'X' });
  const rows = await db('email_queue').select('recipient_email');
  expect(rows.map((r) => r.recipient_email)).toEqual(['anna@example.com']);
});
