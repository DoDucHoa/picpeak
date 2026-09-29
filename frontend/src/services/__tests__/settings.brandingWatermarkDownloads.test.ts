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
