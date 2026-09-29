# P1 Download Protection to Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block right-click, developer tools detection and lightbox canvas rendering become global switches in Settings, Image security, live for every gallery; the event page stops offering them per event.

**Architecture:** A new setting `disable_right_click` (seeded on by migration 258) joins the two that already exist (`enable_devtools_protection`, `enable_canvas_rendering`). One backend helper, `getGalleryProtectionSettings()` in `backend/src/services/eventSettings.js`, reads all three; both gallery resolvers (`routes/gallery/metadata.js`, `services/galleryQueryService.js`) return its values instead of the event columns. The gallery frontend stops turning devtools detection and canvas on from `protection_level`, so the three payload flags are the only switches.

**Tech Stack:** Node/Express + knex (SQLite in tests, Postgres in production), Jest + supertest, React 18 + Vitest, i18next, Playwright specs (not run on this machine).

**Spec:** `docs/superpowers/specs/2026-09-28-event-form-redesign-design.md`, section 5.10 (rows "Block right-click", "Detect developer tools", "Canvas rendering in the lightbox", "Default protection level, image quality"), the paragraph under 5.10 defining "ignored", and section 6 "P1".

## Global Constraints

- The event columns `disable_right_click`, `enable_devtools_protection`, `use_canvas_rendering` stay (no DDL) and keep being written on create; nothing decides gallery behaviour from them any more.
- `default_protection_level` and `default_image_quality` stay creation-time defaults (spec 5.10, section 9). `protection_level` keeps its other effects (detection sensitivity and redirect for `maximum`); only the devtools and canvas implications go.
- "Allow downloads" stays on the event page until P2 moves it.
- The Image security PUT only UPDATES existing rows (`adminImageSecurity.js`), so every new key needs a seed row, or saving it is a silent no-op.
- New migrations are numbered above upstream's highest (256 today) and above P0's 257, so this one is `258_`.
- Every new or reworded user-facing string gets `en`, `de` and `vi` in the same change. Existing keys are never pruned.
- No em-dash (U+2014) or en-dash (U+2013) in anything written into the repo. Conventional Commits.
- `backend/jest.setup.js` keeps its `DATABASE_CLIENT` pin. Backend Jest from `backend/`, Vitest from `frontend/`.
- Never edit a source file while a background test run is in flight. Run git as plain single commands.

## Review Focus

1. **An install whose Image security canvas switch is already on** now gets canvas in every gallery's lightbox, including galleries created while it was off. Expected by the spec; section 8 count 3 measures it before deploy. Pinned by Task 3 Step 1 (global on reaches the payload).
2. **An event created with right-click allowed** (column 0) blocks right-click after the deploy, because the seed is on. Pinned by Task 3 Step 1 (column 1, global off gives false, and the reverse).
3. **A gallery at protection level `maximum` with devtools and canvas off globally** gets neither. Pinned by Task 4 Step 1.
4. **Saving the Image security tab** keeps a right-click choice across a reload (the PUT would drop an unseeded key). Pinned by Task 2 Step 1.
5. **The password page and client access page** (`/info`) report the same three values as the gallery payload (`/photos`). Pinned by Task 3 Step 1.

---

### Task 1: Migration 258: seed the right-click switch, drop the dormant 037 rows

**Files:**
- Create: `backend/migrations/core/258_global_right_click.js`
- Test: `backend/__tests__/migrations/258_global_right_click.test.js`

**Interfaces:**
- Produces: row `app_settings.disable_right_click` = `true` (JSON), `setting_type` `security`, only when absent. Rows `default_disable_right_click` and `default_watermark_downloads` deleted.

- [ ] **Step 1: Write the failing test**

