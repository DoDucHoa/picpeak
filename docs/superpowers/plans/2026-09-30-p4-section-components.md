# P4 Section Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the event page Settings tab's moved-over controls with the simplified ones the spec designs: a feedback mode with Custom, one expiry component, editable event date and type with the type-to-theme rule, one welcome message editor, password and client password controls that show what is stored, publish and send-email mails that carry the stored password, banners that inherit until opened, and an Appearance section whose everyday controls are the preset and the hero photo.

**Architecture:** Every new control is a section component under `frontend/src/pages/admin/event-details/settings/`, driven through the P2 draft (`setEditForm`, `setFeedbackSettings`, `setTheme`), so the save bar, "changed elsewhere" and the rail dot keep working unchanged. Rules that decide values (feedback mode mapping, expiry dates, stored theme kind, the next generated password) are pure functions with their own tests. The backend gains three small things: the event PUT validates the type, the event API and the password status say whether a password is set or stored, and publish and send-email fall back to the stored password the way resend already does.

**Tech Stack:** Node/Express + knex, Jest + supertest (`bootCrmDb`); React 18, TanStack Query, Vitest + Testing Library, i18next; Playwright.

**Spec:** `docs/superpowers/specs/2026-09-28-event-form-redesign-design.md`: 3 (decisions), 3.1 (O2, O3), 4 findings 13 and 15, 5.1, 5.2, 5.3, 5.4, 5.7, 5.8, 5.9, 5.13, section 6 "P4".

## Global Constraints

- Every setting has exactly one place where it is edited (spec 2). The inventory test (`settings/__tests__/controlInventory.test.ts`) holds `sectionFields.ts` to the sources.
- "Opening the Settings tab on any existing event produces zero changes. Seeding normalises legacy values ... before comparing" (spec 5.2). Every new form field is seeded so the legacy fixture of `eventSettingsSaveModel.test.tsx` stays clean.
- "Actions ... act immediately and are never part of the draft" (spec 5.2); every other change goes through the draft and the save bar.
- "Every confirmation uses `ConfirmDialogProvider`, not `window.confirm`" (spec 5.13): the hook is `useConfirm()` from `frontend/src/components/common`.
- "Expiry quick buttons count from today, not from the event date" (O3). "Changing the event date never recomputes the expiry" (5.8). "Editing always offers" Never (5.8, #426).
- "The slug is not changed by a type or date edit" (5.9).
- "Staff restrictions are done with permissions, never by hiding" (5.3).
- Every new user-facing string gets `en`, `de` and `vi` in the same change; German admin copy uses "du"; plurals `_one`/`_other` (vi only `_other`). Existing keys are never pruned.
- No em-dash (U+2014) or en-dash (U+2013) in anything written into the repo. Conventional Commits.
- `backend/jest.setup.js` keeps its `DATABASE_CLIENT` pin. Backend Jest from `backend/`, Vitest from `frontend/`. Never edit while a background test run is in flight. Git as plain single commands.
- No schema change (spec 2 non-goals): P4 adds no migration.
- Nothing is deployed in this phase (rule D5).

`<handover>` below is `C:\Users\hhoa0\AppData\Local\Temp\claude\D--Coding-picpeak\8ddb516d-e5c0-4236-8332-fa5c847b9117\scratchpad\handover` (Git Bash: `/c/Users/hhoa0/AppData/Local/Temp/claude/D--Coding-picpeak/8ddb516d-e5c0-4236-8332-fa5c847b9117/scratchpad/handover`). i18n keys are added with `node <handover>/addkeys.js <spec.json>`, where the spec file is written to the scratchpad with the Write tool in the shape `{ "path": "events.x", "en": {...}, "de": {...}, "vi": {...} }`.

## Rulings made while writing this plan (the spec predates them)

1. **Publish and send-email take the stored password on the server** (operator decision 2026-09-30, replacing "prefill" in 5.4). When the gallery needs a password, the body carries none and a stored copy exists, the mail carries the stored copy, as `POST /:id/resend-email` already does. Nothing is rehashed. The dialogs stop asking and say so, with "Use a different password" to type a new one. The plaintext never reaches the browser for this, and the activity log gets no "password viewed" line per dialog.
2. **The stored password is revealed on request, not on open.** Settings > Access shows "Show" and "Copy" when a copy is stored, reusing `GET /:id/password`, so each reveal is logged once, as on the Overview share card. "Opening the tab never generates anything" (5.4) and never reads the secret either.
3. **The event API says whether a client password is set** (`has_client_password`), and the password status says whether copies are stored (`password_stored`, `client_password_stored`). Booleans only; the hashes and copies stay server side. Without them the page cannot tell "No client password set" from "Set, not viewable".
4. **O2 stays an admin switch.** `security_gallery_password_recoverable` defaults off and is turned on in Settings > Security; P4 writes no seed. Galleries whose password was set while it was off show "Set, not viewable" until the password is written again. Recorded for the operator in spec section 8.
5. **Turning the password or client access on generates one right away**, because the toggle is the user's own action. Regenerate cycles through the existing generator's suggestions (`generatePasswordSuggestions`), since its moderate form is deterministic and would hand back the same value. The existing `PasswordGenerator` popover leaves the client access card.
6. **Client access refuses to save as on without a password** only when a client access field is part of the change, so an old event already in that state can still save its other settings; its card shows "No client password set" with Generate.
7. **The confirm-password field goes** (spec 3: "no confirm field"), from the form, the draft, the payload rules and the tests. `PasswordResetModal` is deleted: nothing imports it. `eventsService.resetPassword` and the backend reset route stay for the API.
8. **A feedback mode switch counts as one change**: `draftCount` counts the six mode keys (`feedback_enabled` and the five type toggles) as one unit, whatever edited them. Save, "changed elsewhere" and the rail dot keep one key per field.
9. **Custom restores the saved type toggles**, and is offered while either the saved or the current toggles match neither on-mode (5.7: "get the original toggles back"). "Custom (from Settings)" on create is P5.
10. **`FeedbackSettings` gains `hideEnableToggle`.** In Settings the mode replaces the master checkbox, and the component moves into the advanced area; the create page keeps the checkbox until P5.
11. **The stored theme kind is read from `color_theme`**: empty is "inherit", a known preset name is "preset", JSON that equals a preset's config exactly is "preset" (the create page stores every theme as JSON, so an untouched event would otherwise always count as hand customised), any other JSON is "custom". A theme already changed in this draft counts by its draft preset.
12. **A type whose preset is `default` leaves the theme alone.** Create stores no theme for such a type (5.5); the draft cannot express "back to inherit", and overwriting a chosen look with the plain default would surprise more than it helps.
13. **The type list is the active catalog plus the event's current type.** A type deactivated after the event was made stays selectable as the current value, labelled inactive, so opening changes nothing; the PUT validates the type only when it is sent, and it is sent only when changed.
14. **The event date cannot be cleared on edit.** An empty date is refused by the draft check; the backend validator already rejects a malformed one.
15. **The preset picker renders `ThemePresetsCard` on its own**, and `ThemeCustomizerEnhanced` gains `hidePresets` so the advanced customizer does not show the grid twice. Branding is unaffected.
16. **A banner in inherit mode shows the global text read-only** (from public settings, already loaded on the page) with "Override for this event". Opening it switches to custom; "Use the global banner again" returns to inherit. A banner already custom or off opens expanded.
17. **`WelcomeMessageEditor` is the one editor** and its three hard-coded English strings become i18n keys.

## Review Focus

1. **An event whose type was deactivated after creation** opens with zero changes and saves an unrelated field without a 400. Pinned in Task 1 (PUT without `event_type`) and Task 6 (the select keeps the current value).
2. **A gallery whose feedback is off but whose saved toggles are custom** offers Custom when switched back on, and Custom brings the saved toggles back. Pinned in Task 3.
3. **Turning the password off on a published gallery and pressing Cancel** leaves the draft empty and the switch on. Pinned in Task 8.
4. **Publishing a gallery made before storage was on** still asks for the password, and the mail never carries an empty or stale value. Pinned in Tasks 2 and 10.
5. **A legacy event whose date arrives as a Postgres timestamp** (`2020-06-01T00:00:00.000Z`) seeds `event_date` as `2020-06-01` and opens clean. Pinned in Task 6.

---

### Task 1: The event PUT validates the event type

**Files:**
- Modify: `backend/src/routes/adminEvents/crud.js` (the PUT validator array, right after `body('event_date').optional({ values: 'falsy' }).isDate(),` inside `router.put('/:id', ...`)
- Test: `backend/__tests__/routes/adminEvents.smoke.test.js` (`describe('PUT /:id')`)

**Interfaces:**
- Produces: `PUT /api/admin/events/:id` answers 400 `{ errors: [...] }` for a type that is not active in the catalog, stores the type lowercased, and never changes `slug` for a type or date edit.

- [ ] **Step 1: Write the failing tests.** Add inside `describe('PUT /:id', () => {` of `adminEvents.smoke.test.js`:

```js
    // Event form redesign P4 (spec 5.9, finding 13): the PUT validates the
    // type against the active catalog, as POST does, and never moves the slug.
    it('400s on an unknown event type and writes nothing', async () => {
      const id = await insertEvent(db, adminId, { event_name: 'Typed' });
      const res = await auth(request(app).put(`/api/admin/events/${id}`)).send({ event_type: 'not-a-real-type' });
      expect(res.status).toBe(400);
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect((await db('events').where({ id }).first()).event_type).toBe('wedding');
    });

    it('changes type and date without touching the slug, and stores the type lowercased', async () => {
      const id = await insertEvent(db, adminId, { slug: 'wedding-typed-2026-05-29' });
      const res = await auth(request(app).put(`/api/admin/events/${id}`)).send({ event_type: 'Birthday', event_date: '2026-06-01' });
      expect(res.status).toBe(200);
      const row = await db('events').where({ id }).first();
      expect(row.event_type).toBe('birthday');
      expect(String(row.event_date).slice(0, 10)).toBe('2026-06-01');
      expect(row.slug).toBe('wedding-typed-2026-05-29');
    });

    it('saves other fields of an event whose type was deactivated', async () => {
      const id = await insertEvent(db, adminId, { event_name: 'Old type' });
      await db('event_types').where({ slug_prefix: 'wedding' }).update({ is_active: 0 });
      try {
        const res = await auth(request(app).put(`/api/admin/events/${id}`)).send({ welcome_message: 'Still editable' });
        expect(res.status).toBe(200);
        expect((await db('events').where({ id }).first()).event_type).toBe('wedding');
      } finally {
        await db('event_types').where({ slug_prefix: 'wedding' }).update({ is_active: 1 });
      }
    });
```

- [ ] **Step 2: Run them to verify they fail.** From `backend/`: `npx jest __tests__/routes/adminEvents.smoke.test.js -t "event type|deactivated|lowercased"`. Expected: the unknown-type case FAILS with status 200; the lowercase case FAILS on `'Birthday'`; the deactivated case passes (it guards the fix).

- [ ] **Step 3: Implement.** In the PUT validator array, directly after the `event_date` line, add:

```js
    // P4 (spec 5.9): validated only when sent, so an event whose type was
    // deactivated later still saves its other fields.
    body('event_type').optional().isString().trim().toLowerCase().custom(async (value) => {
      if (!(await eventTypeService.isValidEventType(value))) throw new Error('Invalid event type');
      return true;
    }),
```

`eventTypeService` is already required at the top of `crud.js`. The validator's sanitised value reaches the handler because the handler reads `req.body` after `validationResult`; confirm with the lowercase test.

- [ ] **Step 4: Run the tests to verify they pass.** Same command, then the whole file: `npx jest __tests__/routes/adminEvents.smoke.test.js`. Expected: all PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/routes/adminEvents/crud.js backend/__tests__/routes/adminEvents.smoke.test.js
git commit -q -m "feat(events): validate the event type on edit"
```

---

### Task 2: Stored password facts, and mails that carry the stored password

**Files:**
- Modify: `backend/src/services/eventSettings.js` (`mapEventForApi`)
- Modify: `backend/src/routes/adminEvents/passwordRecovery.js` (`GET /:id/password-status`)
- Modify: `backend/src/routes/adminEvents/crud.js` (`POST /:id/send-gallery-email`, `POST /:id/publish`)
- Create: `backend/__tests__/routes/adminEvents.storedPasswordMail.test.js`

**Interfaces:**
- Produces: every mapped event carries `has_client_password: boolean`. `GET /api/admin/events/:id/password-status` answers `{ enabled: boolean, password_stored: boolean, client_password_stored: boolean }`. Publish and send-gallery-email answer with `usedStoredPassword: boolean` added to their JSON when a mail was queued.

- [ ] **Step 1: Write the failing test.** Create `backend/__tests__/routes/adminEvents.storedPasswordMail.test.js`:

```js
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
    expect(res.status).toBe(201);
    return res.body.event?.id ?? res.body.id;
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
```

If the create route answers a different status or shape, read the create test in `adminEvents.recoverablePassword.test.js` and match it; do not weaken the assertions on the mails.

- [ ] **Step 2: Run it to verify it fails.** From `backend/`: `npx jest __tests__/routes/adminEvents.storedPasswordMail.test.js`. Expected: `has_client_password` is undefined, the status lacks the two flags, `usedStoredPassword` is undefined and the mails carry `(set at creation)`.

- [ ] **Step 3: Implement the API facts.** In `mapEventForApi` (`eventSettings.js`), return the flag from the already bound `_cph`:

```js
  return {
    ...rest,
    customer_name: customer_name ?? host_name ?? null,
    customer_email: customer_email ?? host_email ?? null,
    customer_phone: customer_phone ?? null,
    // P4 (spec 5.4): whether a client password exists, so Settings > Access
    // can say "No client password set". A boolean, never the hash.
    has_client_password: Boolean(_cph),
  };
```

Keep the existing return fields exactly; only add the last one. In `passwordRecovery.js`, replace the body of the `password-status` handler's `res.json(...)` line with:

```js
      const enabled = await isRecoverableStorageEnabled();
      // Whether copies exist, not what they are (P4, ruling 3).
      const row = enabled
        ? await db('events').where('id', id).first('password_recoverable', 'client_password_recoverable')
        : null;
      res.json({
        enabled,
        password_stored: Boolean(row?.password_recoverable),
        client_password_stored: Boolean(row?.client_password_recoverable),
      });
```

- [ ] **Step 4: Implement the mail fallback.** In `crud.js`, add `readGalleryPassword` to the existing `require('../../utils/galleryPasswordVault')` destructure. In `send-gallery-email`, replace

```js
      const queued = hasInlineRecipient
        && await queueGalleryCreatedEmail(event, { password, requirePassword });
```

with

```js
      // P4 (ruling 1): no typed password means the stored copy, as resend does.
      const stored = hasInlineRecipient && requirePassword && !password ? await readGalleryPassword(id) : null;
      const mailPassword = password || stored?.password || undefined;
      const queued = hasInlineRecipient
        && await queueGalleryCreatedEmail(event, { password: mailPassword, requirePassword });
```

and add `usedStoredPassword: Boolean(stored?.password),` to the final `res.json({ message: 'Gallery email queued', ... })`. In `publish`, replace `await queueGalleryCreatedEmail(event, { password, requirePassword });` with:

```js
          const stored = requirePassword && !password ? await readGalleryPassword(id) : null;
          usedStoredPassword = Boolean(stored?.password);
          await queueGalleryCreatedEmail(event, { password: password || stored?.password || undefined, requirePassword });
```

declare `let usedStoredPassword = false;` next to `let publishKeepsHash = false;`, and add `usedStoredPassword,` to the publish success `res.json(...)`. The WhatsApp block further down keeps sending only the typed password: its template has no stored-copy path today, and widening it is not in this phase.

- [ ] **Step 5: Run the tests to verify they pass.** `npx jest __tests__/routes/adminEvents.storedPasswordMail.test.js __tests__/routes/adminEvents.recoverablePassword.test.js __tests__/integration/publishQuietly.test.js __tests__/routes/adminEvents.smoke.test.js`. Expected: all PASS. If a suite asserts the exact `password-status` body `{ enabled }`, update it to the three-key shape and say so in the report.

- [ ] **Step 6: Commit.**

```bash
git add backend/src/services/eventSettings.js backend/src/routes/adminEvents/passwordRecovery.js backend/src/routes/adminEvents/crud.js backend/__tests__/routes/adminEvents.storedPasswordMail.test.js
git commit -q -m "feat(events): carry the stored gallery password in publish and send mails"
```

---

### Task 3: Feedback mode rules, and a mode switch counts as one change

**Files:**
- Create: `frontend/src/pages/admin/event-details/settings/feedbackMode.ts`
- Create: `frontend/src/pages/admin/event-details/settings/__tests__/feedbackMode.test.ts`
- Modify: `frontend/src/pages/admin/event-details/draft/eventDraft.ts` (`draftCount`)
- Modify: `frontend/src/pages/admin/event-details/draft/__tests__/eventDraft.test.ts`

**Interfaces:**
- Produces: `type FeedbackMode = 'off' | 'picks' | 'full' | 'custom'`; `feedbackMode(s: Partial<FeedbackSettings>): FeedbackMode`; `offeredModes(current: Partial<FeedbackSettings>, saved: Partial<FeedbackSettings>): FeedbackMode[]`; `applyFeedbackMode(current: FeedbackSettings, saved: Partial<FeedbackSettings>, mode: FeedbackMode): FeedbackSettings`. `draftCount` counts `feedback.feedback_enabled` and `feedback.allow_{favorites,likes,ratings,comments,reactions}` as one.

- [ ] **Step 1: Write the failing tests.** Create `settings/__tests__/feedbackMode.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyFeedbackMode, feedbackMode, offeredModes } from '../feedbackMode';
import type { FeedbackSettings } from '../../../../../services/feedback.service';

