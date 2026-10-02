import { createElement, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import { useDownloadQuota, useRefreshDownloadQuota } from '../../../hooks/useDownloadQuota';
import { shouldOfferFullPackage, classifyDownloadRefusal } from '../../../components/gallery/downloadQuotaOffer';
import type { DownloadGate } from '../../../contexts/DownloadGateContext';
import type {
  DownloadOrder, DownloadPackage, QuotaExceededPayload,
} from '../../../services/downloadQuota.service';
import { galleryService } from '../../../services/gallery.service';
import { analyticsService } from '../../../services/analytics.service';
import type { DownloadResolutionChoice, GalleryData } from '../../../types';
import { BundlePartsNotice } from '../toolbar/BundlePartsNotice';

export type QuotaOffer = { exceeded: QuotaExceededPayload | null } | null;

export interface GalleryDownloadsInput {
  slug: string;
  data: GalleryData | undefined;
  isClient: boolean;
  isExpired: boolean;
  selectedPhotos: Set<number>;
  setSelectedPhotos: (ids: Set<number>) => void;
  setIsSelectionMode: (active: boolean) => void;
}

export interface GalleryDownloads {
  allowDownloads: boolean;
  downloadChoices: DownloadResolutionChoice[];
  downloadStandard: string | undefined;
  handleDownloadSelected: () => Promise<void>;
  /** True from the click until every part has been handed to the browser. */
  isDownloadingSelected: boolean;
  quota: ReturnType<typeof useDownloadQuota>['quota'];
  offerFullPackage: boolean;
  quotaOffer: QuotaOffer;
  setQuotaOffer: (v: QuotaOffer) => void;
  downloadGate: DownloadGate;
  deliveredPhotoIds: Set<number>;
  downloadPackages: DownloadPackage[];
  downloadCurrency: string;
  pendingDownloadOrder: DownloadOrder | null;
  resolutionPicker: ResolutionPicker;
}

export interface ResolutionPicker {
  open: boolean;
  ids: number[] | null;
  close: () => void;
  /** Downloads `ids` at the chosen size. Reports its own failures. */
  downloadSelection: (resolution: string) => Promise<void>;
}

// The gap between two parts of a bundle. Long enough that a browser treats
// them as separate downloads rather than one burst it might block outright.
const BUNDLE_PART_GAP_MS = 1500;
const QUOTA_REREAD_DELAY_MS = 2000;

function bundlePartName(slug: string, index: number, count: number): string {
  return count > 1 ? `${slug}-selected-part${index + 1}of${count}.zip` : `${slug}-selected.zip`;
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
  slug, data, isClient, isExpired,
  selectedPhotos, setSelectedPhotos, setIsSelectionMode,
}: GalleryDownloadsInput): GalleryDownloads {
  const { t } = useTranslation();
  // Download size picker (#858), open while it holds the selection to size.
  const [resolutionPickerIds, setResolutionPickerIds] = useState<number[] | null>(null);

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

  /**
   * The catch of every bulk path. Called from void handlers, so it must never
   * rethrow. The allowance is re-read whatever happened: photos that went out
   * before the failure claimed their slots.
   */
  const failBulkDownload = useCallback(async (error: unknown) => {
    refreshDownloadQuota(slug);
    if (await handleDownloadFailure(error)) return;
    toast.error(t('gallery.downloadError', 'Some photos failed to download'));
  }, [refreshDownloadQuota, slug, handleDownloadFailure, t]);

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

  const [isDownloadingSelected, setIsDownloadingSelected] = useState(false);
  // The guard itself is a ref: two clicks in one tick both read the same
  // state, before the button has had a chance to disable.
  const downloadingRef = useRef(false);
  // Set when the size picker is closed while its parts are still going out.
  const pickerCancelledRef = useRef(false);

  /**
   * Two or more photos: plan the bundle, then hand each part to the browser.
   * Every part is probed first, because a native download cannot report a
   * refusal and would save the error body as the file. The parts follow one
   * another with a short gap; a browser that blocks the later ones still has
   * every part as a button in the toast.
   */
  const downloadBundle = useCallback(async (
    photoIds: number[],
    resolution?: string,
    isCancelled: () => boolean = () => false,
  ): Promise<boolean> => {
    const parts = await galleryService.planDownloadBundle(slug, photoIds, resolution);
    const handedOver: { href: string; name: string }[] = [];
    try {
      for (let i = 0; i < parts.length; i += 1) {
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, BUNDLE_PART_GAP_MS));
        if (isCancelled()) return false;
        await galleryService.probeBundlePart(slug, parts[i].token);
        const href = galleryService.bundlePartUrl(slug, parts[i].token);
        const name = bundlePartName(slug, i, parts.length);
        galleryService.triggerDirectDownload(href, name);
        handedOver.push({ href, name });
      }
    } finally {
      if (handedOver.length > 0) {
        // Also after a later part failed: the parts already handed over
        // claimed their slots, and their links must not be lost.
        if (parts.length > 1) {
          toast.info(createElement(BundlePartsNotice, { parts: handedOver }), { autoClose: false, closeOnClick: false });
        }
        // A native download gives no completion to await. Each part claims
        // its slots the moment the browser's request arrives, before any byte
        // is sent, so a re-read shortly after the last hand-off sees the
        // charged ledger. A browser holding the later parts behind a "multiple
        // downloads" prompt sends them only once the guest answers, which
        // they do from this tab, so the allowance is read again on its return.
        setTimeout(() => refreshDownloadQuota(slug), QUOTA_REREAD_DELAY_MS);
        if (handedOver.length > 1) {
          window.addEventListener('focus', () => refreshDownloadQuota(slug), { once: true });
        }
      }
    }
    return true;
  }, [slug, refreshDownloadQuota]);

  /**
   * The catch of the bundle path. A probe is a HEAD request, so a refusal
   * there carries no body to read the shortfall from; the offer then opens on
   * the allowance the badge already knows.
   */
  const failBundleDownload = useCallback(async (error: unknown) => {
    const status = (error as { response?: { status?: number; data?: unknown } })?.response;
    if (status?.status === 402 && !status.data) {
      setQuotaOffer({ exceeded: null });
      refetchDownloadQuota();
      return;
    }
    await failBulkDownload(error);
  }, [failBulkDownload, refetchDownloadQuota]);

  const handleDownloadSelected = useCallback(async () => {
    if (selectedPhotos.size === 0 || downloadingRef.current) return;

    // Prevent downloads if gallery is expired or downloads disabled
    if (!allowDownloads) {
      return;
    }

    const ids = Array.from(selectedPhotos);

    // Resolution picker (#858): a selection gets the same choice as the
    // single-photo control, rather than silently downloading at the gallery
    // standard. One photo is a plain file at the standard size, exactly what
    // the viewer's own button hands over.
    if (downloadChoices.length > 1 && ids.length > 1) {
      setResolutionPickerIds(ids);
      return;
    }

    analyticsService.trackGalleryEvent('bulk_download', {
      gallery: slug,
      photo_count: ids.length,
    });

    downloadingRef.current = true;
    setIsDownloadingSelected(true);
    try {
      if (ids.length === 1) {
        const photo = data?.photos.find((p) => p.id === ids[0]);
        await galleryService.downloadPhoto(slug, ids[0], photo?.filename || `photo-${ids[0]}.jpg`);
        toast.success(t('clientGallery.viewer.downloaded', 'Photo downloaded'));
        refreshDownloadQuota(slug);
      } else {
        await downloadBundle(ids);
      }
    } catch (error) {
      // The selection is deliberately left standing on any failure: the quota
      // dialog asks the guest to drop photos themselves, and after any other
      // error the same selection is what they would retry.
      await failBundleDownload(error);
      return;
    } finally {
      downloadingRef.current = false;
      setIsDownloadingSelected(false);
    }

    // Clear selection after download
    setSelectedPhotos(new Set());
    setIsSelectionMode(false);
  }, [
    selectedPhotos, allowDownloads, downloadChoices.length, slug, data?.photos,
    t, refreshDownloadQuota, downloadBundle, failBundleDownload, setSelectedPhotos, setIsSelectionMode,
  ]);

  // The picker's own download of a selection, at the size it chose.
  const downloadPickedSelection = useCallback(async (resolution: string) => {
    if (!resolutionPickerIds) return;
    pickerCancelledRef.current = false;
    let finished: boolean;
    try {
      finished = await downloadBundle(resolutionPickerIds, resolution, () => pickerCancelledRef.current);
    } catch (error) {
      await failBundleDownload(error);
      return;
    }
    // Closed half way: the guest may already be choosing something else.
    if (!finished) return;
    setSelectedPhotos(new Set());
    setIsSelectionMode(false);
  }, [resolutionPickerIds, downloadBundle, failBundleDownload, setSelectedPhotos, setIsSelectionMode]);

  const closeResolutionPicker = useCallback(() => {
    pickerCancelledRef.current = true;
    setResolutionPickerIds(null);
  }, []);
  const resolutionPicker = useMemo(() => ({
    open: resolutionPickerIds !== null,
    ids: resolutionPickerIds,
    close: closeResolutionPicker,
    downloadSelection: downloadPickedSelection,
  }), [resolutionPickerIds, closeResolutionPicker, downloadPickedSelection]);

  return {
    allowDownloads, downloadChoices, downloadStandard: data?.event?.download_resolution?.standard,
    handleDownloadSelected, isDownloadingSelected,
    quota: downloadQuota, offerFullPackage, quotaOffer, setQuotaOffer,
    downloadGate, deliveredPhotoIds, downloadPackages, downloadCurrency, pendingDownloadOrder,
    resolutionPicker,
  };
}
