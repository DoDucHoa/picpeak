# P5 New Create Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the create screen from the same field components as the event page Settings tab: a short page of essentials (type, name, date, customer, password, expiry, client access, auto-approve) with everything else under "Advanced options", sensible defaults from Settings, a navigation guard, an external folder offered on create, and a "Next steps" checklist on the new event's Overview.

**Architecture:** The pieces both screens share become stateless field components under `frontend/src/pages/admin/event-details/settings/` (customer fields, photo source fields, a password field) and `frontend/src/components/admin/` (identity mode). The Settings sections keep their draft wiring and render these components; the create screen holds its own form state, because there is no saved event to diff against. Every rule that decides a value on create (defaults, validation, theme fields, payload) is a pure function in `frontend/src/pages/admin/create-event/createForm.ts` with its own tests. The backend gains one thing: create accepts the photo source, with the same `photos.upload` rule as the PUT, in a small service.

**Tech Stack:** Node/Express + knex + Joi, Jest + supertest (`bootCrmDb`); React 18, react-router 7 data router, TanStack Query, Vitest + Testing Library, i18next; Playwright.

**Spec:** `docs/superpowers/specs/2026-09-28-event-form-redesign-design.md`: 2 (goals), 3 (decisions), 3.1 (O3), 5.2 (navigation guard), 5.3, 5.4 (create half), 5.5, 5.6, 5.7 ("Custom (from Settings)"), 5.8 (create half), 5.13, section 6 "P5".

## Global Constraints

- "A normal event is created in under a minute, typing at most 6 fields (type is preselected; name, date, customer name, customer email). Everything else has a sensible default" (spec 2).
- Visible on create: "event type tiles, event name, event date, customer name, customer email, phone (when enabled), password on/off and gallery password, expiry, client access switch and client password, auto-approve download orders" (5.5).
- Advanced on create: "welcome message, photo source ..., photo limit, default photo sort, feedback mode, identity mode" (5.5).
- "Gone from create: admin email and its picker, start and end time, guest uploads and upload category, theme customizer and CSS template" (5.5). No confirm password field (spec 3).
- Theme: "the event stores no theme snapshot. It inherits Branding live (NULL `color_theme`), unless the selected type has a preset other than `default`, in which case the preset name is stored" (5.5).
- Password: "seeded from `event_default_require_password`. When on, the field starts with a generated password (type and date) shown in clear, with Copy and Regenerate; Regenerate uses the name typed so far. The value never changes unless the user asks" (5.4).
- Expiry: quick buttons "counted from today (O3)", "Preselected on create: `general_default_expiration_days`, shown as a date when it is not 30, 60 or 90", "Never is hidden on create when Settings require an expiry" (5.8).
- Feedback: "On create, the mode is seeded from the global defaults. When those map to Custom, the selector shows 'Custom (from Settings)' and the advanced controls stay collapsed" (5.7).
- "Submit creates a draft (already the default) and opens Overview with the checklist" (5.5). The guard "runs on the create screen" and "lets the page's own post-save and post-create redirects through" (5.2).
- Checklist (5.6): "1. Upload photos (photo count above 0). 2. Choose a hero photo, only when the gallery uses the hero header style. 3. Publish and send to the client (the existing publish dialog)."
- "Keeps the double-submit guard ... `createEventDoubleSubmit.test.tsx` keeps its pins" (6 P5).
- "Staff restrictions are done with permissions, never by hiding" (5.3).
- Every new user-facing string gets `en`, `de` and `vi` in the same change; German admin copy uses "du". Existing keys are never pruned.
- No em-dash (U+2014) or en-dash (U+2013) in anything written into the repo. Conventional Commits.
- `backend/jest.setup.js` keeps its `DATABASE_CLIENT` pin. Backend Jest from `backend/`, Vitest from `frontend/`. Never edit while a background test run is in flight. Git as plain single commands.
- No schema change (spec 2 non-goals): P5 adds no migration.
- Nothing is deployed in this phase (rule D5).

`<handover>` below is `C:\Users\hhoa0\AppData\Local\Temp\claude\D--Coding-picpeak\4bc44bd2-38bd-4c99-a758-355811714983\scratchpad\handover` (Git Bash: `/c/Users/hhoa0/AppData/Local/Temp/claude/D--Coding-picpeak/4bc44bd2-38bd-4c99-a758-355811714983/scratchpad/handover`). i18n keys are added with `node <handover>/addkeys.js <spec.json>`, where the spec file is written to the scratchpad with the Write tool in the shape `{ "path": "events.x", "en": {...}, "de": {...}, "vi": {...} }`.

## Rulings made while writing this plan (the spec predates them)

1. **Create shares field components, not the draft.** The Settings sections are wired to a saved event (password status queries, the quota card's event id, "changed elsewhere"), which a new event does not have. So the shared unit is the field: `CustomerFields`, `PhotoSourceFields`, `PasswordField`, `ExpiryField`, `FeedbackModeSelector`, `IdentityModeField`, `WelcomeMessageEditor`, `CustomerAccountPicker`. Each section renders the same component the create screen renders, which is what keeps the two screens from drifting (spec 1, problem 1).
2. **Defaults are computed once, when public settings, admin settings and the type catalog have each loaded or failed**, and the form mounts with them. This replaces the six one-shot effects of the old page. A failed admin settings read (a user without `settings.view`) falls back to 30 days; a failed type catalog falls back to the four built-in types, as today.
3. **Expiry is preselected even when Settings do not require one** (5.8 read literally), and Never is then one click away. The old page defaulted such installs to no expiry. The payload sends `expires_at` (a date) or `null`, never `expiration_days`.
4. **Header and divider style on create.** The server always writes `header_style` and `hero_divider_style`, and the gallery reads those columns before the theme, so they cannot "inherit". They come from the type's preset when one is stored, else from Branding's theme (public `theme_config`), as the old page did, else the server defaults.
5. **Create sends the feedback mode's six values and the identity mode only.** Color labels, require name and email, moderate comments, show feedback to guests and the photo credit switch are not on the create screen and take the server's defaults, which are the values the old page sent (`backend/src/services/eventCreationService.js`).
6. **"Custom (from Settings)"** is the Custom label when the seeded type toggles match neither on-mode. Picking another mode and then Custom restores the Settings toggles, because the seeded values play the part of "saved" for `offeredModes` and `applyFeedbackMode`.
7. **The photo source is accepted from the admin create page only.** v1 and the quote and contract conversions keep managed. Asking for the watcher needs `photos.upload` (a new event has no earlier state, so it is always a transition); a folder alone does not, as on the PUT. Reference mode without a folder is a 400, and the screen refuses it first.
8. **The generated password seeds from the type's name until a name is typed**, then from the name; it never changes on its own. `PasswordField` adds Copy to Settings > Access as well, since it is the same component.
9. **The checklist reads saved data only** and shows while the event is a draft and not archived. Its Publish opens the existing publish dialog, which uses the stored password on the server (P4). A step whose permission is missing keeps its button, disabled, with the reason.
10. **The create screen is "dirty" when the form differs from its defaults.** Back and Cancel then ask; the redirect after a successful create does not.
11. **Customer accounts are sent only when some were picked**; the backend ignores the field when the portal flag is off anyway.
12. **Expert mode opens the create screen's advanced options too**: it is one per-browser switch (5.3). A validation error inside the advanced area opens it.

## Review Focus

1. **A user without `settings.view`** opens the create screen: the admin settings read fails, the page still opens, and the expiry defaults to 30 days. Pinned in Task 6.
2. **A type whose preset is unknown to this build** (renamed or removed) creates an event that inherits Branding, not one with a broken theme name. Pinned in Task 5.
3. **The name is typed after the password was generated**: the password stays as it is until Regenerate. Pinned in Task 6.
4. **Reference mode picked and then switched back to managed**: the payload carries managed and no folder or watcher. Pinned in Task 5.
5. **The server refuses the create** (for example a type deactivated in another tab): the form keeps every value, the submit button works again, and leaving still asks. Pinned in Task 6.

---

### Task 1: Create accepts the photo source, with the same photos.upload rule as the PUT

**Files:**
- Create: `backend/src/services/eventPhotoSource.js`
- Create: `backend/__tests__/services/eventPhotoSource.test.js`
- Modify: `backend/src/services/eventCreationValidation.js` (the Joi schema)
- Modify: `backend/src/services/eventCreationService.js` (`createEvent` options, a call after the field-requirement errors, `insertData`)
- Modify: `backend/src/routes/adminEvents/crud.js` (`router.post('/', ...` validator array and the `createEvent` call)
- Test: `backend/__tests__/routes/adminEvents.smoke.test.js` (`describe('POST /')`)

**Interfaces:**
- Produces: `resolveCreatePhotoSource(input, { canEnableWatch })` resolving to `{ source_mode: 'managed' | 'reference', external_path: string | null, external_watch: boolean }`, or rejecting with an `AppError` (400 `EXTERNAL_PATH_REQUIRED`, 403 `PHOTOS_UPLOAD_REQUIRED`). `createEvent(data, { actor, source, frontendUrl, canEnableWatch })`. `POST /api/admin/events` stores `source_mode`, `external_path`, `external_watch`.

- [ ] **Step 1: Write the failing unit test.** Create `backend/__tests__/services/eventPhotoSource.test.js`:

```js
/**
 * The photo source a new event starts with (P5, spec 5.5): the PUT's rules,
 * applied to an event that has no earlier state.
 */
const { resolveCreatePhotoSource } = require('../../src/services/eventPhotoSource');

describe('resolveCreatePhotoSource', () => {
  const allow = jest.fn(async () => true);
  const deny = jest.fn(async () => false);
  beforeEach(() => { allow.mockClear(); deny.mockClear(); });

  it('defaults to managed and drops any folder fields', async () => {
    await expect(resolveCreatePhotoSource({ external_path: 'x', external_watch: true }, { canEnableWatch: deny }))
      .resolves.toEqual({ source_mode: 'managed', external_path: null, external_watch: false });
    expect(deny).not.toHaveBeenCalled();
  });

  it('keeps a trimmed folder in reference mode without asking for a permission', async () => {
    await expect(resolveCreatePhotoSource({ source_mode: 'reference', external_path: '  weddings/2026 ' }, { canEnableWatch: deny }))
      .resolves.toEqual({ source_mode: 'reference', external_path: 'weddings/2026', external_watch: false });
    expect(deny).not.toHaveBeenCalled();
  });

  it('refuses reference mode without a folder', async () => {
    await expect(resolveCreatePhotoSource({ source_mode: 'reference', external_path: '   ' }, { canEnableWatch: allow }))
      .rejects.toMatchObject({ statusCode: 400, code: 'EXTERNAL_PATH_REQUIRED' });
  });

  it('turns the watcher on only for an admin with photos.upload', async () => {
    const input = { source_mode: 'reference', external_path: 'a', external_watch: true };
    await expect(resolveCreatePhotoSource(input, { canEnableWatch: allow }))
      .resolves.toEqual({ source_mode: 'reference', external_path: 'a', external_watch: true });
    await expect(resolveCreatePhotoSource(input, { canEnableWatch: deny }))
      .rejects.toMatchObject({ statusCode: 403, code: 'PHOTOS_UPLOAD_REQUIRED' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails.** From `backend/`: `npx jest __tests__/services/eventPhotoSource.test.js`. Expected: FAIL, "Cannot find module '../../src/services/eventPhotoSource'".

- [ ] **Step 3: Implement the service.** Create `backend/src/services/eventPhotoSource.js`:

```js
const { AppError } = require('../utils/errors');

/**
 * The photo source a new event starts with (spec 5.5): managed, or an
 * external folder, optionally watched. The same rules as the event PUT: a
 * folder is required in reference mode, managed clears both, and turning the
 * watcher on needs photos.upload, because the server then imports on the
 * admin's behalf. A new event has no earlier state, so asking for the watcher
 * is always a transition. canEnableWatch is only called when it is asked for.
 */
async function resolveCreatePhotoSource(input, { canEnableWatch }) {
  if (input.source_mode !== 'reference') {
    return { source_mode: 'managed', external_path: null, external_watch: false };
  }
  const externalPath = typeof input.external_path === 'string' ? input.external_path.trim() : '';
  if (!externalPath) {
    throw new AppError('external_path is required when source_mode is reference', 400, 'EXTERNAL_PATH_REQUIRED');
  }
  const watch = input.external_watch === true || input.external_watch === 'true';
  if (watch && !(await canEnableWatch())) {
    throw new AppError('The photos.upload permission is required to enable automatic imports for this folder', 403, 'PHOTOS_UPLOAD_REQUIRED');
  }
  return { source_mode: 'reference', external_path: externalPath, external_watch: watch };
}

module.exports = { resolveCreatePhotoSource };
```

- [ ] **Step 4: Run the unit test to verify it passes.** Same command. Expected: 4 PASS.

- [ ] **Step 5: Write the failing route tests.** Add inside `describe('POST /', () => {` of `adminEvents.smoke.test.js`:

```js
    // P5 (spec 5.5): the create page can start an event on an external folder,
    // with the PUT's photos.upload rule for the watcher.
    const folderEvent = (over = {}) => ({
      event_type: 'wedding', event_name: 'Folder Wedding', event_date: '2026-09-03',
      customer_name: 'Client Person', customer_email: 'client@example.com', require_password: false,
      source_mode: 'reference', external_path: 'weddings/2026', ...over,
    });

    it('stores an external folder and its watcher on create', async () => {
      const res = await auth(request(app).post('/api/admin/events')).send(folderEvent({ external_watch: true }));
      expect(res.status).toBe(200);
      const row = await db('events').where({ id: res.body.id }).first();
      expect(row.source_mode).toBe('reference');
      expect(row.external_path).toBe('weddings/2026');
      expect(Boolean(row.external_watch)).toBe(true);
    });

    it('400s on reference mode without a folder and creates nothing', async () => {
      const res = await auth(request(app).post('/api/admin/events')).send(folderEvent({ external_path: '' }));
      expect(res.status).toBe(400);
      expect(await db('events').select('id')).toHaveLength(0);
    });

    it('refuses the watcher to an admin without photos.upload, but not the folder', async () => {
      const { clearPermissionCache } = require('../../src/middleware/permissions');
      const [roleRow] = await db('roles').insert({ name: 'p5_creator', display_name: 'P5 creator', priority: 1 }).returning('id');
      const roleId = roleRow?.id ?? roleRow;
      const perms = await db('permissions').whereIn('name', ['events.view', 'events.create']).select('id');
      await db('role_permissions').insert(perms.map((p) => ({ role_id: roleId, permission_id: p.id })));
      const [userRow] = await db('admin_users').insert({
        username: 'p5creator', email: 'p5creator@example.com', password_hash: 'x',
        must_change_password: false, role_id: roleId, created_at: new Date(),
      }).returning('id');
      clearPermissionCache();
      const creator = (req) => req.set('Authorization', `Bearer ${mintAdminToken(userRow?.id ?? userRow)}`);

      const watched = await creator(request(app).post('/api/admin/events')).send(folderEvent({ external_watch: true }));
      expect(watched.status).toBe(403);
      expect(await db('events').select('id')).toHaveLength(0);

      const plain = await creator(request(app).post('/api/admin/events')).send(folderEvent({ event_name: 'Folder only' }));
      expect(plain.status).toBe(200);
      expect((await db('events').where({ id: plain.body.id }).first()).source_mode).toBe('reference');
    });
```

- [ ] **Step 6: Run them to verify they fail.** From `backend/`: `npx jest __tests__/routes/adminEvents.smoke.test.js -t "folder|watcher"`. Expected: the first FAILS (`source_mode` is `managed`), the second FAILS (status 200), the third FAILS on the 403.

- [ ] **Step 7: Accept the fields in the Joi schema.** In `eventCreationValidation.js`, add to the object after `customer_account_ids: ...,`:

```js
  // Photo source (P5, spec 5.5); only the admin create page applies it.
  source_mode: Joi.string().valid('managed', 'reference'),
  external_path: Joi.string().trim().max(1024).allow('', null),
```

and add `'external_watch'` to the list of boolean keys (after `'show_credits_to_guests'`).

- [ ] **Step 8: Resolve the source in the service.** In `eventCreationService.js`:
  - add `const { resolveCreatePhotoSource } = require('./eventPhotoSource');` next to the other service requires at the top;
  - change the signature to `async function createEvent(data, { actor, source = 'admin', frontendUrl, canEnableWatch } = {}) {`;
  - directly after the block `if (validationErrors.length > 0) { throw creationError({ errors: validationErrors }); }`, add:

```js
  // Photo source (spec 5.5), from the admin create page only: v1 and the
  // conversions stay managed. Resolved before any hash or folder is made, so
  // a refusal leaves nothing behind.
  const photoSource = source === 'admin'
    ? await resolveCreatePhotoSource(input, { canEnableWatch: canEnableWatch || (async () => false) })
    : null;
```

  - in `insertData`, directly after `photo_cap: photo_cap || null,`, add:

```js
    ...(photoSource ? {
      source_mode: photoSource.source_mode,
      external_path: photoSource.external_path,
      external_watch: formatBoolean(photoSource.external_watch),
    } : {}),
```

- [ ] **Step 9: Pass the permission check from the route.** In `crud.js`, in the `router.post('/', ...` validator array, after `body('default_photo_sort').optional().isIn([...]),` add:

```js
    // Photo source (P5, spec 5.5); the watcher's permission is checked in
    // the service through canEnableWatch.
    body('source_mode').optional().isIn(['managed', 'reference']),
    body('external_path').optional({ nullable: true }).isString().trim(),
    body('external_watch').optional().isBoolean(),
```

and change the call to:

```js
      const created = await require('../../services/eventCreationService').createEvent(req.body, {
        actor: req.admin,
        frontendUrl: await getAbsoluteFrontendUrl(req, { override: process.env.APP_URL }),
        canEnableWatch: () => userHasAllPermissions(req.admin.id, ['photos.upload']),
      });
```

The folder watcher needs no call: its reconcile pass picks up new watched events once a minute (`backend/src/services/externalMediaWatcher.js`, `reconcile`).

- [ ] **Step 10: Run the tests to verify they pass.** From `backend/`: `npx jest __tests__/services/eventPhotoSource.test.js __tests__/routes/adminEvents.smoke.test.js routes/v1/__tests__/events.create.test.js`. Expected: all PASS, including the v1 and legacy create cases.

- [ ] **Step 11: Commit.**

```bash
git add backend/src/services/eventPhotoSource.js backend/__tests__/services/eventPhotoSource.test.js backend/src/services/eventCreationValidation.js backend/src/services/eventCreationService.js backend/src/routes/adminEvents/crud.js backend/__tests__/routes/adminEvents.smoke.test.js
git commit -q -m "feat(events): accept the photo source on create"
```

---

### Task 2: Customer fields and photo source fields become shared components

**Files:**
- Create: `frontend/src/pages/admin/event-details/settings/CustomerFields.tsx`
- Create: `frontend/src/pages/admin/event-details/settings/PhotoSourceFields.tsx`
- Create: `frontend/src/pages/admin/event-details/settings/__tests__/CustomerFields.test.tsx`
- Create: `frontend/src/pages/admin/event-details/settings/__tests__/PhotoSourceFields.test.tsx`
- Modify: `frontend/src/pages/admin/event-details/settings/DetailsSection.tsx` (the name, email and phone blocks)
- Modify: `frontend/src/pages/admin/event-details/settings/AdvancedSection.tsx` (the whole advanced area)
- Modify: `frontend/src/pages/admin/event-details/settings/__tests__/controlInventory.test.ts` (`VIA_COMPONENT`)

**Interfaces:**
- Produces: `CustomerFields` with props `{ values: Record<CustomerField, string>; onChange: (field: CustomerField, value: string) => void; phoneFieldEnabled: boolean; required?: { name: boolean; email: boolean }; errors?: Partial<Record<CustomerField, string>> }`, `type CustomerField = 'customer_name' | 'customer_email' | 'customer_phone'`. `PhotoSourceFields` with props `{ values: PhotoSourceValues; onChange: (patch: Partial<PhotoSourceValues>) => void; savedExternalPath?: string; folderError?: string }`, `interface PhotoSourceValues { source_mode: 'managed' | 'reference'; external_path: string; external_watch: boolean; photo_cap: number; default_photo_sort: string }`.

- [ ] **Step 1: Write the failing tests.** Create `settings/__tests__/CustomerFields.test.tsx`:

```tsx
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CustomerFields } from '../CustomerFields';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k) }),
}));

