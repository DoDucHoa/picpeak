/**
 * Client access has always stored a real bcrypt password; only the UI called
 * it a PIN, and nothing checked what was typed. A one-character secret went
 * straight through, on the credential that opens the same gallery the guest
 * password guards with a six-character floor.
 *
 * This pins the two halves of the fix on the event page: the same floor as
 * the gallery password, checked before the PATCH goes out, and the generator
 * the gallery password has had all along.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Event } from '../../../../types';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, fb?: unknown) => (typeof fb === 'string' ? fb : key),
      i18n: { language: 'en' },
    }),
  };
});

vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const updateEvent = vi.fn(async () => ({}));
vi.mock('../../../../services/events.service', () => ({
  eventsService: { updateEvent: (...args: unknown[]) => updateEvent(...args) },
}));

import { ClientAccessCard } from '../ClientAccessCard';

const event = {
  id: 7,
  slug: 'wedding-demo',
  event_name: 'Demo Wedding',
  event_type: 'wedding',
  event_date: '2026-09-19',
  client_access_enabled: true,
  client_share_token: null,
  is_archived: false,
} as unknown as Event;

const field = () => screen.getByPlaceholderText('clientAccess.passwordPlaceholder');
const setButton = () => screen.getByRole('button', { name: /clientAccess.setPassword/ });

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('ClientAccessCard — the client password', () => {
  it('refuses a password shorter than six characters without calling the API', async () => {
    const user = userEvent.setup();
    render(<ClientAccessCard event={event} refetchEvent={vi.fn()} />);

    await user.type(field(), 'abc');
    await user.click(setButton());

    expect(await screen.findByText('validation.passwordMinLength')).toBeInTheDocument();
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it('refuses a digits-only password, which is exactly what a PIN habit produces', async () => {
    const user = userEvent.setup();
    render(<ClientAccessCard event={event} refetchEvent={vi.fn()} />);

    await user.type(field(), '482100');
    await user.click(setButton());

    expect(await screen.findByText(/Password cannot be just numbers/)).toBeInTheDocument();
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it('saves a password that clears the floor', async () => {
    const user = userEvent.setup();
    const refetchEvent = vi.fn();
    render(<ClientAccessCard event={event} refetchEvent={refetchEvent} />);

    await user.type(field(), 'Wedding-2026');
    await user.click(setButton());

    await waitFor(() => expect(updateEvent).toHaveBeenCalledWith(7, { client_password: 'Wedding-2026' }));
    expect(refetchEvent).toHaveBeenCalled();
  });

  it('offers the generator and drops what it produces straight into the field', async () => {
    const user = userEvent.setup();
    render(<ClientAccessCard event={event} refetchEvent={vi.fn()} />);

    const generate = screen.getByRole('button', { name: 'passwordGenerator.generatePassword' });
    await user.click(generate);

    // The generator resolves on a short timer of its own.
    await waitFor(() => expect((field() as HTMLInputElement).value.length).toBeGreaterThanOrEqual(6), {
      timeout: 3000,
    });
    // Whatever it produced must itself clear the floor this card enforces.
    expect((field() as HTMLInputElement).value).not.toMatch(/^\d+$/);
  });
});
