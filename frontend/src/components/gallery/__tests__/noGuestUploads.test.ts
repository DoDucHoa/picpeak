/**
 * Guest uploads and reveal mode are removed (event form redesign P3, spec
 * 5.12): the gallery never offers an upload and never shows the "hidden until
 * reveal" screen, whatever an old payload says.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const GALLERY = path.resolve(__dirname, '..');
const CLIENT_GALLERY = path.resolve(__dirname, '../../../features/client-gallery');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(file);
    return /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

// The client gallery, plus the old folder's barrel that still exports from it.
const SOURCES = [...walk(CLIENT_GALLERY), path.join(GALLERY, 'index.ts')];
const label = (file: string) => path.relative(path.resolve(__dirname, '../../..'), file).split(path.sep).join('/');

describe('gallery without guest uploads or reveal', () => {
  it('has no upload component or upload hook', () => {
    expect(fs.existsSync(path.join(GALLERY, 'UserPhotoUpload.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(GALLERY, 'hooks/useGalleryUpload.ts'))).toBe(false);
  });

  it('scans the client gallery itself', () => {
    expect(SOURCES.map(label)).toContain('features/client-gallery/ClientGallery.tsx');
  });

  it.each(SOURCES.map((file) => [label(file), file]))('%s names no upload control', (_name, file) => {
    expect(fs.readFileSync(file, 'utf8')).not.toMatch(/UserPhotoUpload|allow_user_uploads|allowUploads|onUploadClick|showUploadModal/);
  });

  it.each(SOURCES.map((file) => [label(file), file]))('%s never renders the reveal screen or polls for a reveal', (_name, file) => {
    expect(fs.readFileSync(file, 'utf8')).not.toMatch(/hidden_until_reveal|hiddenUntilReveal|reveal_armed|revealPending/);
  });
});
