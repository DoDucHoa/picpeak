import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { downloadQuotaService } from '../services/downloadQuota.service';
import type {
  DownloadQuotaState, DownloadPackage, DownloadOrder,
} from '../services/downloadQuota.service';

export const downloadQuotaKey = (slug?: string) => ['download-quota', slug] as const;

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
