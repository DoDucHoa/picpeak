import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmDialogProvider } from '../../../../../components/common/ConfirmDialog';
import { EventSettingsContext, type EventSettingsValue } from '../EventSettingsContext';
import { SECTION_FIELDS, sectionOf } from '../sectionFields';

vi.mock('react-i18next', async () => ({ ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')), useTranslation: () => ({ t: (_k: string, fb?: unknown) => (typeof fb === 'string' ? fb : (fb as { defaultValue?: string } | undefined)?.defaultValue ?? _k), i18n: { language: 'en' } }) }));
vi.mock('../../../../../hooks/useActiveEventTypes', () => ({ useActiveEventTypes: () => ({ data: [] }) }));
vi.mock('../../../../../components/admin/CustomerAccountPicker', () => ({ CustomerAccountPicker: () => null }));
vi.mock('../../ExternalFolderPicker', () => ({ ExternalFolderPicker: () => null }));
vi.mock('../../../../../contexts/FeatureFlagsContext', () => ({ useFeatureFlags: () => ({ flags: {} }) }));
vi.mock('../../../../../contexts/PermissionsContext', () => ({ usePermissions: () => ({ hasPermission: () => true }) }));

import { EventSettingsTab } from '../EventSettingsTab';

const base = (over: Partial<EventSettingsValue> = {}): EventSettingsValue => ({
  event: { id: 1, customer_name: 'Anna' } as never,
  editForm: { customer_name: 'Anna', customer_email: '', customer_phone: '', expires_at: '', event_date: '2026-01-01', event_type: 'wedding', welcome_message: '', customer_accounts: [], require_password: true, new_password: '', source_mode: 'managed', external_path: '', external_watch: false, photo_cap: 0, default_photo_sort: 'upload_date_desc' } as never,
  setEditForm: vi.fn(),
  feedbackSettings: {} as never, setFeedbackSettings: vi.fn(),
  draft: { state: {}, count: 0, isDirty: false } as never,
  readOnly: false, lockReason: null, expert: false, setExpert: vi.fn(), refetchEvent: vi.fn(), categories: [], phoneFieldEnabled: false, heroPhotos: [],
  ...over,
});

const mount = (value: EventSettingsValue, section = 'details', onSection = vi.fn()) => render(
  <QueryClientProvider client={new QueryClient()}>
    <ConfirmDialogProvider>
      <EventSettingsContext.Provider value={value}><EventSettingsTab section={section as never} onSection={onSection} /></EventSettingsContext.Provider>
    </ConfirmDialogProvider>
  </QueryClientProvider>,
);

it('shows one section at a time', () => {
  mount(base());
  expect(screen.getByDisplayValue('Anna')).toBeInTheDocument();
  expect(screen.queryByText('Photo source')).toBeNull();
});

it('routes a change through the draft setter', async () => {
  const value = base();
  mount(value);
  await userEvent.type(screen.getByDisplayValue('Anna'), 'x');
  expect(value.setEditForm).toHaveBeenCalled();
});

it('switches section through the rail', async () => {
  const onSection = vi.fn();
  mount(base(), 'details', onSection);
  await userEvent.click(screen.getByRole('button', { name: /Photos & sorting/ }));
  expect(onSection).toHaveBeenCalledWith('advanced');
});

it('names the photo section for what it holds and shows it open, expert mode or not', () => {
  mount(base(), 'advanced');
  expect(screen.getByRole('heading', { name: 'Photos & sorting' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Advanced/ })).toBeNull();
  expect(screen.queryByText('Show advanced options')).toBeNull();
  expect(screen.getByText('Source Mode')).toBeInTheDocument();
  expect(screen.getByText('Photo Limit')).toBeInTheDocument();
  expect(screen.getByText('Default Photo Sort')).toBeInTheDocument();
});

it('puts a dot on a section with unsaved changes', () => {
  mount(base({ draft: { state: { 'event.photo_cap': { base: 0, value: 5 } }, count: 1, isDirty: true } as never }));
  expect(sectionOf('event.photo_cap')).toBe('advanced');
  expect(screen.getAllByLabelText('unsaved changes').length).toBeGreaterThan(0);
});

it('locks every control and says why', () => {
  mount(base({ readOnly: true, lockReason: 'Locked: needs the events.edit permission' }));
  expect(screen.getByText('Locked: needs the events.edit permission')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Anna')).toBeDisabled();
});

it('assigns every field to exactly one section', () => {
  const all = Object.values(SECTION_FIELDS).flat();
  expect(new Set(all).size).toBe(all.length);
});
