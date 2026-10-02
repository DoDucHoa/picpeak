import { useCallback, useSyncExternalStore } from 'react';

/**
 * Single-photo downloads in flight, and how far each has got.
 *
 * Held outside React so a download outlives the viewer that started it: the
 * guest can step to another photo or close the viewer, and coming back to the
 * photo still shows its progress. Only the button of the photo concerned
 * re-renders on a tick, never the gallery around it.
 *
 * A photo is absent while idle; present with a fraction from 0 to 1 while
 * downloading, or with null while the size is unknown.
 */
const progress = new Map<number, number | null>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function isPhotoDownloading(photoId: number): boolean {
  return progress.has(photoId);
}

export function startPhotoDownload(photoId: number) {
  progress.set(photoId, 0);
  emit();
}

/** Rounded to whole percents, so a fast download does not re-render per chunk. */
export function updatePhotoDownload(photoId: number, fraction: number | null) {
  if (!progress.has(photoId)) return;
  const next = fraction === null ? null : Math.round(fraction * 100) / 100;
  if (progress.get(photoId) === next) return;
  progress.set(photoId, next);
  emit();
}

export function finishPhotoDownload(photoId: number) {
  if (!progress.delete(photoId)) return;
  emit();
}

/** `undefined` while idle, otherwise the fraction (or null) as above. */
export function usePhotoDownloadProgress(photoId: number): number | null | undefined {
  const snapshot = useCallback(() => progress.get(photoId), [photoId]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Tests only. */
export function resetPhotoDownloads() {
  progress.clear();
  emit();
}
