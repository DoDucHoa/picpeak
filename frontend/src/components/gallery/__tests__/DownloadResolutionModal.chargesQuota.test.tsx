/**
 * The last download path that never charged the allowance cache.
 *
 * The resolution picker hands the archive to the browser as a navigation, so
 * there is no response to await and nothing to react to on completion. That is
 * why it was left out of the bulk fix, and why the badge and the "Already
 * downloaded" marks stood still after a picker download until a reload. The
 * server records the delivery from the file route's own `res.on('finish')`,
 * exactly like every other path, so a refetch from here would race that write
 * for the same reason: the patch goes on the click instead.
 *
 * A whole-gallery download carries no id list and is deliberately still left
 * to reconcile on the next real read.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

const startDownloadJob = vi.fn(async () => ({ token: 'job-token', status: 'ready' }));
const downloadJobFile = vi.fn();
const downloadAllPhotos = vi.fn(async () => undefined);
vi.mock('../../../services/gallery.service', () => ({
  galleryService: {
    startDownloadJob: (...a: unknown[]) => startDownloadJob(...a),
    getDownloadJob: vi.fn(async () => ({ status: 'ready', photo_count: 3, size_bytes: 1 })),
    downloadJobFile: (...a: unknown[]) => downloadJobFile(...a),
    downloadAllPhotos: (...a: unknown[]) => downloadAllPhotos(...a),
  },
}));

const markPhotosDelivered = vi.fn();
vi.mock('../../../hooks/useDownloadQuota', () => ({
  useMarkPhotosDelivered: () => markPhotosDelivered,
}));

import { DownloadResolutionModal } from '../DownloadResolutionModal';

const choices = [
  { id: 'web', label: 'Web', width: 2048, height: 1365 },
  { id: 'original', label: 'Original' },
] as never;

async function prepareAndDownload(photoIds?: number[]) {
  const user = userEvent.setup();
  render(
    <DownloadResolutionModal
      slug="wedding"
      choices={choices}
      standardResolution="web"
      photoIds={photoIds}
      onClose={vi.fn()}
    />,
  );

  await user.click(screen.getByRole('button', { name: /Prepare download/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: /^Download$/ })).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: /^Download$/ }));
  return user;
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('DownloadResolutionModal: charging the allowance', () => {
  it('charges the selected photos when the archive is handed to the browser', async () => {
    await prepareAndDownload([11, 12, 13]);

    expect(markPhotosDelivered).toHaveBeenCalledWith('wedding', [11, 12, 13]);
    expect(downloadJobFile).toHaveBeenCalled();
  });

  it('charges nothing before the download is actually taken', async () => {
    const user = userEvent.setup();
    render(
      <DownloadResolutionModal
        slug="wedding"
        choices={choices}
        standardResolution="web"
        photoIds={[11, 12]}
        onClose={vi.fn()}
      />,
    );

    // Preparing the archive is not taking it: a client who closes the dialog
    // at this point has had nothing delivered.
    await user.click(screen.getByRole('button', { name: /Prepare download/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Download$/ })).toBeInTheDocument());

    expect(markPhotosDelivered).not.toHaveBeenCalled();
  });

  it('leaves a whole-gallery download at a custom size to reconcile on the next read', async () => {
    const user = userEvent.setup();
    render(
      <DownloadResolutionModal
        slug="wedding"
        choices={choices}
        standardResolution="web"
        onClose={vi.fn()}
      />,
    );

    // Anything but the standard size builds a job, same as a selection would.
    await user.click(screen.getByRole('radio', { name: /Original/ }));
    await user.click(screen.getByRole('button', { name: /Prepare download/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Download$/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^Download$/ }));

    expect(downloadJobFile).toHaveBeenCalled();
    // No id list to charge: the whole gallery is exactly the case this patch
    // cannot predict, so it is left to the next real read.
    expect(markPhotosDelivered).not.toHaveBeenCalled();
  });

  it('takes the pre-built archive for the whole gallery at its standard size', async () => {
    const user = userEvent.setup();
    render(
      <DownloadResolutionModal
        slug="wedding"
        choices={choices}
        standardResolution="web"
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Prepare download/ }));

    // Same bytes, already on disk: no job is built and nothing is charged here.
    await waitFor(() => expect(downloadAllPhotos).toHaveBeenCalledWith('wedding', true));
    expect(startDownloadJob).not.toHaveBeenCalled();
    expect(markPhotosDelivered).not.toHaveBeenCalled();
  });
});
