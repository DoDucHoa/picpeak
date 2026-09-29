import { test, expect } from '@playwright/test';
import { adminApiToken, ADMIN_EMAIL } from './_helpers/admin';

// The event page's one save bar (spec 5.2): an edit shows it, Discard
// restores, Save persists, and leaving with unsaved changes asks first.
test.describe('event Settings save bar @smoke', () => {
  test('edit, Discard, Save, and a blocked leave', async ({ page }) => {
    const token = await adminApiToken(page.request);
    const created = await page.request.post('/api/admin/events', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        event_type: 'wedding',
        event_name: `E2E save bar ${Date.now()}`,
        event_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        customer_name: 'E2E Host',
        customer_email: 'host@example.com',
        admin_email: ADMIN_EMAIL,
        password: 'PlaywrightGallery123!',
        expiration_days: 30,
        allow_downloads: true,
      },
    });
    expect(created.ok(), `create failed: ${created.status()} ${await created.text()}`).toBeTruthy();
    const { id } = await created.json();

    await page.goto(`/admin/events/${id}?tab=settings&section=details`);
    const bar = page.getByRole('region', { name: /unsaved changes/i });
    const name = page.getByPlaceholder('John Smith');
    await expect(name).toHaveValue('E2E Host');
    await expect(bar).toHaveCount(0);

    await name.fill('E2E Host Edited');
    await expect(bar).toBeVisible();
    await bar.getByRole('button', { name: /discard/i }).click();
    await expect(name).toHaveValue('E2E Host');
    await expect(bar).toHaveCount(0);

    await name.fill('E2E Host Saved');
    await bar.getByRole('button', { name: /save$/i }).click();
    await expect(bar).toHaveCount(0);
    const saved = await page.request.get(`/api/admin/events/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await saved.json()).customer_name).toBe('E2E Host Saved');

    await name.fill('Not saved');
    await page.getByRole('link', { name: /dashboard/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /stay/i }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/events/${id}`));
    await expect(name).toHaveValue('Not saved');
  });
});
