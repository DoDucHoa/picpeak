import { describe, expect, it } from 'vitest';
import {
  canDownloadPhotoNow,
  classifyDownloadRefusal,
  readQuotaExceeded,
} from '../downloadQuotaOffer';

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
