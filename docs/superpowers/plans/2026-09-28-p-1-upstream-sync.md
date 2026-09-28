# P-1 Upstream Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `upstream/main` (144 commits, about forty security fixes) into the redesign branch, keep every fork behaviour, drop upstream's per-event download limit, and bring `vi` back to full key parity.

**Architecture:** One merge commit that resolves the 40 conflicted files with the recipes below and leaves the branch green. Then a separate revert commit that removes upstream's download limit feature (#1568), so the sync and the fork decision stay separately reviewable and the removal can itself be reverted. Then the `vi` translations. Nothing is deployed in this phase: the whole project deploys once at the end.

**Tech Stack:** git 2.54 (`merge-tree`), Node/Express + knex (Postgres 15), React 18 + Vite + Vitest, Jest, i18next-cli, jq.

**Spec:** `docs/superpowers/specs/2026-09-28-event-form-redesign-design.md`, section 6 "P-1", section 3.1 (O1).

## Global Constraints

- Upstream remote: `upstream` = `https://github.com/PicPeak/picpeak.git`, fetch only, never push.
- Merge target: `upstream/main` at `55deab96`. Merge base: `2fe79e46`. Branch head before the merge: the current `worktree-event-form-redesign` tip.
- On a conflict keep the fork's behaviour; never drop an upstream security fix silently.
- Operator decisions for this phase (2026-09-28): U1 remove upstream's per-event download limit entirely; U2 translate every missing `vi` key now; U3 no separate deploy, the project deploys once at the end.
- Conventional Commits only: `feat`, `fix`, `perf`, `revert`, `docs`, `style`, `chore`, `refactor`, `test`, `build`, `ci`.
- No em-dash (U+2014) and no en-dash (U+2013) in anything written into the repo: code, comments, i18n values, commit messages. Upstream comments carried over in a resolution are rewritten with a colon or a full stop.
- `backend/jest.setup.js` keeps the fork's unconditional `process.env.DATABASE_CLIENT = 'sqlite3';`. Never replace it with upstream's conditional form.
- `en`, `de`, `vi` stay at full key parity. Never run the i18n extractor prune.
- The migration runner (`backend/migrations/run-migrations-safe.js`) tracks applied migrations by exact filename. Never rename a fork migration.
- Session is isolated in the worktree `D:\Coding\picpeak\.claude\worktrees\event-form-redesign`. Run git as plain single commands from that directory. Never use bare `git stash`.
- Scratch directory (Git Bash form): `S=/c/Users/hhoa0/AppData/Local/Temp/claude/D--Coding-picpeak--claude-worktrees-event-form-redesign/51158e67-9967-45a9-833b-4a5968d5d03e/scratchpad`.
- `jq`: if the WinGet shim says "Permission denied", call `/c/Users/hhoa0/AppData/Local/Microsoft/WinGet/Packages/jqlang.jq_Microsoft.Winget.Source_8wekyb3d8bbwe/jq.exe`. Use `jq -b` on Windows to avoid CRLF.

## Review Focus

1. **Single-photo download after the merge.** A guest clicking download on one photo must get the file (HTTP 200), charged once against the fork allowance. Keeping only the fork side of `downloads.js` hunk 2 leaves `grantThisPhoto` undefined and every single download answers 500. Pinned in Task 2 Step 7 and Task 6 Step 4.
2. **Tests never touch a real database.** Running `npx jest` with `DATABASE_CLIENT=pg` exported in the shell must still run against SQLite. Pinned in Task 2 Step 3 and Task 6 Step 3.
3. **Backups land where they always did on the NAS.** The compose file must keep `${BACKUPS:-./backups}:/backup`; the NAS `.env` sets `BACKUPS`. Pinned in Task 2 Step 11 and Task 6 Step 5.
4. **`npm run dev` survives a file change.** The nodemon/minimatch mix crashed the watcher before ("minimatch is not a function"). Pinned in Task 6 Step 2.
5. **The fork's Download packages settings tab stays reachable** at `/admin/settings?tab=downloadQuota` and in the settings navigation. Pinned in Task 4 Step 3 and Task 6 Step 4.

---

### Task 1: Baseline

**Files:**
- Create: `$S/p-1-baseline.txt` (scratch, not committed)

**Interfaces:**
- Produces: the pre-merge numbers every later gate is compared against.

- [ ] **Step 1: Install dependencies in the worktree**

The worktree has no `node_modules`.

```bash
cd /d/Coding/picpeak/.claude/worktrees/event-form-redesign/backend && npm ci
cd /d/Coding/picpeak/.claude/worktrees/event-form-redesign/frontend && npm ci
```
Expected: both exit 0.

- [ ] **Step 2: Record the backend baseline**

```bash
cd /d/Coding/picpeak/.claude/worktrees/event-form-redesign/backend
npm run lint > "$S/base-backend-lint.txt" 2>&1; echo "lint exit=$?" >> "$S/p-1-baseline.txt"
npx jest --silent > "$S/base-backend-jest.txt" 2>&1; echo "jest exit=$?" >> "$S/p-1-baseline.txt"
rg -n "^Tests:|^Test Suites:" "$S/base-backend-jest.txt" >> "$S/p-1-baseline.txt"
```
Expected: the summary lines are recorded. A red baseline is recorded, not fixed.

- [ ] **Step 3: Record the frontend baseline**

```bash
cd /d/Coding/picpeak/.claude/worktrees/event-form-redesign/frontend
npm run lint > "$S/base-frontend-lint.txt" 2>&1; echo "fe lint exit=$?" >> "$S/p-1-baseline.txt"
npx vitest run > "$S/base-frontend-vitest.txt" 2>&1; echo "vitest exit=$?" >> "$S/p-1-baseline.txt"
rg -n "Test Files|Tests " "$S/base-frontend-vitest.txt" | tail -2 >> "$S/p-1-baseline.txt"
rg -n "FAIL " "$S/base-frontend-vitest.txt" | sort -u > "$S/base-frontend-failing.txt"
npm run build:check > "$S/base-frontend-build.txt" 2>&1; echo "build:check exit=$?" >> "$S/p-1-baseline.txt"
npm run i18n:status > "$S/base-i18n.txt" 2>&1; echo "i18n:status exit=$?" >> "$S/p-1-baseline.txt"
```
Expected: `base-frontend-failing.txt` lists the six files known to fail on a clean checkout (`guestIdentityStorage.persistence`, `photoViewPrefs`, `updateDismissal`, `AdminPhotoGrid.viewToggle`, `AdminPhotoGrid.hiddenBadge`, `brandingCustomCss`). `i18n:status` exits non-zero on a clean checkout; record its two missing counts.

- [ ] **Step 4: Confirm the merge target has not moved**

```bash
cd /d/Coding/picpeak/.claude/worktrees/event-form-redesign
git fetch upstream
git rev-parse upstream/main
```
Expected: `55deab96b483785f9b1b5f16d6a6053407ac0c19`. If it moved, re-run `git merge-tree --write-tree --name-only HEAD upstream/main` and stop to re-check the conflict list against this plan before continuing.

No commit in this task.

---

### Task 2: Start the merge, resolve backend and config

The merge stays uncommitted from here until Task 6 Step 6. Tasks 2 to 6 run in one sitting.

**Files:**
- Modify: `backend/__tests__/routes/adminEvents.recoverablePassword.test.js`, `backend/jest.setup.js`, `backend/package.json`, `backend/package-lock.json`, `backend/src/routes/adminEvents/crud.js`, `backend/src/routes/adminRestore.js`, `backend/src/routes/gallery/downloads.js`, `backend/src/routes/gallery/slideshow.js`, `backend/src/services/restoreService.js`, `backend/src/utils/frontendUrl.js`, `docker-compose.production.yml`, `docs/usage-coverage.v5.json`

**Interfaces:**
- Consumes: upstream's `validateClientPassword` and `CLIENT_PASSWORD_MIN_LENGTH` in `crud.js`; upstream's `grantThisPhoto`, `checkDownloads`, `downloadLimitError`, `downloadLimitOf`, `currentDownloadLimit`, `grantDownloads`, `settleWhenDone`, `isPreviewOnly`, `clientOnlyError` in `downloads.js`; the fork's `passesQuotaGate`, `passesWholeGalleryGate`, `settleReservation` from `./downloadQuotaGate`.
- Produces: a backend with both download systems wired, so the merge commit is green before Task 7 removes upstream's.

- [ ] **Step 1: Start the merge**

```bash
cd /d/Coding/picpeak/.claude/worktrees/event-form-redesign
git merge --no-ff --no-commit upstream/main
git diff --name-only --diff-filter=U | sort > "$S/conflicts.txt"; wc -l < "$S/conflicts.txt"
```
Expected: merge stops with conflicts; the count is 40.

