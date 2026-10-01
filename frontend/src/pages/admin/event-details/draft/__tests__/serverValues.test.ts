import { describe, expect, it } from 'vitest';
import { eventFormValues, themeValue } from '../serverValues';
import { GALLERY_THEME_PRESETS } from '../../../../../types/legacyGalleryTheme.types';
import type { Event } from '../../../../../types';

const legacy = {
  id: 1, slug: 's', event_name: 'Legacy', event_type: 'wedding', event_date: '2020-01-01',
  color_theme: null, hero_logo_visible: null, hero_logo_size: null, login_logo_visible: 0,
  allow_downloads: 1, external_watch: 0, og_image_share_enabled: 0, client_access_enabled: 0,
  header_style: 'hero', hero_divider_style: 'curve',
} as unknown as Event;

describe('eventFormValues', () => {
  it('is stable: two reads of the same event are equal', () => {
    expect(eventFormValues(legacy)).toEqual(eventFormValues(legacy));
  });
  it('keeps NULL hero logo fields as inherit', () => {
    const v = eventFormValues(legacy);
    expect(v.hero_logo_visible).toBeNull();
  });
  it('folds SQLite 0/1 into booleans', () => {
    const v = eventFormValues(legacy);
    expect(v.external_watch).toBe(false);
    expect(v.client_access_enabled).toBe(false);
  });
  it('seeds the event date and type, and reads a Postgres timestamp as its day', () => {
    const v = eventFormValues({ ...legacy, event_date: '2020-06-01T00:00:00.000Z', event_type: 'wedding' } as never);
    expect(v.event_date).toBe('2020-06-01');
    expect(v.event_type).toBe('wedding');
    expect(eventFormValues({ id: 1 } as never)).toMatchObject({ event_date: '', event_type: '' });
  });
  it('never carries a password', () => {
    const v = eventFormValues(legacy);
    expect(v.new_password).toBe('');
    expect(v.client_password).toBe('');
  });
});

describe('themeValue', () => {
  it('shows the branding theme for a NULL theme, as a custom look', () => {
    const branding = GALLERY_THEME_PRESETS.default.config;
    expect(themeValue(legacy, branding).preset).toBe('custom');
  });
  it('resolves a legacy preset name', () => {
    const name = Object.keys(GALLERY_THEME_PRESETS)[0];
    const t = themeValue({ ...legacy, color_theme: name } as Event, undefined);
    expect(t.preset).toBe(name);
  });
  it('overlays the stored header style and divider', () => {
    const t = themeValue(legacy, undefined);
    expect(t.config.headerStyle).toBe('hero');
    expect(t.config.heroDividerStyle).toBe('curve');
  });
});
