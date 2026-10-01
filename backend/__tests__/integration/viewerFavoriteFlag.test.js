/**
 * The viewer's own picks on the /photos list.
 *
 * is_favorited is the favorite counterpart of is_liked: same identity model,
 * hidden rows count as absent, and it survives show_feedback_to_guests being
 * off because it is the viewer's own selection.
 */

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const { bootCrmDb, seedMinimal } = require('./helpers/crmDb');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'viewer-favorite-secret';

const SLUG = 'viewer-favorite-flag';
const ME = 'guest-fav-identifier';

describe('the viewer\'s own picks on /photos', () => {
  let db; let cleanup; let app;
  let eventId; let photoId; let myGuestRowId;

  const galleryToken = () => jwt.sign(
    { eventId, eventSlug: SLUG, type: 'gallery' },
    process.env.JWT_SECRET,
    { expiresIn: '1h', issuer: 'picpeak-auth' }
  );
  const guestToken = () => jwt.sign(
    { type: 'guest', guestId: myGuestRowId, eventId },
    process.env.JWT_SECRET,
    { expiresIn: '1h', issuer: 'picpeak-auth' }
  );

  const getPhoto = async () => {
    const res = await request(app)
      .get(`/api/gallery/${SLUG}/photos`)
      .set('Authorization', `Bearer ${galleryToken()}`)
      .set('x-guest-token', guestToken());
    expect(res.status).toBe(200);
    const photos = Array.isArray(res.body) ? res.body : res.body.photos;
    return (photos || []).find((p) => p.id === photoId);
  };

  beforeAll(async () => {
    ({ db, cleanup } = await bootCrmDb());
    await seedMinimal(db);

    const [ev] = await db('events').insert({
      slug: SLUG,
      event_type: 'wedding',
      event_name: 'Viewer Favorite Flag',
      event_date: '2026-08-01',
      host_email: 'h@example.com',
      admin_email: 'a@example.com',
      password_hash: 'x',
      share_link: `/gallery/${SLUG}/share`,
      share_token: 'viewer-favorite-share',
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      is_active: 1, is_archived: 0, is_draft: 0,
      created_at: new Date().toISOString(),
    }).returning('id');
    eventId = typeof ev === 'object' ? ev.id : ev;

    const [p] = await db('photos').insert({
      event_id: eventId, filename: 'shot.jpg', path: 'events/favorite/shot.jpg',
      type: 'individual', uploaded_at: new Date().toISOString(),
    }).returning('id');
    photoId = typeof p === 'object' ? p.id : p;

    const [g] = await db('gallery_guests').insert({
      event_id: eventId, name: 'Me', identifier: ME,
      created_at: new Date().toISOString(), last_seen_at: new Date().toISOString(),
      is_deleted: false,
    }).returning('id');
    myGuestRowId = typeof g === 'object' ? g.id : g;

    await db('event_feedback_settings').insert({
      event_id: eventId, feedback_enabled: true, allow_likes: true,
      allow_favorites: true, allow_color_labels: true, moderate_comments: false,
      show_feedback_to_guests: true,
    });

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/gallery', require('../../src/routes/gallery'));
    app.use('/api/gallery', require('../../src/routes/galleryFeedback'));
  }, 180000);

  afterAll(async () => { if (cleanup) await cleanup(); });

  const favorite = (overrides = {}) => db('photo_feedback').insert({
    photo_id: photoId, event_id: eventId, guest_identifier: ME,
    guest_id: myGuestRowId, feedback_type: 'favorite',
    is_approved: true, is_hidden: false, created_at: new Date().toISOString(),
    ...overrides,
  });

  beforeEach(async () => {
    await db('photo_feedback').where({ photo_id: photoId }).del();
  });

  it('is false when the viewer has not picked the photo', async () => {
    expect((await getPhoto()).is_favorited).toBe(false);
  });

  it('is true once the viewer picked the photo', async () => {
    await favorite();
    expect((await getPhoto()).is_favorited).toBe(true);
  });

  it('ignores a pick the photographer hid', async () => {
    await favorite({ is_hidden: true });
    expect((await getPhoto()).is_favorited).toBe(false);
  });

  it('ignores another guest\'s pick', async () => {
    await favorite({ guest_id: null, guest_identifier: 'someone-else' });
    expect((await getPhoto()).is_favorited).toBe(false);
  });

  it('survives show_feedback_to_guests being off', async () => {
    await db('event_feedback_settings').where({ event_id: eventId })
      .update({ show_feedback_to_guests: false });
    await favorite();
    expect((await getPhoto()).is_favorited).toBe(true);
    await db('event_feedback_settings').where({ event_id: eventId })
      .update({ show_feedback_to_guests: true });
  });
});
