/**
 * The summary strip above the event Overview cards. Every number in it comes
 * from the server: the allowance is read from the quota endpoint, never
 * worked out here (the download allowance rule in CLAUDE.md). Each cell is
 * shown only when its number means something, and opens the place where that
 * number is acted on.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

const navigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')),
  useNavigate: () => navigate,
}));

let permissions: string[] = ['events.view'];
vi.mock('../../../../contexts/PermissionsContext', () => ({
  usePermissions: () => ({ hasPermission: (p: string) => permissions.includes(p) }),
}));

const getQuota = vi.fn();
vi.mock('../../../../services/adminDownloadQuota.service', () => ({
  adminDownloadQuotaService: { getQuota: (...a: unknown[]) => getQuota(...a) },
}));

import { EventSummaryStrip } from '../EventSummaryStrip';
import type { Event } from '../../../../types';

function quota(over: Record<string, unknown> = {}) {
  return {
    quota: { enabled: true, unlimited: false, freeLimit: 20, pricePerPhoto: 1, total: 20, used: 7, remaining: 13 },
    settings: { quota_enabled: true },
    pending_order: null,
    currency: 'CHF',
    ...over,
  };
}

const setActiveTab = vi.fn();
const openSettings = vi.fn();

function mount(event: Partial<Event> = {}, daysUntilExpiration: number | null = 12) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EventSummaryStrip
        event={{ id: 3, photo_count: 12, video_count: 0, allow_downloads: true, ...event } as Event}
        daysUntilExpiration={daysUntilExpiration}
        setActiveTab={setActiveTab}
        openSettings={openSettings}
      />
    </QueryClientProvider>,
  );
}

const cell = (label: string) => screen.getByText(label).closest('button') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  permissions = ['events.view'];
  getQuota.mockResolvedValue(quota());
});

describe('EventSummaryStrip', () => {
  it('counts photos only, mixed media, and video only the way the rest of the admin does', () => {
    const { unmount } = mount({ photo_count: 12 });
    expect(within(cell('Photos')).getByText('12 photos')).toBeInTheDocument();
    unmount();

    const mixed = mount({ photo_count: 143, video_count: 6 });
    expect(within(cell('Photos and videos')).getByText('137 photos · 6 videos')).toBeInTheDocument();
    mixed.unmount();

    mount({ photo_count: 40, video_count: 40 });
    expect(within(cell('Photos and videos')).getByText('40 videos')).toBeInTheDocument();
  });

  it('shows the allowance exactly as the server reports it', async () => {
    mount();
    expect(await screen.findByText('7 of 20')).toBeInTheDocument();
    expect(getQuota).toHaveBeenCalledWith(3);
  });

  it('says no limit for an unlimited allowance instead of inventing a total', async () => {
    getQuota.mockResolvedValue(quota({ quota: { ...quota().quota, unlimited: true, total: null, used: 41 } }));
    mount();
    expect(await screen.findByText('41, no limit')).toBeInTheDocument();
  });

  it('hides the allowance while downloads are off or not limited', async () => {
    // A waiting order in the same response proves the data has arrived, so
    // the missing cell is a decision and not a fetch still in flight.
    getQuota.mockResolvedValue(quota({ pending_order: { id: 9 } }));
    const off = mount({ allow_downloads: false });
    await screen.findByText('Waiting for approval');
    expect(screen.queryByText('Downloads used')).toBeNull();
    off.unmount();

    getQuota.mockResolvedValue(quota({ settings: { quota_enabled: false }, pending_order: { id: 9 } }));
    mount();
    await screen.findByText('Waiting for approval');
    expect(screen.queryByText('Downloads used')).toBeNull();
  });

  it('never asks for the allowance without the permission to read it', () => {
    permissions = [];
    mount();
    expect(getQuota).not.toHaveBeenCalled();
    expect(screen.queryByText('Downloads used')).toBeNull();
  });

  it('counts down to expiry, warns inside a week, and says when it has passed', () => {
    const later = mount({}, 12);
    expect(within(cell('Expires')).getByText('12 days left').className).not.toMatch(/amber|red/);
    later.unmount();

    const soon = mount({}, 3);
    expect(within(cell('Expires')).getByText('3 days left').className).toMatch(/amber/);
    soon.unmount();

    const gone = mount({}, 0);
    expect(within(cell('Expires')).getByText('Expired').className).toMatch(/red/);
    gone.unmount();

    mount({}, null);
    expect(within(cell('Expires')).getByText('Never')).toBeInTheDocument();
  });

  it('shows a waiting order only while there is one, and opens the order queue', async () => {
    const none = mount();
    await screen.findByText('7 of 20');
    expect(screen.queryByText('Download order')).toBeNull();
    none.unmount();

    getQuota.mockResolvedValue(quota({ pending_order: { id: 9 } }));
    mount();
    await userEvent.click(await screen.findByText('Waiting for approval'));
    expect(navigate).toHaveBeenCalledWith('/admin/download-orders');
  });

  it('opens the place each number is acted on', async () => {
    mount();
    await userEvent.click(cell('Photos'));
    expect(setActiveTab).toHaveBeenCalledWith('photos');
    await userEvent.click(await screen.findByText('7 of 20'));
    expect(openSettings).toHaveBeenCalledWith('downloads');
    await userEvent.click(cell('Expires'));
    expect(openSettings).toHaveBeenCalledWith('details');
  });
});
