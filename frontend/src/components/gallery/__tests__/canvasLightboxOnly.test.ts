/**
 * Canvas rendering is a lightbox concern, not a tile concern.
 *
 * A canvas pins a backing store of naturalWidth × naturalHeight × 4 bytes
 * that the browser is not allowed to evict, and iOS Safari has a hard
 * budget for canvas memory that fails silently when exceeded: blank
 * tiles, no error. A gallery is hundreds of tiles and one lightbox image,
 * so the tiles, the list rows and the viewer's filmstrip render <img>
 * whatever the protection level says, and the viewer's current slide
 * follows the Image security switch.
 *
 * Source-level pin: nothing under components/gallery or features/client-gallery
 * except the viewer may hand `useCanvasRendering` to AuthenticatedImage.
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const src = path.resolve(__dirname, '../../..');
const roots = [path.join(src, 'components/gallery'), path.join(src, 'features/client-gallery')];
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(file);
    return file.endsWith('.tsx') ? [file] : [];
  });
}

describe('canvas rendering stays in the lightbox', () => {
  const files = roots.flatMap(walk);
  const viewer = path.join(src, 'features/client-gallery/viewer/PhotoViewer.tsx');

  /** The JSX props of every <AuthenticatedImage> in a file. */
  const imageProps = (source: string) =>
    source.split('<AuthenticatedImage').slice(1).map((chunk) => chunk.split('/>')[0]);

  it('only the viewer passes useCanvasRendering to AuthenticatedImage', () => {
    const offenders = files.filter((file) => file !== viewer
      && imageProps(fs.readFileSync(file, 'utf8')).some((props) => props.includes('useCanvasRendering')));
    expect(offenders.map((f) => path.relative(src, f).split(path.sep).join('/'))).toEqual([]);
    // The pin has teeth: the viewer itself is caught by the same probe.
    expect(imageProps(fs.readFileSync(viewer, 'utf8')).some((props) => props.includes('useCanvasRendering'))).toBe(true);
  });

  it('the viewer draws a canvas from the event switch', () => {
    const source = fs.readFileSync(viewer, 'utf8');
    expect(source).toMatch(/useCanvasRendering: c\.protection\.canvas/);
  });
});