```js
// backend/__tests__/migrations/258_global_right_click.test.js
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'migration-258-secret-at-least-32-chars';

const { bootCrmDb } = require('../integration/helpers/crmDb');
const migration = require('../../migrations/core/258_global_right_click');

let db; let cleanup;
beforeAll(async () => { ({ db, cleanup } = await bootCrmDb()); }, 120000);
afterAll(async () => { await cleanup(); });

const row = (key) => db('app_settings').where({ setting_key: key }).first();

it('seeds the global right-click switch on', async () => {
  const r = await row('disable_right_click');
  expect(JSON.parse(r.setting_value)).toBe(true);
  expect(r.setting_type).toBe('security');
});

it('keeps a value an admin already chose when it runs again', async () => {
  await db('app_settings').where({ setting_key: 'disable_right_click' })
    .update({ setting_value: JSON.stringify(false) });
  await migration.up(db);
  expect(JSON.parse((await row('disable_right_click')).setting_value)).toBe(false);
});

it('deletes the two creation defaults nothing reads', async () => {
  await db('app_settings').insert([
    { setting_key: 'default_disable_right_click', setting_value: 'false', setting_type: 'gallery' },
    { setting_key: 'default_watermark_downloads', setting_value: 'false', setting_type: 'gallery' },
  ]).onConflict('setting_key').ignore();
  await migration.up(db);
  expect(await row('default_disable_right_click')).toBeUndefined();
  expect(await row('default_watermark_downloads')).toBeUndefined();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest __tests__/migrations/258_global_right_click.test.js`
Expected: FAIL: `Cannot find module '../../migrations/core/258_global_right_click'`.

- [ ] **Step 3: Implement**

