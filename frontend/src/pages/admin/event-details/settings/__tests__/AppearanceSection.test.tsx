import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GALLERY_THEME_PRESETS } from '../../../../../types/theme.types';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import fs from 'fs';
import path from 'path';

vi.mock('react-i18next', async () => ({ ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')), useTranslation: () => ({ t: (_k: string, fb: string) => fb ?? _k, i18n: { language: 'en' } }) }));
let themeProps: { onChange: (t: unknown) => void; onPresetChange?: (p: string) => void; hidePresets?: boolean } | null = null;
vi.mock('../../../../../components/admin/ThemeCustomizerEnhanced', () => ({
  ThemeCustomizerEnhanced: (p: typeof themeProps) => { themeProps = p; return <p>customizer</p>; },
}));
vi.mock('../../../../../components/admin/HeroPhotoSelector', () => ({ HeroPhotoSelector: () => <p>hero picker</p> }));

import { EventSettingsContext } from '../EventSettingsContext';
import { AppearanceSection } from '../AppearanceSection';

const setTheme = vi.fn();
const mount = (over: { expert?: boolean; setTheme?: ReturnType<typeof vi.fn> } = {}) => render(
  <QueryClientProvider client={new QueryClient()}><EventSettingsContext.Provider value={{
    event: { id: 1 } as never, editForm: { promo_mode: 'inherit', info_mode: 'inherit' } as never, setEditForm: vi.fn(),
    feedbackSettings: {} as never, setFeedbackSettings: vi.fn(),
    theme: { config: { primaryColor: '#111' } as never, preset: 'default' }, setTheme: over.setTheme ?? setTheme,
    draft: { state: {} } as never, readOnly: false, lockReason: null, expert: over.expert ?? true, setExpert: vi.fn(),
    refetchEvent: vi.fn(), categories: [], heroPhotos: [], cssTemplates: [], phoneFieldEnabled: false,
  }}><AppearanceSection /></EventSettingsContext.Provider></QueryClientProvider>,
);

it('shows the hero picker and the theme customizer', () => {
  mount();
  expect(screen.getByText('hero picker')).toBeInTheDocument();
  expect(screen.getByText('customizer')).toBeInTheDocument();
});

it('sends theme and preset changes through the draft updater', () => {
  mount();
  themeProps?.onChange({ primaryColor: '#222' });
  themeProps?.onPresetChange?.('custom');
  expect(setTheme).toHaveBeenCalledTimes(2);
  const [first, second] = setTheme.mock.calls.map(([fn]) => fn);
  const start = { config: { primaryColor: '#111' }, preset: 'default' };
  expect(second(first(start))).toEqual({ config: { primaryColor: '#222' }, preset: 'custom' });
});

it('refreshes the page query after a logo upload or removal', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../AppearanceSection.tsx'), 'utf8');
  expect(src).not.toMatch(/queryKey: \['event', /);
  expect(src).toMatch(/queryKey: \['admin-event', /);
});

it('shows the preset picker and the hero photo without advanced options, and the full customizer only inside them', async () => {
  const pick = vi.fn();
  mount({ expert: false, setTheme: pick });
  expect(screen.getByText('hero picker')).toBeInTheDocument();
  expect(screen.queryByText('customizer')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: new RegExp(GALLERY_THEME_PRESETS.birthdayFun.name) }));
  expect(pick.mock.calls[0][0]({})).toEqual({ config: GALLERY_THEME_PRESETS.birthdayFun.config, preset: 'birthdayFun' });
  await userEvent.click(screen.getByRole('button', { name: 'Show advanced options' }));
  expect(screen.getByText('customizer')).toBeInTheDocument();
  expect(themeProps).toMatchObject({ hidePresets: true });
});
