# Client Gallery Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the themable client gallery with one fixed design copied from the reference album, virtualised so it stays smooth on thousands of photos, and delete gallery theming end to end (code, API fields, database columns).

**Architecture:** A new feature folder `frontend/src/features/client-gallery/` holds the whole guest-facing gallery. Its non-visual behaviour is lifted out of today's `GalleryView` into one controller hook, so the subtle rules (download quota, folders, guest identity, people filter) move rather than get rewritten. The grid and list are windowed with `@tanstack/react-virtual`; the viewer is `yet-another-react-lightbox` with a custom rail and a windowed filmstrip. Brand colours stay in `ThemeContext` for the admin and portal; every gallery-only theme concept is removed, then dropped from the database by migration 263.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind, TanStack Query 5, `@tanstack/react-virtual` 3.14, `yet-another-react-lightbox` 3.28, Vitest + Testing Library, Express + Knex, Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-client-gallery-redesign-design.md`

## Global Constraints

- Conventional Commits for every commit (`feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `build`). No gitmoji.
- No em-dash (U+2014) or en-dash (U+2013) in anything written: code, comments, test names, commit messages, docs.
- Every new user-facing string gets keys in `en`, `de` and `vi` in the same commit, `en` first. Removed keys are removed from all nine locales (`de en es fr nl pt ru sl vi`).
- Never write new code that assumes SQLite; Postgres 15 is the target. Migrations must still run on the SQLite test harness (`bootCrmDb`).
- Do not remove the `DATABASE_CLIENT` pin in `backend/jest.setup.js`.
- The browser never computes the download allowance. Every bulk download path calls `refreshDownloadQuota(slug)` from `useRefreshDownloadQuota`, and `bulkDownloadChargesQuota.test.ts` lists every call site file.
- Image protections keep working: `protection_level`, `disable_right_click`, `enable_devtools_protection`, `use_canvas_rendering`, watermark URL rewrite.
- Gallery palette is fixed: background `#ffffff`, text `#1a1a1a`, muted `#6b6b6b`, divider `#e6e6e6`, accent orange `#f08a24`, like red `#f0524f`, pick blue `#3b5bdb`, placeholder `#f2f2f2`. Fonts: Red Hat Display (UI), DM Serif Display (album title).
- Grid geometry: under 768px wide 2 columns, gap 4px, side padding 6px; 768px to 1919px 3 columns, gap 12px, padding 60px; 1920px and up 4 columns, gap 12px, padding 60px.
- List rows are 150px tall; list thumbnail 80px wide.
- Run frontend commands from `frontend/`, backend commands from `backend/`. A worktree has no `backend/.env`; backend tests do not need one.

## Review Focus

1. **Touch devices and hidden-but-tappable badges.** On a phone there is no hover, so like and pick badges that are only `opacity-0` stay tappable and steal the tap meant to open the photo (the #1263 class of bug). Expected: on a coarse pointer, badges are visible and are the only tap targets at the tile corners; the rest of the tile opens the viewer. Test lives in Task 7.
2. **A photo with no width or height.** Legacy rows and some videos have null dimensions. Expected: the tile renders at the 2:3 fallback ratio, never 0px tall, never NaN. Test lives in Task 4.
3. **Pick limit reached.** A guest at `max_favorites_per_guest` taps pick on another photo. Expected: the existing limit modal opens and the cached flag rolls back, the tab count does not move. Test lives in Task 6.
4. **Deep link to a photo that is not in the current scope.** `?photo=<id>` for a photo inside a folder, or filtered out by the active tab. Expected: the viewer opens on that photo when it exists anywhere in the gallery (switching tab to all and opening its folder), and silently drops the param when it does not exist. Test lives in Task 5.
5. **Album resized across a column breakpoint while scrolled deep.** Expected: the virtualiser re-lays out with the new lane count and the photo that was at the top of the viewport stays in view. Test lives in Task 7.

---

## File Structure

```text
frontend/src/features/client-gallery/
  index.ts                       exports ClientGallery
  ClientGallery.tsx              composition root, providers, modals
  galleryTokens.css              fixed palette and fonts, scoped to .client-gallery
  layout/
    gridGeometry.ts              columns, gap, padding, tile height (pure)
    tileImage.ts                 tilePreviewUrl (pure)
  state/
    useGalleryController.ts      behaviour lifted from GalleryView
    urlState.ts                  read/write sort, dir, view, tab, photo params (pure)
    useFeedbackToggle.ts         like and pick with optimistic cache writes
    tabs.ts                      tab filtering and counts (pure)
  cover/
    CoverHero.tsx
    ExpiryToast.tsx
  toolbar/
    GalleryToolbar.tsx
    DownloadMenu.tsx
    SortMenu.tsx
  grid/
    MasonryGrid.tsx
    GridTile.tsx
  list/
    PhotoList.tsx
    ListRow.tsx
  viewer/
    PhotoViewer.tsx
    ViewerRail.tsx
    Filmstrip.tsx
    FileInfoPanel.tsx
  icons.tsx                      inline SVG icons drawn to the reference
  __tests__/                     vitest files, one per unit
```

Backend touches: `backend/src/services/galleryQueryService.js`, `backend/migrations/core/263_drop_gallery_theming.js`, route and service files listed in Task 3.

---

## Phase A: Backend

### Task 1: Per-viewer `is_favorited` on `/photos`

**Files:**
- Modify: `backend/src/services/galleryQueryService.js` (the `likedPhotoIds` block near line 163 and the photo mapping near line 581)
- Modify: `frontend/src/types/index.ts` (Photo interface, next to `is_liked`)
- Test: `backend/__tests__/integration/viewerFavoriteFlag.test.js`

**Interfaces:**
- Produces: every photo in `GET /api/gallery/:slug/photos` carries `is_favorited: boolean`. Frontend `Photo.is_favorited?: boolean`.

- [ ] **Step 1: Write the failing test**

Copy the harness of `backend/__tests__/integration/hiddenOwnFeedback.test.js` (event, photo, guest, settings, `galleryToken`, `guestToken`, `getPhoto`) into the new file with `SLUG = 'viewer-favorite-flag'`, `ME = 'guest-fav-identifier'`, `allow_favorites: true` in `event_feedback_settings`. Then:

```js
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend && npx jest __tests__/integration/viewerFavoriteFlag.test.js`
Expected: FAIL, `expect(received).toBe(expected)` with `received: undefined`.

- [ ] **Step 3: Implement**

In `galleryQueryService.js`, generalise the like query so one round trip returns both sets. Replace the `likedPhotoIds` block with:

```js
  const likedPhotoIds = new Set();
  const favoritedPhotoIds = new Set();
  if (photos.length > 0) {
    const ownQuery = db('photo_feedback')
      .where({ event_id: event.id, is_hidden: formatBoolean(false) })
      .whereIn('feedback_type', ['like', 'favorite'])
      .whereIn('photo_id', photos.map(p => p.id));
    if (identity.guestId) {
      ownQuery.where('guest_id', identity.guestId);
    } else {
      ownQuery.where('guest_identifier', identity.guestIdentifier);
    }
    const ownRows = await ownQuery.select('photo_id', 'feedback_type');
    ownRows.forEach((row) => {
      if (row.feedback_type === 'like') likedPhotoIds.add(row.photo_id);
      else favoritedPhotoIds.add(row.photo_id);
    });
  }
```

Keep the existing explanatory comment above it and extend its first line to say it covers likes and picks. In the photo mapping, directly under `is_liked`, add:

```js
        // The viewer's own pick, same identity model and same reasoning as
        // is_liked: it is their selection, so it survives sharing being off.
        is_favorited: favoritedPhotoIds.has(photo.id),
```

In `frontend/src/types/index.ts`, under `is_liked?: boolean;` add:

```ts
  // Per-viewer pick flag, the favorite counterpart of is_liked.
  is_favorited?: boolean;
```

- [ ] **Step 4: Run the new test and the neighbours**

Run: `cd backend && npx jest __tests__/integration/viewerFavoriteFlag.test.js __tests__/integration/hiddenOwnFeedback.test.js __tests__/integration/galleryFilterFeedbackVisibility.test.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/galleryQueryService.js backend/__tests__/integration/viewerFavoriteFlag.test.js frontend/src/types/index.ts
git commit -m "feat(gallery): expose the viewer's own picks on the photos list"
```

### Task 2: Migration 263 drops gallery theming storage

**Files:**
- Create: `backend/migrations/core/263_drop_gallery_theming.js`
- Test: `backend/__tests__/migrations/263_drop_gallery_theming.test.js`

**Interfaces:**
- Produces: after `up()`, `events` has no `color_theme`, `css_template_id`, `header_style`, `hero_divider_style`; `event_types` has no `theme_preset`, `theme_config`; no `css_templates` table; `app_settings.theme_config` holds only brand keys.
- `BRAND_THEME_KEYS` (exported from the migration for the route in Task 3 to reuse would couple a route to a migration; do NOT do that, Task 3 keeps its own list).

- [ ] **Step 1: Write the failing test**

```js
/**
 * Gallery theming storage is dropped (client gallery redesign, 2026-10-01).
 * Brand colours used by the admin and the customer portal survive inside
 * app_settings.theme_config; everything gallery specific goes.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'migration-263-secret-at-least-32-chars';

const { bootCrmDb } = require('../integration/helpers/crmDb');
const migration = require('../../migrations/core/263_drop_gallery_theming');

let db; let cleanup;
beforeAll(async () => { ({ db, cleanup } = await bootCrmDb()); }, 120000);
afterAll(async () => { await cleanup(); });

const themeRow = () => db('app_settings').where({ setting_key: 'theme_config' }).first();

it('drops the gallery theme columns from events', async () => {
  for (const column of ['color_theme', 'css_template_id', 'header_style', 'hero_divider_style']) {
    expect(await db.schema.hasColumn('events', column)).toBe(false);
  }
});

it('drops the theme columns from event_types', async () => {
  expect(await db.schema.hasColumn('event_types', 'theme_preset')).toBe(false);
  expect(await db.schema.hasColumn('event_types', 'theme_config')).toBe(false);
});

it('drops the css_templates table', async () => {
  expect(await db.schema.hasTable('css_templates')).toBe(false);
});

it('keeps brand keys and strips gallery keys from theme_config', async () => {
  const stored = {
    primaryColor: '#123456', accentColor: '#abcdef', backgroundColor: '#ffffff',
    textColor: '#111111', fontFamily: 'Inter', headingFontFamily: 'Lora',
    borderRadius: 'md', fontSize: 'normal', shadowStyle: 'subtle',
    forceColorMode: 'light', logoUrl: '/uploads/logo.png',
    galleryLayout: 'masonry', gallerySettings: { spacing: 'tight' },
    headerStyle: 'hero', heroDividerStyle: 'wave', controlsStyle: 'sidebar',
    customCss: '.x{}', backgroundPattern: 'dots', name: 'Elegant',
  };
  await db('app_settings').insert({
    setting_key: 'theme_config', setting_value: JSON.stringify(stored), setting_type: 'theme',
  }).onConflict('setting_key').merge();

  await migration.up(db);

  const kept = JSON.parse((await themeRow()).setting_value);
  expect(kept).toEqual({
    primaryColor: '#123456', accentColor: '#abcdef', backgroundColor: '#ffffff',
    textColor: '#111111', fontFamily: 'Inter', headingFontFamily: 'Lora',
    borderRadius: 'md', fontSize: 'normal', shadowStyle: 'subtle',
    forceColorMode: 'light', logoUrl: '/uploads/logo.png',
  });
});

it('converges when run again', async () => {
  await expect(migration.up(db)).resolves.not.toThrow();
});

it('down recreates empty columns and the table', async () => {
  await migration.down(db);
  expect(await db.schema.hasColumn('events', 'color_theme')).toBe(true);
  expect(await db.schema.hasColumn('event_types', 'theme_config')).toBe(true);
  expect(await db.schema.hasTable('css_templates')).toBe(true);
  await migration.up(db);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend && npx jest __tests__/migrations/263_drop_gallery_theming.test.js`
Expected: FAIL, `Cannot find module '../../migrations/core/263_drop_gallery_theming'`.

- [ ] **Step 3: Implement the migration**

Before writing, read `backend/migrations/core/052_add_css_templates.js` and `065_add_header_style.js` for the exact column types `down()` must recreate, and `061_add_event_types_table.js` for `theme_preset` and `theme_config`. Then:

```js
/**
 * Drop gallery theming storage (client gallery redesign, 2026-10-01).
 *
 * Every gallery now renders one fixed design, so per-event themes, header
 * and divider styles, CSS templates and per-event-type presets have no
 * reader left. Brand colours, fonts and the logo inside theme_config still
 * style the admin and the customer portal, so that row is rewritten rather
 * than dropped.
 *
 * Every step is guarded so a partly migrated install converges. down()
 * recreates the structures EMPTY: the dropped values come back only from a
 * database backup.
 */
const BRAND_KEYS = [
  'primaryColor', 'accentColor', 'backgroundColor', 'textColor',
  'fontFamily', 'headingFontFamily', 'borderRadius', 'fontSize',
  'shadowStyle', 'forceColorMode', 'logoUrl',
];

const EVENT_COLUMNS = ['color_theme', 'css_template_id', 'header_style', 'hero_divider_style'];
const EVENT_TYPE_COLUMNS = ['theme_preset', 'theme_config'];

async function dropColumns(knex, table, columns) {
  if (!(await knex.schema.hasTable(table))) return;
  for (const column of columns) {
    if (await knex.schema.hasColumn(table, column)) {
      await knex.schema.alterTable(table, (t) => t.dropColumn(column));
    }
  }
}

async function stripThemeConfig(knex) {
  const row = await knex('app_settings').where({ setting_key: 'theme_config' }).first();
  if (!row || !row.setting_value) return;
  let parsed;
  try {
    parsed = typeof row.setting_value === 'string' ? JSON.parse(row.setting_value) : row.setting_value;
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== 'object') return;
  const kept = {};
  for (const key of BRAND_KEYS) {
    if (parsed[key] !== undefined) kept[key] = parsed[key];
  }
  await knex('app_settings').where({ setting_key: 'theme_config' })
    .update({ setting_value: JSON.stringify(kept) });
}

exports.up = async function up(knex) {
  // The foreign key column goes before the table it points at.
  await dropColumns(knex, 'events', EVENT_COLUMNS);
  await dropColumns(knex, 'event_types', EVENT_TYPE_COLUMNS);
  if (await knex.schema.hasTable('css_templates')) {
    await knex.schema.dropTable('css_templates');
  }
  await stripThemeConfig(knex);
};

exports.down = async function down(knex) {
  // Recreate each structure with the column types from 052, 061 and 065.
  // Replace the bodies below with the exact definitions read in Step 3.
};
```

Fill `down()` from the three source migrations: `css_templates` table with its original columns, `events.css_template_id` integer nullable, `events.color_theme` text nullable, `events.header_style` string nullable, `events.hero_divider_style` string nullable, `event_types.theme_preset` string nullable, `event_types.theme_config` text nullable. Guard each with `hasTable` / `hasColumn` in the reverse sense. Do not reinsert seeded templates.

- [ ] **Step 4: Run it**

Run: `cd backend && npx jest __tests__/migrations/263_drop_gallery_theming.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Delete migration tests whose table is gone, run the migration folder**

The tests for 181 and 200 exercise rows in `css_templates`, which `bootCrmDb` now drops before they read.

```bash
# Xoá hai file test migration 181 và 200 (bảng css_templates không còn)
git rm backend/__tests__/migrations/181_fix_css_template_photo_height.test.js backend/__tests__/migrations/200_strip_remote_urls_from_css_templates.test.js
cd backend && npx jest __tests__/migrations
```

Expected: PASS. Any other failure names a test that still reads a dropped column; fix it in Task 3, not here, and note it.

- [ ] **Step 6: Commit**

```bash
git add backend/migrations/core/263_drop_gallery_theming.js backend/__tests__/migrations/263_drop_gallery_theming.test.js
git commit -m "feat(db): drop gallery theming columns and the css_templates table"
```

### Task 3: Backend stops reading and writing theme fields

**Files (modify unless stated):**
- Delete: `backend/src/routes/adminCssTemplates.js`, `backend/src/routes/gallery/styles.js`
- `backend/server.js` (mount of adminCssTemplates near line 846), `backend/src/routes/gallery.js` (mount of styles near line 11)
- `backend/src/routes/adminEvents/crud.js` (validators near 246, 274, 280-281, 1112, 1171, 1179-1180; duplicate near 962, 986, 1003-1004; logging 1504-1505; header style copy 1624-1641)
- `backend/src/services/eventCreationService.js` (57, 93, 97-98, 276-293, 389, 409, 425-426), `backend/src/services/eventCreationValidation.js:19`
- `backend/src/routes/v1/events.js` (156, 204), `backend/src/routes/auth.js` (552, 631, 731)
- `backend/src/routes/gallery/metadata.js` (177-185, 255, 276-277), `backend/src/services/galleryQueryService.js` (415, 451-452), `backend/src/routes/gallery/slideshow.js:256`
- `backend/src/routes/adminArchives.js:215`
- `backend/src/routes/adminEventTypes.js` (99-123, 161-178), `backend/src/services/eventTypeService.js` (111-139, 198-203, 420-432)
- `backend/src/routes/adminSettings.js` (`PUT /theme` near 1645)
- `backend/src/database/db.js` (139, 167-188), `backend/src/usage/UsageService.js` (62-70, 928-965), `backend/src/usage/expandedSnapshot.js` (33-37), `backend/src/usage/features.v2-v5.json:197`, `backend/src/usage/schema.cjs:18`, `docs/usage-coverage.v2-v5.json`
- Tests: `backend/__tests__/routes/themeSettingsStripsGalleryKeys.test.js` (create), plus the existing tests named in Step 5

**Interfaces:**
- Produces: `PUT /admin/settings/theme` persists only brand keys. Event create/update/duplicate ignore and no longer return `color_theme`, `css_template_id`, `header_style`, `hero_divider_style`. `/info`, `/photos`, slideshow and the gallery login responses no longer carry them.

- [ ] **Step 1: Write the failing route test**

Model the app setup on an existing admin settings test (find one with `rg -l "settings/theme|adminSettings" backend/__tests__`), using `bootCrmDb` and an admin JWT the same way it does. Assertion:

```js
it('stores brand keys only', async () => {
  const res = await request(app)
    .put('/api/admin/settings/theme')
    .set('Cookie', adminCookie)
    .send({ primaryColor: '#123456', galleryLayout: 'masonry', customCss: '.x{}', headerStyle: 'hero', logoUrl: '/l.png' });
  expect(res.status).toBe(200);
  const row = await db('app_settings').where({ setting_key: 'theme_config' }).first();
  expect(JSON.parse(row.setting_value)).toEqual({ primaryColor: '#123456', logoUrl: '/l.png' });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend && npx jest __tests__/routes/themeSettingsStripsGalleryKeys.test.js`
Expected: FAIL, stored object still contains `galleryLayout`.

- [ ] **Step 3: Strip gallery keys in the route**

In `adminSettings.js` above the router:

```js
// Gallery theming is gone; theme_config now carries brand styling only,
// which the admin, the customer portal and the public site still read.
// Must match BRAND_KEYS in migration 263 exactly.
const BRAND_THEME_KEYS = [
  'primaryColor', 'accentColor', 'accentDarkColor', 'backgroundColor',
  'surfaceColor', 'elevatedColor', 'surfaceBorderColor', 'textColor',
  'mutedTextColor', 'colorMode', 'forceColorMode',
  'fontFamily', 'headingFontFamily', 'fontSize',
  'borderRadius', 'buttonStyle', 'shadowStyle', 'logoUrl',
];
function brandThemeOnly(body) {
  const kept = {};
  for (const key of BRAND_THEME_KEYS) {
    if (body && body[key] !== undefined) kept[key] = body[key];
  }
  return kept;
}
```

and change the first line of the handler to `const themeSettings = brandThemeOnly(req.body);`. The activity log `theme_name` keeps reading `req.body.name || 'custom'`.

- [ ] **Step 4: Remove every other reader and writer**

Work file by file through the list above. For each: delete the field from validators, insert/update payloads, select lists and response objects; delete the duplicate copy lines; delete the `header_style` extraction from `color_theme` JSON. Delete the two route files and their mounts. In `UsageService`, `expandedSnapshot`, `features.v2-v5.json`, `schema.cjs` and `docs/usage-coverage.v2-v5.json`, delete the `custom_css` signal and the css template route entries. `general_public_site_custom_css` is a different setting: leave it.

Then prove nothing is left (expect zero hits outside migrations and the two new tests):

```bash
rg -n "color_theme|css_template|header_style|hero_divider_style|theme_preset|adminCssTemplates|css-template" backend/src backend/server.js docs/usage-coverage.v2-v5.json
rg -n "theme_config" backend/src
```

The second command must show only `adminSettings.js`, `publicSettings.js`, `publicSiteService.js` and `db.js` reads of brand colours.

- [ ] **Step 5: Fix the tests that asserted the old fields**

Run: `cd backend && npx jest`
Expected failures to fix by deleting the theme assertions (not the tests): `__tests__/routes/galleryUploadStatus.test.js` (css-template cases at 149, 160: delete those two cases), `src/routes/v1/__tests__/events.create.test.js`, `src/__tests__/publicSiteService.test.js` (only if it fed gallery keys), the usage tests `usageSnapshotSignals`, `usageV3`, `usageAdoptionEvidence`, `productUsagePg`, `seedOnlyTablesContract`, `usageCoverageInventory` (drop `custom_css` and css template entries from their expectations). Re-run until green.

- [ ] **Step 6: Commit**

```bash
git add -A backend docs/usage-coverage.v2-v5.json
git commit -m "refactor(api): remove gallery theme fields, CSS templates and the custom CSS signal"
```

---

## Phase B: The new gallery

### Task 4: Dependency, tokens, grid geometry and tile image URL

**Files:**
- Modify: `frontend/package.json` (add `"@tanstack/react-virtual": "^3.14.13"`)
- Modify: `frontend/index.html` (Google Fonts link)
- Create: `frontend/src/features/client-gallery/galleryTokens.css`
- Create: `frontend/src/features/client-gallery/layout/gridGeometry.ts`
- Create: `frontend/src/features/client-gallery/layout/tileImage.ts`
- Test: `frontend/src/features/client-gallery/__tests__/gridGeometry.test.ts`, `tileImage.test.ts`

**Interfaces:**
- Produces:
  - `gridGeometry(viewportWidth: number): { columns: number; gap: number; padding: number }`
  - `columnWidth(containerWidth: number, columns: number, gap: number): number`
  - `tileHeight(photo: { width?: number | null; height?: number | null }, colWidth: number): number`
  - `FALLBACK_RATIO = 1.5` (height over width)
  - `tilePreviewUrl(photo: Photo, tileCssWidth: number): string`

- [ ] **Step 1: Install**

Run: `cd frontend && npm install @tanstack/react-virtual@^3.14.13`
Expected: `package.json` and `package-lock.json` change.

- [ ] **Step 2: Write the failing geometry test**

```ts
import { describe, it, expect } from 'vitest';
import { gridGeometry, columnWidth, tileHeight, FALLBACK_RATIO } from '../layout/gridGeometry';

describe('gridGeometry', () => {
  it('uses two tight columns on a phone', () => {
    expect(gridGeometry(390)).toEqual({ columns: 2, gap: 4, padding: 6 });
  });
  it('switches to three columns at 768px', () => {
    expect(gridGeometry(767).columns).toBe(2);
    expect(gridGeometry(768)).toEqual({ columns: 3, gap: 12, padding: 60 });
  });
  it('uses four columns from 1920px', () => {
    expect(gridGeometry(1919).columns).toBe(3);
    expect(gridGeometry(1920)).toEqual({ columns: 4, gap: 12, padding: 60 });
  });
});

describe('columnWidth', () => {
  it('matches the reference at 1440px', () => {
    // 1440 minus 2 x 60 padding is 1320; three columns with two 12px gaps.
    expect(columnWidth(1320, 3, 12)).toBeCloseTo(432, 0);
  });
});

describe('tileHeight', () => {
  it('keeps the photo ratio', () => {
    expect(tileHeight({ width: 5152, height: 7728 }, 432)).toBeCloseTo(648, 0);
    expect(tileHeight({ width: 6000, height: 4000 }, 432)).toBeCloseTo(288, 0);
  });
  it('falls back to 2:3 when a dimension is missing or zero', () => {
    expect(tileHeight({ width: null, height: 3000 }, 400)).toBe(400 * FALLBACK_RATIO);
    expect(tileHeight({ width: 0, height: 0 }, 400)).toBe(400 * FALLBACK_RATIO);
    expect(tileHeight({}, 400)).toBe(400 * FALLBACK_RATIO);
  });
  it('never returns less than 1px', () => {
    expect(tileHeight({ width: 100000, height: 1 }, 400)).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/features/client-gallery/__tests__/gridGeometry.test.ts`
Expected: FAIL, cannot resolve `../layout/gridGeometry`.

- [ ] **Step 4: Implement geometry**

```ts
/** Grid geometry measured from the reference album (spec, "The reference, measured"). */
export const FALLBACK_RATIO = 1.5;

export function gridGeometry(viewportWidth: number): { columns: number; gap: number; padding: number } {
  if (viewportWidth < 768) return { columns: 2, gap: 4, padding: 6 };
  if (viewportWidth < 1920) return { columns: 3, gap: 12, padding: 60 };
  return { columns: 4, gap: 12, padding: 60 };
}

export function columnWidth(containerWidth: number, columns: number, gap: number): number {
  return Math.max(1, (containerWidth - gap * (columns - 1)) / columns);
}

export function tileHeight(
  photo: { width?: number | null; height?: number | null },
  colWidth: number,
): number {
  const ratio = photo.width && photo.height ? photo.height / photo.width : FALLBACK_RATIO;
  return Math.max(1, colWidth * ratio);
}
```

- [ ] **Step 5: Write the failing tile image test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { tilePreviewUrl } from '../layout/tileImage';
import type { Photo } from '../../../types';

const photo = (over: Partial<Photo> = {}) => ({
  id: 1, filename: 'a.jpg', url: '/api/gallery/s/photo/1', type: 'individual',
  size: 1, uploaded_at: '2026-01-01', width: 4000, height: 6000,
  thumbnail_url: '/api/gallery/s/thumbnail/1', slideshow_url: '/api/gallery/s/preview/1',
  ...over,
}) as Photo;

beforeEach(() => {
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
});

describe('tilePreviewUrl', () => {
  it('asks for the 640 preview when it covers the tile', () => {
    expect(tilePreviewUrl(photo(), 432)).toBe('/api/gallery/s/preview/1?w=640');
  });
  it('steps up to 1280 on a dense screen', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    expect(tilePreviewUrl(photo(), 432)).toBe('/api/gallery/s/preview/1?w=1280');
  });
  it('never asks for more than 1280 for a tile', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
    expect(tilePreviewUrl(photo(), 640)).toBe('/api/gallery/s/preview/1?w=1280');
  });
  it('uses the thumbnail for a video', () => {
    expect(tilePreviewUrl(photo({ type: 'video', media_type: 'video', slideshow_url: null }), 432))
      .toBe('/api/gallery/s/thumbnail/1');
  });
  it('falls back to preview_url, then the thumbnail, then the original', () => {
    expect(tilePreviewUrl(photo({ slideshow_url: null, preview_url: '/p/1' }), 300)).toBe('/p/1?w=640');
    expect(tilePreviewUrl(photo({ slideshow_url: null, preview_url: null }), 300)).toBe('/api/gallery/s/thumbnail/1');
    expect(tilePreviewUrl(photo({ slideshow_url: null, preview_url: null, thumbnail_url: undefined }), 300))
      .toBe('/api/gallery/s/photo/1');
  });
});
```

- [ ] **Step 6: Implement the tile URL**

`imageTiers.ts` keeps `applyDataSaver` and `withWidth` private. Export both from `imageTiers.ts` (add `export` to the two function declarations, no behaviour change), then:

```ts
import type { Photo } from '../../../types';
import { resolveMediaType } from '../../../components/gallery/hooks/useGalleryFiltering';
import { applyDataSaver, withWidth } from '../../../components/gallery/imageTiers';

/** Preview tiers a tile may ask for; 1920 is for the viewer only. */
const TILE_PREVIEW_WIDTHS = [640, 1280] as const;

/**
 * The uncropped rendition for a masonry tile. Thumbnails are square crops
 * (thumbnail_fit is seeded to cover), so a tile at the photo's own ratio uses
 * the aspect-preserved preview instead. One URL, not a srcset: the image is
 * fetched with the gallery bearer token by AuthenticatedImage.
 */
export function tilePreviewUrl(photo: Photo, tileCssWidth: number): string {
  const preview = photo.slideshow_url || photo.preview_url;
  if (resolveMediaType(photo) === 'video' || !preview) {
    return photo.thumbnail_url || photo.url;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const needed = Math.round(tileCssWidth * dpr);
  const tier = TILE_PREVIEW_WIDTHS.find((w) => w >= needed) ?? TILE_PREVIEW_WIDTHS[TILE_PREVIEW_WIDTHS.length - 1];
  return withWidth(preview, applyDataSaver(tier, TILE_PREVIEW_WIDTHS));
}
```

Check `resolveMediaType`'s signature in `useGalleryFiltering.ts` first; if it takes a different shape, adapt the call, not the test.

- [ ] **Step 7: Tokens and fonts**

`galleryTokens.css`:

```css
/* Fixed client gallery look (spec 2026-10-01). Scoped so brand tokens on
   :root, which style the admin and the portal, never reach the gallery and
   the gallery never leaks into them. */
.client-gallery {
  --cg-bg: #ffffff;
  --cg-text: #1a1a1a;
  --cg-muted: #6b6b6b;
  --cg-divider: #e6e6e6;
  --cg-accent: #f08a24;
  --cg-like: #f0524f;
  --cg-pick: #3b5bdb;
  --cg-placeholder: #f2f2f2;
  --cg-font: 'Red Hat Display', 'Noto Sans', sans-serif;
  --cg-title-font: 'DM Serif Display', Georgia, serif;
  background: var(--cg-bg);
  color: var(--cg-text);
  font-family: var(--cg-font);
  min-height: 100vh;
}
.client-gallery * { font-family: inherit; }
.client-gallery .cg-title { font-family: var(--cg-title-font); }
```

The global rule `* { font-family: var(--font-family) }` in `index.css` has the same specificity as `.client-gallery *`? It does not: `.client-gallery *` is more specific (0,1,0 vs 0,0,0), so it wins. In `frontend/index.html` `<head>` add:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Red+Hat+Display:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Check `index.html` and `nginx/` for a Content-Security-Policy that lists font origins; if one exists, add `fonts.googleapis.com` to `style-src` and `fonts.gstatic.com` to `font-src` in the same commit.

- [ ] **Step 8: Run both tests, then commit**

Run: `cd frontend && npx vitest run src/features/client-gallery/__tests__ src/components/gallery/__tests__/imageTiers.test.ts`
Expected: PASS.

```bash
git add frontend/package.json frontend/package-lock.json frontend/index.html frontend/src/features/client-gallery frontend/src/components/gallery/imageTiers.ts
git commit -m "feat(gallery): add grid geometry, uncropped tile images and fixed gallery tokens"
```

### Task 5: Controller hook, URL state and tabs

**Files:**
- Create: `frontend/src/features/client-gallery/state/urlState.ts`
- Create: `frontend/src/features/client-gallery/state/tabs.ts`
- Create: `frontend/src/features/client-gallery/state/useGalleryController.ts`
- Test: `__tests__/urlState.test.ts`, `__tests__/tabs.test.ts`, `__tests__/useGalleryController.deepLink.test.tsx`

**Interfaces:**
- Consumes: `Photo.is_liked`, `Photo.is_favorited` (Task 1).
- Produces:
  - `type GalleryTab = 'all' | 'liked' | 'picked'`
  - `type SortField = 'capture_date' | 'name' | 'date'`
  - `type ViewMode = 'grid' | 'list'`
  - `interface UrlState { sort: SortField; dir: 'asc' | 'desc'; view: ViewMode; tab: GalleryTab; photo: number | null }`
  - `readUrlState(search: string, fallback: { sort: SortField; dir: 'asc' | 'desc' }): UrlState`
  - `writeUrlState(state: Partial<UrlState>, mode?: 'push' | 'replace'): void` (keeps unrelated params such as `folder` and `token`)
  - `tabPhotos(photos: Photo[], tab: GalleryTab): Photo[]`
  - `tabCounts(photos: Photo[]): { all: number; liked: number; picked: number }`
  - `useGalleryController(slug: string, event: GalleryEventSeed, requiresPassword: boolean): GalleryController` where `GalleryEventSeed` is the `event` prop type of today's `GalleryView` minus `color_theme`, and `GalleryController` is the object described in Step 6.

- [ ] **Step 1: Failing tests for URL state**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readUrlState, writeUrlState } from '../state/urlState';

const fallback = { sort: 'capture_date' as const, dir: 'asc' as const };

describe('readUrlState', () => {
  it('uses the event default when the URL says nothing', () => {
    expect(readUrlState('', fallback)).toEqual({ sort: 'capture_date', dir: 'asc', view: 'grid', tab: 'all', photo: null });
  });
  it('reads every param', () => {
    expect(readUrlState('?sort=name&dir=desc&view=list&tab=picked&photo=42', fallback))
      .toEqual({ sort: 'name', dir: 'desc', view: 'list', tab: 'picked', photo: 42 });
  });
  it('ignores garbage values', () => {
    expect(readUrlState('?sort=size&dir=up&view=table&tab=rated&photo=abc', fallback))
      .toEqual({ sort: 'capture_date', dir: 'asc', view: 'grid', tab: 'all', photo: null });
  });
});

describe('writeUrlState', () => {
  beforeEach(() => window.history.replaceState(null, '', '/gallery/s/tok?folder=ceremony'));
  it('keeps unrelated params and drops defaults', () => {
    writeUrlState({ view: 'list', tab: 'all', photo: 7 }, 'replace');
    const params = new URLSearchParams(window.location.search);
    expect(params.get('folder')).toBe('ceremony');
    expect(params.get('view')).toBe('list');
    expect(params.get('photo')).toBe('7');
    expect(params.has('tab')).toBe(false);
  });
  it('removes photo when set to null', () => {
    writeUrlState({ photo: 7 }, 'replace');
    writeUrlState({ photo: null }, 'replace');
    expect(new URLSearchParams(window.location.search).has('photo')).toBe(false);
  });
});
```

- [ ] **Step 2: Implement `urlState.ts`**

```ts
export type GalleryTab = 'all' | 'liked' | 'picked';
export type SortField = 'capture_date' | 'name' | 'date';
export type ViewMode = 'grid' | 'list';
export interface UrlState { sort: SortField; dir: 'asc' | 'desc'; view: ViewMode; tab: GalleryTab; photo: number | null }

const SORTS: SortField[] = ['capture_date', 'name', 'date'];
const TABS: GalleryTab[] = ['all', 'liked', 'picked'];

export function readUrlState(search: string, fallback: { sort: SortField; dir: 'asc' | 'desc' }): UrlState {
  const p = new URLSearchParams(search);
  const sort = SORTS.includes(p.get('sort') as SortField) ? (p.get('sort') as SortField) : fallback.sort;
  const dirParam = p.get('dir');
  const dir = dirParam === 'asc' || dirParam === 'desc' ? dirParam : fallback.dir;
  const view: ViewMode = p.get('view') === 'list' ? 'list' : 'grid';
  const tab = TABS.includes(p.get('tab') as GalleryTab) ? (p.get('tab') as GalleryTab) : 'all';
  const photoNum = Number(p.get('photo'));
  const photo = Number.isInteger(photoNum) && photoNum > 0 ? photoNum : null;
  return { sort, dir, view, tab, photo };
}

const DEFAULTS: Partial<Record<keyof UrlState, string>> = { view: 'grid', tab: 'all' };

export function writeUrlState(state: Partial<UrlState>, mode: 'push' | 'replace' = 'replace'): void {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(state) as [keyof UrlState, unknown][]) {
    if (value === null || value === undefined || DEFAULTS[key] === String(value)) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (mode === 'push') window.history.pushState(window.history.state, '', next);
  else window.history.replaceState(window.history.state, '', next);
}
```

- [ ] **Step 3: Failing tests for tabs, then implement**

```ts
import { describe, it, expect } from 'vitest';
import { tabPhotos, tabCounts } from '../state/tabs';
import type { Photo } from '../../../types';

const p = (id: number, is_liked = false, is_favorited = false) => ({ id, is_liked, is_favorited }) as Photo;
const photos = [p(1, true), p(2, false, true), p(3, true, true), p(4)];

it('filters by tab', () => {
  expect(tabPhotos(photos, 'all').map((x) => x.id)).toEqual([1, 2, 3, 4]);
  expect(tabPhotos(photos, 'liked').map((x) => x.id)).toEqual([1, 3]);
  expect(tabPhotos(photos, 'picked').map((x) => x.id)).toEqual([2, 3]);
});

it('counts the viewer\'s own likes and picks', () => {
  expect(tabCounts(photos)).toEqual({ all: 4, liked: 2, picked: 2 });
});
```

```ts
import type { Photo } from '../../../types';
import type { GalleryTab } from './urlState';

export function tabPhotos(photos: Photo[], tab: GalleryTab): Photo[] {
  if (tab === 'liked') return photos.filter((photo) => photo.is_liked);
  if (tab === 'picked') return photos.filter((photo) => photo.is_favorited);
  return photos;
}

export function tabCounts(photos: Photo[]): { all: number; liked: number; picked: number } {
  let liked = 0; let picked = 0;
  for (const photo of photos) {
    if (photo.is_liked) liked += 1;
    if (photo.is_favorited) picked += 1;
  }
  return { all: photos.length, liked, picked };
}
```

Run: `cd frontend && npx vitest run src/features/client-gallery/__tests__/urlState.test.ts src/features/client-gallery/__tests__/tabs.test.ts`
Expected: PASS.

- [ ] **Step 4: Lift the controller out of `GalleryView`**

Create `useGalleryController.ts` by MOVING code from `frontend/src/components/gallery/GalleryView.tsx`, keeping comments, in this order:

1. `parseDefaultPhotoSort` (lines 92 to 109), adapted to return `{ sort: SortField; dir }`: map `upload_date_*` to `date`, `capture_date_*` to `capture_date`, `filename_*` to `name`. Default stays upload date descending.
2. Every hook and handler from line 113 to line 1037, EXCEPT these, which are deleted rather than moved: `useTheme` and the theme effect (621 to 677), `useGalleryCustomCss`, `sidebarOpen`, `isMobile` and its resize effect, `brandingSettings` assembly (526 to 559) other than `logo_url` for the hero logo fallback, `searchTerm` and the search analytics effect, `activeFilters`, `activeColorFilters`, `colorLabelCounts`, `ratedCount`, `handleFilterChange`, `handleColorFilterToggle`, `mediaFilter` and `showMediaFilter` (the media chip is not in the design; keep `mediaFilter` fixed at `'all'`).
3. Replace `sortBy`/`sortDesc` state with URL state: `const [url, setUrl] = useState(() => readUrlState(window.location.search, parseDefaultPhotoSort(undefined)))`, seed `sort`/`dir` once from `data.event.default_photo_sort` when the URL carried neither, and expose `setSort(field)`, `toggleDir()`, `setView(mode)`, `setTab(tab)`, `openPhoto(id | null)` that update state and call `writeUrlState` (`push` for `openPhoto`, `replace` for the rest). Add the `popstate` listener that already exists for folders so it also re-reads `UrlState`.
4. `useGalleryFiltering` is called with `sortBy: url.sort`, `sortDesc: url.dir === 'desc'`, `searchTerm: ''`, `activeFilters: []`, `activeColorFilters: []`, `mediaFilter: 'all'`. Its result is passed through `tabPhotos(result, url.tab)` to give `visiblePhotos`; `tabCounts(scopedPhotos)` gives `counts`.
5. Deep link (Review Focus 4): an effect that runs when `data` arrives and `url.photo` is set. If the photo is not in `visiblePhotos` but is in `data.photos`, set tab to `all`, open its folder through `openFolderBySlug(<its category's folder key>)` when it lives in one (use `findFolderByKey` and `folderTiles` from `components/gallery/folders` to resolve), and keep `url.photo`. If it is in neither, call `openPhoto(null)`.

Return this object (the `GalleryController` type, declare it as an exported interface in the same file):

```ts
export interface GalleryController {
  data: GalleryPhotosResponse | undefined; isLoading: boolean; error: unknown; refetch: () => void;
  event: GalleryEventSeed; slug: string;
  url: UrlState; setSort: (s: SortField) => void; toggleDir: () => void;
  setView: (v: ViewMode) => void; setTab: (t: GalleryTab) => void; openPhoto: (id: number | null) => void;
  visiblePhotos: Photo[]; scopedPhotos: Photo[]; counts: { all: number; liked: number; picked: number };
  pickLimit: number | null;
  feedbackSettings: Partial<FeedbackSettings> | undefined; identityMode: 'simple' | 'guest';
  heroPhoto: Photo | null; heroLogoUrl: string | null;
  protection: { level: 'basic' | 'standard' | 'enhanced' | 'maximum'; disableRightClick: boolean; devtools: boolean; canvas: boolean };
  showOriginalFilename: boolean;
  allowDownloads: boolean; downloadChoices: DownloadResolutionChoice[]; downloadStandard: string | undefined;
  isDownloadingAll: boolean; handleDownloadAll: () => void;
  selection: { active: boolean; setActive: (v: boolean) => void; ids: Set<number>; setIds: (s: Set<number>) => void };
  handleDownloadSelected: () => Promise<void>;
  quota: ReturnType<typeof useDownloadQuota>['quota']; offerFullPackage: boolean;
  quotaOffer: { exceeded: QuotaExceededPayload | null } | null; setQuotaOffer: (v: { exceeded: QuotaExceededPayload | null } | null) => void;
  downloadGate: DownloadGateValue; deliveredPhotoIds: Set<number>;
  downloadPackages: unknown; downloadCurrency: unknown; pendingDownloadOrder: unknown;
  resolutionPicker: { open: boolean; ids: number[] | null; close: () => void };
  people: { enabled: boolean; list: Person[]; selectedIds: number[]; toggle: (id: number) => void; matchAny: boolean; setMatchAny: (v: boolean) => void; clear: () => void; downloadableIds: number[]; downloadFiltered: () => Promise<void>; sheetOpen: boolean; setSheetOpen: (v: boolean) => void; scan: unknown };
  folders: { tiles: ReturnType<typeof folderTiles>; open: ReturnType<typeof findFolderByKey>; openBySlug: (key: string | null) => void; downloadIds: number[]; downloadCapped: boolean; downloadFolder: () => Promise<void>; rootIsFoldersOnly: boolean };
  client: { isClient: boolean; visibleCount: number; totalCount: number; toggleVisibility: (id: number, current: string) => Promise<void>; bulkVisibility: (v: 'visible' | 'hidden') => Promise<void> };
  expiry: { expiresAt: string | null; daysLeft: number | null };
  showLogout: boolean; logout: () => void;
  promoMarkdown: string | null; infoMarkdown: string | null;
}
```

Use the real exported type names from `services/downloadQuota.service.ts`, `contexts/DownloadGateContext.tsx`, `services/feedback.service.ts`, `services/gallery.service.ts` and `types/index.ts`; where a name differs, use the real one and update this interface in the file. `promoMarkdown`/`infoMarkdown` resolve the `promo_mode`/`info_mode` override exactly as `GalleryLayout.tsx` does today (read that logic and move it). `rootIsFoldersOnly` is moved from where `GalleryView` defines it (search the file for it). `pickLimit` is `feedbackSettings?.max_favorites_per_guest ?? null`.

The devtools hook and the context-menu effect move in unchanged.

- [ ] **Step 5: Failing deep-link test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useGalleryController } from '../state/useGalleryController';

const photos = [
  { id: 1, filename: 'a.jpg', url: '/1', type: 'individual', size: 1, uploaded_at: '2026-01-01', is_liked: false },
  { id: 2, filename: 'b.jpg', url: '/2', type: 'individual', size: 1, uploaded_at: '2026-01-02', is_liked: true },
];

vi.mock('../../../hooks/useGallery', () => ({
  useGalleryPhotos: () => ({ data: { event: { id: 1 }, photos, categories: [] }, isLoading: false, error: null, refetch: vi.fn() }),
  useDownloadAllPhotos: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../../../hooks/useDownloadQuota', () => ({
  useDownloadQuota: () => ({ quota: null, downloadedIds: new Set(), packages: [], pendingOrder: null, currency: 'EUR', refetch: vi.fn() }),
  useRefreshDownloadQuota: () => vi.fn(),
}));
vi.mock('../../../contexts', () => ({
  useGalleryAuth: () => ({ logout: vi.fn(), isClient: false, viaCustomer: false }),
}));
vi.mock('../../../services/feedback.service', () => ({
  feedbackService: { getGalleryFeedbackSettings: async () => ({ feedback_enabled: true }), getMyFeedback: async () => [] },
}));
vi.mock('../../../hooks/usePublicSettings', () => ({ usePublicSettings: () => ({ data: {} }) }));
vi.mock('../../../hooks/useWatermarkSettings', () => ({ useWatermarkSettings: () => ({ watermarkEnabled: false }) }));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);
const seed = { id: 1, event_name: 'E', event_type: 'wedding', event_date: null, expires_at: null };

beforeEach(() => window.history.replaceState(null, '', '/gallery/s'));

describe('deep link to a photo', () => {
  it('switches to the all tab when the photo is filtered out', async () => {
    window.history.replaceState(null, '', '/gallery/s?tab=liked&photo=1');
    const { result } = renderHook(() => useGalleryController('s', seed, false), { wrapper });
    await waitFor(() => expect(result.current.url.tab).toBe('all'));
    expect(result.current.url.photo).toBe(1);
  });
  it('drops a photo id that does not exist', async () => {
    window.history.replaceState(null, '', '/gallery/s?photo=999');
    const { result } = renderHook(() => useGalleryController('s', seed, false), { wrapper });
    await waitFor(() => expect(result.current.url.photo).toBeNull());
    expect(window.location.search).not.toContain('photo=');
  });
});
```

Add any further `vi.mock` the hook needs to render (people, analytics, devtools) the first time the test runs; mock them to inert values.

- [ ] **Step 6: Run until green, then commit**

Run: `cd frontend && npx vitest run src/features/client-gallery/__tests__`
Expected: PASS.

`GalleryView.tsx` is now broken by the move. Do not fix it: Task 12 deletes it. To keep the tree compiling between tasks, leave `GalleryView.tsx` untouched in this task (copy, do not cut) and delete the copied blocks in Task 12.

```bash
git add frontend/src/features/client-gallery
git commit -m "feat(gallery): lift gallery behaviour into a controller hook with URL state"
```

### Task 6: Like and pick toggles with cache writes

**Files:**
- Create: `frontend/src/features/client-gallery/state/useFeedbackToggle.ts`
- Test: `__tests__/useFeedbackToggle.test.tsx`

**Interfaces:**
- Consumes: `feedbackService.submitFeedback(slug, photoId: string, { feedback_type, guest_name?, guest_email? })` (a second POST of the same type removes it), `useGuestIdentityOptional()` with `identityMode` and `ensureIdentity()`, `useFeedbackLimitModal()` returning `{ modal, handleError }`, `FeedbackIdentityModal` with `isOpen`, `onClose`, `onSubmit(name, email)`, `feedbackType`.
- Produces: `useFeedbackToggle(slug: string, photosKey: unknown[], requireNameEmail: boolean): { toggle: (photo: Photo, kind: 'like' | 'favorite') => void; modals: React.ReactNode }`. `photosKey` is the exact React Query key of the photos list, `['gallery-photos', slug, 'all', guestId]`, which the controller exposes as `photosQueryKey` (add it to `GalleryController`).

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useFeedbackToggle } from '../state/useFeedbackToggle';

const submit = vi.fn();
vi.mock('../../../services/feedback.service', () => ({ feedbackService: { submitFeedback: (...a: unknown[]) => submit(...a) } }));
vi.mock('../../../contexts/GuestIdentityContext', () => ({ useGuestIdentityOptional: () => null }));
const handleError = vi.fn(() => true);
vi.mock('../../../hooks/useFeedbackLimitModal', () => ({ useFeedbackLimitModal: () => ({ modal: null, handleError }) }));

const KEY = ['gallery-photos', 's', 'all', 'g1'];
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const photo = { id: 5, is_favorited: false, favorite_count: 0, is_liked: false, like_count: 0 } as never;

beforeEach(() => {
  client = new QueryClient();
  client.setQueryData(KEY, { photos: [photo] });
  submit.mockReset();
});

const cached = () => (client.getQueryData(KEY) as { photos: Array<Record<string, unknown>> }).photos[0];

it('flips the pick flag in the cache before the server answers', async () => {
  submit.mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(() => useFeedbackToggle('s', KEY, false), { wrapper });
  act(() => result.current.toggle(photo, 'favorite'));
  expect(cached().is_favorited).toBe(true);
  expect(cached().favorite_count).toBe(1);
});

it('does not refetch the photo list', async () => {
  submit.mockResolvedValue({ created: true });
  const spy = vi.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(() => useFeedbackToggle('s', KEY, false), { wrapper });
  act(() => result.current.toggle(photo, 'like'));
  await waitFor(() => expect(submit).toHaveBeenCalled());
  expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['gallery-photos'] }));
});

it('rolls back and shows the limit modal when the pick limit is reached', async () => {
  submit.mockRejectedValue({ response: { status: 403, data: { code: 'FAVORITE_LIMIT_REACHED' } } });
  const { result } = renderHook(() => useFeedbackToggle('s', KEY, false), { wrapper });
  act(() => result.current.toggle(photo, 'favorite'));
  await waitFor(() => expect(handleError).toHaveBeenCalled());
  expect(cached().is_favorited).toBe(false);
  expect(cached().favorite_count).toBe(0);
});
```

- [ ] **Step 2: Run it, watch it fail, implement**

```tsx
import React, { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { feedbackService } from '../../../services/feedback.service';
import { useGuestIdentityOptional } from '../../../contexts/GuestIdentityContext';
import { useFeedbackLimitModal } from '../../../hooks/useFeedbackLimitModal';
import { FeedbackIdentityModal } from '../../../components/gallery/FeedbackIdentityModal';
import type { Photo } from '../../../types';

type Kind = 'like' | 'favorite';
const FLAG = { like: 'is_liked', favorite: 'is_favorited' } as const;
const COUNT = { like: 'like_count', favorite: 'favorite_count' } as const;

/**
 * Like and pick for the client gallery. Writes the photos cache in place:
 * invalidating it would refetch every page of a large album on each tap.
 * A second POST of the same type removes it on the server, so the call is
 * the same for on and off.
 */
export function useFeedbackToggle(slug: string, photosKey: unknown[], requireNameEmail: boolean) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const guestIdentity = useGuestIdentityOptional();
  const { modal: limitModal, handleError } = useFeedbackLimitModal();
  const [identity, setIdentity] = useState<{ name: string; email: string } | null>(null);
  const [pending, setPending] = useState<{ photo: Photo; kind: Kind } | null>(null);

  const flip = useCallback((photoId: number, kind: Kind, on: boolean) => {
    queryClient.setQueryData(photosKey, (old: { photos: Photo[] } | undefined) => {
      if (!old) return old;
      return {
        ...old,
        photos: old.photos.map((p) => p.id !== photoId ? p : {
          ...p,
          [FLAG[kind]]: on,
          [COUNT[kind]]: Math.max(0, (p[COUNT[kind]] ?? 0) + (on ? 1 : -1)),
        }),
      };
    });
  }, [queryClient, photosKey]);

  const send = useCallback(async (photo: Photo, kind: Kind, who: { name: string; email: string } | null) => {
    const wasOn = Boolean(photo[FLAG[kind]]);
    flip(photo.id, kind, !wasOn);
    try {
      await feedbackService.submitFeedback(slug, String(photo.id), {
        feedback_type: kind,
        guest_name: who?.name || undefined,
        guest_email: who?.email || undefined,
      });
      if (guestIdentity?.identityMode === 'guest') {
        queryClient.invalidateQueries({ queryKey: ['my-feedback', slug] });
      }
    } catch (error) {
      flip(photo.id, kind, wasOn);
      if (handleError(error)) return;
      toast.error(kind === 'like'
        ? t('feedback.likeError', 'Failed to update like')
        : t('feedback.favoriteError', 'Failed to update favorite'));
    }
  }, [flip, slug, guestIdentity, queryClient, handleError, t]);

  const toggle = useCallback((photo: Photo, kind: Kind) => {
    if (guestIdentity?.identityMode === 'guest') {
      guestIdentity.ensureIdentity().then(() => send(photo, kind, null), () => {});
      return;
    }
    if (requireNameEmail && !identity) {
      setPending({ photo, kind });
      return;
    }
    void send(photo, kind, identity);
  }, [guestIdentity, requireNameEmail, identity, send]);

  const modals = (
    <>
      <FeedbackIdentityModal
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        onSubmit={(name: string, email: string) => {
          const who = { name, email };
          setIdentity(who);
          if (pending) void send(pending.photo, pending.kind, who);
          setPending(null);
        }}
        feedbackType={pending?.kind === 'like' ? t('feedback.like', 'like') : t('feedback.favorite', 'favorite')}
      />
      {limitModal}
    </>
  );

  return { toggle, modals };
}
```

The cache stores `photos` on the object `getGalleryPhotos` returns; confirm the field name in `services/gallery.service.ts` and adjust `old.photos` if it differs.

Run: `cd frontend && npx vitest run src/features/client-gallery/__tests__/useFeedbackToggle.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/client-gallery
git commit -m "feat(gallery): toggle like and pick with in-place cache updates"
```

### Task 7: Virtualised masonry grid and tile

**Files:**
- Create: `frontend/src/features/client-gallery/icons.tsx`
- Create: `frontend/src/features/client-gallery/grid/GridTile.tsx`, `grid/MasonryGrid.tsx`
- Test: `__tests__/MasonryGrid.test.tsx`, `__tests__/GridTile.touch.test.tsx`

**Interfaces:**
- Consumes: `gridGeometry`, `columnWidth`, `tileHeight`, `tilePreviewUrl` (Task 4); `AuthenticatedImage` from `components/common`; `useInputMode` from `hooks/useInputMode` (read it: the test of PhotoCard shows it reads `matchMedia('(pointer: coarse)')`).
- Produces:
  - `<MasonryGrid photos={Photo[]} slug={string} canvas={boolean} onOpen={(id: number) => void} onToggle={(photo: Photo, kind: 'like' | 'favorite') => void} allowLikes={boolean} allowPicks={boolean} selecting={boolean} selectedIds={Set<number>} onSelect={(id: number) => void} />`
  - `<GridTile ...>` with the same per-photo props plus `width`, `height`, `priority: 'high' | 'normal'`.
  - icons: `HeartIcon({ filled })`, `PickIcon({ filled })`, `DownloadIcon`, `ShareIcon`, `SortChevron({ up })`, `GridIcon`, `ListIcon`, `BackIcon`, `CommentIcon`, `InfoIcon`, `CloseIcon`, `ArrowUpIcon`, `LogoutIcon`, `PeopleIcon`, `CartIcon`. Each is an inline 24px SVG with `stroke="currentColor"`, `strokeWidth={1.5}`, outlined like the reference; `filled` hearts use `fill="var(--cg-like)"`, filled pick is a `var(--cg-pick)` disc with a white check.

- [ ] **Step 1: Failing grid tests**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { MasonryGrid } from '../grid/MasonryGrid';
import type { Photo } from '../../../types';

vi.mock('../../../components/common', () => ({
  AuthenticatedImage: ({ src, alt }: { src: string; alt?: string }) => <img data-testid="tile-img" src={src} alt={alt} />,
}));

const photos = Array.from({ length: 2000 }, (_, i) => ({
  id: i + 1, filename: `p${i}.jpg`, url: `/o/${i}`, slideshow_url: `/p/${i}`, type: 'individual',
  size: 1, uploaded_at: '2026-01-01', width: i % 3 === 0 ? 6000 : 4000, height: i % 3 === 0 ? 4000 : 6000,
})) as Photo[];

function setViewport(width: number, height = 900) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: width });
}

const props = { slug: 's', canvas: false, onOpen: vi.fn(), onToggle: vi.fn(), allowLikes: true, allowPicks: true, selecting: false, selectedIds: new Set<number>(), onSelect: vi.fn() };

beforeEach(() => setViewport(1440));

describe('MasonryGrid', () => {
  it('renders a small window of a 2000 photo album', () => {
    render(<MasonryGrid photos={photos} {...props} />);
    const rendered = screen.getAllByTestId('grid-tile').length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(60);
  });

  it('reserves the full album height up front', () => {
    render(<MasonryGrid photos={photos} {...props} />);
    const body = screen.getByTestId('grid-body');
    expect(parseFloat(body.style.height)).toBeGreaterThan(100000);
  });

  it('places the first three photos across the top row at 1440px', () => {
    render(<MasonryGrid photos={photos} {...props} />);
    const tiles = screen.getAllByTestId('grid-tile').slice(0, 3);
    const lefts = tiles.map((t) => t.style.transform);
    expect(new Set(lefts).size).toBe(3);
    tiles.forEach((t) => expect(t.style.transform).toMatch(/translate\(\d+(\.\d+)?px, 0px\)/));
  });

  it('re-lays out with two lanes after shrinking to a phone', () => {
    const { rerender } = render(<MasonryGrid photos={photos} {...props} />);
    act(() => { setViewport(390, 844); window.dispatchEvent(new Event('resize')); });
    rerender(<MasonryGrid photos={photos} {...props} />);
    const xs = new Set(screen.getAllByTestId('grid-tile').map((t) => t.style.transform.split(',')[0]));
    expect(xs.size).toBe(2);
  });
});
```

jsdom has no layout, so `@tanstack/react-virtual` measures nothing. `MasonryGrid` must get its container width from `document.documentElement.clientWidth` minus padding (not from `getBoundingClientRect`) and pass `initialRect: { width, height: window.innerHeight }` to the virtualiser, so the window is computed in tests and on first paint alike.

- [ ] **Step 2: Implement `MasonryGrid`**

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Photo } from '../../../types';
import { gridGeometry, columnWidth, tileHeight } from '../layout/gridGeometry';
import { GridTile } from './GridTile';

interface MasonryGridProps {
  photos: Photo[]; slug: string; canvas: boolean;
  onOpen: (id: number) => void; onToggle: (photo: Photo, kind: 'like' | 'favorite') => void;
  allowLikes: boolean; allowPicks: boolean;
  selecting: boolean; selectedIds: Set<number>; onSelect: (id: number) => void;
}

function useViewportWidth(): number {
  const [width, setWidth] = useState(() => document.documentElement.clientWidth || window.innerWidth);
  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setWidth(document.documentElement.clientWidth || window.innerWidth));
    };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', onResize); };
  }, []);
  return width;
}

/**
 * Shortest-column masonry, windowed. Only tiles inside the viewport plus about
 * one screen of overscan exist in the DOM. Heights come from the photo's own
 * dimensions, so nothing reflows when images arrive.
 */
export function MasonryGrid({ photos, ...tileProps }: MasonryGridProps) {
  const viewport = useViewportWidth();
  const { columns, gap, padding } = gridGeometry(viewport);
  const inner = Math.max(1, viewport - padding * 2);
  const colWidth = columnWidth(inner, columns, gap);
  const listRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  useEffect(() => { setOffset(listRef.current?.offsetTop ?? 0); }, [viewport]);

  const heights = useMemo(() => photos.map((p) => tileHeight(p, colWidth)), [photos, colWidth]);

  const virtualizer = useWindowVirtualizer({
    count: photos.length,
    estimateSize: (i) => heights[i] + gap,
    lanes: columns,
    overscan: Math.max(6, columns * 4),
    scrollMargin: offset,
    initialRect: { width: viewport, height: window.innerHeight },
    getItemKey: (i) => photos[i].id,
  });

  // Lane count and sizes change together on a breakpoint; keep the first
  // visible photo in view across the re-layout (Review Focus 5).
  const anchor = useRef<number | null>(null);
  useEffect(() => {
    const first = virtualizer.getVirtualItems()[0];
    anchor.current = first ? first.index : null;
  });
  useEffect(() => {
    virtualizer.measure();
    if (anchor.current !== null && window.scrollY > offset) {
      virtualizer.scrollToIndex(anchor.current, { align: 'start' });
    }
  }, [columns, colWidth]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = virtualizer.getVirtualItems();

  return (
    <div ref={listRef} style={{ paddingLeft: padding, paddingRight: padding }}>
      <div data-testid="grid-body" style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
        {items.map((item) => {
          const photo = photos[item.index];
          const x = item.lane * (colWidth + gap);
          const y = item.start - virtualizer.options.scrollMargin;
          return (
            <GridTile
              key={item.key}
              photo={photo}
              width={colWidth}
              height={heights[item.index]}
              x={x}
              y={y}
              priority={item.index < columns ? 'high' : 'normal'}
              {...tileProps}
            />
          );
        })}
      </div>
    </div>
  );
}
```

Read the installed `@tanstack/virtual-core` type definitions for `lanes`, `initialRect`, `scrollMargin` and `VirtualItem.lane` before running. `item.lane` is the lane the virtualiser assigned by shortest-lane fill; never substitute `item.index % columns`, which is a plain grid and breaks masonry ordering.

- [ ] **Step 3: Failing touch test for the tile, then implement `GridTile`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { GridTile } from '../grid/GridTile';
import { __inputModeTesting } from '../../../hooks/useInputMode';

vi.mock('../../../components/common', () => ({ AuthenticatedImage: () => <img alt="" /> }));

const photo = { id: 3, filename: 'a.jpg', url: '/o', slideshow_url: '/p', type: 'individual', size: 1, uploaded_at: '', width: 4000, height: 6000, like_count: 2, is_liked: false, is_favorited: true } as never;
const base = { photo, width: 300, height: 450, x: 0, y: 0, priority: 'normal' as const, slug: 's', canvas: false, allowLikes: true, allowPicks: true, selecting: false, selectedIds: new Set<number>(), onSelect: vi.fn() };

it('opens the viewer from the body of the tile', () => {
  const onOpen = vi.fn(); const onToggle = vi.fn();
  render(<GridTile {...base} onOpen={onOpen} onToggle={onToggle} />);
  fireEvent.click(screen.getByTestId('grid-tile'));
  expect(onOpen).toHaveBeenCalledWith(3);
  expect(onToggle).not.toHaveBeenCalled();
});

it('likes from the heart without opening the viewer', () => {
  const onOpen = vi.fn(); const onToggle = vi.fn();
  render(<GridTile {...base} onOpen={onOpen} onToggle={onToggle} />);
  fireEvent.click(screen.getByRole('button', { name: /like/i }));
  expect(onToggle).toHaveBeenCalledWith(photo, 'like');
  expect(onOpen).not.toHaveBeenCalled();
});

it('shows the badges permanently on a touch screen', () => {
  __inputModeTesting.setCoarse?.(true);
  render(<GridTile {...base} onOpen={vi.fn()} onToggle={vi.fn()} />);
  expect(screen.getByTestId('tile-badges').className).toContain('cg-badges-always');
});

it('keeps a picked tile\'s badge visible without hover', () => {
  render(<GridTile {...base} onOpen={vi.fn()} onToggle={vi.fn()} />);
  expect(screen.getByRole('button', { name: /unpick/i }).className).toContain('cg-badge-on');
});
```

Read `hooks/useInputMode.ts` for the real test hook name before running; replace `__inputModeTesting.setCoarse` with what it exposes (the PhotoCard test stubs `matchMedia`, copy that helper if there is no setter).

```tsx
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthenticatedImage } from '../../../components/common';
import { useInputMode } from '../../../hooks/useInputMode';
import type { Photo } from '../../../types';
import { tilePreviewUrl } from '../layout/tileImage';
import { HeartIcon, PickIcon } from '../icons';

interface GridTileProps {
  photo: Photo; width: number; height: number; x: number; y: number; priority: 'high' | 'normal';
  slug: string; canvas: boolean;
  onOpen: (id: number) => void; onToggle: (photo: Photo, kind: 'like' | 'favorite') => void;
  allowLikes: boolean; allowPicks: boolean;
  selecting: boolean; selectedIds: Set<number>; onSelect: (id: number) => void;
}

function GridTileImpl({ photo, width, height, x, y, priority, slug, canvas, onOpen, onToggle, allowLikes, allowPicks, selecting, selectedIds, onSelect }: GridTileProps) {
  const { t } = useTranslation();
  const coarse = useInputMode() === 'touch';
  const selected = selectedIds.has(photo.id);
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); fn(); };

  return (
    <div
      data-testid="grid-tile"
      role="button"
      tabIndex={0}
      aria-label={photo.original_filename || photo.filename}
      onClick={() => (selecting ? onSelect(photo.id) : onOpen(photo.id))}
      onKeyDown={(e) => { if (e.key === 'Enter') (selecting ? onSelect(photo.id) : onOpen(photo.id)); }}
      className="cg-tile group"
      style={{ position: 'absolute', width, height, transform: `translate(${x}px, ${y}px)` }}
    >
      <AuthenticatedImage
        src={tilePreviewUrl(photo, width)}
        alt=""
        slug={slug}
        isGallery
        useCanvasRendering={canvas}
        queuePriority={priority}
        decoding="async"
        draggable={false}
        className="cg-tile-img"
      />
      <div data-testid="tile-badges" className={`cg-badges ${coarse ? 'cg-badges-always' : ''}`}>
        {allowLikes && (
          <button
            type="button"
            aria-label={photo.is_liked ? t('clientGallery.unlike', 'Unlike') : t('clientGallery.like', 'Like')}
            className={`cg-badge cg-badge-like ${photo.is_liked ? 'cg-badge-on' : ''}`}
            onClick={stop(() => onToggle(photo, 'like'))}
          >
            <HeartIcon filled={Boolean(photo.is_liked)} />
            {(photo.like_count ?? 0) > 0 && <span>{photo.like_count}</span>}
          </button>
        )}
        {allowPicks && !selecting && (
          <button
            type="button"
            aria-label={photo.is_favorited ? t('clientGallery.unpick', 'Unpick') : t('clientGallery.pick', 'Pick')}
            className={`cg-badge cg-badge-pick ${photo.is_favorited ? 'cg-badge-on' : ''}`}
            onClick={stop(() => onToggle(photo, 'favorite'))}
          >
            <PickIcon filled={Boolean(photo.is_favorited)} />
          </button>
        )}
        {selecting && (
          <span aria-hidden className={`cg-select ${selected ? 'cg-select-on' : ''}`} />
        )}
      </div>
    </div>
  );
}

