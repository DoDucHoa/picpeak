import type { PublicSettings } from '../services/publicSettings.service';

/**
 * The last instance branding this browser saw, kept so the next page load
 * can paint the real logo and colours on its first frame instead of the
 * bundled PicPeak defaults it would otherwise show while /public/settings
 * is in flight.
 *
 * Only the fields needed to paint the brand are stored. The rest of the
 * public settings (feature flags, maintenance mode, reCAPTCHA) must never
 * be answered from a stale copy, so they are deliberately left out.
 *
 * This is a cache, not a source of truth: every successful fetch overwrites
 * it, and a missing or unreadable entry just means one unbranded first load.
 */
export const BRAND_SNAPSHOT_KEY = 'picpeak-brand-snapshot-v1';

const BRAND_FIELDS = [
  'theme_config',
  'branding_company_name',
  'branding_logo_url',
  'branding_logo_url_dark',
  'branding_login_logo_frame_enabled',
  'branding_login_logo_size',
  'branding_force_color_mode',
] as const;

export type BrandSnapshot = Partial<Pick<PublicSettings, (typeof BRAND_FIELDS)[number]>>;

export function saveBrandSnapshot(settings: Partial<PublicSettings> | null | undefined): void {
  if (!settings) return;
  const snapshot: BrandSnapshot = {};
  for (const field of BRAND_FIELDS) {
    if (settings[field] !== undefined) {
      (snapshot as Record<string, unknown>)[field] = settings[field];
    }
  }
  try {
    localStorage.setItem(BRAND_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* storage blocked or full: the next load is simply unbranded */
  }
}

function readBrandSnapshot(): BrandSnapshot | null {
  try {
    const raw = localStorage.getItem(BRAND_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as BrandSnapshot)
      : null;
  } catch {
    return null;
  }
}

// Read once per page load. By the time a later save lands, the live
// settings are in the query cache and every consumer prefers those.
let bootSnapshot: BrandSnapshot | null | undefined;

export function getBootBrandSnapshot(): BrandSnapshot | null {
  if (bootSnapshot === undefined) bootSnapshot = readBrandSnapshot();
  return bootSnapshot;
}

/** Test seam: forget the snapshot read at boot. */
export function resetBootBrandSnapshot(): void {
  bootSnapshot = undefined;
}