- [ ] **Step 2: Recoverable password test: take theirs**

Both sides only changed the PIN fixture for the new 6-character floor (upstream 82ae07af is the security fix).

```bash
git checkout --theirs -- backend/__tests__/routes/adminEvents.recoverablePassword.test.js
git add backend/__tests__/routes/adminEvents.recoverablePassword.test.js
```

- [ ] **Step 3: `jest.setup.js`: keep ours**

```bash
git checkout --ours -- backend/jest.setup.js
rg -n "^process\.env\.DATABASE_CLIENT = 'sqlite3';" backend/jest.setup.js
```
Expected: one hit, unconditional. Then confirm upstream's auto-merged additions elsewhere in the file are present (supertest IPv6 mock, `PDF_RENDER_ISOLATION`, the `afterAll` calling `serviceShutdown.stopServices()`):

```bash
git show upstream/main:backend/jest.setup.js | rg -n "PDF_RENDER_ISOLATION|stopServices|::1|ipv6" -i
rg -n "PDF_RENDER_ISOLATION|stopServices|::1|ipv6" -i backend/jest.setup.js
```
Expected: every line the first command prints also appears in the second. If `--ours` dropped one of them, add it back by hand from upstream's file, keeping the unconditional `DATABASE_CLIENT` line.

```bash
git add backend/jest.setup.js
```

- [ ] **Step 4: `package.json` and `package-lock.json`: take theirs**

The fork's `overrides.nodemon` pinned minimatch 3 for nodemon 3.1.11; upstream bumped nodemon to `^3.1.14`, which needs minimatch 10. Hand-merging mixes both.

```bash
git show upstream/main:backend/package.json > backend/package.json
git checkout --theirs -- backend/package-lock.json
rg -n '"nodemon"' backend/package.json
git add backend/package.json backend/package-lock.json
```
Expected: `nodemon` is `^3.1.14` and there is no `overrides.nodemon` block. Confirm the fork added no dependency of its own that upstream lacks:

```bash
git diff 2fe79e46 HEAD -- backend/package.json
```
Expected: only the `overrides.nodemon` block and the version line. If it shows any added dependency, add that dependency back to `backend/package.json` and run `npm install` in `backend/` to refresh the lock.

- [ ] **Step 5: `crud.js`: combine the client password validator**

In both conflict hunks (the create validators and the update validators) replace the whole conflict block with upstream's line:

```js
  body('client_password').optional().custom(validateClientPassword),
```

Then edit upstream's shared validator near the top of the file so the fork's "spaces cannot pad a short password" rule survives:

```js
const validateClientPassword = (value) => {
  if (typeof value !== 'string') throw new Error('Client password must be a string');
  // Counted trimmed, so spaces cannot pad a short password past the floor.
  if (value.length > 0 && value.trim().length < CLIENT_PASSWORD_MIN_LENGTH) {
    throw new Error(`Client password must be at least ${CLIENT_PASSWORD_MIN_LENGTH} characters`);
  }
  return true;
};
```

```bash
rg -n "^(<<<<<<<|=======|>>>>>>>)" backend/src/routes/adminEvents/crud.js; git add backend/src/routes/adminEvents/crud.js
```
Expected: no markers.

- [ ] **Step 6: Point the fork's validator test at the route rule**

`backend/src/__tests__/clientPasswordValidator.test.js` tests the fork's old inline chain, which no longer exists. Run it:

```bash
cd backend && npx jest src/__tests__/clientPasswordValidator.test.js; cd ..
```
If it still passes it tests dead code: replace its body with a test of the route validator through supertest, following upstream's `backend/__tests__/routes/adminEventsClientPasswordFloor.test.js`, adding one case that the upstream test lacks:

```js
it('refuses a password padded to six characters with spaces', async () => {
  const res = await request(app)
    .put(`/api/admin/events/${eventId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ client_password: '  ab  ' });
  expect(res.status).toBe(400);
  expect(JSON.stringify(res.body)).toMatch(/at least 6 characters/);
});
```
Copy `app`, `eventId` and `token` setup from `adminEventsClientPasswordFloor.test.js` in the same file. Run it; expected PASS.

```bash
git add backend/src/__tests__/clientPasswordValidator.test.js
```

- [ ] **Step 7: `gallery/downloads.js`: combine all five hunks**

Both download systems must run on every path. Hunk by hunk:

Hunk 1 (imports): replace with

```js
const {
  canSeeHiddenPhotos, isPhotoHiddenFromViewer, downloadablePhotosQuery,
} = require('../../utils/photoVisibility');
const {
  passesQuotaGate, passesWholeGalleryGate, settleReservation,
} = require('./downloadQuotaGate');
```

Hunk 2 (single photo). Replace the whole block with, in this order:
1. upstream's `limitCheck` lines (`checkDownloads` and the 403 `downloadLimitError` return), verbatim from the `theirs` side;
2. the fork's gate:
   ```js
      const gate = await passesQuotaGate(req, res, [Number(photoId)]);
      if (!gate.ok) return;
      settleReservation(res, req, gate.reserved, () => [Number(photoId)]);
   ```
   with the fork's comment above it;
3. upstream's `const grantThisPhoto = async () => { ... };` verbatim;
4. nothing else: the fork's inline `if (!req.isAdminPreview) { ...download_count...; ...access_logs... }` block is deleted, because `grantThisPhoto` now records the download.

Hunk 3 (`POST /download-jobs`):

```js
    if (await isPreviewOnly(req)) return res.status(403).json(clientOnlyError());
    if (downloadLimitOf(req.event) && !req.isAdminPreview) {
      const resolved = await downloadJobService
        .photoQuery(req.event.id, photoIds, req.accessLevel)
        .select('photos.id');
      const quota = await checkDownloads(req.event, resolved.map((r) => r.id));
      if (!quota.ok) return res.status(403).json(downloadLimitError(quota));
    }

    // (keep the fork's comment block here unchanged)
    const preflight = { reserve: false };
    if (photoIds) {
      if (!(await passesQuotaGate(req, res, photoIds, preflight)).ok) return;
    } else if (!(await passesWholeGalleryGate(req, res, preflight)).ok) {
      return;
    }
```
Check that exactly one closing brace follows, where the block ends.

Hunk 4 (`GET /download-jobs/:token/file`), in this order: upstream's `let deliveredIds = []; try { ... JSON.parse ... } catch {}` block; upstream's whole `if (!req.isAdminPreview && await currentDownloadLimit(req.event)) { ... }` block verbatim; then

```js
    const packagedIds = Array.isArray(deliveredIds) ? deliveredIds : [];
    // A HEAD probe checks the allowance without claiming it.
    const jobGate = await passesQuotaGate(req, res, packagedIds, { reserve: req.method !== 'HEAD' });
    if (!jobGate.ok) return;
    settleReservation(res, req, jobGate.reserved, () => packagedIds);
```

Hunk 5: take theirs: `const ids = Array.isArray(deliveredIds) ? deliveredIds : [];`

Rewrite any em-dash in carried-over upstream comments. Then:

```bash
rg -n "^(<<<<<<<|=======|>>>>>>>)|[\x{2014}\x{2013}]" backend/src/routes/gallery/downloads.js
rg -n "applyPhotoVisibilityFilter|grantThisPhoto" backend/src/routes/gallery/downloads.js
git add backend/src/routes/gallery/downloads.js
```
Expected: first command no output (other than em-dashes that were already in untouched upstream lines, which stay). Second: no `applyPhotoVisibilityFilter`; `grantThisPhoto` defined once and called in each delivery branch.

- [ ] **Step 8: Comment-only hunks: take theirs**

```bash
git checkout --theirs -- backend/src/routes/gallery/slideshow.js backend/src/services/restoreService.js backend/src/utils/frontendUrl.js
git diff 2fe79e46 HEAD -- backend/src/routes/gallery/slideshow.js backend/src/services/restoreService.js backend/src/utils/frontendUrl.js | rg "^[+-][^+-]" | rg -v "^\s*[+-]\s*(//|\*|/\*)"
```
Expected: the second command prints nothing (the fork changed only comments in these files). Then `adminRestore.js`: its two hunks are comments; the code line `.split(path.delimiter)` is identical on both sides.

```bash
git checkout --theirs -- backend/src/routes/adminRestore.js
rg -n "split\(path\.delimiter\)" backend/src/routes/adminRestore.js
git add backend/src/routes/gallery/slideshow.js backend/src/services/restoreService.js backend/src/utils/frontendUrl.js backend/src/routes/adminRestore.js
```
Expected: `split(path.delimiter)` present.

- [ ] **Step 9: Register the fork's order expiry job with upstream's shutdown list**

Upstream's new `backend/src/services/serviceShutdown.js` stops services from a fixed `resources` list. Add the fork's hourly job next to the other scheduled jobs in that list:

```js
  ['./downloadOrderExpiryChecker', 'stopDownloadOrderExpiryChecker'],
