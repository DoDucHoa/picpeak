/**
 * A refused bulk download must leave the selection alone.
 *
 * The quota dialog that a 402 raises says, in as many words, "Adjust my
 * selection": go back and pick fewer photos. Clearing the selection was in a
 * `finally`, so by the time the client read that sentence every photo had
 * already been unpicked and the whole selection had to be built again from
 * scratch. Reported from the gallery: "nó lại deselect hết những ảnh tôi đã
 * chọn làm cho tôi phải chọn lại".
 *
 * The download button is the probe: it renders only while something is
 * selected, so its presence after a refusal means the selection survived, and
 * its absence after a success means the selection was cleared as it should be.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Photo } from '../../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const downloadSelectedPhotos = vi.fn();
vi.mock('../../../services/gallery.service', () => ({
  galleryService: { downloadSelectedPhotos: (...a: unknown[]) => downloadSelectedPhotos(...a) },
}));
vi.mock('../../../services/analytics.service', () => ({
  analyticsService: { trackGalleryEvent: vi.fn(), trackDownload: vi.fn() },
}));

vi.mock('../../../hooks/useGallery', () => ({ useDownloadPhoto: () => ({ mutate: vi.fn() }) }));
const refreshDownloadQuota = vi.fn();
vi.mock('../../../hooks/useDownloadQuota', () => ({
  useRefreshDownloadQuota: () => refreshDownloadQuota,
}));

const reportDownloadFailure = vi.fn().mockResolvedValue(true);
vi.mock('../../../contexts/DownloadGateContext', () => ({
  useDownloadGate: () => ({
    quotaEnabled: true,
    isClient: true,
    remaining: 1,
    downloadedIds: new Set<number>(),
    openQuotaOffer: vi.fn(),
    offerForBlockedDownload: vi.fn(),
    notifyGuestBlocked: vi.fn(),
    reportDownloadFailure,
  }),
}));

vi.mock('../../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: {} }) }));

vi.mock('../../common', () => ({
  Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

// The layouts render the tiles; this test drives the selection through the
// toolbar that PhotoGridWithLayouts owns, so they can all be inert.
vi.mock('../layouts', () => {
  const layoutStub = () => <div data-testid="layout" />;
  return {
    GridGalleryLayout: layoutStub,
    MasonryGalleryLayout: layoutStub,
    CarouselGalleryLayout: layoutStub,
    TimelineGalleryLayout: layoutStub,
    MosaicGalleryLayout: layoutStub,
    GalleryPremiumLayout: layoutStub,
    GalleryStoryLayout: layoutStub,
  };
});
vi.mock('../PhotoLightbox', () => ({ PhotoLightbox: () => null }));
vi.mock('../DownloadResolutionModal', () => ({ DownloadResolutionModal: () => null }));
vi.mock('../HeroHeader', () => ({ HeroHeader: () => null }));

import { PhotoGridWithLayouts } from '../PhotoGridWithLayouts';

const photos: Photo[] = [1, 2, 3].map((id) => ({
  id,
  filename: `photo-${id}.jpg`,
  url: `/api/gallery/demo/photo/${id}`,
  thumbnail_url: `/api/gallery/demo/thumbnail/${id}`,
  type: 'individual',
  size: 1,
  uploaded_at: '2026-01-01T00:00:00Z',
} as Photo));

const selectThree = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByText('gallery.selectPhotos'));
  await user.click(screen.getAllByText('gallery.selectAll')[0]);
  await screen.findByText('gallery.downloadSelected');
};

beforeEach(() => {
  vi.clearAllMocks();
  reportDownloadFailure.mockResolvedValue(true);
});
afterEach(cleanup);

describe('PhotoGridWithLayouts: the selection after a bulk download', () => {
  it('keeps every selected photo when the server refuses the download', async () => {
    const user = userEvent.setup();
    const refusal = Object.assign(new Error('Payment Required'), {
      response: { status: 402, data: { code: 'DOWNLOAD_QUOTA_EXCEEDED' } },
    });
    downloadSelectedPhotos.mockRejectedValue(refusal);

    render(<PhotoGridWithLayouts photos={photos} slug="demo" />);
    await selectThree(user);

    await user.click(screen.getByText('gallery.downloadSelected'));

    await waitFor(() => expect(reportDownloadFailure).toHaveBeenCalledWith(refusal));
    // Still selected: the dialog tells the client to pick fewer photos, which
    // is only possible if there is still a selection to narrow.
    expect(screen.getByText('gallery.downloadSelected')).toBeInTheDocument();
    // And nothing was charged against the allowance.
    expect(refreshDownloadQuota).not.toHaveBeenCalled();
  });

  it('keeps the selection when the download fails for any other reason', async () => {
    const user = userEvent.setup();
    reportDownloadFailure.mockResolvedValue(false);
    downloadSelectedPhotos.mockRejectedValue(new Error('network down'));

    render(<PhotoGridWithLayouts photos={photos} slug="demo" />);
    await selectThree(user);

    await user.click(screen.getByText('gallery.downloadSelected'));

    await waitFor(() => expect(reportDownloadFailure).toHaveBeenCalled());
    expect(screen.getByText('gallery.downloadSelected')).toBeInTheDocument();
  });

  it('clears the selection and leaves selection mode once a download succeeds', async () => {
    const user = userEvent.setup();
    downloadSelectedPhotos.mockResolvedValue(undefined);

    render(<PhotoGridWithLayouts photos={photos} slug="demo" />);
    await selectThree(user);

    await user.click(screen.getByText('gallery.downloadSelected'));

    await waitFor(() => expect(screen.queryByText('gallery.downloadSelected')).toBeNull());
    expect(refreshDownloadQuota).toHaveBeenCalledWith('demo');
    expect(screen.getByText('gallery.selectPhotos')).toBeInTheDocument();
  });
});
