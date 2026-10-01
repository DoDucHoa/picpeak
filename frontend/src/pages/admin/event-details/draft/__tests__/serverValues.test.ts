import { describe, expect, it } from 'vitest';
import { eventFormValues } from '../serverValues';
import type { Event } from '../../../../../types';

const legacy = {
  id: 1, slug: 's', event_name: 'Legacy', event_type: 'wedding', event_date: '2020-01-01',
  hero_logo_visible: null, hero_logo_size: null, login_logo_visible: 0,
  allow_downloads: 1, external_watch: 0, og_image_share_enabled: 0, client_access_enabled: 0,
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
