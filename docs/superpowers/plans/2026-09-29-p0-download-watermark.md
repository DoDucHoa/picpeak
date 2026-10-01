# P0 Download Watermark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Downloaded files are clean by default: they carry a watermark only when a new Branding switch "Watermark downloaded files" is on, whatever the gallery view watermark or the per-event flag says.

**Architecture:** One resolver, `resolveWatermarkSettings(event)` in `backend/src/services/downloadRendition.js`, decides the watermark for every download path; the three paths that still inline the old "global OR event" rule call it instead. A new app setting `branding_watermark_downloads_enabled` (seeded false by migration 257) drives it. Pre-built guest zips are cleared once by the migration and invalidated whenever the downloaded-file watermark could look different. The per-event checkbox goes from the event page.

**Tech Stack:** Node/Express + knex (SQLite in tests, Postgres in production), Jest + supertest, React 18 + Vitest, i18next.

**Spec:** `docs/superpowers/specs/2026-09-28-event-form-redesign-design.md`, section 5.10 (first two rows), section 6 "P0", section 3.2.

## Global Constraints

- Downloaded files are watermarked only when `branding_watermark_downloads_enabled` is on; the per-event `watermark_downloads` and `watermark_text` are ignored for downloads. The columns stay and are still returned (no DDL, no response shape change).
- The gallery VIEW watermark (`branding_watermark_enabled`, `routes/gallery/media.js`) is unchanged.
- New migrations are numbered above upstream's highest; today that is 256, so this one is `257_`.
- Every new user-facing string gets `en`, `de` and `vi` keys in the same change.
- No em-dash (U+2014) or en-dash (U+2013) in anything written into the repo.
- Conventional Commits.
- `backend/jest.setup.js` keeps its unconditional `DATABASE_CLIENT` pin. Run backend Jest from `backend/`, frontend Vitest from `frontend/`.
- Never edit a source file while a background test run is in flight.
- The session is isolated in the worktree; run git as plain single commands.

## Review Focus

1. **A gallery with the view watermark on and the new switch off**: a guest's single download, download-all and download-selected are all clean. Pinned in Task 2 Step 1.
2. **An event whose old `watermark_downloads` flag is true**: its downloads are clean too, since the flag no longer counts. Pinned in Task 1 Step 1.
3. **A zip built before the deploy** is never served again after the migration. Pinned in Task 3 Step 1.
4. **Saving Branding without touching the watermark** does not throw away every cached zip (rebuilds are expensive on the N100). Pinned in Task 4 Step 1.
5. **Turning the switch on** takes effect on the next download-all, not on a stale cached zip. Pinned in Task 4 Step 1.

---

### Task 1: The resolver and the setting it reads

**Files:**
- Modify: `backend/src/services/watermarkService.js` (`getWatermarkSettings`, new `getDownloadWatermarkFingerprint`)
- Modify: `backend/src/services/downloadRendition.js` (`resolveWatermarkSettings`)
- Test: `backend/__tests__/services/downloadWatermarkResolver.test.js`

**Interfaces:**
- Produces: `watermarkService.getWatermarkSettings()` now also returns `downloadsEnabled: boolean` (from `branding_watermark_downloads_enabled`, default false). `getSettingsHash()` is unchanged, so flipping the new switch never regenerates the view watermarks.
- Produces: `resolveWatermarkSettings(event) -> Promise<object|null>`: null unless `downloadsEnabled`; otherwise the settings with `enabled: true`. The `event` argument is kept for the callers' signature and ignored.
- Produces: `watermarkService.getDownloadWatermarkFingerprint() -> Promise<string>`: a string that changes whenever a downloaded file would look different (switch, logo path, position, opacity, size, company name).

- [ ] **Step 1: Write the failing test**

