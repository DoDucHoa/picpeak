import { describe, expect, it } from 'vitest';
import { settingsService } from '../settings.service';

describe('formatBrandingSettings', () => {
  it('maps the hero logo position and the password page logo switch (P3)', () => {
    const out = settingsService.formatBrandingSettings({
      branding_hero_logo_position: 'bottom', branding_gallery_password_logo_visible: false,
    } as never);
    expect(out.hero_logo_position).toBe('bottom');
    expect(out.gallery_password_logo_visible).toBe(false);
  });

  it('defaults to the top and shown when the keys are missing', () => {
    const out = settingsService.formatBrandingSettings({} as never);
    expect(out.hero_logo_position).toBe('top');
    expect(out.gallery_password_logo_visible).toBe(true);
  });
});
