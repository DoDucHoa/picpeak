import { it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useFeedbackToggle } from '../state/useFeedbackToggle';

const submit = vi.fn();
vi.mock('../../../services/feedback.service', () => ({ feedbackService: { submitFeedback: (...a: unknown[]) => submit(...a) } }));
vi.mock('../../../contexts/GuestIdentityContext', () => ({ useGuestIdentityOptional: () => null }));
const handleError = vi.fn(() => true);
vi.mock('../../../hooks/useFeedbackLimitModal', () => ({ useFeedbackLimitModal: () => ({ modal: null, handleError }) }));

const KEY = ['gallery-photos', 's', 'all', 'g1'];
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const photo = { id: 5, is_favorited: false, favorite_count: 0, is_liked: false, like_count: 0 } as never;

beforeEach(() => {
  client = new QueryClient();
  client.setQueryData(KEY, { photos: [photo] });
  submit.mockReset();
});

const cached = () => (client.getQueryData(KEY) as { photos: Array<Record<string, unknown>> }).photos[0];

it('flips the pick flag in the cache before the server answers', async () => {
  submit.mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(() => useFeedbackToggle('s', KEY, false), { wrapper });
  act(() => result.current.toggle(photo, 'favorite'));
  expect(cached().is_favorited).toBe(true);
  expect(cached().favorite_count).toBe(1);
});

it('does not refetch the photo list', async () => {
  submit.mockResolvedValue({ created: true });
  const spy = vi.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(() => useFeedbackToggle('s', KEY, false), { wrapper });
  act(() => result.current.toggle(photo, 'like'));
  await waitFor(() => expect(submit).toHaveBeenCalled());
  expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['gallery-photos'] }));
});

it('rolls back and shows the limit modal when the pick limit is reached', async () => {
  submit.mockRejectedValue({ response: { status: 403, data: { code: 'FAVORITE_LIMIT_REACHED' } } });
  const { result } = renderHook(() => useFeedbackToggle('s', KEY, false), { wrapper });
  act(() => result.current.toggle(photo, 'favorite'));
  await waitFor(() => expect(handleError).toHaveBeenCalled());
  expect(cached().is_favorited).toBe(false);
  expect(cached().favorite_count).toBe(0);
});

it('sends one request for two fast toggles of the same photo and kind', async () => {
  submit.mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(() => useFeedbackToggle('s', KEY, false), { wrapper });
  act(() => {
    result.current.toggle(photo, 'favorite');
    result.current.toggle(photo, 'favorite');
  });
  expect(submit).toHaveBeenCalledTimes(1);
  expect(cached().is_favorited).toBe(true);
  expect(cached().favorite_count).toBe(1);
});

it('reads the current state from the cache, not from a stale photo object', async () => {
  client.setQueryData(KEY, { photos: [{ ...(photo as object), is_favorited: true, favorite_count: 1 }] });
  submit.mockResolvedValue({ removed: true });
  const { result } = renderHook(() => useFeedbackToggle('s', KEY, false), { wrapper });
  act(() => result.current.toggle(photo, 'favorite'));
  await waitFor(() => expect(submit).toHaveBeenCalled());
  expect(cached().is_favorited).toBe(false);
  expect(cached().favorite_count).toBe(0);
});

it('follows the server when it answers removed to an optimistic on', async () => {
  submit.mockResolvedValue({ removed: true });
  const { result } = renderHook(() => useFeedbackToggle('s', KEY, false), { wrapper });
  act(() => result.current.toggle(photo, 'favorite'));
  await waitFor(() => expect(cached().is_favorited).toBe(false));
  expect(cached().favorite_count).toBe(0);
});