```js
// backend/__tests__/services/downloadWatermarkResolver.test.js
/**
 * Downloaded files carry a watermark only when the Branding switch for
 * downloads is on. The gallery view watermark and the old per-event flag no
 * longer decide it: either one used to watermark every download.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'download-watermark-secret-32-characters';

const { bootCrmDb } = require('../integration/helpers/crmDb');

let db; let cleanup; let watermarkService; let resolveWatermarkSettings;

const setSetting = (key, value) => db('app_settings')
  .insert({ setting_key: key, setting_value: JSON.stringify(value), setting_type: 'branding' })
  .onConflict('setting_key').merge();

beforeAll(async () => {
  ({ db, cleanup } = await bootCrmDb());
  watermarkService = require('../../src/services/watermarkService');
  ({ resolveWatermarkSettings } = require('../../src/services/downloadRendition'));
}, 120000);
afterAll(async () => { await cleanup(); });
beforeEach(async () => {
  await setSetting('branding_watermark_enabled', false);
  await setSetting('branding_watermark_downloads_enabled', false);
  watermarkService.clearCache();
});

it('leaves downloads clean when only the gallery view watermark is on', async () => {
  await setSetting('branding_watermark_enabled', true);
  await expect(resolveWatermarkSettings({ watermark_downloads: false })).resolves.toBeNull();
});

it('ignores the old per-event flag', async () => {
  await expect(resolveWatermarkSettings({ watermark_downloads: true, watermark_text: 'X' })).resolves.toBeNull();
  await expect(resolveWatermarkSettings({ watermark_downloads: 1 })).resolves.toBeNull();
});

it('watermarks downloads when the download switch is on, even with the view watermark off', async () => {
  await setSetting('branding_watermark_downloads_enabled', true);
  const settings = await resolveWatermarkSettings({ watermark_downloads: false });
  expect(settings).toMatchObject({ enabled: true, downloadsEnabled: true });
});

it('changes the fingerprint when the switch flips, not when nothing changed', async () => {
  const before = await watermarkService.getDownloadWatermarkFingerprint();
  expect(await watermarkService.getDownloadWatermarkFingerprint()).toBe(before);
  await setSetting('branding_watermark_downloads_enabled', true);
  watermarkService.clearCache();
  expect(await watermarkService.getDownloadWatermarkFingerprint()).not.toBe(before);
});

it('does not change the view watermark hash when the download switch flips', async () => {
  const before = await watermarkService.getSettingsHash();
  await setSetting('branding_watermark_downloads_enabled', true);
  watermarkService.clearCache();
  expect(await watermarkService.getSettingsHash()).toBe(before);
});
```

If `watermarkService.clearCache` does not exist under that name, read `backend/src/services/watermarkService.js` for the cache reset the Branding route calls (`adminSettings.js` calls `watermarkService.clearCache()`), and use it.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest __tests__/services/downloadWatermarkResolver.test.js`
Expected: FAIL: the first two cases get settings instead of null for the view watermark / event flag, and `getDownloadWatermarkFingerprint` is not a function.

- [ ] **Step 3: Implement**

In `watermarkService.getWatermarkSettings`, add `'branding_watermark_downloads_enabled'` to the `whereIn` key list and to the returned object:

```js
        downloadsEnabled: settingsObj.branding_watermark_downloads_enabled === true
          || settingsObj.branding_watermark_downloads_enabled === 'true',
```

Add, next to `getSettingsHash`:

```js
  /**
   * Changes whenever a downloaded file would look different: the download
   * switch, or anything that shapes the mark. Used to invalidate cached zips
   * only when it matters; a zip rebuild is expensive.
   */
  async getDownloadWatermarkFingerprint() {
    const s = await this.getWatermarkSettings();
    // With the switch off every download is clean, so nothing else matters.
    if (!s || !s.downloadsEnabled) return 'off';
    return ['on', s.logoPath || '', s.position, s.opacity, s.size, s.companyName].join('|');
  }
```

Replace `resolveWatermarkSettings` in `downloadRendition.js`:

```js
/**
 * The watermark for a downloaded file, or null for a clean file. Only the
 * Branding switch for downloads decides it: the gallery view watermark and
 * the old per-event flag used to watermark every download, which a client
 * who paid for the photos should not get.
 */