```js
// backend/migrations/core/258_global_right_click.js
/**
 * Right-click blocking becomes one switch for every gallery (P1 of the
 * event form redesign), next to devtools detection and canvas rendering in
 * Image security. It starts on, the value new events have always had.
 *
 * The two creation defaults migration 037 seeded are read by nothing and
 * go: right-click is now this global switch, and download watermarks are
 * the Branding switch from migration 257.
 */
exports.up = async function up(knex) {
  const existing = await knex('app_settings').where({ setting_key: 'disable_right_click' }).first();
  if (!existing) {
    await knex('app_settings').insert({
      setting_key: 'disable_right_click',
      setting_value: JSON.stringify(true),
      setting_type: 'security',
      updated_at: new Date(),
    });
  }
  await knex('app_settings')
    .whereIn('setting_key', ['default_disable_right_click', 'default_watermark_downloads'])
    .delete();
};

exports.down = async function down(knex) {
  await knex('app_settings').where({ setting_key: 'disable_right_click' }).delete();
  for (const key of ['default_disable_right_click', 'default_watermark_downloads']) {
    const row = await knex('app_settings').where({ setting_key: key }).first();
    if (!row) {
      await knex('app_settings').insert({
        setting_key: key, setting_value: JSON.stringify(false), setting_type: 'gallery',
      });
    }
  }
};
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest __tests__/migrations/258_global_right_click.test.js` then `npx jest __tests__/migrations`
Expected: PASS, 3 tests; the migrations folder stays green.

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/core/258_global_right_click.js backend/__tests__/migrations/258_global_right_click.test.js
git commit -m "feat(security): seed a global right-click switch and drop dormant defaults"
```

---

### Task 2: Image security reads and saves the right-click switch

**Files:**
- Modify: `backend/src/routes/adminImageSecurity.js` (GET `whereIn` list, PUT `validSettings`)
- Test: `backend/__tests__/routes/adminImageSecurityRightClick.test.js`

**Interfaces:**
- Consumes: the seed row from Task 1.
- Produces: `GET /settings` returns `disable_right_click` (boolean); `PUT /settings` stores it.

- [ ] **Step 1: Write the failing test**

```js
// backend/__tests__/routes/adminImageSecurityRightClick.test.js
/**
 * The right-click switch round-trips through the Image security tab. The PUT
 * only updates rows that exist, so this also pins the seed from migration 258.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'image-security-right-click-secret-32';

const request = require('supertest');
const { bootCrmDb, seedMinimal, assignAdminRole, mintAdminToken, buildRouteApp } = require('../integration/helpers/crmDb');

let db; let cleanup; let app; let token;
beforeAll(async () => {
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
```

Check `buildRouteApp`'s signature in `backend/__tests__/integration/helpers/crmDb.js` and the call in `__tests__/integration/imageSecurityOwnership.test.js` before running; match them.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest __tests__/routes/adminImageSecurityRightClick.test.js --forceExit`
Expected: FAIL: `disable_right_click` is undefined in both GETs.

- [ ] **Step 3: Implement**

Add `'disable_right_click',` after `'enable_devtools_protection',` in BOTH lists of `adminImageSecurity.js` (the GET `whereIn` and the PUT `validSettings`).

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest __tests__/routes/adminImageSecurityRightClick.test.js --forceExit`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/adminImageSecurity.js backend/__tests__/routes/adminImageSecurityRightClick.test.js
git commit -m "feat(security): read and save the right-click switch in Image security"
```

---

### Task 3: Both gallery resolvers return the global protection switches

**Files:**
- Modify: `backend/src/services/eventSettings.js` (new `getGalleryProtectionSettings`, exported)
- Modify: `backend/src/services/galleryQueryService.js` (the `protectionSettings` object near line 353 and the three fields near lines 436 to 441)
- Modify: `backend/src/routes/gallery/metadata.js` (the three fields near lines 264 to 269, and their three entries in the `select` list near lines 175 to 180)
- Test: `backend/__tests__/routes/gallerySqliteBooleanFlags.test.js` (the `protection flags` describe)

**Interfaces:**
- Consumes: settings `disable_right_click` (Task 1), `enable_devtools_protection`, `enable_canvas_rendering`.
- Produces: `getGalleryProtectionSettings() -> Promise<{ disable_right_click: boolean, enable_devtools_protection: boolean, use_canvas_rendering: boolean }>`, defaults `true`, `true`, `false` when a setting is absent or not a boolean (the seeded values).

- [ ] **Step 1: Write the failing test**

In `gallerySqliteBooleanFlags.test.js`, replace the whole `describe('protection flags', ...)` block with:

```js
  // Right-click, devtools and canvas are one switch each in Image security,
  // live for every gallery; the event columns no longer decide them.
  describe('protection flags', () => {
    const setGlobal = (key, value) => db('app_settings')
      .insert({ setting_key: key, setting_value: JSON.stringify(value), setting_type: 'security' })
      .onConflict('setting_key').merge();
    const setGlobals = async (value) => {
      await setGlobal('disable_right_click', value);
      await setGlobal('enable_devtools_protection', value);
      await setGlobal('enable_canvas_rendering', value);
    };
    const getInfo = async () => {
      const res = await request(app).get(`/api/gallery/${SLUG}/info`);
      expect(res.status).toBe(200);
      return res.body;
    };
    const flags = (e) => [e.disable_right_click, e.enable_devtools_protection, e.use_canvas_rendering];

    afterAll(async () => {
      await setGlobals(false);
      await setEventFlags({ disable_right_click: 0, enable_devtools_protection: 0, use_canvas_rendering: 0 });
    });

    test('the event columns are ignored when the switches are off', async () => {
      await setGlobals(false);
      await setEventFlags({ disable_right_click: 1, enable_devtools_protection: 1, use_canvas_rendering: 1 });
      expect(flags(await getPayload())).toEqual([false, false, false]);
      expect(flags(await getInfo())).toEqual([false, false, false]);
    });

    test('the switches apply to an event whose columns are off', async () => {
      await setGlobals(true);
      await setEventFlags({ disable_right_click: 0, enable_devtools_protection: 0, use_canvas_rendering: 0 });
      expect(flags(await getPayload())).toEqual([true, true, true]);
      expect(flags(await getInfo())).toEqual([true, true, true]);
    });

    test('overlay protection is still reported the way it is stored', async () => {
      await setEventFlags({ overlay_protection: 0 });
      expect((await getPayload()).overlay_protection).toBe(false);
    });
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest __tests__/routes/gallerySqliteBooleanFlags.test.js --forceExit`
Expected: FAIL on the first two tests (the payloads mirror the event columns).

- [ ] **Step 3: Implement**

In `eventSettings.js`, after `getDownloadProtectionDefaults`, and add `getGalleryProtectionSettings,` to `module.exports`:

```js
/**
 * The three guest protections, one switch each in Image security and live
 * for every gallery (P1 of the event form redesign). The event columns of
 * the same names are still written on create but decide nothing.
 */
