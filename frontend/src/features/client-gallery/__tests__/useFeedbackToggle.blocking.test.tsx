import { it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useFeedbackToggle } from '../state/useFeedbackToggle';

// The real limit hook, so its open state is the one the modal would show.
const submit = vi.fn();
vi.mock('../../../services/feedback.service', () => ({ feedbackService: { submitFeedback: (...a: unknown[]) => submit(...a) } }));
const identity = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('../../../contexts/GuestIdentityContext', () => ({ useGuestIdentityOptional: () => identity.value }));
vi.mock('../../../components/gallery/FeedbackLimitReachedModal', () => ({ FeedbackLimitReachedModal: () => null }));
vi.mock('../../../components/gallery/FeedbackIdentityModal', () => ({ FeedbackIdentityModal: () => null }));

const KEY = ['gallery-photos', 's', 'all', 'g1'];
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const photo = { id: 5, is_favorited: false, favorite_count: 0, is_liked: false, like_count: 0 } as never;

beforeEach(() => {
  client = new QueryClient();
  client.setQueryData(KEY, { photos: [photo] });
  submit.mockReset();
  identity.value = null;
});

it('is not blocking at rest', () => {
  const { result } = renderHook(() => useFeedbackToggle('s', KEY, true), { wrapper });
  expect(result.current.blocking).toBe(false);
});

it('blocks while the guest name prompt is open', () => {
  identity.value = { identityMode: 'guest', promptOpen: true, ensureIdentity: () => new Promise(() => {}) };
  const { result } = renderHook(() => useFeedbackToggle('s', KEY, false), { wrapper });
  expect(result.current.blocking).toBe(true);
});

it('blocks while a name and email are being asked for', () => {
  const { result } = renderHook(() => useFeedbackToggle('s', KEY, true), { wrapper });
  act(() => result.current.toggle(photo, 'like'));
  expect(submit).not.toHaveBeenCalled();
  expect(result.current.blocking).toBe(true);
});

it('blocks while the limit reached modal is open', async () => {
  submit.mockRejectedValue({ response: { status: 403, data: { code: 'FAVORITE_LIMIT_REACHED', limit: 3, current_count: 3 } } });
  const { result } = renderHook(() => useFeedbackToggle('s', KEY, false), { wrapper });
  act(() => result.current.toggle(photo, 'favorite'));
  await waitFor(() => expect(result.current.blocking).toBe(true));
});

const cached = () => (client.getQueryData(KEY) as { photos: Array<Record<string, unknown>> }).photos[0];

it('flips the flag but leaves the count alone when counts are hidden from guests', () => {
  submit.mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(() => useFeedbackToggle('s', KEY, false, false), { wrapper });
  act(() => result.current.toggle(photo, 'like'));
  expect(cached().is_liked).toBe(true);
  expect(cached().like_count).toBe(0);
});
