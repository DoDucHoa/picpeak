/**
 * Feedback settings have one home, Settings > Guest interaction (spec 5.1),
 * and one query key; the feedback page keeps moderation and links there.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.resolve(__dirname, '../EventFeedbackPage.tsx'), 'utf8');

describe('EventFeedbackPage', () => {
  it('no longer edits feedback settings', () => {
    expect(src).not.toMatch(/<FeedbackSettings\b/);
    expect(src).not.toMatch(/updateSettingsMutation/);
  });
  it('reads the settings under the event page key', () => {
    expect(src).not.toMatch(/\['feedback-settings', /);
    expect(src).toMatch(/\['admin-event-feedback-settings', /);
  });
  it('links to Settings > Guest interaction', () => {
    expect(src).toMatch(/tab=settings&section=guests/);
  });
});
