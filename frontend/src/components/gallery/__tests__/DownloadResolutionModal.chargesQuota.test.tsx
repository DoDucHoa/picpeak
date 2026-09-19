/**
 * The resolution picker has to re-read the allowance once it hands the archive
 * over, or the badge and the "Already downloaded" marks stand still until the
 * client reloads the page by hand.
 *
 * It hands the archive to the browser as a navigation, so there is no response
 * to await. That used to force a client-side prediction of the new counters,
 * because the server charged the ledger after the transfer and a refetch would
 * have raced that write. The slots are now claimed before the file route
 * streams a byte, so the ledger is already right when this fires and a plain
 * refetch reads it.
 *
 * That removes the one case the prediction could not handle: a whole-gallery
 * download carries no id list, so it used to be left to reconcile on the next
 * real read. A refetch does not care how many photos were involved.
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

const refreshDownloadQuota = vi.fn();
vi.mock('../../../hooks/useDownloadQuota', () => ({
  useRefreshDownloadQuota: () => refreshDownloadQuota,
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

describe('DownloadResolutionModal: re-reading the allowance', () => {
  it('re-reads the allowance when the archive is handed to the browser', async () => {
    await prepareAndDownload([11, 12, 13]);

    expect(refreshDownloadQuota).toHaveBeenCalledWith('wedding');
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

    expect(refreshDownloadQuota).not.toHaveBeenCalled();
  });

  it('re-reads after a whole-gallery download at a custom size too', async () => {
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
    // The case the old prediction had to skip for want of an id list. A refetch
    // needs none, so the badge now updates here as well.
    expect(refreshDownloadQuota).toHaveBeenCalledWith('wedding');
  });

  it('re-reads after taking the pre-built archive at the standard size', async () => {
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

    // Same bytes, already on disk, so no job is built. The download-all route
    // still claims the slots for the whole gallery, so the counters moved and
    // this shortcut has to re-read them like every other path.
    await waitFor(() => expect(downloadAllPhotos).toHaveBeenCalledWith('wedding', true));
    expect(startDownloadJob).not.toHaveBeenCalled();
    await waitFor(() => expect(refreshDownloadQuota).toHaveBeenCalledWith('wedding'));
  });
});
