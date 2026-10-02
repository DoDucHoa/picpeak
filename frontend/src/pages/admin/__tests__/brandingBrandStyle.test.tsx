/**
 * The Branding page keeps the brand styling only: the eight palette colours,
 * the colour mode, the force colour mode lock, the two fonts, the font size,
 * the corner radius and the shadow. The gallery look is fixed, so nothing on
 * the page offers it, and Save sends brand keys only.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const updateTheme = vi.fn(async (_theme: Record<string, unknown>) => undefined);
const savedTheme = {
  primaryColor: '#112233', accentColor: '#22c55e', accentDarkColor: '#112233',
  backgroundColor: '#fafafa', surfaceColor: '#ffffff', elevatedColor: '#f5f5f5',
  surfaceBorderColor: '#e5e5e5', textColor: '#171717', mutedTextColor: '#737373',
  colorMode: 'light', fontSize: 'large', borderRadius: 'lg', shadowStyle: 'subtle',
};

// The 18 keys the server keeps in theme_config, minus forceColorMode, which
// the page saves as a branding setting.
const BRAND_KEYS = [
  'primaryColor', 'accentColor', 'accentDarkColor', 'backgroundColor', 'surfaceColor', 'elevatedColor',
  'surfaceBorderColor', 'textColor', 'mutedTextColor', 'colorMode', 'fontFamily', 'headingFontFamily',
  'fontSize', 'borderRadius', 'buttonStyle', 'shadowStyle', 'logoUrl',
];

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
      getSettingsByType: vi.fn(async (type: string) => (type === 'theme' ? { theme_config: { ...savedTheme } } : {})),
      updateTheme: (theme: Record<string, unknown>) => updateTheme(theme),
      updateBranding: vi.fn(async () => undefined),
    },
  };
});

vi.mock('../../../services/fonts.service', () => ({
  fontsService: { list: vi.fn(async () => [{ family: 'Inter', generic: 'sans-serif' }]) },
  extractFamilyName: (s: string) => s.split(',')[0].replace(/'/g, '').trim(),
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

import { BrandingPage } from '../BrandingPage';
import { ThemeProvider } from '../../../contexts/ThemeContext';

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <BrandingPage />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

describe('BrandingPage: brand style only', () => {
  beforeEach(() => {
    localStorage.clear();
    updateTheme.mockClear();
  });

  it('offers every brand setting and nothing of the gallery look', async () => {
    const { container } = renderPage();
    await screen.findByText('branding.bodyFont');
    expect(container.querySelectorAll('input[type="color"]')).toHaveLength(8);
    for (const label of ['Light', 'Dark', 'Auto', 'No force (user choice)', 'Force dark', 'Force light']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    for (const label of ['branding.headingFont', 'branding.fontSize', 'branding.borderRadius', 'branding.shadowStyle']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button', { name: 'Upload Logo' }).length).toBeGreaterThan(0);
    // The saved values reach the controls.
    await waitFor(() => expect(screen.getByDisplayValue('branding.fontSizes.large')).toBeInTheDocument());
    for (const gone of ['branding.backgroundPattern', 'branding.livePreview', 'branding.preview', 'branding.eventSpecificThemes']) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
  });

  it('saves brand keys only, with the legacy primary colour following the filled accent', async () => {
    const { container } = renderPage();
    await screen.findByText('branding.bodyFont');
    const accentDark = await waitFor(() => {
      const input = [...container.querySelectorAll<HTMLInputElement>('input[type="color"]')]
        .find((el) => el.value === '#112233');
      expect(input).toBeDefined();
      return input!;
    });
    fireEvent.change(accentDark, { target: { value: '#445566' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateTheme).toHaveBeenCalledTimes(1));
    const sent = updateTheme.mock.calls[0][0];
    expect(sent).toMatchObject({ accentDarkColor: '#445566', primaryColor: '#445566', fontSize: 'large' });
    expect(Object.keys(sent).filter((key) => !BRAND_KEYS.includes(key))).toEqual([]);
  });
});
