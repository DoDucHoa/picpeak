import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('react-i18next', async () => ({ ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')), useTranslation: () => ({ t: (_k: string, fb: string) => fb ?? _k, i18n: { language: 'en' } }) }));
let fbProps: { settings: unknown; onChange: (s: unknown) => void } | null = null;
vi.mock('../../../../../components/admin/FeedbackSettings', () => ({
  FeedbackSettings: (p: typeof fbProps) => { fbProps = p; return <p>feedback controls</p>; },
}));

import { EventSettingsContext } from '../EventSettingsContext';
import { GuestInteractionSection } from '../GuestInteractionSection';

it('edits the feedback settings through the draft, not a request', () => {
  const setFeedbackSettings = vi.fn();
  render(
    <EventSettingsContext.Provider value={{
      event: { id: 1 } as never, editForm: { allow_user_uploads: false } as never, setEditForm: vi.fn(),
      feedbackSettings: { feedback_enabled: false } as never, setFeedbackSettings,
      theme: { config: {} as never, preset: 'default' }, setTheme: vi.fn(), draft: { state: {} } as never,
      readOnly: false, lockReason: null, expert: false, setExpert: vi.fn(), refetchEvent: vi.fn(), categories: [],
      heroPhotos: [], cssTemplates: [], phoneFieldEnabled: false,
    }}><GuestInteractionSection /></EventSettingsContext.Provider>,
  );
  expect(screen.getByText('feedback controls')).toBeInTheDocument();
  fbProps?.onChange({ feedback_enabled: true });
  expect(setFeedbackSettings).toHaveBeenCalledWith({ feedback_enabled: true });
  expect(screen.queryByText(/allowUserUploads|Allow guest uploads/)).toBeNull();
});
