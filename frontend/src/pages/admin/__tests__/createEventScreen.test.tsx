/**
 * The create screen (P5, spec 5.5): essentials first, defaults from
 * Settings, advanced options collapsed, an external folder on create, and
 * the navigation guard.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmDialogProvider } from '../../../components/common/ConfirmDialog';
import { expiryFromToday } from '../event-details/settings/ExpiryField';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k), i18n: { language: 'en' } }),
  };
});

const toastError = vi.fn();
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a), info: vi.fn() } }));

const state = vi.hoisted(() => ({
  publicSettings: {} as Record<string, unknown>,
  adminSettings: {} as Record<string, unknown> | Error,
  types: [] as unknown[],
}));

const createEvent = vi.fn();
vi.mock('../../../services/events.service', () => ({
  eventsService: { createEvent: (...args: unknown[]) => createEvent(...args) },
}));
const saveQuota = vi.fn();
vi.mock('../../../services/adminDownloadQuota.service', () => ({
  adminDownloadQuotaService: { saveQuota: (...args: unknown[]) => saveQuota(...args) },
}));
vi.mock('../../../services/settings.service', () => ({
  settingsService: {
    getAllSettings: vi.fn(async () => {
      if (state.adminSettings instanceof Error) throw state.adminSettings;
      return state.adminSettings;
    }),
  },
}));
vi.mock('../../../services/eventTypes.service', () => ({
  eventTypesService: { getActiveEventTypes: vi.fn(async () => state.types) },
}));
vi.mock('../../../hooks/usePublicSettings', () => ({
  PUBLIC_SETTINGS_QUERY_KEY: ['public-settings'],
  usePublicSettings: () => ({ data: state.publicSettings }),
}));
vi.mock('../../../contexts/FeatureFlagsContext', () => ({
  useFeatureFlags: () => ({ flags: {}, isLoading: false }),
  useFeatureEnabled: () => false,
}));
vi.mock('../../../contexts/PermissionsContext', () => ({
  usePermissions: () => ({ hasAnyPermission: () => true, hasPermission: () => true, isLoading: false }),
}));
vi.mock('../../../components/admin', async () => {
  const actual = await vi.importActual<any>('../../../components/admin');
  return { ...actual, WelcomeMessageEditor: () => null };
});
vi.mock('../../../components/admin/CustomerAccountPicker', () => ({ CustomerAccountPicker: () => null }));
vi.mock('../event-details/ExternalFolderPicker', () => ({
  ExternalFolderPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="External folder" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { CreateEventPage } from '../CreateEventPage';

const OPTIONAL = {
  event_require_customer_name: false, event_require_customer_email: false,
  event_require_event_date: false, event_require_expiration: false,
};
const OTHER = { id: 4, name: 'Other', slug_prefix: 'other', emoji: 'o', theme_preset: 'default', is_active: true };

function renderCreate() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/admin/events/new', element: <CreateEventPage /> },
    { path: '/admin/events/:id', element: <div>event page</div> },
    { path: '/admin/events', element: <div>events list</div> },
  ], { initialEntries: ['/admin/events/new'] });
  render(
    <QueryClientProvider client={qc}>
      <ConfirmDialogProvider>
        <RouterProvider router={router} />
      </ConfirmDialogProvider>
    </QueryClientProvider>,
  );
  return router;
}
const name = () => screen.findByPlaceholderText('events.eventNamePlaceholder');
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'events.createEvent' }));
const payload = () => createEvent.mock.calls[0][0];

beforeEach(() => {
  createEvent.mockReset();
  createEvent.mockResolvedValue({ id: 42 });
  saveQuota.mockReset();
  toastError.mockReset();
  state.publicSettings = { ...OPTIONAL, event_default_require_password: true };
  state.adminSettings = { general_default_expiration_days: 45 };
  state.types = [OTHER];
  try { localStorage.clear(); } catch { /* no storage */ }
});

