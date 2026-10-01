import { describe, it, expect } from 'vitest';
import { gridGeometry, columnWidth, tileHeight, FALLBACK_RATIO } from '../layout/gridGeometry';

describe('gridGeometry', () => {
  it('uses two tight columns on a phone', () => {
    expect(gridGeometry(390)).toEqual({ columns: 2, gap: 4, padding: 6 });
  });
  it('switches to three columns at 768px', () => {
    expect(gridGeometry(767).columns).toBe(2);
    expect(gridGeometry(768)).toEqual({ columns: 3, gap: 12, padding: 60 });
  });
  it('uses four columns from 1920px', () => {
    expect(gridGeometry(1919).columns).toBe(3);
    expect(gridGeometry(1920)).toEqual({ columns: 4, gap: 12, padding: 60 });
  });
});

describe('columnWidth', () => {
  it('matches the reference at 1440px', () => {
    // 1440 minus 2 x 60 padding is 1320; three columns with two 12px gaps.
    expect(columnWidth(1320, 3, 12)).toBeCloseTo(432, 0);
  });
});

describe('tileHeight', () => {
  it('keeps the photo ratio', () => {
    expect(tileHeight({ width: 5152, height: 7728 }, 432)).toBeCloseTo(648, 0);
    expect(tileHeight({ width: 6000, height: 4000 }, 432)).toBeCloseTo(288, 0);
  });
  it('falls back to 2:3 when a dimension is missing or zero', () => {
    expect(tileHeight({ width: null, height: 3000 }, 400)).toBe(400 * FALLBACK_RATIO);
    expect(tileHeight({ width: 0, height: 0 }, 400)).toBe(400 * FALLBACK_RATIO);
    expect(tileHeight({}, 400)).toBe(400 * FALLBACK_RATIO);
  });
  it('never returns less than 1px', () => {
    expect(tileHeight({ width: 100000, height: 1 }, 400)).toBeGreaterThanOrEqual(1);
  });
});
