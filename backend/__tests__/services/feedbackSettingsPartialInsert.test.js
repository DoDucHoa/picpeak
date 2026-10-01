/**
 * The event page saves only the feedback settings the admin changed (spec
 * 5.2). For an event with no settings row yet, the page showed the defaults
 * the GET answers with; a partial PUT used to insert a row holding only the
 * changed keys, so every other column took the database default instead
 * (allow_comments false, the global keybind lost). The new row starts from
 * what the admin was looking at.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'picpeak-feedback-partial-')), 'db.sqlite',
);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'feedback-partial-insert-secret';

const { bootCrmDb, seedMinimal } = require('../integration/helpers/crmDb');
const feedbackService = require('../../src/services/feedbackService');

let db; let cleanup;
async function insertEvent(slug) {
  const inserted = await db('events').insert({
    slug, event_type: 'wedding', event_name: 'Partial Feedback', event_date: '2026-06-22',
    host_email: 'host@example.com', admin_email: 'admin@example.com', password_hash: 'x',
    share_link: `/gallery/${slug}/share`, share_token: `${slug}-share`,
    expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    is_active: 1, is_archived: 0, is_draft: 0, created_at: new Date().toISOString(),
  }).returning('id');
  return inserted[0]?.id ?? inserted[0];
}

beforeAll(async () => {
  ({ db, cleanup } = await bootCrmDb());
  await seedMinimal(db);
}, 120000);
afterAll(async () => { if (cleanup) await cleanup(); });

it('stores what the page showed, plus the change, for an event with no row', async () => {
  const eventId = await insertEvent('feedback-partial-fresh');
  const shown = await feedbackService.getEventFeedbackSettings(eventId);

  await feedbackService.updateEventFeedbackSettings(eventId, { feedback_enabled: true });

  const after = await feedbackService.getEventFeedbackSettings(eventId);
  expect(after.id).toBeDefined();
  expect(!!after.feedback_enabled).toBe(true);
  for (const key of ['allow_ratings', 'allow_likes', 'allow_comments', 'allow_favorites', 'allow_reactions',
    'allow_color_labels', 'require_name_email', 'moderate_comments', 'show_feedback_to_guests']) {
    expect([key, !!after[key]]).toEqual([key, !!shown[key]]);
  }
  expect(after.keybind_mode).toBe(shown.keybind_mode);
  expect(after.identity_mode).toBe(shown.identity_mode);
});

it('still changes only the given keys on an existing row', async () => {
  const eventId = await insertEvent('feedback-partial-existing');
  await feedbackService.updateEventFeedbackSettings(eventId, { feedback_enabled: true, allow_comments: false });
  await feedbackService.updateEventFeedbackSettings(eventId, { allow_likes: false });
  const after = await feedbackService.getEventFeedbackSettings(eventId);
  expect(!!after.allow_comments).toBe(false);
  expect(!!after.allow_likes).toBe(false);
  expect(!!after.feedback_enabled).toBe(true);
});
