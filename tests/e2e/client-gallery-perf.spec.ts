import { test, expect } from '@playwright/test';
import { mixedSizes, passGalleryPasswordPrompt, GALLERY_PASSWORD, seedGallery } from './_helpers/gallery';

// A 2000 photo album scrolled at 4x CPU throttle must stay windowed (few DOM
// nodes), smooth (no long task near 100ms) and still (no layout shift).
const PHOTO_COUNT = 2000;

test.describe('client gallery scrolling budget', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  let galleryUrl = '';

  test.beforeAll(async ({ playwright }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'CPU throttling needs CDP and one seeded album is enough');
    // Seeding uploads and processes every photo, which takes minutes.
    testInfo.setTimeout(20 * 60_000);
    const request = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
    try {
      const g = await seedGallery(request, {
        photos: mixedSizes(PHOTO_COUNT, 0.5),
        batchSize: 100,
        processingTimeoutMs: 15 * 60_000,
      });
      galleryUrl = g.shareLink;
    } finally {
      await request.dispose();
    }
  });

  test('scrolling a 2000 photo album stays within budget', async ({ page }, testInfo) => {
    // A throttled reload of a 2000 photo list is slow on its own.
    test.setTimeout(5 * 60_000);
    // Sign in before throttling: the budget is about scrolling, not the prompt.
    await page.goto(galleryUrl);
    await passGalleryPasswordPrompt(page, GALLERY_PASSWORD);
    await expect(page.getByRole('tab', { name: `Total ${PHOTO_COUNT}` })).toBeVisible({ timeout: 30_000 });

    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(galleryUrl);
    await page.getByRole('button', { name: /view album/i }).click();
    await expect(page.getByTestId('grid-tile').first()).toBeVisible();
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
        for (const e of list.getEntries()) {
          const shift = e as unknown as { value: number; hadRecentInput: boolean };
          if (!shift.hadRecentInput) total += shift.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
      setTimeout(() => resolve(total), 500);
    }));

    const measured = { nodes, longestTaskMs: longest, cls, scrollY: await page.evaluate(() => window.scrollY) };
    await testInfo.attach('scroll-budget', { body: JSON.stringify(measured, null, 2), contentType: 'application/json' });
    console.log(`scroll budget: ${JSON.stringify(measured)}`);

    expect(nodes).toBeLessThan(3000);
    expect(longest).toBeLessThan(100);
    expect(cls).toBeLessThan(0.05);
  });
});
