import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CoverHero } from '../cover/CoverHero';

vi.mock('../../../components/common', () => ({ AuthenticatedImage: ({ src, style }: { src: string; style?: React.CSSProperties }) => <img data-testid="cover-img" src={src} style={style} alt="" /> }));

const positionFor = (anchor: string) => {
  const { unmount } = render(<CoverHero photo={{ id: 1, url: '/o/1' } as never} slug="s" title="T" subtitle="" logoUrl={null} anchor={anchor} onViewAlbum={vi.fn()} languagePicker={null} />);
  const value = (screen.getByTestId('cover-img') as HTMLImageElement).style.objectPosition;
  unmount();
  return value;
};

it('passes the stored anchor values through and falls back to center', () => {
  expect(positionFor('30% 70%')).toBe('30% 70%');
  expect(positionFor('top')).toBe('top');
  expect(positionFor('bottom')).toBe('bottom');
  expect(positionFor('left')).toBe('center');
  expect(positionFor('150% 20%')).toBe('center');
  expect(positionFor('garbage')).toBe('center');
});

it('gives the title the serif class', () => {
  render(<CoverHero photo={null} slug="s" title="T" subtitle="" logoUrl={null} anchor="center" onViewAlbum={vi.fn()} languagePicker={null} />);
  expect(screen.getByRole('heading', { level: 1 }).className).toContain('cg-title');
});

it('shows the title, subtitle and a View Album button that scrolls on', () => {
  const onViewAlbum = vi.fn();
  render(<CoverHero photo={{ id: 1, hero_url: '/h/1', url: '/o/1' } as never} slug="s" title="Couple" subtitle="huyhiep" logoUrl={null} anchor="center" onViewAlbum={onViewAlbum} languagePicker={null} />);
  expect(screen.getByRole('heading', { level: 1, name: 'Couple' })).toBeTruthy();
  expect(screen.getByText('huyhiep')).toBeTruthy();
  expect(screen.getByTestId('cover-img').getAttribute('src')).toBe('/h/1');
  fireEvent.click(screen.getByRole('button', { name: /view album/i }));
  expect(onViewAlbum).toHaveBeenCalled();
});

it('renders a plain cover without a photo', () => {
  render(<CoverHero photo={null} slug="s" title="Empty" subtitle="" logoUrl={null} anchor="center" onViewAlbum={vi.fn()} languagePicker={null} />);
  expect(screen.queryByTestId('cover-img')).toBeNull();
});
