/**
 * The two client-facing readouts of the download allowance.
 *
 * The badge states what is left; the grid states which photos already spent a
 * slot. Both read numbers the backend computed. Nothing here recomputes a
 * remaining count from a total minus a used count: a second arithmetic path is
 * a second answer, and the guest is being told what their next download costs.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  // Renders the real default string with its interpolations, so an assertion
  // reads the sentence a guest sees rather than a key.
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
}));

vi.mock('react-intersection-observer', () => ({
  useInView: () => ({ ref: () => {}, inView: true }),
}));
vi.mock('../../common', () => ({
  AuthenticatedImage: ({ src }: { src: string }) => <img data-testid="tile" src={src} alt="" />,
}));
vi.mock('../../../contexts/GuestIdentityContext', () => ({
  useGuestIdentityOptional: () => null,
}));

import { DownloadQuotaBadge } from '../DownloadQuotaBadge';
import { PhotoCard } from '../PhotoCard';
import { DownloadedPhotosProvider } from '../../../contexts/DownloadedPhotosContext';
import type { DownloadQuotaState } from '../../../services/downloadQuota.service';
import type { Photo } from '../../../types';

const quota = (over: Partial<DownloadQuotaState> = {}): DownloadQuotaState => ({
  enabled: true,
  unlimited: false,
  freeLimit: 20,
  pricePerPhoto: 1,
  total: 20,
  used: 15,
  remaining: 5,
  enabledAt: '2026-09-15T00:00:00Z',
  ...over,
});

describe('DownloadQuotaBadge', () => {
  it('states the remaining allowance exactly as the backend reported it', () => {
    render(<DownloadQuotaBadge quota={quota()} />);

    expect(screen.getByText('5 of 20 downloads left')).toBeInTheDocument();
  });

  it('renders nothing for a gallery with the feature switched off', () => {
    const { container } = render(<DownloadQuotaBadge quota={quota({ enabled: false })} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing before the quota has loaded', () => {
    const { container } = render(<DownloadQuotaBadge quota={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the unlimited label with no number at all', () => {
    render(
      <DownloadQuotaBadge quota={quota({ unlimited: true, total: null, remaining: null })} />,
    );

    const badge = screen.getByTestId('download-quota-badge');
    expect(badge).toHaveTextContent('Unlimited downloads');
    // A count next to "unlimited" is a contradiction, and `remaining` is null
    // here, so any digit on screen could only have been invented locally.
    expect(badge.textContent).not.toMatch(/\d/);
  });
});

const PHOTO = (id: number): Photo =>
  ({
    id,
    filename: `IMG_000${id}.jpg`,
    url: `/api/gallery/x/photo/${id}`,
    thumbnail_url: `/api/gallery/x/thumbnail/${id}`,
    type: 'individual',
    size: 1,
    uploaded_at: '2026-01-01T00:00:00Z',
  }) as Photo;

function renderCard(id: number, delivered: number[]) {
  return render(
    <DownloadedPhotosProvider value={new Set(delivered)}>
      <PhotoCard
        photo={PHOTO(id)}
        isSelected={false}
        isSelectionMode={false}
        onClick={() => {}}
        onDownload={() => {}}
        onToggleSelect={() => {}}
        className="tile"
        overlayBaseClassName="overlay"
        imageProps={{ src: PHOTO(id).thumbnail_url!, alt: PHOTO(id).filename }}
      />
    </DownloadedPhotosProvider>,
  );
}

describe('the delivered mark on a grid tile', () => {
  it('marks a photo the gallery has already handed over', () => {
    renderCard(11, [11, 12]);

    expect(screen.getByTestId('photo-delivered-mark')).toBeInTheDocument();
  });

  it('leaves an undelivered photo unmarked, so the mark keeps meaning "free to re-download"', () => {
    renderCard(99, [11, 12]);

    expect(screen.queryByTestId('photo-delivered-mark')).not.toBeInTheDocument();
  });

  it('marks nothing at all where no allowance is in play', () => {
    render(
      <PhotoCard
        photo={PHOTO(11)}
        isSelected={false}
        isSelectionMode={false}
        onClick={() => {}}
        onDownload={() => {}}
        onToggleSelect={() => {}}
        className="tile"
        overlayBaseClassName="overlay"
        imageProps={{ src: '/t.jpg', alt: 'x' }}
      />,
    );

    expect(screen.queryByTestId('photo-delivered-mark')).not.toBeInTheDocument();
  });

  it('labels the mark for a screen reader rather than relying on the icon alone', () => {
    renderCard(11, [11]);

    expect(
      within(screen.getByTestId('photo-delivered-mark')).getByText('Already downloaded'),
    ).toBeInTheDocument();
  });
});
