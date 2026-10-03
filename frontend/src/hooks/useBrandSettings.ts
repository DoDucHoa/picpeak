import { usePublicSettings } from './usePublicSettings';
import { getBootBrandSnapshot, type BrandSnapshot } from '../utils/brandSnapshot';

/**
 * The branding to paint right now: the live public settings once they have
 * loaded, otherwise the snapshot this browser kept from its last visit.
 *
 * `isBrandReady` turns true as soon as either source is available, or once
 * the settings request has failed (so a down API still shows the defaults
 * rather than a blank page). GlobalThemeProvider keeps the app invisible
 * until then, so a page reading its logo from `brand` never shows the bundled
 * PicPeak fallback in place of a logo the instance actually has.
 */
export function useBrandSettings(): { brand: BrandSnapshot | undefined; isBrandReady: boolean } {
  const { data, failureCount } = usePublicSettings();
  const brand = data ?? getBootBrandSnapshot() ?? undefined;
  return { brand, isBrandReady: Boolean(brand) || (failureCount ?? 0) > 0 };
}