const getGalleryProtectionSettings = async () => {
  const [rightClick, devtools, canvas] = await Promise.all([
    readBooleanSetting('disable_right_click'),
    readBooleanSetting('enable_devtools_protection'),
    readBooleanSetting('enable_canvas_rendering'),
  ]);
  return {
    disable_right_click: rightClick ?? true,
    enable_devtools_protection: devtools ?? true,
    use_canvas_rendering: canvas ?? false,
  };
};
```

In `galleryQueryService.js`:
1. Require it: `const { getGalleryProtectionSettings } = require('./eventSettings');`.
2. Delete the `use_canvas_rendering` line from the `protectionSettings` object. This is not cosmetic: `...protectionSettings` is the LAST entry of the `event` payload object, so its copy of the event column overrides any explicit `use_canvas_rendering` written above it (spec P1, "the duplicate in the spread").
3. Add `const guardProtection = await getGalleryProtectionSettings();` next to `const downloadPolicy = await resolveEventDownloadPolicy(event);`.
4. Replace the three event-column fields in the payload (`disable_right_click: parseBooleanInput(event.disable_right_click, false)`, and the same for `enable_devtools_protection` and `use_canvas_rendering`) with:

```js
      disable_right_click: guardProtection.disable_right_click,
      enable_devtools_protection: guardProtection.enable_devtools_protection,
      use_canvas_rendering: guardProtection.use_canvas_rendering,
```

In `metadata.js`: require it (`const { getGalleryProtectionSettings } = require('../../services/eventSettings');`), remove `'disable_right_click'`, `'enable_devtools_protection'` and `'use_canvas_rendering'` from the `select(...)` list, add `const guardProtection = await getGalleryProtectionSettings();` next to `const globalHeroLogoVisible = ...`, and replace the three fields with the same three `guardProtection.*` lines as above.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest __tests__/routes/gallerySqliteBooleanFlags.test.js __tests__/integration/imageSecurityDefaults.test.js --forceExit`, then `npx eslint src/services/eventSettings.js src/services/galleryQueryService.js src/routes/gallery/metadata.js`
Expected: PASS; lint clean. `imageSecurityDefaults.test.js` pins the creation-time mapping, which this task does not touch; it must stay green unchanged (spec P1 lists it as a suite to update only if it asserts per-event gallery values, and it asserts none).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/eventSettings.js backend/src/services/galleryQueryService.js backend/src/routes/gallery/metadata.js backend/__tests__/routes/gallerySqliteBooleanFlags.test.js
git commit -m "feat(gallery): take right-click, devtools and canvas from Image security"
```

---

### Task 4: The gallery stops deriving devtools and canvas from the protection level

**Files:**
- Modify: `frontend/src/components/gallery/GalleryView.tsx` (`devToolsEnabled`, near line 270)
- Modify: `frontend/src/components/gallery/PhotoLightbox.tsx` (`devToolsEnabled` near line 209; `useCanvasRendering=` near line 1273)
- Modify: `frontend/src/components/gallery/layouts/PremiumLightboxImage.tsx` (the canvas condition near line 18)
- Modify: `frontend/src/components/gallery/__tests__/canvasLightboxOnly.test.ts`
- Modify: `frontend/src/components/gallery/__tests__/GalleryPremiumLayout.canvas.test.tsx` (the `{ useCanvasRendering: false, protectionLevel: 'maximum' }` case)
- Test: `frontend/src/components/gallery/__tests__/protectionLevelNoImplications.test.ts`

**Interfaces:**
- Consumes: the payload flags from Task 3 (`enable_devtools_protection`, `use_canvas_rendering`), unchanged in shape.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/components/gallery/__tests__/protectionLevelNoImplications.test.ts
/**
 * Devtools detection and lightbox canvas are switches in Image security,
 * live for every gallery. The protection level used to turn both on by
 * itself, which made a switch set to off not mean off.
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('protection level implies nothing about devtools or canvas', () => {
  it.each(['GalleryView.tsx', 'PhotoLightbox.tsx'])('%s enables devtools detection from its switch only', (rel) => {
    expect(read(rel)).toMatch(/const devToolsEnabled = enableDevtoolsProtection;/);
  });

  it.each(['PhotoLightbox.tsx', 'layouts/PremiumLightboxImage.tsx'])('%s draws a canvas from its switch only', (rel) => {
    expect(read(rel)).not.toMatch(/useCanvasRendering \|\| protectionLevel === 'maximum'/);
  });
});
```

In `canvasLightboxOnly.test.ts`: delete the test `only lightbox renderers turn canvas on for protection level maximum`, and change `the lightbox still does both` to:

```ts
  it('the lightbox passes the canvas switch through', () => {
    const source = fs.readFileSync(lightbox, 'utf8');
    expect(source).toMatch(/useCanvasRendering=\{useCanvasRendering\}/);
  });
```

and in its header comment replace "and the lightbox keeps the per-event toggle and the `maximum` implication." with "and the lightbox follows the Image security switch."

