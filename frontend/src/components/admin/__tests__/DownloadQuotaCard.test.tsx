/**
 * The free-limit field carries a distinction the UI can erase for free: an
 * empty box means "inherit the system default", while a typed 0 means "this
 * gallery grants no free download at all". Posting 0 for an empty box locks a
 * paying client out of their own gallery and nothing in the response says so,
 * which is why both directions are pinned here rather than left to review.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DownloadQuotaCard } from '../DownloadQuotaCard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, second?: unknown, third?: unknown) => {
      const fallback = typeof second === 'string' ? second : key;
      const opts = (typeof second === 'object' ? second : third) as Record<string, unknown> | undefined;
      return String(fallback).replace(/\{\{(\w+)\}\}/g, (_m, name) => String(opts?.[name] ?? ''));
    },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const get = vi.fn();
const put = vi.fn();
vi.mock('../../../config/api', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    put: (...args: unknown[]) => put(...args),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

function quotaPayload(over: Record<string, unknown> = {}) {
  return {
    quota: {
      enabled: true,
      unlimited: false,
      freeLimit: 20,
      pricePerPhoto: 1,
      total: 20,
      used: 7,
      remaining: 13,
      enabledAt: '2026-09-01T10:00:00.000Z',
    },
    settings: {
      event_id: 7,
      quota_enabled: true,
      enabled_at: '2026-09-01T10:00:00.000Z',
      free_limit: null,
      price_per_photo: null,
    },
    pending_order: null,
    currency: 'CHF',
    ...over,
  };
}

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DownloadQuotaCard eventId={7} />
    </QueryClientProvider>
  );
}

describe('DownloadQuotaCard', () => {
  beforeEach(() => {
    get.mockReset();
    put.mockReset();
    put.mockResolvedValue({ data: quotaPayload() });
  });

  it('shows how much of the allowance the gallery has already spent', async () => {
    get.mockResolvedValue({ data: quotaPayload() });

    renderCard();

    await waitFor(() => expect(screen.getByText(/7 of 20 photos delivered/)).toBeInTheDocument());
  });

  it('says the allowance is unlimited instead of inventing a total', async () => {
    get.mockResolvedValue({
      data: quotaPayload({
        quota: {
          enabled: true,
          unlimited: true,
          freeLimit: 20,
          pricePerPhoto: 1,
          total: null,
          used: 41,
          remaining: null,
          enabledAt: '2026-09-01T10:00:00.000Z',
        },
      }),
    });

    renderCard();

    await waitFor(() => expect(screen.getByText(/41 photos delivered, no limit/)).toBeInTheDocument());
    expect(screen.queryByText(/of 20 photos delivered/)).not.toBeInTheDocument();
  });

  it('switching the feature on hits the quota endpoint for this event', async () => {
    get.mockResolvedValue({
      data: quotaPayload({
        quota: { ...quotaPayload().quota, enabled: false },
        settings: { ...quotaPayload().settings, quota_enabled: false },
      }),
    });

    renderCard();

    const toggle = await screen.findByRole('switch');
    await userEvent.click(toggle);

    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put).toHaveBeenCalledWith('/admin/events/7/download-quota', { quota_enabled: true });
  });

  it('sends null for an empty free limit, because empty means inherit', async () => {
    get.mockResolvedValue({ data: quotaPayload() });

    renderCard();

    const field = await screen.findByLabelText(/Free downloads for this gallery/);
    expect(field).toHaveValue(null); // a NULL column stays visibly empty

    await userEvent.click(screen.getByRole('button', { name: /Save allowance/ }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put).toHaveBeenCalledWith('/admin/events/7/download-quota', {
      free_limit: null,
      price_per_photo: null,
    });
  });

  it('sends 0 when 0 was typed, because that forbids every free download', async () => {
    get.mockResolvedValue({ data: quotaPayload() });

    renderCard();

    const field = await screen.findByLabelText(/Free downloads for this gallery/);
    await userEvent.clear(field);
    await userEvent.type(field, '0');
    await userEvent.click(screen.getByRole('button', { name: /Save allowance/ }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put).toHaveBeenCalledWith('/admin/events/7/download-quota', {
      free_limit: 0,
      price_per_photo: null,
    });
  });

  it('keeps a saved zero visible rather than showing it as inherited', async () => {
    get.mockResolvedValue({
      data: quotaPayload({
        settings: { ...quotaPayload().settings, free_limit: 0 },
      }),
    });

    renderCard();

    const field = await screen.findByLabelText(/Free downloads for this gallery/);
    await waitFor(() => expect(field).toHaveValue(0));
  });
});
