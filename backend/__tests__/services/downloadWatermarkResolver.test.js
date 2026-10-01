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
