import { describe, expect, it } from 'vitest';
import {
  canDownloadPhotoNow,
  classifyDownloadRefusal,
  formatPackageUnitPrice,
  readQuotaExceeded,
} from '../downloadQuotaOffer';
import type { DownloadPackage } from '../../../services/downloadQuota.service';

const t = (key: string, def: string, vars?: Record<string, unknown>) =>
  def.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(vars?.[name] ?? ''));

const pkg = (over: Partial<DownloadPackage> = {}): DownloadPackage => ({
  id: 1,
  kind: 'quantity',
  photo_count: 5,
  price: 3,
  name_i18n: null,
  savings_percent: 40,
  unit_price: 0.6,
  auto_label: { count: 5, price: 3, savings_percent: 40 },
  ...over,
});

const jsonError = (status: number, data: unknown) => ({ response: { status, data } });
const blobError = (status: number, data: unknown) => ({
  response: { status, data: new Blob([JSON.stringify(data)]) },
});

describe('classifyDownloadRefusal', () => {
  it('reads a plain-JSON 402 as a quota refusal', async () => {
    const payload = {
      code: 'DOWNLOAD_QUOTA_EXCEEDED',
      quota: { total: 1, used: 1, remaining: 0 },
      requested_new: 1,
      missing_slots: 1,
    };
    const refusal = await classifyDownloadRefusal(jsonError(402, payload));
    expect(refusal).toEqual({ kind: 'quota', payload });
  });

  it('reads a Blob-wrapped 402 (bulk/blob routes) as a quota refusal', async () => {
    const payload = {
      code: 'DOWNLOAD_QUOTA_EXCEEDED',
      quota: { total: 6, used: 6, remaining: 0 },
      requested_new: 1,
      missing_slots: 1,
    };
    const refusal = await classifyDownloadRefusal(blobError(402, payload));
    expect(refusal).toEqual({ kind: 'quota', payload });
  });

  it('reads a plain-JSON 403 DOWNLOAD_NOT_ALLOWED_FOR_GUEST as a guest refusal', async () => {
    const refusal = await classifyDownloadRefusal(
      jsonError(403, { code: 'DOWNLOAD_NOT_ALLOWED_FOR_GUEST' }),
    );
    expect(refusal).toEqual({ kind: 'guest' });
  });

  it('reads a Blob-wrapped 403 DOWNLOAD_NOT_ALLOWED_FOR_GUEST as a guest refusal', async () => {
    const refusal = await classifyDownloadRefusal(
      blobError(403, { code: 'DOWNLOAD_NOT_ALLOWED_FOR_GUEST' }),
    );
    expect(refusal).toEqual({ kind: 'guest' });
  });

  /**
   * The gate now fails CLOSED: when it cannot read the allowance it refuses the
   * download rather than waving it through. That refusal has to reach the
   * client as its own thing. Left unclassified it falls through to the generic
   * "download failed" toast, which tells the client to try a different photo
   * when the real answer is that nothing will work until the server recovers.
   */
  it('reads a plain-JSON 503 DOWNLOAD_QUOTA_UNAVAILABLE as a temporary outage', async () => {
    const refusal = await classifyDownloadRefusal(
      jsonError(503, { code: 'DOWNLOAD_QUOTA_UNAVAILABLE' }),
    );
    expect(refusal).toEqual({ kind: 'unavailable' });
  });

  it('reads a Blob-wrapped 503 DOWNLOAD_QUOTA_UNAVAILABLE as a temporary outage', async () => {
    const refusal = await classifyDownloadRefusal(
      blobError(503, { code: 'DOWNLOAD_QUOTA_UNAVAILABLE' }),
    );
    expect(refusal).toEqual({ kind: 'unavailable' });
  });

  it('leaves an ordinary 503 with no quota code as a generic failure', async () => {
    expect(await classifyDownloadRefusal(jsonError(503, { error: 'Bad gateway' }))).toBeNull();
  });

  it('returns null for an unrelated 403 (e.g. downloads disabled)', async () => {
    const refusal = await classifyDownloadRefusal(jsonError(403, { error: 'Downloads are disabled' }));
    expect(refusal).toBeNull();
  });

  it('returns null for a 500 or a network error', async () => {
    expect(await classifyDownloadRefusal(jsonError(500, {}))).toBeNull();
    expect(await classifyDownloadRefusal(new Error('offline'))).toBeNull();
  });
});

describe('readQuotaExceeded (back-compat narrow view)', () => {
  it('still returns the payload for a 402', async () => {
    const payload = {
      code: 'DOWNLOAD_QUOTA_EXCEEDED',
      quota: { total: 1, used: 1, remaining: 0 },
      requested_new: 1,
      missing_slots: 1,
    };
    expect(await readQuotaExceeded(jsonError(402, payload))).toEqual(payload);
  });

  it('returns null for a guest refusal: callers that only handle quota must not treat it as one', async () => {
    expect(
      await readQuotaExceeded(jsonError(403, { code: 'DOWNLOAD_NOT_ALLOWED_FOR_GUEST' })),
    ).toBeNull();
  });
});

describe('canDownloadPhotoNow', () => {
  it('is always true when the gallery has quota disabled', () => {
    expect(canDownloadPhotoNow(1, false, false, 0, new Set())).toBe(true);
  });

  it('is always true for a photo already delivered, regardless of role or remaining', () => {
    expect(canDownloadPhotoNow(1, true, false, 0, new Set([1]))).toBe(true);
  });

  it('is false for a guest on a not-yet-delivered photo once quota is enabled', () => {
    expect(canDownloadPhotoNow(1, true, false, 5, new Set())).toBe(false);
  });

  it('is true for a client with slots remaining', () => {
    expect(canDownloadPhotoNow(1, true, true, 1, new Set())).toBe(true);
  });

  it('is false for a client with nothing left', () => {
    expect(canDownloadPhotoNow(1, true, true, 0, new Set())).toBe(false);
  });

  it('is true for a client on an unlimited package (remaining === null)', () => {
    expect(canDownloadPhotoNow(1, true, true, null, new Set())).toBe(true);
  });
});

describe('formatPackageUnitPrice', () => {
  it('prints the price the backend divided out, not a locally recomputed one', () => {
    expect(formatPackageUnitPrice(pkg({ unit_price: 0.6 }), 'EUR', 'en', t)).toBe('€0.60/photo');
  });

  it('omits it for a package the backend gave no saving for', () => {
    expect(formatPackageUnitPrice(pkg({ savings_percent: null }), 'EUR', 'en', t)).toBeNull();
  });

  it('omits it for a one-photo package, where the unit price only repeats the total', () => {
    expect(
      formatPackageUnitPrice(
        pkg({ photo_count: 1, price: 1, unit_price: 1, savings_percent: 5 }),
        'EUR',
        'en',
        t,
      ),
    ).toBeNull();
  });

  it('omits it for an unlimited package, which has no unit price to show', () => {
    expect(
      formatPackageUnitPrice(
        pkg({ kind: 'unlimited', photo_count: null, unit_price: null, savings_percent: null }),
        'EUR',
        'en',
        t,
      ),
    ).toBeNull();
  });
});