```
Confirm the export name exists:

```bash
rg -n "stopDownloadOrderExpiryChecker" backend/src/services/downloadOrderExpiryChecker.js backend/src/services/serviceShutdown.js
git add backend/src/services/serviceShutdown.js
```
Expected: defined in the first file, listed in the second. If the checker exports a different stop function name, use that name.

- [ ] **Step 10: Postgres quota route fixture gets `download_limit`**

`backend/__tests__/integration/downloadQuotaRoutePg.test.js` hand-builds an `events` table; after the merge the route reads `events.download_limit`. In the fixture's `createTable('events', ...)` add:

```js
    t.integer('download_limit').nullable();
```
Task 7 removes this line again together with the feature.

```bash
git add backend/__tests__/integration/downloadQuotaRoutePg.test.js
```

- [ ] **Step 11: `docker-compose.production.yml`: keep the fork's variable**

Replace the conflict block with:

```yaml
      # The application's own backup service writes to backup_destination_path,
      # which defaults to /backup/picpeak (see BACKUP_DIR above: the entrypoint
      # creates the subfolders and hands the mount to UID 1001). Without this
      # mount that path lives in the container's writable layer and every
      # backup is destroyed by the next deploy. Keep it outside APP_STORAGE, or
      # the backup would include itself. BACKUPS, not upstream's APP_BACKUP:
      # existing .env files already set it.
      - ${BACKUPS:-./backups}:/backup
```
Then rename upstream's variable where it now writes it:

```bash
rg -n "APP_BACKUP" .env.example scripts/picpeak-setup.sh docker-compose*.yml
```
Replace each `APP_BACKUP=./backup` with `BACKUPS=./backups` and each `APP_BACKUP` reference with `BACKUPS`, keeping the surrounding text. Then:

```bash
rg -n "APP_BACKUP" .env.example scripts/picpeak-setup.sh docker-compose*.yml
docker compose -f docker-compose.production.yml config > /dev/null && echo compose-ok
git add docker-compose.production.yml .env.example scripts/picpeak-setup.sh
```
Expected: no `APP_BACKUP` left; `compose-ok`.

- [ ] **Step 12: `docs/usage-coverage.v5.json`: regenerate, do not resolve by hunk**

Resolving hunk by hunk duplicates the `gallery/*` keys. Build it from upstream's file plus the fork-only keys:

```bash
node -e '
const fs=require("fs"),cp=require("child_process");
const o=JSON.parse(cp.execSync("git show :2:docs/usage-coverage.v5.json"));
const t=JSON.parse(cp.execSync("git show :3:docs/usage-coverage.v5.json"));
t.settings_tabs.downloadQuota=o.settings_tabs.downloadQuota;
for (const k of ["adminDownloadQuota.js","gallery/downloadQuotaGate.js","gallery/quota.js"]) t.route_families[k]=o.route_families[k];
fs.writeFileSync("docs/usage-coverage.v5.json", JSON.stringify(t,null,2)+"\n");'
git add docs/usage-coverage.v5.json
```
The inventory test runs in Task 6.

No commit in this task.

---

### Task 3: Resolve the gallery frontend

Two download systems meet here: the fork's paid allowance (`hooks/useDownloadQuota.ts`, `DownloadGateContext`, refusals 402/403/503) and upstream's limit (`contexts/DownloadQuotaContext.tsx`, `utils/downloadLimit.ts`, refusal 403 `DOWNLOAD_LIMIT_REACHED`). Combine them so the merge commit compiles and passes; Task 7 removes upstream's. Order in every handler: fork gate first, then upstream's limit check, then the fork's failure handling.

**Files:**
- Modify: `frontend/src/components/gallery/DownloadResolutionModal.tsx`, `GalleryView.tsx`, `PhotoCard.tsx`, `PhotoGridWithLayouts.tsx`, `PhotoLightbox.tsx`, `layouts/CarouselGalleryLayout.tsx`, `layouts/GalleryPremiumLayout.tsx`, `layouts/GalleryStoryLayout.tsx`, `frontend/src/hooks/useGallery.ts`, `frontend/src/pages/GalleryPage.tsx`, `frontend/src/pages/__tests__/GalleryPage.publicAutoLoginRace.test.tsx`, `frontend/src/services/__tests__/gallery.fetchPhotoBlob.test.ts`, `frontend/src/services/gallery.service.ts`

**Interfaces:**
- Consumes: fork `useRefreshDownloadQuota()`, `useDownloadQuota(slug)` (hook, returns `{ quota, ... }`), `canDownloadPhotoNow`, `downloadGate.reportDownloadFailure`, `handleDownloadFailure`, `isHandledElsewhere`; upstream `useDownloadQuota()` (context, returns `DownloadQuotaValue` with `allows`, `canDownload`, `limited`, `previewOnly`, `remaining`), `isDownloadLimitError`, `showDownloadLimitReached`, `withDownloadLimit`, `isGalleryLimited`, `readDownloadLimitError`, `notifyDownloadQuotaChanged`, `buildDownloadQuotaValue`, `quotaFromEvent`, `DownloadQuotaProvider`.
- Produces: in `GalleryView.tsx`, upstream's local value is renamed `downloadLimit` (the fork's `downloadQuota` name stays).

- [ ] **Step 1: `DownloadResolutionModal.tsx` (3 hunks)**

Hunk 1:
```ts
  const refreshDownloadQuota = useRefreshDownloadQuota();
  const downloadQuota = useDownloadQuota();
  const overQuota = !!quotaPhotos && !downloadQuota.allows(quotaPhotos);
```
Hunk 2 (standard-size download-all shortcut):
```ts
      try {
        await galleryService.downloadAllPhotos(slug, true);
      } catch (err) {
        // The limit refusal already told the guest why (issue 1560).
        if (!isDownloadLimitError(err)) throw err;
      }
      // The download-all route claims the whole gallery's slots before it
      // streams, so this shortcut moved the counters too and has to re-read
      // them like every other path.
      refreshDownloadQuota(slug);
```
Hunk 3 (`download`):
```ts
  const download = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    // Download limit (issue 1560): the file is a browser navigation, which
    // cannot show why it was refused. Ask first: another viewer may have
    // used up the quota while this archive was being prepared.
    if (isGalleryLimited(slug)) {
      try {
        const state = await galleryService.getDownloadJob(slug, token);
        if (state.download_limit_reached) {
          showDownloadLimitReached(state.download_limit_reached);
          notifyDownloadQuotaChanged(slug);
          setError(t('gallery.downloadLimit.reached', 'Download limit reached. Please contact your photographer for more downloads.'));
          setPhase('error');
          return;
        }
      } catch {
        // The file route still enforces the limit; let it decide.
      }
    }
    // Slots are claimed before the archive streams, so re-read the allowance.
    refreshDownloadQuota(slug);
    galleryService.downloadJobFile(slug, token, filename);
    onClose();
  }, [slug, filename, onClose, t, refreshDownloadQuota]);
```

- [ ] **Step 2: `GalleryView.tsx` (7 hunks, plus a rename)**

Rename upstream's local `downloadQuota` (the `useMemo(() => buildDownloadQuotaValue(...))`) to `downloadLimit` everywhere upstream uses it, including auto-merged lines outside the hunks. The fork writes `downloadQuota?.` (optional chaining) and upstream writes `downloadQuota.` (no `?`); rename only the latter:

```bash
rg -n "downloadQuota\.(allows|limited|previewOnly|remaining|canDownload)" frontend/src/components/gallery/GalleryView.tsx
```
Rename each hit to `downloadLimit.` and the declaration to `const downloadLimit = useMemo(...)`.

H1 (imports): keep both blocks in full.
H2: keep the fork's `notDeliveredCount` and `offerFullPackage` block, then upstream's block with the rename:
```ts
  const downloadLimit = useMemo(() => buildDownloadQuotaValue(quotaFromEvent(data?.event)), [data?.event]);
  // photosById, allDownloadablePhotos, photosForIds: upstream's lines, unchanged
  const refuseOverQuota = (photos: QuotaPhoto[]): boolean => {
    if (downloadLimit.allows(photos)) return false;
    showDownloadLimitReached({ remaining: downloadLimit.remaining ?? 0 });
    return true;
  };
```
H3 (`handleDownloadSelected`); the added `refreshDownloadQuota(slug)` is required, because `bulkDownloadChargesQuota.test.ts` counts one refresh per send:
```ts
    try {
      // Download limit (issue 1560): one zip, which the server grants whole or
      // not at all. A preview-only guest gets one zip too.
      if (downloadLimit.limited || downloadLimit.previewOnly) {
        await galleryService.downloadSelectedPhotos(slug, selectedPhotosList.map((p) => p.id));
      } else {
        for (const photo of selectedPhotosList) {
          await galleryService.downloadPhoto(slug, photo.id, photo.filename);
        }
      }
      refreshDownloadQuota(slug);
    } catch (error) {
      // Either refusal leaves the selection standing so it can be trimmed.
      if (isDownloadLimitError(error)) return;
      if (await handleDownloadFailure(error)) return;
      throw error;
    }
```
H4 (people download) and H5 (folder download), with `peopleDownloadableIds` and `folderDownloadIds` respectively:
```ts
    try {
      await galleryService.downloadSelectedPhotos(slug, peopleDownloadableIds);
      refreshDownloadQuota(slug);
    } catch (error) {
      // The limit refusal already told the guest why (issue 1560).
      if (isDownloadLimitError(error)) return;
      if (await handleDownloadFailure(error)) return;
      throw error;
    }
```
Drop the stale fork comment about the ledger write landing after the response being "patched rather than refetched".
H6 and H7: nest the providers, dropping the fork's fragment:
```tsx
    <DownloadedPhotosProvider value={deliveredPhotoIds}>
    <DownloadGateProvider value={downloadGate}>
    <DownloadQuotaProvider slug={slug} event={data?.event}>
    {/* existing children */}
    </DownloadQuotaProvider>
    </DownloadGateProvider>
    </DownloadedPhotosProvider>
