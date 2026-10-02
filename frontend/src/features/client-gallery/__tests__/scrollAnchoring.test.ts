/**
 * The gallery must opt out of scroll anchoring. With it on, a smooth scroll
 * across the point where the toolbar folds is pulled back by the fold's height
 * on every pass, and the page shakes instead of scrolling past the cover. The
 * compensating margin on the folded bar is not enough on its own: measured on
 * production on 2026-10-02, three smooth scroll gestures stalled at 900px with
 * 20 fold flips, and reached 1500px with one flip once anchoring was off.
 * jsdom has no layout, so this pins the declaration itself.
 */
import fs from 'fs';
import path from 'path';
import { it, expect } from 'vitest';

it('turns scroll anchoring off on the gallery root', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../galleryTokens.css'), 'utf8');
  const root = /\.client-gallery\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  expect(root).toMatch(/overflow-anchor:\s*none/);
});
