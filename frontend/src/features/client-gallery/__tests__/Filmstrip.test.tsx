import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Filmstrip } from '../viewer/Filmstrip';
import type { Photo } from '../../../types';

vi.mock('../../../components/common', () => ({ AuthenticatedImage: () => <img alt="" /> }));

const make = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: i + 1, filename: `p${i + 1}.jpg`, url: '/o', thumbnail_url: `/t/${i + 1}`,
  type: 'individual', size: 1000, uploaded_at: '', width: 4000, height: 6000,
})) as Photo[];

// The layout properties jsdom reports as 0, and what the strip reports instead.
const STRIP_LAYOUT = { offsetWidth: 1344, clientWidth: 1344, offsetHeight: 72, scrollWidth: 2000 * 62 } as const;
const originals = Object.keys(STRIP_LAYOUT).map((key) => [key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)] as const);

beforeEach(() => {
  // jsdom has no layout and no scrolling. Give the strip a desktop width,
  // and make scrollTo move scrollLeft and tell the virtualiser, the way a
  // browser would.
  const isStrip = (el: HTMLElement) => el.dataset.testid === 'filmstrip';
  Object.entries(STRIP_LAYOUT).forEach(([key, value]) => {
    Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get() { return isStrip(this) ? value : 0; } });
  });
  Element.prototype.scrollTo = function scrollTo(this: Element, options?: ScrollToOptions | number) {
    const left = typeof options === 'object' ? options.left : options;
    if (typeof left === 'number') (this as HTMLElement).scrollLeft = left;
    this.dispatchEvent(new Event('scroll'));
  } as typeof Element.prototype.scrollTo;
});

afterEach(() => {
  originals.forEach(([key, descriptor]) => {
    // clientWidth and scrollWidth live on Element.prototype: drop the shadow.
    if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
  });
});

describe('Filmstrip', () => {
  it('windows a long album and centres the open photo', () => {
    render(<Filmstrip photos={make(2000)} openId={1000} slug="s" showOriginalFilename={false} onNavigate={vi.fn()} />);
    const thumbs = screen.getAllByTestId('filmstrip-thumb');
    expect(thumbs.length).toBeLessThan(40);
    const current = thumbs.filter((el) => el.getAttribute('aria-current') === 'true');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute('data-photo-id')).toBe('1000');
  });

  it('follows the open photo when it changes', () => {
    const photos = make(2000);
    const { rerender } = render(<Filmstrip photos={photos} openId={1000} slug="s" showOriginalFilename={false} onNavigate={vi.fn()} />);
    rerender(<Filmstrip photos={photos} openId={1500} slug="s" showOriginalFilename={false} onNavigate={vi.fn()} />);
    const current = screen.getAllByTestId('filmstrip-thumb').filter((el) => el.getAttribute('aria-current') === 'true');
    expect(current[0].getAttribute('data-photo-id')).toBe('1500');
  });

  it('names each thumbnail the way the file info panel does', () => {
    const photos = make(3).map((p) => ({ ...p, original_filename: `DSC_${p.id}.jpg` }));
    const { rerender } = render(<Filmstrip photos={photos} openId={1} slug="s" showOriginalFilename={false} onNavigate={vi.fn()} />);
    expect(screen.getAllByTestId('filmstrip-thumb')[0].getAttribute('aria-label')).toBe('p1.jpg');
    rerender(<Filmstrip photos={photos} openId={1} slug="s" showOriginalFilename onNavigate={vi.fn()} />);
    expect(screen.getAllByTestId('filmstrip-thumb')[0].getAttribute('aria-label')).toBe('DSC_1.jpg');
  });

  it('leaves a placeholder rather than loading the original when there is no thumbnail', () => {
    const photos = make(3).map((p, i) => (i === 1 ? { ...p, thumbnail_url: undefined } : p));
    render(<Filmstrip photos={photos} openId={1} slug="s" showOriginalFilename={false} onNavigate={vi.fn()} />);
    const thumbs = screen.getAllByTestId('filmstrip-thumb');
    expect(thumbs[0].querySelector('img')).not.toBeNull();
    expect(thumbs[1].querySelector('img')).toBeNull();
  });

  it('navigates to a clicked thumbnail', () => {
    const onNavigate = vi.fn();
    render(<Filmstrip photos={make(20)} openId={1} slug="s" showOriginalFilename={false} onNavigate={onNavigate} />);
    fireEvent.click(screen.getAllByTestId('filmstrip-thumb')[2]);
    expect(onNavigate).toHaveBeenCalledWith(3);
  });
});
