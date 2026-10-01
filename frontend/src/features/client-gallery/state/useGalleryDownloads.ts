import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import { useDownloadAllPhotos } from '../../../hooks/useGallery';
import { useDownloadQuota, useRefreshDownloadQuota } from '../../../hooks/useDownloadQuota';
import { SELECTED_DOWNLOAD_LIMIT } from '../../../components/gallery/folders';
import { shouldOfferFullPackage, classifyDownloadRefusal } from '../../../components/gallery/downloadQuotaOffer';
import type { DownloadGate } from '../../../contexts/DownloadGateContext';
import type {
  DownloadOrder, DownloadPackage, QuotaExceededPayload,
} from '../../../services/downloadQuota.service';
import { galleryService } from '../../../services/gallery.service';
import { analyticsService } from '../../../services/analytics.service';
import type { DownloadResolutionChoice, GalleryData, Photo, PhotoCategory } from '../../../types';

export type QuotaOffer = { exceeded: QuotaExceededPayload | null } | null;

export interface GalleryDownloadsInput {
  slug: string;
  data: GalleryData | undefined;
  isClient: boolean;
  isExpired: boolean;
  /** What the grid shows after folder, people and sort, before the tab. */
  filteredPhotos: Photo[];
  /** What the current folder or root holds, before any filter. */
  scopedPhotos: Photo[];
  openFolder: PhotoCategory | null;
  selectedPhotos: Set<number>;
  setSelectedPhotos: (ids: Set<number>) => void;
  setIsSelectionMode: (active: boolean) => void;
  selectedPersonIds: number[];
}

export interface GalleryDownloads {
  allowDownloads: boolean;
  downloadChoices: DownloadResolutionChoice[];
  downloadStandard: string | undefined;
  isDownloadingAll: boolean;
  handleDownloadAll: () => void;
  handleDownloadSelected: () => Promise<void>;
  quota: ReturnType<typeof useDownloadQuota>['quota'];
  offerFullPackage: boolean;
  quotaOffer: QuotaOffer;
  setQuotaOffer: (v: QuotaOffer) => void;
  downloadGate: DownloadGate;
  deliveredPhotoIds: Set<number>;
  downloadPackages: DownloadPackage[];
  downloadCurrency: string;
  pendingDownloadOrder: DownloadOrder | null;
  resolutionPicker: { open: boolean; ids: number[] | null; close: () => void };
  peopleDownloadableIds: number[];
  handleDownloadPeopleFiltered: () => Promise<void>;
  folderDownloadIds: number[];
  folderDownloadTotal: number;
  folderDownloadCapped: boolean;
  handleDownloadFolder: () => Promise<void>;
}

const EMPTY_CHOICES: DownloadResolutionChoice[] = [];

/**
 * Every download path of the client gallery, and the allowance around them.
 *
 * Every bulk path ends in a quota refresh: the server claims the slots before
 * it sends a byte, so re-reading the allowance is all the browser does. It
 * never works the numbers out for itself.
 */
