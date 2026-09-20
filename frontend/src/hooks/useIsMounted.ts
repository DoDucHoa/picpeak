import { useEffect, useRef } from 'react';

export function useIsMounted() {
  const isMountedRef = useRef(true);
  useEffect(() => {
    // React 18 Strict Mode double-invokes this effect in development: mount,
    // cleanup, mount again. Without this line the cleanup's `false` from the
    // first pass survives the second mount, and the ref reads false for the
    // rest of the component's real, on-screen life.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  return isMountedRef;
}