const values = { customer_name: 'Anna', customer_email: 'anna@example.com', customer_phone: '' };

describe('CustomerFields', () => {
  it('labels the fields Settings make optional, on create', () => {
    render(<CustomerFields values={values} onChange={vi.fn()} phoneFieldEnabled={false} required={{ name: true, email: false }} />);
    expect(screen.getByLabelText('events.hostName')).toHaveValue('Anna');
    expect(screen.getByLabelText('events.hostEmail (common.optional)')).toHaveValue('anna@example.com');
  });

  it('adds no suffix when no requirements are passed (the event page)', () => {
    render(<CustomerFields values={values} onChange={vi.fn()} phoneFieldEnabled={false} />);
    expect(screen.getByLabelText('events.hostEmail')).toBeInTheDocument();
  });

  it('reports each change by field name, and shows the phone only when enabled', () => {
    const onChange = vi.fn();
    const { rerender } = render(<CustomerFields values={values} onChange={onChange} phoneFieldEnabled={false} />);
    expect(screen.queryByRole('textbox', { name: /Customer Phone/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('events.hostName'), { target: { value: 'Bea' } });
    expect(onChange).toHaveBeenCalledWith('customer_name', 'Bea');
    rerender(<CustomerFields values={values} onChange={onChange} phoneFieldEnabled />);
    fireEvent.change(screen.getByLabelText(/Customer Phone/), { target: { value: '+49 1' } });
    expect(onChange).toHaveBeenCalledWith('customer_phone', '+49 1');
  });

  it('shows a field error under its field', () => {
    render(<CustomerFields values={values} onChange={vi.fn()} phoneFieldEnabled={false} errors={{ customer_email: 'bad email' }} />);
    expect(screen.getByText('bad email')).toBeInTheDocument();
  });
});
```

Create `settings/__tests__/PhotoSourceFields.test.tsx`:

```tsx
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PhotoSourceFields, type PhotoSourceValues } from '../PhotoSourceFields';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k) }),
}));
const canUpload = vi.fn(() => true);
vi.mock('../../../../../hooks/usePermission', () => ({ usePermission: () => canUpload() }));
vi.mock('../../ExternalFolderPicker', () => ({
  ExternalFolderPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="External folder" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const managed: PhotoSourceValues = { source_mode: 'managed', external_path: '', external_watch: false, photo_cap: 0, default_photo_sort: 'upload_date_desc' };

describe('PhotoSourceFields', () => {
  beforeEach(() => canUpload.mockReturnValue(true));

  it('switching to reference brings back the saved folder', () => {
    const onChange = vi.fn();
    render(<PhotoSourceFields values={managed} onChange={onChange} savedExternalPath="old/folder" />);
    fireEvent.change(screen.getByLabelText('Source Mode'), { target: { value: 'reference' } });
    expect(onChange).toHaveBeenCalledWith({ source_mode: 'reference', external_path: 'old/folder' });
  });

  it('switching back to managed clears the folder', () => {
    const onChange = vi.fn();
    render(<PhotoSourceFields values={{ ...managed, source_mode: 'reference', external_path: 'a' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Source Mode'), { target: { value: 'managed' } });
    expect(onChange).toHaveBeenCalledWith({ source_mode: 'managed', external_path: '' });
  });

  it('locks the watcher without photos.upload and says why', () => {
    canUpload.mockReturnValue(false);
    render(<PhotoSourceFields values={{ ...managed, source_mode: 'reference', external_path: 'a' }} onChange={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: /Watch folder for new files/ })).toBeDisabled();
    expect(screen.getByText('Requires the permission to upload photos.')).toBeInTheDocument();
  });

  it('reports the folder, the limit and the sort, and shows a folder error', () => {
    const onChange = vi.fn();
    render(<PhotoSourceFields values={{ ...managed, source_mode: 'reference' }} onChange={onChange} folderError="pick one" />);
    fireEvent.change(screen.getByLabelText('External folder'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith({ external_path: 'b' });
    fireEvent.change(screen.getByLabelText('Photo Limit'), { target: { value: '25' } });
    expect(onChange).toHaveBeenCalledWith({ photo_cap: 25 });
    fireEvent.change(screen.getByLabelText('Default Photo Sort'), { target: { value: 'filename_asc' } });
    expect(onChange).toHaveBeenCalledWith({ default_photo_sort: 'filename_asc' });
    expect(screen.getByText('pick one')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail.** From `frontend/`: `npx vitest run src/pages/admin/event-details/settings/__tests__/CustomerFields.test.tsx src/pages/admin/event-details/settings/__tests__/PhotoSourceFields.test.tsx`. Expected: FAIL, both modules missing.

- [ ] **Step 3: Implement `CustomerFields.tsx`.**

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '../../../../components/common';

export type CustomerField = 'customer_name' | 'customer_email' | 'customer_phone';

/**
 * The customer's name, email and phone (spec 5.1, 5.5), the same on the
 * create screen and in Settings > Details. On create a field the Settings
 * make optional says so; the event page passes no requirements.
 */
export const CustomerFields: React.FC<{
  values: Record<CustomerField, string>;
  onChange: (field: CustomerField, value: string) => void;
  phoneFieldEnabled: boolean;
  required?: { name: boolean; email: boolean };
  errors?: Partial<Record<CustomerField, string>>;
}> = ({ values, onChange, phoneFieldEnabled, required, errors = {} }) => {
  const { t } = useTranslation();
  const label = (text: string, isRequired: boolean | undefined) =>
    required && !isRequired ? `${text} (${t('common.optional')})` : text;
  return (
    <>
      <Input
        type="text"
        label={label(t('events.hostName'), required?.name)}
        value={values.customer_name}
        onChange={(e) => onChange('customer_name', e.target.value)}
        placeholder={t('events.hostNamePlaceholder')}
        error={errors.customer_name}
      />
      <Input
        type="email"
        label={label(t('events.hostEmail'), required?.email)}
        value={values.customer_email}
        onChange={(e) => onChange('customer_email', e.target.value)}
        placeholder={t('events.hostEmailPlaceholder')}
        error={errors.customer_email}
      />
      {phoneFieldEnabled && (
        <Input
          type="tel"
          label={`${t('events.customerPhone', 'Customer Phone')} (${t('common.optional')})`}
          value={values.customer_phone}
          onChange={(e) => onChange('customer_phone', e.target.value)}
          placeholder={t('events.customerPhonePlaceholder', '+1 555 555 1234')}
        />
      )}
    </>
  );
};
```

- [ ] **Step 4: Implement `PhotoSourceFields.tsx`.** The markup is the advanced area of `AdvancedSection.tsx` as it stands, reading `values` and reporting patches; the labels gain `htmlFor` so the fields are named.

```tsx
import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '../../../../hooks/usePermission';
import { ExternalFolderPicker } from '../ExternalFolderPicker';

export interface PhotoSourceValues {
  source_mode: 'managed' | 'reference';
  external_path: string;
  external_watch: boolean;
  photo_cap: number;
  default_photo_sort: string;
}

/**
 * Where the photos come from, the photo limit and the default sort (spec
 * 5.1, 5.5), the same on the create screen and in Settings > Advanced.
 */
export const PhotoSourceFields: React.FC<{
  values: PhotoSourceValues;
  onChange: (patch: Partial<PhotoSourceValues>) => void;
  /** The folder the saved event points at, restored when reference is picked again. */
  savedExternalPath?: string;
  folderError?: string;
}> = ({ values, onChange, savedExternalPath = '', folderError }) => {
  const { t } = useTranslation();
  const id = useId();
  // Enabling the watcher makes the server import on the admin's behalf, which
  // the backend gates on photos.upload like the Import button.
  const canEnableWatch = usePermission('photos.upload');
  const selectClass = 'w-full px-3 py-2 border border-line-strong bg-panel text-heading rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-accent-dark';
  return (
    <>
      <div>
        <label htmlFor={`${id}-source`} className="block text-sm font-medium text-body mb-1">
          {t('events.sourceMode', 'Source Mode')}
        </label>
        <select
          id={`${id}-source`}
          value={values.source_mode}
          onChange={(e) => {
            // Named `sourceMode`, not `mode`: the i18n extractor's TS
            // resolver matches locals by name across the whole file.
            const sourceMode = e.target.value as 'managed' | 'reference';
            onChange({
              source_mode: sourceMode,
              external_path: sourceMode === 'reference' ? (values.external_path || savedExternalPath) : '',
            });
          }}
          className={selectClass}
        >
          <option value="managed">{t('events.sourceModeManaged', 'Managed (upload to PicPeak)')}</option>
          <option value="reference">{t('events.sourceModeReference', 'Reference external folder')}</option>
        </select>
        <p className="text-xs text-muted mt-1">
          {t('events.sourceModeHelp', 'Use managed mode for direct uploads or reference an external folder that is mounted at /external-media in Docker.')}
        </p>
      </div>

      {values.source_mode === 'reference' && (
        <div className="mt-3">
          <span className="block text-sm font-medium text-body mb-2">
            {t('events.externalFolder', 'External Folder')}
          </span>
          <ExternalFolderPicker
            value={values.external_path || ''}
            onChange={(folder) => onChange({ external_path: folder })}
          />
          {folderError && <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">{folderError}</p>}
          <p className="text-xs text-muted mt-1">
            {t('events.externalFolderHint', 'These folders come from the /external-media mount inside the container. Ensure it is accessible to the backend process.')}
          </p>
          <label className={`flex items-start gap-2 mt-3 ${canEnableWatch || values.external_watch ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}>
            <input
              type="checkbox"
              className="mt-0.5 rounded border-line-strong text-accent focus:ring-primary-500"
              checked={values.external_watch === true}
              disabled={!canEnableWatch && !values.external_watch}
              onChange={(e) => onChange({ external_watch: e.target.checked })}
            />
            <span className="text-sm">
              <span className="font-medium text-heading">
                {t('events.externalWatch', 'Watch folder for new files')}
              </span>
              <span className="block text-xs text-muted mt-0.5">
                {t('events.externalWatchHint', 'New images copied into this folder are imported automatically, the same way the Import button does it. Files removed from the folder are never deleted from the gallery.')}
              </span>
              {!canEnableWatch && !values.external_watch && (
                <span className="block text-xs text-muted mt-0.5">
                  {t('events.externalWatchNoPermission', 'Requires the permission to upload photos.')}
                </span>
              )}
            </span>
          </label>
        </div>
      )}

      <div>
        <label htmlFor={`${id}-cap`} className="block text-sm font-medium text-body mb-1">
          {t('events.photoCap', 'Photo Limit')}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`${id}-cap`}
            type="number"
            value={values.photo_cap}
            onChange={(e) => onChange({ photo_cap: parseInt(e.target.value) || 0 })}
            min={0}
            // events.photo_cap is a signed 32-bit int (migration 074). Without
            // an explicit max, input[type=number] reports aria-valuemax="0",
            // and an out-of-range value only fails at INSERT.
            max={2147483647}
            className="w-24 px-3 py-2 border border-line-strong bg-panel text-heading rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-accent-dark"
          />
          <span className="text-xs text-muted">
            {t('events.photoCapHelp', 'Maximum number of photos allowed. 0 = unlimited')}
          </span>
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-sort`} className="block text-sm font-medium text-body mb-1">
          {t('photoSort.defaultSort', 'Default Photo Sort')}
        </label>
        <select
          id={`${id}-sort`}
          value={values.default_photo_sort}
          onChange={(e) => onChange({ default_photo_sort: e.target.value })}
          className={selectClass}
        >
          <option value="upload_date_desc">{t('photoSort.uploadDateNewest', 'Upload Date (Newest First)')}</option>
          <option value="upload_date_asc">{t('photoSort.uploadDateOldest', 'Upload Date (Oldest First)')}</option>
          <option value="capture_date_desc">{t('photoSort.captureDateNewest', 'Date Taken (Newest First)')}</option>
          <option value="capture_date_asc">{t('photoSort.captureDateOldest', 'Date Taken (Oldest First)')}</option>
          <option value="filename_asc">{t('photoSort.filenameAZ', 'Filename (A-Z)')}</option>
          <option value="filename_desc">{t('photoSort.filenameZA', 'Filename (Z-A)')}</option>
        </select>
      </div>
    </>
  );
};
```

- [ ] **Step 5: Run the new tests to verify they pass.** Same command as Step 2. Expected: all PASS.

- [ ] **Step 6: Use them in the sections.** In `DetailsSection.tsx`, replace the three `<div>` blocks for the customer name, the customer email and the phone (from `<div>` above `{t('events.hostName')}` through the closing `)}` of `{phoneFieldEnabled && (`) with:

```tsx
        <CustomerFields
          values={editForm}
          phoneFieldEnabled={phoneFieldEnabled}
          onChange={(field, value) => setEditForm(prev => ({ ...prev, [field]: value }))}
        />
```

and add `import { CustomerFields } from './CustomerFields';`; drop `Input` from the common import if nothing else in the file uses it. Replace the body of `AdvancedSection.tsx` with:

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../../components/common';
import { useEventSettings } from './EventSettingsContext';
import { AdvancedArea } from './AdvancedArea';
import { PhotoSourceFields } from './PhotoSourceFields';

/** Settings > Advanced (spec 5.1): everything here is an advanced option. */
export const AdvancedSection: React.FC = () => {
  const { t } = useTranslation();
  const { event, editForm, setEditForm, expert } = useEventSettings();
  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4">{t('events.settings.sectionAdvanced', 'Advanced')}</h2>
      <AdvancedArea expert={expert}>
        <PhotoSourceFields
          values={editForm}
          savedExternalPath={event.external_path || ''}
          onChange={(patch) => setEditForm(prev => ({ ...prev, ...patch }))}
        />
      </AdvancedArea>
    </Card>
  );
};
```

If TypeScript refuses `values={editForm}` because an `EditFormState` field type differs from `PhotoSourceValues` (for example `source_mode: string`), narrow the interface field to match `EditFormState` rather than casting.

- [ ] **Step 7: Teach the inventory test where the fields went.** In `controlInventory.test.ts`, add to `VIA_COMPONENT`:

```ts
  'event.customer_name': 'CustomerFields', 'event.customer_email': 'CustomerFields', 'event.customer_phone': 'CustomerFields',
  'event.source_mode': 'PhotoSourceFields', 'event.external_path': 'PhotoSourceFields', 'event.external_watch': 'PhotoSourceFields',
  'event.photo_cap': 'PhotoSourceFields', 'event.default_photo_sort': 'PhotoSourceFields',
```

- [ ] **Step 8: Run the section and page suites.** From `frontend/`: `npx vitest run src/pages/admin/event-details/settings src/pages/admin/__tests__/eventSettingsSaveModel.test.tsx src/pages/admin/__tests__/eventDetailsPhotosTab.test.tsx`. Expected: all PASS, the inventory and the legacy zero-changes test included.

- [ ] **Step 9: Commit.**

```bash
git add frontend/src/pages/admin/event-details/settings
git commit -q -m "refactor(events): share the customer and photo source fields"
```

---

### Task 3: One password field, shown in clear with Copy and Regenerate

**Files:**
- Create: `frontend/src/pages/admin/event-details/settings/PasswordField.tsx`
- Create: `frontend/src/pages/admin/event-details/settings/__tests__/PasswordField.test.tsx`
- Modify: `frontend/src/pages/admin/event-details/settings/AccessSection.tsx` (the `Input` and the Regenerate button)
- Modify: `frontend/src/pages/admin/event-details/ClientAccessCard.tsx` (`ClientAccessSettings`: the label, input, helper and Generate button)

**Interfaces:**
- Produces: `PasswordField` with props `{ label: string; value: string; onChange: (value: string) => void; onRegenerate: () => void; regenerateLabel: string; placeholder?: string; helperText?: string; error?: string }`.

- [ ] **Step 1: Write the failing test.** Create `settings/__tests__/PasswordField.test.tsx`:

```tsx
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PasswordField } from '../PasswordField';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k) }),
}));
const toastSuccess = vi.fn();
vi.mock('react-toastify', () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a) } }));

describe('PasswordField (spec 3, 5.4)', () => {
  it('shows the password in clear under its label, with no confirm field', () => {
    render(<PasswordField label="Gallery password" value="Anna-2026-x7Kp2Q" onChange={vi.fn()} onRegenerate={vi.fn()} regenerateLabel="Regenerate" />);
    const field = screen.getByLabelText('Gallery password');
    expect(field).toHaveAttribute('type', 'text');
    expect(field).toHaveValue('Anna-2026-x7Kp2Q');
    expect(screen.queryByText(/confirm/i)).toBeNull();
  });

  it('regenerates and reports typing', () => {
    const onChange = vi.fn();
    const onRegenerate = vi.fn();
    render(<PasswordField label="P" value="abcdef" onChange={onChange} onRegenerate={onRegenerate} regenerateLabel="Regenerate" />);
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('P'), { target: { value: 'mine-123' } });
    expect(onChange).toHaveBeenCalledWith('mine-123');
  });

  it('copies the value, and offers no copy while empty', () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { rerender } = render(<PasswordField label="P" value="" onChange={vi.fn()} onRegenerate={vi.fn()} regenerateLabel="R" />);
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
    rerender(<PasswordField label="P" value="abcdef" onChange={vi.fn()} onRegenerate={vi.fn()} regenerateLabel="R" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('abcdef');
    expect(toastSuccess).toHaveBeenCalledWith('Copied');
  });

  it('shows an error and marks the field invalid', () => {
    render(<PasswordField label="P" value="abc" onChange={vi.fn()} onRegenerate={vi.fn()} regenerateLabel="R" error="Too short" />);
    expect(screen.getByLabelText('P')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Too short')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails.** From `frontend/`: `npx vitest run src/pages/admin/event-details/settings/__tests__/PasswordField.test.tsx`. Expected: FAIL, module missing.

- [ ] **Step 3: Implement `PasswordField.tsx`.**

```tsx
import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

/**
 * A password shown in clear, with Regenerate and Copy (spec 3, 5.4): the
 * gallery and client passwords on the create screen and in Settings > Access.
 * There is no confirm field, because the value is visible.
 */
export const PasswordField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  onRegenerate: () => void;
  regenerateLabel: string;
  placeholder?: string;
  helperText?: string;
  error?: string;
}> = ({ label, value, onChange, onRegenerate, regenerateLabel, placeholder, helperText, error }) => {
  const { t } = useTranslation();
  const id = useId();
  const copy = () => {
    void navigator.clipboard?.writeText(value);
    toast.success(t('events.access.copied', 'Copied'));
  };
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-body mb-1">{label}</label>
      <input
        id={id}
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="w-full px-3 py-2 bg-inset border border-line-strong text-heading rounded-lg text-sm font-mono"
      />
      {helperText && <p className="text-xs text-muted mt-1">{helperText}</p>}
      {error && <p id={`${id}-error`} className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
      <div className="flex gap-4 mt-2">
        <button type="button" className="text-sm font-medium text-accent" onClick={onRegenerate}>{regenerateLabel}</button>
        <button type="button" className="text-sm font-medium text-accent disabled:opacity-50" disabled={!value} onClick={copy}>
          {t('events.access.copy', 'Copy')}
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run it to verify it passes.** Same command. Expected: 4 PASS.

- [ ] **Step 5: Use it in Settings > Access.** In `AccessSection.tsx`, replace the `<Input ... />` and the Regenerate `<button>` inside `{editForm.require_password && (` with:

```tsx
            <PasswordField
              label={savedOn
                ? t('events.access.newPasswordKeep', 'New password (leave empty to keep the current one)')
                : t('events.access.galleryPassword', 'Gallery password')}
              value={editForm.new_password}
              onChange={(new_password) => setEditForm(prev => ({ ...prev, new_password }))}
              placeholder={t('events.enterPassword')}
              onRegenerate={() => setEditForm(prev => ({ ...prev, new_password: generate(prev.new_password) }))}
              regenerateLabel={t('events.access.regenerate', 'Regenerate')}
            />
```

import it with `import { PasswordField } from './PasswordField';` and drop `Input` from the common import. In `ClientAccessCard.tsx`, inside `ClientAccessSettings`, replace the `<label>`, `<input>`, helper `<p>` and Generate `<button>` after the `StoredPasswordLine` with:

```tsx
            <PasswordField
              label={hasPassword
                ? t('clientAccess.newPasswordKeep', 'New client password (leave empty to keep the current one)')
                : t('clientAccess.passwordLabel')}
              value={editForm.client_password}
              onChange={setPassword}
              placeholder={t('clientAccess.passwordPlaceholder')}
              helperText={t('clientAccess.passwordHelperText')}
              onRegenerate={() => setPassword(generate(editForm.client_password))}
              regenerateLabel={t('clientAccess.generate', 'Generate')}
            />
```

with `import { PasswordField } from './settings/PasswordField';`.

- [ ] **Step 6: Run the affected suites.** From `frontend/`: `npx vitest run src/pages/admin/event-details src/pages/admin/__tests__/eventSettingsSaveModel.test.tsx`. Expected: all PASS (`AccessSection.test.tsx`, `ClientAccessCard.password.test.tsx` and the inventory included). A test that found the password input by role `textbox` still finds it; one that relied on there being a single `Copy` button needs `within(...)`, not a changed component.

- [ ] **Step 7: Commit.**

```bash
git add frontend/src/pages/admin/event-details
git commit -q -m "refactor(events): one password field with copy and regenerate"
```

---

### Task 4: Identity mode on its own, and "Custom (from Settings)"

**Files:**
- Create: `frontend/src/components/admin/IdentityModeField.tsx`
- Create: `frontend/src/components/admin/__tests__/IdentityModeField.test.tsx`
- Modify: `frontend/src/components/admin/FeedbackSettings.tsx` (the identity block, lines from `<div className="space-y-3">` under `{/* Identity Mode */}` to the `</div>` that closes it, right above `<div className="border-t border-line pt-4" />`)
- Modify: `frontend/src/components/admin/index.ts` (export)
- Modify: `frontend/src/pages/admin/event-details/settings/FeedbackModeSelector.tsx` (`fromSettings`)
- Modify: `frontend/src/pages/admin/event-details/settings/feedbackMode.ts` (`applyFeedbackMode` generic)
- Modify: `frontend/src/pages/admin/event-details/settings/__tests__/feedbackMode.test.ts`
- Create: `frontend/src/pages/admin/event-details/settings/__tests__/FeedbackModeSelector.test.tsx`
- Modify: `frontend/src/i18n/locales/en.json`, `de.json`, `vi.json` (via addkeys)

**Interfaces:**
- Produces: `IdentityModeField` with props `{ value: 'simple' | 'guest' | 'shared' | undefined; onChange: (mode: 'simple' | 'guest' | 'shared') => void }`, exported from `components/admin`. `FeedbackModeSelector` gains `fromSettings?: boolean`. `applyFeedbackMode<T extends Partial<FeedbackSettings>>(current: T, saved: Partial<FeedbackSettings>, mode: FeedbackMode): T`.

- [ ] **Step 1: Write the failing tests.** Create `components/admin/__tests__/IdentityModeField.test.tsx`:

```tsx
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IdentityModeField } from '../IdentityModeField';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k) }),
}));

describe('IdentityModeField', () => {
  it('treats no value as simple and reports a pick', () => {
    const onChange = vi.fn();
    render(<IdentityModeField value={undefined} onChange={onChange} />);
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios).toHaveLength(3);
    expect(radios.find((r) => r.value === 'simple')!.checked).toBe(true);
    fireEvent.click(radios.find((r) => r.value === 'guest')!);
    expect(onChange).toHaveBeenCalledWith('guest');
  });

  it('warns about the shared tag only when it is picked', () => {
    const { rerender } = render(<IdentityModeField value="simple" onChange={vi.fn()} />);
    expect(screen.queryByText(/Colour tags in this mode have no author/)).toBeNull();
    rerender(<IdentityModeField value="shared" onChange={vi.fn()} />);
    expect(screen.getByText(/Colour tags in this mode have no author/)).toBeInTheDocument();
  });
});
```

If the guest radio in the moved markup has no `value="guest"` attribute, add one in Step 3 (the shared radio already carries `value="shared"`), so the radios are told apart by value.

Create `settings/__tests__/FeedbackModeSelector.test.tsx`:

```tsx
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeedbackModeSelector } from '../FeedbackModeSelector';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k) }),
}));

describe('FeedbackModeSelector', () => {
  it('names Custom after Settings when the defaults came from there (spec 5.7)', () => {
    render(<FeedbackModeSelector mode="custom" offered={['off', 'picks', 'full', 'custom']} onSelect={vi.fn()} fromSettings />);
    expect(screen.getByRole('radio', { name: /^Custom \(from Settings\)/ })).toBeChecked();
  });

  it('keeps the plain Custom label otherwise', () => {
    render(<FeedbackModeSelector mode="custom" offered={['off', 'picks', 'full', 'custom']} onSelect={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /^Custom/ })).toBeChecked();
    expect(screen.queryByText('Custom (from Settings)')).toBeNull();
  });
});
```

Add to `feedbackMode.test.ts`:

```ts
  it('keeps every other field of the object it is given (the create screen passes a subset)', () => {
    const subset = { feedback_enabled: false, allow_favorites: true, allow_likes: true, allow_ratings: true, allow_comments: true, allow_reactions: true, identity_mode: 'guest' as const };
    const next = applyFeedbackMode(subset, subset, 'picks');
    expect(next).toEqual({ ...subset, feedback_enabled: true, allow_likes: false, allow_ratings: false, allow_comments: false, allow_reactions: false });
  });
```

- [ ] **Step 2: Run them to verify they fail.** From `frontend/`: `npx vitest run src/components/admin/__tests__/IdentityModeField.test.tsx src/pages/admin/event-details/settings/__tests__/FeedbackModeSelector.test.tsx src/pages/admin/event-details/settings/__tests__/feedbackMode.test.ts`. Expected: IdentityModeField FAILS (module missing), the `fromSettings` case FAILS (no such label); the subset case passes at runtime but `npm run build:check` would refuse it, which Step 5 fixes.

- [ ] **Step 3: Move the identity block.** Create `components/admin/IdentityModeField.tsx`:

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';

export type IdentityMode = 'simple' | 'guest' | 'shared';

/**
 * Who a guest is to the gallery's feedback (#1197), the same on the create
 * screen (P5) and in the event's feedback settings.
 */
export const IdentityModeField: React.FC<{ value: IdentityMode | undefined; onChange: (mode: IdentityMode) => void }> = ({ value, onChange }) => {
  const { t } = useTranslation();
  return (
    // The identity block moved from FeedbackSettings.tsx, see Step 3.
  );
};
```

and replace the placeholder comment with the identity block cut from `FeedbackSettings.tsx` (the `<div className="space-y-3">` under `{/* Identity Mode */}` through its closing `</div>`), changing only these expressions: `(settings.identity_mode || 'simple')` becomes `(value || 'simple')`; every other `settings.identity_mode` becomes `value`; `onChange({ ...settings, identity_mode: 'simple' })`, `'guest'`, `'shared'` become `onChange('simple')`, `onChange('guest')`, `onChange('shared')`. Import from `lucide-react` exactly the icons the block uses. In `FeedbackSettings.tsx`, put in its place:

```tsx
            <IdentityModeField
              value={settings.identity_mode}
              onChange={(identity_mode) => onChange({ ...settings, identity_mode })}
            />
```

with `import { IdentityModeField } from './IdentityModeField';`, and remove the icons it no longer uses from its `lucide-react` import (lint names them). Add `export { IdentityModeField } from './IdentityModeField';` to `components/admin/index.ts` next to the `FeedbackSettings` export.

- [ ] **Step 4: Add the Settings label.** Write `<scratchpad>/p5-feedbackmode.json`:

```json
{
  "path": "events.feedbackMode",
  "en": { "customFromSettings": "Custom (from Settings)", "customFromSettingsHelp": "The feedback switches set in Settings > Events." },
  "de": { "customFromSettings": "Eigene Auswahl (aus den Einstellungen)", "customFromSettingsHelp": "Die Feedback-Schalter aus Einstellungen > Events." },
  "vi": { "customFromSettings": "Tuỳ chỉnh (theo Cài đặt)", "customFromSettingsHelp": "Các công tắc phản hồi đặt trong Cài đặt > Sự kiện." }
}
```

and run `node <handover>/addkeys.js <scratchpad>/p5-feedbackmode.json`. In `FeedbackModeSelector.tsx`, add the prop and pick the label:

```tsx
const FROM_SETTINGS: [string, string, string, string] = [
  'events.feedbackMode.customFromSettings', 'Custom (from Settings)',
  'events.feedbackMode.customFromSettingsHelp', 'The feedback switches set in Settings > Events.',
];
```

```tsx
export const FeedbackModeSelector: React.FC<{
  mode: FeedbackMode;
  offered: FeedbackMode[];
  onSelect: (mode: FeedbackMode) => void;
  /** Create (spec 5.7): the Custom toggles are the Settings defaults. */
  fromSettings?: boolean;
}> = ({ mode, offered, onSelect, fromSettings = false }) => {
```

and inside the map: `const [key, fallback, helpKey, helpFallback] = m === 'custom' && fromSettings ? FROM_SETTINGS : LABEL[m];`.

- [ ] **Step 5: Make `applyFeedbackMode` keep the caller's type.** In `feedbackMode.ts`:

```ts
export function applyFeedbackMode<T extends Partial<FeedbackSettings>>(current: T, saved: Partial<FeedbackSettings>, mode: FeedbackMode): T {
  if (mode === 'off') return { ...current, feedback_enabled: false };
  const types = mode === 'picks' ? PICKS : mode === 'full' ? FULL : typesOf(saved);
  return { ...current, feedback_enabled: true, ...types };
}
```

- [ ] **Step 6: Run the tests to verify they pass.** Same command as Step 2, plus `npx vitest run src/components/admin/__tests__ src/pages/admin/event-details/settings` and `npm run build:check`. Expected: all PASS, build clean.

- [ ] **Step 7: Commit.**

```bash
git add frontend/src/components/admin frontend/src/pages/admin/event-details/settings frontend/src/i18n/locales/en.json frontend/src/i18n/locales/de.json frontend/src/i18n/locales/vi.json
git commit -q -m "refactor(events): identity mode field, and Custom labelled from Settings"
```

---

### Task 5: The create form rules

**Files:**
- Create: `frontend/src/pages/admin/create-event/createForm.ts`
- Create: `frontend/src/pages/admin/create-event/__tests__/createForm.test.ts`
- Modify: `frontend/src/i18n/locales/en.json`, `de.json`, `vi.json` (via addkeys)

**Interfaces:**
- Consumes: `expiryFromToday(days, today)` from `event-details/settings/ExpiryField`; `nextEventPassword(name, date, current)` from `utils/passwordGenerator`; `PhotoSourceValues` from Task 2; `GALLERY_THEME_PRESETS`, `ThemeConfig` from `types/theme.types`; `FeedbackSettings` from `services/feedback.service`.
- Produces: `CreateForm`, `CreateFeedback`, `CreateType { slug: string; name: string; emoji: string; themePreset: string }`, `CreateDefaults`, `CreateRequirements`, `CreateErrorField`; `createDefaults(publicSettings, adminSettings, types, today?)`, `initialCreateForm(defaults)`, `generatedPassword(form, typeName, current)`, `createRequirements(publicSettings)`, `validateCreateForm(form, requirements)` returning i18n keys, `brandingThemeOf(publicSettings)`, `createThemeFields(themePreset, brandingTheme)`, `buildCreatePayload(form, { phoneFieldEnabled, themePreset, brandingTheme })`.

- [ ] **Step 1: Write the failing tests.** Create `create-event/__tests__/createForm.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildCreatePayload, createDefaults, createRequirements, createThemeFields, generatedPassword,
  initialCreateForm, validateCreateForm, type CreateType,
} from '../createForm';
import { expiryFromToday } from '../../event-details/settings/ExpiryField';

const today = new Date(2026, 9, 1);
const types: CreateType[] = [
  { slug: 'birthday', name: 'Birthday', emoji: 'b', themePreset: 'birthdayFun' },
  { slug: 'wedding', name: 'Wedding', emoji: 'w', themePreset: 'elegantWedding' },
  { slug: 'other', name: 'Other', emoji: 'o', themePreset: 'default' },
];
const none = { customerName: false, customerEmail: false, eventDate: false, expiration: false };
const all = { customerName: true, customerEmail: true, eventDate: true, expiration: true };

describe('createDefaults', () => {
  it('preselects wedding when the catalog has it, else the first type', () => {
    expect(createDefaults({}, {}, types, today).type?.slug).toBe('wedding');
    expect(createDefaults({}, {}, [types[0]], today).type?.slug).toBe('birthday');
    expect(createDefaults({}, {}, [], today).type).toBeNull();
  });

  it('takes the expiry days from Settings, and 30 when they are missing or out of range', () => {
    expect(createDefaults({}, { general_default_expiration_days: 45 }, types, today).expiryDays).toBe(45);
    expect(createDefaults({}, { general_default_expiration_days: '60' }, types, today).expiryDays).toBe(60);
    expect(createDefaults({}, undefined, types, today).expiryDays).toBe(30);
    expect(createDefaults({}, { general_default_expiration_days: 0 }, types, today).expiryDays).toBe(30);
  });

  it('seeds the password switch and the feedback from the public defaults', () => {
    const d = createDefaults({
      event_default_require_password: false, event_default_feedback_enabled: true,
      event_default_allow_likes: false, event_default_allow_comments: false,
    }, {}, types, today);
    expect(d.requirePassword).toBe(false);
    expect(d.feedback).toEqual({
      feedback_enabled: true, allow_favorites: true, allow_likes: false, allow_ratings: true,
      allow_comments: false, allow_reactions: true, identity_mode: 'simple',
    });
  });
});

describe('initialCreateForm', () => {
  it('starts with a generated password that passes the rules, and the expiry counted from today', () => {
    const form = initialCreateForm(createDefaults({}, { general_default_expiration_days: 45 }, types, today));
    expect(form.event_type).toBe('wedding');
    expect(form.event_date).toBe('2026-10-01');
    expect(form.require_password).toBe(true);
    expect(form.password.length).toBeGreaterThanOrEqual(6);
    expect(validateCreateForm({ ...form, event_name: 'Anna' }, none)).toEqual({});
    expect(form.expires_at).toBe(expiryFromToday(45, today));
  });

  it('leaves the password empty when Settings do not ask for one', () => {
    const form = initialCreateForm(createDefaults({ event_default_require_password: false }, {}, types, today));
    expect(form.password).toBe('');
  });
});

describe('generatedPassword', () => {
  it('uses the name once typed, and never hands back the current value', () => {
    const form = { ...initialCreateForm(createDefaults({}, {}, types, today)), event_name: 'Anna and Ben' };
    const next = generatedPassword(form, 'Wedding', form.password);
    expect(next).not.toBe(form.password);
    expect(next.length).toBeGreaterThanOrEqual(6);
  });
});

describe('createRequirements', () => {
  it('reads every toggle as required unless Settings turned it off', () => {
    expect(createRequirements({})).toEqual(all);
    expect(createRequirements({ event_require_customer_email: false, event_require_expiration: false }))
      .toEqual({ ...all, customerEmail: false, expiration: false });
  });
});

describe('validateCreateForm', () => {
  const base = () => ({ ...initialCreateForm(createDefaults({}, {}, types, today)), event_name: 'Anna' });

  it('honours the Settings requirements', () => {
    const empty = { ...base(), event_name: ' ', event_date: '', expires_at: '' };
    expect(validateCreateForm(empty, all)).toEqual({
      event_name: 'validation.eventNameRequired', event_date: 'validation.eventDateRequired',
      customer_name: 'validation.hostNameRequired', customer_email: 'validation.hostEmailRequired',
      expires_at: 'validation.expiryRequired',
    });
    expect(validateCreateForm({ ...empty, event_name: 'Anna' }, none)).toEqual({});
  });

  it('checks an optional email only when one is typed', () => {
    expect(validateCreateForm({ ...base(), customer_email: 'not-an-email' }, none))
      .toEqual({ customer_email: 'validation.invalidEmailFormat' });
  });

  it('holds both passwords to six characters and not digits only', () => {
    expect(validateCreateForm({ ...base(), password: 'abc' }, none)).toEqual({ password: 'validation.passwordMinLength' });
    expect(validateCreateForm({ ...base(), password: '123456' }, none)).toEqual({ password: 'validation.passwordTooSimple' });
    expect(validateCreateForm({ ...base(), client_access_enabled: true, client_password: '' }, none))
      .toEqual({ client_password: 'validation.passwordRequired' });
    expect(validateCreateForm({ ...base(), client_access_enabled: true, client_password: '48210099' }, none))
      .toEqual({ client_password: 'validation.passwordTooSimple' });
    expect(validateCreateForm({ ...base(), require_password: false, password: '' }, none)).toEqual({});
  });

  it('wants a folder in reference mode', () => {
    expect(validateCreateForm({ ...base(), source_mode: 'reference', external_path: '' }, none))
      .toEqual({ external_path: 'validation.externalFolderRequired' });
  });
});

describe('createThemeFields (spec 5.5)', () => {
  const branding = { headerStyle: 'hero' as const, heroDividerStyle: 'curve' as const };

  it('stores no theme for a default type, and copies the header styles from Branding', () => {
    expect(createThemeFields('default', branding)).toEqual({ header_style: 'hero', hero_divider_style: 'curve' });
    expect(createThemeFields(undefined, null)).toEqual({});
  });

  it('stores the preset name and its header styles for a type with a preset', () => {
    const fields = createThemeFields('elegantWedding', branding);
    expect(fields.color_theme).toBe('elegantWedding');
    expect(fields).not.toHaveProperty('color_theme', expect.stringContaining('{'));
  });

  it('treats a preset this build does not know as no preset', () => {
    expect(createThemeFields('removedPreset', branding)).toEqual({ header_style: 'hero', hero_divider_style: 'curve' });
  });
});

describe('buildCreatePayload', () => {
  const ctx = { phoneFieldEnabled: false, themePreset: 'default', brandingTheme: null };
  const form = () => ({ ...initialCreateForm(createDefaults({}, {}, types, today)), event_name: ' Anna ' });

  it('sends a date for the expiry, never expiration_days, and no theme for a default type', () => {
    const payload = buildCreatePayload(form(), ctx);
    expect(payload).toMatchObject({ event_type: 'wedding', event_name: 'Anna', require_password: true, source_mode: 'managed', expires_at: form().expires_at });
    expect(payload).not.toHaveProperty('expiration_days');
    expect(payload).not.toHaveProperty('color_theme');
    expect(payload).not.toHaveProperty('customer_account_ids');
    expect(payload).not.toHaveProperty('client_password');
  });

  it('sends null for Never and no password when protection is off', () => {
    const payload = buildCreatePayload({ ...form(), expires_at: '', require_password: false, password: 'typed-before' }, ctx);
    expect(payload.expires_at).toBeNull();
    expect(payload).not.toHaveProperty('password');
  });

  it('drops a folder picked before switching back to managed', () => {
    const payload = buildCreatePayload({ ...form(), source_mode: 'managed', external_path: 'a', external_watch: true }, ctx);
    expect(payload.source_mode).toBe('managed');
    expect(payload).not.toHaveProperty('external_path');
    expect(payload).not.toHaveProperty('external_watch');
  });

  it('sends the folder, the mode toggles and the identity mode', () => {
    const payload = buildCreatePayload({
      ...form(), source_mode: 'reference', external_path: ' a/b ', external_watch: true, photo_cap: 0,
      feedback: { feedback_enabled: true, allow_favorites: true, allow_likes: false, allow_ratings: false, allow_comments: false, allow_reactions: false, identity_mode: 'guest' },
    }, ctx);
    expect(payload).toMatchObject({
      external_path: 'a/b', external_watch: true, photo_cap: null, feedback_enabled: true,
      allow_favorites: true, allow_likes: false, identity_mode: 'guest',
    });
    expect(payload).not.toHaveProperty('allow_color_labels');
  });
});
```

- [ ] **Step 2: Run it to verify it fails.** From `frontend/`: `npx vitest run src/pages/admin/create-event/__tests__/createForm.test.ts`. Expected: FAIL, module missing.

- [ ] **Step 3: Add the two new validation messages.** Write `<scratchpad>/p5-validation.json`:

```json
{
  "path": "validation",
  "en": { "expiryRequired": "Choose when the gallery expires.", "externalFolderRequired": "Choose the external folder." },
  "de": { "expiryRequired": "Wähle, wann die Galerie abläuft.", "externalFolderRequired": "Wähle den externen Ordner." },
  "vi": { "expiryRequired": "Hãy chọn ngày hết hạn của thư viện ảnh.", "externalFolderRequired": "Hãy chọn thư mục bên ngoài." }
}
```

and run `node <handover>/addkeys.js <scratchpad>/p5-validation.json`.

- [ ] **Step 4: Implement `createForm.ts`.**

```ts
import { format as formatDate } from 'date-fns';
import { GALLERY_THEME_PRESETS, type ThemeConfig } from '../../../types/theme.types';
import type { FeedbackSettings } from '../../../services/feedback.service';
import { nextEventPassword } from '../../../utils/passwordGenerator';
import { expiryFromToday } from '../event-details/settings/ExpiryField';
import type { PhotoSourceValues } from '../event-details/settings/PhotoSourceFields';

/** The feedback values the create screen sets (spec 5.5, 5.7). */
export type CreateFeedback = Pick<FeedbackSettings,
  'feedback_enabled' | 'allow_favorites' | 'allow_likes' | 'allow_ratings' | 'allow_comments' | 'allow_reactions' | 'identity_mode'>;

export interface CreateForm extends PhotoSourceValues {
  event_type: string;
  event_name: string;
  event_date: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_accounts: Array<{ id: number; email: string; displayName: string | null }>;
  require_password: boolean;
  password: string;
  client_access_enabled: boolean;
  client_password: string;
  /** yyyy-MM-dd, or '' for Never (spec 5.8). */
  expires_at: string;
  download_order_auto_approve: boolean;
  welcome_message: string;
  feedback: CreateFeedback;
}

export interface CreateType { slug: string; name: string; emoji: string; themePreset: string }

export interface CreateDefaults {
  type: CreateType | null;
  requirePassword: boolean;
  expiryDays: number;
  feedback: CreateFeedback;
  today: Date;
}

export interface CreateRequirements { customerName: boolean; customerEmail: boolean; eventDate: boolean; expiration: boolean }

export type CreateErrorField =
  'event_name' | 'event_date' | 'customer_name' | 'customer_email' | 'password' | 'client_password' | 'expires_at' | 'external_path';

type Settings = Record<string, unknown> | undefined;

/** What a new event starts with, from Settings and the type catalog (spec 2, 5.4, 5.7, 5.8). */
export function createDefaults(publicSettings: Settings, adminSettings: Settings, types: CreateType[], today: Date = new Date()): CreateDefaults {
  const pub = publicSettings ?? {};
  const days = Number(adminSettings?.general_default_expiration_days);
  return {
    type: types.find((type) => type.slug === 'wedding') ?? types[0] ?? null,
    requirePassword: pub.event_default_require_password !== false,
    expiryDays: Number.isInteger(days) && days >= 1 && days <= 365 ? days : 30,
    feedback: {
      feedback_enabled: pub.event_default_feedback_enabled === true,
      allow_favorites: pub.event_default_allow_favorites !== false,
      allow_likes: pub.event_default_allow_likes !== false,
      allow_ratings: pub.event_default_allow_ratings !== false,
      allow_comments: pub.event_default_allow_comments !== false,
      allow_reactions: pub.event_default_allow_reactions !== false,
      identity_mode: 'simple',
    },
    today,
  };
}

export function initialCreateForm(d: CreateDefaults): CreateForm {
  const eventDate = formatDate(d.today, 'yyyy-MM-dd');
  return {
    event_type: d.type?.slug ?? '',
    event_name: '',
    event_date: eventDate,
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    customer_accounts: [],
    require_password: d.requirePassword,
    // Spec 5.4: the field starts with a generated password, from the type and date.
    password: d.requirePassword ? nextEventPassword(d.type?.name ?? '', eventDate) : '',
    client_access_enabled: false,
    client_password: '',
    expires_at: expiryFromToday(d.expiryDays, d.today),
    download_order_auto_approve: false,
    welcome_message: '',
    source_mode: 'managed',
    external_path: '',
    external_watch: false,
    photo_cap: 0,
    default_photo_sort: 'upload_date_desc',
    feedback: { ...d.feedback },
  };
}

/** The next generated password: from the name typed so far, else the type's name (spec 5.4). */
export function generatedPassword(form: CreateForm, typeName: string, current: string): string {
  return nextEventPassword(form.event_name.trim() || typeName, form.event_date, current);
}

export function createRequirements(publicSettings: Settings): CreateRequirements {
  const pub = publicSettings ?? {};
  return {
    customerName: pub.event_require_customer_name !== false,
    customerEmail: pub.event_require_customer_email !== false,
    eventDate: pub.event_require_event_date !== false,
    expiration: pub.event_require_expiration !== false,
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordError(value: string, digitsOnly: RegExp): string | null {
  if (!value) return 'validation.passwordRequired';
  if (value.length < 6) return 'validation.passwordMinLength';
  if (digitsOnly.test(value)) return 'validation.passwordTooSimple';
  return null;
}

/** Field errors as i18n keys; empty when the form can be sent. */
export function validateCreateForm(form: CreateForm, req: CreateRequirements): Partial<Record<CreateErrorField, string>> {
  const errors: Partial<Record<CreateErrorField, string>> = {};
  if (!form.event_name.trim()) errors.event_name = 'validation.eventNameRequired';
  if (req.eventDate && !form.event_date) errors.event_date = 'validation.eventDateRequired';
  if (req.customerName && !form.customer_name.trim()) errors.customer_name = 'validation.hostNameRequired';
  if (req.customerEmail && !form.customer_email.trim()) errors.customer_email = 'validation.hostEmailRequired';
  else if (form.customer_email.trim() && !EMAIL.test(form.customer_email.trim())) errors.customer_email = 'validation.invalidEmailFormat';
  // The gallery floor keeps the old page's rule (six digits refused), the
  // client floor refuses any all-digit value, as before.
  if (form.require_password) {
    const error = passwordError(form.password, /^\d{1,6}$/);
    if (error) errors.password = error;
  }
  if (form.client_access_enabled) {
    const error = passwordError(form.client_password, /^\d+$/);
    if (error) errors.client_password = error;
  }
  if (req.expiration && !form.expires_at) errors.expires_at = 'validation.expiryRequired';
  if (form.source_mode === 'reference' && !form.external_path.trim()) errors.external_path = 'validation.externalFolderRequired';
  return errors;
}

/** Branding's theme from public settings, which may carry it as an object or a JSON string. */
export function brandingThemeOf(publicSettings: Settings): Partial<ThemeConfig> | null {
  const raw = publicSettings?.theme_config;
  if (raw && typeof raw === 'object') return raw as Partial<ThemeConfig>;
  if (typeof raw === 'string' && raw.startsWith('{')) {
    try { return JSON.parse(raw) as Partial<ThemeConfig>; } catch { return null; }
  }
  return null;
}

/**
 * The theme a new event stores (spec 5.5): nothing, so it follows Branding
 * live, unless the type has a preset other than 'default', whose name is
 * stored. The server always writes the header and divider style columns and
 * the gallery reads them first, so they come from that preset, else from
 * Branding's theme, as the old create page did.
 */
export function createThemeFields(themePreset: string | undefined, brandingTheme: Partial<ThemeConfig> | null | undefined) {
  const preset = themePreset && themePreset !== 'default' ? GALLERY_THEME_PRESETS[themePreset] : undefined;
  const source: Partial<ThemeConfig> = preset ? preset.config : brandingTheme ?? {};
  return {
    ...(preset ? { color_theme: themePreset } : {}),
    ...(source.headerStyle ? { header_style: source.headerStyle } : {}),
    ...(source.heroDividerStyle ? { hero_divider_style: source.heroDividerStyle } : {}),
  };
}

export interface PayloadContext {
  phoneFieldEnabled: boolean;
  themePreset: string | undefined;
  brandingTheme: Partial<ThemeConfig> | null;
}

/** The create request. Fields not on the screen are left to the server's defaults. */
export function buildCreatePayload(form: CreateForm, ctx: PayloadContext): Record<string, unknown> {
  const f = form.feedback;
  const phone = form.customer_phone.trim();
  return {
    event_type: form.event_type,
    event_name: form.event_name.trim(),
    event_date: form.event_date || undefined,
    customer_name: form.customer_name.trim(),
    customer_email: form.customer_email.trim(),
    ...(ctx.phoneFieldEnabled && phone ? { customer_phone: phone } : {}),
    ...(form.customer_accounts.length ? { customer_account_ids: form.customer_accounts.map((c) => c.id) } : {}),
    require_password: form.require_password,
    ...(form.require_password ? { password: form.password } : {}),
    client_access_enabled: form.client_access_enabled,
    ...(form.client_access_enabled ? { client_password: form.client_password } : {}),
    // A date, or null for Never (spec 5.8); expiration_days is never sent.
    expires_at: form.expires_at || null,
    welcome_message: form.welcome_message,
    ...createThemeFields(ctx.themePreset, ctx.brandingTheme),
    source_mode: form.source_mode,
    ...(form.source_mode === 'reference'
      ? { external_path: form.external_path.trim(), external_watch: form.external_watch }
      : {}),
    photo_cap: form.photo_cap > 0 ? form.photo_cap : null,
    default_photo_sort: form.default_photo_sort,
    feedback_enabled: f.feedback_enabled,
    allow_favorites: f.allow_favorites,
    allow_likes: f.allow_likes,
    allow_ratings: f.allow_ratings,
    allow_comments: f.allow_comments,
    allow_reactions: f.allow_reactions,
    identity_mode: f.identity_mode ?? 'simple',
  };
}
```

- [ ] **Step 5: Run it to verify it passes.** Same command as Step 2, then `npm run build:check`. Expected: all PASS, build clean. If `elegantWedding` has no `headerStyle`, the preset test still holds (it checks the name only).

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/pages/admin/create-event frontend/src/i18n/locales/en.json frontend/src/i18n/locales/de.json frontend/src/i18n/locales/vi.json
git commit -q -m "feat(events): rules for the new create screen"
```

---

### Task 6: The create screen, rebuilt from the shared fields, with the navigation guard

**Files:**
- Create: `frontend/src/pages/admin/create-event/EventTypeTiles.tsx`
- Create: `frontend/src/pages/admin/create-event/CreateEventForm.tsx`
- Rewrite: `frontend/src/pages/admin/CreateEventPage.tsx` (the route keeps importing `CreateEventPage` from here)
- Modify: `frontend/src/pages/admin/event-details/settings/AdvancedArea.tsx` (`forceOpen`)
- Create: `frontend/src/pages/admin/__tests__/createEventScreen.test.tsx`
- Create: `frontend/src/pages/admin/__tests__/createEventGone.test.ts`
- Modify: `frontend/src/pages/admin/__tests__/createEventClientAccess.test.tsx`, `createEventDoubleSubmit.test.tsx`, `createEventStrictModeMount.test.tsx` (data router harness), `createEventNoAdminEmail.test.ts`, `createEventNoTimes.test.ts` (read every create source)

**Interfaces:**
- Consumes: everything Task 2 to Task 5 produce; `useNavigationGuard(isDirty)` from `hooks/useNavigationGuard`; `useExpertMode()` and `AdvancedArea` from `event-details/settings/AdvancedArea`; `useActiveEventTypes()`; `usePublicSettings()`; `ExpiryField`; `WelcomeMessageEditor`, `CustomerAccountPicker`.
- Produces: `CreateEventPage` (unchanged export name); `AdvancedArea` gains `forceOpen?: boolean`; `FALLBACK_EVENT_TYPES: CreateType[]` and `toCreateType(type: EventType): CreateType` from `EventTypeTiles.tsx`.

- [ ] **Step 1: Write the failing screen test.** Create `pages/admin/__tests__/createEventScreen.test.tsx`:

```tsx
/**
 * The create screen (P5, spec 5.5): essentials first, defaults from
 * Settings, advanced options collapsed, an external folder on create, and
 * the navigation guard.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmDialogProvider } from '../../../components/common/ConfirmDialog';
import { expiryFromToday } from '../event-details/settings/ExpiryField';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k), i18n: { language: 'en' } }),
  };
});

const toastError = vi.fn();
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a), info: vi.fn() } }));

const state = vi.hoisted(() => ({
  publicSettings: {} as Record<string, unknown>,
  adminSettings: {} as Record<string, unknown> | Error,
  types: [] as unknown[],
}));

const createEvent = vi.fn();
vi.mock('../../../services/events.service', () => ({
  eventsService: { createEvent: (...args: unknown[]) => createEvent(...args) },
}));
const saveQuota = vi.fn();
vi.mock('../../../services/adminDownloadQuota.service', () => ({
  adminDownloadQuotaService: { saveQuota: (...args: unknown[]) => saveQuota(...args) },
}));
vi.mock('../../../services/settings.service', () => ({
  settingsService: {
    getAllSettings: vi.fn(async () => {
      if (state.adminSettings instanceof Error) throw state.adminSettings;
      return state.adminSettings;
    }),
  },
}));
vi.mock('../../../services/eventTypes.service', () => ({
  eventTypesService: { getActiveEventTypes: vi.fn(async () => state.types) },
}));
vi.mock('../../../hooks/usePublicSettings', () => ({
  PUBLIC_SETTINGS_QUERY_KEY: ['public-settings'],
  usePublicSettings: () => ({ data: state.publicSettings }),
}));
vi.mock('../../../contexts/FeatureFlagsContext', () => ({
  useFeatureFlags: () => ({ flags: {}, isLoading: false }),
  useFeatureEnabled: () => false,
}));
vi.mock('../../../contexts/PermissionsContext', () => ({
  usePermissions: () => ({ hasAnyPermission: () => true, hasPermission: () => true, isLoading: false }),
}));
vi.mock('../../../components/admin', async () => {
  const actual = await vi.importActual<any>('../../../components/admin');
  return { ...actual, WelcomeMessageEditor: () => null };
});
vi.mock('../../../components/admin/CustomerAccountPicker', () => ({ CustomerAccountPicker: () => null }));
vi.mock('../event-details/ExternalFolderPicker', () => ({
  ExternalFolderPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="External folder" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { CreateEventPage } from '../CreateEventPage';

const OPTIONAL = {
  event_require_customer_name: false, event_require_customer_email: false,
  event_require_event_date: false, event_require_expiration: false,
};
const OTHER = { id: 4, name: 'Other', slug_prefix: 'other', emoji: 'o', theme_preset: 'default', is_active: true };

function renderCreate() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/admin/events/new', element: <CreateEventPage /> },
    { path: '/admin/events/:id', element: <div>event page</div> },
    { path: '/admin/events', element: <div>events list</div> },
  ], { initialEntries: ['/admin/events/new'] });
  render(
    <QueryClientProvider client={qc}>
      <ConfirmDialogProvider>
        <RouterProvider router={router} />
      </ConfirmDialogProvider>
    </QueryClientProvider>,
  );
  return router;
}
const name = () => screen.findByPlaceholderText('events.eventNamePlaceholder');
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'events.createEvent' }));
const payload = () => createEvent.mock.calls[0][0];

beforeEach(() => {
  createEvent.mockReset();
  createEvent.mockResolvedValue({ id: 42 });
  saveQuota.mockReset();
  toastError.mockReset();
  state.publicSettings = { ...OPTIONAL, event_default_require_password: true };
  state.adminSettings = { general_default_expiration_days: 45 };
  state.types = [OTHER];
  try { localStorage.clear(); } catch { /* no storage */ }
});

describe('the create screen', () => {
  it('sends the defaults: preselected type, a generated password, the expiry from Settings, no theme', async () => {
    state.publicSettings = { ...state.publicSettings, theme_config: { headerStyle: 'hero', heroDividerStyle: 'curve' } };
    renderCreate();
    fireEvent.change(await name(), { target: { value: 'Anna' } });
    expect((screen.getByLabelText('events.galleryPassword') as HTMLInputElement).value.length).toBeGreaterThanOrEqual(6);
    submit();
    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(payload()).toMatchObject({
      event_type: 'other', event_name: 'Anna', require_password: true,
      expires_at: expiryFromToday(45), header_style: 'hero', hero_divider_style: 'curve', source_mode: 'managed',
    });
    expect(payload().password.length).toBeGreaterThanOrEqual(6);
    expect(payload()).not.toHaveProperty('color_theme');
    expect(payload()).not.toHaveProperty('expiration_days');
  });

  it('opens with 30 days when the admin settings cannot be read', async () => {
    state.adminSettings = new Error('403');
    renderCreate();
    fireEvent.change(await name(), { target: { value: 'Anna' } });
    submit();
    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(payload().expires_at).toBe(expiryFromToday(30));
  });

  it('honours the Settings requirements, and hides Never when an expiry is required', async () => {
    state.publicSettings = { event_default_require_password: false };
    renderCreate();
    await name();
    expect(screen.queryByRole('button', { name: 'Never' })).toBeNull();
    submit();
    expect(await screen.findByText('validation.eventNameRequired')).toBeInTheDocument();
    expect(screen.getByText('validation.hostNameRequired')).toBeInTheDocument();
    expect(screen.getByText('validation.hostEmailRequired')).toBeInTheDocument();
    expect(createEvent).not.toHaveBeenCalled();
  });

  it('offers Never when Settings do not require an expiry, and sends null for it', async () => {
    renderCreate();
    fireEvent.change(await name(), { target: { value: 'Anna' } });
    fireEvent.click(screen.getByRole('button', { name: 'Never' }));
    submit();
    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(payload().expires_at).toBeNull();
  });

  it('keeps advanced options collapsed, a Custom feedback default included', async () => {
    state.publicSettings = { ...state.publicSettings, event_default_feedback_enabled: true, event_default_allow_likes: false };
    renderCreate();
    fireEvent.change(await name(), { target: { value: 'Anna' } });
    expect(screen.queryByRole('radiogroup', { name: 'Guest feedback' })).toBeNull();
    expect(screen.queryByLabelText('Source Mode')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show advanced options' }));
    expect(screen.getByRole('radio', { name: /^Custom \(from Settings\)/ })).toBeChecked();
    submit();
    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(payload()).toMatchObject({ feedback_enabled: true, allow_likes: false, allow_favorites: true, allow_comments: true });
  });

  it('starts an event on an external folder, and refuses reference mode without one', async () => {
    renderCreate();
    fireEvent.change(await name(), { target: { value: 'Anna' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show advanced options' }));
    fireEvent.change(screen.getByLabelText('Source Mode'), { target: { value: 'reference' } });
    submit();
    expect(await screen.findByText('validation.externalFolderRequired')).toBeInTheDocument();
    expect(createEvent).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('External folder'), { target: { value: 'weddings/2026' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Watch folder for new files/ }));
    submit();
    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(payload()).toMatchObject({ source_mode: 'reference', external_path: 'weddings/2026', external_watch: true });
  });

  it('leaves the generated password alone when the name is typed, until Regenerate', async () => {
    renderCreate();
    const field = () => screen.getByLabelText('events.galleryPassword') as HTMLInputElement;
    await name();
    const first = field().value;
    fireEvent.change(await name(), { target: { value: 'Anna and Ben' } });
    expect(field().value).toBe(first);
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(field().value).not.toBe(first);
  });

  it('opens the event after create even when auto-approve could not be saved', async () => {
    saveQuota.mockRejectedValue(new Error('500'));
    renderCreate();
    fireEvent.change(await name(), { target: { value: 'Anna' } });
    fireEvent.click(screen.getByLabelText(/downloadQuotaAdmin\.card\.autoApproveLabel/));
    submit();
    expect(await screen.findByText('event page')).toBeInTheDocument();
    expect(saveQuota).toHaveBeenCalledWith(42, { auto_approve: true });
    expect(toastError).toHaveBeenCalledWith('errors.autoApproveSaveError');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks before leaving a filled form', async () => {
    renderCreate();
    fireEvent.change(await name(), { target: { value: 'Anna' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.back' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByPlaceholderText('events.eventNamePlaceholder')).toHaveValue('Anna');
  });

  it('leaves an untouched form without asking', async () => {
    renderCreate();
    await name();
    fireEvent.click(screen.getByRole('button', { name: 'common.back' }));
    expect(await screen.findByText('events list')).toBeInTheDocument();
  });

  it('keeps the form and the guard when the server refuses the create', async () => {
    createEvent.mockRejectedValue({ response: { data: { errors: [{ path: 'event_type', msg: 'Invalid event type' }] } } });
    renderCreate();
    fireEvent.change(await name(), { target: { value: 'Anna' } });
    submit();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('event_type: Invalid event type'));
    expect(screen.getByRole('button', { name: 'events.createEvent' })).not.toBeDisabled();
    expect(screen.getByPlaceholderText('events.eventNamePlaceholder')).toHaveValue('Anna');
    fireEvent.click(screen.getByRole('button', { name: 'common.back' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
```

Create `pages/admin/__tests__/createEventGone.test.ts`:

```ts
/**
 * Gone from create (spec 3, 5.5): the confirm password field, the theme
 * customizer, the CSS template and the guest upload controls.
 */
import fs from 'fs';
import path from 'path';
import { expect, it } from 'vitest';
import { createSources } from './createSources';

it('the create screen carries none of the removed controls', () => {
  expect(createSources()).not.toMatch(/confirm_password|ThemeCustomizerEnhanced|GalleryPreview|css_template_id|allow_user_uploads|upload_category/);
});

it('the create screen is built from the shared fields', () => {
  const src = createSources();
  for (const component of ['CustomerFields', 'PasswordField', 'ExpiryField', 'PhotoSourceFields', 'FeedbackModeSelector', 'IdentityModeField', 'WelcomeMessageEditor']) {
    expect(src).toMatch(new RegExp(`<${component}\\b`));
  }
  expect(fs.existsSync(path.resolve(__dirname, '../create-event/CreateEventForm.tsx'))).toBe(true);
});
```

and the helper `pages/admin/__tests__/createSources.ts`:

```ts
import fs from 'fs';
import path from 'path';

/** The create page and every file of the create-event folder, as one string. */
export function createSources(): string {
  const dir = path.resolve(__dirname, '../create-event');
  const files = [
    path.resolve(__dirname, '../CreateEventPage.tsx'),
    ...fs.readdirSync(dir).filter((f) => /\.tsx?$/.test(f)).map((f) => path.join(dir, f)),
  ];
  return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}
```

- [ ] **Step 2: Run them to verify they fail.** From `frontend/`: `npx vitest run src/pages/admin/__tests__/createEventScreen.test.tsx src/pages/admin/__tests__/createEventGone.test.ts`. Expected: FAIL (the folder `create-event` has no form yet, the old page still carries the theme customizer, and the screen tests do not find the new fields).

- [ ] **Step 3: Let a validation error open the advanced area.** In `AdvancedArea.tsx`:

```tsx
export const AdvancedArea: React.FC<{ expert: boolean; children: React.ReactNode; forceOpen?: boolean }> = ({ expert, children, forceOpen = false }) => {
```

and `const shown = expert || open || forceOpen;`.

- [ ] **Step 4: Write `EventTypeTiles.tsx`.**

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { EventType } from '../../../services/eventTypes.service';
import type { CreateType } from './createForm';

/** Used when the type catalog cannot be read. */
export const FALLBACK_EVENT_TYPES: CreateType[] = [
  { slug: 'wedding', name: 'Wedding', emoji: '💒', themePreset: 'elegantWedding' },
  { slug: 'birthday', name: 'Birthday', emoji: '🎂', themePreset: 'birthdayFun' },
  { slug: 'corporate', name: 'Corporate', emoji: '🏢', themePreset: 'corporateTimeline' },
  { slug: 'other', name: 'Other', emoji: '📸', themePreset: 'default' },
];

export const toCreateType = (type: EventType): CreateType => ({
  slug: type.slug_prefix, name: type.name, emoji: type.emoji, themePreset: type.theme_preset,
});

/** The event type as tiles (spec 5.5); the type only decides the theme preset. */
export const EventTypeTiles: React.FC<{ types: CreateType[]; value: string; onChange: (slug: string) => void }> = ({ types, value, onChange }) => {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-label={t('events.eventType')}>
      <span className="block text-sm font-medium text-body mb-2">{t('events.eventType')}</span>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {types.map((type) => (
          <button
            key={type.slug}
            type="button"
            role="radio"
            aria-checked={value === type.slug}
            onClick={() => onChange(type.slug)}
            className={`p-4 rounded-lg border-2 transition-all ${value === type.slug ? 'tile-selected' : 'border-line hover:border-line-strong'}`}
          >
            <div className="text-2xl mb-1" aria-hidden>{type.emoji}</div>
            <div className="text-sm font-medium text-heading">{type.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 5: Write `CreateEventForm.tsx`.**

```tsx
import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { ArrowLeft, Shield } from 'lucide-react';
import { Button, Card, Input, LocalizedDateInput } from '../../../components/common';
import { IdentityModeField, WelcomeMessageEditor } from '../../../components/admin';
import { CustomerAccountPicker } from '../../../components/admin/CustomerAccountPicker';
import { eventsService } from '../../../services/events.service';
import { adminDownloadQuotaService } from '../../../services/adminDownloadQuota.service';
import { useIsMounted } from '../../../hooks/useIsMounted';
import { useNavigationGuard } from '../../../hooks/useNavigationGuard';
import { AdvancedArea, useExpertMode } from '../event-details/settings/AdvancedArea';
import { CustomerFields } from '../event-details/settings/CustomerFields';
import { ExpiryField } from '../event-details/settings/ExpiryField';
import { FeedbackModeSelector } from '../event-details/settings/FeedbackModeSelector';
import { PasswordField } from '../event-details/settings/PasswordField';
import { PhotoSourceFields } from '../event-details/settings/PhotoSourceFields';
import { applyFeedbackMode, feedbackMode, offeredModes } from '../event-details/settings/feedbackMode';
import { EventTypeTiles } from './EventTypeTiles';
import {
  brandingThemeOf, buildCreatePayload, createDefaults, createRequirements, generatedPassword,
  initialCreateForm, validateCreateForm, type CreateErrorField, type CreateForm, type CreateType,
} from './createForm';

type Settings = Record<string, unknown> | undefined;

/**
 * The create screen (spec 5.5), built from the same fields as the event
 * page's Settings tab. The essentials are visible; everything else is under
 * "Advanced options". Submitting creates a draft and opens its Overview.
 */
export const CreateEventForm: React.FC<{ publicSettings: Settings; adminSettings: Settings; types: CreateType[] }> = ({
  publicSettings, adminSettings, types,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMountedRef = useIsMounted();
  // Re-entrancy guard for the create submit (QA 7.03): the button's disabled
  // state does not cover an implicit form submission or a requestSubmit.
  const isSubmittingRef = useRef(false);
  const [expert] = useExpertMode();
  const requirements = useMemo(() => createRequirements(publicSettings), [publicSettings]);
  const phoneFieldEnabled = publicSettings?.event_phone_field_enabled === true;
  const [defaults] = useState(() => createDefaults(publicSettings, adminSettings, types));
  const [initial] = useState(() => initialCreateForm(defaults));
  const [form, setForm] = useState<CreateForm>(initial);
  const [errors, setErrors] = useState<Partial<Record<CreateErrorField, string>>>({});
  const [created, setCreated] = useState(false);
  // Spec 5.2: leaving asks while the form differs from its defaults; the
  // redirect after a create is let through.
  const { allowNextNavigation } = useNavigationGuard(!created && JSON.stringify(form) !== JSON.stringify(initial));
  const type = types.find((candidate) => candidate.slug === form.event_type);
  const typeName = type?.name ?? '';
  const message = (key: string | undefined) => (key ? t(key) : undefined);

  const set = <K extends keyof CreateForm>(field: K, value: CreateForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  // Switching protection on is the user's own action: start with a generated
  // password. Off forgets a typed one, so a hidden field never rides along.
  const onPasswordToggle = (on: boolean) => {
    setForm((prev) => ({ ...prev, require_password: on, password: on ? (prev.password || generatedPassword(prev, typeName, '')) : '' }));
    setErrors((prev) => ({ ...prev, password: undefined }));
  };
  const onClientAccessToggle = (on: boolean) => {
    setForm((prev) => ({
      ...prev,
      client_access_enabled: on,
      client_password: on ? (prev.client_password || generatedPassword(prev, typeName, '')) : '',
    }));
    setErrors((prev) => ({ ...prev, client_password: undefined }));
  };

  const createMutation = useMutation({
    mutationFn: eventsService.createEvent,
    onSuccess: async (data) => {
      // Auto-approve lives on the download allowance settings, which the
      // create route never touches, so it is a second call. A failure must not
      // block the event the photographer already got.
      if (form.download_order_auto_approve) {
        try {
          await adminDownloadQuotaService.saveQuota(data.id, { auto_approve: true });
        } catch {
          toast.error(t('errors.autoApproveSaveError'));
        }
      }
      if (isMountedRef.current) {
        toast.success(t('toast.eventCreated'));
        setCreated(true);
        allowNextNavigation();
        navigate(`/admin/events/${data.id}`);
      }
    },
    onError: (error: any) => {
      const validationErrors = error.response?.data?.errors;
      if (Array.isArray(validationErrors)) {
        validationErrors.forEach((err: any) => toast.error(`${err.path || err.param}: ${err.msg}`));
      } else {
        toast.error(error.response?.data?.error || error.message || t('errors.eventCreationFailed'));
      }
    },
    onSettled: () => {
      isSubmittingRef.current = false;
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    const found = validateCreateForm(form, requirements);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    isSubmittingRef.current = true;
    createMutation.mutate(buildCreatePayload(form, {
      phoneFieldEnabled,
      themePreset: type?.themePreset,
      brandingTheme: brandingThemeOf(publicSettings),
    }) as Parameters<typeof eventsService.createEvent>[0]);
  };

  const checkbox = 'mt-1 w-4 h-4 text-accent border-line-strong rounded focus:ring-primary-500';
  const mode = feedbackMode(form.feedback);
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/admin/events')}>
          {t('common.back')}
        </Button>
        <h1 className="text-2xl font-bold text-heading">{t('events.create')}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <Card padding="md">
          <h2 className="text-lg font-semibold text-heading mb-4">{t('events.eventDetails')}</h2>
          <div className="space-y-4">
            <EventTypeTiles types={types} value={form.event_type} onChange={(slug) => set('event_type', slug)} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label={t('events.eventName')}
                placeholder={t('events.eventNamePlaceholder')}
                value={form.event_name}
                onChange={(e) => set('event_name', e.target.value)}
                error={message(errors.event_name)}
              />
              <LocalizedDateInput
                label={requirements.eventDate ? t('events.eventDate') : `${t('events.eventDate')} (${t('common.optional')})`}
                value={form.event_date}
                onChange={(iso) => set('event_date', iso)}
                error={message(errors.event_date)}
              />
            </div>
            <CustomerFields
              values={form}
              onChange={(field, value) => set(field, value)}
              phoneFieldEnabled={phoneFieldEnabled}
              required={{ name: requirements.customerName, email: requirements.customerEmail }}
              errors={{ customer_name: message(errors.customer_name), customer_email: message(errors.customer_email) }}
            />
            <CustomerAccountPicker value={form.customer_accounts} onChange={(next) => set('customer_accounts', next)} />
          </div>
        </Card>

        <Card padding="md">
          <h2 className="text-lg font-semibold text-heading mb-4">{t('events.accessAndSecurity')}</h2>
          <div className="space-y-4">
            <label className="flex items-start gap-2">
              <input type="checkbox" className={checkbox} checked={form.require_password} onChange={(e) => onPasswordToggle(e.target.checked)} />
              <span>
                <span className="text-sm font-medium text-body">{t('events.requirePasswordToggle')}</span>
                <span className="block text-xs text-muted mt-1">
                  {t('events.requirePasswordToggleHelp', 'Disable this if you want to share the gallery without a password. Anyone with the link will be able to view the photos.')}
                </span>
              </span>
            </label>
            {!form.require_password && (
              <div className="rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/30 p-3 text-xs text-orange-800 dark:text-orange-300">
                {t('events.publicGalleryWarning', 'Public galleries are accessible to anyone with the link. Consider watermarking downloaded files in Branding and monitoring activity.')}
              </div>
            )}
            {form.require_password && (
              <PasswordField
                label={t('events.galleryPassword')}
                value={form.password}
                onChange={(value) => set('password', value)}
                placeholder={t('events.passwordPlaceholder')}
                helperText={t('events.passwordHelperText', 'You can use dates like "04.07.2025" or any text with 6+ characters')}
                onRegenerate={() => set('password', generatedPassword(form, typeName, form.password))}
                regenerateLabel={t('events.access.regenerate', 'Regenerate')}
                error={message(errors.password)}
              />
            )}

            <div className="pt-4 border-t border-line">
              <h3 className="text-sm font-semibold text-heading mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-accent" />
                {t('clientAccess.adminTitle')}
              </h3>
              <label className="flex items-start gap-2">
                <input type="checkbox" className={checkbox} checked={form.client_access_enabled} onChange={(e) => onClientAccessToggle(e.target.checked)} />
                <span>
                  <span className="text-sm font-medium text-body">{t('clientAccess.enableToggle')}</span>
                  <span className="block text-xs text-muted mt-1">{t('clientAccess.enableDescription')}</span>
                </span>
              </label>
              {form.client_access_enabled && (
                <div className="mt-3 space-y-2">
                  <PasswordField
                    label={t('clientAccess.passwordLabel')}
                    value={form.client_password}
                    onChange={(value) => set('client_password', value)}
                    placeholder={t('clientAccess.passwordPlaceholder')}
                    helperText={t('clientAccess.passwordHelperText')}
                    onRegenerate={() => set('client_password', generatedPassword(form, typeName, form.client_password))}
                    regenerateLabel={t('clientAccess.generate', 'Generate')}
                    error={message(errors.client_password)}
                  />
                  {/* The link cannot exist yet: client_share_token is minted
                      with the event. */}
                  <p className="text-xs text-muted">{t('clientAccess.linkAfterCreate')}</p>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card padding="md">
          <ExpiryField value={form.expires_at} onChange={(iso) => set('expires_at', iso)} allowNever={!requirements.expiration} />
          {errors.expires_at && <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{message(errors.expires_at)}</p>}
        </Card>

        <Card padding="md">
          <h2 className="text-lg font-semibold text-heading mb-4">{t('events.settings.sectionDownloads', 'Downloads')}</h2>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className={checkbox}
              checked={form.download_order_auto_approve}
              onChange={(e) => set('download_order_auto_approve', e.target.checked)}
            />
            <span>
              <span className="text-sm font-medium text-body">{t('downloadQuotaAdmin.card.autoApproveLabel')}</span>
              <span className="block text-xs text-muted mt-1">{t('downloadQuotaAdmin.card.autoApproveHelp')}</span>
            </span>
          </label>
        </Card>

        <AdvancedArea expert={expert} forceOpen={!!errors.external_path}>
          <Card padding="md">
            <label className="block text-sm font-medium text-body mb-1">{t('events.welcomeMessageLabel')}</label>
            <WelcomeMessageEditor
              value={form.welcome_message}
              onChange={(value) => set('welcome_message', value)}
              placeholder={t('events.welcomeMessagePlaceholder')}
              rows={4}
            />
          </Card>
          <Card padding="md">
            <div className="space-y-4">
              <PhotoSourceFields
                values={form}
                onChange={(patch) => {
                  setForm((prev) => ({ ...prev, ...patch }));
                  setErrors((prev) => ({ ...prev, external_path: undefined }));
                }}
                folderError={message(errors.external_path)}
              />
            </div>
          </Card>
          <Card padding="md">
            <div className="space-y-4">
              <FeedbackModeSelector
                mode={mode}
                offered={offeredModes(form.feedback, defaults.feedback)}
                fromSettings={feedbackMode({ ...defaults.feedback, feedback_enabled: true }) === 'custom'}
                onSelect={(next) => set('feedback', applyFeedbackMode(form.feedback, defaults.feedback, next))}
              />
              {mode !== 'off' && (
                <IdentityModeField
                  value={form.feedback.identity_mode}
                  onChange={(identity_mode) => set('feedback', { ...form.feedback, identity_mode })}
                />
              )}
            </div>
          </Card>
        </AdvancedArea>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/admin/events')}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" isLoading={createMutation.isPending} disabled={createMutation.isPending}>
            {t('events.createEvent')}
          </Button>
        </div>
      </form>
    </div>
  );
};
```

The auto-approve label and help sit inside the checkbox's `<label>`, so its accessible name starts with the label key, which is how the screen test finds it (by regex, since the name joins both texts). If `events.welcomeMessageLabel` or `events.welcomeMessagePlaceholder` is missing in `en.json`, use the keys `DetailsSection.tsx` uses for the same editor.

- [ ] **Step 6: Rewrite `CreateEventPage.tsx` as the loader.**

```tsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { settingsService } from '../../services/settings.service';
import { usePublicSettings } from '../../hooks/usePublicSettings';
import { useActiveEventTypes } from '../../hooks/useActiveEventTypes';
import { CreateEventForm } from './create-event/CreateEventForm';
import { FALLBACK_EVENT_TYPES, toCreateType } from './create-event/EventTypeTiles';

const settled = (query: { data?: unknown; isError?: boolean }) => query.data !== undefined || query.isError === true;

/**
 * The create screen (spec 5.5). Its defaults come from Settings and the type
 * catalog, so the form mounts once all three have loaded or failed; a failed
 * read falls back (30 days, the built-in types) instead of blocking.
 */
export const CreateEventPage: React.FC = () => {
  const { t } = useTranslation();
  const publicQuery = usePublicSettings();
  // Needs settings.view; staff without it get the 30-day default.
  const settingsQuery = useQuery({ queryKey: ['admin-settings'], queryFn: () => settingsService.getAllSettings(), retry: false });
  const typesQuery = useActiveEventTypes();
  if (!settled(publicQuery) || !settled(settingsQuery) || !settled(typesQuery)) {
    return <div className="max-w-4xl mx-auto py-12 text-center text-muted">{t('common.loading')}</div>;
  }
  const types = typesQuery.data?.length ? typesQuery.data.map(toCreateType) : FALLBACK_EVENT_TYPES;
  return (
    <CreateEventForm
      publicSettings={publicQuery.data as Record<string, unknown> | undefined}
      adminSettings={settingsQuery.data as Record<string, unknown> | undefined}
      types={types}
    />
  );
};
```

- [ ] **Step 7: Run the new tests to verify they pass.** Same command as Step 2. Expected: all PASS. If the confirm dialog's buttons carry other names than `Stay`, read them from `useNavigationGuard.ts` (`settings.saveBar.leaveCancel`, fallback `Stay`) rather than changing the hook.

- [ ] **Step 8: Move the existing create tests to the data router.** In `createEventClientAccess.test.tsx`, `createEventDoubleSubmit.test.tsx` and `createEventStrictModeMount.test.tsx`:
  - import `createMemoryRouter, RouterProvider` instead of `MemoryRouter`, and `ConfirmDialogProvider` from `'../../../components/common/ConfirmDialog'`;
  - render with:

```tsx
  const router = createMemoryRouter([{ path: '/admin/events/new', element: <CreateEventPage /> }], { initialEntries: ['/admin/events/new'] });
  return render(
    <QueryClientProvider client={qc}>
      <ConfirmDialogProvider>
        <RouterProvider router={router} />
      </ConfirmDialogProvider>
    </QueryClientProvider>
  );
```

  (inside `<StrictMode>` for the Strict Mode file, as before);
  - make the first query of each test wait for the form: `await screen.findByPlaceholderText('events.eventNamePlaceholder')` where it read `screen.getByPlaceholderText(...)` first, and mark those tests `async`;
  - leave every assertion of `createEventDoubleSubmit.test.tsx` as it is (the spec says it "keeps its pins").

In `createEventClientAccess.test.tsx`, also:
  - change the header comment's last sentence to say the password field now starts generated (spec 5.4);
  - in "holds the same floor", expect `await screen.findByText('validation.passwordTooSimple')` instead of `/Password cannot be just numbers/` (messages are keys now);
  - add:

```tsx
  it('starts the client password generated and shown in clear (spec 5.4)', async () => {
    renderPage();
    await screen.findByPlaceholderText('events.eventNamePlaceholder');
    fireEvent.click(clientAccessToggle());
    const field = screen.getByLabelText('clientAccess.passwordLabel') as HTMLInputElement;
    expect(field).toHaveAttribute('type', 'text');
    expect(field.value.length).toBeGreaterThanOrEqual(6);
    expect(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument();
  });
```

  - `clientAccessToggle()` reads `screen.getByText('clientAccess.enableToggle').closest('label')`; it still works, since the toggle stays inside its label.

In `createEventNoAdminEmail.test.ts` and `createEventNoTimes.test.ts`, read `createSources()` from `./createSources` instead of `CreateEventPage.tsx` alone, so a removed field cannot come back in another file.

- [ ] **Step 9: Run every create test.** From `frontend/`: `npx vitest run src/pages/admin/__tests__/createEvent src/pages/admin/create-event src/pages/admin/event-details/settings`. Expected: all PASS. Then `npm run lint` and `npm run build:check`: clean.

- [ ] **Step 10: Commit.**

```bash
git add frontend/src/pages/admin/CreateEventPage.tsx frontend/src/pages/admin/create-event frontend/src/pages/admin/__tests__ frontend/src/pages/admin/event-details/settings/AdvancedArea.tsx
git commit -q -m "feat(events): rebuild the create screen from the shared fields"
```

---

### Task 7: The "Next steps" checklist on the Overview

**Files:**
- Create: `frontend/src/pages/admin/event-details/NextStepsChecklist.tsx`
- Create: `frontend/src/pages/admin/event-details/__tests__/NextStepsChecklist.test.tsx`
- Modify: `frontend/src/pages/admin/event-details/OverviewTab.tsx` (render it above the grid)
- Modify: `frontend/src/pages/admin/__tests__/eventSettingsSaveModel.test.tsx` (one page-level test)
- Modify: `frontend/src/i18n/locales/en.json`, `de.json`, `vi.json` (via addkeys)

**Interfaces:**
- Produces: `NextStepsChecklist` with props `{ event: Event; onUploadPhotos: () => void; onChooseHero: () => void; onPublish: () => void }`, rendering a `<section>` named "Next steps", or nothing when the event is published or archived.

- [ ] **Step 1: Add the strings.** Write `<scratchpad>/p5-nextsteps.json`:

```json
{
  "path": "events.nextSteps",
  "en": { "title": "Next steps", "uploadPhotos": "Upload photos", "uploadAction": "Upload", "chooseHero": "Choose a hero photo", "chooseHeroAction": "Choose", "publish": "Publish and send to the client", "publishAction": "Publish", "done": "done", "needsPermission": "Needs the {{permission}} permission" },
  "de": { "title": "Nächste Schritte", "uploadPhotos": "Fotos hochladen", "uploadAction": "Hochladen", "chooseHero": "Titelbild auswählen", "chooseHeroAction": "Auswählen", "publish": "Veröffentlichen und an den Kunden senden", "publishAction": "Veröffentlichen", "done": "erledigt", "needsPermission": "Benötigt die Berechtigung {{permission}}" },
  "vi": { "title": "Các bước tiếp theo", "uploadPhotos": "Tải ảnh lên", "uploadAction": "Tải lên", "chooseHero": "Chọn ảnh bìa", "chooseHeroAction": "Chọn", "publish": "Xuất bản và gửi cho khách hàng", "publishAction": "Xuất bản", "done": "đã xong", "needsPermission": "Cần quyền {{permission}}" }
}
```

and run `node <handover>/addkeys.js <scratchpad>/p5-nextsteps.json`. Match the German and Vietnamese words for "hero photo" and "publish" to the ones `de.json` and `vi.json` already use for the hero picker and the publish dialog; change the values above if they differ.

- [ ] **Step 2: Write the failing test.** Create `event-details/__tests__/NextStepsChecklist.test.tsx`:

```tsx
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Event } from '../../../../types';
import { NextStepsChecklist } from '../NextStepsChecklist';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : (fb as { defaultValue?: string })?.defaultValue ?? k),
  }),
}));
const allowed = vi.fn((_p: string) => true);
vi.mock('../../../../hooks/usePermission', () => ({ usePermission: (p: string) => allowed(p) }));

const draft = { id: 1, event_name: 'Anna', is_draft: true, is_archived: false, photo_count: 0, header_style: 'standard', hero_photo_id: null } as unknown as Event;
const handlers = () => ({ onUploadPhotos: vi.fn(), onChooseHero: vi.fn(), onPublish: vi.fn() });
const list = () => within(screen.getByRole('region', { name: 'Next steps' }));

describe('NextStepsChecklist (spec 5.6)', () => {
  beforeEach(() => allowed.mockImplementation(() => true));

  it('shows nothing once the event is published or archived', () => {
    const { rerender, container } = render(<NextStepsChecklist event={{ ...draft, is_draft: false }} {...handlers()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<NextStepsChecklist event={{ ...draft, is_archived: true }} {...handlers()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('asks for photos, then ticks the step from the saved count', () => {
    const h = handlers();
    const { rerender } = render(<NextStepsChecklist event={draft} {...h} />);
    fireEvent.click(list().getByRole('button', { name: 'Upload' }));
    expect(h.onUploadPhotos).toHaveBeenCalled();
    rerender(<NextStepsChecklist event={{ ...draft, photo_count: 12 }} {...h} />);
    expect(list().queryByRole('button', { name: 'Upload' })).toBeNull();
    expect(list().getByText(/\(done\)/)).toBeInTheDocument();
  });

  it('asks for a hero photo only when the header uses one', () => {
    const { rerender } = render(<NextStepsChecklist event={draft} {...handlers()} />);
    expect(list().queryByText('Choose a hero photo')).toBeNull();
    rerender(<NextStepsChecklist event={{ ...draft, header_style: 'hero' }} {...handlers()} />);
    expect(list().getByRole('button', { name: 'Choose' })).toBeInTheDocument();
    rerender(<NextStepsChecklist event={{ ...draft, header_style: 'hero', hero_photo_id: 5 }} {...handlers()} />);
    expect(list().queryByRole('button', { name: 'Choose' })).toBeNull();
  });

  it('publishes through the dialog the page already has', () => {
    const h = handlers();
    render(<NextStepsChecklist event={draft} {...h} />);
    fireEvent.click(list().getByRole('button', { name: 'Publish' }));
    expect(h.onPublish).toHaveBeenCalled();
  });

  it('keeps a step it cannot do, locked, with the reason', () => {
    allowed.mockImplementation((p) => p !== 'photos.upload');
    render(<NextStepsChecklist event={draft} {...handlers()} />);
    expect(list().getByRole('button', { name: 'Upload' })).toBeDisabled();
    expect(list().getByText('Needs photos.upload')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to verify it fails.** From `frontend/`: `npx vitest run src/pages/admin/event-details/__tests__/NextStepsChecklist.test.tsx`. Expected: FAIL, module missing.

- [ ] **Step 4: Implement `NextStepsChecklist.tsx`.**

```tsx
import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Circle } from 'lucide-react';
import type { Event } from '../../../types';
import { Card } from '../../../components/common';
import { usePermission } from '../../../hooks/usePermission';

/**
 * "Next steps" on the Overview while the event is a draft (spec 5.6), each
 * ticked from saved data: photos uploaded, a hero photo when the header uses
 * one, then publish through the page's existing dialog. A step the user may
 * not do stays visible, locked, with the reason (spec 5.3).
 */
export const NextStepsChecklist: React.FC<{
  event: Event;
  onUploadPhotos: () => void;
  onChooseHero: () => void;
  onPublish: () => void;
}> = ({ event, onUploadPhotos, onChooseHero, onPublish }) => {
  const { t } = useTranslation();
  const titleId = useId();
  const canUpload = usePermission('photos.upload');
  const canEdit = usePermission('events.edit');
  if (!event.is_draft || event.is_archived) return null;
  const steps = [
    {
      key: 'photos', done: (event.photo_count ?? 0) > 0, onClick: onUploadPhotos, allowed: canUpload, permission: 'photos.upload',
      label: t('events.nextSteps.uploadPhotos', 'Upload photos'), action: t('events.nextSteps.uploadAction', 'Upload'),
    },
    ...(event.header_style === 'hero' ? [{
      key: 'hero', done: !!event.hero_photo_id, onClick: onChooseHero, allowed: canEdit, permission: 'events.edit',
      label: t('events.nextSteps.chooseHero', 'Choose a hero photo'), action: t('events.nextSteps.chooseHeroAction', 'Choose'),
    }] : []),
    {
      key: 'publish', done: false, onClick: onPublish, allowed: canEdit, permission: 'events.edit',
      label: t('events.nextSteps.publish', 'Publish and send to the client'), action: t('events.nextSteps.publishAction', 'Publish'),
    },
  ];
  return (
    <section aria-labelledby={titleId}>
      <Card padding="md">
        <h2 id={titleId} className="text-lg font-semibold text-heading mb-3">{t('events.nextSteps.title', 'Next steps')}</h2>
        <ol className="space-y-3">
          {steps.map((step) => (
            <li key={step.key} className="flex items-center gap-3">
              {step.done
                ? <CheckCircle aria-hidden className="w-5 h-5 text-green-600 dark:text-green-400" />
                : <Circle aria-hidden className="w-5 h-5 text-muted" />}
              <span className={`flex-1 text-sm ${step.done ? 'text-muted line-through' : 'text-heading'}`}>
                {step.label}
                {step.done && <span className="sr-only"> ({t('events.nextSteps.done', 'done')})</span>}
              </span>
              {!step.done && (
                <span className="flex flex-col items-end">
                  <button
                    type="button"
                    className="text-sm font-medium text-accent disabled:opacity-50"
                    disabled={!step.allowed}
                    aria-disabled={!step.allowed}
                    onClick={step.onClick}
                  >
                    {step.action}
                  </button>
                  {!step.allowed && (
                    <span className="text-xs text-muted">
                      {t('events.nextSteps.needsPermission', { permission: step.permission, defaultValue: `Needs ${step.permission}` })}
                    </span>
                  )}
                </span>
              )}
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
};
```

The test's `t` mock returns `defaultValue` for the permission line, which is why it expects `Needs photos.upload`.

- [ ] **Step 5: Run it to verify it passes.** Same command as Step 3. Expected: 5 PASS.

- [ ] **Step 6: Put it on the Overview.** In `OverviewTab.tsx`, wrap the returned grid:

```tsx
  return (
    <div className="space-y-6">
      {/* Spec 5.6: shown only while the event is a draft. */}
      <NextStepsChecklist
        event={event}
        onUploadPhotos={() => setActiveTab('photos')}
        onChooseHero={() => openSettings('appearance')}
        onPublish={() => setShowPublishDialog(true)}
      />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* the two existing columns, unchanged */}
      </div>
    </div>
  );
```

keeping both existing column `<div>`s exactly as they are inside the grid, and add `import { NextStepsChecklist } from './NextStepsChecklist';`.

- [ ] **Step 7: Pin "publish from the checklist" on the real page.** In `eventSettingsSaveModel.test.tsx`, add (using the file's own `open`, `getEvent` and `legacyEvent`):

```tsx
  it('publishes a draft from the Next steps list (spec 5.6)', async () => {
    getEvent.mockResolvedValue({ ...legacyEvent, is_draft: 1 });
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter(
      [{ path: '/admin/events/:id', element: <EventDetailsPage /> }],
      { initialEntries: ['/admin/events/7'] },
    );
    render(
      <QueryClientProvider client={queryClient}>
        <ConfirmDialogProvider>
          <RouterProvider router={router} />
        </ConfirmDialogProvider>
      </QueryClientProvider>,
    );
    const steps = within(await screen.findByRole('region', { name: 'Next steps' }));
    fireEvent.click(steps.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
```

If the file's `getEvent` mock is set up per test in a `beforeEach`, put this `mockResolvedValue` after it, and import `within` from `@testing-library/react` if it is not imported yet. If `PublishGalleryDialog` renders without `role="dialog"`, wait for its heading text instead; do not change the dialog for the test.

- [ ] **Step 8: Run the Overview and page suites.** From `frontend/`: `npx vitest run src/pages/admin/event-details src/pages/admin/__tests__/eventSettingsSaveModel.test.tsx src/pages/admin/__tests__/eventDetailsPhotosTab.test.tsx`. Expected: all PASS; the inventory's "leaves nothing editable on the Overview" still passes, since the checklist edits nothing.

- [ ] **Step 9: Commit.**

```bash
git add frontend/src/pages/admin/event-details frontend/src/pages/admin/__tests__/eventSettingsSaveModel.test.tsx frontend/src/i18n/locales/en.json frontend/src/i18n/locales/de.json frontend/src/i18n/locales/vi.json
git commit -q -m "feat(events): next steps checklist on a draft's overview"
```

---

### Task 8: The create e2e spec follows the new screen

**Files:**
- Modify: `tests/e2e/admin-create-event-ui.spec.ts`

**Interfaces:**
- Consumes: the create screen of Task 6 and the checklist of Task 7.

- [ ] **Step 1: Update the spec.** Replace the block from `await page.getByLabel(/Gallery Password/i).fill('UiPlay123!');` through the end of the test with:

```ts
  // The password starts generated and shown in clear (spec 5.4); typing one's
  // own still works, and there is no confirm field any more.
  const password = page.getByLabel(/Gallery Password/i);
  await expect(password).not.toHaveValue('');
  await password.fill('UiPlay123!');
  await expect(page.getByLabel(/Confirm Password/i)).toHaveCount(0);

  await page.getByRole('button', { name: /Create Event/i }).click();

  await expect(page).toHaveURL(/\/admin\/events\/\d+/, { timeout: 20000 });
  await expect(page.getByRole('heading', { name: eventName })).toBeVisible();
  // A new event is a draft and opens on its Overview with the checklist (spec 5.5, 5.6).
  await expect(page.getByRole('region', { name: 'Next steps' })).toBeVisible();
```

`getByLabel(/Gallery Password/i)` matches only the password field: the switch above it reads "Require password for this gallery".

- [ ] **Step 2: Check it compiles.** From the repo root: `npx tsc --noEmit -p tests/e2e` if that project file exists, else `npx playwright test --list tests/e2e/admin-create-event-ui.spec.ts`. Expected: the test is listed with no error. It runs for real in the E2E smoke job on PR #2 (it carries `@smoke`); Docker Desktop is off on this machine.

- [ ] **Step 3: Commit.**

```bash
git add tests/e2e/admin-create-event-ui.spec.ts
git commit -q -m "test(e2e): create an event on the new screen"
```

---

### Task 9: Gates, the spec record, and CI

**Files:**
- Modify: `docs/superpowers/specs/2026-09-28-event-form-redesign-design.md` (a "Done" line under "P5: New create screen")

- [ ] **Step 1: Repo-wide checks.**
  - `rg -n "confirm_password|ThemeCustomizerEnhanced|css_template_id|expiration_days" frontend/src/pages/admin/CreateEventPage.tsx frontend/src/pages/admin/create-event`: zero.
  - No em-dash or en-dash on an added line: `git diff cb2197b0..HEAD` saved to a scratchpad file with a plain redirect, then `rg -n "^\+.*[\x{2014}\x{2013}]" <that file>` prints nothing. The emoji in `FALLBACK_EVENT_TYPES` moved from the old page and are not dashes. Two plain commands: the worktree checker refuses a pipe into git.
  - `cd frontend && npm run i18n:status`: the absent counts for `de` and `vi` are the branch baseline 64 and 39, not higher.

- [ ] **Step 2: The local gate.** Run `bash <handover>/gates.sh p5` with `run_in_background`, and edit nothing until it ends. Read `<handover>/p5-summary.txt`: new failures against the baselines must be none, apart from the known load flakes (`customerGroups.test.tsx`, `webhookDelivery.test.js`, `streamResponse.test.js`, `pdfRenderIsolation.test.js`), each rerun alone and green. If the memory reaper kills the gate, stop and report; do not restart it without the user's word.

- [ ] **Step 3: Record the phase in the spec.** Under `### P5: New create screen`, add `Done <date>: <first P5 commit>..<last P5 commit>. Verified by the Tests workflow and the E2E smoke subset on PR #2 of the fork. The expiry is preselected from Settings even where Settings do not require one, with Never one click away.` Commit:

```bash
git add docs/superpowers/specs/2026-09-28-event-form-redesign-design.md
git commit -q -m "docs(spec): record P5"
```

- [ ] **Step 4: Push and watch CI.** `git push`, then find the runs PR #2 triggered with `gh run list --repo DoDucHoa/picpeak --branch worktree-event-form-redesign --limit 8` and watch the Tests run with `gh run watch <id> --repo DoDucHoa/picpeak --exit-status` in the background. Rename PR #2 with `gh api -X PATCH repos/DoDucHoa/picpeak/pulls/2 -f title="feat(events): event form redesign, phases P-1 to P5"`. Read the job logs (`gh run view <id> --repo DoDucHoa/picpeak --log`), not only the exit code. The phase is done when Tests, E2E smoke, Schema drift, Fresh-install smoke and Docker build are green, and the final reviewer's findings are fixed or ruled.
