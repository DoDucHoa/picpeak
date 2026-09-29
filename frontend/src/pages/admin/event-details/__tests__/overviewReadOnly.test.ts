/**
 * The Overview is for daily use and holds no editable settings (spec 5.1);
 * edit mode is gone, and the flagged cards moved to Extra features.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const dir = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(dir, rel), 'utf8');

describe('event page without edit mode', () => {
  it.each(['OverviewTab.tsx', 'EventInformationCard.tsx', 'EventDetailsHeader.tsx', '../EventDetailsPage.tsx'])(
    '%s has no edit mode', (rel) => {
      expect(read(rel)).not.toMatch(/\bisEditing\b|\bsetIsEditing\b|handleStartEdit|handleSaveEdit/);
    },
  );
  it('the summary card writes nothing', () => {
    expect(read('EventInformationCard.tsx')).not.toMatch(/setEditForm|editForm\./);
  });
  it('the Overview no longer renders the flagged cards or the theme section', () => {
    const src = read('OverviewTab.tsx');
    for (const name of ['SlideshowSettingsCard', 'EventReminderOverrideCard', 'FaceRecognitionCard', 'EventThemeSection', 'DownloadResolutionCard']) {
      expect(src).not.toMatch(new RegExp(`<${name}\\b`));
    }
  });
  it('Extra features holds them behind their flags', () => {
    const src = read('settings/ExtraFeaturesSection.tsx');
    expect(src).toMatch(/flags\.slideshow/);
    expect(src).toMatch(/flags\.reminderEmails/);
    expect(src).toMatch(/flags\.faces/);
  });
});
