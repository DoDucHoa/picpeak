/**
 * Client access has always stored a real bcrypt password; only the UI called
 * it a PIN, and nothing checked what was typed. The floor (six characters,
 * not digits only) is now checked when the Settings save bar saves the draft
 * (saveDraft.validateDraft, pinned in saveDraft.test.ts).
 *
 * This pins the card itself: in Settings > Access the switch and the password
 * go into the page's draft and nothing is sent from here; on the Overview the
 * card shows the link and no password field.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Event } from '../../../../types';
import type { EditFormState } from '../types';

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
  client_share_token: 'tok',
  is_archived: false,
} as unknown as Event;

const form = { client_access_enabled: false, client_password: '' } as EditFormState;
const apply = (setEditForm: ReturnType<typeof vi.fn>, call = 0) => {
  const arg = setEditForm.mock.calls[call][0];
  return typeof arg === 'function' ? arg(form) : arg;
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('ClientAccessCard in Settings > Access', () => {
  it('puts the enable switch in the draft and saves nothing', async () => {
    const setEditForm = vi.fn();
    render(<ClientAccessCard event={event} refetchEvent={vi.fn()} mode="settings" editForm={form} setEditForm={setEditForm} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(apply(setEditForm).client_access_enabled).toBe(true);
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it('puts a typed password in the draft', async () => {
    const setEditForm = vi.fn();
    const on = { ...form, client_access_enabled: true };
    render(<ClientAccessCard event={event} refetchEvent={vi.fn()} mode="settings" editForm={on} setEditForm={setEditForm} />);
    await userEvent.type(screen.getByPlaceholderText('clientAccess.passwordPlaceholder'), 'W');
    expect(apply(setEditForm).client_password).toBe('W');
    expect(updateEvent).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /clientAccess.setPassword/ })).toBeNull();
  });

  it('has no password field while client access is off in the draft', () => {
    render(<ClientAccessCard event={event} refetchEvent={vi.fn()} mode="settings" editForm={form} setEditForm={vi.fn()} />);
    expect(screen.queryByPlaceholderText('clientAccess.passwordPlaceholder')).toBeNull();
  });
});

describe('ClientAccessCard on the Overview', () => {
  it('shows the link and no settings', () => {
    render(<ClientAccessCard event={event} refetchEvent={vi.fn()} />);
    expect(screen.getByDisplayValue(/client-access\?token=tok/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('clientAccess.passwordPlaceholder')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('keeps Regenerate as an immediate action', async () => {
    const refetch = vi.fn();
    render(<ClientAccessCard event={event} refetchEvent={refetch} />);
    await userEvent.click(screen.getByRole('button', { name: /clientAccess.regenerateToken/ }));
    expect(updateEvent).toHaveBeenCalledWith(7, { regenerate_client_token: true });
  });
});
