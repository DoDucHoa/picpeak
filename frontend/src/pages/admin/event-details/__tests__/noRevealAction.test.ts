/**
 * Reveal mode and guest uploads are removed (P3, spec 5.12): the event page
 * has no "Reveal now" action, the service no longer calls the deleted route,
 * and neither the event page nor the create page offers upload settings.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const FRONTEND = path.resolve(__dirname, '../../../../..');

describe.each([
  'src/pages/admin/event-details/EventInformationCard.tsx',
  'src/pages/admin/event-details/OverviewTab.tsx',
  'src/pages/admin/EventDetailsPage.tsx',
  'src/services/events.service.ts',
  'src/pages/admin/CreateEventPage.tsx',
])('%s', (rel) => {
  const src = fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
  it('names no reveal action and no guest upload setting', () => {
    expect(src).not.toMatch(/onRevealNow|revealEvent|revealMutation|allow_user_uploads|upload_category_id|UploaderNameSettings/);
  });
});
