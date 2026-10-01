/**
 * Settings > Access (spec 5.4): the gallery password shown the way it is
 * stored, regenerated or typed in clear, no confirm field, and a confirmation
 * before a published gallery loses its password.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../../../../../components/common/ConfirmDialog';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k), i18n: { language: 'en' } }),
}));
const status = vi.fn();
const reveal = vi.fn();
vi.mock('../../../../../services/events.service', () => ({
  eventsService: {
    getGalleryPasswordStatus: (...a: unknown[]) => status(...a),
    getGalleryPassword: (...a: unknown[]) => reveal(...a),
  },
}));
vi.mock('../../ClientAccessCard', () => ({ ClientAccessCard: () => null }));

import { EventSettingsContext } from '../EventSettingsContext';
import { AccessSection } from '../AccessSection';

const form = { require_password: true, new_password: '', client_access_enabled: false, client_password: '' };

function renderSection(over: { event?: object; editForm?: object; setEditForm?: ReturnType<typeof vi.fn> } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConfirmDialogProvider>
        <EventSettingsContext.Provider value={{
          event: { id: 7, event_name: 'Lakeside Wedding', event_date: '2026-08-15', require_password: 1, is_draft: 0, ...over.event } as never,
          editForm: { ...form, ...over.editForm } as never, setEditForm: over.setEditForm ?? vi.fn(),
          refetchEvent: vi.fn(), expert: false, readOnly: false,
        } as never}><AccessSection /></EventSettingsContext.Provider>
      </ConfirmDialogProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  status.mockResolvedValue({ enabled: true, password_stored: true, client_password_stored: false });
});

it('shows a stored password only on request', async () => {
  reveal.mockResolvedValue({ enabled: true, password: 'Sunset-42!', client_password: null });
  renderSection();
  await userEvent.click(await screen.findByRole('button', { name: 'Show' }));
  expect(await screen.findByText('Sunset-42!')).toBeInTheDocument();
  expect(reveal).toHaveBeenCalledTimes(1);
});

it('says "Set, not viewable" when no copy is stored, and never reads the secret on open', async () => {
  status.mockResolvedValue({ enabled: false, password_stored: false, client_password_stored: false });
  renderSection();
  expect(await screen.findByText('Set, not viewable')).toBeInTheDocument();
  expect(reveal).not.toHaveBeenCalled();
});

it('has no confirm field, and Regenerate writes a new password into the draft', async () => {
  const setEditForm = vi.fn();
  renderSection({ setEditForm });
  expect(screen.queryByText('Confirm Password')).toBeNull();
  expect(screen.queryByText('events.confirmPassword')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
  const next = setEditForm.mock.calls[0][0](form);
  expect(next.new_password.length).toBeGreaterThanOrEqual(6);
});

it('asks before removing the password of a published gallery, and Cancel changes nothing', async () => {
  const setEditForm = vi.fn();
  renderSection({ setEditForm });
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(setEditForm).not.toHaveBeenCalled();
});

it('removes the password of a draft gallery without asking', async () => {
  const setEditForm = vi.fn();
  renderSection({ setEditForm, event: { is_draft: 1 } });
  await userEvent.click(screen.getByRole('checkbox'));
  expect(screen.queryByRole('dialog')).toBeNull();
  await waitFor(() => expect(setEditForm).toHaveBeenCalled());
  expect(setEditForm.mock.calls[0][0](form)).toMatchObject({ require_password: false, new_password: '' });
});

it('generates a password when protection is switched on', async () => {
  const setEditForm = vi.fn();
  renderSection({ setEditForm, event: { require_password: 0 }, editForm: { require_password: false } });
  await userEvent.click(screen.getByRole('checkbox'));
  await waitFor(() => expect(setEditForm).toHaveBeenCalled());
  const next = setEditForm.mock.calls[0][0]({ ...form, require_password: false });
  expect(next.require_password).toBe(true);
  expect(next.new_password.length).toBeGreaterThanOrEqual(6);
});