```

- [ ] **Step 3: `PhotoCard.tsx` (2 hunks)**

H1:
```ts
  // Already spent a slot, so re-downloading it costs nothing (#download-quota).
  const delivered = useIsPhotoDelivered(photo.id);
  // Download limit (issue 1560): grey the button out instead of letting the
  // server refuse the request.
  const withinDownloadLimit = useDownloadQuota().canDownload(photo);
```
H2:
```tsx
                    aria-label={t('gallery.downloadPhoto', 'Download photo')}
                    aria-disabled={!withinDownloadLimit || undefined}
                    title={withinDownloadLimit ? undefined : downloadLimitReachedMessage()}
                    style={withinDownloadLimit ? undefined : { opacity: 0.5, cursor: 'not-allowed' }}
```

- [ ] **Step 4: `PhotoGridWithLayouts.tsx` (3 hunks)**

H1: keep both import blocks.
H2 (`handleDownload`):
```ts
    e.stopPropagation();
    if (!canDownloadPhotoNow(photo.id, downloadGate.quotaEnabled, downloadGate.isClient,
      downloadGate.remaining, downloadGate.downloadedIds)) {
      if (downloadGate.isClient) downloadGate.offerForBlockedDownload();
      else downloadGate.notifyGuestBlocked();
      return;
    }
    // Download limit (issue 1560): say why instead of sending a request the
    // server is bound to refuse.
    if (!downloadQuota.canDownload(photo)) {
      showDownloadLimitReached({ remaining: 0 });
      return;
    }
```
H3 (`handleDownloadSelected`); keep the fork's "clear the selection only on success" structure, not upstream's `finally`:
```ts
    try {
      await galleryService.downloadSelectedPhotos(slug, ids);
      refreshDownloadQuota(slug);
      analyticsService.trackGalleryEvent('bulk_download', { gallery: slug, photo_count: ids.length });
      // Only a download that happened ends the selection.
      setSelectedPhotos(new Set());
      if (parentToggleSelectionMode) parentToggleSelectionMode(); else setLocalSelectionMode(false);
    } catch (error) {
      // The limit refusal already told the guest why (issue 1560); keep the selection.
      if (isDownloadLimitError(error)) return;
      if (!(await downloadGate.reportDownloadFailure(error))) {
        toastify.error(t('gallery.downloadError'));
      }
    }
```
Reword the stale fork comment saying "a refetch here would read the pre-download numbers" to: "The server claims the slots before it streams, so a refetch reads the new numbers."

- [ ] **Step 5: `PhotoLightbox.tsx` (1 hunk)**

```ts
    if (!photoAllowsDownload) return;
    if (!canDownloadPhotoNow(currentPhoto.id, downloadGate.quotaEnabled, downloadGate.isClient,
      downloadGate.remaining, downloadGate.downloadedIds)) {
      if (downloadGate.isClient) downloadGate.offerForBlockedDownload();
      else downloadGate.notifyGuestBlocked();
      return;
    }
    // Download limit (issue 1560).
    if (!withinDownloadLimit) {
      showDownloadLimitReached({ remaining: 0 });
      return;
    }
    downloadPhotoMutation.mutate(
      { slug, photoId: currentPhoto.id, filename: currentPhoto.filename, quotaAware: downloadGate.quotaEnabled },
      { onError: (error) => { void downloadGate.reportDownloadFailure(error); } },
    );
```
Keep upstream's `downloadRef.current = handleDownload;` right after it.

- [ ] **Step 6: The three layouts**

`CarouselGalleryLayout.tsx` (1 hunk):
```tsx
                className={`text-white hover:bg-white/20${currentPhotoAtLimit ? ' opacity-50 cursor-not-allowed' : ''}`}
                aria-disabled={currentPhotoAtLimit || undefined}
                title={currentPhotoAtLimit ? downloadLimitReachedMessage() : t('gallery.downloadPhoto', 'Download photo')}
```
`GalleryPremiumLayout.tsx` H1: keep both import blocks. H2:
```ts
    } catch (error) {
      // The limit refusal already told the guest why (issue 1560).
      if (isDownloadLimitError(error)) return;
      if (!(await downloadGate.reportDownloadFailure(error))) {
        toast.error(t('gallery.downloadError'));
      }
    }
  }, [selectedPhotos, slug, t, downloadChoices, onPickResolution, downloadGate, refreshDownloadQuota, selectionOverQuota, downloadQuota.remaining]);
```
H3 (`handleDownloadFromLightbox`):
```ts
    if (!photo) return;
    if (!canDownloadPhotoNow(photo.id, downloadGate.quotaEnabled, downloadGate.isClient,
      downloadGate.remaining, downloadGate.downloadedIds)) {
      if (downloadGate.isClient) downloadGate.offerForBlockedDownload();
      else downloadGate.notifyGuestBlocked();
      return;
    }
    if (!downloadQuota.canDownload(photo)) {
      showDownloadLimitReached({ remaining: 0 });
      return;
    }
    analyticsService.trackDownload(photo.id, slug, false);
    downloadPhotoMutation.mutate(
      { slug, photoId: photo.id, filename: photo.filename },
      { onError: (error) => { void downloadGate.reportDownloadFailure(error); } },
    );
  }, [allowDownloads, filteredPhotos, slug, downloadPhotoMutation, downloadGate, downloadQuota]);
```
`GalleryStoryLayout.tsx` (1 hunk):
```ts
      if (isDownloadLimitError(error)) return;
      if (!(await downloadGate.reportDownloadFailure(error))) {
        toast.error(t('gallery.downloadError'));
      }
    }
  }, [photos, onDownloadEverything, slug, t, downloadChoices, onPickResolution, downloadGate, refreshDownloadQuota, downloadQuota]);
```

- [ ] **Step 7: `useGallery.ts` (4 hunks)**

H1: keep both: the `downloadQuotaKey` import, `isHandledElsewhere`, and `import { isDownloadLimitError } from '../utils/downloadLimit';`.
H2 (`useDownloadPhoto` onError): `if (isDownloadLimitError(error) || isHandledElsewhere(error)) return;`
H3 (`useSavePhotoToDevice`): keep the fork side (the `quotaAware` field, `savePhotoToDevice(slug, photoId, filename, { quotaAware })`, the `onSuccess` invalidate), with `onError`: `if (isDownloadLimitError(error) || isHandledElsewhere(error)) return;`
H4 (`useDownloadAllPhotos` onError):
```ts
      if (isDownloadLimitError(error)) return;
      // The package dialog owns a 402 refusal.
      if ((error as { response?: { status?: number } })?.response?.status === 402) return;
