import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tilePreviewUrl } from '../layout/tileImage';
import type { Photo } from '../../../types';

const photo = (over: Partial<Photo> = {}) => ({
  id: 1, filename: 'a.jpg', url: '/api/gallery/s/photo/1', type: 'individual',
  size: 1, uploaded_at: '2026-01-01', width: 4000, height: 6000,
  thumbnail_url: '/api/gallery/s/thumbnail/1', slideshow_url: '/api/gallery/s/preview/1',
  ...over,
}) as Photo;

const originalDpr = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');

beforeEach(() => {
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
});

afterEach(() => {
  if (originalDpr) {
    Object.defineProperty(window, 'devicePixelRatio', originalDpr);
  } else {
    delete (window as { devicePixelRatio?: number }).devicePixelRatio;
  }
});

describe('tilePreviewUrl', () => {
  it('asks for the 640 preview when it covers the tile', () => {
    expect(tilePreviewUrl(photo(), 432)).toBe('/api/gallery/s/preview/1?w=640');
  });
  it('steps up to 1280 on a dense screen', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    expect(tilePreviewUrl(photo(), 432)).toBe('/api/gallery/s/preview/1?w=1280');
  });
  it('never asks for more than 1280 for a tile', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
    expect(tilePreviewUrl(photo(), 640)).toBe('/api/gallery/s/preview/1?w=1280');
  });
  it('uses the thumbnail for a video', () => {
    expect(tilePreviewUrl(photo({ type: 'video', media_type: 'video', slideshow_url: null }), 432))
      .toBe('/api/gallery/s/thumbnail/1');
  });
  it('falls back to preview_url, then the thumbnail, then the original', () => {
    expect(tilePreviewUrl(photo({ slideshow_url: null, preview_url: '/p/1' }), 300)).toBe('/p/1?w=640');
    expect(tilePreviewUrl(photo({ slideshow_url: null, preview_url: null }), 300)).toBe('/api/gallery/s/thumbnail/1');
    expect(tilePreviewUrl(photo({ slideshow_url: null, preview_url: null, thumbnail_url: undefined }), 300))
      .toBe('/api/gallery/s/photo/1');
  });
});