const base: FeedbackSettings = {
  feedback_enabled: true, allow_ratings: true, allow_likes: true, allow_comments: true, allow_favorites: true,
  allow_reactions: true, allow_color_labels: true, require_name_email: true, moderate_comments: false,
  show_feedback_to_guests: false, identity_mode: 'guest', max_favorites_per_guest: 5, max_likes_per_guest: null,
};
const picks = { ...base, allow_ratings: false, allow_likes: false, allow_comments: false, allow_reactions: false };
const custom = { ...base, allow_likes: false };

describe('feedback mode (spec 5.7)', () => {
  it('reads the mode from the enable switch and the five type toggles', () => {
    expect(feedbackMode(base)).toBe('full');
    expect(feedbackMode(picks)).toBe('picks');
    expect(feedbackMode(custom)).toBe('custom');
    expect(feedbackMode({ ...custom, feedback_enabled: false })).toBe('off');
  });

  it('treats SQLite 0/1 like booleans', () => {
    expect(feedbackMode({ ...base, allow_likes: 0 as never, feedback_enabled: 1 as never })).toBe('custom');
  });

  it('writes each on-mode and never touches the other settings', () => {
    const toPicks = applyFeedbackMode(base, base, 'picks');
    expect(toPicks).toEqual({ ...picks });
    const toFull = applyFeedbackMode(picks, picks, 'full');
    expect(toFull).toEqual(base);
    expect(toFull.allow_color_labels).toBe(true);
    expect(toFull.identity_mode).toBe('guest');
  });

  it('Off keeps the toggles underneath, and on again offers Custom when they match neither mode', () => {
    const off = applyFeedbackMode(custom, custom, 'off');
    expect(off).toEqual({ ...custom, feedback_enabled: false });
    expect(offeredModes(off, custom)).toEqual(['off', 'picks', 'full', 'custom']);
    expect(feedbackMode(applyFeedbackMode(off, custom, 'custom'))).toBe('custom');
  });

  it('Custom stays offered after trying another mode and brings the saved toggles back', () => {
    const tried = applyFeedbackMode(custom, custom, 'full');
    expect(offeredModes(tried, custom)).toContain('custom');
    expect(applyFeedbackMode(tried, custom, 'custom')).toEqual(custom);
  });

  it('offers no Custom when neither the saved nor the current toggles need it', () => {
    expect(offeredModes(base, picks)).toEqual(['off', 'picks', 'full']);
  });
});
```

Append to `draft/__tests__/eventDraft.test.ts`:

```ts
describe('draftCount (spec 5.2: a feedback mode switch counts as one)', () => {
  it('counts the enable switch and the five type toggles as one change', () => {
    let s: DraftState = {};
    for (const k of ['feedback_enabled', 'allow_likes', 'allow_ratings', 'allow_comments', 'allow_reactions', 'allow_favorites']) {
      s = setField(s, fieldKey('feedback', k), true, false);
    }
    expect(draftCount(s)).toBe(1);
    s = setField(s, fieldKey('feedback', 'allow_color_labels'), true, false);
    s = setField(s, fieldKey('event', 'photo_cap'), 5, 0);
    expect(draftCount(s)).toBe(3);
  });
});
```

Import `draftCount`, `fieldKey`, `setField` and `DraftState` from `../eventDraft` if the file does not already.

- [ ] **Step 2: Run them to verify they fail.** From `frontend/`: `npx vitest run src/pages/admin/event-details/settings/__tests__/feedbackMode.test.ts src/pages/admin/event-details/draft/__tests__/eventDraft.test.ts`. Expected: the module is missing; `draftCount` returns 6.

- [ ] **Step 3: Implement.** Create `settings/feedbackMode.ts`:

```ts
import type { FeedbackSettings } from '../../../../services/feedback.service';

/** The guest feedback mode (spec 5.7), derived from the enable switch and five type toggles. */
export type FeedbackMode = 'off' | 'picks' | 'full' | 'custom';

export const MODE_TYPES = ['allow_favorites', 'allow_likes', 'allow_ratings', 'allow_comments', 'allow_reactions'] as const;
type ModeType = typeof MODE_TYPES[number];
type Types = Record<ModeType, boolean>;

const PICKS: Types = { allow_favorites: true, allow_likes: false, allow_ratings: false, allow_comments: false, allow_reactions: false };
const FULL: Types = { allow_favorites: true, allow_likes: true, allow_ratings: true, allow_comments: true, allow_reactions: true };

const typesOf = (s: Partial<FeedbackSettings>): Types =>
  Object.fromEntries(MODE_TYPES.map((k) => [k, Boolean(s[k])])) as Types;
const same = (a: Types, b: Types) => MODE_TYPES.every((k) => a[k] === b[k]);
const typesMode = (s: Partial<FeedbackSettings>): Exclude<FeedbackMode, 'off'> => {
  const t = typesOf(s);
  if (same(t, PICKS)) return 'picks';
  if (same(t, FULL)) return 'full';
  return 'custom';
};

export function feedbackMode(s: Partial<FeedbackSettings>): FeedbackMode {
  return s.feedback_enabled ? typesMode(s) : 'off';
}

/** Custom is offered while the saved or the current toggles match neither on-mode (ruling 9). */
export function offeredModes(current: Partial<FeedbackSettings>, saved: Partial<FeedbackSettings>): FeedbackMode[] {
  const modes: FeedbackMode[] = ['off', 'picks', 'full'];
  if (typesMode(current) === 'custom' || typesMode(saved) === 'custom') modes.push('custom');
  return modes;
}

/**
 * The settings after picking a mode. Off keeps the toggles underneath; Custom
 * brings back the saved toggles. Color labels, identity, caps and the privacy
 * switches are never changed by a mode.
 */
export function applyFeedbackMode(current: FeedbackSettings, saved: Partial<FeedbackSettings>, mode: FeedbackMode): FeedbackSettings {
  if (mode === 'off') return { ...current, feedback_enabled: false };
  const types = mode === 'picks' ? PICKS : mode === 'full' ? FULL : typesOf(saved);
  return { ...current, feedback_enabled: true, ...types };
}
```

In `draft/eventDraft.ts`, replace the `draftCount` line with:

```ts
// The feedback mode's keys (spec 5.7). One mode switch writes up to six of
// them and counts as one change (spec 5.2).
const MODE_KEYS = new Set(['feedback_enabled', 'allow_favorites', 'allow_likes', 'allow_ratings', 'allow_comments', 'allow_reactions']
  .map((k) => `feedback.${k}`));

export const draftCount = (state: DraftState): number => {
  const keys = Object.keys(state);
  const mode = keys.filter((k) => MODE_KEYS.has(k)).length;
  return keys.length - mode + (mode > 0 ? 1 : 0);
};
```

- [ ] **Step 4: Run the tests to verify they pass.** Same command plus `src/pages/admin/event-details/draft`. Expected: all PASS.

- [ ] **Step 5: Commit.**

```bash
git add frontend/src/pages/admin/event-details/settings/feedbackMode.ts frontend/src/pages/admin/event-details/settings/__tests__/feedbackMode.test.ts frontend/src/pages/admin/event-details/draft/eventDraft.ts frontend/src/pages/admin/event-details/draft/__tests__/eventDraft.test.ts
git commit -q -m "feat(events): derive the guest feedback mode from its toggles"
```

---

### Task 4: Guest interaction shows the feedback mode; the toggles move to advanced

**Files:**
- Create: `frontend/src/pages/admin/event-details/settings/FeedbackModeSelector.tsx`
- Modify: `frontend/src/components/admin/FeedbackSettings.tsx` (prop `hideEnableToggle`)
- Modify: `frontend/src/pages/admin/event-details/settings/GuestInteractionSection.tsx`
- Modify: `frontend/src/pages/admin/event-details/settings/EventSettingsContext.tsx` (`savedFeedbackSettings`)
- Modify: `frontend/src/pages/admin/EventDetailsPage.tsx` (pass `savedFeedbackSettings: serverFeedback`)
- Modify: `frontend/src/pages/admin/event-details/settings/__tests__/GuestInteractionSection.test.tsx`
- Modify: `frontend/src/pages/admin/__tests__/eventSettingsSaveModel.test.tsx` (the two feedback tests)
- Modify: `frontend/src/i18n/locales/{en,de,vi}.json` (via addkeys)

**Interfaces:**
- Consumes: `feedbackMode`, `offeredModes`, `applyFeedbackMode`, `FeedbackMode` (Task 3).
- Produces: `EventSettingsValue.savedFeedbackSettings: FeedbackSettings`; `<FeedbackModeSelector mode offered onSelect />`; `FeedbackSettings` prop `hideEnableToggle?: boolean`.

- [ ] **Step 1: Add the strings.** Spec `events.feedbackMode`:

```json
{
  "path": "events.feedbackMode",
  "en": {
    "label": "Guest feedback",
    "off": "Off", "offHelp": "Guests view and download only.",
    "picks": "Client picks photos", "picksHelp": "Guests mark favourites, nothing else.",
    "full": "Full feedback", "fullHelp": "Favourites, likes, ratings, comments and reactions.",
    "custom": "Custom", "customHelp": "The individual switches under advanced options decide."
  },
  "de": {
    "label": "Gäste-Feedback",
    "off": "Aus", "offHelp": "Gäste sehen und laden nur herunter.",
    "picks": "Kunde wählt Fotos aus", "picksHelp": "Gäste markieren Favoriten, sonst nichts.",
    "full": "Volles Feedback", "fullHelp": "Favoriten, Likes, Bewertungen, Kommentare und Reaktionen.",
    "custom": "Eigene Auswahl", "customHelp": "Die einzelnen Schalter unter den erweiterten Optionen entscheiden."
  },
  "vi": {
    "label": "Phản hồi của khách",
    "off": "Tắt", "offHelp": "Khách chỉ xem và tải ảnh.",
    "picks": "Khách hàng chọn ảnh", "picksHelp": "Khách chỉ đánh dấu ảnh yêu thích.",
    "full": "Phản hồi đầy đủ", "fullHelp": "Yêu thích, thích, chấm điểm, bình luận và biểu cảm.",
    "custom": "Tuỳ chỉnh", "customHelp": "Các công tắc riêng trong phần tuỳ chọn nâng cao quyết định."
  }
}
```

- [ ] **Step 2: Write the failing tests.** Replace the first test of `GuestInteractionSection.test.tsx` and extend `renderSection` so the context carries `savedFeedbackSettings` (default: the same object as `feedbackSettings`) and `feedbackSettings` can be overridden:

```tsx
const FULL = { feedback_enabled: true, allow_ratings: true, allow_likes: true, allow_comments: true, allow_favorites: true, allow_reactions: true };

