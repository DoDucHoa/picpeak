import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhotoViewer } from '../viewer/PhotoViewer';
import { fakeController } from './fakeController';
import type { Photo } from '../../../types';

vi.mock('../../../components/common', () => ({
  AuthenticatedImage: ({ useCanvasRendering }: { useCanvasRendering?: boolean }) => (
    <img alt="" data-testid={useCanvasRendering ? 'viewer-canvas-image' : 'viewer-image'} />
  ),
}));

const mutate = vi.fn();
vi.mock('../../../hooks/useGallery', () => ({ useDownloadPhoto: () => ({ mutate }) }));

const refreshDownloadQuota = vi.fn();
vi.mock('../../../hooks/useDownloadQuota', () => ({ useRefreshDownloadQuota: () => refreshDownloadQuota }));

vi.mock('../../../services/analytics.service', () => ({ analyticsService: { trackDownload: vi.fn() } }));

const getPhotoFeedback = vi.fn();
vi.mock('../../../services/feedback.service', () => ({
  feedbackService: { getPhotoFeedback: (...args: unknown[]) => getPhotoFeedback(...args) },
}));

vi.mock('../../../components/gallery/PhotoComments', () => ({
  PhotoComments: ({ comments }: { comments: unknown[] }) => (
    <div data-testid="photo-comments">
      <span data-testid="comment-count">{comments.length}</span>
      <textarea aria-label="Your comment" />
    </div>
  ),
}));

const photos = Array.from({ length: 100 }, (_, i) => ({
  id: i + 1, filename: `p${i + 1}.jpg`, url: `/original/${i + 1}`, type: 'individual',
  size: 25480396, uploaded_at: '', width: 5152, height: 7728,
  slideshow_url: `/preview/${i + 1}`, thumbnail_url: `/thumb/${i + 1}`,
})) as Photo[];

function renderViewer(props: Partial<React.ComponentProps<typeof PhotoViewer>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PhotoViewer
        photos={photos} openId={2} onClose={vi.fn()} onNavigate={vi.fn()}
        c={fakeController()} onToggle={vi.fn()} {...props}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mutate.mockReset();
  refreshDownloadQuota.mockReset();
  getPhotoFeedback.mockReset();
  // jsdom does not implement scrolling; the filmstrip virtualiser calls it.
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
});

