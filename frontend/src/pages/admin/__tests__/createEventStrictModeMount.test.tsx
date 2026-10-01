/**
 * CreateEventPage guarded toast + redirect behind isMountedRef. React 18
 * Strict Mode runs mount → cleanup → mount in development; without re-arming
 * the ref in the effect body it stayed false and the success path never ran
 * (fork survey A6 / #1563).
 */
import React, { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ConfirmDialogProvider } from '../../../components/common/ConfirmDialog';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

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

const toastSuccess = vi.fn();
vi.mock('react-toastify', () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn(), info: vi.fn() },
}));

const createEvent = vi.fn();
vi.mock('../../../services/events.service', () => ({
  eventsService: { createEvent: (...args: unknown[]) => createEvent(...args) },
}));

vi.mock('../../../services/categories.service', () => ({
  categoriesService: { getCategories: vi.fn(async () => []) },
}));
vi.mock('../../../services/settings.service', () => ({
  settingsService: { getAllSettings: vi.fn(async () => ({})) },
}));
vi.mock('../../../services/eventTypes.service', () => ({
  eventTypesService: { getEventTypes: vi.fn(async () => []) },
}));
vi.mock('../../../services/userManagement.service', () => ({
  userManagementService: { getUsers: vi.fn(async () => []) },
}));

vi.mock('../../../hooks/usePublicSettings', () => ({
  PUBLIC_SETTINGS_QUERY_KEY: ['public-settings'],
  usePublicSettings: () => ({
    data: {
      event_require_customer_name: false,
      event_require_customer_email: false,
      event_require_event_date: false,
      event_require_expiration: false,
      event_default_require_password: false,
    },
  }),
}));

vi.mock('../../../contexts/AdminAuthContext', () => ({
  useAdminAuth: () => ({ user: null }),
}));

vi.mock('../../../contexts/FeatureFlagsContext', () => ({
  useFeatureFlags: () => ({ flags: {}, isLoading: false }),
  useFeatureEnabled: () => false,
}));

vi.mock('../../../components/admin', async () => {
  const actual = await vi.importActual<any>('../../../components/admin');
  return {
    ...actual,
    WelcomeMessageEditor: () => null,
    FeedbackSettings: () => null,
  };
});
vi.mock('../../../components/admin/CustomerAccountPicker', () => ({
  CustomerAccountPicker: () => null,
}));

import { CreateEventPage } from '../CreateEventPage';

function renderUnderStrictMode() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <ConfirmDialogProvider>
          <RouterProvider router={createMemoryRouter([{ path: '/admin/events/new', element: <CreateEventPage /> }], { initialEntries: ['/admin/events/new'] })} />
        </ConfirmDialogProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

describe('CreateEventPage Strict Mode mount guard (A6 / #1563)', () => {
  beforeEach(() => {
    createEvent.mockReset();
    navigate.mockReset();
    toastSuccess.mockReset();
    createEvent.mockResolvedValue({ id: 42 });
  });

  it('still toasts and redirects after a successful create under StrictMode', async () => {
    renderUnderStrictMode();

    fireEvent.change(await screen.findByPlaceholderText('events.eventNamePlaceholder'), {
      target: { value: 'ZZTEST strict mount' },
    });

    fireEvent.submit(screen.getByRole('button', { name: 'events.createEvent' }).closest('form')!);

    await waitFor(() => expect(createEvent).toHaveBeenCalled());
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(navigate).toHaveBeenCalledWith('/admin/events/42');
  });
});
