/**
 * Guest uploads and reveal mode are removed (event form redesign P3, spec
 * 5.12): the gallery never offers an upload and never shows the "hidden until
 * reveal" screen, whatever an old payload says.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const GALLERY = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(GALLERY, rel), 'utf8');

describe('gallery without guest uploads or reveal', () => {
  it('has no upload component or upload hook', () => {
    expect(fs.existsSync(path.join(GALLERY, 'UserPhotoUpload.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(GALLERY, 'hooks/useGalleryUpload.ts'))).toBe(false);
  });

  it.each(['GalleryView.tsx', 'GallerySidebar.tsx', 'index.ts'])('%s names no upload control', (rel) => {
    expect(read(rel)).not.toMatch(/UserPhotoUpload|allow_user_uploads|allowUploads|onUploadClick|showUploadModal/);
  });

  it('never renders the reveal screen or polls for a reveal', () => {
    expect(read('GalleryView.tsx')).not.toMatch(/hidden_until_reveal|hiddenUntilReveal|reveal_armed|revealPending/);
  });
});
