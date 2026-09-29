/**
 * Devtools detection and lightbox canvas are switches in Image security,
 * live for every gallery. The protection level used to turn both on by
 * itself, which made a switch set to off not mean off.
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('protection level implies nothing about devtools or canvas', () => {
  it.each(['GalleryView.tsx', 'PhotoLightbox.tsx'])('%s enables devtools detection from its switch only', (rel) => {
    expect(read(rel)).toMatch(/const devToolsEnabled = enableDevtoolsProtection;/);
  });

  it.each(['PhotoLightbox.tsx', 'layouts/PremiumLightboxImage.tsx'])('%s draws a canvas from its switch only', (rel) => {
    expect(read(rel)).not.toMatch(/useCanvasRendering \|\| protectionLevel === 'maximum'/);
  });
});
