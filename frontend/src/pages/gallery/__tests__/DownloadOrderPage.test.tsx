/**
 * The page a guest lands on after picking a package.
 *
 * It exists so that ordering is an explicit act. Creating the order from the
 * dialog, or on arrival here, would leave a photographer approving requests
 * from guests who were only reading the price, and the approval is manual.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, second?: unknown, third?: unknown) => {
        const fallback = typeof second === 'string' ? second : key;
        const vars = (typeof second === 'object' && second !== null ? second : third) as
          | Record<string, unknown>
          | undefined;
        return fallback.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
          String(vars?.[name] ?? ''),
        );
      },
      i18n: { language: 'en' },
    }),
  };
});

vi.mock('../../../services/downloadQuota.service', async () => {
  const actual = await vi.importActual<
    typeof import('../../../services/downloadQuota.service')
  >('../../../services/downloadQuota.service');
  return { ...actual, downloadQuotaService: { getQuota: vi.fn(), createOrder: vi.fn() } };
});

import { downloadQuotaService } from '../../../services/downloadQuota.service';
import { DownloadOrderPage } from '../DownloadOrderPage';

const PACKAGE = {
  id: 1,
  kind: 'quantity',
  photo_count: 20,
  price: 18,
  name_i18n: { en: 'Small bundle' },
  savings_percent: 10,
  auto_label: { count: 20, price: 18, savings_percent: 10 },
};

const quotaResponse = (over: Record<string, unknown> = {}) => ({
  quota: {
    enabled: true, unlimited: false, freeLimit: 20, pricePerPhoto: 1,
    total: 20, used: 20, remaining: 0, enabledAt: '2026-09-15T00:00:00Z',
  },
  downloaded_photo_ids: [],
  packages: [PACKAGE],
  pending_order: null,
  currency: 'EUR',
  ...over,
});

const PENDING = {
  id: 7,
  event_id: 1,
  status: 'pending',
  origin: 'client',
  requested_photo_count: 20,
  granted_photo_count: null,
  grants_unlimited: false,
  package_snapshot: null,
  reason: null,
  expires_at: null,
  created_at: '2026-09-15T00:00:00Z',
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/gallery/wedding/order?package=1']}>
        <Routes>
          <Route path="/gallery/:slug/order" element={<DownloadOrderPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(downloadQuotaService.getQuota).mockResolvedValue(quotaResponse() as never);
});

describe('DownloadOrderPage', () => {
  it('shows the package the guest picked, as the API described it', async () => {
    renderPage();

    expect(await screen.findByText('Small bundle')).toBeInTheDocument();
    expect(screen.getByText('Save 10%')).toBeInTheDocument();
  });

  it('orders nothing on arrival, so reading the price costs the guest nothing', async () => {
    const { unmount } = renderPage();
    await screen.findByText('Small bundle');

    unmount();

    expect(downloadQuotaService.createOrder).not.toHaveBeenCalled();
  });

  it('places the order only once the guest confirms, then says it is waiting', async () => {
    vi.mocked(downloadQuotaService.createOrder).mockResolvedValue(PENDING as never);
    renderPage();
    await screen.findByText('Small bundle');

    fireEvent.click(screen.getByRole('button', { name: 'Confirm order' }));

    await waitFor(() =>
      expect(downloadQuotaService.createOrder).toHaveBeenCalledWith('wedding', 1),
    );
    expect(await screen.findByTestId('order-pending')).toHaveTextContent(
      'Your order is waiting for approval',
    );
    // The guest has to be told the approval is a person, not a queue.
    expect(screen.getByTestId('order-pending')).toHaveTextContent(/photographer/i);
  });

  it('explains a 409 as an order already in flight rather than a generic failure', async () => {
    vi.mocked(downloadQuotaService.createOrder).mockRejectedValue({
      response: { status: 409, data: { code: 'PENDING_ORDER_EXISTS' } },
    });
    renderPage();
    await screen.findByText('Small bundle');

    fireEvent.click(screen.getByRole('button', { name: 'Confirm order' }));

    expect(await screen.findByTestId('order-duplicate')).toHaveTextContent(
      'You already have an order waiting for approval.',
    );
    expect(screen.queryByTestId('order-failed')).not.toBeInTheDocument();
  });

  it('reports any other failure as a failure, not as a duplicate', async () => {
    vi.mocked(downloadQuotaService.createOrder).mockRejectedValue({
      response: { status: 500, data: {} },
    });
    renderPage();
    await screen.findByText('Small bundle');

    fireEvent.click(screen.getByRole('button', { name: 'Confirm order' }));

    expect(await screen.findByTestId('order-failed')).toBeInTheDocument();
    expect(screen.queryByTestId('order-duplicate')).not.toBeInTheDocument();
  });

  it('shows the waiting state instead of the confirm button when an order is already open', async () => {
    vi.mocked(downloadQuotaService.getQuota).mockResolvedValue(
      quotaResponse({ pending_order: PENDING }) as never,
    );
    renderPage();

    expect(await screen.findByTestId('order-pending')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm order' })).not.toBeInTheDocument();
  });

  it('says so plainly when the package in the link no longer exists', async () => {
    vi.mocked(downloadQuotaService.getQuota).mockResolvedValue(
      quotaResponse({ packages: [] }) as never,
    );
    renderPage();

    expect(await screen.findByTestId('order-unknown-package')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm order' })).not.toBeInTheDocument();
  });
});
