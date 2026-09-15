/**
 * The offer shown once a download runs past the allowance.
 *
 * Two things this dialog must never do, both settled with the customer before
 * any of it was built:
 *
 *   - trim the guest's selection down to what fits. Partial delivery was
 *     rejected precisely because the system was choosing on the guest's
 *     behalf. The dialog closes and leaves the selection exactly as it was.
 *   - compute a shortfall, a price or a saving of its own. Every number here
 *     is printed from the response body, because a locally derived number is
 *     a second answer about money.
 */
import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', async () => {
  // Spread the real module: the `../common` barrel reaches ErrorBoundary,
  // which boots the i18n config and needs initReactI18next to exist.
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

import { DownloadQuotaDialog } from '../DownloadQuotaDialog';
import type {
  DownloadPackage,
  QuotaExceededPayload,
} from '../../../services/downloadQuota.service';

const EXCEEDED: QuotaExceededPayload = {
  code: 'DOWNLOAD_QUOTA_EXCEEDED',
  quota: { total: 20, used: 20, remaining: 0 },
  requested_new: 30,
  missing_slots: 10,
};

const NAMED: DownloadPackage = {
  id: 1,
  kind: 'quantity',
  photo_count: 20,
  price: 18,
  name_i18n: { en: 'Small bundle', de: 'Kleines Paket', vi: 'Gói nhỏ' },
  savings_percent: 10,
  auto_label: { count: 20, price: 18, savings_percent: 10 },
};

const UNNAMED: DownloadPackage = {
  id: 2,
  kind: 'quantity',
  photo_count: 50,
  price: 40,
  name_i18n: null,
  savings_percent: 20,
  auto_label: { count: 50, price: 40, savings_percent: 20 },
};

const UNLIMITED: DownloadPackage = {
  id: 3,
  kind: 'unlimited',
  photo_count: null,
  price: 99,
  name_i18n: null,
  savings_percent: null,
  auto_label: { count: null, price: 99, savings_percent: null },
};

function renderDialog(props: Partial<React.ComponentProps<typeof DownloadQuotaDialog>> = {}) {
  return render(
    <MemoryRouter>
      <DownloadQuotaDialog
        slug="wedding"
        exceeded={EXCEEDED}
        packages={[NAMED, UNNAMED, UNLIMITED]}
        currency="EUR"
        pendingOrder={null}
        onClose={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('DownloadQuotaDialog', () => {
  it('states the shortfall the server reported, not one it worked out itself', () => {
    renderDialog();

    // 10, from missing_slots. requested_new minus remaining happens to agree
    // here; the point is that the printed number comes off the body.
    expect(screen.getByTestId('quota-missing-slots')).toHaveTextContent(
      '10 more than your allowance covers',
    );
  });

  it('prints each package saving as the backend calculated it', () => {
    renderDialog();

    expect(screen.getByText('Save 10%')).toBeInTheDocument();
    expect(screen.getByText('Save 20%')).toBeInTheDocument();
  });

  it('omits the saving line for a package the backend gave no saving for', () => {
    renderDialog({ packages: [UNLIMITED] });

    expect(screen.queryByText(/Save/)).not.toBeInTheDocument();
  });

  it('uses the photographer name where there is one', () => {
    renderDialog({ packages: [NAMED] });

    expect(screen.getByText('Small bundle')).toBeInTheDocument();
  });

  it('falls back to the auto label for a package nobody has named', () => {
    renderDialog({ packages: [UNNAMED] });

    expect(screen.getByText('50 photos')).toBeInTheDocument();
  });

  it('labels an unnamed unlimited package as the whole gallery', () => {
    renderDialog({ packages: [UNLIMITED] });

    expect(screen.getByText('All photos')).toBeInTheDocument();
  });

  it('sends a chosen package to the order page rather than ordering on the spot', () => {
    renderDialog({ packages: [NAMED] });

    expect(screen.getByRole('link', { name: /Small bundle/ })).toHaveAttribute(
      'href',
      '/gallery/wedding/order?package=1',
    );
  });

  it('shows the pending order instead of the price list when one is already in flight', () => {
    renderDialog({
      pendingOrder: {
        id: 5,
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
      },
    });

    expect(screen.getByTestId('quota-pending-order')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Small bundle/ })).not.toBeInTheDocument();
  });

  it('leaves the guest selection untouched when they go back to adjust it', () => {
    const selection = new Set([1, 2, 3, 4]);
    const onClose = vi.fn();

    function Harness() {
      const [current] = useState(selection);
      return (
        <MemoryRouter>
          <span data-testid="selection-size">{current.size}</span>
          <DownloadQuotaDialog
            slug="wedding"
            exceeded={EXCEEDED}
            packages={[NAMED]}
            currency="EUR"
            pendingOrder={null}
            onClose={onClose}
          />
        </MemoryRouter>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Adjust my selection' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    // Same four ids, same Set: the dialog has no route to the selection at all,
    // which is the guarantee, not merely that it happened to leave it alone.
    expect(screen.getByTestId('selection-size')).toHaveTextContent('4');
    expect(selection).toEqual(new Set([1, 2, 3, 4]));
  });
});