export const GridTile = memo(GridTileImpl);
```

Add to `galleryTokens.css`:

```css
.client-gallery .cg-tile { background: var(--cg-placeholder); overflow: hidden; cursor: pointer; contain: strict; }
.client-gallery .cg-tile-img { width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0; transition: opacity 200ms ease; }
.client-gallery .cg-tile-img[data-loaded], .client-gallery .cg-tile-img.loaded { opacity: 1; }
.client-gallery .cg-badges { position: absolute; inset: 0; pointer-events: none; }
.client-gallery .cg-badge { position: absolute; top: 12px; display: inline-flex; align-items: center; gap: 4px; color: #fff; pointer-events: none; opacity: 0; transition: opacity 120ms ease; filter: drop-shadow(0 1px 2px rgba(0,0,0,.35)); }
.client-gallery .cg-badge-like { left: 12px; }
.client-gallery .cg-badge-pick { right: 12px; }
.client-gallery .cg-tile:hover .cg-badge,
.client-gallery .cg-badges-always .cg-badge,
.client-gallery .cg-badge-on { opacity: 1; pointer-events: auto; }
.client-gallery .cg-select { position: absolute; top: 12px; right: 12px; width: 24px; height: 24px; border-radius: 50%; border: 2px solid #fff; background: rgba(0,0,0,.15); }
.client-gallery .cg-select-on { background: var(--cg-pick); border-color: var(--cg-pick); }
@media (max-width: 767px) { .client-gallery .cg-badge { top: 6px; } .client-gallery .cg-badge-like { left: 6px; } .client-gallery .cg-badge-pick { right: 6px; } }
```

Check how `AuthenticatedImage` signals a finished load (prop `onLoad`, a class, or an attribute). Make the fade use that signal; if it exposes only `onLoad`, hold a `loaded` state in `GridTile` and add `loaded` to `className`. Visibility and hit testing move together through `pointer-events`, as #1263 requires.

- [ ] **Step 4: Run, then commit**

Run: `cd frontend && npx vitest run src/features/client-gallery/__tests__/MasonryGrid.test.tsx src/features/client-gallery/__tests__/GridTile.touch.test.tsx`
Expected: PASS.

```bash
git add frontend/src/features/client-gallery
git commit -m "feat(gallery): add the virtualised masonry grid and its tiles"
```

### Task 8: Virtualised list view

**Files:**
- Create: `frontend/src/features/client-gallery/list/PhotoList.tsx`, `list/ListRow.tsx`
- Test: `__tests__/PhotoList.test.tsx`

**Interfaces:**
- Produces: `<PhotoList photos slug canvas onOpen onToggle allowLikes allowPicks showOriginalFilename />` (same types as `MasonryGrid` minus selection, plus `showOriginalFilename: boolean`).
- Helper inside `ListRow.tsx`: `formatBytes(bytes: number): string` returning `24.3 MB` style (one decimal, base 1024, units B, KB, MB, GB) and `formatDimensions(w?: number | null, h?: number | null): string` returning `5152 × 7728` or an empty string.

- [ ] **Step 1: Failing test**

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { PhotoList } from '../list/PhotoList';
import { formatBytes, formatDimensions } from '../list/ListRow';

vi.mock('../../../components/common', () => ({ AuthenticatedImage: () => <img alt="" /> }));

it('formats sizes and dimensions like the reference', () => {
  expect(formatBytes(25480396)).toBe('24.3 MB');
  expect(formatBytes(900)).toBe('900 B');
  expect(formatDimensions(5152, 7728)).toBe('5152 × 7728');
  expect(formatDimensions(null, 7728)).toBe('');
});

it('windows a long list', () => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  const photos = Array.from({ length: 2000 }, (_, i) => ({ id: i + 1, filename: `p${i}.jpg`, url: '/o', type: 'individual', size: 1000, uploaded_at: '' })) as never[];
  render(<PhotoList photos={photos} slug="s" canvas={false} onOpen={vi.fn()} onToggle={vi.fn()} allowLikes allowPicks showOriginalFilename={false} />);
  expect(screen.getAllByTestId('list-row').length).toBeLessThan(30);
});
```

- [ ] **Step 2: Implement**

`PhotoList` uses `useWindowVirtualizer({ count, estimateSize: () => 150, overscan: 6, scrollMargin: offsetTop, initialRect: { width: window.innerWidth, height: window.innerHeight } })`, renders a header row (File Name, Dimension, Size, Action, translated) above a relative body of `getTotalSize()` height, each `ListRow` absolutely positioned at `translateY(item.start - scrollMargin)`. The side padding follows `gridGeometry(viewport).padding`. `ListRow` renders: an 80px-wide thumbnail (`thumbnail_url` through `thumbnailUrlForTile(photo.thumbnail_url, photo, 80)`, `object-fit: cover`, height 120px, the square crop is fine here), the name (`showOriginalFilename && photo.original_filename ? photo.original_filename : photo.filename`), `formatDimensions`, `formatBytes(photo.size)`, and the same like and pick buttons as the tile (always visible). A 1px `var(--cg-divider)` bottom border. Clicking the row outside the buttons calls `onOpen(photo.id)`. On viewports under 768px, hide the Dimension and Size columns.

```ts
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes || 0))} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024; let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export function formatDimensions(w?: number | null, h?: number | null): string {
  return w && h ? `${w} × ${h}` : '';
}
```

- [ ] **Step 3: Run, commit**

Run: `cd frontend && npx vitest run src/features/client-gallery/__tests__/PhotoList.test.tsx`
Expected: PASS.

```bash
git add frontend/src/features/client-gallery
git commit -m "feat(gallery): add the virtualised list view"
```

### Task 9: Cover and expiry notice

**Files:**
- Create: `frontend/src/features/client-gallery/cover/CoverHero.tsx`, `cover/ExpiryToast.tsx`
- Test: `__tests__/CoverHero.test.tsx`, `__tests__/ExpiryToast.test.tsx`

**Interfaces:**
- Produces:
  - `<CoverHero photo={Photo | null} slug title subtitle logoUrl={string | null} anchor={string} onViewAlbum={() => void} languagePicker={React.ReactNode} />`
  - `<ExpiryToast slug expiresAt={string | null} />`

- [ ] **Step 1: Failing tests**

```tsx
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CoverHero } from '../cover/CoverHero';
import { ExpiryToast } from '../cover/ExpiryToast';

vi.mock('../../../components/common', () => ({ AuthenticatedImage: ({ src }: { src: string }) => <img data-testid="cover-img" src={src} alt="" /> }));

it('shows the title, subtitle and a View Album button that scrolls on', () => {
  const onViewAlbum = vi.fn();
  render(<CoverHero photo={{ id: 1, hero_url: '/h/1', url: '/o/1' } as never} slug="s" title="Couple" subtitle="huyhiep" logoUrl={null} anchor="center" onViewAlbum={onViewAlbum} languagePicker={null} />);
  expect(screen.getByRole('heading', { level: 1, name: 'Couple' })).toBeTruthy();
  expect(screen.getByText('huyhiep')).toBeTruthy();
  expect(screen.getByTestId('cover-img').getAttribute('src')).toBe('/h/1');
  fireEvent.click(screen.getByRole('button', { name: /view album/i }));
  expect(onViewAlbum).toHaveBeenCalled();
});

it('renders a plain cover without a photo', () => {
  render(<CoverHero photo={null} slug="s" title="Empty" subtitle="" logoUrl={null} anchor="center" onViewAlbum={vi.fn()} languagePicker={null} />);
  expect(screen.queryByTestId('cover-img')).toBeNull();
});

beforeEach(() => sessionStorage.clear());

it('shows the expiry date and remembers a dismissal for the session', () => {
  const { unmount } = render(<ExpiryToast slug="s" expiresAt="2026-10-07T00:00:00Z" />);
  expect(screen.getByText(/07 Oct 2026/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /close/i }));
  unmount();
  render(<ExpiryToast slug="s" expiresAt="2026-10-07T00:00:00Z" />);
  expect(screen.queryByText(/07 Oct 2026/)).toBeNull();
});

it('renders nothing for a gallery that never expires', () => {
  const { container } = render(<ExpiryToast slug="s" expiresAt={null} />);
  expect(container.firstChild).toBeNull();
});
```

- [ ] **Step 2: Implement**

`CoverHero`: a `<section>` of `height: 100svh` (fallback `100vh`), `position: relative`, background `#111`. When `photo` is set, an `AuthenticatedImage` of `photo.hero_url || photo.slideshow_url || photo.url` with `object-fit: cover`, `object-position` from `anchor` (accept the stored values `center`, `top`, `bottom`, `left`, `right`, else `center`), `queuePriority="high"`. A bottom gradient `linear-gradient(to top, rgba(0,0,0,.55), rgba(0,0,0,0) 40%)`. Bottom left, 40px from the edges on desktop and 20px under 768px: `<h1 className="cg-title">` at `clamp(40px, 5vw, 72px)`, white, line height 1.05, and the subtitle at 18px weight 400 under it. Bottom right: a button with a 1.5px white border, 999px radius, 10px 20px padding, white text, 16px weight 600, label `t('clientGallery.viewAlbum', 'View Album')`. Top right: `languagePicker`. Top left: the logo image when `logoUrl` is set, max height 40px. The subtitle is the photographer name: pass `settingsData.branding_company_name` from the controller (add `brandName: string` to `GalleryController`, read from `usePublicSettings`).

`ExpiryToast`: `position: fixed; top: 16px; left: 50%; transform: translateX(-50%)`, background `rgba(32,32,32,.92)`, white 14px text, 8px radius, 8px 16px padding, `z-index: 40`, info icon, text `t('clientGallery.expiresOn', 'Your album expires on {{date}}', { date })` where `date` is `format(parseISO(expiresAt), 'dd MMM yyyy')` from `date-fns` wrapped in `<strong>` through `Trans`, and a close button labelled `t('common.close', 'Close')`. Dismissal is stored in `sessionStorage` under `cg_expiry_dismissed_<slug>` inside `try/catch`. Date formatting uses the active i18n language through the `date-fns` locale map the app already has (search `rg -n "date-fns/locale" frontend/src` and reuse it); the test runs in `en`.

- [ ] **Step 3: Add the i18n keys**

Add under a new top-level `clientGallery` object in `frontend/src/i18n/locales/en.json`, then the same keys in `de.json` and `vi.json`:

| key | en | de | vi |
|---|---|---|---|
| `viewAlbum` | View Album | Album ansehen | Xem album |
| `expiresOn` | Your album expires on <1>{{date}}</1> | Dein Album läuft am <1>{{date}}</1> ab | Album của bạn hết hạn vào <1>{{date}}</1> |
| `like` | Like | Gefällt mir | Thích |
| `unlike` | Unlike | Gefällt mir nicht mehr | Bỏ thích |
| `pick` | Pick | Auswählen | Chọn |
| `unpick` | Unpick | Auswahl entfernen | Bỏ chọn |

Every later task adds its own keys to this table in the same way.

- [ ] **Step 4: Run, commit**

Run: `cd frontend && npx vitest run src/features/client-gallery/__tests__/CoverHero.test.tsx src/features/client-gallery/__tests__/ExpiryToast.test.tsx`
Expected: PASS.

```bash
git add frontend/src/features/client-gallery frontend/src/i18n/locales/en.json frontend/src/i18n/locales/de.json frontend/src/i18n/locales/vi.json
git commit -m "feat(gallery): add the full-screen cover and the expiry notice"
```

### Task 10: Toolbar

**Files:**
- Create: `frontend/src/features/client-gallery/toolbar/GalleryToolbar.tsx`, `toolbar/DownloadMenu.tsx`, `toolbar/SortMenu.tsx`
- Test: `__tests__/GalleryToolbar.test.tsx`

**Interfaces:**
- Consumes: `GalleryController` (Task 5), `DownloadQuotaBadge` (props `quota`), `PeopleStrip` is NOT used here (people open the `PeopleSheet`).
- Produces: `<GalleryToolbar c={GalleryController} onShare={() => void} />`.

Layout (desktop): row one has the three tabs at the left (`Total N`, heart `Like N`, pick `Pick N / limit` or `Pick N`), the share icon and, when `c.showLogout`, a logout icon at the right. Row two, right aligned: people icon (when `c.people.enabled`), folder breadcrumb (when `c.folders.open`), quota badge (when `c.quota?.enabled && c.client.isClient`), then either the "get all photos" cart button (when `c.offerFullPackage && c.allowDownloads`) or the Download menu (when `c.allowDownloads`), the sort direction chevron in a 32px light grey rounded square, the sort field menu, and the grid/list toggle. The active tab is underlined 2px `var(--cg-accent)`, 4px below the text. The bar is `position: sticky; top: 0; z-index: 30; background: var(--cg-bg)`. It gains the class `cg-toolbar-compact` once the cover is out of view (an `IntersectionObserver` on a sentinel placed just above the toolbar), in which row two folds into row one as icons only. Under 768px row two is always icons only and the tabs show icon plus number.

- [ ] **Step 1: Failing test**

Build a `fakeController(overrides)` helper in the test that returns a complete `GalleryController` with inert values (`vi.fn()` for every function, empty sets, `counts: { all: 205, liked: 0, picked: 9 }`, `pickLimit: 205`, `allowDownloads: true`, feedback settings `{ allow_likes: true, allow_favorites: true }`). Then:

```tsx
it('shows the three tabs with counts and the pick limit', () => {
  render(<GalleryToolbar c={fakeController()} onShare={vi.fn()} />);
  expect(screen.getByRole('tab', { name: /total 205/i })).toBeTruthy();
  expect(screen.getByRole('tab', { name: /like 0/i })).toBeTruthy();
  expect(screen.getByRole('tab', { name: /pick 9 \/ 205/i })).toBeTruthy();
});

it('hides like and pick when feedback switches them off', () => {
  render(<GalleryToolbar c={fakeController({ feedbackSettings: { allow_likes: false, allow_favorites: false } })} onShare={vi.fn()} />);
  expect(screen.queryByRole('tab', { name: /like/i })).toBeNull();
  expect(screen.queryByRole('tab', { name: /pick/i })).toBeNull();
});

it('shows Pick N without a limit', () => {
  render(<GalleryToolbar c={fakeController({ pickLimit: null })} onShare={vi.fn()} />);
  expect(screen.getByRole('tab', { name: /^pick 9$/i })).toBeTruthy();
});

it('changes tab, sort field, sort direction and view', () => {
  const c = fakeController();
  render(<GalleryToolbar c={c} onShare={vi.fn()} />);
  fireEvent.click(screen.getByRole('tab', { name: /like 0/i }));
  expect(c.setTab).toHaveBeenCalledWith('liked');
  fireEvent.click(screen.getByRole('button', { name: /change sort direction/i }));
  expect(c.toggleDir).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /creation time/i }));
  fireEvent.click(screen.getByRole('menuitem', { name: /file name/i }));
  expect(c.setSort).toHaveBeenCalledWith('name');
  fireEvent.click(screen.getByRole('button', { name: /change view mode/i }));
  expect(c.setView).toHaveBeenCalledWith('list');
});

it('offers download all and multi-select', () => {
  const c = fakeController();
  render(<GalleryToolbar c={c} onShare={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /^download$/i }));
  fireEvent.click(screen.getByRole('menuitem', { name: /^all$/i }));
  expect(c.handleDownloadAll).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /^download$/i }));
  fireEvent.click(screen.getByRole('menuitem', { name: /multi-select/i }));
  expect(c.selection.setActive).toHaveBeenCalledWith(true);
});

it('swaps the download menu for the order offer when the album no longer fits', () => {
  const c = fakeController({ offerFullPackage: true });
  render(<GalleryToolbar c={c} onShare={vi.fn()} />);
  expect(screen.queryByRole('button', { name: /^download$/i })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /get all photos/i }));
  expect(c.setQuotaOffer).toHaveBeenCalledWith({ exceeded: null });
});

it('hides downloads entirely when they are off', () => {
  render(<GalleryToolbar c={fakeController({ allowDownloads: false })} onShare={vi.fn()} />);
  expect(screen.queryByRole('button', { name: /^download$/i })).toBeNull();
});
```

- [ ] **Step 2: Implement**

Menus are small headless popovers: a button with `aria-haspopup="menu"` and `aria-expanded`, a `role="menu"` list of `role="menuitem"` buttons, closed on outside click and Escape. No library. While `c.selection.active`, row two shows instead: `{n} selected`, a Download selected button (calls `c.handleDownloadSelected`, disabled at 0), for clients the hide/show selected buttons (`c.client.bulkVisibility`), and Cancel (clears ids and sets active false).

Sort labels: `capture_date` is `t('clientGallery.sort.captureDate', 'Creation Time')`, `name` is `t('clientGallery.sort.fileName', 'File Name')`, `date` is `t('clientGallery.sort.lastUpload', 'Last Upload')`. Add these and every other new label to `en`, `de`, `vi`: `tabs.total` (Total / Gesamt / Tất cả), `tabs.like` (Like / Gefällt mir / Thích), `tabs.pick` (Pick / Auswahl / Chọn), `download` (Download / Herunterladen / Tải về), `downloadAll` (All / Alle / Tất cả), `multiSelect` (Multi-select / Mehrfachauswahl / Chọn nhiều), `downloadSelected` (Download selected / Auswahl herunterladen / Tải ảnh đã chọn), `selectedCount` ({{count}} selected / {{count}} ausgewählt / Đã chọn {{count}}), `cancel` (Cancel / Abbrechen / Huỷ), `changeSortDirection` (Change Sort Direction / Sortierrichtung ändern / Đổi chiều sắp xếp), `changeViewMode` (Change View Mode / Ansicht wechseln / Đổi kiểu xem), `share` (Share / Teilen / Chia sẻ), `linkCopied` (Link copied / Link kopiert / Đã chép link), `logout` (Log out / Abmelden / Đăng xuất), `people` (People / Personen / Người trong ảnh). Reuse `gallery.downloadQuota.getAll` for the order offer.

- [ ] **Step 3: Run, commit**

Run: `cd frontend && npx vitest run src/features/client-gallery/__tests__/GalleryToolbar.test.tsx`
Expected: PASS.

```bash
git add frontend/src/features/client-gallery frontend/src/i18n/locales/en.json frontend/src/i18n/locales/de.json frontend/src/i18n/locales/vi.json
git commit -m "feat(gallery): add the gallery toolbar with tabs, download, sort and view"
```

### Task 11: Photo viewer

**Files:**
- Create: `frontend/src/features/client-gallery/viewer/PhotoViewer.tsx`, `viewer/ViewerRail.tsx`, `viewer/Filmstrip.tsx`, `viewer/FileInfoPanel.tsx`
- Test: `__tests__/PhotoViewer.test.tsx`, `__tests__/Filmstrip.test.tsx`

**Interfaces:**
- Consumes: `yet-another-react-lightbox` (`Lightbox`, `Zoom` plugin, `render.slide`), `AuthenticatedImage`, `lightboxImageUrl` from `components/gallery/imageTiers`, `VideoPlayer` from `components/gallery/VideoPlayer` (read its props), `PhotoComments` (props `photoId`, `gallerySlug`, `comments`, `isEnabled`, `requireNameEmail`, `showToGuests`, `onCommentAdded`), `feedbackService.getPhotoFeedback(slug, photoId)`, `useDownloadGate` and `canDownloadPhotoNow` from the download gate context and `downloadQuotaOffer.ts`, `useDownloadPhoto` from `hooks/useGallery`, `useRefreshDownloadQuota`, `useDevToolsProtection`.
- Produces: `<PhotoViewer photos={Photo[]} openId={number | null} onClose={() => void} onNavigate={(id: number) => void} c={GalleryController} onToggle={(photo, kind) => void} />`.

- [ ] **Step 1: Failing tests**

```tsx
it('opens on the photo in the URL and steps with the arrow keys', async () => {
  const onNavigate = vi.fn();
  render(<PhotoViewer photos={photos} openId={2} onClose={vi.fn()} onNavigate={onNavigate} c={fakeController()} onToggle={vi.fn()} />);
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(3));
  fireEvent.keyDown(window, { key: 'ArrowLeft' });
  await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(1));
});

it('mounts no more than three slides', () => {
  render(<PhotoViewer photos={photos} openId={50} onClose={vi.fn()} onNavigate={vi.fn()} c={fakeController()} onToggle={vi.fn()} />);
  expect(document.querySelectorAll('.yarl__slide').length).toBeLessThanOrEqual(3);
});

it('draws the current slide on a canvas when the event asks for it', () => {
  render(<PhotoViewer photos={photos} openId={2} onClose={vi.fn()} onNavigate={vi.fn()} c={fakeController({ protection: { level: 'standard', disableRightClick: true, devtools: false, canvas: true } })} onToggle={vi.fn()} />);
  expect(screen.getByTestId('viewer-canvas-image')).toBeTruthy();
});

it('closes from the back button', () => {
  const onClose = vi.fn();
  render(<PhotoViewer photos={photos} openId={2} onClose={onClose} onNavigate={vi.fn()} c={fakeController()} onToggle={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /back/i }));
  expect(onClose).toHaveBeenCalled();
});

it('shows file info', () => {
  render(<PhotoViewer photos={photos} openId={2} onClose={vi.fn()} onNavigate={vi.fn()} c={fakeController()} onToggle={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /file info/i }));
  expect(screen.getByText('5152 × 7728')).toBeTruthy();
});
```

`photos` is 100 items with `width: 5152, height: 7728`, `slideshow_url`, ids 1 to 100. Mock `AuthenticatedImage` to render `<img data-testid={useCanvasRendering ? 'viewer-canvas-image' : 'viewer-image'} />`.

Filmstrip test: 2000 photos, `openId` 1000; assert fewer than 40 `filmstrip-thumb` elements and that the one with `aria-current="true"` has id 1000.

- [ ] **Step 2: Implement**

`PhotoViewer` renders `Lightbox` with `open={openId !== null}`, `index` from `photos.findIndex`, `slides` built from photos as `{ src: lightboxImageUrl(p), width: p.width, height: p.height, alt: '' }` (videos get `type: 'video'` handled by a `render.slide` branch that renders `VideoPlayer`), `carousel={{ finite: false, preload: 1 }}`, `animation={{ fade: 150, swipe: 250 }}`, `controller={{ closeOnBackdropClick: false }}`, `plugins={[Zoom]}`, `styles={{ container: { backgroundColor: '#ffffff' } }}`, `on={{ view: ({ index }) => onNavigate(photos[index].id) }}`, `close={onClose}`, toolbar buttons empty, and `render={{ slide: ..., controls: () => <ViewerRail .../>, buttonPrev: hidden on touch, buttonNext: hidden on touch, slideFooter: undefined }}`. The current-slide canvas branch is the body of `layouts/PremiumLightboxImage.tsx` (copy `renderPremiumLightboxImage` and `PremiumLightboxImage` into `PhotoViewer.tsx`, give the `AuthenticatedImage` a `data-testid="viewer-canvas-image"`). Leave room for the rail and the filmstrip with `styles.slide: { padding: '24px 24px 96px 96px' }` on desktop and `'8px 8px 72px 8px'` under 768px.

`ViewerRail`: vertical column at the left, 96px wide on desktop, a horizontal bar at the top under 768px. Buttons with accessible names: Back (`var(--cg-accent)`), Like (when allowed), Pick (when allowed), a 32px divider, Comment (when `allow_comments`), File info, Download (when the gate allows: use `canDownloadPhotoNow` with the gate and call `useDownloadPhoto().mutate`, then `refreshDownloadQuota(slug)`; a refusal goes through `gate.reportDownloadFailure`). Comment and File info toggle a 360px side panel on the right (bottom sheet under 768px). The comment panel loads `feedbackService.getPhotoFeedback(slug, String(id))` with React Query key `['photo-feedback', slug, String(id)]` and renders `PhotoComments`. `FileInfoPanel` lists name (original when `showOriginalFilename`), `formatDimensions`, `formatBytes`, and `captured_at` formatted `dd MMM yyyy, HH:mm` when present.

`Filmstrip`: a horizontal `useVirtualizer` (not window) over a 72px tall scroll container at the bottom, item width 56px plus 6px gap, `overscan: 8`, `getScrollElement` the container, `initialRect: { width: window.innerWidth, height: 72 }`. Thumbnails use `thumbnailUrlForTile(p.thumbnail_url, p, 56)`. The current item has `aria-current="true"` and a 2px `var(--cg-text)` outline, and is scrolled into the centre with `scrollToIndex(index, { align: 'center' })` whenever `openId` changes. Clicking a thumb calls `onNavigate`.

Add i18n keys (en, de, vi): `viewer.back` (Back / Zurück / Quay lại), `viewer.comments` (Comments / Kommentare / Bình luận), `viewer.fileInfo` (File info / Dateiinfo / Thông tin file), `viewer.fileName` (File name / Dateiname / Tên file), `viewer.dimensions` (Dimensions / Abmessungen / Kích thước), `viewer.size` (Size / Größe / Dung lượng), `viewer.captured` (Captured / Aufgenommen / Ngày chụp), `viewer.download` (Download / Herunterladen / Tải về). The list view header reuses `viewer.fileName`, `viewer.dimensions`, `viewer.size` and adds `list.action` (Action / Aktion / Thao tác).

- [ ] **Step 3: Run, commit**

Run: `cd frontend && npx vitest run src/features/client-gallery/__tests__/PhotoViewer.test.tsx src/features/client-gallery/__tests__/Filmstrip.test.tsx`
Expected: PASS.

```bash
git add frontend/src/features/client-gallery frontend/src/i18n/locales/en.json frontend/src/i18n/locales/de.json frontend/src/i18n/locales/vi.json
git commit -m "feat(gallery): add the photo viewer with its rail and filmstrip"
```

### Task 12: Assemble `ClientGallery`, switch `GalleryPage`, delete the old gallery

**Files:**
- Create: `frontend/src/features/client-gallery/ClientGallery.tsx`, `features/client-gallery/index.ts`
- Modify: `frontend/src/pages/GalleryPage.tsx` (import and both render sites near lines 426 and 445; theme application 137 to 181)
- Delete: everything under "What is deleted, Frontend" in the spec that lives in `components/gallery/` and `pages/gallery/PreviewPage.tsx`, plus `hooks/useGalleryCustomCss.ts`
- Modify: `frontend/src/App.tsx` (remove the `/gallery/preview` route), `frontend/src/components/gallery/index.ts` (barrel)
- Modify: the source-scanning tests `bulkDownloadChargesQuota.test.ts`, `protectionLevelNoImplications.test.ts`, `canvasLightboxOnly.test.ts`, `noGuestUploads.test.ts`, `__tests__/tailwindTypography.test.ts`, `pages/__tests__/GalleryPage.publicAutoLoginRace.test.tsx`
- Test: `__tests__/ClientGallery.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 4 to 11.
- Produces: `export { ClientGallery } from './ClientGallery'` with props `{ slug: string; event: GalleryEventSeed; requiresPassword?: boolean }`.

- [ ] **Step 1: Failing smoke test**

Mock `useGalleryController` to return `fakeController()` with 30 photos and render `ClientGallery`. Assert: the `h1` with the event name, the tabs, `grid-tile` elements, the grid swaps to `list-row` elements after `setView('list')` is reflected (drive it by re-rendering with `url.view: 'list'`), `PhotoViewer` mounts when `url.photo` is set, and the root element has class `client-gallery`.

- [ ] **Step 2: Implement `ClientGallery`**

Structure, top to bottom, inside `<div className="client-gallery">` wrapped by `GuestIdentityProvider slug identityMode={c.identityMode}`, `DownloadedPhotosProvider value={c.deliveredPhotoIds}`, `DownloadGateProvider value={c.downloadGate}`:

1. `GuestNamePromptModal requireEmail={!!c.feedbackSettings?.require_name_email}`, `GuestRecoveryModal`, `useFeedbackToggle(...).modals`.
2. `ExpiryToast slug expiresAt={c.expiry.expiresAt}`.
3. `CoverHero` with `photo={c.heroPhoto}`, `title={c.event.event_name}`, `subtitle={c.brandName}`, `logoUrl={c.heroLogoUrl}`, `onViewAlbum` scrolling `gridAnchorRef` into view (`behavior: 'smooth'`), `languagePicker` = the app's existing language switcher limited to en, de, vi (find it with `rg -l "changeLanguage" frontend/src/components`; reuse, do not build a new one).
4. A sentinel div and `GalleryToolbar c onShare` where `onShare` uses `navigator.share({ url })` when present, else `navigator.clipboard.writeText(url)` plus a `toast.success(t('clientGallery.linkCopied'))`. The URL shared is `window.location.origin + window.location.pathname` (no photo or tab params).
5. Client banner when `c.client.isClient`: one line, `var(--cg-muted)` text, shield icon, `t('clientAccess.banner')` and `t('clientAccess.visibleCount', { visible, total })`.
6. Folder tiles when at root and `c.folders.tiles.length > 0`: reuse `GalleryFolderTiles` from `components/gallery` with the props `GalleryView` passes today (copy that JSX).
7. Grid or list: `c.url.view === 'list' ? <PhotoList .../> : <MasonryGrid .../>`, both fed `c.visiblePhotos` (skip when `c.folders.rootIsFoldersOnly`), `onOpen={(id) => c.openPhoto(id)}`, `onToggle={toggle}`, `allowLikes={!!fs?.feedback_enabled && !!fs?.allow_likes}`, `allowPicks={!!fs?.feedback_enabled && !!fs?.allow_favorites}`, `canvas={c.protection.canvas}`, selection from `c.selection`. An empty tab shows a centred muted line: `t('clientGallery.emptyLiked', 'No liked photos yet')` or `emptyPicked` (`No picked photos yet` / `Noch keine Fotos ausgewählt` / `Chưa chọn ảnh nào`; liked: `Noch keine Fotos mit Gefällt mir` / `Chưa thích ảnh nào`).
8. Info and promo markdown below the grid, 60px padding, muted 14px text, rendered through the same markdown component `GalleryLayout` uses today.
9. A back-to-top button fixed bottom right (48px dark rounded square, `ArrowUpIcon`), visible once `scrollY > window.innerHeight`.
10. `PhotoViewer photos={c.visiblePhotos} openId={c.url.photo} onClose={() => c.openPhoto(null)} onNavigate={(id) => c.openPhoto(id)} ...` (navigate uses `replace` so Back leaves the viewer in one step; give `openPhoto` a second `mode` argument defaulting to `'push'`).
11. `DownloadResolutionModal`, `DownloadQuotaDialog`, `PeopleSheet` exactly as `GalleryView` renders them today (lines 1712 to 1750), fed from `c`.

Loading and error states move from `GalleryView` lines 1039 to 1073 unchanged (skeleton, session notice, 401 logout, password change notice, retry card).

- [ ] **Step 3: Switch `GalleryPage`**

Replace the `GalleryView` import and both render sites with `ClientGallery`. Delete the theme application block (137 to 181), its `useTheme` and `GALLERY_THEME_PRESETS` imports, and `color_theme` from the admin preview seed. Update `GalleryPage.publicAutoLoginRace.test.tsx`: drop its `useTheme` mock and mock `../../features/client-gallery` instead of `GalleryView`.

- [ ] **Step 4: Delete the old gallery**

```bash
# Xoá toàn bộ code gallery cũ: 7 kiểu bố cục, GalleryView, lightbox cũ, header/footer cũ, trang preview theme
git rm -r frontend/src/components/gallery/layouts
git rm frontend/src/components/gallery/GalleryView.tsx frontend/src/components/gallery/GalleryLayout.tsx frontend/src/components/gallery/PhotoGridWithLayouts.tsx frontend/src/components/gallery/PhotoGrid.tsx frontend/src/components/gallery/PhotoLightbox.tsx frontend/src/components/gallery/PhotoCard.tsx frontend/src/components/gallery/HeroHeader.tsx frontend/src/components/gallery/HeroDivider.tsx frontend/src/components/gallery/GallerySidebar.tsx frontend/src/components/gallery/PhotoFilterBar.tsx frontend/src/components/gallery/GalleryFilter.tsx frontend/src/components/gallery/ColorLabelFilterChips.tsx frontend/src/components/gallery/ExpirationBanner.tsx frontend/src/components/gallery/CountdownTimer.tsx frontend/src/pages/gallery/PreviewPage.tsx frontend/src/hooks/useGalleryCustomCss.ts
```

Before running it, check each file with `rg -l "<ComponentName>" frontend/src` for importers outside the deleted set. `FilterType`/`FeedbackFilterType` from `GalleryFilter` and `CreditFilterChips` may still be imported by `useGalleryFiltering` or `PeopleStrip`: move a type into `useGalleryFiltering.ts` rather than keep a dead component. Then delete every test under `components/gallery/__tests__` and `components/gallery/layouts/__tests__` that imports a deleted file (`rg -l` for each deleted name inside `__tests__`), with the same kind of Vietnamese summary comment on the `git rm`.

Update the barrel `components/gallery/index.ts`, the route in `App.tsx`, and the four source-scanning guards: point `bulkDownloadChargesQuota.test.ts` at `features/client-gallery/state/useGalleryController.ts` and `features/client-gallery/viewer/ViewerRail.tsx`; point `canvasLightboxOnly.test.ts` at `features/client-gallery/viewer/PhotoViewer.tsx`; in `protectionLevelNoImplications.test.ts` and `noGuestUploads.test.ts` replace the deleted paths with the new folder; drop the `GalleryLayout.tsx` path from `tailwindTypography.test.ts`.

Prove nothing still names the deleted code (expect zero hits):

```bash
rg -n "GalleryView|PhotoGridWithLayouts|PhotoLightbox|GalleryLayout\b|HeroHeader|HeroDivider|GallerySidebar|PhotoFilterBar|PremiumLightboxImage|useGalleryCustomCss|PreviewPage|gallery-premium|gallery-story" frontend/src
```

- [ ] **Step 5: Gates**

Run: `cd frontend && npx tsc --noEmit -p . && npm run lint && npx vitest run`
Expected: type check clean, lint clean, all tests PASS. Theme-related admin tests that still fail are Task 14's; record their names and leave them.

- [ ] **Step 6: Commit**

```bash
git add -A frontend
git commit -m "feat(gallery): serve the new client gallery and remove the themable one"
```

---

## Phase C: Theme removal outside the gallery

### Task 13: `ThemeContext` keeps brand tokens only

**Files:**
- Modify: `frontend/src/types/theme.types.ts`, `frontend/src/contexts/ThemeContext.tsx`, `frontend/src/contexts/index.ts`, `frontend/src/components/GlobalThemeProvider.tsx`, `frontend/public/bootstrap.js`, `frontend/src/utils/themeMigration.ts` and its test
- Test: `frontend/src/contexts/__tests__/ThemeContext.brandOnly.test.tsx`

**Interfaces:**
- Produces: `interface BrandTheme { primaryColor?: string; accentColor?: string; accentDarkColor?: string; backgroundColor?: string; surfaceColor?: string; elevatedColor?: string; surfaceBorderColor?: string; textColor?: string; mutedTextColor?: string; colorMode?: ...; fontFamily?: string; headingFontFamily?: string; fontSize?: ...; borderRadius?: ...; buttonStyle?: ...; shadowStyle?: ...; logoUrl?: string }` (the 17 keys of BRAND_KEYS in migration 263 minus forceColorMode, which is a separate setting). `useTheme()` returns `{ theme: BrandTheme; setTheme: (t: BrandTheme) => void }`. `ThemeConfig` becomes a deprecated alias of `BrandTheme` only if removing the name breaks more than the files listed in Task 14; otherwise remove it. Copy the literal unions above from the current `ThemeConfig` (read it first; keep whatever values it allows today).

- [ ] **Step 1: Failing test**

```tsx
it('applies brand tokens and nothing gallery specific', () => {
  const Probe = () => { const { setTheme } = useTheme(); React.useEffect(() => { setTheme({ primaryColor: '#123456', fontFamily: 'Lora' } as never); }, [setTheme]); return null; };
  render(<ThemeProvider><Probe /></ThemeProvider>);
  const style = document.documentElement.style;
  expect(style.getPropertyValue('--color-primary')).toBe('#123456');
  expect(style.getPropertyValue('--font-family')).toContain('Lora');
  expect(document.getElementById('custom-theme-styles')).toBeNull();
  expect(style.getPropertyValue('--background-pattern')).toBe('');
});

it('no longer writes the per-gallery background key', () => {
  render(<ThemeProvider><div /></ThemeProvider>);
  expect(Object.keys(localStorage).some((k) => k.startsWith('gallery-theme-bg-'))).toBe(false);
});
```

- [ ] **Step 2: Implement**

In `theme.types.ts` delete `GalleryLayoutType`, `HeaderStyleType`, `HeroDividerStyle`, `GalleryLayoutSettings`, `GALLERY_THEME_PRESETS` and the gallery fields; keep the brand presets only if the Branding page still offers colour presets (read `BrandingPage.tsx` first; if presets were only gallery presets, delete them). In `ThemeContext.tsx` delete the `customCss` style tag, `--background-pattern(-size)`, the `gallery-theme` and `gallery-theme-bg-<slug>` localStorage writes and reads, and the URL check that special-cased `/gallery/`. In `bootstrap.js` delete the `gallery-theme-bg-` read near line 23. `GlobalThemeProvider` drops its `/gallery/` skip: the gallery now scopes its own tokens, so brand tokens may sit on `:root` everywhere. `themeMigration.ts`: keep `applyForceColorMode`, delete gallery migrations, update its test to match.

Run: `cd frontend && npx vitest run src/contexts src/utils`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A frontend/src/types frontend/src/contexts frontend/src/components/GlobalThemeProvider.tsx frontend/public/bootstrap.js frontend/src/utils
git commit -m "refactor(theme): keep brand tokens only and drop gallery theme state"
```

### Task 14: Admin screens lose gallery theming

**Files:**
- Delete: `components/admin/ThemeCustomizerEnhanced.tsx`, `ThemeEditorModal.tsx`, `ThemeDisplay.tsx`, `GalleryPreview.tsx`, the gallery-only cards in `components/admin/theme-customizer/` (ThemePresetsCard, GalleryLayoutCard, HeaderStyleCard, ControlsStyleCard, CustomCssCard, CssTemplateCard), `CssTemplateEditor` and `features/settings/tabs/StylingTab.tsx`, `pages/admin/event-details/EventThemeSection.tsx`, `pages/admin/event-details/settings/ThemePresetPicker.tsx`, `pages/admin/event-details/settings/storedThemeKind.ts` and its test
- Modify: `pages/admin/BrandingPage.tsx`, `pages/admin/EventTypesPage.tsx`, `pages/admin/EventDetailsPage.tsx`, `pages/admin/create-event/createForm.ts`, `create-event/EventTypeTiles.tsx`, `CreateEventForm.tsx`, `event-details/draft/serverValues.ts`, `draft/saveDraft.ts`, `event-details/types.ts`, `settings/DetailsSection.tsx`, `settings/AppearanceSection.tsx`, `settings/sectionFields.ts`, `settings/EventSettingsContext.tsx`, `components/admin/index.ts`, `pages/admin/SettingsPage.tsx` (styling tab), `pages/admin/EmailConfigPage.tsx` (only if its "Sync from Branding" read a gallery key), `services/settings.service.ts`, `services/cssTemplates*` if present
- Tests: every admin test listed in the blast-radius report under D (create-event, event settings, branding, settingsTabDuplicateHeading, NextStepsChecklist)

**Interfaces:**
- Produces: Branding page sections for brand colours (primary, accent, background, text), typography (heading and body font, base size), shape (radius, shadow), force colour mode, logo. One Save that calls `settingsService.updateTheme(BrandTheme)`. Event settings Appearance keeps the hero photo selector, focal point, OG share, hero logo and banners. Create event sends no theme fields.

- [ ] **Step 1: Rehome what Branding still needs**

Read `ThemeCustomizerEnhanced.tsx` and `theme-customizer/ColorCustomizationCard.tsx`, `TypographyStyleCard.tsx`. Keep `ColorCustomizationCard` (with the force colour mode control at lines 103 to 117) and `TypographyStyleCard`; render them directly from `BrandingPage.tsx` in place of `ThemeCustomizerEnhanced`, passing `BrandTheme` state. Keep the PDF typography card that was injected through `slotBeforeCustomCss` (render it directly after typography). Remove the live gallery preview and the `/gallery/preview` opener. Logo stays stored in both `theme_config.logoUrl` and `branding_logo_url` as today.

- [ ] **Step 2: Remove the event and event-type pickers**

Delete the theme picker from Appearance and the advanced theme section; delete `header_style`, `hero_divider_style`, `color_theme`, `css_template_id` from the draft model (`types.ts`, `serverValues.ts`, `saveDraft.ts`, `sectionFields.ts`, `EventSettingsContext.tsx`). `DetailsSection` stops applying an event type's preset. `createForm.ts` drops `createThemeFields` and the three fields; `EventTypeTiles` drops `themePreset`. The Event Types page drops its Default Theme select and stops sending `theme_preset`/`theme_config`. `SettingsPage` drops the Styling tab.

- [ ] **Step 3: Fix the admin tests**

Run: `cd frontend && npx vitest run src/pages/admin src/components/admin`
For each failure: delete assertions about themes, presets, header style, CSS templates or the gallery preview; delete a test file only when everything it tests is gone (`ThemeCustomizerEnhanced.test.tsx`, `brandingCustomCss.test.tsx`, `storedThemeKind.test.ts`). `brandingThemeTextLeak.test.tsx` stays: it guards the admin against `--color-text`, which still exists.

- [ ] **Step 4: Prove the names are gone (expect zero hits outside i18n files, handled in Task 15)**

```bash
rg -n "color_theme|css_template|header_style|hero_divider_style|theme_preset|galleryLayout|gallerySettings|controlsStyle|headerStyle|heroDividerStyle|customCss|GALLERY_THEME_PRESETS|ThemeCustomizerEnhanced|CssTemplate" frontend/src --glob '!**/locales/**'
```

- [ ] **Step 5: Gates and commit**

Run: `cd frontend && npx tsc --noEmit -p . && npm run lint && npx vitest run`
Expected: all green.

```bash
git add -A frontend
git commit -m "refactor(admin): remove gallery theme pickers and keep brand styling on Branding"
```

### Task 15: Locale cleanup across nine languages

**Files:**
- Modify: `frontend/src/i18n/locales/{de,en,es,fr,nl,pt,ru,sl,vi}.json`
- Create: `frontend/src/i18n/__tests__/clientGalleryParity.test.ts`

- [ ] **Step 1: Failing parity test**

```ts
import { it, expect } from 'vitest';
import en from '../locales/en.json';
import de from '../locales/de.json';
import vi from '../locales/vi.json';

const leaves = (obj: Record<string, unknown>, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]));

it('has every clientGallery key in en, de and vi', () => {
  const want = leaves((en as Record<string, Record<string, unknown>>).clientGallery).sort();
  expect(leaves((de as Record<string, Record<string, unknown>>).clientGallery).sort()).toEqual(want);
  expect(leaves((vi as Record<string, Record<string, unknown>>).clientGallery).sort()).toEqual(want);
});

it('no longer carries gallery theme keys', () => {
  for (const locale of [en, de, vi]) {
    const all = leaves(locale as Record<string, unknown>);
    expect(all.filter((k) => /^cssTemplates\.|^branding\.(galleryLayout|masonry|headerStyle|heroDivider|controlsStyle|cssTemplate|storyGridMode|layoutDescriptions|customCSS)/.test(k))).toEqual([]);
  }
});
```

- [ ] **Step 2: Find dead keys and remove them**

List the theme-only keys from the blast-radius report (branding lines about 3427 to 3548, 3582 to 3663, 3838 to 3843; top-level `cssTemplates`; `events.galleryTheme`, `events.customizingThemeFor`, `events.noThemeSet`). Before deleting a key, confirm no code still uses it: for each candidate run `rg -n "'<full.key>'|\"<full.key>\"" frontend/src --glob '!**/locales/**'`, and keep any key that hits (colour help texts and forceColorMode keys stay). Remove the confirmed set from all nine files with `jq` through the Bash tool:

```bash
cd frontend/src/i18n/locales
for f in de en es fr nl pt ru sl vi; do
  jq --indent 2 'del(.cssTemplates) | del(.events.galleryTheme, .events.customizingThemeFor, .events.noThemeSet) | del(.branding.galleryLayout, .branding.layoutDescriptions)' "$f.json" > "$f.json.tmp" && mv "$f.json.tmp" "$f.json"
done
```

Extend the last `del(...)` with every confirmed `.branding.<key>` path before running; the two shown are examples of the shape, not the full list. Check `git diff --stat` shows only deletions in these nine files, and that `jq` did not reorder or re-escape other keys (`git diff` shows only removed lines).

- [ ] **Step 3: Run, commit**

Run: `cd frontend && npx vitest run src/i18n && npx vitest run`
Expected: PASS.

```bash
git add frontend/src/i18n
git commit -m "chore(i18n): drop gallery theme strings from all locales"
```

---

## Phase D: End to end

### Task 16: Playwright specs, performance budget, obsolete specs

**Files:**
- Create: `tests/e2e/client-gallery.spec.ts`, `tests/e2e/client-gallery-perf.spec.ts`
- Modify: `tests/e2e/_helpers/gallery.ts` (seed helper for a large gallery, if one does not exist)
- Delete: `tests/e2e/gallery-premium-select-all.spec.ts`, `tests/e2e/header-hero-fixes.spec.ts`; modify `tests/e2e/dark-mode.spec.ts` (drop the customizer block at 199 to 208)

- [ ] **Step 1: Write the behaviour spec**

Read `tests/e2e/_helpers/gallery.ts` and one existing spec (`gallery-grid-actions.spec.ts`) for how a gallery is created and opened, then cover, at 1440x900 and 390x844 (`test.describe` per viewport):

1. Cover shows the event name as `h1`; clicking View Album scrolls the toolbar into view.
2. Grid shows tiles; at 1440 there are exactly 3 distinct tile `x` positions, at 390 exactly 2.
3. Hover a tile at 1440 and click its heart: the Like tab count goes from 0 to 1; reload: still 1.
4. Pick with `max_favorites_per_guest = 1`: the first pick succeeds, the second opens the limit modal and the Pick tab still says `Pick 1 / 1`.
5. Sort File Name, toggle direction: the first tile's accessible name changes accordingly.
6. List view: rows show `×` dimensions and an `MB` size; switching back restores the grid; `?view=list` survives a reload.
7. Open a photo: the URL gains `photo=`; ArrowRight changes it; the filmstrip marks the current item; Back closes the viewer.
8. Multi-select two photos and Download selected: two downloads (or one archive) arrive and the quota endpoint is called afterwards.

- [ ] **Step 2: Write the performance spec**

Seed 2000 photos (use the helper's bulk path; generate small JPEGs with `sharp` in the helper if it has none). Then:

```ts
test('scrolling a 2000 photo album stays within budget', async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(galleryUrl);
  await page.getByRole('button', { name: /view album/i }).click();
  await page.evaluate(() => {
    (window as unknown as { __longTasks: number[] }).__longTasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) (window as unknown as { __longTasks: number[] }).__longTasks.push(e.duration);
    }).observe({ type: 'longtask', buffered: false });
  });
  for (let i = 0; i < 40; i += 1) {
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(50);
  }
  const nodes = await page.evaluate(() => document.querySelectorAll('*').length);
  const longest = await page.evaluate(() => Math.max(0, ...(window as unknown as { __longTasks: number[] }).__longTasks));
  const cls = await page.evaluate(() => new Promise<number>((resolve) => {
    let total = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as PerformanceEntry[] & { value: number; hadRecentInput: boolean }[]) {
        if (!(e as unknown as { hadRecentInput: boolean }).hadRecentInput) total += (e as unknown as { value: number }).value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    setTimeout(() => resolve(total), 500);
  }));
  expect(nodes).toBeLessThan(3000);
  expect(longest).toBeLessThan(100);
  expect(cls).toBeLessThan(0.05);
});
```

- [ ] **Step 3: Remove obsolete specs and run the suite**

```bash
# Xoá hai spec e2e của bố cục premium và hero header cũ
git rm tests/e2e/gallery-premium-select-all.spec.ts tests/e2e/header-hero-fixes.spec.ts
```

Edit `dark-mode.spec.ts` to drop the customizer block. Then, from the repo root: `docker compose up -d --build` and `npm run test:e2e`.
Expected: all specs PASS. If the long-task budget fails, record the numbers and the trace before changing any code; the fix goes into the grid (overscan, memo) not into the budget.

- [ ] **Step 4: Commit**

```bash
git add -A tests/e2e
git commit -m "test(e2e): cover the client gallery and pin its scrolling budget"
```

### Task 17: Whole-branch verification and visual check

- [ ] **Step 1: Full gates**

```bash
cd frontend && npm run lint && npx tsc --noEmit -p . && npx vitest run && npm run build
cd ../backend && npm run lint && npx jest
```

Expected: every command exits 0 and reports no failures. Read the counts, not only the exit codes.

- [ ] **Step 2: Removed names stay removed**

```bash
rg -n "color_theme|css_template|header_style|hero_divider_style|theme_preset|galleryLayout|gallerySettings|controlsStyle|GALLERY_THEME_PRESETS|useGalleryCustomCss|PhotoGridWithLayouts|GalleryView" frontend/src backend/src backend/server.js tests/e2e --glob '!**/migrations/**'
rg -n '\x{2014}|\x{2013}' $(git diff --name-only main...HEAD)
```

Expected: no output from either.

- [ ] **Step 3: Visual comparison**

With the stack up, open a seeded gallery with Playwright at 1440x900 and 390x844 and take the same four screenshots as the reference (`cover`, `grid`, `grid scrolled`, `viewer`, plus `list`). Compare against `.playwright-mcp/ref-*.png` in the main checkout. Differences in photos are expected; differences in spacing, columns, type, colours or control placement are defects to fix before calling the task done.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(gallery): align spacing and type with the reference"
```
