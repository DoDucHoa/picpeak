import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventSettingsContext, type EventSettingsValue } from '../EventSettingsContext';
import { SECTION_FIELDS, sectionOf } from '../sectionFields';

vi.mock('react-i18next', async () => ({ ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')), useTranslation: () => ({ t: (_k: string, fb: string) => fb ?? _k, i18n: { language: 'en' } }) }));
vi.mock('../../../../../components/admin/CustomerAccountPicker', () => ({ CustomerAccountPicker: () => null }));
vi.mock('../../ExternalFolderPicker', () => ({ ExternalFolderPicker: () => null }));

import { EventSettingsTab } from '../EventSettingsTab';

const base = (over: Partial<EventSettingsValue> = {}): EventSettingsValue => ({
  event: { id: 1, customer_name: 'Anna' } as never,
  editForm: { customer_name: 'Anna', customer_email: '', customer_phone: '', expires_at: '', welcome_message: '', customer_accounts: [], require_password: true, new_password: '', confirm_new_password: '', source_mode: 'managed', external_path: '', external_watch: false, photo_cap: 0, default_photo_sort: 'upload_date_desc' } as never,
  setEditForm: vi.fn(),
  feedbackSettings: {} as never, setFeedbackSettings: vi.fn(),
  theme: { config: {} as never, preset: 'default' }, setTheme: vi.fn(),
  draft: { state: {}, count: 0, isDirty: false } as never,
  readOnly: false, lockReason: null, expert: false, setExpert: vi.fn(), refetchEvent: vi.fn(), categories: [], phoneFieldEnabled: false,
  ...over,
});

const mount = (value: EventSettingsValue, section = 'details', onSection = vi.fn()) => render(
  <QueryClientProvider client={new QueryClient()}>
    <EventSettingsContext.Provider value={value}><EventSettingsTab section={section as never} onSection={onSection} /></EventSettingsContext.Provider>
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
  await userEvent.click(screen.getByRole('button', { name: /Advanced/ }));
  expect(onSection).toHaveBeenCalledWith('advanced');
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