export function useGalleryDownloads({
  slug, data, isClient, isExpired, filteredPhotos, scopedPhotos, openFolder,
  selectedPhotos, setSelectedPhotos, setIsSelectionMode, selectedPersonIds,
}: GalleryDownloadsInput): GalleryDownloads {
  const { t } = useTranslation();
  // Download size picker (#858). `showResolutionPicker` covers "download all";
  // `resolutionPickerIds` covers a selection.
  const [showResolutionPicker, setShowResolutionPicker] = useState(false);
  const [resolutionPickerIds, setResolutionPickerIds] = useState<number[] | null>(null);

  // Data updates are handled by React Query
  const { mutate: mutateDownloadAll, isPending: isDownloadingAll } = useDownloadAllPhotos();
  const refreshDownloadQuota = useRefreshDownloadQuota();

  // Download allowance (#download-quota). One query feeds the header badge,
  // the delivered marks on the grid and the package offer below.
  const {
    quota: downloadQuota,
    downloadedIds: deliveredPhotoIds,
    packages: downloadPackages,
    pendingOrder: pendingDownloadOrder,
    currency: downloadCurrency,
    refetch: refetchDownloadQuota,
  } = useDownloadQuota(slug);

  // Open with the 402 body when a download was refused, and with null when the
  // guest opened the offer themselves from the header.
  const [quotaOffer, setQuotaOffer] = useState<QuotaOffer>(null);

  const notifyGuestBlocked = useCallback(() => {
    toast.error(
      t(
        'gallery.downloadQuota.guestBlocked',
        'Only registered clients can download photos from this gallery.',
      ),
    );
  }, [t]);

  /**
   * Turns a refused download into the package offer, or a "clients only"
   * notice for a guest the server caught. Returns false for any other
   * failure so the caller can keep its existing error path: a network error
   * must never be dressed up as a sales pitch.
   */
  const handleDownloadFailure = useCallback(async (error: unknown): Promise<boolean> => {
    const refusal = await classifyDownloadRefusal(error);
    if (!refusal) return false;
    if (refusal.kind === 'guest') {
      notifyGuestBlocked();
      return true;
    }
    // The allowance could not be read, so nothing was refused on its merits and
    // no purchase would help. Say so plainly instead of opening a sales dialog
    // for a problem the client cannot buy their way out of.
    if (refusal.kind === 'unavailable') {
      toast.error(
        t(
          'gallery.downloadQuota.unavailable',
          'Downloads are briefly unavailable. Please try again in a moment.',
        ),
      );
      return true;
    }
    setQuotaOffer({ exceeded: refusal.payload });
    // The refusal carries the server's current counters, so the badge behind
    // the dialog agrees with the dialog in front of it.
    refetchDownloadQuota();
    return true;
  }, [refetchDownloadQuota, notifyGuestBlocked, t]);

  const offerForBlockedDownload = useCallback(() => {
    // A single not-yet-delivered photo against an exhausted allowance always
    // costs exactly one slot: the same arithmetic the server's quota gate
    // would have done, just without the round trip.
    setQuotaOffer({
      exceeded: {
        code: 'DOWNLOAD_QUOTA_EXCEEDED',
        quota: {
          total: downloadQuota?.total ?? null,
          used: downloadQuota?.used ?? 0,
          remaining: downloadQuota?.remaining ?? 0,
        },
        requested_new: 1,
        missing_slots: 1,
      },
    });
  }, [downloadQuota?.total, downloadQuota?.used, downloadQuota?.remaining]);

  // Fed to every per-photo download button (grid, list, viewer) through
  // context so none of them need quota state threaded in as props.
  const downloadGate = useMemo<DownloadGate>(() => ({
    quotaEnabled: Boolean(downloadQuota?.enabled),
    isClient,
    remaining: downloadQuota?.remaining ?? null,
    downloadedIds: deliveredPhotoIds,
    openQuotaOffer: (exceeded: QuotaExceededPayload | null) => setQuotaOffer({ exceeded }),
    offerForBlockedDownload,
    notifyGuestBlocked,
    reportDownloadFailure: handleDownloadFailure,
  }), [
    downloadQuota?.enabled, downloadQuota?.remaining, isClient, deliveredPhotoIds,
    offerForBlockedDownload, notifyGuestBlocked, handleDownloadFailure,
  ]);

  // Check if downloads are allowed (both event setting and not expired)
  const allowDownloads = !isExpired && (data?.event?.allow_downloads === true);

  // Resolution picker choices (#858). More than one option means there is an
  // actual choice to make; a single option is just the standard size, so skip
  // the modal and download straight away.
  const downloadChoices = data?.event?.download_resolution?.picker_enabled
    ? (data.event.download_resolution.choices || EMPTY_CHOICES)
    : EMPTY_CHOICES;

  // Photos the gallery has not delivered yet. This, not the gallery size, is
  // what a "download all" would actually spend: a photo already handed over
  // costs nothing to take again.
  const notDeliveredCount = useMemo(() => {
    if (!data?.photos) return 0;
    return data.photos.filter((photo) => !deliveredPhotoIds.has(photo.id)).length;
  }, [data?.photos, deliveredPhotoIds]);

  // Swap the download button for the package offer only when the whole
  // gallery genuinely no longer fits. Comparing the gallery against the FREE
  // limit instead would keep selling to a client who already bought more.
  const offerFullPackage =
    Boolean(downloadQuota?.enabled) &&
    shouldOfferFullPackage(notDeliveredCount, downloadQuota?.remaining ?? null);

  const zipReady = data?.event?.download_zip_ready;
  const eventPhotoCount = data?.photos.length || 0;

  const handleDownloadAll = useCallback(() => {
    // Prevent downloads if gallery is expired or downloads disabled
    if (!allowDownloads) {
      return;
    }

    // Hand off to the picker; it builds the archive as a job and downloads it.
    if (downloadChoices.length > 1) {
      setShowResolutionPicker(true);
      return;
    }

    mutateDownloadAll(
      { slug, zipReady },
      { onError: (error) => { void handleDownloadFailure(error); } },
    );

    // Track download all action
    analyticsService.trackGalleryEvent('bulk_download', {
      gallery: slug,
      photo_count: eventPhotoCount,
      is_download_all: true
    });
  }, [allowDownloads, downloadChoices.length, mutateDownloadAll, slug, zipReady, handleDownloadFailure, eventPhotoCount]);

  const handleDownloadSelected = useCallback(async () => {
    if (selectedPhotos.size === 0) return;

    // Prevent downloads if gallery is expired or downloads disabled
    if (!allowDownloads) {
      return;
    }

    // Resolution picker (#858): a selection gets the same choice as the
    // single-photo control, rather than silently downloading at the gallery
    // standard.
    if (downloadChoices.length > 1) {
      setResolutionPickerIds(Array.from(selectedPhotos));
      return;
    }

    const selectedPhotosList = filteredPhotos.filter(p => selectedPhotos.has(p.id));

    // Track bulk download
    analyticsService.trackGalleryEvent('bulk_download', {
      gallery: slug,
      photo_count: selectedPhotos.size
    });

    // Download each selected photo
    try {
      for (const photo of selectedPhotosList) {
        await galleryService.downloadPhoto(slug, photo.id, photo.filename);
      }
      // Each photo claimed its slot before streaming, so re-read the allowance.
      refreshDownloadQuota(slug);
    } catch (error) {
      // The selection is deliberately left standing on a quota refusal: the
      // dialog asks the guest to drop photos themselves, which it cannot do
      // if the selection has already been cleared out from under them.
      if (await handleDownloadFailure(error)) return;
      throw error;
    }

    // Clear selection after download
    setSelectedPhotos(new Set());
    setIsSelectionMode(false);
  }, [
    selectedPhotos, allowDownloads, downloadChoices.length, filteredPhotos, slug,
    refreshDownloadQuota, handleDownloadFailure, setSelectedPhotos, setIsSelectionMode,
  ]);

  // "Download these N" (#1074): the payoff of the people filter.
  //
  // Deliberately NO new endpoint or person_id selector: the filtered photo
  // ids go through the same path as a manual selection, and the server
  // re-applies the access level and per-category permissions on the way
  // through. One less thing to authorize.
  //
  // Photos in a category with downloads disabled (#640) are excluded HERE as
  // well as server-side, so the number on the button is the number the guest
  // actually receives rather than an optimistic one.
  const peopleDownloadableIds = useMemo(() => {
    if (selectedPersonIds.length === 0) return [];
    return filteredPhotos
      .filter((photo) => photo.category_allow_downloads !== false)
      .map((photo) => photo.id);
  }, [filteredPhotos, selectedPersonIds]);

  const handleDownloadPeopleFiltered = useCallback(async () => {
    if (!allowDownloads || peopleDownloadableIds.length === 0) return;

    // Same resolution-picker behaviour as every other multi-photo download.
    if (downloadChoices.length > 1) {
      setResolutionPickerIds(peopleDownloadableIds);
      return;
    }

    analyticsService.trackGalleryEvent('bulk_download', {
      gallery: slug,
      photo_count: peopleDownloadableIds.length,
    });

    try {
      await galleryService.downloadSelectedPhotos(slug, peopleDownloadableIds);
      refreshDownloadQuota(slug);
    } catch (error) {
      if (await handleDownloadFailure(error)) return;
      throw error;
    }
  }, [allowDownloads, peopleDownloadableIds, downloadChoices.length, slug, refreshDownloadQuota, handleDownloadFailure]);

  // Download just the open folder (#1160). The event-wide "download all" still
  // zips the whole gallery including foldered photos; this is the "only this
  // folder, once" case. Honours the per-category opt-out (#640), so a folder
  // with allow_downloads = false offers no button at all.
  const folderDownloadableIds = useMemo(() => {
    if (!openFolder) return [];
    if (openFolder.allow_downloads === false) return [];
    // scopedPhotos, not filteredPhotos: a button that says "Download folder"
    // must not quietly hand over a filtered subset of it.
    return scopedPhotos
      .filter((photo) => photo.category_allow_downloads !== false)
      .map((photo) => photo.id);
  }, [openFolder, scopedPhotos]);

  // /download-selected caps the id list server-side, so a folder bigger than the
  // cap would deliver a truncated archive under a button promising the whole
  // thing. Send only what the server will honour, and say so on the label.
  const folderDownloadIds = useMemo(
    () => folderDownloadableIds.slice(0, SELECTED_DOWNLOAD_LIMIT),
    [folderDownloadableIds]
  );
  const folderDownloadCapped = folderDownloadableIds.length > SELECTED_DOWNLOAD_LIMIT;

  const handleDownloadFolder = useCallback(async () => {
    if (!allowDownloads || folderDownloadableIds.length === 0) return;

    // Same resolution-picker behaviour as every other multi-photo download.
    if (downloadChoices.length > 1) {
      setResolutionPickerIds(folderDownloadIds);
      return;
    }

    analyticsService.trackGalleryEvent('bulk_download', {
      gallery: slug,
      photo_count: folderDownloadIds.length,
    });

    try {
      await galleryService.downloadSelectedPhotos(slug, folderDownloadIds);
      refreshDownloadQuota(slug);
    } catch (error) {
      if (await handleDownloadFailure(error)) return;
      throw error;
    }
  }, [allowDownloads, folderDownloadableIds.length, downloadChoices.length, folderDownloadIds, slug, refreshDownloadQuota, handleDownloadFailure]);

  const closeResolutionPicker = useCallback(() => {
    setShowResolutionPicker(false);
    setResolutionPickerIds(null);
  }, []);
  const resolutionPicker = useMemo(() => ({
    open: showResolutionPicker || resolutionPickerIds !== null,
    ids: resolutionPickerIds,
    close: closeResolutionPicker,
  }), [showResolutionPicker, resolutionPickerIds, closeResolutionPicker]);

  return {
    allowDownloads, downloadChoices, downloadStandard: data?.event?.download_resolution?.standard,
    isDownloadingAll, handleDownloadAll, handleDownloadSelected,
    quota: downloadQuota, offerFullPackage, quotaOffer, setQuotaOffer,
    downloadGate, deliveredPhotoIds, downloadPackages, downloadCurrency, pendingDownloadOrder,
    resolutionPicker,
    peopleDownloadableIds, handleDownloadPeopleFiltered,
    folderDownloadIds, folderDownloadTotal: folderDownloadableIds.length, folderDownloadCapped, handleDownloadFolder,
  };
}
