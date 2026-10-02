/**
 * Settings > Downloads as one settings list: the master switch on top, then
 * the allowance and the resolution, nothing behind "Show advanced options".
 * With downloads off every row below stays on screen, greyed, and the notice
 * that explains why appears once rather than once per group.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => ({
    t: (key: string, second?: unknown, third?: unknown) => {
      const fallback = typeof second === 'string' ? second : key;
      const opts = (typeof second === 'object' ? second : third) as Record<string, unknown> | undefined;
      return String(fallback).replace(/\{\{(\w+)\}\}/g, (_m, name) => String(opts?.[name] ?? ''));
    },
    i18n: { language: 'en' },
  }),
}));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../../../components/admin/PermissionGate', () => ({
  PermissionGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../../../../config/api', () => ({
  api: {
    get: vi.fn(async () => ({
      data: {
        overrides: { download_standard_resolution: null, download_resolution_picker_enabled: null, download_allow_original: null },
        globals: { standard_resolution: 'web', picker_enabled: false, allow_original: false, resolutions: [] },
        effective: { standard: 'web', picker_enabled: false, allow_original: false, choices: [] },
      },
    })),
    patch: vi.fn(),
  },
}));
vi.mock('../../../../../services/adminDownloadQuota.service', async () => ({
  ...(await vi.importActual<object>('../../../../../services/adminDownloadQuota.service')),
  adminDownloadQuotaService: {
    getQuota: vi.fn(async () => ({
      settings: { quota_enabled: true, free_limit: null, price_per_photo: null, auto_approve: false },
      quota: { enabled: true, unlimited: false, freeLimit: 20, pricePerPhoto: 1, total: 20, used: 0, remaining: 20 },
      pending_order: null,
      currency: 'CHF',
    })),
    saveQuota: vi.fn(),
    createOrderForEvent: vi.fn(),
    getAvailablePackagesForOrder: vi.fn(async () => ({ packages: [], currency: 'CHF' })),
  },
}));

import { EventSettingsContext, type EventSettingsValue } from '../EventSettingsContext';
import { DownloadsSection } from '../DownloadsSection';

const setEditForm = vi.fn();
const draftSet = vi.fn();

function mount(allowDownloads: boolean) {
  const value = {
    event: { id: 4 },
    editForm: { allow_downloads: allowDownloads },
    setEditForm,
    draft: { state: {}, count: 0, isDirty: false, set: draftSet },
    expert: false,
  } as unknown as EventSettingsValue;
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <EventSettingsContext.Provider value={value}><DownloadsSection /></EventSettingsContext.Provider>
    </QueryClientProvider>,
  );
}

const NOTICE = /Downloads are switched off for this gallery/;

beforeEach(() => vi.clearAllMocks());

describe('DownloadsSection', () => {
  it('makes "Allow photo downloads" a switch that edits the form', async () => {
    mount(true);
    const master = screen.getByRole('switch', { name: 'Allow photo downloads' });
    expect(master).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(master);
    const update = setEditForm.mock.calls[0][0] as (prev: object) => object;
    expect(update({ allow_downloads: true })).toEqual({ allow_downloads: false });
  });

  it('shows the amounts and the resolution without an advanced toggle', async () => {
    mount(true);
    expect(await screen.findByLabelText(/Free downloads for this gallery/)).toBeEnabled();
    expect(await screen.findByLabelText('Standard resolution')).toBeEnabled();
    expect(screen.queryByText('Show advanced options')).toBeNull();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('greys every row under a switched-off master and explains it once', async () => {
    mount(false);
    expect(await screen.findByLabelText(/Free downloads for this gallery/)).toBeDisabled();
    expect(await screen.findByLabelText('Standard resolution')).toBeDisabled();
    expect(screen.getByRole('switch', { name: /Limit downloads for this gallery/ })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Allow photo downloads' })).toBeEnabled();
    expect(screen.getAllByText(NOTICE)).toHaveLength(1);
  });

  it('sends a resolution change to the draft', async () => {
    mount(true);
    await userEvent.selectOptions(await screen.findByLabelText('Standard resolution'), 'original');
    expect(draftSet).toHaveBeenCalledWith('resolution', 'download_standard_resolution', 'original', null);
  });
});
