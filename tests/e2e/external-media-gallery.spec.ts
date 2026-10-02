import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { adminApiToken, publishEvent } from './_helpers/admin';
import { passGalleryPasswordPrompt } from './_helpers/gallery';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const GALLERY_PASSWORD = process.env.GALLERY_PASSWORD || 'ExternalMediaPass!1';

async function createExternalGallery(page) {
  // The host directory the backend sees as EXTERNAL_MEDIA_ROOT; see
  // docker-compose.e2e.yml.
  const mediaRoot = process.env.E2E_EXTERNAL_MEDIA_DIR || path.join(process.cwd(), '.e2e', 'external-media');
  const externalRoot = path.join(mediaRoot, 'picsum-demo', 'individual');
  if (!fs.existsSync(externalRoot)) {
    fs.mkdirSync(externalRoot, { recursive: true });
  }

  const sampleImages = ['img1.png', 'img2.png'];
  for (const imageName of sampleImages) {
    const source = path.join(process.cwd(), 'test-assets', imageName);
    const target = path.join(externalRoot, imageName);
    if (!fs.existsSync(target)) {
      fs.copyFileSync(source, target);
    }
  }

  const token = await adminApiToken(page.request);

  const eventName = `External Media Playwright ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const eventDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const createResponse = await page.request.post('/api/admin/events', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: {
      event_type: 'wedding',
      event_name: eventName,
      event_date: eventDate,
      customer_name: 'External Host',
      customer_email: 'host@example.com',
      admin_email: ADMIN_EMAIL,
      password: GALLERY_PASSWORD,
      expiration_days: 30,
      allow_user_uploads: false,
      allow_downloads: true,
      feedback_enabled: true,
      allow_ratings: true,
      allow_likes: true,
      allow_comments: true,
      allow_favorites: true,
      require_name_email: false,
      moderate_comments: false,
      show_feedback_to_guests: true,
      source_mode: 'reference',
      external_path: 'picsum-demo'
    },
    failOnStatusCode: false,
  });

  if (!createResponse.ok()) {
    const bodyText = await createResponse.text();
    throw new Error(`Failed to create event: ${createResponse.status()} ${bodyText}`);
  }
  const createdEvent = await createResponse.json();
  expect(createdEvent?.id).toBeTruthy();
  await publishEvent(page.request, token, createdEvent.id);

  const importResponse = await page.request.post(`/api/admin/external-media/events/${createdEvent.id}/import-external`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: {
      external_path: 'picsum-demo',
      recursive: true,
    },
    failOnStatusCode: false,
  });

  if (!importResponse.ok()) {
    const bodyText = await importResponse.text();
    throw new Error(`Failed to import external media: ${importResponse.status()} ${bodyText}`);
  }
  const importBody = await importResponse.json();
  expect(importBody.imported).toBeGreaterThan(0);

  await page.request.put(`/api/admin/feedback/events/${createdEvent.id}/feedback-settings`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: {
      feedback_enabled: true,
      allow_ratings: true,
      allow_likes: true,
      allow_comments: true,
      allow_favorites: true,
      require_name_email: false,
      moderate_comments: false,
      show_feedback_to_guests: true,
    },
  });

  return {
    shareLink: createdEvent.share_link,
    slug: createdEvent.slug,
  };
}

test.describe('External media gallery behavior', () => {
  test.describe.configure({ mode: 'serial' });

  test('Maintains session and favorites after reload', async ({ page, context }) => {
    if (test.info().project.name.includes('mobile')) {
      test.skip('Mobile viewport handling requires manual verification.');
    }

    const { shareLink } = await createExternalGallery(page);

    await page.goto(shareLink);
    await passGalleryPasswordPrompt(page, GALLERY_PASSWORD);

    const tiles = page.getByTestId('grid-tile');
    await expect(tiles.first()).toBeVisible({ timeout: 20000 });

    const initialTileCount = await tiles.count();
    expect(initialTileCount).toBeGreaterThan(0);

    // Pick the first photo from the viewer's rail.
    await tiles.first().getByTestId('tile-open').click();
    const pickInViewer = page.locator('.cg-viewer-rail').getByRole('button', { name: /^(Pick|Unpick)$/ });
    await expect(pickInViewer).toBeVisible();
    if ((await pickInViewer.getAttribute('aria-pressed')) !== 'true') {
      await pickInViewer.click();
      await expect(pickInViewer).toHaveAttribute('aria-pressed', 'true');
    }
    await page.getByRole('button', { name: 'Back', exact: true }).click();

    const pickTab = page.getByRole('tab', { name: /^Pick / });
    await pickTab.click();
    await expect(tiles).toHaveCount(1, { timeout: 15000 });

    await page.reload();
    await expect(page).toHaveURL(/\/gallery\//);
    await expect(tiles.first()).toBeVisible({ timeout: 20000 });

    // The tab rides on the URL, so the reload lands on it again.
    await expect(pickTab).toHaveAttribute('aria-selected', 'true');
    await expect(tiles).toHaveCount(1, { timeout: 15000 });

    await page.getByRole('tab', { name: /^Total / }).click();
    await expect(tiles).toHaveCount(initialTileCount);

    const cookies = await context.cookies();
    expect(cookies.some((cookie) => cookie.name === 'gallery_token')).toBeTruthy();
  });
});
