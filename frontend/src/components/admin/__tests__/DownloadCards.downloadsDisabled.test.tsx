/**
 * "Allow photo downloads" in Download Protection is the master switch: with it
 * off, every download route answers 403 (backend/src/routes/gallery/downloads.js
 * gates on `event.allow_downloads` in five places). The two per-event download
 * cards knew nothing about it and stayed fully editable, so a gallery could be
 * given a 20-photo allowance, package prices and a download resolution while
 * nobody could download anything at all.
 *
 * Reported as the three controls looking like duplicates of each other. They
 * are not duplicates, they are a hierarchy, and this is what makes the
 * hierarchy visible instead of leaving it to be inferred.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, fb?: unknown) => (typeof fb === 'string' ? fb : key),
      i18n: { language: 'en' },
    }),
  };
});
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('../../../config/api', () => ({
  api: {
    get: vi.fn(async () => ({
      data: {
        overrides: { download_standard_resolution: null, download_resolution_picker_enabled: null, download_allow_original: null },
        globals: { standard: 'web', picker_enabled: false, allow_original: false, resolutions: [] },
        effective: { standard: 'web', picker_enabled: false, allow_original: false },
      },
    })),
    patch: vi.fn(async () => ({ data: {} })),
  },
}));

vi.mock('../../../services/adminDownloadQuota.service', async () => {
  const actual = await vi.importActual<any>('../../../services/adminDownloadQuota.service');
  return {
    ...actual,
    adminDownloadQuotaService: {
      getQuota: vi.fn(async () => ({
        settings: { quota_enabled: false, free_limit: null, price_per_photo: null },
        quota: { enabled: false, unlimited: false, total: 0, used: 0, remaining: 0 },
        pending_order: null,
        currency: 'CHF',
      })),
      saveQuota: vi.fn(),
      createOrderForEvent: vi.fn(),
      getAvailablePackagesForOrder: vi.fn(async () => []),
    },
  };
});

import { DownloadResolutionCard } from '../DownloadResolutionCard';
import { DownloadQuotaCard } from '../DownloadQuotaCard';

// The t() mock returns the inline English fallback, which is what these
// components pass, so the notice is matched on its text rather than its key.
import { api } from '../../../config/api';

const NOTICE = /Downloads are switched off for this gallery/;

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('per-event download cards when the gallery has downloads switched off', () => {
  it('the resolution card explains why it is inert, and makes it inert', async () => {
    renderWithClient(<DownloadResolutionCard eventId={1} downloadsDisabled />);

    await waitFor(() => expect(screen.getByText(NOTICE)).toBeInTheDocument());
    // A disabled <fieldset> disables every control it wraps, which is the
    // point: no select, no save, nothing to configure into the void.
    screen.getAllByRole('combobox').forEach((el) => expect(el).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('the allowance card does the same, including its own on-off switch', async () => {
    renderWithClient(<DownloadQuotaCard eventId={1} downloadsDisabled />);

    await waitFor(() => expect(screen.getByText(NOTICE)).toBeInTheDocument());
    screen.getAllByRole('button').forEach((el) => expect(el).toBeDisabled());
  });

  it('says nothing and stays editable on a gallery that does allow downloads', async () => {
    renderWithClient(<DownloadResolutionCard eventId={1} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    expect(screen.queryByText(NOTICE)).toBeNull();
    screen.getAllByRole('combobox').forEach((el) => expect(el).toBeEnabled());
  });
});

// On the event page both cards edit the Settings draft; the save bar sends
// them (spec 5.2), so neither card saves on its own there.
describe('per-event download cards in the event Settings draft', () => {
  it('the resolution card puts a change in the draft and has no Save of its own', async () => {
    const onDraftChange = vi.fn();
    renderWithClient(<DownloadResolutionCard eventId={1} draftValues={{}} onDraftChange={onDraftChange} />);
    const [standard] = await screen.findAllByRole('combobox');
    await userEvent.selectOptions(screen.getAllByRole('combobox')[1], 'true');
    expect(onDraftChange).toHaveBeenCalledWith('download_resolution_picker_enabled', true, null);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(api.patch).not.toHaveBeenCalled();
    void standard;
  });

  it('the resolution card shows a drafted value over the saved one', async () => {
    renderWithClient(<DownloadResolutionCard eventId={1} draftValues={{ download_allow_original: false }} onDraftChange={vi.fn()} />);
    const selects = await screen.findAllByRole('combobox');
    await waitFor(() => expect((selects[2] as HTMLSelectElement).value).toBe('false'));
  });

  it('stays inert in draft mode when downloads are off', async () => {
    renderWithClient(<DownloadResolutionCard eventId={1} downloadsDisabled draftValues={{}} onDraftChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(NOTICE)).toBeInTheDocument());
    screen.getAllByRole('combobox').forEach((el) => expect(el).toBeDisabled());
  });

  it('the allowance switches stay inert in draft mode when downloads are off', async () => {
    renderWithClient(<DownloadQuotaCard eventId={1} downloadsDisabled part="settings" draftValues={{}} onDraftChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(NOTICE)).toBeInTheDocument());
    screen.getAllByRole('switch').forEach((el) => expect(el).toBeDisabled());
  });
});
