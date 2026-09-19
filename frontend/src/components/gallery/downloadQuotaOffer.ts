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

/** What a refused download turned out to be, once the body has been read. */
export type DownloadRefusal =
  | { kind: 'quota'; payload: QuotaExceededPayload }
  | { kind: 'guest' }
  /** The gate could not read the allowance and refused rather than guess. */
  | { kind: 'unavailable' };

/**
 * Reads the body off a failed download and says why it was refused, including
 * the bulk routes.
 *
 * `asQuotaExceeded` reads `error.response.data` directly, which is right for an
 * ordinary JSON request. The gallery's bulk downloads ask axios for
 * `responseType: 'blob'`, and axios honours that for the error response too, so
 * a 402/403 arrives as a Blob holding the JSON rather than as the object. Left
 * unhandled the guest sees a generic failure at the exact moment the server
 * explained what it would cost, or that it will not serve them at all, to
 * continue.
 */
export async function classifyDownloadRefusal(error: unknown): Promise<DownloadRefusal | null> {
  const response = (error as { response?: { status?: number; data?: unknown } })?.response;
  if (!response) return null;

  let status = response.status;
  let data: unknown = response.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      data = JSON.parse(await data.text());
    } catch {
      return null;
    }
  }

  const exceeded = asQuotaExceeded({ response: { status, data } });
  if (exceeded) return { kind: 'quota', payload: exceeded };

  const code = (data as { code?: string } | undefined)?.code;
  if (status === 403 && code === 'DOWNLOAD_NOT_ALLOWED_FOR_GUEST') {
    return { kind: 'guest' };
  }
  // A 503 without this code is an ordinary outage somewhere else in the stack,
  // and belongs in the generic failure toast rather than here.
  if (status === 503 && code === 'DOWNLOAD_QUOTA_UNAVAILABLE') {
    return { kind: 'unavailable' };
  }

  return null;
}

/** Back-compat narrow view for callers that only ever cared about the 402 case. */
export async function readQuotaExceeded(error: unknown): Promise<QuotaExceededPayload | null> {
  const refusal = await classifyDownloadRefusal(error);
  return refusal?.kind === 'quota' ? refusal.payload : null;
}

/**
 * True when a click on THIS photo's download button would succeed against
 * everything the client already knows, without asking the server. Mirrors the
 * same prediction the header's bulk button already makes
 * (`shouldOfferFullPackage`) so the two never disagree: a photo already
 * delivered is always free, and a non-client viewer never spends allowance
 * once the gallery has switched the feature on.
 */
export function canDownloadPhotoNow(
  photoId: number,
  quotaEnabled: boolean,
  isClient: boolean,
  remaining: number | null,
  downloadedIds: ReadonlySet<number>,
): boolean {
  if (!quotaEnabled) return true;
  if (downloadedIds.has(photoId)) return true;
  if (!isClient) return false;
  return remaining === null || remaining > 0;
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
