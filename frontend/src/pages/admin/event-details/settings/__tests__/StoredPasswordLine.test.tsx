/**
 * A revealed password must not outlive the password it showed: after a save,
 * a publish or a send with a new password, the line hides it again so the
 * admin never copies a stale value to the client.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k), i18n: { language: 'en' } }),
}));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const reveal = vi.fn();
vi.mock('../../../../../services/events.service', () => ({
  eventsService: { getGalleryPassword: (...a: unknown[]) => reveal(...a) },
}));

import { StoredPasswordLine } from '../StoredPasswordLine';

it('hides a revealed password again when the saved password changes', async () => {
  reveal.mockResolvedValue({ enabled: true, password: 'Old-Pass-1', client_password: null });
  const { rerender } = render(<StoredPasswordLine eventId={7} kind="gallery" stored version="v1" />);
  await userEvent.click(screen.getByRole('button', { name: 'Show' }));
  expect(await screen.findByText('Old-Pass-1')).toBeInTheDocument();
  rerender(<StoredPasswordLine eventId={7} kind="gallery" stored version="v2" />);
  expect(screen.queryByText('Old-Pass-1')).toBeNull();
  expect(screen.getByRole('button', { name: 'Show' })).toBeInTheDocument();
});
