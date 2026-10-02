import type { Photo } from '../../../types';
import type { GalleryTab } from './urlState';

// The tabs scope to the viewer's OWN likes and picks (`is_liked` and
// `is_favorited` are computed per viewer on /photos), never to the aggregate
// counts, so a tab can never advertise a photo nobody in this browser chose.
export function tabPhotos(photos: Photo[], tab: GalleryTab): Photo[] {
  if (tab === 'liked') return photos.filter((photo) => photo.is_liked);
  if (tab === 'picked') return photos.filter((photo) => photo.is_favorited);
  return photos;
}

export function tabCounts(photos: Photo[]): { all: number; liked: number; picked: number } {
  let liked = 0; let picked = 0;
  for (const photo of photos) {
    if (photo.is_liked) liked += 1;
    if (photo.is_favorited) picked += 1;
  }
  return { all: photos.length, liked, picked };
}
