/**
 * The Branding page offers the switch that watermarks downloaded files, and
 * shows the watermark look (logo, position, size) whenever either watermark
 * is on: with only the download switch on, the look still decides what the
 * downloaded files carry.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const branding: Record<string, unknown> = {};

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k) })
  };
});

vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('../../../services/settings.service', async () => {
  const actual = await vi.importActual<any>('../../../services/settings.service');
  return {
    ...actual,
    settingsService: {
      ...actual.settingsService,
      getSettingsByType: vi.fn(async (type: string) => (type === 'branding' ? { ...branding } : {})),
      getAllSettings: vi.fn(async () => ({ thumbnail_width: '800', thumbnail_height: '800' })),
      updateTheme: vi.fn(async () => undefined),
      updateBranding: vi.fn(async () => undefined),
    },
  };
});

vi.mock('../../../services/fonts.service', () => ({
  fontsService: { list: vi.fn(async () => []) },
  extractFamilyName: (s: string) => s,
}));

vi.mock('../../../services/businessProfile.service', () => ({
  businessProfileService: { get: vi.fn(async () => ({ profile: {} })), update: vi.fn() },
}));

vi.mock('../../../hooks/usePublicSettings', () => ({
  PUBLIC_SETTINGS_QUERY_KEY: ['public-settings'],
  usePublicSettings: () => ({ data: { branding_force_color_mode: null } }),
}));

vi.mock('../../../contexts/FeatureFlagsContext', () => ({
  useFeatureFlags: () => ({ flags: {} }),
  useFeatureEnabled: () => false,
}));

vi.mock('../../../components/admin/CustomerDashboardBrandingCard', () => ({
  CustomerDashboardBrandingCard: () => null,
}));
vi.mock('../../../components/admin/PdfTypographyCard', () => ({
  PdfTypographyCard: () => null,
}));

import { BrandingPage } from '../BrandingPage';
import { ThemeProvider } from '../../../contexts/ThemeContext';

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <BrandingPage />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

describe('BrandingPage: download watermark switch', () => {
  beforeEach(() => {
    localStorage.clear();
    for (const k of Object.keys(branding)) delete branding[k];
  });

  it('shows the stored switch state', async () => {
    branding.branding_watermark_downloads_enabled = true;
    renderPage();
    const box = (await screen.findByLabelText(/Watermark downloaded files/)) as HTMLInputElement;
    // The switch renders with the page defaults before the stored settings
    // load; under a loaded test run the first read can land in between.
    await waitFor(() => expect(box.checked).toBe(true));
  });

  it('shows the watermark look when only downloads are watermarked', async () => {
    branding.branding_watermark_enabled = false;
    branding.branding_watermark_downloads_enabled = true;
    renderPage();
    expect(await screen.findByText('branding.watermarkSettings')).toBeInTheDocument();
  });

  it('hides the watermark look when neither watermark is on', async () => {
    renderPage();
    await screen.findByLabelText(/Watermark downloaded files/);
    expect(screen.queryByText('branding.watermarkSettings')).not.toBeInTheDocument();
  });
});
