import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../services/downloadQuota.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/downloadQuota.service')>(
    '../../services/downloadQuota.service',
  );
  return { ...actual, downloadQuotaService: { getQuota: vi.fn(), createOrder: vi.fn() } };
});

import { downloadQuotaService, asQuotaExceeded } from '../../services/downloadQuota.service';
import { useDownloadQuota } from '../useDownloadQuota';

const enabledResponse = {
  quota: {
    enabled: true, unlimited: false, freeLimit: 20, pricePerPhoto: 1,
    total: 20, used: 3, remaining: 17, enabledAt: '2026-09-15T00:00:00Z',
  },
  downloaded_photo_ids: [11, 12, 13],
  packages: [{
    id: 1, kind: 'quantity', photo_count: 20, price: 18, name_i18n: null,
    savings_percent: 10, auto_label: { count: 20, price: 18, savings_percent: 10 },
  }],
  pending_order: null,
  currency: 'EUR',
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('useDownloadQuota', () => {
  it('hands the grid a Set, so a tile can test membership without scanning an array', async () => {
    vi.mocked(downloadQuotaService.getQuota).mockResolvedValue(enabledResponse as never);

    const { result } = renderHook(() => useDownloadQuota('wedding'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.downloadedIds).toBeInstanceOf(Set);
    expect(result.current.downloadedIds.has(12)).toBe(true);
    expect(result.current.downloadedIds.has(99)).toBe(false);
  });

  it('reports a gallery with the feature off as disabled rather than failing', async () => {
    vi.mocked(downloadQuotaService.getQuota).mockResolvedValue({
      quota: {
        enabled: false, unlimited: false, freeLimit: 20, pricePerPhoto: 1,
        total: null, used: 0, remaining: null, enabledAt: null,
      },
      downloaded_photo_ids: [], packages: [], pending_order: null, currency: 'EUR',
    } as never);

    const { result } = renderHook(() => useDownloadQuota('wedding'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.quota?.enabled).toBe(false);
    expect(result.current.packages).toEqual([]);
    expect(result.current.downloadedIds.size).toBe(0);
  });

  it('does not call the API without a slug', () => {
    renderHook(() => useDownloadQuota(undefined), { wrapper });

    expect(downloadQuotaService.getQuota).not.toHaveBeenCalled();
  });
});

describe('asQuotaExceeded', () => {
  it('recognises the 402 body a download route returns', () => {
    const payload = {
      code: 'DOWNLOAD_QUOTA_EXCEEDED',
      quota: { total: 20, used: 20, remaining: 0 },
      requested_new: 30, missing_slots: 10,
    };

    expect(asQuotaExceeded({ response: { status: 402, data: payload } })).toEqual(payload);
  });

  it('ignores an ordinary failure, so a network error is never shown as a sales pitch', () => {
    expect(asQuotaExceeded({ response: { status: 500, data: {} } })).toBeNull();
    expect(asQuotaExceeded(new Error('offline'))).toBeNull();
  });

  it('ignores a 403 for a viewer who may not download at all', () => {
    expect(asQuotaExceeded({
      response: { status: 403, data: { code: 'DOWNLOAD_NOT_ALLOWED_FOR_GUEST' } },
    })).toBeNull();
  });
});
