/**
 * Where a downloaded photo ends up on the guest's device.
 *
 * - `photos`: iPhone and iPad. A browser download lands in the Files app, and
 *   the only way a web page reaches the Photos library is the system share
 *   sheet, whose "Save Image" action writes there.
 * - `files`: Android. Its share sheet has no save-to-gallery action, but the
 *   Downloads folder already shows up in the gallery apps, so plain files one
 *   by one beat a ZIP the phone cannot open into the gallery anyway.
 * - `archive`: everything else. A desktop keeps the ZIP.
 */
export type DeviceSaveMode = 'photos' | 'files' | 'archive';

type NavigatorLike = Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>;

const currentNavigator = (): NavigatorLike | undefined =>
  typeof navigator === 'undefined' ? undefined : navigator;

/**
 * iPadOS 13+ reports itself as a Mac in the user agent, so a touch screen on
 * "MacIntel" is what tells it apart from a real Mac.
 */
export function isIOSDevice(nav: NavigatorLike | undefined = currentNavigator()): boolean {
  if (!nav) return false;
  if (/iPad|iPhone|iPod/.test(nav.userAgent || '')) return true;
  return nav.platform === 'MacIntel' && (nav.maxTouchPoints || 0) > 1;
}

export function getDeviceSaveMode(nav: NavigatorLike | undefined = currentNavigator()): DeviceSaveMode {
  if (!nav) return 'archive';
  if (isIOSDevice(nav)) return 'photos';
  if (/Android/i.test(nav.userAgent || '')) return 'files';
  return 'archive';
}

// One share sheet holds at most this many photos. Every file sits in the
// phone's memory before the sheet opens, and iOS starts failing silently past
// about 25 files, so 20 leaves headroom.
export const PHOTOS_BATCH_SIZE = 20;
// And at most this many bytes, so a batch of large originals or videos does
// not exhaust the memory a browser tab gets on a phone.
export const PHOTOS_BATCH_BYTES = 300 * 1024 * 1024;

/**
 * Cuts the photos into consecutive batches of at most `maxCount` photos and
 * `maxBytes` bytes. A single photo larger than the byte cap still gets a batch
 * of its own rather than being dropped.
 */
export function splitIntoBatches<T extends { size?: number | null }>(
  items: T[],
  maxCount: number = PHOTOS_BATCH_SIZE,
  maxBytes: number = PHOTOS_BATCH_BYTES,
): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const item of items) {
    const size = item.size || 0;
    if (current.length > 0 && (current.length >= maxCount || bytes + size > maxBytes)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * - `shared`: the share sheet closed after the guest picked an action.
 * - `dismissed`: the guest closed the share sheet without picking anything.
 * - `needs-tap`: iOS refused because the tap that started this has expired,
 *   which happens whenever fetching the photos took a moment. Another tap
 *   opens it.
 * - `unsupported`: this browser cannot share files at all.
 */
export type ShareOutcome = 'shared' | 'dismissed' | 'needs-tap' | 'unsupported';

/**
 * Opens the system share sheet with `files`.
 *
 * Deliberately not `async`: `navigator.share` is called in the same tick as
 * the caller, so when the caller is a click handler the tap still counts as
 * the user gesture iOS demands.
 */
export function shareFiles(files: File[]): Promise<ShareOutcome> {
  if (
    typeof navigator === 'undefined'
    || typeof navigator.share !== 'function'
    || typeof navigator.canShare !== 'function'
    || !navigator.canShare({ files })
  ) {
    return Promise.resolve('unsupported');
  }
  let pending: Promise<void>;
  try {
    pending = navigator.share({ files });
  } catch {
    return Promise.resolve('unsupported');
  }
  return pending.then(
    () => 'shared' as const,
    (error: unknown) => {
      const name = (error as { name?: string } | null)?.name;
      if (name === 'AbortError') return 'dismissed' as const;
      if (name === 'NotAllowedError') return 'needs-tap' as const;
      return 'unsupported' as const;
    },
  );
}