describe('PhotoViewer', () => {
  it('opens on the photo in the URL and steps with the arrow keys', async () => {
    const onNavigate = vi.fn();
    renderViewer({ onNavigate });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(3));
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(1));
  });

  it('wraps around at either end', () => {
    const onNavigate = vi.fn();
    renderViewer({ openId: 100, onNavigate });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it('leaves the arrow keys and Escape alone while the guest types a comment', async () => {
    getPhotoFeedback.mockResolvedValue({ feedback: [], summary: {}, my_feedback: {} });
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    renderViewer({ onNavigate, onClose, c: fakeController({ feedbackSettings: { feedback_enabled: true, allow_comments: true } }) });
    fireEvent.click(screen.getByRole('button', { name: /comments/i }));
    const textarea = await screen.findByRole('textbox', { name: 'Your comment' });
    fireEvent.keyDown(textarea, { key: 'ArrowRight' });
    fireEvent.keyDown(textarea, { key: 'ArrowLeft' });
    fireEvent.keyDown(textarea, { key: 'Escape' });
    // Let any swipe or close YARL might have started run out.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('photo-comments')).toBeTruthy();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    renderViewer({ onClose });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes an open side panel on the first Escape and the viewer on the second', () => {
    const onClose = vi.fn();
    renderViewer({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /file info/i }));
    expect(screen.getByText('5152 × 7728')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('5152 × 7728')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers no zoom buttons: pinch and the wheel zoom instead', () => {
    renderViewer();
    expect(screen.getByTestId('viewer-rail')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /zoom/i })).toBeNull();
  });

  it('mounts no more than three slides', () => {
    renderViewer({ openId: 50 });
    expect(document.querySelectorAll('.yarl__slide').length).toBeLessThanOrEqual(3);
  });

  it('shows the display rendition, never the original', () => {
    renderViewer({ openId: 50 });
    const sources = Array.from(document.querySelectorAll('.yarl__slide img')).map((img) => img.getAttribute('src'));
    expect(sources.length).toBeGreaterThan(0);
    sources.forEach((src) => expect(src).toMatch(/^\/preview\//));
  });

  it('draws the current slide on a canvas when the event asks for it', () => {
    renderViewer({ c: fakeController({ protection: { level: 'standard', disableRightClick: true, devtools: false, canvas: true } }) });
    expect(screen.getByTestId('viewer-canvas-image')).toBeTruthy();
  });

  it('closes from the back button', () => {
    const onClose = vi.fn();
    renderViewer({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows file info', () => {
    renderViewer();
    fireEvent.click(screen.getByRole('button', { name: /file info/i }));
    expect(screen.getByText('5152 × 7728')).toBeTruthy();
    expect(screen.getByText('24.3 MB')).toBeTruthy();
    expect(screen.getByText('p2.jpg')).toBeTruthy();
  });

  it('offers like, pick and comment only as far as the feedback settings allow', () => {
    renderViewer({ c: fakeController({ feedbackSettings: { feedback_enabled: true, allow_likes: false, allow_favorites: true, allow_comments: false } }) });
    expect(screen.queryByRole('button', { name: /^like$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /^pick$/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /comments/i })).toBeNull();
  });

  it('offers nothing to react with when feedback is off, and drops the divider with it', () => {
    renderViewer({ c: fakeController({ feedbackSettings: { feedback_enabled: false, allow_likes: true, allow_favorites: true, allow_comments: true } }) });
    expect(screen.queryByRole('button', { name: /^like$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^pick$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /comments/i })).toBeNull();
    expect(screen.queryByTestId('viewer-divider')).toBeNull();
  });

  it('keeps the divider under the reactions when there are some', () => {
    renderViewer();
    expect(screen.getByTestId('viewer-divider')).toBeTruthy();
  });

  it('toggles like and pick on the current photo', () => {
    const onToggle = vi.fn();
    renderViewer({ onToggle });
    fireEvent.click(screen.getByRole('button', { name: /^like$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^pick$/i }));
    expect(onToggle).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 2 }), 'like');
    expect(onToggle).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 2 }), 'favorite');
  });

  it('loads the comments of the current photo into the comment panel', async () => {
    getPhotoFeedback.mockResolvedValue({
      feedback: [{ id: 1, feedback_type: 'comment' }, { id: 2, feedback_type: 'like' }],
      summary: {}, my_feedback: {},
    });
    renderViewer({ c: fakeController({ feedbackSettings: { feedback_enabled: true, allow_comments: true } }) });
    fireEvent.click(screen.getByRole('button', { name: /comments/i }));
    await waitFor(() => expect(screen.getByTestId('comment-count').textContent).toBe('1'));
    expect(getPhotoFeedback).toHaveBeenCalledWith('s', '2');
  });

  it('downloads the current photo and re-reads the allowance afterwards', () => {
    renderViewer();
    fireEvent.click(screen.getByRole('button', { name: /download/i }));
    expect(mutate).toHaveBeenCalledWith(
      { slug: 's', photoId: 2, filename: 'p2.jpg' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    const [, handlers] = mutate.mock.calls[0];
    handlers.onSuccess();
    expect(refreshDownloadQuota).toHaveBeenCalledWith('s');
  });

  it('routes a refused download through the gate', () => {
    const c = fakeController();
    renderViewer({ c });
    fireEvent.click(screen.getByRole('button', { name: /download/i }));
    const [, handlers] = mutate.mock.calls[0];
    const error = new Error('402');
    handlers.onError(error);
    expect(c.downloadGate.reportDownloadFailure).toHaveBeenCalledWith(error);
  });

  it('opens the offer instead of downloading when the allowance is spent', () => {
    const c = fakeController();
    c.downloadGate = { ...c.downloadGate, quotaEnabled: true, isClient: true, remaining: 0 };
    renderViewer({ c });
    fireEvent.click(screen.getByRole('button', { name: /download/i }));
    expect(mutate).not.toHaveBeenCalled();
    expect(c.downloadGate.offerForBlockedDownload).toHaveBeenCalled();
  });

  it('has no download button when the gallery does not allow downloads', () => {
    renderViewer({ c: fakeController({ allowDownloads: false }) });
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull();
  });
});