In `GalleryPremiumLayout.canvas.test.tsx`: remove `{ useCanvasRendering: false, protectionLevel: 'maximum' as const },` from the first `it.each`, and change the second `it.each` list to `['basic', 'standard', 'enhanced', 'maximum'] as const` (with canvas off, every level shows an image).

- [ ] **Step 2: Run them and watch them fail**

Run (from `frontend/`): `npx vitest run src/components/gallery/__tests__/protectionLevelNoImplications.test.ts src/components/gallery/__tests__/canvasLightboxOnly.test.ts src/components/gallery/__tests__/GalleryPremiumLayout.canvas.test.tsx`
Expected: FAIL: all four new cases, `the lightbox passes the canvas switch through`, and the `maximum` case of the image test (a canvas is drawn).

- [ ] **Step 3: Implement**

- `GalleryView.tsx`: `const devToolsEnabled = enableDevtoolsProtection;` and change the comment above it to `// DevTools detection follows the Image security switch only.`
- `PhotoLightbox.tsx`: `const devToolsEnabled = enableDevtoolsProtection;` with the same comment; `useCanvasRendering={useCanvasRendering}`.
- `PremiumLightboxImage.tsx`: `if (!isImageSlide(slide) || offset !== 0 || !useCanvasRendering) {`. If `protectionLevel` is then unused in that function, remove it from the destructure and from `PremiumLightboxImageProps`, and from the caller in `GalleryPremiumLayout.tsx` (`...props, slug, useCanvasRendering, protectionLevel, onImageLoad`) only if TypeScript then reports it as an unknown prop; `npm run build:check` decides.
- If `useEnhancedProtection` in `PhotoLightbox.tsx` becomes unused, leave the prop in place (P4 reworks the lightbox props) but let lint decide: fix only what `npm run lint` reports.

- [ ] **Step 4: Run them and watch them pass**

Run: the Step 2 command, then `npx vitest run src/components/gallery`, `npm run lint`, `npm run build:check`
Expected: PASS; lint clean; build exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/gallery
git commit -m "fix(gallery): stop turning devtools and canvas on from the protection level"
```

---

### Task 5: The Image security tab offers right-click and says the switches are global

**Files:**
- Modify: `frontend/src/features/settings/tabs/ImageSecurityTab.tsx` (type, `defaultSettings`, a checkbox before the devtools one)
- Modify: `frontend/src/i18n/locales/en.json`, `de.json`, `vi.json` (`settings.imageSecurity.disableRightClick`, and reworded `enableDevtools`, `enableCanvas`)
- Test: `frontend/src/features/settings/tabs/__tests__/ImageSecurityTab.globalSwitches.test.tsx`

**Interfaces:**
- Consumes: `GET/PUT /admin/image-security/settings` with `disable_right_click` (Task 2).

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/features/settings/tabs/__tests__/ImageSecurityTab.globalSwitches.test.tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return { ...actual, useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k) }) };
});
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const get = vi.fn();
vi.mock('../../../../config/api', () => ({ api: { get: (...a: unknown[]) => get(...a), put: vi.fn(async () => ({ data: {} })) } }));

import { ImageSecurityTab } from '../ImageSecurityTab';

const renderTab = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><MemoryRouter><ImageSecurityTab /></MemoryRouter></QueryClientProvider>);
};

describe('Image security: switches for every gallery', () => {
  it('shows the stored right-click switch', async () => {
    get.mockResolvedValue({ data: { disable_right_click: false } });
    renderTab();
    const box = (await screen.findByLabelText(/Block right-click in every gallery/)) as HTMLInputElement;
    expect(box.checked).toBe(false);
  });

  it('labels devtools and canvas as applying to every gallery', async () => {
    get.mockResolvedValue({ data: {} });
    renderTab();
    expect(await screen.findByLabelText(/Detect developer tools in every gallery/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Canvas rendering in the lightbox of every gallery/)).toBeInTheDocument();
  });
});
```

