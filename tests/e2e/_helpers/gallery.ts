import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { createRequire } from 'module';
import path from 'path';
import { adminApiToken, publishEvent, waitForPhotosProcessed } from './admin';

export const GALLERY_PASSWORD = process.env.GALLERY_PASSWORD || 'PlaywrightGallery123!';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';

/**
 * After opening a share link, get past the password prompt if the gallery
 * shows one. Waits for the prompt or the opened gallery first: checking for
 * the password field right after `goto` runs before the SPA has rendered
 * either, finds nothing and leaves the test on the prompt.
 */
export async function passGalleryPasswordPrompt(page: Page, password: string): Promise<void> {
  const prompt = page.getByRole('heading', { name: /Enter Gallery Password|Galerie-Passwort/i });
  // The toolbar is on every viewport and renders once the photos have loaded.
  const opened = page.getByTestId('gallery-toolbar');
  await expect(prompt.or(opened).first()).toBeVisible({ timeout: 20_000 });
  if (await prompt.isVisible()) {
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: /View Gallery|Galerie ansehen/i }).click();
    await expect(prompt).toBeHidden({ timeout: 20_000 });
  }
}

// sharp is a backend dependency; the root package only carries Playwright.
// Loaded on first use, so specs that only import the password helper run
// without backend/node_modules.
type Sharp = (input: Buffer, options?: object) => { jpeg(options: object): { toBuffer(): Promise<Buffer> } };
let sharpModule: Sharp | null = null;
function sharp(input: Buffer, options?: object) {
  sharpModule ??= createRequire(path.join(process.cwd(), 'backend', 'package.json'))('sharp') as Sharp;
  return sharpModule(input, options);
}

export interface SeedPhoto { name: string; width: number; height: number }

/**
 * A JPEG of the given size: a two-colour gradient picked from `seed`, so tiles
 * are told apart at a glance. `noisy` fills it with random pixels instead,
 * which JPEG cannot compress, for a file that weighs megabytes.
 */
export async function makeJpeg(width: number, height: number, seed: number, noisy = false): Promise<Buffer> {
  if (noisy) {
    const raw = Buffer.alloc(width * height * 3);
    for (let i = 0; i < raw.length; i += 1) raw[i] = Math.floor(Math.random() * 256);
    return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
  }
  const hue = (seed * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},45%,62%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},40%,30%)"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

/** Portrait, landscape and square in turn, so the masonry columns differ in height. */
export function mixedSizes(count: number, scale = 1): SeedPhoto[] {
  const shapes = [[400, 600], [600, 400], [500, 500], [400, 560], [640, 360]];
  return Array.from({ length: count }, (_, i) => {
    const [w, h] = shapes[i % shapes.length];
    return { name: `photo-${String(i + 1).padStart(4, '0')}.jpg`, width: Math.round(w * scale), height: Math.round(h * scale) };
  });
}

export interface SeededGallery { eventId: number; eventName: string; slug: string; shareLink: string; token: string }

interface SeedOptions {
  photos: SeedPhoto[];
  /** Random-pixel JPEGs, so the list shows sizes in MB. */
  noisy?: boolean;
  /** Feedback setting max_favorites_per_guest; null leaves picks uncapped. */
  maxPicks?: number | null;
  /** Files per upload request. */
  batchSize?: number;
  processingTimeoutMs?: number;
}

/**
 * A published gallery with likes, picks, comments and downloads on, holding
 * the given photos. Uploads go in batches, so a 2000 photo album takes a few
 * dozen requests rather than 2000.
 */
export async function seedGallery(request: APIRequestContext, options: SeedOptions): Promise<SeededGallery> {
  const { photos, noisy = false, maxPicks = null, batchSize = 50, processingTimeoutMs = 60_000 } = options;
  const token = await adminApiToken(request);
  const auth = { Authorization: `Bearer ${token}` };

  const eventName = `PW Client Gallery ${Date.now()}`;
  const created = await request.post('/api/admin/events', {
    headers: { ...auth, 'Content-Type': 'application/json' },
    data: {
      event_type: 'wedding',
      event_name: eventName,
      event_date: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      customer_name: 'Playwright Host',
      customer_email: 'host@example.com',
      admin_email: ADMIN_EMAIL,
      password: GALLERY_PASSWORD,
      expiration_days: 90,
      allow_user_uploads: false,
      allow_downloads: true,
      feedback_enabled: true,
      allow_likes: true,
      allow_favorites: true,
      allow_comments: true,
      require_name_email: false,
      moderate_comments: false,
    },
  });
  expect(created.ok(), `event create failed: ${created.status()} ${await created.text()}`).toBeTruthy();
  const event = await created.json();

  if (maxPicks !== null) {
    const res = await request.put(`/api/admin/feedback/events/${event.id}/feedback-settings`, {
      headers: { ...auth, 'Content-Type': 'application/json' },
      data: {
        feedback_enabled: true, allow_likes: true, allow_favorites: true, allow_comments: true,
        max_favorites_per_guest: maxPicks,
      },
    });
    expect(res.ok(), `feedback settings failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  }
  await publishEvent(request, token, event.id);

  for (let start = 0; start < photos.length; start += batchSize) {
    const form = new FormData();
    const batch = photos.slice(start, start + batchSize);
    for (let i = 0; i < batch.length; i += 1) {
      const p = batch[i];
      const buffer = await makeJpeg(p.width, p.height, start + i, noisy);
      form.append('photos', new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' }), p.name);
    }
    form.append('category_id', 'individual');
    const res = await request.post(`/api/admin/events/${event.id}/upload`, { headers: auth, multipart: form, timeout: 120_000 });
    expect(res.ok(), `upload failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  }
  await waitForPhotosProcessed(request, token, event.id, processingTimeoutMs);

  return { eventId: event.id, eventName, slug: event.slug, shareLink: event.share_link, token };
}

/** Open a seeded gallery as a guest and wait for the cover. */
export async function openGallery(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await passGalleryPasswordPrompt(page, GALLERY_PASSWORD);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}
