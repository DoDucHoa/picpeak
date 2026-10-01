import type { Photo } from '../../../types';
import { resolveMediaType } from '../../../components/gallery/hooks/useGalleryFiltering';
import { applyDataSaver, withWidth } from '../../../components/gallery/imageTiers';

/** Preview tiers a tile may ask for; 1920 is for the viewer only. */
const TILE_PREVIEW_WIDTHS = [640, 1280] as const;

/**
 * The uncropped rendition for a masonry tile. Thumbnails are square crops
 * (thumbnail_fit is seeded to cover), so a tile at the photo's own ratio uses
 * the aspect-preserved preview instead. One URL, not a srcset: the image is
 * fetched with the gallery bearer token by AuthenticatedImage.
 */
export function tilePreviewUrl(photo: Photo, tileCssWidth: number): string {
  const preview = photo.slideshow_url || photo.preview_url;
  if (resolveMediaType(photo) === 'video' || !preview) {
    return photo.thumbnail_url || photo.url;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const needed = Math.round(tileCssWidth * dpr);
  const tier = TILE_PREVIEW_WIDTHS.find((w) => w >= needed) ?? TILE_PREVIEW_WIDTHS[TILE_PREVIEW_WIDTHS.length - 1];
  return withWidth(preview, applyDataSaver(tier, TILE_PREVIEW_WIDTHS));
}
