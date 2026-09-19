import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { downloadQuotaService } from '../services/downloadQuota.service';
import type {
  DownloadQuotaState, DownloadPackage, DownloadOrder, DownloadQuotaResponse,
} from '../services/downloadQuota.service';

export const downloadQuotaKey = (slug?: string) => ['download-quota', slug] as const;

/**
 * Patches the quota cache in place instead of invalidating it. The server
 * only charges the allowance from the download response's
 * `res.on('finish', …)` handler: fire-and-forget, not awaited by the
 * response the caller sees. A refetch fired on success races that write and,
 * on a fast (e.g. local) round trip, routinely wins it and reads the
 * allowance BEFORE it was charged: the "badge and 'already downloaded' mark
 * only update after a manual reload" bug.
 *
 * A first version of this fix set the cache directly and then still called
 * `invalidateQueries` "to reconcile anything the patch can't predict". That
 * reintroduced the same race one line later: the triggered refetch read the
 * same not-yet-charged state and overwrote the correct optimistic value with
 * the stale one. No refetch belongs here: the caller already knows the
 * outcome of the request it just made, and whatever refetches on a different
 * signal (a quota refusal, a page load) reconciles the rest.
 */
export function markPhotosDelivered(queryClient: QueryClient, slug: string, photoIds: number[]) {
  if (photoIds.length === 0) return;
  queryClient.setQueryData<DownloadQuotaResponse | undefined>(downloadQuotaKey(slug), (old) => {
    if (!old || !old.quota.enabled) return old;
    const alreadyCounted = new Set(old.downloaded_photo_ids);
    const fresh = photoIds.filter((id) => !alreadyCounted.has(id));
    if (fresh.length === 0) return old;
    return {
      ...old,
      downloaded_photo_ids: [...old.downloaded_photo_ids, ...fresh],
      quota: {
        ...old.quota,
        used: old.quota.used + fresh.length,
        remaining: old.quota.remaining == null
          ? null
          : Math.max(0, old.quota.remaining - fresh.length),
      },
    };
  });
}

/**
 * The same patch for the bulk routes, which have no mutation of their own:
 * every "Download Selected" button calls `galleryService.downloadSelectedPhotos`
 * directly, and none of them touched the quota cache, so a client who took
 * five photos in one click kept seeing the old allowance and no "Already
 * downloaded" marks until they reloaded by hand. Exactly the bug the
 * single-photo path was fixed for, on the path that does not go through a
 * React Query mutation at all.
 *
 * It lives here rather than beside the download mutations in `useGallery.ts`
 * because importing that module drags in the `services` barrel, and with it
 * the i18n bootstrap, into every gallery layout that needs nothing but this
 * one cache write.
 *
 * The server charges only the photos whose source file it actually appended
 * to the archive, so a gallery with a missing file on disk is patched one
 * slot too generously. That divergence is bounded, self-corrects on the next
 * real read, and is strictly better than a refetch racing the ledger write.
 */
export function useMarkPhotosDelivered() {
  const queryClient = useQueryClient();
  return useCallback(
    (slug: string, photoIds: number[]) => markPhotosDelivered(queryClient, slug, photoIds),
    [queryClient],
  );
}

export interface UseDownloadQuotaResult {
  quota: DownloadQuotaState | null;
  /** Ids already delivered, as a Set so the grid can test membership per tile. */
  downloadedIds: Set<number>;
  packages: DownloadPackage[];
  pendingOrder: DownloadOrder | null;
  currency: string;
  isLoading: boolean;
  refetch: () => void;
}

/**
 * One query feeds all three client-side surfaces: the remaining-allowance
 * badge, the delivered markers on the grid, and the package list. Splitting it
 * would triple the round trips for a single screen and let the three disagree
 * with each other mid-render.
 */
export function useDownloadQuota(slug?: string): UseDownloadQuotaResult {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: downloadQuotaKey(slug),
    queryFn: () => downloadQuotaService.getQuota(slug as string),
    enabled: Boolean(slug),
    staleTime: 30 * 1000,
  });

  const downloadedIds = useMemo(
    () => new Set((data?.downloaded_photo_ids || []).map(Number)),
    [data?.downloaded_photo_ids],
  );

  return {
    quota: data?.quota ?? null,
    downloadedIds,
    packages: data?.packages ?? [],
    pendingOrder: data?.pending_order ?? null,
    currency: data?.currency ?? '',
    isLoading,
    refetch: () => { queryClient.invalidateQueries({ queryKey: downloadQuotaKey(slug) }); },
  };
}
