import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Renders the English default with its interpolations, so an assertion reads
// the sentence the viewer sees rather than a key.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, second?: unknown, third?: unknown) => {
      const fallback = typeof second === 'string' ? second : key;
      const vars = (typeof second === 'object' && second !== null ? second : third) as Record<string, unknown> | undefined;
      return fallback.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(vars?.[name] ?? ''));
    },
    i18n: { language: 'en' },
  }),
  Trans: ({ defaults }: { defaults?: string }) => <>{defaults}</>,
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('react-toastify', () => ({ toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) } }));
import { ClientGallery } from '../ClientGallery';
import { fakeController } from './fakeController';
import type { GalleryController } from '../state/useGalleryController';
import type { GalleryData, Photo } from '../../../types';

let controller: GalleryController;
vi.mock('../state/useGalleryController', () => ({
  useGalleryController: () => controller,
}));

const toggle = vi.fn();
// Swapped per test: true while a feedback prompt or the limit modal is up.
const feedback = { blocking: false };
vi.mock('../state/useFeedbackToggle', () => ({
  useFeedbackToggle: () => ({ toggle, modals: null, blocking: feedback.blocking }),
}));

// The viewer is YARL, which portals and animates; a stand-in that shows what
// it was handed is enough to check the wiring.
const viewerProps = vi.fn();
vi.mock('../viewer/PhotoViewer', () => ({
  PhotoViewer: (props: { openId: number | null }) => {
    viewerProps(props);
    return props.openId === null ? null : <div data-testid="photo-viewer" />;
  },
}));

vi.mock('../../../components/common', () => ({
  AuthenticatedImage: () => <img alt="" />,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
  MarkdownContent: ({ source }: { source: string }) => <div>{source}</div>,
}));
vi.mock('../../../components/common/LanguageSelector', () => ({ LanguageSelector: () => null }));
vi.mock('../../../contexts/GuestIdentityContext', () => ({
  GuestIdentityProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../../components/gallery/GuestNamePromptModal', () => ({ GuestNamePromptModal: () => null }));
vi.mock('../../../components/gallery/GuestRecoveryModal', () => ({ GuestRecoveryModal: () => null }));
vi.mock('../../../components/gallery/DownloadQuotaDialog', () => ({
  DownloadQuotaDialog: () => <div data-testid="quota-dialog" />,
}));

const photos = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1, filename: `p${i + 1}.jpg`, url: `/o/${i + 1}`, slideshow_url: `/p/${i + 1}`, type: 'individual',
  size: 1000, uploaded_at: '2026-01-01', width: 4000, height: 6000,
})) as Photo[];

const seed = { id: 1, event_name: 'Summer Wedding', event_type: 'wedding', event_date: null, expires_at: null };

const data = { event: { id: 1, event_name: 'Summer Wedding' }, photos } as unknown as GalleryData;

function withUrl(patch: Partial<GalleryController['url']>, extra: Partial<GalleryController> = {}) {
  const base = fakeController();
  return fakeController({ data, visiblePhotos: photos, scopedPhotos: photos, url: { ...base.url, ...patch }, ...extra });
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  // jsdom does not implement scrolling; the virtualisers call it on mount.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  viewerProps.mockClear();
  feedback.blocking = false;
  controller = withUrl({});
});

