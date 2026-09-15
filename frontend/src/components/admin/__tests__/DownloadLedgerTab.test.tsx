/**
 * The ledger is the record of which photos have already been paid for, so it is
 * the thing a photographer checks when a client disputes a count. A blank table
 * on an empty gallery reads as a broken page, and a pager that quietly refetches
 * page one would hide the tail of a long ledger, which is exactly where a
 * dispute lives.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DownloadLedgerTab } from '../DownloadLedgerTab';

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

vi.mock('../../../hooks/useLocalizedDate', () => ({
  useLocalizedDate: () => ({
    formatDateTime: (value: string) => `formatted:${value}`,
  }),
}));

const get = vi.fn();
vi.mock('../../../config/api', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    put: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DownloadLedgerTab eventId={7} />
    </QueryClientProvider>
  );
}

describe('DownloadLedgerTab', () => {
  beforeEach(() => get.mockReset());

  it('explains an empty ledger instead of rendering a bare table', async () => {
    get.mockResolvedValue({ data: { items: [], total: 0, page: 1, limit: 50 } });

    renderTab();

    await waitFor(() =>
      expect(screen.getByText(/No photo has been downloaded from this gallery yet/)).toBeInTheDocument()
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows when each photo was first downloaded', async () => {
    get.mockResolvedValue({
      data: {
        items: [
          {
            id: 1,
            photo_id: 88,
            first_downloaded_at: '2026-09-10T08:30:00.000Z',
            access_level: 'client',
            filename: 'ceremony-001.jpg',
            thumbnail_path: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
      },
    });

    renderTab();

    await waitFor(() => expect(screen.getByText('ceremony-001.jpg')).toBeInTheDocument());
    expect(screen.getByText('formatted:2026-09-10T08:30:00.000Z')).toBeInTheDocument();
  });

  it('still lists a slot whose photo has since been deleted', async () => {
    // The ledger row deliberately outlives its photo: the slot stays spent.
    get.mockResolvedValue({
      data: {
        items: [
          {
            id: 2,
            photo_id: 91,
            first_downloaded_at: '2026-09-11T09:00:00.000Z',
            access_level: 'client',
            filename: null,
            thumbnail_path: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
      },
    });

    renderTab();

    await waitFor(() => expect(screen.getByText(/Photo deleted/)).toBeInTheDocument());
    expect(screen.getByText('#91')).toBeInTheDocument();
  });

  it('asks the server for the next page rather than re-slicing the current one', async () => {
    get.mockResolvedValue({
      data: {
        items: [
          {
            id: 3,
            photo_id: 12,
            first_downloaded_at: '2026-09-12T09:00:00.000Z',
            access_level: 'client',
            filename: 'a.jpg',
            thumbnail_path: null,
          },
        ],
        total: 120,
        page: 1,
        limit: 50,
      },
    });

    renderTab();

    await waitFor(() => expect(screen.getByText('a.jpg')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/admin/events/7/download-ledger', {
        params: { page: 2, limit: 50 },
      })
    );
  });

  it('does not offer a next page when the server has nothing more', async () => {
    get.mockResolvedValue({
      data: {
        items: [
          {
            id: 4,
            photo_id: 13,
            first_downloaded_at: '2026-09-12T09:00:00.000Z',
            access_level: 'client',
            filename: 'b.jpg',
            thumbnail_path: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
      },
    });

    renderTab();

    await waitFor(() => expect(screen.getByText('b.jpg')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
  });
});