it('offers the modes and writes the mode through the draft, not a request', async () => {
  const setFeedbackSettings = vi.fn();
  renderSection({ setFeedbackSettings, feedbackSettings: { ...FULL, feedback_enabled: false } });
  expect(screen.getByRole('radio', { name: /^Off/ })).toBeChecked();
  expect(screen.queryByRole('radio', { name: /^Custom/ })).toBeNull();
  await userEvent.click(screen.getByRole('radio', { name: /^Client picks photos/ }));
  expect(setFeedbackSettings).toHaveBeenCalledWith(expect.objectContaining({
    feedback_enabled: true, allow_favorites: true, allow_likes: false, allow_ratings: false,
  }));
});

it('offers Custom for saved toggles that match no mode', () => {
  renderSection({ feedbackSettings: { ...FULL, allow_likes: false } });
  expect(screen.getByRole('radio', { name: /^Custom/ })).toBeChecked();
});

it('keeps the individual toggles in the advanced area, without their own enable switch', async () => {
  renderSection({ feedbackSettings: FULL });
  expect(screen.queryByText('feedback controls')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Show advanced options' }));
  expect(screen.getByText('feedback controls')).toBeInTheDocument();
  expect(fbProps).toMatchObject({ hideEnableToggle: true });
});
```

`fbProps` must capture the new prop: widen its type to `{ settings: unknown; onChange: (s: unknown) => void; hideEnableToggle?: boolean } | null`. In `eventSettingsSaveModel.test.tsx`, replace the two tests that use `firstSectionCheckbox` in the guests section:

```tsx
  const modeRadio = (name: RegExp) => screen.findByRole('radio', { name });

  it('keeps only the failed part, and a retry resends only that part', async () => {
    updateFeedback.mockRejectedValueOnce(new Error('500'));
    await open('/admin/events/7?tab=settings&section=guests');
    await userEvent.click(await modeRadio(/^Full feedback/));
    await setPhotoLimit('40');
    await userEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/Not saved/);
    expect(updateEvent).toHaveBeenCalledTimes(1);
    expect(bar()).not.toBeNull();
    await userEvent.click(saveButton());
    await waitFor(() => expect(updateFeedback).toHaveBeenCalledTimes(2));
    expect(updateFeedback).toHaveBeenLastCalledWith('7', { feedback_enabled: true });
    expect(updateEvent).toHaveBeenCalledTimes(1);
  });

  it('restores the feedback mode on Discard, and a mode switch counts as one change', async () => {
    await open('/admin/events/7?tab=settings&section=guests');
    expect(await modeRadio(/^Off/)).toBeChecked();
    await userEvent.click(await modeRadio(/^Client picks photos/));
    expect(bar()).toHaveTextContent('1');
    await userEvent.click(within(bar() as HTMLElement).getByRole('button', { name: 'Discard' }));
    expect(await modeRadio(/^Off/)).toBeChecked();
    expect(bar()).toBeNull();
  });
```

Remove `firstSectionCheckbox` if nothing else uses it. The page test's `t` mock returns the fallback, so `EventSaveBar`'s count renders as its fallback text; if the bar's text does not contain the digit, assert on the count with the bar's own accessible text instead and say so in the report.

- [ ] **Step 3: Run them to verify they fail.** `npx vitest run src/pages/admin/event-details/settings/__tests__/GuestInteractionSection.test.tsx src/pages/admin/__tests__/eventSettingsSaveModel.test.tsx`. Expected: no radios exist.

- [ ] **Step 4: Implement.** Create `settings/FeedbackModeSelector.tsx`:

```tsx
import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { FeedbackMode } from './feedbackMode';

const LABEL: Record<FeedbackMode, [string, string, string, string]> = {
  off: ['events.feedbackMode.off', 'Off', 'events.feedbackMode.offHelp', 'Guests view and download only.'],
  picks: ['events.feedbackMode.picks', 'Client picks photos', 'events.feedbackMode.picksHelp', 'Guests mark favourites, nothing else.'],
  full: ['events.feedbackMode.full', 'Full feedback', 'events.feedbackMode.fullHelp', 'Favourites, likes, ratings, comments and reactions.'],
  custom: ['events.feedbackMode.custom', 'Custom', 'events.feedbackMode.customHelp', 'The individual switches under advanced options decide.'],
};