```

- [ ] **Step 8: `gallery.service.ts` (2 hunks)**

H1 (`savePhotoToDevice`), combined; the auto-merged body below uses the fork's `ios` variable:
```ts
  async savePhotoToDevice(
    slug: string,
    photoId: number,
    filename: string,
    options?: { quotaAware?: boolean },
  ): Promise<void> {
    return withDownloadLimit(slug, () => this.savePhotoToDeviceUnchecked(slug, photoId, filename, options));
  },

  async savePhotoToDeviceUnchecked(
    slug: string,
    photoId: number,
    filename: string,
    options?: { quotaAware?: boolean },
  ): Promise<void> {
    const ios = isIOS();
    if (!ios && !options?.quotaAware && !isGalleryLimited(slug)) {
```
H2 (`fetchPhotoBlob` catch):
```ts
      // A download limit refusal (issue 1560) is final: the view endpoint
      // would hand over the preview as if it were the download.
      if (await readDownloadLimitError(error)) throw error;
```
followed by the fork's comment block about falling back only on 404.

- [ ] **Step 9: `GalleryPage.tsx` (3 hunks): keep ours; the two add/add tests**

```bash
git checkout --ours -- frontend/src/pages/GalleryPage.tsx frontend/src/pages/__tests__/GalleryPage.publicAutoLoginRace.test.tsx frontend/src/services/__tests__/gallery.fetchPhotoBlob.test.ts
rg -n "PasswordChangeRequiredNotice|isAdminSessionExpired" frontend/src/pages/GalleryPage.tsx
```
Expected: the second command finds upstream's 4791c886 and d7c2c581 additions. If `--ours` dropped them, the hunks were wider than expected: restore the file with `git checkout --merge -- frontend/src/pages/GalleryPage.tsx` and resolve the three hunks by hand as "ours" instead.

Append upstream's 429 case to the end of the `describe` in `gallery.fetchPhotoBlob.test.ts`:
```ts
  it('rethrows a 429 instead of falling back', async () => {
    apiMock.get.mockRejectedValueOnce(axiosError(429, { error: 'Too many requests' }));
    await expect(galleryService.fetchPhotoBlob('wedding-2026', 5)).rejects.toMatchObject({
      response: { status: 429 },
    });
    expect(apiMock.get).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 10: Check and stage**

```bash
F=frontend/src
rg -n "^(<<<<<<<|=======|>>>>>>>)" $F/components/gallery $F/hooks/useGallery.ts $F/pages/GalleryPage.tsx $F/pages/__tests__ $F/services
rg -n "useMarkPhotosDelivered|recordDelivered" $F; echo "negative-exit=$?"
rg -n "useRefreshDownloadQuota" $F/hooks/useDownloadQuota.ts
git add $F/components/gallery $F/hooks/useGallery.ts $F/pages/GalleryPage.tsx $F/pages/__tests__/GalleryPage.publicAutoLoginRace.test.tsx $F/services/gallery.service.ts $F/services/__tests__/gallery.fetchPhotoBlob.test.ts
```
Expected: no markers; `negative-exit=1` (no hits) while the control search finds `useRefreshDownloadQuota`.

No commit in this task.

---

### Task 4: Resolve the admin frontend

**Files:**
- Modify: `frontend/src/components/admin/AdminSidebar.tsx`, `frontend/src/pages/admin/CreateEventPage.tsx`, `frontend/src/pages/admin/SettingsPage.tsx`, `frontend/src/features/settings/settingsNav.tsx`, `frontend/src/pages/admin/__tests__/createEventClientAccess.test.tsx`, `frontend/src/pages/admin/event-details/ClientAccessCard.tsx`, `frontend/src/pages/admin/event-details/EventTabs.tsx`, `frontend/src/pages/admin/event-details/types.ts`, `frontend/src/services/notifications.service.ts`

**Interfaces:**
- Consumes: upstream's `features/settings/settingsNav.tsx` (`SettingsTab` union, `ALL_SETTINGS_TABS`, `SETTINGS_TAB_PERMISSIONS`, `useSettingsNavGroups`), `eventHasGuests` from `./utils`, `GuestNameMode` type.
- Produces: `'downloadQuota'` as a valid `SettingsTab`; `'downloads'` in `EventDetailsTab`.

- [ ] **Step 1: `AdminSidebar.tsx` (1 hunk)**

```tsx
  Send,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react';
```

- [ ] **Step 2: `CreateEventPage.tsx` (9 hunks)**

Hunks 1, 2, 3, 7, 9: keep ours (import order; the fork's `useIsMounted()` replaces upstream's re-arm effect; the fork's em-dash-free comment; the fork's client password input with `PasswordGenerator` and no `minLength`; the fork's auto-approve block). Hunks 4, 5, 6, 8: take theirs (token classes only). Then:

```bash
rg -n "^(<<<<<<<|=======|>>>>>>>)" frontend/src/pages/admin/CreateEventPage.tsx
rg -n "download_order_auto_approve|handleClientPasswordGenerated|useIsMounted" frontend/src/pages/admin/CreateEventPage.tsx
```
Expected: no markers; all three names present.

- [ ] **Step 3: `SettingsPage.tsx`: take theirs, then port the fork tab into `settingsNav.tsx`**

Both hunks: take theirs (upstream moved the nav into `features/settings/settingsNav.tsx`). Keep the fork's auto-merged `import { SettingsDownloadQuotaPage }` and `{activeTab === 'downloadQuota' && <SettingsDownloadQuotaPage />}`. Then five edits in `frontend/src/features/settings/settingsNav.tsx`:

```tsx
// 1. lucide import list: add
  ShoppingCart,
// 2. SettingsTab union, after  | 'downloads'
  | 'downloadQuota'
// 3. ALL_SETTINGS_TABS: insert after 'downloads'
  'downloadQuota',
// 4. SETTINGS_TAB_PERMISSIONS, after the downloads entry:
  downloadQuota:     ['settings.view', 'events.edit'],
// 5. useSettingsNavGroups, "appearance" group, after the downloads item:
        { key: 'downloadQuota', label: t('downloadQuotaAdmin.packages.tab', 'Download packages'), icon: ShoppingCart },
```

```bash
rg -n "downloadQuota" frontend/src/features/settings/settingsNav.tsx frontend/src/pages/admin/SettingsPage.tsx
```
Expected: five hits in `settingsNav.tsx`, two in `SettingsPage.tsx`.

- [ ] **Step 4: Whole-file "ours" for two files**

`ClientAccessCard.tsx` must not be resolved hunk by hunk: upstream lines auto-merged between its hunks reference the deleted `clientAccess.pinHelperText` key. The add/add test is the same test on both sides, and upstream's version expects PIN keys the fork deleted.

```bash
git checkout --ours -- frontend/src/pages/admin/event-details/ClientAccessCard.tsx frontend/src/pages/admin/__tests__/createEventClientAccess.test.tsx
```

- [ ] **Step 5: `EventTabs.tsx`, `types.ts`, `notifications.service.ts`**

`EventTabs.tsx`:
```tsx
        <button
          onClick={() => setActiveTab('downloads')}
          className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
            activeTab === 'downloads'
              ? 'border-accent text-accent'
              : 'border-transparent text-muted hover:text-body hover:border-line-strong'
          }`}
        >
          <Download className="w-4 h-4" />
          <span>{t('downloadQuotaAdmin.ledger.tab', 'Downloads')}</span>
        </button>
        {eventHasGuests(event, eventFeedbackSettings) && (
```
`types.ts`:
```ts
import type { GuestNameMode } from '../../../types';

export type EventDetailsTab = 'overview' | 'photos' | 'categories' | 'guests' | 'downloads';
```
`notifications.service.ts`:
```ts
      case 'download_order_created':
        return { icon: 'ShoppingCart', color: 'text-amber-600' };
      case 'api_photo_downloaded':
      case 'api_photos_downloaded':
      case 'api_photos_zip_downloaded':
        return { icon: 'Download', color: 'text-cyan-600' };
```

- [ ] **Step 6: Check and stage**

```bash
A=frontend/src
rg -n "^(<<<<<<<|=======|>>>>>>>)" $A/components/admin/AdminSidebar.tsx $A/pages/admin $A/features/settings $A/services/notifications.service.ts
rg -n "clientAccess\.(pin|setPin|enterPin|invalidPin)" $A; echo "pin-keys-exit=$?"
git add $A/components/admin/AdminSidebar.tsx $A/pages/admin/CreateEventPage.tsx $A/pages/admin/SettingsPage.tsx $A/features/settings/settingsNav.tsx $A/pages/admin/__tests__/createEventClientAccess.test.tsx $A/pages/admin/event-details $A/services/notifications.service.ts
```
Expected: no markers; `pin-keys-exit=1`.

No commit in this task.

---

### Task 5: Resolve the locale files

All conflicts are positional. A plain deep merge (`jq -s '.[0] * .[1]'`) resurrects 15 deleted keys, so use a leaf-level three-way merge built on upstream's file.

**Files:**
- Modify: `frontend/src/i18n/locales/{en,de,es,fr,nl,pt,ru,sl}.json`, `frontend/src/i18n/locales/vi.json`
- Create: `$S/i18n/merge3.jq` (scratch)

- [ ] **Step 1: Write the merge program**

Write `$S/i18n/merge3.jq`:

```jq
def leaves: [paths(scalars) as $p | {key: ($p|tojson), value: getpath($p)}] | from_entries;
($b[0] | leaves) as $B | ($o[0] | leaves) as $O | ($t[0] | leaves) as $T
| ([$B, $O, $T] | map(keys) | add | unique) as $all
| reduce $all[] as $k ({doc: $t[0], log: []};
    ($B | has($k)) as $hb | ($O | has($k)) as $ho | ($T | has($k)) as $ht
    | ($B[$k]) as $bv | ($O[$k]) as $ov | ($T[$k]) as $tv | ($k | fromjson) as $p
    | if ($ho == $ht) and ($ov == $tv) then .
      elif ($ho == $hb) and ($ov == $bv) then .
      elif ($ht == $hb) and ($tv == $bv) then
        (if $ho then .doc |= setpath($p; $ov) else .doc |= delpaths([$p]) end)
      else
        (if $ho then .doc |= setpath($p; $ov) else .doc |= delpaths([$p]) end)
        | .log += [{path: ($p|map(tostring)|join(".")), base: $bv,
                    ours: (if $ho then $ov else "<deleted>" end), theirs: (if $ht then $tv else "<deleted>" end)}]
      end)
| . as $r | ($r.log | stderr) | $r.doc
```
Rules: equal on both sides, take it; fork unchanged, take upstream (including a delete); upstream unchanged, take the fork (including a delete); both changed differently, the fork wins and the case is logged.

- [ ] **Step 2: Resolve the eight conflicted locales**

```bash
mkdir -p "$S/i18n"
for L in en de es fr nl pt ru sl; do
  P=frontend/src/i18n/locales/$L.json
  git show 2fe79e46:$P > "$S/i18n/$L.base.json"
  git show HEAD:$P > "$S/i18n/$L.ours.json"
  git show upstream/main:$P > "$S/i18n/$L.theirs.json"
  jq -b -n --indent 2 --slurpfile b "$S/i18n/$L.base.json" --slurpfile o "$S/i18n/$L.ours.json" \
     --slurpfile t "$S/i18n/$L.theirs.json" -f "$S/i18n/merge3.jq" > "$P" 2> "$S/i18n/$L.conflicts.json"
done
for L in en de es fr nl pt ru sl; do echo "$L: $(cat "$S/i18n/$L.conflicts.json" | tr -d '\n' | head -c 300)"; done
```
Expected: `[]` for es, fr, nl, pt, ru, sl. For en and de exactly one entry, `clientAccess.pinHelperText`, resolved as deleted (the fork's `clientAccess.passwordHelperText` already states the floor).

- [ ] **Step 3: Prove nothing was lost**

```bash
k(){ jq -b -r 'paths(scalars)|tojson' "$1" | sort -u; }
for L in en de es fr nl pt ru sl; do P=frontend/src/i18n/locales/$L.json
  k "$S/i18n/$L.base.json" > "$S/b"; k "$S/i18n/$L.ours.json" > "$S/o"; k "$S/i18n/$L.theirs.json" > "$S/t"; k "$P" > "$S/r"
  echo "$L fork-added-lost:$(comm -13 "$S/b" "$S/o" | comm -23 - "$S/r" | wc -l)" \
       "upstream-added-lost:$(comm -13 "$S/b" "$S/t" | comm -23 - "$S/r" | wc -l)" \
       "fork-deleted-back:$(comm -23 "$S/b" "$S/o" | comm -12 - "$S/r" | wc -l)" \
       "upstream-deleted-back:$(comm -23 "$S/b" "$S/t" | comm -12 - "$S/r" | wc -l)" \
       "markers:$(grep -c '^<<<<<<<' "$P")"
done
```
Expected: every count 0 for all eight locales.

- [ ] **Step 4: Drop from `vi` the keys upstream deleted from `en`**

`vi.json` auto-merged unchanged; upstream deleted `contracts.detail.integrity.{help,missing,notIssued,signedTitle,unsignedTitle}` and `migrationBanner.{title,body,link}` from `en`.

```bash
jq -b --indent 2 --slurpfile en frontend/src/i18n/locales/en.json '
  ([$en[0] | paths(scalars)] | map(tojson) | map({key: ., value: true}) | from_entries) as $E
  | delpaths([paths(scalars) | select(tojson as $k | $E[$k] | not)])
  | del(.. | select(type == "object" and length == 0))' frontend/src/i18n/locales/vi.json > "$S/vi.json" \
  && mv "$S/vi.json" frontend/src/i18n/locales/vi.json
git diff --stat -- frontend/src/i18n/locales/vi.json
```
Expected: deletions only (8 leaves).

- [ ] **Step 5: Stage**

```bash
git add frontend/src/i18n/locales/*.json
```

No commit in this task.

---

### Task 6: Post-resolution fixes, gates, and the merge commit

**Files:**
- Modify: every fork-added admin file that the new lint rule flags (by codemod)

- [ ] **Step 1: No conflicts or markers left anywhere**

```bash
git diff --name-only --diff-filter=U
git grep -n -E "^(<<<<<<<|>>>>>>>) " -- . ':!*.md'
```
Expected: both empty.

- [ ] **Step 2: Reinstall and prove the watcher survives**

```bash
cd backend && npm ci && cd ..
cd frontend && npm ci && cd ..
```
The worktree has no `backend/.env` (it is untracked). Copy the main checkout's, which already has `DB_HOST=localhost` and `PORT=3001`:

```bash
cp /d/Coding/picpeak/backend/.env backend/.env
git check-ignore -v backend/.env
```
Expected: the second command names the ignore rule, so the file can never be committed. Then start `npm run dev` in `backend/` with the dev stack's Postgres and Redis running (`docker compose --project-directory /d/Coding/picpeak up -d postgres redis`, from the main checkout, never a second stack from the worktree, which would bring its own volumes). Touch `backend/src/utils/frontendUrl.js`, and confirm the log shows a restart and no "minimatch is not a function". Stop the process afterwards.

- [ ] **Step 3: Tests never use a real database**

```bash
cd backend && DATABASE_CLIENT=pg npx jest __tests__/routes/adminEvents.recoverablePassword.test.js 2>&1 | rg -n "sqlite|Tests:" ; cd ..
```
Expected: the suite runs (on SQLite) and passes. Then confirm the line itself:
```bash
rg -n "^process\.env\.DATABASE_CLIENT = 'sqlite3';" backend/jest.setup.js
```

- [ ] **Step 4: Frontend lint rule, then every gate**

Upstream added the lint rule `ui-tokens/no-raw-dark-palette` at error level; fork-added blocks still use raw neutral class pairs.

```bash
cd frontend && npm run codemod:ui-tokens && npm run codemod:ui-tokens -- --check && cd ..
cd backend && npm run lint; npx jest --silent > "$S/merge-backend-jest.txt" 2>&1; rg -n "^Tests:|^Test Suites:" "$S/merge-backend-jest.txt"; cd ..
cd frontend && npm run lint && npm run build:check; npx vitest run > "$S/merge-frontend-vitest.txt" 2>&1; rg -n "FAIL " "$S/merge-frontend-vitest.txt" | sort -u > "$S/merge-frontend-failing.txt"; comm -13 "$S/base-frontend-failing.txt" "$S/merge-frontend-failing.txt"; cd ..
```
Expected: codemod check clean; backend lint clean; frontend lint and `build:check` exit 0; the last `comm` prints nothing (no failing file outside the baseline list). Backend Jest failures are compared against `$S/base-backend-jest.txt`: any suite failing now and passing before is fixed before continuing. The named suites for the Review Focus must pass:

```bash
cd backend && npx jest __tests__/services/usageCoverageInventory __tests__/routes/adminEventsClientPasswordFloor src/__tests__/clientPasswordValidator; cd ..
cd frontend && npx vitest run src/components/gallery/__tests__/bulkDownloadChargesQuota.test.ts src/components/gallery/__tests__/DownloadResolutionModal.chargesQuota.test.tsx src/components/gallery/__tests__/PhotoGridWithLayouts.refusalKeepsSelection.test.tsx src/pages/admin/__tests__/createEventClientAccess.test.tsx src/pages/admin/__tests__/createEventDoubleSubmit.test.tsx src/pages/admin/__tests__/createEventStrictModeMount.test.tsx; cd ..
```
If a named file path does not exist, locate it with `fd <name> frontend/src backend` and run it from its real path. Expected: all pass.

A single-download route test for Review Focus 1: add to `backend/__tests__/integration/downloadQuotaRoutePg.test.js` (it already builds the app and an event with photos):

```js
it('serves a single photo and charges it once', async () => {
  const res = await agent.get(`/api/gallery/${slug}/download/${photoId}`);
  expect(res.status).toBe(200);
  const rows = await pgDb('event_photo_downloads').where({ event_id: eventId, photo_id: photoId });
  expect(rows).toHaveLength(1);
});
```
Reuse `agent`, `slug`, `photoId`, `eventId` and `pgDb` from that file's setup; adjust the route path to the one the file already uses for downloads. Run it with `PICPEAK_PG_TEST_URL` pointing at a throwaway database on the main checkout's dev Postgres:

```bash
DC="docker compose --project-directory /d/Coding/picpeak"
$DC exec -T postgres psql -U picpeak -c "CREATE DATABASE picpeak_test;" 2>/dev/null
cd backend && PICPEAK_PG_TEST_URL="postgres://picpeak:$(rg -oP '^DB_PASSWORD=\K.*' .env)@localhost:5432/picpeak_test" npx jest __tests__/integration/downloadQuotaRoutePg.test.js; cd ..
```
Expected: PASS.

- [ ] **Step 5: Removed exports and the backup mount**

For every name upstream removed, the merged tree must have zero hits:
```bash
for n in checkRateLimit recordAction getBcryptRounds logPasswordValidationFailure toMillis SQLITE_NAIVE_TIMESTAMP secureToken.service MigrationBanner; do echo "$n: $(git grep -n -w "$n" -- backend/src frontend/src | wc -l)"; done
git grep -n "transferService.recordDownload\|verifyIntegrity(" -- backend/src | head
rg -n '\$\{BACKUPS:-\./backups\}:/backup' docker-compose.production.yml
```
Expected: 0 for each name (a hit in a string or an i18n key is checked by eye); the backup line present.

- [ ] **Step 6: Commit the merge**

```bash
printf '%s\n' "chore: merge upstream/main into the event redesign branch" "" \
"Sync 144 upstream commits, including the security fixes #1483, #1497," \
"#1554, #1570, #1571, #1575, #1660, #1661, #1662, #1669 and #1672." \
"Fork behaviour kept on conflict: the download allowance, client" \
"password rules, the unconditional DATABASE_CLIENT pin in jest.setup," \
"and the BACKUPS mount variable." > "$S/msg-merge.txt"
git commit -F "$S/msg-merge.txt"
git log --oneline -1
```

---

### Task 7: Remove upstream's per-event download limit (U1)

**Files:**
- Delete (via revert): `backend/src/services/downloadQuota.js`, `backend/src/routes/adminEvents/downloadLimit.js`, `backend/migrations/core/231_event_download_limit.js`, `frontend/src/contexts/DownloadQuotaContext.tsx`, `frontend/src/components/gallery/DownloadQuotaNotice.tsx`, `frontend/src/utils/downloadLimit.ts`, `frontend/src/pages/admin/event-details/DownloadLimitUsage.tsx`, their tests, `tests/e2e/gallery-download-limit.spec.ts`
- Modify: the 60 other files upstream f131c8b2 touched, plus the Task 3 combine lines

**Interfaces:**
- Produces: a tree with no reference to upstream's limit. Only migration 231 depended on it, and production never ran 231.

- [ ] **Step 1: Revert the feature commit without committing**

```bash
git revert --no-commit f131c8b2
git diff --name-only --diff-filter=U | sort
```
Conflicts come from three later upstream commits that built on the feature (d1989ef6 uploader names, e4170cea ownership predicate, 10619d26 dead token routes) and from the Task 3 combine lines. Resolve every conflict with one rule: the result is the merged tree minus what f131c8b2 added, keeping everything d1989ef6, e4170cea and 10619d26 added and everything the fork has. Concretely: in `downloads.js` the fork's `passesQuotaGate` / `settleReservation` lines stay and upstream's `checkDownloads`, `grantDownloads`, `settleWhenDone`, `downloadLimitOf`, `currentDownloadLimit`, `isPreviewOnly` lines go; if removing `grantThisPhoto` leaves the single-photo branches without a download counter, restore the counting that `git show 2fe79e46:backend/src/routes/gallery/downloads.js` had for that route. In `GalleryView.tsx` every `downloadLimit` line from Task 3 goes, the `DownloadQuotaProvider` wrapper goes, the fork's `DownloadedPhotosProvider` and `DownloadGateProvider` stay, and each handler keeps its fork gate and its `refreshDownloadQuota(slug)` call.

- [ ] **Step 2: Remove what the revert cannot reach**

Remove the fixture column added in Task 2 Step 10 (`t.integer('download_limit').nullable();`) and `settings_tabs` / `route_families` entries for `adminEvents/downloadLimit.js` in `docs/usage-coverage.v5.json` if the revert left them. Remove upstream's `gallery.downloadLimit.*`, `events.downloadLimit*` and `settings.events.defaultDownloadLimit*` locale keys if any survived.

- [ ] **Step 3: Prove it is gone**

```bash
git grep -n -E "download_limit|downloadLimit|DownloadLimit|DOWNLOAD_LIMIT|DownloadQuotaContext|DownloadQuotaNotice|event_download_grants|withDownloadLimit|isGalleryLimited|services/downloadQuota['\"]" -- backend frontend tests docs/usage-coverage.v5.json; echo "exit=$?"
git grep -n "useRefreshDownloadQuota" -- frontend/src/hooks/useDownloadQuota.ts
```
Expected: `exit=1` with no hits, while the control search finds the fork hook.

- [ ] **Step 4: Gates**

```bash
cd frontend && npm run lint && npm run build:check; npx vitest run > "$S/revert-frontend-vitest.txt" 2>&1; rg -n "FAIL " "$S/revert-frontend-vitest.txt" | sort -u > "$S/revert-frontend-failing.txt"; comm -13 "$S/base-frontend-failing.txt" "$S/revert-frontend-failing.txt"; cd ..
cd backend && npm run lint; npx jest --silent > "$S/revert-backend-jest.txt" 2>&1; rg -n "^Tests:|^Test Suites:" "$S/revert-backend-jest.txt"; cd ..
cd frontend && npx vitest run src/components/gallery/__tests__/bulkDownloadChargesQuota.test.ts; cd ..
cd backend && npx jest __tests__/services/usageCoverageInventory; cd ..
```
Expected: the same outcome as Task 6 Step 4, including the single-download test from Review Focus 1.

- [ ] **Step 5: Migration dry run on a fresh database**

Use the main checkout's dev Postgres, never a second stack started from the worktree:

```bash
DC="docker compose --project-directory /d/Coding/picpeak"
$DC up -d postgres
$DC exec -T postgres psql -U picpeak -c "DROP DATABASE IF EXISTS picpeak_migtest;" -c "CREATE DATABASE picpeak_migtest;"
cd backend && DB_HOST=localhost DB_NAME=picpeak_migtest DATABASE_CLIENT=pg node migrations/run-migrations-safe.js; echo "exit=$?"; cd ..
$DC exec -T postgres psql -U picpeak -d picpeak_migtest -tc "SELECT filename FROM migrations WHERE filename ~ '^(214|215|231)_' ORDER BY filename;"
$DC exec -T postgres psql -U picpeak -c "DROP DATABASE picpeak_migtest;"
```
The first `psql` line recreates only the throwaway `picpeak_migtest` database; the last line drops it again. Never point `DB_NAME` at the dev or production database. Adjust the user and variable names to the ones in `backend/.env` if they differ. Expected: exit 0; the list holds `214_contracts_create_idempotency_key.js`, `214_download_quota.js`, `215_download_order_auto_approve.js`, `215_public_document_verification_codes.js`, and no `231_`.

- [ ] **Step 6: Commit**

```bash
printf '%s\n' "revert(downloads): drop upstream's per-event download limit" "" \
"This reverts upstream f131c8b2 (#1568). The fork already charges" \
"downloads through its own allowance and orders; two caps on one" \
"gallery would contradict each other. Migration 231 goes with it and" \
"has never run on production." > "$S/msg-revert.txt"
git add -A
git commit -F "$S/msg-revert.txt"
```

---

### Task 8: Bring `vi` to full parity (U2)

**Files:**
- Modify: `frontend/src/i18n/locales/vi.json`
- Create: `$S/vi/missing.json`, `$S/vi/batch-NN.json`, `$S/vi/batch-NN.vi.json` (scratch)

**Interfaces:**
- Produces: `vi.json` with every leaf `en.json` has.

- [ ] **Step 1: Extract what is missing, plus the reworded keys**

```bash
mkdir -p "$S/vi"
EN=frontend/src/i18n/locales/en.json; VI=frontend/src/i18n/locales/vi.json
jq -b -n --slurpfile en "$EN" --slurpfile vi "$VI" '
  ($vi[0] | [paths(scalars)] | map(tojson)) as $V
  | [$en[0] | paths(scalars) as $p | select(($p|tojson) as $k | $V | index($k) | not) | {path: $p, en: ($en[0] | getpath($p))}]' > "$S/vi/missing.json"
jq -b -n --slurpfile b "$S/i18n/en.base.json" --slurpfile t "$S/i18n/en.theirs.json" --slurpfile vi "$VI" '
  [$t[0] | paths(scalars) as $p | select(($b[0] | getpath($p)) != null and ($b[0] | getpath($p)) != ($t[0] | getpath($p)) and ($vi[0] | getpath($p)) != null) | {path: $p, en: ($t[0] | getpath($p))}]' > "$S/vi/reworded.json"
jq -b 'length' "$S/vi/missing.json" "$S/vi/reworded.json"
jq -b -s 'add' "$S/vi/missing.json" "$S/vi/reworded.json" > "$S/vi/todo.json"
jq -b -c '_nwise(150)' "$S/vi/todo.json" | awk -v d="$S/vi" '{f=sprintf("%s/batch-%02d.json", d, NR); print > f}'
ls "$S/vi"/batch-*.json | wc -l
```
Expected: about 1450 missing (after Task 7 removed the download-limit keys, somewhat fewer) and 16 reworded, including `backup.configuration.fields.rsyncSshKey`, `rsyncSshKeyHelp`, `rsyncSshKeyPlaceholder`.

- [ ] **Step 2: Translate the batches in parallel**

Dispatch one subagent per batch file, all in one message. Prompt for each (fill the batch number):

```text
Translate UI strings for PicPeak, a self-hosted photo gallery and studio CRM, from English to Vietnamese.
Input: <S>/vi/batch-NN.json, a JSON array of {path, en}. Output: write <S>/vi/batch-NN.vi.json, the same array with a "vi" field added to every item. Do not modify any other file.
Rules:
- Full Vietnamese diacritics everywhere. Natural, concise UI Vietnamese as used by photographers and their clients; address the user neutrally ("bạn" only where English says "you").
- Keep every {{placeholder}}, <tag>, </tag>, %s, URL, email, product name (PicPeak), and technical token (SSH, rsync, S3, PDF, SMTP, API, VAT, IBAN) exactly as in English.
- Keys ending in _one/_other are plural forms; Vietnamese has no plural, so both get the same natural sentence with the count placeholder kept.
- Never use the em-dash or the en-dash; use a colon, comma or full stop.
- rsyncSshKey keys: the field is now the absolute path to a private key FILE on the server, never the key itself; translate so nobody is invited to paste a key.
- Keep terminology consistent with existing translations: read frontend/src/i18n/locales/vi.json in the worktree D:\Coding\picpeak\.claude\worktrees\event-form-redesign for how contracts (hợp đồng), quotes (báo giá), invoices (hóa đơn), customers (khách hàng), gallery (thư viện ảnh or gallery as already used) are translated there, and follow it.
Report only: the output path and the item count.
```

- [ ] **Step 3: Validate every batch before merging it**

```bash
node -e '
const fs=require("fs"),path=require("path");const d=process.argv[1];let bad=0,n=0;
const tok=s=>(String(s).match(/\{\{[^}]+\}\}|<\/?[a-zA-Z0-9]+[^>]*>|%s/g)||[]).sort().join("|");
for (const f of fs.readdirSync(d).filter(f=>/^batch-\d+\.vi\.json$/.test(f))) {
  const src=JSON.parse(fs.readFileSync(path.join(d,f.replace(".vi",""))));
  const out=JSON.parse(fs.readFileSync(path.join(d,f)));
  if (out.length!==src.length){console.log(f,"count",src.length,out.length);bad++;}
  for (const it of out){n++;
    if (typeof it.vi!=="string"||!it.vi.trim()){console.log(f,it.path.join("."),"empty");bad++;continue;}
    if (tok(it.en)!==tok(it.vi)){console.log(f,it.path.join("."),"tokens",tok(it.en),"vs",tok(it.vi));bad++;}
    if (/[\u2013\u2014]/.test(it.vi)){console.log(f,it.path.join("."),"dash");bad++;}
  }}
console.log("items",n,"problems",bad);' "$S/vi"
```
Expected: `problems 0`. Send any failing batch back to its subagent with the printed lines.

- [ ] **Step 4: Merge into `vi.json` and prove parity**

```bash
jq -b -s '[.[][]]' "$S"/vi/batch-*.vi.json > "$S/vi/all.vi.json"
jq -b --indent 2 --slurpfile t "$S/vi/all.vi.json" 'reduce $t[0][] as $i (.; setpath($i.path; $i.vi))' frontend/src/i18n/locales/vi.json > "$S/vi/vi.new.json" && mv "$S/vi/vi.new.json" frontend/src/i18n/locales/vi.json
k(){ jq -b -r 'paths(scalars)|tojson' "$1" | sort -u; }
k frontend/src/i18n/locales/en.json > "$S/en.k"; k frontend/src/i18n/locales/vi.json > "$S/vi.k"; k frontend/src/i18n/locales/de.json > "$S/de.k"
echo "en-not-vi:$(comm -23 "$S/en.k" "$S/vi.k" | wc -l) vi-not-en:$(comm -13 "$S/en.k" "$S/vi.k" | wc -l) en-not-de:$(comm -23 "$S/en.k" "$S/de.k" | wc -l)"
rg -n "[\x{2014}\x{2013}]" frontend/src/i18n/locales/vi.json | wc -l
jq -r '.backup.configuration.fields | .rsyncSshKey, .rsyncSshKeyHelp, .rsyncSshKeyPlaceholder' frontend/src/i18n/locales/vi.json
```
Expected: `en-not-vi:0 vi-not-en:0 en-not-de:0`; the dash count equals the count before this task (existing strings are not in scope); the three rsync strings describe a key file path and none contains `BEGIN`.

- [ ] **Step 5: i18n gates and commit**

```bash
cd frontend && npm run i18n:status > "$S/after-i18n.txt" 2>&1; cat "$S/after-i18n.txt" | tail -5; npm run lint; cd ..
git add frontend/src/i18n/locales/vi.json
printf '%s\n' "feat(i18n): translate the upstream strings missing from Vietnamese" "" \
"Brings vi back to full key parity with en and de after the upstream" \
"sync, and retranslates the strings upstream reworded, including the" \
"rsync key field, which now takes a key file path, never a pasted key." > "$S/msg-vi.txt"
git commit -F "$S/msg-vi.txt"
```
Expected: the `i18n:status` missing counts are no higher than the baseline's (the runtime-built templates stay invisible to the extractor).

---

### Task 9: Update the spec and hand over

**Files:**
- Modify: `docs/superpowers/specs/2026-09-28-event-form-redesign-design.md`

- [ ] **Step 1: Record the P-1 outcome in the spec**

In section 3.1 add rows U1 (upstream download limit removed), U2 (vi translated in full), U3 (no separate deploy). In finding 4 and in P0, note that the secure-download route no longer exists after the sync, so P0 covers five download paths. In section 8 add: the first deploy applies 43 upstream migrations; run `docker compose -f docker-compose.production.yml config` on the NAS (Compose v2.26.1) before deploying, because the Redis command changed from `$$(cat ...)` to `$(cat ...)`; `/backup` is chowned to UID 1001 on boot, and on the NAS that folder also holds the `predeploy_*` snapshots.

- [ ] **Step 2: Commit**

```bash
rg -n "[\x{2014}\x{2013}]" docs/superpowers/; echo "dash-exit=$?"
git add docs/superpowers/specs/2026-09-28-event-form-redesign-design.md docs/superpowers/plans/2026-09-28-p-1-upstream-sync.md
printf '%s\n' "docs(spec): record the upstream sync outcome" > "$S/msg-spec3.txt"
git commit -F "$S/msg-spec3.txt"
git log --oneline -5
```
Expected: `dash-exit=1`; four new commits on top of the spec commits: the merge, the revert, the Vietnamese translations, and this one.
