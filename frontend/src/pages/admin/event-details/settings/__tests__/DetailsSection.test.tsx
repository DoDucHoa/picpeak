import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmDialogProvider } from '../../../../../components/common/ConfirmDialog';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => ({
    t: (k: string, o?: unknown) => {
      const opts = (typeof o === 'object' && o) ? o as Record<string, unknown> : {};
      if (k === 'events.details.inactiveType') return `${opts.name} (inactive)`;
      return typeof o === 'string' ? o : (opts.defaultValue as string) ?? k;
    },
    i18n: { language: 'en' },
  }),
}));
vi.mock('../../../../../hooks/useActiveEventTypes', () => ({
  useActiveEventTypes: () => ({ data: [
    { slug_prefix: 'wedding', name: 'Wedding', emoji: '', theme_preset: 'elegantWedding', is_active: true },
    { slug_prefix: 'birthday', name: 'Birthday', emoji: '', theme_preset: 'birthdayFun', is_active: true },
  ] }),
}));
vi.mock('../../../../../components/admin/CustomerAccountPicker', () => ({ CustomerAccountPicker: () => null }));

import { EventSettingsContext } from '../EventSettingsContext';
import { DetailsSection } from '../DetailsSection';

const form = {
  customer_name: 'Anna', customer_email: 'a@example.com', customer_phone: '', customer_accounts: [],
  expires_at: '2030-01-01', welcome_message: '', event_date: '2026-05-29', event_type: 'wedding',
};

function renderSection(over: { event?: object; editForm?: object; setEditForm?: ReturnType<typeof vi.fn>; setTheme?: ReturnType<typeof vi.fn>; draft?: object } = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}><ConfirmDialogProvider>
      <EventSettingsContext.Provider value={{
        event: { id: 1, color_theme: null, ...over.event } as never,
        editForm: { ...form, ...over.editForm } as never, setEditForm: over.setEditForm ?? vi.fn(),
        theme: { config: {} as never, preset: 'custom' }, setTheme: over.setTheme ?? vi.fn(),
        draft: (over.draft ?? { state: {} }) as never, readOnly: false, lockReason: null, expert: true, setExpert: vi.fn(),
        refetchEvent: vi.fn(), heroPhotos: [], cssTemplates: [], phoneFieldEnabled: false,
      } as never}><DetailsSection /></EventSettingsContext.Provider>
    </ConfirmDialogProvider></QueryClientProvider>,
  );
}

it('shows the event type from the catalog and keeps a deactivated current type selectable', () => {
  renderSection({ editForm: { event_type: 'corporate' } });
  const select = screen.getByLabelText('Event type') as HTMLSelectElement;
  expect(select.value).toBe('corporate');
  expect(screen.getByRole('option', { name: 'corporate (inactive)' })).toBeInTheDocument();
});

it('writes a new event type into the draft', async () => {
  const setEditForm = vi.fn();
  renderSection({ setEditForm });
  await userEvent.selectOptions(screen.getByLabelText('Event type'), 'birthday');
  const update = setEditForm.mock.calls[0][0];
  expect(update(form)).toMatchObject({ event_type: 'birthday' });
});

it('uses the one welcome message editor', () => {
  renderSection();
  expect(screen.getByText('Press Enter for a new line. Each line appears as its own paragraph in emails.')).toBeInTheDocument();
});

it('offers Never for the expiry on edit', () => {
  renderSection();
  expect(screen.getByRole('button', { name: 'Never' })).toBeInTheDocument();
});