/** The feedback mode (spec 5.7): one choice instead of the individual toggles. */
export const FeedbackModeSelector: React.FC<{
  mode: FeedbackMode;
  offered: FeedbackMode[];
  onSelect: (mode: FeedbackMode) => void;
}> = ({ mode, offered, onSelect }) => {
  const { t } = useTranslation();
  const name = useId();
  return (
    <div role="radiogroup" aria-label={t('events.feedbackMode.label', 'Guest feedback')} className="space-y-2">
      {offered.map((m) => {
        const [key, fallback, helpKey, helpFallback] = LABEL[m];
        return (
          <label key={m} className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name={name} className="mt-1" checked={mode === m} onChange={() => onSelect(m)} />
            <span>
              <span className="block text-sm font-medium text-body">{t(key, fallback)}</span>
              <span className="block text-xs text-muted">{t(helpKey, helpFallback)}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
};
```

In `FeedbackSettings.tsx`, add `hideEnableToggle?: boolean` to the props interface and destructure it; wrap the header's `feedback_enabled` checkbox (the first checkbox, next to the title) in `{!hideEnableToggle && (...)}`. The body keeps its `feedback_enabled` gate.

Add to `EventSettingsContext.tsx` after `setFeedbackSettings`:

```ts
  /** The saved feedback settings, for the mode's Custom (spec 5.7). */
  savedFeedbackSettings: FeedbackSettings;
```

In `EventDetailsPage.tsx`, add `savedFeedbackSettings: serverFeedback,` to the context value object next to `setFeedbackSettings`. Rewrite `GuestInteractionSection.tsx`:

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../../components/common';
import { FeedbackSettings } from '../../../../components/admin';
import { CreditVisibilitySetting } from '../../../../components/admin/CreditVisibilitySetting';
import { useEventSettings } from './EventSettingsContext';
import { AdvancedArea } from './AdvancedArea';
import { FeedbackModeSelector } from './FeedbackModeSelector';
import { applyFeedbackMode, feedbackMode, offeredModes } from './feedbackMode';

/**
 * Settings > Guest interaction (spec 5.1). The feedback mode is the everyday
 * control; the individual toggles and the photo credit switch sit in the
 * advanced area. Everything is saved by the bar.
 */
export const GuestInteractionSection: React.FC = () => {
  const { t } = useTranslation();
  const { editForm, setEditForm, feedbackSettings, setFeedbackSettings, savedFeedbackSettings, expert } = useEventSettings();
  const saved = savedFeedbackSettings ?? feedbackSettings;
  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4">{t('events.settings.sectionGuests', 'Guest interaction')}</h2>
      <FeedbackModeSelector
        mode={feedbackMode(feedbackSettings)}
        offered={offeredModes(feedbackSettings, saved)}
        onSelect={(mode) => setFeedbackSettings(applyFeedbackMode(feedbackSettings, saved, mode))}
      />
      <AdvancedArea expert={expert}>
        <div>
          <h3 className="text-sm font-semibold text-heading mb-3">{t('feedback.settings.title', 'Guest Feedback Settings')}</h3>
          <FeedbackSettings settings={feedbackSettings} onChange={setFeedbackSettings} hideEnableToggle />
        </div>
        <CreditVisibilitySetting
          idPrefix="event-credits"
          checked={editForm.show_credits_to_guests}
          onChange={(show_credits_to_guests) => setEditForm(prev => ({ ...prev, show_credits_to_guests }))}
        />
      </AdvancedArea>
    </Card>
  );
};
```

- [ ] **Step 5: Run the tests to verify they pass.** Same command, plus `src/pages/admin/event-details src/components/admin/__tests__/FeedbackSettings`. Expected: all PASS, the inventory test included (`<FeedbackSettings` is still in the source).

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/pages/admin/event-details/settings frontend/src/components/admin/FeedbackSettings.tsx frontend/src/pages/admin/EventDetailsPage.tsx frontend/src/pages/admin/__tests__/eventSettingsSaveModel.test.tsx frontend/src/i18n/locales
git commit -q -m "feat(events): choose guest feedback as one mode on the event page"
```

---

### Task 5: The expiry component

**Files:**
- Create: `frontend/src/pages/admin/event-details/settings/ExpiryField.tsx`
- Create: `frontend/src/pages/admin/event-details/settings/__tests__/ExpiryField.test.tsx`
- Modify: `frontend/src/i18n/locales/{en,de,vi}.json`

**Interfaces:**
- Produces: `expiryFromToday(days: number, today?: Date): string` (`yyyy-MM-dd`); `<ExpiryField value={string} onChange={(iso: string) => void} allowNever={boolean} />` where `''` means Never. P5 reuses it with `allowNever` from Settings.

- [ ] **Step 1: Add the strings.** Spec `events.expiry`:

```json
{
  "path": "events.expiry",
  "en": { "label": "Gallery expires", "days_other": "{{count}} days", "never": "Never", "expiresOn": "Expires on {{date}}", "neverExpires": "Never expires", "quickHelp": "Counted from today." },
  "de": { "label": "Galerie läuft ab", "days_other": "{{count}} Tage", "never": "Nie", "expiresOn": "Läuft ab am {{date}}", "neverExpires": "Läuft nie ab", "quickHelp": "Ab heute gezählt." },
  "vi": { "label": "Gallery hết hạn", "days_other": "{{count}} ngày", "never": "Không bao giờ", "expiresOn": "Hết hạn ngày {{date}}", "neverExpires": "Không bao giờ hết hạn", "quickHelp": "Tính từ hôm nay." }
}
```

Add `"days_one": "{{count}} day"` to en and `"days_one": "{{count}} Tag"` to de in the same spec objects (vi has only `_other`).

- [ ] **Step 2: Write the failing test.** Create `settings/__tests__/ExpiryField.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => ({
    t: (k: string, o?: unknown) => {
      const opts = (typeof o === 'object' && o) ? o as Record<string, unknown> : {};
      if (k === 'events.expiry.days') return `${opts.count} days`;
      if (k === 'events.expiry.expiresOn') return `Expires on ${opts.date}`;
      return typeof o === 'string' ? o : (opts.defaultValue as string) ?? k;
    },
    i18n: { language: 'en' },
  }),
}));
vi.mock('../../../../../hooks/useLocalizedDate', () => ({
  useLocalizedDate: () => ({ format: (d: string | Date) => String(d).slice(0, 10) }),
}));
vi.mock('../../../../../components/common', async () => ({
  ...(await vi.importActual<object>('../../../../../components/common')),
  LocalizedDateInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="expiry date" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { ExpiryField, expiryFromToday } from '../ExpiryField';

describe('ExpiryField (spec 5.8)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-01T10:00:00')); });
  afterEach(() => { vi.useRealTimers(); });

  it('counts the quick buttons from today', () => {
    expect(expiryFromToday(30)).toBe('2026-10-31');
    expect(expiryFromToday(90)).toBe('2026-12-30');
  });

  it('sets the date from a quick button and shows the resulting date', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ExpiryField value="" onChange={onChange} allowNever />);
    expect(screen.getByText('Never expires')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '60 days' }));
    expect(onChange).toHaveBeenCalledWith('2026-11-30');
    rerender(<ExpiryField value="2026-11-30" onChange={onChange} allowNever />);
    expect(screen.getByRole('button', { name: '60 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Expires on 2026-11-30')).toBeInTheDocument();
  });

  it('offers Never on edit and clears the date with it', async () => {
    const onChange = vi.fn();
    render(<ExpiryField value="2026-11-30" onChange={onChange} allowNever />);
    await userEvent.click(screen.getByRole('button', { name: 'Never' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('hides Never when it is not allowed', () => {
    render(<ExpiryField value="2026-11-30" onChange={vi.fn()} allowNever={false} />);
    expect(screen.queryByRole('button', { name: 'Never' })).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to verify it fails.** `npx vitest run src/pages/admin/event-details/settings/__tests__/ExpiryField.test.tsx`. Expected: module missing.

- [ ] **Step 4: Implement.** Create `settings/ExpiryField.tsx`:

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, format as formatDate, startOfDay } from 'date-fns';
import { LocalizedDateInput } from '../../../../components/common';
import { useLocalizedDate } from '../../../../hooks/useLocalizedDate';

const QUICK_DAYS = [30, 60, 90];

/** A date N days from today, as the draft stores it (O3: counted from today). */
export function expiryFromToday(days: number, today: Date = new Date()): string {
  return formatDate(addDays(startOfDay(today), days), 'yyyy-MM-dd');
}

/**
 * The gallery's expiry (spec 5.8), the same on both screens: the resulting
 * date always shown, quick buttons counted from today, and Never. '' is Never.
 * Changing the event date never touches it.
 */
export const ExpiryField: React.FC<{ value: string; onChange: (iso: string) => void; allowNever: boolean }> = ({ value, onChange, allowNever }) => {
  const { t } = useTranslation();
  const { format } = useLocalizedDate();
  const button = (pressed: boolean) =>
    `px-3 py-1.5 rounded-lg border text-sm ${pressed ? 'border-accent bg-accent/10 text-heading' : 'border-line-strong text-body'}`;
  return (
    <div>
      <span className="block text-sm font-medium text-body mb-1">{t('events.expiry.label', 'Gallery expires')}</span>
      <div className="flex flex-wrap gap-2 mb-2">
        {QUICK_DAYS.map((days) => {
          const iso = expiryFromToday(days);
          return (
            <button key={days} type="button" aria-pressed={value === iso} className={button(value === iso)} onClick={() => onChange(iso)}>
              {t('events.expiry.days', { count: days, defaultValue: `${days} days` })}
            </button>
          );
        })}
        {allowNever && (
          <button type="button" aria-pressed={value === ''} className={button(value === '')} onClick={() => onChange('')}>
            {t('events.expiry.never', 'Never')}
          </button>
        )}
      </div>
      <LocalizedDateInput value={value} onChange={onChange} min={expiryFromToday(0)} helperText={t('events.expiry.quickHelp', 'Counted from today.')} />
      <p className="mt-1 text-sm text-heading">
        {value
          ? t('events.expiry.expiresOn', { date: format(value), defaultValue: `Expires on ${format(value)}` })
          : t('events.expiry.neverExpires', 'Never expires')}
      </p>
    </div>
  );
};
```

- [ ] **Step 5: Run the test to verify it passes.** Same command. Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/pages/admin/event-details/settings/ExpiryField.tsx frontend/src/pages/admin/event-details/settings/__tests__/ExpiryField.test.tsx frontend/src/i18n/locales
git commit -q -m "feat(events): add the expiry field with quick buttons and Never"
```

---

### Task 6: Details edits the event date and type, the expiry and the welcome message

**Files:**
- Create: `frontend/src/hooks/useActiveEventTypes.ts`
- Modify: `frontend/src/pages/admin/event-details/types.ts` (`event_date`, `event_type`, initial values)
- Modify: `frontend/src/pages/admin/event-details/draft/serverValues.ts` (`eventFormValues`)
- Modify: `frontend/src/pages/admin/event-details/draft/saveDraft.ts` (`validateDraft` date rule)
- Modify: `frontend/src/pages/admin/event-details/settings/sectionFields.ts` (details list)
- Modify: `frontend/src/pages/admin/event-details/settings/DetailsSection.tsx`
- Modify: `frontend/src/components/admin/WelcomeMessageEditor.tsx` (i18n)
- Create: `frontend/src/pages/admin/event-details/settings/__tests__/DetailsSection.test.tsx`
- Modify: `frontend/src/pages/admin/event-details/draft/__tests__/serverValues.test.ts`, `draft/__tests__/saveDraft.test.ts`, `settings/__tests__/EventSettingsTab.test.tsx` (fixture keys)
- Modify: `frontend/src/i18n/locales/{en,de,vi}.json`

**Interfaces:**
- Consumes: `ExpiryField` (Task 5).
- Produces: `EditFormState.event_date: string` (`yyyy-MM-dd`), `EditFormState.event_type: string`; `useActiveEventTypes(): UseQueryResult<EventType[]>` with query key `['event-types', 'active']` (the key the create page already uses); `validateDraft` refuses an empty event date with `events.details.eventDateRequired`.

- [ ] **Step 1: Add the strings.** Two specs:

```json
{
  "path": "events.details",
  "en": { "eventDate": "Event date", "eventType": "Event type", "inactiveType": "{{name}} (inactive)", "eventDateRequired": "The event date cannot be empty." },
  "de": { "eventDate": "Eventdatum", "eventType": "Eventtyp", "inactiveType": "{{name}} (inaktiv)", "eventDateRequired": "Das Eventdatum darf nicht leer sein." },
  "vi": { "eventDate": "Ngày sự kiện", "eventType": "Loại sự kiện", "inactiveType": "{{name}} (ngừng dùng)", "eventDateRequired": "Ngày sự kiện không được để trống." }
}
```

```json
{
  "path": "events.welcomeEditor",
  "en": { "tip": "Press Enter for a new line. Each line appears as its own paragraph in emails.", "preview": "Preview:", "lineBreaks": "Line breaks are kept in emails" },
  "de": { "tip": "Drück Enter für eine neue Zeile. Jede Zeile erscheint in E-Mails als eigener Absatz.", "preview": "Vorschau:", "lineBreaks": "Zeilenumbrüche bleiben in E-Mails erhalten" },
  "vi": { "tip": "Nhấn Enter để xuống dòng. Mỗi dòng là một đoạn riêng trong email.", "preview": "Xem trước:", "lineBreaks": "Email giữ nguyên các lần xuống dòng" }
}
```

- [ ] **Step 2: Write the failing tests.** In `draft/__tests__/serverValues.test.ts`, add:

```ts
  it('seeds the event date and type, and reads a Postgres timestamp as its day', () => {
    const v = eventFormValues({ ...legacy, event_date: '2020-06-01T00:00:00.000Z', event_type: 'wedding' } as never);
    expect(v.event_date).toBe('2020-06-01');
    expect(v.event_type).toBe('wedding');
    expect(eventFormValues({ id: 1 } as never)).toMatchObject({ event_date: '', event_type: '' });
  });
```

In `draft/__tests__/saveDraft.test.ts`, add:

```ts
  it('refuses to clear the event date and sends a changed type and date as they are', () => {
    const form = { ...serverForm, event_date: '' };
    expect(validateDraft(new Set(['event_date']), form, serverForm)?.key).toBe('events.details.eventDateRequired');
    const next = { ...serverForm, event_date: '2026-06-01', event_type: 'birthday' };
    expect(buildEventPayload(new Set(['event_date', 'event_type']), next, theme, theme)).toEqual({ event_date: '2026-06-01', event_type: 'birthday' });
  });
```

Use the file's existing form and theme fixture names (read the top of the file first; rename `serverForm` and `theme` above to match, and add `event_date: '2026-01-01', event_type: 'wedding'` to the form fixture if absent). Create `settings/__tests__/DetailsSection.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ConfirmDialogProvider } from '../../../../../components/common/ConfirmDialog';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => ({
    t: (k: string, o?: unknown) => {
      const opts = (typeof o === 'object' && o) ? o as Record<string, unknown> : {};
      if (k === 'events.details.inactiveType') return `${opts.name} (inactive)`;
      return typeof o === 'string' ? o : (opts.defaultValue as string) ?? k;
    },
    i18n: { language: 'en' },
  }),
}));
vi.mock('../../../../../hooks/useActiveEventTypes', () => ({
  useActiveEventTypes: () => ({ data: [
    { slug_prefix: 'wedding', name: 'Wedding', emoji: '', theme_preset: 'elegantWedding', is_active: true },
    { slug_prefix: 'birthday', name: 'Birthday', emoji: '', theme_preset: 'birthdayFun', is_active: true },
  ] }),
}));
vi.mock('../../../../../components/admin/CustomerAccountPicker', () => ({ CustomerAccountPicker: () => null }));

import { EventSettingsContext } from '../EventSettingsContext';
import { DetailsSection } from '../DetailsSection';

const form = {
  customer_name: 'Anna', customer_email: 'a@example.com', customer_phone: '', customer_accounts: [],
  expires_at: '2030-01-01', welcome_message: '', event_date: '2026-05-29', event_type: 'wedding',
};

function renderSection(over: { event?: object; editForm?: object; setEditForm?: ReturnType<typeof vi.fn>; setTheme?: ReturnType<typeof vi.fn>; draft?: object } = {}) {
  return render(
    <ConfirmDialogProvider>
      <EventSettingsContext.Provider value={{
        event: { id: 1, color_theme: null, ...over.event } as never,
        editForm: { ...form, ...over.editForm } as never, setEditForm: over.setEditForm ?? vi.fn(),
        theme: { config: {} as never, preset: 'custom' }, setTheme: over.setTheme ?? vi.fn(),
        draft: (over.draft ?? { state: {} }) as never, readOnly: false, lockReason: null, expert: true, setExpert: vi.fn(),
        refetchEvent: vi.fn(), heroPhotos: [], cssTemplates: [], phoneFieldEnabled: false,
      } as never}><DetailsSection /></EventSettingsContext.Provider>
    </ConfirmDialogProvider>,
  );
}

it('shows the event type from the catalog and keeps a deactivated current type selectable', () => {
  renderSection({ editForm: { event_type: 'corporate' } });
  const select = screen.getByLabelText('Event type') as HTMLSelectElement;
  expect(select.value).toBe('corporate');
  expect(screen.getByRole('option', { name: 'corporate (inactive)' })).toBeInTheDocument();
});

it('writes a new event type into the draft', async () => {
  const setEditForm = vi.fn();
  renderSection({ setEditForm });
  await userEvent.selectOptions(screen.getByLabelText('Event type'), 'birthday');
  const update = setEditForm.mock.calls[0][0];
  expect(update(form)).toMatchObject({ event_type: 'birthday' });
});

it('uses the one welcome message editor', () => {
  renderSection();
  expect(screen.getByText('Press Enter for a new line. Each line appears as its own paragraph in emails.')).toBeInTheDocument();
});

it('offers Never for the expiry on edit', () => {
  renderSection();
  expect(screen.getByRole('button', { name: 'Never' })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run them to verify they fail.** `npx vitest run src/pages/admin/event-details`. Expected: the new cases FAIL (no `event_date`, no type select, no editor copy).

- [ ] **Step 4: Implement the form and draft fields.** In `types.ts`, add to `EditFormState` after `expires_at: string;`:

```ts
  // Event date and type, edited in Settings > Details (spec 5.1, 5.9).
  event_date: string;
  event_type: string;
```

and `event_date: '', event_type: '',` to `INITIAL_EDIT_FORM` after `expires_at: '',`. In `eventFormValues`, add after the `expires_at` line:

```ts
    // Seeded like expires_at, so a Postgres timestamp reads as its day.
    event_date: eventDate ? format(eventDate, 'yyyy-MM-dd') : '',
    event_type: event.event_type || '',
```

with `const eventDate = safeParseDate(event.event_date);` next to `expiresAtDate`. In `sectionFields.ts`, the details list becomes `['event_date', 'event_type', 'customer_name', 'customer_email', 'customer_phone', 'customer_accounts', 'expires_at', 'welcome_message']`. In `validateDraft`, before the external folder check:

```ts
  if (changed.has('event_date') && !form.event_date) {
    return { key: 'events.details.eventDateRequired', fallback: 'The event date cannot be empty.' };
  }
``` `buildEventPayload` already passes both fields through its `default` branch. Add `event_date: '2026-01-01', event_type: 'wedding'` to the hand-built `editForm` in `EventSettingsTab.test.tsx`.

- [ ] **Step 5: Implement the hook, the editor strings and the section.** Create `frontend/src/hooks/useActiveEventTypes.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { eventTypesService } from '../services/eventTypes.service';

/** The active event type catalog. Same key as the create page, so both share one cache entry. */
export function useActiveEventTypes() {
  return useQuery({
    queryKey: ['event-types', 'active'],
    queryFn: () => eventTypesService.getActiveEventTypes(),
    staleTime: 5 * 60 * 1000,
  });
}
```

In `WelcomeMessageEditor.tsx`, add `import { useTranslation } from 'react-i18next';`, `const { t } = useTranslation();` in the component, and replace the three strings: the `title` with `t('events.welcomeEditor.lineBreaks', 'Line breaks are kept in emails')`, the tip with `t('events.welcomeEditor.tip', 'Press Enter for a new line. Each line appears as its own paragraph in emails.')`, and `Preview:` with `t('events.welcomeEditor.preview', 'Preview:')`. In `DetailsSection.tsx`, add the date and type at the top of the `space-y-4` block, replace the expiry block with `ExpiryField`, and replace the textarea with the editor:

```tsx
        <div>
          <label htmlFor="event-date" className="block text-sm font-medium text-body mb-1">{t('events.details.eventDate', 'Event date')}</label>
          <LocalizedDateInput
            value={editForm.event_date}
            onChange={(iso) => setEditForm(prev => ({ ...prev, event_date: iso }))}
          />
        </div>

        <div>
          <label htmlFor="event-type" className="block text-sm font-medium text-body mb-1">{t('events.details.eventType', 'Event type')}</label>
          <select
            id="event-type"
            value={editForm.event_type}
            onChange={(e) => onTypeChange(e.target.value)}
            className="w-full px-3 py-2 border border-line-strong bg-panel text-heading rounded-lg"
          >
            {!types.some((type) => type.slug_prefix === editForm.event_type) && editForm.event_type && (
              <option value={editForm.event_type}>
                {t('events.details.inactiveType', { name: editForm.event_type, defaultValue: `${editForm.event_type} (inactive)` })}
              </option>
            )}
            {types.map((type) => (
              <option key={type.slug_prefix} value={type.slug_prefix}>{type.name}</option>
            ))}
          </select>
        </div>
```

with, at the top of the component, `const { data: types = [] } = useActiveEventTypes();` and, for this task, `const onTypeChange = (slug: string) => setEditForm(prev => ({ ...prev, event_type: slug }));` (Task 7 extends it). The expiry block becomes:

```tsx
        <ExpiryField
          value={editForm.expires_at}
          onChange={(expires_at) => setEditForm(prev => ({ ...prev, expires_at }))}
          allowNever
        />
```

and the advanced area:

```tsx
      <AdvancedArea expert={expert}>
        <div>
          <label className="block text-sm font-medium text-body mb-1">{t('events.welcomeMessageLabel')}</label>
          <WelcomeMessageEditor
            value={editForm.welcome_message}
            onChange={(welcome_message) => setEditForm(prev => ({ ...prev, welcome_message }))}
            placeholder={t('events.welcomeMessage')}
            rows={4}
          />
        </div>
      </AdvancedArea>
```

`LocalizedDateInput` has no `id` prop; if `getByLabelText('Event date')` is needed later, pass `label` instead of the separate `<label>`. Import `WelcomeMessageEditor` from `../../../../components/admin`, `ExpiryField` from `./ExpiryField`, `useActiveEventTypes` from `../../../../hooks/useActiveEventTypes`. Drop the `format`/`useLocalizedDate` import if it becomes unused.

- [ ] **Step 6: Run the tests to verify they pass.** `npx vitest run src/pages/admin/event-details src/pages/admin/__tests__/eventSettingsSaveModel.test.tsx src/pages/admin/__tests__/createEvent`. Expected: all PASS; the zero-changes page test proves the new fields seed clean (its `api.get` mock answers `[]` for the catalog, so the select shows the current type as inactive and still changes nothing).

- [ ] **Step 7: Commit.**

```bash
git add frontend/src/hooks/useActiveEventTypes.ts frontend/src/pages/admin/event-details frontend/src/components/admin/WelcomeMessageEditor.tsx frontend/src/i18n/locales
git commit -q -m "feat(events): edit the event date, type, expiry and welcome message in Details"
```

---

### Task 7: Changing the type applies its theme; the rename dialog explains the address

**Files:**
- Create: `frontend/src/pages/admin/event-details/settings/storedThemeKind.ts`
- Create: `frontend/src/pages/admin/event-details/settings/__tests__/storedThemeKind.test.ts`
- Modify: `frontend/src/pages/admin/event-details/settings/DetailsSection.tsx` (`onTypeChange`)
- Modify: `frontend/src/pages/admin/event-details/settings/__tests__/DetailsSection.test.tsx`
- Modify: `frontend/src/components/admin/EventRenameDialog.tsx` (warning list)
- Modify: `frontend/src/i18n/locales/{en,de,vi}.json`

**Interfaces:**
- Consumes: `useActiveEventTypes` (Task 6), `useConfirm` from `components/common`.
- Produces: `storedThemeKind(colorTheme: string | null | undefined): 'inherit' | 'preset' | 'custom'`.

- [ ] **Step 1: Add the strings.** Spec `events.typeTheme`:

```json
{
  "path": "events.typeTheme",
  "en": { "title": "Replace the customised theme?", "message": "This gallery's look was customised by hand. Apply the {{type}} theme instead?", "confirm": "Apply theme", "keep": "Keep my theme" },
  "de": { "title": "Angepasstes Theme ersetzen?", "message": "Das Aussehen dieser Galerie wurde von Hand angepasst. Stattdessen das Theme für {{type}} verwenden?", "confirm": "Theme übernehmen", "keep": "Mein Theme behalten" },
  "vi": { "title": "Thay giao diện đã tuỳ chỉnh?", "message": "Giao diện của gallery này đã được chỉnh tay. Dùng giao diện của loại {{type}} thay thế?", "confirm": "Dùng giao diện mới", "keep": "Giữ giao diện của tôi" }
}
```

and `{ "path": "events.rename", "en": { "warning4": "The new address is built from the event's current type, name and date." }, "de": { "warning4": "Die neue Adresse wird aus dem aktuellen Typ, Namen und Datum des Events gebildet." }, "vi": { "warning4": "Địa chỉ mới được tạo từ loại, tên và ngày hiện tại của sự kiện." } }`.

- [ ] **Step 2: Write the failing tests.** Create `settings/__tests__/storedThemeKind.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { storedThemeKind } from '../storedThemeKind';
import { GALLERY_THEME_PRESETS } from '../../../../../types/theme.types';

describe('storedThemeKind (spec 5.9, ruling 11)', () => {
  it('reads NULL and an unknown name as inherit', () => {
    expect(storedThemeKind(null)).toBe('inherit');
    expect(storedThemeKind('')).toBe('inherit');
    expect(storedThemeKind('noSuchPreset')).toBe('inherit');
  });
  it('reads a preset name and JSON equal to a preset config as preset', () => {
    expect(storedThemeKind('elegantWedding')).toBe('preset');
    expect(storedThemeKind(JSON.stringify(GALLERY_THEME_PRESETS.birthdayFun.config))).toBe('preset');
  });
  it('reads other JSON as custom', () => {
    expect(storedThemeKind(JSON.stringify({ ...GALLERY_THEME_PRESETS.default.config, primaryColor: '#123456' }))).toBe('custom');
  });
});
```

Append to `DetailsSection.test.tsx`:

```tsx
import { GALLERY_THEME_PRESETS } from '../../../../../types/theme.types';

it('applies the new type theme to an inherited theme without asking', async () => {
  const setTheme = vi.fn();
  renderSection({ setTheme });
  await userEvent.selectOptions(screen.getByLabelText('Event type'), 'birthday');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(setTheme.mock.calls[0][0]({})).toEqual({ config: GALLERY_THEME_PRESETS.birthdayFun.config, preset: 'birthdayFun' });
});

it('asks before replacing a customised theme, and keeps it on Keep', async () => {
  const setTheme = vi.fn();
  const custom = JSON.stringify({ ...GALLERY_THEME_PRESETS.default.config, primaryColor: '#123456' });
  renderSection({ setTheme, event: { color_theme: custom } });
  await userEvent.selectOptions(screen.getByLabelText('Event type'), 'birthday');
  await userEvent.click(await screen.findByRole('button', { name: 'Keep my theme' }));
  expect(setTheme).not.toHaveBeenCalled();
});

it('replaces a customised theme when confirmed', async () => {
  const setTheme = vi.fn();
  const custom = JSON.stringify({ ...GALLERY_THEME_PRESETS.default.config, primaryColor: '#123456' });
  renderSection({ setTheme, event: { color_theme: custom } });
  await userEvent.selectOptions(screen.getByLabelText('Event type'), 'birthday');
  await userEvent.click(await screen.findByRole('button', { name: 'Apply theme' }));
  expect(setTheme).toHaveBeenCalledTimes(1);
});

it('counts a theme changed in this draft by its draft preset', async () => {
  const setTheme = vi.fn();
  renderSection({ setTheme, draft: { state: { 'event.__theme': { base: null, value: { config: {}, preset: 'custom' } } } } });
  await userEvent.selectOptions(screen.getByLabelText('Event type'), 'birthday');
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run them to verify they fail.** `npx vitest run src/pages/admin/event-details/settings`. Expected: module missing; `setTheme` never called.

- [ ] **Step 4: Implement.** Create `settings/storedThemeKind.ts`:

```ts
import { GALLERY_THEME_PRESETS } from '../../../../types/theme.types';

export type StoredThemeKind = 'inherit' | 'preset' | 'custom';

/**
 * What an event's stored color_theme is (spec 5.9, ruling 11). The create page
 * stores every theme as JSON, so JSON equal to a preset's config is a preset,
 * not a hand-made look. An unknown name falls back to the global theme in the
 * gallery, so it counts as inherit.
 */
export function storedThemeKind(colorTheme: string | null | undefined): StoredThemeKind {
  if (!colorTheme) return 'inherit';
  if (!colorTheme.startsWith('{')) return GALLERY_THEME_PRESETS[colorTheme] ? 'preset' : 'inherit';
  try {
    const config = JSON.stringify(JSON.parse(colorTheme));
    return Object.values(GALLERY_THEME_PRESETS).some((p) => JSON.stringify(p.config) === config) ? 'preset' : 'custom';
  } catch {
    return 'inherit';
  }
}
```

In `DetailsSection.tsx`, read `event`, `setTheme`, `theme`, `draft` from the context too, add `const confirm = useConfirm();` (import from `../../../../components/common`) and replace `onTypeChange`:

```tsx
  // Spec 5.9: the new type's preset replaces a NULL or preset theme at once;
  // a hand-customised one is replaced only after asking. A type whose preset
  // is 'default' leaves the theme alone (ruling 12).
  const onTypeChange = async (slug: string) => {
    setEditForm(prev => ({ ...prev, event_type: slug }));
    const type = types.find((candidate) => candidate.slug_prefix === slug);
    const presetName = type?.theme_preset;
    if (!presetName || presetName === 'default' || !GALLERY_THEME_PRESETS[presetName]) return;
    const kind = draft.state['event.__theme']
      ? (theme.preset === 'custom' ? 'custom' : 'preset')
      : storedThemeKind(event.color_theme);
    if (kind === 'custom') {
      const ok = await confirm({
        title: t('events.typeTheme.title', 'Replace the customised theme?'),
        message: t('events.typeTheme.message', { type: type.name, defaultValue: `This gallery's look was customised by hand. Apply the ${type.name} theme instead?` }),
        confirmLabel: t('events.typeTheme.confirm', 'Apply theme'),
        cancelLabel: t('events.typeTheme.keep', 'Keep my theme'),
        variant: 'warning',
      });
      if (!ok) return;
    }
    setTheme(() => ({ config: GALLERY_THEME_PRESETS[presetName].config, preset: presetName }));
  };
```

Import `GALLERY_THEME_PRESETS` from `../../../../types/theme.types` and `storedThemeKind` from `./storedThemeKind`. In `EventRenameDialog.tsx`, add a fourth item to the warning list after `warning3`: `<li>{t('events.rename.warning4', "The new address is built from the event's current type, name and date.")}</li>`, matching the markup of the other three.

- [ ] **Step 5: Run the tests to verify they pass.** `npx vitest run src/pages/admin/event-details src/components/admin`. Expected: all PASS.

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/pages/admin/event-details/settings frontend/src/components/admin/EventRenameDialog.tsx frontend/src/i18n/locales
git commit -q -m "feat(events): apply the event type's theme when the type changes"
```

---

### Task 8: Settings > Access shows the gallery password as it is stored

**Files:**
- Modify: `frontend/src/utils/passwordGenerator.ts` (`nextEventPassword`)
- Create: `frontend/src/utils/__tests__/nextEventPassword.test.ts`
- Create: `frontend/src/pages/admin/event-details/settings/StoredPasswordLine.tsx`
- Modify: `frontend/src/pages/admin/event-details/settings/AccessSection.tsx`
- Create: `frontend/src/pages/admin/event-details/settings/__tests__/AccessSection.test.tsx`
- Modify: `frontend/src/services/events.service.ts` (`getGalleryPasswordStatus` return type)
- Modify: `frontend/src/types/index.ts` (`has_client_password?: boolean` next to `client_access_enabled`)
- Modify: `frontend/src/pages/admin/event-details/types.ts`, `draft/serverValues.ts`, `draft/saveDraft.ts`, `settings/sectionFields.ts` (drop `confirm_new_password`)
- Modify: `frontend/src/pages/admin/event-details/draft/__tests__/saveDraft.test.ts`, `draft/__tests__/serverValues.test.ts`, `settings/__tests__/EventSettingsTab.test.tsx`
- Modify: `frontend/src/pages/admin/EventDetailsPage.tsx` (invalidate the password status after an event save)
- Delete: `frontend/src/components/admin/PasswordResetModal.tsx` and its export in `frontend/src/components/admin/index.ts`
- Modify: `frontend/src/i18n/locales/{en,de,vi}.json`

**Interfaces:**
- Consumes: `GET /:id/password-status` three-key shape (Task 2); `useConfirm`.
- Produces: `nextEventPassword(eventName: string, eventDate: string, current?: string): string`; `<StoredPasswordLine eventId kind="gallery" | "client" stored={boolean} />`; `getGalleryPasswordStatus(id): Promise<{ enabled: boolean; password_stored?: boolean; client_password_stored?: boolean }>`; query key `['admin-event-password-status', eventId]` (the key `ShareLinkCard` already uses).

- [ ] **Step 1: Add the strings.** Spec `events.access`:

```json
{
  "path": "events.access",
  "en": {
    "currentPassword": "Current password", "notViewable": "Set, not viewable", "notViewableHelp": "Only a hash is stored for this password. Set a new one to see it here later.",
    "show": "Show", "hide": "Hide", "copy": "Copy", "copied": "Copied", "regenerate": "Regenerate",
    "newPassword": "New password", "newPasswordKeep": "New password (leave empty to keep the current one)", "galleryPassword": "Gallery password",
    "turnOffTitle": "Remove the password?", "turnOffMessage": "This gallery is published. Without a password, anyone with the link can see the photos.", "turnOffConfirm": "Remove password"
  },
  "de": {
    "currentPassword": "Aktuelles Passwort", "notViewable": "Gesetzt, nicht einsehbar", "notViewableHelp": "Für dieses Passwort ist nur ein Hash gespeichert. Setz ein neues, um es hier später zu sehen.",
    "show": "Anzeigen", "hide": "Verbergen", "copy": "Kopieren", "copied": "Kopiert", "regenerate": "Neu erzeugen",
    "newPassword": "Neues Passwort", "newPasswordKeep": "Neues Passwort (leer lassen, um das aktuelle zu behalten)", "galleryPassword": "Galerie-Passwort",
    "turnOffTitle": "Passwort entfernen?", "turnOffMessage": "Diese Galerie ist veröffentlicht. Ohne Passwort kann jeder mit dem Link die Fotos sehen.", "turnOffConfirm": "Passwort entfernen"
  },
  "vi": {
    "currentPassword": "Mật khẩu hiện tại", "notViewable": "Đã đặt, không xem được", "notViewableHelp": "Mật khẩu này chỉ lưu dạng băm. Đặt mật khẩu mới để sau này xem được ở đây.",
    "show": "Hiện", "hide": "Ẩn", "copy": "Sao chép", "copied": "Đã sao chép", "regenerate": "Tạo lại",
    "newPassword": "Mật khẩu mới", "newPasswordKeep": "Mật khẩu mới (để trống để giữ mật khẩu hiện tại)", "galleryPassword": "Mật khẩu gallery",
    "turnOffTitle": "Bỏ mật khẩu?", "turnOffMessage": "Gallery này đã công khai. Không có mật khẩu thì ai có đường dẫn cũng xem được ảnh.", "turnOffConfirm": "Bỏ mật khẩu"
  }
}
```

- [ ] **Step 2: Write the failing tests.** Create `frontend/src/utils/__tests__/nextEventPassword.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nextEventPassword } from '../passwordGenerator';

describe('nextEventPassword (ruling 5)', () => {
  it('gives a different password on each regenerate', () => {
    const first = nextEventPassword('Lakeside Wedding', '2026-08-15');
    const second = nextEventPassword('Lakeside Wedding', '2026-08-15', first);
    expect(first.length).toBeGreaterThanOrEqual(6);
    expect(second).not.toBe(first);
  });
});
```

Create `settings/__tests__/AccessSection.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { ConfirmDialogProvider } from '../../../../../components/common/ConfirmDialog';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k), i18n: { language: 'en' } }),
}));
const status = vi.fn();
const reveal = vi.fn();
vi.mock('../../../../../services/events.service', () => ({
  eventsService: {
    getGalleryPasswordStatus: (...a: unknown[]) => status(...a),
    getGalleryPassword: (...a: unknown[]) => reveal(...a),
  },
}));
vi.mock('../../ClientAccessCard', () => ({ ClientAccessCard: () => null }));

import { EventSettingsContext } from '../EventSettingsContext';
import { AccessSection } from '../AccessSection';

const form = { require_password: true, new_password: '', client_access_enabled: false, client_password: '' };

function renderSection(over: { event?: object; editForm?: object; setEditForm?: ReturnType<typeof vi.fn> } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConfirmDialogProvider>
        <EventSettingsContext.Provider value={{
          event: { id: 7, event_name: 'Lakeside Wedding', event_date: '2026-08-15', require_password: 1, is_draft: 0, ...over.event } as never,
          editForm: { ...form, ...over.editForm } as never, setEditForm: over.setEditForm ?? vi.fn(),
          refetchEvent: vi.fn(), expert: false, readOnly: false,
        } as never}><AccessSection /></EventSettingsContext.Provider>
      </ConfirmDialogProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => { vi.clearAllMocks(); status.mockResolvedValue({ enabled: true, password_stored: true, client_password_stored: false }); });

it('shows a stored password only on request', async () => {
  reveal.mockResolvedValue({ enabled: true, password: 'Sunset-42!', client_password: null });
  renderSection();
  await userEvent.click(await screen.findByRole('button', { name: 'Show' }));
  expect(await screen.findByText('Sunset-42!')).toBeInTheDocument();
  expect(reveal).toHaveBeenCalledTimes(1);
});

it('says "Set, not viewable" when no copy is stored, and never reads the secret on open', async () => {
  status.mockResolvedValue({ enabled: false, password_stored: false, client_password_stored: false });
  renderSection();
  expect(await screen.findByText('Set, not viewable')).toBeInTheDocument();
  expect(reveal).not.toHaveBeenCalled();
});

it('has no confirm field, and Regenerate writes a new password into the draft', async () => {
  const setEditForm = vi.fn();
  renderSection({ setEditForm });
  expect(screen.queryByText('Confirm Password')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
  const next = setEditForm.mock.calls[0][0](form);
  expect(next.new_password.length).toBeGreaterThanOrEqual(6);
});

it('asks before removing the password of a published gallery, and Cancel changes nothing', async () => {
  const setEditForm = vi.fn();
  renderSection({ setEditForm });
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(await screen.findByRole('button', { name: /Cancel/ }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(setEditForm).not.toHaveBeenCalled();
});

it('removes the password of a draft gallery without asking', async () => {
  const setEditForm = vi.fn();
  renderSection({ setEditForm, event: { is_draft: 1 } });
  await userEvent.click(screen.getByRole('checkbox'));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(setEditForm.mock.calls[0][0](form)).toMatchObject({ require_password: false, new_password: '' });
});

it('generates a password when protection is switched on', async () => {
  const setEditForm = vi.fn();
  renderSection({ setEditForm, event: { require_password: 0 }, editForm: { require_password: false } });
  await userEvent.click(screen.getByRole('checkbox'));
  const next = setEditForm.mock.calls[0][0]({ ...form, require_password: false });
  expect(next.require_password).toBe(true);
  expect(next.new_password.length).toBeGreaterThanOrEqual(6);
});
```

The cancel button's accessible name comes from `ConfirmDialog`; read it and match its default label if it is not "Cancel". In `draft/__tests__/saveDraft.test.ts`, delete the password mismatch case and every `confirm_new_password` key; keep the min length and `newPasswordRequired` cases.

- [ ] **Step 3: Run them to verify they fail.** `npx vitest run src/utils/__tests__/nextEventPassword.test.ts src/pages/admin/event-details`. Expected: FAIL (no `nextEventPassword`, no Show button, confirm field present).

- [ ] **Step 4: Implement the helper and the stored line.** Append to `passwordGenerator.ts`:

```ts
/**
 * The next suggestion for a Regenerate button (P4, ruling 5). The moderate
 * form is deterministic, so cycling through the suggestions is what makes a
 * second press give a different password.
 */
export function nextEventPassword(eventName: string, eventDate: string, current = ''): string {
  const list = [...new Set(generatePasswordSuggestions({ eventName, eventDate }))];
  const at = list.indexOf(current);
  return list[(at + 1) % list.length];
}
```

Create `settings/StoredPasswordLine.tsx`:

```tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { eventsService } from '../../../../services/events.service';

/**
 * The saved password, as far as it can be shown (spec 5.4, ruling 2): a
 * stored copy is revealed on request and each reveal is logged by the server;
 * without one the line says it is set but not viewable.
 */
export const StoredPasswordLine: React.FC<{ eventId: number; kind: 'gallery' | 'client'; stored: boolean }> = ({ eventId, kind, stored }) => {
  const { t } = useTranslation();
  const [value, setValue] = useState<string | null>(null);
  const reveal = async () => {
    try {
      const res = await eventsService.getGalleryPassword(eventId);
      setValue((kind === 'gallery' ? res.password : res.client_password) ?? null);
    } catch {
      toast.error(t('events.failedToLoadPassword', 'Failed to load the stored password'));
    }
  };
  return (
    <div className="text-sm">
      <span className="font-medium text-body">{t('events.access.currentPassword', 'Current password')}: </span>
      {!stored && (
        <span className="text-muted" title={t('events.access.notViewableHelp', 'Only a hash is stored for this password. Set a new one to see it here later.')}>
          {t('events.access.notViewable', 'Set, not viewable')}
        </span>
      )}
      {stored && value === null && (
        <button type="button" className="text-accent font-medium" onClick={reveal}>{t('events.access.show', 'Show')}</button>
      )}
      {stored && value !== null && (
        <span className="inline-flex items-center gap-2">
          <code className="font-mono text-heading">{value}</code>
          <button type="button" className="text-accent" onClick={() => { void navigator.clipboard?.writeText(value); toast.success(t('events.access.copied', 'Copied')); }}>
            {t('events.access.copy', 'Copy')}
          </button>
          <button type="button" className="text-accent" onClick={() => setValue(null)}>{t('events.access.hide', 'Hide')}</button>
        </span>
      )}
    </div>
  );
};
```

Check the return type of `eventsService.getGalleryPassword` and adjust the field reads to it. Update `getGalleryPasswordStatus`'s declared return type to `Promise<{ enabled: boolean; password_stored?: boolean; client_password_stored?: boolean }>`, and add `has_client_password?: boolean;` to the `Event` type next to `client_access_enabled`.

- [ ] **Step 5: Implement the section and drop the confirm field.** Rewrite `AccessSection.tsx`:

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Card, Input, useConfirm } from '../../../../components/common';
import { eventsService } from '../../../../services/events.service';
import { normalizeRequirePassword } from '../../../../utils/accessControl';
import { nextEventPassword } from '../../../../utils/passwordGenerator';
import { ClientAccessCard } from '../ClientAccessCard';
import { StoredPasswordLine } from './StoredPasswordLine';
import { useEventSettings } from './EventSettingsContext';

/**
 * Settings > Access (spec 5.4). The password is shown the way it is stored,
 * regenerated or typed in clear, with no confirm field. Removing it from a
 * published gallery asks first, at the toggle.
 */
export const AccessSection: React.FC = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { event, editForm, setEditForm, refetchEvent } = useEventSettings();
  const savedOn = normalizeRequirePassword(event.require_password);
  const published = !event.is_draft;
  const { data: status } = useQuery({
    queryKey: ['admin-event-password-status', event.id],
    queryFn: () => eventsService.getGalleryPasswordStatus(event.id),
    enabled: savedOn,
  });
  const generate = (current = '') => nextEventPassword(event.event_name, event.event_date || '', current);

  const onToggle = async (checked: boolean) => {
    if (!checked && savedOn && published) {
      const ok = await confirm({
        title: t('events.access.turnOffTitle', 'Remove the password?'),
        message: t('events.access.turnOffMessage', 'This gallery is published. Without a password, anyone with the link can see the photos.'),
        confirmLabel: t('events.access.turnOffConfirm', 'Remove password'),
        variant: 'danger',
      });
      if (!ok) return;
    }
    setEditForm(prev => ({
      ...prev,
      require_password: checked,
      // Switching protection on is the user's own action: start with a
      // generated password (ruling 5). Off forgets a typed one.
      new_password: checked ? (prev.new_password || (savedOn ? '' : generate())) : '',
    }));
  };

  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4">{t('events.settings.sectionAccess', 'Access')}</h2>
      <div className="space-y-4">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1 w-4 h-4 text-accent border-line-strong rounded focus:ring-primary-500"
            checked={editForm.require_password}
            onChange={(e) => { void onToggle(e.target.checked); }}
          />
          <span>
            <span className="text-sm font-medium text-body">{t('events.requirePasswordToggle')}</span>
            <span className="block text-xs text-muted mt-1">
              {t('events.requirePasswordToggleHelp', 'Disable this if you want to share the gallery without a password. Anyone with the link will be able to view the photos.')}
            </span>
          </span>
        </label>

        {!editForm.require_password && (
          <div className="rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/30 p-3 text-xs text-orange-800 dark:text-orange-300">
            {t('events.publicGalleryWarning', 'Public galleries are accessible to anyone with the link. Consider watermarking downloaded files in Branding and monitoring activity.')}
          </div>
        )}

        {editForm.require_password && (
          <div className="space-y-2">
            {savedOn && <StoredPasswordLine eventId={event.id} kind="gallery" stored={status?.password_stored === true} />}
            <Input
              type="text"
              label={savedOn
                ? t('events.access.newPasswordKeep', 'New password (leave empty to keep the current one)')
                : t('events.access.galleryPassword', 'Gallery password')}
              value={editForm.new_password}
              onChange={(e) => setEditForm(prev => ({ ...prev, new_password: e.target.value }))}
              placeholder={t('events.enterPassword')}
            />
            <button
              type="button"
              className="text-sm font-medium text-accent"
              onClick={() => setEditForm(prev => ({ ...prev, new_password: generate(prev.new_password) }))}
            >
              {t('events.access.regenerate', 'Regenerate')}
            </button>
          </div>
        )}
      </div>
      <div className="mt-6">
        <ClientAccessCard event={event} refetchEvent={refetchEvent} mode="settings" editForm={editForm} setEditForm={setEditForm} />
      </div>
    </Card>
  );
};
```

If `useConfirm` is not re-exported from `components/common`'s index, import it from `../../../../components/common/ConfirmDialog`. Remove `confirm_new_password` from `EditFormState`, `INITIAL_EDIT_FORM`, `eventFormValues`, the access list in `sectionFields.ts`, and `saveDraft.ts` (the `case 'confirm_new_password'` line, the `touchesPassword` list, and the mismatch check), and from the `EventSettingsTab.test.tsx` fixture. In `EventDetailsPage.tsx` `handleSave`, next to the `['admin-event', id]` invalidation, add `queryClient.invalidateQueries({ queryKey: ['admin-event-password-status', event.id] });`. Delete `PasswordResetModal.tsx` and its line in `components/admin/index.ts`:

```bash
# Xoá hộp thoại đặt lại mật khẩu không còn ai dùng
git rm frontend/src/components/admin/PasswordResetModal.tsx
```

- [ ] **Step 6: Run the tests to verify they pass.** `npx vitest run src/utils src/pages/admin/event-details src/pages/admin/__tests__/eventSettingsSaveModel.test.tsx`, then `rg -n "confirm_new_password|PasswordResetModal" frontend/src`: only the comment in `components/common/ConfirmDialog.tsx` may remain. Expected: all PASS.

- [ ] **Step 7: Commit.**

```bash
git add frontend/src
git commit -q -m "feat(events): show the stored gallery password in Settings > Access"
```

---

### Task 9: The client password gets the same treatment

**Files:**
- Modify: `frontend/src/pages/admin/event-details/ClientAccessCard.tsx` (settings mode)
- Modify: `frontend/src/pages/admin/event-details/draft/saveDraft.ts` (`validateDraft` gains a context argument)
- Modify: `frontend/src/pages/admin/EventDetailsPage.tsx` (pass the context to `validateDraft`)
- Modify: `frontend/src/pages/admin/event-details/__tests__/ClientAccessCard.password.test.tsx`
- Modify: `frontend/src/pages/admin/event-details/draft/__tests__/saveDraft.test.ts`
- Modify: `frontend/src/i18n/locales/{en,de,vi}.json`

**Interfaces:**
- Consumes: `StoredPasswordLine`, `nextEventPassword`, the password status query key (Task 8); `event.has_client_password` (Task 2).
- Produces: `validateDraft(changed, form, server, context?: { hasClientPassword: boolean })` returning `{ key: 'clientAccess.passwordRequiredOn', ... }` when client access would be saved as on with no password.

- [ ] **Step 1: Add the strings.** Spec `clientAccess`:

```json
{
  "path": "clientAccess",
  "en": { "noPasswordSet": "No client password set. The client cannot open the review page until one is set.", "generate": "Generate", "newPasswordKeep": "New client password (leave empty to keep the current one)", "passwordRequiredOn": "Set a client password before turning client access on." },
  "de": { "noPasswordSet": "Kein Kunden-Passwort gesetzt. Der Kunde kann die Auswahlseite erst öffnen, wenn eins gesetzt ist.", "generate": "Erzeugen", "newPasswordKeep": "Neues Kunden-Passwort (leer lassen, um das aktuelle zu behalten)", "passwordRequiredOn": "Setz ein Kunden-Passwort, bevor du den Kundenzugang einschaltest." },
  "vi": { "noPasswordSet": "Chưa đặt mật khẩu khách hàng. Khách chưa mở được trang duyệt ảnh cho tới khi có mật khẩu.", "generate": "Tạo", "newPasswordKeep": "Mật khẩu khách hàng mới (để trống để giữ mật khẩu hiện tại)", "passwordRequiredOn": "Đặt mật khẩu khách hàng trước khi bật quyền truy cập cho khách hàng." }
}
```

- [ ] **Step 2: Write the failing tests.** In `saveDraft.test.ts`, add:

```ts
  it('refuses client access on without a client password, only when client access is part of the change', () => {
    const on = { ...serverForm, client_access_enabled: true, client_password: '' };
    expect(validateDraft(new Set(['client_access_enabled']), on, serverForm, { hasClientPassword: false })?.key).toBe('clientAccess.passwordRequiredOn');
    expect(validateDraft(new Set(['client_access_enabled']), on, serverForm, { hasClientPassword: true })).toBeNull();
    expect(validateDraft(new Set(['customer_name']), on, serverForm, { hasClientPassword: false })).toBeNull();
  });
```

In `ClientAccessCard.password.test.tsx`, wrap renders of settings mode in a `QueryClientProvider`, mock `getGalleryPasswordStatus` and `getGalleryPassword` on the existing `eventsService` mock, and add:

```tsx
it('says no client password is set for an event already on without one, and Generate fills one', async () => {
  const setEditForm = vi.fn();
  renderSettings({ event: { client_access_enabled: 1, has_client_password: false }, editForm: { client_access_enabled: true, client_password: '' }, setEditForm });
  expect(screen.getByText(/No client password set/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
  expect(setEditForm.mock.calls[0][0]({ client_access_enabled: true, client_password: '' }).client_password.length).toBeGreaterThanOrEqual(6);
});

it('shows the stored client password on request when one is set', async () => {
  status.mockResolvedValue({ enabled: true, password_stored: false, client_password_stored: true });
  reveal.mockResolvedValue({ enabled: true, password: null, client_password: '7788aa' });
  renderSettings({ event: { client_access_enabled: 1, has_client_password: true }, editForm: { client_access_enabled: true, client_password: '' } });
  await userEvent.click(await screen.findByRole('button', { name: 'Show' }));
  expect(await screen.findByText('7788aa')).toBeInTheDocument();
});

it('generates a client password when client access is switched on', async () => {
  const setEditForm = vi.fn();
  renderSettings({ event: { client_access_enabled: 0, has_client_password: false }, editForm: { client_access_enabled: false, client_password: '' }, setEditForm });
  await userEvent.click(screen.getByRole('checkbox'));
  const next = setEditForm.mock.calls[0][0]({ client_access_enabled: false, client_password: '' });
  expect(next.client_access_enabled).toBe(true);
  expect(next.client_password.length).toBeGreaterThanOrEqual(6);
});
```

`renderSettings`, `status` and `reveal` are helpers to add in the file's own style; keep the existing cases, updating any that relied on the `PasswordGenerator` popover.

- [ ] **Step 3: Run them to verify they fail.** `npx vitest run src/pages/admin/event-details`. Expected: FAIL.

- [ ] **Step 4: Implement.** In `validateDraft`, add the fourth parameter `context: { hasClientPassword: boolean } = { hasClientPassword: true }` and, before the external folder check:

```ts
  // Spec 5.4: client access is not saved as on without a way in. Checked only
  // when client access is part of the change (ruling 6).
  const touchesClient = changed.has('client_access_enabled') || changed.has('client_password');
  if (touchesClient && form.client_access_enabled && !candidate && !context.hasClientPassword) {
    return { key: 'clientAccess.passwordRequiredOn', fallback: 'Set a client password before turning client access on.' };
  }
```

In `EventDetailsPage.tsx`, call `validateDraft(changed, editForm, serverForm, { hasClientPassword: event.has_client_password === true })`. In `ClientAccessCard.tsx` settings mode: read the status with `useQuery({ queryKey: ['admin-event-password-status', event.id], queryFn: () => eventsService.getGalleryPasswordStatus(event.id) })` at the top of the component (hooks run before the mode branch); the switch's handler becomes

```tsx
                const on = e.target.checked;
                const savedOn = !!event.client_access_enabled;
                // On is the user's own action: start with a generated password
                // when none exists yet (ruling 5). Off forgets a typed one.
                setEditForm((prev) => ({
                  ...prev,
                  client_access_enabled: on,
                  client_password: on
                    ? (prev.client_password || (savedOn && event.has_client_password ? '' : nextEventPassword(event.event_name, event.event_date || '')))
                    : '',
                }));
```

and the block shown while on becomes:

```tsx
          {editForm.client_access_enabled && (
            <div className="space-y-2">
              {!!event.client_access_enabled && !event.has_client_password && (
                <p className="rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/30 p-3 text-xs text-orange-800 dark:text-orange-300">
                  {t('clientAccess.noPasswordSet', 'No client password set. The client cannot open the review page until one is set.')}
                </p>
              )}
              {event.has_client_password && (
                <StoredPasswordLine eventId={event.id} kind="client" stored={status?.client_password_stored === true} />
              )}
              <label className="block text-sm font-medium text-body mb-1">
                {event.has_client_password ? t('clientAccess.newPasswordKeep', 'New client password (leave empty to keep the current one)') : t('clientAccess.passwordLabel')}
              </label>
              <input
                type="text"
                value={editForm.client_password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('clientAccess.passwordPlaceholder')}
                className="w-full px-3 py-2 bg-inset border border-line-strong text-heading rounded-lg text-sm"
              />
              <p className="text-xs text-muted">{t('clientAccess.passwordHelperText')}</p>
              <button type="button" className="text-sm font-medium text-accent"
                onClick={() => setPassword(nextEventPassword(event.event_name, event.event_date || '', editForm.client_password))}>
                {t('clientAccess.generate', 'Generate')}
              </button>
            </div>
          )}
```

Import `StoredPasswordLine` from `./settings/StoredPasswordLine`, `nextEventPassword` from `../../../utils/passwordGenerator`, `useQuery` from `@tanstack/react-query`; drop the `PasswordGenerator` import if unused.

- [ ] **Step 5: Run the tests to verify they pass.** `npx vitest run src/pages/admin/event-details src/pages/admin/__tests__/eventSettingsSaveModel.test.tsx`. Expected: all PASS.

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/pages/admin frontend/src/i18n/locales
git commit -q -m "feat(events): show and require the client password in Settings > Access"
```

---

### Task 10: Publish and send-email rely on the stored password

**Files:**
- Modify: `frontend/src/components/admin/PublishGalleryDialog.tsx`, `frontend/src/components/admin/SendGalleryEmailDialog.tsx` (prop `storedPassword`)
- Modify: `frontend/src/pages/admin/EventDetailsPage.tsx` (read the status, pass the prop)
- Create: `frontend/src/components/admin/__tests__/galleryMailDialogs.storedPassword.test.tsx`
- Modify: `frontend/src/i18n/locales/{en,de,vi}.json`

**Interfaces:**
- Consumes: `password_stored` from the password status (Task 2), the fallback in publish and send (Task 2).
- Produces: `PublishGalleryDialog` and `SendGalleryEmailDialog` prop `storedPassword?: boolean`.

- [ ] **Step 1: Add the strings.** Spec `events.mailPassword`:

```json
{
  "path": "events.mailPassword",
  "en": { "storedNote": "The email includes the stored gallery password.", "useDifferent": "Use a different password", "useStored": "Use the stored password" },
  "de": { "storedNote": "Die E-Mail enthält das gespeicherte Galerie-Passwort.", "useDifferent": "Anderes Passwort verwenden", "useStored": "Gespeichertes Passwort verwenden" },
  "vi": { "storedNote": "Email sẽ kèm mật khẩu gallery đã lưu.", "useDifferent": "Dùng mật khẩu khác", "useStored": "Dùng mật khẩu đã lưu" }
}
```

- [ ] **Step 2: Write the failing test.** Create `components/admin/__tests__/galleryMailDialogs.storedPassword.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : (fb as { defaultValue?: string })?.defaultValue ?? k), i18n: { language: 'en' } }),
}));

import { PublishGalleryDialog } from '../PublishGalleryDialog';
import { SendGalleryEmailDialog } from '../SendGalleryEmailDialog';

describe('gallery mail dialogs with a stored password (P4, ruling 1)', () => {
  it('publish asks for nothing when a copy is stored, and sends no password', async () => {
    const onConfirm = vi.fn();
    render(<PublishGalleryDialog eventName="E" requirePassword customerEmail="c@example.com" storedPassword isPublishing={false} onConfirm={onConfirm} onClose={vi.fn()} />);
    expect(screen.getByText('The email includes the stored gallery password.')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Enter the gallery password')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Publish/ }));
    expect(onConfirm).toHaveBeenCalledWith(undefined, true);
  });

  it('publish still asks when no copy is stored', async () => {
    const onConfirm = vi.fn();
    render(<PublishGalleryDialog eventName="E" requirePassword customerEmail="c@example.com" storedPassword={false} isPublishing={false} onConfirm={onConfirm} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('Enter the gallery password')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Publish/ }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('"Use a different password" brings the field back and sends what is typed', async () => {
    const onConfirm = vi.fn();
    render(<SendGalleryEmailDialog eventName="E" recipient="c@example.com" requirePassword storedPassword isSending={false} onConfirm={onConfirm} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use a different password' }));
    await userEvent.type(screen.getByPlaceholderText('Enter the gallery password'), 'Harbour-Light-91!');
    await userEvent.click(screen.getByRole('button', { name: /Send/ }));
    expect(onConfirm).toHaveBeenCalledWith('Harbour-Light-91!');
  });
});
```

If the confirm buttons' names differ, read the dialogs and match them.

- [ ] **Step 3: Run it to verify it fails.** `npx vitest run src/components/admin/__tests__/galleryMailDialogs.storedPassword.test.tsx`. Expected: FAIL.

- [ ] **Step 4: Implement.** In both dialogs add `storedPassword?: boolean` to the props and destructure it with default `false`; add `const [useDifferent, setUseDifferent] = useState(false);`. In `PublishGalleryDialog` introduce `const askPassword = needsPassword && (!storedPassword || useDifferent);`, and in `SendGalleryEmailDialog` `const askPassword = requirePassword && (!storedPassword || useDifferent);`. Replace every use of `needsPassword` (publish) or `requirePassword` (send) inside `handleSubmit` and the field's render condition with `askPassword`, and add, where the field renders:

```tsx
        {!askPassword && storedPassword && (needsPassword /* send: requirePassword */) && (
          <div className="mb-4 text-sm text-body">
            <p>{t('events.mailPassword.storedNote', 'The email includes the stored gallery password.')}</p>
            <button type="button" className="mt-1 text-accent font-medium" onClick={() => setUseDifferent(true)}>
              {t('events.mailPassword.useDifferent', 'Use a different password')}
            </button>
          </div>
        )}
```

(use `requirePassword` in the send dialog's condition, and drop the inline comment). Inside the field block add a "Use the stored password" button, shown only when `storedPassword`, that calls `setUseDifferent(false)`. Update each dialog's doc comment: with a stored copy the server fills the password (ruling 1). In `EventDetailsPage.tsx`, add

```tsx
  const { data: passwordStatus } = useQuery({
    queryKey: ['admin-event-password-status', event?.id],
    queryFn: () => eventsService.getGalleryPasswordStatus(event!.id),
    enabled: !!event,
  });
```

and pass `storedPassword={passwordStatus?.password_stored === true}` to both dialogs. The page test mocks `getGalleryPasswordStatus`; it keeps working.

- [ ] **Step 5: Run the tests to verify they pass.** `npx vitest run src/components/admin src/pages/admin/__tests__`. Expected: all PASS.

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/components/admin frontend/src/pages/admin/EventDetailsPage.tsx frontend/src/i18n/locales
git commit -q -m "feat(events): send the stored password from the publish and email dialogs"
```

---

### Task 11: Banners inherit until opened

**Files:**
- Create: `frontend/src/pages/admin/event-details/settings/BannerOverride.tsx`
- Create: `frontend/src/pages/admin/event-details/settings/__tests__/BannerOverride.test.tsx`
- Modify: `frontend/src/pages/admin/event-details/settings/AppearanceSection.tsx` (the two banner blocks)
- Modify: `frontend/src/i18n/locales/{en,de,vi}.json`

**Interfaces:**
- Produces: `<BannerOverride title help mode markdown globalMarkdown placeholder onModeChange={(m: 'inherit' | 'custom' | 'off') => void} onMarkdownChange={(s: string) => void} />`.

- [ ] **Step 1: Add the strings.** Spec `events.bannerOverride`:

```json
{
  "path": "events.bannerOverride",
  "en": { "usesGlobal": "Uses the banner from Branding.", "noGlobal": "No banner is set in Branding, so none shows.", "override": "Override for this event", "backToGlobal": "Use the Branding banner again" },
  "de": { "usesGlobal": "Verwendet das Banner aus dem Branding.", "noGlobal": "Im Branding ist kein Banner gesetzt, daher erscheint keins.", "override": "Für dieses Event überschreiben", "backToGlobal": "Wieder das Branding-Banner verwenden" },
  "vi": { "usesGlobal": "Dùng banner trong phần Branding.", "noGlobal": "Branding chưa đặt banner nên không có banner nào hiện.", "override": "Ghi đè cho sự kiện này", "backToGlobal": "Dùng lại banner trong Branding" }
}
```

- [ ] **Step 2: Write the failing test.** Create `settings/__tests__/BannerOverride.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k), i18n: { language: 'en' } }),
}));

