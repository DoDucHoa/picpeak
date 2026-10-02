/**
 * Devtools detection and lightbox canvas are switches in Image security,
 * live for every gallery. The protection level used to turn both on by
 * itself, which made a switch set to off not mean off.
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const root = path.resolve(__dirname, '../../../features/client-gallery');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('protection level implies nothing about devtools or canvas', () => {
  it('the gallery controller enables devtools detection from its switch only', () => {
    expect(read('state/useGalleryController.ts')).toMatch(/const devToolsEnabled = enableDevtoolsProtection;/);
  });

  it('the gallery controller reads the canvas switch and nothing else', () => {
    expect(read('state/useGalleryController.ts')).toMatch(/const useCanvasRendering = data\?\.event\?\.use_canvas_rendering === true;/);
  });

  it.each(['state/useGalleryController.ts', 'viewer/PhotoViewer.tsx'])('%s draws a canvas from its switch only', (rel) => {
    expect(read(rel)).not.toMatch(/useCanvasRendering \|\| protectionLevel === 'maximum'/);
    expect(read(rel)).not.toMatch(/canvas \|\| .*level === 'maximum'/);
  });
});