describe('the create screen', () => {
  it('sends the defaults: preselected type, a generated password, the expiry from Settings, no theme', async () => {
    state.publicSettings = { ...state.publicSettings, theme_config: { headerStyle: 'hero', heroDividerStyle: 'curve' } };
    renderCreate();
    fireEvent.change(await name(), { target: { value: 'Anna' } });
    expect((screen.getByLabelText('events.galleryPassword') as HTMLInputElement).value.length).toBeGreaterThanOrEqual(6);
    submit();
    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(payload()).toMatchObject({
      event_type: 'other', event_name: 'Anna', require_password: true,
      expires_at: expiryFromToday(45), header_style: 'hero', hero_divider_style: 'curve', source_mode: 'managed',
    });
    expect(payload().password.length).toBeGreaterThanOrEqual(6);
    expect(payload()).not.toHaveProperty('color_theme');
    expect(payload()).not.toHaveProperty('expiration_days');
  });

  it('opens with 30 days when the admin settings cannot be read', async () => {
    state.adminSettings = new Error('403');
    renderCreate();
    fireEvent.change(await name(), { target: { value: 'Anna' } });
    submit();
    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(payload().expires_at).toBe(expiryFromToday(30));
  });

  it('honours the Settings requirements, and hides Never when an expiry is required', async () => {
    state.publicSettings = { event_default_require_password: false };
    renderCreate();
    await name();
    expect(screen.queryByRole('button', { name: 'Never' })).toBeNull();
    submit();
    expect(await screen.findByText('validation.eventNameRequired')).toBeInTheDocument();
    expect(screen.getByText('validation.hostNameRequired')).toBeInTheDocument();
    expect(screen.getByText('validation.hostEmailRequired')).toBeInTheDocument();
    expect(createEvent).not.toHaveBeenCalled();
  });

  it('offers Never when Settings do not require an expiry, and sends null for it', async () => {
    renderCreate();
    fireEvent.change(await name(), { target: { value: 'Anna' } });
    fireEvent.click(screen.getByRole('button', { name: 'Never' }));
    submit();
    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(payload().expires_at).toBeNull();
  });

  it('keeps advanced options collapsed, a Custom feedback default included', async () => {
    state.publicSettings = { ...state.publicSettings, event_default_feedback_enabled: true, event_default_allow_likes: false };
    renderCreate();
    fireEvent.change(await name(), { target: { value: 'Anna' } });
    expect(screen.queryByRole('radiogroup', { name: 'Guest feedback' })).toBeNull();
    expect(screen.queryByLabelText('Source Mode')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show advanced options' }));
    expect(screen.getByRole('radio', { name: /^Custom \(from Settings\)/ })).toBeChecked();
    submit();
    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(payload()).toMatchObject({ feedback_enabled: true, allow_likes: false, allow_favorites: true, allow_comments: true });
  });

  it('starts an event on an external folder, and refuses reference mode without one', async () => {
    renderCreate();
    fireEvent.change(await name(), { target: { value: 'Anna' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show advanced options' }));
    fireEvent.change(screen.getByLabelText('Source Mode'), { target: { value: 'reference' } });
    submit();
    expect(await screen.findByText('validation.externalFolderRequired')).toBeInTheDocument();
    expect(createEvent).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('External folder'), { target: { value: 'weddings/2026' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Watch folder for new files/ }));
    submit();
    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(payload()).toMatchObject({ source_mode: 'reference', external_path: 'weddings/2026', external_watch: true });
  });

  it('leaves the generated password alone when the name is typed, until Regenerate', async () => {
    renderCreate();
    const field = () => screen.getByLabelText('events.galleryPassword') as HTMLInputElement;
    await name();
    const first = field().value;
    fireEvent.change(await name(), { target: { value: 'Anna and Ben' } });
    expect(field().value).toBe(first);
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(field().value).not.toBe(first);
  });

  it('opens the event after create even when auto-approve could not be saved', async () => {
    saveQuota.mockRejectedValue(new Error('500'));
    renderCreate();
    fireEvent.change(await name(), { target: { value: 'Anna' } });
    fireEvent.click(screen.getByLabelText(/downloadQuotaAdmin\.card\.autoApproveLabel/));
    submit();
    expect(await screen.findByText('event page')).toBeInTheDocument();
    expect(saveQuota).toHaveBeenCalledWith(42, { auto_approve: true });
    expect(toastError).toHaveBeenCalledWith('errors.autoApproveSaveError');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks before leaving a filled form', async () => {
    renderCreate();
    fireEvent.change(await name(), { target: { value: 'Anna' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.back' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByPlaceholderText('events.eventNamePlaceholder')).toHaveValue('Anna');
  });

  it('leaves an untouched form without asking', async () => {
    renderCreate();
    await name();
    fireEvent.click(screen.getByRole('button', { name: 'common.back' }));
    expect(await screen.findByText('events list')).toBeInTheDocument();
  });

  it('keeps the form and the guard when the server refuses the create', async () => {
    createEvent.mockRejectedValue({ response: { data: { errors: [{ path: 'event_type', msg: 'Invalid event type' }] } } });
    renderCreate();
    fireEvent.change(await name(), { target: { value: 'Anna' } });
    submit();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('event_type: Invalid event type'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'events.createEvent' })).not.toBeDisabled());
    expect(screen.getByPlaceholderText('events.eventNamePlaceholder')).toHaveValue('Anna');
    fireEvent.click(screen.getByRole('button', { name: 'common.back' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
