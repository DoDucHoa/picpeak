import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

vi.mock('react-i18next', async () => ({ ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')), useTranslation: () => ({ t: (_k: string, fb: string) => fb ?? _k, i18n: { language: 'en' } }) }));
let fbProps: { settings: unknown; onChange: (s: unknown) => void; hideEnableToggle?: boolean } | null = null;
vi.mock('../../../../../components/admin/FeedbackSettings', () => ({
  FeedbackSettings: (p: typeof fbProps) => { fbProps = p; return <p>feedback controls</p>; },
}));

import { EventSettingsContext } from '../EventSettingsContext';
import { GuestInteractionSection } from '../GuestInteractionSection';

const FULL = { feedback_enabled: true, allow_ratings: true, allow_likes: true, allow_comments: true, allow_favorites: true, allow_reactions: true };

function renderSection(overrides: {
  expert?: boolean; setEditForm?: ReturnType<typeof vi.fn>; setFeedbackSettings?: ReturnType<typeof vi.fn>;
  feedbackSettings?: object; savedFeedbackSettings?: object;
} = {}) {
  const feedbackSettings = overrides.feedbackSettings ?? { ...FULL, feedback_enabled: false };
  return render(
    <EventSettingsContext.Provider value={{
      event: { id: 1 } as never, editForm: { show_credits_to_guests: false } as never, setEditForm: overrides.setEditForm ?? vi.fn(),
      feedbackSettings: feedbackSettings as never, setFeedbackSettings: overrides.setFeedbackSettings ?? vi.fn(),
      savedFeedbackSettings: (overrides.savedFeedbackSettings ?? feedbackSettings) as never,
      theme: { config: {} as never, preset: 'default' }, setTheme: vi.fn(), draft: { state: {} } as never,
      readOnly: false, lockReason: null, expert: overrides.expert ?? false, setExpert: vi.fn(), refetchEvent: vi.fn(),
      heroPhotos: [], cssTemplates: [], phoneFieldEnabled: false,
    } as never}><GuestInteractionSection /></EventSettingsContext.Provider>,
  );
}

it('offers the modes and writes the mode through the draft, not a request', async () => {
  const setFeedbackSettings = vi.fn();
  renderSection({ setFeedbackSettings });
  expect(screen.getByRole('radio', { name: /^Off/ })).toBeChecked();
  expect(screen.queryByRole('radio', { name: /^Custom/ })).toBeNull();
  await userEvent.click(screen.getByRole('radio', { name: /^Client picks photos/ }));
  expect(setFeedbackSettings).toHaveBeenCalledWith(expect.objectContaining({
    feedback_enabled: true, allow_favorites: true, allow_likes: false, allow_ratings: false,
  }));
});

it('offers Custom for saved toggles that match no mode', () => {
  renderSection({ feedbackSettings: { ...FULL, allow_likes: false } });
  expect(screen.getByRole('radio', { name: /^Custom/ })).toBeChecked();
});

it('keeps the individual toggles in the advanced area, without their own enable switch', async () => {
  renderSection({ feedbackSettings: FULL });
  expect(screen.queryByText('feedback controls')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Show advanced options' }));
  expect(screen.getByText('feedback controls')).toBeInTheDocument();
  expect(fbProps).toMatchObject({ hideEnableToggle: true });
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
