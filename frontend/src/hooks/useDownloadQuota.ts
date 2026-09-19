import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { downloadQuotaService } from '../services/downloadQuota.service';
import type {
  DownloadQuotaState, DownloadPackage, DownloadOrder,
} from '../services/downloadQuota.service';

export const downloadQuotaKey = (slug?: string) => ['download-quota', slug] as const;

/**
 * Re-read the allowance from the server after something was delivered.
 *
 * This used to patch the cache with numbers the browser worked out for itself,
 * because the server charged the ledger from the download response's
 * `res.on('finish')` handler: fire-and-forget, after the response the caller
 * was awaiting. A refetch fired on success raced that write and, on a fast
 * round trip, routinely read the allowance BEFORE it was charged.
 *
 * The slot is now claimed before the first byte goes out, so the ledger is
 * already correct by the time any download resolves and there is nothing left
 * to race. The prediction is gone with it, which matters for more than
 * tidiness: a counter the browser computes is a counter a tampered browser can
 * compute differently, and the badge the client sees now only ever carries a
 * number the server itself produced.
 */
export function useRefreshDownloadQuota() {
  const queryClient = useQueryClient();
  return useCallback(
    (slug: string) => { queryClient.invalidateQueries({ queryKey: downloadQuotaKey(slug) }); },
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
