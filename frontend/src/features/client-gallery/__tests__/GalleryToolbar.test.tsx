import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../../../i18n/locales/en.json';
import { GalleryToolbar } from '../toolbar/GalleryToolbar';
import { fakeController } from './fakeController';
import type { PhotoCategory } from '../../../types';
import type { GalleryController } from '../state/useGalleryController';

// A real instance, so counts interpolate and the labels come from en.json.
i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: en } } });

const folder: PhotoCategory = { id: 7, name: 'Ceremony', slug: 'ceremony', is_global: false, is_folder: true };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GalleryToolbar', () => {
  it('shows the three tabs with counts and the pick limit', () => {
    render(<GalleryToolbar c={fakeController()} onShare={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /total 205/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /like 0/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /pick 9 \/ 205/i })).toBeTruthy();
  });

  it('hides like and pick when feedback switches them off', () => {
    render(<GalleryToolbar c={fakeController({ feedbackSettings: { allow_likes: false, allow_favorites: false } })} onShare={vi.fn()} />);
    expect(screen.queryByRole('tab', { name: /like/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /pick/i })).toBeNull();
  });

  it('hides like and pick when feedback itself is off, whatever the allow flags say', () => {
    render(<GalleryToolbar c={fakeController({ feedbackSettings: { feedback_enabled: false, allow_likes: true, allow_favorites: true } })} onShare={vi.fn()} />);
    expect(screen.queryByRole('tab', { name: /like/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /pick/i })).toBeNull();
    expect(screen.getByRole('tab', { name: /total 205/i })).toBeTruthy();
  });

  it('counts the pick limit across the gallery inside a folder', () => {
    const c = fakeController({
      counts: { all: 40, liked: 0, picked: 2 }, pickedTotal: 9,
      folders: { ...fakeController().folders, open: folder },
    });
    render(<GalleryToolbar c={c} onShare={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /^pick 9 \/ 205$/i })).toBeTruthy();
  });

  it('shows Pick N without a limit', () => {
    render(<GalleryToolbar c={fakeController({ pickLimit: null })} onShare={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /^pick 9$/i })).toBeTruthy();
  });

  it('treats a pick limit of 0 as no limit', () => {
    render(<GalleryToolbar c={fakeController({ pickLimit: 0 })} onShare={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /^pick 9$/i })).toBeTruthy();
  });

  it('marks the active tab', () => {
    const c = fakeController({ url: { sort: 'capture_date', dir: 'desc', view: 'grid', tab: 'picked', photo: null } });
    render(<GalleryToolbar c={c} onShare={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /pick 9/i }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /total 205/i }).getAttribute('aria-selected')).toBe('false');
  });

  it('changes tab, sort field, sort direction and view', () => {
    const c = fakeController();
    render(<GalleryToolbar c={c} onShare={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /like 0/i }));
    expect(c.setTab).toHaveBeenCalledWith('liked');
    fireEvent.click(screen.getByRole('button', { name: /change sort direction/i }));
    expect(c.toggleDir).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /creation time/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /file name/i }));
    expect(c.setSort).toHaveBeenCalledWith('name');
    fireEvent.click(screen.getByRole('button', { name: /change view mode/i }));
    expect(c.setView).toHaveBeenCalledWith('list');
  });

  it('switches back to the grid from the list', () => {
    const c = fakeController({ url: { sort: 'name', dir: 'asc', view: 'list', tab: 'all', photo: null } });
    render(<GalleryToolbar c={c} onShare={vi.fn()} />);
    expect(screen.getByRole('button', { name: /file name/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /change view mode/i }));
    expect(c.setView).toHaveBeenCalledWith('grid');
  });

  it('has no Download menu, and starts downloads from Select', () => {
    const c = fakeController();
    render(<GalleryToolbar c={c} onShare={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^download$/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^select$/i }));
    expect(c.selection.setActive).toHaveBeenCalledWith(true);
  });

  it('closes a menu on Escape and returns focus to its trigger', () => {
    render(<GalleryToolbar c={fakeController()} onShare={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /creation time/i });
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('closes a menu on a pointerdown outside it', () => {
    render(<GalleryToolbar c={fakeController()} onShare={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /creation time/i }));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: /file name/i }));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('moves the order offer from the toolbar into the selection bar', () => {
    const { unmount } = render(<GalleryToolbar c={fakeController({ offerFullPackage: true })} onShare={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /get all photos/i })).toBeNull();
    unmount();
    const c = fakeController({
      offerFullPackage: true,
      selection: { active: true, setActive: vi.fn(), ids: new Set([1]), setIds: vi.fn() },
    });
    render(<GalleryToolbar c={c} onShare={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /get all photos/i }));
    expect(c.setQuotaOffer).toHaveBeenCalledWith({ exceeded: null });
  });

  it('hides downloads entirely when they are off', () => {
    const selection = { active: true, setActive: vi.fn(), ids: new Set([1]), setIds: vi.fn() };
    render(<GalleryToolbar c={fakeController({ allowDownloads: false, offerFullPackage: true, selection })} onShare={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /download selected/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /get all photos/i })).toBeNull();
  });

  it('shares, logs out and opens the people sheet', () => {
    const onShare = vi.fn();
    const c = fakeController({ showLogout: true, people: { ...fakeController().people, enabled: true } });
    render(<GalleryToolbar c={c} onShare={onShare} />);
    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    expect(onShare).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    expect(c.logout).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /people/i }));
    expect(c.people.setSheetOpen).toHaveBeenCalledWith(true);
  });

  it('hides logout and people when they do not apply', () => {
    render(<GalleryToolbar c={fakeController()} onShare={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /log out/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /people/i })).toBeNull();
  });

  it('shows the folder breadcrumb and walks back to the root', () => {
    const c = fakeController({ folders: { ...fakeController().folders, open: folder } });
    render(<GalleryToolbar c={c} onShare={vi.fn()} />);
    expect(screen.getByText('Ceremony')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /all photos/i }));
    expect(c.folders.openBySlug).toHaveBeenCalledWith(null);
  });

  it('shows the quota badge to clients only', () => {
    const quota = {
      enabled: true, unlimited: false, freeLimit: 10, pricePerPhoto: 1, total: 10, used: 3, remaining: 7,
      enabledAt: null, autoApprove: false,
    };
    const { rerender } = render(<GalleryToolbar c={fakeController({ quota })} onShare={vi.fn()} />);
    expect(screen.queryByTestId('download-quota-badge')).toBeNull();
    rerender(<GalleryToolbar c={fakeController({ quota, client: { ...fakeController().client, isClient: true } })} onShare={vi.fn()} />);
    expect(screen.getByTestId('download-quota-badge').textContent).toMatch(/7 of 10/);
  });

  it('replaces row two with the selection bar while multi-selecting', () => {
    const c = fakeController({
      selection: { active: true, setActive: vi.fn(), ids: new Set([1, 2]), setIds: vi.fn() },
      client: { ...fakeController().client, isClient: true },
    });
    render(<GalleryToolbar c={c} onShare={vi.fn()} />);
    expect(screen.getByText(/2 selected/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^download$/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /download selected/i }));
    expect(c.handleDownloadSelected).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /hide selected/i }));
    expect(c.client.bulkVisibility).toHaveBeenCalledWith('hidden');
    fireEvent.click(screen.getByRole('button', { name: /show selected/i }));
    expect(c.client.bulkVisibility).toHaveBeenCalledWith('visible');
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(c.selection.setIds).toHaveBeenCalledWith(new Set());
    expect(c.selection.setActive).toHaveBeenCalledWith(false);
  });

  it('offers a client Select whether or not downloads are allowed', () => {
    const client = { ...fakeController().client, isClient: true };
    const c = fakeController({ allowDownloads: false, client });
    const { unmount } = render(<GalleryToolbar c={c} onShare={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^download$/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^select$/i }));
    expect(c.selection.setActive).toHaveBeenCalledWith(true);
    unmount();
    render(<GalleryToolbar c={fakeController({ client })} onShare={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^select$/i })).toBeTruthy();
  });

  it('keeps Select out of the toolbar for guests', () => {
    render(<GalleryToolbar c={fakeController({ allowDownloads: false })} onShare={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^select$/i })).toBeNull();
  });

  it('lets a client hide or show a selection with downloads off', () => {
    const c = fakeController({
      allowDownloads: false,
      selection: { active: true, setActive: vi.fn(), ids: new Set([1]), setIds: vi.fn() },
      client: { ...fakeController().client, isClient: true },
    });
    render(<GalleryToolbar c={c} onShare={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /download selected/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /hide selected/i }));
    expect(c.client.bulkVisibility).toHaveBeenCalledWith('hidden');
  });

  it('disables download selected at zero and hides visibility controls from guests', () => {
    const c = fakeController({ selection: { active: true, setActive: vi.fn(), ids: new Set(), setIds: vi.fn() } });
    render(<GalleryToolbar c={c} onShare={vi.fn()} />);
    expect((screen.getByRole('button', { name: /download selected/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /hide selected/i })).toBeNull();
  });

  it('selects every photo on screen, and clears them on a second press', () => {
    const visiblePhotos = [{ id: 1 }, { id: 2 }, { id: 3 }] as GalleryController['visiblePhotos'];
    const setIds = vi.fn();
    const c = fakeController({ visiblePhotos, selection: { active: true, setActive: vi.fn(), ids: new Set([2]), setIds } });
    const { unmount } = render(<GalleryToolbar c={c} onShare={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^select all$/i }));
    expect(setIds).toHaveBeenCalledWith(new Set([1, 2, 3]));
    unmount();
    const all = fakeController({ visiblePhotos, selection: { active: true, setActive: vi.fn(), ids: new Set([1, 2, 3]), setIds } });
    render(<GalleryToolbar c={all} onShare={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: /^deselect all$/i });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    expect(setIds).toHaveBeenLastCalledWith(new Set());
  });

  it('disables Select all when nothing is on screen', () => {
    const c = fakeController({ selection: { active: true, setActive: vi.fn(), ids: new Set(), setIds: vi.fn() } });
    render(<GalleryToolbar c={c} onShare={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^select all$/i })).toBeDisabled();
  });

  it('locks download selected while the download is being prepared', () => {
    const c = fakeController({
      isDownloadingSelected: true,
      selection: { active: true, setActive: vi.fn(), ids: new Set([1, 2]), setIds: vi.fn() },
    });
    render(<GalleryToolbar c={c} onShare={vi.fn()} />);
    const button = screen.getByRole('button', { name: /preparing download/i });
    expect(button).toBeDisabled();
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('locks hide and show while a visibility change is on its way', () => {
    const c = fakeController({
      selection: { active: true, setActive: vi.fn(), ids: new Set([1]), setIds: vi.fn() },
      client: { ...fakeController().client, isClient: true, bulkVisibilityPending: true },
    });
    render(<GalleryToolbar c={c} onShare={vi.fn()} />);
    expect(screen.getByRole('button', { name: /hide selected/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /show selected/i })).toBeDisabled();
  });

  it('gives every selection control an icon', () => {
    const c = fakeController({
      offerFullPackage: true,
      selection: { active: true, setActive: vi.fn(), ids: new Set([1]), setIds: vi.fn() },
      client: { ...fakeController().client, isClient: true },
    });
    render(<GalleryToolbar c={c} onShare={vi.fn()} />);
    for (const name of [/select all/i, /download selected/i, /hide selected/i, /show selected/i, /get all photos/i, /cancel/i]) {
      expect(screen.getByRole('button', { name }).querySelector('svg')).not.toBeNull();
    }
  });

  it('stays non-compact without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<GalleryToolbar c={fakeController()} onShare={vi.fn()} />);
    expect(screen.getByTestId('gallery-toolbar').className).not.toMatch(/cg-toolbar-compact/);
  });

  it('turns compact once the sentinel has scrolled above the viewport', () => {
    let callback: IntersectionObserverCallback = () => {};
    class FakeObserver {
      constructor(cb: IntersectionObserverCallback) { callback = cb; }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() { return []; }
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    render(<GalleryToolbar c={fakeController()} onShare={vi.fn()} />);
    const bar = screen.getByTestId('gallery-toolbar');
    const fire = (isIntersecting: boolean, top: number) => React.act(() => {
      callback([{ isIntersecting, boundingClientRect: { top } } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    fire(false, 900);
    expect(bar.className).not.toMatch(/cg-toolbar-compact/);
    fire(false, -1);
    expect(bar.className).toMatch(/cg-toolbar-compact/);
    fire(true, 10);
    expect(bar.className).not.toMatch(/cg-toolbar-compact/);
  });
});

describe('GalleryToolbar fold', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the page from moving when the bar folds, by the height the fold took off', () => {
    let callback: IntersectionObserverCallback = () => {};
    class FakeObserver {
      constructor(cb: IntersectionObserverCallback) { callback = cb; }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() { return []; }
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('ResizeObserver', undefined);
    // Two rows unfolded, one row folded, as measured in the browser.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function rect(this: HTMLElement) {
      const height = this.classList.contains('cg-toolbar-compact') ? 60 : 120;
      return { height, top: 0, bottom: height, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    render(<GalleryToolbar c={fakeController()} onShare={vi.fn()} />);
    const bar = screen.getByTestId('gallery-toolbar');
    const fire = (isIntersecting: boolean, top: number) => React.act(() => {
      callback([{ isIntersecting, boundingClientRect: { top } } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(bar.style.marginBottom).toBe('');
    fire(false, -1);
    expect(bar.className).toMatch(/cg-toolbar-compact/);
    expect(bar.style.marginBottom).toBe('60px');
    fire(true, 10);
    expect(bar.style.marginBottom).toBe('');
  });
});
