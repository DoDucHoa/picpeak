/**
 * The login pages used to paint the PicPeak logo and green theme until
 * /public/settings answered, then swap to the instance brand. These pin the
 * snapshot that lets a reload paint the real brand on its first frame.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useBrandSettings } from '../useBrandSettings';
import { publicSettingsService } from '../../services/publicSettings.service';
import {
  BRAND_SNAPSHOT_KEY,
  resetBootBrandSnapshot,
  saveBrandSnapshot,
} from '../../utils/brandSnapshot';

vi.mock('../../services/publicSettings.service', () => ({
  publicSettingsService: { getPublicSettings: vi.fn() },
}));

const getPublicSettingsMock = vi.mocked(publicSettingsService.getPublicSettings);
type Settings = Awaited<ReturnType<typeof publicSettingsService.getPublicSettings>>;

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useBrandSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    resetBootBrandSnapshot();
    getPublicSettingsMock.mockReset();
  });

  afterEach(() => {
    resetBootBrandSnapshot();
  });

  it('is not ready on a first visit while the settings are in flight', () => {
    getPublicSettingsMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useBrandSettings(), { wrapper: wrapper() });

    expect(result.current.brand).toBeUndefined();
    expect(result.current.isBrandReady).toBe(false);
  });

  it('paints the saved brand at once on a later visit', () => {
    saveBrandSnapshot({ branding_logo_url: '/uploads/phoever.png', branding_company_name: 'Phoever' });
    getPublicSettingsMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useBrandSettings(), { wrapper: wrapper() });

    expect(result.current.isBrandReady).toBe(true);
    expect(result.current.brand?.branding_logo_url).toBe('/uploads/phoever.png');
  });

  it('saves only the brand fields when the settings arrive', async () => {
    getPublicSettingsMock.mockResolvedValue({
      branding_company_name: 'Phoever',
      branding_logo_url: '/uploads/phoever.png',
      theme_config: { primaryColor: '#b91c1c' },
      maintenance_mode: true,
      oidc_enabled: true,
    } as unknown as Settings);
    const { result } = renderHook(() => useBrandSettings(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.brand?.branding_company_name).toBe('Phoever'));
    const saved = JSON.parse(localStorage.getItem(BRAND_SNAPSHOT_KEY) ?? '{}');
    expect(saved).toEqual({
      branding_company_name: 'Phoever',
      branding_logo_url: '/uploads/phoever.png',
      theme_config: { primaryColor: '#b91c1c' },
    });
  });

  it('becomes ready when the settings request fails, so a down API is not a blank page', async () => {
    getPublicSettingsMock.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useBrandSettings(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isBrandReady).toBe(true));
    expect(result.current.brand).toBeUndefined();
  });

  it('ignores a corrupt snapshot', () => {
    localStorage.setItem(BRAND_SNAPSHOT_KEY, '{not json');
    getPublicSettingsMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useBrandSettings(), { wrapper: wrapper() });

    expect(result.current.brand).toBeUndefined();
    expect(result.current.isBrandReady).toBe(false);
  });
});
