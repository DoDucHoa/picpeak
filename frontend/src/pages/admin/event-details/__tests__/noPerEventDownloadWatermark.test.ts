/**
 * Downloaded files are watermarked from Branding only. The event page must
 * not offer a per-event switch that no longer does anything, nor send it.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const FRONTEND = path.resolve(__dirname, '../../../../..');

const files = [
  'src/pages/admin/event-details/EventInformationCard.tsx',
  'src/pages/admin/event-details/types.ts',
  'src/pages/admin/EventDetailsPage.tsx',
];

describe.each(files)('%s', (rel) => {
  it('has no per-event download watermark', () => {
    const src = fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
    expect(src).not.toMatch(/watermark_downloads/);
  });
});
