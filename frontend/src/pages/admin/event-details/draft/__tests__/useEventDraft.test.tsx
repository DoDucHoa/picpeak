// frontend/src/pages/admin/event-details/draft/__tests__/useEventDraft.test.tsx
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDraftObject, useEventDraft } from '../useEventDraft';

const server = { welcome_message: 'Hello', photo_cap: 0, customer_accounts: [{ id: 1 }] };

const setup = () => renderHook(() => {
  const draft = useEventDraft();
  const [form, setForm] = useDraftObject(draft, 'event', server);
  return { draft, form, setForm };
});

describe('useDraftObject', () => {
  it('starts with the server values and no changes', () => {
    const { result } = setup();
    expect(result.current.form).toEqual(server);
    expect(result.current.draft.count).toBe(0);
  });

  it('records only the keys that changed, from a spread update', () => {
    const { result } = setup();
    act(() => result.current.setForm((prev) => ({ ...prev, welcome_message: 'Hi' })));
    expect(result.current.draft.count).toBe(1);
    expect(result.current.form.welcome_message).toBe('Hi');
  });

  it('keeps both changes when one handler calls the setter twice', () => {
    const { result } = setup();
    act(() => {
      result.current.setForm((prev) => ({ ...prev, welcome_message: 'Hi' }));
      result.current.setForm((prev) => ({ ...prev, photo_cap: 50 }));
    });
    expect(result.current.form).toMatchObject({ welcome_message: 'Hi', photo_cap: 50 });
    expect(result.current.draft.count).toBe(2);
  });

  it('forgets a field typed back to its saved value', () => {
    const { result } = setup();
    act(() => result.current.setForm((prev) => ({ ...prev, welcome_message: 'Hi' })));
    act(() => result.current.setForm((prev) => ({ ...prev, welcome_message: 'Hello' })));
    expect(result.current.draft.isDirty).toBe(false);
  });

  it('discards everything', () => {
    const { result } = setup();
    act(() => result.current.setForm((prev) => ({ ...prev, photo_cap: 5 })));
    act(() => result.current.draft.discard());
    expect(result.current.form).toEqual(server);
  });
});

describe('useEventDraft.update', () => {
  it('builds on the latest value, so two updates in one handler both land', () => {
    const { result } = renderHook(() => useEventDraft());
    const base = { config: { a: 1 }, preset: 'default' };
    act(() => {
      result.current.update('event', '__theme', (cur) => ({ ...(cur as typeof base), config: { a: 2 } }), base);
      result.current.update('event', '__theme', (cur) => ({ ...(cur as typeof base), preset: 'custom' }), base);
    });
    expect(result.current.state['event.__theme'].value).toEqual({ config: { a: 2 }, preset: 'custom' });
  });
});
