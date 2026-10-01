/**
 * Event start and end time are removed from the UI (spec 3, P3). Stored values
 * stay, and the calendar still shows them for events that have them.
 */
import { expect, it } from 'vitest';
import { createSources } from './createSources';

it('the create page asks for no start or end time', () => {
  expect(createSources()).not.toMatch(/event_time_start|event_time_end|is_full_day|TimeField/);
});
