import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

vi.mock('react-i18next', async () => ({ ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')), useTranslation: () => ({ t: (_k: string, fb: string) => fb ?? _k, i18n: { language: 'en' } }) }));
let fbProps: { settings: unknown; onChange: (s: unknown) => void } | null = null;
vi.mock('../../../../../components/admin/FeedbackSettings', () => ({
  FeedbackSettings: (p: typeof fbProps) => { fbProps = p; return <p>feedback controls</p>; },
}));

import { EventSettingsContext } from '../EventSettingsContext';
import { GuestInteractionSection } from '../GuestInteractionSection';

function renderSection(overrides: { expert?: boolean; setEditForm?: ReturnType<typeof vi.fn>; setFeedbackSettings?: ReturnType<typeof vi.fn> } = {}) {
  return render(
    <EventSettingsContext.Provider value={{
      event: { id: 1 } as never, editForm: { show_credits_to_guests: false } as never, setEditForm: overrides.setEditForm ?? vi.fn(),
      feedbackSettings: { feedback_enabled: false } as never, setFeedbackSettings: overrides.setFeedbackSettings ?? vi.fn(),
      theme: { config: {} as never, preset: 'default' }, setTheme: vi.fn(), draft: { state: {} } as never,
      readOnly: false, lockReason: null, expert: overrides.expert ?? false, setExpert: vi.fn(), refetchEvent: vi.fn(),
      heroPhotos: [], cssTemplates: [], phoneFieldEnabled: false,
    } as never}><GuestInteractionSection /></EventSettingsContext.Provider>,
  );
}

it('edits the feedback settings through the draft, not a request', () => {
  const setFeedbackSettings = vi.fn();
  renderSection({ setFeedbackSettings });
  expect(screen.getByText('feedback controls')).toBeInTheDocument();
  fbProps?.onChange({ feedback_enabled: true });
  expect(setFeedbackSettings).toHaveBeenCalledWith({ feedback_enabled: true });
});

it('offers no guest upload, uploader name or reveal control, even in expert mode', () => {
  renderSection({ expert: true });
  expect(screen.queryByText(/allow guest uploads|allowUserUploads/i)).toBeNull();
  expect(screen.queryByText(/uploaderNames|uploader names/i)).toBeNull();
  expect(screen.queryByText(/reveal mode/i)).toBeNull();
});

it('keeps the photo credit switch and writes show_credits_to_guests', async () => {
  const setEditForm = vi.fn();
  renderSection({ expert: true, setEditForm });
  await userEvent.click(screen.getByLabelText(/show photo credits to guests/i));
  const update = setEditForm.mock.calls[0][0];
  expect(update({ show_credits_to_guests: false })).toMatchObject({ show_credits_to_guests: true });
});