Check the export name of the tab (`export const ImageSecurityTab`) and whether `SettingsSaveBar` needs a router (keep `MemoryRouter` if it does; remove it if a data router is required and the render throws, then mount with `createMemoryRouter` instead).

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/features/settings/tabs/__tests__/ImageSecurityTab.globalSwitches.test.tsx`
Expected: FAIL: no element labelled "Block right-click in every gallery"; the old labels say "by default".

- [ ] **Step 3: Implement**

`ImageSecurityTab.tsx`: add `disable_right_click: boolean;` to the interface after `default_image_quality`, `disable_right_click: true,` to `defaultSettings`, add `MousePointer` to the `lucide-react` import, and before the devtools `<label>`:

```tsx
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={settings.disable_right_click}
                onChange={(e) => handleChange('disable_right_click', e.target.checked)}
                className="w-4 h-4 text-primary-600 border-neutral-300 rounded focus:ring-primary-500"
              />
              <MousePointer className="w-4 h-4 ml-2 mr-1 text-neutral-500" />
              <span className="text-sm text-body">
                {t('settings.imageSecurity.disableRightClick', 'Block right-click in every gallery')}
              </span>
            </label>
```

Change the two existing fallbacks to `'Detect developer tools in every gallery'` and `'Canvas rendering in the lightbox of every gallery (advanced protection)'`.

Locales, inside `settings.imageSecurity`:
- `en`: `"disableRightClick": "Block right-click in every gallery"`, `"enableDevtools": "Detect developer tools in every gallery"`, `"enableCanvas": "Canvas rendering in the lightbox of every gallery (advanced protection)"`
- `de`: `"disableRightClick": "Rechtsklick in jeder Galerie sperren"`, `"enableDevtools": "Entwicklertools in jeder Galerie erkennen"`, `"enableCanvas": "Canvas-Rendering in der Lightbox jeder Galerie (erweiterter Schutz)"`
- `vi`: `"disableRightClick": "Chặn chuột phải trong mọi gallery"`, `"enableDevtools": "Phát hiện công cụ nhà phát triển trong mọi gallery"`, `"enableCanvas": "Kết xuất canvas trong hộp xem của mọi gallery (bảo vệ nâng cao)"`

- [ ] **Step 4: Run it and watch it pass**

Run: the Step 2 command, then `npm run lint`, `npm run build:check`, and the parity check `node -e "for(const l of ['en','de','vi']){const s=require('./src/i18n/locales/'+l+'.json').settings.imageSecurity;console.log(l,!!s.disableRightClick,!!s.enableDevtools,!!s.enableCanvas)}"`
Expected: PASS; lint clean; build 0; `true true true` for all three locales.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/settings/tabs/ImageSecurityTab.tsx frontend/src/features/settings/tabs/__tests__/ImageSecurityTab.globalSwitches.test.tsx frontend/src/i18n/locales/en.json frontend/src/i18n/locales/de.json frontend/src/i18n/locales/vi.json
git commit -m "feat(settings): right-click, devtools and canvas switches for every gallery"
```

---

### Task 6: Drop the per-event protection checkboxes

**Files:**
- Modify: `frontend/src/pages/admin/event-details/EventInformationCard.tsx` (the right-click, devtools and canvas `<label>` blocks in the edit form; the "Right-click blocked" and "DevTools detection" badges in the read view)
- Modify: `frontend/src/pages/admin/event-details/types.ts` (the three fields in `EditFormState` and `INITIAL_EDIT_FORM`)
- Modify: `frontend/src/pages/admin/EventDetailsPage.tsx` (seeding the three fields, and sending them in the save payload)
- Test: `frontend/src/pages/admin/event-details/__tests__/noPerEventProtection.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/pages/admin/event-details/__tests__/noPerEventProtection.test.ts
/**
 * Right-click, devtools and canvas are switches in Image security for every
 * gallery. The event page must not offer per-event copies that do nothing.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const FRONTEND = path.resolve(__dirname, '../../../../..');

describe.each([
  'src/pages/admin/event-details/EventInformationCard.tsx',
  'src/pages/admin/event-details/types.ts',
  'src/pages/admin/EventDetailsPage.tsx',
])('%s', (rel) => {
  const src = fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
  it.each(['disable_right_click', 'enable_devtools_protection', 'use_canvas_rendering'])('has no per-event %s', (key) => {
    expect(src).not.toMatch(new RegExp(`\\b${key}\\b`));
  });
});

it('keeps Allow downloads on the event page until P2 moves it', () => {
  const src = fs.readFileSync(path.join(FRONTEND, 'src/pages/admin/event-details/EventInformationCard.tsx'), 'utf8');
  expect(src).toMatch(/allow_downloads/);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/pages/admin/event-details/__tests__/noPerEventProtection.test.ts`
