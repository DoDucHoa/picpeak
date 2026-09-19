/**
 * The download-quota gate (and the badge showing how many downloads are
 * left) both read `isClient` off this context. `/auth/session` is the
 * server's own, authoritative answer for what the CURRENT request actually
 * authenticates as: it must win over the per-tab sessionStorage guess the
 * effect sets optimistically before the network call resolves.
 *
 * #1149 already covered guest-guess -> server-says-client (a second tab with
 * no sessionStorage but the same cookie). The mirror case was missing: a
 * stale 'client' guess left over from an earlier login, with the server now
 * saying this request is 'guest' (a fresh tab with no bearer token to send,
 * a dropped cookie, …). Without reconciling it, the quota badge and every
 * download button's client-side prediction kept showing "client" right up to
 * the moment a real download came back 403 "clients only", confusing
 * because nothing in the UI ever explained why.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../config/api', () => ({
  api: { get: vi.fn() },
}));

// Unrelated to what this test covers: sidesteps a Node 25 environment quirk
// where the native `localStorage` global this real, unmocked util also
// touches lacks a working `removeItem` under this test runner.
vi.mock('../../utils/cleanupGalleryAuth', () => ({
  cleanupOldGalleryAuth: vi.fn(),
}));

vi.mock('../../services', () => ({
  authService: {},
  galleryService: {
    getGalleryPhotos: vi.fn().mockResolvedValue({
      event: { id: 1, event_name: 'Wedding', event_type: 'wedding', event_date: null, expires_at: null },
    }),
  },
}));

let GalleryAuthProvider: typeof import('../GalleryAuthContext').GalleryAuthProvider;
let useGalleryAuth: typeof import('../GalleryAuthContext').useGalleryAuth;
let apiMock: { get: ReturnType<typeof vi.fn> };

const SLUG = 'wedding';

function Probe() {
  const { isClient, isLoading } = useGalleryAuth();
  if (isLoading) return <div>loading</div>;
  return <div data-testid="probe">{isClient ? 'client' : 'guest'}</div>;
}

function renderProvider() {
  return render(
    <MemoryRouter initialEntries={[`/gallery/${SLUG}`]}>
      <GalleryAuthProvider>
        <Probe />
      </GalleryAuthProvider>
    </MemoryRouter>,
  );
}

describe('GalleryAuthContext: reconciling the stored access-level guess against the server', () => {
  beforeEach(async () => {
    vi.resetModules();
    sessionStorage.clear();
    ({ GalleryAuthProvider, useGalleryAuth } = await import('../GalleryAuthContext'));
    apiMock = (await import('../../config/api')).api as any;
    apiMock.get.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downgrades to guest when a stale client guess disagrees with the server', async () => {
    sessionStorage.setItem(`gallery_access_level_${SLUG}`, 'client');
    apiMock.get.mockResolvedValue({
      data: { valid: true, type: 'gallery', eventSlug: SLUG, accessLevel: 'guest', viaCustomer: false },
    });

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('guest'));
    expect(sessionStorage.getItem(`gallery_access_level_${SLUG}`)).toBeNull();
  });

  it('still upgrades to client when the server outranks a guest guess (#1149)', async () => {
    apiMock.get.mockResolvedValue({
      data: { valid: true, type: 'gallery', eventSlug: SLUG, accessLevel: 'client', viaCustomer: false },
    });

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('client'));
    expect(sessionStorage.getItem(`gallery_access_level_${SLUG}`)).toBe('client');
  });
});
