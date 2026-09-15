/**
 * This page is where money changes hands, so three things are pinned rather
 * than reviewed:
 *
 *  - Approve opens PRE-FILLED with what the client actually ordered. An empty
 *    box invites a typo into the one number that decides how many photos are
 *    handed over.
 *  - Reject refuses to fire without a reason, because the client is shown it.
 *  - An order the photographer placed reads differently from one the client
 *    placed. One is a gift, the other is an invoice waiting to be sent, and
 *    confusing them means chasing the wrong person for money.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DownloadOrdersPage } from '../DownloadOrdersPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, second?: unknown, third?: unknown) => {
      const fallback = typeof second === 'string' ? second : key;
      const opts = (typeof second === 'object' ? second : third) as Record<string, unknown> | undefined;
      return String(fallback).replace(/\{\{(\w+)\}\}/g, (_m, name) => String(opts?.[name] ?? ''));
    },
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../../../hooks/useLocalizedDate', () => ({
  useLocalizedDate: () => ({ formatDateTime: (value: string) => `formatted:${value}` }),
}));

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const get = vi.fn();
const post = vi.fn();
vi.mock('../../../../config/api', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    put: vi.fn().mockResolvedValue({ data: {} }),
    post: (...args: unknown[]) => post(...args),
  },
}));

function order(over: Record<string, unknown> = {}) {
  return {
    id: 41,
    event_id: 7,
    event_name: 'Weber Wedding',
    slug: 'weber-wedding',
    status: 'pending',
    origin: 'client',
    requested_photo_count: 50,
    granted_photo_count: null,
    grants_unlimited: false,
    package_snapshot: {
      kind: 'quantity',
      photo_count: 50,
      price: 45,
      currency: 'CHF',
      name_i18n: { en: '50 photos' },
    },
    reason: null,
    expires_at: '2026-09-30T00:00:00.000Z',
    created_at: '2026-09-12T08:00:00.000Z',
    ...over,
  };
}

/** The list and the pending badge are two separate calls; both are answered here. */
function mockOrders(items: unknown[], pendingTotal = items.length) {
  get.mockImplementation((_url: unknown, config?: { params?: { limit?: number } }) => {
    if (config?.params?.limit === 1) {
      return Promise.resolve({ data: { items: [], total: pendingTotal, page: 1, limit: 1 } });
    }
    return Promise.resolve({ data: { items, total: items.length, page: 1, limit: 25 } });
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DownloadOrdersPage />
    </QueryClientProvider>
  );
}

describe('DownloadOrdersPage', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    post.mockResolvedValue({ data: order({ status: 'approved' }) });
  });

  it('counts the orders still waiting on the photographer', async () => {
    mockOrders([order()], 4);

    renderPage();

    await waitFor(() => expect(screen.getByTestId('pending-order-count')).toHaveTextContent('4'));
  });

  it('pre-fills the approve dialog with what the client ordered, and lets it be changed', async () => {
    mockOrders([order()]);

    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText(/Photos to grant/);
    expect(field).toHaveValue(50);

    await userEvent.clear(field);
    await userEvent.type(field, '60');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve order' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/admin/download-orders/41/approve', {
      granted_photo_count: 60,
    });
  });

  it('keeps the rejection locked until a reason is written', async () => {
    mockOrders([order()]);

    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));

    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Reject order' });
    expect(confirm).toBeDisabled();

    // Whitespace is not a reason: the client is shown this text.
    await userEvent.type(within(dialog).getByLabelText(/Reason/), '   ');
    expect(confirm).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Package already settled by bank transfer');
    expect(confirm).toBeEnabled();

    await userEvent.click(confirm);
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/admin/download-orders/41/reject', {
      reason: 'Package already settled by bank transfer',
    });
  });

  it('marks an order the photographer placed as a gift, not as money owed', async () => {
    mockOrders([
      order({ id: 41, origin: 'client' }),
      order({ id: 42, origin: 'photographer', event_name: 'Bauer Baptism' }),
    ]);

    renderPage();

    const clientRow = await screen.findByTestId('download-order-41');
    const ownRow = screen.getByTestId('download-order-42');

    expect(within(clientRow).getByText(/Client ordered/)).toBeInTheDocument();
    expect(within(ownRow).getByText(/You added this/)).toBeInTheDocument();
    expect(within(ownRow).queryByText(/Client ordered/)).not.toBeInTheDocument();
  });

  it('grants unlimited without asking for a count', async () => {
    mockOrders([
      order({
        grants_unlimited: true,
        requested_photo_count: null,
        package_snapshot: {
          kind: 'unlimited',
          photo_count: null,
          price: 180,
          currency: 'CHF',
          name_i18n: null,
        },
      }),
    ]);

    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText(/Photos to grant/)).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve order' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/admin/download-orders/41/approve', {});
  });

  it('shows an empty state rather than a bare table when nothing is waiting', async () => {
    mockOrders([], 0);

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/No download order matches this filter/)).toBeInTheDocument()
    );
  });

  it('asks the server for the status the photographer picked', async () => {
    mockOrders([order()], 1);

    renderPage();
    await screen.findByTestId('download-order-41');

    await userEvent.click(screen.getByRole('button', { name: 'Approved' }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/admin/download-orders', {
        params: { status: 'approved', page: 1, limit: 25 },
      })
    );
  });
});
