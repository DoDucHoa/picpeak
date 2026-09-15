/**
 * Two things here are worth a test rather than a read-through.
 *
 * The import matches on package id and silently skips an id the install does
 * not have. A plain "imported" toast over a half applied file is how a
 * photographer ends up believing every translation landed, so both counts are
 * reported, and a malformed file has to fail loudly instead of looking like a
 * success.
 *
 * The savings percentage is the backend's number. Recomputing it here would
 * create a second source of truth for a figure the client is quoted, so the
 * column shows what arrived and shows nothing when nothing arrived.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SettingsDownloadQuotaPage } from '../SettingsDownloadQuotaPage';

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

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const get = vi.fn();
const put = vi.fn();
const post = vi.fn();
vi.mock('../../../../config/api', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    put: (...args: unknown[]) => put(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));

function packagesPayload(packages: unknown[]) {
  return { data: { packages, currency: 'CHF' } };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SettingsDownloadQuotaPage />
    </QueryClientProvider>
  );
}

function jsonFile(name: string, body: string) {
  return new File([body], name, { type: 'application/json' });
}

const VALID_IMPORT = JSON.stringify({
  packages: [
    { id: 3, name: { en: '20 photos', de: '20 Fotos', vi: '20 ảnh' } },
    { id: 99, name: { en: 'Gone', de: 'Weg', vi: 'Đã xoá' } },
  ],
});

describe('SettingsDownloadQuotaPage', () => {
  beforeEach(() => {
    get.mockReset();
    put.mockReset();
    post.mockReset();
    put.mockResolvedValue({ data: { saved: 1, deactivated: 0 } });
  });

  it('shows the savings percentage the backend worked out', async () => {
    get.mockResolvedValue(
      packagesPayload([
        {
          id: 3,
          kind: 'quantity',
          photo_count: 20,
          price: '16.00',
          name_i18n: { en: '20 photos' },
          savings_percent: 20,
          auto_label: { count: 20, price: 16, savings_percent: 20 },
          sort_order: 0,
          is_active: true,
        },
      ])
    );

    renderPage();

    const row = await screen.findByTestId('download-package-3');
    expect(within(row).getByText('20%')).toBeInTheDocument();
  });

  it('leaves the savings column blank rather than inventing a percentage', async () => {
    // The global price list is scoped to no event, so the backend has no per
    // photo price to compare against and sends no savings_percent at all.
    get.mockResolvedValue(
      packagesPayload([
        {
          id: 4,
          kind: 'quantity',
          photo_count: 20,
          price: '16.00',
          name_i18n: null,
          sort_order: 0,
          is_active: true,
        },
      ])
    );

    renderPage();

    const row = await screen.findByTestId('download-package-4');
    expect(within(row).queryByText(/%/)).not.toBeInTheDocument();
  });

  it('reports what the import loaded AND what it skipped', async () => {
    get.mockResolvedValue(packagesPayload([]));
    post.mockResolvedValue({ data: { imported: 1, skipped: 1, skipped_ids: [99] } });

    renderPage();

    const input = await screen.findByLabelText(/Import package names/);
    await userEvent.upload(input, jsonFile('names.json', VALID_IMPORT));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/admin/download-packages/import', {
      packages: [
        { id: 3, name: { en: '20 photos', de: '20 Fotos', vi: '20 ảnh' } },
        { id: 99, name: { en: 'Gone', de: 'Weg', vi: 'Đã xoá' } },
      ],
    });

    await waitFor(() =>
      expect(screen.getByText(/1 name imported, 1 skipped/)).toBeInTheDocument()
    );
    expect(screen.getByText(/99/)).toBeInTheDocument();
  });

  it('refuses a file that is not JSON, and sends nothing', async () => {
    get.mockResolvedValue(packagesPayload([]));

    renderPage();

    const input = await screen.findByLabelText(/Import package names/);
    await userEvent.upload(input, jsonFile('broken.json', '{ packages: '));

    await waitFor(() =>
      expect(screen.getByText(/That file is not valid JSON/)).toBeInTheDocument()
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('refuses a file without a packages array, and says so', async () => {
    get.mockResolvedValue(packagesPayload([]));

    renderPage();

    const input = await screen.findByLabelText(/Import package names/);
    await userEvent.upload(input, jsonFile('wrong.json', JSON.stringify({ items: [] })));

    await waitFor(() =>
      expect(screen.getByText(/needs a "packages" array/)).toBeInTheDocument()
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('refuses an entry with no numeric id, naming the problem', async () => {
    get.mockResolvedValue(packagesPayload([]));

    renderPage();

    const input = await screen.findByLabelText(/Import package names/);
    await userEvent.upload(
      input,
      jsonFile('noid.json', JSON.stringify({ packages: [{ name: { en: 'x' } }] }))
    );

    await waitFor(() =>
      expect(screen.getByText(/needs a numeric "id"/)).toBeInTheDocument()
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('saves the edited price list back to the global scope', async () => {
    get.mockResolvedValue(
      packagesPayload([
        {
          id: 3,
          kind: 'quantity',
          photo_count: 20,
          price: '16.00',
          name_i18n: { en: '20 photos' },
          savings_percent: 20,
          sort_order: 0,
          is_active: true,
        },
      ])
    );

    renderPage();

    const price = await screen.findByLabelText(/Price of package 1/);
    await userEvent.clear(price);
    await userEvent.type(price, '15');
    await userEvent.click(screen.getByRole('button', { name: 'Save price list' }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put).toHaveBeenCalledWith('/admin/download-packages', {
      packages: [
        {
          id: 3,
          kind: 'quantity',
          photo_count: 20,
          price: 15,
          name_i18n: { en: '20 photos' },
          sort_order: 0,
          is_active: true,
        },
      ],
    });
  });
});
