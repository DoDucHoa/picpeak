import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { galleryService } from '../services';
import { toast } from 'react-toastify';
import { downloadQuotaKey } from './useDownloadQuota';

/** A refusal handled at the call site (quota dialog / "clients only" toast) shouldn't also get a generic failure toast. */
function isHandledElsewhere(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 402 || status === 403;
}

export const useGalleryInfo = (slug?: string, token?: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['gallery-info', slug, token],
    queryFn: () => {
      if (!slug) {
        throw new Error('Gallery slug is required');
      }
      return galleryService.getGalleryInfo(slug, token);
    },
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: Boolean(slug) && enabled,
  });
};

export const useGalleryPhotos = (
  slug: string,
  filter?: 'liked' | 'favorited' | 'commented' | 'rated' | 'all',
  guestId?: string,
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: ['gallery-photos', slug, filter, guestId],
    // Pass guestId so backend can filter per-guest views when needed
    queryFn: ({ signal }) => galleryService.getGalleryPhotos(slug, filter, guestId, signal),
    enabled,
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
    // Add a small delay to ensure auth token is properly set
    retryDelay: 100,
  });
};

export const useGalleryStats = (slug: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['gallery-stats', slug],
    queryFn: () => galleryService.getGalleryStats(slug),
    enabled,
    retry: 1,
    staleTime: 60 * 1000, // 1 minute
  });
};

export const useDownloadPhoto = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      slug,
      photoId,
      filename,
    }: {
      slug: string;
      photoId: number;
      filename: string;
    }) => galleryService.downloadPhoto(slug, photoId, filename),
    onSuccess: (_data, variables) => {
      toast.success('Photo downloaded successfully');
      // Refreshes the remaining-allowance badge and the "Already downloaded"
      // mark, which the server already has right after this resolves —
      // without this the guest only sees either update after a manual reload.
      queryClient.invalidateQueries({ queryKey: downloadQuotaKey(variables.slug) });
    },
    onError: (error) => {
      // A refusal for role or allowance is answered at the call site (the
      // quota dialog, or a "clients only" toast) — a generic failure message
      // on top of it would tell the guest something went wrong when in fact
      // the server explained itself.
      if (isHandledElsewhere(error)) return;
      toast.error('Failed to download photo');
    },
  });
};

// Save-aware download — opens the OS share sheet on mobile (so "Save to
// Photos" lands the file in the Photos/Gallery app instead of Files),
// falls back to a regular download on browsers without Web Share file
// support. See galleryService.savePhotoToDevice for the negotiation
// (#531).
//
// Toast omitted on success because the share-sheet path doesn't really
// finish from this code's perspective — the OS UI takes over and the
// user picks where it goes. Showing "Photo downloaded" before they've
// even picked is misleading. The fallback download path is also silent
// to keep the two paths symmetrical; the file appearing in Downloads
// is its own affordance.
export const useSavePhotoToDevice = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      slug,
      photoId,
      filename,
      quotaAware,
    }: {
      slug: string;
      photoId: number;
      filename: string;
      /** Route through the observable blob path instead of a raw browser
       *  navigation — pass true whenever the gallery has the download-quota
       *  feature on, so a 402/403 can be caught instead of silently
       *  "succeeding" as a download of the error body. */
      quotaAware?: boolean;
    }) => galleryService.savePhotoToDevice(slug, photoId, filename, { quotaAware }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: downloadQuotaKey(variables.slug) });
    },
    onError: (error) => {
      if (isHandledElsewhere(error)) return;
      toast.error('Failed to save photo');
    },
  });
};

export const useDownloadAllPhotos = () => {
  return useMutation({
    mutationFn: ({ slug, zipReady }: { slug: string; zipReady?: boolean }) =>
      galleryService.downloadAllPhotos(slug, zipReady),
    onSuccess: () => {
      toast.success('Download started');
    },
    onError: (error) => {
      // A download refused for want of allowance is answered by the gallery's
      // package dialog. A generic failure toast on top of it tells the guest
      // something went wrong when in fact the server explained itself.
      if ((error as { response?: { status?: number } })?.response?.status === 402) return;
      toast.error('Failed to download photos');
    },
  });
};