// eslint-disable-next-line no-unused-vars
async function resolveWatermarkSettings(event) {
  const settings = await watermarkService.getWatermarkSettings();
  if (!settings || !settings.downloadsEnabled) return null;
  return { ...settings, enabled: true };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest __tests__/services/downloadWatermarkResolver.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/watermarkService.js backend/src/services/downloadRendition.js backend/__tests__/services/downloadWatermarkResolver.test.js
git commit -m "fix(downloads): watermark downloaded files only when Branding says so"
```

---

### Task 2: Every download path uses the resolver

**Files:**
- Modify: `backend/src/routes/gallery/downloads.js` (download-all and download-selected: the inline "Get watermark settings - apply if global setting OR event-level setting is enabled" blocks)
- Modify: `backend/src/services/downloadZipService.js` (the "Watermark logic (same as gallery.js download-all)" block)
- Test: `backend/__tests__/services/downloadWatermarkPaths.test.js`

**Interfaces:**
- Consumes: `resolveWatermarkSettings(event)` from Task 1.

- [ ] **Step 1: Write the failing test**

```js
// backend/__tests__/services/downloadWatermarkPaths.test.js
/**
 * Every download path asks the one resolver. Three of them used to inline
 * the old "global OR event" rule and would keep watermarking downloads after
 * the resolver changed.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../src');
const DOWNLOAD_PATHS = [
  'routes/gallery/downloads.js',
  'services/downloadZipService.js',
  'services/downloadJobService.js',
];

describe.each(DOWNLOAD_PATHS)('%s', (rel) => {
  const src = fs.readFileSync(path.join(SRC, rel), 'utf8');

  it('never decides a download watermark from the event flag', () => {
    expect(src).not.toMatch(/watermark_downloads/);
    expect(src).not.toMatch(/watermark_text/);
  });

  it('never reads the raw watermark settings for a download', () => {
    expect(src).not.toMatch(/getWatermarkSettings\(/);
  });

  it('goes through resolveWatermarkSettings', () => {
    expect(src).toMatch(/resolveWatermarkSettings\(/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest __tests__/services/downloadWatermarkPaths.test.js`
Expected: FAIL for `downloads.js` and `downloadZipService.js` (both still contain `watermark_downloads` and `getWatermarkSettings(`); `downloadJobService.js` passes.

- [ ] **Step 3: Implement**

In `downloads.js`, replace each of the two inline blocks (download-all and download-selected) of the form

```js
    // Get watermark settings - apply if global setting OR event-level setting is enabled
    const watermarkSettings = await watermarkService.getWatermarkSettings();
    const eventWatermarkEnabled = req.event.watermark_downloads === true || req.event.watermark_downloads === 1;
    const shouldApplyWatermark = (watermarkSettings && watermarkSettings.enabled) || eventWatermarkEnabled;
    const effectiveSettings = shouldApplyWatermark ? {
      ...watermarkSettings,
      enabled: true,
      text: req.event.watermark_text || watermarkSettings?.text || 'Protected'
    } : null;
```

with

```js
    // Downloaded files are clean unless Branding watermarks downloads.
    const effectiveSettings = await resolveWatermarkSettings(req.event);
```

In `downloadZipService.js`, replace the matching block (it uses `event` instead of `req.event`) with

```js
      // Downloaded files are clean unless Branding watermarks downloads.
      const effectiveSettings = await resolveWatermarkSettings(event);
```

and add near the other requires: `const { resolveWatermarkSettings } = require('./downloadRendition');`. Then remove any `watermarkService` require in either file that has no remaining use (`rg -n "watermarkService" <file>`); `npm run lint` flags an unused one.

- [ ] **Step 4: Behaviour check on the route**

Add to `backend/__tests__/routes/gallerySingleDownload.test.js` (its harness already mounts the download routes on a real SQLite database with a file on disk):

```js
describe('download watermark', () => {
  const setSetting = (key, value) => db('app_settings')
    .insert({ setting_key: key, setting_value: JSON.stringify(value), setting_type: 'branding' })
    .onConflict('setting_key').merge();
  afterEach(async () => {
    await setSetting('branding_watermark_enabled', false);
    await setSetting('branding_watermark_downloads_enabled', false);
    require('../../src/services/watermarkService').clearCache();
  });

  it('serves the untouched file when only the view watermark is on', async () => {
    await setSetting('branding_watermark_enabled', true);
    await db('events').where({ id: eventId }).update({ watermark_downloads: true });
    require('../../src/services/watermarkService').clearCache();
    try {
      const res = await download(photoId);
      expect(res.status).toBe(200);
      expect(Buffer.compare(res.body, PHOTO_BYTES)).toBe(0);
    } finally {
      await db('events').where({ id: eventId }).update({ watermark_downloads: false });
    }
  });
});
```

Run: `npx jest __tests__/services/downloadWatermarkPaths.test.js __tests__/routes/gallerySingleDownload.test.js --forceExit`
Expected: PASS. Then mutation probe: temporarily change the resolver's first line to `if (!settings) return null;` (so the view watermark applies again); the route case must fail (the body is no longer the original bytes, or the render errors on the fake bytes). Restore and confirm `git diff --stat -- backend/src/services/downloadRendition.js` shows only Task 1's change.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/gallery/downloads.js backend/src/services/downloadZipService.js backend/__tests__/services/downloadWatermarkPaths.test.js backend/__tests__/routes/gallerySingleDownload.test.js
git commit -m "fix(downloads): route every download path through the one watermark resolver"
```

---

### Task 3: Migration 257: seed the switch, clear the zips built under the old rule

**Files:**
- Create: `backend/migrations/core/257_download_watermark_switch.js`
- Test: `backend/__tests__/migrations/257_download_watermark_switch.test.js`

**Interfaces:**
- Produces: row `app_settings.branding_watermark_downloads_enabled` = `false` (JSON), `setting_type` `branding`, only when absent. Every `events.download_zip_path` and `download_zip_generated_at` set to NULL.

- [ ] **Step 1: Write the failing test**

```js
// backend/__tests__/migrations/257_download_watermark_switch.test.js
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'migration-257-secret-at-least-32-chars';

const { bootCrmDb } = require('../integration/helpers/crmDb');
const migration = require('../../migrations/core/257_download_watermark_switch');

let db; let cleanup;
beforeAll(async () => { ({ db, cleanup } = await bootCrmDb()); }, 120000);
afterAll(async () => { await cleanup(); });

it('seeds the download watermark switch off', async () => {
  const row = await db('app_settings').where({ setting_key: 'branding_watermark_downloads_enabled' }).first();
  expect(JSON.parse(row.setting_value)).toBe(false);
  expect(row.setting_type).toBe('branding');
});

it('keeps a value an admin already chose when it runs again', async () => {
  await db('app_settings').where({ setting_key: 'branding_watermark_downloads_enabled' })
    .update({ setting_value: JSON.stringify(true) });
  await migration.up(db);
  const row = await db('app_settings').where({ setting_key: 'branding_watermark_downloads_enabled' }).first();
  expect(JSON.parse(row.setting_value)).toBe(true);
});

it('forgets every pre-built zip so none built under the old rule is served', async () => {
  const [id] = await db('events').insert({
    slug: 'zip-257', event_type: 'wedding', event_name: 'Zip', event_date: '2026-09-01',
    customer_name: 'C', customer_email: 'c@example.com', admin_email: 'a@example.com',
    password_hash: 'x', share_link: 'https://example.com/gallery/zip-257',
    expires_at: new Date(Date.now() + 86400000),
    download_zip_path: 'zips/zip-257.zip', download_zip_generated_at: new Date(),
  }).returning('id').then((r) => r.map((x) => (typeof x === 'object' ? x.id : x)));
  await migration.up(db);
  const ev = await db('events').where({ id }).first('download_zip_path', 'download_zip_generated_at');
  expect(ev.download_zip_path).toBeNull();
  expect(ev.download_zip_generated_at).toBeNull();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest __tests__/migrations/257_download_watermark_switch.test.js`
Expected: FAIL: `Cannot find module '../../migrations/core/257_download_watermark_switch'`.

- [ ] **Step 3: Implement**

```js
// backend/migrations/core/257_download_watermark_switch.js
/**
 * Downloaded files are watermarked only when this switch is on (P0 of the
 * event form redesign). Before it, a download was watermarked whenever the
 * gallery view watermark or the event's own flag was on, so the switch
 * starts off: downloads come out clean.
 *
 * Every pre-built guest zip is forgotten because it may have been built
 * under the old rule. The service rebuilds each on demand; getZipInfo trusts
 * only this pointer, so clearing it is enough.
 */
exports.up = async function up(knex) {
  const existing = await knex('app_settings')
    .where({ setting_key: 'branding_watermark_downloads_enabled' })
    .first();
  if (!existing) {
    await knex('app_settings').insert({
      setting_key: 'branding_watermark_downloads_enabled',
      setting_value: JSON.stringify(false),
      setting_type: 'branding',
      updated_at: new Date(),
    });
  }
  if (await knex.schema.hasColumn('events', 'download_zip_path')) {
    await knex('events')
      .whereNotNull('download_zip_path')
      .update({ download_zip_path: null, download_zip_generated_at: null });
  }
};

exports.down = async function down(knex) {
  await knex('app_settings').where({ setting_key: 'branding_watermark_downloads_enabled' }).delete();
};
```

Before writing it, check one existing seed migration (for example `backend/migrations/core/214_download_quota.js`) for whether `app_settings` rows carry `updated_at` or `created_at`, and match its columns.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest __tests__/migrations/257_download_watermark_switch.test.js`
Expected: PASS, 3 tests. Also: `npx jest __tests__/services/usageCoverageInventory __tests__/migrations` (the migration inventory tests, if any, stay green).

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/core/257_download_watermark_switch.js backend/__tests__/migrations/257_download_watermark_switch.test.js
git commit -m "feat(downloads): seed the download watermark switch and forget stale zips"
```

---

### Task 4: Branding saves the switch and invalidates zips only when it matters

**Files:**
- Modify: `backend/src/routes/adminSettings.js` (`PUT /branding`: destructure, `brandingSettings`, invalidation; `POST /branding/watermark-logo`: invalidation)
- Test: `backend/__tests__/routes/adminSettingsDownloadWatermark.test.js`

**Interfaces:**
- Consumes: `watermarkService.getDownloadWatermarkFingerprint()` (Task 1); `require('../services/downloadZipService').invalidateAll()`.
- Produces: `PUT /api/admin/settings/branding` accepts `watermark_downloads_enabled` (boolean) and stores it as `branding_watermark_downloads_enabled`.

- [ ] **Step 1: Write the failing test**

```js
// backend/__tests__/routes/adminSettingsDownloadWatermark.test.js
/**
 * The Branding save stores the download watermark switch, and clears the
 * cached guest zips exactly when a downloaded file would now look different.
 * A save that changes nothing about it keeps them: a rebuild is expensive.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'download-watermark-route-secret-32';
process.env.STORAGE_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'picpeak-dlwm-storage-'));

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const { bootCrmDb, seedMinimal, assignAdminRole, mintAdminToken } = require('../integration/helpers/crmDb');

let db; let cleanup; let app; let token; let invalidateAll;

beforeAll(async () => {
  ({ db, cleanup } = await bootCrmDb());
  const { adminId } = await seedMinimal(db);
  await assignAdminRole(db, adminId, 'super_admin');
  token = mintAdminToken(adminId);
  const zips = require('../../src/services/downloadZipService');
  invalidateAll = jest.spyOn(zips, 'invalidateAll').mockResolvedValue(undefined);
  app = express(); app.use(express.json()); app.use(cookieParser());
  app.use('/api/admin/settings', require('../../src/routes/adminSettings'));
}, 120000);
afterAll(async () => { invalidateAll.mockRestore(); await cleanup(); });
beforeEach(() => invalidateAll.mockClear());

const save = (body) => request(app).put('/api/admin/settings/branding')
  .set('Authorization', `Bearer ${token}`)
  .send({ company_name: 'Studio', watermark_enabled: false, ...body });

it('stores the download watermark switch', async () => {
  const res = await save({ watermark_downloads_enabled: true });
  expect(res.status).toBe(200);
  const row = await db('app_settings').where({ setting_key: 'branding_watermark_downloads_enabled' }).first();
  expect(JSON.parse(row.setting_value)).toBe(true);
});

it('invalidates the cached zips when the switch flips', async () => {
  await save({ watermark_downloads_enabled: false });
  invalidateAll.mockClear();
  await save({ watermark_downloads_enabled: true });
  expect(invalidateAll).toHaveBeenCalledTimes(1);
});

it('keeps the cached zips on a save that changes nothing about downloads', async () => {
  await save({ watermark_downloads_enabled: true });
  invalidateAll.mockClear();
  await save({ watermark_downloads_enabled: true, company_tagline: 'New tagline' });
  expect(invalidateAll).not.toHaveBeenCalled();
});

it('keeps the cached zips when the company name changes while downloads are clean', async () => {
  await save({ watermark_downloads_enabled: false, company_name: 'Studio' });
  invalidateAll.mockClear();
  await save({ watermark_downloads_enabled: false, company_name: 'Studio Renamed' });
  expect(invalidateAll).not.toHaveBeenCalled();
});

it('invalidates when the company name changes while downloads are watermarked', async () => {
  await save({ watermark_downloads_enabled: true, company_name: 'Studio' });
  invalidateAll.mockClear();
  await save({ watermark_downloads_enabled: true, company_name: 'Studio Two' });
  expect(invalidateAll).toHaveBeenCalledTimes(1);
});
```

Check the mount path and auth header against `__tests__/routes/adminSettingsProtectedKeys.test.js`, which drives the same router, and copy its setup if it differs.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest __tests__/routes/adminSettingsDownloadWatermark.test.js`
Expected: FAIL: the switch is not stored (the route ignores the key) and `invalidateAll` is never called.

- [ ] **Step 3: Implement**

In `PUT /branding`:
1. Add `watermark_downloads_enabled,` to the destructure next to `watermark_enabled`.
2. Before any write, next to `const oldSettingsHash = await watermarkService.getSettingsHash();`, add `const oldDownloadFingerprint = await watermarkService.getDownloadWatermarkFingerprint();`.
3. In `brandingSettings`, next to the other conditional includes: `...(watermark_downloads_enabled !== undefined && { watermark_downloads_enabled: !!watermark_downloads_enabled }),`.
4. After the existing "Check if watermark settings changed" block, before `res.json(...)`:

```js
    // Cached guest zips hold watermarked or clean copies; drop them only when
    // a downloaded file would now look different.
    watermarkService.clearCache();
    const newDownloadFingerprint = await watermarkService.getDownloadWatermarkFingerprint();
    if (oldDownloadFingerprint !== newDownloadFingerprint) {
      require('../services/downloadZipService').invalidateAll()
        .catch((err) => logger.error('Failed to invalidate cached zips after a watermark change:', err));
    }
```

In `POST /branding/watermark-logo`, after its `watermarkService.clearCache();`:

```js
    if (currentSettings && currentSettings.downloadsEnabled) {
      require('../services/downloadZipService').invalidateAll()
        .catch((err) => logger.error('Failed to invalidate cached zips after a watermark logo change:', err));
    }
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest __tests__/routes/adminSettingsDownloadWatermark.test.js __tests__/routes/adminSettingsProtectedKeys.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/adminSettings.js backend/__tests__/routes/adminSettingsDownloadWatermark.test.js
git commit -m "feat(branding): save the download watermark switch and refresh stale zips"
```

---

### Task 5: The switch in Branding

**Files:**
- Modify: `frontend/src/services/settings.service.ts` (the branding settings type near `watermark_enabled: boolean;`, and `formatBrandingSettings`)
- Modify: `frontend/src/pages/admin/BrandingPage.tsx` (`INITIAL_BRANDING`, and a checkbox after the "enableWatermarks" one)
- Modify: `frontend/src/i18n/locales/en.json`, `de.json`, `vi.json` (`branding.watermarkDownloads`, `branding.watermarkDownloadsHelp`)
- Test: `frontend/src/services/__tests__/settings.brandingWatermarkDownloads.test.ts`

**Interfaces:**
- Consumes: `PUT /admin/settings/branding` accepting `watermark_downloads_enabled` (Task 4); `settingsService.updateBranding` sends the whole branding form object.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/services/__tests__/settings.brandingWatermarkDownloads.test.ts
import { describe, expect, it } from 'vitest';
import { settingsService } from '../settings.service';

describe('formatBrandingSettings: download watermark switch', () => {
  it('is off when the setting is missing', () => {
    expect(settingsService.formatBrandingSettings({} as never).watermark_downloads_enabled).toBe(false);
  });
  it('reads a stored true', () => {
    const s = settingsService.formatBrandingSettings({ branding_watermark_downloads_enabled: true } as never);
    expect(s.watermark_downloads_enabled).toBe(true);
  });
  it('reads a stored string "true"', () => {
    const s = settingsService.formatBrandingSettings({ branding_watermark_downloads_enabled: 'true' } as never);
    expect(s.watermark_downloads_enabled).toBe(true);
  });
});
```

Check the export name and call shape of `settingsService` and `formatBrandingSettings` in `settings.service.ts` first, and match them.

- [ ] **Step 2: Run it and watch it fail**

Run (from `frontend/`): `npx vitest run src/services/__tests__/settings.brandingWatermarkDownloads.test.ts`
Expected: FAIL: `watermark_downloads_enabled` is undefined.

- [ ] **Step 3: Implement**

`settings.service.ts`: add `watermark_downloads_enabled?: boolean;` next to `watermark_enabled: boolean;`, and in `formatBrandingSettings` next to `watermark_enabled`:

```ts
      watermark_downloads_enabled: this._parseBoolean(rawSettings.branding_watermark_downloads_enabled, false),
```

`BrandingPage.tsx`: add `watermark_downloads_enabled: false,` to `INITIAL_BRANDING` next to `watermark_enabled: false,`, and right after the closing `</div>` of the "enableWatermarks" checkbox block:

```tsx
          <div className="mt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!!brandingSettings.watermark_downloads_enabled}
                onChange={(e) => handleBrandingChange('watermark_downloads_enabled', e.target.checked)}
                className="rounded border-line-strong text-accent focus:ring-primary-500"
              />
              <div>
                <span className="text-sm font-medium text-heading">{t('branding.watermarkDownloads', 'Watermark downloaded files')}</span>
                <p className="text-xs text-soft">{t('branding.watermarkDownloadsHelp', 'Off: guests and clients download clean files, even when the gallery shows a watermark.')}</p>
              </div>
            </label>
          </div>
```

Locales, inside the `branding` object of each file:
- `en`: `"watermarkDownloads": "Watermark downloaded files"`, `"watermarkDownloadsHelp": "Off: guests and clients download clean files, even when the gallery shows a watermark."`
- `de`: `"watermarkDownloads": "Heruntergeladene Dateien mit Wasserzeichen versehen"`, `"watermarkDownloadsHelp": "Aus: Gäste und Kunden laden saubere Dateien herunter, auch wenn die Galerie ein Wasserzeichen zeigt."`
- `vi`: `"watermarkDownloads": "Đóng watermark lên file tải về"`, `"watermarkDownloadsHelp": "Tắt: khách và khách hàng tải về file sạch, kể cả khi gallery đang hiển thị watermark."`

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/services/__tests__/settings.brandingWatermarkDownloads.test.ts src/pages/admin/__tests__/brandingThemeTextLeak.test.ts`, then `npm run lint` and `npm run build:check`.
Expected: PASS, lint clean, build exit 0. Parity: `jq -r 'paths(scalars)|tojson'` over en, de, vi shows the two new keys in all three.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/settings.service.ts frontend/src/pages/admin/BrandingPage.tsx frontend/src/i18n/locales/en.json frontend/src/i18n/locales/de.json frontend/src/i18n/locales/vi.json frontend/src/services/__tests__/settings.brandingWatermarkDownloads.test.ts
git commit -m "feat(branding): a switch for watermarking downloaded files"
```

---

### Task 6: Drop the per-event watermark checkbox

**Files:**
- Modify: `frontend/src/pages/admin/event-details/EventInformationCard.tsx` (the "Add watermark to downloads" checkbox, and the read-only "Watermarked" badge)
- Modify: `frontend/src/pages/admin/event-details/types.ts` (`watermark_downloads` in `EditFormState` and `INITIAL_EDIT_FORM`)
- Modify: `frontend/src/pages/admin/EventDetailsPage.tsx` (seeding `watermark_downloads: event.watermark_downloads ?? false`, and `watermark_downloads: editForm.watermark_downloads` in the save payload)
- Test: `frontend/src/pages/admin/event-details/__tests__/noPerEventDownloadWatermark.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/pages/admin/event-details/__tests__/noPerEventDownloadWatermark.test.ts
/**
 * Downloaded files are watermarked from Branding only. The event page must
 * not offer a per-event switch that no longer does anything, nor send it.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const files = [
  'src/pages/admin/event-details/EventInformationCard.tsx',
  'src/pages/admin/event-details/types.ts',
  'src/pages/admin/EventDetailsPage.tsx',
];

describe.each(files)('%s', (rel) => {
  it('has no per-event download watermark', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../../..', rel), 'utf8');
    expect(src).not.toMatch(/watermark_downloads/);
  });
});
```

Adjust the `path.resolve` depth if it does not land on `frontend/`: the test must read the real files (a wrong path throws ENOENT, which is not a pass).

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/pages/admin/event-details/__tests__/noPerEventDownloadWatermark.test.ts`
Expected: FAIL for all three files.

- [ ] **Step 3: Implement**

Delete the `<label>` block holding the `watermark_downloads` checkbox (with its `Droplets` icon) and the `{!!event.watermark_downloads && (...Watermarked...)}` badge from `EventInformationCard.tsx`; remove `Droplets` from its `lucide-react` import if nothing else uses it. Remove `watermark_downloads` from `EditFormState` and `INITIAL_EDIT_FORM` in `types.ts`, and the two lines in `EventDetailsPage.tsx`. Leave `watermark_downloads` in `frontend/src/types/index.ts` (the API still returns it).

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/pages/admin/event-details src/pages/admin/__tests__`, then `npm run lint` and `npm run build:check`.
Expected: PASS, lint clean, build exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/event-details/EventInformationCard.tsx frontend/src/pages/admin/event-details/types.ts frontend/src/pages/admin/EventDetailsPage.tsx frontend/src/pages/admin/event-details/__tests__/noPerEventDownloadWatermark.test.ts
git commit -m "refactor(admin): drop the per-event download watermark checkbox"
```

---

### Task 7: Full gates

- [ ] **Step 1: Run every gate against the P-1 baseline**

Run the scratch gate script (`bash $S/gates.sh p0`, where `$S` is the session scratch directory; it runs frontend lint, `build:check`, full Vitest, backend lint and full Jest, and lists failures that are not in the extended baseline).
Expected: `fe lint exit=0`, `build:check exit=0`, `be lint exit=0`, and both "new failures" lists empty. A suite outside the baseline that fails is investigated with superpowers:systematic-debugging; a suite that fails in the full run but passes alone is re-run once alone and recorded.

- [ ] **Step 2: Record the P0 outcome in the spec**

In section 6 "P0" of the spec, add one line under the heading: `Done 2026-09-29: <first commit>..<last commit>.` Commit with `docs(spec): record P0`.
