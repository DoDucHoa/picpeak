import React, { createContext, useContext } from 'react';
import type { QuotaExceededPayload } from '../services/downloadQuota.service';

/**
 * Everything a per-photo download button needs to gate itself against the
 * download-quota feature, without threading quota state through
 * PhotoGridWithLayouts, all seven layouts, and PhotoLightbox individually.
 *
 * Supplied as a context for the same reason DownloadedPhotosContext is: only
 * the download buttons care, and the gallery already holds one query's worth
 * of state for all of it. The default lets a button rendered outside a
 * gallery (or in a gallery with the allowance switched off) behave as if the
 * feature does not exist, instead of needing a provider.
 */
export interface DownloadGate {
  quotaEnabled: boolean;
  isClient: boolean;
  /** null while unlimited or the feature is off. */
  remaining: number | null;
  downloadedIds: ReadonlySet<number>;
  /** Opens the buy-more dialog directly: the same thing the header's "Get all photos" button does. */
  openQuotaOffer: (exceeded: QuotaExceededPayload | null) => void;
  /**
   * Opens the dialog for a SPECIFIC photo the client already knows is
   * blocked (predicted client-side, before any request went out), with the
   * same "N more than your allowance covers" line a server refusal would
   * have carried, built from the counters already on screen rather than
   * asking the server just to learn what it already told the badge.
   */
  offerForBlockedDownload: () => void;
  /** Tells a non-client viewer the download is client-only, without a round trip. */
  notifyGuestBlocked: () => void;
  /**
   * Reads a caught download error and, if it was a quota or role refusal,
   * shows the right UI for it (the dialog, or a toast for a blocked guest).
   * Returns whether it did, so the caller can fall back to its own generic
   * error handling otherwise.
   */
  reportDownloadFailure: (error: unknown) => Promise<boolean>;
}

const defaultGate: DownloadGate = {
  quotaEnabled: false,
  isClient: false,
  remaining: null,
  downloadedIds: new Set<number>(),
  openQuotaOffer: () => {},
  offerForBlockedDownload: () => {},
  notifyGuestBlocked: () => {},
  reportDownloadFailure: async () => false,
};

const DownloadGateContext = createContext<DownloadGate>(defaultGate);

export const DownloadGateProvider: React.FC<{
  value: DownloadGate;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <DownloadGateContext.Provider value={value}>{children}</DownloadGateContext.Provider>
);

export function useDownloadGate(): DownloadGate {
  return useContext(DownloadGateContext);
}
