import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { GridTile } from '../grid/GridTile';
import { __inputModeTesting } from '../../../hooks/useInputMode';

vi.mock('../../../components/common', () => ({ AuthenticatedImage: () => <img alt="" /> }));

const photo = { id: 3, filename: 'a.jpg', url: '/o', slideshow_url: '/p', type: 'individual', size: 1, uploaded_at: '', width: 4000, height: 6000, like_count: 2, is_liked: false, is_favorited: true } as never;
const base = {
  photo, width: 300, height: 450, x: 0, y: 0, priority: 'normal' as const, slug: 's', allowLikes: true, allowPicks: true,
  selecting: false, selected: false, onSelect: vi.fn(), showOriginalFilename: false, isClient: false, onToggleVisibility: vi.fn(),
};

/** Report a coarse, hover-less pointer (a phone), as the PhotoCard tests do. */
function stubTouchDevice(isTouch: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: isTouch && query.includes('pointer: coarse'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
  // The input mode is a module-level store, so it has to re-read the device.
  __inputModeTesting.reset();
}

afterEach(() => stubTouchDevice(false));

it('opens the viewer from the body of the tile', () => {
  const onOpen = vi.fn(); const onToggle = vi.fn();
  render(<GridTile {...base} onOpen={onOpen} onToggle={onToggle} />);
  fireEvent.click(screen.getByRole('button', { name: 'a.jpg' }));
  expect(onOpen).toHaveBeenCalledWith(3);
  expect(onToggle).not.toHaveBeenCalled();
});

it('makes the open action a real button, not a role on the tile box', () => {
  render(<GridTile {...base} onOpen={vi.fn()} onToggle={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'a.jpg' }).tagName).toBe('BUTTON');
  expect(screen.getByTestId('grid-tile')).not.toHaveAttribute('role');
});

it('toggles selection from the body of the tile while selecting', () => {
  const onOpen = vi.fn(); const onSelect = vi.fn();
  render(<GridTile {...base} selecting selected onSelect={onSelect} onOpen={onOpen} onToggle={vi.fn()} />);
  const open = screen.getByRole('button', { name: 'a.jpg' });
  expect(open).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(open);
  expect(onSelect).toHaveBeenCalledWith(3);
  expect(onOpen).not.toHaveBeenCalled();
});

it('likes from the heart without opening the viewer', () => {
  const onOpen = vi.fn(); const onToggle = vi.fn();
  render(<GridTile {...base} onOpen={onOpen} onToggle={onToggle} />);
  fireEvent.click(screen.getByRole('button', { name: /^like/i }));
  expect(onToggle).toHaveBeenCalledWith(photo, 'like');
  expect(onOpen).not.toHaveBeenCalled();
});

it('keeps the badges outside the open button', () => {
  render(<GridTile {...base} onOpen={vi.fn()} onToggle={vi.fn()} />);
  const open = screen.getByRole('button', { name: 'a.jpg' });
  expect(open.contains(screen.getByRole('button', { name: /^like/i }))).toBe(false);
  expect(open.contains(screen.getByRole('button', { name: /unpick/i }))).toBe(false);
  expect(open.contains(screen.getByTestId('tile-badges'))).toBe(false);
});

it('shows only the badges already on, with the touch hit area, on a touch screen', () => {
  stubTouchDevice(true);
  render(<GridTile {...base} onOpen={vi.fn()} onToggle={vi.fn()} />);
  // Picked but not liked: a tap on the tile opens the viewer, where like lives.
  expect(screen.queryByRole('button', { name: /^like/i })).toBeNull();
  expect(screen.getByRole('button', { name: /unpick/i })).toBeTruthy();
  expect(screen.getByTestId('tile-badges').className).toContain('cg-badges-touch');
});

it('shows no badge at all on a touch screen for a photo neither liked nor picked', () => {
  stubTouchDevice(true);
  render(<GridTile {...base} photo={{ ...(photo as object), is_favorited: false } as never} onOpen={vi.fn()} onToggle={vi.fn()} />);
  expect(screen.queryByRole('button', { name: /like|pick/i })).toBeNull();
});

it('keeps every badge, revealed on hover, with a mouse', () => {
  stubTouchDevice(false);
  render(<GridTile {...base} onOpen={vi.fn()} onToggle={vi.fn()} />);
  expect(screen.getByRole('button', { name: /^like/i })).toBeTruthy();
  expect(screen.getByTestId('tile-badges').className).not.toContain('cg-badges-touch');
});

it('keeps a picked tile\'s badge visible without hover', () => {
  render(<GridTile {...base} onOpen={vi.fn()} onToggle={vi.fn()} />);
  expect(screen.getByRole('button', { name: /unpick/i }).className).toContain('cg-badge-on');
});

it('names the tile by its original file name only when the event shows them', () => {
  const named = { ...(photo as object), original_filename: 'IMG_0001.jpg' } as never;
  const { unmount } = render(<GridTile {...base} photo={named} onOpen={vi.fn()} onToggle={vi.fn()} />);
  expect(screen.getByTestId('tile-open').getAttribute('aria-label')).toBe('a.jpg');
  unmount();
  render(<GridTile {...base} photo={named} showOriginalFilename onOpen={vi.fn()} onToggle={vi.fn()} />);
  expect(screen.getByTestId('tile-open').getAttribute('aria-label')).toBe('IMG_0001.jpg');
});

describe('client visibility', () => {
  it('offers guests no visibility control', () => {
    render(<GridTile {...base} onOpen={vi.fn()} onToggle={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /guests/i })).toBeNull();
  });

  it('lets a client hide a visible photo without opening it', () => {
    const onToggleVisibility = vi.fn(); const onOpen = vi.fn();
    render(<GridTile {...base} isClient onToggleVisibility={onToggleVisibility} onOpen={onOpen} onToggle={vi.fn()} />);
    expect(screen.queryByTestId('hidden-mark')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hide from guests' }));
    expect(onToggleVisibility).toHaveBeenCalledWith(3, 'visible');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('drops the toggle while selecting, so a tap anywhere on the tile selects', () => {
    const hidden = { ...(photo as object), visibility: 'hidden' } as never;
    render(<GridTile {...base} photo={hidden} isClient selecting onOpen={vi.fn()} onToggle={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /guests/i })).toBeNull();
    expect(screen.getByTestId('hidden-mark')).toBeTruthy();
  });

  it('marks a hidden photo and lets the client show it again', () => {
    const onToggleVisibility = vi.fn();
    const hidden = { ...(photo as object), visibility: 'hidden' } as never;
    render(<GridTile {...base} photo={hidden} isClient onToggleVisibility={onToggleVisibility} onOpen={vi.fn()} onToggle={vi.fn()} />);
    expect(screen.getByTestId('grid-tile').className).toContain('cg-tile-hidden');
    expect(screen.getByTestId('hidden-mark').getAttribute('aria-label')).toBe('Hidden from guests');
    fireEvent.click(screen.getByRole('button', { name: 'Show to guests' }));
    expect(onToggleVisibility).toHaveBeenCalledWith(3, 'hidden');
  });
});
