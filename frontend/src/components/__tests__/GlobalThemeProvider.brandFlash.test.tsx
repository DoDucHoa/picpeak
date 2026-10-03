/**
 * First paint of the instance brand: a reload must start from the saved
 * brand rather than the PicPeak green, and a first visit must stay hidden
 * until the real brand is known instead of flashing the defaults.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ThemeProvider } from '../../contexts/ThemeContext';
import { GlobalThemeProvider } from '../GlobalThemeProvider';
import { publicSettingsService } from '../../services/publicSettings.service';
import { resetBootBrandSnapshot, saveBrandSnapshot } from '../../utils/brandSnapshot';

vi.mock('../../services/publicSettings.service', () => ({
  publicSettingsService: { getPublicSettings: vi.fn() },
}));

vi.mock('../../services/fonts.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/fonts.service')>(
    '../../services/fonts.service'
  );
  return { ...actual, fontsService: { list: vi.fn().mockResolvedValue([]) } };
});

const getPublicSettingsMock = vi.mocked(publicSettingsService.getPublicSettings);
type Settings = Awaited<ReturnType<typeof publicSettingsService.getPublicSettings>>;

const RED = { primaryColor: '#b91c1c', accentColor: '#dc2626', backgroundColor: '#fff7f7' };

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <GlobalThemeProvider>
          <p>login</p>
        </GlobalThemeProvider>
      </ThemeProvider>
    </QueryClientProvider>,
    { container: document.getElementById('root') ?? undefined },
  );
}

const rootStyle = () => document.documentElement.style;
const appRoot = () => document.getElementById('root') as HTMLElement;

describe('GlobalThemeProvider first paint', () => {
  beforeEach(() => {
    localStorage.clear();
    resetBootBrandSnapshot();
    getPublicSettingsMock.mockReset();
    document.documentElement.removeAttribute('style');
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
  });

  afterEach(() => {
    cleanup();
    document.getElementById('root')?.remove();
    resetBootBrandSnapshot();
  });

  it('starts a reload from the saved brand before the settings answer', () => {
    saveBrandSnapshot({ theme_config: RED });
    getPublicSettingsMock.mockReturnValue(new Promise(() => {}));
    mount();

    expect(rootStyle().getPropertyValue('--color-primary')).toBe('#b91c1c');
    expect(rootStyle().getPropertyValue('--color-background')).toBe('#fff7f7');
    expect(appRoot().style.visibility).toBe('');
  });

  it('keeps a first visit hidden until the brand arrives, then reveals it branded', async () => {
    let answer!: (settings: Settings) => void;
    getPublicSettingsMock.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    mount();

    expect(appRoot().style.visibility).toBe('hidden');

    answer({ theme_config: RED } as unknown as Settings);
    await waitFor(() => expect(appRoot().style.visibility).toBe(''));
    expect(rootStyle().getPropertyValue('--color-primary')).toBe('#b91c1c');
  });

  it('reveals the defaults when the settings request fails', async () => {
    getPublicSettingsMock.mockRejectedValue(new Error('offline'));
    mount();

    await waitFor(() => expect(appRoot().style.visibility).toBe(''));
    expect(rootStyle().getPropertyValue('--color-primary')).toBe('#5C8762');
  });
});
