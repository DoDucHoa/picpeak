/**
 * The event page's one save model (spec 5.2), end to end on the page:
 * opening Settings on a legacy event changes nothing; a save sends only what
 * changed, in order; a failed request keeps only its part; Discard restores;
 * a tab change never prompts and leaving the page does; archived events and
 * users without events.edit get a read-only Settings tab.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmDialogProvider } from '../../../components/common/ConfirmDialog';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k),
      i18n: { language: 'en' },
    }),
  };
});

vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const getEvent = vi.fn();
const updateEvent = vi.fn();
vi.mock('../../../services/events.service', () => ({
  eventsService: {
    getEvent: (...args: unknown[]) => getEvent(...args),
    updateEvent: (...args: unknown[]) => updateEvent(...args),
    getEventCategories: vi.fn().mockResolvedValue([]),
    getGalleryPasswordStatus: vi.fn().mockResolvedValue({ enabled: false }),
    deleteEvent: vi.fn(),
    extendExpiration: vi.fn(),
    duplicateEvent: vi.fn(),
    publishEvent: vi.fn(),
    renameEvent: vi.fn(),
    revealEvent: vi.fn(),
    archiveEvent: vi.fn(),
    sendGalleryEmail: vi.fn(),
  },
}));

vi.mock('../../../services/photos.service', () => ({
  CREDIT_FILTER_NONE: '__none__',
  photosService: {
    getEventPhotos: vi.fn().mockResolvedValue([]),
    getFilterSummary: vi.fn().mockResolvedValue({}),
    getExportFormats: vi.fn().mockResolvedValue([]),
    getPhotoCredits: vi.fn().mockResolvedValue({ credits: [], none: 0 }),
  },
}));

// What the backend answers for a gallery without a feedback row.
const FEEDBACK_DEFAULTS = {
  feedback_enabled: false, allow_ratings: true, allow_likes: true, allow_comments: true,
  allow_favorites: true, allow_reactions: true, allow_color_labels: false, keybind_mode: 'colors',
  require_name_email: false, moderate_comments: true, show_feedback_to_guests: true, identity_mode: 'simple',
};
const getFeedback = vi.fn();
const updateFeedback = vi.fn();
vi.mock('../../../services/feedback.service', async () => ({
  ...(await vi.importActual<object>('../../../services/feedback.service')),
  feedbackService: {
    getEventFeedbackSettings: (...args: unknown[]) => getFeedback(...args),
    updateEventFeedbackSettings: (...args: unknown[]) => updateFeedback(...args),
  },
}));

vi.mock('../../../services/cssTemplates.service', () => ({
  cssTemplatesService: { getEnabledTemplates: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../../config/api', () => ({
  api: {
    get: vi.fn(async (url: string) => {
      if (url.includes('/download-quota')) {
        return { data: {
          quota: { enabled: false, unlimited: false, freeLimit: 20, pricePerPhoto: 1, total: 20, used: 0, remaining: 20, enabledAt: null },
          settings: null, pending_order: null, currency: 'EUR',
        } };
      }
      if (url.includes('/download-resolutions')) {
        return { data: {
          overrides: { download_standard_resolution: null, download_resolution_picker_enabled: null, download_allow_original: null },
          globals: { standard_resolution: 'original', picker_enabled: false, allow_original: false, resolutions: [] },
          effective: { standard: 'original', picker_enabled: false, allow_original: false },
        } };
      }
      return { data: [] };
    }),
    put: vi.fn(async () => ({ data: {} })),
    patch: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: {} })),
  },
}));

vi.mock('../../../hooks/usePublicSettings', () => ({
  PUBLIC_SETTINGS_QUERY_KEY: ['public-settings'],
  usePublicSettings: () => ({ data: {} }),
}));

vi.mock('../../../contexts/FeatureFlagsContext', () => ({
  useFeatureFlags: () => ({ flags: {}, isLoading: false }),
  useFeatureEnabled: () => false,
}));

const hasPermissionMock = vi.fn(() => true);
vi.mock('../../../contexts/PermissionsContext', () => ({
  usePermissions: () => ({ hasAnyPermission: () => true, hasPermission: hasPermissionMock, isLoading: false }),
}));

import { EventDetailsPage } from '../EventDetailsPage';

// A legacy event: NULL theme, SQLite 0/1 booleans, NULL hero logo fields.
const legacyEvent = {
  id: 7, slug: 'legacy', event_name: 'Legacy', event_type: 'wedding', event_date: '2020-06-01',
  expires_at: '2030-01-01T00:00:00.000Z', color_theme: null, header_style: 'standard', hero_divider_style: 'wave',
  hero_logo_visible: null, hero_logo_size: null, login_logo_visible: 0, allow_downloads: 1, external_watch: 0,
  og_image_share_enabled: 0, require_password: 1, customer_name: 'Anna', customer_email: 'anna@example.com',
  is_archived: 0, client_access_enabled: 0, source_mode: 'managed', is_active: 1, photo_count: 0,
};

let queryClient: QueryClient;

async function open(entry = '/admin/events/7?tab=settings') {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/admin/events/:id', element: <EventDetailsPage /> },
      { path: '/admin/events', element: <div>events list</div> },
    ],
    { initialEntries: [entry] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <ConfirmDialogProvider>
        <RouterProvider router={router} />
      </ConfirmDialogProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole('navigation', { name: 'Event settings' });
  return router;
}

const bar = () => screen.queryByRole('region', { name: /unsaved changes/i });
const rail = () => screen.getByRole('navigation', { name: 'Event settings' });
const goTo = (name: RegExp) => userEvent.click(within(rail()).getByRole('button', { name }));
const saveButton = () => within(bar() as HTMLElement).getByRole('button', { name: /Save$/ });
const nameField = () => screen.findByPlaceholderText('events.hostNamePlaceholder');
// The first switch inside the section, not the Expert mode switch above it.
const firstSectionCheckbox = async () => {
  await screen.findByRole('group');
  return within(screen.getByRole('group')).getAllByRole('checkbox')[0] as HTMLInputElement;
};
const setPhotoLimit = async (value: string) => {
  await goTo(/^Advanced/);
  await userEvent.click(screen.getByRole('button', { name: 'Show advanced options' }));
  const field = screen.getByRole('spinbutton');
  await userEvent.clear(field);
  await userEvent.type(field, value);
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  hasPermissionMock.mockReturnValue(true);
  getEvent.mockResolvedValue(legacyEvent);
  getFeedback.mockResolvedValue(FEEDBACK_DEFAULTS);
  updateEvent.mockResolvedValue({});
  updateFeedback.mockResolvedValue({});
});
afterEach(cleanup);

describe('event Settings save model', () => {
  it('opens every section of a legacy event with zero changes', async () => {
    await open();
    for (const name of [/^Details/, /^Access/, /^Appearance/, /^Guest interaction/, /^Downloads/, /^Advanced/]) {
      await goTo(name);
      expect(bar()).toBeNull();
    }
  });

  it('sends only the changed field and never customer_account_ids', async () => {
    await open();
    await setPhotoLimit('40');
    await userEvent.click(saveButton());
    await waitFor(() => expect(updateEvent).toHaveBeenCalledWith(7, { photo_cap: 40 }));
    expect(updateFeedback).not.toHaveBeenCalled();
    await waitFor(() => expect(bar()).toBeNull());
  });

  it('keeps an extended expiry when another field is saved', async () => {
    await open();
    getEvent.mockResolvedValue({ ...legacyEvent, expires_at: '2030-01-08T00:00:00.000Z' });
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['admin-event', '7'] }); });
    await userEvent.type(await nameField(), 'x');
    await userEvent.click(saveButton());
    await waitFor(() => expect(updateEvent).toHaveBeenCalled());
    expect(updateEvent.mock.calls[0][1]).toEqual({ customer_name: 'Annax' });
  });

  it('keeps only the failed part, and a retry resends only that part', async () => {
    updateFeedback.mockRejectedValueOnce(new Error('500'));
    await open('/admin/events/7?tab=settings&section=guests');
    await userEvent.click((await firstSectionCheckbox()));
    await setPhotoLimit('40');
    await userEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/Not saved/);
    expect(updateEvent).toHaveBeenCalledTimes(1);
    expect(bar()).not.toBeNull();
    await userEvent.click(saveButton());
    await waitFor(() => expect(updateFeedback).toHaveBeenCalledTimes(2));
    expect(updateEvent).toHaveBeenCalledTimes(1);
  });

  it('restores the feedback toggles on Discard', async () => {
    await open('/admin/events/7?tab=settings&section=guests');
    const toggle = (await firstSectionCheckbox()) as HTMLInputElement;
    const before = toggle.checked;
    await userEvent.click(toggle);
    expect(bar()).not.toBeNull();
    await userEvent.click(within(bar() as HTMLElement).getByRole('button', { name: 'Discard' }));
    expect((await firstSectionCheckbox()).checked).toBe(before);
    expect(bar()).toBeNull();
  });

  it('asks before leaving the page, not before changing tab', async () => {
    const router = await open();
    await userEvent.type(await nameField(), 'x');
    await act(async () => { await router.navigate('/admin/events/7?tab=photos'); });
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => { await router.navigate('/admin/events'); });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  // The draft belongs to one event. React Router keeps the page mounted from
  // /admin/events/7 to /admin/events/8, and the page's own redirect after a
  // duplicate passes the guard on purpose, so the draft must not follow.
  it('starts clean on another event, whichever way the user got there', async () => {
    getEvent.mockImplementation(async (eventId: number) => (eventId === 8
      ? { ...legacyEvent, id: 8, customer_name: 'Bert' }
      : legacyEvent));
    const router = await open();
    await userEvent.type(await nameField(), 'x');
    expect(bar()).not.toBeNull();
    await act(async () => { await router.navigate('/admin/events/8?tab=settings'); });
    await userEvent.click(await screen.findByRole('button', { name: 'Discard and leave' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/events/8'));
    expect(await screen.findByDisplayValue('Bert')).toBeInTheDocument();
    expect(bar()).toBeNull();
  });

  it.each([
    ['a user without events.edit', false, 0],
    ['an archived event', true, 1],
  ])('is read-only for %s', async (_label, permitted, archived) => {
    hasPermissionMock.mockReturnValue(permitted as boolean);
    getEvent.mockResolvedValue({ ...legacyEvent, is_archived: archived });
    await open();
    expect(await nameField()).toBeDisabled();
    expect(bar()).toBeNull();
  });
});
