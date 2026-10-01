import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import fs from 'fs';
import path from 'path';

vi.mock('react-i18next', async () => ({ ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')), useTranslation: () => ({ t: (_k: string, fb: string) => fb ?? _k, i18n: { language: 'en' } }) }));
vi.mock('../../../../../components/admin/HeroPhotoSelector', () => ({ HeroPhotoSelector: () => <p>hero picker</p> }));

import { EventSettingsContext } from '../EventSettingsContext';
import { AppearanceSection } from '../AppearanceSection';

const mount = (over: { expert?: boolean } = {}) => render(
  <QueryClientProvider client={new QueryClient()}><EventSettingsContext.Provider value={{
    event: { id: 1 } as never, editForm: { promo_mode: 'inherit', info_mode: 'inherit' } as never, setEditForm: vi.fn(),
    feedbackSettings: {} as never, setFeedbackSettings: vi.fn(), savedFeedbackSettings: {} as never,
    draft: { state: {} } as never, readOnly: false, lockReason: null, expert: over.expert ?? true, setExpert: vi.fn(),
    refetchEvent: vi.fn(), categories: [], heroPhotos: [], phoneFieldEnabled: false,
  }}><AppearanceSection /></EventSettingsContext.Provider></QueryClientProvider>,
);

it('shows the hero picker and no theme controls: the gallery look is fixed', () => {
  mount();
  expect(screen.getByText('hero picker')).toBeInTheDocument();
  expect(screen.queryByText(/theme|preset|custom css/i)).toBeNull();
});

it('refreshes the page query after a logo upload or removal', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../AppearanceSection.tsx'), 'utf8');
  expect(src).not.toMatch(/queryKey: \['event', /);
  expect(src).toMatch(/queryKey: \['admin-event', /);
});

it('shows the hero photo without advanced options, and the hero logo and banners only inside them', async () => {
  mount({ expert: false });
  expect(screen.getByText('hero picker')).toBeInTheDocument();
  expect(screen.queryByText('Hero Logo Settings')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Show advanced options' }));
  expect(screen.getByText('Hero Logo Settings')).toBeInTheDocument();
  expect(screen.getByText('Promotional Banner')).toBeInTheDocument();
});
