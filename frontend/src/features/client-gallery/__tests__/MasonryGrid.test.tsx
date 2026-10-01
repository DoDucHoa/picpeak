import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { MasonryGrid } from '../grid/MasonryGrid';
import type { Photo } from '../../../types';

// Counts renders per image URL, so a test can tell whether a tile that stayed
// in view rendered again. The mock is not memoised: it renders exactly when
// its GridTile parent does.
const imageRenders = new Map<string, number>();
vi.mock('../../../components/common', () => ({
  AuthenticatedImage: ({ src, alt }: { src: string; alt?: string }) => {
    imageRenders.set(src, (imageRenders.get(src) ?? 0) + 1);
    return <img data-testid="tile-img" src={src} alt={alt} />;
  },
}));

const photos = Array.from({ length: 2000 }, (_, i) => ({
  id: i + 1, filename: `p${i}.jpg`, url: `/o/${i}`, slideshow_url: `/p/${i}`, type: 'individual',
  size: 1, uploaded_at: '2026-01-01', width: i % 3 === 0 ? 6000 : 4000, height: i % 3 === 0 ? 4000 : 6000,
})) as Photo[];

function setViewport(width: number, height = 900) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: width });
}

/** jsdom does not scroll: move scrollY by hand and announce it like a browser. */
function scrollWindowTo(top: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: top });
  window.dispatchEvent(new Event('scroll'));
}

/** The resize handler defers to the next frame; let that frame run. */
async function nextFrame() {
  await act(async () => { await new Promise((resolve) => requestAnimationFrame(() => resolve(null))); });
}

const props = { slug: 's', canvas: false, onOpen: vi.fn(), onToggle: vi.fn(), allowLikes: true, allowPicks: true, selecting: false, selectedIds: new Set<number>(), onSelect: vi.fn() };

const renderedIds = () => screen.getAllByTestId('grid-tile').map((t) => t.getAttribute('data-photo-id'));

beforeEach(() => {
  setViewport(1440);
  imageRenders.clear();
  // A tall document, so the virtualiser does not clamp a programmatic scroll to 0.
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 10_000_000 });
  Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
  window.scrollTo = vi.fn((opts?: ScrollToOptions | number) => {
    if (typeof opts === 'object' && typeof opts.top === 'number') scrollWindowTo(opts.top);
  }) as unknown as typeof window.scrollTo;
});

afterEach(() => { vi.restoreAllMocks(); });

describe('MasonryGrid', () => {
  it('renders a small window of a 2000 photo album', () => {
    render(<MasonryGrid photos={photos} {...props} />);
    const rendered = screen.getAllByTestId('grid-tile').length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(60);
  });

  it('reserves the full album height up front', () => {
    render(<MasonryGrid photos={photos} {...props} />);
    const body = screen.getByTestId('grid-body');
    expect(parseFloat(body.style.height)).toBeGreaterThan(100000);
  });

  it('places the first three photos across the top row at 1440px', () => {
    render(<MasonryGrid photos={photos} {...props} />);
    const tiles = screen.getAllByTestId('grid-tile').slice(0, 3);
    const lefts = tiles.map((t) => t.style.transform);
    expect(new Set(lefts).size).toBe(3);
    tiles.forEach((t) => expect(t.style.transform).toMatch(/translate\(\d+(\.\d+)?px, 0px\)/));
  });

  it('re-lays out with two lanes after shrinking to a phone', async () => {
    const { rerender } = render(<MasonryGrid photos={photos} {...props} />);
    act(() => { setViewport(390, 844); window.dispatchEvent(new Event('resize')); });
    await nextFrame();
    rerender(<MasonryGrid photos={photos} {...props} />);
    const xs = new Set(screen.getAllByTestId('grid-tile').map((t) => t.style.transform.split(',')[0]));
    expect(xs.size).toBe(2);
  });

  it('keeps the first visible photo in view across a breakpoint', async () => {
    render(<MasonryGrid photos={photos} {...props} />);
    act(() => scrollWindowTo(50_000));
    // The first tile whose bottom edge is below the top of the viewport.
    const visible = screen.getAllByTestId('grid-tile').find((t) => {
      const y = Number(/, (\d+(?:\.\d+)?)px\)/.exec(t.style.transform)?.[1]);
      return y + parseFloat(t.style.height) > 50_000;
    });
    const anchorId = visible?.getAttribute('data-photo-id');
    expect(anchorId).toBeTruthy();

    act(() => { setViewport(390, 844); window.dispatchEvent(new Event('resize')); });
    await nextFrame();

    // Same scroll offset in two narrower lanes lands far further down the
    // album; only the re-anchoring scroll keeps this photo on screen.
    expect(window.scrollTo).toHaveBeenCalled();
    expect(renderedIds()).toContain(anchorId);
    const xs = new Set(screen.getAllByTestId('grid-tile').map((t) => t.style.transform.split(',')[0]));
    expect(xs.size).toBe(2);
  });

  it('does not re-render tiles that stay in view while scrolling', () => {
    render(<MasonryGrid photos={photos} {...props} />);
    const before = new Set(screen.getAllByTestId('tile-img').map((i) => i.getAttribute('src')!));
    // Far enough to shift the window, not far enough to empty it.
    act(() => scrollWindowTo(1_500));
    const after = screen.getAllByTestId('tile-img').map((i) => i.getAttribute('src')!);
    const stayed = after.filter((src) => before.has(src));
    const arrived = after.filter((src) => !before.has(src));
    expect(arrived.length).toBeGreaterThan(0);
    expect(stayed.length).toBeGreaterThan(0);
    stayed.forEach((src) => expect(imageRenders.get(src)).toBe(1));
  });
});