describe('ClientGallery', () => {
  it('renders the cover, the tabs and the grid inside the scoped root', () => {
    const { container } = render(<ClientGallery slug="s" event={seed} />);
    expect(container.firstElementChild?.classList.contains('client-gallery')).toBe(true);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Summer Wedding');
    expect(screen.getAllByRole('tab').length).toBe(3);
    expect(screen.getAllByTestId('grid-tile').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('list-row')).toBeNull();
    expect(screen.queryByTestId('photo-viewer')).toBeNull();
  });

  it('swaps the grid for the list when the URL says list', () => {
    const { rerender } = render(<ClientGallery slug="s" event={seed} />);
    controller = withUrl({ view: 'list' });
    rerender(<ClientGallery slug="s" event={seed} />);
    expect(screen.queryByTestId('grid-tile')).toBeNull();
    expect(screen.getAllByTestId('list-row').length).toBeGreaterThan(0);
  });

  it('mounts the viewer for the photo in the URL, closing and stepping through the controller', () => {
    controller = withUrl({ photo: 3 });
    render(<ClientGallery slug="s" event={seed} />);
    expect(screen.getByTestId('photo-viewer')).toBeTruthy();
    const props = viewerProps.mock.lastCall![0] as { onClose: () => void; onNavigate: (id: number) => void };
    expect(props.onClose).toBe(controller.closePhoto);
    props.onNavigate(4);
    expect(controller.openPhoto).toHaveBeenCalledWith(4, 'replace');
  });

  it('keeps the handlers it gives the viewer stable across renders', () => {
    controller = withUrl({ photo: 3 });
    const { rerender } = render(<ClientGallery slug="s" event={seed} />);
    const first = viewerProps.mock.lastCall![0] as { onNavigate: unknown; onToggle: unknown };
    rerender(<ClientGallery slug="s" event={seed} />);
    const second = viewerProps.mock.lastCall![0] as { onNavigate: unknown; onToggle: unknown };
    expect(second.onNavigate).toBe(first.onNavigate);
    expect(second.onToggle).toBe(first.onToggle);
  });

  it('falls back to the all tab when the open tab is switched off for the event', () => {
    controller = withUrl({ tab: 'liked' }, {
      feedbackSettings: { feedback_enabled: true, allow_likes: false, allow_favorites: true },
    });
    const { rerender } = render(<ClientGallery slug="s" event={seed} />);
    rerender(<ClientGallery slug="s" event={seed} />);
    expect(controller.setTab).toHaveBeenCalledTimes(1);
    expect(controller.setTab).toHaveBeenCalledWith('all');
  });

  it('falls back from the picked tab when feedback is off altogether', () => {
    controller = withUrl({ tab: 'picked' }, { feedbackSettings: { feedback_enabled: false } });
    render(<ClientGallery slug="s" event={seed} />);
    expect(controller.setTab).toHaveBeenCalledWith('all');
  });

  it('leaves a visible tab, and waits for the feedback settings before judging one', () => {
    controller = withUrl({ tab: 'liked' }, { feedbackSettings: undefined });
    const { rerender } = render(<ClientGallery slug="s" event={seed} />);
    controller = withUrl({ tab: 'liked' });
    rerender(<ClientGallery slug="s" event={seed} />);
    expect(controller.setTab).not.toHaveBeenCalled();
  });

  it('closes the viewer when a refused download raises the quota dialog', () => {
    controller = withUrl({ photo: 3 });
    const { rerender } = render(<ClientGallery slug="s" event={seed} />);
    const close = controller.closePhoto;
    expect(close).not.toHaveBeenCalled();
    controller = { ...controller, quotaOffer: { exceeded: null } };
    rerender(<ClientGallery slug="s" event={seed} />);
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('quota-dialog')).toBeTruthy();
  });

  it('does not touch the viewer when the quota dialog opens with no photo open', () => {
    const { rerender } = render(<ClientGallery slug="s" event={seed} />);
    controller = { ...controller, quotaOffer: { exceeded: null } };
    rerender(<ClientGallery slug="s" event={seed} />);
    expect(controller.closePhoto).not.toHaveBeenCalled();
  });

  it('closes the viewer when a feedback prompt or the limit modal opens behind it', () => {
    controller = withUrl({ photo: 3 });
    const { rerender } = render(<ClientGallery slug="s" event={seed} />);
    expect(controller.closePhoto).not.toHaveBeenCalled();
    feedback.blocking = true;
    rerender(<ClientGallery slug="s" event={seed} />);
    expect(controller.closePhoto).toHaveBeenCalledTimes(1);
  });

  it('leaves the album alone when a feedback prompt opens with no photo open', () => {
    const { rerender } = render(<ClientGallery slug="s" event={seed} />);
    feedback.blocking = true;
    rerender(<ClientGallery slug="s" event={seed} />);
    expect(controller.closePhoto).not.toHaveBeenCalled();
  });

  it('keeps an unliked photo in the viewer until it closes, showing it unliked', () => {
    const liked = photos.map((p) => ({ ...p, is_liked: p.id <= 5 }));
    const likedData = { ...data, photos: liked } as GalleryData;
    controller = withUrl({ tab: 'liked', photo: 3 }, { data: likedData, visiblePhotos: liked.filter((p) => p.is_liked) });
    const { rerender } = render(<ClientGallery slug="s" event={seed} />);
    // The guest unlikes photo 3: the liked tab no longer holds it.
    const after = liked.map((p) => (p.id === 3 ? { ...p, is_liked: false } : p));
    controller = { ...controller, data: { ...likedData, photos: after } as GalleryData, visiblePhotos: after.filter((p) => p.is_liked) };
    rerender(<ClientGallery slug="s" event={seed} />);
    const shown = (viewerProps.mock.lastCall![0] as { photos: Photo[] }).photos;
    expect(shown.map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
    expect(shown.find((p) => p.id === 3)?.is_liked).toBe(false);
    expect(controller.closePhoto).not.toHaveBeenCalled();
    // Closed and reopened, the viewer follows the tab again.
    controller = { ...controller, url: { ...controller.url, photo: null } };
    rerender(<ClientGallery slug="s" event={seed} />);
    controller = { ...controller, url: { ...controller.url, photo: 4 } };
    rerender(<ClientGallery slug="s" event={seed} />);
    expect((viewerProps.mock.lastCall![0] as { photos: Photo[] }).photos.map((p) => p.id)).toEqual([1, 2, 4, 5]);
  });

  it('closes the viewer when its photo is deleted from the gallery', () => {
    controller = withUrl({ photo: 3 });
    const { rerender } = render(<ClientGallery slug="s" event={seed} />);
    const remaining = photos.filter((p) => p.id !== 3);
    controller = { ...controller, data: { ...data, photos: remaining } as GalleryData, visiblePhotos: remaining };
    rerender(<ClientGallery slug="s" event={seed} />);
    expect(controller.closePhoto).toHaveBeenCalledTimes(1);
  });

  it('logs out once on a 401, from an effect rather than on every render', () => {
    controller = fakeController({ error: { response: { status: 401 } } });
    const { container, rerender } = render(<ClientGallery slug="s" event={seed} />);
    rerender(<ClientGallery slug="s" event={seed} />);
    rerender(<ClientGallery slug="s" event={seed} />);
    expect(controller.logout).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe('');
  });

  it('says so when the liked tab is empty', () => {
    controller = fakeController({ data, url: { ...fakeController().url, tab: 'liked' } });
    render(<ClientGallery slug="s" event={seed} />);
    expect(screen.getByText('No liked photos yet')).toBeTruthy();
  });

  it('shows the client banner with the visibility count', () => {
    controller = withUrl({}, {
      client: { ...fakeController().client, isClient: true, visibleCount: 28, totalCount: 30 },
    });
    render(<ClientGallery slug="s" event={seed} />);
    expect(screen.getByTestId('client-banner').textContent).toContain('28 of 30 photos visible to guests');
  });

  it('says so when the album or an open folder has no photos', () => {
    controller = fakeController({ data });
    render(<ClientGallery slug="s" event={seed} />);
    expect(screen.getByText('No photos yet')).toBeTruthy();
  });

  it('leaves the empty line out when the folder tiles are the whole root', () => {
    const base = fakeController();
    controller = fakeController({ data, folders: { ...base.folders, rootIsFoldersOnly: true } });
    render(<ClientGallery slug="s" event={seed} />);
    expect(screen.queryByText('No photos yet')).toBeNull();
  });

  it('moves the album to the grid when a selection starts in the list', () => {
    controller = withUrl({ view: 'list' });
    const { rerender } = render(<ClientGallery slug="s" event={seed} />);
    expect(controller.setView).not.toHaveBeenCalled();
    controller = { ...controller, selection: { ...controller.selection, active: true } };
    rerender(<ClientGallery slug="s" event={seed} />);
    expect(controller.setView).toHaveBeenCalledWith('grid');
  });
});

