import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { GridTile } from '../grid/GridTile';
import { __inputModeTesting } from '../../../hooks/useInputMode';

vi.mock('../../../components/common', () => ({ AuthenticatedImage: () => <img alt="" /> }));

const photo = { id: 3, filename: 'a.jpg', url: '/o', slideshow_url: '/p', type: 'individual', size: 1, uploaded_at: '', width: 4000, height: 6000, like_count: 2, is_liked: false, is_favorited: true } as never;
const base = { photo, width: 300, height: 450, x: 0, y: 0, priority: 'normal' as const, slug: 's', canvas: false, allowLikes: true, allowPicks: true, selecting: false, selectedIds: new Set<number>(), onSelect: vi.fn() };

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
  fireEvent.click(screen.getByTestId('grid-tile'));
  expect(onOpen).toHaveBeenCalledWith(3);
  expect(onToggle).not.toHaveBeenCalled();
});

it('likes from the heart without opening the viewer', () => {
  const onOpen = vi.fn(); const onToggle = vi.fn();
  render(<GridTile {...base} onOpen={onOpen} onToggle={onToggle} />);
  fireEvent.click(screen.getByRole('button', { name: /^like/i }));
  expect(onToggle).toHaveBeenCalledWith(photo, 'like');
  expect(onOpen).not.toHaveBeenCalled();
});

it('does not open the viewer when Enter lands on a badge', () => {
  const onOpen = vi.fn();
  render(<GridTile {...base} onOpen={onOpen} onToggle={vi.fn()} />);
  fireEvent.keyDown(screen.getByRole('button', { name: /^like/i }), { key: 'Enter' });
  expect(onOpen).not.toHaveBeenCalled();
});

it('shows the badges permanently on a touch screen', () => {
  stubTouchDevice(true);
  render(<GridTile {...base} onOpen={vi.fn()} onToggle={vi.fn()} />);
  expect(screen.getByTestId('tile-badges').className).toContain('cg-badges-always');
});

it('hides the badges until hover with a mouse', () => {
  stubTouchDevice(false);
  render(<GridTile {...base} onOpen={vi.fn()} onToggle={vi.fn()} />);
  expect(screen.getByTestId('tile-badges').className).not.toContain('cg-badges-always');
});

it('keeps a picked tile\'s badge visible without hover', () => {
  render(<GridTile {...base} onOpen={vi.fn()} onToggle={vi.fn()} />);
  expect(screen.getByRole('button', { name: /unpick/i }).className).toContain('cg-badge-on');
});
