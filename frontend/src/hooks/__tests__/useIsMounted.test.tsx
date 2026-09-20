/**
 * A ref that answers whether the component is still mounted, read from an
 * async callback (a mutation's onSuccess, a fetch .then) to decide whether a
 * side effect like navigate() or a toast is still safe to run.
 *
 * The StrictMode test below is the one that matters: React 18 double-invokes
 * effects once in development (mount, cleanup, mount again) to surface exactly
 * this kind of bug. A naive `useRef(true)` that only flips to false in the
 * cleanup, and never back to true on the second mount, is stuck false for the
 * rest of the component's real, on-screen life: CreateEventPage.tsx hit this
 * for real, where it silently swallowed the post-creation toast and redirect.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { useIsMounted } from '../useIsMounted';

describe('useIsMounted', () => {
  it('reports mounted while the component is on screen', () => {
    const { result } = renderHook(() => useIsMounted());
    expect(result.current.current).toBe(true);
  });

  it('reports unmounted once the component leaves the screen', () => {
    const { result, unmount } = renderHook(() => useIsMounted());
    unmount();
    expect(result.current.current).toBe(false);
  });

  it('survives a React 18 Strict Mode double effect invocation', () => {
    let observed: React.MutableRefObject<boolean> | null = null;
    function Probe() {
      observed = useIsMounted();
      return null;
    }

    render(
      <React.StrictMode>
        <Probe />
      </React.StrictMode>
    );

    expect(observed).not.toBeNull();
    expect((observed as unknown as React.MutableRefObject<boolean>).current).toBe(true);
  });
});
