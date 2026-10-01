import { it, expect } from 'vitest';
import { tabPhotos, tabCounts } from '../state/tabs';
import type { Photo } from '../../../types';

const p = (id: number, is_liked = false, is_favorited = false) => ({ id, is_liked, is_favorited }) as Photo;
const photos = [p(1, true), p(2, false, true), p(3, true, true), p(4)];

it('filters by tab', () => {
  expect(tabPhotos(photos, 'all').map((x) => x.id)).toEqual([1, 2, 3, 4]);
  expect(tabPhotos(photos, 'liked').map((x) => x.id)).toEqual([1, 3]);
  expect(tabPhotos(photos, 'picked').map((x) => x.id)).toEqual([2, 3]);
});

it('counts the viewer\'s own likes and picks', () => {
  expect(tabCounts(photos)).toEqual({ all: 4, liked: 2, picked: 2 });
});
