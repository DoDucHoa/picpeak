/**
 * useBlocker needs a data router (spec finding 16). The app used
 * <BrowserRouter>, which has none.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const app = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8');

describe('App router', () => {
  it('is a data router', () => {
    expect(app).toMatch(/createBrowserRouter\(/);
    expect(app).toMatch(/createRoutesFromElements\(/);
    expect(app).toMatch(/<RouterProvider router=\{router\} \/>/);
  });
  it('no longer uses BrowserRouter', () => {
    // Word boundary, so createBrowserRouter does not count.
    expect(app).not.toMatch(/\bBrowserRouter\b/);
  });
  it('mounts the tracker, maintenance wrapper and skip link through the root layout', () => {
    expect(app).toMatch(/<Route element=\{<RootLayout \/>\}>/);
  });
});
