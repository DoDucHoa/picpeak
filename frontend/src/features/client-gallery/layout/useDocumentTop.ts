import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Where an element starts in the document, which the window virtualiser needs
 * as its scroll margin. Content above the element (a cover, a banner, a folder
 * bar) can change height without the window resizing, and every such change
 * moves the element. Observing document.body catches all of them in one place:
 * any height change above the element changes the body's height too. It also
 * fires when the element itself grows, which re-measures to the same value and
 * renders nothing.
 */
export function useDocumentTop(ref: RefObject<HTMLElement>): number {
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (el) setTop(Math.round(el.getBoundingClientRect().top + window.scrollY));
    };
    measure();
    window.addEventListener('resize', measure);
    // Absent in jsdom and in old webviews; resize alone still covers those.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(document.body);
    return () => { window.removeEventListener('resize', measure); observer?.disconnect(); };
  }, [ref]);
  return top;
}
