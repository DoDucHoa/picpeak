import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CoverHero } from '../cover/CoverHero';

vi.mock('../../../components/common', () => ({ AuthenticatedImage: ({ src }: { src: string }) => <img data-testid="cover-img" src={src} alt="" /> }));

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
