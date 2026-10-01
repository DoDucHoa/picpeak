import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useGalleryController } from '../state/useGalleryController';

const photos = [
  { id: 1, filename: 'a.jpg', url: '/1', type: 'individual', size: 1, uploaded_at: '2026-01-01', is_liked: false },
  { id: 2, filename: 'b.jpg', url: '/2', type: 'individual', size: 1, uploaded_at: '2026-01-02', is_liked: true },
];

vi.mock('../../../hooks/useGallery', () => ({
  useGalleryPhotos: () => ({ data: { event: { id: 1 }, photos, categories: [] }, isLoading: false, error: null, refetch: vi.fn() }),
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

beforeEach(() => window.history.replaceState(null, '', '/gallery/s'));

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
});
