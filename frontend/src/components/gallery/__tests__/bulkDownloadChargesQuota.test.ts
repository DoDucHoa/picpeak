/**
 * Every bulk download has to re-read the allowance afterwards.
 *
 * `galleryService.downloadSelectedPhotos` and `planDownloadBundle` are called
 * straight out of handlers, with no React Query mutation behind any of them, so
 * refreshing the allowance badge and the "Already downloaded" marks on the grid
 * tiles and list rows (`useRefreshDownloadQuota`, see
 * `useDownloadQuota.ts`) is something each call site has to remember on its
 * own. It was remembered in none of them: a client who took five photos in one
 * click saw the allowance stand still until they reloaded the page by hand.
 *
 * A component test would pin one of them. This pins all of them, which is
 * the shape the bug actually had: not a broken handler, a forgotten one.
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const SRC = path.resolve(__dirname, '../../..');

const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

const BULK_DOWNLOAD_FILES = [
  'features/client-gallery/state/useGalleryDownloads.ts',
];

// Every folder that may hold a bulk download call site. The new client gallery
// keeps its handlers in plain .ts hooks, so both extensions are scanned.
const SCANNED_DIRS = ['components/gallery', 'features/client-gallery'];

// The calls that send a selection to the server.
const BULK_CALLS = ['downloadSelectedPhotos(', 'planDownloadBundle('];

const countOf = (haystack: string, needle: string) => haystack.split(needle).length - 1;
const sendsSelection = (source: string) => BULK_CALLS.some((call) => source.includes(call));

describe('bulk downloads re-read the download quota', () => {
  it.each(BULK_DOWNLOAD_FILES)('%s re-reads the allowance for every selection it sends', (file) => {
    const source = read(file);
    const sent = BULK_CALLS.reduce((n, call) => n + countOf(source, call), 0);
    const charged = countOf(source, 'refreshDownloadQuota(');

    expect(sent).toBeGreaterThan(0);
    expect(charged).toBeGreaterThanOrEqual(sent);
  });

  it('still has no other bulk call site hiding outside the list', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(full);
        return /\.tsx?$/.test(entry.name) ? [full] : [];
      });

    const callers = SCANNED_DIRS.flatMap((dir) => walk(path.join(SRC, dir)))
      .filter((full) => sendsSelection(fs.readFileSync(full, 'utf8')))
      .map((full) => path.relative(SRC, full).split(path.sep).join('/'));

    expect(callers.sort()).toEqual([...BULK_DOWNLOAD_FILES].sort());
  });

  // Not a bulk path, but the same rule: the viewer's single-photo download
  // has to re-read it once the photo is through.
  it('re-reads the allowance after a download from the viewer', () => {
    const source = read('features/client-gallery/viewer/ViewerRail.tsx');
    expect(source).toMatch(/\.then\(\(\) => \{[^}]*refreshDownloadQuota\(slug\)/);
  });
});