Expected: FAIL on the three keys in all three files; the Allow downloads case passes.

- [ ] **Step 3: Implement**

Delete, in `EventInformationCard.tsx`, the three `<label className="flex items-center">` blocks bound to `editForm.disable_right_click`, `editForm.enable_devtools_protection` and `editForm.use_canvas_rendering`, and the two read-view badges `{!!event.disable_right_click && (...)}` and `{!!event.enable_devtools_protection && (...)}` with the comment line above them that mentions "the next three". Keep the "Allow photo downloads" checkbox, the protection level badge, the "Downloads disabled" badge and the `events.protectionInfo` paragraph. Remove `MousePointer`, `Monitor` and `Image` from the `lucide-react` import only if nothing else in the file uses them (`rg -n "MousePointer|Monitor|<Image" <file>`). Remove the three fields from `EditFormState` and `INITIAL_EDIT_FORM` in `types.ts`, and the six lines in `EventDetailsPage.tsx` (three seeded from `event.*`, three sent from `editForm.*`). Leave `frontend/src/types/index.ts` alone: the API still returns the columns.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/pages/admin/event-details src/pages/admin/__tests__`, `npm run lint`, `npm run build:check`
Expected: PASS; lint clean; build 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/event-details/EventInformationCard.tsx frontend/src/pages/admin/event-details/types.ts frontend/src/pages/admin/EventDetailsPage.tsx frontend/src/pages/admin/event-details/__tests__/noPerEventProtection.test.ts
git commit -m "refactor(admin): drop the per-event protection checkboxes"
```

---

### Task 7: e2e specs stop sending per-event flags that do nothing

**Files:**
- Modify: `tests/e2e/gallery-grid-actions.spec.ts`, `tests/e2e/external-media-gallery.spec.ts` (named by the spec), and `tests/e2e/gallery-feedback-filter.spec.ts`, `tests/e2e/notifications-clear-old.spec.ts`, `tests/e2e/auth-smoke.spec.ts` (the same payload shape)

This task has no unit test: the specs need the full stack on :3000, which is not run on this machine. The check is a search, and the Linux CI run after the user's push is the gate.

- [ ] **Step 1: Find every per-event flag an e2e payload sends**

Run: `rg -n "disable_right_click|watermark_downloads|enable_devtools_protection|use_canvas_rendering" tests/e2e`
Expected: the five files above, each with `disable_right_click: false,` and most with `watermark_downloads: false,` in an event create payload.

- [ ] **Step 2: Remove those lines**

Delete each matching line (they are standalone `key: false,` lines inside an object literal). None of the specs right-clicks (`rg -n "button: 'right'|contextmenu" tests/e2e` returns nothing), so the global right-click block seeded on by Task 1 does not change what they exercise.

- [ ] **Step 3: Verify**

Run: `rg -n "disable_right_click|watermark_downloads|enable_devtools_protection|use_canvas_rendering" tests/e2e` and `npx tsc --noEmit --skipLibCheck --target es2020 --module esnext --moduleResolution node tests/e2e/gallery-grid-actions.spec.ts tests/e2e/external-media-gallery.spec.ts tests/e2e/gallery-feedback-filter.spec.ts tests/e2e/notifications-clear-old.spec.ts tests/e2e/auth-smoke.spec.ts`
Expected: no matches; tsc exit 0. If tsc cannot resolve `@playwright/test` from the repo root, record that in the ledger and rely on the search plus CI.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): stop sending per-event protection flags"
```

---

### Task 8: Full gates and the spec record

- [ ] **Step 1: Run every gate against the baseline**

Run the scratch gate script (`bash $S/gates.sh p1`, `$S` = the session scratchpad; it runs frontend lint, `build:check`, full Vitest, backend lint and full Jest, and lists failures outside the baseline).
Expected: lint and build exit 0; both "new failures" lists empty. A suite that fails only under full-suite load is re-run alone once and recorded.

- [ ] **Step 2: Record the P1 outcome**

Under "### P1: Download protection to Settings" in the spec add one line: `Done <date>: <first commit>..<last commit>.` Section 8 count 3 already covers the events whose right-click, devtools or canvas values differ from the planned globals, so nothing is added there. Commit with `docs(spec): record P1`.
