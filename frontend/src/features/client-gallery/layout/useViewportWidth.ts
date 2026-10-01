import { useEffect, useState } from 'react';

/**
 * The page width, read from the document rather than measured from the grid:
 * jsdom has no layout, and on first paint nothing has been measured yet, so a
 * measured width would be 0 in both places.
 */
export function useViewportWidth(): number {
  const [width, setWidth] = useState(() => document.documentElement.clientWidth || window.innerWidth);
  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setWidth(document.documentElement.clientWidth || window.innerWidth));
    };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', onResize); };
  }, []);
  return width;
}
