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
import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
const status = vi.fn();
const reveal = vi.fn();
vi.mock('../../../../services/events.service', () => ({
  eventsService: {
    updateEvent: (...args: unknown[]) => updateEvent(...args),
    getGalleryPasswordStatus: (...args: unknown[]) => status(...args),
    getGalleryPassword: (...args: unknown[]) => reveal(...args),
  },
}));

// Settings mode reads the password status through TanStack Query.
const render = (ui: React.ReactElement) => rtlRender(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>,
);

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

beforeEach(() => {
  vi.clearAllMocks();
  status.mockResolvedValue({ enabled: true, password_stored: false, client_password_stored: false });
});
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

  it('forgets a typed password when client access is switched off', async () => {
    const setEditForm = vi.fn();
    const on = { ...form, client_access_enabled: true, client_password: 'Typed-123' };
    render(<ClientAccessCard event={event} refetchEvent={vi.fn()} mode="settings" editForm={on} setEditForm={setEditForm} />);
    await userEvent.click(screen.getByRole('checkbox'));
    const arg = setEditForm.mock.calls[0][0];
    const next = typeof arg === 'function' ? arg(on) : arg;
    expect(next).toMatchObject({ client_access_enabled: false, client_password: '' });
  });

  it('has no password field while client access is off in the draft', () => {
    render(<ClientAccessCard event={event} refetchEvent={vi.fn()} mode="settings" editForm={form} setEditForm={vi.fn()} />);
    expect(screen.queryByPlaceholderText('clientAccess.passwordPlaceholder')).toBeNull();
  });
});

describe('ClientAccessCard client password (spec 5.4)', () => {
  it('says no client password is set for an event already on without one, and Generate fills one', async () => {
    const setEditForm = vi.fn();
    const on = { ...form, client_access_enabled: true };
    render(<ClientAccessCard event={{ ...event, has_client_password: false } as Event} refetchEvent={vi.fn()} mode="settings" editForm={on} setEditForm={setEditForm} />);
    expect(screen.getByText(/No client password set/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    const arg = setEditForm.mock.calls[0][0];
    expect((typeof arg === 'function' ? arg(on) : arg).client_password.length).toBeGreaterThanOrEqual(6);
  });

  it('shows the stored client password on request when one is set', async () => {
    status.mockResolvedValue({ enabled: true, password_stored: false, client_password_stored: true });
    reveal.mockResolvedValue({ enabled: true, password: null, client_password: '7788aa' });
    const on = { ...form, client_access_enabled: true };
    render(<ClientAccessCard event={{ ...event, has_client_password: true } as Event} refetchEvent={vi.fn()} mode="settings" editForm={on} setEditForm={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Show' }));
    expect(await screen.findByText('7788aa')).toBeInTheDocument();
  });

  it('generates a client password when client access is switched on', async () => {
    const setEditForm = vi.fn();
    render(<ClientAccessCard event={{ ...event, client_access_enabled: false, has_client_password: false } as Event} refetchEvent={vi.fn()} mode="settings" editForm={form} setEditForm={setEditForm} />);
    await userEvent.click(screen.getByRole('checkbox'));
    const next = apply(setEditForm);
    expect(next.client_access_enabled).toBe(true);
    expect(next.client_password.length).toBeGreaterThanOrEqual(6);
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
