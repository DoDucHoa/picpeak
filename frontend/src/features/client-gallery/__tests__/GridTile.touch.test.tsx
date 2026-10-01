import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { GridTile } from '../grid/GridTile';
import { __inputModeTesting } from '../../../hooks/useInputMode';

vi.mock('../../../components/common', () => ({ AuthenticatedImage: () => <img alt="" /> }));

const photo = { id: 3, filename: 'a.jpg', url: '/o', slideshow_url: '/p', type: 'individual', size: 1, uploaded_at: '', width: 4000, height: 6000, like_count: 2, is_liked: false, is_favorited: true } as never;
const base = { photo, width: 300, height: 450, x: 0, y: 0, priority: 'normal' as const, slug: 's', allowLikes: true, allowPicks: true, selecting: false, selected: false, onSelect: vi.fn() };

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