import { BannerOverride } from '../BannerOverride';

const props = { title: 'Info Banner', help: 'help', placeholder: 'p', globalMarkdown: 'Global **note**' };

it('shows the global text read-only while inheriting', () => {
  render(<BannerOverride {...props} mode="inherit" markdown="" onModeChange={vi.fn()} onMarkdownChange={vi.fn()} />);
  expect(screen.getByText('Uses the banner from Branding.')).toBeInTheDocument();
  expect(screen.getByText('note')).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).toBeNull();
});

it('opening switches to a custom banner, and going back returns to inherit', async () => {
  const onModeChange = vi.fn();
  const { rerender } = render(<BannerOverride {...props} mode="inherit" markdown="" onModeChange={onModeChange} onMarkdownChange={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Override for this event' }));
  expect(onModeChange).toHaveBeenLastCalledWith('custom');
  rerender(<BannerOverride {...props} mode="custom" markdown="" onModeChange={onModeChange} onMarkdownChange={vi.fn()} />);
  expect(screen.getByRole('textbox')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Use the Branding banner again' }));
  expect(onModeChange).toHaveBeenLastCalledWith('inherit');
});

it('opens expanded when the event already overrides, and says when Branding has no banner', () => {
  render(<BannerOverride {...props} globalMarkdown="" mode="off" markdown="" onModeChange={vi.fn()} onMarkdownChange={vi.fn()} />);
  expect(screen.getByRole('radio', { name: /Off/ })).toBeChecked();
});
```

- [ ] **Step 3: Run it to verify it fails.** `npx vitest run src/pages/admin/event-details/settings/__tests__/BannerOverride.test.tsx`. Expected: module missing.

- [ ] **Step 4: Implement.** Create `settings/BannerOverride.tsx`:

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { MarkdownContent } from '../../../../components/common/MarkdownContent';

type Mode = 'inherit' | 'custom' | 'off';

/**
 * A gallery banner that follows Branding until the event overrides it
 * (spec 6 P4, ruling 16). Inherit shows the global text read-only; opening
 * switches to a custom banner; "use Branding again" returns to inherit.
 */
export const BannerOverride: React.FC<{
  title: string; help: string; placeholder: string; globalMarkdown: string;
  mode: Mode; markdown: string;
  onModeChange: (mode: Mode) => void; onMarkdownChange: (markdown: string) => void;
}> = ({ title, help, placeholder, globalMarkdown, mode, markdown, onModeChange, onMarkdownChange }) => {
  const { t } = useTranslation();
  const prose = 'prose prose-sm dark:prose-invert max-w-none text-sm text-body';
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-heading">{title}</h3>
      {mode === 'inherit' ? (
        <div className="rounded-lg border border-line p-3 space-y-2">
          <p className="text-xs text-muted">
            {globalMarkdown.trim()
              ? t('events.bannerOverride.usesGlobal', 'Uses the banner from Branding.')
              : t('events.bannerOverride.noGlobal', 'No banner is set in Branding, so none shows.')}
          </p>
          {globalMarkdown.trim() && <MarkdownContent source={globalMarkdown} className={prose} />}
          <button type="button" className="text-sm font-medium text-accent" onClick={() => onModeChange('custom')}>
            {t('events.bannerOverride.override', 'Override for this event')}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted">{help}</p>
          {(['custom', 'off'] as const).map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm text-body">
              <input type="radio" checked={mode === m} onChange={() => onModeChange(m)} />
              {m === 'custom'
                ? t('events.promoBanner.mode_custom', 'Custom override for this event')
                : t('events.promoBanner.mode_off', 'Off (hide for this event)')}
            </label>
          ))}
          {mode === 'custom' && (
            <>
              <textarea
                value={markdown}
                onChange={(e) => onMarkdownChange(e.target.value)}
                rows={3}
                placeholder={placeholder}
                className="w-full px-3 py-2 border border-line-strong bg-panel text-heading rounded-lg text-sm"
              />
              {markdown.trim() && <MarkdownContent source={markdown} className={prose} />}
            </>
          )}
          <button type="button" className="text-sm font-medium text-accent" onClick={() => onModeChange('inherit')}>
            {t('events.bannerOverride.backToGlobal', 'Use the Branding banner again')}
          </button>
        </div>
      )}
    </div>
  );
};
```

Check the import path and props of `MarkdownContent` against its current use in `AppearanceSection.tsx` and match them. In `AppearanceSection.tsx`, read `const { data: publicSettings } = usePublicSettings();` and replace each of the two banner blocks with:

```tsx
          <BannerOverride
            title={t('events.promoBanner.title', 'Promotional Banner')}
            help={t('events.promoBanner.help', 'Choose how this gallery handles the promotional banner. "Inherit" uses your global default; "Custom" overrides it for this event; "Off" hides it entirely.')}
            placeholder={t('events.promoBanner.placeholder', 'Markdown content (e.g. **Special offer:** [book your next session](https://example.com))')}
            globalMarkdown={publicSettings?.branding_promo_markdown ?? ''}
            mode={editForm.promo_mode}
            markdown={editForm.promo_markdown}
            onModeChange={(promo_mode) => setEditForm(prev => ({ ...prev, promo_mode }))}
            onMarkdownChange={(promo_markdown) => setEditForm(prev => ({ ...prev, promo_markdown }))}
          />
```

and the same for the info banner with `events.infoBanner.*`, `branding_info_markdown`, `info_mode` and `info_markdown`. The field names stay literal in the section source, which the inventory test needs.

- [ ] **Step 5: Run the tests to verify they pass.** `npx vitest run src/pages/admin/event-details`. Expected: all PASS.

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/pages/admin/event-details/settings frontend/src/i18n/locales
git commit -q -m "feat(events): let gallery banners follow Branding until overridden"
```

---

### Task 12: Appearance puts the preset and the hero photo first

**Files:**
- Create: `frontend/src/pages/admin/event-details/settings/ThemePresetPicker.tsx`
- Modify: `frontend/src/components/admin/ThemeCustomizerEnhanced.tsx` (prop `hidePresets`)
- Modify: `frontend/src/pages/admin/event-details/EventThemeSection.tsx` (pass `hidePresets`)
- Modify: `frontend/src/pages/admin/event-details/settings/AppearanceSection.tsx` (layout)
- Modify: `frontend/src/pages/admin/event-details/settings/__tests__/AppearanceSection.test.tsx`

**Interfaces:**
- Consumes: `theme`, `setTheme` from the context; `BannerOverride` (Task 11).
- Produces: `<ThemePresetPicker theme setTheme />`; `ThemeCustomizerEnhanced` prop `hidePresets?: boolean` (default false).

- [ ] **Step 1: Write the failing tests.** In `AppearanceSection.test.tsx`, make the context's `expert` overridable, keep the existing assertions under `expert: true`, and add:

```tsx
it('shows the preset picker and the hero photo without advanced options, and the full customizer only inside them', async () => {
  const setTheme = vi.fn();
  renderSection({ expert: false, setTheme });
  expect(screen.getByText('hero picker')).toBeInTheDocument();
  expect(screen.queryByText('customizer')).toBeNull();
  await userEvent.click(screen.getByText(GALLERY_THEME_PRESETS.birthdayFun.name));
  expect(setTheme.mock.calls[0][0]({})).toEqual({ config: GALLERY_THEME_PRESETS.birthdayFun.config, preset: 'birthdayFun' });
  await userEvent.click(screen.getByRole('button', { name: 'Show advanced options' }));
  expect(screen.getByText('customizer')).toBeInTheDocument();
  expect(themeProps).toMatchObject({ hidePresets: true });
});
```

Import `GALLERY_THEME_PRESETS` from `../../../../../types/theme.types` and `userEvent`. If the preset card's clickable element is not the name text, click its button by role instead; read `ThemePresetsCard.tsx` first. The existing mock of `ThemeCustomizerEnhanced` must capture `hidePresets` through `themeProps`.

- [ ] **Step 2: Run it to verify it fails.** `npx vitest run src/pages/admin/event-details/settings/__tests__/AppearanceSection.test.tsx`. Expected: FAIL (the customizer shows without advanced options; no preset picker).

- [ ] **Step 3: Implement.** In `ThemeCustomizerEnhanced.tsx`, add `hidePresets?: boolean;` to the props interface (with a one-line doc: "The event page shows the presets on their own (P4)"), destructure it with default `false`, and wrap the `<ThemePresetsCard .../>` element in `{!hidePresets && (...)}`. In `EventThemeSection.tsx`, pass `hidePresets` to `ThemeCustomizerEnhanced`. Create `settings/ThemePresetPicker.tsx`:

```tsx
import React from 'react';
import { ThemePresetsCard } from '../../../../components/admin/theme-customizer/ThemePresetsCard';
import { GALLERY_THEME_PRESETS } from '../../../../types/theme.types';
import type { ThemeDraft } from '../types';

/**
 * The theme preset on its own, the everyday Appearance control (spec 5.1).
 * Picking one sets the preset's look, as the full customizer does.
 */
export const ThemePresetPicker: React.FC<{ theme: ThemeDraft; setTheme: (fn: (current: ThemeDraft) => ThemeDraft) => void }> = ({ theme, setTheme }) => (
  <ThemePresetsCard
    selectedPreset={theme.preset}
    handlePresetSelect={(presetKey) => {
      const preset = GALLERY_THEME_PRESETS[presetKey];
      if (preset) setTheme(() => ({ config: preset.config, preset: presetKey }));
    }}
    showGalleryLayouts
    isBetaLayout={false}
    isThumbnailTooSmall={false}
    thumbnailWidth={0}
    thumbnailHeight={0}
    minRecommendedThumbnailSize={0}
  />
);
```

The beta thumbnail warning never shows with `showGalleryLayouts` true, so the zeros are inert; the advanced customizer keeps the real warning. Restructure `AppearanceSection.tsx` into one card: the heading, then `<ThemePresetPicker theme={theme} setTheme={setTheme} />`, then the `HeroPhotoSelector` block, then `<AdvancedArea expert={expert}>` holding, in order, `<EventThemeSection ... />` (moved in from the second card), the crop position, the social preview switch, the hero logo select, the event logo upload, the global logo info line, and the two `BannerOverride`s. Delete the second card. Update the section's doc comment to name the always-visible pair.

- [ ] **Step 4: Run the tests to verify they pass.** `npx vitest run src/pages/admin/event-details src/pages/admin/__tests__/eventSettingsSaveModel.test.tsx src/components/admin src/pages/admin/__tests__/branding`. Expected: all PASS; the inventory test still finds `<EventThemeSection` and `<HeroPhotoSelector` in the section source.

- [ ] **Step 5: Commit.**

```bash
git add frontend/src/components/admin/ThemeCustomizerEnhanced.tsx frontend/src/pages/admin/event-details
git commit -q -m "feat(events): show the theme preset and hero photo first in Appearance"
```

---

### Task 13: Gates, the spec record, and CI

**Files:**
- Modify: `docs/superpowers/specs/2026-09-28-event-form-redesign-design.md` (a "Done" line under "P4: Section components"; section 8)

- [ ] **Step 1: Repo-wide checks.**
  - `rg -n "confirm_new_password|PasswordResetModal" frontend/src`: only the comment in `components/common/ConfirmDialog.tsx`.
  - `rg -n "Tip: Press Enter|>Preview:<" frontend/src/components/admin/WelcomeMessageEditor.tsx`: zero.
  - No em-dash or en-dash on an added line: `git diff fc8df6a6..HEAD` saved to a scratchpad file with the Write tool's help or a plain redirect, then `rg -n "^\+.*[\x{2014}\x{2013}]" <that file>` prints nothing. Two plain commands: the worktree checker refuses a pipe into git.
  - `cd frontend && npm run i18n:status`: the absent counts for `de` and `vi` are the baseline 26 and 15, not higher.

- [ ] **Step 2: The local gate.** Run `bash <handover>/gates.sh p4` with `run_in_background`, and edit nothing until it ends. Read `<handover>/p4-summary.txt`: new failures against the baselines must be none, apart from the known load flakes (`customerGroups.test.tsx`, `webhookDelivery.test.js`, `streamResponse.test.js`, `pdfRenderIsolation.test.js`), each rerun alone and green. If the memory reaper kills the gate, stop and report; do not restart it without the user's word.

- [ ] **Step 3: Record the phase in the spec.** Under `### P4: Section components`, add `Done <date>: <first P4 commit>..<last P4 commit>. Verified by the Tests workflow and the E2E smoke subset on PR #2 of the fork. Publish and send-email take the stored password on the server instead of prefilling it (operator decision 2026-09-30).` In section 8, add item 10: "Whether `security_gallery_password_recoverable` is on (O2). It is an admin switch in Settings > Security, off by default; galleries whose password was set while it was off show 'Set, not viewable' until the password is written again." Commit:

```bash
git add docs/superpowers/specs/2026-09-28-event-form-redesign-design.md
git commit -q -m "docs(spec): record P4"
```

- [ ] **Step 4: Push and watch CI.** `git push`, then find the runs PR #2 triggered with `gh run list --repo DoDucHoa/picpeak --branch worktree-event-form-redesign --limit 5` and watch the Tests run with `gh run watch <id> --repo DoDucHoa/picpeak --exit-status` in the background. Rename PR #2 to `feat(events): event form redesign, phases P-1 to P4` (REST API if the GraphQL edit fails, as in P3). Read the job logs, not only the exit code. The phase is done when Tests, E2E smoke, Schema drift, Fresh-install smoke and Docker build are green, and the final reviewer's findings are fixed or ruled.