describe('ClientGallery share', () => {
  const nav = navigator as Navigator & { share?: unknown; clipboard?: unknown };
  const share = () => fireEvent.click(screen.getByRole('button', { name: 'Share' }));

  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
    Object.defineProperty(nav, 'share', { configurable: true, value: undefined });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, origin: 'https://photos.example', pathname: '/gallery/s', search: '?photo=3' },
    });
    document.execCommand = vi.fn(() => true);
  });

  it('copies the bare gallery address with the clipboard API', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(nav, 'clipboard', { configurable: true, value: { writeText } });
    render(<ClientGallery slug="s" event={seed} />);
    share();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Link copied'));
    expect(writeText).toHaveBeenCalledWith('https://photos.example/gallery/s');
    expect(document.execCommand).not.toHaveBeenCalled();
  });

  it('falls back to execCommand when the clipboard API refuses', async () => {
    Object.defineProperty(nav, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => { throw new Error('denied'); }) } });
    render(<ClientGallery slug="s" event={seed} />);
    share();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Link copied'));
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('falls back to execCommand when there is no clipboard API at all', async () => {
    Object.defineProperty(nav, 'clipboard', { configurable: true, value: undefined });
    render(<ClientGallery slug="s" event={seed} />);
    share();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Link copied'));
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('says so when every way to copy fails', async () => {
    Object.defineProperty(nav, 'clipboard', { configurable: true, value: undefined });
    document.execCommand = vi.fn(() => false);
    render(<ClientGallery slug="s" event={seed} />);
    share();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Could not copy the link'));
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
