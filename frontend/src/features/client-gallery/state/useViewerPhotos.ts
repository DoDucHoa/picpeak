import { useMemo, useRef } from 'react';
import type { Photo } from '../../../types';

/**
 * The photos the viewer steps through. The order is taken from the album the
 * moment the viewer opens and held until it closes, so unliking the open
 * photo in the Like tab (or unpicking it in Pick) does not pull it out from
 * under the viewer: it stays, simply shown as unliked. The photo objects are
 * still read from the latest data, which is what makes that state visible.
 *
 * A new snapshot is taken whenever the open photo is not in the held one: a
 * deep link opens before the tab and folder have settled on it.
 */
export function useViewerPhotos(openId: number | null, visible: Photo[], all: Photo[] | undefined): Photo[] {
  const frozen = useRef<number[] | null>(null);
  // Written during render on purpose: the snapshot has to exist in the same
  // render that first shows the viewer. Idempotent for the same inputs.
  if (openId === null) frozen.current = null;
  else if (!frozen.current || !frozen.current.includes(openId)) frozen.current = visible.map((p) => p.id);
  const ids = frozen.current;

  return useMemo(() => {
    if (!ids) return visible;
    const byId = new Map((all ?? visible).map((p) => [p.id, p]));
    // A photo deleted meanwhile simply drops out.
    return ids.map((id) => byId.get(id)).filter((p): p is Photo => p !== undefined);
  }, [ids, all, visible]);
}
