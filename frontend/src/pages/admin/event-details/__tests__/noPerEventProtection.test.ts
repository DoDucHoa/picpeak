/**
 * Right-click, devtools and canvas are switches in Image security for every
 * gallery. The event page must not offer per-event copies that do nothing.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const FRONTEND = path.resolve(__dirname, '../../../../..');

describe.each([
  'src/pages/admin/event-details/EventInformationCard.tsx',
  'src/pages/admin/event-details/types.ts',
  'src/pages/admin/EventDetailsPage.tsx',
])('%s', (rel) => {
  const src = fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
  it.each(['disable_right_click', 'enable_devtools_protection', 'use_canvas_rendering'])('has no per-event %s', (key) => {
    expect(src).not.toMatch(new RegExp(`\\b${key}\\b`));
  });
});

it('keeps Allow downloads on the event page until P2 moves it', () => {
  const src = fs.readFileSync(path.join(FRONTEND, 'src/pages/admin/event-details/EventInformationCard.tsx'), 'utf8');
  expect(src).toMatch(/allow_downloads/);
});
