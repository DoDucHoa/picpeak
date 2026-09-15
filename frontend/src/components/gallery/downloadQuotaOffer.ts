import { asQuotaExceeded } from '../../services/downloadQuota.service';
import type { DownloadPackage, QuotaExceededPayload } from '../../services/downloadQuota.service';

/** The `t` shape used here: key, default string, optional interpolations. */
type Translate = (key: string, defaultValue: string, vars?: Record<string, unknown>) => string;

/**
 * Compares photos NOT YET delivered against slots left, not gallery size
 * against the free limit: a client who bought more must keep the ordinary
 * button, and a gallery smaller than the allowance never sees the offer.
 */
export function shouldOfferFullPackage(
  notDownloadedCount: number,
  remaining: number | null,
): boolean {
  if (remaining === null) return false; // unlimited
  return notDownloadedCount > remaining;
}

/**
 * Reads a 402 body off a failed download, including the bulk routes.
 *
 * `asQuotaExceeded` reads `error.response.data` directly, which is right for an
 * ordinary JSON request. The gallery's bulk downloads ask axios for
 * `responseType: 'blob'`, and axios honours that for the error response too, so
 * the 402 arrives as a Blob holding the JSON rather than as the object. Left
 * unhandled the guest sees a generic failure at the exact moment the server
 * explained what it would cost to continue.
 */
export async function readQuotaExceeded(error: unknown): Promise<QuotaExceededPayload | null> {
  const response = (error as { response?: { status?: number; data?: unknown } })?.response;
  if (!response) return null;

  if (typeof Blob !== 'undefined' && response.data instanceof Blob) {
    try {
      const parsed = JSON.parse(await response.data.text());
      return asQuotaExceeded({ response: { status: response.status, data: parsed } });
    } catch {
      return null;
    }
  }

  return asQuotaExceeded(error);
}

/**
 * What to call a package on screen.
 *
 * The photographer's own name wins wherever they wrote one, in the guest's
 * language if it is there and in English otherwise, since a name half
 * translated still beats a generated one. `auto_label` is the fallback the
 * backend already sized for the package, so nothing is derived here beyond
 * picking which of the two to print.
 */
export function downloadPackageLabel(
  pkg: DownloadPackage,
  language: string,
  t: Translate,
): string {
  const names = pkg.name_i18n || {};
  const named = names[language] || names.en || Object.values(names)[0];
  if (named) return named;

  if (pkg.kind === 'unlimited' || pkg.auto_label.count === null) {
    return t('gallery.downloadQuota.autoLabelAll', 'All photos');
  }
  return t('gallery.downloadQuota.autoLabelCount', '{{count}} photos', {
    count: pkg.auto_label.count,
  });
}

/**
 * Price as text. `price` arrives as a string from Postgres numeric on some
 * routes and as a number on others, so both are accepted; an empty currency
 * (a gallery with none configured) prints the bare amount rather than throwing
 * inside Intl.
 */
export function formatPackagePrice(
  price: string | number,
  currency: string,
  language: string,
): string {
  const amount = typeof price === 'number' ? price : Number(price);
  if (!Number.isFinite(amount)) return String(price);
  if (!currency) return amount.toFixed(2);
  try {
    return new Intl.NumberFormat(language || 'en', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
