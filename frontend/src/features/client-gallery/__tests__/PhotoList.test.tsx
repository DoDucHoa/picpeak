import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import { PhotoList } from '../list/PhotoList';
import { formatBytes, formatDimensions } from '../list/ListRow';
import type { Photo } from '../../../types';

vi.mock('../../../components/common', () => ({ AuthenticatedImage: () => <img alt="" /> }));

const make = (n: number, extra: Partial<Photo> = {}) => Array.from({ length: n }, (_, i) => ({
  id: i + 1, filename: `p${i}.jpg`, url: '/o', type: 'individual', size: 1000, uploaded_at: '', ...extra,
})) as Photo[];

const base = { slug: 's', allowLikes: true, allowPicks: true, showOriginalFilename: false, isClient: false, onToggleVisibility: vi.fn() };

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  // jsdom does not implement scrolling; the virtualiser calls it on mount.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

describe('list formatting', () => {
  it('formats sizes and dimensions like the reference', () => {
    expect(formatBytes(25480396)).toBe('24.3 MB');
    expect(formatBytes(900)).toBe('900 B');
    expect(formatDimensions(5152, 7728)).toBe('5152 × 7728');
    expect(formatDimensions(null, 7728)).toBe('');
  });
});

describe('PhotoList', () => {
  it('windows a long list', () => {
    render(<PhotoList photos={make(2000)} {...base} onOpen={vi.fn()} onToggle={vi.fn()} />);
    expect(screen.getAllByTestId('list-row').length).toBeLessThan(30);
    expect(parseFloat(screen.getByTestId('list-body').style.height)).toBe(2000 * 150);
  });

  it('renders the translated header', () => {
    render(<PhotoList photos={make(3)} {...base} onOpen={vi.fn()} onToggle={vi.fn()} />);
    ['File name', 'Dimensions', 'Size', 'Action'].forEach((label) => expect(screen.getByText(label)).toBeTruthy());
  });

  it('opens a photo from the row button and not from the like or pick buttons', () => {
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    render(<PhotoList photos={make(3)} {...base} onOpen={onOpen} onToggle={onToggle} />);
    const row = screen.getAllByTestId('list-row')[1];
    fireEvent.click(within(row).getByTestId('row-open'));
    expect(onOpen).toHaveBeenCalledWith(2);
    fireEvent.click(within(row).getByRole('button', { name: 'Like' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Pick' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 2 }), 'like');
    expect(onToggle).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 2 }), 'favorite');
  });

  it('leaves a placeholder rather than loading the original when there is no thumbnail', () => {
    const photos = make(2).map((p, i) => (i === 0 ? { ...p, thumbnail_url: '/t/1' } : p));
    render(<PhotoList photos={photos} {...base} onOpen={vi.fn()} onToggle={vi.fn()} />);
    const cells = screen.getAllByTestId('row-thumb');
    expect(cells[0].querySelector('img')).not.toBeNull();
    expect(cells[1].querySelector('img')).toBeNull();
  });

  it('never nests one button inside another', () => {
    render(<PhotoList photos={make(3)} {...base} onOpen={vi.fn()} onToggle={vi.fn()} />);
    screen.getAllByRole('button').forEach((b) => expect(b.querySelector('button')).toBeNull());
    screen.getAllByRole('button').forEach((b) => expect(b.parentElement?.closest('button')).toBeNull());
  });

  it('shows the original file name only when asked and available', () => {
    const photos = make(2);
    photos[0] = { ...photos[0], original_filename: 'IMG_0001.CR3' };
    const { rerender } = render(<PhotoList photos={photos} {...base} onOpen={vi.fn()} onToggle={vi.fn()} />);
    expect(screen.queryByText('IMG_0001.CR3')).toBeNull();
    rerender(<PhotoList photos={photos} {...base} showOriginalFilename onOpen={vi.fn()} onToggle={vi.fn()} />);
    expect(screen.getByText('IMG_0001.CR3')).toBeTruthy();
    expect(screen.getByText('p1.jpg')).toBeTruthy();
  });

  it('shows dimensions and size per row and respects the allow flags', () => {
    const photos = make(1, { width: 5152, height: 7728, size: 25480396 });
    render(<PhotoList photos={photos} {...base} allowLikes={false} allowPicks={false} onOpen={vi.fn()} onToggle={vi.fn()} />);
    expect(screen.getByText('5152 × 7728')).toBeTruthy();
    expect(screen.getByText('24.3 MB')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Like' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pick' })).toBeNull();
  });

  it('gives a client a visibility toggle per row and marks hidden rows', () => {
    const onToggleVisibility = vi.fn(); const onOpen = vi.fn();
    const photos = make(2).map((p, i) => (i === 1 ? { ...p, visibility: 'hidden' as const } : p));
    render(<PhotoList photos={photos} {...base} isClient onToggleVisibility={onToggleVisibility} onOpen={onOpen} onToggle={vi.fn()} />);
    const [shown, hidden] = screen.getAllByTestId('list-row');
    expect(shown.className).not.toContain('cg-row-hidden');
    expect(hidden.className).toContain('cg-row-hidden');
    expect(within(hidden).getByTestId('hidden-mark')).toBeTruthy();
    fireEvent.click(within(shown).getByRole('button', { name: 'Hide from guests' }));
    fireEvent.click(within(hidden).getByRole('button', { name: 'Show to guests' }));
    expect(onToggleVisibility).toHaveBeenNthCalledWith(1, 1, 'visible');
    expect(onToggleVisibility).toHaveBeenNthCalledWith(2, 2, 'hidden');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('offers guests no visibility toggle', () => {
    render(<PhotoList photos={make(2)} {...base} onOpen={vi.fn()} onToggle={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /guests/i })).toBeNull();
  });
});
