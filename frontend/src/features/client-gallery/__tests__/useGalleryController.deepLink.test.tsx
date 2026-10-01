import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useGalleryController } from '../state/useGalleryController';

const photos = [
  { id: 1, filename: 'a.jpg', url: '/1', type: 'individual', size: 1, uploaded_at: '2026-01-01', is_liked: false },
  { id: 2, filename: 'b.jpg', url: '/2', type: 'individual', size: 1, uploaded_at: '2026-01-02', is_liked: true },
];
const folderPhotos = [
  ...photos,
  { id: 5, filename: 'e.jpg', url: '/5', type: 'individual', size: 1, uploaded_at: '2026-01-05', is_liked: false, category_id: 9 },
];
const folderCategories = [{ id: 9, name: 'Ceremony', slug: 'c', is_global: false, is_folder: true }];

// Swapped per test; the mocked hook reads it on every render.
const gallery = vi.hoisted(() => ({
  data: null as unknown,
}));

vi.mock('../../../hooks/useGallery', () => ({
  useGalleryPhotos: () => ({ data: gallery.data, isLoading: false, error: null, refetch: vi.fn() }),
  useDownloadAllPhotos: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../../../hooks/useDownloadQuota', () => ({
  useDownloadQuota: () => ({ quota: null, downloadedIds: new Set(), packages: [], pendingOrder: null, currency: 'EUR', refetch: vi.fn() }),
  useRefreshDownloadQuota: () => vi.fn(),
}));
vi.mock('../../../contexts', () => ({
  useGalleryAuth: () => ({ logout: vi.fn(), isClient: false, viaCustomer: false }),
}));
vi.mock('../../../services/feedback.service', () => ({
  feedbackService: { getGalleryFeedbackSettings: async () => ({ feedback_enabled: true }), getMyFeedback: async () => [] },
}));
vi.mock('../../../hooks/usePublicSettings', () => ({ usePublicSettings: () => ({ data: {} }) }));
vi.mock('../../../hooks/useWatermarkSettings', () => ({ useWatermarkSettings: () => ({ watermarkEnabled: false }) }));
vi.mock('../../../hooks/useDevToolsProtection', () => ({ useDevToolsProtection: () => undefined }));
vi.mock('../../../services/analytics.service', () => ({
  analyticsService: { trackGalleryEvent: vi.fn(), trackExpirationWarning: vi.fn() },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);
const seed = { id: 1, event_name: 'E', event_type: 'wedding', event_date: null, expires_at: null };

beforeEach(() => {
  gallery.data = { event: { id: 1 }, photos, categories: [] };
  window.history.replaceState(null, '', '/gallery/s');
  // Entering a folder scrolls to the top, which jsdom does not implement.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('deep link to a photo', () => {
  it('switches to the all tab when the photo is filtered out', async () => {
    window.history.replaceState(null, '', '/gallery/s?tab=liked&photo=1');
    const { result } = renderHook(() => useGalleryController('s', seed, false), { wrapper });
    await waitFor(() => expect(result.current.url.tab).toBe('all'));
    expect(result.current.url.photo).toBe(1);
  });

  it('drops a photo id that does not exist', async () => {
    window.history.replaceState(null, '', '/gallery/s?photo=999');
    const { result } = renderHook(() => useGalleryController('s', seed, false), { wrapper });
    await waitFor(() => expect(result.current.url.photo).toBeNull());
    expect(window.location.search).not.toContain('photo=');
  });

  it('opens the folder holding the photo without adding a history entry', async () => {
    gallery.data = { event: { id: 1 }, photos: folderPhotos, categories: folderCategories };
    window.history.replaceState(null, '', '/gallery/s?photo=5');
    const before = window.history.length;
    const { result } = renderHook(() => useGalleryController('s', seed, false), { wrapper });
    await waitFor(() => expect(result.current.folders.open?.id).toBe(9));
    expect(new URLSearchParams(window.location.search).get('folder')).toBe('c-9');
    expect(result.current.url.photo).toBe(5);
    expect(window.history.length).toBe(before);
  });

  it('does not push again when Back lands on the folder-less link', async () => {
    gallery.data = { event: { id: 1 }, photos: folderPhotos, categories: folderCategories };
    window.history.replaceState(null, '', '/gallery/s?photo=5');
    const before = window.history.length;
    const { result } = renderHook(() => useGalleryController('s', seed, false), { wrapper });
    await waitFor(() => expect(result.current.folders.open?.id).toBe(9));

    act(() => {
      window.history.replaceState(null, '', '/gallery/s?photo=5');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => expect(result.current.folders.open?.id).toBe(9));
    expect(window.history.length).toBe(before);
  });
});

describe('closePhoto', () => {
  it('steps back through history when the photo was opened in the app', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { result } = renderHook(() => useGalleryController('s', seed, false), { wrapper });
    act(() => result.current.openPhoto(1));
    expect(result.current.url.photo).toBe(1);
    act(() => result.current.closePhoto());
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('replaces the entry when the photo came from a deep link', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    window.history.replaceState(null, '', '/gallery/s?photo=1');
    const before = window.history.length;
    const { result } = renderHook(() => useGalleryController('s', seed, false), { wrapper });
    expect(result.current.url.photo).toBe(1);
    act(() => result.current.closePhoto());
    expect(back).not.toHaveBeenCalled();
    expect(result.current.url.photo).toBeNull();
    expect(window.location.search).not.toContain('photo=');
    expect(window.history.length).toBe(before);
  });
});
