import { test, expect, type Locator, type Page } from '@playwright/test';
import { openGallery, seedGallery, type SeedPhoto } from './_helpers/gallery';

// Uploaded out of alphabetical order, so the default sort (last upload) and
// the file name sort put different photos first.
const NAMES = ['delta', 'alpha', 'foxtrot', 'charlie', 'echo', 'bravo'];
const SHAPES = [[800, 1200], [1200, 800], [1000, 1000], [800, 1120], [1280, 720], [900, 1200]];
const PHOTOS: SeedPhoto[] = NAMES.map((name, i) => ({ name: `${name}.jpg`, width: SHAPES[i][0], height: SHAPES[i][1] }));
const FIRST_BY_NAME = ['alpha.jpg', 'foxtrot.jpg'];

const VIEWPORTS = [
  { width: 1440, height: 900, columns: 3, touch: false },
  { width: 390, height: 844, columns: 2, touch: true },
];

const toolbar = (page: Page) => page.getByTestId('gallery-toolbar');
const tiles = (page: Page) => page.getByTestId('grid-tile');
const photoParam = (page: Page) => new URL(page.url()).searchParams.get('photo');

for (const vp of VIEWPORTS) {
  test.describe(`client gallery at ${vp.width}x${vp.height}`, () => {
    test.use({
      viewport: { width: vp.width, height: vp.height },
      ...(vp.touch ? { hasTouch: true, isMobile: true } : {}),
    });

    // Each describe sets its own viewport, so one browser project covers both.
    test.beforeEach(({}, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', 'viewports are set per describe');
    });

    // A tap on the phone, a click on the desktop. The gallery tracks which
    // input is in use from the pointer events, and a mouse click on the phone
    // viewport would switch it to mouse mode and hide the tile badges again.
    const press = (target: Locator) => (vp.touch ? target.tap() : target.click());

    /** Bring a tile's badges up: hover with a mouse; on touch they always show. */
    const reveal = async (page: Page, index: number) => {
      const tile = tiles(page).nth(index);
      if (!vp.touch) await tile.hover();
      return tile;
    };

    test('the cover names the event and View Album brings the toolbar into view', async ({ page }) => {
      const g = await seedGallery(page.request, { photos: PHOTOS.slice(0, 3) });
      await openGallery(page, g.shareLink);

      await expect(page.getByRole('heading', { level: 1 })).toHaveText(g.eventName);
      await expect(toolbar(page)).not.toBeInViewport();
      await press(page.getByRole('button', { name: 'View Album' }));
      await expect(toolbar(page)).toBeInViewport();
    });

    test(`the grid lays the tiles out in ${vp.columns} columns`, async ({ page }) => {
      const g = await seedGallery(page.request, { photos: PHOTOS });
      await openGallery(page, g.shareLink);

      await expect(tiles(page)).toHaveCount(PHOTOS.length);
      const xs = new Set<number>();
      for (const box of await tiles(page).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().x))) {
        xs.add(Math.round(box));
      }
      expect(xs.size).toBe(vp.columns);
    });

    test('a like counts on the Like tab and survives a reload', async ({ page }) => {
      const g = await seedGallery(page.request, { photos: PHOTOS.slice(0, 3) });
      await openGallery(page, g.shareLink);

      await expect(page.getByRole('tab', { name: 'Like 0' })).toBeVisible();
      const tile = await reveal(page, 0);
      await press(tile.getByRole('button', { name: 'Like', exact: true }));
      await expect(page.getByRole('tab', { name: 'Like 1' })).toBeVisible();
      await expect(tile.getByRole('button', { name: 'Unlike' })).toBeVisible();

      await page.reload();
      await expect(page.getByRole('tab', { name: 'Like 1' })).toBeVisible();
    });

    test('a pick past the limit opens the limit modal and the count stays', async ({ page }) => {
      const g = await seedGallery(page.request, { photos: PHOTOS.slice(0, 3), maxPicks: 1 });
      await openGallery(page, g.shareLink);

      await expect(page.getByRole('tab', { name: 'Pick 0 / 1' })).toBeVisible();
      await press((await reveal(page, 0)).getByRole('button', { name: 'Pick', exact: true }));
      await expect(page.getByRole('tab', { name: 'Pick 1 / 1' })).toBeVisible();

      await press((await reveal(page, 1)).getByRole('button', { name: 'Pick', exact: true }));
      const modal = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /limit reached/i }) });
      await expect(modal).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Pick 1 / 1' })).toBeVisible();
    });

    test('sorting by file name and flipping the direction changes the first tile', async ({ page }) => {
      const g = await seedGallery(page.request, { photos: PHOTOS });
      await openGallery(page, g.shareLink);
      await expect(tiles(page)).toHaveCount(PHOTOS.length);

      await press(toolbar(page).getByRole('button', { name: /^(Creation Time|File Name|Last Upload)$/ }));
      await press(page.getByRole('menuitem', { name: 'File Name' }));
      await expect(page).toHaveURL(/[?&]sort=name/);

      const firstName = () => page.getByTestId('tile-open').first().getAttribute('aria-label');
      await expect.poll(firstName).toMatch(/^(alpha|foxtrot)\.jpg$/);
      const before = await firstName();

      await press(toolbar(page).getByRole('button', { name: 'Change Sort Direction' }));
      const other = FIRST_BY_NAME.find((n) => n !== before);
      await expect.poll(firstName).toBe(other);
    });

    test('the list view shows dimensions and sizes, and ?view=list survives a reload', async ({ page }) => {
      const g = await seedGallery(page.request, { photos: PHOTOS.slice(0, 3), noisy: true });
      await openGallery(page, g.shareLink);
      await expect(tiles(page)).toHaveCount(3);

      const viewToggle = toolbar(page).getByRole('button', { name: 'Change View Mode' });
      await press(viewToggle);
      const rows = page.getByTestId('list-row');
      await expect(rows).toHaveCount(3);
      await expect(rows.first()).toContainText('×');
      await expect(rows.first()).toContainText(/\d+(\.\d)? MB/);
      await expect(page).toHaveURL(/[?&]view=list/);

      await press(viewToggle);
      await expect(tiles(page)).toHaveCount(3);
      await expect(rows).toHaveCount(0);
      await expect(page).not.toHaveURL(/view=list/);

      await press(viewToggle);
      await expect(rows).toHaveCount(3);
      await page.reload();
      await expect(page).toHaveURL(/[?&]view=list/);
      await expect(page.getByTestId('list-row')).toHaveCount(3);
    });

    test('the viewer follows the URL, steps with ArrowRight and closes on Back', async ({ page }) => {
      const g = await seedGallery(page.request, { photos: PHOTOS.slice(0, 4) });
      await openGallery(page, g.shareLink);
      await expect(tiles(page)).toHaveCount(4);

      await press(page.getByTestId('tile-open').first());
      await expect.poll(() => photoParam(page)).toMatch(/^\d+$/);
      const first = photoParam(page);
      const current = page.locator('[data-testid="filmstrip-thumb"][aria-current="true"]');
      await expect(current).toHaveAttribute('data-photo-id', first as string);

      await page.keyboard.press('ArrowRight');
      await expect.poll(() => photoParam(page)).not.toBe(first);
      const second = photoParam(page);
      expect(second).toMatch(/^\d+$/);
      await expect(current).toHaveAttribute('data-photo-id', second as string);
      await expect(page.getByTestId('filmstrip-thumb')).toHaveCount(4);

      await press(page.getByRole('button', { name: 'Back', exact: true }));
      await expect.poll(() => photoParam(page)).toBeNull();
      await expect(page.getByTestId('filmstrip')).toHaveCount(0);
    });

    test('multi-select downloads the chosen photos and re-reads the quota', async ({ page }) => {
      const g = await seedGallery(page.request, { photos: PHOTOS.slice(0, 3) });
      const quotaCalls: number[] = [];
      page.on('request', (req) => {
        if (req.url().includes(`/api/gallery/${g.slug}/download-quota`)) quotaCalls.push(Date.now());
      });
      const downloads: string[] = [];
      page.on('download', (d) => downloads.push(d.suggestedFilename()));

      await openGallery(page, g.shareLink);
      await expect(tiles(page)).toHaveCount(3);

      await press(toolbar(page).getByRole('button', { name: 'Download', exact: true }));
      await press(page.getByRole('menuitem', { name: 'Multi-select' }));
      const open = page.getByTestId('tile-open');
      await press(open.nth(0));
      await press(open.nth(1));
      await expect(open.nth(0)).toHaveAttribute('aria-pressed', 'true');
      await expect(open.nth(1)).toHaveAttribute('aria-pressed', 'true');
      await expect(toolbar(page)).toContainText('2 selected');

      const callsBefore = quotaCalls.length;
      await press(toolbar(page).getByRole('button', { name: 'Download selected' }));
      await expect.poll(() => downloads.length, { timeout: 20_000 }).toBe(2);
      await expect.poll(() => quotaCalls.length).toBeGreaterThan(callsBefore);
    });
  });
}
