/**
 * Every bulk download has to charge the allowance cache.
 *
 * `galleryService.downloadSelectedPhotos` is called straight out of six
 * handlers, with no React Query mutation behind any of them — so the
 * optimistic patch that keeps the badge and the "Already downloaded" marks
 * honest (`useMarkPhotosDelivered`, see `useDownloadQuota.ts`) is something each
 * call site has to remember on its own. It was remembered in none of them:
 * a client who took five photos in one click saw the allowance stand still
 * until they reloaded the page by hand.
 *
 * A component test would pin one of the six. This pins all of them, which is
 * the shape the bug actually had: not a broken handler, a forgotten one.
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const SRC = path.resolve(__dirname, '../../..');

const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

const BULK_DOWNLOAD_FILES = [
  'components/gallery/GalleryView.tsx',
  'components/gallery/PhotoGrid.tsx',
  'components/gallery/PhotoGridWithLayouts.tsx',
  'components/gallery/layouts/GalleryPremiumLayout.tsx',
  'components/gallery/layouts/GalleryStoryLayout.tsx',
];

const countOf = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('bulk downloads charge the download-quota cache', () => {
  it.each(BULK_DOWNLOAD_FILES)('%s patches the allowance for every selection it sends', (file) => {
    const source = read(file);
    const sent = countOf(source, 'downloadSelectedPhotos(');
    const charged = countOf(source, 'markPhotosDelivered(');

    expect(sent).toBeGreaterThan(0);
    expect(charged).toBeGreaterThanOrEqual(sent);
  });

  it('still has no other bulk call site hiding outside the list', () => {
    const galleryDir = path.join(SRC, 'components/gallery');
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(full);
        return entry.name.endsWith('.tsx') ? [full] : [];
      });

    const callers = walk(galleryDir)
      .filter((full) => fs.readFileSync(full, 'utf8').includes('downloadSelectedPhotos('))
      .map((full) => path.relative(SRC, full).split(path.sep).join('/'));

    expect(callers.sort()).toEqual([...BULK_DOWNLOAD_FILES].sort());
  });
});
