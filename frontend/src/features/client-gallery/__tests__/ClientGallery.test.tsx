import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ClientGallery } from '../ClientGallery';
import { fakeController } from './fakeController';
import type { GalleryController } from '../state/useGalleryController';
import type { GalleryData, Photo } from '../../../types';

let controller: GalleryController;
vi.mock('../state/useGalleryController', () => ({
  useGalleryController: () => controller,
}));

const toggle = vi.fn();
vi.mock('../state/useFeedbackToggle', () => ({
  useFeedbackToggle: () => ({ toggle, modals: null }),
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
    expect(screen.getByTestId('client-banner')).toBeTruthy();
  });
});
