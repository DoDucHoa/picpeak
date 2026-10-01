import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { GridTile } from '../grid/GridTile';
import { PhotoList } from '../list/PhotoList';
import { DownloadedPhotosProvider } from '../../../contexts/DownloadedPhotosContext';
import type { Photo } from '../../../types';

vi.mock('../../../components/common', () => ({ AuthenticatedImage: () => <img alt="" /> }));

const photo = (id: number) => ({
  id, filename: `p${id}.jpg`, url: '/o', slideshow_url: '/p', thumbnail_url: `/t/${id}`, type: 'individual',
  size: 1000, uploaded_at: '', width: 4000, height: 6000,
}) as Photo;

const tile = { width: 300, height: 450, x: 0, y: 0, priority: 'normal' as const, slug: 's', allowLikes: true, allowPicks: true, selecting: false, selected: false, onSelect: vi.fn(), onOpen: vi.fn(), onToggle: vi.fn(), showOriginalFilename: false, isClient: false, onToggleVisibility: vi.fn() };

function renderTile(id: number, delivered: number[]) {
  return render(
    <DownloadedPhotosProvider value={new Set(delivered)}>
      <GridTile photo={photo(id)} {...tile} />
    </DownloadedPhotosProvider>,
  );
}

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

describe('the already downloaded mark', () => {
  it('marks a grid tile the gallery has already handed over, with a spoken label', () => {
    renderTile(11, [11, 12]);
    expect(screen.getByTestId('photo-delivered-mark').getAttribute('aria-label')).toBe('Already downloaded');
  });

  it('leaves an undelivered tile unmarked', () => {
    renderTile(99, [11, 12]);
    expect(screen.queryByTestId('photo-delivered-mark')).toBeNull();
  });

  it('marks nothing where no allowance is in play', () => {
    render(<GridTile photo={photo(11)} {...tile} />);
    expect(screen.queryByTestId('photo-delivered-mark')).toBeNull();
  });

  it('marks only the delivered rows of the list', () => {
    render(
      <DownloadedPhotosProvider value={new Set([2])}>
        <PhotoList photos={[photo(1), photo(2)]} slug="s" allowLikes allowPicks showOriginalFilename={false} isClient={false} onToggleVisibility={vi.fn()} onOpen={vi.fn()} onToggle={vi.fn()} />
      </DownloadedPhotosProvider>,
    );
    const rows = screen.getAllByTestId('list-row');
    expect(within(rows[0]).queryByTestId('photo-delivered-mark')).toBeNull();
    expect(within(rows[1]).getByTestId('photo-delivered-mark')).toBeTruthy();
  });
});
