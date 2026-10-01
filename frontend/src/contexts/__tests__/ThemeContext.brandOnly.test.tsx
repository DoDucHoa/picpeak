/**
 * ThemeContext carries the brand tokens only (client gallery redesign, Task 13).
 *
 * The client gallery scopes its own fixed look under `.client-gallery`, so the
 * context no longer knows anything gallery specific: no custom CSS tag, no
 * background pattern, no per-gallery background cache, no saved preset.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

vi.mock('../../hooks/usePublicSettings', () => ({
  usePublicSettings: () => ({ data: undefined }),
}));

vi.mock('../../services/fonts.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/fonts.service')>(
    '../../services/fonts.service'
  );
  return { ...actual, fontsService: { list: vi.fn().mockResolvedValue([]) } };
});

import { ThemeProvider, useTheme } from '../ThemeContext';

// The test Storage (vitest.setup.ts) keeps its entries in a Map, so
// Object.keys(localStorage) is always empty; walk key(i) instead.
const storedKeys = (): string[] =>
  Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '');

describe('ThemeContext keeps brand tokens only', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('style');
  });

  afterEach(() => {
    cleanup();
    window.history.pushState({}, '', '/');
  });

  it('applies brand tokens and nothing gallery specific', () => {
    const Probe = () => {
      const { setTheme } = useTheme();
      React.useEffect(() => {
        // Legacy gallery keys still sitting in an old theme row are ignored.
        setTheme({ primaryColor: '#123456', fontFamily: 'Lora', customCss: 'body{color:red}', backgroundPattern: 'dots' } as never);
      }, [setTheme]);
      return null;
    };
    render(<ThemeProvider><Probe /></ThemeProvider>);
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--color-primary')).toBe('#123456');
    expect(style.getPropertyValue('--font-family')).toContain('Lora');
    expect(document.getElementById('custom-theme-styles')).toBeNull();
    expect(style.getPropertyValue('--background-pattern')).toBe('');
  });

  it('no longer writes the per-gallery background key', () => {
    window.history.pushState({}, '', '/gallery/summer-party');
    render(<ThemeProvider><div /></ThemeProvider>);
    expect(storedKeys().some((k) => k.startsWith('gallery-theme-bg-'))).toBe(false);
  });

  it('no longer saves the active theme as a gallery preset', () => {
    render(<ThemeProvider><div /></ThemeProvider>);
    expect(localStorage.getItem('gallery-theme')).toBeNull();
  });

  it('removes the gallery theme keys earlier versions left behind', () => {
    localStorage.setItem('gallery-theme', '{"name":"default","config":{}}');
    localStorage.setItem('gallery-theme-bg-summer-party', '#0d0d0d');
    localStorage.setItem('gallery-theme-bg-winter-ball', '#ffffff');
    localStorage.setItem('picpeak-language', 'de');
    render(<ThemeProvider><div /></ThemeProvider>);
    expect(storedKeys()).toEqual(['picpeak-language']);
  });

  it('still renders when storage throws', () => {
    const spy = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    localStorage.setItem('gallery-theme', '{}');
    expect(() => render(<ThemeProvider><div /></ThemeProvider>)).not.toThrow();
    expect(spy).toHaveBeenCalledWith('gallery-theme');
    spy.mockRestore();
  });

  it('exposes only the theme and its setter', () => {
    let keys: string[] = [];
    const Probe = () => {
      keys = Object.keys(useTheme()).sort();
      return null;
    };
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(keys).toEqual(['setTheme', 'theme']);
  });
});
