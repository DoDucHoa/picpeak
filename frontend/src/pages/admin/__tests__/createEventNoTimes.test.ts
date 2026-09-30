/**
 * Event start and end time are removed from the UI (spec 3, P3). Stored values
 * stay, and the calendar still shows them for events that have them.
 */
import fs from 'fs';
import path from 'path';
import { expect, it } from 'vitest';

it('the create page asks for no start or end time', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../CreateEventPage.tsx'), 'utf8');
  expect(src).not.toMatch(/event_time_start|event_time_end|is_full_day|TimeField/);
});
