/**
 * Every setting has exactly one place where it is edited (spec 2, 5.1).
 * Every field the form carries is assigned to one section or declared not
 * editable, and each section's source actually names its fields.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { NOT_EDITABLE, SECTION_FIELDS, type SectionId } from '../sectionFields';
import { eventFormValues } from '../../draft/serverValues';

const FILES: Record<SectionId, string> = {
  details: 'DetailsSection.tsx', access: 'AccessSection.tsx', appearance: 'AppearanceSection.tsx',
  guests: 'GuestInteractionSection.tsx', downloads: 'DownloadsSection.tsx', advanced: 'AdvancedSection.tsx',
  extra: 'ExtraFeaturesSection.tsx',
};
// Fields a section edits through a component it renders, not in its own source.
const VIA_COMPONENT: Record<string, string> = {
  'event.client_access_enabled': 'ClientAccessCard', 'event.client_password': 'ClientAccessCard',
  'event.customer_accounts': 'CustomerAccountPicker', 'event.show_credits_to_guests': 'CreditVisibilitySetting',
  'event.hero_photo_id': 'HeroPhotoSelector',
  'event.customer_name': 'CustomerFields', 'event.customer_email': 'CustomerFields', 'event.customer_phone': 'CustomerFields',
  'event.source_mode': 'PhotoSourceFields', 'event.external_path': 'PhotoSourceFields', 'event.external_watch': 'PhotoSourceFields',
  'event.photo_cap': 'PhotoSourceFields', 'event.default_photo_sort': 'PhotoSourceFields',
};

describe('control inventory', () => {
  const assigned = Object.values(SECTION_FIELDS).flat();

  it('assigns each field once', () => {
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it('covers every field of the event form', () => {
    const keys = Object.keys(eventFormValues({ id: 1 } as never)).map((k) => `event.${k}`);
    const missing = keys.filter((k) => !assigned.includes(k) && !NOT_EDITABLE.includes(k));
    expect(missing).toEqual([]);
  });

  it.each(Object.entries(FILES))('%s edits the fields assigned to it', (id, file) => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    for (const key of SECTION_FIELDS[id as SectionId]) {
      const [part, name] = [key.slice(0, key.indexOf('.')), key.slice(key.indexOf('.') + 1)];
      if (VIA_COMPONENT[key]) expect(src, key).toMatch(new RegExp(`<${VIA_COMPONENT[key]}\\b`));
      else if (part === 'event') expect(src, key).toMatch(new RegExp(`\\b${name}\\b`));
      else if (part === 'feedback') expect(src, key).toMatch(/<FeedbackSettings\b/);
      else if (part === 'quota') expect(src, key).toMatch(/<DownloadQuotaCard\b/);
      else expect(src, key).toMatch(/<DownloadResolutionCard\b/);
    }
  });

  it('carries none of the removed guest upload and reveal fields', () => {
    const keys = Object.keys(eventFormValues({ id: 1 } as never));
    for (const removed of ['allow_user_uploads', 'upload_category_id', 'guest_name_mode', 'reveal_mode', 'reveal_at']) {
      expect(keys).not.toContain(removed);
    }
  });

  it('leaves nothing editable on the Overview', () => {
    const overview = fs.readFileSync(path.resolve(__dirname, '../../OverviewTab.tsx'), 'utf8');
    expect(overview).not.toMatch(/setEditForm|onDraftChange|mode="settings"/);
  });
});
