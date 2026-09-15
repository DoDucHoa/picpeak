import React, { createContext, useContext } from 'react';

/**
 * The ids this gallery has already delivered to the guest.
 *
 * Supplied as a context rather than threaded through PhotoGridWithLayouts and
 * all seven layouts: only the tile cares, and the set comes from one query the
 * gallery already holds. The default is an empty set, so a tile rendered
 * outside a gallery (or in a gallery with the allowance switched off) simply
 * carries no mark instead of needing a provider.
 */
const DownloadedPhotosContext = createContext<ReadonlySet<number>>(new Set<number>());

export const DownloadedPhotosProvider: React.FC<{
  value: ReadonlySet<number>;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <DownloadedPhotosContext.Provider value={value}>{children}</DownloadedPhotosContext.Provider>
);

export function useIsPhotoDelivered(photoId: number): boolean {
  return useContext(DownloadedPhotosContext).has(photoId);
}
